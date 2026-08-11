import 'dart:convert';

enum LocalOperationStatus {
  localOnly,
  pendingOcr,
  ocrCompleted,
  pendingAnalysis,
  analyzed,
  reviewRequired,
  pendingSync,
  synced,
  syncFailed,
  promotedToCloud,
}

extension LocalOperationStatusCodec on LocalOperationStatus {
  String get dbValue => switch (this) {
        LocalOperationStatus.localOnly => 'local_only',
        LocalOperationStatus.pendingOcr => 'pending_ocr',
        LocalOperationStatus.ocrCompleted => 'ocr_completed',
        LocalOperationStatus.pendingAnalysis => 'pending_analysis',
        LocalOperationStatus.analyzed => 'analyzed',
        LocalOperationStatus.reviewRequired => 'review_required',
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
    this.fileSha256,
    this.ocrText,
    this.ocrConfidence,
    this.ocrProvider,
    this.analysisRevision = 1,
    this.financialEntity,
    this.financialEntityCode,
    this.amount,
    this.currency,
    this.referenceNumber,
    this.transactionDatetime,
    this.receiverName,
    this.receiverIdentifierType,
    this.receiverIdentifierValue,
    this.analysisJson,
    this.analysisWarnings = const [],
    this.analysisConfidence,
    this.cloudOperationId,
  });

  final String id;
  final DateTime createdAt;
  final DateTime updatedAt;
  final LocalOperationStatus status;
  final String imagePath;
  final String? fileSha256;
  final String? ocrText;
  final double? ocrConfidence;
  final String? ocrProvider;
  final int analysisRevision;
  final String? financialEntity;
  final String? financialEntityCode;
  final double? amount;
  final String? currency;
  final String? referenceNumber;
  final String? transactionDatetime;
  final String? receiverName;
  final String? receiverIdentifierType;
  final String? receiverIdentifierValue;
  final Map<String, dynamic>? analysisJson;
  final List<String> analysisWarnings;
  final double? analysisConfidence;
  final String? cloudOperationId;

  bool get needsReview => status == LocalOperationStatus.reviewRequired;
  bool get isAnalyzed => status == LocalOperationStatus.analyzed || needsReview;

  LocalOperation copyWith({
    DateTime? updatedAt,
    LocalOperationStatus? status,
    String? imagePath,
    String? fileSha256,
    String? ocrText,
    double? ocrConfidence,
    String? ocrProvider,
    int? analysisRevision,
    String? financialEntity,
    String? financialEntityCode,
    double? amount,
    String? currency,
    String? referenceNumber,
    String? transactionDatetime,
    String? receiverName,
    String? receiverIdentifierType,
    String? receiverIdentifierValue,
    Map<String, dynamic>? analysisJson,
    List<String>? analysisWarnings,
    double? analysisConfidence,
    String? cloudOperationId,
  }) =>
      LocalOperation(
        id: id,
        createdAt: createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
        status: status ?? this.status,
        imagePath: imagePath ?? this.imagePath,
        fileSha256: fileSha256 ?? this.fileSha256,
        ocrText: ocrText ?? this.ocrText,
        ocrConfidence: ocrConfidence ?? this.ocrConfidence,
        ocrProvider: ocrProvider ?? this.ocrProvider,
        analysisRevision: analysisRevision ?? this.analysisRevision,
        financialEntity: financialEntity ?? this.financialEntity,
        financialEntityCode: financialEntityCode ?? this.financialEntityCode,
        amount: amount ?? this.amount,
        currency: currency ?? this.currency,
        referenceNumber: referenceNumber ?? this.referenceNumber,
        transactionDatetime: transactionDatetime ?? this.transactionDatetime,
        receiverName: receiverName ?? this.receiverName,
        receiverIdentifierType: receiverIdentifierType ?? this.receiverIdentifierType,
        receiverIdentifierValue: receiverIdentifierValue ?? this.receiverIdentifierValue,
        analysisJson: analysisJson ?? this.analysisJson,
        analysisWarnings: analysisWarnings ?? this.analysisWarnings,
        analysisConfidence: analysisConfidence ?? this.analysisConfidence,
        cloudOperationId: cloudOperationId ?? this.cloudOperationId,
      );

  Map<String, Object?> toDb() => {
        'id': id,
        'created_at': createdAt.toUtc().toIso8601String(),
        'updated_at': updatedAt.toUtc().toIso8601String(),
        'status': status.dbValue,
        'image_path': imagePath,
        'file_sha256': fileSha256,
        'ocr_text': ocrText,
        'ocr_confidence': ocrConfidence,
        'ocr_provider': ocrProvider,
        'analysis_revision': analysisRevision,
        'financial_entity': financialEntity,
        'financial_entity_code': financialEntityCode,
        'amount': amount,
        'currency': currency,
        'reference_number': referenceNumber,
        'transaction_datetime': transactionDatetime,
        'receiver_name': receiverName,
        'receiver_identifier_type': receiverIdentifierType,
        'receiver_identifier_value': receiverIdentifierValue,
        'analysis_json': analysisJson == null ? null : jsonEncode(analysisJson),
        'analysis_warnings': jsonEncode(analysisWarnings),
        'analysis_confidence': analysisConfidence,
        'cloud_operation_id': cloudOperationId,
      };

  factory LocalOperation.fromDb(Map<String, Object?> row) {
    final analysisRaw = row['analysis_json'] as String?;
    final warningsRaw = row['analysis_warnings'] as String?;
    return LocalOperation(
      id: row['id']! as String,
      createdAt: DateTime.parse(row['created_at']! as String).toLocal(),
      updatedAt: DateTime.parse(row['updated_at']! as String).toLocal(),
      status: LocalOperationStatusCodec.parse(row['status']! as String),
      imagePath: row['image_path']! as String,
      fileSha256: row['file_sha256'] as String?,
      ocrText: row['ocr_text'] as String?,
      ocrConfidence: (row['ocr_confidence'] as num?)?.toDouble(),
      ocrProvider: row['ocr_provider'] as String?,
      analysisRevision: (row['analysis_revision'] as num?)?.toInt() ?? 1,
      financialEntity: row['financial_entity'] as String?,
      financialEntityCode: row['financial_entity_code'] as String?,
      amount: (row['amount'] as num?)?.toDouble(),
      currency: row['currency'] as String?,
      referenceNumber: row['reference_number'] as String?,
      transactionDatetime: row['transaction_datetime'] as String?,
      receiverName: row['receiver_name'] as String?,
      receiverIdentifierType: row['receiver_identifier_type'] as String?,
      receiverIdentifierValue: row['receiver_identifier_value'] as String?,
      analysisJson: analysisRaw == null ? null : jsonDecode(analysisRaw) as Map<String, dynamic>,
      analysisWarnings: warningsRaw == null
          ? const []
          : (jsonDecode(warningsRaw) as List<dynamic>).map((e) => e.toString()).toList(),
      analysisConfidence: (row['analysis_confidence'] as num?)?.toDouble(),
      cloudOperationId: row['cloud_operation_id'] as String?,
    );
  }
}
