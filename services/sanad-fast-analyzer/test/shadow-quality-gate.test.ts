import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateShadowRouting } from "../src/shadow-quality-gate.ts";

Deno.test("quality gate allows a verified-looking beneficiary phone candidate", () => {
  const decision = evaluateShadowRouting({
    financialEntity: "بن دول باي",
    financialEntityCode: "bin_dowal_pay",
    confidence: 0.97,
    reviewRequired: false,
    receiverIdentifierType: "phone_number",
    receiverIdentifierValue: "777123456",
    receiverIdentifierConfidence: 0.98,
    parties: [{
      role: "sender",
      identifiers: [{ type: "phone_number", value: "733111222" }],
    }],
  });

  assertEquals(decision, {
    status: "eligible",
    eligible: true,
    reasons: [],
  });
});

Deno.test("quality gate rejects unresolved entities and missing receiver identifiers", () => {
  const decision = evaluateShadowRouting({
    financialEntity: "غير معروف",
    financialEntityCode: "other",
    confidence: 0.8,
    reviewRequired: true,
    receiverIdentifierType: null,
    receiverIdentifierValue: null,
    parties: [],
  });

  assertEquals(decision.eligible, false);
  assertEquals(decision.reasons, [
    "financial_entity_unresolved",
    "model_review_required",
    "overall_confidence_below_threshold",
    "receiver_identifier_missing",
    "receiver_identifier_type_missing",
  ]);
});

Deno.test("quality gate rejects a receiver identifier copied from the sender", () => {
  const decision = evaluateShadowRouting({
    financialEntity: "الكريمي يمني",
    financialEntityCode: "kuraimi_yer",
    confidence: 0.94,
    reviewRequired: false,
    receiverIdentifierType: "phone_number",
    receiverIdentifierValue: "+967777123456",
    receiverIdentifierConfidence: 0.95,
    parties: [{
      role: "sender",
      identifiers: [{ type: "phone_number", value: "777 123 456" }],
    }],
  });

  assertEquals(decision.eligible, false);
  assertEquals(decision.reasons, ["receiver_identifier_matches_sender"]);
});

Deno.test("quality gate rejects non-routing identity identifiers", () => {
  const decision = evaluateShadowRouting({
    financialEntity: "العمقي موبايل",
    financialEntityCode: "alomqy_mobile",
    confidence: 0.96,
    reviewRequired: false,
    receiverIdentifierType: "national_id",
    receiverIdentifierValue: "1234567890",
    receiverIdentifierConfidence: 0.96,
    parties: [],
  });

  assertEquals(decision.eligible, false);
  assertEquals(decision.reasons, ["receiver_identifier_type_not_routable"]);
});
