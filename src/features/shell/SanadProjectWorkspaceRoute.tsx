import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, BookOpen, BriefcaseBusiness, ChevronLeft, FileText, Library,
  MessageSquare, MessageSquarePlus, Pin, PinOff, RefreshCw, Search,
  Settings2, ShieldCheck, UserRound, WalletCards,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { navigateProduct, productHref } from '../../lib/productNavigation';
import { archiveSanadAgentThread, classifySanadLegacyPersonalThread, listSanadAgentThreads } from '../assistant/assistantWorkspaceApi';
import { projectConversationHref, type SanadProject, type SanadProjectConversation, type SanadProjectThreadPage } from '../assistant/sanadProjectContext';
import { rememberActiveManagedBusiness } from '../../lib/businessManagementApi';

type ManagedBusiness = { id: string; name: string; owner: boolean; role: string };
type ProjectTab = 'conversations' | 'sources' | 'tools' | 'library' | 'management';
type Props = { kind: 'personal' | 'business'; userId: string | null };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function parseBusinesses(data: unknown): ManagedBusiness[] {
  const payload = asRecord(data);
  const found = new Map<string, ManagedBusiness>();
  for (const row of Array.isArray(payload.owned_businesses) ? payload.owned_businesses : []) {
    const business = asRecord(row);
    if (typeof business.id === 'string' && business.id) {
      found.set(business.id, { id: business.id, name: String(business.name || 'نشاط تجاري'), owner: true, role: 'مالك' });
    }
  }
  for (const row of Array.isArray(payload.team_businesses) ? payload.team_businesses : []) {
    const membership = asRecord(row);
    const business = asRecord(membership.business);
    if (membership.status !== 'active' || typeof business.id !== 'string' || !business.id || found.has(business.id)) continue;
    found.set(business.id, {
      id: business.id,
      name: String(business.name || 'نشاط تجاري'),
      owner: false,
      role: String(membership.membership_role || 'عضو'),
    });
  }
  // A customer-only relationship or pending invitation is not business-management access.
  return [...found.values()];
}
function formatRecent(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ar-YE-u-nu-latn', { day: 'numeric', month: 'short' }).format(date);
}

