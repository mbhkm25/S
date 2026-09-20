import { invokeAuthenticatedSanadFunction } from './assistantEdgeFunctionApi';

export type SanadVoiceTranscriptionResult = {
  ok: true;
  transcript: string;
  model: string;
  duration_ms?: number | null;
  latency_ms?: number;
};

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة التسجيل الصوتي.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('تعذر تجهيز التسجيل الصوتي.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

export async function transcribeSanadAudio(
  blob: Blob,
  durationMs: number,
): Promise<SanadVoiceTranscriptionResult> {
  if (!blob.size) throw new Error('التسجيل الصوتي فارغ.');
  if (blob.size > MAX_AUDIO_BYTES) throw new Error('التسجيل طويل جدًا. جرّب رسالة صوتية أقصر.');

  const dataUrl = await blobToDataUrl(blob);
  const comma = dataUrl.indexOf(',');
  const audioBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
  if (!audioBase64) throw new Error('تعذر تجهيز التسجيل الصوتي.');

  const data = await invokeAuthenticatedSanadFunction<SanadVoiceTranscriptionResult>(
    'sanad-ai-transcribe-v1',
    {
      body: {
        audio_base64: audioBase64,
        mime_type: blob.type || 'audio/webm',
        duration_ms: Math.max(0, Math.round(durationMs)),
      },
    },
  );

  if (!data?.ok || !data.transcript?.trim()) throw new Error('لم أستطع استخراج نص واضح من التسجيل.');
  return { ...data, transcript: data.transcript.trim() };
}
