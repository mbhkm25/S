import { useState, useEffect } from 'react';
import { getPublicBusinessProfile, joinBusinessAsCustomer, PublicBusinessDetail } from '../../lib/businessApi';
import { 
  ArrowRight, Store, MapPin, MessageSquare, 
  Link2, UserCheck, Loader2, AlertCircle, RefreshCw, CheckCircle2 
} from 'lucide-react';

interface PublicBusinessProfileProps {
  slug: string;
  onNavigate: (page: string) => void;
}

export default function PublicBusinessProfile({ slug, onNavigate }: PublicBusinessProfileProps) {
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [profile, setProfile] = useState<PublicBusinessDetail | null>(null);
  const [linkedSuccess, setLinkedSuccess] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPublicBusinessProfile(slug);
      setProfile(data);
    } catch (err: any) {
      setError(err.message || 'فشل في تحميل الملف التجاري.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [slug]);

  const handleJoinAsCustomer = async () => {
    if (!profile) return;
    setLinking(true);
    setError(null);
    try {
      await joinBusinessAsCustomer(profile.id, 'profile');
      setLinkedSuccess(true);
    } catch (err: any) {
      setError(err.message || 'فشل الارتباط بالنشاط التجاري.');
    } finally {
      setLinking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3 font-arabic">
        <Loader2 className="w-6 h-6 text-slate-800 animate-spin" />
        <span className="text-xs text-slate-500">جاري تحميل ملف النشاط التجاري...</span>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4 shadow-sm font-arabic text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-slate-900">حدث خطأ أثناء تحميل الملف التجاري</h2>
          <p className="text-xs text-slate-500">{error || 'لم يتم العثور على الملف التجاري المطلوب.'}</p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-black font-bold border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>إعادة المحاولة</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 font-arabic" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button 
          onClick={() => onNavigate('business-community')} 
          className="p-2 bg-white rounded-xl border border-slate-200/60 hover:bg-slate-50 transition-all"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-sm font-bold text-slate-900">ملف النشاط التجاري</h1>
          <p className="text-[10px] text-slate-500">تفاصيل التحقق وشارات الثقة للمتجر</p>
        </div>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-slate-950 text-white flex items-center justify-center font-bold text-base shrink-0">
            {profile.name.slice(0, 1)}
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-950 leading-tight">{profile.name}</h2>
            <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
              <MapPin className="w-3 h-3 text-slate-300 shrink-0" />
              <span>{profile.city}، {profile.governorate}</span>
            </div>
          </div>
        </div>

        {profile.description && (
          <div className="space-y-1">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">حول النشاط</h3>
            <p className="text-xs text-slate-600 leading-relaxed text-right">
              {profile.description}
            </p>
          </div>
        )}

        {/* Info properties */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <div className="space-y-0.5">
            <span className="text-[9px] text-slate-400 block">التصنيف الرئيسي</span>
            <span className="text-xs font-bold text-slate-800">{profile.category_name || 'خدمات تجارية عامة'}</span>
          </div>
          <div className="space-y-0.5">
            <span className="text-[9px] text-slate-400 block">حالة التوثيق</span>
            <span className={`text-xs font-bold ${
              profile.verification_status === 'verified' ? 'text-emerald-600' : 'text-slate-500'
            }`}>
              {profile.verification_status === 'verified' ? 'حساب موثق' : 'حساب قيد المراجعة'}
            </span>
          </div>
        </div>

        {/* Join button */}
        {linkedSuccess ? (
          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-[10px] text-emerald-800 font-bold flex items-center gap-2 animate-fade-in justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>أنت الآن مرتبط كعميل لهذا النشاط التجاري لتسجيل المعاملات المتبادلة.</span>
          </div>
        ) : (
          <button
            onClick={handleJoinAsCustomer}
            disabled={linking}
            className="w-full bg-[#111111] hover:bg-black text-white text-xs font-bold py-3 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {linking ? (
              <Loader2 className="w-4.5 h-4.5 animate-spin" />
            ) : (
              <>
                <UserCheck className="w-4.5 h-4.5" />
                <span>الارتباط بالنشاط كعميل</span>
              </>
            )}
          </button>
        )}

        {/* WhatsApp communication */}
        {profile.whatsapp && (
          <a
            href={`https://wa.me/${profile.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <MessageSquare className="w-4 h-4 text-slate-400" />
            <span>تواصل عبر واتساب المتجر</span>
          </a>
        )}
      </div>
    </div>
  );
}
