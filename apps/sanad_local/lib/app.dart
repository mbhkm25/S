import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show DateFormat, NumberFormat;

import 'data/local_database.dart';
import 'domain/financial_entity_registry.dart';
import 'domain/local_operation.dart';
import 'domain/localized_analysis.dart';
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
            fillColor: scheme.surfaceContainerHighest.withValues(alpha: .42),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
          ),
          cardTheme: CardThemeData(
            elevation: 0,
            margin: EdgeInsets.zero,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(color: scheme.outlineVariant),
            ),
          ),
          filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
          ),
          outlinedButtonTheme: OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
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
  bool _checkingShare = false;
  String? _notice;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
    WidgetsBinding.instance.addPostFrameCallback((_) => _consumeSharedFile());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _consumeSharedFile();
      _pipeline.processQueue().then((_) => _refresh());
    }
  }

  Future<void> _consumeSharedFile() async {
    if (_checkingShare) return;
    _checkingShare = true;
    try {
      final operation = await _pipeline.consumeSharedFile();
      if (operation != null) {
        _notice = 'تم حفظ الملف المشارك على الجهاز وبدأت قراءته.';
        await _refresh();
      }
    } catch (_) {
      _notice = 'تعذر استيراد الملف المشارك. الصيغ المدعومة: الصور وPDF.';
      if (mounted) setState(() {});
    } finally {
      _checkingShare = false;
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

  Future<void> _addOperation({required bool camera}) async {
    setState(() {
      _busy = true;
      _notice = null;
    });
    try {
      final operation = camera ? await _pipeline.captureCamera() : await _pipeline.importFile();
      if (operation != null) {
        _notice = operation.isPdf
            ? 'تم حفظ ملف PDF على هذا الجهاز، ويجري تحليل الصفحة الأولى.'
            : 'تم حفظ الإشعار على هذا الجهاز، ويجري تحليله في الخلفية.';
        await _refresh();
      }
    } catch (error) {
      _notice = error.toString().contains('unsupported_file_type')
          ? 'نوع الملف غير مدعوم. استخدم JPG أو JPEG أو PNG أو WEBP أو PDF.'
          : 'تعذر إكمال الإضافة. لم يُرسل الملف إلى السحابة.';
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
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('ربط حساب سند', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 6),
              const Text('الحفظ والقراءة والقواعد المالية الأساسية تعمل محليًا. الحساب مطلوب فقط لإكمال الحالات غير المحسومة.'),
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
    if (submit != true) {
      email.dispose();
      password.dispose();
      return;
    }
    setState(() => _busy = true);
    try {
      await _pipeline.signIn(email.text, password.text);
      _notice = 'تم ربط حساب سند واستئناف العمليات المعلقة.';
      await _refresh();
    } catch (_) {
      _notice = 'تعذر تسجيل الدخول. تحقق من بيانات حساب سند والاتصال بالإنترنت.';
    } finally {
      email.dispose();
      password.dispose();
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _makeReport() async {
    setState(() => _busy = true);
    try {
      final all = await _db.recentOperations(limit: 5000);
      if (all.isEmpty) {
        _notice = 'لا توجد عمليات لإنشاء تقرير.';
        return;
      }
      final file = await _report.buildDailyReport(all);
      await _report.share(file);
      _notice = 'تم إنشاء التقرير ومشاركته من الهاتف.';
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
    unawaited(_pipeline.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          toolbarHeight: 72,
          titleSpacing: 16,
          title: const _SanadHeader(),
          actions: [
            IconButton(
              tooltip: _pipeline.signedIn ? 'حساب سند مرتبط' : 'ربط حساب سند',
              onPressed: _pipeline.signedIn ? null : _signIn,
              icon: Icon(_pipeline.signedIn ? Icons.cloud_done_outlined : Icons.cloud_off_outlined),
            ),
            const SizedBox(width: 6),
          ],
        ),
        body: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async {
              await _pipeline.processQueue();
              await _refresh();
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 24),
              children: [
                if (_busy) const LinearProgressIndicator(minHeight: 2),
                if (_notice != null) ...[
                  const SizedBox(height: 8),
                  Material(
                    color: theme.colorScheme.secondaryContainer,
                    borderRadius: BorderRadius.circular(12),
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
                const SizedBox(height: 10),
                _SummaryCard(summary: _summary),
                const SizedBox(height: 12),
                SizedBox(
                  height: 56,
                  child: FilledButton.icon(
                    key: const Key('capture-camera'),
                    onPressed: _busy ? null : () => _addOperation(camera: true),
                    icon: const Icon(Icons.document_scanner_outlined),
                    label: const Text('تصوير إشعار مالي', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                  ),
                ),
                const SizedBox(height: 9),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        key: const Key('import-files'),
                        onPressed: _busy ? null : () => _addOperation(camera: false),
                        icon: const Icon(Icons.file_open_outlined),
                        label: const Text('من الملفات'),
                      ),
                    ),
                    const SizedBox(width: 9),
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
                const SizedBox(height: 16),
                TextField(
                  controller: _search,
                  onChanged: (_) => _refresh(),
                  decoration: const InputDecoration(
                    hintText: 'ابحث بالمبلغ، المرجع، الجهة أو الاسم',
                    prefixIcon: Icon(Icons.search_rounded),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('آخر العمليات', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                    Text('${_operations.length}'),
                  ],
                ),
                const SizedBox(height: 8),
                if (_operations.isEmpty)
                  const _EmptyState()
                else
                  for (final operation in _operations)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: _OperationCard(
                        operation: operation,
                        onTap: () async {
                          await Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => OperationDetailsScreen(
                                operationId: operation.id,
                                pipeline: _pipeline,
                              ),
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

class _SanadHeader extends StatelessWidget {
  const _SanadHeader();

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 74,
            height: 52,
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
            child: Image.asset('assets/branding/sanad-logo.png', fit: BoxFit.contain),
          ),
          const SizedBox(width: 10),
          const Text('دفتر العمليات المحلي', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        ],
      );
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
        padding: const EdgeInsets.all(15),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.point_of_sale_outlined, color: theme.colorScheme.primary),
                const SizedBox(width: 9),
                const Text('عمليات اليوم'),
                const Spacer(),
                Text('$count عملية', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              ],
            ),
            if (currencies.isNotEmpty) ...[
              const Divider(height: 20),
              Wrap(
                spacing: 16,
                runSpacing: 6,
                children: [
                  for (final currency in currencies)
                    Text(
                      '${NumberFormat('#,##0.##', 'en').format(summary['total_$currency'] ?? 0)} ${localizedCurrency(currency)}',
                      style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
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
    final entity = FinancialEntityRegistry.resolve(
      code: operation.financialEntityCode,
      name: operation.financialEntity,
      currency: operation.currency,
    );
    final title = operation.amount == null
        ? entity.shortName
        : '${NumberFormat('#,##0.##', 'en').format(operation.amount)} ${localizedCurrency(operation.currency)}';
    final subtitle = [entity.shortName, operation.referenceNumber]
        .whereType<String>()
        .where((value) => value.isNotEmpty && value != FinancialEntityRegistry.unknown.shortName)
        .join(' · ');
    return Card(
      child: ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        leading: FinancialEntityLogo(entity: entity, size: 44),
        title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(subtitle.isEmpty ? statusText(operation.status) : '$subtitle\n${statusText(operation.status)}', maxLines: 2),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(DateFormat('HH:mm').format(operation.createdAt), style: theme.textTheme.labelMedium),
            const SizedBox(height: 4),
            Icon(statusIcon(operation.status), size: 18, color: statusColor(context, operation.status)),
          ],
        ),
      ),
    );
  }
}

class FinancialEntityLogo extends StatelessWidget {
  const FinancialEntityLogo({super.key, required this.entity, this.size = 48});
  final FinancialEntityDefinition entity;
  final double size;

  @override
  Widget build(BuildContext context) {
    final fallback = Icon(Icons.account_balance_outlined, color: Theme.of(context).colorScheme.onSurfaceVariant);
    return Container(
      width: size,
      height: size,
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: entity.logoAsset == null
          ? fallback
          : Image.asset(entity.logoAsset!, fit: BoxFit.contain, errorBuilder: (_, __, ___) => fallback),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Column(
          children: [
            Icon(Icons.receipt_long_outlined, size: 42, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 10),
            const Text('لا توجد عمليات على هذا الجهاز بعد.'),
          ],
        ),
      );
}

class OperationDetailsScreen extends StatefulWidget {
  const OperationDetailsScreen({super.key, required this.operationId, required this.pipeline});
  final String operationId;
  final OperationPipeline pipeline;

  @override
  State<OperationDetailsScreen> createState() => _OperationDetailsScreenState();
}

class _OperationDetailsScreenState extends State<OperationDetailsScreen> {
  LocalOperation? _operation;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    final operation = await LocalDatabase.instance.getOperation(widget.operationId);
    if (!mounted) return;
    setState(() {
      _operation = operation;
      _loading = false;
    });
  }

  Future<void> _edit(LocalOperation operation) async {
    final amount = TextEditingController(text: operation.amount?.toStringAsFixed(operation.amount! % 1 == 0 ? 0 : 2));
    final reference = TextEditingController(text: operation.referenceNumber);
    final party = TextEditingController(text: operation.receiverName ?? operation.senderName);
    var currency = operation.currency ?? 'YER';
    var entityCode = FinancialEntityRegistry.resolve(
      code: operation.financialEntityCode,
      name: operation.financialEntity,
      currency: operation.currency,
    ).code;
    final save = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Directionality(
          textDirection: TextDirection.rtl,
          child: Padding(
            padding: EdgeInsets.fromLTRB(18, 18, 18, MediaQuery.viewInsetsOf(context).bottom + 18),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('تصحيح بيانات العملية', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 4),
                  const Text('سيُحفظ التصحيح مع النتيجة الأصلية، ولن يُحذف نص المستند الخام.'),
                  const SizedBox(height: 14),
                  TextField(
                    controller: amount,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    textDirection: TextDirection.ltr,
                    decoration: const InputDecoration(labelText: 'المبلغ'),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: currency,
                    decoration: const InputDecoration(labelText: 'العملة'),
                    items: const [
                      DropdownMenuItem(value: 'YER', child: Text('ريال يمني')),
                      DropdownMenuItem(value: 'SAR', child: Text('ريال سعودي')),
                      DropdownMenuItem(value: 'USD', child: Text('دولار أمريكي')),
                    ],
                    onChanged: (value) => setSheetState(() => currency = value ?? currency),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: entityCode == 'unknown' ? 'unknown' : entityCode,
                    decoration: const InputDecoration(labelText: 'الجهة المالية'),
                    items: [
                      ...FinancialEntityRegistry.entities.map(
                        (entity) => DropdownMenuItem(value: entity.code, child: Text(entity.shortName)),
                      ),
                      const DropdownMenuItem(value: 'unknown', child: Text('جهة غير معروفة')),
                    ],
                    onChanged: (value) => setSheetState(() => entityCode = value ?? entityCode),
                  ),
                  const SizedBox(height: 10),
                  TextField(controller: reference, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'المرجع')),
                  const SizedBox(height: 10),
                  TextField(controller: party, decoration: const InputDecoration(labelText: 'اسم الطرف')),
                  const SizedBox(height: 16),
                  FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('حفظ التصحيح واعتماد العملية')),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    if (save == true) {
      await widget.pipeline.saveHumanCorrection(
        operation: operation,
        amount: double.tryParse(amount.text.replaceAll(',', '')),
        currency: currency,
        reference: reference.text.trim().isEmpty ? null : reference.text.trim(),
        entityCode: entityCode,
        partyName: party.text.trim().isEmpty ? null : party.text.trim(),
      );
      await _reload();
    }
    amount.dispose();
    reference.dispose();
    party.dispose();
  }

  Future<void> _approve(LocalOperation operation) async {
    await widget.pipeline.approveOperation(operation);
    await _reload();
  }

  void _showDeveloperDetails(LocalOperation operation) {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => Directionality(
        textDirection: TextDirection.rtl,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('تفاصيل المطور', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              SelectableText('المعرف: ${operation.id}', textDirection: TextDirection.ltr),
              SelectableText('المحرك: ${operation.ocrProvider ?? 'غير متاح'}', textDirection: TextDirection.ltr),
              SelectableText('القالب: ${operation.templateCode ?? 'غير محدد'}', textDirection: TextDirection.ltr),
              SelectableText('MIME: ${operation.mimeType}', textDirection: TextDirection.ltr),
              SelectableText('SHA-256: ${operation.fileSha256 ?? 'غير متاح'}', textDirection: TextDirection.ltr),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final operation = _operation;
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (operation == null) return const Scaffold(body: Center(child: Text('تعذر العثور على العملية.')));
    final entity = FinancialEntityRegistry.resolve(
      code: operation.financialEntityCode,
      name: operation.financialEntity,
      currency: operation.currency,
    );
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: const Text('تفاصيل العملية')),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 24),
          children: [
            _SectionTitle(icon: Icons.description_outlined, title: 'المستند الأصلي'),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: ColoredBox(
                color: Theme.of(context).colorScheme.surfaceContainerLow,
                child: Image.file(
                  File(operation.displayPath),
                  height: 250,
                  width: double.infinity,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => const SizedBox(
                    height: 180,
                    child: Center(child: Icon(Icons.broken_image_outlined, size: 42)),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              operation.isPdf
                  ? 'ملف PDF · ${operation.documentPageCount} صفحة · المعاينة للصفحة الأولى'
                  : operation.originalFileName ?? 'صورة محفوظة محليًا',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 18),
            _SectionTitle(icon: Icons.receipt_long_outlined, title: 'بيانات العملية'),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(15),
                child: Column(
                  children: [
                    Row(
                      children: [
                        FinancialEntityLogo(entity: entity, size: 52),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(entity.arabicName, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                              Text(entity.shortName, style: Theme.of(context).textTheme.bodySmall),
                            ],
                          ),
                        ),
                        GestureDetector(
                          onLongPress: () => _showDeveloperDetails(operation),
                          child: _StatusChip(status: operation.status),
                        ),
                      ],
                    ),
                    const Divider(height: 22),
                    _DetailRow(
                      label: 'المبلغ',
                      value: operation.amount == null
                          ? '—'
                          : '${NumberFormat('#,##0.##', 'en').format(operation.amount)} ${localizedCurrency(operation.currency)}',
                      prominent: true,
                    ),
                    _DetailRow(label: 'مرجع المستند', value: operation.documentReference ?? operation.referenceNumber ?? '—', ltr: true),
                    if (operation.transferReference != null)
                      _DetailRow(label: 'مرجع التحويل', value: operation.transferReference!, ltr: true),
                    _DetailRow(label: 'نوع العملية', value: localizedTransactionType(operation.transactionType)),
                    if (operation.senderName != null) _DetailRow(label: 'المرسل', value: operation.senderName!),
                    if (operation.receiverName != null) _DetailRow(label: 'المستلم', value: operation.receiverName!),
                    if (operation.transactionDatetime != null)
                      _DetailRow(label: 'التاريخ والوقت', value: _formatOperationDate(operation.transactionDatetime!), ltr: true),
                    _DetailRow(label: 'الثقة', value: _confidenceText(operation.analysisConfidence)),
                  ],
                ),
              ),
            ),
            if (operation.analysisWarnings.isNotEmpty) ...[
              const SizedBox(height: 18),
              _SectionTitle(icon: Icons.fact_check_outlined, title: 'ملاحظات المراجعة'),
              const SizedBox(height: 8),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(15),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final warning in operation.analysisWarnings)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 7),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(Icons.info_outline_rounded, size: 18),
                              const SizedBox(width: 7),
                              Expanded(child: Text(localizedWarning(warning))),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 18),
            _SectionTitle(icon: Icons.task_alt_outlined, title: 'إجراءات العملية'),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _edit(operation),
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('تعديل البيانات'),
                  ),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: operation.status == LocalOperationStatus.reviewed ? null : () => _approve(operation),
                    icon: const Icon(Icons.verified_outlined),
                    label: Text(operation.status == LocalOperationStatus.reviewed ? 'تمت المراجعة' : 'اعتماد العملية'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.icon, required this.title});
  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 7),
          Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        ],
      );
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final LocalOperationStatus status;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
          color: statusColor(context, status).withValues(alpha: .12),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          statusText(status),
          style: TextStyle(color: statusColor(context, status), fontSize: 11, fontWeight: FontWeight.w700),
        ),
      );
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value, this.prominent = false, this.ltr = false});
  final String label;
  final String value;
  final bool prominent;
  final bool ltr;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 105,
              child: Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
            ),
            Expanded(
              child: Text(
                value,
                textDirection: ltr ? TextDirection.ltr : TextDirection.rtl,
                textAlign: ltr ? TextAlign.end : TextAlign.start,
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: prominent ? 20 : null),
              ),
            ),
          ],
        ),
      );

