import { BrainCircuit, BriefcaseBusiness, ChevronLeft, ReceiptText, ShieldCheck, Sparkles, WalletCards } from 'lucide-react';

interface Props {
  onNavigate: (path: string) => void;
}

export default function AiHome({ onNavigate }: Props) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-6 pt-5" dir="rtl">
      <header className="mb-6"><p className="mb-1 text-[12px] font-bold text-violet-700">SANAD AI</p><h1 className="text-[30px] font-black tracking-tight text-slate-950">AI</h1><p className="mt-1 max-w-md text-[13px] leading-6 text-slate-500">طبقة مساعدة واحدة تفهم سياقك المالي أو التجاري، من دون أن تصبح مصدر الحقيقة بدل سجلات سند.</p></header>

      <section className="mb-5 overflow-hidden rounded-[30px] bg-slate-950 p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-bold text-violet-300">مساعد سند</p><h2 className="mt-1 text-[20px] font-black">اسأل، افهم، ثم نفّذ بإذن واضح</h2><p className="mt-3 max-w-md text-[12px] leading-6 text-slate-300">لن يغيّر المساعد قيدًا ماليًا أو إعدادًا تجاريًا بصمت. كل أداة حساسة ستُربط بهويتك وصلاحياتك وسياق النشاط المختار.</p></div><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-violet-300"><BrainCircuit className="h-5 w-5" /></div></div>
      </section>

      <section className="mb-5 rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-700" /><p className="text-[12px] font-black text-slate-900">السياق قبل المحادثة</p></div>
        <div className="grid grid-cols-2 gap-2">
          <ContextButton icon={WalletCards} title="مالي" subtitle="الحسابات والقيود والمصروفات" onClick={() => onNavigate('/financial')} />
          <ContextButton icon={BriefcaseBusiness} title="الأعمال" subtitle="النشاط والعملاء والتشغيل" onClick={() => onNavigate('/business')} />
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="mb-4"><p className="text-[11px] font-bold text-slate-400">المهام التي سنوصلها بالمساعد</p><h2 className="mt-1 text-[17px] font-black text-slate-950">أدوات عابرة للأقسام</h2></div>
        <div className="space-y-2">
          <ToolRow icon={ReceiptText} title="فهم عملية أو مستند" subtitle="يقرأ السياق ثم يفتح سجل العملية الأصلي بدل إنشاء حقيقة بديلة." />
          <ToolRow icon={WalletCards} title="تحليل الوضع المالي" subtitle="يعتمد على دفتر المحاسب الشخصي وعقوده المصرح بها." />
          <ToolRow icon={BriefcaseBusiness} title="مساعدة داخل نشاط تجاري" subtitle="لا يعمل إلا ضمن business_id وصلاحيات العضو الحالية." />
        </div>
        <div className="mt-4 rounded-2xl bg-violet-50 px-4 py-3 text-[11px] font-bold leading-6 text-violet-800"><Sparkles className="ml-1 inline h-4 w-4" /> قناة المحادثة الأصلية داخل التطبيق ستُفعّل بعد تثبيت عقد الأدوات والذاكرة الخاص بها؛ لا نعيد استخدام قناة واتساب كواجهة تطبيق بطريقة غير صحيحة.</div>
      </section>
    </main>
  );
}

function ContextButton({ icon: Icon, title, subtitle, onClick }: { icon: typeof WalletCards; title: string; subtitle: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-[22px] bg-slate-50 p-4 text-right active:scale-[0.99]"><Icon className="mb-3 h-5 w-5 text-slate-700" /><div className="flex items-center justify-between gap-2"><div><p className="text-[13px] font-black text-slate-950">{title}</p><p className="mt-1 text-[10px] leading-5 text-slate-400">{subtitle}</p></div><ChevronLeft className="h-4 w-4 shrink-0 text-slate-300" /></div></button>;
}

function ToolRow({ icon: Icon, title, subtitle }: { icon: typeof ReceiptText; title: string; subtitle: string }) {
  return <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm"><Icon className="h-4 w-4" /></div><div><p className="text-[12px] font-black text-slate-900">{title}</p><p className="mt-1 text-[10px] leading-5 text-slate-500">{subtitle}</p></div></div>;
}
