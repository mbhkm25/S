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

export function classifyAmqiTemplate(rawText: string): AmqiTemplateKind {
  const text = normalizeArabicFinancialText(rawText);
  const hasWithdrawal = /إشعار\s*سحب/u.test(text) || /قيدنا\s*على\s*حسابكم/u.test(text);
  const hasDeposit = /إشعار\s*إيداع/u.test(text) || /قيدنا\s*لحسابكم/u.test(text);

  if (hasWithdrawal && !hasDeposit) return "withdrawal";
  if (hasDeposit && !hasWithdrawal) return "deposit";
  return "unknown";
}

export function parseAmqiFamilyText(rawText: string): AmqiFamilyResult {
  const kind = classifyAmqiTemplate(rawText);
  if (kind === "withdrawal") {
    const result = parseAmqiMobileWithdrawalText(rawText);
    return {
      matched: result.matched,
      kind,
      extraction: result.extraction,
      reasons: [...result.missing, ...(result.extraction?.warnings ?? [])],
    };
  }

  if (kind === "deposit") {
    const result = parseAmqiMobileDepositText(rawText);
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
