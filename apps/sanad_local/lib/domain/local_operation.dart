import 'dart:convert';

enum LocalOperationStatus {
  localOnly,
  readingDocument,
  pendingOcr,
  ocrCompleted,
  waitingInternet,
  analyzing,
  pendingAnalysis,
  analyzed,
  reviewRequired,
  incompleteAnalysis,
  failedAnalysis,
  reviewed,
  pendingSync,
  synced,
  syncFailed,
  promotedToCloud,
}

extension LocalOperationStatusCodec on LocalOperationStatus {
  String get dbValue => switch (this) {
        LocalOperationStatus.localOnly => 'local_only',
        LocalOperationStatus.readingDocument => 'reading_document',
        LocalOperationStatus.pendingOcr => 'pending_ocr',
        LocalOperationStatus.ocrCompleted => 'ocr_completed',
        LocalOperationStatus.waitingInternet => 'waiting_internet',
        LocalOperationStatus.analyzing => 'analyzing',
        LocalOperationStatus.pendingAnalysis => 'pending_analysis',
        LocalOperationStatus.analyzed => 'analyzed',
        LocalOperationStatus.reviewRequired => 'review_required',
        LocalOperationStatus.incompleteAnalysis => 'incomplete_analysis',
        LocalOperationStatus.failedAnalysis => 'failed_analysis',
        LocalOperationStatus.reviewed => 'reviewed',
        LocalOperationStatus.pendingSync => 'pending_sync',
        LocalOperationStatus.synced => 'synced',
        LocalOperationStatus.syncFailed => 'sync_failed',
        LocalOperationStatus.promotedToCloud => 'promoted_to_cloud',
      };

  static LocalOperationStatus parse(String value) => LocalOperationStatus.values.firstWhere(
        (status) => status.dbValue == value,
        orElse: () => LocalOperationStatus.localOnly,
      );
}

class LocalOperation {
  const LocalOperation({
    required this.id,
    required this.createdAt,
    required this.updatedAt,
    required this.status,
    required this.imagePath,
    this.previewPath,
    this.originalFileName,
    this.fileExtension,
    this.mimeType = 'image/jpeg',
    this.documentPageCount = 1,
    this.importSource = 'camera',
    this.fileSha256,
    this.ocrText,
    this.ocrConfidence,
    this.ocrProvider,
    this.ocrDurationMs,
    this.analysisRevision = 1,
    this.financialEntity,
    this.financialEntityCode,
    this.templateCode,
    this.transactionType,
    this.transactionDirection,
    this.amount,
    this.currency,
    this.referenceNumber,
    this.documentReference,
    this.transferReference,
    this.transactionDatetime,
    this.senderName,
    this.receiverName,
    this.receiverIdentifierType,
    this.receiverIdentifierValue,
    this.analysisJson,
    this.analysisWarnings = const [],
    this.analysisConfidence,
    this.correctedJson,
    this.reviewedAt,
    this.cloudOperationId,
  });

  final String id;
  final DateTime createdAt;
  final DateTime updatedAt;
  final LocalOperationStatus status;

  /// Kept as `image_path` in SQLite for backward compatibility with v0.1.
  /// In v0.2 it stores the original image or PDF path.
  final String imagePath;
  final String? previewPath;
  final String? originalFileName;
  final String? fileExtension;
  final String mimeType;
  final int documentPageCount;
  final String importSource;
  final String? fileSha256;

  final String? ocrText;
  final double? ocrConfidence;
  final String? ocrProvider;
  final int? ocrDurationMs;
  final int analysisRevision;

  final String? financialEntity;
  final String? financialEntityCode;
  final String? templateCode;
  final String? transactionType;
  final String? transactionDirection;
  final double? amount;
  final String? currency;
  final String? referenceNumber;
  final String? documentReference;
  final String? transferReference;
  final String? transactionDatetime;
  final String? senderName;
  final String? receiverName;
  final String? receiverIdentifierType;
  final String? receiverIdentifierValue;
  final Map<String, dynamic>? analysisJson;
  final List<String> analysisWarnings;
  final double? analysisConfidence;

  /// Human corrections are additive. Raw OCR and the original extraction are
  /// never overwritten, preserving a complete local audit trail.
  final Map<String, dynamic>? correctedJson;
  final DateTime? reviewedAt;
  final String? cloudOperationId;

