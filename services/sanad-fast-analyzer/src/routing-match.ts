import type { ExtractedIdentifier, IdentifierType } from "./contracts.ts";

export type RoutingIdentifierType =
  | "account_number"
  | "wallet_number"
  | "customer_line"
  | "merchant_point"
  | "terminal_number"
  | "phone_number"
  | "national_id"
  | "passport_number"
  | "unique_account_name"
  | "iban"
  | "other";

export interface VerifiedBusinessIdentifier {
  businessId: string;
  financialAccountId: string;
  financialEntityCode: string;
  identifierType: RoutingIdentifierType;
  identifierValue: string;
  accountHolderName?: string | null;
  routingEnabled: boolean;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
}

export interface RoutingCandidate {
  businessId: string;
  financialAccountId: string;
  identifierType: RoutingIdentifierType;
  normalizedIdentifierValue: string;
  score: number;
  nameAgreement: "not_checked" | "agree" | "weak" | "conflict";
}

export interface RoutingDecision {
  status: "matched" | "review_required" | "unmatched";
  reason:
    | "unique_verified_identifier"
    | "multiple_identifier_matches"
    | "name_conflict"
    | "no_verified_identifier"
    | "missing_routing_identifier";
  candidate?: RoutingCandidate;
  candidates: RoutingCandidate[];
}

const TYPE_ALIASES: Partial<Record<IdentifierType, RoutingIdentifierType>> = {
  financial_account_number: "account_number",
  account_number: "account_number",
  wallet_number: "wallet_number",
  customer_line: "customer_line",
  merchant_point: "merchant_point",
  terminal_number: "terminal_number",
  phone_number: "phone_number",
  national_id: "national_id",
  passport_number: "passport_number",
  unique_account_name: "unique_account_name",
  iban: "iban",
  other: "other",
};

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function latinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)));
}

function normalizePhone(value: string, defaultCountryCode = "967"): string {
  let digits = latinDigits(value).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith(defaultCountryCode)) return digits;
  if (digits.startsWith("0") && digits.length >= 9) digits = digits.slice(1);
  if (digits.length === 9) return `${defaultCountryCode}${digits}`;
  return digits;
}

export function normalizeIdentifierValue(
  type: RoutingIdentifierType,
  value: string,
): string {
  const normalized = latinDigits(value).trim().toLowerCase();
  if (type === "phone_number") return normalizePhone(normalized);
  if (type === "unique_account_name") {
    return normalized
      .normalize("NFKD")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }
  if (type === "iban") return normalized.replace(/[^a-z0-9]/g, "").toUpperCase();
  return normalized.replace(/[^a-z0-9]/g, "");
}

function normalizeName(value: string): string {
  return latinDigits(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function compareNames(extractedName?: string, accountHolderName?: string | null) {
  if (!extractedName || !accountHolderName) return "not_checked" as const;
  const left = normalizeName(extractedName);
  const right = normalizeName(accountHolderName);
  if (!left || !right) return "not_checked" as const;
  if (left === right || left.includes(right) || right.includes(left)) return "agree" as const;

  const leftTokens = new Set(extractedName.split(/\s+/).map(normalizeName).filter(Boolean));
  const rightTokens = new Set(accountHolderName.split(/\s+/).map(normalizeName).filter(Boolean));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  if (overlap >= 1) return "weak" as const;
  return "conflict" as const;
}

export function toRoutingIdentifier(
  identifier: ExtractedIdentifier,
): { type: RoutingIdentifierType; value: string } | null {
  const type = TYPE_ALIASES[identifier.type];
  if (!type || !identifier.value.trim()) return null;
  return { type, value: normalizeIdentifierValue(type, identifier.value) };
}

export function matchBusinessRoutingIdentifier(input: {
  financialEntityCode: string;
  receiverName?: string;
  identifiers: ExtractedIdentifier[];
  verifiedIdentifiers: VerifiedBusinessIdentifier[];
}): RoutingDecision {
  const extracted = input.identifiers
    .filter((identifier) => identifier.confidence >= 0.75)
    .map((identifier) => ({ source: identifier, routing: toRoutingIdentifier(identifier) }))
    .filter((item): item is { source: ExtractedIdentifier; routing: { type: RoutingIdentifierType; value: string } } =>
      item.routing !== null && item.routing.value.length > 0
    );

  if (extracted.length === 0) {
    return { status: "unmatched", reason: "missing_routing_identifier", candidates: [] };
  }

  const candidates: RoutingCandidate[] = [];
  for (const stored of input.verifiedIdentifiers) {
    if (!stored.routingEnabled || stored.verificationStatus !== "verified") continue;
    if (stored.financialEntityCode !== input.financialEntityCode) continue;

    const storedValue = normalizeIdentifierValue(stored.identifierType, stored.identifierValue);
    const found = extracted.find((item) =>
      item.routing.type === stored.identifierType && item.routing.value === storedValue
    );
    if (!found) continue;

    const nameAgreement = compareNames(input.receiverName, stored.accountHolderName);
    const primaryBoost = found.source.isPrimaryRoutingIdentifier ? 0.05 : 0;
    const nameBoost = nameAgreement === "agree" ? 0.08 : nameAgreement === "weak" ? 0.02 : 0;
    const namePenalty = nameAgreement === "conflict" ? 0.25 : 0;
    candidates.push({
      businessId: stored.businessId,
      financialAccountId: stored.financialAccountId,
      identifierType: stored.identifierType,
      normalizedIdentifierValue: storedValue,
      score: Math.max(0, Math.min(1, found.source.confidence + primaryBoost + nameBoost - namePenalty)),
      nameAgreement,
    });
  }

  if (candidates.length === 0) {
    return { status: "unmatched", reason: "no_verified_identifier", candidates: [] };
  }

  candidates.sort((a, b) => b.score - a.score);
  const uniqueAccounts = new Set(candidates.map((candidate) => candidate.financialAccountId));
  if (uniqueAccounts.size > 1) {
    return { status: "review_required", reason: "multiple_identifier_matches", candidates };
  }

  const candidate = candidates[0];
  if (!candidate) {
    return { status: "unmatched", reason: "no_verified_identifier", candidates: [] };
  }
  if (candidate.nameAgreement === "conflict") {
    return { status: "review_required", reason: "name_conflict", candidate, candidates };
  }

  return { status: "matched", reason: "unique_verified_identifier", candidate, candidates };
}
