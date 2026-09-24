import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CalendarCheck2,
  Clock3,
  FileText,
  Library,
  ListTodo,
  Plug,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatSanadSourceDate } from '../../utils/sanadSourceDisplay';
import { describeSanadWorkItem } from './sanadWorkItemPresentation';

type WorkItem = {
  id: string;
  item_kind: string;
  status: string;
  priority: number;
  title: string;
  summary?: string | null;
  due_at?: string | null;
  source_type: string;
  source_id: string;
  business_id?: string | null;
  action_payload?: Record<string, unknown> | null;
  action_type?: string;
  metadata?: Record<string, unknown>;
};

type Connection = {
  id: string;
  connection_kind: string;
  provider_code: string;
  display_name: string;
  status: string;
  health_status: string;
  last_sync_at?: string | null;
  last_heartbeat_at?: string | null;
};

type EntryKind = 'today' | 'library' | 'tasks' | 'approvals' | 'automations' | 'connections';

function resolveKind(pathname: string): EntryKind {
  if (/\/library\/?$/.test(pathname)) return 'library';
  if (/\/work\/tasks\/?$/.test(pathname)) return 'tasks';
  if (/\/work\/approvals\/?$/.test(pathname)) return 'approvals';
  if (/\/work\/automations\/?$/.test(pathname)) return 'automations';
  if (/\/connections\/?$/.test(pathname)) return 'connections';
  return 'today';
}

const META: Record<EntryKind, { title: string; eyebrow: string; description: string; icon: typeof CalendarCheck2 }> = {
  today: {
    title: 'اليوم',
    eyebrow: 'ما يحتاج انتباهك الآن',
    description: 'أولويات تشغيلية مبنية على Work Items الحقيقية، وليست لوحة مؤشرات منفصلة عن مصادرها.',
    icon: CalendarCheck2,
  },
  library: {
    title: 'المكتبة',
    eyebrow: 'ملفات ومخرجات سند',
    description: 'المكان الموحد للمستندات والتقارير والكشوف والمخرجات التي تنتجها محادثات سند.',
    icon: Library,
  },
  tasks: {
    title: 'المهام',
    eyebrow: 'عمل قابل للمتابعة',
    description: 'المهام المفتوحة واليدوية التي تحتاج تنفيذًا أو متابعة.',
    icon: ListTodo,
  },
  approvals: {
    title: 'الموافقات',
    eyebrow: 'مراجعة قبل التنفيذ',
    description: 'الإجراءات التي تنتظر اعتمادًا صريحًا قبل التنفيذ الحتمي.',
    icon: BadgeCheck,
  },
  automations: {
    title: 'الأتمتة',
    eyebrow: 'تشغيل مجدول',
    description: 'المهام والقواعد المجدولة ستُدار هنا فوق عقود التشغيل المحكومة.',
    icon: Clock3,
  },
  connections: {
    title: 'الاتصالات',
    eyebrow: 'الأنظمة المرتبطة بسند',
    description: 'SANAD Bridge والأنظمة المحاسبية ومصادر البيانات الخارجية وحالة اتصالها.',
    icon: Plug,
  },
};

function formatDate(value?: string | null): string {
  const date = formatSanadSourceDate(value);
  return date.valid ? date.text : date.text === '—' ? '—' : `صيغة التاريخ في المصدر: ${date.text}`;
}

function WorkItemRow({ item }: { item: WorkItem }) {
  const shown = describeSanadWorkItem(item);
  return (
    <article className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[14px] font-semibold text-[var(--sanad-text-strong)]">{item.title}</h2>
          {item.priority >= 90 ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">عاجل</span> : null}
        </div>
        {item.summary ? <p className="mt-1 text-[12px] leading-5 text-[var(--sanad-text-muted)]">{item.summary}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--sanad-text-subtle)]">
          <span>{shown.sourceLabel}</span>
          <span>· {shown.statusLabel}</span>
          <span>· المرجع <bdi dir="ltr" title={shown.rawRef} className="font-medium">{shown.reference}</bdi></span>
          {shown.details.map((part, index) => <span key={index}>· <bdi dir="auto">{part}</bdi></span>)}
        </div>
        {shown.incomplete ? (
          <p className="mt-1 text-[10px] text-[var(--sanad-text-subtle)]">لم يُرجع المصدر الحالي اسم الطرف أو المبلغ؛ المرجع أعلاه يميّز هذا العنصر.</p>
        ) : null}
      </div>
      <div className="text-[11px] text-[var(--sanad-text-subtle)]">
        {item.due_at ? <bdi dir="auto">{formatDate(item.due_at)}</bdi> : 'بدون موعد'}
      </div>
    </article>
  );
}

