// SANAD Verify v3 - Analyze Uploaded Operation
// Supabase Edge Function: sanad-v3-analyze-operation
//
// Required secrets:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - GEMINI_API_KEY
// - SANAD_INTERNAL_API_KEY
//
// Optional configuration:
// - GEMINI_MODEL = gemini-2.5-flash
// - SANAD_PROMPT_KEY = sanad_operation_extraction_v1
// - GEMINI_MAX_ATTEMPTS = 2
// - GEMINI_REQUEST_TIMEOUT_MS = 22000
// - ENABLE_FAST_ROUTING_PASS = false
// - GEMINI_FAST_MODEL = GEMINI_MODEL

import { jsonrepair } from "npm:jsonrepair@3.13.1";
import {
  assessCoreExtraction,
  buildExtractionV3Rules,
  EXTRACTION_PIPELINE_VERSION,
  reconcileExtraction,
} from "./extraction-v3.ts";

type JsonRecord = Record<string, unknown>;

declare const EdgeRuntime:
  | undefined
  | {
      waitUntil: (promise: Promise<unknown>) => void;
    };

const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_API_KEY = mustGetEnv("GEMINI_API_KEY");
const SANAD_INTERNAL_API_KEY = mustGetEnv("SANAD_INTERNAL_API_KEY");

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const GEMINI_FAST_MODEL = Deno.env.get("GEMINI_FAST_MODEL") || GEMINI_MODEL;
const GEMINI_RECOVERY_MODEL = Deno.env.get("GEMINI_RECOVERY_MODEL") || GEMINI_FAST_MODEL;
const SANAD_PROMPT_KEY =
  Deno.env.get("SANAD_PROMPT_KEY") || "sanad_operation_extraction_v1";
const GEMINI_MAX_ATTEMPTS = Math.max(
  1,
  Math.min(3, Number(Deno.env.get("GEMINI_MAX_ATTEMPTS") || "2") || 2),
);
const GEMINI_REQUEST_TIMEOUT_MS = Math.max(
  5000,
  Math.min(
    60000,
    Number(Deno.env.get("GEMINI_REQUEST_TIMEOUT_MS") || "22000") || 22000,
  ),
);
const ENABLE_FAST_ROUTING_PASS =
  (Deno.env.get("ENABLE_FAST_ROUTING_PASS") || "false") === "true";

const FUNCTION_NAME = "sanad-v3-analyze-operation";
const DEFAULT_BUCKET = "operation-files";
const FAST_EXTRACTOR_VERSION = "fast-routing-v1.0";

const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.sanadflow.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sanad-internal-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FINANCIAL_ENTITIES = [
  "العمقي موبايل",
  "البسيري موبايل",
  "محفظة بي كاش",
  "الكريمي سعودي",
  "الكريمي يمني",
  "الكريمي حاسب",
  "بن دول صرافة",
  "بن دول باي",
  "أم فلوس",
  "عدن كاش",
  "القطيبي",
  "المحضار",
  "جهة أخرى",
  "unknown",
];
const DOCUMENT_TEMPLATES = [
  "single_receipt",
  "transaction_list",
  "account_history",
  "wallet_receipt",
  "transfer_receipt",
  "statement",
  "unknown",
];
const TRANSACTION_TYPES = [
  "transfer",
  "deposit",
  "withdrawal",
  "payment",
  "unknown",
];
const TRANSACTION_DIRECTIONS = ["incoming", "outgoing", "internal", "unknown"];
const IDENTIFIER_TYPES = [
  "financial_account_number",
  "unique_account_name",
  "national_id",
  "passport_number",
  "wallet_number",
  "phone_number",
  "unknown_identifier",
];
const PARTY_ROLES = [
  "credited_party",
  "debited_party",
  "sender",
  "receiver",
  "beneficiary",
  "unknown",
];
const CONFIDENCE_FIELDS = [
  "financial_entity",
  "document_template",
  "transaction_type",
  "transaction_direction",
  "amount",
  "currency",
  "sender_name",
  "sender_account",
  "receiver_name",
  "receiver_account",
  "document_account",
  "credited_account",
  "debited_account",
  "merchant_point",
  "reference_number",
  "transaction_datetime",
];

const nullableString = { type: "STRING", nullable: true };
const nullableNumber = { type: "NUMBER", nullable: true };

const PARTY_IDENTIFIER_SCHEMA = {
  type: "OBJECT",
  properties: {
    type: { type: "STRING", enum: IDENTIFIER_TYPES },
    value: { type: "STRING" },
    label: nullableString,
    financial_entity: nullableString,
    confidence: { type: "NUMBER" },
    evidence: nullableString,
  },
  required: ["type", "value", "label", "financial_entity", "confidence", "evidence"],
};

const PARTY_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: nullableString,
    role: { type: "STRING", enum: PARTY_ROLES },
    identifiers: { type: "ARRAY", items: PARTY_IDENTIFIER_SCHEMA },
  },
  required: ["name", "role", "identifiers"],
};

