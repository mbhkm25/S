import type { CoreFinancialExtraction } from "../src/contracts.ts";
import type { BenchmarkCase, BenchmarkEngine, EngineExecution } from "../src/benchmark/contracts.ts";
import { RecordedBaselineEngine } from "../src/benchmark/engines.ts";
import { runBenchmark } from "../src/benchmark/runner.ts";
import { analyzeAmqiPdfBytes } from "../src/pipelines/amqi-pdf.ts";

declare const Deno: {
  args: string[];
  readFile(path: string): Promise<Uint8Array>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, data: string): Promise<void>;
  cwd(): string;
};

interface PrivateManifestCase {
  id: string;
  pdfPath: string;
  expected: CoreFinancialExtraction;
  geminiBaseline: {
    durationMs: number;
    extraction: CoreFinancialExtraction;
  };
}

interface PrivateManifest {
  cases: PrivateManifestCase[];
  outputPath?: string;
}

class AmqiPdfBenchmarkEngine implements BenchmarkEngine {
  readonly name = "sanad_fast_engine_amqi_pdf";

  async execute(input: BenchmarkCase): Promise<EngineExecution> {
    const startedAt = new Date().toISOString();
    const path = input.input.privateArtifactRef;
    if (!path) {
      return {
        engine: this.name,
        caseId: input.id,
        startedAt,
        durationMs: 0,
        error: "private_pdf_path_missing",
      };
    }

    try {
      const pdfBytes = await Deno.readFile(path);
      const result = await analyzeAmqiPdfBytes(pdfBytes);
      return {
        engine: this.name,
        caseId: input.id,
        startedAt,
        durationMs: result.timings.totalMs,
        extraction: result.extraction,
        error: result.status === "completed" || result.status === "needs_review"
          ? undefined
          : `amqi_pdf_pipeline:${result.status}`,
        metadata: {
          source: "private_pdf_corpus",
          externalCallPerformed: false,
          pdfTextMs: result.timings.pdfTextMs,
          parseMs: result.timings.parseMs,
          textQualityScore: result.pdf.qualityScore,
          textLayerDetected: result.pdf.textLayerDetected,
          reviewRequired: result.extraction?.reviewRequired ?? true,
        },
      };
    } catch (error) {
      return {
        engine: this.name,
        caseId: input.id,
        startedAt,
        durationMs: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function requireManifestPath(): string {
  const path = Deno.args[0];
  if (!path) {
    throw new Error("usage: deno task benchmark:amqi /absolute/path/to/private-amqi-manifest.json");
  }
  return path;
}

const manifestPath = requireManifestPath();
const manifest = JSON.parse(await Deno.readTextFile(manifestPath)) as PrivateManifest;
if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) {
  throw new Error("private_manifest_has_no_cases");
}

const cases: BenchmarkCase[] = manifest.cases.map((item) => ({
  id: item.id,
  templateCode: "amqi_mobile_deposit_notice_v1",
  input: {
    mimeType: "application/pdf",
    privateArtifactRef: item.pdfPath,
  },
  expected: item.expected,
}));

const recorded = new Map(
  manifest.cases.map((item) => [
    item.id,
    {
      durationMs: item.geminiBaseline.durationMs,
      extraction: item.geminiBaseline.extraction,
    },
  ]),
);

const report = await runBenchmark(
  cases,
  new RecordedBaselineEngine(recorded),
  new AmqiPdfBenchmarkEngine(),
);

const outputPath = manifest.outputPath
  ?? new URL(`./amqi-benchmark-${Date.now()}.json`, `file://${Deno.cwd()}/`).pathname;
await Deno.writeTextFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  outputPath,
  decision: report.decision,
  summaries: report.summaries,
}, null, 2));
