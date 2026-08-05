import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { BenchmarkCase } from "../src/benchmark/contracts.ts";
import { buildGeminiNoThinkingPayload } from "../src/benchmark/gemini-no-thinking.ts";

const sample: BenchmarkCase = {
  id: "amqi-withdrawal-sample",
  templateCode: "amqi_mobile_withdrawal_notice_v1",
  input: {
    mimeType: "application/pdf",
    privateArtifactRef: "/private/sample.pdf",
  },
  expected: {
    schemaVersion: 1,
    templateCode: "amqi_mobile_withdrawal_notice_v1",
    templateVersion: 1,
    financialEntity: "العمقي موبايل",
    transactionType: "withdrawal",
    transactionDirection: "outgoing",
    parties: [],
    confidence: 1,
    fieldConfidence: {},
    warnings: [],
    reviewRequired: false,
  },
};

Deno.test("Gemini 2.5 Flash benchmark payload explicitly disables thinking", () => {
  const payload = buildGeminiNoThinkingPayload(sample, "cGRm", "extract");
  assertEquals(payload.generationConfig.thinkingConfig.thinkingBudget, 0);
  assertEquals(payload.generationConfig.temperature, 0);
  assertEquals(payload.generationConfig.responseMimeType, "application/json");
  assertEquals(payload.contents[0].parts[1].inlineData.mimeType, "application/pdf");
  assertEquals(payload.contents[0].parts[1].inlineData.data, "cGRm");
});