  bool get isPdf => mimeType == 'application/pdf' || fileExtension == '.pdf';
  String get displayPath => previewPath ?? imagePath;
  bool get needsReview => const {
        LocalOperationStatus.reviewRequired,
        LocalOperationStatus.incompleteAnalysis,
        LocalOperationStatus.failedAnalysis,
      }.contains(status);
  bool get isAnalyzed => const {
        LocalOperationStatus.analyzed,
        LocalOperationStatus.reviewRequired,
        LocalOperationStatus.incompleteAnalysis,
        LocalOperationStatus.reviewed,
      }.contains(status);
  bool get isHumanCorrected => correctedJson != null && correctedJson!.isNotEmpty;

  LocalOperation copyWith({
    DateTime? updatedAt,
    LocalOperationStatus? status,
    String? imagePath,
    String? previewPath,
    String? originalFileName,
    String? fileExtension,
    String? mimeType,
    int? documentPageCount,
    String? importSource,
    String? fileSha256,
    String? ocrText,
    double? ocrConfidence,
    String? ocrProvider,
    int? ocrDurationMs,
    int? analysisRevision,
    String? financialEntity,
    String? financialEntityCode,
    String? templateCode,
    String? transactionType,
    String? transactionDirection,
    double? amount,
    String? currency,
    String? referenceNumber,
    String? documentReference,
    String? transferReference,
    String? transactionDatetime,
    String? senderName,
    String? receiverName,
    String? receiverIdentifierType,
    String? receiverIdentifierValue,
    Map<String, dynamic>? analysisJson,
    List<String>? analysisWarnings,
    double? analysisConfidence,
    Map<String, dynamic>? correctedJson,
    DateTime? reviewedAt,
    String? cloudOperationId,
  }) =>
      LocalOperation(
        id: id,
        createdAt: createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
        status: status ?? this.status,
        imagePath: imagePath ?? this.imagePath,
        previewPath: previewPath ?? this.previewPath,
        originalFileName: originalFileName ?? this.originalFileName,
        fileExtension: fileExtension ?? this.fileExtension,
        mimeType: mimeType ?? this.mimeType,
        documentPageCount: documentPageCount ?? this.documentPageCount,
        importSource: importSource ?? this.importSource,
        fileSha256: fileSha256 ?? this.fileSha256,
        ocrText: ocrText ?? this.ocrText,
        ocrConfidence: ocrConfidence ?? this.ocrConfidence,
        ocrProvider: ocrProvider ?? this.ocrProvider,
        ocrDurationMs: ocrDurationMs ?? this.ocrDurationMs,
        analysisRevision: analysisRevision ?? this.analysisRevision,
        financialEntity: financialEntity ?? this.financialEntity,
        financialEntityCode: financialEntityCode ?? this.financialEntityCode,
        templateCode: templateCode ?? this.templateCode,
        transactionType: transactionType ?? this.transactionType,
        transactionDirection: transactionDirection ?? this.transactionDirection,
        amount: amount ?? this.amount,
        currency: currency ?? this.currency,
        referenceNumber: referenceNumber ?? this.referenceNumber,
        documentReference: documentReference ?? this.documentReference,
        transferReference: transferReference ?? this.transferReference,
        transactionDatetime: transactionDatetime ?? this.transactionDatetime,
        senderName: senderName ?? this.senderName,
        receiverName: receiverName ?? this.receiverName,
        receiverIdentifierType: receiverIdentifierType ?? this.receiverIdentifierType,
        receiverIdentifierValue: receiverIdentifierValue ?? this.receiverIdentifierValue,
        analysisJson: analysisJson ?? this.analysisJson,
        analysisWarnings: analysisWarnings ?? this.analysisWarnings,
        analysisConfidence: analysisConfidence ?? this.analysisConfidence,
        correctedJson: correctedJson ?? this.correctedJson,
        reviewedAt: reviewedAt ?? this.reviewedAt,
        cloudOperationId: cloudOperationId ?? this.cloudOperationId,
      );

