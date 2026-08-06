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

const TEMPLATE_CODE = "amqi_mobile_withdrawal_notice_v1";
const TEMPLATE_VERSION = 1;
const ENTITY = "العمقي موبايل";

export interface AmqiWithdrawalParseResult {
  matched: boolean;
  extraction?: CoreFinancialExtraction;
  normalizedText: string;
  missing: string[];
  anchorHits: number;
}

function ev(text: string, rule: string): Evidence[] {
  return [{ source: "pdf_text", text, rule }];
}

function id(
  type: ExtractedIdentifier["type"],
  value: string | undefined,
  label: string,
  source: string,
  confidence = 0.99,
): ExtractedIdentifier | undefined {
  if (!value) return undefined;
  return { type, value, label, confidence, evidence: ev(source, `amqi-withdrawal:${label}`) };
}

function currencyFromText(value: string | undefined): Currency | undefined {
  if (!value) return undefined;
  if (/سعودي|SAR/i.test(value)) return "SAR";
  if (/يمني|YER/i.test(value)) return "YER";
  if (/دولار|USD/i.test(value)) return "USD";
  return undefined;
}

function first(text: string, patterns: RegExp[]): RegExpMatchArray | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return undefined;
}

function isoDate(text: string): string | undefined {
  const ymd = text.match(/\b(20\d{2})[-/]([01]\d)[-/]([0-3]\d)\b/u);
  if (ymd?.[1] && ymd[2] && ymd[3]) return `${ymd[1]}-${ymd[2]}-${ymd[3]}T00:00:00`;
  const dmy = text.match(/\b([0-3]\d)[-/]([01]\d)[-/](20\d{2})\b/u);
  if (dmy?.[1] && dmy[2] && dmy[3]) return `${dmy[3]}-${dmy[2]}-${dmy[1]}T00:00:00`;
  return undefined;
}

