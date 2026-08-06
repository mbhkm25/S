import { assertEquals } from "jsr:@std/assert@1";
import {
  decideShadowAccountMatch,
  type ShadowAccountCandidate,
} from "../src/shadow-account-match.ts";

const candidate: ShadowAccountCandidate = {
  financial_account_id: "11111111-1111-1111-1111-111111111111",
  business_id: "22222222-2222-2222-2222-222222222222",
  financial_identifier_id: "33333333-3333-3333-3333-333333333333",
  identifier_type: "phone_number",
  identifier_value_normalized: "967777123456",
  identifier_currency: "YER",
  is_primary: true,
  account_holder_name_normalized: "متجر النور",
};

Deno.test("skips matching when quality gate is not eligible", () => {
  const decision = decideShadowAccountMatch(false, [candidate]);
  assertEquals(decision.status, "skipped_quality_gate");
  assertEquals(decision.selected, null);
});

Deno.test("returns unmatched when there is no verified routable candidate", () => {
  const decision = decideShadowAccountMatch(true, []);
  assertEquals(decision.status, "unmatched");
  assertEquals(decision.candidateCount, 0);
});

Deno.test("selects one unique candidate", () => {
  const decision = decideShadowAccountMatch(true, [candidate]);
  assertEquals(decision.status, "matched");
  assertEquals(decision.selected?.financial_account_id, candidate.financial_account_id);
});

Deno.test("returns ambiguous for multiple candidate identifiers", () => {
  const decision = decideShadowAccountMatch(true, [
    candidate,
    {
      ...candidate,
      financial_account_id: "44444444-4444-4444-4444-444444444444",
      business_id: "55555555-5555-5555-5555-555555555555",
      financial_identifier_id: "66666666-6666-6666-6666-666666666666",
    },
  ]);
  assertEquals(decision.status, "ambiguous");
  assertEquals(decision.candidateCount, 2);
  assertEquals(decision.selected, null);
});

Deno.test("deduplicates the same identifier row", () => {
  const decision = decideShadowAccountMatch(true, [candidate, candidate]);
  assertEquals(decision.status, "matched");
  assertEquals(decision.candidateCount, 1);
});
