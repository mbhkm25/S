import type { CoreFinancialExtraction } from "../src/contracts.ts";
import type { BenchmarkCase, BenchmarkEngine, EngineExecution } from "../src/benchmark/contracts.ts";
import { RecordedBaselineEngine } from "../src/benchmark/engines.ts";
import { runBenchmark } from "../src/benchmark/runner.ts";
import { analyzeLocalDocument } from "../src/local-extraction/engine.ts";
import { HttpOcrProvider } from "../src/local-extraction/http-ocr-provider.ts";

declare const Deno: {
  args: string[];
  env: { get(name: string): string | undefined };
  readFile(path: string): Promise<Uint8Array>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, data: string): Promise<void>;
  cwd(): string;
};

interface ManifestCase {
  id: string;
  artifactPath: string;
  mimeType: string;
  templateCode: string;
  expected: CoreFinancialExtraction;
  geminiBaseline: {
    durationMs: number;
    extraction: CoreFinancialExtraction;
  };
}

interface Manifest {
  cases: ManifestCase[];
  outputPath?: string;
  minimumAcceptConfidence?: number;
}

class SanadLocalBenchmarkEngine implements BenchmarkEngine {
  readonly name = "sanad_local_extraction_v0_2";

  constructor(
    private readonly ocr: HttpOcrProvider,
    private readonly minimumAcceptConfidence: number,
  ) {}

  async execute(input: BenchmarkCase): Promise<EngineExecution> {
    const startedAt = new Date().toISOString();
    const start = performance.now();
    const path = input.input.privateArtifactRef;
    if (!path) {
      return {
        engine: this.name,
        caseId: input.id,
        startedAt,
        durationMs: 0,
        error: "private_artifact_path_missing",
      };
    }

    try {
      const bytes = await Deno.readFile(path);
      const result = await analyzeLocalDocument({
        bytes,
        mimeType: input.input.mimeType,
        fileName: path.split(/[\\/]/).pop(),
      }, {
        ocrProvider: this.ocr,
        minimumAcceptConfidence: this.minimumAcceptConfidence,
      });
      return {
        engine: this.name,
        caseId: input.id,
        startedAt,
        durationMs: performance.now() - start,
        extraction: result.extraction,
        error: result.status === "completed" || result.status === "needs_review"
          ? undefined
          : `local_extraction:${result.status}:${result.fallbackReason ?? "unknown"}`,
        metadata: {
          source: result.source.join("+"),
          externalCallPerformed: false,
          ocrMs: result.timings.ocrMs,
          rulesMs: result.timings.rulesMs,
          pdfTextMs: result.timings.textLayerMs,
          totalMs: result.timings.totalMs,
          confidence: result.confidence,
          fallbackRecommended: result.fallbackRecommended,
          parser: result.diagnostics.parser ?? "none",
          ocrProvider: result.diagnostics.ocrProvider ?? "none",
        },
      };
    } catch (error) {
      return {
        engine: this.name,
        caseId: input.id,
        startedAt,
        durationMs: performance.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

const manifestPath = Deno.args[0];
if (!manifestPath) {
  throw new Error("usage: deno task benchmark:local /absolute/path/to/private-local-manifest.json");
}

const manifest = JSON.parse(await Deno.readTextFile(manifestPath)) as Manifest;
if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) {
  throw new Error("private_manifest_has_no_cases");
}

const ocrUrl = Deno.env.get("SANAD_LOCAL_OCR_URL") ?? "http://127.0.0.1:8091";
const ocrToken = Deno.env.get("SANAD_OCR_TOKEN");
const ocr = new HttpOcrProvider({
  baseUrl: ocrUrl,
  token: ocrToken,
  timeoutMs: Number(Deno.env.get("SANAD_LOCAL_OCR_TIMEOUT_MS") ?? "10000"),
});

const cases: BenchmarkCase[] = manifest.cases.map((item) => ({
  id: item.id,
  templateCode: item.templateCode,
  input: {
    mimeType: item.mimeType,
    privateArtifactRef: item.artifactPath,
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
  new SanadLocalBenchmarkEngine(ocr, manifest.minimumAcceptConfidence ?? 0.98),
);

const outputPath = manifest.outputPath
  ?? new URL(`./local-extraction-benchmark-${Date.now()}.json`, `file://${Deno.cwd()}/`).pathname;
await Deno.writeTextFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  outputPath,
  decision: report.decision,
  summaries: report.summaries,
}, null, 2));
