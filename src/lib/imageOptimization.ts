export type ImageOptimizationPreset =
  | 'avatar'
  | 'catalog'
  | 'business-logo'
  | 'business-cover'
  | 'business-horizontal-cover'
  | 'gallery';

type PresetConfig = {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  maxSourceBytes: number;
  preserveTransparency: boolean;
};

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const PRESETS: Record<ImageOptimizationPreset, PresetConfig> = {
  avatar: { maxWidth: 768, maxHeight: 768, quality: 0.8, maxSourceBytes: 12 * 1024 * 1024, preserveTransparency: true },
  catalog: { maxWidth: 1600, maxHeight: 1600, quality: 0.78, maxSourceBytes: 12 * 1024 * 1024, preserveTransparency: false },
  'business-logo': { maxWidth: 1024, maxHeight: 1024, quality: 0.82, maxSourceBytes: 12 * 1024 * 1024, preserveTransparency: true },
  'business-cover': { maxWidth: 1600, maxHeight: 2000, quality: 0.8, maxSourceBytes: 15 * 1024 * 1024, preserveTransparency: false },
  'business-horizontal-cover': { maxWidth: 1920, maxHeight: 1080, quality: 0.8, maxSourceBytes: 15 * 1024 * 1024, preserveTransparency: false },
  gallery: { maxWidth: 1600, maxHeight: 1600, quality: 0.78, maxSourceBytes: 12 * 1024 * 1024, preserveTransparency: false }
};

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
};

function normalizedMimeType(file: File): string {
  return file.type.toLowerCase() === 'image/jpg' ? 'image/jpeg' : file.type.toLowerCase();
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() };
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.src = objectUrl;
  try {
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(objectUrl)
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export function validateOptimizableImage(value: unknown, preset: ImageOptimizationPreset): File {
  if (!(value instanceof File)) throw new Error('تعذر قراءة ملف الصورة المختار.');
  const config = PRESETS[preset];
  if (!SUPPORTED_IMAGE_TYPES.has(normalizedMimeType(value))) {
    throw new Error('الصورة غير مدعومة. استخدم JPEG أو PNG أو WEBP.');
  }
  if (value.size <= 0 || value.size > config.maxSourceBytes) {
    throw new Error(`حجم الصورة الأصلية يجب ألا يتجاوز ${Math.round(config.maxSourceBytes / 1024 / 1024)} ميجابايت.`);
  }
  return value;
}

export async function optimizeImageForUpload(
  value: unknown,
  preset: ImageOptimizationPreset
): Promise<File> {
  const file = validateOptimizableImage(value, preset);
  const config = PRESETS[preset];
  let decoded: DecodedImage;
  try {
    decoded = await decodeImage(file);
  } catch {
    throw new Error('تعذر فتح الصورة. جرّب صورة أخرى بصيغة JPEG أو PNG أو WEBP.');
  }

  try {
    if (!decoded.width || !decoded.height) throw new Error('invalid_image_dimensions');
    const scale = Math.min(1, config.maxWidth / decoded.width, config.maxHeight / decoded.height);
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: config.preserveTransparency });
    if (!context) throw new Error('canvas_context_unavailable');
    if (!config.preserveTransparency) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(decoded.source, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('webp_encoding_failed')),
        'image/webp',
        config.quality
      );
    });
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || preset;
    return new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    throw new Error('تعذر تحسين الصورة للرفع. جرّب صورة أخرى.');
  } finally {
    decoded.dispose();
  }
}
