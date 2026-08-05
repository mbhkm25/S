export type Currency = "YER" | "SAR" | "USD";

export type TransactionDirection =
  | "incoming"
  | "outgoing"
  | "internal"
  | "unknown";

export type TransactionType =
  | "deposit"
  | "withdrawal"
  | "transfer"
  | "payment"
  | "credit_notice"
  | "account_transfer"
  | "unknown";

/**
 * Canonical SANAD financial identifier types used by business account routing.
 * Legacy aliases remain accepted while old parsers are migrated.
 */
export type IdentifierType =
  | "account_number"
  | "financial_account_number"
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
  | "document_reference"
  | "transfer_reference"
  | "other"
  | "unknown_identifier";

export interface Evidence {
  source: "pdf_text" | "ocr_region" | "regex" | "layout" | "derived";
  text?: string;
  region?: NormalizedRegion;
  rule?: string;
}

export interface ExtractedIdentifier {
  type: IdentifierType;
  value: string;
  /** Normalized by SANAD code, never trusted directly from the model. */
  normalizedValue?: string;
  /** Exact label printed in the source document, e.g. رقم المستفيد. */
  sourceLabel?: string;
  /** Backward-compatible alias used by existing local parsers. */
  label?: string;
  isPrimaryRoutingIdentifier?: boolean;
  confidence: number;
  evidence: Evidence[];
}

export interface ExtractedParty {
  role: "sender" | "receiver" | "credited_party" | "debited_party" | "beneficiary";
  name?: string;
  identifiers: ExtractedIdentifier[];
}

export interface CoreFinancialExtraction {
  schemaVersion: 1 | 2;
  templateCode: string;
  templateVersion: number;
  financialEntity: string;
  financialEntityCode?: string;
  transactionType: TransactionType;
  transactionDirection: TransactionDirection;
  amount?: number;
  feeAmount?: number;
  currency?: Currency;
  documentReference?: string;
  transferReference?: string;
  transactionDatetime?: string;
  merchantName?: string;
  merchantPoint?: string;
  parties: ExtractedParty[];
  confidence: number;
  fieldConfidence: Record<string, number>;
  warnings: string[];
  reviewRequired: boolean;
}

export interface NormalizedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TemplateAnchor {
  kind: "text" | "regex" | "color" | "geometry";
  value: string;
  weight: number;
  required?: boolean;
  region?: NormalizedRegion;
}

export interface TemplateFieldRule {
  field: string;
  sources: Array<"pdf_text" | "ocr_region" | "regex" | "derived">;
  region?: NormalizedRegion;
  patterns?: string[];
  validation?: string[];
}

export interface FinancialTemplateDefinition {
  code: string;
  version: number;
  entity: string;
  family: string;
  documentMode: "single_operation" | "multi_operation";
  acceptedMimeTypes: string[];
  anchors: TemplateAnchor[];
  fields: TemplateFieldRule[];
  semanticGuards: string[];
  minimumTemplateConfidence: number;
  minimumCoreConfidence: number;
  status: "draft" | "shadow" | "active" | "retired";
}
