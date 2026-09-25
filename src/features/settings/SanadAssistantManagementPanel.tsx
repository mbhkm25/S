import { Brain, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { SettingSwitch } from '../../components/settings/SettingsControls';
import { useSanadAssistantSettings, type AssistantPreferenceKey } from '../shell/SanadAssistantSettingsContext';

const PREFS: Array<{ key: AssistantPreferenceKey; label: string; desc: string }> = [
  { key: 'save_history_enabled', label: 'حفظ المحادثات', desc: 'احتفظ بسجل محادثاتك المصرح بها على حسابك.' },
  { key: 'memory_enabled', label: 'الذاكرة طويلة المدى', desc: 'استخدم المعلومات المستقرة بين المحادثات دون اعتبارها مصدرًا ماليًا.' },
  { key: 'proactive_insights_enabled', label: 'تنبيهات ذكية', desc: 'أظهر ما يستحق الانتباه ضمن اليوم والسياق المناسب.' },
  { key: 'response_cards_enabled', label: 'المخرجات المنظمة', desc: 'اعرض الكشوف والمستندات والنتائج في مكونات منظمة.' },
];

export default function SanadAssistantManagementPanel() {
  const {
    preferences, pendingPreferenceKey, preferenceError, loadingPreferences,
    ensurePreferences, changePreference, memories, memoriesLoading, memoryError,
    pendingMemoryId, ensureMemories, forgetMemory,
  } = useSanadAssistantSettings();

  return (
    <section className="space-y-6" aria-label="إدارة مساعد سند">
      <header className="border-b border-[var(--sanad-border-subtle)] pb-4">
        <p className="text-[11px] font-medium text-[var(--sanad-text-subtle)]">الإعدادات العامة</p>
        <h2 className="mt-1 text-[18px] font-semibold text-[var(--sanad-text-strong)]">إدارة مساعد سند</h2>
        <p className="mt-2 max-w-2xl text-[12px] leading-6 text-[var(--sanad-text-muted)]">
          الحفظ والذاكرة وطريقة عرض الإجابات. الحقائق المالية والتجارية تبقى دائمًا في مصادرها الحية.
        </p>
      </header>

      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--sanad-text-strong)]">سلوك المساعد</h3>
            <p className="mt-1 text-[11px] text-[var(--sanad-text-muted)]">إعدادات الحساب المشتركة بين مساحات سند.</p>
          </div>
          <button
            type="button"
            onClick={() => void ensurePreferences()}
            className="sanad-focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] text-[var(--sanad-text-muted)]"
            aria-label="تحديث إعدادات المساعد"
          >
            {loadingPreferences ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
        {preferenceError ? <p role="alert" className="mt-3 text-[11px] text-[var(--sanad-danger)]">{preferenceError}</p> : null}
        <div className="mt-3 divide-y divide-[var(--sanad-border-subtle)] border-y border-[var(--sanad-border-subtle)]">
          {preferences ? PREFS.map(({ key, label, desc }) => (
            <div key={key} className="flex min-h-16 items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-[var(--sanad-text-strong)]">{label}</p>
                <p className="mt-1 text-[10px] leading-5 text-[var(--sanad-text-muted)]">{desc}</p>
              </div>
              <SettingSwitch
                checked={preferences[key]}
                label={label}
                pending={pendingPreferenceKey === key}
                disabled={pendingPreferenceKey !== null && pendingPreferenceKey !== key}
                onCheckedChange={(value) => void changePreference(key, value)}
              />
            </div>
          )) : (
            <button type="button" onClick={() => void ensurePreferences()} className="sanad-focus-ring my-4 rounded-lg px-3 py-2 text-[12px] text-[var(--sanad-interactive)]">
              تحميل إعدادات المساعد
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--sanad-text-strong)]"><Brain className="h-4 w-4" /> الذاكرة</h3>
            <p className="mt-1 text-[11px] text-[var(--sanad-text-muted)]">السياق المستقر الذي يحتفظ به سند لحسابك، وليس سجلًا ماليًا.</p>
          </div>
          <button
            type="button"
            onClick={() => void ensureMemories()}
            className="sanad-focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] text-[var(--sanad-text-muted)]"
            aria-label="تحديث ذاكرة سند"
          >
            {memoriesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
        {memoryError ? <p role="alert" className="mt-3 text-[11px] text-[var(--sanad-danger)]">{memoryError}</p> : null}
        <div className="mt-3 divide-y divide-[var(--sanad-border-subtle)] border-y border-[var(--sanad-border-subtle)]">
          {memoriesLoading ? <p className="py-5 text-[11px] text-[var(--sanad-text-muted)]">جارٍ تحميل الذاكرة…</p> : null}
          {!memoriesLoading && memories.length === 0 ? (
            <button type="button" onClick={() => void ensureMemories()} className="sanad-focus-ring my-4 rounded-lg px-3 py-2 text-[12px] text-[var(--sanad-interactive)]">عرض الذاكرة الحالية</button>
          ) : null}
          {memories.map((memory) => (
            <div key={memory.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="break-words text-[12px] leading-6 text-[var(--sanad-text-strong)]">{memory.value_text}</p>
                <span className="mt-1 block text-[10px] text-[var(--sanad-text-subtle)]">{memory.category}</span>
              </div>
              <button
                type="button"
                disabled={Boolean(pendingMemoryId)}
                onClick={() => void forgetMemory(memory.id)}
                className="sanad-focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--sanad-text-subtle)] hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                aria-label="نسيان هذه الذاكرة"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
