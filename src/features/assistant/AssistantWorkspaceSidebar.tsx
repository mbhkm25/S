import { useEffect, useState } from 'react';
import {
  Activity,
  Archive,
  Brain,
  Check,
  ChevronLeft,
  MessageSquare,
  MessageSquarePlus,
  RefreshCcw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import SanadPulseMark from './SanadPulseMark';
import { getMySanadAgentPerformance, type SanadAgentPerformanceSummary } from './assistantObservabilityApi';
import type {
  SanadAgentMemory,
  SanadAgentPreferences,
  SanadAgentThreadSummary,
} from './assistantWorkspaceApi';

type Props = {
  threads: SanadAgentThreadSummary[];
  selectedThreadId: string | null;
  loading?: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  onArchive: (threadId: string) => void;
  preferences: SanadAgentPreferences | null;
  onPreferenceChange: (key: keyof Pick<SanadAgentPreferences,
    'save_history_enabled' | 'memory_enabled' | 'proactive_insights_enabled' | 'response_cards_enabled'
  >, value: boolean) => void;
  memories: SanadAgentMemory[];
  onForgetMemory: (memoryId: string) => void;
};

type SidebarTab = 'chats' | 'memory' | 'settings';

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`relative h-6 w-11 rounded-full transition ${enabled ? 'bg-slate-950' : 'bg-slate-200'}`}
    >
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${enabled ? 'right-6' : 'right-1'}`} />
    </button>
  );
}

function Shell({ children, mobileOpen, onCloseMobile }: {
  children: React.ReactNode;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="إغلاق الشريط الجانبي"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-[1px] xl:hidden"
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-[86vw] max-w-[340px] flex-col border-l border-slate-200/80 bg-[#FBFBFA] shadow-2xl transition-transform xl:static xl:z-auto xl:w-[308px] xl:max-w-none xl:translate-x-0 xl:shadow-none ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {children}
      </aside>
    </>
  );
}

export default function AssistantWorkspaceSidebar(props: Props) {
  const [tab, setTab] = useState<SidebarTab>('chats');
  const [performanceSummary, setPerformanceSummary] = useState<SanadAgentPerformanceSummary | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);

  const loadPerformance = async () => {
    setPerformanceLoading(true);
    try {
      setPerformanceSummary(await getMySanadAgentPerformance(7));
    } catch {
      setPerformanceSummary(null);
    } finally {
      setPerformanceLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'settings' && !performanceSummary && !performanceLoading) {
      void loadPerformance();
    }
  }, [tab]);

  return (
    <Shell mobileOpen={props.mobileOpen} onCloseMobile={props.onCloseMobile}>
      <div className="flex items-center justify-between border-b border-slate-100 p-3 xl:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-950 text-white">
            <SanadPulseMark size={18} />
          </span>
          <strong className="text-xs text-slate-900">سند</strong>
        </div>
        <button type="button" onClick={props.onCloseMobile} className="rounded-xl p-2 text-slate-500">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 border-b border-slate-100 p-2">
        {[
          ['chats', MessageSquare, 'المحادثات'],
          ['memory', Brain, 'الذاكرة'],
          ['settings', Settings2, 'الضبط'],
        ].map(([id, Icon, label]) => {
          const Component = Icon as typeof MessageSquare;
          const active = tab === id;
          return (
            <button
              key={String(id)}
              type="button"
              onClick={() => setTab(id as SidebarTab)}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition ${active ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white/70'}`}
            >
              <Component className="h-3.5 w-3.5" />
              {String(label)}
            </button>
          );
        })}
      </div>

      {tab === 'chats' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="p-3">
            <button
              type="button"
              onClick={props.onNew}
              className="flex w-full items-center justify-center gap-2 rounded-[1.1rem] bg-slate-950 px-3 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(15,23,42,.16)] transition active:scale-[.99]"
            >
              <MessageSquarePlus className="h-4 w-4" />
              محادثة جديدة
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {props.loading ? (
              <p className="p-4 text-center text-xs text-slate-400">جارٍ تحميل المحادثات…</p>
            ) : props.threads.length === 0 ? (
              <div className="m-2 rounded-2xl bg-slate-50 p-4 text-center">
                <MessageSquare className="mx-auto h-5 w-5 text-slate-300" />
                <p className="mt-2 text-xs leading-5 text-slate-400">ستظهر محادثاتك المحفوظة هنا.</p>
              </div>
            ) : (
              props.threads.filter((thread) => thread.status === 'active').map((thread) => {
                const active = thread.id === props.selectedThreadId;
                return (
                  <div key={thread.id} className={`group mb-1.5 flex items-center rounded-2xl border transition ${active ? 'border-slate-200 bg-white shadow-sm' : 'border-transparent hover:border-slate-100 hover:bg-white/70'}`}>
                    <button
                      type="button"
                      onClick={() => props.onSelect(thread.id)}
                      className="min-w-0 flex-1 p-3 text-right"
                    >
                      <p className={`truncate text-sm font-semibold ${active ? 'text-slate-950' : 'text-slate-700'}`}>
                        {thread.title}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {thread.message_count} رسالة
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onArchive(thread.id)}
                      title="أرشفة"
                      className="ml-1 hidden rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700 group-hover:block"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                    {active ? <ChevronLeft className="ml-2 h-3.5 w-3.5 text-slate-500" /> : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {tab === 'memory' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="rounded-2xl bg-indigo-50 p-3">
            <div className="flex items-center gap-2 text-indigo-800">
              <Brain className="h-4 w-4" />
              <p className="text-sm font-semibold">ذاكرة سند</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-indigo-700/70">
              تحفظ التفضيلات والسياق المستقر. الأرصدة والفواتير لا تعتمد على الذاكرة، بل يعاد قراءتها من النظام الحي.
            </p>
          </div>

          <div className="mt-3 space-y-2">
            {props.memories.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs leading-5 text-slate-400">
                لا توجد ذكريات محفوظة بعد. يمكنك قول: «تذكر أن…».
              </p>
            ) : props.memories.map((memory) => (
              <div key={memory.id} className="border-b border-slate-100 bg-transparent px-1 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs leading-5 text-slate-700">{memory.value_text}</p>
                  <button
                    type="button"
                    onClick={() => props.onForgetMemory(memory.id)}
                    className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                    title="نسيان"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-sm font-medium text-slate-500">
                  {memory.category}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-900">إعدادات سند</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">تحكم في ذاكرة سند وطريقة عرض الإجابات.</p>
          </div>

          {props.preferences ? (
            <div className="mt-4 space-y-2">
              {[
                ['save_history_enabled', 'حفظ المحادثات', 'احتفظ بسجل المحادثات على حسابك.'],
                ['memory_enabled', 'الذاكرة طويلة المدى', 'استخدم التفضيلات والملاحظات المستقرة بين المحادثات.'],
                ['proactive_insights_enabled', 'تنبيهات ذكية', 'أظهر ما يستحق الانتباه عندما تدعمه بيانات النظام.'],
                ['response_cards_enabled', 'بطاقات البيانات', 'اعرض كشوف الحساب والمستندات في بطاقات منظمة قابلة للنسخ.'],
              ].map(([key, title, description]) => {
                const k = key as keyof Pick<SanadAgentPreferences,
                  'save_history_enabled' | 'memory_enabled' | 'proactive_insights_enabled' | 'response_cards_enabled'
                >;
                return (
                  <div key={String(key)} className="flex items-center justify-between gap-3 border-b border-slate-100 bg-transparent px-1 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{String(title)}</p>
                      <p className="mt-1 text-sm leading-4 text-slate-400">{String(description)}</p>
                    </div>
                    <Toggle enabled={props.preferences[k]} onChange={(value) => props.onPreferenceChange(k, value)} />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-400">جارٍ تحميل الإعدادات…</p>
          )}

          <div className="mt-4 border-b border-slate-100 bg-transparent px-1 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-800">أداء سند · آخر 7 أيام</p>
                  <p className="mt-0.5 text-sm text-slate-400">قياسات زمنية فقط، دون حفظ محتوى رسائلك.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadPerformance()}
                disabled={performanceLoading}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40"
                title="تحديث مؤشرات الأداء"
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${performanceLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {performanceLoading && !performanceSummary ? (
              <p className="mt-3 text-sm text-slate-400">جارٍ تحميل القياسات…</p>
            ) : performanceSummary?.scopes?.length ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {performanceSummary.scopes
                  .filter((scope) => ['agent_client_turn','thread_load','voice_transcription','attachment_analysis'].includes(scope.scope))
                  .slice(0,4)
                  .map((scope) => {
                    const labels: Record<string,string> = {
                      agent_client_turn: 'استجابة سند',
                      thread_load: 'فتح المحادثة',
                      voice_transcription: 'تحويل الصوت',
                      attachment_analysis: 'تحليل المرفق',
                    };
                    return (
                      <div key={scope.scope} className="rounded-xl bg-slate-50 p-2.5">
                        <p className="text-sm font-medium text-slate-400">{labels[scope.scope] || scope.scope}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-800" dir="ltr">
                          P50 {scope.p50_total_ms ?? '—'} ms
                        </p>
                        <p className="mt-0.5 text-sm text-slate-400" dir="ltr">
                          P95 {scope.p95_total_ms ?? '—'} ms · fail {Math.round((scope.failure_rate || 0) * 100)}%
                        </p>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-4 text-slate-400">ستظهر المؤشرات بعد استخدام سند على النسخة المنشورة.</p>
            )}
          </div>

          <div className="mt-4 rounded-2xl bg-emerald-50 p-3 text-emerald-800">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              <p className="text-xs font-semibold">الحقائق المالية تبقى حية</p>
            </div>
            <p className="mt-1 text-sm leading-4 opacity-75">حتى مع تشغيل الذاكرة، يعيد المساعد قراءة الأرصدة والمستندات من مصدرها عند كل طلب.</p>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
