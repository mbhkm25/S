import { classifyAmqiTemplate, parseAmqiFamilyText } from "../src/parsers/amqi-family.ts";

declare const Deno: { test(name: string, fn: () => void | Promise<void>): void };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("classifies and parses Amqi withdrawal without confusing direction", () => {
  const text = `
    إشعار سحب
    رقم الإشعار: 8-255800001
    نود إشعاركم أننا قيدنا على حسابكم لدينا
    المبلغ [220] ريال سعودي
    من حساب: مرسل تجريبي - رقم 254080001 إلى حساب: مستفيد تجريبي بطاقة 08010070001 رقم 254070001
    رقم الحساب 254080001
    التاريخ: 26-06-2025
    شركة العمقي واخوانه للصرافة
  `;

  assert(classifyAmqiTemplate(text) === "withdrawal", "withdrawal classification mismatch");
  const result = parseAmqiFamilyText(text);
  assert(result.matched, "withdrawal should parse");
  assert(result.extraction?.transactionType === "withdrawal", "transaction type mismatch");
  assert(result.extraction?.transactionDirection === "outgoing", "direction mismatch");
  assert(result.extraction?.amount === 220, "amount mismatch");
  assert(result.extraction?.currency === "SAR", "currency mismatch");
  assert(result.extraction?.documentReference === "8-255800001", "reference mismatch");

  const debited = result.extraction?.parties.find((party) => party.role === "debited_party");
  const credited = result.extraction?.parties.find((party) => party.role === "credited_party");
  assert(debited?.identifiers.some((item) => item.type === "financial_account_number" && item.value === "254080001"), "debited account missing");
  assert(credited?.identifiers.some((item) => item.type === "financial_account_number" && item.value === "254070001"), "credited account missing");
  assert(credited?.identifiers.some((item) => item.type === "card_number" && item.value === "08010070001"), "receiver card missing");
});

Deno.test("classifies deposit independently from withdrawal", () => {
  const text = `إشعار إيداع نود إشعاركم أننا قيدنا لحسابكم المبلغ #500# سعودي عبر تطبيق العمقي جوال رقم الحساب 254070001`;
  assert(classifyAmqiTemplate(text) === "deposit", "deposit classification mismatch");
});

Deno.test("rejects ambiguous Amqi direction", () => {
  const text = `إشعار سحب وإشعار إيداع قيدنا على حسابكم وقيدنا لحسابكم العمقي`;
  assert(classifyAmqiTemplate(text) === "unknown", "ambiguous template must be unknown");
  assert(parseAmqiFamilyText(text).matched === false, "ambiguous template must not parse");
});
