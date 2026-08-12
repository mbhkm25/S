import 'dart:async';

import 'package:uuid/uuid.dart';

import '../data/local_database.dart';
import '../data/local_database_queue_extensions.dart';
import '../domain/financial_entity_registry.dart';
import '../domain/local_operation.dart';
import 'financial_analysis_engine.dart';
import 'local_file_store.dart';
import 'local_input_service.dart';
import 'local_ocr_service.dart';
import 'sanad_cloud.dart';

class OperationPipeline {
  OperationPipeline({
    LocalDatabase? database,
    LocalFileStore? fileStore,
    LocalInputService? inputService,
    LocalOcrEngine? ocrEngine,
    LocalFinancialAnalyzer? financialAnalyzer,
    SanadSemanticAnalyzer? semanticAnalyzer,
  })  : _db = database ?? LocalDatabase.instance,
        _fileStore = fileStore ?? LocalFileStore(),
        _input = inputService ?? LocalInputService(),
        _ocr = ocrEngine ?? const TesseractArabicOcrEngine(),
        _financial = financialAnalyzer ?? const LocalFinancialAnalyzer(),
        _semantic = semanticAnalyzer ?? SanadSemanticAnalyzer();

  final LocalDatabase _db;
  final LocalFileStore _fileStore;
  final LocalInputService _input;
  final LocalOcrEngine _ocr;
  final LocalFinancialAnalyzer _financial;
  final SanadSemanticAnalyzer _semantic;
  final _uuid = const Uuid();

  bool _running = false;
  bool get signedIn => _semantic.hasSession;

  Future<void> signIn(String email, String password) async {
    await _semantic.signIn(email: email, password: password);
    await _db.resumeWaitingAuthJobs();
    await processQueue();
  }

  Future<void> signOut() => _semantic.signOut();

  Future<LocalOperation?> captureCamera() async {
    final input = await _input.captureCamera();
    return input == null ? null : _createOperation(input);
  }

  Future<LocalOperation?> importFile() async {
    final input = await _input.pickFile();
    return input == null ? null : _createOperation(input);
  }

  Future<LocalOperation?> consumeSharedFile() async {
    final input = await _input.consumeSharedFile();
    return input == null ? null : _createOperation(input);
  }

  Future<LocalOperation> _createOperation(LocalInputFile input) async {
    final id = _uuid.v7();
    final stored = await _fileStore.persist(
      sourcePath: input.path,
      operationId: id,
      originalFileName: input.name,
      declaredMimeType: input.mimeType,
    );
    final now = DateTime.now();
    final operation = LocalOperation(
      id: id,
      createdAt: now,
      updatedAt: now,
      status: LocalOperationStatus.pendingOcr,
      imagePath: stored.path,
      previewPath: stored.previewPath,
      originalFileName: stored.originalFileName,
      fileExtension: stored.extension,
      mimeType: stored.mimeType,
      documentPageCount: stored.pageCount,
      importSource: input.source,
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
          if (error.toString().contains('sanad_auth_required')) {
            await _db.markJobWaitingAuth(jobId);
          } else {
            final operation = await _db.getOperation(operationId);
            if (operation != null) {
              final localFailure = RegExp(r'(ocr_|source_file|unsupported_file|pdf_)').hasMatch(error.toString());
              await _db.updateOperation(
                operation.copyWith(
                  updatedAt: DateTime.now(),
                  status: localFailure
                      ? LocalOperationStatus.failedAnalysis
                      : LocalOperationStatus.waitingInternet,
                ),
                eventType: localFailure ? 'analysis_failed' : 'analysis_waiting_for_internet',
              );
            }
            await _db.markJobRetry(jobId, attempts + 1, error);
          }
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
      operation = operation.copyWith(
        updatedAt: DateTime.now(),
        status: LocalOperationStatus.readingDocument,
      );
      await _db.updateOperation(operation, eventType: 'document_reading_started');
      ocrResult = await _ocr.recognize(operation.displayPath);
      operation = operation.copyWith(
        updatedAt: DateTime.now(),
        status: LocalOperationStatus.ocrCompleted,
        ocrText: ocrResult.text,
        ocrConfidence: ocrResult.confidence,
        ocrProvider: ocrResult.provider,
        ocrDurationMs: ocrResult.durationMs,
      );
      await _db.updateOperation(
        operation,
        eventType: 'ocr_completed',
        eventPayload: {
          'confidence': ocrResult.confidence,
          'duration_ms': ocrResult.durationMs,
          'page': 1,
        },
      );
    }

    final ocrText = operation.ocrText ?? ocrResult?.text ?? '';
    final ocrConfidence = operation.ocrConfidence ?? ocrResult?.confidence ?? 0;
    final deterministic = _financial.analyzeDeterministically(
      ocrText,
      ocrConfidence: ocrConfidence,
    );
    operation = _withStructured(
      operation,
      deterministic,
      status: deterministic['reviewRequired'] == true
          ? LocalOperationStatus.incompleteAnalysis
          : LocalOperationStatus.analyzed,
    );
    await _db.updateOperation(operation, eventType: 'local_financial_rules_completed');

    final quality = deterministic['quality'] as Map<String, dynamic>?;
    final deterministicComplete = quality?['autoAcceptEligible'] == true &&
        ((deterministic['confidence'] as num?)?.toDouble() ?? 0) >= .90;
    if (deterministicComplete) return;

    if (!_semantic.hasSession) {
      operation = operation.copyWith(updatedAt: DateTime.now(), status: LocalOperationStatus.pendingAnalysis);
      await _db.updateOperation(operation, eventType: 'analysis_waiting_for_auth');
      throw StateError('sanad_auth_required');
    }

    operation = operation.copyWith(updatedAt: DateTime.now(), status: LocalOperationStatus.analyzing);
    await _db.updateOperation(operation, eventType: 'semantic_analysis_started');
    final analysis = await _semantic.analyze(
      localOperationId: operation.id,
      ocrText: ocrText,
      ocrConfidence: ocrConfidence,
      ocrProvider: operation.ocrProvider ?? ocrResult?.provider ?? 'local_unknown',
      revision: operation.analysisRevision,
      localHints: deterministic,
    );
    final structured = _financial.mergeSemanticWithEvidence(
      deterministic: deterministic,
      semantic: analysis.structured,
      ocrText: ocrText,
      ocrConfidence: ocrConfidence,
    );
    final reviewRequired = structured['reviewRequired'] == true;
    operation = _withStructured(
      operation,
      structured,
      status: reviewRequired ? LocalOperationStatus.reviewRequired : LocalOperationStatus.analyzed,
    );
    await _db.updateOperation(
      operation,
      eventType: reviewRequired ? 'analysis_review_required' : 'analysis_completed',
      eventPayload: {'latency_ms': analysis.latencyMs, 'revision': operation.analysisRevision},
    );
  }

