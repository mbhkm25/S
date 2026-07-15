import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeft, Bell, Check, CheckCircle, ChevronLeft, Clipboard,
  CreditCard, HelpCircle, Info, Landmark, Loader2, Lock, MapPin, Plus,
  Power, Shield, Sparkles, Store, Trash2, User
} from 'lucide-react';
import { Profile } from '../types';
import { supabase } from '../lib/supabase';
import { formatYemeniDisplay, parseYemeniLocalPhone, toLatinDigits } from '../lib/digits';
import { isBasicProfileComplete, isValidYemenLocalPhone, normalizeYemenPhone } from '../lib/profileUtils';
import { isYemenGovernorate, YEMEN_GOVERNORATES } from '../constants/yemenGovernorates';
import ProUpgradeModal from './ProUpgradeModal';
import { BusinessCardSkeleton, SubscriptionCardSkeleton } from './Skeletons';
import {
  acceptBusinessInvitation, BusinessContexts, getBusinessMediaSignedUrl,
  getUserBusinessContexts
} from '../lib/businessApi';

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
  remaining?: number;
  expires_at?: string | null;
  plan?: { is_pro?: boolean; code?: string; name?: string } | string | null;
}

type ProfileSection = 'overview' | 'personal' | 'financial' | 'financial-add' | 'security' | 'privacy' | 'support' | 'about';

const FINANCIAL_ENTITIES = [
  'العمقي موبايل', 'البسيري موبايل', 'محفظة بي كاش (B-Cash)', 'الكريمي سعودي',
  'الكريمي يمني', 'الكريمي حاسب', 'بن دول صرافة', 'بن دول باي',
  'أم فلوس (الكريمي)', 'عدن كاش', 'القطيبي', 'المحضار', 'جهة أخرى'
];

function sectionFromPath(): ProfileSection {
  const segment = window.location.pathname.split('/').filter(Boolean).pop();
  return segment === 'personal' || segment === 'financial' || segment === 'financial-add' ||
    segment === 'security' || segment === 'privacy' || segment === 'support' || segment === 'about'
    ? segment : 'overview';
}

