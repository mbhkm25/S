import type { CoreFinancialExtraction } from "../contracts.ts";
import { parseAmqiFamilyText } from "../parsers/amqi-family.ts";

export interface LocalParserResult {
  parser: string;
  matched: boolean;
  extraction?: CoreFinancialExtraction;
  confidence: number;
  reasons: string[];
}

export interface LocalTextParser {
  readonly name: string;
  parse(rawText: string): LocalParserResult;
}

const amqiParser: LocalTextParser = {
  name: "amqi-family-v1",
  parse(rawText: string): LocalParserResult {
    const result = parseAmqiFamilyText(rawText);
    return {
      parser: "amqi-family-v1",
      matched: result.matched,
      extraction: result.extraction,
      confidence: result.extraction?.confidence ?? 0,
      reasons: result.reasons,
    };
  },
};

const DEFAULT_PARSERS: readonly LocalTextParser[] = [amqiParser];

export interface ParserRegistryOptions {
  parsers?: readonly LocalTextParser[];
  minimumMatchConfidence?: number;
}

/**
 * Runs deterministic parsers independently and selects the strongest valid match.
 * No parser can mutate another parser's input or result, which makes adding new
 * financial entities safe and benchmarkable. Ambiguous high-confidence matches
 * fail closed instead of silently picking one.
 */
export function parseWithRegistry(
  rawText: string,
  options: ParserRegistryOptions = {},
): LocalParserResult {
  const parsers = options.parsers ?? DEFAULT_PARSERS;
  const minimum = clamp(options.minimumMatchConfidence ?? 0.5);
  const candidates = parsers
    .map((parser) => parser.parse(rawText))
    .filter((candidate) => candidate.matched && candidate.extraction && candidate.confidence >= minimum)
    .sort((a, b) => b.confidence - a.confidence);

  if (candidates.length === 0) {
    return {
      parser: "none",
      matched: false,
      confidence: 0,
      reasons: ["no_deterministic_parser_matched"],
    };
  }

  const best = candidates[0]!;
  const second = candidates[1];
  if (second && Math.abs(best.confidence - second.confidence) < 0.02 &&
    best.extraction?.financialEntityCode !== second.extraction?.financialEntityCode) {
    return {
      parser: "ambiguous",
      matched: false,
      confidence: best.confidence,
      reasons: [
        `ambiguous_parsers:${best.parser}:${second.parser}`,
        ...best.reasons,
        ...second.reasons,
      ],
    };
  }

  return best;
}

export function defaultLocalParsers(): readonly LocalTextParser[] {
  return DEFAULT_PARSERS;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
