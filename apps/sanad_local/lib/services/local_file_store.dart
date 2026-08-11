import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

class StoredLocalFile {
  const StoredLocalFile({required this.path, required this.sha256Hex});
  final String path;
  final String sha256Hex;
}

class LocalFileStore {
  Future<StoredLocalFile> persistImage({
    required String sourcePath,
    required String operationId,
  }) async {
    final root = await getApplicationSupportDirectory();
    final directory = Directory(p.join(root.path, 'operations', operationId));
    if (!await directory.exists()) await directory.create(recursive: true);

    final source = File(sourcePath);
    if (!await source.exists()) throw StateError('source_image_missing');
    final bytes = await source.readAsBytes();
    final extension = p.extension(sourcePath).toLowerCase();
    final safeExtension = {'.jpg', '.jpeg', '.png', '.webp'}.contains(extension) ? extension : '.jpg';
    final target = File(p.join(directory.path, 'original$safeExtension'));
    await target.writeAsBytes(bytes, flush: true);
    final digest = sha256.convert(bytes).toString();
    return StoredLocalFile(path: target.path, sha256Hex: digest);
  }
}
