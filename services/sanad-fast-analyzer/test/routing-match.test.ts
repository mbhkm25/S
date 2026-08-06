import {
  matchBusinessRoutingIdentifier,
  normalizeIdentifierValue,
} from "../src/routing-match.ts";
import type { ExtractedIdentifier } from "../src/contracts.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("normalizes Yemeni phone variants to one routing value", () => {
  const expected = "967777123456";
  assert(normalizeIdentifierValue("phone_number", "777 123 456") === expected, "local phone failed");
  assert(normalizeIdentifierValue("phone_number", "+967 777 123 456") === expected, "country code failed");
  assert(normalizeIdentifierValue("phone_number", "٠٠٩٦٧٧٧٧١٢٣٤٥٦") === expected, "Arabic digits failed");
});

Deno.test("matches Bin Dowal Pay beneficiary phone to the verified business account", () => {
  const identifier: ExtractedIdentifier = {
    type: "phone_number",
    value: "777123456",
    sourceLabel: "رقم المستفيد",
    isPrimaryRoutingIdentifier: true,
    confidence: 0.99,
    evidence: [],
  };

  const decision = matchBusinessRoutingIdentifier({
    financialEntityCode: "bin_dowal_pay",
    receiverName: "متجر النور",
    identifiers: [identifier],
    verifiedIdentifiers: [{
      businessId: "business-1",
      financialAccountId: "account-1",
      financialEntityCode: "bin_dowal_pay",
      identifierType: "phone_number",
      identifierValue: "+967777123456",
      accountHolderName: "متجر النور",
      routingEnabled: true,
      verificationStatus: "verified",
    }],
  });

  assert(decision.status === "matched", "expected unique match");
  assert(decision.candidate?.businessId === "business-1", "wrong business");
  assert(decision.candidate?.identifierType === "phone_number", "wrong identifier type");
});

Deno.test("does not route a phone across a different financial entity", () => {
  const decision = matchBusinessRoutingIdentifier({
    financialEntityCode: "bin_dowal_pay",
    identifiers: [{
      type: "phone_number",
      value: "777123456",
      confidence: 0.99,
      evidence: [],
    }],
    verifiedIdentifiers: [{
      businessId: "business-1",
      financialAccountId: "account-1",
      financialEntityCode: "m_floos",
      identifierType: "phone_number",
      identifierValue: "777123456",
      routingEnabled: true,
      verificationStatus: "verified",
    }],
  });

  assert(decision.status === "unmatched", "cross-entity match must be rejected");
  assert(decision.reason === "no_verified_identifier", "unexpected reason");
});

Deno.test("requires review when the verified identifier matches but the beneficiary name conflicts", () => {
  const decision = matchBusinessRoutingIdentifier({
    financialEntityCode: "bin_dowal_pay",
    receiverName: "مؤسسة مختلفة تماما",
    identifiers: [{
      type: "phone_number",
      value: "777123456",
      confidence: 0.99,
      evidence: [],
    }],
    verifiedIdentifiers: [{
      businessId: "business-1",
      financialAccountId: "account-1",
      financialEntityCode: "bin_dowal_pay",
      identifierType: "phone_number",
      identifierValue: "777123456",
      accountHolderName: "متجر النور",
      routingEnabled: true,
      verificationStatus: "verified",
    }],
  });

  assert(decision.status === "review_required", "name conflict must require review");
  assert(decision.reason === "name_conflict", "unexpected reason");
});
