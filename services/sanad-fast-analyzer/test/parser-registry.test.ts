import { assertEquals } from "jsr:@std/assert@1";
import type { CoreFinancialExtraction } from "../src/contracts.ts";
import { parseWithRegistry, type LocalTextParser } from "../src/local-extraction/parser-registry.ts";

function extraction(entityCode: string, confidence: number): CoreFinancialExtraction {
  return {
    schemaVersion: 2,
    templateCode: `${entityCode}_template`,
    templateVersion: 1,
    financialEntity: entityCode,
    financialEntityCode: entityCode,
    transactionType: "transfer",
    transactionDirection: "incoming",
    amount: 100,
    currency: "YER",
    documentReference: "REF123",
    parties: [],
    confidence,
    fieldConfidence: {},
    warnings: [],
    reviewRequired: false,
  };
}

Deno.test("parser registry fails closed on competing entity matches", () => {
  const parserA: LocalTextParser = {
    name: "a",
    parse: () => ({ parser: "a", matched: true, extraction: extraction("entity_a", 0.99), confidence: 0.99, reasons: [] }),
  };
  const parserB: LocalTextParser = {
    name: "b",
    parse: () => ({ parser: "b", matched: true, extraction: extraction("entity_b", 0.98), confidence: 0.98, reasons: [] }),
  };

  const result = parseWithRegistry("anything", { parsers: [parserA, parserB] });
  assertEquals(result.matched, false);
  assertEquals(result.parser, "ambiguous");
});

Deno.test("parser registry selects clearly stronger deterministic match", () => {
  const parserA: LocalTextParser = {
    name: "a",
    parse: () => ({ parser: "a", matched: true, extraction: extraction("entity_a", 0.99), confidence: 0.99, reasons: [] }),
  };
  const parserB: LocalTextParser = {
    name: "b",
    parse: () => ({ parser: "b", matched: true, extraction: extraction("entity_b", 0.8), confidence: 0.8, reasons: [] }),
  };

  const result = parseWithRegistry("anything", { parsers: [parserA, parserB] });
  assertEquals(result.matched, true);
  assertEquals(result.parser, "a");
  assertEquals(result.extraction?.financialEntityCode, "entity_a");
});
