import type { Json } from "./sanad-agent-core.ts";

export type AgentInsightToolOutput = { name: string; args: Json; output: unknown };

export type AgentInsight = {
  id: string;
  severity: "info" | "warning" | "critical";
  category: "obligation" | "budget" | "goal" | "business" | "sync" | "document" | "currency" | "data_quality";
  priority: number;
  title: string;
  body: string;
  source_tool: string;
  source_fact: string;
  rule_id: string;
};

function object(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function array(value: unknown): Json[] {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object").map((item) => item as Json)
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
  return raw.slice(0, 10);
}

function dateMs(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function todayUtc(nowMs: number) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((b - a) / 86_400_000);
}

function currencyOf(row: Json) {
  return text(row.currency) || text(row.english_code) || text(row.arabic_code) || text(row.currency_name) || "عملة";
}

function insight(
  partial: Omit<AgentInsight, "id">,
): AgentInsight {
  return {
    ...partial,
    id: `${partial.rule_id}:${partial.source_tool}:${partial.source_fact}`,
  };
}

function obligationInsights(row: AgentInsightToolOutput, nowMs: number): AgentInsight[] {
  const root = object(row.output);
  const items = array(root.items);
  const today = todayUtc(nowMs);
  const overdueGroups = new Map<string, { count: number; total: number; oldest: string; type: string; currency: string }>();
  const dueSoonGroups = new Map<string, { count: number; total: number; nearest: string; type: string; currency: string }>();

  for (const item of items) {
    const outstanding = num(item.outstanding_amount ?? item.amount) ?? 0;
    const due = isoDate(item.due_date);
    if (outstanding <= 0 || !due) continue;
    const type = text(item.obligation_type ?? item.kind) === "receivable" ? "receivable" : "payable";
    const currency = currencyOf(item);
    const key = `${type}:${currency}`;

    if (due < today) {
      const current = overdueGroups.get(key);
      overdueGroups.set(key, {
        count: (current?.count ?? 0) + 1,
        total: (current?.total ?? 0) + outstanding,
        oldest: !current || due < current.oldest ? due : current.oldest,
        type,
        currency,
      });
      continue;
    }

    const days = daysBetween(today, due);
    if (days >= 0 && days <= 7) {
      const current = dueSoonGroups.get(key);
      dueSoonGroups.set(key, {
        count: (current?.count ?? 0) + 1,
        total: (current?.total ?? 0) + outstanding,
        nearest: !current || due < current.nearest ? due : current.nearest,
        type,
        currency,
      });
    }
  }

  const results: AgentInsight[] = [];
  for (const group of overdueGroups.values()) {
    const receivable = group.type === "receivable";
    results.push(insight({
      severity: "warning",
      category: "obligation",
      priority: 90,
      title: receivable ? "مبالغ مستحقة لك تجاوزت موعدها" : "التزامات تجاوزت موعدها",
      body: `${group.count} بند · ${money(group.total)} ${group.currency} · أقدم موعد ${group.oldest}. لم تُجمع مع أي عملة أخرى.`,
      source_tool: row.name,
      source_fact: `${group.type}:${group.currency}`,
      rule_id: "obligation_overdue_v1",
    }));
  }

  for (const group of dueSoonGroups.values()) {
    const receivable = group.type === "receivable";
    results.push(insight({
      severity: "info",
      category: "obligation",
      priority: 60,
      title: receivable ? "مبالغ مستحقة لك خلال 7 أيام" : "التزامات تستحق خلال 7 أيام",
      body: `${group.count} بند · ${money(group.total)} ${group.currency} · أقرب موعد ${group.nearest}.`,
      source_tool: row.name,
      source_fact: `due_soon:${group.type}:${group.currency}`,
      rule_id: "obligation_due_soon_v1",
    }));
  }

  return results;
}

function budgetInsights(row: AgentInsightToolOutput): AgentInsight[] {
  const root = object(row.output);
  const budgets = array(root.budgets ?? root.items);
  const results: AgentInsight[] = [];

  for (const budget of budgets) {
    const name = text(budget.name) || "ميزانية";
    const currency = currencyOf(budget);
    const budgetAmount = num(budget.budget_amount ?? budget.amount) ?? 0;
    const spent = num(budget.spent_amount) ?? 0;
    const usage = num(budget.usage_percent) ?? (budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0);
    const over = budget.is_over_budget === true || (budgetAmount > 0 && spent > budgetAmount);

    if (over) {
      results.push(insight({
        severity: "warning",
        category: "budget",
        priority: 88,
        title: `تجاوز ميزانية «${name}»`,
        body: `المصروف ${money(spent)} ${currency} مقابل ميزانية ${money(budgetAmount)} ${currency}؛ التجاوز ${money(Math.max(0, spent - budgetAmount))} ${currency}.`,
        source_tool: row.name,
        source_fact: text(budget.id) || name,
        rule_id: "budget_over_v1",
      }));
    } else if (usage >= 80 && budgetAmount > 0) {
      results.push(insight({
        severity: "info",
        category: "budget",
        priority: 55,
        title: `ميزانية «${name}» اقتربت من حدها`,
        body: `الاستخدام ${Math.round(usage)}% · المصروف ${money(spent)} ${currency} من أصل ${money(budgetAmount)} ${currency}.`,
        source_tool: row.name,
        source_fact: text(budget.id) || name,
        rule_id: "budget_near_limit_v1",
      }));
    }
  }

  return results;
}

function goalInsights(row: AgentInsightToolOutput, nowMs: number): AgentInsight[] {
  const root = object(row.output);
  const goals = array(root.items ?? root.active_goals);
  const today = todayUtc(nowMs);
  const results: AgentInsight[] = [];

  for (const goal of goals) {
    const target = num(goal.target_amount) ?? 0;
    const current = num(goal.current_amount) ?? 0;
    const remaining = Math.max(0, target - current);
    const targetDate = isoDate(goal.target_date);
    if (!targetDate || target <= 0 || remaining <= 0) continue;
    const currency = currencyOf(goal);
    const name = text(goal.name) || "هدف مالي";

    if (targetDate < today) {
      results.push(insight({
        severity: "warning",
        category: "goal",
        priority: 78,
        title: `موعد هدف «${name}» مضى`,
        body: `المتبقي ${money(remaining)} ${currency} للوصول إلى الهدف المسجل ${money(target)} ${currency}.`,
        source_tool: row.name,
        source_fact: text(goal.id) || name,
        rule_id: "goal_past_due_v1",
      }));
      continue;
    }

    const days = daysBetween(today, targetDate);
    if (days <= 30) {
      results.push(insight({
        severity: "info",
        category: "goal",
        priority: 50,
        title: `هدف «${name}» موعده قريب`,
        body: `باقي ${days} يومًا، والمتبقي ${money(remaining)} ${currency} للوصول إلى الهدف.`,
        source_tool: row.name,
        source_fact: text(goal.id) || name,
        rule_id: "goal_due_soon_v1",
      }));
    }
  }

  return results;
}

function businessDashboardInsights(row: AgentInsightToolOutput): AgentInsight[] {
  const root = object(row.output);
  const results: AgentInsight[] = [];
  const overdueCount = num(root.overdue_count) ?? 0;

  if (overdueCount > 0) {
    results.push(insight({
      severity: "warning",
      category: "business",
      priority: 85,
      title: "توجد مستندات تجارية متأخرة",
      body: `يوجد ${overdueCount} مستندًا مرحلًا تجاوز تاريخ استحقاقه وما زال غير مسدد بالكامل.`,
      source_tool: row.name,
      source_fact: "overdue_count",
      rule_id: "business_overdue_documents_v1",
    }));
  }

  const appendOutstanding = (key: "receivables_by_currency" | "payables_by_currency", title: string, ruleId: string) => {
    const rows = array(root[key]).filter((item) => (num(item.outstanding) ?? 0) > 0);
    if (!rows.length) return;
    const parts = rows.map((item) => `${money(num(item.outstanding) ?? 0)} ${currencyOf(item)}`);
    results.push(insight({
      severity: "info",
      category: "business",
      priority: 45,
      title,
      body: `القيم المفتوحة: ${parts.join(" · ")}. كل عملة معروضة بصورة مستقلة.`,
      source_tool: row.name,
      source_fact: key,
      rule_id: ruleId,
    }));
  };

  appendOutstanding("receivables_by_currency", "للنشاط ذمم مدينة مفتوحة", "business_receivables_open_v1");
  appendOutstanding("payables_by_currency", "على النشاط ذمم دائنة مفتوحة", "business_payables_open_v1");

  return results;
}

function replicaInsights(row: AgentInsightToolOutput, nowMs: number): AgentInsight[] {
  const root = object(row.output);
  const context = object(root.context);
  const ctx = Object.keys(context).length ? context : root;
  if (ctx.available !== true) return [];

  const completedAt = dateMs(ctx.completed_at);
  if (!completedAt) return [];
  const ageHours = Math.max(0, (nowMs - completedAt) / 3_600_000);

  if (ageHours >= 24) {
    return [insight({
      severity: "warning",
      category: "sync",
      priority: 92,
      title: "آخر نسخة مكتملة من إبداع قديمة",
      body: `آخر نسخة مكتملة مضى عليها نحو ${Math.floor(ageHours)} ساعة. يمكن متابعة القراءة منها، لكن راجع حالة Bridge والمزامنة قبل الاعتماد على أحدث حركة.`,
      source_tool: row.name,
      source_fact: text(ctx.snapshot_public_id) || text(ctx.completed_at) || "replica",
      rule_id: "erp_replica_stale_24h_v1",
    })];
  }

  if (ageHours >= 12) {
    return [insight({
      severity: "info",
      category: "sync",
      priority: 58,
      title: "مرّ وقت على آخر نسخة مكتملة من إبداع",
      body: `آخر نسخة مكتملة مضى عليها نحو ${Math.floor(ageHours)} ساعة. القراءة الحالية صحيحة لتلك النسخة، وقد لا تشمل أحدث تغييرات المصدر.`,
      source_tool: row.name,
      source_fact: text(ctx.snapshot_public_id) || text(ctx.completed_at) || "replica",
      rule_id: "erp_replica_stale_12h_v1",
    })];
  }

  return [];
}

export function buildAgentInsights(
  toolOutputs: AgentInsightToolOutput[],
  nowMs = Date.now(),
): AgentInsight[] {
  const insights: AgentInsight[] = [];

  for (const row of toolOutputs) {
    if (row.name === "finance_get_obligations") insights.push(...obligationInsights(row, nowMs));
    else if (row.name === "finance_get_budgets") insights.push(...budgetInsights(row));
    else if (row.name === "finance_get_goals") insights.push(...goalInsights(row, nowMs));
    else if (row.name === "business_get_dashboard") insights.push(...businessDashboardInsights(row));
    else if (row.name === "erp_get_replica_status") insights.push(...replicaInsights(row, nowMs));
  }

  const seen = new Set<string>();
  return insights
    .sort((a,b) => b.priority - a.priority || a.title.localeCompare(b.title, "ar"))
    .filter((item) => {
      const key = `${item.rule_id}:${item.source_fact}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

export function mergeAgentAttention(
  presentationAttention: Record<string, unknown>[],
  deterministicInsights: AgentInsight[],
) {
  const seen = new Set<string>();
  const merged = [...deterministicInsights, ...presentationAttention].filter((item) => {
    const title = text(item.title);
    const body = text(item.body);
    const key = `${title}::${body}`;
    if (!title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return merged.slice(0, 8);
}
