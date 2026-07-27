import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Download,
  ExternalLink,
  FileImage,
  HelpCircle,
  Image as ImageIcon,
  MessageCircle,
  Printer,
  QrCode,
  ShieldCheck,
  Smartphone
} from 'lucide-react';

type OperationsCenterProps = {
  onBack: () => void;
  onNavigate: (page: string, token?: string) => void;
};

type GuideCard = {
  title: string;
  description: string;
  image: string;
  alt: string;
  actionLabel?: string;
  action?: () => void;
};

type DownloadCard = {
  title: string;
  description: string;
  href: string;
  icon: typeof Printer;
  format: 'PDF' | 'PNG';
};

const SANAD_WHATSAPP_URL = 'https://sanadflow.com/wa';
const ASSET_BASE = '/operations-center';

const printDownloads: DownloadCard[] = [
  {
    title: 'ملصق رقم سند — A4',
    description: 'عدة نسخ مرتبة للطباعة والقص والتوزيع على المتاجر.',
    href: `${ASSET_BASE}/print/sanad-phone-sticker-a4.pdf`,
    icon: Printer,
    format: 'PDF'
  },
  {
    title: 'ملصق QR — A4',
    description: 'صفحة جاهزة للطباعة تحتوي على ملصقات QR متعددة.',
    href: `${ASSET_BASE}/print/sanad-qr-sticker-a4.pdf`,
    icon: QrCode,
    format: 'PDF'
  },
  {
    title: 'بطاقة الكاشير',
    description: 'بطاقة إرشادية توضع قرب الكاشير لتوضيح مسار الإرسال.',
    href: `${ASSET_BASE}/print/sanad-counter-card.pdf`,
    icon: FileImage,
    format: 'PDF'
  },
  {
    title: 'صورة ملصق رقم سند',
    description: 'نسخة PNG للمشاركة أو الطباعة بمقاس مخصص.',
    href: `${ASSET_BASE}/sanad-phone-sticker.png`,
    icon: ImageIcon,
    format: 'PNG'
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

function GuideCardView({ card }: { card: GuideCard }) {
  return (
    <article className="overflow-hidden rounded-[1.7rem] bg-white shadow-sm">
      <button
        type="button"
        onClick={card.action}
        className="block w-full text-right"
        disabled={!card.action}
      >
        <div className="aspect-square overflow-hidden bg-slate-50">
          <img
            src={card.image}
            alt={card.alt}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="p-4">
          <h3 className="text-sm font-bold text-slate-950">{card.title}</h3>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">{card.description}</p>
          {card.actionLabel && (
            <span className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-slate-100 px-3 text-[10px] font-bold text-slate-800">
              {card.actionLabel}
            </span>
          )}
        </div>
      </button>
    </article>
  );
}

export default function OperationsCenter({ onBack, onNavigate }: OperationsCenterProps) {
  const guides: GuideCard[] = [
    {
      title: 'ابدأ تشغيل سند في متجرك',
      description: 'أنشئ نشاطك، اطبع الملصق، ثم ابدأ استقبال إشعارات الدفع والتحقق منها.',
      image: `${ASSET_BASE}/start-sanad-in-store.png`,
      alt: 'خطوات بدء تشغيل سند في المتجر',
      actionLabel: 'إنشاء أو إدارة النشاط',
      action: () => onNavigate('business-create')
    },
    {
      title: 'كيف ترسل إشعار الدفع؟',
      description: 'شرح بسيط للعميل: افتح محادثة سند، أرسل الصورة أو PDF، ثم استلم رابط التحقق وQR.',
      image: `${ASSET_BASE}/send-payment-notice.png`,
      alt: 'كيفية إرسال إشعار الدفع إلى سند'
    },
    {
      title: 'كيف يعمل سند بعد الدفع؟',
      description: 'يفهم المستخدم كيف ينتقل الإشعار من هاتف العميل إلى عملية منظمة يمكن للكاشير مراجعتها.',
      image: `${ASSET_BASE}/how-sanad-works.png`,
      alt: 'كيف ينظم سند ما يحدث بعد الدفع الإلكتروني'
    },
    {
      title: 'ثبّت سند بسهولة',
      description: 'خطوات تثبيت تطبيق سند على أندرويد وآيفون للوصول الأسرع إلى العمليات.',
      image: `${ASSET_BASE}/install-sanad.png`,
      alt: 'طريقة تثبيت تطبيق سند'
    }
  ];

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
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a
            href={SANAD_WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white text-xs font-bold text-slate-950"
          >
            <MessageCircle className="h-4 w-4" /> فتح المحادثة
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a
            href={`${ASSET_BASE}/print/sanad-counter-card.pdf`}
            download
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-xs font-bold text-white"
          >
            <Download className="h-4 w-4" /> بطاقة الكاشير
          </a>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle title="ابدأ التشغيل" subtitle="المسار العملي الكامل لتجهيز المتجر وتشغيل سند." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {guides.map((guide) => (
            <div key={guide.title}>
              <GuideCardView card={guide} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle title="مواد جاهزة للطباعة" subtitle="ملفات مباشرة للطباعة والقص والاستخدام داخل المتجر." />
        <div className="space-y-2">
          {printDownloads.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                download
                className="flex min-h-[78px] items-center gap-3 rounded-[1.5rem] bg-white p-4 shadow-sm"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-950">{item.title}</span>
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">{item.format}</span>
                  </span>
                  <span className="mt-1 block text-[10px] leading-5 text-slate-500">{item.description}</span>
                </span>
                <Download className="h-4 w-4 shrink-0 text-slate-400" />
              </a>
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
