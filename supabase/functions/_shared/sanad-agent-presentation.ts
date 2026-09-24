import type { Json } from "./sanad-agent-core.ts";

export type AgentToolOutput = { name: string; args: Json; output: unknown };

type Card = Record<string, unknown>;
type Entity = Record<string, unknown>;
type Attention = Record<string, unknown>;

function object(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Display only. Never round an already-parsed ERP value again in copied
// statements; the JSON transport may already have lost original decimal text.
// Full decimal-string fidelity is a separate canonical RPC contract.
export function money(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const raw = typeof value === "number" && Number.isFinite(value)
    ? value.toString()
    : typeof value === "string" ? value.trim() : "";
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return raw || "—";
  const integer = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${match[1]}${integer}${match[3] ? "." + match[3] : ""}`;
}

function currency(row: Json): string {
  return text(row.english_code) || text(row.arabic_code) || text(row.currency_name) || "عملة";
}

function unwrapContext(output: unknown): Json {
  const root = object(output);
  const context = object(root.context);
  return Object.keys(context).length ? context : root;
}

function customerStatementPresentation(row: AgentToolOutput) {
  const root = object(row.output);
  const ctx = unwrapContext(row.output);
  const account = object(ctx.account);
  const identity = object(ctx.identity);
  const totals = array(ctx.totals_by_currency).map(object);
  const items = array(ctx.items);
  const accountId = num(account.account_id ?? row.args.account_id);
  const businessId = text(root.business_id) || text(row.args.business_id);
  const customerName = text(identity.customer_name) || text(account.account_name) || "حساب عميل";
  const accountNumber = text(account.account_number);
  const from = text(ctx.from_date);
  const to = text(ctx.to_date);

  const currencySummaries = totals.map((item) => ({
    currency: currency(item),
    opening_balance: num(item.opening_balance),
    debit: num(item.debit),
    credit: num(item.credit),
    closing_balance: num(item.closing_balance),
  }));

  const copyLines = [
    "كشف حساب عميل — سند",
    `العميل: ${customerName}`,
    `الحساب: ${accountNumber || accountId || "—"}`,
    from || to ? `الفترة: ${from || "البداية"} — ${to || "اليوم"}` : "الفترة: كل الحركة المتاحة",
    "",
    ...currencySummaries.map((item) =>
      `${item.currency}: افتتاحي ${money(item.opening_balance)} | مدين ${money(item.debit)} | دائن ${money(item.credit)} | الرصيد ${money(item.closing_balance)}`
    ),
    "",
    `عدد الحركات المعروضة: ${items.length}`,
    "المصدر: النسخة السحابية المكتملة لنظام إبداع عبر سند. العملات معروضة كلٌ على حدة.",
  ];

  const href = accountId && businessId
    ? `/business/manage?section=accounting&erp=statement&business_id=${encodeURIComponent(businessId)}&account_id=${accountId}&customer_name=${encodeURIComponent(customerName)}`
    : null;

  const cards: Card[] = [{
    type: "customer_statement",
    title: `كشف حساب — ${customerName}`,
    customer_name: customerName,
    account_id: accountId,
    account_number: accountNumber || null,
    from_date: from || null,
    to_date: to || null,
    movement_count: items.length,
    currency_summaries: currencySummaries,
    copy_text: copyLines.join("\n"),
    href,
  }];

  const entities: Entity[] = accountId ? [{
    type: "erp_customer",
    label: customerName,
    business_id: businessId || null,
    account_id: accountId,
    account_number: accountNumber || null,
    href,
  }] : [];

  const attention: Attention[] = [];
  if (!items.length) {
    attention.push({
      severity: "info",
      title: "لا توجد حركة ضمن الفترة",
      body: "الكشف لا يحتوي حركات ضمن الفترة المختارة؛ راجع الفترة إذا كنت تتوقع نشاطًا.",
    });
  }
  if (currencySummaries.length > 1) {
    attention.push({
      severity: "info",
      title: "الحساب متعدد العملات",
      body: "الأرصدة معروضة لكل عملة بصورة مستقلة ولا يجوز جمعها دون سعر صرف موثق.",
    });
  }

  return { cards, entities, attention, copyText: copyLines.join("\n") };
}

function documentsPresentation(row: AgentToolOutput) {
  const root = object(row.output);
  const ctx = unwrapContext(row.output);
  const docs = array(ctx.items ?? ctx.documents).map(object);
  const businessId = text(root.business_id) || text(row.args.business_id);
  const argKind = text(row.args.kind);
  const documentKind = argKind === "purchases" ? "purchase" : "sale";
  const title = documentKind === "sale" ? "المبيعات" : "المشتريات";

  const entities: Entity[] = docs.flatMap((doc) => {
    const id = num(doc.document_id);
    if (!id) return [];
    const number = text(doc.document_number);
    const party = text(doc.party_name);
    const href = `/business/manage?section=accounting&erp=documents&business_id=${encodeURIComponent(businessId)}&document_kind=${documentKind}&document_id=${id}`;
    return [{
      type: "erp_document",
      label: number ? `#${number}` : `${documentKind === "sale" ? "فاتورة بيع" : "فاتورة شراء"} ${id}`,
      business_id: businessId || null,
      document_kind: documentKind,
      document_id: id,
      document_number: number || null,
      party_name: party || null,
      date: text(doc.document_date) || null,
      currency: currency(doc),
      source_line_total: num(doc.source_line_total ?? doc.source_total_amount),
      href,
    }];
  });

  const cards: Card[] = [{
    type: "document_list",
    title,
    kind: documentKind,
    count: Number(ctx.total ?? docs.length),
    items: entities.slice(0, 12),
  }];

  const attention: Attention[] = [];
  const flagged = docs.filter((doc) => doc.deleted === true || doc.locked === true);
  if (flagged.length) {
    attention.push({
      severity: "warning",
      title: "توجد مستندات بحالة خاصة",
      body: `يوجد ${flagged.length} مستندًا معلّمًا كمحذوف أو مقفل في المصدر؛ راجع حالته قبل الاعتماد عليه تشغيليًا.`,
    });
  }

  return { cards, entities, attention, copyText: null };
}

