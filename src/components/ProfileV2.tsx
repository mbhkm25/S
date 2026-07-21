import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Building2,
  Check,
  CheckCircle,
  ChevronLeft,
  Clipboard,
  Clock3,
  ExternalLink,
  Globe2,
  HelpCircle,
  Info,
  Landmark,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Power,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  User,
  Camera,
  ImagePlus
} from 'lucide-react';
import type { Profile } from '../types';
import { supabase } from '../lib/supabase';
import { formatYemeniDisplay, parseYemeniLocalPhone, toLatinDigits } from '../lib/digits';
import { isBasicProfileComplete, isValidYemenLocalPhone, normalizeYemenPhone } from '../lib/profileUtils';
import { isYemenGovernorate, YEMEN_GOVERNORATES } from '../constants/yemenGovernorates';
import ProUpgradeModal from './ProUpgradeModal';
import { BusinessCardSkeleton, SubscriptionCardSkeleton } from './Skeletons';
import {
  acceptBusinessInvitation,
  type BusinessContexts,
  getBusinessMediaSignedUrl,
  getUserBusinessContexts
} from '../lib/businessApi';
import PasskeyManagement from '../features/passkeys/PasskeyManagement';
import { getAppPublicInformation, type AppPublicInformation } from '../lib/appPublicInformation';
import { getUserAvatarUrl, removeUserAvatar, uploadUserAvatar } from '../lib/userAvatar';

interface ProfileProps {
  user: { id: string; email?: string | null };
  profile: Profile;
  onLogout: () => void;
  refreshProfile: () => Promise<Profile | null>;
  onNavigate: (page: string, token?: string) => void;
}

interface FinancialAccount {
  id: string;
  financial_entity: string;
  account_number: string;
  account_holder_name?: string | null;
  account_label?: string | null;
  is_default?: boolean | null;
}

interface UsageData {
  used?: number;
  limit?: number;
  expires_at?: string | null;
  plan?: { is_pro?: boolean; code?: string; name?: string } | string | null;
}

type ProfileSection = 'overview' | 'personal' | 'financial' | 'financial-add' | 'security' | 'support' | 'about';

const FINANCIAL_ENTITIES = [
  'العمقي موبايل', 'البسيري موبايل', 'محفظة بي كاش (B-Cash)', 'الكريمي سعودي',
  'الكريمي يمني', 'الكريمي حاسب', 'بن دول صرافة', 'بن دول باي',
  'أم فلوس (الكريمي)', 'عدن كاش', 'القطيبي', 'المحضار', 'جهة أخرى'
];

function sectionFromPath(): ProfileSection {
  const segment = window.location.pathname.split('/').filter(Boolean).pop();
  return segment === 'personal' || segment === 'financial' || segment === 'financial-add' ||
    segment === 'security' || segment === 'support' || segment === 'about'
    ? segment : 'overview';
}

function supportPhoneHref(value: string | null): string {
  return value ? `tel:${value.replace(/\s+/g, '')}` : '#';
}

function supportWhatsappHref(value: string | null): string {
  return value ? `https://wa.me/${value.replace(/\D/g, '')}` : '#';
}

