export type PushErrorCode =
  | 'permission_denied'
  | 'unsupported'
  | 'service_worker_unavailable'
  | 'push_manager_unavailable'
  | 'missing_vapid_key'
  | 'invalid_vapid_key'
  | 'subscription_missing_keys'
  | 'not_authenticated'
  | 'rpc_failure'
  | 'timeout'
  | 'network'
  | 'partial_disable'
  | 'unknown';

const MESSAGES: Record<PushErrorCode, string> = {
  permission_denied: 'تم حظر الإشعارات من إعدادات المتصفح.',
  unsupported: 'هذا الجهاز أو المتصفح لا يدعم إشعارات الجوال.',
  service_worker_unavailable: 'تعذر تشغيل خدمة الإشعارات.',
  push_manager_unavailable: 'هذا الجهاز أو المتصفح لا يدعم إشعارات الجوال.',
  missing_vapid_key: 'إشعارات الجوال غير متاحة حاليًا.',
  invalid_vapid_key: 'إشعارات الجوال غير متاحة حاليًا.',
  subscription_missing_keys: 'تعذر تسجيل هذا الجهاز لاستقبال الإشعارات.',
  not_authenticated: 'يرجى تسجيل الدخول لتفعيل إشعارات الجوال.',
  rpc_failure: 'تعذر تسجيل هذا الجهاز لاستقبال الإشعارات.',
  timeout: 'تعذر تشغيل خدمة الإشعارات.',
  network: 'تعذر الاتصال بالخادم.',
  partial_disable: 'تم تعطيل الإشعارات في الخادم، لكن تعذر حذف الاشتراك من هذا المتصفح.',
  unknown: 'تعذر تشغيل خدمة الإشعارات.'
};

export class PushClientError extends Error {
  constructor(public readonly code: PushErrorCode) {
    super(MESSAGES[code]);
    this.name = 'PushClientError';
  }
}

export function normalizePushError(error: unknown): PushClientError {
  if (error instanceof PushClientError) return error;

  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return new PushClientError('permission_denied');
    if (error.name === 'AbortError') return new PushClientError('timeout');
    if (error.name === 'InvalidStateError') return new PushClientError('service_worker_unavailable');
    if (error.name === 'NotSupportedError') return new PushClientError('unsupported');
    if (error.name === 'NetworkError') return new PushClientError('network');
  }

  return new PushClientError('unknown');
}

export function reportPushError(error: unknown): string {
  const normalized = normalizePushError(error);
  const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
  if (env?.DEV) {
    console.warn('[SANAD Push]', normalized.code);
  }
  return normalized.message;
}
