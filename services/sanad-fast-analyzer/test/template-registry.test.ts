import registryJson from "../templates/registry.v1.json" with { type: "json" };
import { getTemplate, parseTemplateRegistry } from "../src/template-registry.ts";

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void;
};

Deno.test("initial registry is structurally valid", () => {
  const registry = parseTemplateRegistry(registryJson);
  if (registry.templates.length !== 6) {
    throw new Error(`expected 6 templates, got ${registry.templates.length}`);
  }
});

Deno.test("all initial templates remain draft until benchmark gates pass", () => {
  const registry = parseTemplateRegistry(registryJson);
  const nonDraft = registry.templates.filter((template) => template.status !== "draft");
  if (nonDraft.length > 0) {
    throw new Error(`unexpected non-draft templates: ${nonDraft.map((item) => item.code).join(", ")}`);
  }
});

Deno.test("critical semantic guardrails are present", () => {
  const registry = parseTemplateRegistry(registryJson);

  const haseb = getTemplate(registry, "kuraimi_haseb_transaction_card_v1");
  if (!haseb?.semanticGuards.includes("merchant_point_must_not_be_mapped_to_receiver_account")) {
    throw new Error("Haseb merchant-point guard is missing");
  }

  const amqi = getTemplate(registry, "amqi_mobile_deposit_notice_v1");
  if (!amqi?.semanticGuards.includes("sender_identity_must_not_be_mapped_to_sender_account")) {
    throw new Error("Al-Amqi identity/account guard is missing");
  }

  const credit = getTemplate(registry, "bin_dowal_credit_notice_v1");
  if (!credit?.semanticGuards.includes("document_reference_and_transfer_reference_are_distinct_fields")) {
    throw new Error("Bin Dowal reference separation guard is missing");
  }

  const pay = getTemplate(registry, "bin_dowal_pay_transfer_notice_v1");
  if (!pay?.semanticGuards.includes("fee_amount_must_not_be_added_to_transaction_amount")) {
    throw new Error("Bin Dowal Pay fee guard is missing");
  }
});
