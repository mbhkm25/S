import type { CoreFinancialExtraction } from "../src/contracts.ts";
import {
  selectOperationDisplayIdentifier,
  toLegacyOperationDisplayFields,
} from "../src/operation-display-adapter.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function extractionWithReceiverIdentifier(input: {
  type: "account_number" | "phone_number" | "wallet_number";
  value: string;
  normalizedValue?: string;
  sourceLabel?: string;
}): CoreFinancialExtraction {
  return {
    schemaVersion: 2,
    templateCode: "test-template",
    templateVersion: 1,
    financialEntity: "Test Entity",
    financialEntityCode: "test_entity",
    transactionType: "transfer",
    transactionDirection: "incoming",
    amount: 100,
    currency: "YER",
    parties: [{
      role: "beneficiary",
      identifiers: [{
        type: input.type,
        value: input.value,
        normalizedValue: input.normalizedValue,
        sourceLabel: input.sourceLabel,
        isPrimaryRoutingIdentifier: true,
        confidence: 0.99,
        evidence: [],
      }],
    }],
    confidence: 0.99,
    fieldConfidence: {},
    warnings: [],
    reviewRequired: false,
  };
}

Deno.test("keeps a beneficiary phone as phone_number for the dynamic UI card", () => {
  const extraction = extractionWithReceiverIdentifier({
    type: "phone_number",
    value: "777 123 456",
    normalizedValue: "967777123456",
    sourceLabel: "رقم المستفيد",
  });

  const identifier = selectOperationDisplayIdentifier(extraction);
  assert(identifier?.type === "phone_number", "phone must not become account_number");
  assert(identifier.value === "777 123 456", "display must preserve the raw document value");

  const fields = toLegacyOperationDisplayFields(extraction);
  assert(fields.receiver_identifier_type === "phone_number", "dynamic title type was lost");
  assert(fields.receiver_account === "777 123 456", "normalized phone leaked into display field");
  assert(fields.receiver_identifier_label === "رقم المستفيد", "source label was not preserved");
});

Deno.test("keeps an account identifier as account_number for the dynamic UI card", () => {
  const fields = toLegacyOperationDisplayFields(extractionWithReceiverIdentifier({
    type: "account_number",
    value: "0012-3456-7890",
    normalizedValue: "001234567890",
    sourceLabel: "رقم الحساب",
  }));

  assert(fields.receiver_identifier_type === "account_number", "account type was changed");
  assert(fields.receiver_account === "0012-3456-7890", "account display formatting was lost");
});

Deno.test("prefers the primary identifier without mixing raw and normalized values", () => {
  const extraction = extractionWithReceiverIdentifier({
    type: "wallet_number",
    value: "WALLET-55 01",
    normalizedValue: "wallet5501",
    sourceLabel: "رقم المحفظة",
  });
  extraction.parties[0]?.identifiers.push({
    type: "account_number",
    value: "123456",
    normalizedValue: "123456",
    confidence: 0.80,
    evidence: [],
  });

  const fields = toLegacyOperationDisplayFields(extraction);
  assert(fields.receiver_identifier_type === "wallet_number", "primary wallet was not selected");
  assert(fields.receiver_account === "WALLET-55 01", "raw wallet value was not preserved");
});

Deno.test("returns null display fields when no receiver-side identifier exists", () => {
  const extraction = extractionWithReceiverIdentifier({
    type: "phone_number",
    value: "777123456",
  });
  extraction.parties = [{
    role: "sender",
    identifiers: [{
      type: "phone_number",
      value: "777123456",
      confidence: 0.99,
      evidence: [],
    }],
  }];

  const fields = toLegacyOperationDisplayFields(extraction);
  assert(fields.receiver_account === null, "sender identifier must not populate receiver display");
  assert(fields.receiver_identifier_type === null, "sender type must not drive receiver title");
});
