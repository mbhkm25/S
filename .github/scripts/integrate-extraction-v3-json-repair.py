from pathlib import Path


def main() -> None:
    path = Path('supabase/functions/sanad-v3-analyze-operation/index.ts')
    source = path.read_text(encoding='utf-8')

    import_line = 'import { jsonrepair } from "npm:jsonrepair@3.13.1";\n\n'
    type_marker = 'type JsonRecord = Record<string, unknown>;'
    if import_line.strip() not in source:
        if type_marker not in source:
            raise RuntimeError('JsonRecord marker not found')
        source = source.replace(type_marker, import_line + type_marker, 1)

    old_parser = '''function parseGeminiJson(text: string): any {
  const cleaned = cleanJsonText(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\\{[\\s\\S]*\\}/);
    if (!match) throw new Error("gemini_json_parse_failed");
    return JSON.parse(match[0]);
  }
}'''
    new_parser = '''function parseGeminiJson(text: string): any {
  const cleaned = cleanJsonText(text);
  const match = cleaned.match(/\\{[\\s\\S]*\\}/);
  const candidate = match?.[0] || cleaned;
  try {
    return JSON.parse(candidate);
  } catch (directError) {
    try {
      const repaired = jsonrepair(candidate);
      const parsed = JSON.parse(repaired);
      console.warn(JSON.stringify({
        function: FUNCTION_NAME,
        event: "gemini_json_repaired",
        direct_error: truncateText(
          directError instanceof Error ? directError.message : String(directError),
          300,
        ),
      }));
      return parsed;
    } catch (repairError) {
      throw new Error(
        `gemini_json_parse_failed: ${truncateText(
          repairError instanceof Error ? repairError.message : String(repairError),
          400,
        )}`,
      );
    }
  }
}'''
    if old_parser not in source:
        raise RuntimeError('Legacy parseGeminiJson block not found')
    source = source.replace(old_parser, new_parser, 1)

    old_retry = '''      if (attempt >= params.maxAttempts || (!aborted && !lastError.includes("429") && !lastError.includes("50"))) {
        throw new Error(lastError);
      }'''
    new_retry = '''      const retryableParseFailure = lastError.includes("gemini_json_parse_failed");
      if (
        attempt >= params.maxAttempts ||
        (!aborted && !retryableParseFailure && !lastError.includes("429") && !lastError.includes("50"))
      ) {
        throw new Error(lastError);
      }'''
    if old_retry not in source:
        raise RuntimeError('Gemini retry guard not found')
    source = source.replace(old_retry, new_retry, 1)

    path.write_text(source, encoding='utf-8')

    Path('.github/scripts/integrate-extraction-v3-json-repair.py').unlink(missing_ok=True)
    Path('.github/workflows/integrate-extraction-v3-json-repair.yml').unlink(missing_ok=True)


if __name__ == '__main__':
    main()