export default function MyProfileV2({ user, profile, onLogout, refreshProfile, onNavigate }: ProfileProps) {
  const [section, setSection] = useState<ProfileSection>(sectionFromPath);
  const [fullName, setFullName] = useState(profile.full_name || '');
  const [localPhone, setLocalPhone] = useState(profile.phone ? parseYemeniLocalPhone(profile.phone) : '');
  const [governorate, setGovernorate] = useState(profile.governorate || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [financialEntity, setFinancialEntity] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountLabel, setAccountLabel] = useState('');
  const [addingAccount, setAddingAccount] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [accountSuccess, setAccountSuccess] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [showProUpgradeModal, setShowProUpgradeModal] = useState(false);
  const [businessContext, setBusinessContext] = useState<BusinessContexts | null>(null);
  const [loadingBusiness, setLoadingBusiness] = useState(true);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [businessLogoUrls, setBusinessLogoUrls] = useState<Record<string, string>>({});
  const [acceptingInvite, setAcceptingInvite] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [appInfo, setAppInfo] = useState<AppPublicInformation | null>(null);
  const generationRef = useRef(0);

  const navigateSection = (next: ProfileSection) => {
    const base = import.meta.env.VITE_APP_BASE_PATH || '/';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    const suffix = next === 'overview' ? 'profile' : `profile/${next}`;
    window.history.pushState({}, '', `${cleanBase}${suffix}`);
    setSection(next);
    setProfileError(null);
    setAccountError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadAccounts = async (generation = generationRef.current, userId = user.id) => {
    setLoadingAccounts(true);
    try {
      const { data, error } = await supabase
        .from('user_financial_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (generation === generationRef.current && userId === user.id) setAccounts((data || []) as FinancialAccount[]);
    } catch {
      if (generation === generationRef.current) setAccountError('تعذر تحميل الحسابات المالية. حاول مرة أخرى.');
    } finally {
      if (generation === generationRef.current) setLoadingAccounts(false);
    }
  };

  const loadUsage = async (generation = generationRef.current) => {
    setLoadingUsage(true);
    try {
      const { data, error } = await supabase.rpc('get_my_operation_access_usage');
      if (error) throw error;
      if (generation === generationRef.current) setUsage(data as UsageData);
    } catch {
      if (generation === generationRef.current) setUsage(null);
    } finally {
      if (generation === generationRef.current) setLoadingUsage(false);
    }
  };

  const loadBusinessContext = async (generation = generationRef.current) => {
    setLoadingBusiness(true);
    setBusinessError(null);
    try {
      const contexts = await getUserBusinessContexts();
      const logoEntries = await Promise.all((contexts.owned_businesses || []).map(async (business) => {
        const record = business as typeof business & { profile_image_path?: string; logo_url?: string };
        const path = record.profile_image_path || business.logo_path || record.logo_url || '';
        return [business.id, path ? await getBusinessMediaSignedUrl(path) : ''] as const;
      }));
      if (generation === generationRef.current) {
        setBusinessContext(contexts);
        setBusinessLogoUrls(Object.fromEntries(logoEntries));
      }
    } catch {
      if (generation === generationRef.current) setBusinessError('تعذر تحميل بيانات النشاط التجاري.');
    } finally {
      if (generation === generationRef.current) setLoadingBusiness(false);
    }
  };

  useEffect(() => {
    const generation = ++generationRef.current;
    setSection(sectionFromPath());
    setFullName(profile.full_name || '');
    setLocalPhone(profile.phone ? parseYemeniLocalPhone(profile.phone) : '');
    setGovernorate(profile.governorate || '');
    void loadAccounts(generation, user.id);
    void loadUsage(generation);
    void loadBusinessContext(generation);
    void getAppPublicInformation().then((data) => {
      if (generation === generationRef.current) setAppInfo(data);
    });
    const handlePopState = () => setSection(sectionFromPath());
    window.addEventListener('popstate', handlePopState);
    return () => {
      generationRef.current += 1;
      window.removeEventListener('popstate', handlePopState);
    };
  }, [user.id]);

  useEffect(() => {
    setFullName(profile.full_name || '');
    setLocalPhone(profile.phone ? parseYemeniLocalPhone(profile.phone) : '');
    setGovernorate(profile.governorate || '');
  }, [profile.full_name, profile.phone, profile.governorate]);

  const profileDirty = fullName.trim() !== (profile.full_name || '').trim() ||
    localPhone !== parseYemeniLocalPhone(profile.phone || '') || governorate !== (profile.governorate || '');
  const completedFields = [profile.full_name?.trim(), profile.phone, profile.governorate].filter(Boolean).length;
  const completionPercent = Math.round((completedFields / 3) * 100);
  const isPro = Boolean(typeof usage?.plan === 'object' && usage.plan?.is_pro) ||
    (typeof usage?.plan === 'object' && usage.plan?.code === 'sanad_pro') || usage?.plan === 'sanad_pro';
  const used = Number(usage?.used || 0);
  const limit = Number(usage?.limit || 0);
  const usagePercent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    const name = fullName.trim();
    if (!name) return setProfileError('الاسم الكامل مطلوب.');
    if (!localPhone) return setProfileError('يرجى إدخال رقم الجوال.');
    if (!isValidYemenLocalPhone(localPhone)) return setProfileError('رقم الجوال يجب أن يتكون من 9 أرقام ويبدأ بالرقم 7.');
    if (!isYemenGovernorate(governorate)) return setProfileError('يرجى اختيار المحافظة.');
    setSavingProfile(true);
    try {
      const { error } = await supabase.rpc('upsert_my_basic_profile', {
        p_full_name: name,
        p_phone: normalizeYemenPhone(localPhone),
        p_governorate: governorate
      });
      if (error) throw error;
      const refreshed = await refreshProfile();
      if (refreshed) setProfileSuccess('تم حفظ التغييرات.');
    } catch {
      setProfileError('تعذر حفظ البيانات الآن. تحقق من الاتصال وحاول مرة أخرى.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || savingAvatar) return;
    setProfileError(null);
    setProfileSuccess(null);
    setSavingAvatar(true);
    let newPath = '';
    try {
      newPath = await uploadUserAvatar(user.id, file);
      const previousPath = profile.avatar_path;
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_path: newPath, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      if (previousPath) await removeUserAvatar(previousPath).catch(() => undefined);
      setProfileSuccess('تم تحديث صورة البروفايل.');
    } catch (error) {
      if (newPath) await removeUserAvatar(newPath).catch(() => undefined);
      const message = error instanceof Error && error.message === 'avatar_too_large'
        ? 'حجم الصورة يجب ألا يتجاوز 5 ميجابايت.'
        : 'تعذر رفع صورة البروفايل الآن.';
      setProfileError(message);
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!profile.avatar_path || savingAvatar || !window.confirm('هل تريد حذف صورة البروفايل؟')) return;
    setSavingAvatar(true);
    setProfileError(null);
    try {
      const previousPath = profile.avatar_path;
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_path: null, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      await removeUserAvatar(previousPath).catch(() => undefined);
      setProfileSuccess('تم حذف صورة البروفايل.');
    } catch {
      setProfileError('تعذر حذف صورة البروفايل الآن.');
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleAddAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setAccountError(null);
    setAccountSuccess(null);
    const cleanNumber = toLatinDigits(accountNumber).replace(/\s+/g, '');
    if (!financialEntity) return setAccountError('يرجى اختيار الجهة المالية.');
    if (!cleanNumber) return setAccountError('رقم الحساب أو المحفظة مطلوب.');
    if (accounts.some((account) => account.financial_entity === financialEntity && account.account_number === cleanNumber)) return setAccountError('هذا الحساب مضاف مسبقًا.');
    setAddingAccount(true);
    try {
      const { error } = await supabase.from('user_financial_accounts').insert({
        user_id: user.id,
        financial_entity: financialEntity,
        account_number: cleanNumber,
        account_holder_name: accountHolderName.trim() || null,
        account_label: accountLabel.trim() || null,
        status: 'active',
        metadata: {}
      });
      if (error) throw error;
      setFinancialEntity('');
      setAccountNumber('');
      setAccountHolderName('');
      setAccountLabel('');
      setAccountSuccess('تمت إضافة الحساب المالي.');
      await loadAccounts();
      navigateSection('financial');
    } catch {
      setAccountError('تعذر إضافة الحساب. تحقق من البيانات وحاول مرة أخرى.');
    } finally {
      setAddingAccount(false);
    }
  };

  const handleDisableAccount = async (accountId: string) => {
    if (deletingAccountId || !window.confirm('هل تريد حذف هذا الحساب المالي؟')) return;
    setDeletingAccountId(accountId);
    try {
      const { error } = await supabase.from('user_financial_accounts').update({ status: 'inactive' }).eq('id', accountId).eq('user_id', user.id);
      if (error) throw error;
      await loadAccounts();
    } catch {
      setAccountError('تعذر حذف الحساب الآن.');
    } finally {
      setDeletingAccountId(null);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await onLogout(); } finally { setLoggingOut(false); }
  };

  const handleCopy = async (account: FinancialAccount) => {
    await navigator.clipboard.writeText(account.account_number);
    setCopiedId(account.id);
    window.setTimeout(() => setCopiedId(null), 1500);
  };

  const handleAcceptInvite = async (token: string) => {
    if (acceptingInvite) return;
    setAcceptingInvite(token);
    try {
      await acceptBusinessInvitation(token);
      await loadBusinessContext();
    } catch {
      setBusinessError('تعذر قبول الدعوة الآن.');
    } finally {
      setAcceptingInvite(null);
    }
  };

  const SubpageHeader = ({ title, back = 'overview' }: { title: string; back?: ProfileSection }) => (
    <div className="flex min-h-11 items-center gap-2">
      <button type="button" onClick={() => navigateSection(back)} aria-label="رجوع" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-slate-100">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h2 className="text-base font-bold text-slate-950">{title}</h2>
    </div>
  );

  const renderOverview = () => {
    const ownedBusiness = businessContext?.owned_businesses?.[0];
    return (
      <div className="space-y-5">
        <div className="flex min-h-[96px] items-center justify-between gap-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => navigateSection('personal')} className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 text-white ring-2 ring-white shadow-md" aria-label="تعديل صورة البروفايل">{profile.avatar_path ? <img src={getUserAvatarUrl(profile.avatar_path)} alt={profile.full_name || 'صورة المستخدم'} className="h-full w-full object-cover" /> : <User className="h-7 w-7" />}</button>
            <div className="min-w-0">
              <h1 className="line-clamp-2 text-base font-bold leading-snug text-slate-950">{profile.full_name || 'مستخدم سند'}</h1>
              <p className="mt-1 text-xs text-slate-500" dir="ltr">{formatYemeniDisplay(profile.phone) || user.email || 'لا يوجد رقم جوال'}</p>
              <button type="button" onClick={() => navigateSection('personal')} className="mt-1 text-[11px] text-slate-600 underline underline-offset-4">اكتمال الملف {toLatinDigits(completionPercent)}%</button>
            </div>
          </div>
          <button type="button" onClick={() => navigateSection('personal')} className="h-11 shrink-0 rounded-xl bg-slate-100 px-3 text-xs font-bold">تعديل الملف</button>
        </div>

        {!isBasicProfileComplete(profile, user.email) && (
          <button type="button" onClick={() => navigateSection('personal')} className="flex min-h-11 w-full items-center justify-between rounded-xl bg-amber-50 px-3 text-right text-xs font-bold text-amber-900">
            <span>أكمل بيانات حسابك</span><ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {loadingBusiness ? <BusinessCardSkeleton /> : businessError ? (
          <div className="flex gap-2 rounded-2xl bg-rose-50 p-4 text-xs text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{businessError}</div>
        ) : ownedBusiness ? (
          <section className="space-y-3 rounded-[1.7rem] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-950 text-white">
                {businessLogoUrls[ownedBusiness.id] ? <img src={businessLogoUrls[ownedBusiness.id]} alt={`شعار ${ownedBusiness.name}`} className="h-full w-full object-cover" /> : <Store className="h-5 w-5" />}
              </div>
              <div className="min-w-0"><p className="text-[10px] text-slate-400">نشاطي التجاري</p><h2 className="truncate text-sm font-bold text-slate-950">{ownedBusiness.name}</h2><p className="mt-1 text-[11px] text-slate-500">{ownedBusiness.public_status === 'published' ? 'نشط ومنشور' : ownedBusiness.public_status === 'pending_review' ? 'قيد المراجعة' : 'قيد الإعداد'}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onNavigate('business-manage')} className="min-h-11 rounded-xl bg-slate-950 text-xs font-bold text-white">إدارة النشاط</button>
              {ownedBusiness.public_status === 'published' && <button type="button" onClick={() => onNavigate('public-business-profile', ownedBusiness.slug)} className="min-h-11 rounded-xl bg-slate-100 text-xs font-bold">عرض الملف العام</button>}
            </div>
          </section>
        ) : (
          <section className="flex items-center justify-between gap-3 rounded-[1.7rem] bg-white p-4 shadow-sm"><div><h2 className="text-sm font-bold">أنشئ نشاطك التجاري</h2><p className="mt-1 text-[11px] text-slate-500">أنشئ ملفًا احترافيًا لنشاطك وابدأ الوصول إلى العملاء.</p></div><button type="button" onClick={() => onNavigate('business-create')} className="min-h-11 shrink-0 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white">إنشاء نشاط</button></section>
        )}

        {(businessContext?.pending_invitations?.length || 0) > 0 && (
          <div className="space-y-2">{businessContext!.pending_invitations.map((invite) => <div key={invite.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3 shadow-sm"><div><p className="text-xs font-bold">دعوة من {invite.business_name || 'نشاط تجاري'}</p><p className="mt-1 text-[10px] text-slate-500">للانضمام إلى فريق النشاط</p></div><button type="button" disabled={Boolean(acceptingInvite)} onClick={() => handleAcceptInvite(invite.token)} className="min-h-11 rounded-xl bg-amber-600 px-3 text-xs font-bold text-white disabled:opacity-50">{acceptingInvite === invite.token ? <Loader2 className="h-4 w-4 animate-spin" /> : 'قبول'}</button></div>)}</div>
        )}

        {loadingUsage ? <SubscriptionCardSkeleton /> : usage && (
          <section className="space-y-3 rounded-[1.7rem] bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] text-slate-400">خطتك الحالية</p><h2 className="mt-1 text-sm font-bold">{isPro ? (typeof usage.plan === 'object' ? usage.plan?.name || 'سند Pro' : 'سند Pro') : 'الخطة المجانية'}</h2></div><span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${isPro ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{isPro ? 'فعال' : 'مجاني'}</span></div>
            {limit > 0 && <><div className="flex justify-between text-[11px] text-slate-500"><span>الاستخدام الشهري</span><span>{toLatinDigits(used)} من {limit >= 999999 ? 'غير محدود' : toLatinDigits(limit)} عملية</span></div>{limit < 999999 && <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900" style={{ width: `${usagePercent}%` }} /></div>}</>}
            {!isPro && <button type="button" onClick={() => setShowProUpgradeModal(true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-xs font-bold text-white"><Sparkles className="h-4 w-4" />الترقية إلى سند Pro</button>}
          </section>
        )}

        <SettingsGroup title="الحساب والهوية">
          <SettingsRow icon={<User />} title="البيانات الشخصية" subtitle={`${profile.full_name || 'الاسم غير مكتمل'}${profile.governorate ? ` • ${profile.governorate}` : ''}`} onClick={() => navigateSection('personal')} />
          <SettingsRow icon={<Landmark />} title="الحسابات المالية" subtitle={loadingAccounts ? 'جاري التحميل' : accounts.length ? `${toLatinDigits(accounts.length)} حساب مرتبط` : 'لا توجد حسابات مرتبطة'} onClick={() => navigateSection('financial')} />
          <SettingsRow icon={<Lock />} title="الأمان وتسجيل الدخول" subtitle="البريد والبصمة والجلسة" onClick={() => navigateSection('security')} />
        </SettingsGroup>

        <SettingsGroup title="التواصل والمعلومات">
          <SettingsRow icon={<Bell />} title="الإشعارات" subtitle="المالية، الأعمال، الأمان والتحديثات" onClick={() => onNavigate('notifications')} />
          <SettingsRow icon={<HelpCircle />} title="الدعم والمساعدة" subtitle="واتساب، اتصال، بريد ومواعيد الدعم" onClick={() => navigateSection('support')} />
          <SettingsRow icon={<Info />} title="حول سند" subtitle="سند المالي، سند التجاري ورؤية المنصة" onClick={() => navigateSection('about')} />
        </SettingsGroup>

        <button type="button" disabled={loggingOut} onClick={handleLogout} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-[1.4rem] bg-rose-50 text-sm font-bold text-rose-600 disabled:opacity-50">
          <Power className="h-5 w-5" />{loggingOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'}
        </button>
      </div>
    );
  };

  const renderPersonal = () => (
    <div className="space-y-4 pb-24"><SubpageHeader title="البيانات الشخصية" />
      <section className="flex items-center gap-4 rounded-[1.7rem] bg-white p-4 shadow-sm">
        <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={savingAvatar} className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 text-white disabled:opacity-60">
          {profile.avatar_path ? <img src={getUserAvatarUrl(profile.avatar_path)} alt={profile.full_name || 'صورة المستخدم'} className="h-full w-full object-cover" /> : <ImagePlus className="h-7 w-7" />}
          <span className="absolute bottom-1 left-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-800 shadow"><Camera className="h-3.5 w-3.5" /></span>
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold">صورة البروفايل</h3>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">اختيارية ولا تؤثر على اكتمال الحساب أو استخدام مزايا سند.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={savingAvatar} onClick={() => avatarInputRef.current?.click()} className="rounded-lg bg-slate-100 px-3 py-2 text-[10px] font-bold">{savingAvatar ? 'جاري الحفظ...' : profile.avatar_path ? 'استبدال' : 'إضافة صورة'}</button>
            {profile.avatar_path && <button type="button" disabled={savingAvatar} onClick={handleRemoveAvatar} className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-600">حذف</button>}
          </div>
        </div>
        <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleAvatarChange} />
      </section>
      <form id="personal-data-form" onSubmit={handleSaveProfile} className="space-y-4 rounded-[1.7rem] bg-white p-4 shadow-sm">{profileError && <Message tone="error">{profileError}</Message>}{profileSuccess && <Message tone="success">{profileSuccess}</Message>}<Field label="الاسم الكامل"><input value={fullName} onChange={(event) => { setFullName(event.target.value); setProfileError(null); }} className="profile-input" required /></Field><Field label="رقم الجوال"><div className="flex overflow-hidden rounded-xl bg-slate-50 focus-within:ring-2 focus-within:ring-slate-500"><input value={localPhone} inputMode="numeric" dir="ltr" onChange={(event) => { setLocalPhone(parseYemeniLocalPhone(event.target.value).slice(0, 9)); setProfileError(null); }} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-left outline-none" required /><span dir="ltr" className="bg-slate-100 px-3 py-3 text-sm">+967</span></div></Field><Field label="المحافظة"><div className="relative"><select value={governorate} onChange={(event) => { setGovernorate(event.target.value); setProfileError(null); }} className="profile-input appearance-none" required><option value="">اختر المحافظة</option>{YEMEN_GOVERNORATES.map((item) => <option key={item}>{item}</option>)}</select><MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /></div></Field></form>{profileDirty && <div className="fixed bottom-[calc(4.8rem+env(safe-area-inset-bottom))] left-0 right-0 z-30 px-4"><div className="mx-auto max-w-2xl"><button form="personal-data-form" type="submit" disabled={savingProfile} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-bold text-white shadow-lg disabled:opacity-60">{savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}حفظ التغييرات</button></div></div>}</div>
  );

  const renderFinancial = () => (
    <div className="space-y-4"><SubpageHeader title="الحسابات المالية" /><div className="flex items-center justify-between"><p className="text-xs text-slate-500">{loadingAccounts ? 'جاري التحميل' : `${toLatinDigits(accounts.length)} حساب مرتبط`}</p><button type="button" onClick={() => navigateSection('financial-add')} className="flex min-h-11 items-center gap-1 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white"><Plus className="h-4 w-4" />إضافة حساب مالي</button></div>{accountError && <Message tone="error">{accountError}</Message>}{accountSuccess && <Message tone="success">{accountSuccess}</Message>}{loadingAccounts ? <div className="space-y-2 animate-pulse"><div className="h-20 rounded-2xl bg-white" /><div className="h-20 rounded-2xl bg-white" /></div> : accounts.length === 0 ? <div className="rounded-[1.7rem] bg-white p-8 text-center shadow-sm"><Landmark className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-bold">لا توجد حسابات مالية</p><p className="mt-1 text-xs text-slate-500">أضف حسابًا لتسهيل تنظيم معاملاتك.</p></div> : <div className="space-y-2">{accounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-3 rounded-[1.5rem] bg-white p-4 shadow-sm"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{account.financial_entity}</h3>{account.account_label && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[9px]">{account.account_label}</span>}</div><div className="mt-1 flex items-center gap-1"><span dir="ltr" className="text-xs text-slate-500">{account.account_number}</span><button type="button" onClick={() => handleCopy(account)} className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-slate-100">{copiedId === account.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Clipboard className="h-4 w-4 text-slate-400" />}</button></div></div><button type="button" disabled={Boolean(deletingAccountId)} onClick={() => handleDisableAccount(account.id)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600">{deletingAccountId === account.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button></div>)}</div>}</div>
  );

  const renderAddAccount = () => (
    <div className="space-y-4 pb-4"><SubpageHeader title="إضافة حساب مالي" back="financial" /><form onSubmit={handleAddAccount} className="space-y-4 rounded-[1.7rem] bg-white p-4 shadow-sm">{accountError && <Message tone="error">{accountError}</Message>}<Field label="الجهة المالية"><select value={financialEntity} onChange={(event) => setFinancialEntity(event.target.value)} className="profile-input" required><option value="">اختر المحفظة أو البنك</option>{FINANCIAL_ENTITIES.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="رقم الحساب أو المحفظة"><input value={accountNumber} onChange={(event) => setAccountNumber(toLatinDigits(event.target.value).replace(/\s+/g, ''))} dir="ltr" className="profile-input text-left" required /></Field><Field label="اسم صاحب الحساب (اختياري)"><input value={accountHolderName} onChange={(event) => setAccountHolderName(event.target.value)} className="profile-input" /></Field><Field label="الاسم التعريفي (اختياري)"><input value={accountLabel} onChange={(event) => setAccountLabel(event.target.value)} className="profile-input" /></Field><button type="submit" disabled={addingAccount} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-bold text-white disabled:opacity-60">{addingAccount && <Loader2 className="h-4 w-4 animate-spin" />}إضافة الحساب</button></form></div>
  );

  const renderSecurity = () => (
    <div className="space-y-4"><SubpageHeader title="الأمان وتسجيل الدخول" /><section className="space-y-4 rounded-[1.7rem] bg-white p-5 shadow-sm"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Lock className="h-5 w-5" /></div><InfoLine label="البريد الإلكتروني" value={user.email || 'غير متوفر'} /><PasskeyManagement key={user.id} userId={user.id} /><p className="text-xs leading-6 text-slate-500">يبقى البريد وكلمة المرور متاحين دائمًا كخيار احتياطي واسترداد للحساب.</p></section></div>
  );

  const renderSupport = () => {
    const info = appInfo;
    return (
      <div className="space-y-4"><SubpageHeader title="الدعم والمساعدة" /><section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 to-slate-800 p-5 text-white shadow-lg"><p className="text-[10px] font-bold text-emerald-300">دعم سند</p><h3 className="mt-2 text-lg font-bold">تواصل بالطريقة الأنسب لك</h3><p className="mt-2 text-[11px] leading-6 text-white/60">فريق الدعم متاح {info?.support_days_text || 'السبت إلى الخميس'}، من {info?.support_hours_text || '8:00 صباحًا – 5:00 مساءً'}.</p><div className="mt-4 flex items-center gap-2 text-[10px] text-white/70"><Clock3 className="h-4 w-4 text-emerald-300" /><span>متوسط الرد: {info?.support_response_time_text || 'خلال 3 إلى 4 ساعات'}</span></div></section><div className="grid gap-3 sm:grid-cols-2"><SupportAction icon={<MessageCircle />} title="واتساب الدعم" value={info?.support_whatsapp ? `+${toLatinDigits(info.support_whatsapp)}` : 'غير متوفر'} href={supportWhatsappHref(info?.support_whatsapp || null)} tone="emerald" /><SupportAction icon={<Phone />} title="الاتصال بالدعم" value={info?.support_phone ? toLatinDigits(info.support_phone) : 'غير متوفر'} href={supportPhoneHref(info?.support_phone || null)} tone="sky" /><SupportAction icon={<Mail />} title="البريد الإلكتروني" value={info?.support_email || 'غير متوفر'} href={info?.support_email ? `mailto:${info.support_email}` : '#'} tone="violet" /><SupportAction icon={<Globe2 />} title="الموقع الرسمي" value="sanadflow.com" href={info?.support_website || 'https://sanadflow.com'} tone="slate" /></div><p className="px-2 text-[10px] leading-5 text-slate-400">لا يطلب فريق سند كلمات المرور أو رموز الدخول. استخدم قنوات الدعم الرسمية الظاهرة هنا فقط.</p></div>
    );
  };

  const renderAbout = () => {
    const info = appInfo;
    return (
      <div className="space-y-4"><SubpageHeader title="حول سند" /><section className="rounded-[2rem] bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white"><ShieldCheck className="h-6 w-6" /></span><div><h3 className="text-lg font-bold text-slate-950">سند</h3><p className="mt-1 text-[10px] text-slate-400">منصة يمنية أُطلقت في {toLatinDigits(info?.launch_year || 2026)}</p></div></div><p className="mt-5 text-sm leading-7 text-slate-600">{info?.about_short}</p></section><AboutSection icon={<ShieldCheck />} label="سند المالي" title="تحقق أوضح وثقة أعلى" body={info?.about_financial || ''} tone="emerald" /><AboutSection icon={<Building2 />} label="سند التجاري" title="دليل أعمال واتصال مباشر" body={info?.about_business || ''} tone="sky" /><AboutSection icon={<Sparkles />} label="رؤية سند" title="تنظيم التجربة الرقمية" body={info?.vision_text || ''} tone="violet" /><section className="rounded-[1.7rem] bg-white p-4 shadow-sm"><InfoLine label="الجهة المالكة والمطورة" value={info?.owner_name || 'سند'} /><div className="mt-3 grid grid-cols-2 gap-3"><InfoLine label="المقر" value={[info?.city, info?.governorate].filter(Boolean).join('، ')} /><InfoLine label="الدولة" value={info?.country || 'الجمهورية اليمنية'} /></div><a href={info?.support_website || 'https://sanadflow.com'} target="_blank" rel="noopener noreferrer" className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-700"><Globe2 className="h-4 w-4" />sanadflow.com<ExternalLink className="h-3.5 w-3.5" /></a></section></div>
    );
  };

  return (
    <div className="font-arabic text-right" id="profile_view" dir="rtl">
      {section === 'overview' && renderOverview()}
      {section === 'personal' && renderPersonal()}
      {section === 'financial' && renderFinancial()}
      {section === 'financial-add' && renderAddAccount()}
      {section === 'security' && renderSecurity()}
      {section === 'support' && renderSupport()}
      {section === 'about' && renderAbout()}
      {showProUpgradeModal && <ProUpgradeModal user={user} profile={profile} onClose={() => setShowProUpgradeModal(false)} onSuccess={() => loadUsage()} />}
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-2"><h2 className="px-1 text-sm font-bold text-slate-950">{title}</h2><div className="space-y-2">{children}</div></section>;
}

function SettingsRow({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 rounded-[1.4rem] bg-white px-4 text-right shadow-[0_8px_24px_rgba(15,23,42,0.045)]"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 [&>svg]:h-4 [&>svg]:w-4">{icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{title}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{subtitle}</span></span><ChevronLeft className="h-4 w-4 shrink-0 text-slate-300" /></button>;
}

function SupportAction({ icon, title, value, href, tone }: { icon: React.ReactNode; title: string; value: string; href: string; tone: 'emerald' | 'sky' | 'violet' | 'slate' }) {
  const tones = { emerald: 'bg-emerald-50 text-emerald-700', sky: 'bg-sky-50 text-sky-700', violet: 'bg-violet-50 text-violet-700', slate: 'bg-slate-100 text-slate-700' };
  return <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined} className="flex min-h-[92px] items-center gap-3 rounded-[1.6rem] bg-white p-4 shadow-sm"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]} [&>svg]:h-5 [&>svg]:w-5`}>{icon}</span><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-900">{title}</strong><span className="mt-1 block break-all text-[10px] text-slate-500" dir="ltr">{value}</span></span><ExternalLink className="h-4 w-4 text-slate-300" /></a>;
}

function AboutSection({ icon, label, title, body, tone }: { icon: React.ReactNode; label: string; title: string; body: string; tone: 'emerald' | 'sky' | 'violet' }) {
  const tones = { emerald: 'bg-emerald-50 text-emerald-700', sky: 'bg-sky-50 text-sky-700', violet: 'bg-violet-50 text-violet-700' };
  return <section className="rounded-[1.7rem] bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]} [&>svg]:h-5 [&>svg]:w-5`}>{icon}</span><div><p className="text-[9px] font-bold text-slate-400">{label}</p><h3 className="mt-1 text-sm font-bold text-slate-950">{title}</h3></div></div><p className="mt-4 text-xs leading-7 text-slate-600">{body}</p></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-600">{label}</span>{children}</label>;
}

function Message({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  return <div role="status" className={`flex items-start gap-2 rounded-xl p-3 text-xs ${tone === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{tone === 'error' ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle className="h-4 w-4 shrink-0" />}{children}</div>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 break-words text-xs font-medium text-slate-800">{value}</p></div>;
}
