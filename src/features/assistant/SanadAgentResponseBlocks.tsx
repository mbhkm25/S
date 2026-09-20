import { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpLeft,
  Check,
  CircleAlert,
  Copy,
  Database,
  FileText,
  Info,
  Inbox,
  UserRound,
} from 'lucide-react';
import SanadAgentActionCard from './SanadAgentActionCard';
import type {
  SanadAssistantAnswerCard,
  SanadAssistantAttention,
  SanadAssistantEntity,
  SanadAssistantResponseContract,
} from './agentFoundation';

function number(value: number | null | undefined) {
  return new Intl.NumberFormat('ar-YE-u-nu-latn', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function dateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar-YE-u-nu-latn', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function CopyButton({ text, label = 'نسخ' }: { text?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[13px] font-medium text-slate-600 shadow-sm transition hover:border-slate-300"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'تم النسخ' : label}
    </button>
  );
}

function EntityLink({ entity }: { entity: SanadAssistantEntity }) {
  const Icon = entity.type === 'erp_customer' ? UserRound : entity.type === 'erp_document' ? FileText : Database;
  if (!entity.href) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-1.5 text-[13px] font-medium text-slate-700">
        <Icon className="h-3.5 w-3.5" /> {entity.label}
      </span>
    );
  }
  return (
    <a
      href={entity.href}
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700"
    >
      <Icon className="h-3.5 w-3.5" />
      {entity.label}
      <ArrowUpLeft className="h-3 w-3 text-slate-400" />
    </a>
  );
}

