import type {
  BenchmarkCase,
  BenchmarkDecision,
  BenchmarkDecisionPolicy,
  BenchmarkEngine,
  BenchmarkReport,
  EngineExecution,
  EngineSummary,
  ExecutionScore,
} from "./contracts.ts";
import { scoreExecution } from "./scoring.ts";

export const DEFAULT_DECISION_POLICY: BenchmarkDecisionPolicy = {
  minimumCases: 30,
  minimumCriticalAccuracy: 0.99,
  maximumCriticalAccuracyRegression: 0,
  minimumRelativeLatencyImprovement: 0.5,
  minimumAbsoluteP95ImprovementMs: 3000,
};

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileValue * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeEngine(engine: string, scores: ExecutionScore[]): EngineSummary {
  const selected = scores.filter((score) => score.engine === engine);
  const successful = selected.filter((score) => !score.error);
  return {
    engine,
    cases: selected.length,
    successfulCases: successful.length,
    meanDurationMs: mean(selected.map((score) => score.durationMs)),
    p50DurationMs: percentile(selected.map((score) => score.durationMs), 0.5),
    p95DurationMs: percentile(selected.map((score) => score.durationMs), 0.95),
    meanAccuracy: mean(selected.map((score) => score.score)),
    meanCriticalAccuracy: mean(selected.map((score) => score.criticalScore)),
    reviewRate: selected.length === 0
      ? 1
      : selected.filter((score) => score.reviewRequired || Boolean(score.error)).length / selected.length,
  };
}

export function decideBenchmark(
  baseline: EngineSummary,
  candidate: EngineSummary,
  policy: BenchmarkDecisionPolicy,
): BenchmarkDecision {
  const absoluteP95ImprovementMs = baseline.p95DurationMs - candidate.p95DurationMs;
  const relativeP95Improvement = baseline.p95DurationMs <= 0
    ? 0
    : absoluteP95ImprovementMs / baseline.p95DurationMs;
  const reasons: string[] = [];

  if (candidate.cases < policy.minimumCases || baseline.cases < policy.minimumCases) {
    reasons.push(`minimum_cases_not_met:${Math.min(candidate.cases, baseline.cases)}/${policy.minimumCases}`);
    const earlyAccuracyOkay = candidate.meanCriticalAccuracy >= policy.minimumCriticalAccuracy &&
      candidate.meanCriticalAccuracy >= baseline.meanCriticalAccuracy - policy.maximumCriticalAccuracyRegression;
    const earlyLatencyPromising = relativeP95Improvement >= policy.minimumRelativeLatencyImprovement &&
      absoluteP95ImprovementMs >= policy.minimumAbsoluteP95ImprovementMs;
    return {
      status: earlyAccuracyOkay && earlyLatencyPromising ? "continue_experiment" : "insufficient_data",
      reasons,
      baseline,
      candidate,
      relativeP95Improvement,
      absoluteP95ImprovementMs,
    };
  }

  const accuracyRegression = baseline.meanCriticalAccuracy - candidate.meanCriticalAccuracy;
  if (candidate.meanCriticalAccuracy < policy.minimumCriticalAccuracy) {
    reasons.push(`candidate_critical_accuracy_below_gate:${candidate.meanCriticalAccuracy.toFixed(4)}`);
  }
  if (accuracyRegression > policy.maximumCriticalAccuracyRegression) {
    reasons.push(`critical_accuracy_regression:${accuracyRegression.toFixed(4)}`);
  }
  if (relativeP95Improvement < policy.minimumRelativeLatencyImprovement) {
    reasons.push(`relative_latency_improvement_is_marginal:${relativeP95Improvement.toFixed(4)}`);
  }
  if (absoluteP95ImprovementMs < policy.minimumAbsoluteP95ImprovementMs) {
    reasons.push(`absolute_p95_improvement_is_marginal:${absoluteP95ImprovementMs.toFixed(0)}ms`);
  }

  if (reasons.length > 0) {
    return {
      status: "reject",
      reasons,
      baseline,
      candidate,
      relativeP95Improvement,
      absoluteP95ImprovementMs,
    };
  }

  reasons.push("latency_and_accuracy_gates_passed");
  return {
    status: "eligible_for_shadow_review",
    reasons,
    baseline,
    candidate,
    relativeP95Improvement,
    absoluteP95ImprovementMs,
  };
}

async function executeSafely(engine: BenchmarkEngine, benchmarkCase: BenchmarkCase): Promise<EngineExecution> {
  try {
    return await engine.execute(benchmarkCase);
  } catch (error) {
    return {
      engine: engine.name,
      caseId: benchmarkCase.id,
      startedAt: new Date().toISOString(),
      durationMs: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runBenchmark(
  cases: BenchmarkCase[],
  baselineEngine: BenchmarkEngine,
  candidateEngine: BenchmarkEngine,
  policy: BenchmarkDecisionPolicy = DEFAULT_DECISION_POLICY,
): Promise<BenchmarkReport> {
  const executions: EngineExecution[] = [];
  const scores: ExecutionScore[] = [];

  for (const benchmarkCase of cases) {
    const [baseline, candidate] = await Promise.all([
      executeSafely(baselineEngine, benchmarkCase),
      executeSafely(candidateEngine, benchmarkCase),
    ]);
    executions.push(baseline, candidate);
    scores.push(
      scoreExecution(
        baseline.engine,
        benchmarkCase.id,
        baseline.durationMs,
        benchmarkCase.expected,
        baseline.extraction,
        baseline.error,
      ),
      scoreExecution(
        candidate.engine,
        benchmarkCase.id,
        candidate.durationMs,
        benchmarkCase.expected,
        candidate.extraction,
        candidate.error,
      ),
    );
  }

  const baselineSummary = summarizeEngine(baselineEngine.name, scores);
  const candidateSummary = summarizeEngine(candidateEngine.name, scores);
  return {
    generatedAt: new Date().toISOString(),
    policy,
    executions,
    scores,
    summaries: [baselineSummary, candidateSummary],
    decision: decideBenchmark(baselineSummary, candidateSummary, policy),
  };
}