const FULL_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_financial_document: { type: "BOOLEAN" },
    non_financial_reason: nullableString,
    summary: nullableString,
    financial_entity: { type: "STRING", enum: FINANCIAL_ENTITIES },
    financial_entity_raw: nullableString,
    document_template: { type: "STRING", enum: DOCUMENT_TEMPLATES },
    document_template_confidence: { type: "NUMBER" },
    transaction_type: { type: "STRING", enum: TRANSACTION_TYPES },
    transaction_direction: { type: "STRING", enum: TRANSACTION_DIRECTIONS },
    transaction_direction_confidence: { type: "NUMBER" },
    amount: nullableNumber,
    currency: { type: "STRING", enum: ["YER", "SAR", "USD"], nullable: true },
    sender_name: nullableString,
    sender_account: nullableString,
    sender_identifier_type: { type: "STRING", enum: IDENTIFIER_TYPES },
    receiver_name: nullableString,
    receiver_account: nullableString,
    receiver_identifier_type: { type: "STRING", enum: IDENTIFIER_TYPES },
    parties: { type: "ARRAY", items: PARTY_SCHEMA },
    document_account: nullableString,
    credited_account: nullableString,
    debited_account: nullableString,
    merchant_point: nullableString,
    reference_number: nullableString,
    transaction_datetime: nullableString,
    transaction_time_present: { type: "BOOLEAN" },
    transaction_date_source: {
      type: "STRING",
      enum: [
        "labeled_date",
        "single_visible_date",
        "document_footer",
        "explicit_datetime",
      ],
      nullable: true,
    },
    multiple_operations_present: { type: "BOOLEAN" },
    selected_operation_position: { type: "INTEGER", nullable: true },
    confidence_score: { type: "NUMBER" },
    field_confidences: {
      type: "OBJECT",
      properties: Object.fromEntries(
        CONFIDENCE_FIELDS.map((field) => [field, { type: "NUMBER" }]),
      ),
    },
    field_evidence: {
      type: "OBJECT",
      properties: Object.fromEntries(
        CONFIDENCE_FIELDS.map((field) => [field, nullableString]),
      ),
    },
    possible_fraud: { type: "BOOLEAN" },
    ai_flags: { type: "ARRAY", items: { type: "STRING" } },
    missing_fields: { type: "ARRAY", items: { type: "STRING" } },
    visual_integrity_notes: { type: "ARRAY", items: { type: "STRING" } },
    sanad_attention_points: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: [
    "is_financial_document",
    "non_financial_reason",
    "summary",
    "financial_entity",
    "financial_entity_raw",
    "document_template",
    "document_template_confidence",
    "transaction_type",
    "transaction_direction",
    "transaction_direction_confidence",
    "amount",
    "currency",
    "sender_name",
    "sender_account",
    "sender_identifier_type",
    "receiver_name",
    "receiver_account",
    "receiver_identifier_type",
    "parties",
    "document_account",
    "credited_account",
    "debited_account",
    "merchant_point",
    "reference_number",
    "transaction_datetime",
    "transaction_time_present",
    "transaction_date_source",
    "multiple_operations_present",
    "selected_operation_position",
    "confidence_score",
    "field_confidences",
    "field_evidence",
    "possible_fraud",
    "ai_flags",
    "missing_fields",
    "visual_integrity_notes",
    "sanad_attention_points",
  ],
};

const FAST_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    financial_entity: { type: "STRING", enum: FINANCIAL_ENTITIES },
    document_template: { type: "STRING", enum: DOCUMENT_TEMPLATES },
    transaction_direction: { type: "STRING", enum: TRANSACTION_DIRECTIONS },
    amount: nullableNumber,
    currency: { type: "STRING", enum: ["YER", "SAR", "USD"], nullable: true },
    receiver_name: nullableString,
    receiver_account: nullableString,
    receiver_identifier_type: { type: "STRING", enum: IDENTIFIER_TYPES },
    document_account: nullableString,
    credited_account: nullableString,
    merchant_point: nullableString,
    field_confidences: {
      type: "OBJECT",
      properties: {
        financial_entity: { type: "NUMBER" },
        transaction_direction: { type: "NUMBER" },
        receiver_account: { type: "NUMBER" },
        document_account: { type: "NUMBER" },
        credited_account: { type: "NUMBER" },
        merchant_point: { type: "NUMBER" },
      },
    },
    field_evidence: {
      type: "OBJECT",
      properties: {
        financial_entity: nullableString,
        transaction_direction: nullableString,
        receiver_account: nullableString,
        document_account: nullableString,
        credited_account: nullableString,
        merchant_point: nullableString,
      },
    },
  },
  required: [
    "financial_entity",
    "document_template",
    "transaction_direction",
    "amount",
    "currency",
    "receiver_name",
    "receiver_account",
    "receiver_identifier_type",
    "document_account",
    "credited_account",
    "merchant_point",
    "field_confidences",
    "field_evidence",
  ],
};

const TARGETED_RECOVERY_SCHEMA = {
  type: "OBJECT",
  properties: {
    financial_entity: { type: "STRING", enum: FINANCIAL_ENTITIES },
    document_template: { type: "STRING", enum: DOCUMENT_TEMPLATES },
    transaction_type: { type: "STRING", enum: TRANSACTION_TYPES },
    transaction_direction: { type: "STRING", enum: TRANSACTION_DIRECTIONS },
    amount: nullableNumber,
    currency: { type: "STRING", enum: ["YER", "SAR", "USD"], nullable: true },
    receiver_name: nullableString,
    receiver_account: nullableString,
    receiver_identifier_type: { type: "STRING", enum: IDENTIFIER_TYPES },
    parties: { type: "ARRAY", items: PARTY_SCHEMA },
    reference_number: nullableString,
    transaction_datetime: nullableString,
    transaction_time_present: { type: "BOOLEAN" },
    transaction_date_source: nullableString,
    confidence_score: { type: "NUMBER" },
    field_confidences: {
      type: "OBJECT",
      properties: {
        financial_entity: { type: "NUMBER" },
        transaction_type: { type: "NUMBER" },
        amount: { type: "NUMBER" },
        currency: { type: "NUMBER" },
        receiver_name: { type: "NUMBER" },
        receiver_account: { type: "NUMBER" },
        reference_number: { type: "NUMBER" },
        transaction_datetime: { type: "NUMBER" },
      },
    },
    field_evidence: {
      type: "OBJECT",
      properties: {
        financial_entity: nullableString,
        transaction_type: nullableString,
        amount: nullableString,
        currency: nullableString,
        receiver_name: nullableString,
        receiver_account: nullableString,
        reference_number: nullableString,
        transaction_datetime: nullableString,
      },
    },
  },
  required: [
    "financial_entity",
    "document_template",
    "transaction_type",
    "transaction_direction",
    "amount",
    "currency",
    "receiver_name",
    "receiver_account",
    "receiver_identifier_type",
    "parties",
    "reference_number",
    "transaction_datetime",
    "transaction_time_present",
    "transaction_date_source",
    "confidence_score",
    "field_confidences",
    "field_evidence",
  ],
};

function mustGetEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...RESPONSE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      Connection: "keep-alive",
    },
  });
}

function truncateText(value: unknown, max = 1200): string {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number): number {
  const delays = [0, 500, 1500];
  return delays[Math.min(attempt - 1, delays.length - 1)] ?? 1500;
}

function isRetryableGeminiStatus(status: number): boolean {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

function toLatinDigits(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return String(value)
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function cleanJsonText(text: string): string {
  return String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function cleanTextOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "null" || text === "—" || text === "-") {
    return null;
  }
  return text;
}

function cleanNumberLikeText(value: unknown): string | null {
  const text = cleanTextOrNull(value);
  if (!text) return null;
  const latin = toLatinDigits(text) ?? text;
  return latin.replace(/[^\dA-Za-z\-+._/]/g, "").trim() || null;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(lower)) return true;
    if (["false", "no", "0"].includes(lower)) return false;
  }
  return fallback;
}

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanTextOrNull(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 30);
}

function normalizeConfidence(value: unknown): number {
  const numeric = Number(toLatinDigits(value) ?? value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0;
}

function parseAmount(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const cleaned = String(toLatinDigits(value) ?? value)
    .replace(/,/g, "")
    .replace(/[^\d.]/g, "");
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const text = cleanTextOrNull(value) as T | null;
  return text && allowed.includes(text) ? text : fallback;
}

function normalizeCurrency(value: unknown): "YER" | "SAR" | "USD" | null {
  const text = cleanTextOrNull(value);
  if (!text) return null;
  const upper = (toLatinDigits(text) ?? text).toUpperCase();
  if (upper.includes("YER") || upper.includes("يمني")) return "YER";
  if (upper.includes("SAR") || upper.includes("سعودي")) return "SAR";
  if (upper.includes("USD") || upper.includes("دولار")) return "USD";
  return null;
}

function normalizeDatetime(value: unknown): string | null {
  const text = cleanTextOrNull(toLatinDigits(value));
  return text && /^\d{4}-\d{2}-\d{2}/.test(text) ? text : null;
}

function normalizeConfidenceMap(value: unknown): Record<string, number> {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(
    CONFIDENCE_FIELDS.map((field) => [field, normalizeConfidence(source[field])]),
  );
}

function normalizeEvidenceMap(value: unknown): Record<string, string | null> {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(
    CONFIDENCE_FIELDS.map((field) => [field, cleanTextOrNull(source[field])]),
  );
}


function normalizePartyIdentifier(value: unknown, fallbackEntity: string | null) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const type = enumValue(source.type, IDENTIFIER_TYPES, "unknown_identifier");
  const normalizedValue = cleanNumberLikeText(source.value);
  if (!normalizedValue) return null;
  const label = cleanTextOrNull(source.label);
  const labelText = (label || "").trim().toLowerCase();
  const evidence = cleanTextOrNull(source.evidence);
  let safeType = type;
  if (/^(بط|بطاقة|هوية)/.test(labelText)) safeType = "national_id";
  if (/^(ج|جواز)/.test(labelText)) safeType = "passport_number";
  return {
    type: safeType,
    value: normalizedValue,
    label,
    financial_entity: cleanTextOrNull(source.financial_entity) || fallbackEntity,
    confidence: normalizeConfidence(source.confidence),
    evidence,
  };
}

function normalizeParties(value: unknown, fallbackEntity: string | null) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((party) => party && typeof party === "object" && !Array.isArray(party))
    .map((party) => {
      const source = party as Record<string, unknown>;
      return {
        name: cleanTextOrNull(source.name),
        role: enumValue(source.role, PARTY_ROLES, "unknown"),
        identifiers: (Array.isArray(source.identifiers) ? source.identifiers : [])
          .map((identifier) => normalizePartyIdentifier(identifier, fallbackEntity))
          .filter((identifier): identifier is NonNullable<ReturnType<typeof normalizePartyIdentifier>> => identifier !== null)
          .slice(0, 12),
      };
    })
    .slice(0, 8);
}

function preferredPartyIdentifier(parties: ReturnType<typeof normalizeParties>) {
  const priority = [
    "financial_account_number",
    "unique_account_name",
    "national_id",
    "passport_number",
    "wallet_number",
    "phone_number",
  ];
  const target = parties.find((party) => ["credited_party", "receiver", "beneficiary"].includes(party.role))
    || parties.find((party) => party.identifiers.length > 0);
  if (!target) return null;
  return [...target.identifiers].sort((left, right) => {
    const order = priority.indexOf(left.type) - priority.indexOf(right.type);
    return order !== 0 ? order : right.confidence - left.confidence;
  })[0] || null;
}