export default function MyProfile({ user, profile, onLogout, refreshProfile, onNavigate }: ProfileProps) {
  const [section, setSection] = useState<ProfileSection>(sectionFromPath);
  const [fullName, setFullName] = useState(profile.full_name || '');
  const [localPhone, setLocalPhone] = useState(profile.phone ? parseYemeniLocalPhone(profile.phone) : '');
  const [governorate, setGovernorate] = useState(profile.governorate || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

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
    } catch (error) {
      console.error('Error loading financial accounts:', error);
      if (generation === generationRef.current) setAccountError('تعذر تحميل الحسابات المالية. حاول مرة أخرى.');
    } finally {
      if (generation === generationRef.current) setLoadingAccounts(false);
    }
  };

  const loadUsage = async (generation = generationRef.current, userId = user.id) => {
    setLoadingUsage(true);
    try {
      const { data, error } = await supabase.rpc('get_my_operation_access_usage');
      if (error) throw error;
      if (generation === generationRef.current && userId === user.id) setUsage(data as UsageData);
    } catch (error) {
      console.error('Error loading operation access usage:', error);
      if (generation === generationRef.current) setUsage(null);
    } finally {
      if (generation === generationRef.current) setLoadingUsage(false);
    }
  };

  const loadBusinessContext = async (generation = generationRef.current, userId = user.id) => {
    setLoadingBusiness(true);
    setBusinessError(null);
    try {
      const contexts = await getUserBusinessContexts();
      const logoEntries = await Promise.all((contexts.owned_businesses || []).map(async (business) => {
        const record = business as typeof business & { profile_image_path?: string; logo_url?: string };
        const path = record.profile_image_path || business.logo_path || record.logo_url || '';
        return [business.id, path ? await getBusinessMediaSignedUrl(path) : ''] as const;
      }));
      if (generation === generationRef.current && userId === user.id) {
        setBusinessContext(contexts);
        setBusinessLogoUrls(Object.fromEntries(logoEntries));
      }
    } catch (error) {
      console.error('Error loading business contexts:', error);
      if (generation === generationRef.current) setBusinessError('تعذر تحميل بيانات النشاط التجاري.');
    } finally {
      if (generation === generationRef.current) setLoadingBusiness(false);
    }
  };

  useEffect(() => {
    const generation = ++generationRef.current;
    const userId = user.id;
    setSection(sectionFromPath());
    setFullName(profile.full_name || '');
    setLocalPhone(profile.phone ? parseYemeniLocalPhone(profile.phone) : '');
    setGovernorate(profile.governorate || '');
    setAccounts([]);
    setUsage(null);
    setBusinessContext(null);
    setBusinessLogoUrls({});
    void loadAccounts(generation, userId);
    void loadUsage(generation, userId);
    void loadBusinessContext(generation, userId);
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
    const generation = generationRef.current;
    const userId = user.id;
    setSavingProfile(true);
    try {
      const { error } = await supabase.rpc('upsert_my_basic_profile', {
        p_full_name: name,
        p_phone: normalizeYemenPhone(localPhone),
        p_governorate: governorate
      });
      if (error) throw error;
      if (generation !== generationRef.current || userId !== user.id) return;
      const refreshed = await refreshProfile();
      if (generation !== generationRef.current || !refreshed) return;
      setProfileSuccess('تم حفظ التغييرات.');
    } catch (error) {
      console.error('upsert_my_basic_profile error:', error);
      if (generation === generationRef.current) setProfileError('تعذر حفظ البيانات الآن. تحقق من الاتصال وحاول مرة أخرى.');
    } finally {
      if (generation === generationRef.current) setSavingProfile(false);
    }
  };

  const handleAddAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setAccountError(null);
    setAccountSuccess(null);
    const cleanNumber = toLatinDigits(accountNumber).replace(/\s+/g, '');
    if (!financialEntity) return setAccountError('يرجى اختيار الجهة المالية.');
    if (!cleanNumber) return setAccountError('رقم الحساب أو المحفظة مطلوب.');
    if (accounts.some((account) => account.financial_entity === financialEntity && account.account_number === cleanNumber)) {
      return setAccountError('هذا الحساب مضاف مسبقًا.');
    }
    const generation = generationRef.current;
    const userId = user.id;
    setAddingAccount(true);
    try {
      const { error } = await supabase.from('user_financial_accounts').insert({
        user_id: userId,
        financial_entity: financialEntity,
        account_number: cleanNumber,
        account_holder_name: accountHolderName.trim() || null,
        account_label: accountLabel.trim() || null,
        status: 'active',
        metadata: {}
      });
      if (error) throw error;
      if (generation !== generationRef.current || userId !== user.id) return;
      setFinancialEntity('');
      setAccountNumber('');
      setAccountHolderName('');
      setAccountLabel('');
      setAccountSuccess('تمت إضافة الحساب المالي.');
      await loadAccounts(generation, userId);
      navigateSection('financial');
    } catch (error) {
      console.error('Insert account error:', error);
      if (generation === generationRef.current) setAccountError('تعذر إضافة الحساب. تحقق من البيانات وحاول مرة أخرى.');
    } finally {
      if (generation === generationRef.current) setAddingAccount(false);
    }
  };

  const handleDisableAccount = async (accountId: string) => {
    if (deletingAccountId || !window.confirm('هل تريد حذف هذا الحساب المالي؟')) return;
    const generation = generationRef.current;
    const userId = user.id;
    setDeletingAccountId(accountId);
    setAccountError(null);
    try {
      const { error } = await supabase.from('user_financial_accounts').update({ status: 'disabled' }).eq('id', accountId).eq('user_id', userId);
      if (error) throw error;
      if (generation !== generationRef.current || userId !== user.id) return;
      setAccountSuccess('تم حذف الحساب المالي.');
      await loadAccounts(generation, userId);
    } catch (error) {
      console.error('Disable account error:', error);
      if (generation === generationRef.current) setAccountError('تعذر حذف الحساب المالي. حاول مرة أخرى.');
    } finally {
      if (generation === generationRef.current) setDeletingAccountId(null);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    generationRef.current += 1;
    setAccounts([]);
    setUsage(null);
    setBusinessContext(null);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      onLogout();
      setLoggingOut(false);
    }
  };

  const handleCopy = async (account: FinancialAccount) => {
    await navigator.clipboard.writeText(account.account_number);
    setCopiedId(account.id);
    window.setTimeout(() => setCopiedId(null), 1500);
  };

  const handleAcceptInvite = async (token: string) => {
    if (acceptingInvite) return;
    setAcceptingInvite(token);
    const generation = generationRef.current;
    try {
      await acceptBusinessInvitation(token);
      await loadBusinessContext(generation, user.id);
    } catch (error) {
      console.error('Accept invitation error:', error);
      if (generation === generationRef.current) setBusinessError('تعذر قبول الدعوة الآن.');
    } finally {
      if (generation === generationRef.current) setAcceptingInvite(null);
    }
  };

  const SubpageHeader = ({ title, back = 'overview' }: { title: string; back?: ProfileSection }) => (
    <div className="flex items-center gap-2 min-h-11">
      <button type="button" onClick={() => navigateSection(back)} aria-label="رجوع" className="w-11 h-11 rounded-xl hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-500 flex items-center justify-center">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <h2 className="text-base font-bold text-slate-950">{title}</h2>
    </div>
  );

  const renderOverview = () => {
    const ownedBusiness = businessContext?.owned_businesses?.[0];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 py-2 min-h-[96px]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-slate-950 text-white shrink-0 flex items-center justify-center"><User className="w-6 h-6" /></div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-950 leading-snug line-clamp-2">{profile.full_name || 'مستخدم سند'}</h1>
              <p className="text-xs text-slate-500 font-mono mt-1" dir="ltr">{formatYemeniDisplay(profile.phone) || user.email || 'لا يوجد رقم جوال'}</p>
              <button type="button" onClick={() => navigateSection('personal')} className="text-[11px] text-slate-600 mt-1 underline underline-offset-4">اكتمال الملف {toLatinDigits(completionPercent)}%</button>
            </div>
          </div>
          <button type="button" onClick={() => navigateSection('personal')} className="h-11 px-3 rounded-xl border border-slate-200 text-xs font-bold shrink-0 focus-visible:ring-2 focus-visible:ring-slate-500">تعديل الملف</button>
        </div>

        {!isBasicProfileComplete(profile, user.email) && (
          <button type="button" onClick={() => navigateSection('personal')} className="w-full min-h-11 px-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-900 text-xs font-bold text-right flex items-center justify-between">
            <span>أكمل بيانات حسابك</span><ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {loadingBusiness ? <BusinessCardSkeleton /> : businessError ? (
          <div className="rounded-2xl bg-white border border-rose-100 p-4 text-xs text-rose-700 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{businessError}</div>
        ) : ownedBusiness ? (
          <section className="rounded-2xl bg-white border border-slate-200/70 p-4 space-y-3" aria-labelledby="business-title">
            <div className="flex gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-slate-950 text-white overflow-hidden shrink-0 flex items-center justify-center">
                {businessLogoUrls[ownedBusiness.id] ? <img src={businessLogoUrls[ownedBusiness.id]} alt={`شعار ${ownedBusiness.name}`} className="w-full h-full object-cover" /> : <Store className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400">نشاطي التجاري</p>
                <h2 id="business-title" className="text-sm font-bold text-slate-950 truncate">{ownedBusiness.name}</h2>
                <p className="text-[11px] text-slate-500 mt-1">{ownedBusiness.public_status === 'published' ? 'نشط ومنشور' : ownedBusiness.public_status === 'pending_review' ? 'قيد المراجعة' : 'قيد الإعداد'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onNavigate('business-manage')} className="min-h-11 rounded-xl bg-[#111] text-white text-xs font-bold">إدارة النشاط</button>
              {ownedBusiness.public_status === 'published' && <button type="button" onClick={() => onNavigate('public-business-profile', ownedBusiness.slug)} className="min-h-11 rounded-xl border border-slate-200 text-xs font-bold">عرض الملف العام</button>}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl bg-white border border-slate-200/70 p-4 flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-bold">أنشئ نشاطك التجاري</h2><p className="text-[11px] text-slate-500 mt-1">أنشئ ملفًا احترافيًا لنشاطك وابدأ الوصول إلى العملاء.</p></div>
            <button type="button" onClick={() => onNavigate('business-create')} className="min-h-11 px-3 rounded-xl bg-[#111] text-white text-xs font-bold shrink-0">إنشاء نشاط</button>
          </section>
        )}

        {(businessContext?.pending_invitations?.length || 0) > 0 && (
          <div className="rounded-2xl bg-white border border-amber-100 divide-y divide-amber-100">
            {businessContext!.pending_invitations.map((invite) => (
              <div key={invite.id} className="p-3 flex items-center justify-between gap-3">
                <div><p className="text-xs font-bold">دعوة من {invite.business_name || 'نشاط تجاري'}</p><p className="text-[10px] text-slate-500 mt-1">للانضمام إلى فريق النشاط</p></div>
                <button type="button" disabled={Boolean(acceptingInvite)} onClick={() => handleAcceptInvite(invite.token)} className="min-h-11 px-3 rounded-xl bg-amber-600 text-white text-xs font-bold disabled:opacity-50">{acceptingInvite === invite.token ? <Loader2 className="w-4 h-4 animate-spin" /> : 'قبول'}</button>
              </div>
            ))}
          </div>
        )}

        {loadingUsage ? <SubscriptionCardSkeleton /> : usage && (
          <section className="rounded-2xl bg-white border border-slate-200/70 p-4 space-y-3" aria-labelledby="plan-title">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[10px] text-slate-400">خطتك الحالية</p><h2 id="plan-title" className="text-sm font-bold mt-1">{isPro ? (typeof usage.plan === 'object' ? usage.plan?.name || 'سند Pro' : 'سند Pro') : 'الخطة المجانية'}</h2></div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${isPro ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{isPro ? 'فعال' : 'مجاني'}</span>
            </div>
            {limit > 0 && <><div className="flex justify-between text-[11px] text-slate-500"><span>الاستخدام الشهري</span><span>{toLatinDigits(used)} من {limit >= 999999 ? 'غير محدود' : toLatinDigits(limit)} عملية</span></div>{limit < 999999 && <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-slate-900 rounded-full" style={{ width: `${usagePercent}%` }} /></div>}</>}
            {usage.expires_at && <p className="text-[10px] text-slate-500">ينتهي الاشتراك: {new Date(usage.expires_at).toLocaleDateString('ar-YE', { year: 'numeric', month: 'long', day: 'numeric' })}</p>}
            {!isPro && <button type="button" onClick={() => setShowProUpgradeModal(true)} className="min-h-11 w-full rounded-xl bg-[#111] text-white text-xs font-bold flex items-center justify-center gap-2"><Sparkles className="w-4 h-4" />الترقية إلى سند Pro</button>}
          </section>
        )}

        <section aria-labelledby="settings-title" className="space-y-2">
          <h2 id="settings-title" className="text-sm font-bold px-1 pt-1">الإعدادات</h2>
          <div className="rounded-2xl bg-white border border-slate-200/70 divide-y divide-slate-100 overflow-hidden">
            <SettingsRow icon={<User />} title="البيانات الشخصية" subtitle={`${profile.full_name || 'الاسم غير مكتمل'}${profile.governorate ? ` • ${profile.governorate}` : ''}`} onClick={() => navigateSection('personal')} />
            <SettingsRow icon={<Landmark />} title="الحسابات المالية" subtitle={loadingAccounts ? 'جاري التحميل' : accounts.length ? `${toLatinDigits(accounts.length)} حساب مرتبط` : 'لا توجد حسابات مرتبطة'} onClick={() => navigateSection('financial')} />
            <SettingsRow icon={<Lock />} title="الأمان وتسجيل الدخول" subtitle="البريد والجلسة" onClick={() => navigateSection('security')} />
            <SettingsRow icon={<Bell />} title="الإشعارات" subtitle="إشعارات التطبيق" onClick={() => onNavigate('notifications')} />
            <SettingsRow icon={<Shield />} title="الخصوصية" subtitle="حماية بياناتك" onClick={() => navigateSection('privacy')} />
            <SettingsRow icon={<HelpCircle />} title="الدعم والمساعدة" subtitle="معلومات التواصل والمساعدة" onClick={() => navigateSection('support')} />
            <SettingsRow icon={<Info />} title="حول سند" subtitle="عن التطبيق" onClick={() => navigateSection('about')} />
            <button type="button" id="btn_logout" disabled={loggingOut} onClick={handleLogout} className="w-full min-h-14 px-4 flex items-center gap-3 text-rose-600 hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-50">
              <Power className="w-5 h-5" /><span className="text-sm font-bold">{loggingOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'}</span>
            </button>
          </div>
        </section>
      </div>
    );
  };

  const renderPersonal = () => (
    <div className="space-y-4 pb-24">
      <SubpageHeader title="البيانات الشخصية" />
      <form id="personal-data-form" onSubmit={handleSaveProfile} className="rounded-2xl bg-white border border-slate-200/70 p-4 space-y-4">
        {profileError && <Message tone="error">{profileError}</Message>}
        {profileSuccess && <Message tone="success">{profileSuccess}</Message>}
        <Field label="الاسم الكامل"><input value={fullName} onChange={(event) => { setFullName(event.target.value); setProfileError(null); }} className="profile-input" required /></Field>
        <Field label="رقم الجوال"><div className="flex rounded-xl border border-slate-200 bg-slate-50 overflow-hidden focus-within:ring-2 focus-within:ring-slate-500"><input value={localPhone} inputMode="numeric" dir="ltr" onChange={(event) => { setLocalPhone(parseYemeniLocalPhone(event.target.value).slice(0, 9)); setProfileError(null); }} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-left font-mono outline-none" required /><span dir="ltr" className="px-3 py-3 bg-slate-100 border-r border-slate-200 font-mono text-sm">+967</span></div></Field>
        <Field label="المحافظة"><div className="relative"><select value={governorate} onChange={(event) => { setGovernorate(event.target.value); setProfileError(null); }} className="profile-input appearance-none" required><option value="">اختر المحافظة</option>{YEMEN_GOVERNORATES.map((item) => <option key={item}>{item}</option>)}</select><MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" /></div></Field>
      </form>
      {profileDirty && <div className="fixed z-30 left-0 right-0 bottom-[calc(4.8rem+env(safe-area-inset-bottom))] px-4"><div className="max-w-2xl mx-auto"><button form="personal-data-form" type="submit" disabled={savingProfile} className="w-full min-h-12 rounded-xl bg-[#111] text-white text-sm font-bold shadow-lg disabled:opacity-60 flex items-center justify-center gap-2">{savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}حفظ التغييرات</button></div></div>}
    </div>
  );

  const renderFinancial = () => (
    <div className="space-y-4">
      <SubpageHeader title="الحسابات المالية" />
      <div className="flex items-center justify-between"><p className="text-xs text-slate-500">{loadingAccounts ? 'جاري التحميل' : `${toLatinDigits(accounts.length)} حساب مرتبط`}</p><button type="button" onClick={() => navigateSection('financial-add')} className="min-h-11 px-3 rounded-xl bg-[#111] text-white text-xs font-bold flex items-center gap-1"><Plus className="w-4 h-4" />إضافة حساب مالي</button></div>
      {accountError && <Message tone="error">{accountError}</Message>}
      {accountSuccess && <Message tone="success">{accountSuccess}</Message>}
      {loadingAccounts ? <div className="space-y-2 animate-pulse"><div className="h-20 rounded-2xl bg-white" /><div className="h-20 rounded-2xl bg-white" /></div> : accounts.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center"><Landmark className="w-7 h-7 mx-auto text-slate-300" /><p className="text-sm font-bold mt-3">لا توجد حسابات مالية</p><p className="text-xs text-slate-500 mt-1">أضف حسابًا لتسهيل تنظيم معاملاتك.</p></div> : <div className="space-y-2">{accounts.map((account) => <div key={account.id} className="rounded-2xl bg-white border border-slate-200/70 p-4 flex items-center justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><h3 className="text-sm font-bold">{account.financial_entity}</h3>{account.account_label && <span className="text-[9px] bg-slate-100 px-2 py-0.5 rounded-md">{account.account_label}</span>}{account.is_default && <span className="text-[9px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md">افتراضي</span>}</div><div className="flex items-center gap-1 mt-1"><span dir="ltr" className="text-xs text-slate-500 font-mono">{account.account_number}</span><button type="button" aria-label="نسخ رقم الحساب" onClick={() => handleCopy(account)} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-100">{copiedId === account.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Clipboard className="w-4 h-4 text-slate-400" />}</button></div>{account.account_holder_name && <p className="text-[10px] text-slate-500 truncate">{account.account_holder_name}</p>}</div><button type="button" aria-label="حذف الحساب" disabled={Boolean(deletingAccountId)} onClick={() => handleDisableAccount(account.id)} className="w-11 h-11 rounded-xl text-rose-600 bg-rose-50 flex items-center justify-center disabled:opacity-50">{deletingAccountId === account.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}</button></div>)}</div>}
    </div>
  );

  const renderAddAccount = () => (
    <div className="space-y-4 pb-4"><SubpageHeader title="إضافة حساب مالي" back="financial" /><form onSubmit={handleAddAccount} className="rounded-2xl bg-white border border-slate-200/70 p-4 space-y-4">{accountError && <Message tone="error">{accountError}</Message>}<Field label="الجهة المالية"><select value={financialEntity} onChange={(event) => setFinancialEntity(event.target.value)} className="profile-input" required><option value="">اختر المحفظة أو البنك</option>{FINANCIAL_ENTITIES.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="رقم الحساب أو المحفظة"><input value={accountNumber} onChange={(event) => setAccountNumber(toLatinDigits(event.target.value).replace(/\s+/g, ''))} dir="ltr" className="profile-input text-left font-mono" required /></Field><Field label="اسم صاحب الحساب (اختياري)"><input value={accountHolderName} onChange={(event) => setAccountHolderName(event.target.value)} className="profile-input" /></Field><Field label="الاسم التعريفي (اختياري)"><input value={accountLabel} onChange={(event) => setAccountLabel(event.target.value)} className="profile-input" /></Field><button type="submit" disabled={addingAccount} className="w-full min-h-12 rounded-xl bg-[#111] text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2">{addingAccount && <Loader2 className="w-4 h-4 animate-spin" />}إضافة الحساب</button></form></div>
  );

  const renderInfoPage = () => {
    const content = {
      security: { title: 'الأمان وتسجيل الدخول', icon: <Lock />, body: <><InfoLine label="البريد الإلكتروني" value={user.email || 'غير متوفر'} /><p className="text-xs text-slate-500 leading-6">تدار كلمة المرور والجلسة عبر نظام تسجيل الدخول الآمن في سند. لا تتوفر إعدادات أمان إضافية من هذه الصفحة حاليًا.</p><button type="button" disabled={loggingOut} onClick={handleLogout} className="w-full min-h-12 rounded-xl border border-rose-200 text-rose-600 text-sm font-bold">تسجيل الخروج</button></> },
      privacy: { title: 'الخصوصية', icon: <Shield />, body: <p className="text-xs text-slate-600 leading-7">يعرض هذا القسم بيانات حسابك أنت فقط. لا يعرض سند المعرّفات الداخلية أو الرموز السرية، وتظل الحسابات المالية مرتبطة بحسابك المحمي.</p> },
      support: { title: 'الدعم والمساعدة', icon: <HelpCircle />, body: <p className="text-xs text-slate-600 leading-7">إذا واجهت مشكلة، استخدم قناة الدعم الرسمية المتاحة لك خارج التطبيق مع وصف الخطوات التي أدت إلى المشكلة. لا توجد قناة دعم مدمجة داخل التطبيق حاليًا.</p> },
      about: { title: 'حول سند', icon: <Info />, body: <p className="text-xs text-slate-600 leading-7">سند منصة لتنظيم الإشعارات والعمليات المالية والتحقق منها، مع أدوات للحسابات الشخصية والأنشطة التجارية.</p> }
    } as const;
    const item = content[section as keyof typeof content];
    return <div className="space-y-4"><SubpageHeader title={item.title} /><div className="rounded-2xl bg-white border border-slate-200/70 p-5 space-y-4"><div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 [&>svg]:w-5 [&>svg]:h-5">{item.icon}</div>{item.body}</div></div>;
  };

  return (
    <div className="text-right font-arabic" id="profile_view" dir="rtl">
      {section === 'overview' && renderOverview()}
      {section === 'personal' && renderPersonal()}
      {section === 'financial' && renderFinancial()}
      {section === 'financial-add' && renderAddAccount()}
      {(section === 'security' || section === 'privacy' || section === 'support' || section === 'about') && renderInfoPage()}
      {showProUpgradeModal && <ProUpgradeModal user={user} profile={profile} onClose={() => setShowProUpgradeModal(false)} onSuccess={() => loadUsage()} />}
    </div>
  );
}

function SettingsRow({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="w-full min-h-16 px-4 flex items-center gap-3 text-right hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500"><span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span><span className="flex-1 min-w-0"><span className="block text-sm font-bold text-slate-900">{title}</span><span className="block text-[10px] text-slate-500 mt-0.5 truncate">{subtitle}</span></span><ChevronLeft className="w-4 h-4 text-slate-300 shrink-0" /></button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-600">{label}</span>{children}</label>;
}

function Message({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  return <div role="status" className={`rounded-xl border p-3 text-xs flex items-start gap-2 ${tone === 'error' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>{tone === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}{children}</div>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400">{label}</p><p className="text-xs font-medium text-slate-800 mt-1 break-all" dir="ltr">{value}</p></div>;
}