function StatementCard({ card }: { card: Extract<SanadAssistantAnswerCard, { type: 'customer_statement' }> }) {
  return (
    <section className="overflow-hidden rounded-[1.55rem] border border-slate-200/80 bg-white shadow-[0_12px_30px_rgba(15,23,42,.06)]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-l from-slate-50 to-white p-4">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <UserRound className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-slate-900">{card.title}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              حساب {card.account_number || card.account_id || '—'} · {card.movement_count} حركة
            </p>
          </div>
        </div>
        <CopyButton text={card.copy_text} label="نسخ الكشف" />
      </div>

      <div className="p-3.5">
        <div className="grid sm:grid-cols-2">
          {card.currency_summaries.map((item) => (
            <div key={item.currency} className="border-b border-slate-100 py-3.5 last:border-b-0 sm:border-b-0 sm:border-l sm:px-4 sm:last:border-l-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-400">الرصيد الختامي</span>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600">{item.currency}</span>
              </div>
              <p className="mt-1 text-xl font-semibold text-slate-950" dir="ltr">{number(item.closing_balance)}</p>
              <dl className="mt-3 grid grid-cols-3 gap-1 text-center">
                <div><dt className="text-[11px] text-slate-400">افتتاحي</dt><dd className="mt-0.5 text-xs font-medium text-slate-700" dir="ltr">{number(item.opening_balance)}</dd></div>
                <div><dt className="text-[11px] text-slate-400">مدين</dt><dd className="mt-0.5 text-xs font-medium text-slate-700" dir="ltr">{number(item.debit)}</dd></div>
                <div><dt className="text-[11px] text-slate-400">دائن</dt><dd className="mt-0.5 text-xs font-medium text-slate-700" dir="ltr">{number(item.credit)}</dd></div>
              </dl>
            </div>
          ))}
        </div>

        {(card.from_date || card.to_date) && (
          <p className="mt-3 text-xs text-slate-400">
            الفترة: {card.from_date || 'البداية'} — {card.to_date || 'اليوم'}
          </p>
        )}

        {card.href && (
          <a
            href={card.href}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 py-2.5 text-[13px] font-medium text-white shadow-sm transition hover:-translate-y-px hover:shadow-md"
          >
            فتح ملف العميل وحركة الحساب <ArrowUpLeft className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </section>
  );
}

function DocumentsCard({ card }: { card: Extract<SanadAssistantAnswerCard, { type: 'document_list' }> }) {
  return (
    <section className="overflow-hidden rounded-[1.55rem] border border-slate-200/80 bg-white shadow-[0_12px_30px_rgba(15,23,42,.06)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-l from-slate-50 to-white p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
            <FileText className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-slate-900">{card.title}</p>
            <p className="text-xs text-slate-400">{card.count} مستند</p>
          </div>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {(card.items || []).slice(0, 8).map((item, index) => (
          <a
            key={`${item.document_id || index}-${item.label}`}
            href={item.href || '#'}
            className="flex items-center justify-between gap-3 p-3 transition hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-slate-800">{item.label}</p>
              <p className="mt-0.5 truncate text-xs text-slate-400">
                {[item.party_name, item.date, item.currency].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="shrink-0 text-left">
              {typeof item.source_line_total === 'number' && (
                <p className="text-[13px] font-medium text-slate-700" dir="ltr">{number(item.source_line_total)}</p>
              )}
              <ArrowUpLeft className="mt-1 mr-auto h-3.5 w-3.5 text-slate-400" />
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function ReplicaCard({ card }: { card: Extract<SanadAssistantAnswerCard, { type: 'replica_status' }> }) {
  return (
    <section className="border-y border-slate-100 bg-slate-50/60 px-1 py-4">
      <div className="flex items-start gap-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${card.available ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          <Database className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold text-slate-900">{card.title}</p>
            <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${card.available ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {card.available ? 'متاحة للقراءة' : 'غير مكتملة'}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="border-l border-slate-200/70 px-3 py-1 last:border-l-0"><p className="text-[11px] text-slate-400">الجداول</p><p className="mt-1 text-sm font-medium text-slate-800">{card.table_count ?? '—'}</p></div>
            <div className="border-l border-slate-200/70 px-3 py-1 last:border-l-0"><p className="text-[11px] text-slate-400">الصفوف</p><p className="mt-1 text-sm font-medium text-slate-800">{card.row_count ? number(card.row_count) : '—'}</p></div>
            <div className="border-l border-slate-200/70 px-3 py-1 last:border-l-0"><p className="text-[11px] text-slate-400">اكتملت</p><p className="mt-1 text-xs font-medium text-slate-700">{dateTime(card.completed_at)}</p></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PaymentInboxCard({ card }: { card: Extract<SanadAssistantAnswerCard, { type: 'payment_inbox_list' }> }) {
  return (
    <section className="overflow-hidden rounded-[1.55rem] border border-emerald-100 bg-white shadow-[0_12px_30px_rgba(15,23,42,.06)]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-l from-emerald-50/70 to-white p-4">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Inbox className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-slate-900">{card.title}</p>
            <p className="mt-0.5 text-xs text-slate-400">{card.view_label} · {card.count} عملية</p>
          </div>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500">قراءة فقط</span>
      </div>

      <div className="divide-y divide-slate-100">
        {(card.items || []).slice(0, 10).map((item, index) => (
          <a
            key={item.id || item.operation_id || index}
            href={item.href}
            className="flex items-center justify-between gap-3 p-3 transition hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-slate-800">
                {[item.financial_entity, item.receiver_name].filter(Boolean).join(' · ') || 'عملية دفع'}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-slate-400">
                {[item.reference_number ? `مرجع ${item.reference_number}` : null, item.transaction_datetime, item.status].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="shrink-0 text-left">
              {typeof item.amount === 'number' ? (
                <p className="text-[13px] font-medium text-slate-800" dir="ltr">{number(item.amount)} {item.currency || ''}</p>
              ) : null}
              <ArrowUpLeft className="mt-1 mr-auto h-3.5 w-3.5 text-slate-400" />
            </div>
          </a>
        ))}
        {!card.items?.length ? (
          <div className="p-4 text-center text-xs font-medium text-slate-400">لا توجد عمليات في هذا العرض.</div>
        ) : null}
      </div>

      {card.href ? (
        <div className="border-t border-slate-100 p-3">
          <a href={card.href} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white">
            فتح وارد المدفوعات <ArrowUpLeft className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : null}
    </section>
  );
}

function AttentionItem({ item }: { item: SanadAssistantAttention }) {
  const Icon = item.severity === 'critical' ? CircleAlert : item.severity === 'warning' ? AlertTriangle : Info;
  const classes = item.severity === 'critical'
    ? 'border-rose-100 bg-rose-50 text-rose-800'
    : item.severity === 'warning'
      ? 'border-amber-100 bg-amber-50 text-amber-800'
      : 'border-sky-100 bg-sky-50 text-sky-800';
  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border p-3 ${classes}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-[13px] font-semibold">{item.title}</p>
          {item.rule_id ? (
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium opacity-80">
              إشارة محسوبة
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-5 opacity-80">{item.body}</p>
        {item.source_label ? (
          <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium opacity-60">
            <Database className="h-2.5 w-2.5" /> المصدر: {item.source_label}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function renderCard(card: SanadAssistantAnswerCard, index: number, onModifyAction?: (prompt: string) => void) {
  if (card.type === 'customer_statement') return <div key={`statement-${index}`}><StatementCard card={card} /></div>;
  if (card.type === 'document_list') return <div key={`documents-${index}`}><DocumentsCard card={card} /></div>;
  if (card.type === 'replica_status') return <div key={`replica-${index}`}><ReplicaCard card={card} /></div>;
  if (card.type === 'payment_inbox_list') return <div key={`payment-inbox-${index}`}><PaymentInboxCard card={card} /></div>;
  if (card.type === 'action_review') return <div key={`action-${card.action_id}`}><SanadAgentActionCard card={card} onModify={onModifyAction} /></div>;
  if (card.type === 'warning') return <div key={`warning-${index}`}><AttentionItem item={{ severity: 'warning', title: card.title, body: card.body }} /></div>;
  if (card.type === 'metric') {
    return (
      <div key={`metric-${index}`} className="border-y border-slate-100 bg-slate-50/60 px-1 py-3.5">
        <p className="text-xs text-slate-400">{card.title}</p>
        <p className="mt-1 text-lg font-semibold text-slate-950">{card.value}</p>
        {card.subtitle ? <p className="mt-1 text-xs text-slate-400">{card.subtitle}</p> : null}
      </div>
    );
  }
  return null;
}

export default function SanadAgentResponseBlocks({
  response,
  onModifyAction,
}: {
  response?: SanadAssistantResponseContract;
  onModifyAction?: (prompt: string) => void;
}) {
  if (!response) return null;
  const cards = Array.isArray(response.cards) ? response.cards : [];
  const entities = Array.isArray(response.entities) ? response.entities : [];
  const attention = Array.isArray(response.attention) ? response.attention : [];
  if (!cards.length && !entities.length && !attention.length && !response.copy_text) return null;

  return (
    <div className="mt-3 space-y-2.5">
      {cards.map((card, index) => renderCard(card, index, onModifyAction))}
      {attention.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-xs font-semibold text-slate-400">انتبه إلى</p>
            {response.insight_meta?.deterministic_count ? (
              <span className="text-[11px] font-medium text-slate-400">
                {response.insight_meta.deterministic_count} إشارة محسوبة من البيانات
              </span>
            ) : null}
          </div>
          {attention.map((item, index) => <div key={`${item.title}-${index}`}><AttentionItem item={item} /></div>)}
        </div>
      )}
      {entities.length > 0 && !cards.some((card) => card.type === 'document_list') && (
        <div className="flex flex-wrap gap-1.5">
          {entities.slice(0, 12).map((entity, index) => (
            <span key={`${entity.type}-${entity.label}-${index}`}><EntityLink entity={entity} /></span>
          ))}
        </div>
      )}
      {response.copy_text && !cards.some((card) => card.type === 'customer_statement') && (
        <CopyButton text={response.copy_text} label="نسخ البيانات" />
      )}
    </div>
  );
}
