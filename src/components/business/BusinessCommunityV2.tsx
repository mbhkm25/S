import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  getBusinessCommunityContext,
  getBusinessMediaSignedUrl,
  getPublicBusinesses,
  registerBusinessCommunityInterest,
  setBusinessDiscoveryPreference,
  type BusinessCommunityContext,
  type PublicBusinessListItem
} from '../../lib/businessApi';
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  Building2,
  CheckCircle2,
  ChevronDown,
  Filter,
  Loader2,
  MapPin,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  X
} from 'lucide-react';
import { toLatinDigits } from '../../lib/digits';

interface BusinessCommunityProps {
  onNavigate: (page: string, token?: string) => void;
}

type CommunityBusiness = PublicBusinessListItem;

const GOVERNORATES = [
  'صنعاء', 'عدن', 'حضرموت', 'تعز', 'إب', 'الحديدة', 'ذمار', 'شبوة',
  'المهرة', 'مأرب', 'الجوف', 'صعدة', 'حجة', 'عمران', 'البيضاء',
  'لحج', 'أبين', 'الضالع', 'ريمة', 'سقطرى', 'المحويت'
];

interface QueryFilters {
  search?: string | null;
  governorate?: string | null;
  city?: string | null;
  categoryId?: string | null;
}

export default function BusinessCommunityV2({ onNavigate }: BusinessCommunityProps) {
  const [context, setContext] = useState<BusinessCommunityContext | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<CommunityBusiness[]>([]);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [city, setCity] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [interestSaving, setInterestSaving] = useState(false);

  const loadBusinesses = async (overrides: QueryFilters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const resolved = {
        search: overrides.search !== undefined ? overrides.search : search,
        governorate: overrides.governorate !== undefined ? overrides.governorate : governorate,
        city: overrides.city !== undefined ? overrides.city : city,
        categoryId: overrides.categoryId !== undefined ? overrides.categoryId : categoryId
      };
      const data = await getPublicBusinesses({
        p_search: resolved.search?.trim() || null,
        p_governorate: resolved.governorate || null,
        p_city: resolved.city?.trim() || null,
        p_category_id: resolved.categoryId || null,
        p_limit: 50,
        p_offset: 0
      });
      const items = Array.isArray(data) ? data : [];
      setBusinesses(items);
      const entries = await Promise.all(items.map(async (item) => {
        const path = item.profile_image_path || item.logo_path || item.logo_url || '';
        return [item.id, path ? await getBusinessMediaSignedUrl(path).catch(() => '') : ''] as const;
      }));
      setLogos(Object.fromEntries(entries));
    } catch (caught) {
      setBusinesses([]);
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل مجتمع الأعمال.');
    } finally {
      setLoading(false);
    }
  };

  const initialize = async () => {
    setInitializing(true);
    setError(null);
    try {
      const nextContext = await getBusinessCommunityContext();
      setContext(nextContext);
      const initialGovernorate = nextContext.effective_governorate || '';
      setGovernorate(initialGovernorate);
      if (nextContext.phase === 'early_access' || nextContext.phase === 'public') {
        await loadBusinesses({ governorate: initialGovernorate || null });
      } else {
        setBusinesses([]);
      }
    } catch {
      setError('تعذر تحميل إعدادات مجتمع الأعمال.');
    } finally {
      setInitializing(false);
    }
  };

  useEffect(() => { void initialize(); }, []);

  const changeDiscoveryGovernorate = async (nextGovernorate: string) => {
    setGovernorate(nextGovernorate);
    setCity('');
    setFiltersOpen(false);
    try {
      await setBusinessDiscoveryPreference(nextGovernorate ? 'governorate' : 'all_yemen', nextGovernorate || null);
      await loadBusinesses({ governorate: nextGovernorate || null, city: null });
      const nextContext = await getBusinessCommunityContext();
      setContext(nextContext);
    } catch {
      setError('تعذر حفظ تفضيل المحافظة.');
    }
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadBusinesses({ search });
  };

  const selectCategory = (nextId: string) => {
    setCategoryId(nextId);
    void loadBusinesses({ categoryId: nextId || null });
  };

  const applyFilters = async () => {
    try {
      await setBusinessDiscoveryPreference(governorate ? 'governorate' : 'all_yemen', governorate || null);
      setFiltersOpen(false);
      await loadBusinesses();
      setContext(await getBusinessCommunityContext());
    } catch {
      setError('تعذر حفظ الفلاتر.');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setGovernorate('');
    setCity('');
    setCategoryId('');
    void changeDiscoveryGovernorate('');
  };

  const saveInterest = async () => {
    if (!context || context.has_launch_interest) return;
    setInterestSaving(true);
    setError(null);
    try {
      await registerBusinessCommunityInterest(context.profile_governorate);
      setContext({ ...context, has_launch_interest: true });
    } catch {
      setError('تعذر حفظ طلب الإشعار.');
    } finally {
      setInterestSaving(false);
    }
  };

  const selectedCategory = context?.visible_categories.find((category) => category.id === categoryId)?.name_ar || '';
  const activeFilters = [governorate || 'كل اليمن', city, selectedCategory].filter(Boolean);
  const quickCategories = useMemo(() => context?.visible_categories.slice(0, 7) || [], [context?.visible_categories]);
  const directoryOpen = context?.phase === 'early_access' || context?.phase === 'public';

  return (
    <div className="min-h-screen bg-[#f7f8fa] pb-16 font-arabic text-right" dir="rtl">
      <header className="sticky top-0 z-40 bg-white/95 px-3 py-3 shadow-[0_1px_18px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <button onClick={() => window.history.length > 1 ? window.history.back() : onNavigate('home')} className="rounded-xl bg-slate-100 p-2.5 text-slate-700" aria-label="العودة">
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold text-slate-950">مجتمع أعمال سند</h1>
            <p className="mt-0.5 text-[9px] text-slate-400">أنشطة عامة ببياناتها الفعلية</p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Building2 className="h-5 w-5" /></span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-3 py-4">
        {initializing ? (
          <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-500" /></div>
        ) : !context ? (
          <StatusPanel title="تعذر فتح المجتمع" body={error || 'حاول مرة أخرى.'} actionLabel="إعادة المحاولة" onAction={() => void initialize()} />
        ) : context.phase === 'prelaunch' ? (
          <section className="overflow-hidden rounded-[2.2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-[0_22px_55px_rgba(15,23,42,0.2)]">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-[9px] font-bold text-emerald-200"><Building2 className="h-3.5 w-3.5" />جارٍ تجهيز الدليل</span>
            <h2 className="mt-6 max-w-md text-2xl font-bold leading-[1.55]">{context.prelaunch_title}</h2>
            <p className="mt-3 max-w-lg text-xs leading-7 text-white/65">{context.prelaunch_body}</p>
            <div className="mt-7 grid gap-2 sm:grid-cols-2">
              {context.registration_open && <button onClick={() => onNavigate('business-create')} className="min-h-12 rounded-xl bg-emerald-400 px-4 text-xs font-bold text-slate-950">أضف نشاطك التجاري</button>}
              <button onClick={() => void saveInterest()} disabled={interestSaving || context.has_launch_interest} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-xs font-bold disabled:text-emerald-200">
                {interestSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : context.has_launch_interest ? <CheckCircle2 className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
                {context.has_launch_interest ? 'سنشعرك عند الإطلاق' : 'أشعرني عند الإطلاق'}
              </button>
            </div>
            {error && <p className="mt-4 rounded-xl bg-rose-400/10 p-3 text-[10px] text-rose-100">{error}</p>}
          </section>
        ) : context.phase === 'maintenance' ? (
          <StatusPanel title="مجتمع الأعمال قيد التحديث" body="نجري الآن تحسينات على الدليل. سيعود العرض فور اكتمالها." actionLabel="العودة للرئيسية" onAction={() => onNavigate('home')} />
        ) : directoryOpen && (
          <>
            <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[9px] font-bold text-emerald-300">{context.phase === 'early_access' ? 'وصول مبكر' : 'دليل الأعمال العام'}</p>
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-[9px] font-bold">{governorate || 'كل اليمن'}</span>
              </div>
              <h2 className="mt-2 text-xl font-bold">{context.phase === 'early_access' ? context.early_access_title : 'ابحث عمّا تحتاجه'}</h2>
              <p className="mt-2 max-w-md text-[10px] leading-6 text-white/60">{context.phase === 'early_access' ? context.early_access_body : 'نشاط، خدمة أو كتالوج؛ ثم استعرض الملف العام وتواصل مباشرة.'}</p>
              <form onSubmit={submitSearch} className="mt-4 flex gap-2 rounded-2xl bg-white p-2 shadow-lg">
                <div className="relative min-w-0 flex-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن نشاط أو خدمة..." className="w-full rounded-xl bg-slate-50 py-3 pl-3 pr-9 text-xs text-slate-900 outline-none" /></div>
                <button type="submit" className="rounded-xl bg-slate-950 px-4 text-[10px] font-bold text-white">بحث</button>
              </form>
            </section>

            <section className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3 shadow-sm">
              <div className="flex min-w-0 items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-emerald-600" /><div><p className="text-[9px] text-slate-400">نطاق العرض</p><p className="truncate text-xs font-bold text-slate-800">{governorate ? `محافظة ${governorate}` : 'كل اليمن'}</p></div></div>
              <div className="flex gap-2">{governorate && <button onClick={() => void changeDiscoveryGovernorate('')} className="rounded-xl bg-slate-100 px-3 py-2 text-[9px] font-bold text-slate-600">كل اليمن</button>}<button onClick={() => setFiltersOpen((open) => !open)} className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[9px] font-bold text-emerald-700"><Filter className="h-3.5 w-3.5" />تغيير</button></div>
            </section>

            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button onClick={() => selectCategory('')} className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-bold ${!categoryId ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 shadow-sm'}`}>الكل</button>
              {quickCategories.map((category) => <button key={category.id} onClick={() => selectCategory(category.id)} className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-bold ${categoryId === category.id ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 shadow-sm'}`}>{category.name_ar}</button>)}
            </div>

            {filtersOpen && <section className="rounded-[1.75rem] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
              <div className="mb-4 flex items-center justify-between"><div><h3 className="text-xs font-bold text-slate-900">تخصيص العرض</h3><p className="mt-1 text-[9px] text-slate-400">يُحفظ اختيارك للمرات القادمة</p></div><button onClick={() => setFiltersOpen(false)} className="rounded-xl bg-slate-100 p-2" aria-label="إغلاق"><X className="h-4 w-4" /></button></div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1"><span className="text-[9px] font-bold text-slate-500">المحافظة</span><span className="relative block"><select value={governorate} onChange={(event) => setGovernorate(event.target.value)} className="w-full appearance-none rounded-xl bg-slate-50 p-3 text-xs outline-none"><option value="">كل اليمن</option>{GOVERNORATES.map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" /></span></label>
                <label className="space-y-1"><span className="text-[9px] font-bold text-slate-500">المدينة</span><input value={city} onChange={(event) => setCity(event.target.value)} placeholder="مثال: المكلا" className="w-full rounded-xl bg-slate-50 p-3 text-xs outline-none" /></label>
                <label className="space-y-1"><span className="text-[9px] font-bold text-slate-500">الفئة</span><span className="relative block"><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="w-full appearance-none rounded-xl bg-slate-50 p-3 text-xs outline-none"><option value="">كل الفئات</option>{context.visible_categories.map((category) => <option key={category.id} value={category.id}>{category.name_ar}</option>)}</select><ChevronDown className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" /></span></label>
              </div>
              <div className="mt-4 flex gap-2"><button onClick={() => void applyFilters()} className="flex-1 rounded-xl bg-slate-950 py-3 text-[10px] font-bold text-white">حفظ وتطبيق</button><button onClick={clearFilters} className="rounded-xl bg-slate-100 px-4 text-[10px] font-bold text-slate-600">إعادة ضبط</button></div>
            </section>}

            <div className="flex flex-wrap gap-2">{activeFilters.map((filter) => <span key={filter} className="rounded-full bg-white px-3 py-1.5 text-[9px] font-bold text-slate-500 shadow-sm">{filter}</span>)}</div>
            <div className="flex items-end justify-between px-1"><div><h2 className="text-sm font-bold text-slate-950">الأنشطة المتاحة</h2><p className="mt-1 text-[9px] text-slate-400">{loading ? 'جاري التحميل' : `${toLatinDigits(String(businesses.length))} نتيجة`}</p></div></div>

            {loading ? <div className="flex min-h-[35vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-700" /></div>
              : error ? <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm"><p className="text-xs text-rose-600">{error}</p><button onClick={() => void loadBusinesses()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-[10px] font-bold"><RefreshCw className="h-4 w-4" />إعادة المحاولة</button></div>
              : businesses.length === 0 ? <div className="rounded-[2rem] bg-white p-10 text-center shadow-sm"><Store className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-3 text-xs font-bold">{governorate ? `لا توجد نتائج في ${governorate}` : 'لا توجد نتائج مطابقة'}</h3><p className="mt-2 text-[9px] leading-5 text-slate-400">لن نغيّر نطاقك تلقائيًا.</p>{governorate && <button onClick={() => void changeDiscoveryGovernorate('')} className="mt-4 rounded-xl bg-slate-950 px-5 py-3 text-[10px] font-bold text-white">استعرض كل اليمن</button>}</div>
              : <div className="grid gap-3 sm:grid-cols-2">{businesses.map((business) => {
                const location = [business.city, business.governorate].filter(Boolean).join('، ');
                return <article key={business.id} className="overflow-hidden rounded-[1.8rem] bg-white shadow-[0_12px_34px_rgba(15,23,42,0.055)]"><button onClick={() => onNavigate('public-business-profile', business.slug)} className="flex w-full items-start gap-4 p-4 text-right"><span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.35rem] bg-slate-100">{logos[business.id] ? <img src={logos[business.id]} alt={business.name} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <Store className="h-6 w-6 text-slate-400" />}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><strong className="truncate text-sm text-slate-950">{business.name}</strong>{business.verification_status === 'verified' && <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />}</span><span className="mt-2 flex flex-wrap items-center gap-2 text-[9px] text-slate-400">{business.category_name && <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600">{business.category_name}</span>}{location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{location}</span>}</span>{business.description && <span className="mt-3 block line-clamp-2 text-[10px] leading-5 text-slate-500">{business.description}</span>}</span><ArrowLeft className="mt-1 h-4 w-4 shrink-0 text-slate-300" /></button><div className="flex gap-2 px-4 pb-4"><button onClick={() => onNavigate('public-business-profile', business.slug)} className="flex-1 rounded-xl bg-slate-950 py-3 text-[10px] font-bold text-white">استعراض الملف</button>{business.whatsapp && <a href={`https://wa.me/${business.whatsapp}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-4 text-[10px] font-bold text-emerald-700"><MessageCircle className="h-4 w-4" />واتساب</a>}</div></article>;
              })}</div>}
          </>
        )}
      </main>
    </div>
  );
}

function StatusPanel({ title, body, actionLabel, onAction }: { title: string; body: string; actionLabel: string; onAction: () => void }) {
  return <section className="rounded-[2rem] bg-white p-8 text-center shadow-sm"><Building2 className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 text-base font-bold text-slate-900">{title}</h2><p className="mx-auto mt-2 max-w-md text-xs leading-7 text-slate-500">{body}</p><button onClick={onAction} className="mt-5 min-h-11 rounded-xl bg-slate-950 px-5 text-xs font-bold text-white">{actionLabel}</button></section>;
}
