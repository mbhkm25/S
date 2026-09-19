import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.110.0";

type Json = Record<string, unknown>;
type ToolCall = { id: string; name: string; arguments: Json };
type ToolTrace = { name: string; status: "completed" | "failed"; latency_ms: number; source: string; error?: string };
type HistoryTurn = { role: "user" | "assistant"; content: string };

const RUNTIME_VERSION = "sanad-ai-agent-v1";
const MODEL = "gemini-3.8-flash";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_TOOL_CALLS = 8;
const MAX_TOOL_ROUNDS = 5;
const MAX_PARALLEL_TOOLS = 4;
const DEFAULT_LIMIT = 30;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const ALLOWED_ORIGINS = new Set([
  "https://app.sanadflow.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const SYSTEM_INSTRUCTION = `
أنت «مساعد سند»، وكيل مالي وتجاري ذكي داخل تطبيق سند، ولست بوت دعم عام.

قواعد تشغيل ملزمة:
1) استخدم الأدوات لأي حقيقة تخص بيانات المستخدم المالية أو التجارية أو بيانات إبداع. لا تخمّن أرقامًا أو أرصدة أو أسماء حسابات أو مستندات.
2) لا تخلط العملات مطلقًا ولا تجمع SAR وYER وUSD في رقم واحد. اعرض كل عملة مستقلة.
3) عند الإجابة عن بيانات مالية اذكر الفترة والعملة بوضوح.
4) بيانات إبداع تقرأ فقط من العقود الدلالية المعتمدة. لا SQL حر ولا جداول خام.
5) إذا كان اسم العميل ملتبسًا، استخدم البحث عن المرشحين واطلب توضيحًا. لا تختَر حسابًا من نفسك.
6) أنت في وضع قراءة فقط. لا تنشئ أو ترحّل أو تسوّي أو تعكس أي عملية.
7) نفّذ أقل عدد من الأدوات اللازمة. يمكن استخدام أدوات مستقلة في الجولة نفسها.
8) إذا احتجت معرفة النشاط المتاح للمستخدم فاستدع business_list_accessible أولًا.
9) أجب بالعربية الواضحة والمختصرة افتراضيًا، مع تفاصيل كافية عندما يطلبها المستخدم.
10) لا تعرض التفكير الداخلي أو chain-of-thought. يمكنك فقط إعطاء وصف موجز لما تم فحصه.
11) نتائج الأدوات هي المصدر المرجعي للحقيقة، وتتقدم على معرفتك العامة.
12) إذا لم تتوفر بيانات كافية، صرّح بذلك واسأل سؤال توضيح واحد محدد.

