import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, BookOpen, BriefcaseBusiness, ChevronLeft, CirclePlus, FileText, FolderOpen,
  Loader2, MessageSquareText, Pin, PinOff, RefreshCw, Search, Settings2, SlidersHorizontal,
  UserRound, Users, WalletCards, Wrench, Database, ListChecks, TriangleAlert,
} from 'lucide-react';
import type { BusinessProfile } from '../../lib/businessApi';
import { navigateProduct } from '../../lib/productNavigation';
import { authorizedProjectBusinesses, getProjectBusinessContexts, invalidateProjectQuickAccess, openNewProjectConversation, projectThreads } from './projectQuickAccess';
import {
  archiveSanadAgentThread,
  setSanadProjectThreadPinned,
  type SanadAgentThreadSummary,
} from '../assistant/assistantWorkspaceApi';

type ProjectKind = 'personal' | 'business';
type View = 'conversations' | 'sources' | 'tools' | 'library' | 'manage';

type BusinessOption = Pick<BusinessProfile, 'id' | 'name' | 'workspace_role'>;

function routeState(kind: ProjectKind): { view: View; businessId: string | null } {
  const url = new URL(window.location.href);
  const value = url.searchParams.get('view');
  const view = (['conversations','sources','tools','library','manage'] as View[]).includes(value as View)
    ? value as View
    : 'conversations';
  return {
    view,
    businessId: kind === 'business' ? url.searchParams.get('business') : null,
  };
}

function projectPath(kind: ProjectKind, view: View, businessId?: string | null): string {
  const base = kind === 'personal' ? 'financial' : 'commercial';
  const params = new URLSearchParams({ view });
  if (kind === 'business' && businessId) params.set('business', businessId);
  return `${base}?${params.toString()}`;
}

function openConversation(threadId: string, kind: ProjectKind, businessId?: string | null): void {
  const params = new URLSearchParams({ thread: threadId, project: kind });
  if (businessId) params.set('business', businessId);
  navigateProduct(`sanad-ai?${params.toString()}`);
}

function titleForRole(value?: string | null): string {
  if (value === 'owner') return 'مالك';
  if (value === 'team_member') return 'عضو فريق';
  return value || 'مصرّح';
}

