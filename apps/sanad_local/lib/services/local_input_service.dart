import 'package:file_picker/file_picker.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

class LocalInputFile {
  const LocalInputFile({
    required this.path,
    required this.name,
    required this.source,
    this.mimeType,
  });

  final String path;
  final String name;
  final String source;
  final String? mimeType;
}

class LocalInputService {
  LocalInputService({ImagePicker? imagePicker}) : _imagePicker = imagePicker ?? ImagePicker();

  static const _channel = MethodChannel('sanad.local/platform');
  final ImagePicker _imagePicker;

  Future<LocalInputFile?> captureCamera() async {
    final picked = await _imagePicker.pickImage(
      source: ImageSource.camera,
      imageQuality: 94,
      maxWidth: 3000,
      maxHeight: 4000,
      requestFullMetadata: false,
    );
    if (picked == null) return null;
    return LocalInputFile(path: picked.path, name: picked.name, source: 'camera', mimeType: picked.mimeType);
  }

  Future<LocalInputFile?> pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
      allowMultiple: false,
      withData: false,
      withReadStream: false,
      lockParentWindow: true,
    );
    final file = result?.files.single;
    if (file?.path == null) return null;
    return LocalInputFile(path: file!.path!, name: file.name, source: 'file_picker');
  }

  Future<LocalInputFile?> consumeSharedFile() async {
    final result = await _channel.invokeMapMethod<String, dynamic>('consumeSharedFile');
    final path = result?['path']?.toString();
    if (path == null || path.isEmpty) return null;
    return LocalInputFile(
      path: path,
      name: result?['name']?.toString() ?? path.split('/').last,
      source: 'android_share',
      mimeType: result?['mimeType']?.toString(),
    );
  }
}
