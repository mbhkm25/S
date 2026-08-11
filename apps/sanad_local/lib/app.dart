import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart' show DateFormat, NumberFormat;

import 'data/local_database.dart';
import 'domain/local_operation.dart';
import 'services/local_report_service.dart';
import 'services/operation_pipeline.dart';

class SanadLocalApp extends StatelessWidget {
  const SanadLocalApp({super.key});

  @override
  Widget build(BuildContext context) {
    ThemeData theme(ColorScheme scheme) => ThemeData(
          useMaterial3: true,
          colorScheme: scheme,
          scaffoldBackgroundColor: scheme.surface,
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: scheme.surfaceContainerHighest.withValues(alpha: .45),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide.none,
            ),
          ),
          cardTheme: CardThemeData(
            elevation: 0,
            margin: EdgeInsets.zero,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
              side: BorderSide(color: scheme.outlineVariant),
            ),
          ),
        );

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'سند المحلي',
      locale: const Locale('ar'),
      themeMode: ThemeMode.system,
      theme: theme(ColorScheme.fromSeed(seedColor: const Color(0xFF145E4A))),
      darkTheme: theme(ColorScheme.fromSeed(
        seedColor: const Color(0xFF6CC9A9),
        brightness: Brightness.dark,
      )),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  final LocalDatabase _db = LocalDatabase.instance;
  final OperationPipeline _pipeline = OperationPipeline();
  final LocalReportService _report = LocalReportService();
  final TextEditingController _search = TextEditingController();

  List<LocalOperation> _operations = const [];
  Map<String, num> _summary = const {};
  bool _busy = false;
  String? _notice;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _pipeline.processQueue().then((_) => _refresh());
    }
  }

  Future<void> _refresh() async {
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
        _notice = 'تم حفظ الإشعار على هذا الجهاز، ويجري تحليله في الخلفية.';
        await _refresh();
      }
    } catch (_) {
      _notice = 'تعذر إكمال الإضافة. إذا تم حفظ الصورة فستبقى العملية محلية وآمنة.';
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signIn() async {
    final email = TextEditingController();
    final password = TextEditingController();
    final submit = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => Directionality(
        textDirection: TextDirection.rtl,
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            20,
            20,
            MediaQuery.viewInsetsOf(context).bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('ربط حساب سند', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 6),
              const Text('الحفظ وقراءة OCR محليان. الحساب مطلوب فقط لتنظيم النص عبر Gemini.'),
              const SizedBox(height: 18),
              TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                textDirection: TextDirection.ltr,
                decoration: const InputDecoration(labelText: 'البريد الإلكتروني'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: password,
                obscureText: true,
                textDirection: TextDirection.ltr,
                decoration: const InputDecoration(labelText: 'كلمة المرور'),
              ),
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: () => Navigator.pop(context, true),
                icon: const Icon(Icons.link_rounded),
                label: const Text('ربط الحساب'),
              ),
            ],
          ),
        ),
      ),
    );
    if (submit != true) return;
    setState(() => _busy = true);
    try {
      await _pipeline.signIn(email.text, password.text);
      _notice = 'تم ربط حساب سند واستئناف العمليات المعلقة.';
      await _pipeline.processQueue();
      await _refresh();
    } catch (_) {
      _notice = 'تعذر تسجيل الدخول. تحقق من بيانات حساب سند.';
    } finally {
      email.dispose();
      password.dispose();
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _makeReport() async {
    setState(() => _busy = true);
    try {
      final all = await _db.recentOperations(limit: 2000);
      if (all.isEmpty) {
        _notice = 'لا توجد عمليات لإنشاء تقرير.';
        return;
      }
      final file = await _report.buildDailyReport(all);
      await _report.share(file);
      _notice = 'تم إنشاء التقرير محليًا.';
    } catch (_) {
      _notice = 'تعذر إنشاء التقرير المحلي.';
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
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('سند المحلي', style: TextStyle(fontWeight: FontWeight.w800)),
              Text('دفتر عمليات هذا الجهاز', style: TextStyle(fontSize: 12)),
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
              await _refresh();
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              children: [
                if (_busy) const LinearProgressIndicator(minHeight: 2),
                if (_notice != null) ...[
                  const SizedBox(height: 8),
                  Material(
                    color: theme.colorScheme.secondaryContainer,
                    borderRadius: BorderRadius.circular(14),
                    child: ListTile(
                      dense: true,
                      title: Text(_notice!),
                      trailing: IconButton(
                        onPressed: () => setState(() => _notice = null),
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                _SummaryCard(summary: _summary),
                const SizedBox(height: 14),
                SizedBox(
                  height: 58,
                  child: FilledButton.icon(
                    key: const Key('capture-camera'),
                    onPressed: _busy ? null : () => _capture(ImageSource.camera),
                    icon: const Icon(Icons.photo_camera_outlined),
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
                        onPressed: _busy ? null : _makeReport,
                        icon: const Icon(Icons.description_outlined),
                        label: const Text('تقرير اليوم'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                TextField(
                  controller: _search,
                  onChanged: (_) => _refresh(),
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
                    Text('${_operations.length}'),
                  ],
                ),
                const SizedBox(height: 10),
                if (_operations.isEmpty)
                  const _EmptyState()
                else
                  for (final operation in _operations)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 9),
                      child: _OperationCard(
                        operation: operation,
                        onTap: () async {
                          await Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => OperationDetailsScreen(operationId: operation.id),
                            ),
                          );
                          await _refresh();
                        },
                      ),
                    ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.summary});
  final Map<String, num> summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final count = (summary['operations'] ?? 0).toInt();
    final currencies = ['YER', 'SAR', 'USD'].where((c) => summary.containsKey('total_$c')).toList();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: theme.colorScheme.primaryContainer,
                  child: Icon(Icons.point_of_sale_outlined, color: theme.colorScheme.onPrimaryContainer),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('عمليات اليوم'),
                      Text('$count عملية', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
                Chip(label: const Text('على الجهاز')),
              ],
            ),
            if (currencies.isNotEmpty) ...[
              const SizedBox(height: 14),
              Wrap(
                spacing: 14,
                runSpacing: 8,
                children: [
                  for (final currency in currencies)
                    Text(
                      '${NumberFormat('#,##0.##', 'en').format(summary['total_$currency'] ?? 0)} $currency',
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
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
    final title = operation.amount == null
        ? (operation.financialEntity ?? 'عملية محفوظة محليًا')
        : '${NumberFormat('#,##0.##', 'en').format(operation.amount)} ${operation.currency ?? ''}';
    final subtitle = [operation.financialEntity, operation.referenceNumber]
        .whereType<String>()
        .where((value) => value.isNotEmpty)
        .join(' · ');
    return Card(
      child: ListTile(
        onTap: onTap,
        leading: Icon(_statusIcon(operation.status), color: _statusColor(context, operation.status)),
        title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(subtitle.isEmpty ? _statusText(operation.status) : subtitle),
        trailing: Text(DateFormat('HH:mm').format(operation.createdAt), style: theme.textTheme.labelMedium),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 34),
        child: Column(
          children: [
            Icon(Icons.receipt_long_outlined, size: 42, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 10),
            const Text('لا توجد عمليات على هذا الجهاز بعد.'),
          ],
        ),
      );
}

class OperationDetailsScreen extends StatelessWidget {
  const OperationDetailsScreen({super.key, required this.operationId});
  final String operationId;

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: const Text('تفاصيل العملية')),
        body: FutureBuilder<LocalOperation?>(
          future: LocalDatabase.instance.getOperation(operationId),
          builder: (context, snapshot) {
            final operation = snapshot.data;
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (operation == null) return const Center(child: Text('تعذر العثور على العملية.'));
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: Image.file(
                    File(operation.imagePath),
                    fit: BoxFit.contain,
                    errorBuilder: (context, error, stackTrace) => const SizedBox(
                      height: 160,
                      child: Center(child: Icon(Icons.broken_image_outlined)),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        _DetailRow(label: 'الحالة', value: _statusText(operation.status)),
                        _DetailRow(label: 'الجهة', value: operation.financialEntity ?? '—'),
                        _DetailRow(
                          label: 'المبلغ',
                          value: operation.amount == null
                              ? '—'
                              : '${NumberFormat('#,##0.##', 'en').format(operation.amount)} ${operation.currency ?? ''}',
                        ),
                        _DetailRow(label: 'المرجع', value: operation.referenceNumber ?? '—'),
                        _DetailRow(label: 'المستلم', value: operation.receiverName ?? '—'),
                        _DetailRow(label: 'OCR', value: operation.ocrProvider ?? '—'),
                      ],
                    ),
                  ),
                ),
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
                          for (final warning in operation.analysisWarnings) Text('• $warning'),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(width: 90, child: Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant))),
            Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w700))),
          ],
        ),
      );
}

