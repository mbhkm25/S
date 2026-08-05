import type { CoreFinancialExtraction } from "../contracts.ts";
import { normalizeArabicFinancialText } from "../text-normalization.ts";
import { parseAmqiMobileDepositText } from "./amqi-mobile-deposit.ts";
import { parseAmqiMobileWithdrawalText } from "./amqi-mobile-withdrawal.ts";

export type AmqiTemplateKind = "deposit" | "withdrawal" | "unknown";

export interface AmqiFamilyResult {
  matched: boolean;
  kind: AmqiTemplateKind;
  extraction?: CoreFinancialExtraction;
  reasons: string[];
}

/**
 * PDF text engines disagree on RTL token order. Poppler may expose
 * `PM 08!29 2025-06-05`, while PDF.js/unpdf may expose `29!08PM`.
 * Convert only the explicit prefix-period form into logical hour-minute order;
 * the deposit/withdrawal parsers already repair the suffix malformed form.
 */
export function normalizeAmqiExtractorOrder(rawText: string): string {
  return rawText.replace(
    /\b(AM|PM)\s*(\d{1,2})\s*[:!]\s*(\d{2})(?=\s+20\d{2}-\d{2}-\d{2})/gi,
    (_match, period: string, hour: string, minute: string) => `${hour}:${minute}${period}`,
  );
}

export function classifyAmqiTemplate(rawText: string): AmqiTemplateKind {
  const text = normalizeArabicFinancialText(rawText);
  const hasWithdrawal = /إشعار\s*سحب/u.test(text) || /قيدنا\s*على\s*حسابكم/u.test(text);
  const hasDeposit = /إشعار\s*إيداع/u.test(text) || /قيدنا\s*لحسابكم/u.test(text);

  if (hasWithdrawal && !hasDeposit) return "withdrawal";
  if (hasDeposit && !hasWithdrawal) return "deposit";
  return "unknown";
}

export function parseAmqiFamilyText(rawText: string): AmqiFamilyResult {
  const orderedText = normalizeAmqiExtractorOrder(rawText);
  const kind = classifyAmqiTemplate(orderedText);
  if (kind === "withdrawal") {
    const result = parseAmqiMobileWithdrawalText(orderedText);
    return {
      matched: result.matched,
      kind,
      extraction: result.extraction,
      reasons: [...result.missing, ...(result.extraction?.warnings ?? [])],
    };
  }

  if (kind === "deposit") {
    const result = parseAmqiMobileDepositText(orderedText);
    return {
      matched: result.matched,
      kind,
      extraction: result.extraction,
      reasons: [...result.missing, ...(result.extraction?.warnings ?? [])],
    };
  }

  return {
    matched: false,
    kind: "unknown",
    reasons: ["amqi_template_direction_ambiguous_or_unknown"],
  };
}