function normalizeExtracted(extracted: any) {
  const isFinancial = normalizeBoolean(extracted?.is_financial_document, true);
  const normalizedEntity = isFinancial ? enumValue(extracted?.financial_entity, FINANCIAL_ENTITIES, "unknown") : null;
  const parties = isFinancial ? normalizeParties(extracted?.parties, normalizedEntity) : [];
  const preferredIdentifier = preferredPartyIdentifier(parties);
  const normalized = {
    is_financial_document: isFinancial,
    non_financial_reason: cleanTextOrNull(extracted?.non_financial_reason),
    summary: cleanTextOrNull(extracted?.summary),
    financial_entity: normalizedEntity,
    financial_entity_raw: cleanTextOrNull(extracted?.financial_entity_raw),
    document_template: enumValue(
      extracted?.document_template,
      DOCUMENT_TEMPLATES,
      "unknown",
    ),
    document_template_confidence: normalizeConfidence(
      extracted?.document_template_confidence,
    ),
    transaction_type: isFinancial
      ? enumValue(extracted?.transaction_type, TRANSACTION_TYPES, "unknown")
      : null,
    transaction_direction: isFinancial
      ? enumValue(
        extracted?.transaction_direction,
        TRANSACTION_DIRECTIONS,
        "unknown",
      )
      : "unknown",
    transaction_direction_confidence: normalizeConfidence(
      extracted?.transaction_direction_confidence,
    ),
    amount: isFinancial ? parseAmount(extracted?.amount) : null,
    currency: isFinancial ? normalizeCurrency(extracted?.currency) : null,
    sender_name: isFinancial ? cleanTextOrNull(extracted?.sender_name) : null,
    sender_account: isFinancial
      ? cleanNumberLikeText(extracted?.sender_account)
      : null,
    sender_identifier_type: enumValue(
      extracted?.sender_identifier_type,
      IDENTIFIER_TYPES,
      "unknown",
    ),
    receiver_name: isFinancial ? cleanTextOrNull(extracted?.receiver_name) : null,
    receiver_account: isFinancial
      ? (preferredIdentifier?.type === "financial_account_number" ? preferredIdentifier.value : cleanNumberLikeText(extracted?.receiver_account))
      : null,
    receiver_identifier_type: preferredIdentifier?.type || enumValue(
      extracted?.receiver_identifier_type,
      IDENTIFIER_TYPES,
      "unknown_identifier",
    ),
    parties,
    selected_party_identifier: preferredIdentifier,
    document_account: isFinancial
      ? cleanNumberLikeText(extracted?.document_account)
      : null,
    credited_account: isFinancial
      ? cleanNumberLikeText(extracted?.credited_account)
      : null,
    debited_account: isFinancial
      ? cleanNumberLikeText(extracted?.debited_account)
      : null,
    merchant_point: isFinancial
      ? cleanNumberLikeText(extracted?.merchant_point)
      : null,
    reference_number: isFinancial
      ? cleanNumberLikeText(extracted?.reference_number)
      : null,
    transaction_datetime: isFinancial
      ? normalizeDatetime(extracted?.transaction_datetime)
      : null,
    transaction_time_present: normalizeBoolean(
      extracted?.transaction_time_present,
      false,
    ),
    transaction_date_source: cleanTextOrNull(extracted?.transaction_date_source),
    multiple_operations_present: normalizeBoolean(
      extracted?.multiple_operations_present,
      false,
    ),
    selected_operation_position: Number.isInteger(
        Number(extracted?.selected_operation_position)
      )
      ? Math.max(1, Math.min(100, Number(extracted.selected_operation_position)))
      : null,
    confidence_score: normalizeConfidence(extracted?.confidence_score),
    field_confidences: normalizeConfidenceMap(extracted?.field_confidences),
    field_evidence: normalizeEvidenceMap(extracted?.field_evidence),
    possible_fraud: normalizeBoolean(extracted?.possible_fraud, false),
    ai_flags: normalizeArray(extracted?.ai_flags),
    missing_fields: normalizeArray(extracted?.missing_fields),
    visual_integrity_notes: normalizeArray(extracted?.visual_integrity_notes),
    sanad_attention_points: normalizeArray(extracted?.sanad_attention_points),
  };

  if (!isFinancial) {
    normalized.summary = normalized.summary || normalized.non_financial_reason ||
      "الملف لا يحتوي على عملية مالية واضحة.";
    if (!normalized.ai_flags.includes("non_financial_document")) {
      normalized.ai_flags.push("non_financial_document");
    }
  }
  if (normalized.financial_entity === "unknown" &&
    !normalized.ai_flags.includes("financial_entity_unknown")) {
    normalized.ai_flags.push("financial_entity_unknown");
  }
  if (normalized.financial_entity === "جهة أخرى" &&
    !normalized.ai_flags.includes("financial_entity_other")) {
    normalized.ai_flags.push("financial_entity_other");
  }
  for (const field of [
    "financial_entity",
    "transaction_type",
    "amount",
    "currency",
    "reference_number",
    "transaction_datetime",
  ]) {
    const value = (normalized as Record<string, unknown>)[field];
    if (isFinancial && (value == null || value === "" || value === "unknown") &&
      !normalized.missing_fields.includes(field)) {
      normalized.missing_fields.push(field);
    }
  }
  return normalized;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function extractGeminiText(gemini: any): string {
  const parts = gemini?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const text = parts.map((part: any) => part?.text || "").join("\n").trim();
    if (text) return text;
  }
  return typeof gemini?.text === "string" ? gemini.text : "";
}

function parseGeminiJson(text: string): any {
  const cleaned = cleanJsonText(text);
  const match = cleaned.match(/\{[\s\S]*\}/);
  const candidate = match?.[0] || cleaned;
  try {
    return JSON.parse(candidate);
  } catch (directError) {
    try {
      const repaired = jsonrepair(candidate);
      const parsed = JSON.parse(repaired);
      console.warn(JSON.stringify({
        function: FUNCTION_NAME,
        event: "gemini_json_repaired",
        direct_error: truncateText(
          directError instanceof Error ? directError.message : String(directError),
          300,
        ),
      }));
      return parsed;
    } catch (repairError) {
      throw new Error(
        `gemini_json_parse_failed: ${truncateText(
          repairError instanceof Error ? repairError.message : String(repairError),
          400,
        )}`,
      );
    }
  }
}

function buildFallbackSanadPrompt(): string {
  return `أعد JSON فقط. حلل الإشعار المالي دون اختراع. ميّز الجهة والقالب والاتجاه والمبلغ والعملة والمرسل والمستلم وحساباتهما وحساب رأس المستند والحساب الدائن والمدين ونقطة حاسب والمرجع والتاريخ. إذا كانت الشاشة بنفسجية وبها Haseb أو Haseb Payment فهي الكريمي حاسب. إذا وجدت عدة عمليات استخرج العملية العلوية فقط. لا تخلط رقم رأس الشاشة بالمرجع أو بحساب المستلم. استخدم null للقيمة غير الظاهرة، والأرقام اللاتينية فقط.`;
}

function buildFastRoutingPrompt(): string {
  return `أعد JSON فقط لاستخراج حقائق التوجيه السريع من الإشعار. لا تخترع. استخرج الجهة المالية والقالب واتجاه العملية والمبلغ والعملة واسم ورقم المستلم ونوع المعرّف وحساب رأس المستند والحساب الدائن ونقطة حاسب. القالب البنفسجي مع Haseb أو Haseb Payment هو الكريمي حاسب. لا تعتبر رقم رأس الشاشة حساب المستلم إلا إذا ربطه نص العملية صراحة. عند تعدد العمليات استخدم العملية العلوية فقط.`;
}

