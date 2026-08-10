import { analyzeLocalDocument } from "./local-extraction/engine.ts";
import { HttpOcrProvider } from "./local-extraction/http-ocr-provider.ts";

class Semaphore {
  #available: number;
  #waiters: Array<(release: () => void) => void> = [];

  constructor(capacity: number) {
    this.#available = capacity;
  }

  acquire(): Promise<() => void> {
    if (this.#available > 0) {
      this.#available -= 1;
      return Promise.resolve(() => this.release());
    }
    return new Promise((resolve) => this.#waiters.push(resolve));
  }

  private release(): void {
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter(() => this.release());
      return;
    }
    this.#available += 1;
  }
}

const PORT = intEnv("SANAD_LOCAL_ANALYZER_PORT", 8090, 1, 65535);
const MAX_BODY_BYTES = intEnv("SANAD_LOCAL_ANALYZER_MAX_BODY_BYTES", 12 * 1024 * 1024, 1024, 50 * 1024 * 1024);
const CONCURRENCY = intEnv("SANAD_LOCAL_ANALYZER_CONCURRENCY", 2, 1, 16);
const REQUEST_TIMEOUT_MS = intEnv("SANAD_LOCAL_ANALYZER_TIMEOUT_MS", 10_000, 500, 60_000);
const OCR_TIMEOUT_MS = intEnv("SANAD_LOCAL_OCR_TIMEOUT_MS", 8_000, 250, 60_000);
const MINIMUM_ACCEPT_CONFIDENCE = floatEnv("SANAD_LOCAL_MIN_ACCEPT_CONFIDENCE", 0.98, 0, 1);
const TOKEN = Deno.env.get("SANAD_LOCAL_ANALYZER_TOKEN")?.trim() || undefined;
const OCR_URL = Deno.env.get("SANAD_LOCAL_OCR_URL")?.trim() || "http://127.0.0.1:8091";
const OCR_TOKEN = Deno.env.get("SANAD_OCR_TOKEN")?.trim() || undefined;

const ocrProvider = new HttpOcrProvider({
  baseUrl: OCR_URL,
  timeoutMs: OCR_TIMEOUT_MS,
  token: OCR_TOKEN,
  providerName: "sanad-paddleocr-sidecar",
});
const gate = new Semaphore(CONCURRENCY);

console.log(JSON.stringify({
  event: "sanad_local_analyzer_start",
  port: PORT,
  concurrency: CONCURRENCY,
  maxBodyBytes: MAX_BODY_BYTES,
  timeoutMs: REQUEST_TIMEOUT_MS,
  minimumAcceptConfidence: MINIMUM_ACCEPT_CONFIDENCE,
  ocrUrl: OCR_URL,
}));

Deno.serve({ hostname: "0.0.0.0", port: PORT }, async (request) => {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health/live") {
    return json({ ok: true, service: "sanad-local-analyzer", status: "live" });
  }

  if (request.method === "GET" && url.pathname === "/health/ready") {
    const ocr = await checkOcrReadiness();
    return json({
      ok: ocr.ok,
      service: "sanad-local-analyzer",
      status: ocr.ok ? "ready" : "degraded",
      ocr,
    }, ocr.ok ? 200 : 503);
  }

  if (request.method !== "POST" || url.pathname !== "/v1/analyze") {
    return json({ ok: false, error: "not_found" }, 404);
  }

  if (!authorized(request)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const mimeType = normalizeMime(request.headers.get("content-type"));
  if (!ocrProvider.supports(mimeType) && mimeType !== "application/pdf") {
    return json({ ok: false, error: "unsupported_media_type", mimeType }, 415);
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "payload_too_large", maxBodyBytes: MAX_BODY_BYTES }, 413);
  }

  const release = await gate.acquire();
  const started = performance.now();
  const operationId = request.headers.get("x-sanad-operation-id")?.trim() || undefined;
  const fileName = sanitizeFileName(request.headers.get("x-sanad-filename"));

  try {
    const bytes = await readBodyBounded(request, MAX_BODY_BYTES);
    const result = await withTimeout(
      analyzeLocalDocument({ bytes, mimeType, fileName, operationId }, {
        ocrProvider,
        minimumAcceptConfidence: MINIMUM_ACCEPT_CONFIDENCE,
      }),
      REQUEST_TIMEOUT_MS,
    );

    console.log(JSON.stringify({
      event: "sanad_local_analyzer_request",
      operationId: operationId ?? null,
      mimeType,
      bytes: bytes.byteLength,
      status: result.status,
      confidence: result.confidence,
      fallbackRecommended: result.fallbackRecommended,
      fallbackReason: result.fallbackReason ?? null,
      parser: result.diagnostics.parser ?? null,
      totalMs: Number((performance.now() - started).toFixed(3)),
    }));

    return json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "payload_too_large" ? 413 : message === "analysis_timeout" ? 504 : 500;
    console.error(JSON.stringify({
      event: "sanad_local_analyzer_error",
      operationId: operationId ?? null,
      mimeType,
      error: message,
      totalMs: Number((performance.now() - started).toFixed(3)),
    }));
    return json({ ok: false, error: message }, status);
  } finally {
    release();
  }
});

function authorized(request: Request): boolean {
  if (!TOKEN) return true;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${TOKEN}`;
}

async function checkOcrReadiness(): Promise<{ ok: boolean; status?: number; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const headers = new Headers();
    if (OCR_TOKEN) headers.set("authorization", `Bearer ${OCR_TOKEN}`);
    const response = await fetch(`${OCR_URL.replace(/\/+$/, "")}/health/ready`, {
      headers,
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function readBodyBounded(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("payload_too_large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("analysis_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function normalizeMime(value: string | null): string {
  const first = (value || "application/octet-stream").split(";", 1)[0] ?? "application/octet-stream";
  return first.trim().toLowerCase();
}

function sanitizeFileName(value: string | null): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[\r\n\0]/g, "").slice(0, 180).trim();
  return cleaned || undefined;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(Deno.env.get(name) ?? fallback);
  if (!Number.isInteger(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function floatEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(Deno.env.get(name) ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
