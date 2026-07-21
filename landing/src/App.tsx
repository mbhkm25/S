import { useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, BarChart3, Building2, Check, ChevronDown, FileCheck2, Headphones, LockKeyhole, MessageCircle, QrCode, ScanLine, ShieldCheck, Sparkles, Store, Users } from 'lucide-react';
import LightRays from './LightRays';
import { CountUp, GradientText, RevealCard, RotatingText, ShinyText } from './Effects';

const APP_URL = import.meta.env.VITE_APP_URL || 'https://app.sanadflow.com';
const INSTALL_URL = `${APP_URL.replace(/\/$/, '')}/install/`;
const API_URL = import.meta.env.VITE_SUPABASE_URL || 'https://api.sanadflow.com';
const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const fallbackSupport = { support_whatsapp:'967777634971',support_email:'support@sanadflow.com' };

function isCurrentPlan(plan:any){ return plan && typeof plan.name==='string' && Number.isFinite(Number(plan.price)) && Number.isFinite(Number(plan.duration_days)) && Number.isFinite(Number(plan.access_limit)); }
function useLandingData(){
 const [data,setData]=useState<any>({support:fallbackSupport,pro_plan:null});
 const [planState,setPlanState]=useState<'loading'|'ready'|'error'>('loading');
 useEffect(()=>{
  if(!API_KEY){ setPlanState('error'); return; }
  const controller=new AbortController();
  fetch(`${API_URL}/rest/v1/rpc/get_public_landing_information`,{method:'POST',headers:{apikey:API_KEY,'Content-Type':'application/json'},body:'{}',signal:controller.signal})
   .then(async response=>{ if(!response.ok)throw new Error(`Landing information request failed: ${response.status}`); return response.json(); })
   .then(value=>{ if(!isCurrentPlan(value?.pro_plan))throw new Error('Landing information returned no active plan'); setData({support:value.support||fallbackSupport,pro_plan:value.pro_plan}); setPlanState('ready'); })
   .catch(error=>{ if(error?.name!=='AbortError'){ console.error('[SANAD landing] Failed to load current plan',error); setPlanState('error'); } });
  return()=>controller.abort();
 },[]);
 return {data,planState};
}
export default function App(){
 const {data,planState}=useLandingData(); const plan=data.pro_plan; const support=data.support||fallbackSupport;
 const whatsapp=String(support.support_whatsapp||'').replace(/\D/g,'');
 return <div className="site">
  <header className="nav"><a className="brand" href="/" aria-label="سند فلو - الرئيسية"><img src="/sanad_logo.png" width="104" height="50" alt="سند فلو"/></a><nav aria-label="الصفحات العامة"><a href="/financial-verification/">سند المالي</a><a href="/business/">سند التجاري</a><a href="/sanad-pro/">سند برو</a><a href="/security/">الأمان</a></nav><a className="nav-cta" href={INSTALL_URL}>ثبّت التطبيق <ArrowLeft/></a></header>
  <main>
   <section id="top" className="hero"><LightRays/><div className="hero-glow"/><div className="hero-copy"><h1><span className="hero-prefix">تحقق من الإشعارات المالية</span><br/><RotatingText texts={['وشارك بثقة.','وأدر أعمالك.','واكتشف بثقة.']}/></h1><p>سند فلو منصة عربية تجمع التحقق المنظم من الإشعارات والمعاملات المالية ومجتمع الأعمال والكتالوجات التجارية في تجربة واحدة، آمنة وسهلة.</p><div className="actions"><a className="primary" href={INSTALL_URL}>ثبّت تطبيق سند <ArrowLeft/></a><a className="secondary" href={APP_URL}>افتحه في المتصفح</a></div><div className="trust"><span><ShieldCheck/>خصوصية مصممة من البداية</span><span><BadgeCheck/>بيانات واضحة وقابلة للمراجعة</span></div></div>
    <div className="phone" aria-label="معاينة تطبيق سند"><div className="phone-top"><span>سند المالي</span><ShieldCheck/></div><div className="welcome">مرحبًا بك في سند<h3>تحقق وشارك بثقة</h3></div><div className="scan"><QrCode/><div><b>امسح رمز QR</b><small>وافـتح تفاصيل العملية مباشرة</small></div></div><div className="mini"><FileCheck2/><div><small>آخر نشاط</small><b>تم تحليل العملية بنجاح</b></div><span>موثوق</span></div></div>
   </section>

   <section className="intro"><span>منظومة سند</span><h2><GradientText>منتجان، برؤية واحدة للثقة</GradientText></h2><p>أدوات مالية ذكية للأفراد، وحضور رقمي متكامل للأعمال.</p></section>
   <section className="split" id="financial"><RevealCard className="reveal-cell"><article className="product dark"><div className="icon"><ScanLine/></div><span>سند المالي</span><h2>افهم العملية قبل أن تعتمدها</h2><p>امسح QR أو افتح رابط التحقق، ثم راجع بيانات العملية ومؤشرات الثقة والمخاطر واحفظ ملاحظاتك الخاصة.</p><ul><li><Check/>تحليل منظم لبيانات الإشعار</li><li><Check/>ملاحظات نصية وصوتية خاصة</li><li><Check/>سجل واضح لعملياتك</li></ul><a href="/financial-verification/">اعرف المزيد <ArrowLeft/></a></article></RevealCard>
    <RevealCard className="reveal-cell"><article className="product business" id="business"><div className="icon"><Building2/></div><span>سند التجاري</span><h2>اجعل نشاطك أقرب إلى عملائه</h2><p>أنشئ ملفًا تجاريًا احترافيًا، اعرض منتجاتك وخدماتك، وأدر فريقك وعملاءك وعملياتك من مكان واحد.</p><div className="business-grid"><b><Store/>كتالوجات عامة</b><b><Users/>عملاء وفريق</b><b><BarChart3/>تقارير وإحصاءات</b><b><MessageCircle/>تواصل مباشر</b></div><a href="/business/">اكتشف سند التجاري <ArrowLeft/></a></article></RevealCard>
   </section>

   <section className="steps"><div className="section-title"><span>كيف يعمل؟</span><h2>ثلاث خطوات من الإشعار إلى الوضوح</h2></div><div className="step-grid"><article><i>01</i><QrCode/><h3>امسح أو افتح</h3><p>استخدم QR أو رابط العملية داخل سند.</p></article><article><i>02</i><ScanLine/><h3>راجع التحليل</h3><p>اطلع على البيانات والمؤشرات المستخرجة.</p></article><article><i>03</i><FileCheck2/><h3>تحقق واحتفظ</h3><p>سجّل تحققك وأضف ملاحظتك الخاصة.</p></article></div></section>

   <RevealCard><section id="pro" className="pro"><div><span className="eyebrow"><Sparkles/> <ShinyText text={plan?.name||'سند Pro'}/></span><h2>مساحة أكبر للتحقق المستمر</h2><p>{plan?.description||'باقة عملية للأفراد وأصحاب الأعمال الذين يحتاجون إلى استخدام موسع.'}</p><ul>{(plan?.features||[]).map((x:string)=><li key={x}><Check/>{x}</li>)}</ul></div><div className="price"><small>الباقة الحالية</small>{planState==='ready'&&plan?<><strong><CountUp to={Number(plan.price)}/> <i>{plan.currency}</i></strong><span><CountUp to={Number(plan.duration_days)}/> يومًا · <CountUp to={Number(plan.access_limit)}/> عملية</span></>:<><strong className="plan-status">{planState==='loading'?'جاري تحديث بيانات الباقة…':'بيانات الباقة متاحة داخل التطبيق'}</strong><span>لن نعرض سعرًا أو حد استخدام قديمًا.</span></>}<a href={`${APP_URL}/profile/subscription`}>اشترك في سند برو <ArrowLeft/></a><a className="text-link" href="/sanad-pro/">تفاصيل الباقة</a><small>تُطبّق المدة والحدود المعروضة عند الاشتراك.</small></div></section></RevealCard>

   <section id="security" className="security"><div className="section-title"><span>الثقة والخصوصية</span><h2>بياناتك لك، منذ اللحظة الأولى</h2></div><div className="security-grid"><article><LockKeyhole/><h3>وصول محكوم</h3><p>الملفات والملاحظات الحساسة تخضع لصلاحيات واضحة.</p></article><article><ShieldCheck/><h3>تخزين خاص</h3><p>لا تُعرض ملفات الدفع والملاحظات كروابط عامة.</p></article><article><FileCheck2/><h3>قرار أوضح</h3><p>سند أداة مساعدة للمراجعة ولا يستبدل تأكيد الجهة المالية.</p></article></div></section>

   <section className="faq"><div className="section-title"><span>أسئلة شائعة</span><h2>إجابات سريعة قبل أن تبدأ</h2></div>{[['هل التحقق يعني ضمان العملية ماليًا؟','لا. سند ينظم البيانات ويعرض مؤشرات مساعدة، وعند النزاع يجب الرجوع إلى الجهة المالية.'],['هل العمليات المجانية تتجدد؟','الرصيد المجاني تأسيسي لمرة واحدة طوال عمر الحساب.'],['ماذا يحدث للرصيد بعد انتهاء سند برو؟','تنتهي العمليات غير المستخدمة بانتهاء مدة الباقة ولا تنتقل للفترة التالية.']].map(([q,a])=><details key={q}><summary>{q}<ChevronDown/></summary><p>{a}</p></details>)}</section>
   <section className="final"><div><span>جاهز لتجربة أوضح؟</span><h2>ابدأ مع سند اليوم</h2><p>تحقق من العمليات، نظّم سجلك، واكتشف مجتمع الأعمال من حولك.</p></div><a href={INSTALL_URL}>ثبّت تطبيق سند <ArrowLeft/></a></section>
  </main>
  <footer><div className="footer-brand"><img src="/sanad_logo.png" width="118" height="58" alt="سند فلو"/><p>التحقق من الإشعارات المالية ومجتمع الأعمال في مكان واحد.</p></div><div><b>الخدمات</b><a href="/financial-verification/">سند المالي</a><a href="/business/">سند التجاري</a><a href="/sanad-pro/">سند برو</a><a href="/security/">الأمان</a></div><div><b>المعلومات والدعم</b><a href="/about/">عن سند</a><a href="/help/">مركز المساعدة</a><a href="/privacy/">سياسة الخصوصية</a><a href="/terms/">الشروط والأحكام</a>{whatsapp&&<a href={`https://wa.me/${whatsapp}`}>واتساب</a>}<a href={`mailto:${support.support_email||'support@sanadflow.com'}`}>البريد الإلكتروني</a></div><small>© 2026 سند. جميع الحقوق محفوظة.</small></footer>
 </div>
}
