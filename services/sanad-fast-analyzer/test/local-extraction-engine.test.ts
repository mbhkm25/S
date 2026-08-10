import { assertEquals, assert } from "jsr:@std/assert@1";
import { analyzeLocalDocument } from "../src/local-extraction/engine.ts";
import type { OcrProvider } from "../src/local-extraction/contracts.ts";

const fakeOcr: OcrProvider = {
  name: "fake-ocr",
  supports: (mimeType) => mimeType === "image/png",
  async extract() {
    return {
      provider: "fake-ocr",
      rawText: [
        "إشعار إيداع",
        "عبر تطبيق العمقي جوال",
        "2026-08-10",
        "المرجع 8-156978749",
        "السيد: محمد عبدالله",
        "رقم الحساب 254073867",
        "#350# سعودي",
        "هذا الاشعار آلي",
      ].join("\n"),
      blocks: [],
      confidence: 0.995,
      durationMs: 12,
      warnings: [],
    };
  },
};

Deno.test("local engine asks for OCR when no provider is configured", async () => {
  const result = await analyzeLocalDocument({
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: "image/png",
  });
  assertEquals(result.status, "needs_ocr");
  assertEquals(result.fallbackRecommended, true);
  assertEquals(result.fallbackReason, "ocr_provider_not_configured");
});

Deno.test("local engine can compose OCR text with deterministic rules", async () => {
  const result = await analyzeLocalDocument({
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: "image/png",
  }, {
    ocrProvider: fakeOcr,
    minimumAcceptConfidence: 0.5,
  });

  assert(["completed", "needs_review"].includes(result.status));
  assertEquals(result.diagnostics.ocrProvider, "fake-ocr");
  assert(result.source.includes("ocr"));
  assert(result.source.includes("rules"));
});
