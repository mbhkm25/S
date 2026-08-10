import type { CoreFinancialExtraction } from "../contracts.ts";
import { normalizeArabicFinancialText, parseAmountText } from "../text-normalization.ts";

export interface BinDowalParseResult {
  matched: boolean;
  extraction?: CoreFinancialExtraction;
  missing: string[];
}

export function parseBinDowalReceiptText(rawText: string): BinDowalParseResult {
  const text = normalizeArabicFinancialText(rawText);
  const entityMatched = /(?:Bin\s*Dowal|بن\s*دول)/iu.test(text);
  if (!entityMatched) return { matched: false, missing: ["bin_dowal_anchor"] };

  const reference = first(text, [
    /(?:رقم\s*(?:السند|الإشعار)|السند|الإشعار)\s*[:#-]?\s*([0-9]{5,12})/u,
    /\b([0-9]{5,12})\b(?=[^0-9]{0,40}(?:سند\s*تحويل|إشعار\s*دائن))/u,
  ]);
  const date = first(text, [/(20\d{2}[-/]\d{2}[-/]\d{2})/u]);
  const amountRaw = first(text, [
    /(?:مبلغ(?:ه|\s*وقدره)?|مبلغ\s*الحساب)\s*[:#-]?\s*#?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/u,
    /#\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*#/u,
  ]);
  const amount = amountRaw ? parseAmountText(amountRaw) : undefined;
  const currency = /(?:ريال\s*سعودي|SAR)\b/iu.test(text)
    ? "SAR" as const
    : /(?:ريال\s*يمني|YER)\b/iu.test(text)
    ? "YER" as const
    : undefined;
  const receiverAccount = first(text, [
    /(?:رقم\s*الحساب|حساب)\s*[:#-]?\s*([0-9]{7,16})/u,
  ]);
  const senderAccount = first(text, [
    /(?:من\s*حساب|الرقم\s*المخصوم)\s*[:#-]?\s*([0-9]{7,16})/u,
  ]);

  const critical = { reference, amount, currency };
  const missing = Object.entries(critical).filter(([, v]) => v === undefined).map(([k]) => k);
  const confidence = missing.length === 0 ? 0.995 : missing.length === 1 ? 0.82 : 0.55;
  const isCredit = /إشعار\s*دائن/u.test(text);

  const extraction: CoreFinancialExtraction = {
    schemaVersion: 2,
    templateCode: isCredit ? "bin_dowal_credit_notice" : "bin_dowal_account_transfer",
    templateVersion: 1,
    financialEntity: "Bin Dowal Exchange Co.",
    financialEntityCode: "bin_dowal",
    transactionType: isCredit ? "credit_notice" : "account_transfer",
    transactionDirection: isCredit ? "incoming" : "outgoing",
    amount,
    currency,
    documentReference: reference,
    transactionDatetime: date,
    parties: [
      ...(senderAccount ? [{ role: "sender" as const, identifiers: [{ type: "account_number" as const, value: senderAccount, confidence: 0.9, evidence: [{ source: "regex" as const, rule: "bin_dowal_sender_account" }] }] }] : []),
      ...(receiverAccount ? [{ role: "receiver" as const, identifiers: [{ type: "account_number" as const, value: receiverAccount, confidence: 0.9, evidence: [{ source: "regex" as const, rule: "bin_dowal_receiver_account" }] }] }] : []),
    ],
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
