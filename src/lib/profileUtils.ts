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
 * Verifies if the basic profile fields are complete.
 * Must check: full_name, phone (represented as 967XXXXXXXXX in DB, so its local part has 9 digits), and email.
 */
export function isBasicProfileComplete(profile: Profile | null | undefined, userEmail?: string | null): boolean {
  if (!profile) return false;
  if (!profile.full_name || !profile.full_name.trim()) return false;
  if (!profile.phone) return false;
  if (!profile.governorate || !profile.governorate.trim()) return false;
  
  const email = userEmail || (profile as any).email;
  if (!email || !email.trim()) return false;
  
  const localPart = parseYemeniLocalPhone(profile.phone);
  if (localPart.length !== 9) return false;
  
  return true;
}
