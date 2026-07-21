import { useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, BarChart3, Building2, Check, ChevronDown, FileCheck2, Headphones, LockKeyhole, MessageCircle, QrCode, ScanLine, ShieldCheck, Sparkles, Store, Users } from 'lucide-react';
import LightRays from './LightRays';

const APP_URL = import.meta.env.VITE_APP_URL || 'https://app.sanadflow.com';
const API_URL = import.meta.env.VITE_SUPABASE_URL || 'https://api.sanadflow.com';
const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const fallback = { support:{ support_whatsapp:'967777634971',support_email:'support@sanadflow.com' }, pro_plan:{ name:'سند Pro',price:3500,currency:'YER',duration_days:30,access_limit:1000,features:['تحقق موسع من العمليات','سجل وإدارة الاشتراك','شهادات تحقق رقمية'] } };

function useLandingData(){ const [data,setData]=useState<any>(fallback); useEffect(()=>{ if(!API_KEY)return; fetch(`${API_URL}/rest/v1/rpc/get_public_landing_information`,{method:'POST',headers:{apikey:API_KEY,'Content-Type':'application/json'},body:'{}'}).then(r=>r.ok?r.json():null).then(v=>v&&setData(v)).catch(()=>{}); },[]); return data; }
const money=(value:number)=>new Intl.NumberFormat('en-US').format(value);

