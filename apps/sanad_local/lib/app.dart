import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import 'data/local_database.dart';
import 'domain/local_operation.dart';
import 'services/local_report_service.dart';
import 'services/operation_pipeline.dart';

class SanadLocalApp extends StatelessWidget {
  const SanadLocalApp({super.key});

  @override
  Widget build(BuildContext context) {
    final light = ColorScheme.fromSeed(seedColor: const Color(0xFF165D4A), brightness: Brightness.light);
    final dark = ColorScheme.fromSeed(seedColor: const Color(0xFF6CC9A9), brightness: Brightness.dark);
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'سند المحلي',
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      themeMode: ThemeMode.system,
      theme: _theme(light),
      darkTheme: _theme(dark),
      home: const HomeScreen(),
    );
  }

  ThemeData _theme(ColorScheme scheme) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: scheme.surface,
      // No fontFamily: SANAD Local deliberately follows the device/system font.
      visualDensity: VisualDensity.standard,
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerHighest.withValues(alpha: .45),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: scheme.outlineVariant.withValues(alpha: .65)),
        ),
      ),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  final _db = LocalDatabase.instance;
  final _pipeline = OperationPipeline();
  final _report = LocalReportService();
  final _search = TextEditingController();
  List<LocalOperation> _operations = const [];
  Map<String, num> _summary = const {};
  bool _busy = false;
  String? _notice;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _pipeline.processQueue().then((_) => _load());
    }
  }

  Future<void> _load() async {
    final operations = await _db.searchOperations(_search.text, limit: 250);
    final summary = await _db.todaySummary();
    if (!mounted) return;
    setState(() {
      _operations = operations;
      _summary = summary;
    });
  }

  Future<void> _capture(ImageSource source) async {
    setState(() {
      _busy = true;
      _notice = null;
    });
    try {
      final operation = await _pipeline.capture(source);
      if (operation != null) {
        _notice = 'تم حفظ العملية محليًا، ويجري تحليلها في الخلفية.';
        await _load();
        Future<void>.delayed(const Duration(seconds: 2), _load);
      }
    } catch (error) {
      _notice = 'تعذر إضافة العملية: ${_friendlyError(error)}';
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signIn() async {
    final email = TextEditingController();
    final password = TextEditingController();
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('ربط حساب سند', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text('الحفظ وOCR يعملان دون حساب. الحساب مطلوب فقط لإرسال نص OCR إلى Gemini.', style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 18),
            TextField(controller: email, keyboardType: TextInputType.emailAddress, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'البريد الإلكتروني')),
            const SizedBox(height: 12),
            TextField(controller: password, obscureText: true, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'كلمة المرور')),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: () => Navigator.pop(context, true),
              icon: const Icon(Icons.link_rounded),
              label: const Text('ربط الحساب'),
            ),
          ],
        ),
      ),
    );
    if (submitted != true) return;
    setState(() => _busy = true);
    try {
      await _pipeline.signIn(email.text, password.text);
      _notice = 'تم ربط حساب سند. سيتم استكمال العمليات المعلقة.';
      await _pipeline.processQueue();
      await _load();
    } catch (error) {
      _notice = 'تعذر تسجيل الدخول. تحقق من بيانات حساب سند.';
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _generateReport() async {
    if (_operations.isEmpty) {
      setState(() => _notice = 'لا توجد عمليات لإنشاء تقرير.');
      return;
    }
    setState(() => _busy = true);
    try {
      final all = await _db.recentOperations(limit: 2000);
      final file = await _report.buildDailyReport(all);
      await _report.share(file);
      _notice = 'تم إنشاء التقرير محليًا.';
    } catch (error) {
      _notice = 'تعذر إنشاء التقرير: ${_friendlyError(error)}';
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _search.dispose();
    _pipeline.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final count = (_summary['operations'] ?? 0).toInt();
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          titleSpacing: 20,
          title: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('سند المحلي', style: TextStyle(fontWeight: FontWeight.w800)),
              Text('دفتر عمليات هذا الجهاز', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w400)),
            ],
          ),
          actions: [
            IconButton(
              tooltip: _pipeline.signedIn ? 'حساب سند مرتبط' : 'ربط حساب سند',
              onPressed: _pipeline.signedIn ? null : _signIn,
              icon: Icon(_pipeline.signedIn ? Icons.cloud_done_outlined : Icons.cloud_off_outlined),
            ),
            const SizedBox(width: 8),
          ],
        ),
        body: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async {
              await _pipeline.processQueue();
              await _load();
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              children: [
                if (_busy) const LinearProgressIndicator(minHeight: 2),
                if (_notice != null) ...[
                  const SizedBox(height: 8),
                  _Notice(message: _notice!, onClose: () => setState(() => _notice = null)),
                ],
                const SizedBox(height: 12),
                _SummaryCard(summary: _summary, count: count),
                const SizedBox(height: 14),
                SizedBox(
                  height: 58,
                  child: FilledButton.icon(
                    key: const Key('capture-camera'),
                    onPressed: _busy ? null : () => _capture(ImageSource.camera),
                    icon: const Icon(Icons.photo_camera_outlined, size: 24),
                    label: const Text('تصوير إشعار مالي', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _busy ? null : () => _capture(ImageSource.gallery),
                        icon: const Icon(Icons.image_outlined),
                        label: const Text('من الصور'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        key: const Key('local-report'),
                        onPressed: _busy ? null : _generateReport,
                        icon: const Icon(Icons.description_outlined),
                        label: const Text('تقرير اليوم'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _search,
                  onChanged: (_) => _load(),
                  decoration: const InputDecoration(
                    hintText: 'ابحث بالمبلغ، المرجع، الجهة أو الاسم',
                    prefixIcon: Icon(Icons.search_rounded),
                  ),
                ),
                const SizedBox(height: 18),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('آخر العمليات', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                    Text('${_operations.length}', style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  ],
                ),
                const SizedBox(height: 10),
                if (_operations.isEmpty)
                  const _EmptyState()
                else
                  ..._operations.map(
                    (operation) => Padding(
                      padding: const EdgeInsets.only(bottom: 9),
                      child: _OperationCard(
                        operation: operation,
                        onTap: () async {
                          await Navigator.of(context).push(MaterialPageRoute(builder: (_) => OperationDetailsScreen(operationId: operation.id)));
                          await _load();
                        },
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _friendlyError(Object error) {
    final text = error.toString();
    if (text.contains('sanad_auth_required')) return 'احفظ العملية الآن واربط حساب سند لاحقًا لإكمال التحليل.';
    if (text.contains('ocr_text_empty')) return 'لم يتمكن القارئ المحلي من قراءة نص واضح.';
    return 'حدث خطأ تشغيلي، وبقيت البيانات المحلية محفوظة.';
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.summary, required this.count});
  final Map<String, num> summary;
  final int count;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final currencies = ['YER', 'SAR', 'USD'].where((c) => summary.containsKey('total_$c')).toList();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(color: theme.colorScheme.primaryContainer, borderRadius: BorderRadius.circular(13)),
                  child: Icon(Icons.point_of_sale_outlined, color: theme.colorScheme.onPrimaryContainer),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('عمليات اليوم', style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                      Text('$count عملية', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
                const _LocalBadge(),
              ],
            ),
            if (currencies.isNotEmpty) ...[
              const SizedBox(height: 16),
              Wrap(
                spacing: 16,
                runSpacing: 8,
                children: currencies.map((currency) {
                  final value = summary['total_$currency'] ?? 0;
                  return Text('${NumberFormat('#,##0.##', 'en').format(value)} $currency', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700));
                }).toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _LocalBadge extends StatelessWidget {
  const _LocalBadge();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(color: scheme.secondaryContainer, borderRadius: BorderRadius.circular(999)),
      child: Text('على الجهاز', style: TextStyle(color: scheme.onSecondaryContainer, fontSize: 11, fontWeight: FontWeight.w700)),
    );
  }
}

class _OperationCard extends StatelessWidget {
  const _OperationCard({required this.operation, required this.onTap});
  final LocalOperation operation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
          child: Row(
            children: [
              _StatusIcon(status: operation.status),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            operation.amount == null
                                ? operation.financialEntity ?? 'عملية محفوظة محليًا'
                                : '${NumberFormat('#,##0.##', 'en').format(operation.amount)} ${operation.currency ?? ''}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                          ),
                        ),
                        Text(DateFormat('HH:mm').format(operation.createdAt), style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      [operation.financialEntity, operation.referenceNumber].whereType<String>().where((v) => v.isNotEmpty).join(' · ').isEmpty
                          ? _statusText(operation.status)
                          : [operation.financialEntity, operation.referenceNumber].whereType<String>().where((v) => v.isNotEmpty).join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                    if (!operation.isAnalyzed) ...[
                      const SizedBox(height: 7),
                      LinearProgressIndicator(
                        minHeight: 2,
                        value: operation.status == LocalOperationStatus.reviewRequired ? 1 : null,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.chevron_left_rounded),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusIcon extends StatelessWidget {
  const _StatusIcon({required this.status});
  final LocalOperationStatus status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final review = status == LocalOperationStatus.reviewRequired;
    final done = status == LocalOperationStatus.analyzed || status == LocalOperationStatus.synced || status == LocalOperationStatus.promotedToCloud;
    final color = review ? scheme.tertiary : done ? scheme.primary : scheme.secondary;
    final icon = review ? Icons.priority_high_rounded : done ? Icons.done_rounded : Icons.hourglass_top_rounded;
    return Container(
      width: 38,
      height: 38,
      decoration: BoxDecoration(color: color.withValues(alpha: .12), borderRadius: BorderRadius.circular(12)),
      child: Icon(icon, color: color, size: 20),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 42, horizontal: 24),
      child: Column(
        children: [
          Icon(Icons.receipt_long_outlined, size: 48, color: theme.colorScheme.outline),
          const SizedBox(height: 12),
          Text('لم تسجل عمليات بعد', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 5),
          Text('صوّر الإشعار، وسيُحفظ أولًا داخل هذا الجهاز ثم يبدأ التحليل.', textAlign: TextAlign.center, style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.message, required this.onClose});
  final String message;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.secondaryContainer,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsetsDirectional.only(start: 14, top: 8, bottom: 8),
        child: Row(
          children: [
            Icon(Icons.info_outline_rounded, color: scheme.onSecondaryContainer, size: 20),
            const SizedBox(width: 9),
            Expanded(child: Text(message, style: TextStyle(color: scheme.onSecondaryContainer))),
            IconButton(onPressed: onClose, icon: const Icon(Icons.close_rounded), iconSize: 18),
          ],
        ),
      ),
    );
  }
}

class OperationDetailsScreen extends StatefulWidget {
  const OperationDetailsScreen({super.key, required this.operationId});
  final String operationId;

  @override
  State<OperationDetailsScreen> createState() => _OperationDetailsScreenState();
}

class _OperationDetailsScreenState extends State<OperationDetailsScreen> {
  LocalOperation? _operation;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final value = await LocalDatabase.instance.getOperation(widget.operationId);
    if (mounted) setState(() => _operation = value);
  }

  @override
  Widget build(BuildContext context) {
    final operation = _operation;
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: const Text('تفاصيل العملية')),
        body: operation == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: Image.file(
                      File(operation.imagePath),
                      height: 220,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => const SizedBox(height: 120, child: Center(child: Icon(Icons.broken_image_outlined, size: 42))),
                    ),
                  ),
                  const SizedBox(height: 14),
                  _DetailCard(operation: operation),
                  if (operation.analysisWarnings.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('ملاحظات التحليل', style: TextStyle(fontWeight: FontWeight.w800)),
                            const SizedBox(height: 8),
                            ...operation.analysisWarnings.map((warning) => Padding(
                                  padding: const EdgeInsets.only(bottom: 5),
                                  child: Text('• ${_warningLabel(warning)}'),
                                )),
                          ],
                        ),
                      ),
                    ),
                  ],
                  if ((operation.ocrText ?? '').isNotEmpty) ...[
                    const SizedBox(height: 12),
                    ExpansionTile(
                      title: const Text('النص المقروء محليًا'),
                      subtitle: Text(operation.ocrProvider ?? 'OCR محلي'),
                      childrenPadding: const EdgeInsets.all(16),
                      children: [SelectableText(operation.ocrText!, textDirection: TextDirection.rtl)],
                    ),
                  ],
                  const SizedBox(height: 16),
                  const Text('الصورة الأصلية محفوظة على هذا الجهاز ولا تُرفع إلى السحابة تلقائيًا.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12)),
                ],
              ),
      ),
    );
  }
}

class _DetailCard extends StatelessWidget {
  const _DetailCard({required this.operation});
  final LocalOperation operation;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(17),
        child: Column(
          children: [
            _DetailRow(label: 'الحالة', value: _statusText(operation.status)),
            _DetailRow(label: 'الجهة المالية', value: operation.financialEntity ?? '—'),
            _DetailRow(label: 'المبلغ', value: operation.amount == null ? '—' : '${NumberFormat('#,##0.##', 'en').format(operation.amount)} ${operation.currency ?? ''}'),
            _DetailRow(label: 'المرجع', value: operation.referenceNumber ?? '—'),
            _DetailRow(label: 'المستلم', value: operation.receiverName ?? '—'),
            _DetailRow(label: 'معرف المستلم', value: operation.receiverIdentifierValue ?? '—'),
            _DetailRow(label: 'وقت الالتقاط', value: DateFormat('yyyy-MM-dd HH:mm').format(operation.createdAt), last: true),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value, this.last = false});
  final String label;
  final String value;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: BoxDecoration(border: last ? null : Border(bottom: BorderSide(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: .6)))),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 105, child: Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant))),
          Expanded(child: Text(value, textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w700))),
        ],
      ),
    );
  }
}

