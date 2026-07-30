export type ReportFinancialEntity = {
  key: string;
  nameAr: string;
  filename: string;
  aliases: string[];
};

const normalize = (value: unknown): string => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[إأآ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/ى/g, 'ي')
  .replace(/[()\[\]{}\-_/\\.,:؛،]/g, ' ')
  .replace(/\s+/g, ' ');

// This list mirrors src/lib/financialEntities.ts exactly. The report renderer
// loads the same immutable WebP files used by the operation log. It never crops,
// recolors, stretches, filters, redraws, or recompresses the logos.
export const REPORT_FINANCIAL_ENTITIES: ReportFinancialEntity[] = [
  { key: 'alamqi_mobile', nameAr: 'العمقي موبايل', filename: 'alamqi-mobile.webp', aliases: ['العمقي موبايل', 'العمقي', 'alamqi', 'al amqi'] },
  { key: 'albasiri_mobile', nameAr: 'البسيري موبايل', filename: 'albasiri-mobile.webp', aliases: ['البسيري موبايل', 'البسيري', 'albasiri', 'al basiri'] },
  { key: 'bcash', nameAr: 'بي كاش', filename: 'bcash.webp', aliases: ['بي كاش', 'بيكاش', 'b cash', 'bcash', 'b-cash'] },
  { key: 'alkuraimi_hasib', nameAr: 'الكريمي حاسب', filename: 'alkuraimi-hasib.webp', aliases: ['الكريمي حاسب', 'حاسب الكريمي', 'kuraimi hasib', 'alkuraimi hasib'] },
  { key: 'alkuraimi_saudi', nameAr: 'الكريمي سعودي', filename: 'alkuraimi-saudi.webp', aliases: ['الكريمي سعودي', 'الكريمي ريال سعودي', 'kuraimi saudi', 'alkuraimi saudi'] },
  { key: 'alkuraimi_yemeni', nameAr: 'الكريمي يمني', filename: 'alkuraimi-yemeni.webp', aliases: ['الكريمي يمني', 'الكريمي ريال يمني', 'kuraimi yemeni', 'alkuraimi yemeni'] },
  { key: 'bindawol_exchange', nameAr: 'بن دول صرافة', filename: 'bindawol-exchange.webp', aliases: ['بن دول صرافه', 'بن دول صرافة', 'بن دول', 'bin dowal exchange', 'bindawol exchange'] },
  { key: 'bindawol_pay', nameAr: 'بن دول باي', filename: 'bindawol-pay.webp', aliases: ['بن دول باي', 'بن دول pay', 'bin dowal pay', 'bindawol pay'] },
  { key: 'alqutaibi', nameAr: 'القطيبي', filename: 'alqutaibi.webp', aliases: ['القطيبي', 'بنك القطيبي', 'القطيبي الاسلامي', 'alqutaibi', 'qutaibi'] }
];

const definitions = REPORT_FINANCIAL_ENTITIES.map((definition) => ({
  ...definition,
  normalizedAliases: definition.aliases.map(normalize)
}));

export function resolveReportFinancialEntity(value: unknown): ReportFinancialEntity | null {
  const candidate = normalize(value);
  if (!candidate) return null;
  const exact = definitions.find((definition) => definition.normalizedAliases.includes(candidate));
  if (exact) return exact;
  return definitions.find((definition) =>
    definition.normalizedAliases.some((alias) => candidate.includes(alias) || alias.includes(candidate))
  ) || null;
}

export async function loadCanonicalReportEntityLogos(appBaseUrl: string): Promise<Record<string, string>> {
  const base = appBaseUrl.replace(/\/+$/, '');
  const entries = await Promise.all(REPORT_FINANCIAL_ENTITIES.map(async (definition) => {
    try {
      const response = await fetch(`${base}/assets/financial-entities/${definition.filename}`, {
        headers: { accept: 'image/webp,image/*' }
      });
      if (!response.ok) return [definition.key, ''] as const;
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return [definition.key, `data:${response.headers.get('content-type') || 'image/webp'};base64,${btoa(binary)}`] as const;
    } catch {
      return [definition.key, ''] as const;
    }
  }));
  return Object.fromEntries(entries);
}
