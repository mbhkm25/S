import type { CoreFinancialExtraction, ExtractedIdentifier, ExtractedParty } from "../contracts.ts";
import type { ExecutionScore, FieldScore } from "./contracts.ts";

const CRITICAL_FIELDS = new Set([
  "financialEntity",
  "templateCode",
  "transactionType",
  "transactionDirection",
  "amount",
  "currency",
  "documentReference",
  "transferReference",
  "transactionDatetime",
  "identifiers",
]);

function normalize(value: unknown): unknown {
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ").toLowerCase();
  if (typeof value === "number") return Number(value.toFixed(4));
  return value;
}

function identifiers(parties: ExtractedParty[]): string[] {
  return parties.flatMap((party) =>
    party.identifiers.map((identifier: ExtractedIdentifier) =>
      `${party.role}:${identifier.type}:${identifier.value}`
    )
  ).sort();
}

function comparable(extraction: CoreFinancialExtraction): Record<string, unknown> {
  return {
    financialEntity: extraction.financialEntity,
    templateCode: extraction.templateCode,
    transactionType: extraction.transactionType,
    transactionDirection: extraction.transactionDirection,
    amount: extraction.amount,
    feeAmount: extraction.feeAmount,
    currency: extraction.currency,
    documentReference: extraction.documentReference,
    transferReference: extraction.transferReference,
    transactionDatetime: extraction.transactionDatetime,
    merchantName: extraction.merchantName,
    merchantPoint: extraction.merchantPoint,
    identifiers: identifiers(extraction.parties),
  };
}

function equal(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return expected.length === actual.length && expected.every((value, index) => value === actual[index]);
  }
  return normalize(expected) === normalize(actual);
}

export function scoreExecution(
  engine: string,
  caseId: string,
  durationMs: number,
  expected: CoreFinancialExtraction,
  actual?: CoreFinancialExtraction,
  error?: string,
): ExecutionScore {
  const expectedValues = comparable(expected);
  const actualValues = actual ? comparable(actual) : {};
  const fields: FieldScore[] = Object.entries(expectedValues).map(([field, expectedValue]) => ({
    field,
    expected: expectedValue,
    actual: actualValues[field],
    matched: actual ? equal(expectedValue, actualValues[field]) : false,
    critical: CRITICAL_FIELDS.has(field),
  }));

  const score = fields.filter((field) => field.matched).length / fields.length;
  const critical = fields.filter((field) => field.critical);
  const criticalScore = critical.filter((field) => field.matched).length / critical.length;

  return {
    engine,
    caseId,
    durationMs,
    score,
    criticalScore,
    reviewRequired: actual?.reviewRequired ?? true,
    fields,
    error,
  };
}
