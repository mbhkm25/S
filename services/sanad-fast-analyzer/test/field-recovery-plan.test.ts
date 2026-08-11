import { assertEquals, assert } from "jsr:@std/assert";
import type { CoreFinancialExtraction } from "../src/contracts.ts";
import type { OcrExtractionResult } from "../src/local-extraction/contracts.ts";
import { buildFieldRecoveryPlan } from "../src/local-extraction/field-recovery-plan.ts";

function extraction(overrides: Partial<CoreFinancialExtraction> = {}): CoreFinancialExtraction {
  return {
    schemaVersion: 2,
    templateCode: "test",
    templateVersion: 1,
    financialEntity: "Bin Dowal",
    transactionType: "transfer",
    transactionDirection: "incoming",
    amount: 500,
    currency: "YER",
    documentReference: "123456",
    transactionDatetime: "2026-08-11 10:00",
    parties: [
      { role: "sender", identifiers: [{ type: "account_number", value: "123456789", confidence: 0.98, evidence: [] }] },
      { role: "receiver", identifiers: [{ type: "account_number", value: "987654321", confidence: 0.98, evidence: [] }] },
    ],
    confidence: 0.98,
    fieldConfidence: {
      amount: 0.99,
      currency: 0.99,
      documentReference: 0.99,
      transactionDatetime: 0.99,
      senderIdentifier: 0.98,
      receiverIdentifier: 0.98,
    },
    warnings: [],
    reviewRequired: false,
    ...overrides,
  };
}

const ocr: OcrExtractionResult = {
  provider: "test",
  rawText: "شركة بن دول للصرافة رقم الإشعار 123456 التاريخ 2026/08/11 المبلغ 500 ريال يمني",
  confidence: 0.9,
  durationMs: 100,
  warnings: [],
  blocks: [
    { text: "رقم الإشعار 123456", confidence: 0.9, bbox: { x: 10, y: 80, width: 300, height: 30 } },
    { text: "المبلغ 500 ريال يمني", confidence: 0.9, bbox: { x: 10, y: 300, width: 300, height: 30 } },
  ],
};

Deno.test("recovery planner leaves complete high-confidence extraction alone", () => {
  const plan = buildFieldRecoveryPlan(extraction(), ocr);
  assertEquals(plan.required, false);
  assertEquals(plan.actions.length, 0);
  assertEquals(plan.templateProfile, "bin-dowal-formal-v1");
});

Deno.test("recovery planner targets only a missing critical field", () => {
  const plan = buildFieldRecoveryPlan(extraction({ documentReference: undefined }), ocr);
  assert(plan.required);
  assertEquals(plan.actions[0]?.field, "documentReference");
  assertEquals(plan.actions[0]?.reason, "missing");
  assert(plan.actions[0]?.regions.length > 0);
});

Deno.test("recovery planner rejects short routing identifiers", () => {
  const bad = extraction({
    parties: [
      { role: "sender", identifiers: [{ type: "account_number", value: "123", confidence: 0.95, evidence: [] }] },
      { role: "receiver", identifiers: [{ type: "account_number", value: "987654321", confidence: 0.98, evidence: [] }] },
    ],
  });
  const plan = buildFieldRecoveryPlan(bad, ocr);
  const action = plan.actions.find((x) => x.field === "senderIdentifier");
  assert(action);
  assertEquals(action.reason, "suspicious_identifier");
  assertEquals(action.priority, 100);
});
