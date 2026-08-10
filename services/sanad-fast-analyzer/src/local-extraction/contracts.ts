import type { CoreFinancialExtraction } from "../contracts.ts";

export type LocalExtractionStatus =
  | "completed"
  | "needs_review"
  | "needs_ocr"
  | "unsupported"
  | "failed";

export type LocalExtractionSource = "pdf_text" | "ocr" | "rules";

export interface LocalExtractionDocument {
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
  operationId?: string;
}

export interface OcrTextBlock {
  text: string;
  confidence: number;
  page?: number;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface OcrExtractionResult {
  provider: string;
  rawText: string;
  blocks: OcrTextBlock[];
  confidence: number;
  durationMs: number;
  warnings: string[];
}

/**
 * OCR is intentionally injected behind a provider contract so SANAD can benchmark
 * PaddleOCR, ONNX-based OCR, or another local runtime without coupling the core
 * extraction engine to a single vendor/runtime.
 */
export interface OcrProvider {
  readonly name: string;
  supports(mimeType: string): boolean;
  extract(document: LocalExtractionDocument): Promise<OcrExtractionResult>;
}

export interface LocalExtractionTimings {
  totalMs: number;
  textLayerMs: number;
  ocrMs: number;
  rulesMs: number;
}

export interface LocalExtractionResult {
  engine: "sanad-local-extraction";
  engineVersion: "0.2.0";
  status: LocalExtractionStatus;
  extraction?: CoreFinancialExtraction;
  source: LocalExtractionSource[];
  confidence: number;
  fallbackRecommended: boolean;
  fallbackReason?: string;
  timings: LocalExtractionTimings;
  diagnostics: {
    mimeType: string;
    ocrProvider?: string;
    parser?: string;
    warnings: string[];
  };
}
