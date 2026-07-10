import { ElementType, useEffect, useState } from 'react';
import { getBusinessMediaSignedUrl, getUserBusinessContexts, BusinessProfile, BusinessContexts } from '../../lib/businessApi';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  BookOpen,
  CheckCircle2,
  Edit3,
  Eye,
  FileText,
  Globe,
  Image as ImageIcon,
  Loader2,
  MapPin,
  PlusCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Store,
  Users
} from 'lucide-react';

interface BusinessManageProps {
  onNavigate: (page: string, token?: string) => void;
}

type ActionItem = {
  title: string;
  description: string;
  icon: ElementType;
  onClick: () => void;
  disabled?: boolean;
  meta?: string;
};

export default function BusinessManage({ onNavigate }: BusinessManageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [businessContexts, setBusinessContexts] = useState<BusinessContexts | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [galleryCount, setGalleryCount] = useState(0);

  const loadBusinessData = async () => {
    setLoading(true);
    setError(null);
    try {
      const contexts = await getUserBusinessContexts();
        setBusinessContexts(contexts);
      const current = contexts.owned_businesses?.[0] || contexts.team_businesses?.[0] || null;
      setBusiness(current);

      if (!current) {
        setLogoUrl('');
        setCoverUrl('');
        setGalleryCount(0);
        return;
      }

      const logoPath = (current as any).profile_image_path || current.logo_path || (current as any).logo_url || '';
      const coverPath = (current as any).cover_image_path || '';
      const galleryPaths = Array.isArray((current as any).gallery_paths) ? (current as any).gallery_paths : [];

      const [resolvedLogo, resolvedCover] = await Promise.all([
        logoPath ? getBusinessMediaSignedUrl(logoPath) : Promise.resolve(''),
        coverPath ? getBusinessMediaSignedUrl(coverPath) : Promise.resolve('')
      ]);

      setLogoUrl(resolvedLogo);
      setCoverUrl(resolvedCover);
      setGalleryCount(galleryPaths.length);
    } catch (err: any) {
      setError(err.message || 'فشل في تحميل بيانات الأعمال الخاصة بك.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBusinessData();
  }, []);

  const statusLabel = (status?: string) => {
    switch (status) {
      case 'published':
        return { text: 'منشور', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
      case 'pending_review':
        return { text: 'تحت المراجعة', className: 'bg-amber-50 text-amber-700 border-amber-100' };
      case 'suspended':
        return { text: 'معلق', className: 'bg-rose-50 text-rose-700 border-rose-100' };
      default:
        return { text: 'مسودة', className: 'bg-slate-100 text-slate-600 border-slate-200' };
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
      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4 shadow-sm font-arabic text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-slate-900">حدث خطأ أثناء تحميل البيانات</h2>
          <p className="text-xs text-slate-500">{error}</p>
        </div>
        <button
          onClick={loadBusinessData}
          className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-black font-bold border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-lg transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>إعادة المحاولة</span>
        </button>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center space-y-5 font-arabic">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-slate-50 text-slate-600 border border-slate-100">
          <Store className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-slate-900">ليس لديك أي نشاط تجاري مسجل</h2>
          <p className="text-[11px] text-slate-500 leading-relaxed px-4">
            سجل نشاطك التجاري لربطه بعمليات التحقق، وإظهار ملف عام موثوق لعملائك.
          </p>
        </div>
        <button
          onClick={() => onNavigate('business-create')}
          className="w-full bg-[#111111] hover:bg-black text-white text-xs font-bold py-3 px-4 rounded-lg transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <PlusCircle className="w-4 h-4" />
          <span>سجل نشاطك التجاري الآن</span>
        </button>
      </div>
    );
  }

  const publicStatus = statusLabel(business.public_status);
  const isVerified = business.verification_status === 'verified';
  const hasCatalog = Boolean((business as any).whatsapp_catalog_url);
  const workspaceId = (business as any).workspace_id || null;
  const workspaceRole = (business as any).workspace_role || (businessContexts?.owned_businesses?.some((item) => item.id === business.id) ? 'owner' : 'team_member');
  const workspaceStatus = (business as any).workspace_status || (workspaceId ? 'active' : null);
  const location = [business.city, business.governorate].filter(Boolean).join('، ');
  const mediaReady = [Boolean(logoUrl), Boolean(coverUrl), galleryCount > 0].filter(Boolean).length;
  const customerCount = businessContexts?.customer_businesses?.length || 0;
  const customerSectionText = business.public_status === 'published'
    ? 'الملف العام منشور، ويمكن للعملاء تسجيل أنفسهم كعملاء مسجلين.'
    : 'الملف العام غير منشور بعد. انشر الملف أولاً حتى يتمكن العملاء من التسجيل.';

  const actions: ActionItem[] = [
    {
      title: 'العمليات المالية',
      description: 'متابعة الإشعارات المرتبطة بالنشاط والتحقق منها.',
      icon: FileText,
      onClick: () => onNavigate('business-operations')
    },
    {
      title: 'فريق العمل',
      description: 'إدارة الأعضاء والصلاحيات التشغيلية.',
      icon: Users,
      onClick: () => onNavigate('business-team')
    },
    {
      title: 'تحرير الملف',
      description: 'تحديث بيانات النشاط، الشعار، الغلاف ومعرض الصور.',
      icon: Edit3,
      onClick: () => onNavigate('business-manage-profile'),
      meta: `${mediaReady}/3 وسائط جاهزة`
    },
    {
      title: 'كتالوج واتساب',
      description: 'إضافة أو تعديل رابط كتالوج واتساب بزنس فقط.',
      icon: BookOpen,
      onClick: () => onNavigate('business-whatsapp-catalog'),
      meta: hasCatalog ? 'مرتبط' : 'غير مرتبط'
    },
    {
      title: 'الملف العام',
      description: 'معاينة الصفحة التي تظهر للعملاء والزوار.',
      icon: Eye,
      onClick: () => onNavigate('public-business-profile', business.slug)
    },
    {
      title: 'إدارة العملاء',
      description: 'عرض وإدارة قائمة العملاء المسجلين المرتبطين بالنشاط.',
      icon: Users,
      onClick: () => onNavigate('business-customers', business.id)
    },
    {
      title: 'مجتمع الأعمال',
      description: business.public_status === 'published' ? 'عرض النشاط ضمن الأنشطة المنشورة.' : 'يظهر بعد نشر الملف واعتماده.',
      icon: Globe,
      onClick: () => onNavigate('business-community'),
      disabled: business.public_status !== 'published'
    }
  ];

  return (
    <div className="space-y-4 font-arabic" dir="rtl">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate('profile')}
          className="p-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-all"
          aria-label="رجوع"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-950 leading-tight">إدارة النشاط التجاري</h1>
          <p className="text-[11px] text-slate-500">مركز التحكم بالهوية، الفريق، العمليات والظهور العام</p>
        </div>
      </div>

      <section className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="relative h-28 bg-slate-900">
          {coverUrl ? (
            <img src={coverUrl} alt="غلاف النشاط" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[linear-gradient(135deg,#111827,#0f766e,#475569)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-transparent to-transparent" />
          <span className={`absolute top-3 left-3 border text-[10px] font-bold px-2.5 py-1 rounded-full ${publicStatus.className}`}>
            {publicStatus.text}
          </span>
        </div>

        <div className="px-4 pt-4 pb-4 relative space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-end gap-3 min-w-0">
              <div className="w-16 h-16 rounded-lg bg-white p-1 border border-slate-200 shadow-sm shrink-0">
                {logoUrl ? (
                  <img src={logoUrl} alt="شعار النشاط" className="w-full h-full rounded-md object-cover" />
                ) : (
                  <div className="w-full h-full rounded-md bg-slate-950 text-white flex items-center justify-center text-xl font-bold">
                    {business.name.slice(0, 1)}
                  </div>
                )}
              </div>
              <div className="pb-1 min-w-0">
                <h2 className="text-base font-bold text-slate-950 truncate">{business.name}</h2>
                {location && (
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{location}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={`p-3 rounded-lg flex items-start gap-3 border ${
            isVerified
              ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
              : 'bg-amber-50 border-amber-100 text-amber-800'
          }`}>
            {isVerified ? (
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5 text-right">
              <p className="text-[11px] font-bold leading-tight">
                {isVerified ? 'النشاط موثق وشارة الثقة نشطة' : 'الملف يحتاج مراجعة أو اعتماد'}
              </p>
              <p className="text-[10px] text-slate-600 leading-normal">
                {isVerified
                  ? 'ستظهر هوية النشاط الموثقة في الملف العام ومجتمع الأعمال وواجهات العملاء.'
                  : 'أكمل الهوية والوسائط ثم تابع حالة النشر من هذه اللوحة.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <StatusTile label="الشعار" ready={Boolean(logoUrl)} />
            <StatusTile label="الغلاف" ready={Boolean(coverUrl)} />
            <StatusTile label="المعرض" ready={galleryCount > 0} value={galleryCount ? `${galleryCount}` : undefined} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-800 flex items-center justify-center shrink-0">
                <Briefcase className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-1 text-right">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-950">مساحة العمل التشغيلية</h3>
                  <span className={`text-[9px] rounded-full px-2 py-0.5 border ${
                    workspaceId ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                  }`}>
                    {workspaceId ? 'مربوطة' : 'بانتظار التحديث'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  هذه مساحة العمل الداخلية لإدارة العمليات والفريق والحسابات التشغيلية. الملف العام يبقى واجهة ثقة اختيارية للعملاء.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[9px] bg-white text-slate-600 border border-slate-200 rounded-full px-2 py-0.5">
                    الدور: {workspaceRole === 'owner' ? 'مالك' : 'عضو فريق'}
                  </span>
                  <span className="text-[9px] bg-white text-slate-600 border border-slate-200 rounded-full px-2 py-0.5">
                    الحالة: {workspaceStatus === 'active' ? 'نشطة' : 'غير مفعلة'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

        {/* Customer management moved to action cards */}

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {actions.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              onClick={item.onClick}
              disabled={item.disabled}
              className="bg-white hover:bg-slate-50 border border-slate-200 p-3 rounded-lg text-right transition-all shadow-sm disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-50 text-slate-800 flex items-center justify-center border border-slate-200 shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-slate-950">{item.title}</h3>
                    {item.meta && (
                      <span className="text-[9px] text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5 shrink-0">
                        {item.meta}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">{item.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </section>
    </div>
  );
}

function StatusTile({ label, ready, value }: { label: string; ready: boolean; value?: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center space-y-1">
      <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500">
        {ready ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        ) : (
          <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
        )}
        <span>{label}</span>
      </div>
      <p className={`text-xs font-bold ${ready ? 'text-slate-950' : 'text-slate-400'}`}>
        {value || (ready ? 'جاهز' : 'ناقص')}
      </p>
    </div>
  );
}