function buildTargetedRecoveryPrompt(primary: Record<string, unknown>, reasons: string[]): string {
  const compactPrimary = {
    financial_entity: primary.financial_entity ?? null,
    document_template: primary.document_template ?? null,
    transaction_type: primary.transaction_type ?? null,
    transaction_direction: primary.transaction_direction ?? null,
    amount: primary.amount ?? null,
    currency: primary.currency ?? null,
    receiver_name: primary.receiver_name ?? null,
    receiver_account: primary.receiver_account ?? null,
    parties: primary.parties ?? [],
    reference_number: primary.reference_number ?? null,
    transaction_datetime: primary.transaction_datetime ?? null,
  };
  return [
    "أعد JSON فقط وفق المخطط. هذه مراجعة مالية مستهدفة وليست تلخيصًا.",
    "استخرج الحقول الجوهرية من المستند الأصلي نفسه، ولا تعتمد على الملخص النصي وحده.",
    "صحح الحقول الناقصة أو الخاطئة فقط، ولا تخترع قيمة غير ظاهرة.",
    "إذا كان معرّف المستلم الحالي بطاقة أو هوية أو جوازًا، فابحث في سطر المستلم والأسطر المجاورة عن رقم الحساب المالي المستقل، خصوصًا الرقم المسبوق بكلمة رقم أو حساب.",
    "لا تُعد بط أو بطاقة أو هوية أو جواز حسابًا ماليًا، ولا تنهِ المراجعة قبل فحص وجود financial_account_number منفصل للطرف المستلم.",
    `أسباب المراجعة: ${reasons.join(" | ") || "quality_gate"}`,
    `النتيجة الأولية للمقارنة: ${JSON.stringify(compactPrimary)}`,
    buildExtractionV3Rules(),
  ].join("\n");
}

function supabaseHeaders(extra: HeadersInit = {}): HeadersInit {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

async function supabaseJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { ...supabaseHeaders(init.headers || {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`supabase_request_failed ${response.status}: ${truncateText(text, 800)}`);
  }
  return text ? JSON.parse(text) as T : null as T;
}

async function recordSpan(params: {
  operationId: string;
  runId: string;
  pipeline: "analysis" | "fast_routing";
  stage: string;
  status: "success" | "error" | "skipped";
  startedAtMs: number;
  metadata?: JsonRecord;
}): Promise<void> {
  const completedAtMs = Date.now();
  try {
    await supabaseJson("/rest/v1/rpc/service_record_operation_pipeline_span", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_operation_id: params.operationId,
        p_run_id: params.runId,
        p_pipeline: params.pipeline,
        p_stage: params.stage,
        p_status: params.status,
        p_function_name: FUNCTION_NAME,
        p_started_at: new Date(params.startedAtMs).toISOString(),
        p_completed_at: new Date(completedAtMs).toISOString(),
        p_duration_ms: Math.max(0, completedAtMs - params.startedAtMs),
        p_metadata: params.metadata || {},
      }),
    });
  } catch (error) {
    console.error(JSON.stringify({
      function: FUNCTION_NAME,
      event: "pipeline_span_write_failed",
      stage: params.stage,
      error: truncateText(error instanceof Error ? error.message : String(error), 500),
    }));
  }
}