  Map<String, Object?> toDb() => {
        'id': id,
        'created_at': createdAt.toUtc().toIso8601String(),
        'updated_at': updatedAt.toUtc().toIso8601String(),
        'status': status.dbValue,
        'image_path': imagePath,
        'preview_path': previewPath,
        'original_file_name': originalFileName,
        'file_extension': fileExtension,
        'mime_type': mimeType,
        'document_page_count': documentPageCount,
        'import_source': importSource,
        'file_sha256': fileSha256,
        'ocr_text': ocrText,
        'ocr_confidence': ocrConfidence,
        'ocr_provider': ocrProvider,
        'ocr_duration_ms': ocrDurationMs,
        'analysis_revision': analysisRevision,
        'financial_entity': financialEntity,
        'financial_entity_code': financialEntityCode,
        'template_code': templateCode,
        'transaction_type': transactionType,
        'transaction_direction': transactionDirection,
        'amount': amount,
        'currency': currency,
        'reference_number': referenceNumber,
        'document_reference': documentReference,
        'transfer_reference': transferReference,
        'transaction_datetime': transactionDatetime,
        'sender_name': senderName,
        'receiver_name': receiverName,
        'receiver_identifier_type': receiverIdentifierType,
        'receiver_identifier_value': receiverIdentifierValue,
        'analysis_json': analysisJson == null ? null : jsonEncode(analysisJson),
        'analysis_warnings': jsonEncode(analysisWarnings),
        'analysis_confidence': analysisConfidence,
        'corrected_json': correctedJson == null ? null : jsonEncode(correctedJson),
        'reviewed_at': reviewedAt?.toUtc().toIso8601String(),
        'cloud_operation_id': cloudOperationId,
      };

  factory LocalOperation.fromDb(Map<String, Object?> row) {
    final analysisRaw = row['analysis_json'] as String?;
    final correctedRaw = row['corrected_json'] as String?;
    final warningsRaw = row['analysis_warnings'] as String?;
    return LocalOperation(
      id: row['id']! as String,
      createdAt: DateTime.parse(row['created_at']! as String).toLocal(),
      updatedAt: DateTime.parse(row['updated_at']! as String).toLocal(),
      status: LocalOperationStatusCodec.parse(row['status']! as String),
      imagePath: row['image_path']! as String,
      previewPath: row['preview_path'] as String?,
      originalFileName: row['original_file_name'] as String?,
      fileExtension: row['file_extension'] as String?,
      mimeType: (row['mime_type'] as String?) ?? 'image/jpeg',
      documentPageCount: (row['document_page_count'] as num?)?.toInt() ?? 1,
      importSource: (row['import_source'] as String?) ?? 'legacy',
      fileSha256: row['file_sha256'] as String?,
      ocrText: row['ocr_text'] as String?,
      ocrConfidence: (row['ocr_confidence'] as num?)?.toDouble(),
      ocrProvider: row['ocr_provider'] as String?,
      ocrDurationMs: (row['ocr_duration_ms'] as num?)?.toInt(),
      analysisRevision: (row['analysis_revision'] as num?)?.toInt() ?? 1,
      financialEntity: row['financial_entity'] as String?,
      financialEntityCode: row['financial_entity_code'] as String?,
      templateCode: row['template_code'] as String?,
      transactionType: row['transaction_type'] as String?,
      transactionDirection: row['transaction_direction'] as String?,
      amount: (row['amount'] as num?)?.toDouble(),
      currency: row['currency'] as String?,
      referenceNumber: row['reference_number'] as String?,
      documentReference: row['document_reference'] as String?,
      transferReference: row['transfer_reference'] as String?,
      transactionDatetime: row['transaction_datetime'] as String?,
      senderName: row['sender_name'] as String?,
      receiverName: row['receiver_name'] as String?,
      receiverIdentifierType: row['receiver_identifier_type'] as String?,
      receiverIdentifierValue: row['receiver_identifier_value'] as String?,
      analysisJson: analysisRaw == null ? null : jsonDecode(analysisRaw) as Map<String, dynamic>,
      analysisWarnings: warningsRaw == null
          ? const []
          : (jsonDecode(warningsRaw) as List<dynamic>).map((e) => e.toString()).toList(),
      analysisConfidence: (row['analysis_confidence'] as num?)?.toDouble(),
      correctedJson: correctedRaw == null ? null : jsonDecode(correctedRaw) as Map<String, dynamic>,
      reviewedAt: row['reviewed_at'] == null ? null : DateTime.parse(row['reviewed_at']! as String).toLocal(),
      cloudOperationId: row['cloud_operation_id'] as String?,
    );
  }
}
