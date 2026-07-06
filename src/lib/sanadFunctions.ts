import { supabase } from './supabase';

type SanadAppFunctionName =
  | 'sanad-v3-app-trigger-analysis'
  | 'sanad-v3-app-trigger-pro-payment-verify'
  | 'sanad-v3-app-trigger-notify-verification'
  | 'sanad-v3-app-trigger-report';

export async function callSanadAppFunction<T = any>(
  functionName: SanadAppFunctionName,
  payload: Record<string, any>
): Promise<T> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !sessionData.session?.access_token) {
    throw new Error('not_authenticated');
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: payload,
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
  });

  if (error) {
    throw new Error(error.message || `failed_to_call_${functionName}`);
  }

  return data as T;
}