async function getActivePrompt(): Promise<{
  promptText: string;
  promptSource: "database" | "fallback";
  promptKey: string;
  promptVersion: number | null;
}> {
  try {
    const rows = await supabaseJson<any[]>(
      `/rest/v1/ai_prompts?select=prompt_text,prompt_key,version&prompt_key=eq.${encodeURIComponent(SANAD_PROMPT_KEY)}&is_active=eq.true&order=version.desc&limit=1`,
      { method: "GET", headers: { Accept: "application/json" } },
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (typeof row?.prompt_text === "string" && row.prompt_text.trim().length > 500) {
      return {
        promptText: row.prompt_text,
        promptSource: "database",
        promptKey: row.prompt_key || SANAD_PROMPT_KEY,
        promptVersion: Number.isFinite(Number(row.version)) ? Number(row.version) : null,
      };
    }
  } catch {
    // Built-in fallback preserves availability if prompt lookup fails.
  }
  return {
    promptText: buildFallbackSanadPrompt(),
    promptSource: "fallback",
    promptKey: SANAD_PROMPT_KEY,
    promptVersion: null,
  };
}

async function getOperation(operationId: string): Promise<any | null> {
  const rows = await supabaseJson<any[]>(
    `/rest/v1/operations?select=*&id=eq.${encodeURIComponent(operationId)}&limit=1`,
    { method: "GET", headers: { Accept: "application/json" } },
  );
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function patchOperation(operationId: string, patch: JsonRecord): Promise<any[]> {
  return await supabaseJson<any[]>(
    `/rest/v1/operations?id=eq.${encodeURIComponent(operationId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(patch),
    },
  );
}

async function markOperationRunning(operationId: string): Promise<any[]> {
  return await supabaseJson<any[]>(
    `/rest/v1/operations?id=eq.${encodeURIComponent(operationId)}&ai_status=not.in.(running,completed)`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ ai_status: "running", ai_error: null }),
    },
  );
}

async function insertEvent(
  operationId: string,
  eventType: "ai_started" | "ai_completed" | "ai_failed",
  metadata: JsonRecord,
): Promise<void> {
  await supabaseJson("/rest/v1/operation_events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      operation_id: operationId,
      event_type: eventType,
      metadata,
      source: "edge-function",
    }),
  });
}

async function downloadStorageObject(
  bucket: string,
  filePath: string,
): Promise<Uint8Array> {
  const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, "/");
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodedPath}`,
    { method: "GET", headers: supabaseHeaders() },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`storage_download_failed ${response.status}: ${truncateText(text, 800)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function callGemini(params: {
  model: string;
  mimeType: string;
  base64: string;
  promptText: string;
  responseSchema: JsonRecord;
  maxAttempts: number;
}): Promise<{
  gemini: any;
  rawText: string;
  extracted: any;
  attempts: number;
  durationMs: number;
}> {
  const payload = {
    contents: [{
      role: "user",
      parts: [
        { text: params.promptText },
        { inline_data: { mime_type: params.mimeType, data: params.base64 } },
      ],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseSchema: params.responseSchema,
    },
  };
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const startedAtMs = Date.now();
  let lastError = "gemini_request_failed";
  for (let attempt = 1; attempt <= params.maxAttempts; attempt += 1) {
    const delay = retryDelayMs(attempt);
    if (delay > 0) await sleep(delay);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const responseText = await response.text();
      if (!response.ok) {
        lastError =
          `gemini_request_failed ${response.status} attempt ${attempt}/${params.maxAttempts}: ${truncateText(responseText, 1000)}`;
        if (attempt < params.maxAttempts && isRetryableGeminiStatus(response.status)) {
          continue;
        }
        throw new Error(lastError);
      }
      const gemini = JSON.parse(responseText);
      const rawText = extractGeminiText(gemini);
      if (!rawText) {
        lastError = `empty_gemini_response attempt ${attempt}/${params.maxAttempts}`;
        if (attempt < params.maxAttempts) continue;
        throw new Error(lastError);
      }
      return {
        gemini,
        rawText,
        extracted: parseGeminiJson(rawText),
        attempts: attempt,
        durationMs: Date.now() - startedAtMs,
      };
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      lastError = aborted
        ? `gemini_timeout_after_${GEMINI_REQUEST_TIMEOUT_MS}ms attempt ${attempt}/${params.maxAttempts}`
        : error instanceof Error
          ? error.message
          : String(error);
      const retryableParseFailure = lastError.includes("gemini_json_parse_failed");
      if (
        attempt >= params.maxAttempts ||
        (!aborted && !retryableParseFailure && !lastError.includes("429") && !lastError.includes("50"))
      ) {
        throw new Error(lastError);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(lastError);
}

async function runFastExtraction(params: {
  operationId: string;
  runId: string;
  mimeType: string;
  base64: string;
}): Promise<void> {
  const startedAtMs = Date.now();
  if (!ENABLE_FAST_ROUTING_PASS) {
    await recordSpan({
      operationId: params.operationId,
      runId: params.runId,
      pipeline: "fast_routing",
      stage: "fast_extract",
      status: "skipped",
      startedAtMs,
      metadata: { reason: "ENABLE_FAST_ROUTING_PASS=false" },
    });
    return;
  }
  try {
    const result = await callGemini({
      model: GEMINI_FAST_MODEL,
      mimeType: params.mimeType,
      base64: params.base64,
      promptText: buildFastRoutingPrompt(),
      responseSchema: FAST_RESPONSE_SCHEMA,
      maxAttempts: 1,
    });
    await supabaseJson("/rest/v1/rpc/service_record_fast_routing_extraction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_operation_id: params.operationId,
        p_run_id: params.runId,
        p_extractor_version: FAST_EXTRACTOR_VERSION,
        p_model: GEMINI_FAST_MODEL,
        p_status: "completed",
        p_payload: result.extracted,
        p_duration_ms: result.durationMs,
        p_error_message: null,
      }),
    });
    await recordSpan({
      operationId: params.operationId,
      runId: params.runId,
      pipeline: "fast_routing",
      stage: "fast_extract",
      status: "success",
      startedAtMs,
      metadata: { model: GEMINI_FAST_MODEL, attempts: result.attempts },
    });
  } catch (error) {
    const message = truncateText(error instanceof Error ? error.message : String(error));
    try {
      await supabaseJson("/rest/v1/rpc/service_record_fast_routing_extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_operation_id: params.operationId,
          p_run_id: params.runId,
          p_extractor_version: FAST_EXTRACTOR_VERSION,
          p_model: GEMINI_FAST_MODEL,
          p_status: "failed",
          p_payload: {},
          p_duration_ms: Date.now() - startedAtMs,
          p_error_message: message,
        }),
      });
    } catch {
      // The primary analysis remains independent from fast extraction telemetry.
    }
    await recordSpan({
      operationId: params.operationId,
      runId: params.runId,
      pipeline: "fast_routing",
      stage: "fast_extract",
      status: "error",
      startedAtMs,
      metadata: { error: message, model: GEMINI_FAST_MODEL },
    });
  }
}

Deno.serve(async (req: Request) => {
  let operationId: string | null = null;
  let operationStarted = false;
  let runId: string | null = null;
  let analysisStartedAtMs = Date.now();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: RESPONSE_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }
  const internalKey = req.headers.get("x-sanad-internal-key");
  if (!internalKey || internalKey !== SANAD_INTERNAL_API_KEY) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    operationId = cleanTextOrNull((body as any)?.operation_id ?? (body as any)?.id);
    if (!operationId) {
      return jsonResponse({ ok: false, error: "missing_operation_id" }, 400);
    }
    const operation = await getOperation(operationId);
    if (!operation?.id) {
      return jsonResponse({ ok: false, error: "operation_not_found", operation_id: operationId }, 404);
    }
    if (!operation.file_path) {
      return jsonResponse({ ok: false, error: "operation_missing_file_path", operation_id: operation.id }, 400);
    }
    if (operation.original_file_status !== "stored") {
      return jsonResponse({
        ok: false,
        error: "original_file_not_stored",
        operation_id: operation.id,
        original_file_status: operation.original_file_status,
      }, 400);
    }
    if (operation.ai_status === "completed") {
      return jsonResponse({
        ok: true,
        skipped: true,
        reason: "already_completed",
        operation_id: operation.id,
        public_token: operation.public_token,
        ai_status: operation.ai_status,
      });
    }
    if (operation.ai_status === "running") {
      return jsonResponse({
        ok: true,
        skipped: true,
        reason: "already_running",
        operation_id: operation.id,
        public_token: operation.public_token,
        ai_status: operation.ai_status,
      }, 202);
    }

    const runningRows = await markOperationRunning(operation.id);
    if (!Array.isArray(runningRows) || runningRows.length === 0) {
      const latest = await getOperation(operation.id);
      return jsonResponse({
        ok: true,
        skipped: true,
        reason: "status_changed_before_lock",
        operation_id: operation.id,
        ai_status: latest?.ai_status ?? null,
      }, latest?.ai_status === "running" ? 202 : 200);
    }

    operationStarted = true;
    runId = crypto.randomUUID();
    analysisStartedAtMs = Date.now();
    await insertEvent(operation.id, "ai_started", {
      function: FUNCTION_NAME,
      model: GEMINI_MODEL,
      source: "edge-function",
      pipeline_run_id: runId,
      response_schema: "strict-v2",
      gemini_max_attempts: GEMINI_MAX_ATTEMPTS,
      gemini_timeout_ms: GEMINI_REQUEST_TIMEOUT_MS,
      fast_routing_enabled: ENABLE_FAST_ROUTING_PASS,
      file_bucket: operation.file_bucket || DEFAULT_BUCKET,
      file_path: operation.file_path,
    });

    const prepareStartedAtMs = Date.now();
    const bucket = operation.file_bucket || DEFAULT_BUCKET;
    const mimeType = operation.file_mime_type || "application/octet-stream";
    const [promptInfo, fileBytes] = await Promise.all([
      getActivePrompt(),
      downloadStorageObject(bucket, operation.file_path),
    ]);
    const base64 = bytesToBase64(fileBytes);
    await recordSpan({
      operationId: operation.id,
      runId,
      pipeline: "analysis",
      stage: "prompt_and_file_prepare",
      status: "success",
      startedAtMs: prepareStartedAtMs,
      metadata: {
        prompt_source: promptInfo.promptSource,
        prompt_version: promptInfo.promptVersion,
        file_bytes: fileBytes.byteLength,
      },
    });

    const fastTask = runFastExtraction({
      operationId: operation.id,
      runId,
      mimeType,
      base64,
    });
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(fastTask);
    }

    const geminiStartedAtMs = Date.now();
    const result = await callGemini({
      model: GEMINI_MODEL,
      mimeType,
      base64,
      promptText: promptInfo.promptText,
      responseSchema: FULL_RESPONSE_SCHEMA,
      maxAttempts: GEMINI_MAX_ATTEMPTS,
    });
    await recordSpan({
      operationId: operation.id,
      runId,
      pipeline: "analysis",
      stage: "gemini_generate",
      status: "success",
      startedAtMs: geminiStartedAtMs,
      metadata: {
        model: GEMINI_MODEL,
        attempts: result.attempts,
        timeout_ms: GEMINI_REQUEST_TIMEOUT_MS,
      },
    });

    let normalized = normalizeExtracted(result.extracted);
    const primaryNormalized = normalized;
    const primaryAssessment = assessCoreExtraction(primaryNormalized);
    let recoveryResult: Awaited<ReturnType<typeof callGemini>> | null = null;
    let reconciliation = reconcileExtraction(primaryNormalized);

    if (primaryAssessment.escalationReasons.length > 0) {
      const recoveryStartedAtMs = Date.now();
      try {
        recoveryResult = await callGemini({
          model: GEMINI_RECOVERY_MODEL,
          mimeType,
          base64,
          promptText: buildTargetedRecoveryPrompt(primaryNormalized, primaryAssessment.escalationReasons),
          responseSchema: TARGETED_RECOVERY_SCHEMA,
          maxAttempts: 1,
        });
        const recoveryCandidate = normalizeExtracted({
          ...primaryNormalized,
          ...recoveryResult.extracted,
          is_financial_document: primaryNormalized.is_financial_document,
          field_confidences: {
            ...primaryNormalized.field_confidences,
            ...(recoveryResult.extracted?.field_confidences || {}),
          },
          field_evidence: {
            ...primaryNormalized.field_evidence,
            ...(recoveryResult.extracted?.field_evidence || {}),
          },
          parties: recoveryResult.extracted?.parties || primaryNormalized.parties,
          ai_flags: primaryNormalized.ai_flags,
          missing_fields: primaryNormalized.missing_fields,
          visual_integrity_notes: primaryNormalized.visual_integrity_notes,
          sanad_attention_points: primaryNormalized.sanad_attention_points,
        });
        reconciliation = reconcileExtraction(primaryNormalized, recoveryCandidate);
        // Re-run canonical normalization so the compatibility projection follows
        // the reconciled party identifiers rather than stale scalar fields.
        normalized = normalizeExtracted(reconciliation.selected);
        await recordSpan({
          operationId: operation.id,
          runId,
          pipeline: "analysis",
          stage: "targeted_recovery",
          status: "success",
          startedAtMs: recoveryStartedAtMs,
          metadata: {
            model: GEMINI_RECOVERY_MODEL,
            attempts: recoveryResult.attempts,
            reasons: primaryAssessment.escalationReasons,
            conflicts: reconciliation.conflicts,
          },
        });
      } catch (recoveryError) {
        await recordSpan({
          operationId: operation.id,
          runId,
          pipeline: "analysis",
          stage: "targeted_recovery",
          status: "error",
          startedAtMs: recoveryStartedAtMs,
          metadata: {
            model: GEMINI_RECOVERY_MODEL,
            reasons: primaryAssessment.escalationReasons,
            error: truncateText(recoveryError instanceof Error ? recoveryError.message : String(recoveryError), 800),
          },
        });
      }
    }

    const finalAssessment = assessCoreExtraction(normalized);
    const reviewRequired = reconciliation.reviewRequired === true || !finalAssessment.complete;
    if (reviewRequired && !normalized.ai_flags.includes("extraction_review_required")) {
      normalized.ai_flags.push("extraction_review_required");
    }
    normalized.missing_fields = finalAssessment.missing;
    normalized.confidence_score = finalAssessment.confidence;

    const persistStartedAtMs = Date.now();
    await patchOperation(operation.id, {
      status: operation.status === "verified" ? "verified" : "ready",
      ai_status: "completed",
      ai_model: GEMINI_MODEL,
      ai_error: null,
      summary: normalized.summary,
      structured_data: normalized,
      raw_ai_json: {
        extracted: result.extracted,
        normalized,
        raw_gemini_text: result.rawText,
        model: GEMINI_MODEL,
        prompt_key: promptInfo.promptKey,
        prompt_version: promptInfo.promptVersion,
        prompt_source: promptInfo.promptSource,
        prompt_length: promptInfo.promptText.length,
        gemini_attempts: result.attempts,
        pipeline_run_id: runId,
        response_schema: "strict-v2",
        extraction_pipeline_version: EXTRACTION_PIPELINE_VERSION,
        extraction_quality: {
          primary: primaryAssessment,
          final: finalAssessment,
          recovery_model: recoveryResult ? GEMINI_RECOVERY_MODEL : null,
          recovery_attempts: recoveryResult?.attempts ?? 0,
          reconciliation_source: reconciliation.source,
          conflicts: reconciliation.conflicts,
          unresolved_conflicts: reconciliation.unresolvedConflicts || [],
          selected_identifier: finalAssessment.selectedIdentifier,
          unique_identifier_count: finalAssessment.uniqueIdentifierCount,
          review_required: reviewRequired,
        },
        gemini_metadata: {
          finish_reason: result.gemini?.candidates?.[0]?.finishReason || null,
          usage_metadata: result.gemini?.usageMetadata || null,
        },
      },
      financial_entity: normalized.financial_entity,
      transaction_type: normalized.transaction_type,
      amount: normalized.amount,
      currency: normalized.currency,
      receiver_name: normalized.receiver_name,
      receiver_account: normalized.receiver_account,
      receiver_identifier_type: normalized.receiver_identifier_type,
      reference_number: normalized.reference_number,
      transaction_datetime: normalized.transaction_datetime,
      confidence_score: normalized.confidence_score,
      ai_confidence_score: normalized.confidence_score,
      sanad_confidence_score: finalAssessment.confidence,
      sanad_review_status: reviewRequired ? "needs_review" : "not_required",
      sanad_risk_level: reviewRequired ? "medium" : "low",
      possible_fraud: normalized.possible_fraud,
      sanad_warnings: normalized.ai_flags,
      missing_fields: finalAssessment.missing,
      visual_integrity_notes: normalized.visual_integrity_notes,
      sanad_attention_points: normalized.sanad_attention_points,
    });
    await recordSpan({
      operationId: operation.id,
      runId,
      pipeline: "analysis",
      stage: "persist_and_shadow",
      status: "success",
      startedAtMs: persistStartedAtMs,
      metadata: { trigger_includes_shadow_routing: true },
    });

    await insertEvent(operation.id, "ai_completed", {
      function: FUNCTION_NAME,
      model: GEMINI_MODEL,
      prompt_key: promptInfo.promptKey,
      prompt_version: promptInfo.promptVersion,
      prompt_source: promptInfo.promptSource,
      gemini_attempts: result.attempts,
      pipeline_run_id: runId,
      schema_enforced: true,
      extraction_pipeline_version: EXTRACTION_PIPELINE_VERSION,
      quality_complete: finalAssessment.complete,
      review_required: reviewRequired,
      recovery_used: Boolean(recoveryResult),
      confidence_score: normalized.confidence_score,
      financial_entity: normalized.financial_entity,
      amount: normalized.amount,
      currency: normalized.currency,
      reference_number: normalized.reference_number,
      timings: {
        gemini_ms: result.durationMs,
        total_ms: Date.now() - analysisStartedAtMs,
      },
    });
    await recordSpan({
      operationId: operation.id,
      runId,
      pipeline: "analysis",
      stage: "analysis_total",
      status: "success",
      startedAtMs: analysisStartedAtMs,
      metadata: {
        model: GEMINI_MODEL,
        attempts: result.attempts,
        schema_enforced: true,
        extraction_pipeline_version: EXTRACTION_PIPELINE_VERSION,
        quality_complete: finalAssessment.complete,
        review_required: reviewRequired,
        recovery_used: Boolean(recoveryResult),
        selected_identifier: finalAssessment.selectedIdentifier,
      },
    });

    return jsonResponse({
      ok: true,
      operation_id: operation.id,
      public_token: operation.public_token,
      ai_status: "completed",
      pipeline_run_id: runId,
      prompt: {
        key: promptInfo.promptKey,
        version: promptInfo.promptVersion,
        source: promptInfo.promptSource,
      },
      gemini_attempts: result.attempts,
      duration_ms: Date.now() - analysisStartedAtMs,
      summary: normalized.summary,
      quality: {
        pipeline_version: EXTRACTION_PIPELINE_VERSION,
        primary: primaryAssessment,
        final: finalAssessment,
        review_required: reviewRequired,
        recovery_used: Boolean(recoveryResult),
        recovery_model: recoveryResult ? GEMINI_RECOVERY_MODEL : null,
        conflicts: reconciliation.conflicts,
      },
      normalized,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (operationId && operationStarted) {
      try {
        await patchOperation(operationId, {
          ai_status: "failed",
          ai_error: truncateText(message, 1500),
        });
        await insertEvent(operationId, "ai_failed", {
          function: FUNCTION_NAME,
          source: "edge-function",
          error: truncateText(message, 1500),
          pipeline_run_id: runId,
          gemini_max_attempts: GEMINI_MAX_ATTEMPTS,
          gemini_timeout_ms: GEMINI_REQUEST_TIMEOUT_MS,
        });
        if (runId) {
          await recordSpan({
            operationId,
            runId,
            pipeline: "analysis",
            stage: "analysis_total",
            status: "error",
            startedAtMs: analysisStartedAtMs,
            metadata: { error: truncateText(message, 1000) },
          });
        }
      } catch {
        // Failure reporting is best effort and must not hide the original error.
      }
    }
    return jsonResponse({
      ok: false,
      operation_id: operationId,
      pipeline_run_id: runId,
      error: "analysis_failed",
      message: truncateText(message, 1500),
    }, 500);
  }
});
