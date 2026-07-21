import { useEffect, useMemo, useState } from 'react';
import { Profile, MyOperationItem } from '../types';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronDown,
  Clock3,
  History,
  ListChecks,
  Network,
  QrCode,
  SearchCheck,
  ShieldCheck,
  UploadCloud,
  X
} from 'lucide-react';
import { getOperationCardDetails, toLatinDigits } from '../lib/digits';
import FinancialEntityLogo from './FinancialEntityLogo';
import LogoLoop from './effects/LogoLoop';
import TrueFocus from './effects/TrueFocus';
import RotatingText from './effects/RotatingText';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

interface HomeProps {
  profile: Profile | null;
  onNavigate: (page: string, token?: string) => void;
}

type QuickAction = {
  title: string;
  description: string;
  page: string;
  icon: typeof UploadCloud;
  iconClassName: string;
  iconBackgroundClassName: string;
};

const quickActions: QuickAction[] = [
  {
    title: 'رفع إشعار',
    description: 'أرسل إشعارًا ماليًا جديدًا',
    page: 'upload',
    icon: UploadCloud,
    iconClassName: 'text-sky-700',
    iconBackgroundClassName: 'bg-sky-50'
  },
  {
    title: 'تحقق من إشعار',
    description: 'أدخل رمزًا أو رابطًا',
    page: 'verify-notice',
    icon: SearchCheck,
    iconClassName: 'text-emerald-700',
    iconBackgroundClassName: 'bg-emerald-50'
  },
  {
    title: 'كل العمليات',
    description: 'استعرض السجل المالي',
    page: 'my-operations',
    icon: History,
    iconClassName: 'text-indigo-700',
    iconBackgroundClassName: 'bg-indigo-50'
  },
  {
    title: 'طلب تقرير',
    description: 'أنشئ ملخصًا تحليليًا',
    page: 'reports',
    icon: ChartNoAxesCombined,
    iconClassName: 'text-violet-700',
    iconBackgroundClassName: 'bg-violet-50'
  }
];

