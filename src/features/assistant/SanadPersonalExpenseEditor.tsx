import { useEffect, useId, useRef, useState } from 'react';
import { getExpenseEditorOptions, getSanadAgentAction, updateSanadPersonalExpenseDraft, type SanadAgentAction } from './assistantActionApi';
import { expenseFields, expensePayload, isPersonalExpense, type ExpenseFields, type ExpenseOptions } from './personalExpenseDraft';

type Props = { action: SanadAgentAction; onSaved: (action: SanadAgentAction) => void; onClose: (action: SanadAgentAction) => void };
const control = 'sanad-focus-ring min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-50';

export default function SanadPersonalExpenseEditor({ action, onSaved, onClose }: Props) {
  // Snapshot is deliberately pinned for the whole edit session, never silently rebased on a newer review.
  const [original, setOriginal] = useState(action);
  const [fields, setFields] = useState<ExpenseFields>(() => expenseFields(action));
  const [options, setOptions] = useState<ExpenseOptions | null>(null);
  const [busy, setBusy] = useState<'loading' | 'saving' | 'reload' | null>('loading');
  const [error, setError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const id = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let alive = true;
    setBusy('loading');
    setError('');
    void getExpenseEditorOptions().then(result => { if (alive) setOptions(result); })
      .catch(() => { if (alive) setError('تعذر تحميل الحسابات والتصنيفات. أعد المحاولة.'); })
      .finally(() => { if (alive) setBusy(null); });
    return () => { alive = false; };
  }, [attempt]);
  const setField = (name: keyof ExpenseFields, value: string) => setFields(previous => ({ ...previous, [name]: value }));
  const currencies = [...new Set(options?.accounts.map(account => account.currency) || [])];
  const availableAccounts = options?.accounts.filter(account => account.currency === fields.currency) || [];
  const blocked = busy !== null || !options || needsReload;

  const save = async () => {
    if (blocked || submitting.current || !options) return;
    let payload;
    try { payload = expensePayload(fields, original, options); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'راجع البيانات.'); return; }
    submitting.current = true;
    setBusy('saving'); setError('');
    try {
      const updated = await updateSanadPersonalExpenseDraft(original.id, original.version, payload);
      if (updated.id !== original.id || updated.thread_id !== original.thread_id || !isPersonalExpense(updated) || updated.status !== 'review') {
        throw new Error('unexpected_draft_response');
      }
      if (mounted.current) onSaved(updated);
    } catch (cause) {
      if (!mounted.current) return;
      const message = cause instanceof Error ? cause.message : '';
      setNeedsReload(true);
      setError(message.includes('agent_action_version_conflict')
        ? 'تغيرت المسودة في مكان آخر. لم نستبدل تعديلك؛ حمّل النسخة الأحدث وراجعها قبل التعديل مجددًا.'
        : message.includes('identical_active_action_already_exists')
          ? 'توجد مسودة نشطة مطابقة. لم تُنشأ مسودة جديدة. حمّل الحالة الحالية قبل تعديل البيانات.'
          : 'تعذر تأكيد الحفظ. بقيت بياناتك ظاهرة؛ حمّل الحالة الحالية قبل أي محاولة أخرى.');
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(null);
    }
  };
  const reload = async () => {
    if (busy || submitting.current) return;
    if (!window.confirm('تحميل أحدث نسخة سيستبدل الحقول غير المحفوظة المعروضة الآن. هل تتابع؟')) return;
    setBusy('reload'); setError('');
    try {
      const current = await getSanadAgentAction(original.id);
      if (current.id !== original.id || current.thread_id !== original.thread_id || !isPersonalExpense(current)) throw new Error('invalid_origin');
      if (!mounted.current) return;
      if (current.status !== 'review') { onSaved(current); return; }
      const freshOptions = await getExpenseEditorOptions();
      if (!mounted.current) return;
      setOriginal(current); setFields(expenseFields(current)); setOptions(freshOptions); setNeedsReload(false);
    } catch { if (mounted.current) setError('تعذر تحميل الحالة الحالية. الحفظ معطّل حتى التحقق؛ يمكنك الاحتفاظ بالحقول والمحاولة لاحقًا.'); }
    finally { if (mounted.current) setBusy(null); }
  };

  return (
    <form aria-label="تعديل المصروف" onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-950">تعديل المصروف</h3>
        <p className="mt-1 text-xs leading-6 text-slate-600">تعديل المسودة نفسها · الإصدار {original.version}. الحفظ يحدّث المراجعة ولا يسجّل عملية مالية.</p>
      </div>
      {busy === 'loading' ? <p role="status" className="text-sm text-slate-600">جارٍ تحميل حساباتك وتصنيفات المصروف…</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm leading-6 text-rose-800">{error}</p> : null}
      {!options && !busy ? <button type="button" className={control} onClick={() => setAttempt(value => value + 1)}>إعادة تحميل الخيارات</button> : null}
      <fieldset disabled={busy !== null || !options || needsReload} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label htmlFor={`${id}-amount`} className="min-w-0 space-y-1 text-xs text-slate-700"><span>المبلغ</span>
          <input autoFocus id={`${id}-amount`} inputMode="decimal" dir="ltr" required value={fields.amount} onChange={event => setField('amount', event.target.value)} className={control} /></label>
        <label htmlFor={`${id}-currency`} className="min-w-0 space-y-1 text-xs text-slate-700"><span>العملة</span>
          <select id={`${id}-currency`} value={fields.currency} onChange={event => setFields(previous => ({ ...previous, currency: event.target.value, accountId: '' }))} className={control}>
            {!currencies.includes(fields.currency) ? <option value={fields.currency}>{fields.currency || 'اختر العملة'} — غير متاحة</option> : null}
            {currencies.map(currency => <option key={currency} value={currency}>{currency}</option>)}
          </select></label>
        <label htmlFor={`${id}-account`} className="min-w-0 space-y-1 text-xs text-slate-700"><span>الحساب</span>
          <select id={`${id}-account`} required value={fields.accountId} onChange={event => setField('accountId', event.target.value)} className={control}>
            <option value="">اختر الحساب</option>
            {fields.accountId && !availableAccounts.some(item => item.id === fields.accountId) ? <option value={fields.accountId}>الحساب السابق غير متاح بهذه العملة</option> : null}
            {availableAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
          </select></label>
        <label htmlFor={`${id}-category`} className="min-w-0 space-y-1 text-xs text-slate-700"><span>التصنيف</span>
          <select id={`${id}-category`} value={fields.categoryId} onChange={event => setField('categoryId', event.target.value)} className={control}>
            <option value="">بدون تصنيف</option>
            {fields.categoryId && !options?.categories.some(item => item.id === fields.categoryId) ? <option value={fields.categoryId}>التصنيف السابق غير متاح</option> : null}
            {options?.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select></label>
        <label htmlFor={`${id}-date`} className="min-w-0 space-y-1 text-xs text-slate-700 sm:col-span-2"><span>التاريخ والوقت</span>
          <input id={`${id}-date`} type="datetime-local" dir="ltr" required value={fields.localDate} onChange={event => setField('localDate', event.target.value)} className={control} />
          <span className="block leading-5 text-slate-500">حسب توقيت جهازك: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span></label>
        <label htmlFor={`${id}-description`} className="min-w-0 space-y-1 text-xs text-slate-700 sm:col-span-2"><span>الوصف (اختياري)</span>
          <textarea id={`${id}-description`} rows={2} maxLength={500} value={fields.description} onChange={event => setField('description', event.target.value)} className={control} /></label>
      </fieldset>
      {options && options.accounts.length === 0 ? <p className="text-xs leading-6 text-amber-800">لا توجد حسابات شخصية متاحة. أضف حسابًا من إدارة المالي أولًا.</p> : null}
      <div className="flex flex-wrap gap-2">
        {needsReload ? <button type="button" onClick={() => void reload()} disabled={busy !== null} className={`${control} !w-auto`}>تحميل أحدث نسخة</button> : null}
        <button type="submit" disabled={blocked || options?.accounts.length === 0} className="sanad-focus-ring min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white disabled:opacity-40">{busy === 'saving' ? 'جارٍ الحفظ…' : 'حفظ ومراجعة'}</button>
        <button type="button" disabled={busy === 'saving' || busy === 'reload'} onClick={() => {
          if (needsReload) { void reload(); return; }
          if (JSON.stringify(fields) !== JSON.stringify(expenseFields(original)) && !window.confirm('هل تتراجع عن التعديلات غير المحفوظة؟')) return;
          onClose(original);
        }} className={`${control} !w-auto`}>{needsReload ? 'التحقق قبل الإغلاق' : 'تراجع'}</button>
      </div>
    </form>
  );
}
