export type LocalOperationStatus =
  | 'local_only'
  | 'pending_processing'
  | 'ocr_running'
  | 'ocr_completed'
  | 'local_analyzed'
  | 'review_required'
  | 'queued_for_sync'
  | 'syncing'
  | 'synced'
  | 'retry_wait'
  | 'sync_failed'
  | 'conflict';

export type FinancialCurrency = 'YER' | 'SAR' | 'USD';

export type FinancialIdentifierType =
  | 'account_number'
  | 'wallet_number'
  | 'customer_line'
  | 'merchant_point'
  | 'terminal_number'
  | 'phone_number'
  | 'national_id'
  | 'passport_number'
  | 'unique_account_name'
  | 'iban'
  | 'card_number'
  | 'other'
  | 'unknown_identifier';

export interface OcrTextBlock {
  text: string;
  confidence?: number;
  page?: number;
  bounds?: { left: number; top: number; right: number; bottom: number };
}

export interface LocalOcrResult {
  provider: string;
  providerVersion?: string;
  rawText: string;
  confidence: number;
  durationMs: number;
  blocks?: OcrTextBlock[];
  warnings: string[];
}

export interface EvidenceCandidate {
  value: string;
  line?: string;
  kind?: string;
  score?: number;
}

export interface FinancialFieldCandidates {
  amounts: EvidenceCandidate[];
  currencies: EvidenceCandidate[];
  references: EvidenceCandidate[];
  dates: EvidenceCandidate[];
  identifiers: EvidenceCandidate[];
  entityHints: EvidenceCandidate[];
}

export interface FinancialIdentifier {
  type: FinancialIdentifierType;
  value: string;
  sourceLabel?: string | null;
  isPrimaryRoutingIdentifier: boolean;
  confidence: number;
}

export type FinancialPartyRole =
  | 'sender'
  | 'receiver'
  | 'credited_party'
  | 'debited_party'
  | 'beneficiary';

export interface FinancialParty {
  role: FinancialPartyRole;
  name?: string | null;
  identifiers: FinancialIdentifier[];
}

export interface StructuredFinancialAnalysis {
  schemaVersion: number;
  financialEntity: string;
  financialEntityCode: string;
  templateCode: string;
  transactionType: 'deposit' | 'withdrawal' | 'transfer' | 'payment' | 'unknown';
  transactionDirection: 'incoming' | 'outgoing' | 'internal' | 'unknown';
  amount: number | null;
  currency: FinancialCurrency | null;
  documentReference: string | null;
  transferReference: string | null;
  transactionDatetime: string | null;
  merchantPoint: string | null;
  parties: FinancialParty[];
  confidence: number;
  warnings: string[];
  reviewRequired: boolean;
}

export interface AnalysisGrounding {
  criticalChecked: number;
  criticalGrounded: number;
  criticalGroundingRatio: number | null;
  criticalFullyGrounded: boolean;
  mismatches: string[];
  fallbackRecommended: boolean;
  fallbackReasons: string[];
}

export interface LocalAnalysisRevision {
  revision: number;
  source: 'local_rules' | 'cloud_text_semantic' | 'cloud_vision' | 'human';
  ocr?: LocalOcrResult;
  candidates?: FinancialFieldCandidates;
  structured?: StructuredFinancialAnalysis;
  grounding?: AnalysisGrounding;
  createdAt: string;
}

export interface LocalOperationIdentity {
  localId: string;
  cloudOperationId?: string | null;
  fileSha256: string;
}

export interface SyncEnvelope {
  localId: string;
  idempotencyKey: string;
  fileSha256: string;
  analysisRevision: number;
  cloudOperationId?: string | null;
}

export interface LocalOcrAdapter {
  readonly provider: string;
  recognize(input: { localId: string; fileUri: string; mimeType: string }): Promise<LocalOcrResult>;
}