function isNativeApp(): boolean {
  try {
    return Boolean((window as any).Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

function canOpenCamera(): boolean {
  if (isNativeApp()) return true;
  if (window.isSecureContext) return true;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function formatRelativeTime(value?: string | null): string {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  const formatter = new Intl.RelativeTimeFormat('ar-u-nu-latn', { numeric: 'auto' });

  if (absoluteSeconds < 60) return 'الآن';
  if (absoluteSeconds < 3600) return toLatinDigits(formatter.format(Math.round(deltaSeconds / 60), 'minute'));
  if (absoluteSeconds < 86400) return toLatinDigits(formatter.format(Math.round(deltaSeconds / 3600), 'hour'));
  if (absoluteSeconds < 604800) return toLatinDigits(formatter.format(Math.round(deltaSeconds / 86400), 'day'));
  return toLatinDigits(formatter.format(Math.round(deltaSeconds / 604800), 'week'));
}

export default function Home({ profile, onNavigate }: HomeProps) {
  const [latestOperations, setLatestOperations] = useState<MyOperationItem[]>([]);
  const [cameraNotice, setCameraNotice] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let active = true;

    async function loadHome() {
      const [uploadersResult, verifiersResult] = await Promise.allSettled([
        supabase.rpc('get_my_operations', { p_relation_type: 'uploader', p_limit: 10 }),
        supabase.rpc('get_my_operations', { p_relation_type: 'verifier', p_limit: 10 })
      ]);

      if (!active) return;

      const uploaders = uploadersResult.status === 'fulfilled' ? uploadersResult.value.data || [] : [];
      const verifiers = verifiersResult.status === 'fulfilled' ? verifiersResult.value.data || [] : [];
      const merged: MyOperationItem[] = [...uploaders, ...verifiers];
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const seen = new Set<string>();
      const latest = merged.filter((item) => {
        const id = item.operation_id || item.public_token;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      }).slice(0, 2);

      const ids = latest.map((item) => item.operation_id).filter(Boolean);
      if (ids.length) {
        const { data } = await supabase
          .from('operations')
          .select('id, amount, currency, financial_entity, reference_number, structured_data, raw_ai_json')
          .in('id', ids);
        if (active) {
          setLatestOperations(latest.map((item) => ({
            ...item,
            ...(data?.find((row) => row.id === item.operation_id) || {})
          })));
        }
      } else if (active) {
        setLatestOperations(latest);
      }
    }

    void loadHome();
    return () => { active = false; };
  }, []);

  const recentOperations = useMemo(() => latestOperations.slice(0, 2), [latestOperations]);
  const displayName = profile?.full_name?.trim() || 'مستخدم سند';

  const openScanner = () => {
    if (canOpenCamera()) {
      onNavigate('scan-qr');
      return;
    }
    setCameraNotice(true);
  };

  return (
    <div className="space-y-5 font-arabic" dir="rtl" id="home_view">
      <section className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-slate-400">مرحبًا بك في سند</p>
          <h1 className="mt-1 truncate text-lg font-bold text-slate-950">{displayName}</h1>
          <p className="mt-1 text-[10px] text-slate-500">تحقق مالي موثوق، ومجتمع أعمال في مكان واحد.</p>
        </div>
        <span className="flex shrink-0 items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> نشط
        </span>
      </section>

      <section className="space-y-3" aria-labelledby="financial-sanad-title">
        <div className="flex min-h-[72px] items-center gap-3 overflow-hidden rounded-[1.55rem] bg-gradient-to-l from-emerald-100/90 via-emerald-50/65 to-transparent px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-emerald-700 shadow-sm backdrop-blur-sm">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold text-emerald-700">سند المالي</p>
            <h2 id="financial-sanad-title" className="mt-0.5 flex min-h-7 items-center overflow-hidden text-base font-bold text-slate-950">
              <RotatingText
                texts={['تحقق وشارك بثقة', 'طابق الإشعارات بسهولة', 'احتفظ بسجل موثوق']}
                rotationInterval={2800}
                splitBy="words"
                staggerFrom="last"
                staggerDuration={0.035}
                initial={{ y: '110%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '-110%', opacity: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 360 }}
                mainClassName="min-w-0 overflow-hidden text-emerald-950"
                splitLevelClassName="overflow-hidden"
              />
            </h2>
          </div>
        </div>

        <button
          onClick={openScanner}
          className="group flex w-full items-center gap-4 overflow-hidden rounded-[2rem] bg-slate-950 p-5 text-right text-white shadow-[0_18px_45px_rgba(15,23,42,0.16)]"
        >
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.4rem] bg-white/10">
            <QrCode className="h-8 w-8" />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-lg">
              <TrueFocus
                sentence="مسح QR"
                blurAmount={1.6}
                borderColor="#ffffff"
                glowColor="rgba(255,255,255,0.5)"
                animationDuration={0.7}
                pauseBetweenAnimations={1.45}
              />
            </strong>
            <span className="mt-1 block text-[10px] leading-5 text-white/60">افتح كاميرا سند وادخل إلى التحقق مباشرة.</span>
          </span>
          <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
        </button>

        {cameraNotice && (
          <div className="relative rounded-[1.5rem] bg-amber-50 px-4 py-4 text-amber-950 shadow-sm">
            <button onClick={() => setCameraNotice(false)} className="absolute left-3 top-3 rounded-full bg-white/70 p-1.5" aria-label="إغلاق">
              <X className="h-4 w-4" />
            </button>
            <strong className="block text-xs">الكاميرا تحتاج اتصالًا آمنًا</strong>
            <p className="mt-2 max-w-[90%] text-[9px] leading-5 text-amber-800">
              العنوان المحلي الحالي يعمل عبر HTTP، والمتصفح يمنع تشغيل الكاميرا عليه. استخدم تطبيق Android أو افتح سند عبر HTTPS.
            </p>
            <button onClick={() => onNavigate('verify-notice')} className="mt-3 rounded-xl bg-white px-3 py-2 text-[9px] font-bold shadow-sm">
              التحقق يدويًا أو من صورة QR
            </button>
          </div>
        )}

        <div className="relative overflow-hidden rounded-[1.65rem] border border-slate-200/80 bg-gradient-to-l from-slate-100 via-white to-indigo-50/55 shadow-[0_14px_34px_rgba(15,23,42,0.07)]">
          <span className="pointer-events-none absolute -left-8 -top-10 h-28 w-28 rounded-full bg-indigo-200/20 blur-2xl" />
          <button
            type="button"
            onClick={() => setActionsOpen((open) => !open)}
            className="relative flex w-full items-center gap-3 px-4 py-4 text-right"
            aria-expanded={actionsOpen}
            aria-controls="home-quick-actions"
          >
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_8px_20px_rgba(15,23,42,0.2)]">
              <ListChecks className={`h-5 w-5 transition-transform duration-300 ${actionsOpen ? 'rotate-6 scale-110' : ''}`} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm text-slate-950">إجراءات سند</strong>
              <span className="mt-0.5 block text-[9px] text-slate-500">4 أدوات لإدارة عملياتك في مكان واحد</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 rounded-full border border-white/80 bg-white/45 p-1 shadow-sm backdrop-blur-md" aria-hidden="true">
                {quickActions.slice(0, 3).map((action) => {
                  const Icon = action.icon;
                  return <span key={action.page} className={`flex h-5 w-5 items-center justify-center rounded-full ${action.iconBackgroundClassName} ${action.iconClassName}`}><Icon className="h-2.5 w-2.5" /></span>;
                })}
                <span className="rounded-full bg-slate-950 px-2 py-1 text-[9px] font-bold text-white">4</span>
              </span>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${actionsOpen ? 'rotate-180' : ''}`} />
            </span>
          </button>

          <AnimatePresence initial={false}>
            {actionsOpen && <motion.div
              id="home-quick-actions"
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <motion.div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-2.5" initial="closed" animate="open" variants={{ open: { transition: { staggerChildren: reduceMotion ? 0 : 0.07, delayChildren: reduceMotion ? 0 : 0.08 } }, closed: {} }}>
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <motion.button
                      key={action.page}
                      type="button"
                      onClick={() => onNavigate(action.page)}
                      variants={{ closed: { y: reduceMotion ? 0 : 24, opacity: 0, scale: reduceMotion ? 1 : 0.96 }, open: { y: 0, opacity: 1, scale: 1 } }}
                      transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="group flex min-h-[82px] items-center gap-2.5 rounded-[1.2rem] bg-slate-50/80 p-3 text-right transition duration-200 active:scale-[0.98] active:bg-slate-100"
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${action.iconBackgroundClassName} ${action.iconClassName}`}>
                        <Icon className="h-[18px] w-[18px] transition-transform duration-200 group-active:scale-90" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-[11px] text-slate-900">{action.title}</strong>
                        <span className="mt-1 block text-[8px] leading-4 text-slate-400">{action.description}</span>
                      </span>
                    </motion.button>
                  );
                })}
              </motion.div>
            </motion.div>}
          </AnimatePresence>
        </div>

        {recentOperations.length > 0 && (
          <div className="overflow-hidden rounded-[1.65rem] border border-slate-200/80 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="flex items-center gap-2 text-[10px] font-bold text-slate-700"><Clock3 className="h-3.5 w-3.5 text-slate-400" />آخر النشاط</span>
              <button type="button" onClick={() => onNavigate('my-operations')} className="text-[9px] font-bold text-emerald-700">عرض الكل</button>
            </div>
            <div className="divide-y divide-slate-100">
              {recentOperations.map((operation) => {
                const card = getOperationCardDetails(operation);
                const relativeTime = formatRelativeTime(operation.created_at);
                return (
                  <button key={operation.operation_id || operation.public_token} onClick={() => onNavigate('details', operation.public_token)} className="flex w-full items-center gap-3 px-4 py-3 text-right transition-colors active:bg-slate-50">
                    <FinancialEntityLogo entity={card.entity || operation.financial_entity} className="h-10 w-10 rounded-xl border border-slate-100" imageClassName="h-full w-full object-contain p-1" decorative />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[8px] text-slate-400">{relativeTime && <><Clock3 className="h-3 w-3" /><span>{relativeTime}</span></>}</span>
                      <strong className="mt-0.5 block truncate text-[11px] text-slate-900">{card.title}</strong>
                      <span className="mt-0.5 block text-[8px] text-slate-500">{toLatinDigits([card.amount, card.entity].filter(Boolean).join(' · '))}</span>
                    </span>
                    <ArrowLeft className="h-4 w-4 text-slate-400" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <div className="overflow-hidden rounded-[1.25rem] border-y border-slate-200/70 bg-[#f7f8fa] py-1">
        <LogoLoop
          logos={[]}
          speed={32}
          direction="left"
          logoHeight={28}
          gap={24}
          fadeOut
          fadeOutColor="#f7f8fa"
        />
      </div>

      <section className="-mx-2 -mb-24 space-y-4 bg-gradient-to-b from-sky-100/75 via-indigo-50/70 to-slate-100/85 px-2 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-5 sm:-mx-4 sm:px-4" aria-labelledby="business-sanad-title">
        <div className="flex min-h-[72px] items-center gap-3 px-3 py-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/75 text-sky-700 shadow-sm backdrop-blur-sm">
            <BriefcaseBusiness className="h-5 w-5 animate-[pulse_3.4s_ease-in-out_infinite]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold text-sky-700">سند التجاري</p>
            <h2 id="business-sanad-title" className="mt-0.5 flex min-h-7 items-center gap-1.5 overflow-hidden text-base font-bold text-slate-950">
              <span className="shrink-0">اكتشف</span>
              <RotatingText
                texts={['الأعمال من حولك', 'الكتالوجات العامة', 'الخدمات القريبة', 'الأنشطة الموثوقة']}
                rotationInterval={2800}
                splitBy="words"
                staggerFrom="last"
                staggerDuration={0.035}
                initial={{ y: '110%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '-110%', opacity: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 360 }}
                mainClassName="min-w-0 overflow-hidden text-sky-800"
                splitLevelClassName="overflow-hidden"
              />
            </h2>
          </div>
        </div>

        <div>
        <button onClick={() => onNavigate('business-community')} className="group flex w-full items-center gap-4 rounded-[2rem] bg-white/86 p-5 text-right shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur-sm">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-sky-50 text-emerald-700 shadow-sm">
            <Network className="h-7 w-7 transition-transform duration-300 group-active:rotate-6 group-active:scale-90" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-[9px] font-bold text-emerald-700">مجتمع أعمال سند</span>
            <strong className="mt-1 block text-base text-slate-950">الأنشطة والكتالوجات العامة</strong>
            <span className="mt-1 block text-[10px] leading-5 text-slate-500">ابحث، استعرض، وتواصل مع الأنشطة المنشورة.</span>
          </span>
          <ArrowLeft className="h-5 w-5 text-slate-500 transition-transform duration-200 group-active:-translate-x-1" />
        </button>
          <div className="h-5 w-full" aria-hidden="true" />
        </div>
      </section>
    </div>
  );
}