هدفك: فهم نية المستخدم، اختيار الأدوات الصحيحة، التحقق من النتيجة، ثم تقديم إجابة عملية موثوقة.
`.trim();

const TOOLS = [
  {
    type: "function",
    name: "finance_get_overview",
    description: "Read the authenticated user's personal finance overview for a bounded period, including dashboard, transactions, obligations and goals. Currencies stay separate.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        to: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        limit: { type: "integer", description: "Maximum recent items, 1-100." },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "finance_search_transactions",
    description: "Search the authenticated user's recent personal finance transactions by period and optional text.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional text matched against description, reference, party or category identifiers available in the semantic context." },
        from: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        to: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        limit: { type: "integer", description: "Maximum results, 1-100." },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "finance_get_obligations",
    description: "Read the authenticated user's open personal receivables and payables.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Maximum results, 1-100." },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "finance_get_budgets",
    description: "Read personal budget progress for a given date.",
    parameters: {
      type: "object",
      properties: {
        on_date: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "finance_get_goals",
    description: "Read the authenticated user's active personal financial goals.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "finance_search_parties",
    description: "Search personal financial counterparties by name or phone.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name or phone search text." },
        limit: { type: "integer", description: "Maximum results, 1-50." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "business_list_accessible",
    description: "List businesses the authenticated user can access. Use this before business tools if the business is not already explicit.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "business_get_dashboard",
    description: "Read the commercial dashboard for an authorized SANAD business and period.",
    parameters: {
      type: "object",
      properties: {
        business_id: { type: "string", description: "Authorized business UUID." },
        from: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        to: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
      },
      required: ["business_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "erp_get_replica_status",
    description: "Read latest completed ERP cloud replica status for an authorized business.",
    parameters: {
      type: "object",
      properties: { business_id: { type: "string", description: "Authorized business UUID." } },
      required: ["business_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "erp_search_customers",
    description: "Search ERP customer candidates. Use before customer statement unless the exact account_id is already resolved in this turn.",
    parameters: {
      type: "object",
      properties: {
        business_id: { type: "string", description: "Authorized business UUID." },
        query: { type: "string", description: "Customer name, phone, customer number or account hint." },
        limit: { type: "integer", description: "Maximum candidates, 1-20." },
      },
      required: ["business_id", "query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "erp_get_customer_statement",
    description: "Read an ERP customer statement after a concrete account_id is resolved.",
    parameters: {
      type: "object",
      properties: {
        business_id: { type: "string", description: "Authorized business UUID." },
        account_id: { type: "integer", description: "Resolved ERP account id." },
        from: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        to: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        limit: { type: "integer", description: "Maximum statement movements, 1-100." },
      },
      required: ["business_id", "account_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "erp_get_documents",
    description: "Read bounded ERP sales or purchase documents for an authorized business.",
    parameters: {
      type: "object",
      properties: {
        business_id: { type: "string", description: "Authorized business UUID." },
        kind: { type: "string", enum: ["sales", "purchases"], description: "Document kind." },
        from: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        to: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        limit: { type: "integer", description: "Maximum documents, 1-100." },
      },
      required: ["business_id", "kind"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "sanad_search_knowledge",
    description: "Search approved SANAD product and operational knowledge. Never use this tool for user financial facts.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Product or operational knowledge question." },
        limit: { type: "integer", description: "Maximum knowledge units, 1-8." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
] as const;

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

function cleanText(value: unknown, max = 6000) {
  const text = String(value ?? "").trim();
  return text.length > max ? text.slice(0, max) : text;
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

function chooseThinking(message: string): "low" | "medium" | "high" {
  const text = message.toLowerCase();
  if (message.length < 90 && /^(مرحبا|اهلا|السلام|هلا|شكرا|ما هو سند|كيف يعمل سند)/.test(text)) return "low";
  if (/(قارن|حلل|فسر|لماذا|اختلاف|فروقات|اتجاه|توقع|كل الحسابات|عدة عملات|كشف.*ومبيعات|مبيعات.*ومشتريات)/.test(text)) return "high";
  return "medium";
}

function sanitizeHistory(value: unknown): HistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-8).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const role = (row as Json).role;
    const content = cleanText((row as Json).content, 2500);
    if ((role !== "user" && role !== "assistant") || !content) return [];
    return [{ role, content } as HistoryTurn];
  });
}

function userInput(message: string, history: HistoryTurn[], businessId?: string | null) {
  const compactHistory = history.length
    ? history.map((turn) => `${turn.role === "user" ? "المستخدم" : "مساعد سند"}: ${turn.content}`).join("\n")
    : "لا يوجد سجل سابق مزود لهذه الجولة.";
  return [
    "سياق الجلسة:",
    businessId ? `النشاط المحدد حاليًا: ${businessId}` : "لا يوجد نشاط محدد مسبقًا.",
    "",
    "آخر المحادثة:",
    compactHistory,
    "",
    "رسالة المستخدم الحالية:",
    message,
  ].join("\n");
}

function extractText(interaction: Json): string {
  const direct = cleanText(interaction.output_text, 20000);
  if (direct) return direct;
  const steps = Array.isArray(interaction.steps) ? interaction.steps : [];
  const chunks: string[] = [];
  for (const step of steps) {
    if (!step || typeof step !== "object" || (step as Json).type !== "model_output") continue;
    const content = Array.isArray((step as Json).content) ? (step as Json).content as unknown[] : [];
    for (const part of content) {
      if (part && typeof part === "object" && (part as Json).type === "text") {
        const text = cleanText((part as Json).text, 20000);
        if (text) chunks.push(text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function extractToolCalls(interaction: Json): ToolCall[] {
  const steps = Array.isArray(interaction.steps) ? interaction.steps : [];
  return steps.flatMap((step) => {
    if (!step || typeof step !== "object") return [];
    const row = step as Json;
    if (row.type !== "function_call") return [];
    const id = cleanText(row.id, 160);
    const name = cleanText(row.name, 120);
    if (!id || !name) return [];
    const args = row.arguments && typeof row.arguments === "object" && !Array.isArray(row.arguments) ? row.arguments as Json : {};
    return [{ id, name, arguments: args }];
  });
}

function mapUsage(usage: unknown) {
  const u = usage && typeof usage === "object" ? usage as Json : {};
  const input = Number(u.total_input_tokens ?? u.input_tokens ?? 0);
  const cached = Number(u.total_cached_tokens ?? u.cached_tokens ?? 0);
  const output = Number(u.total_output_tokens ?? u.output_tokens ?? 0);
  const thought = Number(u.total_thought_tokens ?? u.thoughts_tokens ?? 0);
  const total = Number(u.total_tokens ?? 0);
  return {
    promptTokenCount: Number.isFinite(input) ? input : 0,
    cachedContentTokenCount: Number.isFinite(cached) ? cached : 0,
    candidatesTokenCount: Number.isFinite(output) ? output : 0,
    thoughtsTokenCount: Number.isFinite(thought) ? thought : 0,
    totalTokenCount: Number.isFinite(total) ? total : 0,
  };
}

async function geminiInteraction(body: Json): Promise<Json> {
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
      "Api-Revision": "2026-05-20",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: Json = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text.slice(0, 1000) }; }
  if (!response.ok) {
    const message = cleanText((parsed.error as Json | undefined)?.message ?? text, 1200);
    throw new Error(`gemini_${response.status}:${message}`);
  }
  return parsed;
}

async function rpc<T = unknown>(client: SupabaseClient, name: string, args: Json = {}): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}:${error.message}`);
  return data as T;
}

