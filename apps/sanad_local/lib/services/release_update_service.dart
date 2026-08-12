import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

const _defaultManifestUrl =
    'https://app.sanadflow.com/downloads/sanad-local-latest.json';

class LocalRelease {
  const LocalRelease({
    required this.versionCode,
    required this.versionName,
    required this.downloadUrl,
    required this.sha256,
    required this.sizeBytes,
    required this.releaseNotes,
    required this.requiredUpdate,
  });

  final int versionCode;
  final String versionName;
  final Uri downloadUrl;
  final String sha256;
  final int sizeBytes;
  final List<String> releaseNotes;
  final bool requiredUpdate;
}

class ReleaseUpdateService {
  ReleaseUpdateService({http.Client? client}) : _client = client ?? http.Client();

  static const MethodChannel _platform = MethodChannel('sanad.local/platform');
  static const int _maximumApkBytes = 100 * 1024 * 1024;
  final http.Client _client;

  Future<LocalRelease?> check() async {
    final appInfo = await _platform.invokeMapMethod<String, dynamic>('getAppInfo');
    final currentVersion = (appInfo?['versionCode'] as num?)?.toInt() ?? 0;
    final configured = const String.fromEnvironment(
      'SANAD_LOCAL_RELEASE_MANIFEST_URL',
      defaultValue: _defaultManifestUrl,
    );
    final manifestUri = Uri.parse(configured);
    _requireTrustedUrl(manifestUri);

    final response = await _client.get(manifestUri).timeout(const Duration(seconds: 15));
    if (response.statusCode != HttpStatus.ok) return null;
    final json = jsonDecode(response.body) as Map<String, dynamic>;
    final versionCode = (json['version_code'] as num?)?.toInt() ?? 0;
    if (versionCode <= currentVersion) return null;

    final rawDownload = json['download_url'] as String? ?? '';
    final downloadUri = manifestUri.resolve(rawDownload);
    _requireTrustedUrl(downloadUri);
    final expectedSha = (json['sha256'] as String? ?? '').toLowerCase();
    if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(expectedSha)) {
      throw const FormatException('release_sha256_invalid');
    }
    final size = (json['size_bytes'] as num?)?.toInt() ?? 0;
    if (size <= 0 || size > _maximumApkBytes) {
      throw const FormatException('release_size_invalid');
    }
    final minimum = (json['minimum_supported_version_code'] as num?)?.toInt() ?? 1;
    return LocalRelease(
      versionCode: versionCode,
      versionName: json['version_name'] as String? ?? versionCode.toString(),
      downloadUrl: downloadUri,
      sha256: expectedSha,
      sizeBytes: size,
      releaseNotes: (json['release_notes'] as List<dynamic>? ?? const [])
          .whereType<String>()
          .take(3)
          .toList(growable: false),
      requiredUpdate: json['update_policy'] == 'required' || currentVersion < minimum,
    );
  }

  Future<Map<String, dynamic>> downloadAndInstall(
    LocalRelease release, {
    void Function(int percent)? onProgress,
  }) async {
    final request = http.Request('GET', release.downloadUrl);
    final response = await _client.send(request).timeout(const Duration(seconds: 60));
    if (response.statusCode != HttpStatus.ok) {
      throw HttpException('release_download_failed_${response.statusCode}');
    }
    final advertised = response.contentLength;
    if (advertised != null && advertised != release.sizeBytes) {
      throw const FormatException('release_download_size_mismatch');
    }
    final directory = await getTemporaryDirectory();
    final file = File('${directory.path}/sanad-local-${release.versionCode}.apk');
    final sink = file.openWrite();
    final digestSink = _DigestSink();
    final hashSink = sha256.startChunkedConversion(digestSink);
    var received = 0;
    try {
      await for (final chunk in response.stream) {
        received += chunk.length;
        if (received > release.sizeBytes || received > _maximumApkBytes) {
          throw const FormatException('release_download_too_large');
        }
        sink.add(chunk);
        hashSink.add(chunk);
        onProgress?.call((received * 100 ~/ release.sizeBytes).clamp(0, 100));
      }
      await sink.flush();
      await sink.close();
      hashSink.close();
    } catch (_) {
      await sink.close();
      hashSink.close();
      await file.delete().catchError((_) => file);
      rethrow;
    }
    if (received != release.sizeBytes || digestSink.value?.toString() != release.sha256) {
      await file.delete().catchError((_) => file);
      throw const FormatException('release_integrity_failed');
    }
    return (await _platform.invokeMapMethod<String, dynamic>(
          'installVerifiedApk',
          <String, dynamic>{'apkPath': file.path},
        )) ??
        const <String, dynamic>{};
  }

  void dispose() => _client.close();

  static void _requireTrustedUrl(Uri uri) {
    if (uri.scheme != 'https' || uri.host != 'app.sanadflow.com') {
      throw const FormatException('untrusted_release_url');
    }
  }
}

class _DigestSink implements Sink<Digest> {
  Digest? value;

  @override
  void add(Digest data) => value = data;

  @override
  void close() {}
}
