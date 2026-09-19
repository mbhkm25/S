import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  streamSanadAiAgentTurn,
  type SanadAiAgentTurnResult,
  type SanadAiHistoryTurn,
  type SanadAiToolTrace,
} from './assistantAgentApi';

type BusinessOption = { id: string; name: string };

type WorkspaceMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  result?: SanadAiAgentTurnResult;
  failed?: boolean;
};

const STORAGE_KEY = 'sanad.ai.workspace.thread.v1';

const QUICK_PROMPTS = [
  'أعطني نظرة على وضعي المالي الشخصي',
  'اعرض الأنشطة التجارية التي أستطيع الوصول إليها',
  'ما حالة النسخة السحابية من إبداع؟',
  'ابحث عن عميل وأعطني كشف حسابه',
];

function createId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadStoredMessages(): WorkspaceMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-40).filter((item) =>
      item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string'
    );
  } catch {
    return [];
  }
}

function saveMessages(messages: WorkspaceMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  } catch {
    // Local persistence is optional; the assistant must remain usable if storage is blocked.
  }
}

function historyFrom(messages: WorkspaceMessage[]): SanadAiHistoryTurn[] {
  return messages
    .filter((message) => !message.failed)
    .slice(-8)
    .map((message) => ({ role: message.role, content: message.content }));
}

function toolLabel(name: string) {
  const labels: Record<string, string> = {
    finance_get_overview: 'قراءة النظرة المالية',
    finance_search_transactions: 'البحث في العمليات',
    finance_get_obligations: 'قراءة الالتزامات',
    finance_get_budgets: 'قراءة الميزانيات',
    finance_get_goals: 'قراءة الأهداف',
    finance_search_parties: 'البحث في الأطراف',
    business_list_accessible: 'قراءة الأنشطة المتاحة',
    business_get_dashboard: 'قراءة لوحة النشاط',
    erp_get_replica_status: 'فحص النسخة السحابية',
    erp_search_customers: 'البحث عن العميل',
    erp_get_customer_statement: 'قراءة كشف الحساب',
    erp_get_documents: 'قراءة المبيعات والمشتريات',
    sanad_search_knowledge: 'البحث في معرفة سند',
  };
  return labels[name] || name;
}

