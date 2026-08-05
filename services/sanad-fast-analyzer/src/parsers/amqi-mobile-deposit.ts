import type {
  CoreFinancialExtraction,
  Currency,
  Evidence,
  ExtractedIdentifier,
  ExtractedParty,
} from "../contracts.ts";
import {
  normalizeArabicFinancialText,
  normalizeArabicName,
  parseAmountText,
} from "../text-normalization.ts";

const TEMPLATE_CODE = "amqi_mobile_deposit_notice_v1";
const TEMPLATE_VERSION = 1;
const ENTITY = "العمقي موبايل";

export interface ParseResult {
  matched: boolean;
  extraction?: CoreFinancialExtraction;
  normalizedText: string;
  missing: string[];
  anchorHits?: number;
}

function evidence(text: string, rule: string): Evidence[] {
  return [{ source: "pdf_text", text, rule }];
}

function identifier(
  type: ExtractedIdentifier["type"],
  value: string | undefined,
  label: string,
  sourceText: string,
  confidence = 0.99,
): ExtractedIdentifier | undefined {
  if (!value) return undefined;
  return {
    type,
    value,
    label,
    confidence,
    evidence: evidence(sourceText, `amqi:${label}`),
  };
}

function currencyFromText(value: string | undefined): Currency | undefined {
  if (!value) return undefined;
  if (/سعودي|SAR/i.test(value)) return "SAR";
  if (/يمني|YER/i.test(value)) return "YER";
  if (/دولار|USD/i.test(value)) return "USD";
  return undefined;
}

function toIsoDatetime(date: string | undefined, hourText: string | undefined, minuteText: string | undefined, periodText: string | undefined): string | undefined {
  if (!date) return undefined;
  if (!hourText || !minuteText || !periodText) return `${date}T00:00:00`;

  let hour = Number(hourText);
  let minute = Number(minuteText);
  const period = periodText.toUpperCase();

  // Some logical text extraction exposes 29!08PM for the visual time 08:29 PM.
  if (hour > 12 && minute >= 1 && minute <= 12) {
    [hour, minute] = [minute, hour];
  }

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 1 || hour > 12 || minute > 59) return undefined;
  if (hour === 12) hour = 0;
  if (period === "PM") hour += 12;
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function extractDatetime(text: string, date: string | undefined): string | undefined {
  if (!date) return undefined;

  // Logical order: 08:29PM, 08!29PM, or the malformed 29!08PM.
  const normal = text.match(/\b(\d{1,2})[:!](\d{2})\s*(AM|PM)\b/i);
  if (normal?.[1] && normal[2] && normal[3]) return toIsoDatetime(date, normal[1], normal[2], normal[3]);

  // Poppler -layout may expose visual RTL order: PM 08!04 2026-05-14.
  // The first numeric component is minutes and the second is hours.
  const rtl = text.match(/\b(AM|PM)\s*(\d{1,2})[:!](\d{2})\s+20\d{2}-\d{2}-\d{2}\b/i);
  if (rtl?.[1] && rtl[2] && rtl[3]) return toIsoDatetime(date, rtl[3], rtl[2], rtl[1]);

  return `${date}T00:00:00`;
}

function firstMatch(text: string, patterns: RegExp[]): RegExpMatchArray | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return undefined;
}

