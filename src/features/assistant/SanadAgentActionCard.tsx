import { subscribeSanadActionReviews } from './actionReviewInvalidation';
import { lazy, Suspense, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Loader2,
  PencilLine,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { SanadAssistantActionReviewCard } from './agentFoundation';
import { describePersonalSetupError, describeSanadActionStatus } from './sanadOperationalState';
import {
  approveSanadAgentAction,
  cancelSanadAgentAction,
  getSanadAgentAction,
  getSanadActionCapabilities,
  updateSanadAgentActionNote,
  type SanadAgentAction,
} from './assistantActionApi';

import { isPersonalExpense, supportsExpenseEdit, type ActionCapabilities } from './personalExpenseDraft';
const ExpenseEditor = lazy(() => import('./SanadPersonalExpenseEditor'));

type Props = {
  card: SanadAssistantActionReviewCard;
  onModify?: (prompt: string) => void;
  onStatusChange?: (status: string) => void;
};

function statusMeta(status: string, actionType: string, result: Record<string, unknown> | null) {
  const state = describeSanadActionStatus(status, actionType, result);
  const classes = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    pending: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    warning: 'bg-amber-50 text-amber-700 border-amber-100',
    muted: 'bg-slate-100 text-slate-500 border-slate-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-100',
  } as const;
  return { ...state, cls: classes[state.tone] };
}

function resultLabel(action: SanadAgentAction | null) {
  if (!action?.result) return null;
  if (action.action_type === 'personal_transaction') {
    const id = String(action.result.transaction_id || '');
    return id ? { label: 'فتح العمليات المالية', href: '/financial/transactions' } : null;
  }
  if (action.action_type === 'commercial_document_draft') {
    const id = String(action.result.document_id || '');
    return id ? { label: 'فتح الإجراءات التجارية', href: '/commercial/actions' } : null;
  }
  return null;
}

export default function SanadAgentActionCard(props: Props) {
  // A newly selected action cannot inherit verification, in-flight edits or capabilities from the previous ID.
  return <ActionCardInstance key={props.card.action_id} {...props} />;
}

