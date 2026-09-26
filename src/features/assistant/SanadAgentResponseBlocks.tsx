import { lazy, Suspense, useState } from 'react';
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
import {
  resolveSanadCustomerStatementTarget,
  resolveSanadErpDocumentTarget,
  type SanadErpDocumentReference,
  type SanadErpDocumentTarget,
  type SanadCustomerStatementReference,
  type SanadCustomerStatementTarget,
} from './sanadEntityContext';
const SanadCustomerStatementInspector = lazy(() => import('./SanadCustomerStatementInspector'));
const SanadErpDocumentInspector = lazy(() => import('./SanadErpDocumentInspector'));
import { classifySanadAnswerCard, classifySanadEntity } from './sanadInteractiveResultKinds';
import { formatSanadSourceAmount, formatSanadSourceDate } from '../../utils/sanadSourceDisplay';
import { formatSanadErpLedgerDate } from '../../utils/sanadErpLedgerDate';
import type {
  SanadAssistantAnswerCard,
  SanadAssistantAttention,
  SanadAssistantEntity,
  SanadAssistantResponseContract,
} from './agentFoundation';

function number(value: number | null | undefined, currency?: string | null) {
  return formatSanadSourceAmount(value, currency).text;
}

function sourceDate(value?: string | null) {
  const source = formatSanadSourceDate(value);
  return source.valid ? source.text : source.text === '—' ? '—' : `صيغة التاريخ في المصدر: ${source.text}`;
}

function documentDate(value?: string | null) {
  const parsed = formatSanadErpLedgerDate(value);
  return parsed.valid || parsed.text === '—' ? parsed.text : `تاريخ المصدر: ${parsed.text}`;
}

