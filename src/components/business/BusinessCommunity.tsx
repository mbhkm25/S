import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getBusinessMediaSignedUrl, getPublicBusinesses, PublicBusinessListItem } from '../../lib/businessApi';
import { 
  ArrowRight, 
  Search, 
  Store, 
  MapPin, 
  MessageSquare, 
  Loader2, 
  AlertCircle, 
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';

interface BusinessCommunityProps {
  onNavigate: (page: string, token?: string) => void;
}

const GOVERNORATES = [
  'صنعاء', 'عدن', 'حضرموت', 'تعز', 'إب', 'الحديدة', 'ذمار', 'شبوة', 
  'المهرة', 'مأرب', 'الجوف', 'صعدة', 'حجة', 'عمران', 'البيضاء', 
  'لحج', 'أبين', 'الضالع', 'ريمة', 'سقطرى', 'المحويت'
];

export default function BusinessCommunity({ onNavigate }: BusinessCommunityProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGov, setSelectedGov] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Load categories directly from database
  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('business_categories')
        .select('id, name_ar');
      if (!error && data) {
        setCategories(data);
      }
    } catch (e) {
      console.warn('Failed loading categories:', e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPublicBusinesses({
        p_search: searchQuery || null,
        p_governorate: selectedGov || null,
        p_city: selectedCity || null,
        p_category_id: selectedCategory || null
      });

      const items = Array.isArray(data) ? data : [];
      setBusinesses(items);

      // Resolve signed URLs for logos
      const resolvedEntries = await Promise.all(
        items.map(async (item) => {
          const path = (item as any).profile_image_path || (item as any).logo_path || item.logo_url || '';
          if (!path) return [item.id, ''] as const;
          const url = await getBusinessMediaSignedUrl(path);
          return [item.id, url] as const;
        })
      );
      setLogoUrls(Object.fromEntries(resolvedEntries));
    } catch (err: any) {
      console.error('[BusinessCommunity] Failed loading public businesses:', err);
      setError(err.message || 'فشل في تحميل مجتمع الأعمال.');
      setBusinesses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
    loadData();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedGov('');
    setSelectedCity('');
    setSelectedCategory('');
    setTimeout(() => {
      loadData();
    }, 50);
  };

  // Helper: Open / Closed Badge status
  const getCardOpenStatus = (hours: any) => {
    if (!hours || typeof hours !== 'object' || Object.keys(hours).length === 0) return null;
    const daysEn = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const now = new Date();
    const dayName = daysEn[now.getDay()];
    const todayHours = hours[dayName];
    if (!todayHours || todayHours.closed) return { open: false, text: 'مغلق' };
    const currentTimeStr = now.toTimeString().slice(0, 5);
    const { open, close } = todayHours;
    if (currentTimeStr >= open && currentTimeStr <= close) {
      return { open: true, text: 'مفتوح' };
    }
    return { open: false, text: 'مغلق' };
  };



  return (
    <div className="space-y-6 font-arabic bg-slate-50/40 min-h-screen pb-12 text-right" dir="rtl">
      {/* Header Panel */}
      <div className="flex items-center justify-between gap-4 p-4 bg-white/70 backdrop-blur-md border-b border-slate-200/50 sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <button 
            onClick={() => onNavigate('home')} 
            className="p-2 bg-white hover:bg-slate-100 rounded-xl border border-slate-200/60 transition-all text-slate-700"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-slate-900">مجتمع أعمال سند</h1>
            <p className="text-[10px] text-slate-400">استكشف الأنشطة والمؤسسات المالية والشركاء الموثقين</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 space-y-5">
        {/* Search & Advanced Filters Bar */}
        <form onSubmit={handleSearchSubmit} className="bg-white/80 backdrop-blur-md border border-slate-200/60 p-4 rounded-3xl shadow-xs space-y-3.5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="ابحث عن اسم النشاط، المنطقة، أو نوع الخدمة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl py-3 pl-3 pr-9 outline-none transition-all text-right"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
            </div>
            
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`p-3 border rounded-xl transition-all ${
                showFilters 
                  ? 'bg-slate-900 border-slate-900 text-white shadow-xs' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="تصفية متقدمة"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            <button
              type="submit"
              className="bg-slate-900 hover:bg-black text-white text-xs font-bold py-2.5 px-5 rounded-xl transition-all shadow-sm"
            >
              بحث
            </button>
          </div>

          {/* Collapsible Advanced Filters (Governorate, City, Category) */}
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3.5 border-t border-slate-100 animate-slide-down">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">المحافظة</label>
                <div className="relative">
                  <select
                    value={selectedGov}
                    onChange={(e) => setSelectedGov(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 pl-8 text-xs outline-none cursor-pointer appearance-none text-right focus:bg-white"
                  >
                    <option value="">كل المحافظات...</option>
                    {GOVERNORATES.map(gov => (
                      <option key={gov} value={gov}>{gov}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">المدينة / المديرية</label>
                <input
                  type="text"
                  placeholder="مثال: حدة، المنصورة..."
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs outline-none text-right focus:bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">تصنيف النشاط</label>
                <div className="relative">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 pl-8 text-xs outline-none cursor-pointer appearance-none text-right focus:bg-white"
                  >
                    <option value="">كل التصنيفات...</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name_ar}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>
              </div>

              <div className="md:col-span-3 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold py-1.5 px-4 rounded-xl transition-all"
                >
                  إعادة ضبط الفلاتر
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Businesses Directory List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="w-6 h-6 text-slate-800 animate-spin" />
            <span className="text-xs text-slate-500">جاري الاستعلام في دليل أعمال سند...</span>
          </div>
        ) : error ? (
          <div className="bg-white rounded-[2rem] border border-slate-200/60 p-6 space-y-4 shadow-sm text-center">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-slate-900">حدث خطأ أثناء تحميل البيانات</h2>
              <p className="text-xs text-slate-500">{error}</p>
            </div>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-black font-bold border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        ) : businesses.length === 0 ? (
          <div className="bg-white rounded-[2rem] border border-slate-200/60 p-12 text-center space-y-3 shadow-xs">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 text-slate-400 shadow-2xs">
              <Store className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xs font-bold text-slate-900">لا توجد نتائج بحث مطابقة حالياً</h2>
              <p className="text-[10px] text-slate-400 leading-normal max-w-sm mx-auto">
                حاول البحث بكلمة مفتاحية مختلفة أو تغيير فلاتر التصفية الجغرافية والتصنيفات.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {businesses.map((biz) => {
              const openStatus = getCardOpenStatus(biz.working_hours);

              const categoryName = biz.business_categories?.name_ar || biz.category_name || 'خدمات مالية وأعمال';

              return (
                <div 
                  key={biz.id}
                  className="bg-white/80 backdrop-blur-md border border-slate-200/60 p-4.5 rounded-[1.8rem] shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md hover:border-slate-300 transition-all duration-300 relative group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {/* Logo Frame */}
                      <div className="w-12 h-12 rounded-[1.2rem] bg-slate-950 text-white flex items-center justify-center font-bold text-base shrink-0 overflow-hidden border border-slate-150 shadow-2xs">
                        {logoUrls[biz.id] ? (
                          <img src={logoUrls[biz.id]} alt={`شعار ${biz.name}`} className="w-full h-full object-cover" />
                        ) : (
                          biz.name.slice(0, 1)
                        )}
                      </div>
                      
                      {/* Title & Metadata */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-xs font-bold text-slate-950 leading-snug group-hover:text-indigo-950 transition-colors">{biz.name}</h3>
                          {biz.verification_status === 'verified' && (
                            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" title="شريك موثق" />
                          )}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-slate-400 font-medium">
                          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">{categoryName}</span>
                          <span className="flex items-center gap-0.5">
                            <MapPin className="w-3 h-3 text-slate-350" />
                            <span>{biz.city}، {biz.governorate}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Open/Close status badge on card */}
                    <div className="flex flex-col items-end gap-1.5">
                      {openStatus && (
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full border ${
                          openStatus.open 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                            : 'bg-slate-100 text-slate-400 border-slate-200'
                        }`}>
                          {openStatus.text}
                        </span>
                      )}
                    </div>
                  </div>

                  {biz.description && (
                    <p className="text-[10px] text-slate-500 leading-relaxed text-right line-clamp-2 px-1">
                      {biz.description}
                    </p>
                  )}

                  {/* Actions buttons matching mockup pattern */}
                  <div className="flex gap-2 pt-2.5 border-t border-slate-100">
                    <button
                      onClick={() => onNavigate('public-business-profile', biz.slug)}
                      className="flex-1 bg-slate-900 hover:bg-black text-white text-[10px] font-bold py-2 rounded-xl transition-all shadow-xs"
                    >
                      عرض ملف العمل
                    </button>
                    {biz.whatsapp && (
                      <a
                        href={`https://wa.me/${biz.whatsapp}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-none bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 text-[10px] font-bold p-2 px-3.5 rounded-xl transition-all flex items-center gap-1"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>واتساب</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
