import { useEffect, useMemo, useState } from 'react';
import { Archive, ChevronDown, ChevronLeft, MessageSquareText, RefreshCw, Search } from 'lucide-react';
import { navigateProduct } from '../../lib/productNavigation';
import type { SanadAgentThreadSummary } from '../../features/assistant/assistantWorkspaceApi';

type Props = {
  userId: string | null;
  compact?: boolean;
  onNavigate?: () => void;
};

const MAX_PREVIEW = 6;

export default function SanadSidebarConversations({ userId, compact = false, onNavigate }: Props) {
  const [threads, setThreads] = useState<SanadAgentThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!userId) {
      setThreads([]);
      setSelectedThreadId(null);
      setLoading(false);
      return;
    }
    let active = true;
    let sequence = 0;
    let lastFetchedAt = 0;
    const reload = async (force = true) => {
      if (!force && Date.now() - lastFetchedAt < 30000) return;
      const request = ++sequence;
      setLoading(true);
      try {
        const { listSanadAgentThreads } = await import('../../features/assistant/assistantWorkspaceApi');
        const result = await listSanadAgentThreads(50);
        if (!active || request !== sequence) return;
        setThreads(result);
        setError(null);
        lastFetchedAt = Date.now();
      } catch {
        if (active && request === sequence) setError('تعذر تحديث المحادثات.');
      } finally {
        if (active && request === sequence) setLoading(false);
      }
    };
    const refresh = () => { void reload(true); };
    const onFocus = () => { void reload(false); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void reload(false);
    };
    void reload();
    window.addEventListener('sanad:threads-updated', refresh);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.removeEventListener('sanad:threads-updated', refresh);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId, refreshToken]);

  useEffect(() => {
    const onSelection = (event: Event) => {
      const threadId = (event as CustomEvent<string | null>).detail;
      setSelectedThreadId(threadId || null);
      if (threadId) setThreads((current) => current.map((thread) =>
        thread.id === threadId ? { ...thread, unread_count: 0 } : thread
      ));
    };
    window.addEventListener('sanad:thread-selected', onSelection);
    return () => window.removeEventListener('sanad:thread-selected', onSelection);
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('ar');
    return threads.filter((thread) =>
      thread.status === 'active'
      && (!term || thread.title.toLocaleLowerCase('ar').includes(term)
        || (thread.summary || '').toLocaleLowerCase('ar').includes(term))
    );
  }, [threads, search]);

  const visible = showMore || Boolean(search.trim()) ? filtered : filtered.slice(0, MAX_PREVIEW);
  const onConversation = (threadId: string) => {
    onNavigate?.();
    setSelectedThreadId(threadId);
    if (/\/sanad-ai\/?$/.test(window.location.pathname)) {
      window.dispatchEvent(new CustomEvent('sanad:select-conversation', { detail: { threadId } }));
    } else {
      navigateProduct(`sanad-ai?thread=${encodeURIComponent(threadId)}`);
    }
  };

  const archive = async (thread: SanadAgentThreadSummary) => {
    if (archivingId || (thread.my_role && thread.my_role !== 'owner')) return;
    setArchivingId(thread.id);
    try {
      const { archiveSanadAgentThread } = await import('../../features/assistant/assistantWorkspaceApi');
      await archiveSanadAgentThread(thread.id);
      setThreads((current) => current.filter((item) => item.id !== thread.id));
      window.dispatchEvent(new CustomEvent('sanad:thread-archived', { detail: { threadId: thread.id } }));
      setRefreshToken((current) => current + 1);
      setError(null);
    } catch {
      setError('تعذرت أرشفة المحادثة. حاول مجددًا.');
    } finally {
      setArchivingId(null);
    }
  };

  return (
    <section
      data-sanad-global-conversations="true"
      aria-label="المحادثات"
      className={compact ? 'lg:hidden' : undefined}
    >
      <div className="sanad-sidebar-section-heading flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setExpanded(true);
            navigateProduct('sanad-ai');
            onNavigate?.();
          }}
          className="sanad-focus-ring min-w-0 flex-1 text-right text-[12px] font-semibold text-[var(--sanad-text-strong)]"
          aria-current={/\/sanad-ai\/?$/.test(window.location.pathname) ? 'page' : undefined}
        >
          المحادثات
        </button>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? 'طي المحادثات' : 'عرض المحادثات'}
          aria-expanded={expanded}
          className="sanad-focus-ring flex h-7 w-7 items-center justify-center rounded-md text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-nav-hover-bg)]"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? '' : '-rotate-90'}`} />
        </button>
      </div>

      {expanded ? (
        <div className="px-1 pt-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sanad-text-subtle)]" aria-hidden="true" />
            <span className="sr-only">البحث في المحادثات</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="البحث في المحادثات"
              className="sanad-focus-ring w-full rounded-[var(--sanad-radius-sm)] border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] py-2 pl-2 pr-8 text-[12px] text-[var(--sanad-text-strong)] placeholder:text-[var(--sanad-text-subtle)]"
            />
          </label>

          {loading && !threads.length ? (
            <p className="px-2 py-3 text-[11px] text-[var(--sanad-text-subtle)]">جارٍ تحميل المحادثات…</p>
          ) : error ? (
            <div className="flex items-center justify-between gap-2 px-2 py-2 text-[11px] text-[var(--sanad-danger)]">
              <span>{error}</span>
              <button type="button" onClick={() => setRefreshToken((value) => value + 1)} aria-label="إعادة تحميل المحادثات">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {userId && !loading && !error && filtered.length === 0 ? (
            <p className="px-2 py-3 text-[11px] leading-5 text-[var(--sanad-text-subtle)]">
              {search ? 'لا توجد محادثات مطابقة.' : 'ستظهر محادثاتك المحفوظة هنا.'}
            </p>
          ) : null}

          <div className="mt-1 space-y-0.5">
            {visible.map((thread) => {
              const active = /\/sanad-ai\/?$/.test(window.location.pathname)
                && thread.id === (selectedThreadId || threads.find((item) => item.status === 'active')?.id);
              return (
                <div
                  key={thread.id}
                  className={`group flex min-w-0 items-center rounded-[var(--sanad-radius-sm)] transition-colors ${active ? 'bg-[var(--sanad-nav-active-bg)]' : 'hover:bg-[var(--sanad-nav-hover-bg)]'}`}
                >
                  <button
                    type="button"
                    onClick={() => onConversation(thread.id)}
                    aria-current={active ? 'page' : undefined}
                    className="sanad-focus-ring flex min-h-9 min-w-0 flex-1 items-center gap-2 px-2 text-right text-[12px]"
                    title={thread.title}
                  >
                    <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-[var(--sanad-text-subtle)]" aria-hidden="true" />
                    <span className="min-w-0 flex-1 py-1.5">
                      <span className={`block truncate ${active ? 'font-semibold text-[var(--sanad-text-strong)]' : 'text-[var(--sanad-text-muted)]'}`}>
                        {thread.title}
                      </span>
                      {(thread.my_role === 'viewer' || thread.my_role === 'member') ? (
                        <span className="block truncate text-[10px] text-[var(--sanad-text-subtle)]">
                          {thread.my_role === 'viewer' ? 'قراءة فقط' : 'مشتركة'} · {thread.message_count} رسالة
                        </span>
                      ) : null}
                    </span>
                    {thread.unread_count ? (
                      <span className="inline-flex min-w-5 shrink-0 justify-center rounded-full bg-[var(--sanad-interactive-soft)] px-1 py-0.5 text-[10px] font-semibold text-[var(--sanad-interactive)]">
                        {thread.unread_count > 99 ? '99+' : thread.unread_count}
                      </span>
                    ) : null}
                  </button>
                  {(!thread.my_role || thread.my_role === 'owner') ? (
                    <button
                      type="button"
                      disabled={Boolean(archivingId)}
                      onClick={() => void archive(thread)}
                      title="أرشفة المحادثة"
                      aria-label={`أرشفة ${thread.title}`}
                      className="sanad-focus-ring mr-0.5 flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-[var(--sanad-text-subtle)] opacity-0 transition-opacity hover:bg-[var(--sanad-surface-1)] hover:text-[var(--sanad-text-strong)] focus:opacity-100 group-hover:opacity-100 disabled:opacity-30 max-lg:opacity-100"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {active ? <ChevronLeft className="ml-1 h-3 w-3 shrink-0 text-[var(--sanad-interactive)]" /> : null}
                </div>
              );
            })}
          </div>

          {!search && filtered.length > MAX_PREVIEW ? (
            <button
              type="button"
              onClick={() => setShowMore((value) => !value)}
              className="sanad-focus-ring mt-1 w-full rounded-md px-2 py-2 text-right text-[11px] font-medium text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-nav-hover-bg)]"
            >
              {showMore ? 'عرض محادثات أقل' : `عرض المزيد (${filtered.length - MAX_PREVIEW})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
