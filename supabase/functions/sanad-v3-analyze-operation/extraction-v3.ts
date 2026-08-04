export const EXTRACTION_PIPELINE_VERSION = 'operation-extraction-v3';
export const PRIMARY_EXTRACTION_MODEL = 'gemini-3.6-flash';
export const ESCALATION_EXTRACTION_MODEL = 'gemini-2.5-pro';

export type CoreExtraction = {
  financial_entity?: string | null;
  amount?: number | null;
  currency?: string | null;
  receiver_account?: string | null;
  reference_number?: string | null;
  confidence_score?: number | null;
  multiple_operations_present?: boolean;
};

export function cleanStructuredJson(raw: string): string {
  return String(raw || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

export function repairStructuredJson(raw: string): string {
  let source = cleanStructuredJson(raw);
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start >= 0 && end > start) source = source.slice(start, end + 1);
  source = source.replace(/,\s*([}\]])/g, '$1');

  let output = '';
  let insideString = false;
  let escaped = false;
  for (const char of source) {
    if (insideString && char === '\n') output += '\\n';
    else output += char;
    if (escaped) escaped = false;
    else if (char === '\\') escaped = true;
    else if (char === '"') insideString = !insideString;
  }
  return output;
}

export function parseStructuredJson(raw: string): unknown {
  const attempts = [cleanStructuredJson(raw), repairStructuredJson(raw)];
  let lastError: unknown;
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('gemini_json_parse_failed');
}

export function coreExtractionScore(value: CoreExtraction): number {
  let score = 0;
  for (const field of ['amount', 'currency', 'receiver_account', 'reference_number'] as const) {
    if (value[field] !== null && value[field] !== undefined && value[field] !== '') score += 1;
  }
  if (value.financial_entity && !['unknown', 'جهة أخرى'].includes(value.financial_entity)) score += 1;
  return score;
}

export function shouldEscalateExtraction(value: CoreExtraction): boolean {
  return coreExtractionScore(value) < 4 ||
    Number(value.confidence_score || 0) < 0.72 ||
    value.multiple_operations_present === true ||
    value.financial_entity === 'unknown';
}

export function buildSyntaxRetryPrompt(basePrompt: string): string {
  return `${basePrompt}\nهذه إعادة محاولة بسبب فشل نحوي في الاستجابة السابقة. أعد كائن JSON صالحًا بالكامل ومطابقًا للمخطط فقط.`;
}

export function buildExtractionV3Rules(): string {
  return [
    'لا تخترع أي قيمة غير ظاهرة في المستند.',
    'افصل حساب المستلم عن حساب المرسل والجواز والبطاقة ورقم المرجع.',
    'في إشعارات العمقي يكون الرقم بعد «إلى حساب» أو المرتبط باسم السيد هو حساب المستلم.',
    'الرقم المجاور لعبارة «المرجع» هو المرجع وليس حسابًا ماليًا.',
    'القيمة المحاطة بعلامتي # مثل #600# هي مبلغ العملية.',
    'كلمة سعودي أو ريال سعودي تعني SAR.',
    'استخدم null عند عدم اليقين وسجل الدليل والثقة لكل حقل.',
  ].join('\n');
}
