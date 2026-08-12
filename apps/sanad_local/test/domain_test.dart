import 'package:flutter_test/flutter_test.dart';
import 'package:sanad_local/domain/local_operation.dart';
import 'package:sanad_local/domain/financial_entity_registry.dart';
import 'package:sanad_local/domain/localized_analysis.dart';
import 'package:sanad_local/services/financial_analysis_engine.dart';
import 'package:sanad_local/services/local_ocr_service.dart';

void main() {
  test('status codec round-trips all local operation states', () {
    for (final status in LocalOperationStatus.values) {
      expect(LocalOperationStatusCodec.parse(status.dbValue), status);
    }
  });

  test('OCR normalization converts Arabic and Persian digits', () {
    const input = 'المبلغ ٥٠٠٠٠ ريال سعودى\nReference ۱۲۳۴۵۶';
    final normalized = normalizeOcrText(input);
    expect(normalized, contains('50000'));
    expect(normalized, contains('123456'));
    expect(normalized, contains('سعودي'));
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

  test('financial entity registry canonicalizes Arabic and English names', () {
    expect(
      FinancialEntityRegistry.resolve(name: 'Al Kuraimi Islamic Bank').arabicName,
      'بنك الكريمي الإسلامي',
    );
    expect(
      FinancialEntityRegistry.resolve(name: 'Al-Omqi Exchange').arabicName,
      'شركة العمقي للصرافة',
    );
  });

  test('warning codes are converted to cashier-facing Arabic', () {
    expect(localizedWarning('critical_field_unresolved'), contains('المبلغ'));
    expect(localizedWarning('critical_field_unresolved'), isNot(contains('critical_field')));
  });

  test('local rules extract real-shape Al-Omqi critical fields', () {
    const text = '''
شركة العمقي للصرافة
إشعار إيداع عبر تطبيق العمقي جوال
المرجع: 8-342038458
المبلغ #500# سعودي
2026-08-11 08:29 PM
''';
    final result = const LocalFinancialAnalyzer().analyzeDeterministically(text, ocrConfidence: .96);
    expect(result['financialEntityCode'], 'alomqy_mobile');
    expect(result['templateCode'], 'amqi_mobile_deposit_notice_v1');
    expect(result['amount'], 500);
    expect(result['currency'], 'SAR');
    expect(result['documentReference'], '8-342038458');
    expect((result['quality'] as Map)['criticalComplete'], isTrue);
    expect((result['quality'] as Map)['autoAcceptEligible'], isFalse);
    expect(result['reviewRequired'], isTrue);
  });

  test('local rules separate Kuraimi FT reference from document reference', () {
    const text = '''
Al Kuraimi Islamic Bank
Fund Transfer - Other
Amount 125000 YER
رقم المرجع: 7542198
FT9AC204881
''';
    final result = const LocalFinancialAnalyzer().analyzeDeterministically(text, ocrConfidence: .94);
    expect(result['financialEntityCode'], 'kuraimi_yer');
    expect(result['amount'], 125000);
    expect(result['currency'], 'YER');
    expect(result['documentReference'], '7542198');
    expect(result['transferReference'], 'FT9AC204881');
    expect((result['quality'] as Map)['autoAcceptEligible'], isFalse);
  });

  test('Kuraimi transaction card is detected from its FT contract without a printed bank name', () {
    const text = '''
2026-04-21 11:34AM
1,721.88 SAR المبلغ
FT26111FG616 رقم المرجع
Fund Transfer - Other نوع العملية
''';
    final result = const LocalFinancialAnalyzer().analyzeDeterministically(text, ocrConfidence: .89);
    expect(result['financialEntityCode'], 'kuraimi_sar');
    expect(result['templateCode'], 'kuraimi_haseb_transaction_card_v1');
    expect(result['amount'], 1721.88);
    expect(result['currency'], 'SAR');
    expect(result['transferReference'], 'FT26111FG616');
  });

  test('semantic values without OCR evidence are rejected', () {
    const text = 'العمقي المبلغ 500 SAR المرجع 8-342038458';
    final analyzer = const LocalFinancialAnalyzer();
    final deterministic = analyzer.analyzeDeterministically(text, ocrConfidence: .9);
    final merged = analyzer.mergeSemanticWithEvidence(
      deterministic: deterministic,
      semantic: const {
        'financialEntity': 'Al-Omqi Exchange',
        'financialEntityCode': 'alomqi',
        'amount': 999,
        'currency': 'USD',
        'documentReference': '999999999',
        'parties': [],
        'confidence': .99,
        'warnings': [],
        'reviewRequired': false,
      },
      ocrText: text,
      ocrConfidence: .9,
    );
    expect(merged['amount'], 500);
    expect(merged['currency'], 'SAR');
    expect(merged['documentReference'], '8-342038458');
  });

  test('semantic completion cannot bypass the local OCR confidence gate', () {
    const text = '''
العمقي المبلغ 500 SAR المرجع 8-342038458
من حساب أحمد رقم 123456789 إلى حساب محمد رقم 987654321
''';
    final analyzer = const LocalFinancialAnalyzer();
    final deterministic = analyzer.analyzeDeterministically(text, ocrConfidence: .75);
    final merged = analyzer.mergeSemanticWithEvidence(
      deterministic: deterministic,
      semantic: const {
        'financialEntity': 'Al-Omqi Exchange',
        'financialEntityCode': 'alomqi',
        'amount': 500,
        'currency': 'SAR',
        'documentReference': '8-342038458',
        'parties': [
          {
            'role': 'sender',
            'name': 'أحمد',
            'identifiers': [
              {'type': 'account_number', 'value': '123456789'}
            ],
          },
          {
            'role': 'receiver',
            'name': 'محمد',
            'identifiers': [
              {'type': 'account_number', 'value': '987654321'}
            ],
          },
        ],
        'confidence': .99,
        'warnings': [],
        'reviewRequired': false,
      },
      ocrText: text,
      ocrConfidence: .75,
    );
    expect((merged['quality'] as Map)['autoAcceptEligible'], isFalse);
    expect(merged['reviewRequired'], isTrue);
  });
}
