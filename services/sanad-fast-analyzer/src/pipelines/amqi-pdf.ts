import type { CoreFinancialExtraction } from "../contracts.ts";
import { extractPdfTextLayer, type PdfTextExtractionResult } from "../pdf-text.ts";
import { parseAmqiFamilyText, type AmqiFamilyResult } from "../parsers/amqi-family.ts";

export interface AmqiPdfPipelineResult {
  status: "completed" | "not_amqi" | "needs_ocr" | "needs_review" | "failed";
  extraction?: CoreFinancialExtraction;
  pdf: PdfTextExtractionResult;
  parse?: AmqiFamilyResult;
  timings: {
    pdfTextMs: number;
    parseMs: number;
    totalMs: number;
  };
  reasons: string[];
}

export async function analyzeAmqiPdfBytes(pdfBytes: Uint8Array): Promise<AmqiPdfPipelineResult> {
  const started = performance.now();
  const pdf = await extractPdfTextLayer(pdfBytes);

  if (!pdf.textLayerDetected) {
    return {
      status: "needs_ocr",
      pdf,
      timings: {
        pdfTextMs: pdf.durationMs,
        parseMs: 0,
        totalMs: Number((performance.now() - started).toFixed(3)),
      },
      reasons: [...pdf.warnings],
    };
  }

  const parseStarted = performance.now();
  const parse = parseAmqiFamilyText(pdf.rawText);
  const parseMs = Number((performance.now() - parseStarted).toFixed(3));
  const totalMs = Number((performance.now() - started).toFixed(3));

  if (!parse.matched) {
    return {
      status: "not_amqi",
      pdf,
      parse,
      timings: { pdfTextMs: pdf.durationMs, parseMs, totalMs },
      reasons: [...pdf.warnings, ...parse.reasons],
    };
  }

  if (!parse.extraction) {
    return {
      status: "failed",
      pdf,
      parse,
      timings: { pdfTextMs: pdf.durationMs, parseMs, totalMs },
      reasons: ["amqi_family_parser_returned_no_extraction"],
    };
  }

  const status = parse.extraction.reviewRequired ? "needs_review" : "completed";
  return {
    status,
    extraction: parse.extraction,
    pdf,
    parse,
    timings: { pdfTextMs: pdf.durationMs, parseMs, totalMs },
    reasons: [...pdf.warnings, ...parse.reasons],
  };
}
