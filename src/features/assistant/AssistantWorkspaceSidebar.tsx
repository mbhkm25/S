import { useEffect, useState } from 'react';
import {
  Activity,
  Archive,
  Brain,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronLeft,
  Layers3,
  MessageSquare,
  MessageSquarePlus,
  RefreshCcw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import SanadIntelligenceMark from './SanadIntelligenceMark';
import SanadAssistantStatus from './SanadAssistantStatus';
import SanadUnifiedNavLinks from '../../components/navigation/SanadUnifiedNavLinks';
import type { SanadAssistantPresentationState } from './sanadAssistantPresentation';
import { SettingRow, SettingSwitch, SettingsSection } from '../../components/settings/SettingsControls';
import { getMySanadAgentPerformance, type SanadAgentPerformanceSummary } from './assistantObservabilityApi';
import type {
  SanadAgentMemory,
  SanadAgentPreferences,
  SanadAgentThreadSummary,
} from './assistantWorkspaceApi';

type Props = {
  assistantState: SanadAssistantPresentationState;
  businessLabel?: string | null;
  businessLoading?: boolean;
  canChooseBusiness?: boolean;
  onChooseBusiness?: () => void;
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
  pendingPreferenceKey?: keyof Pick<SanadAgentPreferences,
    'save_history_enabled' | 'memory_enabled' | 'proactive_insights_enabled' | 'response_cards_enabled'
  > | null;
  memories: SanadAgentMemory[];
  onForgetMemory: (memoryId: string) => void;
};

type SidebarTab = 'chats' | 'memory' | 'settings';

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
          className="absolute inset-0 z-40 bg-slate-950/25 backdrop-blur-[1px] xl:hidden"
        />
      ) : null}
      <aside
        data-sidebar-density="compact"
        className={`sanad-sidebar-surface absolute inset-y-0 right-0 z-50 flex h-full min-h-0 w-[84vw] max-w-[320px] flex-col overflow-hidden border-l shadow-[var(--sanad-shadow-3)] transition-transform xl:static xl:z-auto xl:w-[284px] xl:max-w-none xl:translate-x-0 xl:shadow-none ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
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
  const [secondaryNavOpen, setSecondaryNavOpen] = useState(false);

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
      <div className="shrink-0 border-b border-slate-100 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-900">
              <SanadIntelligenceMark state={props.assistantState} size={28} />
            </span>
            <div className="min-w-0">
              <strong className="block truncate text-sm font-semibold tracking-[-0.01em] text-slate-950">سند</strong>
              <SanadAssistantStatus state={props.assistantState} className="mt-0.5" announce />
            </div>
          </div>
          <button type="button" onClick={props.onCloseMobile} className="rounded-lg p-1.5 text-slate-500 xl:hidden" aria-label="إغلاق الشريط الجانبي">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 flex min-h-6 items-center gap-2 text-[11px] text-slate-500">
          <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          {props.businessLoading ? (
            <span>تحميل سياق النشاط…</span>
          ) : props.businessLabel ? (
            <span className="truncate">{props.businessLabel}</span>
          ) : props.canChooseBusiness ? (
            <button type="button" onClick={props.onChooseBusiness} className="font-medium text-slate-700 underline-offset-2 hover:underline">
              اختر نشاط المحادثة
            </button>
          ) : (
            <span>بدون سياق نشاط</span>
          )}
        </div>
      </div>

      <div className="shrink-0 border-b border-slate-100 px-3 py-2.5">
        <button
          type="button"
          onClick={props.onNew}
          className="sanad-focus-ring flex w-full items-center justify-center gap-2 rounded-[var(--sanad-radius-md)] bg-[var(--sanad-surface-inverse)] px-3 py-2.5 text-[13px] font-medium text-white transition active:scale-[.99]"
        >
          <MessageSquarePlus className="h-4 w-4" />
          محادثة جديدة
        </button>
        <div className="mt-2">
          <SanadUnifiedNavLinks
            dense
            sections={['primary']}
            onNavigate={props.onCloseMobile}
          />
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-3 border-b border-slate-100 px-2">
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
              className={`flex min-h-10 items-center justify-center gap-1.5 border-b-2 px-2 text-xs font-medium transition ${active ? 'border-slate-950 text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              <Component className="h-3.5 w-3.5" />
              {String(label)}
            </button>
          );
        })}
      </div>

      {tab === 'chats' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {props.loading ? (
              <p className="p-4 text-center text-xs text-slate-400">جارٍ تحميل المحادثات…</p>
            ) : props.threads.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <MessageSquare className="mx-auto h-5 w-5 text-slate-300" />
                <p className="mt-2 text-xs leading-5 text-slate-400">ستظهر محادثاتك المحفوظة هنا.</p>
              </div>
            ) : (
              props.threads.filter((thread) => thread.status === 'active').map((thread) => {
                const active = thread.id === props.selectedThreadId;
                return (
                  <div key={thread.id} className={`group flex items-center border-b border-slate-100 transition ${active ? 'bg-white' : 'hover:bg-white/60'}`}>
                    <button
                      type="button"
                      onClick={() => props.onSelect(thread.id)}
                      className="min-w-0 flex-1 px-2 py-3 text-right"
                    >
                      <p className={`truncate text-[13px] font-medium ${active ? 'text-slate-950' : 'text-slate-700'}`}>
                        {thread.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{thread.message_count} رسالة</span>
                        {thread.unread_count ? (
                          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {thread.unread_count > 99 ? '99+' : thread.unread_count}
                          </span>
                        ) : null}
                        {thread.my_role && thread.my_role !== 'owner' ? (
                          <span>{thread.my_role === 'viewer' ? 'قراءة فقط' : 'مشتركة'}</span>
                        ) : null}
                      </div>
                    </button>
                    {(!thread.my_role || thread.my_role === 'owner') ? (
                      <button
                        type="button"
                        onClick={() => props.onArchive(thread.id)}
                        title="أرشفة"
                        className="ml-1 hidden rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700 group-hover:block"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    {active ? <ChevronLeft className="ml-2 h-3.5 w-3.5 text-slate-500" /> : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {tab === 'memory' ? (
        <div data-sidebar-scroll-region="memory" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]">
          <div className="border-b border-slate-100 px-1 pb-3">
            <div className="flex items-center gap-2 text-slate-800">
              <Brain className="h-4 w-4" />
              <p className="text-[13px] font-semibold">ذاكرة سند</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              تحفظ التفضيلات والسياق المستقر. الأرصدة والفواتير لا تعتمد على الذاكرة، بل يعاد قراءتها من النظام الحي.
            </p>
          </div>

          <div className="mt-3 space-y-2">
            {props.memories.length === 0 ? (
              <p className="px-2 py-5 text-center text-xs leading-5 text-slate-400">
                لا توجد ذكريات محفوظة بعد. يمكنك قول: «تذكر أن…».
              </p>
            ) : props.memories.map((memory) => (
              <div key={memory.id} className="border-b border-slate-100 bg-transparent px-1 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] leading-6 text-slate-700">{memory.value_text}</p>
                  <button
                    type="button"
                    onClick={() => props.onForgetMemory(memory.id)}
                    className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                    title="نسيان"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">
                  {memory.category}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div data-sidebar-scroll-region="settings" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]">
          <div>
            <h3 className="text-base font-semibold text-slate-900">إعدادات سند</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">تحكم في ذاكرة سند وطريقة عرض الإجابات.</p>
          </div>

          {props.preferences ? (
            <SettingsSection title="التفضيلات" description="تحكم في الحفظ والذاكرة وطريقة عرض إجابات سند.">
              {[
                ['save_history_enabled', 'حفظ المحادثات', 'احتفظ بسجل المحادثات على حسابك.'],
                ['memory_enabled', 'الذاكرة طويلة المدى', 'استخدم التفضيلات والملاحظات المستقرة بين المحادثات.'],
                ['proactive_insights_enabled', 'تنبيهات ذكية', 'أظهر ما يستحق الانتباه عندما تدعمه بيانات النظام.'],
                ['response_cards_enabled', 'بطاقات البيانات', 'اعرض كشوف الحساب والمستندات في بطاقات منظمة قابلة للنسخ.'],
              ].map(([key, title, description]) => {
                const k = key as keyof Pick<SanadAgentPreferences,
                  'save_history_enabled' | 'memory_enabled' | 'proactive_insights_enabled' | 'response_cards_enabled'
                >;
                const pending = props.pendingPreferenceKey === k;
                const busy = props.pendingPreferenceKey !== null && props.pendingPreferenceKey !== undefined;
                return (
                  <SettingRow
                    key={String(key)}
                    label={String(title)}
                    description={String(description)}
                    meta={pending ? <span className="text-[11px] text-slate-400">جارٍ حفظ التغيير…</span> : null}
                    control={(
                      <SettingSwitch
                        checked={props.preferences[k]}
                        label={String(title)}
                        pending={pending}
                        disabled={busy && !pending}
                        onCheckedChange={(value) => props.onPreferenceChange(k, value)}
                      />
                    )}
                  />
                );
              })}
            </SettingsSection>
          ) : (
            <div className="mt-4" aria-busy="true">
              <p className="px-1 text-xs text-slate-400">جارٍ تحميل الإعدادات…</p>
              <div className="mt-2 space-y-1" aria-hidden="true">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 px-1 py-3">
                    <div className="min-w-0 space-y-2">
                      <div className="h-3 w-24 rounded bg-slate-100" />
                      <div className="h-2.5 w-full max-w-[13rem] rounded bg-slate-100/80" />
                    </div>
                    <div className="h-6 w-10 shrink-0 rounded-full bg-slate-100" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4">
            <SettingRow
              label={(
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Activity className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="min-w-0">أداء سند · آخر 7 أيام</span>
                </span>
              )}
              description="قياسات زمنية فقط، دون حفظ محتوى رسائلك."
              control={(
                <button
                  type="button"
                  onClick={() => void loadPerformance()}
                  disabled={performanceLoading}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 outline-none hover:bg-slate-50 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:opacity-40"
                  title="تحديث مؤشرات الأداء"
                  aria-label="تحديث مؤشرات الأداء"
                >
                  <RefreshCcw className={`h-3.5 w-3.5 ${performanceLoading ? 'animate-spin' : ''}`} />
                </button>
              )}
            />

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
                        <p className="text-[11px] font-medium text-slate-400">{labels[scope.scope] || scope.scope}</p>
                        <p className="mt-1 text-xs font-medium text-slate-800" dir="ltr">
                          P50 {scope.p50_total_ms ?? '—'} ms
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400" dir="ltr">
                          P95 {scope.p95_total_ms ?? '—'} ms · fail {Math.round((scope.failure_rate || 0) * 100)}%
                        </p>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-slate-400">ستظهر المؤشرات بعد استخدام سند على النسخة المنشورة.</p>
            )}
          </div>

          <div className="mt-4 border-t border-slate-100 px-1 pt-3 text-slate-600">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              <p className="text-xs font-semibold">الحقائق المالية تبقى حية</p>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-400">حتى مع تشغيل الذاكرة، يعيد المساعد قراءة الأرصدة والمستندات من مصدرها عند كل طلب.</p>
          </div>
        </div>
      ) : null}

      <div className="shrink-0 border-t border-slate-100 px-2 py-2">
        <button
          type="button"
          onClick={() => setSecondaryNavOpen((value) => !value)}
          aria-expanded={secondaryNavOpen}
          className="sanad-focus-ring flex min-h-9 w-full items-center gap-2 rounded-[var(--sanad-radius-md)] px-2.5 text-[12px] font-medium text-[var(--sanad-text-muted)] transition hover:bg-[var(--sanad-surface-1)] hover:text-[var(--sanad-text-strong)]"
        >
          <Layers3 className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 text-right">العمل والقدرات</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${secondaryNavOpen ? 'rotate-180' : ''}`} />
        </button>
        {secondaryNavOpen ? (
          <div className="mt-1 max-h-[34vh] overflow-y-auto overscroll-contain pb-1 [scrollbar-gutter:stable]">
            <SanadUnifiedNavLinks
              dense
              sections={['work', 'capabilities', 'utility']}
              onNavigate={props.onCloseMobile}
            />
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
