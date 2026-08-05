import { assessPdfTextLayer } from "../src/pdf-text.ts";
import { parseAmqiMobileDepositText } from "../src/parsers/amqi-mobile-deposit.ts";

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SANITIZED_POPPLER_TEXT = `
  8-226242876 المرجع ! 2026-05-14 التاريخ !
  254070001 رقم الحساب مستفيد تجريبي بط08010070000 السيد !
  نود إشعاركم أننا قيدنا لحسابكم لدينا حسب التفاصيل التالية
  سعودي #600# المبلغ
  ستة مائة سعودي
  إشعار إيداع من حساب! مرسل تجريبي/جواز-9747000رقم 254120001الى حساب! مستفيد تجريبي
  بط-08010070000رقم - 254070001 تجاري تسديد حساب - - عبر تطبيق العمقي جوال
  PM 08!04 2026-05-14 عاجل هذا الاشعار آلي ولايحتاج الى ختم أو توقيع
`;

Deno.test("detects the Al-Amqi PDF text layer as usable", () => {
  const result = assessPdfTextLayer(SANITIZED_POPPLER_TEXT, 1);
  assert(result.textLayerDetected, "text layer should be usable");
  assert(result.qualityScore >= 0.75, `quality too low: ${result.qualityScore}`);
  assert(result.warnings.length === 0, `unexpected warnings: ${result.warnings.join(",")}`);
});

Deno.test("parses the sanitized text-layer output without OCR", () => {
  const result = parseAmqiMobileDepositText(SANITIZED_POPPLER_TEXT);
  assert(result.matched, "Al-Amqi template should match");
  assert(result.extraction, "extraction should exist");
  assert(result.extraction.amount === 600, "amount mismatch");
  assert(result.extraction.currency === "SAR", "currency mismatch");
  assert(result.extraction.transactionDatetime === "2026-05-14T16:08:00", "time mismatch");
  assert(result.extraction.reviewRequired === false, `unexpected review: ${result.extraction.warnings.join(",")}`);
});

Deno.test("rejects an empty or non-financial PDF text layer", () => {
  const result = assessPdfTextLayer("صفحة قصيرة", 1);
  assert(!result.textLayerDetected, "short non-financial layer must be rejected");
  assert(result.warnings.includes("pdf_text_layer_insufficient"), "missing insufficiency warning");
});