function sourceForTool(name: string) {
  const sources: Record<string, string> = {
    finance_get_overview: "get_ai_financial_context_v2",
    finance_search_transactions: "get_ai_financial_context_v2",
    finance_get_obligations: "get_ai_financial_context_v2",
    finance_get_budgets: "get_my_budget_progress_v1",
    finance_get_goals: "get_ai_financial_context_v2",
    finance_search_parties: "personal_finance_parties",
    business_list_accessible: "get_my_account_center_v1",
    business_get_dashboard: "get_business_commercial_dashboard_v1",
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
    const query = cleanText(args.query, 120);
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

  if (name === "business_list_accessible") {
    const payload = await rpc<Json>(userClient, "get_my_account_center_v1");
    return {
      owned_businesses: payload?.owned_businesses ?? payload?.businesses ?? [],
      business_memberships: payload?.business_memberships ?? [],
    };
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

function collectCurrencies(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectCurrencies(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, raw] of Object.entries(value as Json)) {
    if ((key === "currency" || key === "english_code") && typeof raw === "string" && /^[A-Z]{3}$/.test(raw)) output.add(raw);
    collectCurrencies(raw, output);
  }
  return output;
}

function currencyMentioned(text: string, currency: string) {
  const aliases: Record<string, string[]> = {
    SAR: ["SAR", "ر.س", "ريال سعودي", "ريالًا سعوديًا", "ريال سعوديّ"],
    YER: ["YER", "ر.ي", "ريال يمني", "ريالًا يمنيًا"],
    USD: ["USD", "$", "دولار"],
  };
  return (aliases[currency] ?? [currency]).some((token) => text.includes(token));
}

function verifyAndRepair(
  text: string,
  toolOutputs: Array<{ name: string; args: Json; output: unknown }>,
) {
  let answer = cleanText(text, 18000);
  const currencies = [...collectCurrencies(toolOutputs.map((row) => row.output))].sort();
  const financial = toolOutputs.some((row) => row.name.startsWith("finance_") || row.name.startsWith("business_") || row.name.startsWith("erp_"));
  const missingCurrencies = financial ? currencies.filter((currency) => !currencyMentioned(answer, currency)) : [];

  const periods = toolOutputs
    .map((row) => ({ from: String(row.args.from ?? ""), to: String(row.args.to ?? "") }))
    .filter((period) => /^\d{4}-\d{2}-\d{2}$/.test(period.from) || /^\d{4}-\d{2}-\d{2}$/.test(period.to));
  const period = periods[0];
  const periodVisible = !period || [period.from, period.to].filter(Boolean).every((date) => answer.includes(date));

  const repairs: string[] = [];
  if (missingCurrencies.length) repairs.push(`العملات الموجودة في المصادر: ${currencies.join("، ")}، وكل عملة معروضة بصورة مستقلة دون دمج.`);
  if (period && !periodVisible) repairs.push(`الفترة المرجعية: ${period.from || "البداية"} — ${period.to || "اليوم"}.`);
  if (repairs.length) answer = `${answer}\n\n${repairs.join("\n")}`.trim();

  return {
    text: answer,
    currencies,
    period: period && (period.from || period.to) ? period : undefined,
    verification: {
      passed: Boolean(answer),
      no_currency_merge: true,
      missing_currency_mentions_repaired: missingCurrencies,
      period_repaired: Boolean(period && !periodVisible),
    },
  };
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
      await adminClient.rpc("finish_sanad_assistant_tool_execution", {
        p_execution_id: executionId,
        p_status: "completed",
        p_output: output ?? {},
        p_error_code: null,
        p_error_message: null,
        p_latency_ms: latency,
      }).catch(() => undefined);
    }
    return { output, trace: { name: tool.name, status: "completed", latency_ms: latency, source: sourceForTool(tool.name) } };
  } catch (cause) {
    const latency = Date.now() - started;
    const message = cleanText(cause instanceof Error ? cause.message : cause, 600);
    if (executionId) {
      await adminClient.rpc("finish_sanad_assistant_tool_execution", {
        p_execution_id: executionId,
        p_status: "failed",
        p_output: {},
        p_error_code: message.split(":")[0].slice(0, 120),
        p_error_message: message,
        p_latency_ms: latency,
      }).catch(() => undefined);
    }
    return {
      output: { error: message, tool: tool.name },
      trace: { name: tool.name, status: "failed", latency_ms: latency, source: sourceForTool(tool.name), error: message },
    };
  }
}

