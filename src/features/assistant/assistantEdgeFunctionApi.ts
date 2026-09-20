import { supabase, supabaseApiUrl, supabasePublicKey } from '../../lib/supabase';

type InvokeOptions = {
  body: unknown;
  signal?: AbortSignal;
};

export async function invokeAuthenticatedSanadFunction<T>(
  functionName: string,
  options: InvokeOptions,
): Promise<T> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message || 'تعذر قراءة جلسة تسجيل الدخول.');

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('انتهت جلسة تسجيل الدخول. سجّل الدخول مجددًا.');

  let response: Response;
  try {
    response = await fetch(`${supabaseApiUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabasePublicKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '';
    throw new Error(message || 'تعذر الاتصال بخدمة سند الآن.');
  }

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: unknown }).error || '')
        : typeof payload === 'string'
          ? payload
          : '';
    throw new Error(errorMessage || `تعذر تنفيذ الطلب (${response.status}).`);
  }

  return payload as T;
}
