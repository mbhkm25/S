import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronLeft,
  Download,
  ExternalLink,
  FileImage,
  HelpCircle,
  MessageCircle,
  Printer,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Users
} from 'lucide-react';

type OperationsCenterProps = {
  onBack: () => void;
  onNavigate: (page: string, token?: string) => void;
};

const SANAD_WHATSAPP_URL = 'https://sanadflow.com/wa';

const quickSteps = [
  {
    title: 'جهّز نقطة الاستقبال',
    description: 'اطبع ملصق سند وضعه بجانب الكاشير في مكان واضح.',
    icon: Printer
  },
  {
    title: 'اطلب من العميل إرسال الإشعار',
    description: 'العميل يفتح محادثة سند ويرسل إشعار الدفع مباشرة، دون تثبيت التطبيق.',
    icon: MessageCircle
  },
  {
    title: 'راجع العملية وتحقق منها',
    description: 'افتح العملية من تطبيق سند، راجع بياناتها، ثم سجّل تحققك وملاحظاتك.',
    icon: ShieldCheck
  }
];

const guides = [
  {
    title: 'كيف يعمل سند بعد الدفع؟',
    description: 'افهم دورة التشغيل من إرسال الإشعار حتى مراجعة العملية وتوثيقها.',
    icon: Sparkles
  },
  {
    title: 'كيف تدرّب الكاشير؟',
    description: 'خطوات عملية لتشغيل سند داخل المتجر وتوزيع المسؤوليات بوضوح.',
    icon: Users
  },
  {
    title: 'كيف تنشئ نشاطًا احترافيًا؟',
    description: 'أنشئ ملف النشاط، أضف البيانات، وابدأ ربط فريقك وعملياتك.',
    icon: Building2,
    action: 'business-create'
  },
  {
    title: 'أفضل مكان لوضع الملصق',
    description: 'ضعه قرب شاشة الكاشير أو نقطة انتظار العميل، وليس في زاوية بعيدة.',
    icon: Store
  }
];

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-slate-950">{title}</h2>
      {subtitle && <p className="mt-1 text-[11px] leading-5 text-slate-500">{subtitle}</p>}
    </div>
  );
}

export default function OperationsCenter({ onBack, onNavigate }: OperationsCenterProps) {
  return (
    <div className="space-y-5 pb-24" dir="rtl">
      <header className="flex min-h-11 items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="رجوع"
          className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-slate-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-base font-bold text-slate-950">مركز التشغيل</h1>
          <p className="mt-0.5 text-[10px] text-slate-500">كل ما تحتاجه لتشغيل سند في نشاطك</p>
        </div>
      </header>

      <section className="overflow-hidden rounded-[1.8rem] bg-slate-950 p-5 text-white shadow-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
            <BadgeCheck className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-emerald-300">ابدأ من هنا</p>
            <h2 className="mt-1 text-lg font-bold">شغّل سند في متجرك خلال دقائق</h2>
            <p className="mt-2 text-xs leading-6 text-slate-300">
              اطبع الملصق، ضعه بجانب الكاشير، واطلب من العملاء إرسال إشعارات الدفع إلى محادثة سند.
            </p>
          </div>
        </div>
        <a
          href={SANAD_WHATSAPP_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-xs font-bold text-slate-950"
        >
          <MessageCircle className="h-4 w-4" /> فتح محادثة سند
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </section>

      <section className="space-y-3">
        <SectionTitle title="دورة التشغيل السريعة" subtitle="ثلاث خطوات تكفي لبدء التجربة داخل المتجر." />
        <div className="space-y-2">
          {quickSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="flex gap-3 rounded-[1.5rem] bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-950 text-[10px] font-bold text-white">{index + 1}</span>
                    <h3 className="text-xs font-bold text-slate-950">{step.title}</h3>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-5 text-slate-500">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle title="مواد جاهزة للطباعة" subtitle="ستظهر الملفات النهائية هنا فور اكتمال تجهيز حزمة الصور والطباعة." />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-[1.5rem] bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><QrCode className="h-5 w-5" /></span>
              <span className="rounded-lg bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">قيد التجهيز</span>
            </div>
            <h3 className="mt-3 text-xs font-bold">ملصق QR + رقم سند</h3>
            <p className="mt-1 text-[10px] leading-5 text-slate-500">ملصق صغير يوضع قرب الكاشير لفتح محادثة سند مباشرة.</p>
          </div>

          <div className="rounded-[1.5rem] bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><FileImage className="h-5 w-5" /></span>
              <span className="rounded-lg bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">قيد التجهيز</span>
            </div>
            <h3 className="mt-3 text-xs font-bold">ورقة A4 متعددة النسخ</h3>
            <p className="mt-1 text-[10px] leading-5 text-slate-500">نسخ مرتبة وجاهزة للطباعة والقص والتوزيع على المتاجر.</p>
          </div>
        </div>
        <div className="flex min-h-12 items-center gap-3 rounded-2xl bg-slate-100 px-4 text-[11px] leading-5 text-slate-600">
          <Download className="h-5 w-5 shrink-0" />
          عند إضافة الملفات النهائية، ستتحول هذه البطاقات إلى أزرار تنزيل PDF وPNG مباشرة.
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle title="أدلة التشغيل" subtitle="محتوى عملي مختصر، مرتبط مباشرة بالمهام داخل سند." />
        <div className="overflow-hidden rounded-[1.6rem] bg-white shadow-sm">
          {guides.map((guide, index) => {
            const Icon = guide.icon;
            return (
              <button
                key={guide.title}
                type="button"
                onClick={() => guide.action && onNavigate(guide.action)}
                className={`flex min-h-[76px] w-full items-center gap-3 px-4 text-right ${index ? 'border-t border-slate-100' : ''}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-slate-950">{guide.title}</span>
                  <span className="mt-1 block text-[10px] leading-5 text-slate-500">{guide.description}</span>
                </span>
                {guide.action ? <ChevronLeft className="h-4 w-4 shrink-0 text-slate-400" /> : <BookOpen className="h-4 w-4 shrink-0 text-slate-300" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[1.6rem] bg-emerald-50 p-4">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <h2 className="text-xs font-bold text-emerald-950">المعرفة نفسها ستخدم مساعد سند</h2>
            <p className="mt-1 text-[10px] leading-5 text-emerald-800">
              أدلة هذا المركز ستُربط بقاعدة معرفة سند، حتى يجيب المساعد بنفس الخطوات المعتمدة بدل الردود العامة أو القديمة.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[1.6rem] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100"><Smartphone className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xs font-bold">هل تحتاج مساعدة في التشغيل؟</h2>
            <p className="mt-1 text-[10px] text-slate-500">افتح محادثة سند واسأل عن الخطوة التي تريد تنفيذها.</p>
          </div>
          <a href={SANAD_WHATSAPP_URL} target="_blank" rel="noreferrer" aria-label="فتح الدعم" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white"><HelpCircle className="h-5 w-5" /></a>
        </div>
      </section>
    </div>
  );
}
