import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideShadowRecovery } from "../src/shadow-recovery-policy.ts";

Deno.test("recovery policy requests entity-only recovery before identifier recovery", () => {
  const decision = decideShadowRecovery({
    financialEntity: "غير معروف",
    financialEntityCode: "other",
    templateCode: "unknown",
    transactionType: "transfer",
    receiverName: "مستفيد",
    receiverIdentifierType: null,
    receiverIdentifierValue: null,
    modelReviewRequired: true,
    routingReasons: [
      "financial_entity_unresolved",
      "receiver_identifier_missing",
      "receiver_identifier_type_missing",
    ],
  });

  assertEquals(decision, {
    required: true,
    kind: "entity_only",
    reasons: ["entity_unresolved_before_identifier_recovery"],
    maxOutputTokens: 128,
    useOriginalImage: true,
    useTargetedCrop: false,
  });
});

Deno.test("recovery policy requests an identifier-only pass for a known entity", () => {
  const decision = decideShadowRecovery({
    financialEntity: "البسيري موبايل",
    financialEntityCode: "al_busairi_mobile",
    templateCode: "al_busairi_credit_notice",
    transactionType: "transfer",
    receiverName: "مستفيد",
    receiverIdentifierType: null,
    receiverIdentifierValue: null,
    modelReviewRequired: false,
    routingReasons: ["receiver_identifier_missing", "receiver_identifier_type_missing"],
  });

  assertEquals(decision.kind, "receiver_identifier_only");
  assertEquals(decision.useTargetedCrop, true);
  assertEquals(decision.maxOutputTokens, 256);
});

Deno.test("recovery policy requests role validation for a conflicting Al-Amqi template", () => {
  const decision = decideShadowRecovery({
    financialEntity: "العمقي موبايل",
    financialEntityCode: "alomqy_mobile",
    templateCode: "alomqy_deposit_notice",
    transactionType: "deposit",
    receiverName: "طرف مختلف",
    receiverIdentifierType: "account_number",
    receiverIdentifierValue: "123456789",
    modelReviewRequired: false,
    routingReasons: [],
    receiverDisagreesWithReference: true,
  });

  assertEquals(decision, {
    required: true,
    kind: "receiver_role_validation",
    reasons: ["template_receiver_role_conflict"],
    maxOutputTokens: 256,
    useOriginalImage: true,
    useTargetedCrop: true,
  });
});

Deno.test("recovery policy does nothing for an eligible complete extraction", () => {
  const decision = decideShadowRecovery({
    financialEntity: "بن دول باي",
    financialEntityCode: "bin_dowal_pay",
    templateCode: "bin_dowal_pay_transfer",
    transactionType: "transfer",
    receiverName: "مستفيد",
    receiverIdentifierType: "phone_number",
    receiverIdentifierValue: "777123456",
    modelReviewRequired: false,
    routingReasons: [],
  });

  assertEquals(decision.kind, "none");
  assertEquals(decision.required, false);
});
