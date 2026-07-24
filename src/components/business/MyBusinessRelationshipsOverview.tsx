import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Building2, ChevronLeft, Loader2, Settings2, ShieldCheck, Store } from 'lucide-react';
import {
  getBusinessMediaSignedUrl,
  getUserBusinessContexts,
  type BusinessContexts,
  type BusinessProfile
} from '../../lib/businessApi';
import CustomerBusinessRelationshipManager from './CustomerBusinessRelationshipManager';

interface Props {
  onNavigate: (page: string, token?: string) => void;
  mode?: 'summary' | 'page';
  onBack?: () => void;
}

type CustomerBusiness = BusinessProfile & {
  customer_id?: string | null;
  customer_status?: string | null;
  customer_source?: string | null;
  profile_image_path?: string | null;
};

const sourceLabels: Record<string, string> = {
  profile: 'الملف العام', public_profile: 'الملف العام', community: 'مجتمع الأعمال',
  qr: 'رمز QR', invite: 'دعوة', manual_request: 'طلب مباشر'
};

export default function MyBusinessRelationshipsOverview({ onNavigate, mode = 'summary', onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contexts, setContexts] = useState<BusinessContexts | null>(null);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<CustomerBusiness | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const value = await getUserBusinessContexts();
      const customerBusinesses = (value.customer_businesses || []) as CustomerBusiness[];
      const entries = await Promise.all(customerBusinesses.map(async (business) => {
        const path = business.profile_image_path || business.logo_path || '';
        return [business.id, path ? await getBusinessMediaSignedUrl(path).catch(() => '') : ''] as const;
      }));
      setContexts(value); setLogos(Object.fromEntries(entries));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر تحميل علاقاتك بالأنشطة.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const businesses = useMemo(
    () => ((contexts?.customer_businesses || []) as CustomerBusiness[]).filter((business) => business.customer_status === 'active'),
    [contexts]
  );

  if (selected) {
    return <CustomerBusinessRelationshipManager businessId={selected.id} businessName={selected.name} variant="page" onClose={() => setSelected(null)} onRelationshipEnded={() => { setSelected(null); void load(); }} />;
  }

  if (mode === 'summary') {
    if (loading) return <button type="button" disabled className="flex min-h-16 w-full items-center gap-3 rounded-[1.4rem] bg-white px-4 text-right shadow-sm"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Loader2 className="h-4 w-4 animate-spin" /></span><span className="text-xs text-slate-500">جاري تحميل علاقاتك التجارية...</span></button>;
    if (error || businesses.length === 0) return null;
    return (
      <button type="button" onClick={onBack} className="flex min-h-16 w-full items-center gap-3 rounded-[1.4rem] bg-white px-4 text-right shadow-[0_8px_24px_rgba(15,23,42,0.045)]" dir="rtl">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Building2 className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">الأنشطة التي أتعامل معها</span><span className="mt-0.5 block text-[10px] text-slate-500">إدارة {businesses.length} علاقة وتفضيلات التواصل</span></span>
        <ChevronLeft className="h-4 w-4 shrink-0 text-slate-300" />
      </button>
    );
  }

  return (
    <div className="space-y-4 pb-24 font-arabic text-right" dir="rtl">
      <header className="flex min-h-11 items-center gap-2">
        <button type="button" onClick={onBack} aria-label="رجوع" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-slate-100"><ArrowRight className="h-5 w-5" /></button>
        <div><h1 className="text-base font-bold text-slate-950">الأنشطة التي أتعامل معها</h1><p className="mt-1 text-[10px] text-slate-500">راجع علاقاتك وتفضيلات التواصل لكل نشاط.</p></div>
      </header>

      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      : error ? <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-xs text-rose-700"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-3 font-bold underline">إعادة المحاولة</button></div>
      : businesses.length === 0 ? <div className="rounded-[1.7rem] bg-white p-8 text-center shadow-sm"><Building2 className="mx-auto h-8 w-8 text-slate-300" /><h2 className="mt-3 text-sm font-bold">لا توجد علاقات نشطة</h2><p className="mt-1 text-xs leading-6 text-slate-500">عندما تتابع نشاطًا من مجتمع الأعمال سيظهر هنا.</p></div>
      : <section className="divide-y divide-slate-100 overflow-hidden rounded-[1.7rem] bg-white shadow-sm">
          {businesses.map((business) => (
            <article key={business.id} className="flex items-center gap-3 p-4">
              <button type="button" onClick={() => onNavigate('public-business-profile', business.slug)} className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100" aria-label={`فتح ملف ${business.name}`}>
                {logos[business.id] ? <img src={logos[business.id]} alt="" className="h-full w-full object-contain" /> : <Store className="h-5 w-5 text-slate-500" />}
              </button>
              <button type="button" onClick={() => onNavigate('public-business-profile', business.slug)} className="min-w-0 flex-1 text-right">
                <span className="flex items-center gap-1.5"><strong className="truncate text-xs text-slate-900">{business.name}</strong>{business.verification_status === 'verified' && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}</span>
                <span className="mt-1 block text-[9px] text-slate-400">مرتبط عبر {sourceLabels[business.customer_source || ''] || 'سند'} · {business.city}، {business.governorate}</span>
              </button>
              <button type="button" onClick={() => setSelected(business)} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[10px] font-bold text-slate-700"><Settings2 className="h-3.5 w-3.5" />إدارة</button>
            </article>
          ))}
        </section>}
    </div>
  );
}
