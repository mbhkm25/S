import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Loader2,
  Menu,
  RotateCcw,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  streamSanadAiAgentTurn,
  type SanadAiAgentTurnResult,
  type SanadAiHistoryTurn,
  type SanadAiToolTrace,
} from './assistantAgentApi';
import {
  archiveSanadAgentThread,
  createSanadAgentThread,
  forgetSanadAgentMemory,
  getSanadAgentContext,
  getSanadAgentPreferences,
  getSanadAgentThread,
  listSanadAgentThreads,
  updateSanadAgentMessageFeedback,
  updateSanadAgentPreferences,
  type SanadAgentMemory,
  type SanadAgentPreferences,
  type SanadAgentThreadSummary,
} from './assistantWorkspaceApi';
import AssistantWorkspaceSidebar from './AssistantWorkspaceSidebar';
import SanadAgentResponseBlocks from './SanadAgentResponseBlocks';
import SanadMessageActions from './SanadMessageActions';
import SanadPulseMark from './SanadPulseMark';
import SanadVoiceDictationButton from './SanadVoiceDictationButton';
import SanadAttachmentComposer, { SanadAttachmentPreview } from './SanadAttachmentComposer';
import { listSanadAgentAttachments, type SanadAgentAttachment } from './assistantAttachmentApi';

type BusinessOption = { id: string; name: string };

type WorkspaceMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  result?: SanadAiAgentTurnResult;
  failed?: boolean;
  persisted?: boolean;
  isStarred?: boolean;
  rating?: -1 | 1 | null;
  attachments?: SanadAgentAttachment[];
};

const QUICK_PROMPTS = [
  'أعطني نظرة على وضعي المالي الشخصي',
  'اعرض الأنشطة التجارية التي أستطيع الوصول إليها',
  'ما حالة النسخة السحابية من إبداع؟',
  'ابحث عن عميل وأعطني كشف حسابه',
];

