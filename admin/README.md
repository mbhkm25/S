# SANAD Admin

تطبيق إدارة سند المستقل داخل المستودع نفسه.

## التشغيل المحلي

```bash
npm ci
npm run dev:admin
```

يفتح افتراضيًا على `http://localhost:3001`.

## البناء

```bash
npm run build:admin
```

يُنشأ الناتج في `dist-admin/` ولا يختلط مع ناتج تطبيق المستخدم الموجود في `dist/`.

## متغيرات البيئة

يقرأ التطبيق متغيرات `VITE_` من جذر المستودع عبر `admin/vite.config.ts`، وأهمها:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` أو المفتاح العام المستخدم في المشروع
- `VITE_PLATFORM_ADMIN_URL=https://admin.sanadflow.com`
- `VITE_PUBLIC_APP_URL=https://app.sanadflow.com`

## الأمان

تسجيل الدخول وحده لا يمنح الوصول. بعد إنشاء الجلسة يتحقق التطبيق من صلاحية مدير المنصة عبر طبقة الإدارة الحالية قبل تحميل مساحة العمل.

لا تضع `service_role` أو أي سر خادمي داخل متغيرات Vite أو ملفات هذا التطبيق.
