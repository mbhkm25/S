import 'dart:io';

import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../domain/local_operation.dart';

class LocalReportService {
  Future<File> buildDailyReport(List<LocalOperation> operations) async {
    final now = DateTime.now();
    final today = operations.where((o) {
      final d = o.createdAt;
      return d.year == now.year && d.month == now.month && d.day == now.day;
    }).toList();

    final fontData = await rootBundle.load('assets/fonts/NotoSansArabic.ttf');
    final logoData = await rootBundle.load('assets/branding/sanad-logo.png');
    final arabic = pw.Font.ttf(fontData);
    final logo = pw.MemoryImage(logoData.buffer.asUint8List());
    final document = pw.Document();
    final totals = <String, double>{};
    for (final operation in today) {
      final currency = operation.currency ?? 'غير محدد';
      totals[currency] = (totals[currency] ?? 0) + (operation.amount ?? 0);
    }

    document.addPage(
      pw.MultiPage(
        pageTheme: pw.PageTheme(
          pageFormat: PdfPageFormat.a4,
          margin: const pw.EdgeInsets.all(28),
          theme: pw.ThemeData.withFont(base: arabic, bold: arabic),
          textDirection: pw.TextDirection.rtl,
        ),
        build: (context) => [
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Container(
                width: 72,
                height: 46,
                padding: const pw.EdgeInsets.all(4),
                decoration: pw.BoxDecoration(
                  color: PdfColors.white,
                  border: pw.Border.all(color: PdfColors.grey300, width: .5),
                  borderRadius: const pw.BorderRadius.all(pw.Radius.circular(5)),
                ),
                child: pw.Image(logo, fit: pw.BoxFit.contain),
              ),
              pw.Text('تقرير عمليات اليوم', style: pw.TextStyle(font: arabic, fontSize: 18, fontWeight: pw.FontWeight.bold)),
            ],
          ),
          pw.SizedBox(height: 8),
          pw.Text(DateFormat('yyyy-MM-dd HH:mm').format(now)),
          pw.Divider(),
          pw.Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              pw.Text('عدد العمليات: ${today.length}', style: pw.TextStyle(font: arabic, fontWeight: pw.FontWeight.bold)),
              ...totals.entries.map((e) => pw.Text('${e.key}: ${NumberFormat('#,##0.##', 'en').format(e.value)}')),
            ],
          ),
          pw.SizedBox(height: 14),
          pw.TableHelper.fromTextArray(
            headers: const ['#', 'الوقت', 'الجهة', 'المبلغ', 'العملة', 'المرجع', 'الحالة'],
            data: [
              for (var i = 0; i < today.length; i++)
                [
                  '${i + 1}',
                  DateFormat('HH:mm').format(today[i].createdAt),
                  today[i].financialEntity ?? '—',
                  today[i].amount == null ? '—' : NumberFormat('#,##0.##', 'en').format(today[i].amount),
                  today[i].currency ?? '—',
                  today[i].referenceNumber ?? '—',
                  _reportStatus(today[i]),
                ],
            ],
            headerStyle: pw.TextStyle(font: arabic, fontSize: 9, fontWeight: pw.FontWeight.bold),
            cellStyle: pw.TextStyle(font: arabic, fontSize: 8),
            headerDecoration: const pw.BoxDecoration(color: PdfColors.grey200),
            cellAlignment: pw.Alignment.centerRight,
            border: pw.TableBorder.all(color: PdfColors.grey400, width: .4),
          ),
          pw.SizedBox(height: 12),
          pw.Text(
            'أُنشئ هذا التقرير بالكامل على الهاتف. المستندات الأصلية لا تُرفق ولا تُرفع إلى السحابة تلقائيًا.',
            style: pw.TextStyle(font: arabic, fontSize: 8, color: PdfColors.grey700),
          ),
        ],
      ),
    );

    final root = await getApplicationDocumentsDirectory();
    final reports = Directory(p.join(root.path, 'reports'));
    if (!await reports.exists()) await reports.create(recursive: true);
    final file = File(p.join(reports.path, 'sanad-local-${DateFormat('yyyyMMdd-HHmmss').format(now)}.pdf'));
    await file.writeAsBytes(await document.save(), flush: true);
    return file;
  }

  Future<void> share(File file) async {
    await Printing.sharePdf(bytes: await file.readAsBytes(), filename: p.basename(file.path));
  }
}

String _reportStatus(LocalOperation operation) {
  if (operation.status == LocalOperationStatus.reviewed) return 'تمت المراجعة';
  if (operation.needsReview) return 'يحتاج مراجعة';
  if (operation.isAnalyzed) return 'تم التحليل';
  if (operation.status == LocalOperationStatus.waitingInternet) return 'بانتظار الإنترنت';
  if (operation.status == LocalOperationStatus.failedAnalysis) return 'فشل التحليل';
  return 'محفوظ محليًا';
}
