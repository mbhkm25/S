import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { PasskeyRecord } from './types';

type ErrorLike = {
  code?: string;
  name?: string;
  message?: string;
};

export class PasskeyOperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PasskeyOperationError';
  }
}

const PASSKEY_MESSAGES: Record<string, string> = {
  passkey_disabled: 'ميزة الدخول بالبصمة غير مفعلة حاليًا.',
  too_many_passkeys: 'وصلت إلى الحد الأقصى لمفاتيح الدخول المسموح بها.',
  webauthn_credential_exists: 'هذا المفتاح مسجل بالفعل.',
  webauthn_credential_not_found: 'لم يتم العثور على مفتاح دخول صالح.',
  webauthn_challenge_not_found: 'لم يعد طلب التحقق صالحًا. حاول مجددًا.',
  webauthn_challenge_expired: 'انتهت صلاحية طلب التحقق. حاول مجددًا.',
  webauthn_verification_failed: 'تعذر التحقق من هويتك.',
  email_not_confirmed: 'يرجى تأكيد حسابك أولًا.',
  user_banned: 'يتعذر استخدام هذا الحساب حاليًا.',
  AbortError: 'ألغيت عملية التحقق.',
  NotAllowedError: 'ألغيت عملية التحقق.',
  InvalidStateError: 'هذا المفتاح مسجل بالفعل.',
  NetworkError: 'تعذر الاتصال بالخادم.',
  network_error: 'تعذر الاتصال بالخادم.',
  invalid_passkey_response: 'تعذر معالجة بيانات مفاتيح الدخول.',
  ERROR_CEREMONY_ABORTED: 'ألغيت عملية التحقق.',
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: 'هذا المفتاح مسجل بالفعل.',
  ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT: 'هذا الجهاز لا يدعم الدخول بالبصمة.',
  ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT: 'هذا الجهاز لا يدعم الدخول بالبصمة.',
  ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG: 'هذا الجهاز لا يدعم الدخول بالبصمة.',
  ERROR_INVALID_DOMAIN: 'تعذر استخدام الدخول بالبصمة من هذا العنوان.',
  ERROR_INVALID_RP_ID: 'تعذر استخدام الدخول بالبصمة من هذا العنوان.',
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function invalidPasskeyResponse(): PasskeyOperationError {
  return new PasskeyOperationError(
    'invalid_passkey_response',
    PASSKEY_MESSAGES.invalid_passkey_response,
  );
}

export function parsePasskeyRecord(value: unknown): PasskeyRecord {
  if (!isPlainObject(value) ||
    !isNonEmptyString(value.id) ||
    !isValidIsoDate(value.created_at)) {
    throw invalidPasskeyResponse();
  }

  if (value.friendly_name !== undefined && typeof value.friendly_name !== 'string') {
    throw invalidPasskeyResponse();
  }
  if (value.last_used_at !== undefined && !isValidIsoDate(value.last_used_at)) {
    throw invalidPasskeyResponse();
  }

  const friendlyName = typeof value.friendly_name === 'string'
    ? value.friendly_name.trim() || 'مفتاح دخول'
    : 'مفتاح دخول';

  return {
    id: value.id,
    friendlyName,
    createdAt: value.created_at,
    lastUsedAt: typeof value.last_used_at === 'string' ? value.last_used_at : undefined,
  };
}

export function parsePasskeyList(value: unknown): PasskeyRecord[] {
  if (!Array.isArray(value)) throw invalidPasskeyResponse();
  return value.map(parsePasskeyRecord);
}

export function parsePasskeyAuthResponse(value: unknown): { user: User; session: Session } {
  if (!isPlainObject(value) || !isPlainObject(value.user) || !isPlainObject(value.session)) {
    throw invalidPasskeyResponse();
  }
  return { user: value.user as unknown as User, session: value.session as unknown as Session };
}

function getErrorCode(error: unknown): string {
  const candidate = isPlainObject(error) ? error as ErrorLike : {};
  if (candidate.code === 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY' && candidate.name && PASSKEY_MESSAGES[candidate.name]) {
    return candidate.name;
  }
  if (candidate.code) return candidate.code;
  if (candidate.name && PASSKEY_MESSAGES[candidate.name]) return candidate.name;
  const message = candidate.message?.toLowerCase() || '';
  if (message.includes('failed to fetch') || message.includes('network')) return 'network_error';
  return 'unknown_passkey_error';
}

export function mapPasskeyError(error: unknown): PasskeyOperationError {
  if (error instanceof PasskeyOperationError) return error;
  const code = getErrorCode(error);
  return new PasskeyOperationError(
    code,
    PASSKEY_MESSAGES[code] || 'تعذر إتمام العملية حاليًا. حاول مرة أخرى.',
  );
}

export async function registerCurrentUserPasskey(signal?: AbortSignal): Promise<PasskeyRecord> {
  const { data, error } = await supabase.auth.registerPasskey({ options: { signal } });
  if (error !== null) throw mapPasskeyError(error);
  return parsePasskeyRecord(data as unknown);
}

export async function signInWithPasskey(signal?: AbortSignal): Promise<void> {
  const { data, error } = await supabase.auth.signInWithPasskey({ options: { signal } });
  if (error !== null) throw mapPasskeyError(error);
  parsePasskeyAuthResponse(data as unknown);
}

export async function listCurrentUserPasskeys(): Promise<PasskeyRecord[]> {
  const { data, error } = await supabase.auth.passkey.list();
  if (error !== null) throw mapPasskeyError(error);
  return parsePasskeyList(data as unknown);
}

export async function renameCurrentUserPasskey(
  passkeyId: string,
  friendlyName: string,
): Promise<PasskeyRecord> {
  const cleanName = friendlyName.trim();
  if (!cleanName || cleanName.length > 120) {
    throw new PasskeyOperationError(
      'invalid_friendly_name',
      'اكتب اسمًا واضحًا لا يتجاوز 120 حرفًا.',
    );
  }

  const { data, error } = await supabase.auth.passkey.update({
    passkeyId,
    friendlyName: cleanName,
  });
  if (error !== null) throw mapPasskeyError(error);
  return parsePasskeyRecord(data as unknown);
}

export async function deleteCurrentUserPasskey(passkeyId: string): Promise<void> {
  const { error } = await supabase.auth.passkey.delete({ passkeyId });
  if (error !== null) throw mapPasskeyError(error);
}