  LocalOperation _withStructured(
    LocalOperation operation,
    Map<String, dynamic> structured, {
    required LocalOperationStatus status,
  }) {
    final parties = (structured['parties'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    Map<String, dynamic>? receiver;
    Map<String, dynamic>? sender;
    for (final party in parties) {
      if (const ['receiver', 'beneficiary', 'credited_party'].contains(party['role']) && receiver == null) {
        receiver = party;
      }
      if (const ['sender', 'debited_party'].contains(party['role']) && sender == null) sender = party;
    }
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

    final currency = structured['currency']?.toString();
    final entity = FinancialEntityRegistry.resolve(
      code: structured['financialEntityCode']?.toString(),
      name: structured['financialEntity']?.toString(),
      currency: currency,
    );
    final documentReference = structured['documentReference']?.toString();
    final transferReference = structured['transferReference']?.toString();
    final warnings = (structured['warnings'] as List<dynamic>? ?? const []).map((e) => e.toString()).toSet().toList();
    return operation.copyWith(
      updatedAt: DateTime.now(),
      status: status,
      financialEntity: entity.arabicName,
      financialEntityCode: entity.code,
      templateCode: structured['templateCode']?.toString(),
      transactionType: structured['transactionType']?.toString(),
      transactionDirection: structured['transactionDirection']?.toString(),
      amount: (structured['amount'] as num?)?.toDouble(),
      currency: currency,
      referenceNumber: documentReference ?? transferReference,
      documentReference: documentReference,
      transferReference: transferReference,
      transactionDatetime: structured['transactionDatetime']?.toString(),
      senderName: sender?['name']?.toString(),
      receiverName: receiver?['name']?.toString(),
      receiverIdentifierType: identifier?['type']?.toString(),
      receiverIdentifierValue: identifier?['value']?.toString(),
      analysisJson: structured,
      analysisWarnings: warnings,
      analysisConfidence: (structured['confidence'] as num?)?.toDouble(),
    );
  }

  Future<void> saveHumanCorrection({
    required LocalOperation operation,
    required double? amount,
    required String? currency,
    required String? reference,
    required String entityCode,
    required String? partyName,
  }) async {
    final entity = FinancialEntityRegistry.byCode(entityCode);
    final corrected = <String, dynamic>{
      'amount': amount,
      'currency': currency,
      'reference': reference,
      'financialEntityCode': entity.code,
      'financialEntity': entity.arabicName,
      'partyName': partyName,
      'correctedAt': DateTime.now().toUtc().toIso8601String(),
    };
    final updated = operation.copyWith(
      updatedAt: DateTime.now(),
      status: LocalOperationStatus.reviewed,
      amount: amount,
      currency: currency,
      referenceNumber: reference,
      financialEntityCode: entity.code,
      financialEntity: entity.arabicName,
      receiverName: partyName,
      correctedJson: corrected,
      reviewedAt: DateTime.now(),
    );
    await _db.updateOperation(
      updated,
      eventType: 'human_corrected',
      eventPayload: {
        'predicted': {
          'amount': operation.amount,
          'currency': operation.currency,
          'reference': operation.referenceNumber,
          'financialEntityCode': operation.financialEntityCode,
          'partyName': operation.receiverName,
        },
        'corrected': corrected,
      },
    );
  }

  Future<void> approveOperation(LocalOperation operation) async {
    await _db.updateOperation(
      operation.copyWith(
        updatedAt: DateTime.now(),
        status: LocalOperationStatus.reviewed,
        reviewedAt: DateTime.now(),
      ),
      eventType: 'human_reviewed',
    );
  }

  Future<void> dispose() async {
    _semantic.dispose();
  }
}
