import 'dart:async';

import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';

import '../data/local_database.dart';
import '../domain/local_operation.dart';
import 'local_file_store.dart';
import 'local_ocr_service.dart';
import 'sanad_cloud.dart';

class OperationPipeline {
  OperationPipeline({
    LocalDatabase? database,
    LocalFileStore? fileStore,
    LocalOcrEngine? ocrEngine,
    SanadSemanticAnalyzer? semanticAnalyzer,
    ImagePicker? imagePicker,
  })  : _db = database ?? LocalDatabase.instance,
        _fileStore = fileStore ?? LocalFileStore(),
        _ocr = ocrEngine ?? const TesseractArabicOcrEngine(),
        _semantic = semanticAnalyzer ?? SanadSemanticAnalyzer(),
        _picker = imagePicker ?? ImagePicker();

  final LocalDatabase _db;
  final LocalFileStore _fileStore;
  final LocalOcrEngine _ocr;
  final SanadSemanticAnalyzer _semantic;
  final ImagePicker _picker;
  final _uuid = const Uuid();

  bool _running = false;
  bool get signedIn => _semantic.hasSession;

  Future<void> signIn(String email, String password) => _semantic.signIn(email: email, password: password);
  Future<void> signOut() => _semantic.signOut();

  Future<LocalOperation?> capture(ImageSource source) async {
    final picked = await _picker.pickImage(
      source: source,
      imageQuality: 92,
      maxWidth: 2400,
      maxHeight: 3200,
      requestFullMetadata: false,
    );
    if (picked == null) return null;

    final id = _uuid.v7();
    final stored = await _fileStore.persistImage(sourcePath: picked.path, operationId: id);
    final now = DateTime.now();
    final operation = LocalOperation(
      id: id,
      createdAt: now,
      updatedAt: now,
      status: LocalOperationStatus.pendingOcr,
      imagePath: stored.path,
      fileSha256: stored.sha256Hex,
    );
    await _db.insertOperation(operation);
    unawaited(processQueue());
    return operation;
  }

  Future<void> processQueue() async {
    if (_running) return;
    _running = true;
    try {
      await _db.recoverInterruptedJobs();
      while (true) {
        final job = await _db.nextReadyJob();
        if (job == null) break;
        final jobId = (job['id'] as num).toInt();
        final operationId = job['operation_id']! as String;
        final attempts = (job['attempt_count'] as num?)?.toInt() ?? 0;
        await _db.markJobRunning(jobId);
        try {
          await _process(operationId);
          await _db.markJobDone(jobId);
        } catch (error) {
          await _db.markJobRetry(jobId, attempts + 1, error);
          break;
        }
      }
    } finally {
      _running = false;
    }
  }

  Future<void> _process(String operationId) async {
    var operation = await _db.getOperation(operationId);
    if (operation == null) throw StateError('operation_missing');

    LocalOcrResult? ocrResult;
    if (operation.ocrText == null || operation.ocrText!.trim().isEmpty) {
      ocrResult = await _ocr.recognize(operation.imagePath);
      operation = operation.copyWith(
        updatedAt: DateTime.now(),
        status: LocalOperationStatus.ocrCompleted,
        ocrText: ocrResult.text,
        ocrConfidence: ocrResult.confidence,
        ocrProvider: ocrResult.provider,
      );
      await _db.updateOperation(operation, eventType: 'ocr_completed');
    }

    if (!_semantic.hasSession) {
      operation = operation.copyWith(updatedAt: DateTime.now(), status: LocalOperationStatus.pendingAnalysis);
      await _db.updateOperation(operation, eventType: 'analysis_waiting_for_auth');
      throw StateError('sanad_auth_required');
    }

    final analysis = await _semantic.analyze(
      localOperationId: operation.id,
      ocrText: operation.ocrText ?? ocrResult?.text ?? '',
      ocrConfidence: operation.ocrConfidence ?? ocrResult?.confidence ?? 0,
      ocrProvider: operation.ocrProvider ?? ocrResult?.provider ?? 'local_unknown',
      revision: operation.analysisRevision,
    );

    final structured = analysis.structured;
    final parties = (structured['parties'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final receiver = parties.cast<Map<String, dynamic>?>().firstWhere(
          (p) => const ['receiver', 'beneficiary', 'credited_party'].contains(p?['role']),
          orElse: () => null,
        );
    final identifiers = (receiver?['identifiers'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    Map<String, dynamic>? identifier;
    for (final item in identifiers) {
      if (item['isPrimaryRoutingIdentifier'] == true) {
        identifier = item;
        break;
      }
    }
    identifier ??= identifiers.isEmpty ? null : identifiers.first;

    final warnings = (structured['warnings'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList();
    final reviewRequired = structured['reviewRequired'] == true;

    operation = operation.copyWith(
      updatedAt: DateTime.now(),
      status: reviewRequired ? LocalOperationStatus.reviewRequired : LocalOperationStatus.analyzed,
      financialEntity: structured['financialEntity']?.toString(),
      financialEntityCode: structured['financialEntityCode']?.toString(),
      amount: (structured['amount'] as num?)?.toDouble(),
      currency: structured['currency']?.toString(),
      referenceNumber: (structured['transferReference'] ?? structured['documentReference'])?.toString(),
      transactionDatetime: structured['transactionDatetime']?.toString(),
      receiverName: receiver?['name']?.toString(),
      receiverIdentifierType: identifier?['type']?.toString(),
      receiverIdentifierValue: identifier?['value']?.toString(),
      analysisJson: structured,
      analysisWarnings: warnings,
      analysisConfidence: (structured['confidence'] as num?)?.toDouble(),
    );
    await _db.updateOperation(operation, eventType: reviewRequired ? 'analysis_review_required' : 'analysis_completed');
  }

  Future<void> dispose() async {
    _semantic.dispose();
  }
}
