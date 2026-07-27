import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type J = Record<string, unknown>;
type Msg = { direction?: string; body_text?: string; transcript?: string; intent?: string; created_at?: string };
type Media = { asset_key?: string; send_status?: string; created_at?: string };

const IK = Deno.env.get("SANAD_INTERNAL_API_KEY")!;
const ENGINE_VERSION = "sanad-conversation-engine-v3-contextual";
const INSTALL_URL = "https://app.sanadflow.com/install/";

function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } }); }
function clean(v: unknown) { return String(v ?? "").replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim(); }
function norm(v: unknown) { return clean(v).toLowerCase().replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي").replace(/[ًٌٍَُِّْـ]/g,"").replace(/\s+/g," ").trim(); }
function uuid(text: string) { return text.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0] || null; }
function url(text: string) { return text.match(/https?:\/\/\S+/i)?.[0] || null; }
function family(intent: string) {
  if (["knowledge_inquiry","subscription_question","external_link_context"].includes(intent)) return "knowledge";
  if (intent === "identity") return "memory";
  if (["human_support","check_operation","get_original_notice"].includes(intent)) return "support";
  if (["install_app","submit_payment_notice","create_business","download_sticker","add_employee"].includes(intent)) return "action";
  return intent;
}
function recentUserText(ctx: any) {
  const rows = Array.isArray(ctx?.recent_messages) ? ctx.recent_messages as Msg[] : [];
  return rows.filter(x => x.direction === "inbound").slice(-3).map(x => clean(x.body_text || x.transcript)).filter(Boolean).join(" | ");
}
function mediaSentRecently(ctx: any, key: string, hours = 24) {
  const rows = Array.isArray(ctx?.recent_media) ? ctx.recent_media as Media[] : [];
  const cutoff = Date.now() - hours * 3600_000;
  return rows.some(x => x.asset_key === key && x.send_status !== "failed" && Date.parse(String(x.created_at || 0)) >= cutoff);
}
function explicitMediaRequest(text: string) { return /(صوره|الصوره|ارسلها|ارسله|ملف|pdf|طباع|qr|كيو ار|ملصق|بطاقه)/.test(norm(text)); }
function applyMediaPolicy(keys: string[], text: string, ctx: any) {
  if (explicitMediaRequest(text)) return keys;
  return keys.filter(k => !mediaSentRecently(ctx, k, k === "how-sanad-works" ? 72 : 24));
}
function requestedPrintKeys(text: string) {
  const n = norm(text); const qr=/(qr|كيو ار)/.test(n), phone=/(رقم|جوال|هاتف|783)/.test(n), counter=/(بطاقه الكاشير|كاشير|نسخه واحده|تنسيق واحد)/.test(n);
  if (qr && !phone && !counter) return ["sanad-qr-sticker-a4"];
  if (phone && !qr && !counter) return ["sanad-phone-sticker-a4"];
  if (counter && !qr && !phone) return ["sanad-counter-card"];
  return ["sanad-qr-sticker-a4","sanad-phone-sticker-a4","sanad-counter-card"];
}
function classify(text: string, ctx: any) {
  const n = norm(text), flow = clean(ctx?.active_flow || "");
  if (flow === "new_user_menu" && /^[123]$/.test(n)) return n === "1" ? "submit_payment_notice" : n === "2" ? "install_app" : "create_business";
  if (flow === "submit_payment_notice" && /^(تم|نعم|حسنا|طيب|كيف|ماذا بعد)/.test(n)) return "submit_payment_notice";
  if (/^(مرحبا|اهلا|السلام عليكم|هلا|صباح الخير|مساء الخير)( يا)?( سند)?[.!، ]*$/.test(n)) return "greeting";
  if (/(هل تعرف من انا|من انا|ماذا تعرف عني)/.test(n)) return "identity";
  if (/(اريدك ان تراجع|راجع|مراجعه|تابع|متابعه|حاله|تحقق).*(عمليه|اشعار)|[0-9a-f]{8}-[0-9a-f-]{27,}/i.test(text)) return "check_operation";
  if (/(الملف الاصلي|اصل الاشعار|الاشعار الاصلي|تحميل الاشعار|اعطني الملف).*(اشعار|عمليه)?/.test(n)) return "get_original_notice";
  if (/(بطاقه الكاشير|ملف|ملفات|مواد|نسخه|نسخ|صفحه|طباعه|اطبع|ملصق|ستيكر|استيكر|qr|كيو ار).*(طباع|ملصق|qr|كيو ار|كاشير|سند)|(ارسل|اعطني|ابغى|اريد|هات).*(ملف|مواد|ملصق|ستيكر|استيكر|بطاقه).*(طباع|سند|qr|كيو ار|كاشير)/.test(n)) return "download_sticker";
  if (/(اريد|ابغى|كيف|حاب|وين).*(ارسال|ارسل|رفع).*(اشعار)|(ارسال|رفع).*(اشعار)/.test(n)) return "submit_payment_notice";
  if (/(موظف|كاشير|فريق).*(اضف|اضافه|اداره|صلاح)/.test(n)) return "add_employee";
  if (/(انشئ|انشاء|افتح|شغل|تشغيل).*(نشاط|متجر|محل|سند)/.test(n)) return "create_business";
  if (/(مشكله|لا يعمل|خطا|دعم|موظف بشري|شكوى|اشتكي|تصعيد)/.test(n)) return "human_support";
  if (/(ثبت|تثبيت|تنزيل|تحميل|رابط).*(سند|التطبيق)|(سند|التطبيق).*(ثبت|تثبيت|تنزيل|تحميل|رابط)|رابط التثبيت/.test(n)) return "install_app";
  if (/(اشتراك|سند برو|باقه|pro)/.test(n)) return "subscription_question";
  if (/(ما هو سند|ماهو سند|كيف يعمل سند|ماذا يحل|عرفني بسند|مزيد من المعلومات|معلومات حول هذا|خطوات التحقق من الاشعار|انا مستخدم في سند|هل سند يؤكد|وصل الى البنك|وصل للبنك)/.test(n)) return "knowledge_inquiry";
  if (/https?:\/\/(www\.)?(facebook|fb)\./i.test(text)) return "external_link_context";
  const prev = recentUserText(ctx);
  if (/^(كيف|ليش|لماذا|ماذا بعد|وضح|اشرح|نعم|لا|طيب|تمام)$/.test(n) && prev) return clean(ctx?.last_intent || "knowledge_inquiry") || "knowledge_inquiry";
  return "unknown";
}
function plan(input: { text: string; audience?: string; context?: any }) {
  const text=clean(input.text), ctx=input.context||{}, n=norm(text), intent=classify(text,ctx), audience=input.audience||String(ctx?.conversation_metadata?.audience||"guest");
  const entities={operation_reference:uuid(text),external_url:url(text)};
  const base={engine_version:ENGINE_VERSION,intent,intent_family:family(intent),confidence:intent==="unknown"?0.58:0.97,media_keys:[] as string[],tool_names:[] as string[],safety_flags:[] as string[],entities,context_used:{active_flow:ctx?.active_flow||null,journey_stage:ctx?.journey_stage||null,recent_messages:Array.isArray(ctx?.recent_messages)?ctx.recent_messages.length:0,recent_media:Array.isArray(ctx?.recent_media)?ctx.recent_media.length:0}};
  if(intent==="greeting"){
    const keys=applyMediaPolicy(["how-sanad-works"],text,ctx);
    return audience==="guest"?{...base,response:"أهلًا بك في سند 👋\n\nسند ينظم ما يحدث بعد الدفع الإلكتروني، ويحوّل إشعار الدفع إلى عملية يمكن مراجعتها عبر رابط وQR.\n\n1 — إرسال إشعار دفع\n2 — تثبيت تطبيق سند\n3 — تشغيل سند في متجري",media_keys:keys,journey_stage:"discovery",active_flow:"new_user_menu",expected_input_type:"text_choice"}:{...base,response:"أهلًا بك 👋\n\nاكتب ما تريد إنجازه في سند مباشرة، وسأساعدك خطوة بخطوة."};
  }
  if(intent==="identity") return {...base,response:"سأراجع بيانات الحساب المرتبطة بهذا الرقم قبل أن أجيبك.",tool_names:["get_sanad_assistant_user_context"]};
  if(intent==="install_app") return {...base,response:`📱 تثبيت تطبيق سند\n\n${INSTALL_URL}\n\n• Android: افتح الرابط ثم اختر تثبيت التطبيق.\n• iPhone: افتح الرابط في Safari، ثم مشاركة ← إضافة إلى الشاشة الرئيسية.`,media_keys:applyMediaPolicy(["install-sanad"],text,ctx),journey_stage:"activation"};
  if(intent==="submit_payment_notice") return {...base,response:"أرسل إشعار الدفع هنا كصورة أو ملف PDF 📎\n\nسيحفظه سند ويحلله، ثم يرسل رابط التحقق ورمز QR. لا تحتاج إلى تثبيت التطبيق لإرسال الإشعار.",media_keys:applyMediaPolicy(["send-payment-notice"],text,ctx),journey_stage:"payment_notice_submission",active_flow:"submit_payment_notice",expected_input_type:"image_or_pdf"};
  if(intent==="create_business") return {...base,response:"ابدأ تشغيل سند في نشاطك: أنشئ النشاط، أكمل بياناته، أضف الفريق، حمّل الملصقات، ثم نفّذ أول عملية تجريبية.",media_keys:applyMediaPolicy(["start-sanad-in-store"],text,ctx),journey_stage:"business_activation"};
  if(intent==="download_sticker"){const keys=requestedPrintKeys(text),counter=keys.length===1&&keys[0]==="sanad-counter-card";return {...base,response:counter?"سأرسل بطاقة الكاشير بتنسيق واحد جاهز للطباعة.":keys.length===1?"سأرسل ملف الطباعة المعتمد. تحتوي صفحة A4 على 6 نسخ جاهزة للطباعة والقص.":"سأرسل حزمة الطباعة المعتمدة: ملف QR بست نسخ، وملف رقم سند بست نسخ، وبطاقة الكاشير بتنسيق واحد.",media_keys:keys,tool_names:["select_sanad_assistant_media"],journey_stage:"business_activation"};}
  if(intent==="check_operation") return {...base,response:entities.operation_reference?"سأبحث عن العملية بهذا المرجع وأعرض حالتها المتاحة في سند.":"أرسل رابط العملية أو رقم المرجع الموجود في سند لأتحقق من حالتها.",tool_names:["assistant_get_operation_status"]};
  if(intent==="get_original_notice") return {...base,response:"سأتحقق من صلاحيتك للوصول إلى الملف الأصلي للإشعار ثم أرسله بالطريقة الآمنة.",tool_names:["assistant_get_operation_status","assistant_get_original_notice"]};
  if(intent==="knowledge_inquiry"&&/(هل سند يؤكد|وصل الى البنك|وصل للبنك)/.test(n)) return {...base,response:"لا. سند لا يؤكد أن المبلغ وصل بنكيًا؛ بل ينظم الإشعار ويتيح للكاشير مراجعته وتسجيل تحقق تشغيلي.",safety_flags:["no_bank_certainty"]};
  if(intent==="knowledge_inquiry") return {...base,response:"سند ليس أداة دفع؛ بل ينظم ما بعد الدفع الإلكتروني ويحوّل الإشعار إلى عملية رقمية يمكن مراجعتها عبر رابط وQR.",media_keys:applyMediaPolicy(["how-sanad-works"],text,ctx),tool_names:["search_sanad_knowledge"]};
  if(intent==="external_link_context") return {...base,response:"وصلني الرابط. اكتب لي ما الذي تريد معرفته عنه أو الإجراء الذي تريد تنفيذه في سند.",tool_names:["search_sanad_knowledge"]};
  if(intent==="human_support") return {...base,response:"سأسجل طلب دعم لمتابعته مع فريق سند. لا ترسل كلمة مرور أو رمز تحقق داخل المحادثة.",tool_names:["assistant_create_support_ticket"],requires_human:true};
  return {...base,response:"فهمت أن لديك طلبًا متعلقًا بسند، لكن أحتاج هدفًا أوضح قليلًا. اكتب مثلًا: أريد تثبيت سند، أريد متابعة عملية، أو أريد ملف الطباعة."};
}

Deno.serve(async req=>{
  if(req.method!=="POST") return json({ok:false,error:"method_not_allowed"},405);
  if(req.headers.get("x-sanad-internal-key")!==IK) return json({ok:false,error:"unauthorized"},401);
  let body:any; try{body=await req.json();}catch{return json({ok:false,error:"invalid_json"},400);}
  const text=clean(body?.text); if(!text) return json({ok:false,error:"text_required"},400);
  return json({ok:true,plan:plan({text,audience:clean(body?.audience)||"guest",context:body?.context||{active_flow:body?.active_flow||null}})});
});