String _statusText(LocalOperationStatus status) => switch (status) {
      LocalOperationStatus.localOnly => 'محفوظ محليًا',
      LocalOperationStatus.pendingOcr => 'جاري قراءة الإشعار',
      LocalOperationStatus.ocrCompleted => 'تمت القراءة محليًا',
      LocalOperationStatus.pendingAnalysis => 'بانتظار التحليل',
      LocalOperationStatus.analyzed => 'تم التحليل',
      LocalOperationStatus.reviewRequired => 'يحتاج مراجعة',
      LocalOperationStatus.pendingSync => 'بانتظار المزامنة',
      LocalOperationStatus.synced => 'متزامن',
      LocalOperationStatus.syncFailed => 'تعذرت المزامنة',
      LocalOperationStatus.promotedToCloud => 'مرفوع إلى سند',
    };

IconData _statusIcon(LocalOperationStatus status) => switch (status) {
      LocalOperationStatus.analyzed || LocalOperationStatus.synced || LocalOperationStatus.promotedToCloud => Icons.check_circle_outline_rounded,
      LocalOperationStatus.reviewRequired || LocalOperationStatus.syncFailed => Icons.error_outline_rounded,
      LocalOperationStatus.pendingOcr || LocalOperationStatus.ocrCompleted || LocalOperationStatus.pendingAnalysis || LocalOperationStatus.pendingSync => Icons.timelapse_rounded,
      LocalOperationStatus.localOnly => Icons.phone_android_rounded,
    };

Color _statusColor(BuildContext context, LocalOperationStatus status) {
  final scheme = Theme.of(context).colorScheme;
  if (status == LocalOperationStatus.reviewRequired || status == LocalOperationStatus.syncFailed) return scheme.error;
  if (status == LocalOperationStatus.analyzed || status == LocalOperationStatus.synced || status == LocalOperationStatus.promotedToCloud) return scheme.primary;
  return scheme.onSurfaceVariant;
}
