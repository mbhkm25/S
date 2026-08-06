export const SEMANTIC_IDENTIFIER_TYPES = [
  "account_number",
  "financial_account_number",
  "wallet_number",
  "customer_line",
  "financial_line",
  "merchant_point",
  "terminal_number",
  "phone_number",
  "national_id",
  "passport_number",
  "unique_account_name",
  "iban",
  "card_number",
  "document_reference",
  "transfer_reference",
  "other",
  "unknown_identifier",
  "unknown",
] as const;

export type SemanticIdentifierType = typeof SEMANTIC_IDENTIFIER_TYPES[number];

export const OPERATION_IDENTIFIER_TYPES = [
  "account_number",
  "wallet_number",
  "financial_line",
  "merchant_point",
  "terminal_number",
  "phone_number",
  "iban",
  "other",
  "unknown",
] as const;

export type OperationIdentifierType = typeof OPERATION_IDENTIFIER_TYPES[number];

const OPERATION_IDENTIFIER_TYPE_SET = new Set<string>(OPERATION_IDENTIFIER_TYPES);

/**
 * Projects the richer extraction vocabulary into the stable operations-table
 * vocabulary. The semantic value must remain unchanged in structured_data.
 */
export function toOperationIdentifierType(
  value: unknown,
): OperationIdentifierType {
  const type = typeof value === "string" ? value.trim() : "";

  if (OPERATION_IDENTIFIER_TYPE_SET.has(type)) {
    return type as OperationIdentifierType;
  }

  switch (type) {
    case "financial_account_number":
      return "account_number";
    case "customer_line":
      return "financial_line";
    case "unique_account_name":
    case "national_id":
    case "passport_number":
    case "card_number":
    case "document_reference":
    case "transfer_reference":
      return "other";
    case "unknown_identifier":
    case "":
      return "unknown";
    default:
      return "unknown";
  }
}

export function buildIdentifierPersistenceProjection(value: unknown) {
  const semanticType = typeof value === "string" && value.trim()
    ? value.trim()
    : "unknown_identifier";

  return {
    semantic_type: semanticType,
    operation_type: toOperationIdentifierType(semanticType),
    projected: semanticType !== toOperationIdentifierType(semanticType),
  } as const;
}
