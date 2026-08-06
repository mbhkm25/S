import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildIdentifierPersistenceProjection,
  toOperationIdentifierType,
} from "./identifier-contract.ts";

Deno.test("projects semantic account identifiers into operations contract", () => {
  assertEquals(toOperationIdentifierType("financial_account_number"), "account_number");
  assertEquals(toOperationIdentifierType("account_number"), "account_number");
  assertEquals(toOperationIdentifierType("customer_line"), "financial_line");
});

Deno.test("preserves operationally routable identifiers", () => {
  assertEquals(toOperationIdentifierType("wallet_number"), "wallet_number");
  assertEquals(toOperationIdentifierType("merchant_point"), "merchant_point");
  assertEquals(toOperationIdentifierType("phone_number"), "phone_number");
  assertEquals(toOperationIdentifierType("iban"), "iban");
});

Deno.test("stores identity and card identifiers safely without losing semantics", () => {
  assertEquals(toOperationIdentifierType("national_id"), "other");
  assertEquals(toOperationIdentifierType("passport_number"), "other");
  assertEquals(toOperationIdentifierType("card_number"), "other");
  assertEquals(toOperationIdentifierType("unique_account_name"), "other");

  assertEquals(buildIdentifierPersistenceProjection("card_number"), {
    semantic_type: "card_number",
    operation_type: "other",
    projected: true,
  });
});

Deno.test("unknown or future identifiers fail closed", () => {
  assertEquals(toOperationIdentifierType("unknown_identifier"), "unknown");
  assertEquals(toOperationIdentifierType("future_identifier"), "unknown");
  assertEquals(toOperationIdentifierType(null), "unknown");
});
