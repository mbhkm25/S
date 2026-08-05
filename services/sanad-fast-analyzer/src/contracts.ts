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

export type IdentifierType =
  | "financial_account_number"
  | "card_number"
  | "national_id"
  | "passport_number"
  | "phone_number"
  | "wallet_number"
  | "merchant_point"
  | "document_reference"
  | "transfer_reference"
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
  label?: string;
  confidence: number;
  evidence: Evidence[];
}

export interface ExtractedParty {
  role: "sender" | "receiver" | "credited_party" | "debited_party" | "beneficiary";
  name?: string;
  identifiers: ExtractedIdentifier[];
}

export interface CoreFinancialExtraction {
  schemaVersion: 1;
  templateCode: string;
  templateVersion: number;
  financialEntity: string;
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
