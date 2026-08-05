export type ShadowIdentifierType =
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
  | "card_number"
  | "other"
  | "unknown_identifier";

export interface ShadowPartyIdentifier {
  type: ShadowIdentifierType;
  value: string;
  confidence?: number | null;
  isPrimaryRoutingIdentifier?: boolean;
}

export interface ShadowParty {
  role: "sender" | "receiver" | "credited_party" | "debited_party" | "beneficiary";
  identifiers: ShadowPartyIdentifier[];
}

export interface ShadowRoutingInput {
  financialEntity: string | null;
  financialEntityCode: string | null;
  confidence: number | null;
  reviewRequired: boolean;
  receiverIdentifierType: ShadowIdentifierType | null;
  receiverIdentifierValue: string | null;
  receiverIdentifierConfidence?: number | null;
  parties: ShadowParty[];
}

export interface ShadowRoutingDecision {
  status: "eligible" | "review_required";
  eligible: boolean;
  reasons: string[];
}

const NON_ROUTABLE_IDENTIFIER_TYPES = new Set<ShadowIdentifierType>([
  "national_id",
  "passport_number",
  "card_number",
  "other",
  "unknown_identifier",
]);

export function evaluateShadowRouting(input: ShadowRoutingInput): ShadowRoutingDecision {
  const reasons: string[] = [];
  const entity = normalizeText(input.financialEntity);
  const entityCode = normalizeText(input.financialEntityCode);

  if (!entity || entity === "unknown" || entity.includes("غيرمعروف") || entityCode === "other") {
    reasons.push("financial_entity_unresolved");
  }

  if (input.reviewRequired) {
    reasons.push("model_review_required");
  }

  if (typeof input.confidence === "number" && input.confidence < 0.85) {
    reasons.push("overall_confidence_below_threshold");
  }

  if (!input.receiverIdentifierValue) {
    reasons.push("receiver_identifier_missing");
  }

  if (!input.receiverIdentifierType) {
    reasons.push("receiver_identifier_type_missing");
  } else if (NON_ROUTABLE_IDENTIFIER_TYPES.has(input.receiverIdentifierType)) {
    reasons.push("receiver_identifier_type_not_routable");
  }

  if (
    typeof input.receiverIdentifierConfidence === "number" &&
    input.receiverIdentifierConfidence < 0.85
  ) {
    reasons.push("receiver_identifier_confidence_below_threshold");
  }

  if (
    input.receiverIdentifierValue &&
    input.receiverIdentifierType &&
    matchesSenderIdentifier(
      input.receiverIdentifierType,
      input.receiverIdentifierValue,
      input.parties,
    )
  ) {
    reasons.push("receiver_identifier_matches_sender");
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    status: uniqueReasons.length === 0 ? "eligible" : "review_required",
    eligible: uniqueReasons.length === 0,
    reasons: uniqueReasons,
  };
}

function matchesSenderIdentifier(
  type: ShadowIdentifierType,
  receiverValue: string,
  parties: ShadowParty[],
): boolean {
  const normalizedReceiver = normalizeIdentifier(type, receiverValue);
  if (!normalizedReceiver) return false;

  return parties
    .filter((party) => party.role === "sender" || party.role === "debited_party")
    .flatMap((party) => party.identifiers)
    .some((identifier) =>
      normalizeIdentifier(identifier.type, identifier.value) === normalizedReceiver
    );
}

function normalizeIdentifier(type: ShadowIdentifierType, value: string): string {
  if (type === "phone_number") return normalizeYemeniPhone(value);
  return toLatinDigits(value).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeYemeniPhone(value: string): string {
  let digits = toLatinDigits(value).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("967")) return digits;
  if (digits.startsWith("0") && digits.length >= 9) digits = digits.slice(1);
  return digits.length === 9 ? `967${digits}` : digits;
}

function normalizeText(value: string | null): string {
  return toLatinDigits(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function toLatinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}
