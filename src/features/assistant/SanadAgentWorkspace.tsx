import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Loader2,
  Menu,
  RotateCcw,
  SendHorizontal,
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
import SanadFluidOrb, { type SanadOrbState } from './SanadFluidOrb';
import SanadVoiceDictationButton, { type SanadVoiceState } from './SanadVoiceDictationButton';
import SanadAttachmentComposer, { SanadAttachmentPreview } from './SanadAttachmentComposer';
import { listSanadAgentAttachments, type SanadAgentAttachment } from './assistantAttachmentApi';
import { recordSanadAgentClientMetric } from './assistantObservabilityApi';

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
    finance_get_accounts: 'قراءة الحسابات الشخصية',
    finance_get_categories: 'قراءة التصنيفات',
    business_list_accessible: 'قراءة الأنشطة المتاحة',
    business_get_dashboard: 'قراءة لوحة النشاط',
    business_get_payment_inbox: 'قراءة وارد المدفوعات',
    business_search_parties: 'البحث في أطراف النشاط',
    action_prepare_personal_transaction: 'تجهيز مسودة إجراء شخصي',
    action_prepare_commercial_document: 'تجهيز مسودة مستند تجاري',
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
  onModifyAction,
}: {
  message: WorkspaceMessage;
  onRetry?: () => void;
  onStar?: (value: boolean) => void;
  onRate?: (value: -1 | 1 | null) => void;
  onModifyAction?: (prompt: string) => void;
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
              ? `${message.failed ? 'rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3' : 'py-1'}`
              : 'rounded-2xl bg-slate-100 px-4 py-3 text-slate-900 md:px-5'
          }
        >
          {assistant ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                <SanadFluidOrb state="idle" size={22} animated={false} />
              </span>
              سند
              {result?.model ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">{result.model}</span> : null}
            </div>
          ) : null}

          {!assistant && message.attachments?.length ? (
            <div className="mb-3 grid gap-2">
              {message.attachments.map((attachment) => (
                <div key={attachment.id}>
                  <SanadAttachmentPreview attachment={attachment} compact />
                </div>
              ))}
            </div>
          ) : null}

          <p className={`whitespace-pre-wrap text-sm leading-7 md:text-[15px] ${assistant ? 'text-slate-800' : 'text-slate-900'}`}>
            {message.content}
          </p>

          {assistant && result?.response ? <SanadAgentResponseBlocks response={result.response} onModifyAction={onModifyAction} /> : null}

          {message.failed && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-[13px] font-medium text-rose-700"
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
            <div className="flex flex-wrap items-center gap-2 px-1 text-[11px] font-medium text-slate-400">
              {result.latency_ms !== undefined ? (
                <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {formatLatency(result.latency_ms)}</span>
              ) : null}
              {trace.length ? <><span>•</span><span className="inline-flex items-center gap-1"><Wrench className="h-3 w-3" /> {toolSummary(trace)}</span></> : null}
              {result.thinking_level ? <><span>•</span><span>تفكير {result.thinking_level}</span></> : null}
              {result.verification?.passed ? <><span>•</span><span className="text-emerald-600">تم التحقق</span></> : null}
            </div>

            {trace.length ? (
              <details className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
                <summary className="cursor-pointer list-none text-[13px] font-medium text-slate-600">خطوات التنفيذ والمصادر</summary>
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  {trace.map((item, index) => (
                    <div key={`${item.name}-${index}`} className="flex items-start justify-between gap-3 text-xs">
                      <div className="flex items-start gap-2">
                        {item.status === 'completed'
                          ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
                          : <XCircle className="mt-0.5 h-3.5 w-3.5 text-rose-600" />}
                        <div>
                          <p className="font-semibold text-slate-700">{toolLabel(item.name)}</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">{item.source}</p>
                          {item.error ? <p className="mt-1 text-[11px] text-rose-600">{item.error}</p> : null}
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

function unsentAttachments(
  messages: Awaited<ReturnType<typeof getSanadAgentThread>>['messages'],
  attachments: SanadAgentAttachment[],
) {
  const referenced = new Set(messages.flatMap((message) => message.attachment_ids || []));
  return attachments.filter((attachment) => !referenced.has(attachment.id) && attachment.status !== 'deleted');
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

function syncComposerTextareaHeight(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const nextHeight = Math.min(textarea.scrollHeight, 64);
  textarea.style.height = `${Math.max(nextHeight, 40)}px`;
  textarea.style.overflowY = textarea.scrollHeight > 64 ? 'auto' : 'hidden';
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
  const [orbState, setOrbState] = useState<SanadOrbState>('idle');

  const endRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const orbSuccessTimeoutRef = useRef<number | null>(null);

  const clearOrbSuccessTimeout = useCallback(() => {
    if (orbSuccessTimeoutRef.current !== null) {
      window.clearTimeout(orbSuccessTimeoutRef.current);
      orbSuccessTimeoutRef.current = null;
    }
  }, []);

  const markOrbSuccess = useCallback(() => {
    clearOrbSuccessTimeout();
    setOrbState('success');
    orbSuccessTimeoutRef.current = window.setTimeout(() => {
      setOrbState('idle');
      orbSuccessTimeoutRef.current = null;
    }, 900);
  }, [clearOrbSuccessTimeout]);

  const handleVoiceStateChange = useCallback((state: SanadVoiceState) => {
    clearOrbSuccessTimeout();
    setOrbState(state === 'listening' ? 'listening' : state === 'transcribing' ? 'thinking' : 'idle');
  }, [clearOrbSuccessTimeout]);

  useEffect(() => () => clearOrbSuccessTimeout(), [clearOrbSuccessTimeout]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    timeline.scrollTo({ top: timeline.scrollHeight, behavior: 'smooth' });
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
      const loadStartedAt = performance.now();
      setThreadLoading(true);
      setWorkspaceError(null);
      try {
        const [detail, context, attachments] = await Promise.all([
          getSanadAgentThread(selectedThreadId),
          getSanadAgentContext(selectedThreadId),
          listSanadAgentAttachments(selectedThreadId),
        ]);
        if (!alive) return;
        setBusinessId(detail.thread.business_id || (businesses.length === 1 ? businesses[0].id : ''));
        setBusinessSelectionOpen(false);
        setMemories(context.memories);
        setPendingAttachments(unsentAttachments(detail.messages, attachments));
        setMessages(storedMessagesToWorkspace(detail.messages, attachments));
        void recordSanadAgentClientMetric({
          scope: 'thread_load',
          threadId: selectedThreadId,
          status: 'completed',
          transport: 'rpc',
          totalLatencyMs: performance.now() - loadStartedAt,
          itemCount: detail.messages.length + attachments.length,
        });
      } catch (cause) {
        void recordSanadAgentClientMetric({
          scope: 'thread_load',
          threadId: selectedThreadId,
          status: 'failed',
          transport: 'rpc',
          totalLatencyMs: performance.now() - loadStartedAt,
        });
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
    setPendingAttachments([]);
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
      setPendingAttachments([]);
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
    setPendingAttachments([]);
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

  const modifyActionFromCard = (prompt: string) => {
    setDraft(prompt);
    setWorkspaceError(null);
    window.setTimeout(() => textareaRef.current?.focus(),40);
  };

  async function sendPrompt(rawPrompt?: string) {
    const readyAttachments = pendingAttachments.filter((attachment) => attachment.status === 'ready');
    const requestedPrompt = (rawPrompt ?? draft).trim();
    const prompt = requestedPrompt || (readyAttachments.length
      ? 'حلل المرفق المرفق واقترح ربطه ببيانات موجودة أو تجهيز مسودة مناسبة بعد التحقق.'
      : '');
    if (!prompt || sending) return;
    if (pendingAttachments.some((attachment) => attachment.status !== 'ready')) {
      setWorkspaceError('انتظر اكتمال تحليل المرفقات أو احذف المرفق المتعثر قبل الإرسال.');
      return;
    }
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
      attachments: readyAttachments,
    };

    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setSending(true);
    clearOrbSuccessTimeout();
    setOrbState('thinking');
    setLastUserPrompt(prompt);
    setLiveStatus('بدأت معالجة الطلب…');
    setLiveTools([]);
    setWorkspaceError(null);

    try {
      const result = await streamSanadAiAgentTurn({
        message: prompt,
        business_id: businessId || null,
        thread_id: threadId,
        attachment_ids: readyAttachments.map((attachment) => attachment.id),
        history: historyFrom(priorMessages),
      }, (event) => {
        if (event.type === 'run.started') {
          setOrbState('thinking');
          setLiveStatus('بدأ مساعد سند المعالجة…');
        } else if (event.type === 'agent.status') {
          setOrbState('thinking');
          setLiveStatus(event.data.label);
        } else if (event.type === 'tool.started') {
          setOrbState('executing');
          setLiveStatus(`${toolLabel(event.data.name)}…`);
        } else if (event.type === 'tool.completed') {
          setOrbState('executing');
          setLiveTools((current) => [...current, event.data]);
          setLiveStatus(event.data.status === 'completed'
            ? `اكتملت: ${toolLabel(event.data.name)}`
            : `تعذرت: ${toolLabel(event.data.name)}`);
        } else if (event.type === 'answer.final') {
          setOrbState('thinking');
          setLiveStatus('تم التحقق، أجهز الإجابة…');
        }
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
      markOrbSuccess();

      setPendingAttachments([]);
      await refreshThreads(threadId);
      try {
        const [persistedThread, persistedAttachments] = await Promise.all([
          getSanadAgentThread(threadId),
          listSanadAgentAttachments(threadId),
        ]);
        setPendingAttachments(unsentAttachments(persistedThread.messages, persistedAttachments));
        setMessages(storedMessagesToWorkspace(persistedThread.messages, persistedAttachments));
      } catch {
        // The visible answer remains usable; feedback actions enable after the next successful thread reload.
      }
      if (/^(?:تذكر|تذكّر|احفظ|احتفظ)\b/i.test(prompt)) {
        const context = await getSanadAgentContext(threadId);
        setMemories(context.memories);
      }
    } catch (cause) {
      clearOrbSuccessTimeout();
      setOrbState('idle');
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

  useEffect(() => {
    syncComposerTextareaHeight(textareaRef.current);
  }, [draft]);

  const empty = messages.length === 0;

  return (
    <section
      id="sanad-agent-workspace"
      data-conversation-surface="open"
      className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white"
    >
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        data-mobile-sidebar-trigger
        className="absolute right-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-600 shadow-sm backdrop-blur xl:hidden"
        aria-label="فتح محادثات وإعدادات سند"
      >
        <Menu className="h-4 w-4" />
      </button>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-8 bg-gradient-to-b from-white via-white/80 to-transparent"
      />

      {workspaceError ? (
        <div className="border-b border-rose-100 bg-rose-50 px-4 py-2.5 text-[13px] font-medium text-rose-700">
          {workspaceError}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 xl:grid-cols-[284px_minmax(0,1fr)]">
        <AssistantWorkspaceSidebar
          assistantState={orbState}
          assistantStatus={sending ? (liveStatus || 'يعمل الآن') : orbState === 'listening' ? 'يستمع' : orbState === 'thinking' ? 'يفكر' : orbState === 'executing' ? 'ينفذ' : orbState === 'success' ? 'اكتمل' : 'جاهز'}
          businessLabel={businessLoading ? null : (businesses.find((business) => business.id === businessId)?.name || null)}
          businessLoading={businessLoading}
          canChooseBusiness={!businessLoading && businesses.length > 1 && !businessId}
          onChooseBusiness={() => setBusinessSelectionOpen(true)}
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

        <div className="relative flex min-h-0 min-w-0 flex-col">
          <div
            ref={timelineRef}
            data-scroll-owner="timeline"
            className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain scroll-smooth px-3 pb-4 pt-12 [scrollbar-gutter:stable] md:px-7 md:pb-6 xl:pt-6"
          >
            {threadLoading ? (
              <div className="flex min-h-[360px] items-center justify-center gap-2 text-[13px] font-medium text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل المحادثة…
              </div>
            ) : empty ? (
              <div className="mx-auto flex min-h-[430px] max-w-3xl flex-col items-center justify-center text-center">
                <SanadFluidOrb state="idle" size={74} label="سند جاهز" />
                <h3 className="mt-5 text-xl font-semibold text-slate-950 md:text-2xl">ماذا تريد أن تعرف؟</h3>
                <p className="mt-3 max-w-xl text-xs leading-7 text-slate-500">
                  اسأل بطريقتك الطبيعية. عندما تكون النتيجة كشفًا أو مستندًا، سيعرضها سند كبطاقة منظمة قابلة للنسخ والفتح.
                </p>

                {(businessSelectionOpen || (!selectedThreadId && businesses.length > 1 && !businessId)) ? (
                  <div className="mt-6 w-full max-w-2xl rounded-[1.4rem] border border-amber-200 bg-amber-50/70 p-4 text-right">
                    <div className="flex items-center gap-2">
                      <BriefcaseBusiness className="h-4 w-4 text-amber-700" />
                      <p className="text-[15px] font-semibold text-amber-900">اختر النشاط لهذه المحادثة</p>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-amber-800/70">سيرتبط هذا السياق بالمحادثة الجديدة فقط، ولن نطلبه مرة أخرى داخلها.</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {businesses.map((business) => (
                        <button
                          key={business.id}
                          type="button"
                          onClick={() => void createThreadForBusiness(business.id)}
                          className="rounded-xl border border-amber-200 bg-white px-3 py-3 text-right text-[13px] font-medium text-slate-800 shadow-sm transition hover:border-amber-300"
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
                      className="rounded-2xl border border-slate-200 bg-white p-4 text-right text-sm font-medium leading-6 text-slate-700 shadow-sm transition hover:border-slate-300 hover:shadow-md active:scale-[.99]"
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
                    onModifyAction={modifyActionFromCard}
                  />
                </div>
              ))
            )}

            {sending ? (
              <div className="flex justify-start">
                <div role="status" aria-live="polite" className="rounded-[1.35rem] rounded-tr-md border border-slate-200/80 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center">
                      <SanadFluidOrb state={orbState === 'idle' ? 'thinking' : orbState} size={32} />
                    </span>
                    <div>
                      <p className="text-[13px] font-medium text-slate-700">{liveStatus || 'جاري التنفيذ…'}</p>
                      {liveTools.length ? (
                        <div className="mt-2 flex max-w-[70vw] flex-wrap gap-1.5">
                          {liveTools.slice(-4).map((item, index) => (
                            <span
                              key={`${item.name}-${index}`}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${item.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
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

          <form
            data-workspace-slot="composer"
            onSubmit={handleSubmit}
            data-composer-density="compact"
            className="shrink-0 border-t border-slate-200/80 bg-white/95 p-2 backdrop-blur-xl md:px-4 md:py-3"
          >
            <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-1.5 transition focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-950/[0.035]">
              <SanadAttachmentComposer
                threadId={selectedThreadId}
                businessId={businessId || null}
                disabled={sending}
                attachments={pendingAttachments}
                onChange={setPendingAttachments}
                onRequestThread={ensureThread}
                onError={(message) => setWorkspaceError(message)}
              />

              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  syncComposerTextareaHeight(event.currentTarget);
                }}
                onKeyDown={handleKeyDown}
                disabled={sending}
                rows={1}
                placeholder="اسأل سند… مثال: أعطني كشف حساب محمد منصر بن هرهرة"
                className="max-h-[64px] min-h-10 w-full resize-none overflow-y-hidden bg-transparent px-2.5 py-2 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60 md:text-[15px]"
              />
              <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="sr-only">راجع النص الصوتي قبل الإرسال</span>
                  <SanadVoiceDictationButton
                    disabled={sending}
                    onStateChange={handleVoiceStateChange}
                    onTranscript={(text) => {
                      setDraft((current) => current.trim() ? `${current.trimEnd()} ${text}` : text);
                      setWorkspaceError(null);
                      window.setTimeout(() => {
                        syncComposerTextareaHeight(textareaRef.current);
                        textareaRef.current?.focus();
                      }, 40);
                    }}
                    onError={(message) => setWorkspaceError(message)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={
                    sending
                    || pendingAttachments.some((attachment) => attachment.status !== 'ready')
                    || (!draft.trim() && !pendingAttachments.some((attachment) => attachment.status === 'ready'))
                  }
                  className="flex h-9 min-w-9 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-[13px] font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                  <span className="hidden sm:inline">إرسال</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
