import type { CoreFinancialExtraction } from "../contracts.ts";

export interface BenchmarkCase {
  id: string;
  templateCode: string;
  input: {
    mimeType: string;
    text?: string;
    privateArtifactRef?: string;
  };
  expected: CoreFinancialExtraction;
}

export interface EngineExecution {
  engine: string;
  caseId: string;
  startedAt: string;
  durationMs: number;
  extraction?: CoreFinancialExtraction;
  error?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface BenchmarkEngine {
  readonly name: string;
  execute(input: BenchmarkCase): Promise<EngineExecution>;
}

export interface FieldScore {
  field: string;
  expected: unknown;
  actual: unknown;
  matched: boolean;
  critical: boolean;
}

export interface ExecutionScore {
  engine: string;
  caseId: string;
  durationMs: number;
  score: number;
  criticalScore: number;
  reviewRequired: boolean;
  fields: FieldScore[];
  error?: string;
}

export interface EngineSummary {
  engine: string;
  cases: number;
  successfulCases: number;
  meanDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  meanAccuracy: number;
  meanCriticalAccuracy: number;
  reviewRate: number;
}

export interface BenchmarkDecisionPolicy {
  minimumCases: number;
  minimumCriticalAccuracy: number;
  maximumCriticalAccuracyRegression: number;
  minimumRelativeLatencyImprovement: number;
  minimumAbsoluteP95ImprovementMs: number;
}

export interface BenchmarkDecision {
  status: "insufficient_data" | "reject" | "continue_experiment" | "eligible_for_shadow_review";
  reasons: string[];
  baseline: EngineSummary;
  candidate: EngineSummary;
  relativeP95Improvement: number;
  absoluteP95ImprovementMs: number;
}

export interface BenchmarkReport {
  generatedAt: string;
  policy: BenchmarkDecisionPolicy;
  executions: EngineExecution[];
  scores: ExecutionScore[];
  summaries: EngineSummary[];
  decision: BenchmarkDecision;
}
