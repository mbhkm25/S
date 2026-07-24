import { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronLeft, Loader2, Settings2, ShieldCheck, Store } from 'lucide-react';
import {
  getBusinessMediaSignedUrl,
  getUserBusinessContexts,
  type BusinessContexts,
  type BusinessProfile
} from '../../lib/businessApi';
import CustomerBusinessRelationshipManager from './CustomerBusinessRelationshipManager';

interface Props {
  onNavigate: (page: string, token?: string) => void;
}

type CustomerBusiness = BusinessProfile & {
  customer_id?: string | null;
  customer_status?: string | null;
  customer_source?: string | null;
  profile_image_path?: string | null;
};

const sourceLabels: Record<string, string> = {
  profile: 'الملف العام',
  public_profile: 'الملف العام',
  community: 'مجتمع الأعمال',
  qr: 'رمز QR',
  invite: 'دعوة',
  manual_request: 'طلب مباشر'
};

export default function MyBusinessRelationshipsOverview({ onNavigate }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contexts, setContexts] = useState<BusinessContexts | null>(null);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<CustomerBusiness | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const value = await getUserBusinessContexts();
      const customerBusinesses = (value.customer_businesses || []) as CustomerBusiness[];
      const entries = await Promise.all(customerBusinesses.map(async (business) => {
        const path = business.profile_image_path || business.logo_path || '';
        return [business.id, path ? await getBusinessMediaSignedUrl(path).catch(() => '') : ''] as const;
      }));
      setContexts(value);
      setLogos(Object.fromEntries(entries));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل علاقاتك بالأنشطة.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const businesses = useMemo(
    () => ((contexts?.customer_businesses || []) as CustomerBusiness[]).filter((business) => business.customer_status === 'active'),
    [contexts]
  );

  if (loading) {
    return (
      <section className="mt-5 rounded-[1.7rem] bg-white p-4 shadow-sm" dir="rtl">
        <div className="flex items-center gap-3 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />جاري تحميل الأنشطة التي تتعامل معها...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-5 rounded-[1.7rem] border border-rose-100 bg-rose-50 p-4 text-right text-xs text-rose-700" dir="rtl">
        <p>{error}</p>
        <button type="button" onClick={() => void load()} className="mt-3 font-bold underline">إعادة المحاولة</button>
      </section>
    );
  }

  if (businesses.length === 0) return null;

  return (
    <>
      <section className="mt-5 space-y-3 rounded-[1.7rem] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]" dir="rtl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold text-emerald-700">علاقاتك التجارية</p>
            <h2 className="mt-1 text-sm font-bold text-slate-950">الأنشطة التي أتعامل معها</h2>
            <p className="mt-1 text-[10px] leading-5 text-slate-500">راجع علاقتك وتفضيلات التواصل والبيانات المرتبطة بكل نشاط.</p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Building2 className="h-5 w-5" />
          </span>
        </div>

        <div className="divide-y divide-slate-100 border-y border-slate-100">
          {businesses.map((business) => (
            <article key={business.id} className="flex items-center gap-3 py-3">
              <button
                type="button"
                onClick={() => onNavigate('public-business-profile', business.slug)}
                className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100"
                aria-label={`فتح ملف ${business.name}`}
              >
                {logos[business.id] ? <img src={logos[business.id]} alt="" className="h-full w-full object-contain" /> : <Store className="h-5 w-5 text-slate-500" />}
              </button>
              <button type="button" onClick={() => onNavigate('public-business-profile', business.slug)} className="min-w-0 flex-1 text-right">
                <span className="flex items-center gap-1.5">
                  <strong className="truncate text-xs text-slate-900">{business.name}</strong>
                  {business.verification_status === 'verified' && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                </span>
                <span className="mt-1 block text-[9px] text-slate-400">
                  مرتبط عبر {sourceLabels[business.customer_source || ''] || 'سند'} · {business.city}، {business.governorate}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSelected(business)}
                className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[10px] font-bold text-slate-700"
              >
                <Settings2 className="h-3.5 w-3.5" />إدارة
              </button>
              <ChevronLeft className="hidden h-4 w-4 text-slate-300 sm:block" />
            </article>
          ))}
        </div>
      </section>

      {selected && (
        <CustomerBusinessRelationshipManager
          businessId={selected.id}
          businessName={selected.name}
          open
          onClose={() => setSelected(null)}
          onRelationshipEnded={() => {
            setSelected(null);
            void load();
          }}
        />
      )}
    </>
  );
}