export default function SanadProjectWorkspaceRoute({ kind, userId }: Props) {
  const [businesses, setBusinesses] = useState<ManagedBusiness[]>([]);
  const [loadingContext, setLoadingContext] = useState(kind === 'business');
  const [contextError, setContextError] = useState<string | null>(null);
  const [reloadContext, setReloadContext] = useState(0);
  const requestedBusiness = new URLSearchParams(window.location.search).get('business') || '';
  const rememberedBusinessKey = `sanad:project-business:${userId || 'anonymous'}`;
  const rememberedBusiness = (() => { try { return window.sessionStorage.getItem(rememberedBusinessKey) || ''; } catch { return ''; } })();
  const selected = businesses.find((item) => item.id === requestedBusiness)
    || businesses.find((item) => item.id === rememberedBusiness)
    || (businesses.length === 1 ? businesses[0] : null);
  const project: SanadProject | null = kind === 'personal'
    ? { kind: 'personal' } : selected ? { kind: 'business', businessId: selected.id } : null;
  const [tab, setTab] = useState<ProjectTab>('conversations');
  const [filter, setFilter] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState<SanadProjectThreadPage>({ items: [], pinned: [], next_cursor: null });
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [backendReady, setBackendReady] = useState(true);
  const [pendingThread, setPendingThread] = useState<string | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [unclassified, setUnclassified] = useState<Array<{ id: string; title: string }>>([]);

  useEffect(() => {
    if (kind === 'personal') return;
    let active = true;
    setLoadingContext(true);
    setContextError(null);
    void Promise.resolve(supabase.rpc('get_user_business_contexts')).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setContextError('تعذر تحميل الأنشطة المخوّل لك الوصول إليها.');
      } else {
        setBusinesses(parseBusinesses(data));
      }
    }).catch(() => {
      if (active) setContextError('تعذر الاتصال بقائمة الأنشطة.');
    }).finally(() => { if (active) setLoadingContext(false); });
    return () => { active = false; };
  }, [kind, userId, reloadContext]);

  useEffect(() => {
    if (!selected) return;
    try { window.sessionStorage.setItem(rememberedBusinessKey, selected.id); } catch { /* transient preference only */ }
  }, [selected?.id, rememberedBusinessKey]);

  const loadThreads = useCallback(async (nextProject: SanadProject, append = false, cursor?: { at: string; id: string } | null) => {
    if (append) setMoreLoading(true);
    else { setLoadingThreads(true); setThreadError(null); }
    try {
      const { data, error } = await supabase.rpc('list_my_sanad_project_threads_v1', {
        p_project_kind: nextProject.kind,
        p_business_id: nextProject.kind === 'business' ? nextProject.businessId : null,
        p_limit: 35,
        p_cursor_at: cursor?.at ?? null,
        p_cursor_id: cursor?.id ?? null,
      });
      if (error) {
        // Before the independent database rollout, display existing BUSINESS chats
        // through the already participant-authorized RPC; never auto-claim null
        // legacy chats as personal or claim local-only pins as persistent.
        if (error.code === 'PGRST202' || /list_my_sanad_project_threads_v1/.test(error.message)) {
          setBackendReady(false);
          const legacy = await listSanadAgentThreads(100);
          if (nextProject.kind === 'personal') {
            setUnclassified(legacy.filter(x => x.business_id === null).map(x => ({ id: x.id, title: x.title })));
            setPage({ items: [], pinned: [], next_cursor: null });
          } else {
            setPage({
              items: legacy.filter(x => x.business_id === nextProject.businessId).map(x => ({
                ...x, project_kind: 'business' as const, is_pinned: false,
              })),
              pinned: [], next_cursor: null,
            });
          }
          return;
        }
        throw error;
      }
      setBackendReady(true);
      if (nextProject.kind === 'personal') {
        const { data: old, error: legacyError } = await supabase.rpc('list_my_sanad_legacy_unclassified_threads_v1');
        if (!legacyError && Array.isArray(old)) {
          setUnclassified(old.flatMap(item => {
            const record = asRecord(item);
            return typeof record.id === 'string' && typeof record.title === 'string'
              ? [{ id: record.id, title: record.title }] : [];
          }));
        }
      } else {
        setUnclassified([]);
      }
      const payload = asRecord(data);
      const incoming = Array.isArray(payload.items) ? payload.items as SanadProjectConversation[] : [];
      const pinned = Array.isArray(payload.pinned) ? payload.pinned as SanadProjectConversation[] : [];
      const next = asRecord(payload.next_cursor);
      const nextCursor = typeof next.at === 'string' && typeof next.id === 'string' ? { at: next.at, id: next.id } : null;
      setPage(current => ({
        items: append ? [...current.items.filter(x => !incoming.some(i => i.id === x.id)), ...incoming] : incoming,
        pinned, next_cursor: nextCursor,
      }));
    } catch (error) {
      setThreadError(error instanceof Error ? error.message : 'تعذر تحميل محادثات المشروع.');
    } finally {
      setLoadingThreads(false);
      setMoreLoading(false);
    }
  }, []);

  const projectKey = project?.kind === 'business' ? project.businessId : project?.kind;
  useEffect(() => {
    if (!project) { setPage({ items: [], pinned: [], next_cursor: null }); return; }
    setFilter('');
    setPage({ items: [], pinned: [], next_cursor: null });
    void loadThreads(project);
    // Session/participant access is revalidated by every read RPC.
  }, [projectKey, userId, loadThreads]);

  const allThreads = useMemo(() => {
    const unique = new Map<string, SanadProjectConversation>();
    for (const item of [...page.pinned, ...page.items]) unique.set(item.id, item);
    const term = filter.trim().toLocaleLowerCase('ar');
    return [...unique.values()].filter(x =>
      (includeArchived || x.status === 'active')
      && (!term || x.title.toLocaleLowerCase('ar').includes(term)
        || (x.summary || '').toLocaleLowerCase('ar').includes(term))
    );
  }, [page, filter, includeArchived]);
  const pinned = allThreads.filter(x => x.is_pinned);
  const recent = allThreads.filter(x => !x.is_pinned);
  const title = kind === 'personal' ? 'المدير الشخصي' : selected?.name || 'الأعمال';

  async function newConversation() {
    if (!project || !backendReady || pendingThread) return;
    setPendingThread('new');
    setThreadError(null);
    try {
      const { data, error } = await supabase.rpc('create_my_sanad_project_thread_v1', {
        p_project_kind: project.kind,
        p_business_id: project.kind === 'business' ? project.businessId : null,
        p_title: null,
      });
      if (error) throw error;
      if (typeof data !== 'string') throw new Error('لم يرجع الخادم معرّف المحادثة.');
      navigateProduct(projectConversationHref(project, { threadId: data }));
    } catch (error) {
      setThreadError(error instanceof Error ? error.message : 'تعذر إنشاء المحادثة.');
    } finally { setPendingThread(null); }
  }

  async function classifyLegacy(thread: { id: string; title: string }) {
    if (!backendReady || !project || project.kind !== 'personal') return;
    if (!window.confirm(`هل راجعت هذه المحادثة وتؤكد أنها شخصية؟\\n\\n${thread.title}\\n\\nلن تتحول الفواتير أو العمليات السابقة إلى مشروع آخر.`)) return;
    setPendingThread(thread.id);
    try {
      await classifySanadLegacyPersonalThread(thread.id);
      setUnclassified(previous => previous.filter(item => item.id !== thread.id));
      await loadThreads(project);
    } catch (error) {
      setThreadError(error instanceof Error ? error.message : 'تعذر تصنيف المحادثة.');
    } finally { setPendingThread(null); }
  }

  async function pinThread(thread: SanadProjectConversation) {
    if (!project || !backendReady || pendingThread) return;
    setPendingThread(thread.id);
    try {
      const { error } = await supabase.rpc('set_my_sanad_agent_thread_pin_v1', { p_thread_id: thread.id, p_pin: !thread.is_pinned });
      if (error) throw error;
      await loadThreads(project);
    } catch { setThreadError('تعذر تعديل التثبيت. تحقق من صلاحية المحادثة وحاول مجددًا.'); }
    finally { setPendingThread(null); }
  }
  async function archive(thread: SanadProjectConversation) {
    if (!project || (thread.my_role && thread.my_role !== 'owner') || pendingThread) return;
    if (!window.confirm(`أرشفة المحادثة «${thread.title}»؟`)) return;
    setPendingThread(thread.id);
    try { await archiveSanadAgentThread(thread.id); await loadThreads(project); }
    catch { setThreadError('تعذرت أرشفة المحادثة.'); }
    finally { setPendingThread(null); }
  }
  function openManagement() {
    if (!selected?.owner) return;
    rememberActiveManagedBusiness(selected.id);
    navigateProduct('business/manage');
  }

  function ThreadRow({ thread }: { thread: SanadProjectConversation; key?: string }) {
    return (
      <div className="group flex min-h-14 min-w-0 items-center gap-2 border-b border-[var(--sanad-border-subtle)] py-1.5">
        <button type="button" onClick={() => project && navigateProduct(projectConversationHref(project, { threadId: thread.id }))}
          className="sanad-focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-right hover:bg-[var(--sanad-nav-hover-bg)]">
          <MessageSquare className="h-4 w-4 shrink-0 text-[var(--sanad-text-subtle)]" aria-hidden="true"/>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{thread.title}</span>
            <span className="text-[11px] text-[var(--sanad-text-muted)]">{thread.my_role === 'viewer' ? 'قراءة فقط · ' : ''}{thread.message_count} رسالة{formatRecent(thread.last_message_at) ? ` · ${formatRecent(thread.last_message_at)}` : ''}</span>
          </span>
          <ChevronLeft className="h-4 w-4 text-[var(--sanad-text-subtle)]" aria-hidden="true"/>
        </button>
        {backendReady ? <button type="button" disabled={Boolean(pendingThread)} onClick={() => void pinThread(thread)}
          className="sanad-focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-nav-hover-bg)] disabled:opacity-40"
          aria-label={thread.is_pinned ? `إلغاء تثبيت ${thread.title}` : `تثبيت ${thread.title}`} title={thread.is_pinned ? 'إلغاء التثبيت' : 'تثبيت'}>
          {thread.is_pinned ? <PinOff className="h-4 w-4"/> : <Pin className="h-4 w-4"/>}
        </button> : null}
        {(!thread.my_role || thread.my_role === 'owner') ? <button type="button" disabled={Boolean(pendingThread)} onClick={() => void archive(thread)}
          className="sanad-focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-nav-hover-bg)] disabled:opacity-40"
          aria-label={`أرشفة ${thread.title}`} title="أرشفة"><Archive className="h-4 w-4"/></button> : null}
      </div>
    );
  }

  const tabs: { id: ProjectTab; label: string; icon: typeof BookOpen; visible?: boolean }[] = [
    { id: 'conversations', label: 'المحادثات', icon: MessageSquare },
    { id: 'sources', label: 'المصادر', icon: FileText },
    { id: 'tools', label: 'الأدوات', icon: WalletCards },
    { id: 'library', label: 'المكتبة', icon: Library },
    { id: 'management', label: 'إدارة النشاط', icon: Settings2, visible: kind === 'business' && Boolean(selected?.owner) },
  ];

  return (
    <div data-sanad-project-workspace={kind} className="min-h-full bg-[var(--sanad-bg-canvas)] px-4 pb-12 pt-6 text-[var(--sanad-text)] md:px-8" dir="rtl">
      <div className="mx-auto w-full max-w-[1120px]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sanad-border-subtle)] pb-5">
          <div className="flex items-center gap-3">
            {kind === 'personal' ? <UserRound className="h-5 w-5 text-[var(--sanad-text-muted)]"/> : <BriefcaseBusiness className="h-5 w-5 text-[var(--sanad-text-muted)]"/>}
            <div>
              <p className="text-[11px] text-[var(--sanad-text-muted)]">{kind === 'personal' ? 'مساحتك الشخصية' : 'مشروع نشاط تجاري'}</p>
              <h1 className="text-[20px] font-semibold text-[var(--sanad-text-strong)]">{title}</h1>
            </div>
          </div>
          {project ? <button type="button" disabled={!backendReady || Boolean(pendingThread)} onClick={() => void newConversation()}
            className="sanad-focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--sanad-border)] bg-[var(--sanad-surface-1)] px-3 text-[13px] hover:bg-[var(--sanad-nav-hover-bg)] disabled:opacity-50">
            <MessageSquarePlus className="h-4 w-4"/> محادثة جديدة
          </button> : null}
        </header>

        {kind === 'business' ? (
          <section className="border-b border-[var(--sanad-border-subtle)] py-4" aria-label="اختيار النشاط">
            {loadingContext ? <p className="text-[12px] text-[var(--sanad-text-muted)]">جارٍ تحميل الأنشطة…</p>
            : contextError ? <div role="alert" className="text-[12px] text-rose-700">{contextError} <button onClick={() => setReloadContext(n => n + 1)} className="underline">إعادة المحاولة</button></div>
            : businesses.length === 0 ? <div className="text-[13px] text-[var(--sanad-text-muted)]">لا توجد أنشطة تملك صلاحية إدارتها. يمكن متابعة الدعوات وطلبات الارتباط من الحساب.</div>
            : businesses.length > 1 ? <label className="inline-flex flex-wrap items-center gap-2 text-[12px]">
                <span>النشاط الحالي</span>
                <select value={selected?.id || ''} onChange={e => navigateProduct(`commercial?business=${encodeURIComponent(e.target.value)}`)}
                  className="sanad-focus-ring min-h-10 max-w-full rounded-lg border border-[var(--sanad-border)] bg-[var(--sanad-surface-1)] px-2">
                  {!selected ? <option value="">اختر نشاطًا</option> : null}
                  {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            : <p className="text-[12px] text-[var(--sanad-text-muted)]">النشاط المحدد: <strong className="text-[var(--sanad-text-strong)]">{selected?.name}</strong></p>}
          </section>
        ) : null}

        {project ? (
          <>
            <nav aria-label="محتوى المشروع" className="mt-4 flex flex-wrap gap-1 border-b border-[var(--sanad-border-subtle)] pb-3">
              {tabs.filter(t => t.visible !== false).map(t => <button key={t.id} type="button" onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`sanad-focus-ring inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-[12px] transition-colors ${tab === t.id ? 'bg-[var(--sanad-nav-active-bg)] text-[var(--sanad-text-strong)] font-medium' : 'text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-nav-hover-bg)]'}`}>
                <t.icon className="h-4 w-4"/> {t.label}
              </button>)}
            </nav>

            {tab === 'conversations' ? <section className="pt-5" aria-label="محادثات المشروع">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full max-w-[360px]">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sanad-text-subtle)]"/>
                  <input type="search" value={filter} onChange={e => setFilter(e.target.value)}
                    placeholder="بحث داخل المحادثات المحمّلة" aria-label="بحث في محادثات المشروع"
                    className="sanad-focus-ring min-h-10 w-full rounded-lg border border-[var(--sanad-border)] bg-[var(--sanad-surface-1)] py-2 pl-3 pr-9 text-[12px]"/>
                </div>
                <label className="flex items-center gap-2 text-[11px] text-[var(--sanad-text-muted)]"><input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)}/> إظهار المؤرشفة</label>
              </div>
              {loadingThreads ? <p aria-busy="true" className="py-8 text-center text-[12px] text-[var(--sanad-text-muted)]">جارٍ تحميل المحادثات…</p> : null}
              {threadError ? <div role="alert" className="my-4 text-[12px] text-rose-700">{threadError} <button className="underline" onClick={() => void loadThreads(project)}>إعادة المحاولة</button></div> : null}
              {!backendReady ? <p className="my-4 rounded-xl border border-[var(--sanad-border-subtle)] px-3 py-3 text-[12px] leading-6 text-[var(--sanad-text-muted)]">يمكن استعراض المحادثات التجارية الحالية. سيُفعّل إنشاء المحادثات الشخصية والتثبيت بعد نشر عقد المشروعات الجديد بصورة مستقلة ومعتمدة.</p> : null}
              {pinned.length ? <div className="mt-5"><h2 className="mb-2 text-[12px] font-semibold">مثبتة</h2>{pinned.map(t => <ThreadRow key={t.id} thread={t}/>)}</div> : null}
              <div className="mt-5"><h2 className="mb-2 text-[12px] font-semibold">المحادثات</h2>
                {!loadingThreads && recent.length === 0 && pinned.length === 0 ? <p className="py-7 text-[12px] text-[var(--sanad-text-muted)]">لا توجد محادثات في هذا المشروع بعد.</p> : null}
                {recent.map(t => <ThreadRow key={t.id} thread={t}/>)}
              </div>
              {page.next_cursor && !filter ? <button disabled={moreLoading} onClick={() => void loadThreads(project, true, page.next_cursor)}
                className="sanad-focus-ring mt-5 min-h-10 rounded-lg border border-[var(--sanad-border)] px-3 text-[12px]">{moreLoading ? 'جارٍ التحميل…' : 'تحميل المزيد'}</button> : null}
              {kind === 'personal' && unclassified.length ? <details className="mt-7 border-t border-[var(--sanad-border-subtle)] pt-3">
                <summary className="cursor-pointer text-[12px] text-[var(--sanad-text-muted)]">محادثات قديمة غير مصنفة ({unclassified.length})</summary>
                <p className="mt-2 text-[11px] leading-6 text-[var(--sanad-text-muted)]">لن تُنسب المحادثات القديمة تلقائيًا إلى المدير الشخصي. يحتاج نقلها إلى تصنيف صريح ومراجعة السياق.</p>
                {unclassified.map(t => <div key={t.id} className="flex items-center justify-between gap-2 border-b border-[var(--sanad-border-subtle)] py-2 text-[12px]">
                  <span className="min-w-0 truncate">{t.title}</span>
                  {backendReady ? <button type="button" disabled={Boolean(pendingThread)}
                    onClick={() => void classifyLegacy(t)}
                    className="sanad-focus-ring min-h-9 shrink-0 rounded-md border border-[var(--sanad-border)] px-2 disabled:opacity-50">
                    مراجعة وإسناد للشخصي
                  </button> : null}
                </div>)}
              </details> : null}
            </section> : null}

            {tab === 'sources' ? <section className="py-7">
              <h2 className="text-[15px] font-semibold">مصادر {title}</h2>
              <p className="mt-2 max-w-2xl text-[12px] leading-6 text-[var(--sanad-text-muted)]">البيانات المالية تُقرأ من مصادرها التشغيلية المصرح بها. ستُضاف ملفات وتعليمات المشروع بصلاحيات مستقلة في مرحلة المعرفة، دون اعتبار المستندات القديمة أرصدة معتمدة.</p>
              <button type="button" onClick={() => selected?.owner ? openManagement() : kind === 'personal' ? navigateProduct('financial/accounts') : undefined}
                disabled={kind === 'business' && !selected?.owner}
                className="sanad-focus-ring mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--sanad-border)] bg-[var(--sanad-surface-1)] px-3 text-[12px] disabled:opacity-50">
                <ShieldCheck className="h-4 w-4"/>{kind === 'personal' ? 'الحسابات الشخصية الحالية' : 'مصادر النشاط واتصالاته ضمن الإدارة'}
              </button>
            </section> : null}
            {tab === 'tools' ? <section className="py-7">
              <h2 className="text-[15px] font-semibold">أدوات {title}</h2>
              <p className="mt-2 text-[12px] leading-6 text-[var(--sanad-text-muted)]">تظهر الأدوات الموجودة حاليًا؛ ستضاف واجهات الإدخال الموجّه داخل المحادثة في الحزمة التالية.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {(kind === 'personal' ? [
                  { name: 'الحسابات والمعاملات', path: 'financial/accounts' },
                  { name: 'الإجراءات المالية الحالية', path: 'financial/actions' },
                  { name: 'التقارير المالية', path: 'reports' },
                ] : selected?.owner ? [
                  { name: 'إدارة النشاط التجاري', path: 'business/manage' },
                  { name: 'النظام المحاسبي', path: 'business/manage?section=accounting' },
                  { name: 'العملاء', path: 'business/manage?section=customers' },
                ] : []).map(item => <button type="button" key={item.path} onClick={() => {
                  if (kind === 'business' && selected) rememberActiveManagedBusiness(selected.id);
                  navigateProduct(item.path);
                }} className="sanad-focus-ring min-h-12 rounded-xl border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] px-4 text-right text-[12px] hover:bg-[var(--sanad-nav-hover-bg)]">{item.name}</button>)}
              </div>
              {kind === 'business' && !selected?.owner ? <p className="mt-4 text-[12px] text-[var(--sanad-text-muted)]">أدوات الإدارة مرئية لمالك النشاط فقط؛ صلاحية المحادثات مستقلة عن عضوية النشاط.</p> : null}
            </section> : null}
            {tab === 'library' ? <section className="py-7">
              <h2 className="text-[15px] font-semibold">مكتبة {title}</h2>
              <p className="mt-2 text-[12px] leading-6 text-[var(--sanad-text-muted)]">لم تُفعّل بعد مكتبة الملفات الخاصة بكل مشروع. يتطلب ربط المستندات بالمحادثات عقد وصول مستقلًا يمنع مشاركة الملفات الخاصة دون إذن.</p>
              <button onClick={() => navigateProduct('library')} className="sanad-focus-ring mt-5 min-h-10 rounded-lg border border-[var(--sanad-border)] px-3 text-[12px]">فتح المكتبة الحالية</button>
            </section> : null}
            {tab === 'management' && kind === 'business' && selected?.owner ? <section className="py-7">
              <h2 className="text-[15px] font-semibold">إدارة النشاط</h2>
              <p className="mt-2 text-[12px] leading-6 text-[var(--sanad-text-muted)]">إدارة الفريق والملف والكتالوج والاتصال المحاسبي داخل واجهات الإدارة الحالية، دون بناء تطبيق ثانٍ.</p>
              <button type="button" onClick={openManagement} className="sanad-focus-ring mt-5 flex min-h-10 items-center gap-2 rounded-xl border border-[var(--sanad-border)] bg-[var(--sanad-surface-1)] px-3 text-[12px]"><Settings2 className="h-4 w-4"/> فتح إدارة النشاط</button>
            </section> : null}
          </>
        ) : !loadingContext && kind === 'business' && businesses.length > 1 && !contextError ? (
          <section className="grid gap-2 pt-6 sm:grid-cols-2" aria-label="اختر نشاط العمل">
            {businesses.map(b => <button key={b.id} type="button" onClick={() => navigateProduct(`commercial?business=${encodeURIComponent(b.id)}`)}
              className="sanad-focus-ring flex min-h-16 items-center justify-between rounded-xl border border-[var(--sanad-border)] bg-[var(--sanad-surface-1)] px-4 text-right hover:bg-[var(--sanad-nav-hover-bg)]">
              <span><strong className="block text-[13px]">{b.name}</strong><span className="text-[11px] text-[var(--sanad-text-muted)]">{b.role}</span></span><ChevronLeft className="h-4 w-4"/>
            </button>)}
          </section>
        ) : null}
      </div>
    </div>
  );
}