export default function SanadUnifiedEntryRoute() {
  const kind = useMemo(() => resolveKind(window.location.pathname), []);
  const meta = META[kind];
  const Icon = meta.icon;
  const [loading, setLoading] = useState(kind !== 'library' && kind !== 'automations');
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (kind === 'library' || kind === 'automations') {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (kind === 'connections') {
        const { data, error: rpcError } = await supabase.rpc('list_my_sanad_connections_v1', {
          p_business_id: null,
        });
        if (rpcError) throw rpcError;
        const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
        setConnections(Array.isArray(payload.items) ? payload.items as Connection[] : []);
        return;
      }

      if (kind === 'today') {
        const { data, error: rpcError } = await supabase.rpc('get_my_sanad_today_v1', {
          p_business_id: null,
          p_limit: 50,
        });
        if (rpcError) throw rpcError;
        const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
        setItems(Array.isArray(payload.items) ? payload.items as WorkItem[] : []);
        setCounts(payload.counts && typeof payload.counts === 'object' ? payload.counts as Record<string, number> : {});
        return;
      }

      const view = kind === 'tasks' ? 'tasks' : 'approvals';
      const { data, error: rpcError } = await supabase.rpc('list_my_sanad_work_items_v1', {
        p_view: view,
        p_business_id: null,
        p_limit: 100,
      });
      if (rpcError) throw rpcError;
      const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
      setItems(Array.isArray(payload.items) ? payload.items as WorkItem[] : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل هذه المساحة.');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="min-h-full bg-[var(--sanad-bg-canvas)] px-4 py-5 text-[var(--sanad-text)] lg:px-7 lg:py-7" dir="rtl">
      <div className="mx-auto w-full max-w-[1120px]">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--sanad-border-subtle)] pb-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--sanad-radius-md)] bg-[var(--sanad-surface-2)] text-[var(--sanad-text-strong)]">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[var(--sanad-text-subtle)]">{meta.eyebrow}</p>
              <h1 className="mt-0.5 text-[20px] font-semibold tracking-[-0.02em] text-[var(--sanad-text-strong)]">{meta.title}</h1>
              <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--sanad-text-muted)]">{meta.description}</p>
            </div>
          </div>
          {kind !== 'library' && kind !== 'automations' ? (
            <button
              type="button"
              onClick={() => void load()}
              className="sanad-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] text-[var(--sanad-text-muted)]"
              aria-label="تحديث"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          ) : null}
        </header>

        {kind === 'today' && !loading && !error ? (
          <div className="grid grid-cols-3 gap-3 border-b border-[var(--sanad-border-subtle)] py-4 sm:max-w-lg">
            <div><p className="text-[10px] text-[var(--sanad-text-subtle)]">الموافقات</p><p className="mt-1 text-lg font-semibold">{counts.approvals ?? 0}</p></div>
            <div><p className="text-[10px] text-[var(--sanad-text-subtle)]">تحتاج انتباه</p><p className="mt-1 text-lg font-semibold">{counts.attention ?? 0}</p></div>
            <div><p className="text-[10px] text-[var(--sanad-text-subtle)]">المهام</p><p className="mt-1 text-lg font-semibold">{counts.tasks ?? 0}</p></div>
          </div>
        ) : null}

        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--sanad-text-subtle)]">جارٍ تحميل البيانات…</div>
        ) : error ? (
          <div className="mt-5 flex items-start gap-3 rounded-[var(--sanad-radius-lg)] border border-rose-200 bg-rose-50 p-4 text-rose-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div><p className="text-[13px] font-semibold">تعذر تحميل البيانات</p><p className="mt-1 text-xs leading-5">{error}</p></div>
          </div>
        ) : null}

        {!loading && !error && (kind === 'today' || kind === 'tasks' || kind === 'approvals') ? (
          <div className="divide-y divide-[var(--sanad-border-subtle)]">
            {items.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="mx-auto h-5 w-5 text-[var(--sanad-text-subtle)]" />
                <p className="mt-2 text-[13px] text-[var(--sanad-text-muted)]">لا توجد عناصر تحتاج إلى عرض الآن.</p>
              </div>
            ) : items.map((item) => <div key={item.id}><WorkItemRow item={item} /></div>)}
          </div>
        ) : null}

        {!loading && !error && kind === 'connections' ? (
          <div className="divide-y divide-[var(--sanad-border-subtle)]">
            {connections.length === 0 ? (
              <div className="py-12 text-center text-[13px] text-[var(--sanad-text-muted)]">لا توجد اتصالات مسجلة بعد.</div>
            ) : connections.map((connection) => (
              <article key={connection.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <h2 className="text-[14px] font-semibold text-[var(--sanad-text-strong)]">{connection.display_name}</h2>
                  <p className="mt-1 text-[11px] text-[var(--sanad-text-muted)]">{connection.provider_code} · {connection.connection_kind}</p>
                </div>
                <div className="text-left">
                  <p className="text-[11px] font-medium text-[var(--sanad-text-strong)]">{connection.health_status}</p>
                  <p className="mt-1 text-[10px] text-[var(--sanad-text-subtle)]">آخر مزامنة: {formatDate(connection.last_sync_at)}</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {!loading && kind === 'library' ? (
          <div className="py-14 text-center">
            <Library className="mx-auto h-7 w-7 text-[var(--sanad-text-subtle)]" />
            <h2 className="mt-3 text-[14px] font-semibold text-[var(--sanad-text-strong)]">طبقة المكتبة ستنتقل إلى هذا المسار</h2>
            <p className="mx-auto mt-2 max-w-lg text-[12px] leading-6 text-[var(--sanad-text-muted)]">
              لن ننشئ متصفح ملفات منفصلًا الآن قبل توحيد عقود الملفات والتقارير والمخرجات مع provenance والصلاحيات.
            </p>
          </div>
        ) : null}

        {!loading && kind === 'automations' ? (
          <div className="py-14 text-center">
            <Clock3 className="mx-auto h-7 w-7 text-[var(--sanad-text-subtle)]" />
            <h2 className="mt-3 text-[14px] font-semibold text-[var(--sanad-text-strong)]">الأتمتة محفوظة كمساحة مستقلة</h2>
            <p className="mx-auto mt-2 max-w-lg text-[12px] leading-6 text-[var(--sanad-text-muted)]">
              التنفيذ الفعلي سيأتي فوق Action Registry وعقود الموافقة والتدقيق؛ لا نعرض أتمتة وهمية قبل اكتمال تلك الطبقة.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
