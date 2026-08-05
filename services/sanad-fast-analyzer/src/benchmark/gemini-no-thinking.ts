import type { CoreFinancialExtraction } from "../contracts.ts";
import type { BenchmarkCase, BenchmarkEngine, EngineExecution } from "./contracts.ts";

const DEFAULT_MODEL = "gemini-2.5-flash";

const CORE_SCHEMA = {
  type: "OBJECT",
  properties: {
    financialEntity: { type: "STRING" },
    templateCode: { type: "STRING" },
    transactionType: { type: "STRING" },
    transactionDirection: { type: "STRING" },
    amount: { type: "NUMBER", nullable: true },
    currency: { type: "STRING", nullable: true },
    documentReference: { type: "STRING", nullable: true },
    transactionDatetime: { type: "STRING", nullable: true },
    parties: { type: "ARRAY", items: { type: "OBJECT" } },
    confidence: { type: "NUMBER" },
    fieldConfidence: { type: "OBJECT" },
    warnings: { type: "ARRAY", items: { type: "STRING" } },
    reviewRequired: { type: "BOOLEAN" },
  },
  required: [
    "financialEntity",
    "templateCode",
    "transactionType",
    "transactionDirection",
    "amount",
    "currency",
    "documentReference",
    "transactionDatetime",
    "parties",
    "confidence",
    "fieldConfidence",
    "warnings",
    "reviewRequired",
  ],
};

export interface GeminiNoThinkingOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  prompt?: string;
  fetchImpl?: typeof fetch;
}

export function buildGeminiNoThinkingPayload(
  input: BenchmarkCase,
  bytesBase64: string,
  prompt?: string,
) {
  return {
    contents: [{
      role: "user",
      parts: [
        {
          text: prompt ??
            "Extract the core financial fields from this Yemeni financial document. Return only JSON matching the supplied schema. Preserve account, card, passport, phone, wallet, merchant-point, document-reference, and transfer-reference roles without interchanging them.",
        },
        {
          inlineData: {
            mimeType: input.input.mimeType,
            data: bytesBase64,
          },
        },
      ],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      responseSchema: CORE_SCHEMA,
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function parseResponseText(body: Record<string, unknown>): string | undefined {
  const candidates = body.candidates;
  if (!Array.isArray(candidates)) return undefined;
  const first = candidates[0] as Record<string, unknown> | undefined;
  const content = first?.content as Record<string, unknown> | undefined;
  const parts = content?.parts;
  if (!Array.isArray(parts)) return undefined;
  const textPart = parts.find((part) =>
    typeof part === "object" && part !== null && typeof (part as Record<string, unknown>).text === "string"
  ) as Record<string, unknown> | undefined;
  return typeof textPart?.text === "string" ? textPart.text : undefined;
}

export class GeminiNoThinkingEngine implements BenchmarkEngine {
  readonly name = "gemini_2_5_flash_no_thinking";
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GeminiNoThinkingOptions) {
    this.model = options.model ?? DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? 22_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async execute(input: BenchmarkCase): Promise<EngineExecution> {
    const startedAt = new Date().toISOString();
    const started = performance.now();

    if (!input.input.privateArtifactRef) {
      return {
        engine: this.name,
        caseId: input.id,
        startedAt,
        durationMs: performance.now() - started,
        error: "private_artifact_ref_required",
      };
    }

    try {
      const bytes = await Deno.readFile(input.input.privateArtifactRef);
      const payload = buildGeminiNoThinkingPayload(
        input,
        bytesToBase64(bytes),
        this.options.prompt,
      );
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.options.apiKey,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          },
        );
      } finally {
        clearTimeout(timeout);
      }

      const body = await response.json() as Record<string, unknown>;
      const durationMs = performance.now() - started;
      if (!response.ok) {
        return {
          engine: this.name,
          caseId: input.id,
          startedAt,
          durationMs,
          error: `gemini_http_${response.status}`,
          metadata: { model: this.model, thinkingBudget: 0, externalCallPerformed: true },
        };
      }

      const rawText = parseResponseText(body);
      if (!rawText) {
        return {
          engine: this.name,
          caseId: input.id,
          startedAt,
          durationMs,
          error: "gemini_response_text_missing",
          metadata: { model: this.model, thinkingBudget: 0, externalCallPerformed: true },
        };
      }

      let extraction: CoreFinancialExtraction;
      try {
        extraction = JSON.parse(rawText) as CoreFinancialExtraction;
      } catch {
        return {
          engine: this.name,
          caseId: input.id,
          startedAt,
          durationMs,
          error: "gemini_invalid_json",
          metadata: { model: this.model, thinkingBudget: 0, externalCallPerformed: true },
        };
      }

      const usage = (body.usageMetadata ?? {}) as Record<string, unknown>;
      const thoughtsTokenCount = Number(usage.thoughtsTokenCount ?? 0) || 0;
      return {
        engine: this.name,
        caseId: input.id,
        startedAt,
        durationMs,
        extraction,
        metadata: {
          model: this.model,
          thinkingBudget: 0,
          thoughtsTokenCount,
          promptTokenCount: Number(usage.promptTokenCount ?? 0) || 0,
          candidatesTokenCount: Number(usage.candidatesTokenCount ?? 0) || 0,
          totalTokenCount: Number(usage.totalTokenCount ?? 0) || 0,
          thinkingDisabledConfirmed: thoughtsTokenCount === 0,
          externalCallPerformed: true,
        },
      };
    } catch (error) {
      return {
        engine: this.name,
        caseId: input.id,
        startedAt,
        durationMs: performance.now() - started,
        error: error instanceof DOMException && error.name === "AbortError"
          ? "gemini_timeout"
          : `gemini_adapter_error:${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
