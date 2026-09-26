import { SANAD_ASSISTANT_TOOLS, type SanadAssistantToolDefinition } from './agentFoundation';
import type { VerifiedAssistantProjectScope } from './sanadProjectQuickPrompts';

/**
 * Stage 2C.5 catalog: conversation-scoped, non-authoritative presentation of
 * EXISTING server tools. This is NOT a permission grant or a second action API.
 * Server must independently re-check every tool/actor/project/entity request.
 */
export type SanadSpecialistId =
  | 'personal_finance' | 'business_health' | 'erp_customers'
  | 'erp_documents' | 'business_payments' | 'business_drafts';

export type SanadActionFormField = {
  id: string;
  type: 'text' | 'date';
  label: string;
  required: boolean;
  maxLength?: number;
  autocomplete?: 'server_entity_resolution';
};

export type SanadComposerActionDescriptor = {
  id: string;
  schemaVersion: 1;
  title: string;
  description: string;
  specialist: SanadSpecialistId;
  projectKind: 'personal' | 'business';
  risk: 'read_only' | 'draft_only';
  sourceTools: readonly string[];
  state: 'ready' | 'guided_chat_only';
  formFields: readonly SanadActionFormField[];
};

export const SANAD_COMPOSER_ACTIONS: readonly SanadComposerActionDescriptor[] = [
  {
    id: 'personal_review', schemaVersion: 1, title: 'مراجعة الوضع المالي',
    description: 'نظرة شخصية على الحسابات والالتزامات، مع ملاحظات موثقة عند توفر بياناتها.',
    specialist: 'personal_finance', projectKind: 'personal', risk: 'read_only',
    sourceTools: ['finance_get_overview', 'finance_get_budgets', 'finance_get_obligations'],
    state: 'ready',
    formFields: [
      { id: 'from', type: 'date', label: 'من تاريخ', required: false },
      { id: 'to', type: 'date', label: 'إلى تاريخ', required: false },
    ],
  },
  {
    id: 'personal_expense', schemaVersion: 1, title: 'تجهيز مسودة مصروف',
    description: 'مساعدة حوارية في تجهيز مسودة للمراجعة؛ لن تُنفّذ إلا بموافقة منفصلة.',
    specialist: 'personal_finance', projectKind: 'personal', risk: 'draft_only',
    sourceTools: ['finance_get_accounts', 'finance_get_categories', 'action_prepare_personal_transaction'],
    state: 'guided_chat_only', formFields: [],
  },
  {
    id: 'business_review', schemaVersion: 1, title: 'مراجعة حالة النشاط',
    description: 'المستحقات، ومؤشرات النشاط، وحداثة نسخة إبداع؛ ملاحظات مرتبطة بالمصادر فقط.',
    specialist: 'business_health', projectKind: 'business', risk: 'read_only',
    sourceTools: ['business_get_dashboard', 'erp_get_replica_status'],
    state: 'ready',
    formFields: [
      { id: 'from', type: 'date', label: 'من تاريخ', required: false },
      { id: 'to', type: 'date', label: 'إلى تاريخ', required: false },
    ],
  },
  {
    id: 'customer_statement', schemaVersion: 1, title: 'كشف حساب عميل',
    description: 'البحث عن العميل أولًا ثم تحديد الحساب الصحيح وعرض كشفه.',
    specialist: 'erp_customers', projectKind: 'business', risk: 'read_only',
    sourceTools: ['erp_search_customers', 'erp_get_customer_statement'],
    state: 'ready',
    formFields: [
      { id: 'query', type: 'text', label: 'اسم العميل أو رقم حسابه', required: true, maxLength: 120, autocomplete: 'server_entity_resolution' },
      { id: 'from', type: 'date', label: 'من تاريخ', required: false },
      { id: 'to', type: 'date', label: 'إلى تاريخ', required: false },
    ],
  },
  {
    id: 'sales_documents', schemaVersion: 1, title: 'فواتير المبيعات',
    description: 'قائمة وفحص المستندات من النسخة السحابية دون تعديل المصدر.',
    specialist: 'erp_documents', projectKind: 'business', risk: 'read_only',
    sourceTools: ['erp_get_documents'], state: 'ready', formFields: [],
  },
  {
    id: 'purchases_documents', schemaVersion: 1, title: 'فواتير المشتريات',
    description: 'قائمة وفحص المستندات من النسخة السحابية دون تعديل المصدر.',
    specialist: 'erp_documents', projectKind: 'business', risk: 'read_only',
    sourceTools: ['erp_get_documents'], state: 'ready', formFields: [],
  },
  {
    id: 'commercial_draft', schemaVersion: 1, title: 'تجهيز مسودة تجارية',
    description: 'مسودة سند داخل النشاط فقط؛ لا تنشئ أو ترحّل مستندًا في إبداع.',
    specialist: 'business_drafts', projectKind: 'business', risk: 'draft_only',
    sourceTools: ['business_search_parties', 'action_prepare_commercial_document'],
    state: 'guided_chat_only', formFields: [],
  },
] as const;

