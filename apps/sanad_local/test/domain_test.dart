import 'package:flutter_test/flutter_test.dart';
import 'package:sanad_local/domain/local_operation.dart';
import 'package:sanad_local/services/local_ocr_service.dart';

void main() {
  test('status codec round-trips all local operation states', () {
    for (final status in LocalOperationStatus.values) {
      expect(LocalOperationStatusCodec.parse(status.dbValue), status);
    }
  });

  test('OCR normalization converts Arabic and Persian digits', () {
    const input = 'المبلغ ٥٠٠٠٠ ريال\nReference ۱۲۳۴۵۶';
    final normalized = normalizeOcrText(input);
    expect(normalized, contains('50000'));
    expect(normalized, contains('123456'));
  });

  test('OCR heuristic rewards financial evidence', () {
    final strong = heuristicConfidence('Amount 50000 YER\nReference 87542136');
    final weak = heuristicConfidence('hello');
    expect(strong, greaterThan(weak));
    expect(strong, lessThanOrEqualTo(.95));
  });

  test('local operation DB serialization preserves analysis fields', () {
    final now = DateTime(2026, 8, 11, 20, 30);
    final operation = LocalOperation(
      id: 'op-1',
      createdAt: now,
      updatedAt: now,
      status: LocalOperationStatus.analyzed,
      imagePath: '/private/op.jpg',
      amount: 50000,
      currency: 'YER',
      referenceNumber: '87542136',
      financialEntity: 'العمقي موبايل',
      analysisJson: const {'schemaVersion': 1, 'reviewRequired': false},
      analysisWarnings: const [],
      analysisConfidence: .98,
    );
    final restored = LocalOperation.fromDb(operation.toDb());
    expect(restored.id, operation.id);
    expect(restored.status, LocalOperationStatus.analyzed);
    expect(restored.amount, 50000);
    expect(restored.referenceNumber, '87542136');
    expect(restored.analysisConfidence, .98);
  });
}
