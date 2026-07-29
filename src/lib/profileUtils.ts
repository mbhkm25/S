import { Profile } from '../types';
import { toLatinDigits, parseYemeniLocalPhone } from './digits';

/**
 * Normalizes 9 local digits into 967XXXXXXXXX format.
 */
export function normalizeYemenPhone(localPart: string): string {
  const cleaned = parseYemeniLocalPhone(localPart);
  return `967${cleaned}`;
}

/**
 * Validates if the local phone number contains exactly 9 digits and starts with a valid Yemeni prefix.
 */
export function isValidYemenLocalPhone(value: string): boolean {
  const cleaned = parseYemeniLocalPhone(toLatinDigits(value));
  return /^7\d{8}$/.test(cleaned);
}

/**
 * Masks bank account number, displaying only the last 4 digits (e.g., •••• 1234).
 */
export function maskAccountNumber(accountNumber: string | null | undefined): string {
  if (!accountNumber) return '';
  const cleaned = toLatinDigits(accountNumber).replace(/\s+/g, '');
  if (cleaned.length <= 4) return cleaned;
  return `•••• ${cleaned.substring(cleaned.length - 4)}`;
}

/**
 * Basic profile completion is the completion of required signup data:
 * full name, Yemeni phone supplied by the user, and governorate.
 *
 * Phone ownership verification is a separate security state. During that flow
 * the submitted number lives in pending_phone, so it must still count as
 * completed signup data and must not force the user to enter it again.
 */
export function isBasicProfileComplete(profile: Profile | null | undefined, _userEmail?: string | null): boolean {
  if (!profile) return false;
  if (!profile.full_name?.trim()) return false;
  if (!profile.governorate?.trim()) return false;

  const effectivePhone = profile.phone || profile.pending_phone;
  if (!effectivePhone) return false;

  return /^7\d{8}$/.test(parseYemeniLocalPhone(effectivePhone));
}

export function isPhoneOwnershipVerified(profile: Profile | null | undefined): boolean {
  return Boolean(
    profile?.phone
    && profile.phone_verification_status === 'verified'
    && profile.phone_verified_at
  );
}
