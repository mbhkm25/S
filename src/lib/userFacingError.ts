type BackendErrorLike = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function backendMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== 'object') return '';
  return text((error as BackendErrorLike).message);
}

function backendCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  return text((error as BackendErrorLike).code).toUpperCase();
}

export class SanadServiceError extends Error {
  readonly technicalMessage: string;
  readonly backendCode: string;
  readonly retryable: boolean;

  constructor(userMessage: string, error: unknown, retryable = true) {
    super(userMessage);
    this.name = 'SanadServiceError';
    this.technicalMessage = backendMessage(error);
    this.backendCode = backendCode(error);
    this.retryable = retryable;
  }
}

export function toUserSafeServiceError(
  error: unknown,
  fallbackMessage = 'تعذر إكمال الطلب حاليًا. حاول مرة أخرى بعد قليل.',
): SanadServiceError {
  const message = backendMessage(error).toLowerCase();
  const code = backendCode(error);

  if (
    message.includes('schema cache')
    || message.includes('could not find the function')
    || message.includes('function') && code.startsWith('PGRST')
  ) {
    return new SanadServiceError(
      'هذه الخدمة غير متاحة حاليًا. حدّث الصفحة أو حاول مرة أخرى بعد قليل.',
      error,
      true,
    );
  }

  if (
    code === '42501'
    || message.includes('permission denied')
    || message.includes('not authorized')
    || message.includes('unauthorized')
  ) {
    return new SanadServiceError(
      'لا تملك صلاحية تنفيذ هذا الإجراء في السياق الحالي.',
      error,
      false,
    );
  }

  if (
    message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('timeout')
    || message.includes('timed out')
  ) {
    return new SanadServiceError(
      'تعذر الاتصال بخدمة سند. تحقق من الإنترنت ثم أعد المحاولة.',
      error,
      true,
    );
  }

  return new SanadServiceError(fallbackMessage, error, true);
}
