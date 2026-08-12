import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

class StoredLocalFile {
  const StoredLocalFile({
    required this.path,
    required this.sha256Hex,
    required this.originalFileName,
    required this.extension,
    required this.mimeType,
    required this.previewPath,
    required this.pageCount,
  });

  final String path;
  final String sha256Hex;
  final String originalFileName;
  final String extension;
  final String mimeType;
  final String? previewPath;
  final int pageCount;
}
class LocalFileStore {
  static const _channel = MethodChannel('sanad.local/platform');
  static const supportedExtensions = <String>{'.jpg', '.jpeg', '.png', '.webp', '.pdf'};

  Future<StoredLocalFile> persist({
    required String sourcePath,
    required String operationId,
    String? originalFileName,
    String? declaredMimeType,
  }) async {
    final root = await getApplicationSupportDirectory();
    final directory = Directory(p.join(root.path, 'operations', operationId));
    if (!await directory.exists()) await directory.create(recursive: true);

    final source = File(sourcePath);
    if (!await source.exists()) throw StateError('source_file_missing');
    final extension = p.extension(originalFileName ?? sourcePath).toLowerCase();
    if (!supportedExtensions.contains(extension)) throw StateError('unsupported_file_type');

    final bytes = await source.readAsBytes();
    if (bytes.isEmpty) throw StateError('source_file_empty');
    final mimeType = _mimeType(extension, declaredMimeType);
    final target = File(p.join(directory.path, 'original$extension'));
    await target.writeAsBytes(bytes, flush: true);

    String? previewPath;
    var pageCount = 1;
    if (mimeType == 'application/pdf') {
      final result = await _channel.invokeMapMethod<String, dynamic>('renderPdfFirstPage', {
        'pdfPath': target.path,
        'outputPath': p.join(directory.path, 'preview-page-1.png'),
      });
      previewPath = result?['previewPath']?.toString();
      pageCount = (result?['pageCount'] as num?)?.toInt() ?? 1;
    }

    return StoredLocalFile(
      path: target.path,
      sha256Hex: sha256.convert(bytes).toString(),
      originalFileName: p.basename(originalFileName ?? sourcePath),
      extension: extension,
      mimeType: mimeType,
      previewPath: previewPath,
      pageCount: pageCount,
    );
  }

  String _mimeType(String extension, String? declared) {
    if (extension == '.pdf') return 'application/pdf';
    if (extension == '.png') return 'image/png';
    if (extension == '.webp') return 'image/webp';
    if (extension == '.jpg' || extension == '.jpeg') return 'image/jpeg';
    return declared?.split(';').first.trim().toLowerCase() ?? 'application/octet-stream';
  }
}
