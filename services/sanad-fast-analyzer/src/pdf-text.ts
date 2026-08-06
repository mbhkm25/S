// The root application TypeScript resolver does not understand Deno's npm: specifier.
// Deno resolves and type-checks this import in the dedicated fast-engine workflow.
// @ts-ignore Deno-specific npm specifier
import { extractText } from "npm:unpdf@1.6.2";
import { normalizeArabicFinancialText } from "./text-normalization.ts";

export interface PdfTextExtractionResult {
  totalPages: number;
  rawText: string;
  normalizedText: string;
  durationMs: number;
  textLayerDetected: boolean;
  qualityScore: number;
  warnings: string[];
}

const MIN_TEXT_LENGTH = 80;

function countArabicLetters(value: string): number {
  return value.match(/[\u0600-\u06FF]/g)?.length ?? 0;
}

function countFinancialTokens(value: string): number {
  return value.match(/(?:20\d{2}-\d{2}-\d{2}|\d{6,}|#\d+(?:\.\d+)?#|SAR|YER|USD)/gi)?.length ?? 0;
}

export function assessPdfTextLayer(rawText: string, totalPages: number): Omit<PdfTextExtractionResult, "durationMs"> {
  const normalizedText = normalizeArabicFinancialText(rawText);
  const warnings: string[] = [];
  const arabicLetters = countArabicLetters(normalizedText);
  const financialTokens = countFinancialTokens(normalizedText);
  const lengthScore = Math.min(1, normalizedText.length / 300);
  const arabicScore = Math.min(1, arabicLetters / 80);
  const tokenScore = Math.min(1, financialTokens / 6);
  const qualityScore = Number((lengthScore * 0.35 + arabicScore * 0.35 + tokenScore * 0.3).toFixed(4));
  const textLayerDetected = normalizedText.length >= MIN_TEXT_LENGTH && arabicLetters >= 20 && financialTokens >= 2;

  if (totalPages !== 1) warnings.push("pdf_page_count_not_one");
  if (!textLayerDetected) warnings.push("pdf_text_layer_insufficient");
  if (qualityScore < 0.75) warnings.push("pdf_text_quality_below_preferred_threshold");

  return {
    totalPages,
    rawText,
    normalizedText,
    textLayerDetected,
    qualityScore,
    warnings,
  };
}

export async function extractPdfTextLayer(pdfBytes: Uint8Array): Promise<PdfTextExtractionResult> {
  const started = performance.now();
  const { totalPages, text } = await extractText(pdfBytes, { mergePages: true });
  const assessed = assessPdfTextLayer(text, totalPages);
  return {
    ...assessed,
    durationMs: Number((performance.now() - started).toFixed(3)),
  };
}
