export type CurrencyCode = 'SAR' | 'YER' | 'USD' | 'AED' | 'OMR';

export type CurrencyPresentation = {
  code: CurrencyCode | null;
  arabicName: string;
  englishName: string;
  symbol: string;
  symbolAsset?: string;
  minorUnits: number;
  accessibilityLabel: string;
};

const REGISTRY: Record<CurrencyCode, CurrencyPresentation> = {
  SAR: {
    code: 'SAR',
    arabicName: 'ريال سعودي',
    englishName: 'Saudi Riyal',
    symbol: 'ر.س',
    symbolAsset: '/currencies/saudi-riyal-symbol.svg',
    minorUnits: 2,
    accessibilityLabel: 'ريال سعودي',
  },
  YER: {
    code: 'YER',
    arabicName: 'ريال يمني',
    englishName: 'Yemeni Rial',
    symbol: 'ر.ي',
    minorUnits: 2,
    accessibilityLabel: 'ريال يمني',
  },
  USD: {
    code: 'USD',
    arabicName: 'دولار أمريكي',
    englishName: 'US Dollar',
    symbol: '$',
    minorUnits: 2,
    accessibilityLabel: 'دولار أمريكي',
  },
  AED: {
    code: 'AED',
    arabicName: 'درهم إماراتي',
    englishName: 'UAE Dirham',
    symbol: 'د.إ',
    minorUnits: 2,
    accessibilityLabel: 'درهم إماراتي',
  },
  OMR: {
    code: 'OMR',
    arabicName: 'ريال عُماني',
    englishName: 'Omani Rial',
    symbol: 'ر.ع.',
    minorUnits: 3,
    accessibilityLabel: 'ريال عُماني',
  },
};

export function normalizeCurrencyCode(value: unknown): CurrencyCode | null {
  const code = String(value ?? '').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(REGISTRY, code) ? (code as CurrencyCode) : null;
}

export function getCurrencyPresentation(value: unknown): CurrencyPresentation {
  const code = normalizeCurrencyCode(value);
  if (code) return REGISTRY[code];
  const fallback = String(value ?? '').trim().toUpperCase() || '—';
  return {
    code: null,
    arabicName: fallback === '—' ? 'عملة غير محددة' : fallback,
    englishName: fallback,
    symbol: fallback,
    minorUnits: 2,
    accessibilityLabel: fallback === '—' ? 'عملة غير محددة' : fallback,
  };
}

export const currencyRegistry = REGISTRY;
