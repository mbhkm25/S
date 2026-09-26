/**
 * Only present prompts backed by the server-resolved project scope.
 * The URL query parameter and an older thread title never authorize a scope.
 * Legacy unclassified threads deliberately receive no financial suggestions.
 */
export type VerifiedAssistantProjectScope = 'personal' | 'business' | 'legacy_unclassified';

const PERSONAL_PROMPTS = [
  'أعطني نظرة على وضعي المالي الشخصي',
  'اعرض حساباتي الشخصية وأرصدتها المتاحة',
  'ما المصروفات الشخصية الأخيرة؟',
  'راجع التزاماتي المالية الشخصية',
] as const;

const BUSINESS_PROMPTS = [
  'أعطني ملخصًا عن نشاطي التجاري الحالي',
  'اعرض العمليات التجارية الأخيرة لهذا النشاط',
  'ابحث عن عميل في هذا النشاط وأعطني كشف حسابه',
  'ما حالة النسخة السحابية للنظام المحاسبي المرتبط بهذا النشاط؟',
] as const;

export function projectQuickPrompts(scope: VerifiedAssistantProjectScope | null): readonly string[] {
  if (scope === 'personal') return PERSONAL_PROMPTS;
  if (scope === 'business') return BUSINESS_PROMPTS;
  return [];
}