function replicaPresentation(row: AgentToolOutput) {
  const ctx = unwrapContext(row.output);
  const available = ctx.available === true;
  const currentSync = object(ctx.current_sync);
  const received = object(ctx.received_counts);
  const tableCount = Object.keys(received).length;
  const rowCount = Object.values(received).reduce((sum, value) => sum + (num(value) ?? 0), 0);

  const cards: Card[] = [{
    type: "replica_status",
    title: "حالة نسخة إبداع السحابية",
    available,
    status: text(ctx.status),
    snapshot_public_id: text(ctx.snapshot_public_id) || null,
    completed_at: text(ctx.completed_at) || null,
    table_count: tableCount || null,
    row_count: rowCount || null,
    current_sync: Object.keys(currentSync).length ? currentSync : null,
  }];

  const attention: Attention[] = [];
  if (available && Object.keys(currentSync).length) {
    attention.push({
      severity: "info",
      title: "هناك مزامنة أحدث قيد التنفيذ",
      body: "القراءة الحالية تعتمد آخر نسخة مكتملة، بينما تستمر مزامنة أحدث في الخلفية.",
    });
  }
  if (!available) {
    attention.push({
      severity: "warning",
      title: "لا توجد نسخة مكتملة متاحة حاليًا",
      body: "قد تكون المزامنة الأولى لم تكتمل بعد أو تحتاج مراجعة حالة Bridge.",
    });
  }

  return { cards, entities: [] as Entity[], attention, copyText: null };
}

