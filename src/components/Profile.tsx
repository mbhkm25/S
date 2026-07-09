import React, { useState, useEffect } from 'react';
import { Profile } from '../types';
import { supabase } from '../lib/supabase';
import { User, Mail, Phone, Shield, Power, Sparkles, Loader2, Landmark, Plus, AlertCircle, EyeOff, Trash2, MapPin, CheckCircle, Clock, CreditCard, ShieldCheck, HelpCircle, Clipboard, Check, Store } from 'lucide-react';
import { formatYemeniDisplay, parseYemeniLocalPhone, toLatinDigits } from '../lib/digits';
import { normalizeYemenPhone, isValidYemenLocalPhone, maskAccountNumber } from '../lib/profileUtils';
import ProUpgradeModal from './ProUpgradeModal';
import { 
  getUserBusinessContexts, acceptBusinessInvitation, getBusinessMediaSignedUrl,
  BusinessContexts 
} from '../lib/businessApi';

interface ProfileProps {
  user: any;
  profile: Profile;
  onLogout: () => void;
  refreshProfile: () => Promise<Profile | null>;
  onNavigate: (page: string) => void;
}

const GOVERNORATES = [
  'صنعاء', 'عدن', 'حضرموت', 'تعز', 'إب', 'الحديدة', 'ذمار', 'شبوة', 
  'المهرة', 'مأرب', 'الجوف', 'صعدة', 'حجة', 'عمران', 'البيضاء', 
  'لحج', 'أبين', 'الضالع', 'ريمة', 'سقطرى', 'المحويت'
];

const FINANCIAL_ENTITIES = [
  'العمقي موبايل',
  'البسيري موبايل',
  'محفظة بي كاش (B-Cash)',
  'الكريمي سعودي',
  'الكريمي يمني',
  'الكريمي حاسب',
  'بن دول صرافة',
  'بن دول باي',
  'أم فلوس (الكريمي)',
  'عدن كاش',
  'القطيبي',
  'المحضار',
  'جهة أخرى'
];

