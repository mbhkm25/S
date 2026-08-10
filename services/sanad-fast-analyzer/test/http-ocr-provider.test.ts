import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { HttpOcrProvider } from "../src/local-extraction/http-ocr-provider.ts";

Deno.test("HTTP OCR provider maps sidecar response into SANAD OCR contract", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({
    provider: "paddleocr:PP-OCRv5:ar:paddle_static",
    raw_text: "إشعار إيداع\n#350# سعودي",
    confidence: 0.97,
    duration_ms: 33.2,
    blocks: [{
      text: "إشعار إيداع",
      confidence: 0.98,
      page: 0,
      bbox: { x: 1, y: 2, width: 3, height: 4 },
    }],
    warnings: [],
  }), { status: 200, headers: { "content-type": "application/json" } }))) as typeof fetch;

  try {
    const provider = new HttpOcrProvider({ baseUrl: "http://127.0.0.1:8091" });
    const result = await provider.extract({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
    });
    assertEquals(result.provider, "paddleocr:PP-OCRv5:ar:paddle_static");
    assertEquals(result.rawText, "إشعار إيداع\n#350# سعودي");
    assertEquals(result.confidence, 0.97);
    assertEquals(result.blocks[0]?.bbox?.width, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("HTTP OCR provider fails closed on malformed sidecar responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  }))) as typeof fetch;

  try {
    const provider = new HttpOcrProvider({ baseUrl: "http://127.0.0.1:8091" });
    await assertRejects(
      () => provider.extract({ bytes: new Uint8Array([1]), mimeType: "image/jpeg" }),
      Error,
      "ocr_sidecar_invalid_response_contract",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