function formatLatency(value?: number) {
  if (!value && value !== 0) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(1)} ث` : `${value} ms`;
}

function toolSummary(trace: SanadAiToolTrace[]) {
  const completed = trace.filter((item) => item.status === 'completed').length;
  const failed = trace.filter((item) => item.status === 'failed').length;
  if (!trace.length) return 'إجابة مباشرة';
  if (failed) return `${completed} أداة نجحت، ${failed} تعثرت`;
  return `${completed} أداة`;
}

function MessageBubble({ message, onRetry }: { message: WorkspaceMessage; onRetry?: () => void }) {
  const assistant = message.role === 'assistant';
  const result = message.result;
  const trace = result?.tool_trace || [];

  return (
    <article className={`flex w-full ${assistant ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[92%] md:max-w-[78%] xl:max-w-[68%] ${assistant ? '' : 'text-right'}`}>
        <div
          className={
            assistant
              ? `rounded-[1.45rem] rounded-tr-md border p-4 shadow-sm md:p-5 ${
                  message.failed ? 'border-rose-100 bg-rose-50' : 'border-slate-200 bg-white'
                }`
              : 'rounded-[1.45rem] rounded-tl-md bg-slate-950 px-4 py-3 text-white shadow-sm md:px-5 md:py-4'
          }
        >
          {assistant ? (
            <div className="mb-3 flex items-center gap-2 text-[10px] font-black text-slate-500">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                <Bot className="h-3.5 w-3.5" />
              </span>
              مساعد سند
              {result?.model ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] text-slate-500">{result.model}</span> : null}
            </div>
          ) : null}

          <p className={`whitespace-pre-wrap text-[13px] leading-7 md:text-sm ${assistant ? 'text-slate-800' : 'text-white'}`}>
            {message.content}
          </p>

          {message.failed && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-black text-rose-700"
            >
              <RotateCcw className="h-3.5 w-3.5" /> إعادة الإرسال
            </button>
          ) : null}
        </div>

        {assistant && result && !message.failed ? (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2 px-1 text-[9px] font-bold text-slate-400">
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {formatLatency(result.latency_ms)}</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1"><Wrench className="h-3 w-3" /> {toolSummary(trace)}</span>
              {result.thinking_level ? <><span>•</span><span>تفكير {result.thinking_level}</span></> : null}
              {result.verification?.passed ? <><span>•</span><span className="text-emerald-600">تم التحقق</span></> : null}
            </div>

            {trace.length ? (
              <details className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
                <summary className="cursor-pointer list-none text-[10px] font-black text-slate-600">
                  خطوات التنفيذ والمصادر
                </summary>
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  {trace.map((item, index) => (
                    <div key={`${item.name}-${index}`} className="flex items-start justify-between gap-3 text-[10px]">
                      <div className="flex items-start gap-2">
                        {item.status === 'completed'
                          ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
                          : <XCircle className="mt-0.5 h-3.5 w-3.5 text-rose-600" />}
                        <div>
                          <p className="font-black text-slate-700">{toolLabel(item.name)}</p>
                          <p className="mt-0.5 text-[9px] text-slate-400">{item.source}</p>
                          {item.error ? <p className="mt-1 text-[9px] text-rose-600">{item.error}</p> : null}
                        </div>
                      </div>
                      <span className="shrink-0 text-slate-400">{formatLatency(item.latency_ms)}</span>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function SanadAgentWorkspace() {
  const [messages, setMessages] = useState<WorkspaceMessage[]>(() => loadStoredMessages());
  const [draft, setDraft] = useState('');
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [businessLoading, setBusinessLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [lastUserPrompt, setLastUserPrompt] = useState('');
  const [liveStatus, setLiveStatus] = useState('');
  const [liveTools, setLiveTools] = useState<SanadAiToolTrace[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    saveMessages(messages);
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setBusinessLoading(true);
      const { data, error } = await supabase.rpc('get_my_account_center_v1');
      if (!alive) return;
      if (!error && data && typeof data === 'object') {
        const record = data as Record<string, unknown>;
        const raw = Array.isArray(record.businesses) ? record.businesses : [];
        const options = raw.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const row = item as Record<string, unknown>;
          if (typeof row.id !== 'string' || !row.id) return [];
          return [{ id: row.id, name: typeof row.name === 'string' && row.name ? row.name : 'نشاط بدون اسم' }];
        });
        setBusinesses(options);
        if (options.length === 1) setBusinessId(options[0].id);
      }
      setBusinessLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  async function sendPrompt(rawPrompt?: string) {
    const prompt = (rawPrompt ?? draft).trim();
    if (!prompt || sending) return;

    const priorMessages = messages;
    const userMessage: WorkspaceMessage = {
      id: createId(),
      role: 'user',
      content: prompt,
      createdAt: Date.now(),
    };

    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setSending(true);
    setLastUserPrompt(prompt);
    setLiveStatus('بدأت معالجة الطلب…');
    setLiveTools([]);

    try {
      const result = await streamSanadAiAgentTurn({
        message: prompt,
        business_id: businessId || null,
        history: historyFrom(priorMessages),
      }, (event) => {
        if (event.type === 'run.started') {
          setLiveStatus('بدأ مساعد سند المعالجة…');
          return;
        }
        if (event.type === 'agent.status') {
          setLiveStatus(event.data.label);
          return;
        }
        if (event.type === 'tool.started') {
          setLiveStatus(`${toolLabel(event.data.name)}…`);
          return;
        }
        if (event.type === 'tool.completed') {
          setLiveTools((current) => [...current, event.data]);
          setLiveStatus(
            event.data.status === 'completed'
              ? `اكتملت: ${toolLabel(event.data.name)}`
              : `تعذرت: ${toolLabel(event.data.name)}`,
          );
          return;
        }
        if (event.type === 'answer.final') {
          setLiveStatus('تم التحقق، أجهز الإجابة…');
        }
      });

      const answer = result.response?.text?.trim() || 'أكملت معالجة الطلب، لكن لم يصل نص الإجابة.';
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content: answer,
          createdAt: Date.now(),
          result,
        },
      ]);
    } catch (cause) {
      const message = cause instanceof Error && cause.message
        ? cause.message
        : 'تعذر إكمال الطلب الآن.';
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content: `تعذر إكمال الطلب: ${message}`,
          createdAt: Date.now(),
          failed: true,
        },
      ]);
    } finally {
      setSending(false);
      setLiveStatus('');
      setLiveTools([]);
      window.setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void sendPrompt();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendPrompt();
    }
  }

  function newThread() {
    if (sending) return;
    setMessages([]);
    setDraft('');
    setLastUserPrompt('');
    try { localStorage.removeItem(STORAGE_KEY); } catch { }
    window.setTimeout(() => textareaRef.current?.focus(), 50);
  }

  const empty = messages.length === 0;

  return (
    <section className="overflow-hidden rounded-[1.8rem] border border-slate-200 bg-[#FAFAF8] shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200 bg-white px-4 py-4 md:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
              <Bot className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black text-slate-950">مساحة مساعد سند</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700">
                  <ShieldCheck className="h-3 w-3" /> قراءة آمنة
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-5 text-slate-500">يفهم الطلب، يستخدم أدوات سند، ثم يتحقق قبل الإجابة.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[190px]">
              <BriefcaseBusiness className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={businessId}
                onChange={(event) => setBusinessId(event.target.value)}
                disabled={businessLoading || sending}
                className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pr-9 pl-8 text-[10px] font-bold text-slate-700 outline-none focus:border-slate-400"
                aria-label="سياق النشاط التجاري"
              >
                <option value="">بدون نشاط محدد</option>
                {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
              </select>
              {businessLoading
                ? <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" />
                : <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />}
            </label>

            <button
              type="button"
              onClick={newThread}
              disabled={sending}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-700 shadow-sm disabled:opacity-40"
            >
              <MessageSquarePlus className="h-4 w-4" /> محادثة جديدة
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-h-[66vh] xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-h-[66vh] flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
            {empty ? (
              <div className="mx-auto flex min-h-[430px] max-w-3xl flex-col items-center justify-center text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-[1.6rem] bg-gradient-to-br from-slate-950 to-indigo-900 text-white shadow-[0_18px_50px_rgba(49,46,129,0.22)]">
                  <Sparkles className="h-7 w-7" />
                </span>
                <h3 className="mt-5 text-xl font-black text-slate-950 md:text-2xl">ماذا تريد أن تعرف أو تنجز؟</h3>
                <p className="mt-3 max-w-xl text-xs leading-7 text-slate-500">
                  اسأل بطريقتك الطبيعية. مساعد سند يستطيع قراءة بياناتك المالية، وفهم نشاطك، والبحث في نسخة إبداع السحابية ضمن صلاحياتك.
                </p>

                <div className="mt-7 grid w-full gap-2 sm:grid-cols-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendPrompt(prompt)}
                      className="rounded-2xl border border-slate-200 bg-white p-4 text-right text-[11px] font-bold leading-6 text-slate-700 shadow-sm transition hover:border-slate-300 hover:shadow-md active:scale-[.99]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <div key={message.id}>
                    <MessageBubble
                      message={message}
                      onRetry={message.failed && lastUserPrompt && index === messages.length - 1 ? () => void sendPrompt(lastUserPrompt) : undefined}
                    />
                  </div>
                ))}
              </>
            )}

            {sending ? (
              <div className="flex justify-start">
                <div className="rounded-[1.4rem] rounded-tr-md border border-indigo-100 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                      <Bot className="h-4 w-4" />
                      <span className="absolute -left-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                    </span>
                    <div>
                      <p className="text-[10px] font-black text-slate-700">{liveStatus || 'جاري التنفيذ…'}</p>
                      {liveTools.length ? (
                        <div className="mt-2 flex max-w-[70vw] flex-wrap gap-1.5">
                          {liveTools.slice(-4).map((item, index) => (
                            <span
                              key={`${item.name}-${index}`}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-bold ${
                                item.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {item.status === 'completed' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                              {toolLabel(item.name)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 flex gap-1">
                          {[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300" style={{ animationDelay: `${dot * 180}ms` }} />)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-3 md:p-4">
            <div className="mx-auto max-w-4xl rounded-[1.4rem] border border-slate-200 bg-slate-50 p-2 shadow-inner focus-within:border-slate-400">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
                rows={2}
                placeholder="اسأل مساعد سند… مثال: أعطني كشف حساب عبدالله الحبشي"
                className="max-h-40 min-h-[56px] w-full resize-none bg-transparent px-3 py-2 text-[13px] leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60"
              />
              <div className="flex items-center justify-between gap-3 px-1 pb-1">
                <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  قراءة فقط — لا ترحيل مالي
                </div>
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="flex h-9 min-w-9 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-[10px] font-black text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                  <span className="hidden sm:inline">إرسال</span>
                </button>
              </div>
            </div>
            <p className="mt-2 text-center text-[8px] leading-4 text-slate-400">Enter للإرسال • Shift + Enter لسطر جديد • قد يطلب المساعد توضيحًا قبل قراءة حساب ملتبس.</p>
          </form>
        </div>

        <aside className="hidden border-r border-slate-200 bg-white/75 p-5 xl:block">
          <div className="sticky top-24 space-y-4">
            <div>
              <p className="text-[9px] font-black text-indigo-700">AGENT RUNTIME</p>
              <h3 className="mt-1 text-sm font-black text-slate-950">ما الذي يستطيع فعله الآن؟</h3>
            </div>

            {[
              [Zap, 'فهم الطلب', 'يختار عمق التفكير والأدوات حسب السؤال.'],
              [Database, 'قراءة موثوقة', 'يستخدم عقود سند وERP الدلالية بدل تخمين البيانات.'],
              [Wrench, 'تنفيذ متعدد الأدوات', 'يبحث ويحل الحساب ثم يقرأ الكشف داخل الطلب نفسه.'],
              [ShieldCheck, 'تحقق مالي', 'يحافظ على العملات والفترة ولا ينفذ أي كتابة مالية.'],
            ].map(([Icon, title, description]) => {
              const Component = Icon as typeof Zap;
              return (
                <div key={String(title)} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <Component className="h-4 w-4 text-slate-700" />
                  <p className="mt-3 text-[10px] font-black text-slate-800">{String(title)}</p>
                  <p className="mt-1 text-[9px] leading-5 text-slate-500">{String(description)}</p>
                </div>
              );
            })}

            <div className="rounded-2xl bg-slate-950 p-4 text-white">
              <p className="text-[9px] font-black text-white/55">حالة هذه المرحلة</p>
              <p className="mt-2 text-xs font-black">قراءة وتحليل فقط</p>
              <p className="mt-2 text-[9px] leading-5 text-white/60">أي إنشاء أو تعديل مالي مستقبلاً سيمر عبر مسودة ومراجعة وموافقة صريحة.</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
