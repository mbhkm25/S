/**
 * Stage 2C.4 read-only Context Pack projection for ERP customer statements.
 * These checks protect UI routing; the existing ERP RPC is the authorization
 * boundary and revalidates the actor's current business access on each call.
 * Do not persist this projection as a permission grant.
 */
export type SanadVerifiedBusinessContext = {
  projectKind: 'business';
  businessId: string;
  threadId: string;
};

export type SanadCustomerStatementReference = {
  accountId: number | null | undefined;
  businessId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
};

export type SanadCustomerStatementTarget = {
  businessId: string;
  accountId: number;
  fromDate?: string | null;
  toDate?: string | null;
};

function validDate(value: string | null | undefined): boolean {
  if (!value) return true;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return false;
  const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
  const exact = new Date(Date.UTC(year, month - 1, day));
  return exact.getUTCFullYear() === year && exact.getUTCMonth() + 1 === month && exact.getUTCDate() === day;
}

/** Reject model-supplied business switching, uncertain account IDs and bad date windows. */
export function resolveSanadCustomerStatementTarget(
  verifiedContext: SanadVerifiedBusinessContext | null | undefined,
  source: SanadCustomerStatementReference,
): SanadCustomerStatementTarget | null {
  if (!verifiedContext?.threadId || verifiedContext.projectKind !== 'business' || !verifiedContext.businessId) return null;
  if (source.businessId && source.businessId !== verifiedContext.businessId) return null;
  if (!Number.isSafeInteger(source.accountId) || !source.accountId || source.accountId <= 0) return null;
  if (!validDate(source.fromDate) || !validDate(source.toDate)) return null;
  if (source.fromDate && source.toDate && source.fromDate > source.toDate) return null;
  return {
    businessId: verifiedContext.businessId,
    accountId: source.accountId,
    fromDate: source.fromDate || null,
    toDate: source.toDate || null,
  };
}

/**
 * Verified document hint for the EXISTING business document-detail RPC.
 * Identity must be a stable source document ID, never a model-provided URL.
 * A verified thread context only scopes frontend navigation; the RPC rechecks
 * current business membership for each request.
 */
export type SanadErpDocumentReference = {
  businessId?: string | null;
  documentId?: number | null;
  documentKind?: 'sale' | 'purchase' | null;
};

export type SanadErpDocumentTarget = {
  businessId: string;
  documentId: number;
  documentKind: 'sale' | 'purchase';
};

export function resolveSanadErpDocumentTarget(
  verifiedContext: SanadVerifiedBusinessContext | null | undefined,
  source: SanadErpDocumentReference,
): SanadErpDocumentTarget | null {
  if (!verifiedContext?.threadId || verifiedContext.projectKind !== 'business' || !verifiedContext.businessId) return null;
  if (source.businessId && source.businessId !== verifiedContext.businessId) return null;
  if (source.documentKind !== 'sale' && source.documentKind !== 'purchase') return null;
  if (!Number.isSafeInteger(source.documentId) || !source.documentId || source.documentId <= 0) return null;
  return {
    businessId: verifiedContext.businessId,
    documentId: source.documentId,
    documentKind: source.documentKind,
  };
}