String statusText(LocalOperationStatus status) => switch (status) {
      LocalOperationStatus.localOnly => 'تم الحفظ محليًا',
      LocalOperationStatus.readingDocument || LocalOperationStatus.pendingOcr => 'جاري قراءة المستند',
      LocalOperationStatus.ocrCompleted => 'تمت قراءة المستند',
      LocalOperationStatus.waitingInternet => 'بانتظار الإنترنت',
      LocalOperationStatus.analyzing || LocalOperationStatus.pendingAnalysis => 'جاري التحليل',
      LocalOperationStatus.analyzed => 'تم التحليل',
      LocalOperationStatus.reviewRequired => 'يحتاج مراجعة',
      LocalOperationStatus.incompleteAnalysis => 'تحليل غير مكتمل',
      LocalOperationStatus.failedAnalysis => 'فشل التحليل',
      LocalOperationStatus.reviewed => 'تمت المراجعة',
      LocalOperationStatus.pendingSync => 'بانتظار المزامنة',
      LocalOperationStatus.synced => 'تمت المزامنة',
      LocalOperationStatus.syncFailed => 'تعذرت المزامنة',
      LocalOperationStatus.promotedToCloud => 'نُقلت إلى سند السحابي',
    };

IconData statusIcon(LocalOperationStatus status) => switch (status) {
      LocalOperationStatus.analyzed ||
      LocalOperationStatus.reviewed ||
      LocalOperationStatus.synced ||
      LocalOperationStatus.promotedToCloud =>
        Icons.check_circle_outline_rounded,
      LocalOperationStatus.reviewRequired ||
      LocalOperationStatus.incompleteAnalysis ||
      LocalOperationStatus.failedAnalysis ||
      LocalOperationStatus.syncFailed =>
        Icons.error_outline_rounded,
      LocalOperationStatus.readingDocument ||
      LocalOperationStatus.pendingOcr ||
      LocalOperationStatus.ocrCompleted ||
      LocalOperationStatus.waitingInternet ||
      LocalOperationStatus.analyzing ||
      LocalOperationStatus.pendingAnalysis ||
      LocalOperationStatus.pendingSync =>
        Icons.timelapse_rounded,
      LocalOperationStatus.localOnly => Icons.phone_android_rounded,
    };

Color statusColor(BuildContext context, LocalOperationStatus status) {
  final scheme = Theme.of(context).colorScheme;
  if (const {
    LocalOperationStatus.reviewRequired,
    LocalOperationStatus.incompleteAnalysis,
    LocalOperationStatus.failedAnalysis,
    LocalOperationStatus.syncFailed,
  }.contains(status)) {
    return scheme.error;
  }
  if (const {
    LocalOperationStatus.analyzed,
    LocalOperationStatus.reviewed,
    LocalOperationStatus.synced,
    LocalOperationStatus.promotedToCloud,
  }.contains(status)) {
    return scheme.primary;
  }
  return scheme.onSurfaceVariant;
}

String _confidenceText(double? confidence) {
  if (confidence == null) return 'لم تُحسب بعد';
  if (confidence >= .90) return 'مرتفعة';
  if (confidence >= .75) return 'متوسطة';
  return 'منخفضة — راجع البيانات';
}

String _formatOperationDate(String value) {
  final date = DateTime.tryParse(value);
  return date == null ? value : DateFormat('yyyy-MM-dd HH:mm', 'en').format(date);
}
