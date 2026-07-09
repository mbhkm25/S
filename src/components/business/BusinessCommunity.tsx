import { useState, useEffect } from 'react';
import { getBusinessMediaSignedUrl, getPublicBusinesses, PublicBusinessListItem } from '../../lib/businessApi';
import { 
  ArrowRight, Search, Store, MapPin, PhoneCall, 
  MessageSquare, Loader2, AlertCircle, RefreshCw 
} from 'lucide-react';

interface BusinessCommunityProps {
  onNavigate: (page: string, token?: string) => void;
}

export default function BusinessCommunity({ onNavigate }: BusinessCommunityProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [businesses, setBusinesses] = useState<PublicBusinessListItem[]>([]);
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async (query = '') => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPublicBusinesses({ p_search: query || null });
      const items = Array.isArray(data) ? data : [];
      setBusinesses(items);
      const resolvedEntries = await Promise.all(
        items.map(async (item) => {
          const path = (item as any).profile_image_path || item.logo_url || '';
          if (!path) return [item.id, ''] as const;
          return [item.id, await getBusinessMediaSignedUrl(path)] as const;
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
    loadData();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData(searchQuery);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    loadData('');
  };

  const items = Array.isArray(businesses) ? businesses : [];

  return (
    <div className="space-y-5 font-arabic" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button 
          onClick={() => onNavigate('home')} 
          className="p-2 bg-white rounded-xl border border-slate-200/60 hover:bg-slate-50 transition-all"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-sm font-bold text-slate-900">مجتمع أعمال سند</h1>
          <p className="text-[10px] text-slate-500">استكشف الأنشطة والمؤسسات المالية الموثقة للتحقق الآمن</p>
        </div>
      </div>

      {/* Search Input Bar */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="ابحث عن اسم النشاط أو المنطقة..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-white border border-slate-200/80 rounded-xl py-3 pl-3 pr-9 focus:outline-none focus:border-slate-400 focus:bg-white transition-all text-right"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
        </div>
        <button
          type="submit"
          className="bg-[#111111] hover:bg-black text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm"
        >
          بحث
        </button>
        {searchQuery && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="bg-slate-100 border border-slate-200/60 text-slate-700 text-xs font-bold py-2.5 px-3 rounded-xl transition-all"
          >
            إلغاء
          </button>
        )}
      </form>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <Loader2 className="w-6 h-6 text-slate-800 animate-spin" />
          <span className="text-xs text-slate-500">جاري البحث في مجتمع الأعمال...</span>
        </div>
      ) : error ? (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4 shadow-sm text-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900">حدث خطأ أثناء تحميل البيانات</h2>
            <p className="text-xs text-slate-500">{error}</p>
          </div>
          <button
            onClick={() => loadData(searchQuery)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-black font-bold border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>إعادة المحاولة</span>
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-8 text-center space-y-3 shadow-sm">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 border border-slate-100 text-slate-400">
            <Store className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xs font-bold text-slate-900">لا توجد نتائج بحث مطابقة</h2>
            <p className="text-[10px] text-slate-400 leading-normal">
              حاول البحث بكلمة مفتاحية مختلفة أو استعراض القائمة كاملة.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {items.map((biz) => (
            <div 
              key={biz.id}
              className="bg-white border border-slate-200/60 p-4 rounded-3xl shadow-xs space-y-3 flex flex-col justify-between"
            >
              <div className="flex items-start justify-between gap-3 text-right">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-slate-950 text-white flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden border border-slate-100">
                    {logoUrls[biz.id] ? (
                      <img src={logoUrls[biz.id]} alt={`شعار ${biz.name}`} className="w-full h-full object-cover" />
                    ) : (
                      biz.name.slice(0, 1)
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-950 leading-snug">{biz.name}</h3>
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400">
                      <MapPin className="w-3 h-3 text-slate-300 shrink-0" />
                      <span>{biz.city}، {biz.governorate}</span>
                    </div>
                  </div>
                </div>
              </div>

              {biz.description && (
                <p className="text-[10px] text-slate-500 leading-relaxed text-right line-clamp-2 px-1">
                  {biz.description}
                </p>
              )}

              <div className="flex gap-2 pt-1 border-t border-slate-50">
                <button
                  onClick={() => onNavigate('public-business-profile', biz.slug)}
                  className="flex-1 bg-[#111111] hover:bg-black text-white text-[10px] font-bold py-2 rounded-xl transition-all shadow-xs"
                >
                  عرض الملف
                </button>
                {biz.whatsapp && (
                  <a
                    href={`https://wa.me/${biz.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-none bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 text-[10px] font-bold p-2 px-3 rounded-xl transition-all flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>واتساب</span>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
