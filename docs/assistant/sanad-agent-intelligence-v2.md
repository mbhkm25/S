# SANAD Agent Intelligence v2

## Purpose

Stage 5 adds a deterministic Insight Engine to SANAD Agent. It does not add write actions.

The model remains responsible for language, explanation and tool selection. Operational attention signals are computed from trusted tool outputs by explicit rules.

## Truth boundary

An insight may only be produced from a completed read tool result.

The engine does not:
- infer an overdue state without a due date
- call a non-zero balance a problem by itself
- merge currencies
- convert currencies
- infer ERP freshness from memory
- create, post, settle or mutate a financial record

## Rules v2

### Personal obligations
- overdue: due_date is before today and outstanding_amount > 0
- due soon: due_date is within the next 7 days and outstanding_amount > 0
- grouped by obligation type and currency

### Budgets
- warning when the read model marks the budget over limit or spent > budget
- information when usage is at least 80% but not over limit

### Goals
- warning when target date has passed and the goal still has a remaining amount
- information when target date is within 30 days and a remaining amount exists

### Business dashboard
- warning when posted commercial documents have exceeded due date and remain unsettled
- open receivables/payables are informational facts, displayed separately by currency

### ERP replica
- information when the latest completed replica is at least 12 hours old
- warning when it is at least 24 hours old
- the latest completed replica remains the readable baseline; freshness messaging does not rewrite source facts

## Routing hints

Broad personal review requests route toward:
- finance_get_overview
- finance_get_budgets

Broad business attention reviews route toward:
- business_get_dashboard

ERP freshness questions route toward:
- erp_get_replica_status

Specific budget, obligation, goal, statement and document intents receive deterministic tool-routing hints.

## Presentation

Deterministic signals are returned through the existing response attention contract with:
- severity
- category
- priority
- rule_id
- source_tool
- source_label
- source_fact

The UI marks these as “إشارة محسوبة” and displays the human-readable source.

## Safety

Insight Engine v2 is read-only. It cannot:
- create a draft
- approve a draft
- execute a command
- write to Edaa
- mutate posted SANAD records

Those capabilities belong to later action-integration stages.
