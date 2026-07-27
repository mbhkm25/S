import { supabase } from './supabase';

export type OperationFilePurpose = 'open' | 'download';

export interface OperationFileAccessResult {
  operationId: string;
  signedUrl: string;
  filename: string;
  mimeType: string;
  fileSize: number | null;
  expiresIn: number;
  purpose: OperationFilePurpose;
}

type FunctionPayload = {
  ok?: boolean;
  operation_id?: string;
  signed_url?: string;
  filename?: string;
  mime_type?: string;
  file_size?: number | null;
  expires_in?: number;
  purpose?: OperationFilePurpose;
  error?: string;
  message?: string;
};

const errorMessages: Record<string, string> = {
  missing_authorization: 'يجب تسجيل الدخول للوصول إلى الملف الأصلي.',
  invalid_authorization: 'انتهت جلسة الدخول. سجّل الدخول مجددًا ثم أعد المحاولة.',
  file_access_forbidden: 'ليس لديك صلاحية للوصول إلى الملف الأصلي لهذه العملية.',
  operation_not_found: 'لم يتم العثور على العملية.',
  token_not_active: 'رابط العملية غير نشط.',
  token_expired: 'انتهت صلاحية رابط العملية.',
  file_not_stored: 'لا يوجد ملف أصلي محفوظ لهذه العملية.',
  missing_file_metadata: 'بيانات الملف الأصلي غير مكتملة.',
  signed_url_failed: 'تعذر تجهيز رابط الملف الأصلي الآن.',
};

function resolveMessage(payload: FunctionPayload | null | undefined, fallback: string): string {
  const code = payload?.error || '';
  return payload?.message || errorMessages[code] || fallback;
}

export async function requestOperationFileAccess(
  publicToken: string,
  purpose: OperationFilePurpose,
): Promise<OperationFileAccessResult> {
  const token = publicToken.trim();
  if (!token) throw new Error('رمز العملية غير متوفر.');

  const { data, error } = await supabase.functions.invoke<FunctionPayload>('sanad-file-access', {
    method: 'POST',
    body: { public_token: token, purpose },
  });

  if (error) {
    throw new Error(resolveMessage(data, error.message || 'تعذر الاتصال بخدمة الملف الأصلي.'));
  }
  if (!data?.ok || !data.signed_url || !data.operation_id) {
    throw new Error(resolveMessage(data, 'تعذر تجهيز رابط الملف الأصلي.'));
  }

  return {
    operationId: data.operation_id,
    signedUrl: data.signed_url,
    filename: data.filename || 'sanad-original-file',
    mimeType: data.mime_type || 'application/octet-stream',
    fileSize: data.file_size ?? null,
    expiresIn: Number(data.expires_in || 300),
    purpose: data.purpose || purpose,
  };
}

export async function openOperationOriginalFile(publicToken: string): Promise<OperationFileAccessResult> {
  return requestOperationFileAccess(publicToken, 'open');
}

export async function downloadOperationOriginalFile(publicToken: string): Promise<OperationFileAccessResult> {
  return requestOperationFileAccess(publicToken, 'download');
}
