import 'package:tesseract_ocr/ocr_engine_config.dart';
import 'package:tesseract_ocr/tesseract_ocr.dart';

class LocalOcrResult {
  const LocalOcrResult({
    required this.text,
    required this.confidence,
    required this.provider,
    required this.durationMs,
  });

  final String text;
  final double confidence;
  final String provider;
  final int durationMs;
}

abstract interface class LocalOcrEngine {
  Future<LocalOcrResult> recognize(String imagePath);
}

class TesseractArabicOcrEngine implements LocalOcrEngine {
  const TesseractArabicOcrEngine();

  @override
  Future<LocalOcrResult> recognize(String imagePath) async {
    final watch = Stopwatch()..start();
    final config = OCRConfig(
      language: 'ara+eng',
      engine: OCREngine.tesseract,
      options: const {
        'tessedit_pageseg_mode': '6',
        'preserve_interword_spaces': '1',
      },
    );
    final raw = await TesseractOcr.extractText(imagePath, config: config);
    watch.stop();
    final normalized = normalizeOcrText(raw);
    if (normalized.trim().isEmpty) throw StateError('ocr_text_empty');
    return LocalOcrResult(
      text: normalized,
      confidence: heuristicConfidence(normalized),
      provider: 'tesseract_ocr:ara+eng:psm6',
      durationMs: watch.elapsedMilliseconds,
    );
  }
}

String normalizeOcrText(String input) {
  final value = input
      .replaceAllMapped(RegExp('[٠-٩]'), (m) => '٠١٢٣٤٥٦٧٨٩'.indexOf(m[0]!).toString())
      .replaceAllMapped(RegExp('[۰-۹]'), (m) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(m[0]!).toString())
      .replaceAll('\u200f', '')
      .replaceAll('\u200e', '')
      .replaceAll('\u00a0', ' ');
  final lines = value
      .split(RegExp(r'\r?\n'))
      .map((line) => line.replaceAll(RegExp(r'[ \t]+'), ' ').trim())
      .where((line) => line.isNotEmpty)
      .toList();
  return lines.join('\n');
}

double heuristicConfidence(String text) {
  final clean = text.trim();
  if (clean.isEmpty) return 0;
  final digitCount = RegExp(r'\d').allMatches(clean).length;
  final hasAmountSignal = RegExp(r'(مبلغ|المبلغ|amount|sar|yer|usd|ريال)', caseSensitive: false).hasMatch(clean);
  final hasReferenceSignal = RegExp(r'(مرجع|رقم|reference|ref|\bFT[A-Z0-9]+)', caseSensitive: false).hasMatch(clean);
  var score = 0.55;
  if (clean.length >= 40) score += 0.12;
  if (digitCount >= 4) score += 0.10;
  if (hasAmountSignal) score += 0.10;
  if (hasReferenceSignal) score += 0.08;
  return score.clamp(0.0, 0.95).toDouble();
}
