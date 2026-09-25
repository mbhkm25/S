import { useEffect, useState } from 'react';
import {
  ArrowUpLeft, BriefcaseBusiness, ChevronLeft, Loader2, MessageSquare,
  Plus, ShieldCheck, UserRound,
} from 'lucide-react';
import { navigateProduct } from '../../lib/productNavigation';
import {
  loadProjectQuickData, openNewProjectConversation, type ProjectQuickData,
} from './projectQuickAccess';
import type { SanadAgentThreadSummary } from '../assistant/assistantWorkspaceApi';

type CardProps = {
  /** React list identity, consumed by JSX rather than by the card component. */
  key?: string;
  name: string;
  kind: 'personal' | 'business';
  id?: string;
  recent: SanadAgentThreadSummary[];
  creating: boolean;
  onNew: () => void;
  pendingContract?: boolean;
};

function ProjectCard({ name, kind, id, recent, creating, onNew, pendingContract }: CardProps) {
  const business = kind === 'business';
  const Icon = business ? BriefcaseBusiness : UserRound;
  const path = business ? `commercial?view=conversations&business=${encodeURIComponent(id || '')}` : 'financial?view=conversations';
  const openThread = (threadId: string) => {
    const params = new URLSearchParams({ thread: threadId, project: kind });
    if (business && id) params.set('business', id);
    navigateProduct(`sanad-ai?${params.toString()}`);
  };
  return (
    <article data-sanad-home-project={kind} className="sanad-home-project group relative flex min-w-0 flex-col overflow-hidden">
      <div className={`sanad-home-project-accent ${business ? 'is-business' : 'is-personal'}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => navigateProduct(path)}
          className="sanad-focus-ring flex min-w-0 items-start gap-2.5 rounded-lg text-right"
        >
          <span className={`sanad-home-project-icon ${business ? 'is-business' : 'is-personal'}`}><Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" /></span>
          <span className="min-w-0">
            <span className="block text-[10px] text-[var(--sanad-text-subtle)]">{business ? 'مساحة الأعمال' : 'مساحتك الشخصية'}</span>
            <strong className="mt-0.5 block truncate text-[15px] font-semibold leading-6 text-[var(--sanad-text-strong)]">{name}</strong>
          </span>
        </button>
        <button type="button" onClick={() => navigateProduct(path)} className="sanad-focus-ring inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[11px] text-[var(--sanad-text-muted)] hover:text-[var(--sanad-interactive)]" aria-label={`فتح مساحة ${name}`}>
          فتح <ArrowUpLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 min-h-[105px]">
        <p className="mb-1.5 text-[10px] font-medium text-[var(--sanad-text-subtle)]">آخر المحادثات</p>
        {recent.length ? (
          <div className="divide-y divide-[var(--sanad-border-subtle)]">
            {recent.slice(0, 3).map(thread => (
              <button
                key={thread.id}
                type="button"
                onClick={() => openThread(thread.id)}
                title={thread.title}
                className="sanad-focus-ring flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md py-1.5 text-right text-[12px] hover:text-[var(--sanad-interactive)]"
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-[var(--sanad-text-subtle)]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-[var(--sanad-text-subtle)]" aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : (
          <p className="py-3 text-[11px] leading-5 text-[var(--sanad-text-muted)]">
            {pendingContract && !business
              ? 'ستظهر المحادثات الشخصية بعد تفعيل عقد المساحات؛ لم نخلط معها المحادثات القديمة.'
              : 'لا توجد محادثات حديثة متاحة للعرض.'}
          </p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--sanad-border-subtle)] pt-3">
        <button type="button" onClick={onNew} disabled={creating} title={pendingContract && !business ? "يلزم تفعيل عقد المساحات لإنشاء محادثات شخصية. اضغط لمعرفة الحالة." : undefined} className="sanad-focus-ring sanad-home-new-chat inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-3 text-[11px] font-semibold disabled:opacity-50">
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          محادثة جديدة
        </button>
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--sanad-text-subtle)]">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> سياق مستقل
        </span>
      </div>
    </article>
  );
}

export default function SanadQuickProjectHome() {
  const [data, setData] = useState<ProjectQuickData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadProjectQuickData()
      .then(value => { if (mounted) setData(value); })
      .catch(() => { if (mounted) setError('تعذر تحميل الاختصارات. افتح مساحاتك من الشريط الجانبي.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const create = async (kind: 'personal' | 'business', id?: string) => {
    if (creating) return;
    setCreating(kind === 'personal' ? kind : id || kind);
    setError(null);
    try {
      const thread = await openNewProjectConversation(kind, id);
      const params = new URLSearchParams({ thread, project: kind });
      if (kind === 'business' && id) params.set('business', id);
      navigateProduct(`sanad-ai?${params.toString()}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إنشاء المحادثة.');
    } finally { setCreating(null); }
  };

  return (
    <section aria-label="الوصول السريع إلى مساحاتك" data-sanad-home-quick-projects="true" className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--sanad-text-strong)]">مساحاتك</h2>
          <p className="mt-1 text-[11px] text-[var(--sanad-text-muted)]">افتح محادثة في سياقها مباشرة، أو أكمل إحدى محادثاتك الأخيرة.</p>
        </div>
        <span className="text-[10px] text-[var(--sanad-text-subtle)]">كل محادثة تتبع مساحة واحدة</span>
      </div>
      {error ? <div role="alert" className="mb-3 rounded-xl bg-[var(--sanad-warning-soft)] px-3 py-2 text-[11px] text-[var(--sanad-warning)]">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <ProjectCard
          kind="personal"
          name="المدير الشخصي"
          recent={data?.personal || []}
          pendingContract={data?.awaitingProjectContract}
          creating={creating === 'personal'}
          onNew={() => void create('personal')}
        />
        {loading ? (
          <div className="sanad-home-project flex min-h-[232px] items-center justify-center gap-2 text-[11px] text-[var(--sanad-text-subtle)]" aria-busy="true">
            <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل مساحات الأعمال…
          </div>
        ) : data?.businesses.length ? data.businesses.slice(0, 3).map(business => (
          <ProjectCard
            key={business.id}
            kind="business"
            id={business.id}
            name={business.name}
            recent={data.businessThreads[business.id] || []}
            creating={creating === business.id}
            onNew={() => void create('business', business.id)}
          />
        )) : (
          <button
            type="button"
            onClick={() => navigateProduct('commercial')}
            className="sanad-focus-ring sanad-home-project flex min-h-[232px] flex-col items-center justify-center gap-2 text-center text-[12px] text-[var(--sanad-text-muted)]"
          >
            <BriefcaseBusiness className="h-6 w-6" />
            <strong className="text-[13px] text-[var(--sanad-text-strong)]">الأعمال</strong>
            {error ? 'افتح مساحة الأعمال لإعادة المحاولة.' : 'ستظهر الأنشطة التي تملك صلاحية الدخول إليها.'}
          </button>
        )}
      </div>
      {data && data.businesses.length > 3 ? (
        <button type="button" onClick={() => navigateProduct('commercial')}
          className="sanad-focus-ring mt-3 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-[var(--sanad-interactive)] hover:bg-[var(--sanad-interactive-soft)]">
          عرض بقية الأنشطة ({data.businesses.length - 3}) <ArrowUpLeft className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </section>
  );
}
