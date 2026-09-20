import { useState } from 'react';
import {
  Archive,
  Brain,
  Check,
  ChevronLeft,
  MessageSquare,
  MessageSquarePlus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
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
        className={`fixed inset-y-0 right-0 z-50 flex w-[86vw] max-w-[330px] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform xl:static xl:z-auto xl:w-[300px] xl:max-w-none xl:translate-x-0 xl:shadow-none ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {children}
      </aside>
    </>
  );
}

export default function AssistantWorkspaceSidebar(props: Props) {
  const [tab, setTab] = useState<SidebarTab>('chats');

  return (
    <Shell mobileOpen={props.mobileOpen} onCloseMobile={props.onCloseMobile}>
      <div className="flex items-center justify-between border-b border-slate-100 p-3 xl:hidden">
        <strong className="text-xs text-slate-900">مساعد سند</strong>
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
              className={`flex min-h-12 flex-col items-center justify-center rounded-xl px-2 text-[9px] font-black transition ${active ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <Component className="mb-1 h-4 w-4" />
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
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-3 py-3 text-[10px] font-black text-white"
            >
              <MessageSquarePlus className="h-4 w-4" />
              محادثة جديدة
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {props.loading ? (
              <p className="p-4 text-center text-[9px] text-slate-400">جارٍ تحميل المحادثات…</p>
            ) : props.threads.length === 0 ? (
              <div className="m-2 rounded-2xl bg-slate-50 p-4 text-center">
                <MessageSquare className="mx-auto h-5 w-5 text-slate-300" />
                <p className="mt-2 text-[9px] leading-5 text-slate-400">ستظهر محادثاتك المحفوظة هنا.</p>
              </div>
            ) : (
              props.threads.filter((thread) => thread.status === 'active').map((thread) => {
                const active = thread.id === props.selectedThreadId;
                return (
                  <div key={thread.id} className={`group mb-1 flex items-center rounded-xl ${active ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                    <button
                      type="button"
                      onClick={() => props.onSelect(thread.id)}
                      className="min-w-0 flex-1 p-3 text-right"
                    >
                      <p className={`truncate text-[10px] font-black ${active ? 'text-indigo-800' : 'text-slate-700'}`}>
                        {thread.title}
                      </p>
                      <p className="mt-1 text-[8px] text-slate-400">
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
                    {active ? <ChevronLeft className="ml-2 h-3.5 w-3.5 text-indigo-500" /> : null}
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
              <p className="text-[10px] font-black">ذاكرة مساعد سند</p>
            </div>
            <p className="mt-2 text-[9px] leading-5 text-indigo-700/70">
              تحفظ التفضيلات والسياق المستقر. الأرصدة والفواتير لا تعتمد على الذاكرة، بل يعاد قراءتها من النظام الحي.
            </p>
          </div>

          <div className="mt-3 space-y-2">
            {props.memories.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-[9px] leading-5 text-slate-400">
                لا توجد ذكريات محفوظة بعد. يمكنك قول: «تذكر أن…».
              </p>
            ) : props.memories.map((memory) => (
              <div key={memory.id} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[9px] leading-5 text-slate-700">{memory.value_text}</p>
                  <button
                    type="button"
                    onClick={() => props.onForgetMemory(memory.id)}
                    className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                    title="نسيان"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[7px] font-bold text-slate-500">
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
            <h3 className="text-xs font-black text-slate-900">إعدادات المساعد</h3>
            <p className="mt-1 text-[9px] leading-5 text-slate-400">تحكم في الذاكرة وطريقة عرض الإجابات.</p>
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
                  <div key={String(key)} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                    <div>
                      <p className="text-[10px] font-black text-slate-800">{String(title)}</p>
                      <p className="mt-1 text-[8px] leading-4 text-slate-400">{String(description)}</p>
                    </div>
                    <Toggle enabled={props.preferences[k]} onChange={(value) => props.onPreferenceChange(k, value)} />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-[9px] text-slate-400">جارٍ تحميل الإعدادات…</p>
          )}

          <div className="mt-4 rounded-2xl bg-emerald-50 p-3 text-emerald-800">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              <p className="text-[9px] font-black">الحقائق المالية تبقى حية</p>
            </div>
            <p className="mt-1 text-[8px] leading-4 opacity-75">حتى مع تشغيل الذاكرة، يعيد المساعد قراءة الأرصدة والمستندات من مصدرها عند كل طلب.</p>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
