export interface FinancialEntityDefinition {
  key: string;
  nameAr: string;
  logo: string;
  aliases: string[];
}

const ASSET_BASE = `${import.meta.env.BASE_URL || '/'}assets/financial-entities/`;

const normalize = (value: unknown): string => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[إأآ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/ى/g, 'ي')
  .replace(/[()\[\]{}\-_/\\.,:؛،]/g, ' ')
  .replace(/\s+/g, ' ');

export const FINANCIAL_ENTITIES: FinancialEntityDefinition[] = [
  {
    key: 'alamqi_mobile',
    nameAr: 'العمقي موبايل',
    logo: `${ASSET_BASE}alamqi-mobile.webp`,
    aliases: ['العمقي موبايل', 'العمقي', 'alamqi', 'al amqi']
  },
  {
    key: 'albasiri_mobile',
    nameAr: 'البسيري موبايل',
    logo: `${ASSET_BASE}albasiri-mobile.webp`,
    aliases: ['البسيري موبايل', 'البسيري', 'albasiri', 'al basiri']
  },
  {
    key: 'bcash',
    nameAr: 'بي كاش',
    logo: `${ASSET_BASE}bcash.webp`,
    aliases: ['بي كاش', 'بيكاش', 'b cash', 'bcash', 'b-cash']
  },
  {
    key: 'alkuraimi_hasib',
    nameAr: 'الكريمي حاسب',
    logo: `${ASSET_BASE}alkuraimi-hasib.webp`,
    aliases: ['الكريمي حاسب', 'حاسب الكريمي', 'kuraimi hasib', 'alkuraimi hasib']
  },
  {
    key: 'alkuraimi_saudi',
    nameAr: 'الكريمي سعودي',
    logo: `${ASSET_BASE}alkuraimi-saudi.webp`,
    aliases: ['الكريمي سعودي', 'الكريمي ريال سعودي', 'kuraimi saudi', 'alkuraimi saudi']
  },
  {
    key: 'alkuraimi_yemeni',
    nameAr: 'الكريمي يمني',
    logo: `${ASSET_BASE}alkuraimi-yemeni.webp`,
    aliases: ['الكريمي يمني', 'الكريمي ريال يمني', 'kuraimi yemeni', 'alkuraimi yemeni']
  },
  {
    key: 'bindawol_exchange',
    nameAr: 'بن دول صرافة',
    logo: `${ASSET_BASE}bindawol-exchange.webp`,
    aliases: ['بن دول صرافه', 'بن دول صرافة', 'بن دول', 'bin dowal exchange', 'bindawol exchange']
  },
  {
    key: 'bindawol_pay',
    nameAr: 'بن دول باي',
    logo: `${ASSET_BASE}bindawol-pay.webp`,
    aliases: ['بن دول باي', 'بن دول pay', 'bin dowal pay', 'bindawol pay']
  },
  {
    key: 'alqutaibi',
    nameAr: 'القطيبي',
    logo: `${ASSET_BASE}alqutaibi.webp`,
    aliases: ['القطيبي', 'بنك القطيبي', 'القطيبي الاسلامي', 'alqutaibi', 'qutaibi']
  }
];

const normalizedDefinitions = FINANCIAL_ENTITIES.map((definition) => ({
  ...definition,
  normalizedAliases: definition.aliases.map(normalize)
}));

export function getFinancialEntityDefinition(value: unknown): FinancialEntityDefinition | null {
  const candidate = normalize(value);
  if (!candidate) return null;

  const exact = normalizedDefinitions.find((definition) =>
    definition.normalizedAliases.includes(candidate)
  );
  if (exact) return exact;

  return normalizedDefinitions.find((definition) =>
    definition.normalizedAliases.some((alias) => candidate.includes(alias) || alias.includes(candidate))
  ) || null;
}

export function getFinancialEntityLogo(value: unknown): string | null {
  return getFinancialEntityDefinition(value)?.logo || null;
}

export function getFinancialEntityDisplayName(value: unknown): string {
  return getFinancialEntityDefinition(value)?.nameAr || String(value || '').trim();
}

export function detectFinancialEntityFromText(...values: unknown[]): FinancialEntityDefinition | null {
  return getFinancialEntityDefinition(values.filter(Boolean).join(' '));
}
