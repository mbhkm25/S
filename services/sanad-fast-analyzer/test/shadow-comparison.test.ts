import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { CoreFinancialExtraction } from "../src/contracts.ts";
import { compareShadowExtraction } from "../src/shadow-comparison.ts";

const shadow: CoreFinancialExtraction = {
  schemaVersion: 2,
  templateCode: "bin_dowal_pay_transfer_v1",
  templateVersion: 1,
  financialEntity: "بن دول باي",
  financialEntityCode: "bin_dowal_pay",
  transactionType: "transfer",
  transactionDirection: "outgoing",
  amount: 25000,
  currency: "YER",
  documentReference: "BDP-123456",
  transactionDatetime: "2026-08-05T19:40:00+03:00",
  parties: [{
    role: "beneficiary",
    name: "متجر النور",
    identifiers: [{
      type: "phone_number",
      value: "777 123 456",
      sourceLabel: "رقم المستفيد",
      isPrimaryRoutingIdentifier: true,
      confidence: 0.99,
      evidence: [],
    }],
  }],
  confidence: 0.98,
  fieldConfidence: {},
  warnings: [],
  reviewRequired: false,
};

Deno.test("shadow comparison treats Yemeni phone variants as the same routing value", () => {
  const result = compareShadowExtraction({
    financialEntity: "بن دول باي",
    financialEntityCode: "bin_dowal_pay",
    transactionType: "transfer",
    transactionDirection: "outgoing",
    amount: 25000,
    currency: "YER",
    receiverName: "متجر النور",
    receiverIdentifierType: "phone_number",
    receiverIdentifierValue: "+967777123456",
    referenceNumber: "BDP-123456",
    transactionDatetime: "2026-08-05T19:40:58+03:00",
  }, shadow);

  assertEquals(result.fields.receiver_identifier_value?.status, "match");
  assertEquals(result.fields.transaction_datetime?.status, "match");
  assertEquals(result.exactCriticalMatch, true);
  assertEquals(result.criticalAccuracy, 1);
});

Deno.test("shadow comparison reports a one-digit phone OCR error as a mismatch", () => {
  const broken: CoreFinancialExtraction = structuredClone(shadow);
  broken.parties[0]!.identifiers[0]!.value = "77712345";

  const result = compareShadowExtraction({
    financialEntity: "بن دول باي",
    financialEntityCode: "bin_dowal_pay",
    amount: 25000,
    currency: "YER",
    receiverIdentifierType: "phone_number",
    receiverIdentifierValue: "777123456",
    referenceNumber: "BDP-123456",
    transactionDatetime: "2026-08-05T19:40:00+03:00",
  }, broken);

  assertEquals(result.fields.receiver_identifier_value?.status, "mismatch");
  assertEquals(result.exactCriticalMatch, false);
  assertEquals(result.criticalMatchCount, 6);
});
