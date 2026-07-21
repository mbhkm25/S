import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import {
  getBusinessMediaSignedUrl,
  getPublicBusinesses,
  type PublicBusinessListItem
} from '../../lib/businessApi';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
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

type Category = { id: string; name_ar: string };

type CommunityBusiness = PublicBusinessListItem & {
  verification_status?: string | null;
  profile_image_path?: string | null;
  logo_path?: string | null;
};

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<CommunityBusiness[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [city, setCity] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const loadCategories = async () => {
    const { data } = await supabase
      .from('business_categories')
      .select('id, name_ar')
      .eq('status', 'active')
      .order('display_order');
    setCategories(Array.isArray(data) ? data : []);
  };

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

      const items = Array.isArray(data) ? data as CommunityBusiness[] : [];
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

  useEffect(() => {
    void loadCategories();
    void loadBusinesses();
  }, []);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadBusinesses({ search });
  };

  const selectCategory = (nextId: string) => {
    setCategoryId(nextId);
    void loadBusinesses({ categoryId: nextId || null });
  };

  const clearFilters = () => {
    setSearch('');
    setGovernorate('');
    setCity('');
    setCategoryId('');
    void loadBusinesses({ search: null, governorate: null, city: null, categoryId: null });
  };

  const selectedCategory = categories.find((category) => category.id === categoryId)?.name_ar || '';
  const activeFilters = [governorate, city, selectedCategory].filter(Boolean);
  const quickCategories = useMemo(() => categories.slice(0, 7), [categories]);

  return (
    <div className="min-h-screen bg-[#f7f8fa] pb-16 font-arabic text-right" dir="rtl">
      <header className="sticky top-0 z-40 bg-white/95 px-3 py-3 shadow-[0_1px_18px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <button
            onClick={() => window.history.length > 1 ? window.history.back() : onNavigate('home')}
            className="rounded-xl bg-slate-100 p-2.5 text-slate-700"
            aria-label="العودة"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold text-slate-950">مجتمع أعمال سند</h1>
            <p className="mt-0.5 text-[9px] text-slate-400">أنشطة عامة منشورة ببياناتها الفعلية</p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Building2 className="h-5 w-5" />
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-3 py-4">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
          <p className="text-[9px] font-bold text-emerald-300">دليل الأعمال العام</p>
          <h2 className="mt-2 text-xl font-bold">ابحث عمّا تحتاجه</h2>
          <p className="mt-2 max-w-md text-[10px] leading-6 text-white/60">نشاط، خدمة أو كتالوج؛ ثم استعرض الملف العام وتواصل مباشرة.</p>
          <form onSubmit={submitSearch} className="mt-4 flex gap-2 rounded-2xl bg-white p-2 shadow-lg">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث عن نشاط أو خدمة..."
                className="w-full rounded-xl bg-slate-50 py-3 pl-3 pr-9 text-xs text-slate-900 outline-none"
              />
            </div>
            <button type="submit" className="rounded-xl bg-slate-950 px-4 text-[10px] font-bold text-white">بحث</button>
          </form>
        </section>

        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button onClick={() => selectCategory('')} className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-bold ${!categoryId ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 shadow-sm'}`}>الكل</button>
          {quickCategories.map((category) => (
            <button key={category.id} onClick={() => selectCategory(category.id)} className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-bold ${categoryId === category.id ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
              {category.name_ar}
            </button>
          ))}
          <button onClick={() => setFiltersOpen((open) => !open)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-4 py-2 text-[10px] font-bold text-emerald-700">
            <Filter className="h-3.5 w-3.5" /> فلاتر
          </button>
        </div>

        {filtersOpen && (
          <section className="rounded-[1.75rem] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <div className="mb-4 flex items-center justify-between">
              <div><h3 className="text-xs font-bold text-slate-900">تصفية النتائج</h3><p className="mt-1 text-[9px] text-slate-400">حدّد الموقع أو الفئة</p></div>
              <button onClick={() => setFiltersOpen(false)} className="rounded-xl bg-slate-100 p-2" aria-label="إغلاق"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="text-[9px] font-bold text-slate-500">المحافظة</span>
                <span className="relative block">
                  <select value={governorate} onChange={(event) => setGovernorate(event.target.value)} className="w-full appearance-none rounded-xl bg-slate-50 p-3 text-xs outline-none">
                    <option value="">كل المحافظات</option>
                    {GOVERNORATES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                </span>
              </label>
              <label className="space-y-1"><span className="text-[9px] font-bold text-slate-500">المدينة</span><input value={city} onChange={(event) => setCity(event.target.value)} placeholder="مثال: المكلا" className="w-full rounded-xl bg-slate-50 p-3 text-xs outline-none" /></label>
              <label className="space-y-1">
                <span className="text-[9px] font-bold text-slate-500">الفئة</span>
                <span className="relative block">
                  <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="w-full appearance-none rounded-xl bg-slate-50 p-3 text-xs outline-none">
                    <option value="">كل الفئات</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name_ar}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                </span>
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => void loadBusinesses()} className="flex-1 rounded-xl bg-slate-950 py-3 text-[10px] font-bold text-white">تطبيق الفلاتر</button>
              <button onClick={clearFilters} className="rounded-xl bg-slate-100 px-4 text-[10px] font-bold text-slate-600">إعادة ضبط</button>
            </div>
          </section>
        )}

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2">{activeFilters.map((filter) => <span key={filter} className="rounded-full bg-white px-3 py-1.5 text-[9px] font-bold text-slate-500 shadow-sm">{filter}</span>)}</div>
        )}

        <div className="flex items-end justify-between px-1">
          <div><h2 className="text-sm font-bold text-slate-950">الأنشطة المنشورة</h2><p className="mt-1 text-[9px] text-slate-400">{loading ? 'جاري التحميل' : `${toLatinDigits(String(businesses.length))} نتيجة`}</p></div>
        </div>

        {loading ? (
          <div className="flex min-h-[35vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-700" /></div>
        ) : error ? (
          <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm"><p className="text-xs text-rose-600">{error}</p><button onClick={() => void loadBusinesses()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-[10px] font-bold"><RefreshCw className="h-4 w-4" /> إعادة المحاولة</button></div>
        ) : businesses.length === 0 ? (
          <div className="rounded-[2rem] bg-white p-10 text-center shadow-sm"><Store className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-3 text-xs font-bold">لا توجد نتائج مطابقة</h3><p className="mt-2 text-[9px] leading-5 text-slate-400">غيّر عبارة البحث أو أعد ضبط الفلاتر.</p></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {businesses.map((business) => {
              const location = [business.city, business.governorate].filter(Boolean).join('، ');
              return (
                <article key={business.id} className="overflow-hidden rounded-[1.8rem] bg-white shadow-[0_12px_34px_rgba(15,23,42,0.055)]">
                  <button onClick={() => onNavigate('public-business-profile', business.slug)} className="flex w-full items-start gap-4 p-4 text-right">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.35rem] bg-slate-100">
                      {logos[business.id] ? <img src={logos[business.id]} alt={business.name} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <Store className="h-6 w-6 text-slate-400" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5"><strong className="truncate text-sm text-slate-950">{business.name}</strong>{business.verification_status === 'verified' && <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-2 text-[9px] text-slate-400">
                        {business.category_name && <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600">{business.category_name}</span>}
                        {location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{location}</span>}
                      </span>
                      {business.description && <span className="mt-3 block line-clamp-2 text-[10px] leading-5 text-slate-500">{business.description}</span>}
                    </span>
                    <ArrowLeft className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
                  </button>
                  <div className="flex gap-2 px-4 pb-4">
                    <button onClick={() => onNavigate('public-business-profile', business.slug)} className="flex-1 rounded-xl bg-slate-950 py-3 text-[10px] font-bold text-white">استعراض الملف</button>
                    {business.whatsapp && (
                      <a href={`https://wa.me/${business.whatsapp}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-4 text-[10px] font-bold text-emerald-700">
                        <MessageCircle className="h-4 w-4" /> واتساب
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
