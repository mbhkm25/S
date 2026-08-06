import type { CoreFinancialExtraction } from "../contracts.ts";
import { parseAmqiMobileDepositText } from "../parsers/amqi-mobile-deposit.ts";
import type { BenchmarkCase, BenchmarkEngine, EngineExecution } from "./contracts.ts";

export class RecordedBaselineEngine implements BenchmarkEngine {
  readonly name: string;
  constructor(
    private readonly recorded: ReadonlyMap<string, { durationMs: number; extraction: CoreFinancialExtraction }>,
    name = "gemini_recorded_baseline",
  ) {
    this.name = name;
  }

  execute(input: BenchmarkCase): Promise<EngineExecution> {
    const startedAt = new Date().toISOString();
    const record = this.recorded.get(input.id);
    if (!record) {
      return Promise.resolve({
        engine: this.name,
        caseId: input.id,
        startedAt,
        durationMs: 0,
        error: "recorded_baseline_missing",
      });
    }
    return Promise.resolve({
      engine: this.name,
      caseId: input.id,
      startedAt,
      durationMs: record.durationMs,
      extraction: structuredClone(record.extraction),
      metadata: { source: "recorded_baseline", externalCallPerformed: false },
    });
  }
}

export class LocalFastEngine implements BenchmarkEngine {
  readonly name = "sanad_fast_engine";

  async execute(input: BenchmarkCase): Promise<EngineExecution> {
    const startedAt = new Date().toISOString();
    const start = performance.now();
    if (!input.input.text) {
      return {
        engine: this.name,
        caseId: input.id,
        startedAt,
        durationMs: performance.now() - start,
        error: "text_input_required_for_current_experimental_adapter",
      };
    }

    if (input.templateCode !== "amqi_mobile_deposit_notice_v1") {
      return {
        engine: this.name,
        caseId: input.id,
        startedAt,
        durationMs: performance.now() - start,
        error: `unsupported_template:${input.templateCode}`,
      };
    }

    const parsed = parseAmqiMobileDepositText(input.input.text);
    return {
      engine: this.name,
      caseId: input.id,
      startedAt,
      durationMs: performance.now() - start,
      extraction: parsed.extraction,
      error: parsed.matched && parsed.extraction ? undefined : "local_parser_no_match",
      metadata: {
        source: "local_parser",
        externalCallPerformed: false,
        missingFieldCount: parsed.missing.length,
      },
    };
  }
}
