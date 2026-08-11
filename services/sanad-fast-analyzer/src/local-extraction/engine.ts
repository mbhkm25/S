import { extractPdfTextLayer } from "../pdf-text.ts";
import type {
  LocalExtractionDocument,
  LocalExtractionResult,
  OcrProvider,
} from "./contracts.ts";
import { parseWithRegistry, type LocalTextParser } from "./parser-registry.ts";

const ENGINE_VERSION = "0.2.1" as const;

export interface LocalExtractionEngineOptions {
  ocrProvider?: OcrProvider;
  parsers?: readonly LocalTextParser[];
  minimumAcceptConfidence?: number;
  minimumParserMatchConfidence?: number;
}

export async function analyzeLocalDocument(
  document: LocalExtractionDocument,
  options: LocalExtractionEngineOptions = {},
): Promise<LocalExtractionResult> {
  const started = performance.now();
  const minimumAcceptConfidence = clamp(options.minimumAcceptConfidence ?? 0.98, 0, 1);
  const minimumParserMatchConfidence = clamp(options.minimumParserMatchConfidence ?? 0.5, 0, 1);
  const preOcrWarnings: string[] = [];

  if (!document.bytes.length) {
    return makeResult({
      status: "failed",
      source: [],
      confidence: 0,
      fallbackRecommended: true,
      fallbackReason: "empty_document",
      totalStarted: started,
      mimeType: document.mimeType,
      warnings: ["empty_document"],
    });
  }

  // PDFs with a usable text layer are the cheapest and fastest possible path.
  // A PDF text-layer failure must never poison the OCR fallback path: malformed,
  // scanned, or library-incompatible PDFs are still valid OCR candidates.
  if (document.mimeType.toLowerCase() === "application/pdf") {
    try {
      const pdf = await extractPdfTextLayer(document.bytes);
      if (pdf.textLayerDetected && pdf.rawText.trim()) {
        const rulesStarted = performance.now();
        const parsed = parseWithRegistry(pdf.rawText, {
          parsers: options.parsers,
          minimumMatchConfidence: minimumParserMatchConfidence,
        });
        const rulesMs = performance.now() - rulesStarted;

        if (parsed.matched && parsed.extraction) {
          return finalizeExtraction({
            extraction: parsed.extraction,
            extractionConfidence: parsed.confidence,
            minimumAcceptConfidence,
            source: ["pdf_text", "rules"],
            totalStarted: started,
            mimeType: document.mimeType,
            textLayerMs: pdf.durationMs,
            rulesMs,
            parser: parsed.parser,
            warnings: [...pdf.warnings, ...parsed.reasons],
          });
        }
        if (!options.ocrProvider) {
          return makeResult({
            status: "unsupported",
            source: ["pdf_text", "rules"],
            confidence: parsed.confidence,
            fallbackRecommended: true,
            fallbackReason: "no_deterministic_parser_matched_pdf_text",
            totalStarted: started,
            textLayerMs: pdf.durationMs,
            rulesMs,
            mimeType: document.mimeType,
            parser: parsed.parser,
            warnings: [...pdf.warnings, ...parsed.reasons],
          });
        }
        preOcrWarnings.push(...pdf.warnings, ...parsed.reasons);
      } else {
        preOcrWarnings.push(...pdf.warnings);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      preOcrWarnings.push(`pdf_text_extraction_failed:${detail}`);
    }
  }

  const provider = options.ocrProvider;
  if (!provider || !provider.supports(document.mimeType)) {
    return makeResult({
      status: "needs_ocr",
      source: [],
      confidence: 0,
      fallbackRecommended: true,
      fallbackReason: provider ? "ocr_provider_does_not_support_mime" : "ocr_provider_not_configured",
      totalStarted: started,
      mimeType: document.mimeType,
      warnings: preOcrWarnings,
    });
  }

  try {
    const ocr = await provider.extract(document);
    const rulesStarted = performance.now();
    const parsed = parseWithRegistry(ocr.rawText, {
      parsers: options.parsers,
      minimumMatchConfidence: minimumParserMatchConfidence,
    });
    const rulesMs = performance.now() - rulesStarted;

    if (!parsed.matched || !parsed.extraction) {
      return makeResult({
        status: "unsupported",
        source: ["ocr", "rules"],
        confidence: Math.min(ocr.confidence, parsed.confidence || 1),
        fallbackRecommended: true,
        fallbackReason: "no_supported_template_matched_after_ocr",
        ocrMs: ocr.durationMs,
        rulesMs,
        totalStarted: started,
        mimeType: document.mimeType,
        ocrProvider: ocr.provider,
        parser: parsed.parser,
        warnings: [...preOcrWarnings, ...ocr.warnings, ...parsed.reasons],
      });
    }

    return finalizeExtraction({
      extraction: parsed.extraction,
      extractionConfidence: Math.min(parsed.confidence, ocr.confidence || 1),
      minimumAcceptConfidence,
      source: ["ocr", "rules"],
      totalStarted: started,
      mimeType: document.mimeType,
      ocrProvider: ocr.provider,
      ocrMs: ocr.durationMs,
      rulesMs,
      parser: parsed.parser,
      warnings: [...preOcrWarnings, ...ocr.warnings, ...parsed.reasons],
    });
  } catch (error) {
    return makeResult({
      status: "failed",
      source: ["ocr"],
      confidence: 0,
      fallbackRecommended: true,
      fallbackReason: "local_ocr_or_rules_failed",
      totalStarted: started,
      mimeType: document.mimeType,
      ocrProvider: provider.name,
      warnings: [...preOcrWarnings, error instanceof Error ? error.message : String(error)],
    });
  }
}

function finalizeExtraction(input: {
  extraction: NonNullable<LocalExtractionResult["extraction"]>;
  extractionConfidence: number;
  minimumAcceptConfidence: number;
  source: LocalExtractionResult["source"];
  totalStarted: number;
  mimeType: string;
  ocrProvider?: string;
  textLayerMs?: number;
  ocrMs?: number;
  rulesMs?: number;
  parser?: string;
  warnings: string[];
}): LocalExtractionResult {
  const confidence = clamp(input.extractionConfidence, 0, 1);
  const criticalFieldsPresent = Number.isFinite(input.extraction.amount) &&
    Boolean(input.extraction.currency) &&
    Boolean(input.extraction.financialEntity) &&
    Boolean(input.extraction.documentReference || input.extraction.transferReference);
  const accepted = confidence >= input.minimumAcceptConfidence &&
    !input.extraction.reviewRequired && criticalFieldsPresent;

  return makeResult({
    status: accepted ? "completed" : "needs_review",
    extraction: input.extraction,
    source: input.source,
    confidence,
    fallbackRecommended: !accepted,
    fallbackReason: accepted
      ? undefined
      : !criticalFieldsPresent
      ? "local_critical_fields_incomplete"
      : "local_confidence_below_acceptance_gate",
    totalStarted: input.totalStarted,
    mimeType: input.mimeType,
    ocrProvider: input.ocrProvider,
    textLayerMs: input.textLayerMs,
    ocrMs: input.ocrMs,
    rulesMs: input.rulesMs,
    parser: input.parser,
    warnings: input.warnings,
  });
}

function makeResult(input: {
  status: LocalExtractionResult["status"];
  extraction?: LocalExtractionResult["extraction"];
  source: LocalExtractionResult["source"];
  confidence: number;
  fallbackRecommended: boolean;
  fallbackReason?: string;
  textLayerMs?: number;
  ocrMs?: number;
  rulesMs?: number;
  totalStarted: number;
  mimeType: string;
  ocrProvider?: string;
  parser?: string;
  warnings: string[];
}): LocalExtractionResult {
  return {
    engine: "sanad-local-extraction",
    engineVersion: ENGINE_VERSION,
    status: input.status,
    extraction: input.extraction,
    source: input.source,
    confidence: Number(clamp(input.confidence, 0, 1).toFixed(4)),
    fallbackRecommended: input.fallbackRecommended,
    fallbackReason: input.fallbackReason,
    timings: {
      totalMs: Number((performance.now() - input.totalStarted).toFixed(3)),
      textLayerMs: Number((input.textLayerMs ?? 0).toFixed(3)),
      ocrMs: Number((input.ocrMs ?? 0).toFixed(3)),
      rulesMs: Number((input.rulesMs ?? 0).toFixed(3)),
    },
    diagnostics: {
      mimeType: input.mimeType,
      ocrProvider: input.ocrProvider,
      parser: input.parser,
      warnings: input.warnings,
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