function dateTime(value?: string | null) {
  return sourceDate(value);
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

function EntityLink({ entity, onInspect }: { entity: SanadAssistantEntity; onInspect?: () => void }) {
  const Icon = entity.type === 'erp_customer' ? UserRound : entity.type === 'erp_document' ? FileText : Database;
  if (onInspect) {
    return (
      <button type="button" onClick={onInspect} className="sanad-focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--sanad-border-subtle)] px-2.5 text-[13px] text-slate-700">
        <Icon className="h-3.5 w-3.5" />{entity.label}<ArrowUpLeft className="h-3 w-3" />
      </button>
    );
  }
  // An ERP customer link without a verified same-project resolver is display-only.
  if (!entity.href || entity.type === 'erp_customer' || entity.type === 'erp_document') {
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

function StatementCard({ card, onInspect, legacyBusinessId }: { card: Extract<SanadAssistantAnswerCard, { type: 'customer_statement' }>; onInspect?: () => void; legacyBusinessId?: string | null }) {
  return (
    <section className="sanad-surface overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-l from-slate-50 to-white p-4">
        <div className="flex items-start gap-2.5">
          <span className="sanad-icon-box bg-[var(--sanad-interactive-soft)] text-[var(--sanad-interactive)]">
            <UserRound className="h-4 w-4" />
          </span>
          <div>
            <p className="sanad-section-title">{card.title}</p>
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
                <bdi dir="ltr" className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600">{item.currency}</bdi>
              </div>
              <p className="mt-1 text-xl font-semibold text-slate-950" dir="ltr">{number(item.closing_balance, item.currency)}</p>
              <dl className="mt-3 grid grid-cols-3 gap-1 text-center">
                <div><dt className="text-[11px] text-slate-400">افتتاحي</dt><dd className="mt-0.5 text-xs font-medium text-slate-700" dir="ltr">{number(item.opening_balance, item.currency)}</dd></div>
                <div><dt className="text-[11px] text-slate-400">مدين</dt><dd className="mt-0.5 text-xs font-medium text-slate-700" dir="ltr">{number(item.debit, item.currency)}</dd></div>
                <div><dt className="text-[11px] text-slate-400">دائن</dt><dd className="mt-0.5 text-xs font-medium text-slate-700" dir="ltr">{number(item.credit, item.currency)}</dd></div>
              </dl>
            </div>
          ))}
        </div>

        {(card.from_date || card.to_date) && (
          <p className="mt-3 text-xs text-slate-400">
            الفترة: <bdi dir="auto">{card.from_date ? sourceDate(card.from_date) : 'البداية'}</bdi> — <bdi dir="auto">{card.to_date ? sourceDate(card.to_date) : 'اليوم'}</bdi>
          </p>
        )}

        {onInspect ? (
          <div
            data-sanad-statement-actions="responsive-pair"
            className="mt-4 grid min-w-0 grid-cols-1 gap-2.5 border-t border-slate-100 pt-4 sm:grid-cols-2 sm:items-stretch"
          >
            <button
              type="button"
              data-sanad-statement-action="primary"
              onClick={onInspect}
              className="sanad-focus-ring group inline-flex min-h-12 min-w-0 w-full items-center justify-between gap-3 rounded-xl border border-cyan-300/65 bg-gradient-to-l from-cyan-200 via-emerald-100 to-lime-100 px-4 py-3 text-right text-[13px] font-semibold leading-6 text-slate-900 shadow-[0_2px_8px_rgba(8,145,178,0.08)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:border-cyan-400 hover:shadow-[0_4px_12px_rgba(8,145,178,0.12)] active:translate-y-px motion-reduce:transform-none motion-reduce:transition-none"
            >
              <span className="min-w-0">عرض كشف الحساب التفاعلي</span>
              <ArrowUpLeft aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-700 transition-transform group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none" />
            </button>
            {legacyBusinessId && card.account_id ? (
              <a
                data-sanad-statement-action="secondary"
                href={`/business/manage?section=accounting&erp=statement&business_id=${encodeURIComponent(legacyBusinessId)}&account_id=${encodeURIComponent(String(card.account_id))}`}
                className="sanad-focus-ring group inline-flex min-h-12 min-w-0 w-full items-center justify-between gap-3 rounded-xl border border-emerald-200/90 bg-gradient-to-l from-white to-emerald-50 px-4 py-3 text-right text-[13px] font-medium leading-6 text-slate-900 shadow-[0_1px_5px_rgba(15,23,42,0.04)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:border-emerald-300 hover:from-cyan-50 hover:to-lime-50 hover:shadow-[0_3px_10px_rgba(15,23,42,0.07)] active:translate-y-px motion-reduce:transform-none motion-reduce:transition-none"
              >
                <span className="min-w-0">فتح ملف العميل وحركة الحساب</span>
                <ArrowUpLeft aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-600 transition-transform group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none" />
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DocumentsCard({ card, onInspectDocument }: { card: Extract<SanadAssistantAnswerCard, { type: 'document_list' }>; onInspectDocument?: (source: SanadErpDocumentReference) => void }) {
  return (
    <section data-sanad-document-list="refined" aria-label={card.kind === 'sale' ? 'فواتير المبيعات' : 'فواتير المشتريات'}
      className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-teal-800">
            <FileText aria-hidden="true" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">{card.kind === 'sale' ? 'فواتير المبيعات' : 'فواتير المشتريات'}</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">{card.count} مستند من النسخة السحابية</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-[11px] font-medium text-teal-900">من المصدر</span>
      </header>
      <div className="divide-y divide-slate-100">
        {(card.items || []).slice(0, 8).map((item, index) => {
          const documentKind = item.document_kind || card.kind;
          const isResolved = item.type === 'erp_document' &&
            item.document_id && Number.isSafeInteger(item.document_id) && item.document_id > 0 &&
            (documentKind === 'sale' || documentKind === 'purchase');
          const inspect = isResolved && onInspectDocument ? () => onInspectDocument({
            businessId: item.business_id,
            documentId: item.document_id,
            documentKind,
          }) : undefined;
          const rowContent = (
            <>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] font-semibold leading-6 text-slate-900">
                  <bdi dir="ltr">#{item.document_number || item.document_id || '—'}</bdi>
                  <span className="min-w-0 truncate text-[13px] font-medium text-slate-700">{item.party_name || item.label}</span>
                </p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">
                  {documentDate(item.date)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {typeof item.source_line_total === 'number' ? (
                  <div className="text-left">
                    <span className="block whitespace-nowrap text-[13px] font-semibold text-slate-900" dir="ltr">
                      {number(item.source_line_total)}
                    </span>
                    <span className="block text-[11px] text-slate-500">{item.currency || 'عملة المصدر'}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">{item.currency || '—'}</span>
                )}
                {inspect ? <ArrowUpLeft aria-hidden="true" className="h-4 w-4 shrink-0 text-teal-700" /> : null}
              </div>
            </>
          );
          return inspect ? (
            <button key={`${item.document_id || index}-${item.label}`} type="button" onClick={inspect}
              data-sanad-document-action="authorized-inspect"
              className="sanad-focus-ring flex min-h-[64px] w-full items-center justify-between gap-3 px-3 py-2.5 text-right transition-colors hover:bg-cyan-50/70 focus-visible:bg-cyan-50 sm:px-4">
              {rowContent}
            </button>
          ) : (
            <div key={`${item.document_id || index}-${item.label}`}
              data-sanad-document-action="unresolved" className="flex min-h-[64px] items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
              {rowContent}
            </div>
          );
        })}
      </div>
      {card.count > (card.items || []).length ? (
        <p className="border-t border-slate-100 px-3 py-2 text-[11px] leading-5 text-slate-500 sm:px-4">
          يعرض سند هنا المستندات المستلمة ضمن هذه النتيجة، وليس بالضرورة جميع مستندات النشاط.
        </p>
      ) : null}
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
                {[item.reference_number ? `مرجع ${item.reference_number}` : null, item.transaction_datetime ? sourceDate(item.transaction_datetime) : null, item.status].filter(Boolean).map((part, idx, parts) => (
                  <span key={idx}><bdi dir="auto">{part}</bdi>{idx < parts.length - 1 ? ' · ' : ''}</span>
                ))}
              </p>
            </div>
            <div className="shrink-0 text-left">
              {typeof item.amount === 'number' ? (
                <p className="text-[13px] font-medium text-slate-800" dir="ltr">{number(item.amount, item.currency)} {item.currency || ''}</p>
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

function renderCard(
  card: SanadAssistantAnswerCard,
  index: number,
  onModifyAction?: (prompt: string) => void,
  onActionStatusChange?: (status: string) => void,
  onInspectCustomer?: (source: SanadCustomerStatementReference) => void,
  verifiedBusinessId?: string | null,
  onInspectDocument?: (source: SanadErpDocumentReference) => void,
) {
  if (card.type === 'customer_statement') return <div key={`statement-${index}`} data-sanad-result-kind={classifySanadAnswerCard(card)}><StatementCard card={card} legacyBusinessId={verifiedBusinessId} onInspect={onInspectCustomer ? () => onInspectCustomer({ accountId: card.account_id, fromDate: card.from_date, toDate: card.to_date }) : undefined} /></div>;
  if (card.type === 'document_list') return <div key={`documents-${index}`} data-sanad-result-kind={classifySanadAnswerCard(card)}><DocumentsCard card={card} onInspectDocument={onInspectDocument} /></div>;
  if (card.type === 'replica_status') return <div key={`replica-${index}`} data-sanad-result-kind={classifySanadAnswerCard(card)}><ReplicaCard card={card} /></div>;
  if (card.type === 'payment_inbox_list') return <div key={`payment-inbox-${index}`} data-sanad-result-kind={classifySanadAnswerCard(card)}><PaymentInboxCard card={card} /></div>;
  if (card.type === 'action_review') return (
    <div key={`action-${card.action_id}`} data-sanad-result-kind={classifySanadAnswerCard(card)}>
      <SanadAgentActionCard
        card={card}
        onModify={onModifyAction}
        onStatusChange={onActionStatusChange}
      />
    </div>
  );
  if (card.type === 'warning') return <div key={`warning-${index}`} data-sanad-result-kind={classifySanadAnswerCard(card)}><AttentionItem item={{ severity: 'warning', title: card.title, body: card.body }} /></div>;
  if (card.type === 'metric') {
    return (
      <div key={`metric-${index}`} data-sanad-result-kind={classifySanadAnswerCard(card)} className="border-y border-slate-100 bg-slate-50/60 px-1 py-3.5">
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
  onActionStatusChange,
  verifiedBusinessId,
  verifiedThreadId,
}: {
  response?: SanadAssistantResponseContract;
  onModifyAction?: (prompt: string) => void;
  onActionStatusChange?: (status: string) => void;
  verifiedBusinessId?: string | null;
  verifiedThreadId?: string | null;
}) {
  const [inspectedTarget, setInspectedTarget] = useState<SanadCustomerStatementTarget | null>(null);
  const [inspectedDocument, setInspectedDocument] = useState<SanadErpDocumentTarget | null>(null);
  const [inspectedDocumentThreadId, setInspectedDocumentThreadId] = useState<string | null>(null);
  const [inspectedDocumentListIndex, setInspectedDocumentListIndex] = useState<number | null>(null);
  const context = verifiedBusinessId && verifiedThreadId ? {
    projectKind: 'business' as const, businessId: verifiedBusinessId, threadId: verifiedThreadId,
  } : null;
  const resolveTarget = (source: SanadCustomerStatementReference) => resolveSanadCustomerStatementTarget(context, source);
  const inspectCustomer = (source: SanadCustomerStatementReference) => {
    const target = resolveTarget(source);
    if (target) { setInspectedDocument(null); setInspectedTarget(target); }
  };
  const resolveDocument = (source: SanadErpDocumentReference) => resolveSanadErpDocumentTarget(context, source);
  const inspectDocument = (source: SanadErpDocumentReference, listIndex: number | null = null) => {
    const target = resolveDocument(source);
    if (target && verifiedThreadId) {
      setInspectedTarget(null);
      setInspectedDocument(target);
      setInspectedDocumentThreadId(verifiedThreadId);
      setInspectedDocumentListIndex(listIndex);
    }
  };
  if (!response) return null;
  const cards = Array.isArray(response.cards) ? response.cards : [];
  const entities = Array.isArray(response.entities) ? response.entities : [];
  const attention = Array.isArray(response.attention) ? response.attention : [];
  if (!cards.length && !entities.length && !attention.length && !response.copy_text) return null;

  // Do not display multiple full statement cards for the SAME ERP account in
  // one reply. Preserve every distinct period under disclosure for comparison.
  // Never deduplicate ledger movements, documents or accounts here.
  const statementGroups = new Map<number, number[]>();
  cards.forEach((card, index) => {
    if (card.type !== 'customer_statement' || !card.account_id) return;
    statementGroups.set(card.account_id, [...(statementGroups.get(card.account_id) || []), index]);
  });
  const primaryIndex = new Map<number, number>();
  for (const [accountId, indices] of statementGroups) {
    // A broader returned statement is the default; other period views stay accessible.
    primaryIndex.set(accountId, indices.reduce((best, index) => {
      const b = cards[best], c = cards[index];
      return b.type === 'customer_statement' && c.type === 'customer_statement' &&
        c.movement_count > b.movement_count ? index : best;
    }));
  }

  return (
    <div className="mt-3 space-y-2.5">
      {cards.map((card, index) => {
        if (card.type !== 'customer_statement' || !card.account_id) {
          if (card.type === 'document_list' && inspectedDocument && inspectedDocumentListIndex === index && inspectedDocument.businessId === verifiedBusinessId && inspectedDocumentThreadId === verifiedThreadId) {
            return (
              <section key={`documents-workspace-${index}`} data-sanad-document-view="detail"
                className="min-w-0" aria-label="مساحة عرض المستند">
                <button type="button" onClick={() => setInspectedDocument(null)}
                  className="sanad-focus-ring mb-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 text-[13px] font-medium text-slate-900 transition-colors hover:bg-cyan-100">
                  <ArrowUpLeft aria-hidden="true" className="h-4 w-4 rotate-180" />
                  العودة إلى قائمة المستندات
                </button>
                <Suspense fallback={<p role="status" className="p-3 text-xs text-slate-500">جارٍ تجهيز عرض المستند…</p>}>
                  <SanadErpDocumentInspector target={inspectedDocument} onClose={() => setInspectedDocument(null)} />
                </Suspense>
              </section>
            );
          }
          return renderCard(card, index, onModifyAction, onActionStatusChange, undefined, verifiedBusinessId,
            card.type === 'document_list' && context ? (source) => {
              if (resolveDocument(source)) inspectDocument(source, index);
            } : undefined);
        }
        if (primaryIndex.get(card.account_id) !== index) return null;
        const related = statementGroups.get(card.account_id) || [];
        const openCard = (item: typeof card, itemIndex: number) => renderCard(
          item, itemIndex, onModifyAction, onActionStatusChange,
          context && resolveTarget({ accountId: item.account_id, fromDate: item.from_date, toDate: item.to_date }) ? inspectCustomer : undefined,
          verifiedBusinessId,
        );
        return (
          <div key={`statement-group-${card.account_id}-${index}`}>
            <p role="note" className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
              هذه نتيجة من النسخة السحابية وليست مطابقة مالية معتمدة مع تقرير إبداع الحي. لا تعتمد الرصيد قبل المطابقة.
            </p>
            {openCard(card, index)}
            {related.length > 1 ? (
              <details className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700">
                <summary className="cursor-pointer py-2 font-medium">
                  عرض {related.length - 1} كشف لفترة أخرى للحساب نفسه
                </summary>
                <div className="mt-3 space-y-3">
                  {related.filter((other) => other !== index).map((other) => {
                    const alternative = cards[other];
                    return alternative.type === 'customer_statement' ? openCard(alternative, other) : null;
                  })}
                </div>
              </details>
            ) : null}
          </div>
        );
      })}
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
          {entities.slice(0, 12).filter((entity) =>
            entity.type !== 'erp_customer' ||
            !entity.account_id ||
            !statementGroups.has(entity.account_id),
          ).map((entity, index) => (
            <span key={`${entity.type}-${entity.label}-${index}`} data-sanad-result-kind={classifySanadEntity(entity)}><EntityLink entity={entity} onInspect={entity.type === 'erp_customer' && resolveTarget({ accountId: entity.account_id, businessId: entity.business_id }) ? () => inspectCustomer({ accountId: entity.account_id, businessId: entity.business_id }) : entity.type === 'erp_document' && resolveDocument({ documentId: entity.document_id, documentKind: entity.document_kind, businessId: entity.business_id }) ? () => inspectDocument({ documentId: entity.document_id, documentKind: entity.document_kind, businessId: entity.business_id }) : undefined} /></span>
          ))}
        </div>
      )}
      {inspectedTarget && inspectedTarget.businessId === verifiedBusinessId ? (
        <Suspense fallback={<p role="status" className="p-3 text-xs text-slate-500">جارٍ تجهيز عرض كشف الحساب…</p>}>
          <SanadCustomerStatementInspector target={inspectedTarget} onClose={() => setInspectedTarget(null)} />
        </Suspense>
      ) : null}
      {inspectedDocument && inspectedDocument.businessId === verifiedBusinessId &&
        inspectedDocumentThreadId === verifiedThreadId &&
        inspectedDocumentListIndex === null ? (
        <section data-sanad-document-view="detail" className="min-w-0">
          <button type="button" onClick={() => setInspectedDocument(null)}
            className="sanad-focus-ring mb-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 text-[13px] font-medium text-slate-900">
            <ArrowUpLeft aria-hidden="true" className="h-4 w-4 rotate-180" /> إغلاق تفاصيل المستند
          </button>
          <Suspense fallback={<p role="status" className="p-3 text-xs text-slate-500">جارٍ تجهيز عرض المستند…</p>}>
            <SanadErpDocumentInspector target={inspectedDocument} onClose={() => setInspectedDocument(null)} />
          </Suspense>
        </section>
      ) : null}
      {response.copy_text && !cards.some((card) => card.type === 'customer_statement') && (
        <CopyButton text={response.copy_text} label="نسخ البيانات" />
      )}
    </div>
  );
}
