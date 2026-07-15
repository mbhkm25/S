# SANAD Push Worker

عامل Node.js مستقل لإرسال إشعارات Web Push في الإنتاج. لا يقرأ جداول Push مباشرة، ولا يحتوي على مفتاح `service_role` في الواجهة. كل دورة عمل تستخدم RPC بالترتيب التالي:

1. `claim_push_outbox_batch`
2. `get_push_delivery_targets`
3. `reserve_push_delivery` قبل أي إرسال لكل جهاز
4. `record_reserved_push_delivery_attempt` باستخدام reservation token بعد كل نتيجة مؤكدة
5. `get_push_outbox_delivery_state` للحصول على الحالة الصريحة
6. `finalize_push_outbox` بعد اكتمال جميع الأجهزة

ويجدد `renew_push_outbox_lock` و`renew_push_delivery_reservation` أثناء العمل دون renewals متداخلة. لا يبدأ إرسال Web Push دون حجز ذري ناجح، وتستبعد قاعدة البيانات الاشتراكات التي سبق نجاحها.

## التشغيل المحلي

يتطلب Node.js 22 أو أحدث. انسخ `.env.example` إلى ملف أسرار خارج Git واملأ القيم، ثم:

```bash
npm ci
npm run lint
npm test
npm run build
npm start
```

التحقق الحي متاح على `http://127.0.0.1:3002/health`، والجاهزية على `/ready`. تصبح الجاهزية ناجحة فقط بعد اتصال Supabase ناجح وأثناء استمرار دورة العامل، وتفشل عند فتح قاطع أخطاء VAPID أو بدء الإيقاف.

## متغيرات البيئة

المتغيرات الإلزامية هي `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` و`WEB_PUSH_VAPID_PUBLIC_KEY` و`WEB_PUSH_VAPID_PRIVATE_KEY` و`WEB_PUSH_SUBJECT` و`PUSH_WORKER_INSTANCE_ID`. القيم التشغيلية الاختيارية موثقة في `.env.example`، ومنها مدة الحجز 90 ثانية، cooldown للنتيجة غير المؤكدة 300 ثانية، مهلة إرسال 20 ثانية، وحد payload مقداره 3072 بايت. يجب أن تكون مهلة الإرسال أقصر من مدة الحجز.

يتحقق العامل أيضاً أن `SUPABASE_URL` يخص المشروع `hudbzlgclghlhazlduas` تحديداً، ويفشل سريعاً لأي مشروع آخر.

يجب حقن الأسرار من مدير أسرار وقت التشغيل. لا تُبنَ داخل الصورة، ولا تُسجل في السجلات. يسجل العامل معرفات outbox والإشعار، وتجزيء SHA-256 مختصراً للـ endpoint، والحالة والمدد فقط؛ ولا يسجل endpoint أو مفاتيح الاشتراك أو الحمولة أو نص الخطأ الخام.

## Docker

```bash
docker build -t sanad-push-worker:local .
docker run --rm --env-file /secure/path/push-worker.env sanad-push-worker:local
```

مثال قيود تشغيل موصى بها في Compose:

```yaml
services:
  sanad_push_worker:
    image: sanad-push-worker:local
    env_file: /secure/path/push-worker.env
    init: true
    read_only: true
    tmpfs:
      - /tmp:size=16m,noexec,nosuid
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    restart: unless-stopped
```

خادم الصحة مربوط بـ loopback داخل الحاوية عمداً، ويستخدمه `HEALTHCHECK` من داخل الحاوية. يعالج `SIGTERM` و`SIGINT` بإيقاف الاستلام وانتظار الدفعة الجارية حتى 30 ثانية.

## سياسة الفشل

- `404/410`: اشتراك منتهٍ؛ يسجل `gone` ويعطل الاشتراك ذرياً عبر RPC.
- `400` أو فشل تشفير دائم: يسجل `failed` ويعطل الاشتراك دون إعادة عمياء.
- `408/429/5xx` وأخطاء الشبكة المؤقتة: `retry` بتراجع متزايد مع jitter، ثم `dead` عند الحد الأعلى.
- `401/403`: خطأ VAPID/إعداد؛ يسجل المحاولة، يجدول إعادة بعد 15 دقيقة، ويفتح circuit breaker لإيقاف polling حتى تصحيح الإعداد وإعادة تشغيل الخدمة.

## الحجز والنتائج غير المؤكدة

يمنع reservation عاملين من بدء الإرسال المتزامن لنفس `notification_id + subscription_id`. مع ذلك، Web Push خدمة خارجية ولا يمكنها تقديم exactly-once مطلقاً عند انقطاع الاتصال بعد وصول الطلب للمزود. عند timeout أو فقد lease/reservation بعد بدء الطلب، لا يسجل العامل نجاحاً أو فشلاً تخمينياً ولا يحرر الحجز؛ بل يستدعي `mark_push_delivery_uncertain` ويفرض cooldown قبل إعادة المحاولة. ويقلل `tag` في Service Worker ظهور نسخة ثانية إذا حدثت نافذة فشل موزعة نادرة.

لا تُحرر reservation بعد بدء send إذا أصبحت النتيجة مجهولة. التحرير محصور بالحالات المؤكدة التي لم يبدأ فيها الطلب، مثل shutdown أو circuit breaker أو فقد Outbox lease قبل send.

مكتبة `web-push` لا توفر إلغاءً موثوقًا للطلب الجاري عبر `AbortSignal`، لذلك تنفذ المهلة باستخدام `Promise.race`. انتهاء المهلة لا يعني إلغاء الطلب الخارجي؛ ولهذا تصنف النتيجة `uncertain` بدلاً من transient عادي.

إذا تعطلت العملية بعد تسجيل نجاح جهاز وقبل `finalize`، فإن RPC الأهداف لا يعيد ذلك الجهاز. لا يستنتج العامل النجاح من `attempt_count` أو من قائمة أهداف فارغة؛ بل يستدعي `get_push_outbox_delivery_state` ويغلق العنصر فقط وفق العدادات الصريحة في قاعدة البيانات.