export function parseAmqiMobileWithdrawalText(rawText: string): AmqiWithdrawalParseResult {
  const text = normalizeArabicFinancialText(rawText);
  const anchors = [
    /إشعار\s*سحب/u,
    /قيدنا\s*على\s*حسابكم/u,
    /من\s*حساب/u,
    /[اإآا]لى\s*حساب/u,
    /المبلغ/u,
    /العمقي/u,
  ];
  const anchorHits = anchors.filter((pattern) => pattern.test(text)).length;
  if (anchorHits < 4 || !/إشعار\s*سحب/u.test(text)) {
    return { matched: false, normalizedText: text, missing: ["template_anchors"], anchorHits };
  }

  const referenceMatch = first(text, [
    /(?:رقم\s*(?:الإشعار|المرجع)|المرجع)\s*:\s*([0-9]+-[0-9]+)/u,
    /\b([0-9]+-[0-9]{6,})\b/u,
  ]);
  const amountMatch = first(text, [
    /المبلغ\s*[\[#]?\s*([0-9,]+(?:\.[0-9]+)?)\s*[\]#]?\s*(ريال\s*سعودي|سعودي|SAR|ريال\s*يمني|يمني|YER|دولار|USD)/iu,
    /([0-9,]+(?:\.[0-9]+)?)\s*(ريال\s*سعودي|سعودي|SAR|ريال\s*يمني|يمني|YER|دولار|USD)/iu,
  ]);

  const flowMatch = first(text, [
    /من\s*حساب\s*:\s*(.+?)\s*(?:-|،)?\s*رقم\s*([0-9]{6,})\s*[اإآا]لى\s*حساب\s*:\s*(.+?)(?:\s*بط(?:اقة)?[-\s]*([0-9]{6,}))?\s*(?:-|،|\.\.\.)?\s*رقم\s*([0-9]{6,})/u,
    /من\s*حساب\s*:?\s*(.+?)\s*رقم\s*([0-9]{6,}).+?[اإآا]لى\s*حساب\s*:?\s*(.+?)\s*رقم\s*([0-9]{6,})/u,
  ]);

  const documentAccountMatch = first(text, [
    /رقم\s*الحساب\s*:?\s*([0-9]{6,})/u,
    /الحساب\s*:?\s*([0-9]{6,})/u,
  ]);

  const documentReference = referenceMatch?.[1];
  const amount = parseAmountText(amountMatch?.[1] ?? "");
  const currency = currencyFromText(amountMatch?.[2] ?? text);
  const senderName = normalizeArabicName(flowMatch?.[1] ?? "") || undefined;
  const senderAccount = flowMatch?.[2];
  const receiverName = normalizeArabicName(flowMatch?.[3] ?? "") || undefined;
  const receiverCard = flowMatch?.length && flowMatch.length >= 6 ? flowMatch?.[4] : undefined;
  const receiverAccount = flowMatch?.length && flowMatch.length >= 6 ? flowMatch?.[5] : flowMatch?.[4];
  const documentAccount = documentAccountMatch?.[1] ?? senderAccount;
  const transactionDatetime = isoDate(text);

  const missing: string[] = [];
  for (const [field, value] of Object.entries({
    documentReference,
    amount,
    currency,
    senderName,
    senderAccount,
    receiverName,
    receiverAccount,
    transactionDatetime,
  })) {
    if (value === undefined || value === "") missing.push(field);
  }

  const source = flowMatch?.[0] ?? text;
  const senderIdentifiers = [
    id("financial_account_number", senderAccount, "debited_account", source),
  ].filter((item): item is ExtractedIdentifier => Boolean(item));
  const receiverIdentifiers = [
    id("card_number", receiverCard, "receiver_card", source, 0.95),
    id("financial_account_number", receiverAccount, "credited_account", source),
  ].filter((item): item is ExtractedIdentifier => Boolean(item));

  const parties: ExtractedParty[] = [];
  if (senderName || senderIdentifiers.length) {
    parties.push({ role: "debited_party", name: senderName, identifiers: senderIdentifiers });
  }
  if (receiverName || receiverIdentifiers.length) {
    parties.push({ role: "credited_party", name: receiverName, identifiers: receiverIdentifiers });
  }

  const warnings: string[] = [];
  if (documentAccount && senderAccount && documentAccount !== senderAccount) {
    warnings.push("document_account_does_not_match_debited_account");
  }
  if (senderAccount && receiverAccount && senderAccount === receiverAccount) {
    warnings.push("debited_and_credited_accounts_are_equal");
  }
  if (receiverCard && receiverAccount && receiverCard === receiverAccount) {
    warnings.push("receiver_card_equals_receiver_account");
  }
  if (!transactionDatetime) warnings.push("transaction_date_missing_or_unresolved");
  if (anchorHits < 5) warnings.push("template_anchor_confidence_reduced");

  const fieldConfidence: Record<string, number> = {
    financialEntity: 1,
    transactionType: 1,
    transactionDirection: 1,
    amount: amount === undefined ? 0 : 0.995,
    currency: currency ? 0.995 : 0,
    documentReference: documentReference ? 0.99 : 0,
    transactionDatetime: transactionDatetime ? 0.97 : 0,
    senderName: senderName ? 0.97 : 0,
    senderAccount: senderAccount ? 0.995 : 0,
    receiverName: receiverName ? 0.97 : 0,
    receiverAccount: receiverAccount ? 0.995 : 0,
    documentAccount: documentAccount ? 0.995 : 0,
  };

  const critical: number[] = [
    fieldConfidence.amount ?? 0,
    fieldConfidence.currency ?? 0,
    fieldConfidence.documentReference ?? 0,
    fieldConfidence.senderAccount ?? 0,
    fieldConfidence.receiverAccount ?? 0,
  ];
  const confidence = critical.reduce((sum, value) => sum + value, 0) / critical.length;
  const reviewRequired = missing.length > 0 || warnings.length > 0 || confidence < 0.98;

  return {
    matched: true,
    normalizedText: text,
    missing,
    anchorHits,
    extraction: {
      schemaVersion: 1,
      templateCode: TEMPLATE_CODE,
      templateVersion: TEMPLATE_VERSION,
      financialEntity: ENTITY,
      transactionType: "withdrawal",
      transactionDirection: "outgoing",
      amount,
      currency,
      documentReference,
      transactionDatetime,
      parties,
      confidence,
      fieldConfidence,
      warnings,
      reviewRequired,
    },
  };
}