String _statusText(LocalOperationStatus status) => switch (status) {
      LocalOperationStatus.localOnly => 'محفوظ محليًا',
      LocalOperationStatus.pendingOcr => 'جاري قراءة الإشعار',
      LocalOperationStatus.ocrCompleted => 'اكتملت القراءة المحلية',
      LocalOperationStatus.pendingAnalysis => 'بانتظار التحليل عبر الإنترنت',
      LocalOperationStatus.analyzed => 'تم التحليل',
      LocalOperationStatus.reviewRequired => 'يحتاج مراجعة',
      LocalOperationStatus.pendingSync => 'بانتظار المزامنة',
      LocalOperationStatus.synced => 'تمت المزامنة',
      LocalOperationStatus.syncFailed => 'تعذرت المزامنة',
      LocalOperationStatus.promotedToCloud => 'مشارك عبر سند',
    };

String _warningLabel(String code) {
  if (code.contains('ocr_confidence')) return 'جودة قراءة الصورة منخفضة؛ راجع الحقول المهمة.';
  if (code.contains('semantic_confidence')) return 'ثقة التحليل أقل من حد الاعتماد التلقائي.';
  if (code.contains('critical_field')) return 'تعذر حسم أحد الحقول الأساسية.';
  if (code.contains('financial_entity')) return 'لم تُحسم الجهة المالية.';
  if (code.contains('identifier_rejected')) return 'تم رفض معرف لا تدعمه قراءة OCR الأصلية.';
  return code;
}
