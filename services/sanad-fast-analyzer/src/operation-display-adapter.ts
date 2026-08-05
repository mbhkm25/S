import type {
  CoreFinancialExtraction,
  ExtractedIdentifier,
  ExtractedParty,
  IdentifierType,
} from "./contracts.ts";

/**
 * Identifier types understood by the current operation-details and incoming
 * payments UI. The UI owns the localized card title; this adapter only keeps
 * the raw value and its semantic type together.
 */
export type OperationDisplayIdentifierType =
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

export interface OperationDisplayIdentifier {
  /** Exact value extracted from the document; never a routing-normalized value. */
  value: string;
  type: OperationDisplayIdentifierType;
  sourceLabel?: string;
}

export interface LegacyOperationDisplayFields {
  /**
   * Backward-compatible storage/display field. Despite its historical name,
   * it may contain a phone, wallet, customer line, or another identifier.
   */
  receiver_account: string | null;
  /** Drives the dynamic localized card title in existing operation UIs. */
  receiver_identifier_type: OperationDisplayIdentifierType | null;
  receiver_identifier_label: string | null;
}

const DISPLAY_TYPE_ALIASES: Partial<
  Record<IdentifierType, OperationDisplayIdentifierType>
> = {
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

const RECEIVER_ROLE_PRIORITY: ExtractedParty["role"][] = [
  "beneficiary",
  "receiver",
  "credited_party",
];

function displayTypeFor(identifier: ExtractedIdentifier) {
  return DISPLAY_TYPE_ALIASES[identifier.type] ?? null;
}

function pickFromParty(party: ExtractedParty): OperationDisplayIdentifier | null {
  const candidates = party.identifiers
    .map((identifier) => ({ identifier, type: displayTypeFor(identifier) }))
    .filter((candidate): candidate is {
      identifier: ExtractedIdentifier;
      type: OperationDisplayIdentifierType;
    } => Boolean(candidate.type && candidate.identifier.value.trim()))
    .sort((left, right) => {
      const primaryDelta = Number(Boolean(right.identifier.isPrimaryRoutingIdentifier)) -
        Number(Boolean(left.identifier.isPrimaryRoutingIdentifier));
      if (primaryDelta !== 0) return primaryDelta;
      return right.identifier.confidence - left.identifier.confidence;
    });

  const selected = candidates[0];
  if (!selected) return null;

  return {
    // Preserve the document value exactly for UI display and auditability.
    value: selected.identifier.value,
    type: selected.type,
    sourceLabel: selected.identifier.sourceLabel ?? selected.identifier.label,
  };
}

export function selectOperationDisplayIdentifier(
  extraction: CoreFinancialExtraction,
): OperationDisplayIdentifier | null {
  for (const role of RECEIVER_ROLE_PRIORITY) {
    const parties = extraction.parties.filter((party) => party.role === role);
    for (const party of parties) {
      const selected = pickFromParty(party);
      if (selected) return selected;
    }
  }
  return null;
}

export function toLegacyOperationDisplayFields(
  extraction: CoreFinancialExtraction,
): LegacyOperationDisplayFields {
  const identifier = selectOperationDisplayIdentifier(extraction);
  return {
    receiver_account: identifier?.value ?? null,
    receiver_identifier_type: identifier?.type ?? null,
    receiver_identifier_label: identifier?.sourceLabel ?? null,
  };
}