function createId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function historyFrom(messages: WorkspaceMessage[]): SanadAiHistoryTurn[] {
  return messages
    .filter((message) => !message.failed)
    .slice(-24)
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

function MessageBubble({
  message,
  onRetry,
  onStar,
  onRate,
}: {
  message: WorkspaceMessage;
  onRetry?: () => void;
  onStar?: (value: boolean) => void;
  onRate?: (value: -1 | 1 | null) => void;
}) {
  const assistant = message.role === 'assistant';
  const result = message.result;
  const trace = result?.tool_trace || [];

  return (
    <article className={`flex w-full ${assistant ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[96%] md:max-w-[86%] 2xl:max-w-[78%] ${assistant ? '' : 'text-right'}`}>
        <div
          className={
            assistant
              ? `rounded-[1.45rem] rounded-tr-md border p-4 shadow-sm md:p-5 ${message.failed ? 'border-rose-100 bg-rose-50' : 'border-slate-200 bg-white'}`
              : 'rounded-[1.45rem] rounded-tl-md bg-slate-950 px-4 py-3 text-white shadow-sm md:px-5 md:py-4'
          }
        >
          {assistant ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-black text-slate-500">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                <SanadPulseMark state="idle" size={17} />
              </span>
              سند
              {result?.model ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] text-slate-500">{result.model}</span> : null}
            </div>
          ) : null}

          {!assistant && message.attachments?.length ? (
            <div className="mb-3 grid gap-2">
              {message.attachments.map((attachment) => (
                <SanadAttachmentPreview key={attachment.id} attachment={attachment} compact />
              ))}
            </div>
          ) : null}

          <p className={`whitespace-pre-wrap text-[13px] leading-7 md:text-sm ${assistant ? 'text-slate-800' : 'text-white'}`}>
            {message.content}
          </p>

          {assistant && result?.response ? <SanadAgentResponseBlocks response={result.response} /> : null}

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

        {!message.failed ? (
          <div className={`mt-1.5 flex ${assistant ? 'justify-start' : 'justify-end'} px-1`}>
            <SanadMessageActions
              content={message.content}
              starred={Boolean(message.isStarred)}
              rating={message.rating ?? null}
              disabled={!message.persisted}
              onStar={(value) => onStar?.(value)}
              onRate={(value) => onRate?.(value)}
            />
          </div>
        ) : null}

        {assistant && result && !message.failed ? (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2 px-1 text-[9px] font-bold text-slate-400">
              {result.latency_ms !== undefined ? (
                <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {formatLatency(result.latency_ms)}</span>
              ) : null}
              {trace.length ? <><span>•</span><span className="inline-flex items-center gap-1"><Wrench className="h-3 w-3" /> {toolSummary(trace)}</span></> : null}
              {result.thinking_level ? <><span>•</span><span>تفكير {result.thinking_level}</span></> : null}
              {result.verification?.passed ? <><span>•</span><span className="text-emerald-600">تم التحقق</span></> : null}
            </div>

            {trace.length ? (
              <details className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
                <summary className="cursor-pointer list-none text-[10px] font-black text-slate-600">خطوات التنفيذ والمصادر</summary>
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

function storedResult(message: {
  request_id?: string | null;
  response?: SanadAiAgentTurnResult['response'] | null;
  tool_trace?: SanadAiToolTrace[];
  model?: string | null;
  thinking_level?: 'low' | 'medium' | 'high' | null;
}): SanadAiAgentTurnResult | undefined {
  if (!message.response) return undefined;
  return {
    ok: true,
    request_id: message.request_id || createId(),
    response: message.response,
    tool_trace: message.tool_trace || [],
    model: message.model || undefined,
    thinking_level: message.thinking_level || undefined,
  };
}

function storedMessagesToWorkspace(
  messages: Awaited<ReturnType<typeof getSanadAgentThread>>['messages'],
  attachments: SanadAgentAttachment[] = [],
): WorkspaceMessage[] {
  const byId = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: new Date(message.created_at).getTime(),
    result: message.role === 'assistant' ? storedResult(message) : undefined,
    persisted: true,
    isStarred: Boolean(message.is_starred),
    rating: message.rating ?? null,
    attachments: (message.attachment_ids || []).flatMap((id) => {
      const attachment = byId.get(id);
      return attachment ? [attachment] : [];
    }),
  }));
}

export default function SanadAgentWorkspace() {
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [threads, setThreads] = useState<SanadAgentThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [preferences, setPreferences] = useState<SanadAgentPreferences | null>(null);
  const [memories, setMemories] = useState<SanadAgentMemory[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [draft, setDraft] = useState('');
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [businessLoading, setBusinessLoading] = useState(true);
  const [businessSelectionOpen, setBusinessSelectionOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastUserPrompt, setLastUserPrompt] = useState('');
  const [liveStatus, setLiveStatus] = useState('');
  const [liveTools, setLiveTools] = useState<SanadAiToolTrace[]>([]);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<SanadAgentAttachment[]>([]);

  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const refreshThreads = async (preferred?: string | null) => {
    const next = await listSanadAgentThreads();
    setThreads(next);
    const active = next.filter((thread) => thread.status === 'active');
    const target = preferred && active.some((thread) => thread.id === preferred)
      ? preferred
      : selectedThreadId && active.some((thread) => thread.id === selectedThreadId)
        ? selectedThreadId
        : active[0]?.id || null;
    if (target !== selectedThreadId) setSelectedThreadId(target);
    return { threads: next, target };
  };

  useEffect(() => {
    let alive = true;
    void (async () => {
      setBusinessLoading(true);
      setThreadsLoading(true);
      setWorkspaceError(null);
      try {
        const [{ data, error }, prefs, loadedThreads] = await Promise.all([
          supabase.rpc('get_my_account_center_v1'),
          getSanadAgentPreferences(),
          listSanadAgentThreads(),
        ]);
        if (!alive) return;
        let options: BusinessOption[] = [];
        if (!error && data && typeof data === 'object') {
          const record = data as Record<string, unknown>;
          const raw = Array.isArray(record.businesses) ? record.businesses : [];
          options = raw.flatMap((item) => {
            if (!item || typeof item !== 'object') return [];
            const row = item as Record<string, unknown>;
            if (typeof row.id !== 'string' || !row.id) return [];
            return [{ id: row.id, name: typeof row.name === 'string' && row.name ? row.name : 'نشاط بدون اسم' }];
          });
          setBusinesses(options);
        }
        setPreferences(prefs);
        setThreads(loadedThreads);
        const first = loadedThreads.find((thread) => thread.status === 'active') || null;
        if (first) {
          setSelectedThreadId(first.id);
        } else if (options.length === 1) {
          setBusinessId(options[0].id);
          setBusinessSelectionOpen(false);
        } else if (options.length > 1) {
          setBusinessId('');
          setBusinessSelectionOpen(true);
        }
      } catch (cause) {
        if (alive) setWorkspaceError(cause instanceof Error ? cause.message : 'تعذر تجهيز مساحة المساعد.');
      } finally {
        if (alive) {
          setBusinessLoading(false);
          setThreadsLoading(false);
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      setMemories([]);
      return;
    }
    let alive = true;
    void (async () => {
      setThreadLoading(true);
      setWorkspaceError(null);
      try {
        const [detail, context] = await Promise.all([
          getSanadAgentThread(selectedThreadId),
          getSanadAgentContext(selectedThreadId),
        ]);
        if (!alive) return;
        setBusinessId(detail.thread.business_id || (businesses.length === 1 ? businesses[0].id : ''));
        setBusinessSelectionOpen(false);
        setMemories(context.memories);
        setMessages(storedMessagesToWorkspace(detail.messages));
      } catch (cause) {
        if (alive) setWorkspaceError(cause instanceof Error ? cause.message : 'تعذر تحميل المحادثة.');
      } finally {
        if (alive) setThreadLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [selectedThreadId]);

  const createThreadForBusiness = async (nextBusinessId: string | null) => {
    const id = await createSanadAgentThread(nextBusinessId);
    setMessages([]);
    setDraft('');
    setBusinessId(nextBusinessId || '');
    setSelectedThreadId(id);
    setBusinessSelectionOpen(false);
    setSidebarOpen(false);
    await refreshThreads(id);
    window.setTimeout(() => textareaRef.current?.focus(), 50);
    return id;
  };

  const ensureThread = async () => {
    if (selectedThreadId) return selectedThreadId;
    const defaultBusinessId = businessId || (businesses.length === 1 ? businesses[0].id : null);
    if (!defaultBusinessId && businesses.length > 1) {
      setBusinessSelectionOpen(true);
      throw new Error('اختر النشاط لهذه المحادثة أولًا.');
    }
    return createThreadForBusiness(defaultBusinessId);
  };

  const newThread = async () => {
    if (sending) return;
    if (businesses.length > 1) {
      setMessages([]);
      setDraft('');
      setSelectedThreadId(null);
      setBusinessId('');
      setBusinessSelectionOpen(true);
      setSidebarOpen(false);
      return;
    }
    try {
      await createThreadForBusiness(businesses.length === 1 ? businesses[0].id : null);
    } catch (cause) {
      setWorkspaceError(cause instanceof Error ? cause.message : 'تعذر إنشاء محادثة.');
    }
  };

  const selectThread = (threadId: string) => {
    if (sending) return;
    setSelectedThreadId(threadId);
    setSidebarOpen(false);
  };

  const archiveThread = async (threadId: string) => {
    if (sending) return;
    try {
      await archiveSanadAgentThread(threadId);
      const result = await refreshThreads(threadId === selectedThreadId ? null : selectedThreadId);
      if (threadId === selectedThreadId) {
        setSelectedThreadId(result.target);
        if (!result.target) setMessages([]);
      }
    } catch (cause) {
      setWorkspaceError(cause instanceof Error ? cause.message : 'تعذر أرشفة المحادثة.');
    }
  };

  const changePreference = async (
    key: keyof Pick<SanadAgentPreferences,
      'save_history_enabled' | 'memory_enabled' | 'proactive_insights_enabled' | 'response_cards_enabled'
    >,
    value: boolean,
  ) => {
    if (!preferences) return;
    const previous = preferences;
    setPreferences({ ...preferences, [key]: value });
    try {
      setPreferences(await updateSanadAgentPreferences({ [key]: value }));
    } catch (cause) {
      setPreferences(previous);
      setWorkspaceError(cause instanceof Error ? cause.message : 'تعذر حفظ إعداد المساعد.');
    }
  };

  const forgetMemory = async (memoryId: string) => {
    try {
      await forgetSanadAgentMemory(memoryId);
      setMemories((current) => current.filter((item) => item.id !== memoryId));
    } catch (cause) {
      setWorkspaceError(cause instanceof Error ? cause.message : 'تعذر نسيان الذاكرة.');
    }
  };

  const updateMessageFeedback = async (
    messageId: string,
    patch: { isStarred?: boolean; rating?: -1 | 1 | null },
  ) => {
    const previous = messages;
    setMessages((current) => current.map((message) =>
      message.id === messageId
        ? {
            ...message,
            isStarred: patch.isStarred ?? message.isStarred,
            rating: patch.rating !== undefined ? patch.rating : message.rating,
          }
        : message
    ));
    try {
      const saved = await updateSanadAgentMessageFeedback(messageId, {
        is_starred: patch.isStarred,
        rating: patch.rating,
      });
      setMessages((current) => current.map((message) =>
        message.id === messageId
          ? { ...message, isStarred: saved.is_starred, rating: saved.rating }
          : message
      ));
    } catch (cause) {
      setMessages(previous);
      setWorkspaceError(cause instanceof Error ? cause.message : 'تعذر حفظ تفاعل الرسالة.');
    }
  };

  async function sendPrompt(rawPrompt?: string) {
    const prompt = (rawPrompt ?? draft).trim();
    if (!prompt || sending) return;
    if (!selectedThreadId && businesses.length > 1 && !businessId) {
      setBusinessSelectionOpen(true);
      return;
    }

    let threadId: string;
    try {
      threadId = await ensureThread();
    } catch (cause) {
      setWorkspaceError(cause instanceof Error ? cause.message : 'تعذر إنشاء المحادثة.');
      return;
    }

    const priorMessages = messages;
    const userMessage: WorkspaceMessage = {
      id: createId(),
      role: 'user',
      content: prompt,
      createdAt: Date.now(),
      persisted: false,
    };

    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setSending(true);
    setLastUserPrompt(prompt);
    setLiveStatus('بدأت معالجة الطلب…');
    setLiveTools([]);
    setWorkspaceError(null);

    try {
      const result = await streamSanadAiAgentTurn({
        message: prompt,
        business_id: businessId || null,
        thread_id: threadId,
        history: historyFrom(priorMessages),
      }, (event) => {
        if (event.type === 'run.started') setLiveStatus('بدأ مساعد سند المعالجة…');
        else if (event.type === 'agent.status') setLiveStatus(event.data.label);
        else if (event.type === 'tool.started') setLiveStatus(`${toolLabel(event.data.name)}…`);
        else if (event.type === 'tool.completed') {
          setLiveTools((current) => [...current, event.data]);
          setLiveStatus(event.data.status === 'completed'
            ? `اكتملت: ${toolLabel(event.data.name)}`
            : `تعذرت: ${toolLabel(event.data.name)}`);
        } else if (event.type === 'answer.final') setLiveStatus('تم التحقق، أجهز الإجابة…');
      });

      const answer = result.response?.text?.trim() || 'أكملت معالجة الطلب، لكن لم يصل نص الإجابة.';
      setMessages((current) => [...current, {
        id: createId(),
        role: 'assistant',
        content: answer,
        createdAt: Date.now(),
        result,
        persisted: false,
      }]);

      await refreshThreads(threadId);
      try {
        const persistedThread = await getSanadAgentThread(threadId);
        setMessages(storedMessagesToWorkspace(persistedThread.messages));
      } catch {
        // The visible answer remains usable; feedback actions enable after the next successful thread reload.
      }
      if (/^(?:تذكر|تذكّر|احفظ|احتفظ)\b/i.test(prompt)) {
        const context = await getSanadAgentContext(threadId);
        setMemories(context.memories);
      }
    } catch (cause) {
      const message = cause instanceof Error && cause.message ? cause.message : 'تعذر إكمال الطلب الآن.';
      setMessages((current) => [...current, {
        id: createId(),
        role: 'assistant',
        content: `تعذر إكمال الطلب: ${message}`,
        createdAt: Date.now(),
        failed: true,
      }]);
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

  const empty = messages.length === 0;

  return (
    <section className="overflow-hidden rounded-[1.8rem] border border-slate-200 bg-[#FAFAF8] shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200 bg-white px-3 py-3 md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 xl:hidden"
              aria-label="فتح محادثات وإعدادات سند"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
              <SanadPulseMark state={sending ? 'working' : 'idle'} size={25} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black text-slate-950">سند</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700">
                  <ShieldCheck className="h-3 w-3" /> قراءة آمنة
                </span>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                محادثات سحابية · ذاكرة طويلة · بيانات حية موثقة
              </p>
            </div>
          </div>

          {businessLoading ? (
            <span className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-50 px-3 text-[9px] font-bold text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> تحميل سياق النشاط…
            </span>
          ) : businessId ? (
            <span className="inline-flex h-10 max-w-[230px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[10px] font-black text-slate-700">
              <BriefcaseBusiness className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">{businesses.find((business) => business.id === businessId)?.name || 'نشاط مرتبط'}</span>
            </span>
          ) : businesses.length > 1 ? (
            <button
              type="button"
              onClick={() => setBusinessSelectionOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-[10px] font-black text-amber-800"
            >
              <BriefcaseBusiness className="h-4 w-4" /> اختر نشاط المحادثة
            </button>
          ) : null}
        </div>
      </div>

      {workspaceError ? (
        <div className="border-b border-rose-100 bg-rose-50 px-4 py-2.5 text-[10px] font-bold text-rose-700">
          {workspaceError}
        </div>
      ) : null}

      <div className="grid min-h-[68vh] xl:grid-cols-[300px_minmax(0,1fr)]">
        <AssistantWorkspaceSidebar
          threads={threads}
          selectedThreadId={selectedThreadId}
          loading={threadsLoading}
          mobileOpen={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
          onSelect={selectThread}
          onNew={() => void newThread()}
          onArchive={(id) => void archiveThread(id)}
          preferences={preferences}
          onPreferenceChange={(key, value) => void changePreference(key, value)}
          memories={memories}
          onForgetMemory={(id) => void forgetMemory(id)}
        />

        <div className="flex min-h-[68vh] min-w-0 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
            {threadLoading ? (
              <div className="flex min-h-[360px] items-center justify-center gap-2 text-[10px] font-bold text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل المحادثة…
              </div>
            ) : empty ? (
              <div className="mx-auto flex min-h-[430px] max-w-3xl flex-col items-center justify-center text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-[1.6rem] bg-gradient-to-br from-slate-950 to-indigo-900 text-white shadow-[0_18px_50px_rgba(49,46,129,0.22)]">
                  <SanadPulseMark state="idle" size={34} />
                </span>
                <h3 className="mt-5 text-xl font-black text-slate-950 md:text-2xl">ماذا تريد أن تعرف؟</h3>
                <p className="mt-3 max-w-xl text-xs leading-7 text-slate-500">
                  اسأل بطريقتك الطبيعية. عندما تكون النتيجة كشفًا أو مستندًا، سيعرضها سند كبطاقة منظمة قابلة للنسخ والفتح.
                </p>

                {(businessSelectionOpen || (!selectedThreadId && businesses.length > 1 && !businessId)) ? (
                  <div className="mt-6 w-full max-w-2xl rounded-[1.4rem] border border-amber-200 bg-amber-50/70 p-4 text-right">
                    <div className="flex items-center gap-2">
                      <BriefcaseBusiness className="h-4 w-4 text-amber-700" />
                      <p className="text-[11px] font-black text-amber-900">اختر النشاط لهذه المحادثة</p>
                    </div>
                    <p className="mt-1 text-[9px] leading-5 text-amber-800/70">سيرتبط هذا السياق بالمحادثة الجديدة فقط، ولن نطلبه مرة أخرى داخلها.</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {businesses.map((business) => (
                        <button
                          key={business.id}
                          type="button"
                          onClick={() => void createThreadForBusiness(business.id)}
                          className="rounded-xl border border-amber-200 bg-white px-3 py-3 text-right text-[10px] font-black text-slate-800 shadow-sm transition hover:border-amber-300"
                        >
                          {business.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

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
              messages.map((message, index) => (
                <div key={message.id}>
                  <MessageBubble
                    message={message}
                    onRetry={message.failed && lastUserPrompt && index === messages.length - 1
                      ? () => void sendPrompt(lastUserPrompt)
                      : undefined}
                    onStar={(value) => void updateMessageFeedback(message.id, { isStarred: value })}
                    onRate={(value) => void updateMessageFeedback(message.id, { rating: value })}
                  />
                </div>
              ))
            )}

            {sending ? (
              <div className="flex justify-start">
                <div className="rounded-[1.4rem] rounded-tr-md border border-indigo-100 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                      <SanadPulseMark state="working" size={18} />
                      <span className="absolute -left-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                    </span>
                    <div>
                      <p className="text-[10px] font-black text-slate-700">{liveStatus || 'جاري التنفيذ…'}</p>
                      {liveTools.length ? (
                        <div className="mt-2 flex max-w-[70vw] flex-wrap gap-1.5">
                          {liveTools.slice(-4).map((item, index) => (
                            <span
                              key={`${item.name}-${index}`}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-bold ${item.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
                            >
                              {item.status === 'completed' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                              {toolLabel(item.name)}
                            </span>
                          ))}
                        </div>
                      ) : null}
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
                placeholder="اسأل سند… مثال: أعطني كشف حساب محمد منصر بن هرهرة"
                className="max-h-40 min-h-[56px] w-full resize-none bg-transparent px-3 py-2 text-[13px] leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60"
              />
              <div className="flex items-center justify-between gap-3 px-1 pb-1">
                <div className="flex min-w-0 items-center gap-2">
                  <SanadVoiceDictationButton
                    disabled={sending}
                    onTranscript={(text) => {
                      setDraft((current) => current.trim() ? `${current.trimEnd()} ${text}` : text);
                      setWorkspaceError(null);
                      window.setTimeout(() => textareaRef.current?.focus(), 40);
                    }}
                    onError={(message) => setWorkspaceError(message)}
                  />
                  <div className="hidden items-center gap-2 text-[9px] font-bold text-slate-400 md:flex">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    راجع النص الصوتي قبل الإرسال
                  </div>
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
            <p className="mt-2 text-center text-[8px] leading-4 text-slate-400">
              Enter للإرسال • Shift + Enter لسطر جديد • الميكروفون يحوّل كلامك إلى نص قابل للمراجعة.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
