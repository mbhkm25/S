import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Clock,
  FileText,
  LayoutDashboard,
  LayoutTemplate,
  Loader2,
  Menu,
  MessageSquare,
  Package,
  RefreshCw,
  Store,
  UserCheck,
  Users,
  WalletCards
} from 'lucide-react';
import {
  getBusinessOperations,
  getUserBusinessContexts,
  type BusinessOperationItem
} from '../../lib/businessApi';
import {
  getActiveManagedBusinessId,
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
import BusinessCustomers from './BusinessCustomers';
import BusinessFinancialAccountsCenter from './BusinessFinancialAccountsCenter';
import BusinessReports from './reports/BusinessReports';
import BusinessTeam from './BusinessTeam';
import BusinessWhatsAppCatalog from './BusinessWhatsAppCatalog';
import BusinessWorkingHoursEditor from './BusinessWorkingHoursEditor';

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
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hours, setHours] = useState<BusinessWorkingHours>(defaultBusinessWorkingHours());
  const [complaints, setComplaints] = useState<BusinessComplaint[]>([]);
  const [operations, setOperations] = useState<BusinessOperationItem[]>([]);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationsError, setOperationsError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const contexts = await getUserBusinessContexts();
      const owned = contexts.owned_businesses || [];
      const activeBusinessId = getActiveManagedBusinessId();
      const current = owned.find(item => item.id === activeBusinessId) || owned[0] || null;

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
      setRefreshing(false);
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
    setSuccess(null);
    try {
      const next = await setComplaintStatus(
        business.id,
        item.id,
        item.status === 'pending' ? 'resolved' : 'pending'
      );
      setComplaints(next);
      setSuccess('تم تحديث حالة الشكوى.');
      setDashboard(await getBusinessDashboardSummary(business.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحديث الشكوى.');
    } finally {
      setSaving(false);
    }
  };

  const managementTabs = useMemo(
    () => TABS.filter(item => item.group === 'management' && item.id !== 'overview'),
    []
  );
  const monitoringTabs = useMemo(
    () => TABS.filter(item => item.group === 'monitoring'),
    []
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-7 w-7 animate-spin" />
        <span className="text-xs font-bold">جارٍ تجهيز إدارة النشاط…</span>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="mx-3 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Store className="mx-auto h-9 w-9 text-slate-400" />
        <p className="mt-3 text-sm font-bold">لا يوجد نشاط مملوك لإدارته.</p>
        <button type="button" onClick={() => onNavigate('profile')} className="mt-4 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white">
          العودة إلى حسابي
        </button>
      </div>
    );
  }

  const metrics = [
    { label: 'عناصر الكتالوج', value: dashboard?.catalog.total ?? 0, target: 'catalog' as Tab },
    { label: 'العملاء', value: dashboard?.customers.total ?? 0, target: 'customers' as Tab },
    { label: 'العمليات', value: dashboard?.operations.total ?? 0, target: 'reports' as Tab },
    { label: 'أعضاء الفريق', value: dashboard?.team.active ?? 0, target: 'team' as Tab }
  ];

  const openPaymentInbox = () => {
    window.location.assign('/payment-inbox.html');
  };

  const sectionCard = (item: TabMeta, index: number) => (
    <motion.button
      key={item.id}
      type="button"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : index * 0.035 }}
      onClick={() => selectTab(item.id)}
      className="group flex min-h-[112px] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-3.5 text-right shadow-[0_6px_18px_rgba(15,23,42,0.035)] transition active:scale-[.985] sm:min-h-[96px] sm:flex-row sm:items-center sm:gap-3"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-800 transition group-hover:bg-slate-900 group-hover:text-white">
        <item.icon className="h-5 w-5" />
      </span>
      <span className="mt-3 min-w-0 flex-1 sm:mt-0">
        <strong className="block text-[13px] leading-5 text-slate-950">{item.label}</strong>
        <span className="mt-1 block text-[10px] leading-5 text-slate-500">{item.description}</span>
      </span>
      <span className="flex w-full items-center justify-between pt-2 sm:w-auto sm:justify-end sm:pt-0">
        {item.id === 'complaints' && complaintCount > 0 && (
          <span className="rounded-full bg-rose-500 px-2 py-1 text-[10px] font-bold text-white">{complaintCount}</span>
        )}
        <ChevronLeft className="h-4 w-4 text-slate-300" />
      </span>
    </motion.button>
  );

  const renderOverview = () => (
    <div className="space-y-5">
      <section aria-labelledby="business-core-tools-title">
        <div className="mb-2 px-1">
          <span className="text-[10px] font-bold text-emerald-700">الوصول السريع</span>
          <h2 id="business-core-tools-title" className="mt-0.5 text-base font-black text-slate-950">التشغيل والهوية المالية</h2>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">المسارات الأكثر استخدامًا لتشغيل النشاط وإدارة ظهوره وحساباته.</p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={openPaymentInbox}
            className="flex w-full items-center gap-3 rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 text-right shadow-[0_10px_28px_rgba(16,185,129,0.08)] active:scale-[.99]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
              <WalletCards className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold text-emerald-700">تشغيل المدفوعات</span>
              <strong className="mt-0.5 block text-sm text-slate-950">وارد المدفوعات</strong>
              <span className="mt-1 block text-[10px] leading-5 text-slate-500">استلام العمليات بين أعضاء الفريق وإكمال كل عملية باسم منفذها.</span>
            </span>
            <ChevronLeft className="h-5 w-5 text-emerald-500" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('business-manage-profile')}
            className="flex w-full items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 text-right shadow-[0_8px_24px_rgba(15,23,42,0.04)] active:scale-[.99]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <LayoutTemplate className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold text-emerald-700">الظهور العام للنشاط</span>
              <strong className="mt-0.5 block text-sm text-slate-950">الملف العام</strong>
              <span className="mt-1 block text-[10px] leading-5 text-slate-500">الهوية البصرية والبيانات والتواصل وما يراه العملاء.</span>
            </span>
            <ChevronLeft className="h-5 w-5 text-slate-300" />
          </button>

          <BusinessFinancialAccountsCenter />
        </div>
      </section>

      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[1.8rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{business.name}</h2>
            <p className="mt-1 text-xs text-slate-500">{business.display_tagline || 'ملف النشاط التجاري'}</p>
          </div>
          <div className="shrink-0 text-center">
            <strong className="block text-xl"><AnimatedNumber value={dashboard?.profile.score ?? 0} suffix="%" /></strong>
            <span className="text-[10px] text-slate-400">جاهزية الملف</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metrics.map(metric => (
            <button
              type="button"
              key={metric.label}
              onClick={() => selectTab(metric.target)}
              className="rounded-2xl bg-slate-50 p-3 text-center active:scale-[.98]"
            >
              <strong className="block text-lg"><AnimatedNumber value={metric.value} /></strong>
              <span className="text-[10px] text-slate-500">{metric.label}</span>
            </button>
          ))}
        </div>

        {!!dashboard?.profile.missing.length && (
          <button
            type="button"
            onClick={() => onNavigate('business-manage-profile')}
            className="mt-3 flex w-full items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-right text-[10px] leading-5 text-amber-800"
          >
            <span>ما زال الملف يحتاج إلى استكمال {dashboard.profile.missing.length} عناصر.</span>
            <ChevronLeft className="h-4 w-4 shrink-0" />
          </button>
        )}
      </motion.section>

      <section>
        <div className="mb-2 px-1">
          <span className="text-[10px] font-bold text-emerald-700">إدارة النشاط</span>
          <h2 className="mt-0.5 text-base font-black text-slate-950">البيانات والفريق والتشغيل</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">{managementTabs.map(sectionCard)}</div>
      </section>

      <section>
        <div className="mb-2 px-1">
          <span className="text-[10px] font-bold text-emerald-700">المتابعة والرقابة</span>
          <h2 className="mt-0.5 text-base font-black text-slate-950">النتائج والملاحظات</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {monitoringTabs.map((item, index) => sectionCard(item, managementTabs.length + index))}
        </div>
      </section>
    </div>
  );

  const renderComplaints = () => (
    <div className="space-y-3">
      <div className="px-1">
        <h2 className="text-base font-black">الشكاوى والملاحظات</h2>
        <p className="mt-1 text-[11px] text-slate-500">متابعة الملاحظات وتحديث حالتها التشغيلية.</p>
      </div>
      {complaints.length ? complaints.map(item => (
        <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <strong className="text-sm">{item.name || 'مستخدم'}</strong>
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {item.status === 'pending' ? 'قيد المتابعة' : 'تم الحل'}
            </span>
          </div>
          <p className="mt-3 text-xs leading-6 text-slate-600">{item.text || '—'}</p>
          <button
            type="button"
            onClick={() => void toggleComplaint(item)}
            disabled={saving}
            className="mt-3 min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold disabled:opacity-50"
          >
            {item.status === 'pending' ? 'تحديد كمحلولة' : 'إعادة فتحها'}
          </button>
        </article>
      )) : (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">لا توجد شكاوى مسجلة.</p>
      )}
    </div>
  );

  const renderTab = () => {
    if (tab === 'overview') return renderOverview();
    if (tab === 'catalog') return <BusinessWhatsAppCatalog onNavigate={onNavigate} />;
    if (tab === 'hours') return <BusinessWorkingHoursEditor hours={hours} saving={saving} onChange={setHours} onSave={() => void persistHours()} />;
    if (tab === 'customers') return <BusinessCustomers onNavigate={onNavigate} businessId={business.id} />;
    if (tab === 'team') return <BusinessTeam onNavigate={onNavigate} />;
    if (tab === 'complaints') return renderComplaints();
    return <BusinessReports business={business} operations={operations} loading={operationsLoading} operationsError={operationsError} onRefreshOperations={() => void loadOperations()} onNavigate={onNavigate} />;
  };

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16 font-arabic text-right" dir="rtl">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-4">
        <button type="button" onClick={() => onNavigate('profile')} className="rounded-xl border border-slate-200 p-2.5" aria-label="العودة إلى حسابي">
          <ArrowRight className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-black">إدارة {business.name}</h1>
          <p className="text-[10px] text-slate-400">{statusLabel(dashboard?.profile.public_status)} · {activeMeta.label}</p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="rounded-xl border border-slate-200 p-2.5 text-slate-600 disabled:opacity-50"
          aria-label="تحديث بيانات النشاط"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <a href={buildPublicBusinessUrl(business.slug)} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-slate-900 px-3 py-2.5 text-[10px] font-bold text-white">
          عرض الملف
        </a>
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-3 px-3 py-4 sm:px-4 lg:px-6">
        {success && (
          <div role="status" className="flex gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />{success}
          </div>
        )}
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs leading-5 text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => void load(true)} className="font-bold underline">إعادة المحاولة</button>
          </div>
        )}

        {tab !== 'overview' && (
          <div className="grid grid-cols-[1fr_auto] gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => selectTab('overview')}
              className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 text-right"
            >
              <ArrowRight className="h-4 w-4" />
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] text-slate-400">العودة إلى</span>
                <strong className="block truncate text-xs">رئيسية إدارة النشاط</strong>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex min-h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-bold"
              aria-label="فتح جميع أقسام إدارة النشاط"
            >
              <Menu className="h-5 w-5" />
              الأقسام
            </button>
          </div>
        )}

        <div className="flex items-start gap-4">
          <aside className="sticky top-20 hidden w-60 shrink-0 rounded-3xl border border-slate-200 bg-white p-2 lg:block">
            {TABS.map(item => (
              <button
                type="button"
                key={item.id}
                onClick={() => selectTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-xs font-bold ${tab === item.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1 text-right">{item.label}</span>
                {item.id === 'complaints' && complaintCount > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[9px] text-white">{complaintCount}</span>}
              </button>
            ))}
          </aside>

          <main className="min-w-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={reduceMotion ? false : { opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
              >
                {renderTab()}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <ResponsiveSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="أقسام إدارة النشاط" description="انتقل مباشرة إلى القسم المطلوب">
        <div className="grid grid-cols-2 gap-2">
          {TABS.map((item, index) => (
            <motion.button
              key={item.id}
              type="button"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : index * 0.03 }}
              onClick={() => selectTab(item.id)}
              className={`flex min-h-[86px] flex-col items-start justify-between rounded-2xl border p-3.5 text-right ${tab === item.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800'}`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <item.icon className="h-5 w-5" />
                {item.id === 'complaints' && complaintCount > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[9px] text-white">{complaintCount}</span>}
              </div>
              <span>
                <strong className="block text-xs">{item.label}</strong>
                <span className={`mt-1 block text-[9px] leading-4 ${tab === item.id ? 'text-slate-300' : 'text-slate-500'}`}>{item.description}</span>
              </span>
            </motion.button>
          ))}
        </div>
      </ResponsiveSheet>
    </div>
  );
}
