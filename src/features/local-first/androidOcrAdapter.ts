import type { LocalOcrAdapter, LocalOcrResult, OcrTextBlock } from './contracts';

interface NativeOcrPayload {
  status?: 'success' | 'error';
  provider?: string;
  providerVersion?: string;
  rawText?: string;
  confidence?: number;
  durationMs?: number;
  blocks?: OcrTextBlock[];
  warnings?: string[];
  message?: string;
}

declare global {
  interface Window {
    AndroidLocalOcr?: {
      recognize: (requestJson: string) => Promise<string> | string;
      getProviderInfo?: () => string | null;
    };
  }
}

export class AndroidBridgeOcrAdapter implements LocalOcrAdapter {
  readonly provider = 'android_native_bridge';

  isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.AndroidLocalOcr?.recognize === 'function';
  }

  async recognize(input: { localId: string; fileUri: string; mimeType: string }): Promise<LocalOcrResult> {
    const bridge = typeof window !== 'undefined' ? window.AndroidLocalOcr : undefined;
    if (!bridge?.recognize) throw new Error('Android local OCR bridge is unavailable.');

    const startedAt = performance.now();
    const raw = await bridge.recognize(JSON.stringify(input));
    let payload: NativeOcrPayload;
    try {
      payload = JSON.parse(raw) as NativeOcrPayload;
    } catch (error) {
      throw new Error(`Android OCR returned invalid JSON: ${String(error)}`);
    }

    if (payload.status !== 'success' || typeof payload.rawText !== 'string') {
      throw new Error(payload.message || 'Android OCR failed.');
    }

    return {
      provider: payload.provider || this.provider,
      providerVersion: payload.providerVersion,
      rawText: payload.rawText,
      confidence: Math.max(0, Math.min(1, payload.confidence ?? 0)),
      durationMs: payload.durationMs ?? Math.round(performance.now() - startedAt),
      blocks: payload.blocks,
      warnings: payload.warnings ?? [],
    };
  }
}

export const androidBridgeOcrAdapter = new AndroidBridgeOcrAdapter();
