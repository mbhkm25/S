export type SanadPrimaryDomain = 'ai' | 'financial' | 'business' | 'account';

export type SanadPrimaryDomainDefinition = {
  id: SanadPrimaryDomain;
  label: string;
  ariaLabel: string;
};

export const SANAD_PRIMARY_DOMAINS: readonly SanadPrimaryDomainDefinition[] = [
  { id: 'ai', label: 'AI', ariaLabel: 'مساعد سند الذكي' },
  { id: 'financial', label: 'المالي', ariaLabel: 'سند المالي' },
  { id: 'business', label: 'الأعمال', ariaLabel: 'سند الأعمال' },
  { id: 'account', label: 'حسابي', ariaLabel: 'حسابي في سند' },
] as const;

const FINANCIAL_LEGACY_PAGES = new Set([
  'home',
  'upload',
  'my-operations',
  'details',
  'verify-notice',
  'reports',
  'scan-qr',
  'share-intake',
]);

const BUSINESS_LEGACY_PAGES = new Set([
  'business-create',
  'business-manage',
  'business-operations',
  'business-team',
  'business-manage-profile',
  'business-whatsapp-catalog',
  'business-community',
  'business-customers',
  'public-business-profile',
  'public-product-detail',
]);

const ACCOUNT_LEGACY_PAGES = new Set([
  'profile',
  'notifications',
]);

export function domainForLegacyPage(page: string): SanadPrimaryDomain | null {
  if (FINANCIAL_LEGACY_PAGES.has(page)) return 'financial';
  if (BUSINESS_LEGACY_PAGES.has(page)) return 'business';
  if (ACCOUNT_LEGACY_PAGES.has(page)) return 'account';
  return null;
}

export function isPrimaryDomain(value: string): value is SanadPrimaryDomain {
  return SANAD_PRIMARY_DOMAINS.some((domain) => domain.id === value);
}
