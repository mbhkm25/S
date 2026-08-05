import type { CoreFinancialExtraction, ExtractedIdentifier } from "./contracts.ts";
import { normalizeIdentifierValue, toRoutingIdentifier } from "./routing-match.ts";

export type ShadowFieldStatus = "match" | "mismatch" | "missing_both" | "missing_shadow" | "missing_production";

export interface ProductionOperationSnapshot {
  financialEntity?: string | null;
  financialEntityCode?: string | null;
  transactionType?: string | null;
  transactionDirection?: string | null;
  amount?: number | null;
  currency?: string | null;
  receiverName?: string | null;
  receiverIdentifierType?: string | null;
  receiverIdentifierValue?: string | null;
  referenceNumber?: string | null;
  transactionDatetime?: string | null;
}

export interface ShadowFieldComparison {
  status: ShadowFieldStatus;
  production: string | number | null;
  shadow: string | number | null;
}

export interface ShadowComparisonResult {
  criticalMatchCount: number;
  criticalFieldCount: number;
  criticalAccuracy: number;
  exactCriticalMatch: boolean;
  fields: Record<string, ShadowFieldComparison>;
}

function comparableString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function normalizeText(value: unknown): string | null {
  const text = comparableString(value);
  return text?.toLowerCase().replace(/\s+/g, " ") ?? null;
}

function normalizeDigits(value: unknown): string | null {
  const text = comparableString(value);
  if (!text) return null;
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  return text
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[^0-9a-z]/gi, "") || null;
}

function normalizeDate(value: unknown): string | null {
  const text = comparableString(value);
  if (!text) return null;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? text;
}

function compareValues(
  production: unknown,
  shadow: unknown,
  normalizer: (value: unknown) => string | null = normalizeText,
): ShadowFieldComparison {
  const left = production === undefined ? null : production as string | number | null;
  const right = shadow === undefined ? null : shadow as string | number | null;
  const normalizedLeft = normalizer(production);
  const normalizedRight = normalizer(shadow);
  if (normalizedLeft === null && normalizedRight === null) {
    return { status: "missing_both", production: left, shadow: right };
  }
  if (normalizedLeft === null) {
    return { status: "missing_production", production: left, shadow: right };
  }
  if (normalizedRight === null) {
    return { status: "missing_shadow", production: left, shadow: right };
  }
  return {
    status: normalizedLeft === normalizedRight ? "match" : "mismatch",
    production: left,
    shadow: right,
  };
}

function receiverIdentifiers(extraction: CoreFinancialExtraction): ExtractedIdentifier[] {
  const roles = new Set(["receiver", "beneficiary", "credited_party"]);
  return extraction.parties
    .filter((party) => roles.has(party.role))
    .flatMap((party) => party.identifiers);
}

function primaryReceiverIdentifier(extraction: CoreFinancialExtraction) {
  const identifiers = receiverIdentifiers(extraction);
  return identifiers.find((item) => item.isPrimaryRoutingIdentifier) ?? identifiers[0] ?? null;
}

function normalizeIdentifier(type: unknown, value: unknown): string | null {
  const identifierValue = comparableString(value);
  if (!identifierValue) return null;
  const identifierType = comparableString(type);
  if (identifierType === "phone_number") {
    return normalizeIdentifierValue("phone_number", identifierValue);
  }
  return normalizeDigits(identifierValue);
}

export function compareShadowExtraction(
  production: ProductionOperationSnapshot,
  shadow: CoreFinancialExtraction,
): ShadowComparisonResult {
  const receiver = shadow.parties.find((party) =>
    party.role === "receiver" || party.role === "beneficiary" || party.role === "credited_party"
  );
  const identifier = primaryReceiverIdentifier(shadow);
  const routingIdentifier = identifier ? toRoutingIdentifier(identifier) : null;

  const fields: Record<string, ShadowFieldComparison> = {
    financial_entity: compareValues(production.financialEntity, shadow.financialEntity),
    financial_entity_code: compareValues(production.financialEntityCode, shadow.financialEntityCode),
    transaction_type: compareValues(production.transactionType, shadow.transactionType),
    transaction_direction: compareValues(production.transactionDirection, shadow.transactionDirection),
    amount: compareValues(production.amount, shadow.amount, (value) => {
      if (value === undefined || value === null || value === "") return null;
      const number = Number(value);
      return Number.isFinite(number) ? number.toFixed(2) : null;
    }),
    currency: compareValues(production.currency, shadow.currency),
    receiver_name: compareValues(production.receiverName, receiver?.name),
    receiver_identifier_type: compareValues(
      production.receiverIdentifierType,
      routingIdentifier?.type ?? identifier?.type,
    ),
    receiver_identifier_value: {
      ...compareValues(
        normalizeIdentifier(production.receiverIdentifierType, production.receiverIdentifierValue),
        routingIdentifier?.value ?? identifier?.value,
        normalizeText,
      ),
      production: production.receiverIdentifierValue ?? null,
      shadow: identifier?.value ?? null,
    },
    reference_number: compareValues(production.referenceNumber, shadow.documentReference, normalizeDigits),
    transaction_datetime: compareValues(
      production.transactionDatetime,
      shadow.transactionDatetime,
      normalizeDate,
    ),
  };

  const criticalKeys = [
    "financial_entity",
    "amount",
    "currency",
    "receiver_identifier_type",
    "receiver_identifier_value",
    "reference_number",
    "transaction_datetime",
  ];
  const criticalMatchCount = criticalKeys.filter((key) => fields[key]?.status === "match").length;
  const criticalFieldCount = criticalKeys.length;

  return {
    criticalMatchCount,
    criticalFieldCount,
    criticalAccuracy: criticalFieldCount ? criticalMatchCount / criticalFieldCount : 0,
    exactCriticalMatch: criticalMatchCount === criticalFieldCount,
    fields,
  };
}