function ActionCardInstance({ card, onModify, onStatusChange }: Props & { key?: string }) {
  const [action, setAction] = useState<SanadAgentAction | null>(null);
  const [busy, setBusy] = useState<'approve' | 'cancel' | 'modify' | 'save_note' | null>(null);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteVersion, setNoteVersion] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [capabilities, setCapabilities] = useState<ActionCapabilities | null>(null);
  const [expenseEditing, setExpenseEditing] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let alive = true;
    let request = 0;
    const refresh = () => {
      const current = ++request;
      setVerified(false);
      void getSanadAgentAction(card.action_id)
        .then(async (row) => {
          if (row.id !== card.action_id) throw new Error('action_identity_mismatch');
          if (!alive || current !== request) return;
          setAction(row); setVerified(true);
          setError(previous => previous.startsWith('تعذر التحقق من أحدث حالة') ? '' : previous);
          if (isPersonalExpense(row)) {
            try { const descriptor = await getSanadActionCapabilities(row.thread_id); if (alive && current === request) setCapabilities(descriptor); }
            catch { if (alive && current === request) setCapabilities(null); }
          }
        })
        .catch(() => { if (alive && current === request) setError('تعذر التحقق من أحدث حالة للإجراء؛ الاعتماد معطّل حتى إعادة تحميل الصفحة.'); });
    };
    const unsubscribe = subscribeSanadActionReviews(refresh);
    window.addEventListener('focus',refresh);
    refresh();
    return () => { alive = false; unsubscribe(); window.removeEventListener('focus',refresh); };
  }, [card.action_id, card.version]);

  const status = action?.status || card.status;
  const version = action?.version || card.version;

  useEffect(() => {
    // The message-level activity indicator must not report a stale card as verified.
    if (verified) onStatusChange?.(status);
  }, [onStatusChange, status, verified]);
  const review = action?.review || {
    title: card.title,
    summary: card.summary || undefined,
    amount: card.amount ?? undefined,
    currency: card.currency || undefined,
    fields: card.fields,
    approval_effect: card.approval_effect || undefined,
    writes_to_erp: card.writes_to_erp,
  };
  const meta = statusMeta(status, action?.action_type || card.action_type, action?.result || null);
  const locked = status !== 'review' || busy !== null || review.writes_to_erp === true || !verified;
  const target = resultLabel(action);
  const expense = action ? isPersonalExpense(action) : false;
  const canEditExpense = action ? supportsExpenseEdit(action, capabilities) : false;
  const setup = action?.action_type === 'personal_account_setup' || action?.action_type === 'personal_category_setup';
  const supportsNote = action?.action_type === 'personal_transaction' || action?.action_type === 'commercial_document_draft';
  const noteField = action?.action_type === 'personal_transaction' ? 'description' : 'notes';
  const currentNote = typeof action?.payload?.[noteField] === 'string' ? String(action.payload[noteField]) : '';

  const saveNote = async () => {
    if (locked || expenseEditing || !noteEditing || noteDraft.length > 500) return;
    setBusy('save_note');
    setError('');
    try {
      const updated = await updateSanadAgentActionNote(card.action_id, noteVersion ?? -1, noteDraft);
      setAction(updated);
      setNoteEditing(false);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : '';
      setError(detail.includes('agent_action_version_conflict')
        ? 'تغير إصدار المسودة في مكان آخر. حُمّلت الحالة الأحدث؛ راجعها ثم أعد حفظ تعديلك.'
        : detail.includes('identical_active_action_already_exists')
          ? 'توجد مسودة أخرى مطابقة نشطة. راجعها قبل حفظ هذا التعديل.'
          : detail || 'تعذر تعديل الملاحظة.');
      try { setAction(await getSanadAgentAction(card.action_id)); } catch { /* preserve visible error */ }
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (locked || noteEditing || expenseEditing) return;
    const effect = review.approval_effect || 'سيتم تنفيذ الإجراء داخل سند.';
    if (!window.confirm(`هل تعتمد هذا الإجراء؟\n\n${effect}`)) return;
    setBusy('approve');
    setError('');
    try {
      const updated = await approveSanadAgentAction(card.action_id, version);
      setAction(updated);
      if (updated.status === 'failed') setError(updated.error_code || 'تعذر تنفيذ الإجراء بعد الاعتماد.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر اعتماد الإجراء.');
      try { setAction(await getSanadAgentAction(card.action_id)); } catch { /* keep current state */ }
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (forModify = false) => {
    if (locked || noteEditing || expenseEditing) return;
    setBusy(forModify ? 'modify' : 'cancel');
    setError('');
    try {
      const updated = await cancelSanadAgentAction(card.action_id, version);
      setAction(updated);
      if (forModify && onModify) onModify(card.modify_prompt || `عدّل مسودة الإجراء ${card.action_id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إلغاء المسودة.');
      try { setAction(await getSanadAgentAction(card.action_id)); } catch { /* keep current state */ }
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="sanad-surface min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] p-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="sanad-icon-box">
            <FileCheck2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="sanad-section-title">{review.title || card.title}</p>
            {review.summary ? <p className="mt-1 text-[13px] leading-6 text-slate-500">{review.summary}</p> : null}
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${meta.cls}`}>
          {meta.label}
        </span>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {(review.fields || card.fields || []).map((field, index) => (
            <div key={`${field.label}-${index}`} className="border-b border-slate-100 px-1 py-2.5 last:border-b-0">
              <p className="text-[11px] font-medium text-slate-400">{field.label || 'بيان'}</p>
              <p className="mt-1 break-words text-[13px] font-medium text-slate-800">{field.value || '—'}</p>
            </div>
          ))}
        </div>

        {status === 'review' && review.approval_effect ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-amber-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="text-xs font-semibold">ماذا سيحدث عند الاعتماد؟</p>
              <p className="mt-1 text-xs leading-5 opacity-80">{review.approval_effect}</p>
            </div>
          </div>
        ) : null}

        {review.writes_to_erp ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-xs leading-5">هذه المسودة تشير إلى كتابة في ERP ولذلك تم تعطيل اعتمادها.</p>
          </div>
        ) : null}

        {status === 'completed' ? (
          <div className={`flex items-start gap-2 rounded-xl p-3 ${meta.tone === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
            {meta.tone === 'success'
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <div>
              <p className="text-xs font-semibold">{meta.detail}</p>
              {target ? (
                <a href={target.href} className="mt-2 inline-flex rounded-lg bg-white px-2.5 py-1.5 text-sm font-semibold shadow-sm">
                  {target.label}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {status === 'cancelled' ? (
          <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-3 text-slate-600">
            <XCircle className="h-4 w-4" />
            <p className="text-xs font-medium">أُلغيت هذه المسودة ولا يمكن اعتمادها.</p>
          </div>
        ) : null}

        {(error || status === 'failed') ? (
          <div role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm leading-5">{describePersonalSetupError(error || action?.error_code || 'تعذر تنفيذ الإجراء.')}</p>
          </div>
        ) : null}

        {notice ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">{notice}</p> : null}

        {expenseEditing && action ? (
          <Suspense fallback={<p role="status" className="text-sm text-slate-600">جارٍ فتح محرر المصروف…</p>}>
            <ExpenseEditor action={action} onSaved={updated => {
              setAction(updated); setExpenseEditing(false); setError('');
              setNotice(updated.status === 'review' ? 'حُفظت المسودة نفسها. راجع البيانات قبل أي اعتماد.' : 'حُمّلت الحالة الحالية للمسودة.');
            }} onClose={current => { setAction(current); setExpenseEditing(false); }} />
          </Suspense>
        ) : null}

        {status === 'review' && verified && action && supportsNote && (!canEditExpense || noteEditing) && !expenseEditing ? (
          <div data-sanad-canonical-note-editor className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            {!noteEditing ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-700">{action.action_type === 'personal_transaction' ? 'وصف المسودة' : 'ملاحظات المسودة'}: {currentNote || 'غير محدد'}</p>
                <button type="button" disabled={locked} onClick={() => { setNoteDraft(currentNote); setNoteVersion(version); setNoteEditing(true); setError(''); }}
                  className="sanad-focus-ring min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 disabled:opacity-40">
                  تعديل النص في المسودة نفسها
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor={`sanad-action-note-${card.action_id}`} className="block text-xs font-medium text-slate-800">
                  {action.action_type === 'personal_transaction' ? 'الوصف' : 'الملاحظات'} (500 حرف كحد أقصى)
                </label>
                <textarea id={`sanad-action-note-${card.action_id}`} value={noteDraft} maxLength={500}
                  onChange={(event) => setNoteDraft(event.target.value)} rows={2} disabled={busy !== null}
                  className="sanad-focus-ring w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm text-slate-900" />
                <p className="text-[11px] leading-5 text-slate-600">يحفظ سند التعديل على المسودة نفسها ويحدّث إصدارها ومعلومات المراجعة. لن يتغير المبلغ أو الحساب أو الطرف.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void saveNote()} disabled={locked || noteDraft.length > 500}
                    className="sanad-focus-ring min-h-11 rounded-xl bg-slate-950 px-4 text-xs font-medium text-white disabled:opacity-40">
                    {busy === 'save_note' ? 'جارٍ الحفظ…' : 'حفظ التعديل'}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => { setNoteEditing(false); setNoteDraft(''); }}
                    className="sanad-focus-ring min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs text-slate-700">تراجع</button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {status === 'review' ? (
          <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-3">
            <button
              type="button"
              disabled={locked || noteEditing || expenseEditing}
              onClick={() => void approve()}
              className="sanad-focus-ring flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-2 text-[13px] font-medium text-white disabled:opacity-40"
            >
              {busy === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              اعتماد
            </button>
            <button
              type="button"
              disabled={locked || noteEditing || expenseEditing || (expense && !canEditExpense) || (setup && !onModify)}
              onClick={() => {
                if (expense) { if (canEditExpense) { setExpenseEditing(true); setNotice(''); setError(''); } }
                else void cancel(true);
              }}
              className="sanad-focus-ring flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 text-[13px] font-medium text-slate-700 disabled:opacity-40"
            >
              {busy === 'modify' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PencilLine className="h-3.5 w-3.5" />}
              {expense ? 'تعديل المصروف' : setup ? 'إلغاء وإعادة تجهيز' : 'تعديل بقية البيانات'}
            </button>
            <button
              type="button"
              disabled={locked || noteEditing || expenseEditing}
              onClick={() => void cancel(false)}
              className="sanad-focus-ring flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-rose-100 bg-rose-50 px-2 text-[13px] font-medium text-rose-700 disabled:opacity-40"
            >
              {busy === 'cancel' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              إلغاء
            </button>
          </div>
        ) : null}

        {status === 'review' && expense && !canEditExpense ? <p className="text-xs leading-6 text-slate-500">تعديل المبلغ والحساب غير متاح حاليًا؛ يمكنك تعديل الوصف فقط.</p> : null}
        {verified ? <p className="text-[11px] text-slate-500">إصدار المسودة: {version}</p> : null}

      </div>
    </section>
  );
}
