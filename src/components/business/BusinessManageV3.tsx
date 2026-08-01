import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  LayoutDashboard,
  Loader2,
  Menu,
  MessageSquare,
  Package,
  Store,
  UserCheck,
  Users
} from 'lucide-react';
import {
  getBusinessOperations,
  getUserBusinessContexts,
  type BusinessOperationItem
} from '../../lib/businessApi';
import {
  getBusinessDashboardSummary,
  getBusinessManagementProfile,
  saveWorkingHours,
  setComplaintStatus,
  type BusinessComplaint,
  type BusinessDashboardSummary,
  type ManagementBusinessProfile
} from '../../lib/businessManagementApi';
import {
  defaultBusinessWorkingHours,
  normalizeBusinessWorkingHours,
  type BusinessWorkingHours
} from '../../lib/businessWorkingHours';
import { buildPublicBusinessUrl } from '../../lib/urlUtils';
import AnimatedNumber from '../ui/AnimatedNumber';
import ResponsiveSheet from '../ui/ResponsiveSheet';
import BusinessWhatsAppCatalog from './BusinessWhatsAppCatalog';
import BusinessCustomers from './BusinessCustomers';
import BusinessTeam from './BusinessTeam';
import BusinessWorkingHoursEditor from './BusinessWorkingHoursEditor';
import BusinessReports from './reports/BusinessReports';

interface Props {
  onNavigate: (page: string, token?: string) => void;
}

type Tab = 'overview' | 'catalog' | 'hours' | 'customers' | 'team' | 'complaints' | 'reports';

type TabMeta = {
  id: Tab;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
  group: 'management' | 'monitoring';
};

const TABS: TabMeta[] = [
  { id: 'overview', label: 'الرئيسية', description: 'ملخص النشاط وأقسام الإدارة', icon: LayoutDashboard, group: 'management' },
  { id: 'customers', label: 'العملاء', description: 'العملاء والارتباط والتواصل', icon: Users, group: 'management' },
  { id: 'catalog', label: 'الكتالوج', description: 'المنتجات والخدمات والوسائط', icon: Package, group: 'management' },
  { id: 'team', label: 'فريق العمل', description: 'الأعضاء والأدوار والصلاحيات', icon: UserCheck, group: 'management' },
  { id: 'hours', label: 'ساعات العمل والدوام', description: 'أوقات العمل والتنظيم التشغيلي', icon: Clock, group: 'management' },
  { id: 'reports', label: 'التقارير', description: 'الأداء والعمليات والمؤشرات', icon: FileText, group: 'monitoring' },
  { id: 'complaints', label: 'الشكاوى', description: 'الملاحظات والمتابعة والحلول', icon: MessageSquare, group: 'monitoring' }
];

function statusLabel(status?: string | null) {
  if (status === 'published') return 'منشور';
  if (status === 'pending_review') return 'قيد المراجعة';
  if (status === 'suspended') return 'معلّق';
  return 'مسودة';
}

