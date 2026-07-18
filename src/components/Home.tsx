import { useEffect, useMemo, useRef, useState } from 'react';
import { Profile, MyOperationItem } from '../types';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft, ArrowUpRight, Building2, CheckCircle2, FileBarChart2,
  FileText, QrCode, Search, ShieldCheck, Store, UploadCloud, Users
} from 'lucide-react';
import { getOperationCardDetails, toLatinDigits } from '../lib/digits';
import {
  getBusinessMediaSignedUrl, getPublicBusinesses, getUserBusinessContexts,
  type BusinessProfile, type PublicBusinessListItem
} from '../lib/businessApi';

interface HomeProps {
  profile: Profile | null;
  onNavigate: (page: string, token?: string) => void;
}

type HomePage = 0 | 1;

type BusinessPreview = PublicBusinessListItem & { logoPath?: string | null };

export default function Home({ profile, onNavigate }: HomeProps) {
  const pagerRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<HomePage>(0);
  const [loading, setLoading] = useState(true);
  const [uploaderCount, setUploaderCount] = useState(0);
  const [verifierCount, setVerifierCount] = useState(0);
  const [latestOperations, setLatestOperations] = useState<MyOperationItem[]>([]);
  const [linkedBusinesses, setLinkedBusinesses] = useState<BusinessProfile[]>([]);
  const [featuredBusinesses, setFeaturedBusinesses] = useState<BusinessPreview[]>([]);
  const [businessLogos, setBusinessLogos] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    async function loadHome() {
      setLoading(true);
      try {
        const [uploadersResult, verifiersResult, contextsResult, businessesResult] = await Promise.allSettled([
          supabase.rpc('get_my_operations', { p_relation_type: 'uploader', p_limit: 10 }),
          supabase.rpc('get_my_operations', { p_relation_type: 'verifier', p_limit: 10 }),
          getUserBusinessContexts(),
          getPublicBusinesses({ p_search: null, p_governorate: null, p_city: null, p_category_id: null })
        ]);
        if (!active) return;

        const uploaders = uploadersResult.status === 'fulfilled' ? uploadersResult.value.data || [] : [];
        const verifiers = verifiersResult.status === 'fulfilled' ? verifiersResult.value.data || [] : [];
        setUploaderCount(uploaders.length);
        setVerifierCount(verifiers.length);

        const merged: MyOperationItem[] = [...uploaders, ...verifiers];
        merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const seen = new Set<string>();
        const unique = merged.filter((item) => {
          const id = item.operation_id || item.public_token;
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        }).slice(0, 1);

        const ids = unique.map((item) => item.operation_id).filter(Boolean);
        if (ids.length) {
          const { data } = await supabase
            .from('operations')
            .select('id, amount, currency, financial_entity, reference_number, structured_data, raw_ai_json, receiver_name')
            .in('id', ids);
          setLatestOperations(unique.map((item) => ({ ...item, ...(data?.find((row) => row.id === item.operation_id) || {}) })));
        } else {
          setLatestOperations(unique);
        }

        const contexts = contextsResult.status === 'fulfilled' ? contextsResult.value : null;
        setLinkedBusinesses(contexts?.customer_businesses?.filter((item) => item.public_status === 'published').slice(0, 3) || []);

        const publicItems = businessesResult.status === 'fulfilled' && Array.isArray(businessesResult.value)
          ? businessesResult.value.slice(0, 4) as BusinessPreview[]
          : [];
        setFeaturedBusinesses(publicItems);

        const logoEntries = await Promise.all(
          [...(contexts?.customer_businesses || []), ...publicItems].map(async (item: any) => {
            const path = item.profile_image_path || item.logo_path || item.logo_url || '';
            return [item.id, path ? await getBusinessMediaSignedUrl(path).catch(() => '') : ''] as const;
          })
        );
        if (active) setBusinessLogos(Object.fromEntries(logoEntries));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadHome();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const element = pagerRef.current;
    if (!element) return;
    const handleScroll = () => {
      const next = Math.round(element.scrollLeft / Math.max(element.clientWidth, 1));
      setPage((next === 1 ? 1 : 0) as HomePage);
    };
    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, []);

  const goToPage = (next: HomePage) => {
    const element = pagerRef.current;
    if (!element) return;
    element.scrollTo({ left: next * element.clientWidth, behavior: 'smooth' });
    setPage(next);
  };

  const displayName = profile?.full_name?.trim() || 'مستخدم سند';
  const totalOperations = uploaderCount + verifierCount;
  const latest = useMemo(() => latestOperations[0] || null, [latestOperations]);

  const BusinessLogo = ({ business }: { business: { id: string; name: string } }) => (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
      {businessLogos[business.id]
        ? <img src={businessLogos[business.id]} alt={business.name} className="h-full w-full object-cover" />
        : <Store className="h-5 w-5 text-slate-400" />}
    </span>
  );

  return (
    <div className="font-arabic" dir="rtl" id="home_view">
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <p className="text-[10px] font-bold text-slate-400">مرحبًا بك في سند</p>
          <h1 className="mt-0.5 max-w-[250px] truncate text-base font-bold text-slate-950">{displayName}</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> الحساب نشط
        </div>
      </div>

      <div className="mb-3 flex items-center justify-center gap-2" aria-label="صفحات الرئيسية">
        <button onClick={() => goToPage(0)} className={`h-1.5 rounded-full transition-all ${page === 0 ? 'w-8 bg-slate-900' : 'w-2 bg-slate-200'}`} aria-label="سند الآن" />
        <button onClick={() => goToPage(1)} className={`h-1.5 rounded-full transition-all ${page === 1 ? 'w-8 bg-slate-900' : 'w-2 bg-slate-200'}`} aria-label="الأعمال" />
      </div>

      <div
        ref={pagerRef}
        className="flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ direction: 'ltr' }}
      >
        <section className="w-full shrink-0 snap-center px-0.5" style={{ direction: 'rtl' }} aria-label="سند الآن">
          <div className="space-y-4 overflow-y-auto overscroll-contain pb-2">
            <button
              onClick={() => onNavigate('upload')}
              className="group relative flex w-full items-center gap-4 overflow-hidden rounded-[2rem] bg-slate-950 p-5 text-right text-white shadow-[0_18px_45px_rgba(15,23,42,0.16)]"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10"><UploadCloud className="h-6 w-6" /></span>
              <span className="min-w-0 flex-1"><strong className="block text-base">وثّق إشعارًا ماليًا</strong><span className="mt-1 block text-[10px] leading-5 text-white/60">ارفع صورة أو ملفًا، ثم شارك نتيجة التحقق بأمان.</span></span>
              <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
            </button>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'تحقق', desc: 'من إشعار', icon: CheckCircle2, action: () => onNavigate('verify-notice') },
                { label: 'مسح QR', desc: 'فتح الماسح', icon: QrCode, action: () => onNavigate('scan-qr') },
                { label: 'العمليات', desc: 'السجل الكامل', icon: FileText, action: () => onNavigate('my-operations') }
              ].map(({ label, desc, icon: Icon, action }) => (
                <button key={label} onClick={action} className="rounded-2xl bg-white p-3 text-right shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                  <Icon className="h-5 w-5 text-slate-700" /><strong className="mt-4 block text-[11px] text-slate-950">{label}</strong><span className="mt-0.5 block text-[8px] text-slate-400">{desc}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-[1.5rem] bg-slate-100/70 p-3 text-center">
              <div><strong className="block text-sm text-slate-950">{loading ? '...' : toLatinDigits(String(uploaderCount))}</strong><span className="text-[8px] text-slate-400">مرسلة</span></div>
              <div><strong className="block text-sm text-slate-950">{loading ? '...' : toLatinDigits(String(verifierCount))}</strong><span className="text-[8px] text-slate-400">مدققة</span></div>
              <div><strong className="block text-sm text-slate-950">{loading ? '...' : toLatinDigits(String(totalOperations))}</strong><span className="text-[8px] text-slate-400">إجمالي</span></div>
            </div>

            {latest ? (() => {
              const card = getOperationCardDetails(latest);
              return <button onClick={() => onNavigate('details', latest.public_token)} className="flex w-full items-center gap-3 rounded-[1.5rem] bg-white p-4 text-right shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-[9px] text-slate-400">آخر نشاط</span><strong className="mt-0.5 block truncate text-xs text-slate-900">{card.title}</strong><span className="mt-1 block text-[9px] text-slate-500">{toLatinDigits([card.amount, card.entity].filter(Boolean).join(' · '))}</span></span>
                <ArrowUpRight className="h-4 w-4 text-slate-400" />
              </button>;
            })() : <div className="rounded-[1.5rem] bg-white p-5 text-center text-[10px] text-slate-400 shadow-sm">لا توجد عمليات مسجلة بعد.</div>}

            <button onClick={() => onNavigate('reports')} className="flex w-full items-center gap-3 px-2 py-2 text-right text-slate-600"><FileBarChart2 className="h-4 w-4" /><span className="text-[10px] font-bold">طلب تقرير عبر واتساب</span><ArrowLeft className="mr-auto h-4 w-4" /></button>
          </div>
        </section>

        <section className="w-full shrink-0 snap-center px-0.5" style={{ direction: 'rtl' }} aria-label="الأعمال">
          <div className="space-y-4 overflow-y-auto overscroll-contain pb-2">
            <button onClick={() => onNavigate('business-community')} className="relative flex w-full items-center gap-4 overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5 text-right shadow-[0_16px_40px_rgba(15,23,42,0.07)]">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm"><Building2 className="h-7 w-7" /></span>
              <span className="min-w-0 flex-1"><span className="text-[9px] font-bold text-emerald-700">مجتمع أعمال سند</span><strong className="mt-1 block text-base text-slate-950">اكتشف الأعمال والخدمات</strong><span className="mt-1 block text-[10px] leading-5 text-slate-500">أنشطة منشورة، كتالوجات، ووسائل تواصل في مكان واحد.</span></span>
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </button>

            <div className="flex items-center justify-between"><div><h2 className="text-xs font-bold text-slate-900">أنشطتي</h2><p className="mt-0.5 text-[9px] text-slate-400">الأنشطة المرتبطة بك كعميل</p></div><Users className="h-5 w-5 text-slate-300" /></div>
            {linkedBusinesses.length ? (
              <div className="space-y-2">
                {linkedBusinesses.map((business) => <button key={business.id} onClick={() => onNavigate('public-business-profile', business.slug)} className="flex w-full items-center gap-3 rounded-[1.4rem] bg-white p-3 text-right shadow-[0_8px_24px_rgba(15,23,42,0.05)]"><BusinessLogo business={business} /><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-950">{business.name}</strong><span className="mt-1 block truncate text-[9px] text-slate-400">{business.city}، {business.governorate}</span></span><ArrowLeft className="h-4 w-4 text-slate-400" /></button>)}
              </div>
            ) : <button onClick={() => onNavigate('business-community')} className="flex w-full items-center gap-3 rounded-[1.5rem] bg-slate-100/70 p-4 text-right"><Search className="h-5 w-5 text-slate-500" /><span className="flex-1 text-[10px] text-slate-600">لم ترتبط بأي نشاط بعد. ابدأ بالاكتشاف.</span><ArrowLeft className="h-4 w-4" /></button>}

            <div className="flex items-center justify-between"><div><h2 className="text-xs font-bold text-slate-900">اكتشف الآن</h2><p className="mt-0.5 text-[9px] text-slate-400">أنشطة عامة منشورة في سند</p></div><button onClick={() => onNavigate('business-community')} className="text-[9px] font-bold text-slate-600">عرض الكل</button></div>
            <div className="grid grid-cols-2 gap-2">
              {featuredBusinesses.map((business) => <button key={business.id} onClick={() => onNavigate('public-business-profile', business.slug)} className="min-w-0 rounded-[1.5rem] bg-white p-3 text-right shadow-[0_8px_24px_rgba(15,23,42,0.05)]"><BusinessLogo business={business} /><strong className="mt-3 block truncate text-[11px] text-slate-950">{business.name}</strong><span className="mt-1 block truncate text-[8px] text-slate-400">{business.category_name || 'نشاط تجاري'} · {business.city}</span></button>)}
            </div>
          </div>
        </section>
      </div>

      <div className="mt-3 flex items-center justify-between px-2 text-[9px] text-slate-400">
        <span>{page === 0 ? 'اسحب لعرض الأعمال' : 'اسحب للعودة إلى سند الآن'}</span>
        <button onClick={() => goToPage(page === 0 ? 1 : 0)} className="font-bold text-slate-700">{page === 0 ? 'الأعمال' : 'سند الآن'}</button>
      </div>
    </div>
  );
}
