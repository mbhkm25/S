export interface ProcessedPaymentFile {
  file: File;
  metadata: {
    originalName: string;
    originalType: string;
    originalSize: number;
    processedType: string;
    processedSize: number;
    width: number | null;
    height: number | null;
    compressionApplied: boolean;
    processingFallbackReason?: string;
  };
}

const MAX_IMAGE_DIMENSION = 2200;
const WEBP_QUALITY = 0.84;
const MIN_PROCESSING_SIZE = 450 * 1024;

function replaceExtension(name: string, extension: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'payment-document';
  return `${base}.${extension}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function loadImage(file: File): Promise<{ image: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('image_decode_failed'));
    image.src = objectUrl;
  });

  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => URL.revokeObjectURL(objectUrl),
  };
}

function originalResult(file: File, reason?: string, dimensions?: { width: number; height: number }): ProcessedPaymentFile {
  return {
    file,
    metadata: {
      originalName: file.name,
      originalType: file.type || 'application/octet-stream',
      originalSize: file.size,
      processedType: file.type || 'application/octet-stream',
      processedSize: file.size,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      compressionApplied: false,
      ...(reason ? { processingFallbackReason: reason } : {}),
    },
  };
}

export async function preparePaymentFile(file: File): Promise<ProcessedPaymentFile> {
  if (!file.type.startsWith('image/')) return originalResult(file);
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return originalResult(file, 'unsupported_image_type');

  let loaded: Awaited<ReturnType<typeof loadImage>> | null = null;

  try {
    loaded = await loadImage(file);
    const { width, height } = loaded;
    if (!width || !height) return originalResult(file, 'invalid_dimensions');

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    if (file.size < MIN_PROCESSING_SIZE && scale === 1 && file.type === 'image/webp') {
      return originalResult(file, undefined, { width, height });
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return originalResult(file, 'canvas_unavailable', { width, height });

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(loaded.image, 0, 0, targetWidth, targetHeight);

    const blob = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY);
    if (!blob) return originalResult(file, 'webp_encoding_failed', { width, height });

    // Keep the original when conversion does not produce a meaningful size reduction.
    if (blob.size >= file.size * 0.95) {
      return originalResult(file, 'processed_file_not_smaller', { width, height });
    }

    const processedFile = new File([blob], replaceExtension(file.name, 'webp'), {
      type: 'image/webp',
      lastModified: Date.now(),
    });

    return {
      file: processedFile,
      metadata: {
        originalName: file.name,
        originalType: file.type || 'application/octet-stream',
        originalSize: file.size,
        processedType: processedFile.type,
        processedSize: processedFile.size,
        width: targetWidth,
        height: targetHeight,
        compressionApplied: true,
      },
    };
  } catch (error) {
    console.warn('Payment image preprocessing failed; using original file.', error);
    return originalResult(file, 'processing_failed', loaded ? { width: loaded.width, height: loaded.height } : undefined);
  } finally {
    loaded?.close();
  }
}
