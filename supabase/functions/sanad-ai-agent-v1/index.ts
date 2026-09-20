import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.110.0";
import {
  DEFAULT_LIMIT,
  MAX_PARALLEL_TOOLS,
  MAX_TOOL_CALLS,
  MAX_TOOL_ROUNDS,
  MODEL,
  RUNTIME_VERSION,
  SYSTEM_INSTRUCTION,
  TOOLS,
  chooseThinking,
  cleanText,
  extractText,
  extractToolCalls,
  geminiInteraction,
  inferScope,
  detectClarification,
  mapUsage,
  sanitizeHistory,
  userInput,
  verifyAndRepair,
  type HistoryTurn,
  type Json,
  type ToolCall,
} from "../_shared/sanad-agent-core.ts";
import { buildAgentPresentation } from "../_shared/sanad-agent-presentation.ts";
import { buildAgentInsights, mergeAgentAttention } from "../_shared/sanad-agent-insights.ts";

type ToolTrace = { name: string; status: "completed" | "failed"; latency_ms: number; source: string; error?: string };
type ActionToolContext = {
  threadId: string | null;
  businessId: string | null;
  requestId: string;
  toolCallId: string;
  attachmentIds: string[];
  priorToolOutputs: Array<{ name: string; args: Json; output: unknown }>;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const ALLOWED_ORIGINS = new Set([
  "https://app.sanadflow.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://app.sanadflow.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function respond(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function boundedInt(value: unknown, fallback: number, max: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(Math.trunc(n), max)) : fallback;
}

function isoDate(value: unknown, fallback: string) {
  const text = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

async function rpc<T = unknown>(client: SupabaseClient, name: string, args: Json = {}): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}:${error.message}`);
  return data as T;
}

async function bestEffortRpc(client: SupabaseClient, name: string, args: Json) {
  try { await client.rpc(name, args); } catch { /* telemetry must never fail the user turn */ }
}

type AgentUsage = ReturnType<typeof mapUsage>;

function emptyAgentUsage(): AgentUsage {
  return {
    promptTokenCount: 0,
    cachedContentTokenCount: 0,
    candidatesTokenCount: 0,
    thoughtsTokenCount: 0,
    totalTokenCount: 0,
  };
}

function addInteractionUsage(target: AgentUsage, interaction: Json | null) {
  const usage = mapUsage(interaction?.usage);
  target.promptTokenCount += usage.promptTokenCount;
  target.cachedContentTokenCount += usage.cachedContentTokenCount;
  target.candidatesTokenCount += usage.candidatesTokenCount;
  target.thoughtsTokenCount += usage.thoughtsTokenCount;
  target.totalTokenCount += usage.totalTokenCount;
}

function interactionRetryCount(interaction: Json | null) {
  return Math.max(0, Number(interaction?.__sanad_retry_count || 0) || 0);
}

function interactionLatencyMs(interaction: Json | null) {
  return Math.max(0, Number(interaction?.__sanad_http_latency_ms || 0) || 0);
}

async function recordAgentServerMetric(
  adminClient: SupabaseClient,
  input: {
    userId: string;
    threadId: string | null;
    businessId: string | null;
    requestId: string;
    status: "completed" | "failed";
    transport: "sse" | "json";
    thinkingLevel: "low" | "medium" | "high";
    totalLatencyMs: number;
    contextLoadMs: number;
    attachmentContextMs: number;
    modelLatencyMs: number;
    toolLatencyMs: number;
    persistenceMs: number;
    toolCalls: number;
    failedToolCalls: number;
    retryCount: number;
    usage: AgentUsage;
    attachmentCount: number;
    errorCode?: string | null;
  },
) {
  await bestEffortRpc(adminClient,"record_sanad_agent_server_metric_v1",{
    p_user_id:input.userId,
    p_thread_id:input.threadId,
    p_business_id:input.businessId,
    p_request_id:input.requestId,
    p_scope:"agent_server_turn",
    p_status:input.status,
    p_transport:input.transport,
    p_model:MODEL,
    p_thinking_level:input.thinkingLevel,
    p_total_latency_ms:Math.max(0,Math.round(input.totalLatencyMs)),
    p_context_load_ms:Math.max(0,Math.round(input.contextLoadMs)),
    p_attachment_context_ms:Math.max(0,Math.round(input.attachmentContextMs)),
    p_model_latency_ms:Math.max(0,Math.round(input.modelLatencyMs)),
    p_tool_latency_ms:Math.max(0,Math.round(input.toolLatencyMs)),
    p_persistence_ms:Math.max(0,Math.round(input.persistenceMs)),
    p_tool_calls:input.toolCalls,
    p_failed_tool_calls:input.failedToolCalls,
    p_retry_count:input.retryCount,
    p_input_tokens:input.usage.promptTokenCount,
    p_cached_tokens:input.usage.cachedContentTokenCount,
    p_output_tokens:input.usage.candidatesTokenCount,
    p_total_tokens:input.usage.totalTokenCount,
    p_item_count:input.attachmentCount,
    p_byte_count:null,
    p_error_code:input.errorCode || null,
    p_runtime_version:RUNTIME_VERSION,
  });
}

type AgentCloudContext = {
  threadId: string | null;
  businessId: string | null;
  history: HistoryTurn[];
  summary: string | null;
  memories: string[];
  messageCount: number;
  preferences: {
    save_history_enabled: boolean;
    memory_enabled: boolean;
    proactive_insights_enabled: boolean;
    response_cards_enabled: boolean;
  };
};

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

async function loadAgentCloudContext(
  userClient: SupabaseClient,
  threadId: string | null,
  fallbackHistory: HistoryTurn[],
  requestedBusinessId: string | null,
): Promise<AgentCloudContext> {
  if (!threadId) {
    return {
      threadId: null,
      businessId: requestedBusinessId,
      history: fallbackHistory,
      summary: null,
      memories: [],
      messageCount: fallbackHistory.length,
      preferences: {
        save_history_enabled: false,
        memory_enabled: false,
        proactive_insights_enabled: true,
        response_cards_enabled: true,
      },
    };
  }

  const payload = await rpc<Json>(userClient, "get_my_sanad_agent_context_v1", {
    p_thread_id: threadId,
    p_recent_limit: 24,
    p_memory_limit: 30,
  });
  const thread = payload.thread && typeof payload.thread === "object" ? payload.thread as Json : {};
  const preferences = payload.preferences && typeof payload.preferences === "object" ? payload.preferences as Json : {};
  const history = sanitizeHistory(payload.recent_messages);
  const memories = Array.isArray(payload.memories)
    ? payload.memories.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Json;
        const value = cleanText(row.value_text, 1200);
        return value ? [value] : [];
      })
    : [];

  return {
    threadId,
    businessId: requestedBusinessId || cleanText(thread.business_id, 80) || null,
    history,
    summary: cleanText(thread.summary, 4000) || null,
    memories,
    messageCount: Number(thread.message_count || history.length) || history.length,
    preferences: {
      save_history_enabled: bool(preferences.save_history_enabled, true),
      memory_enabled: bool(preferences.memory_enabled, true),
      proactive_insights_enabled: bool(preferences.proactive_insights_enabled, true),
      response_cards_enabled: bool(preferences.response_cards_enabled, true),
    },
  };
}

function attachmentIdsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => {
    const id = cleanText(item, 80);
    return /^[0-9a-f-]{36}$/i.test(id) ? [id] : [];
  }))].slice(0, 5);
}

async function loadAttachmentContext(
  userClient: SupabaseClient,
  threadId: string | null,
  attachmentIds: string[],
) {
  if (!attachmentIds.length) return { ids: [] as string[], summaries: [] as string[] };
  if (!threadId) throw new Error("attachment_thread_required");

  const rows = await Promise.all(attachmentIds.map((id) =>
    rpc<Json>(userClient, "get_my_sanad_agent_attachment_v1", { p_attachment_id: id })
  ));

  const summaries: string[] = [];
  for (const row of rows) {
    if (cleanText(row.thread_id, 80) !== threadId) throw new Error("attachment_thread_mismatch");
    if (cleanText(row.status, 40) !== "ready") throw new Error("attachment_not_ready");

    const analysis = row.analysis && typeof row.analysis === "object" ? row.analysis as Json : {};
    const suggestion = row.suggestion && typeof row.suggestion === "object" ? row.suggestion as Json : {};
    const pieces = [
      `الملف: ${cleanText(row.file_name, 300) || "مرفق"}`,
      `النوع المستخرج: ${cleanText(analysis.document_type, 80) || "غير محدد"}`,
      `الملخص: ${cleanText(analysis.summary, 1200) || "لا يوجد"}`,
      cleanText(analysis.document_number, 160) ? `رقم المستند المستخرج: ${cleanText(analysis.document_number, 160)}` : "",
      cleanText(analysis.counterparty_name, 300) ? `الطرف المستخرج: ${cleanText(analysis.counterparty_name, 300)}` : "",
      analysis.amount !== null && analysis.amount !== undefined ? `المبلغ المستخرج: ${String(analysis.amount)} ${cleanText(analysis.currency, 20)}` : "",
      `اقتراح المطابقة: ${cleanText(suggestion.kind, 80) || "review_required"}`,
      suggestion.write_performed === false ? "لم تُنفذ أي كتابة أو عملية مالية." : "",
    ].filter(Boolean);
    summaries.push(pieces.join(" | "));
  }

  return { ids: attachmentIds, summaries };
}

function explicitMemoryFrom(message: string): { key: string; value: string } | null {
  const match = message.match(/^(?:تذكر|تذكّر|احفظ|احتفظ)\s+(?:أن|بأن)?\s*(.{3,800})$/i);
  if (!match) return null;
  const value = cleanText(match[1], 800);
  if (!value) return null;
  const key = "explicit:" + value.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
  return { key, value };
}

async function maybeStoreExplicitMemory(
  adminClient: SupabaseClient,
  authUserId: string,
  cloud: AgentCloudContext,
  message: string,
) {
  if (!cloud.threadId || !cloud.preferences.memory_enabled) return;
  const memory = explicitMemoryFrom(message);
  if (!memory) return;
  await bestEffortRpc(adminClient, "upsert_sanad_agent_memory_v1", {
    p_user_id: authUserId,
    p_memory_key: memory.key,
    p_category: "explicit_note",
    p_value_text: memory.value,
    p_confidence: 1,
    p_source_thread_id: cloud.threadId,
    p_source_message_id: null,
    p_expires_at: null,
    p_metadata: { source: "explicit_user_instruction" },
  });
}

async function maybeRefreshThreadSummary(
  adminClient: SupabaseClient,
  cloud: AgentCloudContext,
  authUserId: string,
  latestUserMessage: string,
  latestAssistantMessage: string,
) {
  if (!cloud.threadId || !cloud.preferences.save_history_enabled) return;
  if (cloud.messageCount < 20 || cloud.messageCount % 10 > 1) return;

  try {
    const transcript = cloud.history.slice(-20)
      .map((turn) => `${turn.role === "user" ? "المستخدم" : "مساعد سند"}: ${turn.content}`)
      .join("\n");
    const summaryInteraction = await geminiInteraction({
      model: MODEL,
      system_instruction: "لخّص سياق محادثة مساعد سند باختصار عملي. احتفظ بالأهداف والتفضيلات والقرارات والسياق الثابت. لا تحفظ أرصدة أو مبالغ أو فواتير باعتبارها حقائق دائمة؛ هذه يجب إعادة قراءتها من الأدوات. لا تضف معلومات غير موجودة.",
      input: [
        cloud.summary ? `الملخص السابق: ${cloud.summary}` : "لا يوجد ملخص سابق.",
        "المحادثة الحديثة:",
        transcript,
        `المستخدم: ${latestUserMessage}`,
        `مساعد سند: ${latestAssistantMessage}`,
      ].join("\n"),
      generation_config: { thinking_level: "low", temperature: 0.1 },
    });
    const summary = cleanText(extractText(summaryInteraction), 4000);
    if (!summary) return;
    await adminClient
      .from("sanad_agent_threads")
      .update({ summary, summary_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", cloud.threadId)
      .eq("user_id", authUserId);
  } catch {
    // Summary refresh is best-effort and must never block the user turn.
  }
}

async function persistAgentTurn(
  adminClient: SupabaseClient,
  cloud: AgentCloudContext,
  authUserId: string,
  requestId: string,
  message: string,
  responseText: string,
  response: Json,
  toolTrace: ToolTrace[],
  thinkingLevel: "low" | "medium" | "high",
  attachmentIds: string[] = [],
) {
  if (!cloud.threadId || !cloud.preferences.save_history_enabled) return;
  await bestEffortRpc(adminClient, "save_sanad_agent_turn_v2", {
    p_user_id: authUserId,
    p_thread_id: cloud.threadId,
    p_user_message: message,
    p_assistant_message: responseText,
    p_response: response,
    p_tool_trace: toolTrace,
    p_request_id: requestId,
    p_model: MODEL,
    p_thinking_level: thinkingLevel,
    p_business_id: cloud.businessId,
    p_attachment_ids: attachmentIds,
  });
  await maybeStoreExplicitMemory(adminClient, authUserId, cloud, message);
  await maybeRefreshThreadSummary(adminClient, cloud, authUserId, message, responseText);
}

function safeSearchTerm(value: unknown, max = 120) {
  return cleanText(value, max).replace(/[,()%_*]/g, " ").replace(/\s+/g, " ").trim();
}

function objectValue(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function resolvedIdsFromToolOutputs(
  rows: Array<{ name: string; output: unknown }>,
  toolName: string,
  field: string,
) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.name !== toolName) continue;
    const root = objectValue(row.output);
    const items = Array.isArray(root.items)
      ? root.items
      : Array.isArray(row.output) ? row.output : [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const id = cleanText((item as Json)[field],80);
      if (id) ids.add(id);
    }
  }
  return ids;
}

function assertActionPreparationResolved(
  name: string,
  args: Json,
  actionContext: ActionToolContext,
) {
  if (name === "action_prepare_personal_transaction") {
    const accounts = resolvedIdsFromToolOutputs(actionContext.priorToolOutputs,"finance_get_accounts","id");
    if (!accounts.size) throw new Error("action_requires_finance_accounts_resolution");

    const type = cleanText(args.transaction_type,20);
    const accountId = cleanText(args.account_id,80);
    const sourceId = cleanText(args.source_account_id,80);
    const destinationId = cleanText(args.destination_account_id,80);

    if ((type === "income" || type === "expense") && (!accountId || !accounts.has(accountId))) {
      throw new Error("action_account_not_resolved_in_turn");
    }
    if (type === "transfer" && (!sourceId || !destinationId || !accounts.has(sourceId) || !accounts.has(destinationId))) {
      throw new Error("action_transfer_accounts_not_resolved_in_turn");
    }

    const categoryId = cleanText(args.category_id,80);
    if (categoryId) {
      const categories = resolvedIdsFromToolOutputs(actionContext.priorToolOutputs,"finance_get_categories","id");
      if (!categories.has(categoryId)) throw new Error("action_category_not_resolved_in_turn");
    }
    return;
  }

  if (name === "action_prepare_commercial_document") {
    const businessId = cleanText(args.business_id,80);
    if (!businessId || (actionContext.businessId && businessId !== actionContext.businessId)) {
      throw new Error("action_business_context_mismatch");
    }

    const partyId = cleanText(args.party_id,80);
    if (partyId) {
      const parties = resolvedIdsFromToolOutputs(actionContext.priorToolOutputs,"business_search_parties","id");
      if (!parties.has(partyId)) throw new Error("action_party_not_resolved_in_turn");
    }
  }
}

function sourceForTool(name: string) {
  const sources: Record<string, string> = {
    finance_get_overview: "get_ai_financial_context_v2",
    finance_search_transactions: "get_ai_financial_context_v2",
    finance_get_obligations: "get_ai_financial_context_v2",
    finance_get_budgets: "get_my_budget_progress_v1",
    finance_get_goals: "get_ai_financial_context_v2",
    finance_search_parties: "personal_finance_parties",
    finance_get_accounts: "get_my_financial_accounts_v1",
    finance_get_categories: "personal_finance_categories",
    business_list_accessible: "get_my_account_center_v1",
    business_get_dashboard: "get_business_commercial_dashboard_v1",
    business_get_payment_inbox: "get_business_payment_inbox_v3",
    business_search_parties: "business_parties",
    action_prepare_personal_transaction: "sanad_agent_actions:review_only",
    action_prepare_commercial_document: "sanad_agent_actions:review_only",
    erp_get_replica_status: "get_ai_erp_read_context_v1",
    erp_search_customers: "get_business_erp_customer_candidates_v1",
    erp_get_customer_statement: "get_ai_erp_read_context_v1",
    erp_get_documents: "get_ai_erp_read_context_v1",
    sanad_search_knowledge: "search_sanad_assistant_knowledge",
  };
  return sources[name] || "unknown";
}

async function executeTool(
  name: string,
  args: Json,
  userClient: SupabaseClient,
  adminClient: SupabaseClient,
  actionContext: ActionToolContext,
): Promise<unknown> {
  const today = todayIso();
  const from = isoDate(args.from, daysAgoIso(30));
  const to = isoDate(args.to, today);
  const limit = boundedInt(args.limit, DEFAULT_LIMIT, 100);

  if (name === "finance_get_overview" || name === "finance_search_transactions" || name === "finance_get_obligations" || name === "finance_get_goals") {
    const payload = await rpc<Json>(userClient, "get_ai_financial_context_v2", {
      p_scope_kind: "personal",
      p_business_id: null,
      p_from: from,
      p_to: to,
      p_limit: limit,
      p_purpose: `sanad_ai:${name}`,
    });
    const context = payload?.context && typeof payload.context === "object" ? payload.context as Json : {};
    if (name === "finance_get_overview") return payload;
    if (name === "finance_search_transactions") {
      const query = cleanText(args.query, 120).toLowerCase();
      const rows = Array.isArray(context.recent_transactions) ? context.recent_transactions : [];
      const filtered = query
        ? rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query))
        : rows;
      return { contract_version: payload.contract_version, access_log_id: payload.access_log_id, period: context.period, items: filtered.slice(0, limit) };
    }
    if (name === "finance_get_obligations") return { contract_version: payload.contract_version, access_log_id: payload.access_log_id, period: context.period, items: context.open_obligations ?? [] };
    return { contract_version: payload.contract_version, access_log_id: payload.access_log_id, period: context.period, items: context.active_goals ?? [] };
  }

  if (name === "finance_get_budgets") {
    return await rpc(userClient, "get_my_budget_progress_v1", { p_on_date: isoDate(args.on_date, today) });
  }

  if (name === "finance_search_parties") {
    const query = safeSearchTerm(args.query, 120);
    if (!query) throw new Error("party_query_required");
    const partyLimit = boundedInt(args.limit, 20, 50);
    const { data, error } = await userClient
      .from("personal_finance_parties")
      .select("id,display_name,party_type,phone,email,status")
      .or(`display_name.ilike.%${query.replaceAll(",", " ")}%,phone.ilike.%${query.replaceAll(",", " ")}%`)
      .order("display_name")
      .limit(partyLimit);
    if (error) throw new Error(`finance_search_parties:${error.message}`);
    return { items: data ?? [] };
  }

  if (name === "finance_get_accounts") {
    return { items: await rpc(userClient, "get_my_financial_accounts_v1") };
  }

  if (name === "finance_get_categories") {
    const kind = cleanText(args.kind, 20);
    let query = userClient
      .from("personal_finance_categories")
      .select("id,kind,name,status")
      .eq("status","active")
      .order("kind")
      .order("name");
    if (kind === "income" || kind === "expense") query = query.eq("kind",kind);
    const { data, error } = await query.limit(100);
    if (error) throw new Error(`finance_get_categories:${error.message}`);
    return { items: data ?? [] };
  }

  if (name === "business_list_accessible") {
    const payload = await rpc<Json>(userClient, "get_my_account_center_v1");
    return {
      owned_businesses: payload?.owned_businesses ?? payload?.businesses ?? [],
      business_memberships: payload?.business_memberships ?? [],
    };
  }

  if (name === "business_search_parties") {
    const businessId = cleanText(args.business_id,80);
    const queryText = safeSearchTerm(args.query,120);
    if (!businessId || !queryText) throw new Error("business_id_and_party_query_required");
    const partyLimit = boundedInt(args.limit,10,20);
    const { data, error } = await userClient
      .from("business_parties")
      .select("id,business_id,display_name,primary_phone,status")
      .eq("business_id",businessId)
      .eq("status","active")
      .or(`display_name.ilike.%${queryText.replaceAll(",", " ")}%,primary_phone.ilike.%${queryText.replaceAll(",", " ")}%`)
      .order("display_name")
      .limit(partyLimit);
    if (error) throw new Error(`business_search_parties:${error.message}`);
    return { items:data ?? [] };
  }

  if (name === "action_prepare_personal_transaction" || name === "action_prepare_commercial_document") {
    if (!actionContext.threadId) throw new Error("action_thread_required");
    assertActionPreparationResolved(name,args,actionContext);
    const actionType = name === "action_prepare_personal_transaction"
      ? "personal_transaction"
      : "commercial_document_draft";
    return await rpc(userClient,"create_my_sanad_agent_action_draft_v1",{
      p_thread_id:actionContext.threadId,
      p_action_type:actionType,
      p_payload:args,
      p_request_id:actionContext.requestId,
      p_tool_call_id:actionContext.toolCallId,
      p_attachment_ids:actionContext.attachmentIds,
    });
  }

  if (name === "business_get_dashboard") {
    const businessId = cleanText(args.business_id, 80);
    if (!businessId) throw new Error("business_id_required");
    return await rpc(userClient, "get_business_commercial_dashboard_v1", {
      p_business_id: businessId,
      p_from: from,
      p_to: to,
    });
  }

  if (name === "business_get_payment_inbox") {
    const businessId = cleanText(args.business_id,80);
    if (!businessId) throw new Error("business_id_required");
    if (actionContext.businessId && businessId !== actionContext.businessId) {
      throw new Error("payment_inbox_business_context_mismatch");
    }
    const allowedViews = new Set(["new","mine","team_active","review","completed","all"]);
    const requestedView = cleanText(args.view,30) || "new";
    const view = allowedViews.has(requestedView) ? requestedView : "new";
    const payload = await rpc<Json>(userClient,"get_business_payment_inbox_v3",{
      p_business_id:businessId,
      p_view:view,
      p_limit:boundedInt(args.limit,20,30),
      p_before_created_at:null,
      p_before_id:null,
    });
    const items = Array.isArray(payload.items) ? payload.items : [];
    return {
      contract_version: payload.contract_version,
      business_id: businessId,
      view,
      has_more: payload.has_more === true,
      items: items.slice(0,30).flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const row = value as Json;
        return [{
          id: cleanText(row.id,80),
          operation_id: cleanText(row.operation_id,80),
          public_token: cleanText(row.public_token,180),
          status: cleanText(row.status,60),
          amount: Number(row.amount ?? 0) || 0,
          currency: cleanText(row.currency,20),
          financial_entity: cleanText(row.financial_entity,160) || null,
          receiver_name: cleanText(row.receiver_name,200) || null,
          reference_number: cleanText(row.reference_number,160) || null,
          transaction_datetime: cleanText(row.transaction_datetime,80) || null,
          claimed_by_name: cleanText(row.claimed_by_name,200) || null,
          completed_by_name: cleanText(row.completed_by_name,200) || null,
          created_at: cleanText(row.created_at,80) || null,
        }];
      }),
    };
  }

  if (name === "erp_search_customers") {
    const businessId = cleanText(args.business_id, 80);
    const query = cleanText(args.query, 120);
    if (!businessId || !query) throw new Error("business_id_and_query_required");
    return await rpc(userClient, "get_business_erp_customer_candidates_v1", {
      p_business_id: businessId,
      p_query: query,
      p_limit: boundedInt(args.limit, 10, 20),
    });
  }

  if (name === "erp_get_replica_status" || name === "erp_get_customer_statement" || name === "erp_get_documents") {
    const businessId = cleanText(args.business_id, 80);
    if (!businessId) throw new Error("business_id_required");
    const queryKind = name === "erp_get_replica_status"
      ? "replica_status"
      : name === "erp_get_customer_statement"
        ? "customer_statement"
        : args.kind === "purchases" ? "purchases" : "sales";
    const accountId = name === "erp_get_customer_statement" ? Number(args.account_id) : null;
    if (name === "erp_get_customer_statement" && (!Number.isInteger(accountId) || Number(accountId) <= 0)) {
      throw new Error("resolved_account_id_required");
    }
    return await rpc(userClient, "get_ai_erp_read_context_v1", {
      p_business_id: businessId,
      p_query_kind: queryKind,
      p_subject_account_id: accountId,
      p_from: from,
      p_to: to,
      p_limit: limit,
      p_purpose: `sanad_ai:${name}`,
    });
  }

  if (name === "sanad_search_knowledge") {
    const query = cleanText(args.query, 500);
    if (!query) throw new Error("knowledge_query_required");
    return await rpc(adminClient, "search_sanad_assistant_knowledge", {
      p_query: query,
      p_governorate: null,
      p_limit: boundedInt(args.limit, 5, 8),
      p_intent: null,
    });
  }

  throw new Error(`tool_not_allowed:${name}`);
}

async function logTool(
  adminClient: SupabaseClient,
  tool: ToolCall,
  run: () => Promise<unknown>,
): Promise<{ output: unknown; trace: ToolTrace }> {
  const started = Date.now();
  let executionId: number | null = null;
  try {
    const { data } = await adminClient.rpc("start_sanad_assistant_tool_execution", {
      p_assistant_message_id: null,
      p_conversation_id: null,
      p_tool_name: tool.name,
      p_input: tool.arguments,
    });
    executionId = typeof data === "number" ? data : Number(data) || null;
  } catch {
    executionId = null;
  }

  try {
    const output = await run();
    const latency = Date.now() - started;
    if (executionId) {
      await bestEffortRpc(adminClient, "finish_sanad_assistant_tool_execution", {
        p_execution_id: executionId,
        p_status: "completed",
        p_output: output ?? {},
        p_error_code: null,
        p_error_message: null,
        p_latency_ms: latency,
      });
    }
    return { output, trace: { name: tool.name, status: "completed", latency_ms: latency, source: sourceForTool(tool.name) } };
  } catch (cause) {
    const latency = Date.now() - started;
    const message = cleanText(cause instanceof Error ? cause.message : cause, 600);
    if (executionId) {
      await bestEffortRpc(adminClient, "finish_sanad_assistant_tool_execution", {
        p_execution_id: executionId,
        p_status: "failed",
        p_output: {},
        p_error_code: message.split(":")[0].slice(0, 120),
        p_error_message: message,
        p_latency_ms: latency,
      });
    }
    return {
      output: { error: message, tool: tool.name },
      trace: { name: tool.name, status: "failed", latency_ms: latency, source: sourceForTool(tool.name), error: message },
    };
  }
}


function streamAgentResponse(
  req: Request,
  message: string,
  cloud: AgentCloudContext,
  thinkingLevel: "low" | "medium" | "high",
  requestId: string,
  authUserId: string,
  userClient: SupabaseClient,
  adminClient: SupabaseClient,
  attachmentContext: { ids: string[]; summaries: string[] },
  requestTiming: { startedAt: number; contextLoadMs: number; attachmentContextMs: number },
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      void (async () => {
        const started = requestTiming.startedAt;
        const toolTrace: ToolTrace[] = [];
        const toolOutputs: Array<{ name: string; args: Json; output: unknown }> = [];
        const aggregateUsage = emptyAgentUsage();
        let totalToolCalls = 0;
        let modelLatencyMs = 0;
        let retryCount = 0;
        let persistenceMs = 0;
        let interaction: Json | null = null;

        try {
          send("run.started", {
            request_id: requestId,
            runtime_version: RUNTIME_VERSION,
            model: MODEL,
            thinking_level: thinkingLevel,
          });
          send("agent.status", { status: "planning", label: "أفهم الطلب وأحدد الأدوات المناسبة…" });

          interaction = await geminiInteraction({
            model: MODEL,
            system_instruction: SYSTEM_INSTRUCTION,
            input: userInput(message, cloud.history, cloud.businessId, { summary: cloud.summary, memories: cloud.memories }, attachmentContext.summaries),
            tools: TOOLS,
            generation_config: { thinking_level: thinkingLevel, temperature: 0.2 },
          });
          addInteractionUsage(aggregateUsage,interaction);
          modelLatencyMs += interactionLatencyMs(interaction);
          retryCount += interactionRetryCount(interaction);

          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const calls = extractToolCalls(interaction);
            if (!calls.length) break;
            if (totalToolCalls + calls.length > MAX_TOOL_CALLS) throw new Error("tool_call_limit_exceeded");
            if (calls.length > MAX_PARALLEL_TOOLS) throw new Error("parallel_tool_limit_exceeded");
            totalToolCalls += calls.length;

            send("agent.status", {
              status: "tools",
              label: calls.length > 1 ? "أنفذ الأدوات المطلوبة بالتوازي…" : "أنفذ الأداة المطلوبة…",
              count: calls.length,
              round: round + 1,
            });

            const executed = await Promise.all(calls.map(async (tool) => {
              send("tool.started", { name: tool.name, source: sourceForTool(tool.name) });
              const item = await logTool(
                adminClient,
                tool,
                () => executeTool(tool.name, tool.arguments, userClient, adminClient, {
                  threadId: cloud.threadId,
                  businessId: cloud.businessId,
                  requestId,
                  toolCallId: tool.id,
                  attachmentIds: attachmentContext.ids,
                  priorToolOutputs: toolOutputs,
                }),
              );
              send("tool.completed", item.trace);
              return item;
            }));

            const results = executed.map((item, index) => {
              toolTrace.push(item.trace);
              toolOutputs.push({ name: calls[index].name, args: calls[index].arguments, output: item.output });
              return {
                type: "function_result",
                name: calls[index].name,
                call_id: calls[index].id,
                result: [{ type: "text", text: JSON.stringify(item.output) }],
              };
            });

            const previousId = cleanText(interaction.id, 200);
            if (!previousId) throw new Error("missing_interaction_id");

            send("agent.status", { status: "reasoning", label: "أربط النتائج وأحدد الخطوة التالية…" });
            interaction = await geminiInteraction({
              model: MODEL,
              previous_interaction_id: previousId,
              input: results,
              tools: TOOLS,
              generation_config: { thinking_level: thinkingLevel, temperature: 0.2 },
            });
            addInteractionUsage(aggregateUsage,interaction);
            modelLatencyMs += interactionLatencyMs(interaction);
            retryCount += interactionRetryCount(interaction);
          }

          const remainingCalls = interaction ? extractToolCalls(interaction) : [];
          if (remainingCalls.length) throw new Error("tool_round_limit_exceeded");

          const finalText = interaction ? extractText(interaction) : "";
          if (!finalText) throw new Error("empty_model_answer");

          send("agent.status", { status: "verifying", label: "أراجع العملات والفترة والمصادر قبل الإجابة…" });

          const verified = verifyAndRepair(finalText, toolOutputs);
          const usage = aggregateUsage;
          const latency = Date.now() - started;

          await bestEffortRpc(adminClient, "record_ai_usage", {
            p_request_id: requestId,
            p_operation_id: null,
            p_source: "sanad_ai_agent_v1_stream",
            p_purpose: "assistant_turn",
            p_model: MODEL,
            p_billing_mode: "standard",
            p_status: "completed",
            p_latency_ms: latency,
            p_usage_metadata: usage,
            p_metadata: {
              user_id: authUserId,
              runtime_version: RUNTIME_VERSION,
              thinking_level: thinkingLevel,
              tool_calls: totalToolCalls,
              tool_names: toolTrace.map((item) => item.name),
              transport: "sse",
            },
          });

          const presentation = buildAgentPresentation(toolOutputs);
          const deterministicInsights = buildAgentInsights(toolOutputs);
          const responsePayload = {
            text: verified.text,
            scope: inferScope(toolOutputs.map((row) => row.name)),
            period: verified.period,
            currencies: verified.currencies,
            cards: cloud.preferences.response_cards_enabled ? presentation.cards : [],
            entities: presentation.entities,
            attention: cloud.preferences.proactive_insights_enabled
              ? mergeAgentAttention(presentation.attention, deterministicInsights)
              : [],
            insight_meta: {
              version: "sanad-insights-v2",
              deterministic_count: deterministicInsights.length,
            },
            copy_text: cloud.preferences.response_cards_enabled ? presentation.copy_text : undefined,
            source_refs: toolTrace
              .filter((row) => row.status === "completed")
              .map((row) => ({ tool: row.name, source: row.source })),
            needs_clarification: detectClarification(verified.text),
          };
          const result = {
            ok: true,
            request_id: requestId,
            thread_id: cloud.threadId,
            runtime_version: RUNTIME_VERSION,
            model: MODEL,
            thinking_level: thinkingLevel,
            response: responsePayload,
            verification: verified.verification,
            tool_trace: toolTrace,
            usage,
            latency_ms: latency,
          };

          const persistenceStartedAt = Date.now();
          await persistAgentTurn(
            adminClient, cloud, authUserId, requestId, message, verified.text,
            responsePayload as Json, toolTrace, thinkingLevel, attachmentContext.ids,
          );
          persistenceMs = Date.now() - persistenceStartedAt;

          await recordAgentServerMetric(adminClient,{
            userId:authUserId,
            threadId:cloud.threadId,
            businessId:cloud.businessId,
            requestId,
            status:"completed",
            transport:"sse",
            thinkingLevel,
            totalLatencyMs:Date.now()-started,
            contextLoadMs:requestTiming.contextLoadMs,
            attachmentContextMs:requestTiming.attachmentContextMs,
            modelLatencyMs,
            toolLatencyMs:toolTrace.reduce((sum,item)=>sum+item.latency_ms,0),
            persistenceMs,
            toolCalls:totalToolCalls,
            failedToolCalls:toolTrace.filter((item)=>item.status==="failed").length,
            retryCount,
            usage,
            attachmentCount:attachmentContext.ids.length,
          });

          send("answer.final", { text: verified.text });
          send("run.completed", result);
        } catch (cause) {
          const latency = Date.now() - started;
          const messageText = cleanText(cause instanceof Error ? cause.message : cause, 1000);

          await bestEffortRpc(adminClient, "record_ai_usage", {
            p_request_id: requestId,
            p_operation_id: null,
            p_source: "sanad_ai_agent_v1_stream",
            p_purpose: "assistant_turn",
            p_model: MODEL,
            p_billing_mode: "standard",
            p_status: "failed",
            p_latency_ms: latency,
            p_usage_metadata: aggregateUsage,
            p_metadata: {
              user_id: authUserId,
              runtime_version: RUNTIME_VERSION,
              thinking_level: thinkingLevel,
              tool_calls: totalToolCalls,
              error: messageText,
              transport: "sse",
            },
          });

          await recordAgentServerMetric(adminClient,{
            userId:authUserId,
            threadId:cloud.threadId,
            businessId:cloud.businessId,
            requestId,
            status:"failed",
            transport:"sse",
            thinkingLevel,
            totalLatencyMs:latency,
            contextLoadMs:requestTiming.contextLoadMs,
            attachmentContextMs:requestTiming.attachmentContextMs,
            modelLatencyMs,
            toolLatencyMs:toolTrace.reduce((sum,item)=>sum+item.latency_ms,0),
            persistenceMs,
            toolCalls:totalToolCalls,
            failedToolCalls:toolTrace.filter((item)=>item.status==="failed").length,
            retryCount,
            usage:aggregateUsage,
            attachmentCount:attachmentContext.ids.length,
            errorCode:messageText.split(":")[0].slice(0,160),
          });

          send("run.error", {
            request_id: requestId,
            error: messageText.startsWith("gemini_") ? "model_runtime_error" : messageText,
            tool_trace: toolTrace,
            latency_ms: latency,
          });
        } finally {
          send("done", { request_id: requestId });
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

Deno.serve(async (req) => {
  const requestStartedAt = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return respond(req, { ok: false, error: "method_not_allowed" }, 405);
  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return respond(req, { ok: false, error: "runtime_not_configured" }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return respond(req, { ok: false, error: "authentication_required" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authHeader.slice(7);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return respond(req, { ok: false, error: "invalid_session" }, 401);

  let body: Json;
  try { body = await req.json(); } catch { return respond(req, { ok: false, error: "invalid_json" }, 400); }

  const message = cleanText(body.message);
  if (!message) return respond(req, { ok: false, error: "message_required" }, 400);

  const fallbackHistory = sanitizeHistory(body.history);
  const requestedBusinessId = cleanText(body.business_id, 80) || null;
  const threadId = cleanText(body.thread_id, 80) || null;
  const attachmentIds = attachmentIdsFrom(body.attachment_ids);
  let cloud: AgentCloudContext;
  const contextStartedAt = Date.now();
  try {
    cloud = await loadAgentCloudContext(userClient, threadId, fallbackHistory, requestedBusinessId);
  } catch (cause) {
    const contextError = cleanText(cause instanceof Error ? cause.message : cause, 600);
    return respond(req, { ok: false, error: contextError }, contextError.includes("not_found") ? 404 : 403);
  }
  const contextLoadMs = Date.now() - contextStartedAt;
  let attachmentContext: { ids: string[]; summaries: string[] };
  const attachmentContextStartedAt = Date.now();
  try {
    attachmentContext = await loadAttachmentContext(userClient, cloud.threadId, attachmentIds);
  } catch (cause) {
    const attachmentError = cleanText(cause instanceof Error ? cause.message : cause, 600);
    return respond(req, { ok: false, error: attachmentError }, 422);
  }
  const attachmentContextMs = Date.now() - attachmentContextStartedAt;
  const thinkingLevel = chooseThinking(message);
  const requestId = crypto.randomUUID();
  const started = requestStartedAt;
  const toolTrace: ToolTrace[] = [];
  const toolOutputs: Array<{ name: string; args: Json; output: unknown }> = [];
  const aggregateUsage = emptyAgentUsage();
  let totalToolCalls = 0;
  let modelLatencyMs = 0;
  let retryCount = 0;
  let persistenceMs = 0;
  let interaction: Json | null = null;

  const wantsStream = body.stream === true || (req.headers.get("Accept") || "").includes("text/event-stream");
  if (wantsStream) {
    return streamAgentResponse(
      req,
      message,
      cloud,
      thinkingLevel,
      requestId,
      authData.user.id,
      userClient,
      adminClient,
      attachmentContext,
      { startedAt:requestStartedAt, contextLoadMs, attachmentContextMs },
    );
  }

  try {
    interaction = await geminiInteraction({
      model: MODEL,
      system_instruction: SYSTEM_INSTRUCTION,
      input: userInput(message, cloud.history, cloud.businessId, { summary: cloud.summary, memories: cloud.memories }, attachmentContext.summaries),
      tools: TOOLS,
      generation_config: { thinking_level: thinkingLevel, temperature: 0.2 },
    });
    addInteractionUsage(aggregateUsage,interaction);
    modelLatencyMs += interactionLatencyMs(interaction);
    retryCount += interactionRetryCount(interaction);

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const calls = extractToolCalls(interaction);
      if (!calls.length) break;
      if (totalToolCalls + calls.length > MAX_TOOL_CALLS) throw new Error("tool_call_limit_exceeded");
      if (calls.length > MAX_PARALLEL_TOOLS) throw new Error("parallel_tool_limit_exceeded");
      totalToolCalls += calls.length;

      const executed = await Promise.all(calls.map((tool) =>
        logTool(adminClient, tool, () => executeTool(tool.name, tool.arguments, userClient, adminClient, {
          threadId: cloud.threadId,
          businessId: cloud.businessId,
          requestId,
          toolCallId: tool.id,
          attachmentIds: attachmentContext.ids,
          priorToolOutputs: toolOutputs,
        }))
      ));

      const results = executed.map((item, index) => {
        toolTrace.push(item.trace);
        toolOutputs.push({ name: calls[index].name, args: calls[index].arguments, output: item.output });
        return {
          type: "function_result",
          name: calls[index].name,
          call_id: calls[index].id,
          result: [{ type: "text", text: JSON.stringify(item.output) }],
        };
      });

      const previousId = cleanText(interaction.id, 200);
      if (!previousId) throw new Error("missing_interaction_id");

      interaction = await geminiInteraction({
        model: MODEL,
        previous_interaction_id: previousId,
        input: results,
        tools: TOOLS,
        generation_config: { thinking_level: thinkingLevel, temperature: 0.2 },
      });
      addInteractionUsage(aggregateUsage,interaction);
      modelLatencyMs += interactionLatencyMs(interaction);
      retryCount += interactionRetryCount(interaction);
    }

    const remainingCalls = interaction ? extractToolCalls(interaction) : [];
    if (remainingCalls.length) throw new Error("tool_round_limit_exceeded");

    const finalText = interaction ? extractText(interaction) : "";
    if (!finalText) throw new Error("empty_model_answer");

    const verified = verifyAndRepair(finalText, toolOutputs);
    const usage = aggregateUsage;
    const latency = Date.now() - started;

    await bestEffortRpc(adminClient, "record_ai_usage", {
      p_request_id: requestId,
      p_operation_id: null,
      p_source: "sanad_ai_agent_v1",
      p_purpose: "assistant_turn",
      p_model: MODEL,
      p_billing_mode: "standard",
      p_status: "completed",
      p_latency_ms: latency,
      p_usage_metadata: usage,
      p_metadata: {
        user_id: authData.user.id,
        runtime_version: RUNTIME_VERSION,
        thinking_level: thinkingLevel,
        tool_calls: totalToolCalls,
        tool_names: toolTrace.map((item) => item.name),
      },
    });

    const presentation = buildAgentPresentation(toolOutputs);
    const deterministicInsights = buildAgentInsights(toolOutputs);
    const responsePayload = {
      text: verified.text,
      scope: inferScope(toolOutputs.map((row) => row.name)),
      period: verified.period,
      currencies: verified.currencies,
      cards: cloud.preferences.response_cards_enabled ? presentation.cards : [],
      entities: presentation.entities,
      attention: cloud.preferences.proactive_insights_enabled
        ? mergeAgentAttention(presentation.attention, deterministicInsights)
        : [],
      insight_meta: {
        version: "sanad-insights-v2",
        deterministic_count: deterministicInsights.length,
      },
      copy_text: cloud.preferences.response_cards_enabled ? presentation.copy_text : undefined,
      source_refs: toolTrace
        .filter((row) => row.status === "completed")
        .map((row) => ({ tool: row.name, source: row.source })),
      needs_clarification: detectClarification(verified.text),
    };

    const persistenceStartedAt = Date.now();
    await persistAgentTurn(
      adminClient, cloud, authData.user.id, requestId, message, verified.text,
      responsePayload as Json, toolTrace, thinkingLevel, attachmentContext.ids,
    );
    persistenceMs = Date.now() - persistenceStartedAt;

    await recordAgentServerMetric(adminClient,{
      userId:authData.user.id,
      threadId:cloud.threadId,
      businessId:cloud.businessId,
      requestId,
      status:"completed",
      transport:"json",
      thinkingLevel,
      totalLatencyMs:Date.now()-started,
      contextLoadMs,
      attachmentContextMs,
      modelLatencyMs,
      toolLatencyMs:toolTrace.reduce((sum,item)=>sum+item.latency_ms,0),
      persistenceMs,
      toolCalls:totalToolCalls,
      failedToolCalls:toolTrace.filter((item)=>item.status==="failed").length,
      retryCount,
      usage,
      attachmentCount:attachmentContext.ids.length,
    });

    return respond(req, {
      ok: true,
      request_id: requestId,
      thread_id: cloud.threadId,
      runtime_version: RUNTIME_VERSION,
      model: MODEL,
      thinking_level: thinkingLevel,
      response: responsePayload,
      verification: verified.verification,
      tool_trace: toolTrace,
      usage,
      latency_ms: latency,
    });
  } catch (cause) {
    const latency = Date.now() - started;
    const message = cleanText(cause instanceof Error ? cause.message : cause, 1000);

    await bestEffortRpc(adminClient, "record_ai_usage", {
      p_request_id: requestId,
      p_operation_id: null,
      p_source: "sanad_ai_agent_v1",
      p_purpose: "assistant_turn",
      p_model: MODEL,
      p_billing_mode: "standard",
      p_status: "failed",
      p_latency_ms: latency,
      p_usage_metadata: aggregateUsage,
      p_metadata: {
        user_id: authData.user.id,
        runtime_version: RUNTIME_VERSION,
        thinking_level: thinkingLevel,
        tool_calls: totalToolCalls,
        error: message,
      },
    });

    await recordAgentServerMetric(adminClient,{
      userId:authData.user.id,
      threadId:cloud.threadId,
      businessId:cloud.businessId,
      requestId,
      status:"failed",
      transport:"json",
      thinkingLevel,
      totalLatencyMs:latency,
      contextLoadMs,
      attachmentContextMs,
      modelLatencyMs,
      toolLatencyMs:toolTrace.reduce((sum,item)=>sum+item.latency_ms,0),
      persistenceMs,
      toolCalls:totalToolCalls,
      failedToolCalls:toolTrace.filter((item)=>item.status==="failed").length,
      retryCount,
      usage:aggregateUsage,
      attachmentCount:attachmentContext.ids.length,
      errorCode:message.split(":")[0].slice(0,160),
    });

    return respond(req, {
      ok: false,
      request_id: requestId,
      error: message.startsWith("gemini_") ? "model_runtime_error" : message,
      tool_trace: toolTrace,
      latency_ms: latency,
    }, message.includes("limit_exceeded") ? 422 : 500);
  }
});
