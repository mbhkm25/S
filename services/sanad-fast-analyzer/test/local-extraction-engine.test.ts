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
        "التاريخ: 2026-05-14 المرجع: 8-226242876",
        "السيد: مستفيد تجريبي بط-08010070000 رقم الحساب 254070001",
        "نود إشعاركم أننا قيدنا لحسابكم لدينا حسب التفاصيل التالية",
        "المبلغ #600# سعودي",
        "من حساب: مرسل تجريبي/جواز-9747000 رقم 254120001 إلى حساب: مستفيد تجريبي بط-08010070000 رقم 254070001",
        "تجاري تسديد حساب - عبر تطبيق العمقي جوال",
        "هذا الاشعار آلي ولا يحتاج الى ختم أو توقيع",
        "2026-05-14 04:08PM",
        "إشعار إيداع",
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
  assertEquals(result.extraction?.amount, 600);
  assertEquals(result.extraction?.currency, "SAR");
  assertEquals(result.extraction?.documentReference, "8-226242876");
  assert(result.source.includes("ocr"));
  assert(result.source.includes("rules"));
});