export function parseAmqiMobileDepositText(rawText: string): ParseResult {
  const text = normalizeArabicFinancialText(rawText);
  const anchors = [
    /إشعار\s*إيداع/u,
    /عبر\s*تطبيق\s*العمقي\s*جوال/u,
    /رقم\s*الحساب/u,
    /المبلغ/u,
    /قيدنا\s*لحسابكم/u,
  ];
  const anchorHits = anchors.filter((pattern) => pattern.test(text)).length;
  if (anchorHits < 3) {
    return { matched: false, normalizedText: text, missing: ["template_anchors"], anchorHits };
  }

  const dateMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/u);
  const referenceMatch = firstMatch(text, [
    /المرجع\s*:\s*([0-9]+-[0-9]+)/u,
    /\b([0-9]-[0-9]{6,})\b/u,
  ]);
  const amountMatch = firstMatch(text, [
    /المبلغ\s*#?([0-9,]+(?:\.[0-9]+)?)#?\s*(سعودي|ريال\s*يمني|يمني|دولار|SAR|YER|USD)/iu,
    /#([0-9,]+(?:\.[0-9]+)?)#\s*(سعودي|ريال\s*يمني|يمني|دولار|SAR|YER|USD)/iu,
  ]);
  const narrativeMatch = text.match(
    /من\s*حساب\s*:\s*(.+?)\/(جواز|بط(?:اقة)?)-?([0-9]+)\s*رقم\s*([0-9]+)\s*[اإآا]لى\s*حساب\s*:\s*(.+?)\s*بط-?([0-9]+)\s*رقم\s*([0-9]+)/u,
  );
  const headerLogicalMatch = text.match(
    /السيد\s*:\s*(.+?)\s*بط-?([0-9]+)\s*رقم\s*الحساب\s*([0-9]+)/u,
  );

  const date = dateMatch?.[1];
  const documentReference = referenceMatch?.[1];
  const receiverName = normalizeArabicName(narrativeMatch?.[5] ?? headerLogicalMatch?.[1] ?? "") || undefined;
  const receiverCard = narrativeMatch?.[6] ?? headerLogicalMatch?.[2];
  const receiverAccount = narrativeMatch?.[7] ?? headerLogicalMatch?.[3];
  const amount = parseAmountText(amountMatch?.[1] ?? "");
  const currency = currencyFromText(amountMatch?.[2] ?? text);
  const senderName = normalizeArabicName(narrativeMatch?.[1] ?? "") || undefined;
  const senderIdentityType = narrativeMatch?.[2]?.startsWith("جواز")
    ? "passport_number"
    : narrativeMatch?.[2]
      ? "card_number"
      : undefined;
  const senderIdentity = narrativeMatch?.[3];
  const senderAccount = narrativeMatch?.[4];
  const transactionDatetime = extractDatetime(text, date);

  const missing: string[] = [];
  for (const [field, value] of Object.entries({
    date,
    documentReference,
    receiverName,
    receiverCard,
    receiverAccount,
    amount,
    currency,
    senderName,
    senderIdentity,
    senderAccount,
  })) {
    if (value === undefined || value === "") missing.push(field);
  }

  const receiverSource = narrativeMatch?.[0] ?? headerLogicalMatch?.[0] ?? "";
  const receiverIdentifiers = [
    identifier("card_number", receiverCard, "receiver_card", receiverSource),
    identifier("financial_account_number", receiverAccount, "receiver_account", receiverSource),
  ].filter((item): item is ExtractedIdentifier => Boolean(item));

  const senderIdentifiers = [
    identifier(senderIdentityType ?? "unknown_identifier", senderIdentity, "sender_identity", narrativeMatch?.[0] ?? "", 0.98),
    identifier("financial_account_number", senderAccount, "sender_account", narrativeMatch?.[0] ?? ""),
  ].filter((item): item is ExtractedIdentifier => Boolean(item));

  const parties: ExtractedParty[] = [];
  if (senderName || senderIdentifiers.length > 0) parties.push({ role: "sender", name: senderName, identifiers: senderIdentifiers });
  if (receiverName || receiverIdentifiers.length > 0) parties.push({ role: "receiver", name: receiverName, identifiers: receiverIdentifiers });

  const amountConfidence = amount === undefined ? 0 : 0.995;
  const currencyConfidence = currency === undefined ? 0 : 0.995;
  const documentReferenceConfidence = documentReference ? 0.99 : 0;
  const receiverAccountConfidence = receiverAccount ? 0.995 : 0;
  const receiverCardConfidence = receiverCard ? 0.99 : 0;
  const senderAccountConfidence = senderAccount ? 0.99 : 0;
  const senderIdentityConfidence = senderIdentity ? 0.98 : 0;

  const fieldConfidence: Record<string, number> = {
    financialEntity: 1,
    transactionType: 1,
    transactionDirection: 1,
    amount: amountConfidence,
    currency: currencyConfidence,
    documentReference: documentReferenceConfidence,
    transactionDatetime: transactionDatetime?.endsWith("T00:00:00") ? 0.85 : transactionDatetime ? 0.97 : 0,
    senderName: senderName ? 0.97 : 0,
    senderIdentity: senderIdentityConfidence,
    senderAccount: senderAccountConfidence,
    receiverName: receiverName ? 0.97 : 0,
    receiverCard: receiverCardConfidence,
    receiverAccount: receiverAccountConfidence,
  };

  const requiredConfidence = [
    amountConfidence,
    currencyConfidence,
    documentReferenceConfidence,
    receiverAccountConfidence,
    receiverCardConfidence,
    senderAccountConfidence,
    senderIdentityConfidence,
  ];
  const confidence = requiredConfidence.reduce((sum, value) => sum + value, 0) / requiredConfidence.length;

  const warnings: string[] = [];
  if (senderIdentity && senderAccount && senderIdentity === senderAccount) warnings.push("sender_identity_equals_sender_account");
  if (receiverCard && receiverAccount && receiverCard === receiverAccount) warnings.push("receiver_card_equals_receiver_account");
  if (receiverAccount && senderAccount && receiverAccount === senderAccount) warnings.push("sender_and_receiver_accounts_are_equal");
  if (!transactionDatetime || transactionDatetime.endsWith("T00:00:00")) warnings.push("transaction_time_missing_or_unresolved");
  if (anchorHits < 4) warnings.push("template_anchor_confidence_reduced");

  const reviewRequired = missing.length > 0 || warnings.length > 0 || confidence < 0.98;
  const extraction: CoreFinancialExtraction = {
    schemaVersion: 1,
    templateCode: TEMPLATE_CODE,
    templateVersion: TEMPLATE_VERSION,
    financialEntity: ENTITY,
    transactionType: "deposit",
    transactionDirection: "incoming",
    amount,
    currency,
    documentReference,
    transactionDatetime,
    parties,
    confidence,
    fieldConfidence,
    warnings,
    reviewRequired,
  };

  return { matched: true, extraction, normalizedText: text, missing, anchorHits };
}
