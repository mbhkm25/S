// Display-only interpretation of a server-authoritative SANAD action state.
// A completed draft is NOT a posted accounting document.
export type OperationalActionPresentation = {
  label: string;
  detail: string;
  tone: 'success' | 'pending' | 'warning' | 'muted' | 'danger';
};

export function describeSanadActionStatus(
  status: string,
  actionType: string,
  result: Record<string, unknown> | null = null,
): OperationalActionPresentation {
  if (status === 'review') return {
    label: 'مسودة — بانتظار اعتمادك',
    detail: 'لم يحدث تنفيذ مالي. يمكنك مراجعة الإجراء أو تعديله قبل الاعتماد.',
    tone: 'pending',
  };
  if (status === 'approved') return {
    label: 'اعتُمِد — بانتظار التنفيذ',
    detail: 'الاعتماد وحده لا يثبت التسجيل أو الترحيل.',
    tone: 'pending',
  };
  if (status === 'executing') return {
    label: 'جارٍ تنفيذ الإجراء',
    detail: 'لم نتلقَّ بعد نتيجة تنفيذ نهائية.',
    tone: 'pending',
  };
  if (status === 'cancelled') return {
    label: 'أُلغيت المسودة',
    detail: 'لم يُنفَّذ هذا الإجراء.',
    tone: 'muted',
  };
  if (status === 'failed') return {
    label: 'تعذر تنفيذ الإجراء',
    detail: 'تحقق من سبب الإخفاق قبل إعادة المحاولة.',
    tone: 'danger',
  };
  if (status === 'completed' && actionType === 'commercial_document_draft') {
    const verifiedReference = (typeof result?.document_id === 'string' && result.document_id.trim().length > 0) || (typeof result?.document_id === 'number' && Number.isFinite(result.document_id));
    return verifiedReference
      ? { label: 'أُنشئت مسودة المستند', detail: 'المستند مسودة داخل سند، ولم يُرحَّل إلى الدفاتر.', tone: 'success' }
      : { label: 'اكتمل إعداد المسودة — المرجع غير متاح', detail: 'لا يوجد مرجع مستند متحقق؛ لا تفترض وجود قيد مُرحَّل.', tone: 'warning' };
  }
  if (status === 'completed' && actionType === 'personal_transaction') {
    const verifiedReference = (typeof result?.transaction_id === 'string' && result.transaction_id.trim().length > 0) || (typeof result?.transaction_id === 'number' && Number.isFinite(result.transaction_id));
    return verifiedReference
      ? { label: 'سُجّلت العملية في سند', detail: 'نتيجة تنفيذ موثقة بمرجع عملية داخل سند بعد الاعتماد؛ لا تعني ترحيلًا إلى إبداع.', tone: 'success' }
      : { label: 'اكتمل الإجراء — مرجع العملية غير متاح', detail: 'النتيجة غير مكتملة للعرض؛ تحقق من سجل العمليات قبل افتراض تسجيل القيد.', tone: 'warning' };
  }
  if (status === 'completed') return {
    label: 'اكتمل الإجراء — راجع النتيجة',
    detail: 'لا تتوفر دلالة كافية لإثبات تسجيل مالي أو ترحيل.',
    tone: 'warning',
  };
  return {
    label: 'حالة غير معروفة',
    detail: 'تعذر تفسير الحالة الحالية؛ تحقق من خادم سند.',
    tone: 'warning',
  };
}
