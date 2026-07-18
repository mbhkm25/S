import { useEffect, useMemo, useState } from 'react';
import { Profile, MyOperationItem } from '../types';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock3,
  FileBarChart2,
  FileText,
  QrCode,
  ShieldCheck,
  Store,
  UploadCloud,
  X
} from 'lucide-react';
import { getOperationCardDetails, toLatinDigits } from '../lib/digits';
import {
  getBusinessMediaSignedUrl,
  getPublicBusinesses,
  type PublicBusinessListItem
} from '../lib/businessApi';
import FinancialEntityLogo from './FinancialEntityLogo';

interface HomeProps {
  profile: Profile | null;
  onNavigate: (page: string, token?: string) => void;
}

type BusinessPreview = PublicBusinessListItem & {
  verification_status?: string | null;
  logo_path?: string | null;
  profile_image_path?: string | null;
};

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
  const [businesses, setBusinesses] = useState<BusinessPreview[]>([]);
  const [businessLogos, setBusinessLogos] = useState<Record<string, string>>({});
  const [cameraNotice, setCameraNotice] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadHome() {
      const [uploadersResult, verifiersResult, businessesResult] = await Promise.allSettled([
        supabase.rpc('get_my_operations', { p_relation_type: 'uploader', p_limit: 10 }),
        supabase.rpc('get_my_operations', { p_relation_type: 'verifier', p_limit: 10 }),
        getPublicBusinesses({
          p_search: null,
          p_governorate: null,
          p_city: null,
          p_category_id: null,
          p_limit: 3,
          p_offset: 0
        })
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
      }).slice(0, 1);

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

      const publicBusinesses = businessesResult.status === 'fulfilled' && Array.isArray(businessesResult.value)
        ? businessesResult.value.slice(0, 3) as BusinessPreview[]
        : [];
      setBusinesses(publicBusinesses);

      const logoEntries = await Promise.all(publicBusinesses.map(async (business) => {
        const path = business.profile_image_path || business.logo_path || business.logo_url || '';
        return [business.id, path ? await getBusinessMediaSignedUrl(path).catch(() => '') : ''] as const;
      }));
      if (active) setBusinessLogos(Object.fromEntries(logoEntries));
    }

    void loadHome();
    return () => { active = false; };
  }, []);

  const latest = useMemo(() => latestOperations[0] || null, [latestOperations]);
  const displayName = profile?.full_name?.trim() || 'مستخدم سند';

  const openScanner = () => {
    if (canOpenCamera()) {
      onNavigate('scan-qr');
      return;
    }
    setCameraNotice(true);
  };

  return (
    <div className="space-y-6 font-arabic" dir="rtl" id="home_view">
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
        <div className="flex items-center gap-3 rounded-[1.4rem] bg-gradient-to-l from-emerald-50/90 to-transparent px-4 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[9px] font-bold text-emerald-700">سند المالي</p>
            <h2 id="financial-sanad-title" className="mt-0.5 text-base font-bold text-slate-950">تحقق وشارك بثقة</h2>
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
            <strong className="block text-lg">مسح QR</strong>
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

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate('verify-notice')}
            className="flex min-h-[108px] flex-col justify-between rounded-[1.6rem] bg-white p-4 text-right shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
          >
            <CheckCircle2 className="h-5 w-5 text-slate-700" />
            <span><strong className="block text-xs text-slate-950">تحقق من إشعار</strong><span className="mt-1 block text-[9px] leading-5 text-slate-400">أدخل الرمز أو الرابط يدويًا.</span></span>
          </button>
          <button
            onClick={() => onNavigate('upload')}
            className="flex min-h-[108px] flex-col justify-between rounded-[1.6rem] bg-white p-4 text-right shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
          >
            <UploadCloud className="h-5 w-5 text-slate-700" />
            <span><strong className="block text-xs text-slate-950">رفع إشعار</strong><span className="mt-1 block text-[9px] leading-5 text-slate-400">رفع يدوي عند الحاجة.</span></span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate('my-operations')}
            className="flex min-h-[88px] flex-col justify-between rounded-[1.5rem] bg-white p-4 text-right shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><FileText className="h-4 w-4" /></span>
            <span className="flex items-end justify-between gap-2"><strong className="text-xs text-slate-900">كل العمليات</strong><ArrowLeft className="h-4 w-4 text-slate-300" /></span>
          </button>
          <button
            onClick={() => onNavigate('reports')}
            className="flex min-h-[88px] flex-col justify-between rounded-[1.5rem] bg-white p-4 text-right shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><FileBarChart2 className="h-4 w-4" /></span>
            <span className="flex items-end justify-between gap-2"><strong className="text-xs text-slate-900">طلب تقرير</strong><ArrowLeft className="h-4 w-4 text-slate-300" /></span>
          </button>
        </div>

        {latest && (() => {
          const card = getOperationCardDetails(latest);
          const relativeTime = formatRelativeTime(latest.created_at);
          return (
            <button onClick={() => onNavigate('details', latest.public_token)} className="flex w-full items-center gap-3 rounded-[1.5rem] bg-white p-4 text-right shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <FinancialEntityLogo
                entity={card.entity || latest.financial_entity}
                className="h-11 w-11 rounded-xl border border-slate-100"
                imageClassName="h-full w-full object-contain p-1"
                decorative
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[9px] text-slate-400"><span>آخر نشاط</span>{relativeTime && <><span>·</span><Clock3 className="h-3 w-3" /><span>{relativeTime}</span></>}</span>
                <strong className="mt-1 block truncate text-xs text-slate-900">{card.title}</strong>
                <span className="mt-1 block text-[9px] text-slate-500">{toLatinDigits([card.amount, card.entity].filter(Boolean).join(' · '))}</span>
              </span>
              <ArrowUpRight className="h-4 w-4 text-slate-400" />
            </button>
          );
        })()}
      </section>

      <div className="relative py-2" aria-hidden="true">
        <div className="h-px w-full bg-gradient-to-l from-transparent via-slate-200 to-transparent" />
        <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-200 ring-4 ring-[#f7f8fa]" />
      </div>

      <section className="space-y-4" aria-labelledby="business-sanad-title">
        <div className="flex items-center gap-3 rounded-[1.4rem] bg-gradient-to-l from-sky-50/90 to-transparent px-4 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sky-700 shadow-sm">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[9px] font-bold text-sky-700">سند التجاري</p>
            <h2 id="business-sanad-title" className="mt-0.5 text-base font-bold text-slate-950">اكتشف الأعمال من حولك</h2>
          </div>
        </div>

        <button
          onClick={() => onNavigate('business-community')}
          className="flex w-full items-center gap-4 rounded-[2rem] bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5 text-right shadow-[0_16px_40px_rgba(15,23,42,0.07)]"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm"><Building2 className="h-7 w-7" /></span>
          <span className="min-w-0 flex-1"><span className="text-[9px] font-bold text-emerald-700">مجتمع أعمال سند</span><strong className="mt-1 block text-base text-slate-950">الأنشطة والكتالوجات العامة</strong><span className="mt-1 block text-[10px] leading-5 text-slate-500">ابحث، استعرض، وتواصل مع الأنشطة المنشورة.</span></span>
          <ArrowLeft className="h-5 w-5 text-slate-500" />
        </button>

        {businesses.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1"><h3 className="text-xs font-bold text-slate-900">أنشطة منشورة</h3><button onClick={() => onNavigate('business-community')} className="text-[9px] font-bold text-slate-500">عرض الكل</button></div>
            {businesses.map((business) => (
              <button key={business.id} onClick={() => onNavigate('public-business-profile', business.slug)} className="flex w-full items-center gap-3 rounded-[1.5rem] bg-white p-3.5 text-right shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                  {businessLogos[business.id] ? <img src={businessLogos[business.id]} alt={business.name} className="h-full w-full object-cover" /> : <Store className="h-5 w-5 text-slate-400" />}
                </span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-950">{business.name}</strong><span className="mt-1 block truncate text-[9px] text-slate-400">{[business.category_name, [business.city, business.governorate].filter(Boolean).join('، ')].filter(Boolean).join(' · ')}</span></span>
                <ArrowLeft className="h-4 w-4 text-slate-300" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
