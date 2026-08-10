import type {
  LocalExtractionDocument,
  OcrExtractionResult,
  OcrProvider,
  OcrTextBlock,
} from "./contracts.ts";

export interface HttpOcrProviderOptions {
  baseUrl: string;
  timeoutMs?: number;
  token?: string;
  providerName?: string;
}

interface SidecarResponse {
  provider: string;
  raw_text: string;
  confidence: number;
  duration_ms: number;
  blocks: Array<{
    text: string;
    confidence: number;
    page?: number;
    bbox?: { x: number; y: number; width: number; height: number };
  }>;
  warnings?: string[];
}

const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export class HttpOcrProvider implements OcrProvider {
  readonly name: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #token?: string;

  constructor(options: HttpOcrProviderOptions) {
    this.name = options.providerName ?? "sanad-local-ocr-http";
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#timeoutMs = Math.max(250, options.timeoutMs ?? 8_000);
    this.#token = options.token;
  }

  supports(mimeType: string): boolean {
    return SUPPORTED_MIME_TYPES.has(mimeType.toLowerCase());
  }

  async extract(document: LocalExtractionDocument): Promise<OcrExtractionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    const headers = new Headers({
      "content-type": document.mimeType,
      "x-sanad-filename": document.fileName ?? "document",
    });
    if (document.operationId) headers.set("x-sanad-operation-id", document.operationId);
    if (this.#token) headers.set("authorization", `Bearer ${this.#token}`);

    try {
      const response = await fetch(`${this.#baseUrl}/v1/ocr`, {
        method: "POST",
        headers,
        body: document.bytes,
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`ocr_sidecar_http_${response.status}:${detail.slice(0, 300)}`);
      }

      const payload = await response.json() as SidecarResponse;
      if (!payload || typeof payload.raw_text !== "string" || !Array.isArray(payload.blocks)) {
        throw new Error("ocr_sidecar_invalid_response_contract");
      }

      return {
        provider: payload.provider || this.name,
        rawText: payload.raw_text,
        confidence: clamp(payload.confidence),
        durationMs: Number.isFinite(payload.duration_ms) ? payload.duration_ms : 0,
        blocks: payload.blocks.map(normalizeBlock),
        warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`ocr_sidecar_timeout_${this.#timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeBlock(block: SidecarResponse["blocks"][number]): OcrTextBlock {
  return {
    text: String(block.text ?? ""),
    confidence: clamp(block.confidence),
    page: Number.isInteger(block.page) ? block.page : undefined,
    bbox: block.bbox && [block.bbox.x, block.bbox.y, block.bbox.width, block.bbox.height].every(Number.isFinite)
      ? {
        x: block.bbox.x,
        y: block.bbox.y,
        width: block.bbox.width,
        height: block.bbox.height,
      }
      : undefined,
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