export default function App(){
 const data=useLandingData(); const plan=data.pro_plan||fallback.pro_plan; const support=data.support||fallback.support;
 const whatsapp=String(support.support_whatsapp||'').replace(/\D/g,'');
 return <div className="site">
  <header className="nav"><a className="brand" href="#top"><img src="/install-assets/sanad_logo.webp" alt="سند"/><span>سند</span></a><nav><a href="#financial">سند المالي</a><a href="#business">سند التجاري</a><a href="#pro">سند برو</a><a href="#security">الأمان</a></nav><a className="nav-cta" href={APP_URL}>افتح التطبيق <ArrowLeft/></a></header>
  <main>
   <section id="top" className="hero"><LightRays/><div className="hero-glow"/><div className="hero-copy"><span className="eyebrow"><Sparkles/> منصة مالية وتجارية متكاملة</span><h1>تحقّق بوضوح.<br/><em>وشارك بثقة.</em></h1><p>سند يجمع التحقق الذكي من الإشعارات المالية ومجتمع الأعمال في تجربة عربية واحدة، آمنة وسهلة.</p><div className="actions"><a className="primary" href={APP_URL}>ابدأ استخدام سند <ArrowLeft/></a><a className="secondary" href="#business">اكتشف سند التجاري</a></div><div className="trust"><span><ShieldCheck/>خصوصية مصممة من البداية</span><span><BadgeCheck/>بيانات واضحة وقابلة للمراجعة</span></div></div>
    <div className="phone" aria-label="معاينة تطبيق سند"><div className="phone-top"><span>سند المالي</span><ShieldCheck/></div><div className="welcome">مرحبًا بك في سند<h3>تحقق وشارك بثقة</h3></div><div className="scan"><QrCode/><div><b>امسح رمز QR</b><small>وافـتح تفاصيل العملية مباشرة</small></div></div><div className="mini"><FileCheck2/><div><small>آخر نشاط</small><b>تم تحليل العملية بنجاح</b></div><span>موثوق</span></div></div>
   </section>

   <section className="intro"><span>منظومة سند</span><h2>منتجان، برؤية واحدة للثقة</h2><p>أدوات مالية ذكية للأفراد، وحضور رقمي متكامل للأعمال.</p></section>
   <section className="split" id="financial"><article className="product dark"><div className="icon"><ScanLine/></div><span>سند المالي</span><h2>افهم العملية قبل أن تعتمدها</h2><p>امسح QR أو افتح رابط التحقق، ثم راجع بيانات العملية ومؤشرات الثقة والمخاطر واحفظ ملاحظاتك الخاصة.</p><ul><li><Check/>تحليل منظم لبيانات الإشعار</li><li><Check/>ملاحظات نصية وصوتية خاصة</li><li><Check/>سجل واضح لعملياتك</li></ul><a href={APP_URL}>ابدأ التحقق <ArrowLeft/></a></article>
    <article className="product business" id="business"><div className="icon"><Building2/></div><span>سند التجاري</span><h2>اجعل نشاطك أقرب إلى عملائه</h2><p>أنشئ ملفًا تجاريًا احترافيًا، اعرض منتجاتك وخدماتك، وأدر فريقك وعملاءك وعملياتك من مكان واحد.</p><div className="business-grid"><b><Store/>كتالوجات عامة</b><b><Users/>عملاء وفريق</b><b><BarChart3/>تقارير وإحصاءات</b><b><MessageCircle/>تواصل مباشر</b></div><a href={`${APP_URL}/businesses`}>اكتشف الأعمال <ArrowLeft/></a></article>
   </section>

   <section className="steps"><div className="section-title"><span>كيف يعمل؟</span><h2>ثلاث خطوات من الإشعار إلى الوضوح</h2></div><div className="step-grid"><article><i>01</i><QrCode/><h3>امسح أو افتح</h3><p>استخدم QR أو رابط العملية داخل سند.</p></article><article><i>02</i><ScanLine/><h3>راجع التحليل</h3><p>اطلع على البيانات والمؤشرات المستخرجة.</p></article><article><i>03</i><FileCheck2/><h3>تحقق واحتفظ</h3><p>سجّل تحققك وأضف ملاحظتك الخاصة.</p></article></div></section>

   <section id="pro" className="pro"><div><span className="eyebrow"><Sparkles/> {plan.name}</span><h2>مساحة أكبر للتحقق المستمر</h2><p>{plan.description||'باقة عملية للأفراد وأصحاب الأعمال الذين يحتاجون إلى استخدام موسع.'}</p><ul>{(plan.features||[]).map((x:string)=><li key={x}><Check/>{x}</li>)}</ul></div><div className="price"><small>الباقة الحالية</small><strong>{money(plan.price)} <i>{plan.currency}</i></strong><span>{plan.duration_days} يومًا · {money(plan.access_limit)} عملية</span><a href={`${APP_URL}/profile/subscription`}>اشترك في سند برو <ArrowLeft/></a><small>لا تُرحّل العمليات غير المستخدمة بعد انتهاء المدة.</small></div></section>

   <section id="security" className="security"><div className="section-title"><span>الثقة والخصوصية</span><h2>بياناتك لك، منذ اللحظة الأولى</h2></div><div className="security-grid"><article><LockKeyhole/><h3>وصول محكوم</h3><p>الملفات والملاحظات الحساسة تخضع لصلاحيات واضحة.</p></article><article><ShieldCheck/><h3>تخزين خاص</h3><p>لا تُعرض ملفات الدفع والملاحظات كروابط عامة.</p></article><article><FileCheck2/><h3>قرار أوضح</h3><p>سند أداة مساعدة للمراجعة ولا يستبدل تأكيد الجهة المالية.</p></article></div></section>

   <section className="faq"><div className="section-title"><span>أسئلة شائعة</span><h2>إجابات سريعة قبل أن تبدأ</h2></div>{[['هل التحقق يعني ضمان العملية ماليًا؟','لا. سند ينظم البيانات ويعرض مؤشرات مساعدة، وعند النزاع يجب الرجوع إلى الجهة المالية.'],['هل العمليات المجانية تتجدد؟','الرصيد المجاني تأسيسي لمرة واحدة طوال عمر الحساب.'],['ماذا يحدث للرصيد بعد انتهاء سند برو؟','تنتهي العمليات غير المستخدمة بانتهاء مدة الباقة ولا تنتقل للفترة التالية.']].map(([q,a])=><details key={q}><summary>{q}<ChevronDown/></summary><p>{a}</p></details>)}</section>
   <section className="final"><div><span>جاهز لتجربة أوضح؟</span><h2>ابدأ مع سند اليوم</h2><p>تحقق من العمليات، نظّم سجلك، واكتشف مجتمع الأعمال من حولك.</p></div><a href={APP_URL}>افتح تطبيق سند <ArrowLeft/></a></section>
  </main>
  <footer><div className="footer-brand"><img src="/install-assets/sanad_logo.webp" alt="سند"/><p>تحقق مالي موثوق ومجتمع أعمال في مكان واحد.</p></div><div><b>سند</b><a href="#financial">سند المالي</a><a href="#business">سند التجاري</a><a href="#pro">سند برو</a></div><div><b>الدعم</b>{whatsapp&&<a href={`https://wa.me/${whatsapp}`}>واتساب</a>}<a href={`mailto:${support.support_email||'support@sanadflow.com'}`}>البريد الإلكتروني</a><a href={APP_URL}>التطبيق</a></div><small>© 2026 سند. جميع الحقوق محفوظة.</small></footer>
 </div>
}
