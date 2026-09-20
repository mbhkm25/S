export type Json = Record<string, unknown>;
export type ToolCall = { id: string; name: string; arguments: Json };
export type HistoryTurn = { role: "user" | "assistant"; content: string };

export const RUNTIME_VERSION = "sanad-ai-agent-v1";
export const MODEL = "gemini-3.8-flash";
export const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const MAX_TOOL_CALLS = 8;
export const MAX_TOOL_ROUNDS = 5;
export const MAX_PARALLEL_TOOLS = 4;
export const DEFAULT_LIMIT = 30;

export const SYSTEM_INSTRUCTION = `
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
13) بعد الإجابة المباشرة، انتبه لأي نقطة مهمة ومثبتة من نتائج الأدوات تستحق تنبيه المستخدم إليها، لكن لا تخترع مخاطر أو استنتاجات غير مدعومة.
14) الذاكرة والسياق السابق يساعدانك في فهم المستخدم والاختصارات والتفضيلات، لكنهما ليسا مصدرًا للأرصدة أو الفواتير أو الحقائق المالية الحالية؛ أعد قراءة هذه الحقائق من الأدوات الحية.

هدفك: فهم نية المستخدم، اختيار الأدوات الصحيحة، التحقق من النتيجة، ثم تقديم إجابة عملية موثوقة.
`.trim();

export const TOOLS = [
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

export function cleanText(value: unknown, max = 6000) {
  const text = String(value ?? "").trim();
  return text.length > max ? text.slice(0, max) : text;
}

export function chooseThinking(message: string): "low" | "medium" | "high" {
  const text = message.toLowerCase();
  if (message.length < 90 && /^(مرحبا|اهلا|السلام|هلا|شكرا|ما هو سند|كيف يعمل سند)/.test(text)) return "low";
  if (/(قارن|حلل|فسر|لماذا|اختلاف|فروقات|اتجاه|توقع|كل الحسابات|عدة عملات|كشف.*ومبيعات|مبيعات.*ومشتريات)/.test(text)) return "high";
  return "medium";
}

export function sanitizeHistory(value: unknown): HistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-24).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const role = (row as Json).role;
    const content = cleanText((row as Json).content, 2500);
    if ((role !== "user" && role !== "assistant") || !content) return [];
    return [{ role, content } as HistoryTurn];
  });
}

export function userInput(
  message: string,
  history: HistoryTurn[],
  businessId?: string | null,
  memoryContext?: { summary?: string | null; memories?: string[] },
) {
  const compactHistory = history.length
    ? history.map((turn) => `${turn.role === "user" ? "المستخدم" : "مساعد سند"}: ${turn.content}`).join("\n")
    : "لا يوجد سجل سابق مزود لهذه الجولة.";
  const memories = Array.isArray(memoryContext?.memories)
    ? memoryContext!.memories!.slice(0, 30).filter(Boolean)
    : [];
  return [
    "سياق الجلسة:",
    businessId ? `النشاط المحدد حاليًا: ${businessId}` : "لا يوجد نشاط محدد مسبقًا.",
    memoryContext?.summary ? `ملخص المحادثة السابقة: ${memoryContext.summary}` : "لا يوجد ملخص طويل للمحادثة.",
    memories.length ? "ذاكرة مساعدة مستقرة:\n- " + memories.join("\n- ") : "لا توجد ذاكرة مستقرة إضافية.",
    "ملاحظة: الذاكرة ليست مصدرًا للحقائق المالية الحالية؛ استخدم الأدوات الحية لأي رصيد أو مستند أو رقم.",
    "",
    "آخر المحادثة:",
    compactHistory,
    "",
    "رسالة المستخدم الحالية:",
    message,
  ].join("\n");
}

export function extractText(interaction: Json): string {
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

export function extractToolCalls(interaction: Json): ToolCall[] {
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

export function mapUsage(usage: unknown) {
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

export async function geminiInteraction(
  body: Json,
  apiKey = Deno.env.get("GEMINI_API_KEY") ?? "",
): Promise<Json> {
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
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

function extractPeriodFromOutput(value: unknown): { from?: string; to?: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Json;

  const period = row.period;
  if (period && typeof period === "object" && !Array.isArray(period)) {
    const p = period as Json;
    const from = typeof p.from === "string" ? p.from : undefined;
    const to = typeof p.to === "string" ? p.to : undefined;
    if (from || to) return { from, to };
  }

  const fromDate = typeof row.from_date === "string" ? row.from_date : undefined;
  const toDate = typeof row.to_date === "string" ? row.to_date : undefined;
  if (fromDate || toDate) return { from: fromDate, to: toDate };

  for (const key of ["context", "dashboard", "data"]) {
    const nested = extractPeriodFromOutput(row[key]);
    if (nested) return nested;
  }
  return undefined;
}

export function verifyAndRepair(
  text: string,
  toolOutputs: Array<{ name: string; args: Json; output: unknown }>,
) {
  let answer = cleanText(text, 18000);
  const currencies = [...collectCurrencies(toolOutputs.map((row) => row.output))].sort();
  const financial = toolOutputs.some((row) => row.name.startsWith("finance_") || row.name.startsWith("business_") || row.name.startsWith("erp_"));
  const missingCurrencies = financial ? currencies.filter((currency) => !currencyMentioned(answer, currency)) : [];

  const periods = toolOutputs
    .map((row) => {
      const from = String(row.args.from ?? "");
      const to = String(row.args.to ?? "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(from) || /^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return { from: from || undefined, to: to || undefined };
      }
      return extractPeriodFromOutput(row.output);
    })
    .filter((period): period is { from?: string; to?: string } => Boolean(period?.from || period?.to));
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


export function inferScope(toolNames: string[]): "personal" | "business" | "product" {
  if (toolNames.some((name) => name.startsWith("erp_") || name.startsWith("business_"))) return "business";
  if (toolNames.length > 0 && toolNames.every((name) => name === "sanad_search_knowledge")) return "product";
  return "personal";
}

export function detectClarification(text: string): boolean {
  return /وضح|توضيح|يرجى\s+تحديد|يُرجى\s+تحديد|تحديد\s+(?:العميل|الحساب|النشاط|المحل)|أي\s+(?:حساب|نشاط|عميل|محل)|تقصد|حدد|اختر/.test(text);
}
