import { useEffect, useMemo, useState } from 'react';
import { Profile, MyOperationItem } from '../types';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  FileBarChart2,
  FileText,
  QrCode,
  ShieldCheck,
  Store,
  UploadCloud
} from 'lucide-react';
import { getOperationCardDetails, toLatinDigits } from '../lib/digits';
import {
  getBusinessMediaSignedUrl,
  getPublicBusinesses,
  type PublicBusinessListItem
} from '../lib/businessApi';

interface HomeProps {
  profile: Profile | null;
  onNavigate: (page: string, token?: string) => void;
}

type BusinessPreview = PublicBusinessListItem & {
  verification_status?: string | null;
  logo_path?: string | null;
  profile_image_path?: string | null;
};

export default function Home({ profile, onNavigate }: HomeProps) {
  const [loading, setLoading] = useState(true);
  const [uploaderCount, setUploaderCount] = useState(0);
  const [verifierCount, setVerifierCount] = useState(0);
  const [latestOperations, setLatestOperations] = useState<MyOperationItem[]>([]);
  const [businesses, setBusinesses] = useState<BusinessPreview[]>([]);
  const [businessLogos, setBusinessLogos] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    async function loadHome() {
      setLoading(true);
      try {
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
        setUploaderCount(uploaders.length);
        setVerifierCount(verifiers.length);

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
            .select('id, amount, currency, financial_entity, reference_number, structured_data, raw_ai_json, receiver_name')
            .in('id', ids);
          setLatestOperations(latest.map((item) => ({
            ...item,
            ...(data?.find((row) => row.id === item.operation_id) || {})
          })));
        } else {
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
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadHome();
    return () => { active = false; };
  }, []);

  const latest = useMemo(() => latestOperations[0] || null, [latestOperations]);
  const displayName = profile?.full_name?.trim() || 'مستخدم سند';
  const totalOperations = uploaderCount + verifierCount;

  return (
    <div className="space-y-7 font-arabic" dir="rtl" id="home_view">
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
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-[9px] font-bold text-emerald-700">سند المالي</p>
            <h2 id="financial-sanad-title" className="mt-1 text-sm font-bold text-slate-950">تحقق وشارك بثقة</h2>
          </div>
          <ShieldCheck className="h-5 w-5 text-slate-300" />
        </div>

        <button
          onClick={() => onNavigate('scan-qr')}
          className="group flex w-full items-center gap-4 overflow-hidden rounded-[2rem] bg-slate-950 p-5 text-right text-white shadow-[0_18px_45px_rgba(15,23,42,0.16)]"
        >
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.4rem] bg-white/10">
            <QrCode className="h-8 w-8" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-[9px] font-bold text-emerald-300">الإجراء الأساسي</span>
            <strong className="mt-1 block text-lg">مسح QR</strong>
            <span className="mt-1 block text-[10px] leading-5 text-white/60">افتح كاميرا سند وادخل إلى التحقق مباشرة.</span>
          </span>
          <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate('verify-notice')}
            className="flex min-h-[112px] flex-col justify-between rounded-[1.6rem] bg-white p-4 text-right shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
          >
            <CheckCircle2 className="h-5 w-5 text-slate-700" />
            <span><strong className="block text-xs text-slate-950">تحقق من إشعار</strong><span className="mt-1 block text-[9px] leading-5 text-slate-400">أدخل الرمز أو الرابط يدويًا.</span></span>
          </button>
          <button
            onClick={() => onNavigate('upload')}
            className="flex min-h-[112px] flex-col justify-between rounded-[1.6rem] bg-white p-4 text-right shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
          >
            <UploadCloud className="h-5 w-5 text-slate-700" />
            <span><strong className="block text-xs text-slate-950">رفع إشعار</strong><span className="mt-1 block text-[9px] leading-5 text-slate-400">رفع يدوي عند الحاجة.</span></span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-[1.5rem] bg-slate-100/70 p-3 text-center">
          <div><strong className="block text-sm text-slate-950">{loading ? '...' : toLatinDigits(String(uploaderCount))}</strong><span className="text-[8px] text-slate-400">مرسلة</span></div>
          <div><strong className="block text-sm text-slate-950">{loading ? '...' : toLatinDigits(String(verifierCount))}</strong><span className="text-[8px] text-slate-400">مدققة</span></div>
          <div><strong className="block text-sm text-slate-950">{loading ? '...' : toLatinDigits(String(totalOperations))}</strong><span className="text-[8px] text-slate-400">إجمالي</span></div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onNavigate('my-operations')} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
            <FileText className="h-4 w-4 text-slate-500" /><span className="text-[10px] font-bold text-slate-700">كل العمليات</span><ArrowLeft className="mr-auto h-4 w-4 text-slate-300" />
          </button>
          <button onClick={() => onNavigate('reports')} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
            <FileBarChart2 className="h-4 w-4 text-slate-500" /><span className="text-[10px] font-bold text-slate-700">طلب تقرير</span><ArrowLeft className="mr-auto h-4 w-4 text-slate-300" />
          </button>
        </div>

        {latest && (() => {
          const card = getOperationCardDetails(latest);
          return (
            <button onClick={() => onNavigate('details', latest.public_token)} className="flex w-full items-center gap-3 rounded-[1.5rem] bg-white p-4 text-right shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-[9px] text-slate-400">آخر نشاط</span><strong className="mt-0.5 block truncate text-xs text-slate-900">{card.title}</strong><span className="mt-1 block text-[9px] text-slate-500">{toLatinDigits([card.amount, card.entity].filter(Boolean).join(' · '))}</span></span>
              <ArrowUpRight className="h-4 w-4 text-slate-400" />
            </button>
          );
        })()}
      </section>

      <section className="space-y-4" aria-labelledby="business-sanad-title">
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-[9px] font-bold text-sky-700">سند التجاري</p>
            <h2 id="business-sanad-title" className="mt-1 text-sm font-bold text-slate-950">اكتشف الأعمال من حولك</h2>
          </div>
          <Building2 className="h-5 w-5 text-slate-300" />
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
                <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-950">{business.name}</strong><span className="mt-1 block truncate text-[9px] text-slate-400">{business.category_name || 'نشاط تجاري'} · {business.city}، {business.governorate}</span></span>
                <ArrowLeft className="h-4 w-4 text-slate-300" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
