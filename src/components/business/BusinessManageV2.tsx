import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowRight, CheckCircle2, ChevronDown, Clock, FileText,
  LayoutDashboard, Loader2, Menu, MessageSquare, Plus, Save, Store,
  Trash2, UserCheck, Users, WalletCards, X, Package
} from 'lucide-react';
import { getBusinessOperations, getUserBusinessContexts, updateBusinessProfile, type BusinessOperationItem } from '../../lib/businessApi';
import {
  deleteFinancialAccount, getBusinessManagementProfile, saveWorkingHours,
  setComplaintStatus, upsertFinancialAccount, type BusinessComplaint,
  type FinancialAccount, type ManagementBusinessProfile
} from '../../lib/businessManagementApi';
import BusinessWhatsAppCatalog from './BusinessWhatsAppCatalog';
import BusinessCustomers from './BusinessCustomers';
import BusinessTeam from './BusinessTeam';
import BusinessReports from './reports/BusinessReports';

interface Props { onNavigate: (page: string, token?: string) => void }
type Tab = 'overview' | 'catalog' | 'hours' | 'accounts' | 'customers' | 'team' | 'complaints' | 'reports';

const DAYS = [
  ['saturday', 'السبت'], ['sunday', 'الأحد'], ['monday', 'الاثنين'],
  ['tuesday', 'الثلاثاء'], ['wednesday', 'الأربعاء'], ['thursday', 'الخميس'], ['friday', 'الجمعة']
] as const;
const DEFAULT_HOURS = Object.fromEntries(DAYS.map(([key]) => [key, { open: '08:00', close: '22:00', closed: false }])) as Record<string, { open: string; close: string; closed: boolean }>;
const TABS = [
  { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
  { id: 'catalog', label: 'الكتالوج', icon: Package },
  { id: 'hours', label: 'الدوام والتواصل', icon: Clock },
  { id: 'accounts', label: 'الحسابات المالية', icon: WalletCards },
  { id: 'customers', label: 'إدارة العملاء', icon: Users },
  { id: 'team', label: 'فريق العمل', icon: UserCheck },
  { id: 'complaints', label: 'الشكاوى', icon: MessageSquare },
  { id: 'reports', label: 'التقارير', icon: FileText }
] as const;

export default function BusinessManageV2({ onNavigate }: Props) {
  const [business, setBusiness] = useState<ManagementBusinessProfile | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [complaints, setComplaints] = useState<BusinessComplaint[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [accName, setAccName] = useState('');
  const [accMulti, setAccMulti] = useState(false);
  const [accSingle, setAccSingle] = useState('');
  const [accYER, setAccYER] = useState('');
  const [accSAR, setAccSAR] = useState('');
  const [accUSD, setAccUSD] = useState('');
  const [operations, setOperations] = useState<BusinessOperationItem[]>([]);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationsError, setOperationsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const contexts = await getUserBusinessContexts();
      const current = contexts.owned_businesses?.[0] || null;
      if (!current) { setBusiness(null); return; }
      const full = await getBusinessManagementProfile(current.id);
      setBusiness(full);
      setHours(full.working_hours && Object.keys(full.working_hours).length ? full.working_hours : DEFAULT_HOURS);
      setAccounts(full.profile_sections?.financial_accounts || []);
      setComplaints(full.profile_sections?.complaints || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل إدارة النشاط.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadOperations = useCallback(async () => {
    if (!business) return;
    setOperationsLoading(true); setOperationsError(null);
    try { setOperations(await getBusinessOperations(business.id)); }
    catch { setOperationsError('تعذر تحميل عمليات النشاط.'); }
    finally { setOperationsLoading(false); }
  }, [business]);

  useEffect(() => { if (tab === 'reports') void loadOperations(); }, [tab, loadOperations]);

  const activeMeta = TABS.find((item) => item.id === tab) || TABS[0];
  const complaintCount = complaints.filter((item) => item.status === 'pending').length;
  const catalogCount = 0;
  const completeness = useMemo(() => {
    if (!business) return 0;
    const checks = [business.name, business.description, business.city, business.governorate, business.whatsapp, Object.keys(hours).length, accounts.length];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [accounts.length, business, hours]);

  const selectTab = (next: Tab) => { setTab(next); setMenuOpen(false); setError(null); setSuccess(null); };

  const saveIdentity = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!business) return;
    const form = new FormData(event.currentTarget);
    setSaving(true); setError(null); setSuccess(null);
    try {
      await updateBusinessProfile({
        p_business_id: business.id,
        p_name: String(form.get('name') || '').trim(),
        p_tagline: String(form.get('tagline') || '').trim() || null,
        p_description: String(form.get('description') || '').trim() || null,
        p_governorate: String(form.get('governorate') || '').trim(),
        p_city: String(form.get('city') || '').trim(),
        p_whatsapp: String(form.get('whatsapp') || '').trim() || null,
        p_address_text: String(form.get('address') || '').trim() || null,
        p_contact_links: {
          facebook: String(form.get('facebook') || '').trim() || null,
          instagram: String(form.get('instagram') || '').trim() || null,
          twitter: String(form.get('twitter') || '').trim() || null,
          website: String(form.get('website') || '').trim() || null
        }
      });
      setSuccess('تم حفظ معلومات النشاط والتحقق من إعادة تحميلها.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر حفظ معلومات النشاط.'); }
    finally { setSaving(false); }
  };

  const persistHours = async () => {
    if (!business) return; setSaving(true); setError(null); setSuccess(null);
    try { setHours(await saveWorkingHours(business.id, hours)); setSuccess('تم حفظ ساعات العمل بنجاح.'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر حفظ ساعات العمل.'); }
    finally { setSaving(false); }
  };

  const resetAccountForm = () => { setEditingAccount(null); setAccName(''); setAccMulti(false); setAccSingle(''); setAccYER(''); setAccSAR(''); setAccUSD(''); setAccountOpen(false); };
  const editAccount = (account: FinancialAccount) => {
    setEditingAccount(account); setAccName(account.name); setAccMulti(account.is_multicurrency);
    setAccSingle(account.account_number || ''); setAccYER(account.accounts?.YER || ''); setAccSAR(account.accounts?.SAR || ''); setAccUSD(account.accounts?.USD || ''); setAccountOpen(true);
  };
  const saveAccount = async (event: React.FormEvent) => {
    event.preventDefault(); if (!business || !accName.trim()) return; setSaving(true); setError(null); setSuccess(null);
    try {
      const next = await upsertFinancialAccount({ businessId: business.id, accountId: editingAccount?.id, name: accName, isMulticurrency: accMulti, accountNumber: accSingle, accounts: { YER: accYER || null, SAR: accSAR || null, USD: accUSD || null } });
      setAccounts(next); resetAccountForm(); setSuccess('تم حفظ الحساب المالي وظهر في القائمة.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر حفظ الحساب المالي.'); }
    finally { setSaving(false); }
  };
  const removeAccount = async (id: string) => {
    if (!business || !window.confirm('حذف هذا الحساب المالي؟')) return; setSaving(true);
    try { setAccounts(await deleteFinancialAccount(business.id, id)); setSuccess('تم حذف الحساب المالي.'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر حذف الحساب المالي.'); }
    finally { setSaving(false); }
  };
  const toggleComplaint = async (item: BusinessComplaint) => {
    if (!business) return; setSaving(true);
    try { setComplaints(await setComplaintStatus(business.id, item.id, item.status === 'pending' ? 'resolved' : 'pending')); setSuccess('تم تحديث حالة الشكوى.'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر تحديث الشكوى.'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (!business) return <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center"><Store className="mx-auto h-8 w-8 text-slate-400"/><p className="mt-3 text-sm font-bold">لا يوجد نشاط مملوك لإدارته.</p></div>;

  return (
    <div className="min-h-screen space-y-5 bg-slate-50/60 pb-14 font-arabic text-right" dir="rtl">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur">
        <button onClick={() => onNavigate('profile')} className="rounded-xl border border-slate-200 p-2.5"><ArrowRight className="h-4 w-4"/></button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">إدارة {business.name}</h1><p className="text-[10px] text-slate-400">مصدر موحّد ومرتبط بالملف العام</p></div>
        <button onClick={() => onNavigate('public-business-profile', business.slug)} className="rounded-xl bg-slate-900 px-3 py-2.5 text-[10px] font-bold text-white">عرض الملف العام</button>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 px-3">
        {success && <div className="flex gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4"/>{success}</div>}
        {error && <div className="flex gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="h-4 w-4"/>{error}</div>}

        <button onClick={() => setMenuOpen(true)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:hidden">
          <activeMeta.icon className="h-5 w-5"/><div className="flex-1"><span className="block text-[9px] text-slate-400">قسم إدارة النشاط</span><strong className="text-xs">{activeMeta.label}</strong></div><Menu className="h-5 w-5"/>
        </button>

        <div className="flex items-start gap-5">
          <aside className="hidden w-60 shrink-0 rounded-3xl border border-slate-200 bg-white p-3 lg:block">{TABS.map((item) => <button key={item.id} onClick={() => selectTab(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-xs font-bold ${tab===item.id?'bg-slate-900 text-white':'text-slate-600 hover:bg-slate-50'}`}><item.icon className="h-4 w-4"/><span className="flex-1 text-right">{item.label}</span>{item.id==='complaints'&&complaintCount>0&&<span>{complaintCount}</span>}</button>)}</aside>
          <main className="min-w-0 flex-1">
            {tab === 'overview' && <div className="space-y-4">
              <section className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">{business.name}</h2><p className="mt-1 text-xs text-slate-500">{business.display_tagline || 'ملف النشاط التجاري'}</p></div><div className="text-center"><strong className="block text-xl">{completeness}%</strong><span className="text-[9px] text-slate-400">جاهزية الملف</span></div></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-50 p-3"><strong className="block">{catalogCount}</strong><span className="text-[9px]">عناصر الكتالوج</span></div><div className="rounded-xl bg-slate-50 p-3"><strong className="block">{accounts.length}</strong><span className="text-[9px]">حسابات مالية</span></div><div className="rounded-xl bg-slate-50 p-3"><strong className="block">{complaintCount}</strong><span className="text-[9px]">شكاوى معلقة</span></div></div></section>
              <form onSubmit={saveIdentity} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 sm:grid-cols-2"><h3 className="sm:col-span-2 text-sm font-bold">الهوية والتواصل</h3>{[['name','اسم النشاط',business.name],['tagline','العبارة التعريفية',business.display_tagline||''],['governorate','المحافظة',business.governorate||''],['city','المدينة',business.city||''],['whatsapp','واتساب',business.whatsapp||''],['address','العنوان',business.address_text||''],['facebook','فيسبوك',business.contact_links?.facebook||''],['instagram','إنستغرام',business.contact_links?.instagram||''],['twitter','X / تويتر',business.contact_links?.twitter||''],['website','الموقع الإلكتروني',business.contact_links?.website||'']].map(([name,label,value])=><label key={name} className="space-y-1 text-[10px] font-bold text-slate-600">{label}<input name={name} defaultValue={value} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></label>)}<label className="space-y-1 text-[10px] font-bold text-slate-600 sm:col-span-2">الوصف<textarea name="description" defaultValue={business.description||''} rows={4} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></label><button disabled={saving} className="sm:col-span-2 flex justify-center gap-2 rounded-2xl bg-slate-900 p-3 text-xs font-bold text-white"><Save className="h-4 w-4"/>حفظ المعلومات</button></form>
            </div>}

            {tab === 'catalog' && <BusinessWhatsAppCatalog onNavigate={onNavigate} />}

            {tab === 'hours' && <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-bold">ساعات العمل الأسبوعية</h2><div className="divide-y divide-slate-100">{DAYS.map(([key,label])=><div key={key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-3"><span className="text-xs font-bold">{label}</span><input type="time" disabled={hours[key]?.closed} value={hours[key]?.open||'08:00'} onChange={e=>setHours(v=>({...v,[key]:{...v[key],open:e.target.value}}))} className="rounded-lg border p-2 text-xs"/><input type="time" disabled={hours[key]?.closed} value={hours[key]?.close||'22:00'} onChange={e=>setHours(v=>({...v,[key]:{...v[key],close:e.target.value}}))} className="rounded-lg border p-2 text-xs"/><label className="col-span-3 flex items-center gap-2 text-[10px] text-slate-500"><input type="checkbox" checked={hours[key]?.closed||false} onChange={e=>setHours(v=>({...v,[key]:{...v[key],closed:e.target.checked}}))}/>مغلق</label></div>)}</div><button onClick={() => void persistHours()} disabled={saving} className="w-full rounded-2xl bg-slate-900 p-3 text-xs font-bold text-white">حفظ ساعات العمل</button></section>}

            {tab === 'accounts' && <div className="space-y-4"><div className="flex justify-between"><div><h2 className="text-sm font-bold">الحسابات المالية</h2><p className="text-[10px] text-slate-400">تظهر الحسابات المحفوظة في الملف العام.</p></div><button onClick={()=>setAccountOpen(true)} className="flex gap-1 rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-bold text-white"><Plus className="h-4 w-4"/>إضافة</button></div>{accountOpen&&<form onSubmit={saveAccount} className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2"><input value={accName} onChange={e=>setAccName(e.target.value)} placeholder="اسم الجهة المالية" required className="rounded-xl border p-3 text-xs sm:col-span-2"/><label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" checked={accMulti} onChange={e=>setAccMulti(e.target.checked)}/>حساب متعدد العملات</label>{accMulti?<><input value={accYER} onChange={e=>setAccYER(e.target.value)} placeholder="YER" className="rounded-xl border p-3 text-xs"/><input value={accSAR} onChange={e=>setAccSAR(e.target.value)} placeholder="SAR" className="rounded-xl border p-3 text-xs"/><input value={accUSD} onChange={e=>setAccUSD(e.target.value)} placeholder="USD" className="rounded-xl border p-3 text-xs"/></>:<input value={accSingle} onChange={e=>setAccSingle(e.target.value)} placeholder="رقم الحساب" required className="rounded-xl border p-3 text-xs sm:col-span-2"/>}<div className="flex gap-2 sm:col-span-2"><button type="button" onClick={resetAccountForm} className="flex-1 rounded-xl border p-3 text-xs">إلغاء</button><button disabled={saving} className="flex-1 rounded-xl bg-slate-900 p-3 text-xs font-bold text-white">حفظ</button></div></form>}<div className="divide-y rounded-2xl border bg-white">{accounts.length?accounts.map(a=><div key={a.id} className="flex items-center gap-3 p-4"><div className="flex-1"><h3 className="text-xs font-bold">{a.name}</h3><p className="mt-1 font-mono text-[10px] text-slate-500">{a.is_multicurrency?Object.entries(a.accounts||{}).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join(' · '):a.account_number}</p></div><button onClick={()=>editAccount(a)} className="text-[10px] font-bold">تعديل</button><button onClick={()=>void removeAccount(a.id)} className="p-2 text-rose-600"><Trash2 className="h-4 w-4"/></button></div>):<p className="p-8 text-center text-xs text-slate-400">لا توجد حسابات مالية.</p>}</div></div>}

            {tab === 'customers' && <BusinessCustomers onNavigate={onNavigate} businessId={business.id}/>} 
            {tab === 'team' && <BusinessTeam onNavigate={onNavigate}/>} 
            {tab === 'complaints' && <div className="space-y-3"><h2 className="text-sm font-bold">الشكاوى والملاحظات</h2>{complaints.length?complaints.map(item=><article key={item.id} className="rounded-2xl border bg-white p-4"><div className="flex justify-between"><strong className="text-xs">{item.name||'مستخدم'}</strong><span className={`text-[9px] ${item.status==='pending'?'text-amber-700':'text-emerald-700'}`}>{item.status==='pending'?'قيد المتابعة':'تم الحل'}</span></div><p className="mt-2 text-xs leading-6 text-slate-600">{item.text||'—'}</p><button onClick={()=>void toggleComplaint(item)} disabled={saving} className="mt-3 rounded-xl border px-3 py-2 text-[10px] font-bold">{item.status==='pending'?'تحديد كمحلولة':'إعادة فتحها'}</button></article>):<p className="rounded-2xl border bg-white p-8 text-center text-xs text-slate-400">لا توجد شكاوى مسجلة.</p>}</div>}
            {tab === 'reports' && <BusinessReports business={business} operations={operations} loading={operationsLoading} operationsError={operationsError} onRefreshOperations={()=>void loadOperations()} onNavigate={onNavigate}/>} 
          </main>
        </div>
      </div>

      {menuOpen&&<div className="fixed inset-0 z-[100] flex items-end bg-slate-950/60 lg:hidden"><button className="absolute inset-0" onClick={()=>setMenuOpen(false)}/><section className="relative z-10 w-full rounded-t-[28px] bg-white p-4 pb-[calc(16px+env(safe-area-inset-bottom))]"><div className="mb-4 flex justify-between"><div><h2 className="text-sm font-bold">أقسام إدارة النشاط</h2><p className="text-[10px] text-slate-400">ثمانية أقسام موحّدة</p></div><button onClick={()=>setMenuOpen(false)} className="rounded-xl border p-2"><X className="h-4 w-4"/></button></div><div className="grid grid-cols-2 gap-2">{TABS.map(item=><button key={item.id} onClick={()=>selectTab(item.id)} className={`flex items-center gap-2 rounded-2xl border p-4 text-xs font-bold ${tab===item.id?'bg-slate-900 text-white':'bg-white'}`}><item.icon className="h-4 w-4"/>{item.label}</button>)}</div></section></div>}
    </div>
  );
}