export function composerActionsForScope(
  scope: VerifiedAssistantProjectScope | null,
  tools: readonly SanadAssistantToolDefinition[] = SANAD_ASSISTANT_TOOLS,
): SanadComposerActionDescriptor[] {
  if (scope !== 'personal' && scope !== 'business') return [];
  return SANAD_COMPOSER_ACTIONS.filter((action) =>
    action.projectKind === scope && action.sourceTools.every((name) => {
      const tool = tools.find((candidate) => candidate.name === name);
      return !!tool && tool.scope === scope &&
        (action.risk === 'read_only' ? tool.risk === 'read_only' : tool.risk !== 'approval_required');
    }));
}

/**
 * Return a safe conversational request, NOT direct action parameters.
 * Server resolves identity, dates and permission before any financial read.
 * Draft-only actions never create an in-browser shadow draft.
 */
export function buildGuidedComposerPrompt(
  action: SanadComposerActionDescriptor,
  values: Readonly<Record<string, string>>,
): string | null {
  const fields = action.formFields;
  if (fields.some((field) => field.required && !values[field.id]?.trim())) return null;
  if (fields.some((field) => field.maxLength && (values[field.id]?.length || 0) > field.maxLength!)) return null;
  for (const field of fields) {
    const raw = values[field.id]?.trim();
    if (field.type === 'date' && raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  }
  if (values.from && values.to && values.from > values.to) return null;
  const dates = [
    values.from ? `من ${values.from}` : '',
    values.to ? `إلى ${values.to}` : '',
  ].filter(Boolean).join(' ');
  switch (action.id) {
    case 'personal_review':
      return `راجع وضعي المالي الشخصي ${dates}. اعرض النتيجة الأساسية، ثم فقط الملاحظات المهمة التي تدعمها بيانات الحسابات والالتزامات والميزانيات المتاحة، مع ذكر الفترات والعملات والمصادر.`.trim();
    case 'personal_expense':
      return 'أريد تجهيز مسودة مصروف شخصي للمراجعة. اسألني عن البيانات الناقصة وابحث عن الحساب والتصنيف الصحيحين، ولا تنفذ أي حركة إلا بعد الموافقة الصريحة على المسودة.';
    case 'business_review':
      return `راجع حالة النشاط التجاري الحالي ${dates}. اعرض المؤشرات، ثم استخرج فقط الملاحظات المهمة من مصادر مخوّلة، وافحص تاريخ اكتمال نسخة إبداع؛ لا تفترض وجود بيانات عن عملاء لم تطلبها.`.trim();
    case 'customer_statement':
      return `ابحث ضمن هذا النشاط عن العميل أو الحساب «${values.query.trim()}»، واعرض المرشحين إذا كانت الهوية ملتبسة، ثم كشف الحساب الموثق ${dates}. أضف فقط الملاحظات المتعلقة به والتي تدعمها بيانات مخولة، ولا تستنتج حالة بقية العملاء دون قراءة مستقلة.`.trim();
    case 'sales_documents':
      return 'اعرض آخر خمس فواتير مبيعات متاحة لهذا النشاط من أحدث نسخة مكتملة، مع توضيح تاريخ النسخة، دون افتراض إجمالي غير متاح.';
    case 'purchases_documents':
      return 'اعرض آخر خمس فواتير مشتريات متاحة لهذا النشاط من أحدث نسخة مكتملة، مع توضيح تاريخ النسخة، دون افتراض إجمالي غير متاح.';
    case 'commercial_draft':
      return 'أريد تجهيز مسودة مستند تجاري داخل سند للمراجعة. ابدأ بتحديد النوع والطرف وفق صلاحية النشاط الحالي ولا ترحّل شيئًا إلى إبداع.';
    default:
      return null;
  }
}
