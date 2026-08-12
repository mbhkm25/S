import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sanad_local/app.dart';
import 'package:sanad_local/data/local_database.dart';
import 'package:sanad_local/domain/local_operation.dart';
import 'package:sanad_local/services/local_ocr_service.dart';
import 'package:sanad_local/services/local_file_store.dart';
import 'package:sanad_local/services/local_report_service.dart';
import 'package:sanad_local/services/sanad_cloud.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    await initializeSanadCloud();
    await LocalDatabase.instance.database;
  });

  testWidgets('boots with system-native cashier actions', (tester) async {
    await tester.pumpWidget(const SanadLocalApp());
    await tester.pumpAndSettle(const Duration(seconds: 2));
    expect(find.text('دفتر العمليات المحلي'), findsOneWidget);
    expect(find.byKey(const Key('capture-camera')), findsOneWidget);
    expect(find.byKey(const Key('import-files')), findsOneWidget);
    expect(find.byKey(const Key('local-report')), findsOneWidget);
  });

  testWidgets('SQLite persists and queries 1000 operations', (tester) async {
    final db = LocalDatabase.instance;
    final stamp = DateTime.now().microsecondsSinceEpoch;
    final now = DateTime.now();
    for (var i = 0; i < 1000; i++) {
      await db.insertOperation(LocalOperation(
        id: 'stress-$stamp-$i',
        createdAt: now.add(Duration(milliseconds: i)),
        updatedAt: now.add(Duration(milliseconds: i)),
        status: LocalOperationStatus.analyzed,
        imagePath: '/private/stress-$i.jpg',
        amount: (i + 1).toDouble(),
        currency: i.isEven ? 'YER' : 'SAR',
        referenceNumber: 'REF$stamp$i',
        financialEntity: 'اختبار محلي',
        analysisConfidence: .99,
      ));
    }
    final recent = await db.recentOperations(limit: 1000);
    expect(recent.length, greaterThanOrEqualTo(1000));
    final found = await db.searchOperations('REF${stamp}999');
    expect(found.any((o) => o.id == 'stress-$stamp-999'), isTrue);
  });

  testWidgets('on-device OCR recognizes a bundled financial fixture', (tester) async {
    final data = await rootBundle.load('assets/test/notice.png');
    final temp = await getTemporaryDirectory();
    final file = File('${temp.path}/sanad-ocr-fixture.png');
    await file.writeAsBytes(data.buffer.asUint8List(), flush: true);
    final result = await const TesseractArabicOcrEngine().recognize(file.path);
    expect(result.provider, contains('tesseract'));
    expect(result.text.replaceAll(',', ''), contains('50000'));
    expect(result.text.toUpperCase(), contains('YER'));
  });

  testWidgets('daily PDF is generated completely on-device', (tester) async {
    final now = DateTime.now();
    final file = await LocalReportService().buildDailyReport([
      LocalOperation(
        id: 'report-op',
        createdAt: now,
        updatedAt: now,
        status: LocalOperationStatus.analyzed,
        imagePath: '/private/report.jpg',
        financialEntity: 'العمقي موبايل',
        amount: 50000,
        currency: 'YER',
        referenceNumber: '87542136',
      ),
    ]);
    expect(await file.exists(), isTrue);
    expect(await file.length(), greaterThan(1500));
    final header = await file.openRead(0, 5).fold<List<int>>([], (a, b) => a..addAll(b));
    expect(String.fromCharCodes(header), startsWith('%PDF'));

    final stored = await LocalFileStore().persist(
      sourcePath: file.path,
      operationId: 'pdf-import-${now.microsecondsSinceEpoch}',
      originalFileName: 'financial-notice.pdf',
      declaredMimeType: 'application/pdf',
    );
    expect(stored.mimeType, 'application/pdf');
    expect(stored.pageCount, greaterThanOrEqualTo(1));
    expect(stored.previewPath, isNotNull);
    expect(await File(stored.previewPath!).exists(), isTrue);
  });

  testWidgets('Arabic PDF report scales to 1, 50, 200 and 500 operations', (tester) async {
    final now = DateTime.now();
    for (final count in const [1, 50, 200, 500]) {
      final operations = List.generate(
        count,
        (index) => LocalOperation(
          id: 'report-scale-$count-$index',
          createdAt: now.add(Duration(milliseconds: index)),
          updatedAt: now.add(Duration(milliseconds: index)),
          status: index.isEven ? LocalOperationStatus.analyzed : LocalOperationStatus.reviewRequired,
          imagePath: '/private/report-$index.jpg',
          financialEntity: index.isEven ? 'شركة العمقي للصرافة' : 'بنك الكريمي الإسلامي',
          amount: (index + 1) * 1000,
          currency: index.isEven ? 'YER' : 'SAR',
          referenceNumber: 'R$count$index',
        ),
      );
      final file = await LocalReportService().buildDailyReport(operations);
      expect(await file.exists(), isTrue, reason: 'report size $count');
      expect(await file.length(), greaterThan(1500), reason: 'report size $count');
    }
  });
}
