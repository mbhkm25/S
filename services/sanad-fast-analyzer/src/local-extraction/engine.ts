import { analyzeAmqiPdfBytes } from "../pipelines/amqi-pdf.ts";
import { parseAmqiFamilyText } from "../parsers/amqi-family.ts";
import type {
  LocalExtractionDocument,
  LocalExtractionResult,
  OcrProvider,
} from "./contracts.ts";

const ENGINE_VERSION = "0.1.0" as const;

export interface LocalExtractionEngineOptions {
  ocrProvider?: OcrProvider;
  minimumAcceptConfidence?: number;
}

export async function analyzeLocalDocument(
  document: LocalExtractionDocument,
  options: LocalExtractionEngineOptions = {},
): Promise<LocalExtractionResult> {
  const started = performance.now();
  const minimumAcceptConfidence = clamp(options.minimumAcceptConfidence ?? 0.98, 0, 1);

  if (document.mimeType === "application/pdf") {
    const pdfResult = await analyzeAmqiPdfBytes(document.bytes);
    if (pdfResult.status === "completed" && pdfResult.extraction) {
      const confidence = pdfResult.extraction.confidence;
      const accepted = confidence >= minimumAcceptConfidence && !pdfResult.extraction.reviewRequired;
      return result({
        status: accepted ? "completed" : "needs_review",
        extraction: pdfResult.extraction,
        source: ["pdf_text", "rules"],
        confidence,
        fallbackRecommended: !accepted,
        fallbackReason: accepted ? undefined : "local_confidence_below_acceptance_gate",
        textLayerMs: pdfResult.timings.pdfTextMs,
        rulesMs: pdfResult.timings.parseMs,
        totalStarted: started,
        mimeType: document.mimeType,
        detectedFamily: "amqi",
        warnings: pdfResult.reasons,
      });
    }

    if (pdfResult.status !== "needs_ocr") {
      return result({
        status: pdfResult.status === "needs_review" ? "needs_review" : "unsupported",
        source: ["pdf_text", "rules"],
        confidence: pdfResult.extraction?.confidence ?? 0,
        fallbackRecommended: true,
        fallbackReason: `pdf_fast_path_${pdfResult.status}`,
        textLayerMs: pdfResult.timings.pdfTextMs,
        rulesMs: pdfResult.timings.parseMs,
        totalStarted: started,
        mimeType: document.mimeType,
        detectedFamily: pdfResult.parse?.family,
        warnings: pdfResult.reasons,
      });
    }
  }

  const provider = options.ocrProvider;
  if (!provider || !provider.supports(document.mimeType)) {
    return result({
      status: "needs_ocr",
      source: [],
      confidence: 0,
      fallbackRecommended: true,
      fallbackReason: provider ? "ocr_provider_does_not_support_mime" : "ocr_provider_not_configured",
      totalStarted: started,
      mimeType: document.mimeType,
      warnings: [],
    });
  }

  try {
    const ocr = await provider.extract(document);
    const rulesStarted = performance.now();
    const parsed = parseAmqiFamilyText(ocr.rawText);
    const rulesMs = performance.now() - rulesStarted;

    if (!parsed.matched || !parsed.extraction) {
      return result({
        status: "unsupported",
        source: ["ocr", "rules"],
        confidence: ocr.confidence,
        fallbackRecommended: true,
        fallbackReason: "no_supported_template_matched_after_ocr",
        ocrMs: ocr.durationMs,
        rulesMs,
        totalStarted: started,
        mimeType: document.mimeType,
        ocrProvider: ocr.provider,
        warnings: [...ocr.warnings, ...parsed.reasons],
      });
    }

    const confidence = Math.min(parsed.extraction.confidence, ocr.confidence || 1);
    const accepted = confidence >= minimumAcceptConfidence && !parsed.extraction.reviewRequired;
    return result({
      status: accepted ? "completed" : "needs_review",
      extraction: parsed.extraction,
      source: ["ocr", "rules"],
      confidence,
      fallbackRecommended: !accepted,
      fallbackReason: accepted ? undefined : "local_confidence_below_acceptance_gate",
      ocrMs: ocr.durationMs,
      rulesMs,
      totalStarted: started,
      mimeType: document.mimeType,
      ocrProvider: ocr.provider,
      detectedFamily: parsed.family,
      warnings: [...ocr.warnings, ...parsed.reasons],
    });
  } catch (error) {
    return result({
      status: "failed",
      source: ["ocr"],
      confidence: 0,
      fallbackRecommended: true,
      fallbackReason: "local_ocr_or_rules_failed",
      totalStarted: started,
      mimeType: document.mimeType,
      ocrProvider: provider.name,
      warnings: [error instanceof Error ? error.message : String(error)],
    });
  }
}

function result(input: {
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
  detectedFamily?: string;
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
      detectedFamily: input.detectedFamily,
      warnings: input.warnings,
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
