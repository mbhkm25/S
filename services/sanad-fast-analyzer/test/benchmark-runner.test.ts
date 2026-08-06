import type { CoreFinancialExtraction } from "../src/contracts.ts";
import type { BenchmarkCase } from "../src/benchmark/contracts.ts";
import { LocalFastEngine, RecordedBaselineEngine } from "../src/benchmark/engines.ts";
import { decideBenchmark, runBenchmark } from "../src/benchmark/runner.ts";

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const expected: CoreFinancialExtraction = {
  schemaVersion: 1,
  templateCode: "amqi_mobile_deposit_notice_v1",
  templateVersion: 1,
  financialEntity: "العمقي موبايل",
  transactionType: "deposit",
  transactionDirection: "incoming",
  amount: 500,
  currency: "SAR",
  documentReference: "8-232094624",
  transactionDatetime: "2025-06-05T20:29:00",
  parties: [
    {
      role: "sender",
      name: "مرسل تجريبي",
      identifiers: [
        { type: "passport_number", value: "14380001", confidence: 0.98, evidence: [] },
        { type: "financial_account_number", value: "254220002", confidence: 0.99, evidence: [] },
      ],
    },
    {
      role: "receiver",
      name: "مستفيد تجريبي",
      identifiers: [
        { type: "card_number", value: "08010070001", confidence: 0.99, evidence: [] },
        { type: "financial_account_number", value: "254070002", confidence: 0.99, evidence: [] },
      ],
    },
  ],
  confidence: 0.99,
  fieldConfidence: {},
  warnings: [],
  reviewRequired: false,
};

const benchmarkCase: BenchmarkCase = {
  id: "amqi-synthetic-001",
  templateCode: expected.templateCode,
  input: {
    mimeType: "application/pdf",
    text: `
      التاريخ: 2025-06-05 المرجع: 8-232094624
      السيد: مستفيد تجريبي بط-08010070001 رقم الحساب 254070002
      المبلغ #500# سعودي
      من حساب: مرسل تجريبي/جواز-14380001 رقم 254220002 إلى حساب: مستفيد تجريبي بط-08010070001 رقم 254070002
      عبر تطبيق العمقي جوال إشعار إيداع 2025-06-05 08:29PM
    `,
  },
  expected,
};

Deno.test("benchmark keeps baseline and candidate isolated", async () => {
  const baseline = new RecordedBaselineEngine(new Map([
    [benchmarkCase.id, { durationMs: 15000, extraction: expected }],
  ]));
  const report = await runBenchmark(
    [benchmarkCase],
    baseline,
    new LocalFastEngine(),
    {
      minimumCases: 1,
      minimumCriticalAccuracy: 0.99,
      maximumCriticalAccuracyRegression: 0,
      minimumRelativeLatencyImprovement: 0.5,
      minimumAbsoluteP95ImprovementMs: 3000,
    },
  );

  assert(report.executions.length === 2, "both engines must execute");
  assert(report.executions.every((run) => run.metadata?.externalCallPerformed === false), "test must perform no external calls");
  assert(report.decision.status === "eligible_for_shadow_review", `unexpected decision: ${report.decision.status}`);
  assert(report.decision.candidate.meanCriticalAccuracy === 1, "candidate critical fields must match");
});

Deno.test("decision rejects marginal latency improvement", () => {
  const decision = decideBenchmark(
    {
      engine: "baseline",
      cases: 30,
      successfulCases: 30,
      meanDurationMs: 15000,
      p50DurationMs: 15000,
      p95DurationMs: 16000,
      meanAccuracy: 1,
      meanCriticalAccuracy: 1,
      reviewRate: 0,
    },
    {
      engine: "candidate",
      cases: 30,
      successfulCases: 30,
      meanDurationMs: 12500,
      p50DurationMs: 12500,
      p95DurationMs: 13000,
      meanAccuracy: 1,
      meanCriticalAccuracy: 1,
      reviewRate: 0,
    },
    {
      minimumCases: 30,
      minimumCriticalAccuracy: 0.99,
      maximumCriticalAccuracyRegression: 0,
      minimumRelativeLatencyImprovement: 0.5,
      minimumAbsoluteP95ImprovementMs: 3000,
    },
  );

  assert(decision.status === "reject", "marginal improvement must be rejected");
  assert(decision.reasons.some((reason) => reason.startsWith("relative_latency_improvement_is_marginal")), "relative latency gate missing");
});
