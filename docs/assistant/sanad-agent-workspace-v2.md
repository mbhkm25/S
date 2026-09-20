# SANAD Agent Workspace v2

Status: **Release candidate** — 2026-09-20

## Goal

Move the in-app SANAD Agent from one browser-local conversation into a durable authenticated workspace with:

- cloud conversation history;
- long-lived memory for stable user context;
- conversation sidebar and settings;
- structured response cards;
- copy-ready financial data;
- trusted clickable ERP customers and documents;
- deterministic proactive attention points.

## Truth boundary

Memory is **never** accounting truth.

The Agent may remember:

- explicit user preferences;
- stable aliases;
- working context;
- communication preferences;
- explicit notes the user asked it to remember.

Balances, invoices, ERP document status, transaction totals, obligations and other changing financial facts must be re-read from live SANAD/ERP tools for every answer that depends on them.

## Persistence model

### `sanad_agent_threads`

One authenticated in-app conversation. Stores:

- user;
- optional selected business;
- title;
- active/archive state;
- rolling summary;
- last-message timestamp;
- message count.

### `sanad_agent_messages`

Durable user and assistant turns including:

- plain answer text;
- structured response contract;
- tool trace;
- model/thinking metadata;
- request id.

### `sanad_agent_memories`

Cross-thread stable memory. Supported categories:

- preference;
- entity_alias;
- working_context;
- communication_style;
- explicit_note.

### `sanad_agent_preferences`

User-controlled toggles:

- conversation history;
- long-term memory;
- proactive insights;
- structured response cards.

All tables use RLS. Browser code never receives `service_role`.

## Context strategy

The runtime uses:

1. rolling thread summary for older context;
2. latest 24 full conversation turns;
3. up to 30 active stable memories;
4. currently selected business;
5. current user request.

This bounds token cost while retaining long-running context.

Long-thread summaries explicitly exclude balances, invoice values and similar changing financial facts as durable truth.

## Trusted presentation layer

Structured UI is built from tool outputs, not model prose.

`sanad-agent-presentation.ts` produces:

- `cards`;
- `entities`;
- `attention`;
- `copy_text`.

### Customer statement

A customer-statement result can produce:

- customer name;
- source account id/number;
- period;
- per-currency opening/debit/credit/closing balances;
- movement count;
- copy-ready statement summary;
- clickable ERP customer entity.

### Documents

Sales/purchase tool output can produce clickable document entities with:

- source document id/number;
- party;
- date;
- currency;
- source line total.

### Replica status

Replica output can produce:

- latest completed snapshot availability;
- table/row counts;
- completion time;
- current newer sync if one exists.

## Proactive attention

Attention points are deterministic and only emitted when supported by tool data.

Examples:

- multi-currency account: warn that currencies remain separate;
- no statement movement in selected period;
- a newer replica sync is in progress while the last completed snapshot remains readable;
- ERP documents marked deleted or locked in the source.

The model may explain a verified attention point but may not invent operational or financial risk labels.

## Clickable entities

ERP customer links open the existing customer statement surface directly.

ERP document links open the existing sale/purchase document detail directly.

The destination screens accept deep-link parameters and load the requested source record, instead of merely opening a generic accounting page.

## UI

Desktop:

- persistent sidebar;
- conversation list;
- memory manager;
- assistant settings.

Mobile:

- drawer containing the same controls.

Assistant responses retain:

- answer text;
- structured cards;
- trusted entity links;
- proactive attention;
- tool trace and source inspection.

## Safety

- financial and ERP Agent remains read-only;
- no raw ERP rows are sent to the model;
- no currencies are silently combined;
- no client-side service key;
- service-only persistence RPCs are revoked from authenticated clients;
- explicit user memory is context, not current financial truth.

## Production migration

`20260920071058_sanad_agent_workspace_v2.sql`

The migration was applied to Production and verified under an actual authenticated business owner identity inside a rolled-back transaction before release.
