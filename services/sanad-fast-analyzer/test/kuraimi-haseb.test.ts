import { assertEquals, assert } from "jsr:@std/assert@1";
import { parseKuraimiHasebText } from "../src/parsers/kuraimi-haseb.ts";

Deno.test("Kuraimi Haseb candidate extracts critical fields but stays review-only", () => {
  const result = parseKuraimiHasebText(`
    Haseb Payment
    2026-08-10 03:42PM
    المبلغ 12,500 YER
    رقم المرجع FTABC12345
    نوع العملية دفع
    مشترياتك من متجر تجريبي نقطة حاسب رقم 45872
  `);

  assertEquals(result.matched, true);
  assert(result.extraction);
  assertEquals(result.extraction.financialEntityCode, "kuraimi_haseb");
  assertEquals(result.extraction.transactionType, "payment");
  assertEquals(result.extraction.amount, 12500);
  assertEquals(result.extraction.currency, "YER");
  assertEquals(result.extraction.documentReference, "FTABC12345");
  assertEquals(result.extraction.merchantPoint, "45872");
  assertEquals(result.extraction.transactionDatetime, "2026-08-10T15:42:00");
  assertEquals(result.extraction.reviewRequired, true);
  assert(result.extraction.confidence < 0.98);
});

Deno.test("Kuraimi Haseb candidate rejects weak unrelated text", () => {
  const result = parseKuraimiHasebText("المبلغ 1000 YER والمرجع ABC فقط");
  assertEquals(result.matched, false);
});
