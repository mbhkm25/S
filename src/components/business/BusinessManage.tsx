import { useState, useEffect } from 'react';
import { getUserBusinessContexts, BusinessProfile } from '../../lib/businessApi';
import { 
  ArrowRight, Store, Settings, Users, FileText, Globe, 
  ShieldAlert, ShieldCheck, PlusCircle, Loader2, AlertCircle, RefreshCw,
  Edit3, BookOpen
} from 'lucide-react';

interface BusinessManageProps {
  onNavigate: (page: string, token?: string) => void;
}

export default function BusinessManage({ onNavigate }: BusinessManageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);

  const loadBusinessData = async () => {
    setLoading(true);
    setError(null);
    try {
      const contexts = await getUserBusinessContexts();
      if (contexts.owned_businesses && contexts.owned_businesses.length > 0) {
        setBusiness(contexts.owned_businesses[0]);
      } else if (contexts.team_businesses && contexts.team_businesses.length > 0) {
        // Fallback to managed team business if they don't own one but are part of a team
        setBusiness(contexts.team_businesses[0]);
      } else {
        setBusiness(null);
      }
    } catch (err: any) {
      setError(err.message || 'فشل في تحميل بيانات الأعمال الخاصة بك.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBusinessData();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full font-arabic">منشور</span>;
      case 'pending_review':
        return <span className="bg-amber-50 border border-amber-100 text-amber-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full font-arabic">تحت المراجعة</span>;
      case 'suspended':
        return <span className="bg-rose-50 border border-rose-100 text-rose-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full font-arabic">معلق</span>;
      default:
        return <span className="bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-bold px-2.5 py-0.5 rounded-full font-arabic">مسودة</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3 font-arabic">
        <Loader2 className="w-6 h-6 text-slate-800 animate-spin" />
        <span className="text-xs text-slate-500">جاري تحميل لوحة إدارة النشاط...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4 shadow-sm font-arabic text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-slate-900">حدث خطأ أثناء تحميل البيانات</h2>
          <p className="text-xs text-slate-500">{error}</p>
        </div>
        <button
          onClick={loadBusinessData}
          className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-black font-bold border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>إعادة المحاولة</span>
        </button>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/60 p-6 text-center space-y-5 font-arabic">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-50 text-slate-600 border border-slate-100">
          <Store className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-slate-900">ليس لديك أي نشاط تجاري مسجل</h2>
          <p className="text-[11px] text-slate-500 leading-relaxed px-4">
            سند للأعمال يتيح لك ربط فروع متجرك، ومشاركة الإشعارات المالية الموثقة مع عملائك مباشرة وتتبع صحتها.
          </p>
        </div>
        <button
          onClick={() => onNavigate('business-create')}
          className="w-full bg-[#111111] hover:bg-black text-white text-xs font-bold py-3 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <PlusCircle className="w-4 h-4" />
          <span>سجل نشاطك التجاري الآن</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 font-arabic" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button 
          onClick={() => onNavigate('profile')} 
          className="p-2 bg-white rounded-xl border border-slate-200/60 hover:bg-slate-50 transition-all"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-sm font-bold text-slate-900">إدارة النشاط التجاري</h1>
          <p className="text-[10px] text-slate-500">لوحة التحكم والتنسيق الخاص بمتجرك</p>
        </div>
      </div>

      {/* Business Status Card */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-950 text-white flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-950">{business.name}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-slate-400 font-normal">{business.city}، {business.governorate}</span>
              </div>
            </div>
          </div>
          <div>
            {getStatusBadge(business.public_status)}
          </div>
        </div>

        {/* Verification Status Banner */}
        <div className={`p-3 rounded-2xl flex items-center gap-3 border ${
          business.verification_status === 'verified'
            ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800'
            : 'bg-amber-50/50 border-amber-100 text-amber-800'
        }`}>
          {business.verification_status === 'verified' ? (
            <>
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="space-y-0.5 text-right">
                <p className="text-[10px] font-bold leading-tight font-arabic">حساب نشاطك موثق وشارة الثقة نشطة</p>
                <p className="text-[9px] text-slate-500 leading-normal font-arabic">جميع الإشعارات الصادرة عن هذا المتجر تحمل علامة صحة التحقق.</p>
              </div>
            </>
          ) : (
            <>
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="space-y-0.5 text-right">
                <p className="text-[10px] font-bold leading-tight font-arabic">الملف قيد المراجعة والتوثيق</p>
                <p className="text-[9px] text-slate-500 leading-normal font-arabic">إجراءات المراجعة جارية. يمكنك استخدام التطبيق لإرسال وتتبع العمليات.</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Admin Action Grid Links */}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Operations */}
        <button
          onClick={() => onNavigate('business-operations')}
          className="bg-white hover:bg-slate-50 border border-slate-200/60 p-4 rounded-3xl text-right space-y-2 transition-all flex flex-col justify-between shadow-xs"
        >
          <div className="w-8 h-8 rounded-xl bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-200/50">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 block font-arabic">العمليات المالية</h3>
            <span className="text-[9px] text-slate-400 font-arabic">متابعة الإشعارات والتحقق</span>
          </div>
        </button>

        {/* Team Members */}
        <button
          onClick={() => onNavigate('business-team')}
          className="bg-white hover:bg-slate-50 border border-slate-200/60 p-4 rounded-3xl text-right space-y-2 transition-all flex flex-col justify-between shadow-xs"
        >
          <div className="w-8 h-8 rounded-xl bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-200/50">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 block font-arabic">فريق العمل</h3>
            <span className="text-[9px] text-slate-400 font-arabic">إدارة الأعضاء والصلاحيات</span>
          </div>
        </button>

        {/* Edit Profile */}
        <button
          onClick={() => onNavigate('business-manage-profile')}
          className="bg-white hover:bg-slate-50 border border-slate-200/60 p-4 rounded-3xl text-right space-y-2 transition-all flex flex-col justify-between shadow-xs"
        >
          <div className="w-8 h-8 rounded-xl bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-200/50">
            <Edit3 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 block font-arabic">تحرير الملف</h3>
            <span className="text-[9px] text-slate-400 font-arabic">تحديث معلومات وتفاصيل المتجر</span>
          </div>
        </button>

        {/* Catalog */}
        <button
          onClick={() => onNavigate('business-manage-profile')}
          className="bg-white hover:bg-slate-50 border border-slate-200/60 p-4 rounded-3xl text-right space-y-2 transition-all flex flex-col justify-between shadow-xs"
        >
          <div className="w-8 h-8 rounded-xl bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-200/50">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 block font-arabic">كتالوج واتساب</h3>
            <span className="text-[9px] text-slate-400 font-arabic">اربط كتالوج واتساب بزنس بملف نشاطك</span>
          </div>
        </button>

        {/* Public Profile View */}
        <button
          onClick={() => onNavigate('public-business-profile', business.slug)}
          className="bg-white hover:bg-slate-50 border border-slate-200/60 p-4 rounded-3xl text-right space-y-2 transition-all flex flex-col justify-between shadow-xs"
        >
          <div className="w-8 h-8 rounded-xl bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-200/50">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 block font-arabic">الملف العام</h3>
            <span className="text-[9px] text-slate-400 font-arabic">عرض صفحة المتجر للعملاء</span>
          </div>
        </button>

        {/* View in Community if published */}
        <button
          disabled={business.public_status !== 'published'}
          onClick={() => onNavigate('business-community')}
          className="bg-white hover:bg-slate-50 border border-slate-200/60 p-4 rounded-3xl text-right space-y-2 transition-all flex flex-col justify-between shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div className="w-8 h-8 rounded-xl bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-200/50">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 block font-arabic">مجتمع الأعمال</h3>
            <span className="text-[9px] text-slate-400 font-arabic">استكشاف المتاجر المنشورة</span>
          </div>
        </button>
      </div>
    </div>
  );
}
