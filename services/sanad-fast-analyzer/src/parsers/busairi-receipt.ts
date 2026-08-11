import type { CoreFinancialExtraction } from "../contracts.ts";
import { normalizeArabicFinancialText, parseAmountText } from "../text-normalization.ts";

export interface BusairiParseResult {
  matched: boolean;
  extraction?: CoreFinancialExtraction;
  missing: string[];
}

export function parseBusairiReceiptText(rawText: string): BusairiParseResult {
  const text = normalizeArabicFinancialText(rawText);
  const entityMatched = /(?:Al-?busairi|البسيري)/iu.test(text);
  if (!entityMatched) return { matched: false, missing: ["busairi_anchor"] };

  const reference = first(text, [
    /(?:رقم\s*(?:السند|الإشعار))\s*[:#-]?\s*([0-9]{4,12})/u,
    /(?:20\d{2}[-/]\d{2}[-/]\d{2})\s+([0-9]{4,8})(?![0-9])/u,
    /\b([0-9]{4,12})\b(?=[^0-9]{0,50}(?:سند\s*تحويل|سند\s*قيد|إشعار))/u,
  ]);
  const date = first(text, [/(20\d{2}[-/]\d{2}[-/]\d{2})/u]);
  const amountRaw = first(text, [
    /(?:مبلغ(?:ه|\s*وقدره)?|مبلغ\s*الحساب)\s*[:#-]?\s*#?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/u,
    /#\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*#/u,
    /([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?=ريال\s*(?:يمني|سعودي)|(?:YER|SAR)(?:\s|$))/iu,
  ]);
  const amount = amountRaw ? parseAmountText(amountRaw) : undefined;
  const currency = /ريال\s*سعودي/iu.test(text) || /(?:^|\s)SAR(?:\s|$)/iu.test(text)
    ? "SAR" as const
    : /ريال\s*يمني/iu.test(text) || /(?:^|\s)YER(?:\s|$)/iu.test(text)
    ? "YER" as const
    : undefined;
  const account = first(text, [/(?:رقم\s*الحساب|حساب)\s*[:#-]?\s*([0-9]{7,16})/u]);
  const isCredit = /(?:سند\s*قيد\s*مدين|قيدنا\s*على\s*حساب)/u.test(text);

  const critical = { reference, amount, currency };
  const missing = Object.entries(critical).filter(([, v]) => v === undefined).map(([k]) => k);
  const confidence = missing.length === 0 ? 0.995 : missing.length === 1 ? 0.82 : 0.55;

  const extraction: CoreFinancialExtraction = {
    schemaVersion: 2,
    templateCode: isCredit ? "busairi_debit_entry" : "busairi_account_transfer",
    templateVersion: 1,
    financialEntity: "Al-busairi Exchange Co.",
    financialEntityCode: "busairi",
    transactionType: isCredit ? "credit_notice" : "account_transfer",
    transactionDirection: isCredit ? "incoming" : "outgoing",
    amount,
    currency,
    documentReference: reference,
    transactionDatetime: date,
    parties: account ? [{ role: "receiver", identifiers: [{ type: "account_number", value: account, confidence: 0.9, evidence: [{ source: "regex", rule: "busairi_account" }] }] }] : [],
    confidence,
    fieldConfidence: {
      financialEntity: 1,
      amount: amount !== undefined ? 0.99 : 0,
      currency: currency ? 0.99 : 0,
      documentReference: reference ? 0.99 : 0,
      transactionDatetime: date ? 0.95 : 0,
    },
    warnings: missing.map((field) => `missing_${field}`),
    reviewRequired: missing.length > 0,
  };

  return { matched: true, extraction, missing };
}

function first(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}
