export interface PdfTextExtractionResult {
  text: string;
  durationMs: number;
  stderr: string;
  executable: string;
}

export interface PdfTextExtractor {
  extract(pdfPath: string): Promise<PdfTextExtractionResult>;
}

function nowMs(): number {
  return performance.now();
}

export class PdftotextExtractor implements PdfTextExtractor {
  constructor(private readonly executable = "pdftotext") {}

  async extract(pdfPath: string): Promise<PdfTextExtractionResult> {
    const started = nowMs();
    const command = new Deno.Command(this.executable, {
      args: ["-layout", "-enc", "UTF-8", pdfPath, "-"],
      stdout: "piped",
      stderr: "piped",
    });

    let output: Deno.CommandOutput;
    try {
      output = await command.output();
    } catch (error) {
      throw new Error(
        `pdftotext_unavailable:${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const decoder = new TextDecoder();
    const text = decoder.decode(output.stdout);
    const stderr = decoder.decode(output.stderr).trim();
    const durationMs = nowMs() - started;

    if (!output.success) {
      throw new Error(`pdftotext_failed:${output.code}:${stderr || "unknown_error"}`);
    }
    if (text.trim().length === 0) {
      throw new Error("pdf_text_layer_empty");
    }

    return { text, durationMs, stderr, executable: this.executable };
  }
}
