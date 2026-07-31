import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BookOpenCheck,
  BriefcaseBusiness,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  CreditCard,
  Landmark,
  Lock,
  LogOut,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  User,
  Users
} from 'lucide-react';
import type { Profile } from '../types';
import { supabase } from '../lib/supabase';
import { formatYemeniDisplay, toLatinDigits } from '../lib/digits';
import { getUserAvatarUrl } from '../lib/userAvatar';
import {
  getBusinessMediaSignedUrl,
  getUserBusinessContexts,
  type BusinessContexts
} from '../lib/businessApi';
import BusinessWorkspacesAccess from './business/BusinessWorkspacesAccess';

type Props = {
  user: { id: string; email?: string | null };
  profile: Profile;
  onLogout: () => Promise<void>;
  onNavigate: (page: string, token?: string) => void;
  openOperationsCenter: () => void;
  openRelationships: () => void;
};

type UsageData = {
  used?: number;
  limit?: number;
  plan?: { is_pro?: boolean; code?: string; name?: string } | string | null;
};

type CompactSection = 'account' | 'help' | 'relationships' | null;

function profilePath(section?: string): string {
  const base = import.meta.env.VITE_APP_BASE_PATH || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}profile${section ? `/${section}` : ''}`;
}

export default function ProfileOverviewV3({
  user,
  profile,
  onLogout,
  onNavigate,
  openOperationsCenter,
  openRelationships
}: Props) {
  const [contexts, setContexts] = useState<BusinessContexts | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [businessLogo, setBusinessLogo] = useState('');
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [openSection, setOpenSection] = useState<CompactSection>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [nextContexts, usageResult] = await Promise.all([
          getUserBusinessContexts(),
          supabase.rpc('get_my_operation_access_usage')
        ]);
        if (!active) return;
        setContexts(nextContexts);
        setUsage((usageResult.data || null) as UsageData | null);
        const owned = nextContexts.owned_businesses?.[0] as (BusinessContexts['owned_businesses'][number] & { profile_image_path?: string; logo_url?: string }) | undefined;
        const path = owned?.profile_image_path || owned?.logo_path || owned?.logo_url || '';
        if (path) {
          const signed = await getBusinessMediaSignedUrl(path);
          if (active) setBusinessLogo(signed);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [user.id]);

  const ownedBusiness = contexts?.owned_businesses?.[0];
  const isPhoneVerified = profile.phone_verification_status === 'verified';
  const isPro = Boolean(typeof usage?.plan === 'object' && (usage.plan?.is_pro || usage.plan?.code === 'sanad_pro')) || usage?.plan === 'sanad_pro';
  const planName = isPro
    ? (typeof usage?.plan === 'object' ? usage.plan?.name || 'سند Pro' : 'سند Pro')
    : 'الخطة المجانية';
  const used = Number(usage?.used || 0);
  const limit = Number(usage?.limit || 0);
  const remaining = limit > 0 && limit < 999999 ? Math.max(0, limit - used) : null;

  const membershipCount = useMemo(() => {
    const owned = contexts?.owned_businesses?.length || 0;
    const member = contexts?.memberships?.length || 0;
    return owned + member;
  }, [contexts]);

  const navigateProfileSection = (section: string) => {
    window.history.pushState({}, '', profilePath(section));
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggle = (section: Exclude<CompactSection, null>) => {
    setOpenSection((current) => current === section ? null : section);
  };

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await onLogout(); } finally { setLoggingOut(false); }
  };

  return (
    <div className="space-y-4 pb-5 font-arabic text-right" dir="rtl">
      <section className="flex items-center gap-3 rounded-[1.65rem] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
        <button type="button" onClick={() => navigateProfileSection('personal')} className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-slate-950 text-white ring-2 ring-white shadow-md" aria-label="تعديل الملف الشخصي">
          {profile.avatar_path ? <img src={getUserAvatarUrl(profile.avatar_path)} alt={profile.full_name || 'صورة المستخدم'} className="h-full w-full object-cover" /> : <User className="m-auto h-7 w-7" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="line-clamp-2 text-base font-bold text-slate-950">{profile.full_name || 'مستخدم سند'}</h1>
            {isPhoneVerified && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700"><ShieldCheck className="h-3 w-3" />موثّق</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500" dir="ltr">{formatYemeniDisplay(profile.phone) || user.email || 'لا يوجد رقم جوال'}</p>
          <button type="button" onClick={() => navigateProfileSection('personal')} className="mt-2 text-[11px] font-bold text-slate-600 underline underline-offset-4">تعديل بياناتي</button>
        </div>
      </section>

      <section aria-labelledby="my-work-title" className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-[10px] font-bold text-emerald-700">أعمالي</p>
            <h2 id="my-work-title" className="mt-0.5 text-base font-black text-slate-950">التشغيل والإدارة</h2>
          </div>
          {membershipCount > 0 && <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">{toLatinDigits(membershipCount)} نشاط</span>}
        </div>

        <BusinessWorkspacesAccess mode="profile" />

        {loading ? (
          <div className="h-28 animate-pulse rounded-[1.65rem] bg-white" />
        ) : ownedBusiness ? (
          <article className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.055)]">
            <div className="flex items-center gap-3 p-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 text-white">
                {businessLogo ? <img src={businessLogo} alt={`شعار ${ownedBusiness.name}`} className="h-full w-full object-cover" /> : <Store className="h-5 w-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-[9px] font-bold text-slate-400">إدارة النشاط</span>
                <strong className="mt-1 block truncate text-sm text-slate-950">{ownedBusiness.name}</strong>
                <span className="mt-1 block text-[10px] text-slate-500">الملف، الحسابات المالية، الفريق والإعدادات</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3">
              <button type="button" onClick={() => onNavigate('business-manage')} className="min-h-11 rounded-xl bg-slate-950 text-xs font-bold text-white">إدارة النشاط</button>
              {ownedBusiness.public_status === 'published' ? (
                <button type="button" onClick={() => onNavigate('public-business-profile', ownedBusiness.slug)} className="min-h-11 rounded-xl bg-slate-100 text-xs font-bold text-slate-700">عرض الملف العام</button>
              ) : (
                <button type="button" onClick={() => onNavigate('business-manage-profile')} className="min-h-11 rounded-xl bg-slate-100 text-xs font-bold text-slate-700">إكمال الملف</button>
              )}
            </div>
          </article>
        ) : (
          <button type="button" onClick={() => onNavigate('business-create')} className="flex w-full items-center gap-3 rounded-[1.65rem] bg-white p-4 text-right shadow-sm">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white"><Store className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-950">أنشئ نشاطك التجاري</strong><span className="mt-1 block text-[10px] text-slate-500">أنشئ ملفًا احترافيًا وابدأ تشغيل سند للأعمال.</span></span>
            <ChevronLeft className="h-5 w-5 text-slate-300" />
          </button>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3" aria-label="ملخص الحساب">
        <button type="button" onClick={() => navigateProfileSection('subscription')} className="rounded-[1.5rem] bg-slate-950 p-4 text-right text-white shadow-lg">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-emerald-300"><Sparkles className="h-4 w-4" /></span>
          <span className="mt-3 block text-[9px] font-bold text-emerald-300">الخطة الحالية</span>
          <strong className="mt-1 block text-sm">{planName}</strong>
          <span className="mt-2 block text-[9px] text-slate-300">{remaining === null ? 'إدارة الاشتراك' : `${toLatinDigits(remaining)} عملية متبقية`}</span>
        </button>
        <button type="button" onClick={() => navigateProfileSection('financial')} className="rounded-[1.5rem] border border-slate-200 bg-white p-4 text-right shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Landmark className="h-4 w-4" /></span>
          <span className="mt-3 block text-[9px] font-bold text-slate-400">الحسابات المالية</span>
          <strong className="mt-1 block text-sm text-slate-950">إدارة حساباتي</strong>
          <span className="mt-2 block text-[9px] text-slate-500">الحسابات والمحافظ المرتبطة</span>
        </button>
      </section>

      <section className="space-y-2" aria-labelledby="settings-title">
        <div className="px-1">
          <p className="text-[10px] font-bold text-sky-700">إعداداتي</p>
          <h2 id="settings-title" className="mt-0.5 text-base font-black text-slate-950">الحساب والمساعدة</h2>
        </div>

        <CompactDisclosure title="الحساب والأمان" subtitle="البيانات، الأمان، الإشعارات والاشتراك" icon={<Settings2 />} open={openSection === 'account'} onToggle={() => toggle('account')}>
          <CompactRow icon={<User />} title="البيانات الشخصية" onClick={() => navigateProfileSection('personal')} />
          <CompactRow icon={<Lock />} title="الأمان وتسجيل الدخول" onClick={() => navigateProfileSection('security')} />
          <CompactRow icon={<Bell />} title="الإشعارات" onClick={() => onNavigate('notifications')} />
          <CompactRow icon={<CreditCard />} title="الخطة والاشتراك" onClick={() => navigateProfileSection('subscription')} />
        </CompactDisclosure>

        <CompactDisclosure title="المساعدة والتعلم" subtitle="الدعم، دليل التشغيل ومعلومات سند" icon={<CircleHelp />} open={openSection === 'help'} onToggle={() => toggle('help')}>
          <CompactRow icon={<BookOpenCheck />} title="كيف أشغّل سند في نشاطي؟" onClick={openOperationsCenter} />
          <CompactRow icon={<CircleHelp />} title="الدعم والمساعدة" onClick={() => navigateProfileSection('support')} />
          <CompactRow icon={<ShieldCheck />} title="حول سند" onClick={() => navigateProfileSection('about')} />
        </CompactDisclosure>

        <CompactDisclosure title="الأنشطة المرتبطة" subtitle="الأنشطة التي أتعامل معها أو أنتمي إلى فريقها" icon={<Users />} open={openSection === 'relationships'} onToggle={() => toggle('relationships')}>
          <CompactRow icon={<BriefcaseBusiness />} title="عرض الأنشطة المرتبطة" onClick={openRelationships} />
        </CompactDisclosure>
      </section>

      <button type="button" disabled={loggingOut} onClick={() => void logout()} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-[1.35rem] bg-rose-50 text-sm font-bold text-rose-600 disabled:opacity-50">
        <LogOut className="h-5 w-5" />{loggingOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'}
      </button>
    </div>
  );
}

function CompactDisclosure({ title, subtitle, icon, open, onToggle, children }: { title: string; subtitle: string; icon: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-[72px] w-full items-center gap-3 px-4 text-right">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-950">{title}</strong><span className="mt-1 block truncate text-[10px] text-slate-500">{subtitle}</span></span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="space-y-1 border-t border-slate-100 p-2">{children}</div>}
    </section>
  );
}

function CompactRow({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-right hover:bg-slate-50 active:bg-slate-100">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-600 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <strong className="min-w-0 flex-1 text-xs text-slate-800">{title}</strong>
      <ChevronLeft className="h-4 w-4 text-slate-300" />
    </button>
  );
}