function paymentInboxPresentation(row: AgentToolOutput) {
  const root = object(row.output);
  const items = array(root.items).map(object).slice(0,20);
  const businessId = text(root.business_id) || text(row.args.business_id);
  const view = text(root.view) || "new";
  const labels: Record<string,string> = {
    new:"الجديدة",
    mine:"لدي",
    team_active:"لدى الفريق",
    review:"تحتاج مراجعة",
    completed:"المكتملة",
    all:"كل العمليات",
  };

  const rendered = items.flatMap((item) => {
    const token = text(item.public_token);
    if (!token) return [];
    return [{
      id:text(item.id) || null,
      operation_id:text(item.operation_id) || null,
      status:text(item.status) || null,
      amount:num(item.amount),
      currency:text(item.currency) || null,
      financial_entity:text(item.financial_entity) || null,
      receiver_name:text(item.receiver_name) || null,
      reference_number:text(item.reference_number) || null,
      transaction_datetime:text(item.transaction_datetime) || null,
      claimed_by_name:text(item.claimed_by_name) || null,
      completed_by_name:text(item.completed_by_name) || null,
      href:`/v/${encodeURIComponent(token)}?src=sanad-agent`,
    }];
  });

  const cardHref = businessId
    ? `/business/manage/operations?view=payment-inbox&business_id=${encodeURIComponent(businessId)}`
    : null;

  return {
    cards:[{
      type:"payment_inbox_list",
      title:"وارد المدفوعات",
      view,
      view_label:labels[view] || view,
      count:rendered.length,
      has_more:root.has_more === true,
      items:rendered,
      href:cardHref,
      read_only:true,
    }] as Card[],
    entities:[] as Entity[],
    attention:[] as Attention[],
    copyText:null,
  };
}

function actionReviewPresentation(row: AgentToolOutput) {
  const action = object(row.output);
  const review = object(action.review);
  const fields = array(review.fields).map(object).slice(0,12).map((item) => ({
    label: text(item.label) || "بيان",
    value: text(item.value) || "—",
  }));
  const actionId = text(action.id);
  const actionType = text(action.action_type);
  const status = text(action.status) || "review";
  const version = num(action.version) ?? 1;
  const amount = num(review.amount);
  const actionTitle = text(review.title) || "مراجعة إجراء مقترح";
  const summary = text(review.summary);
  const currencyCode = text(review.currency);
  const approvalEffect = text(review.approval_effect);
  const writesToErp = review.writes_to_erp === true;

  const modifyPrompt = actionType === "personal_transaction"
    ? `عدّل مسودة الإجراء المالي ${actionId}: ${summary || "المعاملة الشخصية"}`
    : `عدّل مسودة المستند التجاري ${actionId}: ${summary || "المستند"}`;

  return {
    cards: [{
      type: "action_review",
      action_id: actionId,
      action_type: actionType,
      status,
      version,
      title: actionTitle,
      summary: summary || null,
      fields,
      amount,
      currency: currencyCode || null,
      approval_effect: approvalEffect || null,
      writes_to_erp: writesToErp,
      modify_prompt: modifyPrompt,
      risk: "approval_required",
    }] as Card[],
    entities: [] as Entity[],
    attention: writesToErp ? [{
      severity:"critical",
      title:"إجراء غير مسموح",
      body:"هذه المسودة تشير إلى كتابة في ERP، ولذلك يجب عدم اعتمادها.",
    }] as Attention[] : [],
    copyText: null,
  };
}

export function buildAgentPresentation(toolOutputs: AgentToolOutput[]) {
  const cards: Card[] = [];
  const entities: Entity[] = [];
  const attention: Attention[] = [];
  const copyParts: string[] = [];

  for (const row of toolOutputs) {
    let built: { cards: Card[]; entities: Entity[]; attention: Attention[]; copyText: string | null } | null = null;
    if (row.name === "erp_get_customer_statement") built = customerStatementPresentation(row);
    else if (row.name === "erp_get_documents") built = documentsPresentation(row);
    else if (row.name === "erp_get_replica_status") built = replicaPresentation(row);
    else if (row.name === "business_get_payment_inbox") built = paymentInboxPresentation(row);
    else if (row.name === "action_prepare_personal_transaction" || row.name === "action_prepare_commercial_document") built = actionReviewPresentation(row);

    if (!built) continue;
    cards.push(...built.cards);
    entities.push(...built.entities);
    attention.push(...built.attention);
    if (built.copyText) copyParts.push(built.copyText);
  }

  return {
    cards: cards.slice(0, 12),
    entities: entities.slice(0, 30),
    attention: attention.slice(0, 8),
    copy_text: copyParts.length ? copyParts.join("\n\n") : undefined,
  };
}
