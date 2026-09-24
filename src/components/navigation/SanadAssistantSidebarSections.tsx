import { useState } from 'react';
import { Activity, Brain, Check, ChevronDown, RefreshCcw, Settings2, Trash2 } from 'lucide-react';
import { SettingSwitch } from '../settings/SettingsControls';
import { useSanadAssistantSettings, type AssistantPreferenceKey } from '../../features/shell/SanadAssistantSettingsContext';
import type { SanadAgentPerformanceSummary } from '../../features/assistant/assistantObservabilityApi';

type Panel = 'memory' | 'settings' | null;
const PREFS: { key: AssistantPreferenceKey; label: string; desc: string }[] = [
  { key: 'save_history_enabled', label: 'حفظ المحادثات', desc: 'احتفظ بالمحادثات على حسابك.' },
  { key: 'memory_enabled', label: 'الذاكرة طويلة المدى', desc: 'استخدم التفضيلات بين المحادثات.' },
  { key: 'proactive_insights_enabled', label: 'تنبيهات ذكية', desc: 'أظهر ما يستحق الانتباه.' },
  { key: 'response_cards_enabled', label: 'بطاقات البيانات', desc: 'اعرض الكشوف والمستندات في بطاقات.' },
];

export default function SanadAssistantSidebarSections({ compact = false }: { compact?: boolean }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [summary, setSummary] = useState<SanadAgentPerformanceSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  const {
    preferences, pendingPreferenceKey, preferenceError, loadingPreferences,
    ensurePreferences, changePreference, memories, memoriesLoading, memoryError,
    pendingMemoryId, ensureMemories, forgetMemory,
  } = useSanadAssistantSettings();

  const loadSummary = async () => {
    if (loadingSummary) return;
    setLoadingSummary(true);
    setSummaryError(false);
    try {
      const { getMySanadAgentPerformance } = await import('../../features/assistant/assistantObservabilityApi');
      setSummary(await getMySanadAgentPerformance(7));
    } catch {
      setSummaryError(true);
    } finally {
      setLoadingSummary(false);
    }
  };

  const toggle = (target: Exclude<Panel, null>) => {
    const next = panel === target ? null : target;
    setPanel(next);
    if (next === 'memory') void ensureMemories();
    if (next === 'settings') {
      void ensurePreferences();
      if (!summary) void loadSummary();
    }
  };

  const labels: Record<string, string> = {
    agent_client_turn: 'استجابة سند',
    thread_load: 'فتح المحادثة',
    voice_transcription: 'تحويل الصوت',
    attachment_analysis: 'تحليل المرفق',
  };

  return (
    <section
      data-sanad-assistant-inline="true"
      aria-label="الذاكرة وضبط المساعد"
      className={`mt-2 border-t border-[var(--sanad-border-subtle)] pt-2 ${compact ? 'lg:hidden' : ''}`}
    >
      <div className="sanad-sidebar-section-heading text-[12px] font-semibold text-[var(--sanad-text-strong)]">
        تفضيلات سند
      </div>
      <button
        type="button"
        data-sanad-memory-toggle="true"
        aria-expanded={panel === 'memory'}
        onClick={() => toggle('memory')}
        className="sanad-focus-ring flex min-h-10 w-full items-center gap-2 rounded-[var(--sanad-radius-sm)] px-2 text-right text-[12px] text-[var(--sanad-text-strong)] hover:bg-[var(--sanad-nav-hover-bg)]"
      >
        <Brain className="h-4 w-4 shrink-0 text-[var(--sanad-interactive)]" />
        <span className="min-w-0 flex-1">الذاكرة</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${panel === 'memory' ? '' : '-rotate-90'}`} />
      </button>
      {panel === 'memory' ? (
        <div data-sanad-inline-memory="true" className="space-y-2 px-1 pb-3 pt-1">
          <p className="text-[11px] leading-5 text-[var(--sanad-text-muted)]">
            التفضيلات والسياق المستقر فقط. تُقرأ الأرصدة والفواتير من النظام الحي.
          </p>
          {memoryError ? (
            <div role="alert" className="text-[11px] leading-5 text-[var(--sanad-danger)]">
              {memoryError}
              <button type="button" onClick={() => void ensureMemories()} className="mr-1 underline">إعادة المحاولة</button>
            </div>
          ) : null}
          {memoriesLoading ? <p aria-busy="true" className="text-[11px] text-[var(--sanad-text-muted)]">جارٍ تحميل الذاكرة…</p> : null}
          {!memoriesLoading && !memoryError && memories.length === 0 ? (
            <p className="py-2 text-[11px] leading-5 text-[var(--sanad-text-subtle)]">
              لا توجد ذكريات محفوظة لهذا السياق بعد.
            </p>
          ) : null}
          {memories.map((memory) => (
            <div key={memory.id} className="border-b border-[var(--sanad-border-subtle)] py-2">
              <div className="flex items-start gap-1">
                <p className="min-w-0 flex-1 break-words text-[11px] leading-5 text-[var(--sanad-text-strong)]">
                  {memory.value_text}
                </p>
                <button
                  type="button"
                  disabled={Boolean(pendingMemoryId)}
                  onClick={() => void forgetMemory(memory.id)}
                  className="sanad-focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--sanad-text-subtle)] hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                  aria-label="نسيان هذه الذاكرة"
                  title="نسيان هذه الذاكرة"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="text-[10px] text-[var(--sanad-text-subtle)]">{memory.category}</span>
            </div>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        data-sanad-settings-toggle="true"
        aria-expanded={panel === 'settings'}
        onClick={() => toggle('settings')}
        className="sanad-focus-ring flex min-h-10 w-full items-center gap-2 rounded-[var(--sanad-radius-sm)] px-2 text-right text-[12px] text-[var(--sanad-text-strong)] hover:bg-[var(--sanad-nav-hover-bg)]"
      >
        <Settings2 className="h-4 w-4 shrink-0 text-[var(--sanad-interactive)]" />
        <span className="min-w-0 flex-1">ضبط المساعد</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${panel === 'settings' ? '' : '-rotate-90'}`} />
      </button>
      {panel === 'settings' ? (
        <div data-sanad-inline-settings="true" className="space-y-2 px-1 pb-3 pt-1">
          <p className="text-[11px] leading-5 text-[var(--sanad-text-muted)]">
            تحكم في الحفظ والذاكرة وطريقة عرض الإجابات.
          </p>
          {preferenceError ? (
            <p role="alert" className="text-[11px] leading-5 text-[var(--sanad-danger)]">
              {preferenceError}
              {!preferences ? <button type="button" onClick={() => void ensurePreferences()} className="mr-1 underline">إعادة المحاولة</button> : null}
            </p>
          ) : null}
          {loadingPreferences || !preferences ? (
            <p aria-busy="true" className="py-2 text-[11px] text-[var(--sanad-text-muted)]">
              {loadingPreferences ? 'جارٍ تحميل الإعدادات…' : 'الإعدادات غير متاحة حاليًا.'}
            </p>
          ) : (
            PREFS.map(({ key, label, desc }) => (
              <div
                key={key}
                className="flex min-h-14 items-center gap-2 border-b border-[var(--sanad-border-subtle)] py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold leading-5 text-[var(--sanad-text-strong)]">{label}</p>
                  <p className="text-[10px] leading-4 text-[var(--sanad-text-muted)]">{desc}</p>
                </div>
                <SettingSwitch
                  checked={preferences[key]}
                  label={label}
                  pending={pendingPreferenceKey === key}
                  disabled={pendingPreferenceKey !== null && pendingPreferenceKey !== key}
                  onCheckedChange={(value) => void changePreference(key, value)}
                />
              </div>
            ))
          )}
          <div className="pt-1">
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--sanad-text-strong)]">
                <Activity className="h-3.5 w-3.5" /> أداء سند · آخر 7 أيام
              </span>
              <button
                type="button"
                disabled={loadingSummary}
                onClick={() => void loadSummary()}
                aria-label="تحديث أداء سند"
                className="sanad-focus-ring flex h-8 w-8 items-center justify-center rounded-md text-[var(--sanad-text-muted)] disabled:opacity-40"
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${loadingSummary ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {summaryError ? <p className="text-[10px] text-[var(--sanad-danger)]">تعذر تحميل المؤشرات.</p> : null}
            {(summary?.scopes || []).filter((s) => labels[s.scope]).map((scope) => (
              <div key={scope.scope} className="my-1 rounded-md bg-[var(--sanad-surface-2)] px-2 py-1.5">
                <div className="text-[10px] font-medium text-[var(--sanad-text-muted)]">{labels[scope.scope]}</div>
                <div dir="ltr" className="text-[10px] text-[var(--sanad-text-strong)]">
                  P50 {scope.p50_total_ms ?? '—'}ms · P95 {scope.p95_total_ms ?? '—'}ms · fail {Math.round((scope.failure_rate || 0) * 100)}%
                </div>
              </div>
            ))}
            <p className="mt-2 inline-flex items-center gap-1 text-[10px] leading-5 text-[var(--sanad-text-muted)]">
              <Check className="h-3.5 w-3.5 shrink-0" />
              الحقائق المالية تُقرأ دائمًا من مصادرها الحية.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
