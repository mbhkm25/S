import 'package:flutter/services.dart';

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
  static const _channel = MethodChannel('sanad.local/ocr');

  @override
  Future<LocalOcrResult> recognize(String imagePath) async {
    final watch = Stopwatch()..start();
    final response = await _channel.invokeMethod<dynamic>('recognize', {'imagePath': imagePath});
    watch.stop();
    final raw = response is Map ? response['text']?.toString() ?? '' : response?.toString() ?? '';
    final normalized = normalizeOcrText(raw);
    if (normalized.trim().isEmpty) throw StateError('ocr_text_empty');
    final nativeConfidence = response is Map ? (response['confidence'] as num?)?.toDouble() : null;
    return LocalOcrResult(
      text: normalized,
      confidence: (nativeConfidence ?? heuristicConfidence(normalized)).clamp(0.0, 1.0).toDouble(),
      provider: 'tesseract4android:ara+eng:preprocessed-v2',
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
