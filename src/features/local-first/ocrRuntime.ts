import type { LocalOcrAdapter, LocalOcrResult } from './contracts';
import { normalizeFinancialOcrText } from './textNormalization';

export interface OcrProviderAvailability {
  available: boolean;
  reason?: string;
}

export interface BenchmarkExpectation {
  requiredTextFragments?: string[];
  expectedDigits?: string[];
}

export interface OcrBenchmarkCase {
  id: string;
  fileUri: string;
  mimeType: string;
  expectation?: BenchmarkExpectation;
}

export interface OcrBenchmarkCaseResult {
  id: string;
  provider: string;
  durationMs: number;
  confidence: number;
  requiredTextRecall: number | null;
  digitRecall: number | null;
  warnings: string[];
  rawText: string;
}

export interface OcrBenchmarkSummary {
  provider: string;
  cases: number;
  meanDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  meanConfidence: number;
  meanRequiredTextRecall: number | null;
  meanDigitRecall: number | null;
  results: OcrBenchmarkCaseResult[];
}

function percentile(sorted: number[], ratio: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function recall(expected: string[] | undefined, normalizedText: string): number | null {
  if (!expected?.length) return null;
  const found = expected.filter((value) => normalizedText.includes(normalizeFinancialOcrText(value))).length;
  return found / expected.length;
}

function digitRecall(expected: string[] | undefined, normalizedText: string): number | null {
  if (!expected?.length) return null;
  const digitText = normalizedText.replace(/\D/g, ' ');
  const found = expected.filter((value) => digitText.includes(value.replace(/\D/g, ''))).length;
  return found / expected.length;
}

export async function benchmarkOcrAdapter(
  adapter: LocalOcrAdapter,
  cases: OcrBenchmarkCase[],
): Promise<OcrBenchmarkSummary> {
  const results: OcrBenchmarkCaseResult[] = [];

  for (const item of cases) {
    const result: LocalOcrResult = await adapter.recognize({
      localId: `benchmark:${item.id}`,
      fileUri: item.fileUri,
      mimeType: item.mimeType,
    });
    const normalized = normalizeFinancialOcrText(result.rawText);
    results.push({
      id: item.id,
      provider: result.provider,
      durationMs: result.durationMs,
      confidence: result.confidence,
      requiredTextRecall: recall(item.expectation?.requiredTextFragments, normalized),
      digitRecall: digitRecall(item.expectation?.expectedDigits, normalized),
      warnings: result.warnings,
      rawText: result.rawText,
    });
  }

  const durations = results.map((result) => result.durationMs).sort((a, b) => a - b);
  const textRecalls = results.map((result) => result.requiredTextRecall).filter((value): value is number => value !== null);
  const digitRecalls = results.map((result) => result.digitRecall).filter((value): value is number => value !== null);

  return {
    provider: adapter.provider,
    cases: results.length,
    meanDurationMs: average(durations),
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    meanConfidence: average(results.map((result) => result.confidence)),
    meanRequiredTextRecall: textRecalls.length ? average(textRecalls) : null,
    meanDigitRecall: digitRecalls.length ? average(digitRecalls) : null,
    results,
  };
}
