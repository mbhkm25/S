import { useEffect, useState } from 'react';
import {
  Activity,
  Brain,
  BriefcaseBusiness,
  Check,
  MessageSquarePlus,
  RefreshCcw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import SanadIntelligenceMark from './SanadIntelligenceMark';
import SanadAssistantStatus from './SanadAssistantStatus';
import type { SanadAssistantPresentationState } from './sanadAssistantPresentation';
import { SettingRow, SettingSwitch, SettingsSection } from '../../components/settings/SettingsControls';
import { getMySanadAgentPerformance, type SanadAgentPerformanceSummary } from './assistantObservabilityApi';
import type {
  SanadAgentMemory,
  SanadAgentPreferences,
} from './assistantWorkspaceApi';

type Props = {
  assistantState: SanadAssistantPresentationState;
  businessLabel?: string | null;
  businessLoading?: boolean;
  canChooseBusiness?: boolean;
  onChooseBusiness?: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onNew: () => void;
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

type SidebarTab = 'memory' | 'settings';

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
          aria-label="إغلاق لوحة سياق المحادثة"
          onClick={onCloseMobile}
          className="absolute inset-0 z-40 bg-slate-950/20 backdrop-blur-[1px]"
        />
      ) : null}
      <aside
        data-sidebar-density="compact"
        data-sanad-context-panel="memory-settings-only"
        className={`sanad-sidebar-surface absolute inset-y-0 right-0 z-50 flex h-full min-h-0 w-[min(82vw,296px)] flex-col overflow-hidden border-l border-[var(--sanad-border-subtle)] shadow-[var(--sanad-shadow-2)] transition-transform ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {children}
      </aside>
    </>
  );
}

export default function AssistantWorkspaceSidebar(props: Props) {
  const [tab, setTab] = useState<SidebarTab>('memory');
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
      <div className="shrink-0 border-b border-slate-100 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-900">
              <SanadIntelligenceMark state={props.assistantState} size={28} />
            </span>
            <div className="min-w-0">
              <strong className="block truncate text-[13px] font-semibold tracking-[-0.01em] text-slate-950">مساحة المحادثة</strong>
              <SanadAssistantStatus state={props.assistantState} className="mt-0.5" announce />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={props.onNew}
              aria-label="محادثة جديدة"
              title="محادثة جديدة"
              className="sanad-focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-[var(--sanad-interactive)] hover:bg-[var(--sanad-nav-hover-bg)]"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
            <button type="button" onClick={props.onCloseMobile} className="rounded-lg p-1.5 text-slate-500" aria-label="إغلاق الشريط الجانبي">
              <X className="h-4 w-4" />
            </button>
          </div>
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

      <div className="grid shrink-0 grid-cols-2 border-b border-[var(--sanad-border-subtle)] px-2">
        {[
          ['memory', Brain, 'الذاكرة'],
          ['settings', Settings2, 'الضبط'],
        ].map(([id, Icon, label]) => {
          const Component = Icon as typeof Brain;
          const active = tab === id;
          return (
            <button
              key={String(id)}
              type="button"
              onClick={() => setTab(id as SidebarTab)}
              className={`flex min-h-10 items-center justify-center gap-1.5 border-b-2 px-2 text-xs font-medium transition ${active ? 'border-[var(--sanad-interactive)] text-[var(--sanad-text-strong)]' : 'border-transparent text-[var(--sanad-text-muted)] hover:text-[var(--sanad-text-strong)]'}`}
            >
              <Component className="h-3.5 w-3.5" />
              {String(label)}
            </button>
          );
        })}
      </div>

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

    </Shell>
  );
}
