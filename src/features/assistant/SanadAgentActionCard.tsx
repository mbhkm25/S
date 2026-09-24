import { useEffect, useState } from 'react';
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
import { describeSanadActionStatus } from './sanadOperationalState';
import {
  approveSanadAgentAction,
  cancelSanadAgentAction,
  getSanadAgentAction,
  type SanadAgentAction,
} from './assistantActionApi';

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

export default function SanadAgentActionCard({ card, onModify, onStatusChange }: Props) {
  const [action, setAction] = useState<SanadAgentAction | null>(null);
  const [busy, setBusy] = useState<'approve' | 'cancel' | 'modify' | null>(null);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let alive = true;
    void getSanadAgentAction(card.action_id)
      .then((row) => { if (alive) { setAction(row); setVerified(true); } })
      .catch(() => { if (alive) setError('تعذر التحقق من أحدث حالة للإجراء؛ الاعتماد معطّل حتى إعادة تحميل الصفحة.'); });
    return () => { alive = false; };
  }, [card.action_id]);

  const status = action?.status || card.status;
  const version = action?.version || card.version;

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);
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

  const approve = async () => {
    if (locked) return;
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
    if (locked) return;
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
    <section className="overflow-hidden rounded-[1.55rem] border border-indigo-100 bg-white shadow-[0_12px_30px_rgba(15,23,42,.06)]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-l from-indigo-50/80 to-white p-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <FileCheck2 className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-slate-950">{review.title || card.title}</p>
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

        {review.approval_effect ? (
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
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm leading-5">{error || action?.error_code || 'تعذر تنفيذ الإجراء.'}</p>
          </div>
        ) : null}

        {status === 'review' ? (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={locked}
              onClick={() => void approve()}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-2 text-[13px] font-medium text-white disabled:opacity-40"
            >
              {busy === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              اعتماد
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => void cancel(true)}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 text-[13px] font-medium text-slate-700 disabled:opacity-40"
            >
              {busy === 'modify' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PencilLine className="h-3.5 w-3.5" />}
              تعديل
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => void cancel(false)}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-100 bg-rose-50 px-2 text-[13px] font-medium text-rose-700 disabled:opacity-40"
            >
              {busy === 'cancel' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              إلغاء
            </button>
          </div>
        ) : null}

        <p className="text-[11px] leading-5 text-slate-400">
          الاعتماد ينفذ عقدًا محددًا على خادم سند بعد إعادة التحقق من الملكية والحالة والإصدار. لا يملك نموذج الذكاء الاصطناعي صلاحية تنفيذ هذا الزر.
        </p>
      </div>
    </section>
  );
}