export default function BusinessManageV3({ onNavigate }: Props) {
  const reduceMotion = useReducedMotion();
  const [business, setBusiness] = useState<ManagementBusinessProfile | null>(null);
  const [dashboard, setDashboard] = useState<BusinessDashboardSummary | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hours, setHours] = useState<BusinessWorkingHours>(defaultBusinessWorkingHours());
  const [complaints, setComplaints] = useState<BusinessComplaint[]>([]);
  const [operations, setOperations] = useState<BusinessOperationItem[]>([]);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationsError, setOperationsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const contexts = await getUserBusinessContexts();
      const current = contexts.owned_businesses?.[0] || null;
      if (!current) {
        setBusiness(null);
        setDashboard(null);
        return;
      }
      const [full, summary] = await Promise.all([
        getBusinessManagementProfile(current.id),
        getBusinessDashboardSummary(current.id)
      ]);
      setBusiness(full);
      setDashboard(summary);
      setHours(normalizeBusinessWorkingHours(full.working_hours));
      setComplaints(full.profile_sections?.complaints || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل إدارة النشاط.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadOperations = useCallback(async () => {
    if (!business) return;
    setOperationsLoading(true);
    setOperationsError(null);
    try {
      setOperations(await getBusinessOperations(business.id));
    } catch {
      setOperationsError('تعذر تحميل عمليات النشاط.');
    } finally {
      setOperationsLoading(false);
    }
  }, [business]);

  useEffect(() => {
    if (tab === 'reports') void loadOperations();
  }, [tab, loadOperations]);

  const activeMeta = TABS.find(item => item.id === tab) || TABS[0];
  const complaintCount = dashboard?.complaints.pending ?? complaints.filter(item => item.status === 'pending').length;

  const selectTab = (next: Tab) => {
    setTab(next);
    setMenuOpen(false);
    setError(null);
    setSuccess(null);
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const persistHours = async () => {
    if (!business) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await saveWorkingHours(business.id, normalizeBusinessWorkingHours(hours));
      setHours(normalizeBusinessWorkingHours(saved));
      setSuccess('تم حفظ ساعات العمل والدوام وانعكاسها على الملف العام.');
      setDashboard(await getBusinessDashboardSummary(business.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ ساعات العمل.');
    } finally {
      setSaving(false);
    }
  };

  const toggleComplaint = async (item: BusinessComplaint) => {
    if (!business) return;
    setSaving(true);
    setError(null);
    try {
      setComplaints(await setComplaintStatus(business.id, item.id, item.status === 'pending' ? 'resolved' : 'pending'));
      setSuccess('تم تحديث حالة الشكوى.');
      setDashboard(await getBusinessDashboardSummary(business.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحديث الشكوى.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (!business) return <div className="border-y border-slate-200 bg-white p-8 text-center sm:mx-3 sm:rounded-3xl sm:border"><Store className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 text-sm font-bold">لا يوجد نشاط مملوك لإدارته.</p></div>;

  const metrics = [
    ['عناصر الكتالوج', dashboard?.catalog.total ?? 0],
    ['العملاء', dashboard?.customers.total ?? 0],
    ['العمليات', dashboard?.operations.total ?? 0],
    ['أعضاء الفريق', dashboard?.team.active ?? 0]
  ] as const;

  const sectionCard = (item: TabMeta, index: number) => (
    <motion.button
      key={item.id}
      type="button"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : index * 0.04 }}
      onClick={() => selectTab(item.id)}
      className="flex min-h-[92px] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-right shadow-[0_6px_18px_rgba(15,23,42,0.035)] active:scale-[.99]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-800">
        <item.icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-xs text-slate-950">{item.label}</strong>
        <span className="mt-1 block text-[9px] leading-5 text-slate-500">{item.description}</span>
      </span>
      {item.id === 'complaints' && complaintCount > 0 && (
        <span className="rounded-full bg-rose-500 px-2 py-1 text-[9px] font-bold text-white">{complaintCount}</span>
      )}
    </motion.button>
  );

  const renderOverview = () => {
    const management = TABS.filter(item => item.group === 'management' && item.id !== 'overview');
    const monitoring = TABS.filter(item => item.group === 'monitoring');
    return (
      <div className="space-y-4">
        <motion.section initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="rounded-[1.8rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">{business.name}</h2>
              <p className="mt-1 text-xs text-slate-500">{business.display_tagline || 'ملف النشاط التجاري'}</p>
            </div>
            <div className="shrink-0 text-center">
              <strong className="block text-xl"><AnimatedNumber value={dashboard?.profile.score ?? 0} suffix="%" /></strong>
              <span className="text-[9px] text-slate-400">جاهزية الملف</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {metrics.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3 text-center">
                <strong className="block text-base"><AnimatedNumber value={value} /></strong>
                <span className="text-[9px] text-slate-500">{label}</span>
              </div>
            ))}
          </div>
          {!!dashboard?.profile.missing.length && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[10px] leading-5 text-amber-800">ما زال الملف يحتاج إلى استكمال {dashboard.profile.missing.length} عناصر قبل بلوغ الجاهزية الكاملة.</p>}
        </motion.section>

        <section>
          <div className="mb-2 px-1">
            <span className="text-[9px] font-bold text-emerald-700">إدارة النشاط</span>
            <h2 className="mt-0.5 text-sm font-black text-slate-950">البيانات والفريق والتشغيل</h2>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{management.map(sectionCard)}</div>
        </section>

        <section>
          <div className="mb-2 px-1">
            <span className="text-[9px] font-bold text-emerald-700">المتابعة والرقابة</span>
            <h2 className="mt-0.5 text-sm font-black text-slate-950">النتائج والملاحظات</h2>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{monitoring.map((item, index) => sectionCard(item, management.length + index))}</div>
        </section>
      </div>
    );
  };

  const renderTab = () => {
    if (tab === 'overview') return renderOverview();
    if (tab === 'catalog') return <BusinessWhatsAppCatalog onNavigate={onNavigate} />;
    if (tab === 'hours') return <BusinessWorkingHoursEditor hours={hours} saving={saving} onChange={setHours} onSave={() => void persistHours()} />;
    if (tab === 'customers') return <BusinessCustomers onNavigate={onNavigate} businessId={business.id} />;
    if (tab === 'team') return <BusinessTeam onNavigate={onNavigate} />;
    if (tab === 'complaints') return <div className="space-y-3"><h2 className="px-2 text-sm font-bold sm:px-0">الشكاوى والملاحظات</h2>{complaints.length ? complaints.map(item => <article key={item.id} className="border-y bg-white p-4 sm:rounded-2xl sm:border"><div className="flex justify-between"><strong className="text-xs">{item.name || 'مستخدم'}</strong><span className={`text-[9px] ${item.status === 'pending' ? 'text-amber-700' : 'text-emerald-700'}`}>{item.status === 'pending' ? 'قيد المتابعة' : 'تم الحل'}</span></div><p className="mt-2 text-xs leading-6 text-slate-600">{item.text || '—'}</p><button onClick={() => void toggleComplaint(item)} disabled={saving} className="mt-3 rounded-xl border px-3 py-2 text-[10px] font-bold">{item.status === 'pending' ? 'تحديد كمحلولة' : 'إعادة فتحها'}</button></article>) : <p className="border-y bg-white p-8 text-center text-xs text-slate-400 sm:rounded-2xl sm:border">لا توجد شكاوى مسجلة.</p>}</div>;
    return <BusinessReports business={business} operations={operations} loading={operationsLoading} operationsError={operationsError} onRefreshOperations={() => void loadOperations()} onNavigate={onNavigate} />;
  };

  return (
    <div className="min-h-screen bg-slate-50/60 pb-14 font-arabic text-right" dir="rtl">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-2 py-2.5 backdrop-blur sm:px-4">
        <button onClick={() => onNavigate('profile')} className="rounded-xl border border-slate-200 p-2.5" aria-label="العودة"><ArrowRight className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">إدارة {business.name}</h1><p className="text-[10px] text-slate-400">{statusLabel(dashboard?.profile.public_status)}</p></div>
        <a href={buildPublicBusinessUrl(business.slug)} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-slate-900 px-3 py-2.5 text-[10px] font-bold text-white">عرض الملف</a>
      </header>

      <div className="w-full space-y-3 px-0.5 py-3 sm:px-3 lg:px-5">
        {success && <div className="mx-1 flex gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{success}</div>}
        {error && <div className="mx-1 flex gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

        {tab !== 'overview' && (
          <button onClick={() => setMenuOpen(true)} className="flex w-full items-center gap-3 border-y border-slate-200 bg-white px-3 py-3.5 sm:rounded-2xl sm:border lg:hidden">
            <activeMeta.icon className="h-5 w-5" />
            <div className="flex-1"><span className="block text-[9px] text-slate-400">قسم إدارة النشاط</span><strong className="text-xs">{activeMeta.label}</strong></div>
            <Menu className="h-5 w-5" />
          </button>
        )}

        <div className="flex items-start gap-4">
          <aside className="hidden w-56 shrink-0 rounded-3xl border border-slate-200 bg-white p-2 lg:block">
            {TABS.map(item => <button key={item.id} onClick={() => selectTab(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-xs font-bold ${tab === item.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><item.icon className="h-4 w-4" /><span className="flex-1 text-right">{item.label}</span>{item.id === 'complaints' && complaintCount > 0 && <span>{complaintCount}</span>}</button>)}
          </aside>
          <main className="min-w-0 flex-1"><AnimatePresence mode="wait" initial={false}><motion.div key={tab} initial={reduceMotion ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }} transition={{ duration: reduceMotion ? 0 : 0.22 }}>{renderTab()}</motion.div></AnimatePresence></main>
        </div>
      </div>

      <ResponsiveSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="أقسام إدارة النشاط" description="الإدارة والتشغيل في مكان واحد">
        <div className="grid grid-cols-2 gap-2">
          {TABS.map((item, index) => <motion.button key={item.id} type="button" initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : index * 0.035 }} onClick={() => selectTab(item.id)} className={`flex min-h-14 items-center gap-2 rounded-2xl border p-3.5 text-xs font-bold ${tab === item.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800'}`}><item.icon className="h-4 w-4" /><span className="text-right">{item.label}</span>{item.id === 'complaints' && complaintCount > 0 && <span className="mr-auto rounded-full bg-rose-500 px-1.5 py-0.5 text-[8px] text-white">{complaintCount}</span>}</motion.button>)}
        </div>
      </ResponsiveSheet>
    </div>
  );
}
