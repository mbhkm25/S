import { parseAmqiMobileDepositText } from "../src/parsers/amqi-mobile-deposit.ts";

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("parses a Saudi Al-Amqi deposit notice from compact PDF text", () => {
  const result = parseAmqiMobileDepositText(`
    التاريخ! 2026-05-14 المرجع ! 8-226242876
    السيد! مستفيد تجريبي بط08010070000 رقم الحساب 254070001
    نود إشعاركم أننا قيدنا لحسابكم لدينا حسب التفاصيل التالية
    المبلغ #600# سعودي
    ستة مائة سعودي
    من حساب! مرسل تجريبي/جواز-9747000 رقم 254120001 الى حساب! مستفيد تجريبي
    بط-08010070000 رقم 254070001 - تجاري تسديد حساب - عبر تطبيق العمقي جوال
    هذا الاشعار آلي ولا يحتاج الى ختم أو توقيع عاجل 2026-05-14 04!08PM
    إشعار إيداع
  `);

  assert(result.matched, "template should match");
  assert(result.extraction, "extraction should be present");
  assert(result.extraction.amount === 600, "amount mismatch");
  assert(result.extraction.currency === "SAR", "currency mismatch");
  assert(result.extraction.documentReference === "8-226242876", "reference mismatch");
  assert(result.extraction.transactionDatetime === "2026-05-14T16:08:00", "datetime mismatch");
  assert(result.extraction.transactionDirection === "incoming", "direction mismatch");
  assert(result.extraction.reviewRequired === false, `unexpected review: ${result.extraction.warnings.join(",")}`);

  const sender = result.extraction.parties.find((party) => party.role === "sender");
  const receiver = result.extraction.parties.find((party) => party.role === "receiver");
  assert(sender?.identifiers.some((item) => item.type === "passport_number" && item.value === "9747000"), "passport missing");
  assert(sender?.identifiers.some((item) => item.type === "financial_account_number" && item.value === "254120001"), "sender account missing");
  assert(receiver?.identifiers.some((item) => item.type === "card_number" && item.value === "08010070000"), "receiver card missing");
  assert(receiver?.identifiers.some((item) => item.type === "financial_account_number" && item.value === "254070001"), "receiver account missing");
});

Deno.test("keeps sender identity separate from sender account", () => {
  const result = parseAmqiMobileDepositText(`
    التاريخ: 2025-06-05 المرجع: 8-232094624
    السيد: مستفيد تجريبي بط-08010070001 رقم الحساب 254070002
    المبلغ #500# سعودي
    من حساب: مرسل آخر/جواز-14380001 رقم 254220002 إلى حساب: مستفيد تجريبي بط-08010070001 رقم 254070002
    عبر تطبيق العمقي جوال إشعار إيداع 2025-06-05 08:29PM
  `);

  assert(result.matched, "template should match");
  assert(result.extraction, "extraction should be present");
  const sender = result.extraction.parties.find((party) => party.role === "sender");
  const passport = sender?.identifiers.find((item) => item.type === "passport_number");
  const account = sender?.identifiers.find((item) => item.type === "financial_account_number");
  assert(passport?.value === "14380001", "passport value mismatch");
  assert(account?.value === "254220002", "account value mismatch");
  assert(passport.value !== account.value, "identity and account must remain distinct");
});

Deno.test("rejects unrelated financial text without enough anchors", () => {
  const result = parseAmqiMobileDepositText("تحويل مالي بمبلغ 1000 ريال ورقم 12345");
  assert(result.matched === false, "unrelated text must not match");
});
