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

function currencyFromArabic(value: string | undefined): Currency | undefined {
  if (!value) return undefined;
  if (/سعودي|SAR/i.test(value)) return "SAR";
  if (/يمني|YER/i.test(value)) return "YER";
  if (/دولار|USD/i.test(value)) return "USD";
  return undefined;
}

function combineDatetime(date: string | undefined, time: string | undefined): string | undefined {
  if (!date) return undefined;
  if (!time) return `${date}T00:00:00`;

  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return undefined;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();
  if (hour === 12) hour = 0;
  if (period === "PM") hour += 12;
  if (hour > 23 || minute > 59) return undefined;

  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

export function parseAmqiMobileDepositText(rawText: string): ParseResult {
  const text = normalizeArabicFinancialText(rawText);
  const anchors = [
    /إشعار\s*إيداع/u,
    /عبر\s*تطبيق\s*العمقي\s*جوال/u,
    /رقم\s*الحساب/u,
    /المبلغ/u,
  ];
  const anchorHits = anchors.filter((pattern) => pattern.test(text)).length;
  if (anchorHits < 3) {
    return { matched: false, normalizedText: text, missing: ["template_anchors"] };
  }

  const dateMatch = text.match(/التاريخ\s*:\s*(20\d{2}-\d{2}-\d{2})/u)
    ?? text.match(/\b(20\d{2}-\d{2}-\d{2})\b/u);
  const referenceMatch = text.match(/المرجع\s*:\s*([0-9]+-[0-9]+)/u);
  const headerPartyMatch = text.match(
    /السيد\s*:\s*(.+?)\s*بط-?([0-9]+)\s*رقم\s*الحساب\s*([0-9]+)/u,
  );
  const amountMatch = text.match(
    /المبلغ\s*#?([0-9,]+(?:\.[0-9]+)?)#?\s*(سعودي|ريال\s*يمني|يمني|دولار|SAR|YER|USD)/iu,
  );
  const narrativeMatch = text.match(
    /من\s*حساب\s*:\s*(.+?)\/(جواز|بط(?:اقة)?)\-?([0-9]+)\s*رقم\s*([0-9]+)\s*[اإآ]لى\s*حساب\s*:\s*(.+?)\s*بط\-?([0-9]+)\s*رقم\s*([0-9]+)/u,
  );
  const footerTimeMatch = text.match(
    /(?:20\d{2}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/iu,
  ) ?? text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/iu);

  const date = dateMatch?.[1];
  const documentReference = referenceMatch?.[1];
  const receiverName = normalizeArabicName(narrativeMatch?.[5] ?? headerPartyMatch?.[1] ?? "") || undefined;
  const receiverCard = narrativeMatch?.[6] ?? headerPartyMatch?.[2];
  const receiverAccount = narrativeMatch?.[7] ?? headerPartyMatch?.[3];
  const amount = parseAmountText(amountMatch?.[1] ?? "");
  const currency = currencyFromArabic(amountMatch?.[2]);
  const senderName = normalizeArabicName(narrativeMatch?.[1] ?? "") || undefined;
  const senderIdentityType = narrativeMatch?.[2]?.startsWith("جواز")
    ? "passport_number"
    : narrativeMatch?.[2]
      ? "card_number"
      : undefined;
  const senderIdentity = narrativeMatch?.[3];
  const senderAccount = narrativeMatch?.[4];
  const transactionDatetime = combineDatetime(date, footerTimeMatch?.[1]);

  const missing: string[] = [];
  for (const [field, value] of Object.entries({
    date,
    documentReference,
    receiverName,
    receiverAccount,
    amount,
    currency,
    senderName,
    senderAccount,
  })) {
    if (value === undefined || value === "") missing.push(field);
  }

  const receiverIdentifiers = [
    identifier("card_number", receiverCard, "receiver_card", headerPartyMatch?.[0] ?? narrativeMatch?.[0] ?? ""),
    identifier(
      "financial_account_number",
      receiverAccount,
      "receiver_account",
      narrativeMatch?.[0] ?? headerPartyMatch?.[0] ?? "",
    ),
  ].filter((item): item is ExtractedIdentifier => Boolean(item));

  const senderIdentifiers = [
    identifier(
      senderIdentityType ?? "unknown_identifier",
      senderIdentity,
      "sender_identity",
      narrativeMatch?.[0] ?? "",
      0.98,
    ),
    identifier(
      "financial_account_number",
      senderAccount,
      "sender_account",
      narrativeMatch?.[0] ?? "",
    ),
  ].filter((item): item is ExtractedIdentifier => Boolean(item));

  const parties: ExtractedParty[] = [];
  if (senderName || senderIdentifiers.length > 0) {
    parties.push({ role: "sender", name: senderName, identifiers: senderIdentifiers });
  }
  if (receiverName || receiverIdentifiers.length > 0) {
    parties.push({ role: "receiver", name: receiverName, identifiers: receiverIdentifiers });
  }

  const fieldConfidence: Record<string, number> = {
    financialEntity: 1,
    transactionType: 1,
    transactionDirection: 1,
    amount: amount === undefined ? 0 : 0.995,
    currency: currency === undefined ? 0 : 0.995,
    documentReference: documentReference ? 0.99 : 0,
    transactionDatetime: transactionDatetime ? 0.96 : date ? 0.85 : 0,
    senderName: senderName ? 0.97 : 0,
    senderAccount: senderAccount ? 0.99 : 0,
    receiverName: receiverName ? 0.97 : 0,
    receiverAccount: receiverAccount ? 0.995 : 0,
  };

  const requiredConfidence = [
    fieldConfidence.amount,
    fieldConfidence.currency,
    fieldConfidence.documentReference,
    fieldConfidence.receiverAccount,
  ];
  const confidence = requiredConfidence.reduce((sum, value) => sum + value, 0) /
    requiredConfidence.length;

  const warnings: string[] = [];
  if (headerPartyMatch?.[3] && narrativeMatch?.[7] && headerPartyMatch[3] !== narrativeMatch[7]) {
    warnings.push("receiver_account_conflict_between_header_and_narrative");
  }
  if (headerPartyMatch?.[2] && narrativeMatch?.[6] && headerPartyMatch[2] !== narrativeMatch[6]) {
    warnings.push("receiver_card_conflict_between_header_and_narrative");
  }
  if (senderIdentity && senderAccount && senderIdentity === senderAccount) {
    warnings.push("sender_identity_equals_sender_account");
  }
  if (receiverCard && receiverAccount && receiverCard === receiverAccount) {
    warnings.push("receiver_card_equals_receiver_account");
  }

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

  return { matched: true, extraction, normalizedText: text, missing };
}