export default function MyProfile({ user, profile, onLogout, refreshProfile, onNavigate }: ProfileProps) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyAccount = (accId: string, accNum: string) => {
    navigator.clipboard.writeText(accNum);
    setCopiedId(accId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Basic Profile form state
  const [fullName, setFullName] = useState(profile.full_name || '');
  const [localPhone, setLocalPhone] = useState(profile.phone ? parseYemeniLocalPhone(profile.phone) : '');
  const [governorate, setGovernorate] = useState(profile.governorate || '');
  
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Financial Account form state
  const [financialEntity, setFinancialEntity] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountLabel, setAccountLabel] = useState('');
  
  const [addingAccount, setAddingAccount] = useState(false);
  const [accountSuccess, setAccountSuccess] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Financial Accounts list state
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Operation Access Gate Usage state
  const [usage, setUsage] = useState<any | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [showProUpgradeModal, setShowProUpgradeModal] = useState(false);

  // Business contexts state
  const [businessContext, setBusinessContext] = useState<BusinessContexts | null>(null);
  const [loadingBusiness, setLoadingBusiness] = useState(false);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [acceptingInvite, setAcceptingInvite] = useState(false);
  const [businessLogoUrls, setBusinessLogoUrls] = useState<Record<string, string>>({});

  const loadBusinessContext = async () => {
    setLoadingBusiness(true);
    setBusinessError(null);
    try {
      const contexts = await getUserBusinessContexts();
      setBusinessContext(contexts);
      const ownedBusinesses = contexts.owned_businesses || [];
      const logoEntries = await Promise.all(
        ownedBusinesses.map(async (biz) => {
          const logoPath = (biz as any).profile_image_path || biz.logo_path || (biz as any).logo_url || '';
          if (!logoPath) return [biz.id, ''] as const;
          return [biz.id, await getBusinessMediaSignedUrl(logoPath)] as const;
        })
      );
      setBusinessLogoUrls(Object.fromEntries(logoEntries));
    } catch (e: any) {
      console.error('Error loading business contexts:', e);
      setBusinessError(e.message || 'فشل في تحميل سياقات الأعمال.');
    } finally {
      setLoadingBusiness(false);
    }
  };

  const handleAcceptInvite = async (token: string) => {
    setAcceptingInvite(true);
    try {
      await acceptBusinessInvitation(token);
      await loadBusinessContext();
    } catch (e: any) {
      alert(e.message || 'فشل قبول الدعوة.');
    } finally {
      setAcceptingInvite(false);
    }
  };

  const loadUsage = async () => {
    setLoadingUsage(true);
    try {
      const { data, error } = await supabase.rpc('get_my_operation_access_usage');
      if (!error && data) {
        setUsage(data);
      }
    } catch (e) {
      console.error('Error loading operation access usage:', e);
    } finally {
      setLoadingUsage(false);
    }
  };

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const { data, error } = await supabase
        .from('user_financial_accounts')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setAccounts(data);
      }
    } catch (e) {
      console.error('Error loading accounts:', e);
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    loadAccounts();
    loadUsage();
    loadBusinessContext();
  }, []);

  const handleLogoutClick = async () => {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      onLogout();
    } catch (e) {
      console.error('Logout error:', e);
      onLogout();
    } finally {
      setLoggingOut(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess(null);
    setProfileError(null);

    const name = fullName.trim();
    if (!name) {
      setProfileError('الاسم الكامل مطلوب.');
      return;
    }

    const cleanPhoneInput = toLatinDigits(localPhone.trim());
    if (!cleanPhoneInput) {
      setProfileError('رقم الجوال مطلوب.');
      return;
    }

    if (!isValidYemenLocalPhone(cleanPhoneInput)) {
      setProfileError('رقم الهاتف يجب أن يتكون من 9 أرقام يمنية صالحة (مثال: 777634971).');
      return;
    }

    setSavingProfile(true);
    try {
      const formattedPhone = normalizeYemenPhone(cleanPhoneInput);
      
      const { error } = await supabase.rpc('upsert_my_basic_profile', {
        p_full_name: name,
        p_phone: formattedPhone,
        p_governorate: governorate || null
      });

      if (error) throw error;

      setProfileSuccess('تم حفظ بياناتك الأساسية');
      await refreshProfile();
    } catch (err: any) {
      console.error('upsert_my_basic_profile error:', err);
      setProfileError(err.message || 'حدث خطأ أثناء حفظ البيانات الأساسية.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountSuccess(null);
    setAccountError(null);

    if (!financialEntity) {
      setAccountError('يرجى اختيار الجهة المالية.');
      return;
    }

    const cleanAccNum = toLatinDigits(accountNumber.trim()).replace(/\s+/g, '');
    if (!cleanAccNum) {
      setAccountError('رقم الحساب / المحفظة مطلوب.');
      return;
    }

    // Client-side duplicate check against active accounts list in memory
    const isDuplicate = accounts.some(
      acc => acc.financial_entity === financialEntity && 
      toLatinDigits(acc.account_number).replace(/\s+/g, '') === cleanAccNum
    );

    if (isDuplicate) {
      setAccountError('هذا الحساب مضاف مسبقًا');
      return;
    }

    setAddingAccount(true);
    try {
      const { error } = await supabase
        .from('user_financial_accounts')
        .insert({
          user_id: user.id,
          financial_entity: financialEntity,
          account_number: cleanAccNum,
          account_holder_name: accountHolderName.trim() || null,
          account_label: accountLabel.trim() || null,
          status: 'active',
          metadata: {}
        });

      if (error) {
        if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('already exists')) {
          throw new Error('هذا الحساب مضاف مسبقًا');
        }
        throw error;
      }

      setAccountSuccess('تمت إضافة الحساب المالي بنجاح.');
      setAccountNumber('');
      setAccountHolderName('');
      setAccountLabel('');
      await loadAccounts();
    } catch (err: any) {
      console.error('Insert account error:', err);
      setAccountError(err.message || 'حدث خطأ أثناء إضافة الحساب المالي.');
    } finally {
      setAddingAccount(false);
    }
  };

  const handleDisableAccount = async (accountId: string) => {
    setAccountSuccess(null);
    setAccountError(null);
    try {
      const { error } = await supabase
        .from('user_financial_accounts')
        .update({ status: 'disabled' })
        .eq('id', accountId);

      if (error) throw error;

      setAccountSuccess('تم تعطيل الحساب بنجاح.');
      await loadAccounts();
    } catch (err: any) {
      console.error('Disable account error:', err);
      setAccountError(err.message || 'حدث خطأ أثناء تعطيل الحساب المالي.');
    }
  };

  return (
    <div className="space-y-6 text-right" id="profile_view" dir="rtl">
      
      {/* Title block */}
      <div>
        <h2 className="text-base font-bold text-slate-950 font-arabic">حسابي الشخصي</h2>
        <p className="text-[11px] text-slate-500 font-arabic mt-1 leading-relaxed">
          إدارة الملف الشخصي الأساسي وحفظ الحسابات المالية الشخصية بشكل آمن ومنظم.
        </p>
      </div>

      {/* Profile Header Seal */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5 text-center space-y-3 shadow-sm">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-50 text-slate-900 border border-slate-200 shadow-sm">
          <User className="w-8 h-8 text-[#111111]" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-950 font-arabic">{profile.full_name || 'مستخدم جديد'}</h2>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{user?.email}</p>
        </div>
        
        <div className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-slate-200">
          <Sparkles className="w-3 h-3 text-[#111111]" />
          <span>مدقق مالي شخصي</span>
        </div>
      </div>

      {/* Redesigned Business Status Section */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-6 shadow-sm space-y-5 text-right">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-800 border border-slate-200/50">
              <Store className="w-4 h-4" />
            </div>
            <div className="text-right">
              <h3 className="text-xl font-bold text-slate-900 font-arabic leading-tight">نشاطي التجاري والشركاء</h3>
              <p className="text-[10px] text-slate-400 font-arabic">تتبع ملفات الأعمال وعضويات فريق العمل وعلاقات العملاء</p>
            </div>
          </div>
        </div>

        {loadingBusiness ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 text-slate-800 animate-spin" />
          </div>
        ) : businessError ? (
          <div className="p-3 bg-rose-50 text-rose-800 text-xs rounded-2xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500" />
            <span className="font-arabic">{businessError}</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 1. Owned Business Card */}
            {businessContext?.owned_businesses && businessContext.owned_businesses.length > 0 ? (
              <div className="space-y-3">
                {businessContext.owned_businesses.map((biz) => (
                  <div key={biz.id} className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl flex flex-col gap-3 justify-between sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3 text-right min-w-0">
                      <div className="w-14 h-14 rounded-xl bg-slate-950 text-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                        {businessLogoUrls[biz.id] ? (
                          <img src={businessLogoUrls[biz.id]} alt={`شعار ${biz.name}`} className="w-full h-full object-cover" />
                        ) : (
                          <Store className="w-5 h-5" />
                        )}
                      </div>
                      <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-slate-900 font-arabic leading-tight">{biz.name}</span>
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded-md ${
                          biz.public_status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {biz.public_status === 'published' ? 'منشور' : 'تحت المراجعة'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-arabic">ملفك التجاري النشط في مجتمع سند</p>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end sm:justify-start">
                      {biz.public_status === 'published' && (
                        <button
                          onClick={() => onNavigate('public-business-profile', biz.slug)}
                          className="border border-slate-200 hover:bg-slate-50 text-slate-700 text-[13px] font-bold py-2 px-4 rounded-lg transition-all"
                        >
                          الملف العام
                        </button>
                      )}
                      <button
                        onClick={() => onNavigate('business-manage')}
                        className="bg-[#111111] hover:bg-black text-white text-[13px] font-bold py-2 px-4 rounded-lg transition-all"
                      >
                        إدارة النشاط
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* If no owned business, render registration cta */
              <div className="bg-slate-50/50 border border-dashed border-slate-200 p-5 rounded-2xl text-center space-y-3">
                <p className="text-xs text-slate-500 font-arabic">هل تمتلك نشاطًا تجاريًا أو تقدم خدمات مالية؟</p>
                <p className="text-[10px] text-slate-400 leading-normal max-w-xs mx-auto font-arabic">
                  سجل نشاطك التجاري الآن لتتيح للعملاء والمستخدمين ربط إشعاراتهم المالية بملف نشاطك وتوثيق المعاملات رقمياً.
                </p>
                <button
                  onClick={() => onNavigate('business-create')}
                  className="inline-flex items-center gap-1.5 bg-[#111111] hover:bg-black text-white text-[10px] font-bold py-2.5 px-4 rounded-xl transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="font-arabic">إنشاء نشاط تجاري جديد</span>
                </button>
              </div>
            )}

            {/* 2. Compact Relationship Indicators */}
            <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3.5 text-center">
              <div className="bg-slate-50/50 border border-slate-200/50 p-2.5 rounded-xl">
                <span className="text-[9px] text-slate-400 block font-arabic">أعمل ضمن فريق</span>
                <span className="text-xs font-bold text-slate-900 font-mono mt-0.5">
                  {toLatinDigits(businessContext?.team_businesses?.length || 0)}
                </span>
              </div>
              <div className="bg-slate-50/50 border border-slate-200/50 p-2.5 rounded-xl">
                <span className="text-[9px] text-slate-400 block font-arabic">عميل لدى</span>
                <span className="text-xs font-bold text-slate-900 font-mono mt-0.5">
                  {toLatinDigits(businessContext?.customer_businesses?.length || 0)}
                </span>
              </div>
              <div className="bg-slate-50/50 border border-slate-200/50 p-2.5 rounded-xl">
                <span className="text-[9px] text-slate-400 block font-arabic">دعوات معلقة</span>
                <span className={`text-xs font-bold font-mono mt-0.5 ${
                  (businessContext?.pending_invitations?.length || 0) > 0 ? 'text-amber-600' : 'text-slate-900'
                }`}>
                  {toLatinDigits(businessContext?.pending_invitations?.length || 0)}
                </span>
              </div>
            </div>

            {/* 3. Pending invitations lists */}
            {businessContext?.pending_invitations && businessContext.pending_invitations.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-400 font-arabic uppercase tracking-wider">دعوات انضمام بانتظار موافقتك</h4>
                <div className="space-y-2">
                  {businessContext.pending_invitations.map((invite) => {
                    const translatedRole = invite.role === 'owner' ? 'مالك' : invite.role === 'manager' ? 'مدير' : invite.role === 'cashier' ? 'كاشير' : invite.role;
                    return (
                      <div key={invite.id} className="bg-amber-50/30 border border-amber-100/80 p-3 rounded-xl flex items-center justify-between gap-3 text-right">
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-slate-800 font-arabic">
                            دعوة من {invite.business_name || 'نشاط تجاري'}
                          </p>
                          <p className="text-[9px] text-slate-500 font-arabic">الدور المقترح: {translatedRole}</p>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            disabled={acceptingInvite}
                            onClick={() => handleAcceptInvite(invite.token)}
                            className="bg-amber-650 hover:bg-amber-700 text-white text-[9px] font-bold py-1.5 px-3 rounded-lg transition-all disabled:opacity-50"
                          >
                            {acceptingInvite ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              'قبول الدعوة'
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Subscription & Access Gate Usage Block */}
      {usage && (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-5 shadow-sm space-y-4 text-right" id="profile_subscription_status">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-700">
                <CreditCard className="w-4 h-4" />
              </div>
              <div className="text-right">
                <h3 className="text-xs font-bold text-slate-800 font-arabic">الخطة والاستخدام</h3>
                <p className="text-[9px] text-slate-400 font-arabic">إدارة اشتراكك وبوابة الوصول للعمليات</p>
              </div>
            </div>
            
            {(usage.plan?.is_pro || usage.plan?.code === 'sanad_pro' || usage.plan === 'sanad_pro') ? (
              <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-3 py-1 rounded-full border border-emerald-100/60 font-arabic flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                سند Pro مفعّل
              </span>
            ) : (
              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-3 py-1 rounded-full border border-slate-200 font-arabic">
                الخطة المجانية
              </span>
            )}
          </div>
          
          <div className="space-y-3">
            {(usage.plan?.is_pro || usage.plan?.code === 'sanad_pro' || usage.plan === 'sanad_pro') ? (
              <div className="space-y-3">
                <div className="bg-emerald-50/40 rounded-2xl p-4 border border-emerald-100/40 text-right space-y-1.5">
                  <p className="text-xs text-emerald-800 font-semibold font-arabic flex items-center gap-1.5 justify-end">
                    <span>مرحبًا بك في باقة سند Pro</span>
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                  </p>
                  <p className="text-[11px] text-emerald-700/80 leading-relaxed font-arabic">
                    حسابك يتمتع بميزة الوصول غير المحدود لتفاصيل العمليات والتحقق منها ومطابقتها بالكامل وبدون قيود.
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-right">
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 block font-arabic">الخطة الحالية</span>
                    <span className="text-xs font-bold text-slate-800 font-arabic">{usage.plan?.name || 'سند Pro'}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 block font-arabic">الوصول هذا الشهر</span>
                    <span className="text-xs font-bold text-slate-800 font-mono">
                      {toLatinDigits(String(usage.used))} / {usage.limit >= 999999 ? 'غير محدود' : toLatinDigits(String(usage.limit))}
                    </span>
                  </div>
                </div>

                {usage.expires_at && (
                  <div className="text-[10px] text-slate-400 flex items-center gap-1 justify-end font-arabic">
                    <Clock className="w-3.5 h-3.5" />
                    <span>تاريخ انتهاء الاشتراك: {new Date(usage.expires_at).toLocaleDateString('ar-YE', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-arabic">عمليات الوصول المستخدمة:</span>
                    <span className="font-bold text-slate-800 font-mono">
                      {toLatinDigits(String(usage.used))} / {toLatinDigits(String(usage.limit || 50))}
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        (usage.used / (usage.limit || 50)) >= 0.9 ? 'bg-rose-500' : (usage.used / (usage.limit || 50)) >= 0.7 ? 'bg-amber-500' : 'bg-emerald-600'
                      }`}
                      style={{ width: `${Math.min(100, (usage.used / (usage.limit || 50)) * 100)}%` }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-arabic">الحد الأقصى الشهري: {toLatinDigits(String(usage.limit || 50))} عملية</span>
                    <span className="font-arabic">المتبقي: {toLatinDigits(String(usage.remaining))} عملية</span>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 text-right space-y-1.5">
                  <p className="text-[10px] text-slate-500 leading-relaxed font-arabic">
                    الخطة الحالية هي <span className="font-bold">{usage.plan?.name || 'سند المجاني'}</span>. للحصول على وصول غير محدود والقدرة على فتح ومطابقة أي إشعار مالي دون أي قيود شهرية، يُنصح بالترقية إلى باقة Pro.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowProUpgradeModal(true)}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs transition-all cursor-pointer shadow-md shadow-emerald-600/10 hover:shadow-emerald-600/20 active:scale-[0.98] flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="font-arabic font-bold">تفعيل باقة سند Pro</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section 1: Basic Profile Form */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 font-arabic">بياناتي الأساسية</h3>
          <p className="text-[10px] text-slate-400 font-arabic mt-0.5">
            المحافظة ورقم الهاتف والاسم الكامل مطلوبة لتفعيل ميزات التحقق الموثقة داخل سند.
          </p>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          {profileError && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-2xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{profileError}</span>
            </div>
          )}

          {profileSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-2xl flex items-start gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>{profileSuccess}</span>
            </div>
          )}

          {/* Input: Full Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 block font-arabic">الاسم الكامل</label>
            <div className="relative">
              <input
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setProfileError(null);
                }}
                placeholder="اكتب اسمك الكامل"
                className="w-full text-right text-xs px-3.5 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-slate-400 outline-none transition-all"
                required
              />
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <User className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Input: Phone Number */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 block font-arabic">رقم الهاتف (اليمن)</label>
            <div className="relative flex rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden focus-within:bg-white focus-within:border-slate-400 transition-all">
              <input
                type="text"
                value={localPhone}
                onChange={(e) => {
                  setLocalPhone(toLatinDigits(e.target.value).replace(/\D/g, '').substring(0, 9));
                  setProfileError(null);
                }}
                dir="ltr"
                placeholder="777634971"
                className="flex-1 text-left text-xs px-3.5 py-3 bg-transparent outline-none border-none font-mono text-slate-800"
                required
              />
              <span className="bg-slate-100 border-r border-slate-200 px-3.5 py-3 text-xs text-slate-500 font-mono flex items-center select-none" dir="ltr">
                +967
              </span>
            </div>
            <p className="text-[9px] text-slate-400 font-arabic mt-1">اكتب الـ 9 أرقام اليمنية مباشرة بدون مفتاح الدولة (مثال: 777634971).</p>
          </div>

          {/* Input: Governorate */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 block font-arabic">المحافظة</label>
            <div className="relative">
              <select
                value={governorate}
                onChange={(e) => {
                  setGovernorate(e.target.value);
                  setProfileError(null);
                }}
                className="w-full text-right text-xs px-3.5 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-slate-400 outline-none transition-all appearance-none cursor-pointer"
                required
              >
                <option value="">-- اختر محافظة الإقامة --</option>
                {GOVERNORATES.map((gov) => (
                  <option key={gov} value={gov}>
                    {gov}
                  </option>
                ))}
              </select>
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <MapPin className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={savingProfile}
            className="w-full bg-[#111111] hover:bg-black text-white font-bold py-3 px-4 rounded-2xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs font-arabic"
          >
            {savingProfile ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <span>حفظ البيانات</span>
            )}
          </button>
        </form>
      </div>

      {/* Section 2: Personal Financial Accounts (Personal Bookkeeping Only) */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 font-arabic">حساباتي المالية</h3>
          <p className="text-[10px] text-slate-400 font-arabic mt-1 leading-relaxed">
            يمكنك إضافة حساباتك المالية الشخصية لتسهيل تنظيم سجلك داخل سند لاحقًا.
          </p>
        </div>

        {/* Form: Add Financial Account */}
        <form onSubmit={handleAddAccount} className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-150">
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-500 font-arabic">إضافة حساب مالي شخصي</span>
          </div>

          {accountError && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{accountError}</span>
            </div>
          )}

          {accountSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-xl flex items-start gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>{accountSuccess}</span>
            </div>
          )}

          {/* Select: Financial Entity */}
          <div className="grid grid-cols-1 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 block font-arabic">الجهة المالية</label>
              <select
                value={financialEntity}
                onChange={(e) => {
                  setFinancialEntity(e.target.value);
                  setAccountError(null);
                }}
                className="w-full text-right text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-slate-400 outline-none transition-all cursor-pointer"
                required
              >
                <option value="">-- اختر المحفظة أو البنك --</option>
                {FINANCIAL_ENTITIES.map((ent) => (
                  <option key={ent} value={ent}>
                    {ent}
                  </option>
                ))}
              </select>
            </div>

            {/* Input: Account Number */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 block font-arabic">رقم الحساب أو رقم المحفظة</label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => {
                  setAccountNumber(toLatinDigits(e.target.value).replace(/\s+/g, ''));
                  setAccountError(null);
                }}
                dir="ltr"
                placeholder="مثال: 300123456"
                className="w-full text-left text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-slate-400 outline-none font-mono text-slate-800"
                required
              />
            </div>

            {/* Input: Account Holder Name */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 block font-arabic">اسم صاحب الحساب (اختياري)</label>
              <input
                type="text"
                value={accountHolderName}
                onChange={(e) => {
                  setAccountHolderName(e.target.value);
                  setAccountError(null);
                }}
                placeholder="الاسم كما يظهر في الإشعار المالي"
                className="w-full text-right text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-slate-400 outline-none text-slate-800"
              />
            </div>

            {/* Input: Account Label */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 block font-arabic">تسمية اختيارية للحساب (اختياري)</label>
              <input
                type="text"
                value={accountLabel}
                onChange={(e) => {
                  setAccountLabel(e.target.value);
                  setAccountError(null);
                }}
                placeholder="مثال: حسابي الرئيسي، محفظتي، الكريمي"
                className="w-full text-right text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-slate-400 outline-none text-slate-800"
              />
            </div>
          </div>

          {/* Submit Account */}
          <button
            type="submit"
            disabled={addingAccount}
            className="w-full bg-[#111111] hover:bg-black text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer text-xs font-arabic"
          >
            {addingAccount ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
            ) : (
              <>
                <Plus className="w-4 h-4 text-white" />
                <span>إضافة الحساب</span>
              </>
            )}
          </button>
        </form>

        {/* Accounts List Grid */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 block font-arabic">حساباتي المضافة</span>
            <span className="text-[10px] font-mono text-slate-400">{accounts.length} حسابات نشطة</span>
          </div>

          {loadingAccounts ? (
            <div className="p-6 text-center text-xs text-slate-400 font-arabic">جاري جلب قائمة الحسابات...</div>
          ) : accounts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl font-arabic">
              لم تقم بإضافة أي حساب مالي مالي شخصي بعد.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="bg-white border border-slate-200/80 p-3.5 rounded-2xl flex items-center justify-between gap-3 shadow-sm"
                >
                  <div className="flex items-center gap-3 text-right">
                    <div className="p-2 bg-slate-50 text-slate-700 border border-slate-100 rounded-xl">
                      <Landmark className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 font-arabic">{acc.financial_entity}</span>
                        {acc.account_label && (
                          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[8px] font-bold font-arabic">
                            {acc.account_label}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                        <div className="flex items-center gap-1">
                          <span className="font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 font-semibold text-slate-600">
                            {acc.account_number}
                          </span>
                          <button
                            onClick={() => handleCopyAccount(acc.id, acc.account_number)}
                            className={`p-1 rounded hover:bg-slate-100 transition-all cursor-pointer ${
                              copiedId === acc.id ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'
                            }`}
                            title="نسخ رقم الحساب"
                            type="button"
                          >
                            {copiedId === acc.id ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Clipboard className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        {acc.account_holder_name && (
                          <span className="text-slate-500 font-arabic truncate max-w-[120px]" title={acc.account_holder_name}>
                            ({acc.account_holder_name})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDisableAccount(acc.id)}
                    className="p-2 text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-xl transition-all cursor-pointer"
                    title="تعطيل الحساب"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Logout Action Area */}
      <div className="bg-slate-50 border border-slate-200/60 rounded-3xl p-4 text-center">
        <p className="text-[11px] text-slate-400 mb-3 font-arabic leading-relaxed">
          لتأمين معلوماتك الشخصية، يُنصح بتسجيل الخروج عند الانتهاء من العمل على أجهزة غير شخصية.
        </p>
        
        <button
          onClick={handleLogoutClick}
          disabled={loggingOut}
          id="btn_logout"
          className="w-full bg-[#111111] hover:bg-black text-white font-bold py-2.5 px-4 rounded-2xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs font-arabic"
        >
          {loggingOut ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
          ) : (
            <Power className="w-3.5 h-3.5" />
          )}
          <span>تسجيل الخروج الآمن</span>
        </button>
      </div>

      {/* Pro Activation Modal overlay */}
      {showProUpgradeModal && (
        <ProUpgradeModal
          user={user}
          profile={profile}
          onClose={() => setShowProUpgradeModal(false)}
          onSuccess={loadUsage}
        />
      )}

    </div>
  );
}