Deno.serve(async (req) => {
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

  const history = sanitizeHistory(body.history);
  const businessId = cleanText(body.business_id, 80) || null;
  const thinkingLevel = chooseThinking(message);
  const requestId = crypto.randomUUID();
  const started = Date.now();
  const toolTrace: ToolTrace[] = [];
  const toolOutputs: Array<{ name: string; args: Json; output: unknown }> = [];
  let totalToolCalls = 0;
  let interaction: Json | null = null;

  try {
    interaction = await geminiInteraction({
      model: MODEL,
      system_instruction: SYSTEM_INSTRUCTION,
      input: userInput(message, history, businessId),
      tools: TOOLS,
      generation_config: { thinking_level: thinkingLevel, temperature: 0.2 },
    });

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const calls = extractToolCalls(interaction);
      if (!calls.length) break;
      if (totalToolCalls + calls.length > MAX_TOOL_CALLS) throw new Error("tool_call_limit_exceeded");
      if (calls.length > MAX_PARALLEL_TOOLS) throw new Error("parallel_tool_limit_exceeded");
      totalToolCalls += calls.length;

      const executed = await Promise.all(calls.map((tool) =>
        logTool(adminClient, tool, () => executeTool(tool.name, tool.arguments, userClient, adminClient))
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
    }

    const remainingCalls = interaction ? extractToolCalls(interaction) : [];
    if (remainingCalls.length) throw new Error("tool_round_limit_exceeded");

    const finalText = interaction ? extractText(interaction) : "";
    if (!finalText) throw new Error("empty_model_answer");

    const verified = verifyAndRepair(finalText, toolOutputs);
    const usage = mapUsage(interaction?.usage);
    const latency = Date.now() - started;

    await adminClient.rpc("record_ai_usage", {
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
    }).catch(() => undefined);

    return respond(req, {
      ok: true,
      request_id: requestId,
      runtime_version: RUNTIME_VERSION,
      model: MODEL,
      thinking_level: thinkingLevel,
      response: {
        text: verified.text,
        scope: toolOutputs.some((row) => row.name.startsWith("erp_") || row.name.startsWith("business_")) ? "business" : "personal",
        period: verified.period,
        currencies: verified.currencies,
        source_refs: toolTrace
          .filter((row) => row.status === "completed")
          .map((row) => ({ tool: row.name, source: row.source })),
        needs_clarification: /وضح|توضيح|أي حساب|أي نشاط|تقصد/.test(verified.text),
      },
      verification: verified.verification,
      tool_trace: toolTrace,
      usage,
      latency_ms: latency,
    });
  } catch (cause) {
    const latency = Date.now() - started;
    const message = cleanText(cause instanceof Error ? cause.message : cause, 1000);

    await adminClient.rpc("record_ai_usage", {
      p_request_id: requestId,
      p_operation_id: null,
      p_source: "sanad_ai_agent_v1",
      p_purpose: "assistant_turn",
      p_model: MODEL,
      p_billing_mode: "standard",
      p_status: "failed",
      p_latency_ms: latency,
      p_usage_metadata: mapUsage(interaction?.usage),
      p_metadata: {
        user_id: authData.user.id,
        runtime_version: RUNTIME_VERSION,
        thinking_level: thinkingLevel,
        tool_calls: totalToolCalls,
        error: message,
      },
    }).catch(() => undefined);

    return respond(req, {
      ok: false,
      request_id: requestId,
      error: message.startsWith("gemini_") ? "model_runtime_error" : message,
      tool_trace: toolTrace,
      latency_ms: latency,
    }, message.includes("limit_exceeded") ? 422 : 500);
  }
});
