import type { CoreFinancialExtraction, Currency, Evidence } from "../contracts.ts";
import { normalizeArabicFinancialText } from "../text-normalization.ts";

export interface KuraimiHasebParseResult {
  matched: boolean;
  extraction?: CoreFinancialExtraction;
  missing: string[];
}

const TEMPLATE_CODE = "kuraimi_haseb_transaction_card_v1";

/**
 * Conservative candidate parser for Kuraimi/Haseb mobile transaction cards.
 * It intentionally keeps reviewRequired=true until private-corpus scoring proves
 * promotion-grade accuracy. Both merchant-payment and account-transfer variants
 * are recognized because OCR commonly drops the logo/header while preserving
 * their distinctive transaction labels and FT reference.
 */
export function parseKuraimiHasebText(rawText: string): KuraimiHasebParseResult {
  const text = normalizeArabicFinancialText(rawText);
  const compact = text.replace(/\s+/g, " ").trim();

  const hasHasebPayment = /Haseb\s+Payment/i.test(rawText) || /مشترياتك\s+من/u.test(text);
  const hasFundTransfer = /Fund\s*Transfer\s*-?\s*Other/i.test(rawText) || /تحويل\s+من\s+حساب/u.test(text);
  const hasAmount = /([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(YER|SAR|USD)\b/i.test(compact);
  const hasFtReference = /\bFT[A-Z0-9]{4,}\b/i.test(rawText);
  const hasTransactionLabels = /المبلغ/u.test(text) && (/(?:رقم\s*)?المرجع/u.test(text) || hasFtReference);
  const matched = (hasHasebPayment && hasTransactionLabels) || (hasFundTransfer && hasAmount && hasFtReference);
  if (!matched) return { matched: false, missing: ["kuraimi_haseb_required_anchors_missing"] };

  const amountMatch = compact.match(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(YER|SAR|USD)\b/i);
  const referenceMatch = rawText.match(/\b(FT[A-Z0-9]{4,})\b/i);
  const merchantPointMatch = text.match(/نقطة\s+حاسب\s+رقم\s*([0-9]+)/u);
  const merchantNameMatch = text.match(/مشترياتك\s+من\s+(.+?)\s+نقطة\s+حاسب/u);
  const datetimeMatch = rawText.match(/(20\d{2}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);

  const missing: string[] = [];
  const amount = parseAmount(amountMatch?.[1]);
  const currency = normalizeCurrency(amountMatch?.[2]);
  const reference = referenceMatch?.[1]?.toUpperCase();
  const merchantPoint = merchantPointMatch?.[1];
  const merchantName = cleanName(merchantNameMatch?.[1]);
  const transactionDatetime = parseDatetime(datetimeMatch);

  if (amount === undefined) missing.push("amount");
  if (!currency) missing.push("currency");
  if (!reference) missing.push("transfer_reference");
  if (!transactionDatetime) missing.push("transaction_datetime");

  const completeCritical = amount !== undefined && currency !== undefined && reference !== undefined;
  const confidence = completeCritical ? 0.97 : 0.78;
  const fieldConfidence: Record<string, number> = {};
  if (amount !== undefined) fieldConfidence.amount = 0.99;
  if (currency) fieldConfidence.currency = 0.99;
  if (reference) fieldConfidence.transferReference = 0.99;
  if (transactionDatetime) fieldConfidence.transactionDatetime = 0.96;
  if (merchantPoint) fieldConfidence.merchantPoint = 0.96;
  if (merchantName) fieldConfidence.merchantName = 0.92;

  const warnings = [
    "kuraimi_haseb_candidate_requires_private_corpus_promotion",
    ...missing.map((field) => `missing:${field}`),
  ];

  const extraction: CoreFinancialExtraction = {
    schemaVersion: 2,
    templateCode: hasFundTransfer ? "kuraimi_haseb_account_transfer_v1" : TEMPLATE_CODE,
    templateVersion: 1,
    financialEntity: "الكريمي حاسب",
    financialEntityCode: "kuraimi_haseb",
    transactionType: hasFundTransfer ? "transfer" : "payment",
    transactionDirection: "outgoing",
    amount,
    currency,
    transferReference: reference,
    transactionDatetime,
    merchantName,
    merchantPoint,
    parties: merchantPoint
      ? [{
        role: "beneficiary",
        name: merchantName,
        identifiers: [{
          type: "merchant_point",
          value: merchantPoint,
          sourceLabel: "نقطة حاسب رقم",
          isPrimaryRoutingIdentifier: false,
          confidence: 0.96,
          evidence: evidence("regex", `نقطة حاسب رقم ${merchantPoint}`),
        }],
      }]
      : [],
    confidence,
    fieldConfidence,
    warnings,
    reviewRequired: true,
  };

  return { matched: true, extraction, missing };
}

function parseAmount(value?: string): number | undefined {
  if (!value) return undefined;
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function normalizeCurrency(value?: string): Currency | undefined {
  const upper = value?.toUpperCase();
  return upper === "YER" || upper === "SAR" || upper === "USD" ? upper : undefined;
}

function parseDatetime(match: RegExpMatchArray | null): string | undefined {
  if (!match) return undefined;
  const date = match[1];
  let hour = Number(match[2]);
  const minute = Number(match[3]);
  const period = match[4]?.toUpperCase();
  if (!date || !Number.isInteger(hour) || !Number.isInteger(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return undefined;
  }
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function cleanName(value?: string): string | undefined {
  const clean = value?.replace(/\s+/g, " ").trim();
  return clean || undefined;
}

function evidence(source: Evidence["source"], text: string): Evidence[] {
  return [{ source, text }];
}