function ViewTabs({ kind, businessId, active }: { kind: ProjectKind; businessId?: string | null; active: View }) {
  const tabs: Array<{ id: View; label: string }> = [
    { id: 'conversations', label: 'المحادثات' },
    { id: 'sources', label: 'المصادر' },
    { id: 'tools', label: 'الأدوات' },
    { id: 'library', label: 'المكتبة' },
    { id: 'manage', label: kind === 'business' ? 'إدارة النشاط' : 'إدارة المساحة' },
  ];
  return (
    <nav aria-label="محتوى المساحة" className="flex gap-1 overflow-x-auto border-b border-[var(--sanad-border-subtle)] px-1 [scrollbar-width:none]">
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href={`#${tab.id}`}
          aria-current={active === tab.id ? 'page' : undefined}
          onClick={(event) => {
            event.preventDefault();
            navigateProduct(projectPath(kind, tab.id, businessId));
          }}
          className={`sanad-focus-ring whitespace-nowrap border-b-2 px-3 py-3 text-[12px] font-medium transition-colors ${active === tab.id
            ? 'border-[var(--sanad-interactive)] text-[var(--sanad-text-strong)]'
            : 'border-transparent text-[var(--sanad-text-muted)] hover:text-[var(--sanad-text-strong)]'}`}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}

function EmptyState({ title, body, icon: Icon }: { title: string; body: string; icon: typeof FolderOpen }) {
  return (
    <div className="py-14 text-center">
      <Icon className="mx-auto h-6 w-6 text-[var(--sanad-text-subtle)]" />
      <h3 className="mt-3 text-[14px] font-semibold text-[var(--sanad-text-strong)]">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-[12px] leading-6 text-[var(--sanad-text-muted)]">{body}</p>
    </div>
  );
}

export default function SanadProjectWorkspaceRoute({ kind, location }: { kind: ProjectKind; location?: string }) {
  const initial = useMemo(() => routeState(kind), [kind]);
  const view = useMemo(() => routeState(kind).view, [kind, location]);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState(initial.businessId || '');
  const [businessLoading, setBusinessLoading] = useState(kind === 'business');
  const [threads, setThreads] = useState<SanadAgentThreadSummary[]>([]);
  const [legacyThreads, setLegacyThreads] = useState<SanadAgentThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(view === 'conversations');
  const [contractPending, setContractPending] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (kind !== 'business') return;
    let active = true;
    setBusinessLoading(true);
    void getProjectBusinessContexts()
      .then((contexts) => {
        if (!active) return;
        const options = authorizedProjectBusinesses(contexts);
        setBusinesses(options);
        const remembered = (() => {
          try { return window.localStorage.getItem('sanad:last-business-project-v1') || ''; } catch { return ''; }
        })();
        const requested = selectedBusinessId;
        const next = options.find((item) => item.id === requested)?.id
          || options.find((item) => item.id === remembered)?.id
          || options[0]?.id
          || '';
        setSelectedBusinessId(next);
        if (next) {
          try { window.localStorage.setItem('sanad:last-business-project-v1', next); } catch { /* ignore */ }
        }
      })
      .catch((cause) => setThreadError(cause instanceof Error ? cause.message : 'تعذر تحميل الأنشطة المصرح بها.'))
      .finally(() => active && setBusinessLoading(false));
    return () => { active = false; };
  // selectedBusinessId only seeds from URL; avoid reloading contexts on selector changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // Browser back/forward between businesses should update the selected project
  // without remounting the full route and refetching the same contexts.
  useEffect(() => {
    if (kind !== 'business' || businesses.length === 0) return;
    const urlBusiness = new URL(window.location.href).searchParams.get('business');
    if (urlBusiness && businesses.some((b) => b.id === urlBusiness) && urlBusiness !== selectedBusinessId) {
      setSelectedBusinessId(urlBusiness);
    }
  }, [kind, location, businesses, selectedBusinessId]);

  const selectedBusiness = businesses.find((item) => item.id === selectedBusinessId) || null;

  const loadThreads = useCallback(async () => {
    if (view !== 'conversations') return;
    if (kind === 'business' && !selectedBusinessId) {
      setThreads([]);
      setLegacyThreads([]);
      setThreadsLoading(false);
      return;
    }
    setThreadsLoading(true);
    setThreadError(null);
    setContractPending(false);
    try {
      const result = await projectThreads({
        projectKind: kind,
        businessId: kind === 'business' ? selectedBusinessId : null,
        status: showArchived ? 'archived' : 'active',
        search: search || undefined,
        limit: 100,
        offset: 0,
      });
      setThreads(result.page.items);
      setContractPending(result.contractPending);
      if (kind === 'personal' && !showArchived && !search) {
        const legacy = await projectThreads({
          projectKind: 'legacy_unclassified',
          status: 'active',
          limit: 20,
          offset: 0,
        });
        setLegacyThreads(legacy.page.items);
      } else {
        setLegacyThreads([]);
      }
    } catch (cause) {
      setThreadError(cause instanceof Error ? cause.message : 'تعذر تحميل محادثات المساحة.');
    } finally {
      setThreadsLoading(false);
    }
  }, [kind, search, selectedBusinessId, showArchived, view]);

  useEffect(() => { void loadThreads(); }, [loadThreads]);

  const createThread = async () => {
    if (creating || (kind === 'business' && !selectedBusinessId)) return;
    setCreating(true);
    setThreadError(null);
    try {
      const id = await openNewProjectConversation(kind, kind === 'business' ? selectedBusinessId : null);
      openConversation(id, kind, kind === 'business' ? selectedBusinessId : null);
    } catch (cause) {
      setThreadError(cause instanceof Error ? cause.message : 'تعذر إنشاء المحادثة.');
    } finally {
      setCreating(false);
    }
  };

  const togglePin = async (thread: SanadAgentThreadSummary) => {
    if (pinningId || contractPending) return;
    setPinningId(thread.id);
    try {
      await setSanadProjectThreadPinned(thread.id, !thread.is_pinned);
      invalidateProjectQuickAccess();
      await loadThreads();
    } catch (cause) {
      setThreadError(cause instanceof Error ? cause.message : 'تعذر تحديث تثبيت المحادثة.');
    } finally {
      setPinningId(null);
    }
  };

  const archive = async (thread: SanadAgentThreadSummary) => {
    if (archivingId || thread.my_role && thread.my_role !== 'owner') return;
    setArchivingId(thread.id);
    try {
      await archiveSanadAgentThread(thread.id);
      invalidateProjectQuickAccess();
      await loadThreads();
    } catch (cause) {
      setThreadError(cause instanceof Error ? cause.message : 'تعذر أرشفة المحادثة.');
    } finally {
      setArchivingId(null);
    }
  };

  const selectBusiness = (id: string) => {
    setSelectedBusinessId(id);
    try { window.localStorage.setItem('sanad:last-business-project-v1', id); } catch { /* ignore */ }
    navigateProduct(projectPath('business', view, id), { replace: true });
  };

  const projectTitle = kind === 'personal' ? 'المدير الشخصي' : selectedBusiness?.name || 'الأعمال';
  const ProjectIcon = kind === 'personal' ? UserRound : BriefcaseBusiness;

  return (
    <div className="min-h-full bg-[var(--sanad-bg-canvas)] px-4 py-5 text-[var(--sanad-text)] lg:px-8 lg:py-8" dir="rtl">
      <div className="mx-auto w-full max-w-[1160px]">
        <header className="sanad-section-compact-header flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="sanad-section-head-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--sanad-radius-md)]">
              <ProjectIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[var(--sanad-text-subtle)]">
                {kind === 'personal' ? 'مساحتك الشخصية' : 'مساحة الأعمال'}
              </p>
              <h1 className="mt-0.5 truncate text-[22px] font-semibold tracking-[-0.02em] text-[var(--sanad-text-strong)]">{projectTitle}</h1>
              <p className="mt-1 max-w-2xl text-[12px] leading-[1.85] text-[var(--sanad-text-muted)]">
                {kind === 'personal'
                  ? 'محادثاتك ومصادرك وأدوات الإدارة الشخصية في سياق واحد.'
                  : 'محادثات النشاط ومصادره وأدواته وإدارته، مع بقاء صلاحيات كل محادثة مستقلة.'}
              </p>
            </div>
          </div>

          {kind === 'business' ? (
            businessLoading ? <Loader2 className="h-5 w-5 animate-spin text-[var(--sanad-text-subtle)]" /> :
            businesses.length > 1 ? (
              <label className="min-w-[220px]">
                <span className="sr-only">اختيار النشاط التجاري</span>
                <select
                  value={selectedBusinessId}
                  onChange={(event) => selectBusiness(event.target.value)}
                  className="sanad-focus-ring h-10 w-full rounded-[var(--sanad-radius-md)] border border-[var(--sanad-border)] bg-[var(--sanad-surface-1)] px-3 text-[12px] font-medium text-[var(--sanad-text-strong)]"
                >
                  {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
                </select>
              </label>
            ) : selectedBusiness ? (
              <span className="rounded-full border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] px-3 py-1.5 text-[11px] text-[var(--sanad-text-muted)]">
                {titleForRole(selectedBusiness.workspace_role)}
              </span>
            ) : null
          ) : null}
        </header>

        <ViewTabs kind={kind} businessId={selectedBusinessId} active={view} />

        {threadError ? (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-[var(--sanad-radius-md)] border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] leading-5 text-rose-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{threadError}</span>
          </div>
        ) : null}

        {kind === 'business' && !businessLoading && businesses.length === 0 ? (
          <EmptyState
            icon={BriefcaseBusiness}
            title="لا توجد مساحة أعمال مصرح بها"
            body="ستظهر هنا الأنشطة التي تملكها أو تشارك في فريقها. علاقة العميل بالنشاط لا تمنح صلاحيات إدارة المشروع."
          />
        ) : null}

        {(kind === 'personal' || selectedBusinessId) && view === 'conversations' ? (
          <section className="pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--sanad-text-strong)]">المحادثات</h2>
                <p className="mt-1 text-[11px] text-[var(--sanad-text-subtle)]">كل محادثة تنتمي إلى هذه المساحة؛ لا توجد محادثات عامة خارجها.</p>
              </div>
              <button
                type="button"
                onClick={() => void createThread()}
                disabled={creating || (kind === 'business' && !selectedBusinessId)}
                className="sanad-focus-ring inline-flex min-h-10 items-center gap-2 rounded-[var(--sanad-radius-md)] border border-[var(--sanad-border)] bg-[var(--sanad-surface-1)] px-3 text-[12px] font-medium text-[var(--sanad-text-strong)] hover:bg-[var(--sanad-nav-hover-bg)] disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CirclePlus className="h-4 w-4" />}
                محادثة جديدة
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sanad-text-subtle)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ابحث في محادثات هذه المساحة"
                  className="sanad-focus-ring h-10 w-full rounded-[var(--sanad-radius-md)] border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] pr-9 pl-3 text-[12px]"
                />
              </label>
              <button
                type="button"
                onClick={() => setShowArchived((value) => !value)}
                className="sanad-focus-ring inline-flex h-10 items-center gap-2 rounded-[var(--sanad-radius-md)] border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] px-3 text-[11px] text-[var(--sanad-text-muted)]"
              >
                <Archive className="h-4 w-4" /> {showArchived ? 'النشطة' : 'المؤرشفة'}
              </button>
              <button type="button" onClick={() => void loadThreads()} className="sanad-focus-ring flex h-10 w-10 items-center justify-center rounded-[var(--sanad-radius-md)] border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)]" aria-label="تحديث المحادثات">
                <RefreshCw className={`h-4 w-4 ${threadsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {contractPending ? (
              <p className="mt-3 rounded-[var(--sanad-radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                هذه المعاينة المحلية تعمل قبل نشر عقد المساحات الجديد. لم نصنّف أي محادثة قديمة تلقائيًا، والتثبيت/إنشاء المحادثة الشخصية سيعملان بعد نشر قاعدة البيانات المعتمدة.
              </p>
            ) : null}

            {threadsLoading ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-[12px] text-[var(--sanad-text-subtle)]"><Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل المحادثات…</div>
            ) : threads.length === 0 ? (
              <EmptyState icon={MessageSquareText} title={showArchived ? 'لا توجد محادثات مؤرشفة' : 'ابدأ أول محادثة في هذه المساحة'} body="المحادثات هنا مرتبطة بسياق المساحة، بينما تبقى السجلات المالية والكيانات في مصادرها المعتمدة." />
            ) : (
              <div className="mt-4 divide-y divide-[var(--sanad-border-subtle)] border-y border-[var(--sanad-border-subtle)]">
                {threads.map((thread) => (
                  <article key={thread.id} className="group grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <button type="button" onClick={() => openConversation(thread.id, kind, selectedBusinessId)} className="sanad-focus-ring min-w-0 rounded-lg px-1 py-1 text-right">
                      <div className="flex items-center gap-2">
                        {thread.is_pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-[var(--sanad-interactive)]" /> : <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-[var(--sanad-text-subtle)]" />}
                        <span className="truncate text-[13px] font-medium text-[var(--sanad-text-strong)]">{thread.title}</span>
                        {thread.unread_count ? <span className="rounded-full bg-[var(--sanad-interactive-soft)] px-1.5 text-[10px] font-semibold text-[var(--sanad-interactive)]">{thread.unread_count}</span> : null}
                      </div>
                      <p className="mt-1 pr-5 text-[10px] text-[var(--sanad-text-subtle)]">{thread.message_count} رسالة{thread.my_role === 'viewer' ? ' · قراءة فقط' : thread.my_role === 'member' ? ' · مشتركة' : ''}</p>
                    </button>
                    <div className="flex items-center gap-1 justify-self-end">
                      {!contractPending ? (
                        <button type="button" disabled={Boolean(pinningId)} onClick={() => void togglePin(thread)} className="sanad-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-nav-hover-bg)]" aria-label={thread.is_pinned ? 'إلغاء تثبيت المحادثة' : 'تثبيت المحادثة'}>
                          {thread.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                        </button>
                      ) : null}
                      {(!thread.my_role || thread.my_role === 'owner') ? (
                        <button type="button" disabled={Boolean(archivingId)} onClick={() => void archive(thread)} className="sanad-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-nav-hover-bg)]" aria-label="أرشفة المحادثة">
                          <Archive className="h-4 w-4" />
                        </button>
                      ) : null}
                      <button type="button" onClick={() => openConversation(thread.id, kind, selectedBusinessId)} className="sanad-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[var(--sanad-interactive)]" aria-label="فتح المحادثة"><ChevronLeft className="h-4 w-4" /></button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {kind === 'personal' && legacyThreads.length > 0 ? (
              <div className="mt-6 rounded-[var(--sanad-radius-lg)] border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] p-4">
                <h3 className="text-[12px] font-semibold text-[var(--sanad-text-strong)]">محادثات سابقة غير مصنفة</h3>
                <p className="mt-1 text-[11px] leading-5 text-[var(--sanad-text-muted)]">لم ننقل هذه المحادثات تلقائيًا إلى المدير الشخصي لأن سجلها السابق لا يثبت سياقها. ستبقى قابلة للفتح حتى تختار تصنيفها لاحقًا.</p>
                <div className="mt-3 space-y-1">
                  {legacyThreads.map((thread) => (
                    <button key={thread.id} type="button" onClick={() => openConversation(thread.id, 'personal')} className="sanad-focus-ring flex w-full items-center justify-between rounded-lg px-2 py-2 text-right text-[12px] hover:bg-[var(--sanad-nav-hover-bg)]">
                      <span className="truncate">{thread.title}</span><ChevronLeft className="h-4 w-4 text-[var(--sanad-text-subtle)]" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {(kind === 'personal' || selectedBusinessId) && view === 'sources' ? (
          <section className="pt-6">
            <h2 className="text-[15px] font-semibold">المصادر</h2>
            <p className="mt-2 max-w-2xl text-[12px] leading-6 text-[var(--sanad-text-muted)]">
              {kind === 'business'
                ? 'مصدر النظام المحاسبي والاتصالات المصرح بها يبقيان مرجع البيانات الحية. ملفات المشروع المشتركة تحتاج عقد صلاحيات مستقل قبل تفعيلها.'
                : 'البيانات المالية الشخصية تُقرأ من مصادرها المعتمدة. لن نحول الذاكرة أو ملفات المحادثات إلى سجل مالي بديل.'}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => navigateProduct('connections')} className="sanad-focus-ring rounded-[var(--sanad-radius-lg)] border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] p-4 text-right">
                <Database className="h-5 w-5 text-[var(--sanad-interactive)]" /><strong className="mt-3 block text-[13px]">الاتصالات الحية</strong><span className="mt-1 block text-[11px] text-[var(--sanad-text-muted)]">حالة الربط والمزامنة والمصدر.</span>
              </button>
              <div className="rounded-[var(--sanad-radius-lg)] border border-dashed border-[var(--sanad-border)] bg-[var(--sanad-surface-2)] p-4">
                <FolderOpen className="h-5 w-5 text-[var(--sanad-text-subtle)]" /><strong className="mt-3 block text-[13px]">مصادر المشروع</strong><span className="mt-1 block text-[11px] leading-5 text-[var(--sanad-text-muted)]">ستُفعّل بعد عقد مشاركة/فهرسة مشروع محكوم؛ لا وصول ضمني لملفات الفريق.</span>
              </div>
            </div>
          </section>
        ) : null}

        {(kind === 'personal' || selectedBusinessId) && view === 'tools' ? (
          <section className="pt-6">
            <h2 className="text-[15px] font-semibold">الأدوات</h2>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {(kind === 'personal' ? [
                ['الحسابات','financial/accounts',WalletCards],
                ['العمليات','financial/transactions',ListChecks],
                ['الالتزامات','financial/obligations',FileText],
                ['الميزانيات','financial/budgets',SlidersHorizontal],
                ['الأهداف','financial/goals',Wrench],
              ] : [
                ['إدارة النشاط','business/manage',Settings2],
                ['العمليات','business/manage/operations',ListChecks],
                ['العملاء','business/manage/customers',Users],
                ['الفريق','business/manage/team',Users],
                ['النظام المحاسبي','business/manage?section=accounting',Database],
              ]).map(([label,path,Icon]) => {
                const ToolIcon = Icon as typeof WalletCards;
                return (
                  <button key={String(path)} type="button" onClick={() => navigateProduct(String(path))} className="sanad-focus-ring sanad-project-tool flex min-h-[78px] items-center gap-3 rounded-[var(--sanad-radius-md)] border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] p-3.5 text-right hover:bg-[var(--sanad-nav-hover-bg)]">
                    <span className="sanad-project-tool-icon"><ToolIcon className="h-[18px] w-[18px] text-[var(--sanad-interactive)]" /></span>
                    <strong className="block text-[13px] text-[var(--sanad-text-strong)]">{String(label)}</strong>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {(kind === 'personal' || selectedBusinessId) && view === 'library' ? (
          <section className="pt-6">
            <EmptyState
              icon={BookOpen}
              title="مكتبة هذه المساحة"
              body="ستجمع التقارير والمستندات والمخرجات المرتبطة بالمساحة بعد اكتمال عقد الملفات والمصادر. المكتبة العامة الحالية تبقى متاحة دون الادعاء بأن كل ملف منها خاص بهذا المشروع."
            />
            <div className="text-center"><button type="button" onClick={() => navigateProduct('library')} className="sanad-focus-ring rounded-[var(--sanad-radius-md)] border border-[var(--sanad-border)] bg-[var(--sanad-surface-1)] px-4 py-2 text-[12px]">فتح المكتبة العامة الحالية</button></div>
          </section>
        ) : null}

        {(kind === 'personal' || selectedBusinessId) && view === 'manage' ? (
          kind === 'business' ? (
            <section className="pt-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => navigateProduct('business/manage')} className="sanad-focus-ring rounded-[var(--sanad-radius-lg)] border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] p-5 text-right">
                  <Settings2 className="h-5 w-5 text-[var(--sanad-interactive)]" /><strong className="mt-4 block text-[14px]">إدارة النشاط التجاري</strong><span className="mt-2 block text-[11px] leading-5 text-[var(--sanad-text-muted)]">الملف، العملاء، الفريق، الكتالوج والنظام المحاسبي عبر واجهات الإدارة الحالية.</span>
                </button>
                <button type="button" onClick={() => navigateProduct('connections')} className="sanad-focus-ring rounded-[var(--sanad-radius-lg)] border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] p-5 text-right">
                  <Database className="h-5 w-5 text-[var(--sanad-interactive)]" /><strong className="mt-4 block text-[14px]">الاتصالات والمزامنة</strong><span className="mt-2 block text-[11px] leading-5 text-[var(--sanad-text-muted)]">إدارة اتصال سند بالمصادر دون تغيير سياسة Bridge الحالية للقراءة فقط.</span>
                </button>
              </div>
            </section>
          ) : (
            <section className="pt-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => navigateProduct('account-center')} className="sanad-focus-ring rounded-[var(--sanad-radius-lg)] border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] p-5 text-right">
                  <Settings2 className="h-5 w-5 text-[var(--sanad-interactive)]" /><strong className="mt-4 block text-[14px]">الحساب والإعدادات</strong><span className="mt-2 block text-[11px] leading-5 text-[var(--sanad-text-muted)]">إدارة الحساب والخصوصية وإعدادات مساعد سند من مكان واحد.</span>
                </button>
              </div>
            </section>
          )
        ) : null}
      </div>
    </div>
  );
}
