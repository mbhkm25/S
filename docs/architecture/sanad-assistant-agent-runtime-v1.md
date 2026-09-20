# SANAD Assistant Agent Runtime v1

Status: implementation foundation approved for build from current `main` after the four-domain stabilization checkpoint.

## Product definition

SANAD Assistant is an **agentic operating surface** for SANAD, not a chatbot and not a reporting widget.

Its job is to:
1. understand the user's actual intent in Arabic and colloquial usage;
2. decide whether the request can be answered directly or requires tools;
3. resolve scope and identity safely;
4. execute bounded, authorized semantic tools;
5. combine evidence across SANAD Personal, Business, ERP Cloud and approved product knowledge;
6. verify the result against financial invariants;
7. return a concise answer plus structured UI artifacts when useful.

The model is an interpreter and planner. SANAD contracts remain the source of truth.

## Why the old WhatsApp assistant is not the web runtime

The existing WhatsApp assistant provides valuable assets:
- tool execution logs;
- evaluation/canary infrastructure;
- product knowledge search;
- release controls;
- cost/usage telemetry;
- operational lessons.

But it is channel-oriented, contact-centric and currently based on older intent-classification and `generateContent` patterns. The authenticated SANAD app requires a separate agent runtime with user/business authorization and financial/ERP semantic tools.

## Model strategy

### Production primary

`gemini-3.8-flash`

Reasons:
- stable production model;
- designed for autonomous agents and complex enterprise workflows;
- supports tunable thinking;
- supports function calling, parallel calls and compositional tool use;
- works with the Interactions API.

### Reasoning policy

- low: greetings, navigation, simple product knowledge;
- medium: default personal/business questions;
- high: multi-source analysis, reconciliation-like reading, ambiguous business reasoning.

The runtime should route **thinking level**, not constantly switch model families.

### Shadow candidate

`gemini-3.1-pro-preview` may be benchmarked in shadow/evals only. It must not become production default until SANAD evals demonstrate a material quality gain with acceptable latency/cost.

## API strategy

Use the Gemini **Interactions API** for the new authenticated web agent.

The runtime will start **stateless toward the external model**:
- SANAD owns the durable transcript and summaries;
- financial conversation history is not dependent on provider-side state;
- provider portability remains possible;
- implicit caching is still available.

A later privacy/product decision may allow `previous_interaction_id` for selected threads.

## Agent loop

```
User message
  -> Auth + scope resolution
  -> Context envelope
  -> Model interaction
  -> zero or more tool calls
  -> Tool authorization + execution + audit
  -> Tool result back to model
  -> answer verifier
  -> structured response
  -> UI stream/render
```

Execution is bounded by:
- maximum tool calls per turn;
- maximum sequential tool rounds;
- bounded result sizes;
- no free SQL;
- no raw ERP source rows;
- no direct mutation tools exposed to the model;
- draft-only action preparation is separated from explicit authenticated UI approval.

## Context layers

### Layer A — system policy
Stable SANAD behavior, financial invariants, read-only policy and response rules.

### Layer B — user/session scope
Authenticated user id, locale, accessible businesses and explicit active business when selected.

### Layer C — short conversation state
Recent turns plus SANAD-owned summary. Do not resend unbounded chat history.

### Layer D — on-demand tools
Fetch only the evidence needed for the current request.

### Layer E — approved knowledge
SANAD product knowledge and operating documentation, separate from private financial data.

## Tool architecture

Canonical registry lives in:
`src/features/assistant/agentFoundation.ts`

Initial read-only tools:
- personal overview;
- transaction search;
- obligations;
- budgets;
- goals;
- personal parties;
- accessible businesses;
- business dashboard;
- ERP replica status;
- ERP customer candidate search;
- ERP customer statement;
- ERP sales/purchases;
- approved SANAD knowledge search.

### Tool rules

1. Every private-data tool authenticates the caller.
2. Business tools re-check business authorization server-side.
3. ERP tools call semantic read contracts only.
4. Customer identity must be resolved before requesting a statement.
5. Tool outputs are bounded.
6. Tool runs are auditable.
7. The model never receives database credentials.
8. The browser never receives service-role credentials.

## Financial answer verifier

Before returning a financial answer, the runtime verifies:

- every amount has an explicit currency;
- currencies were not merged;
- requested/used period is visible;
- source tool exists for every user-specific factual claim;
- ERP customer identity is concrete;
- any prepared action is labeled as review-only until explicit UI approval;
- no raw ERP row/table payload leaked.

If verification fails, the runtime either repairs the answer or asks for clarification.

## Response contract

The model answer is not only text. The final response contract contains:
- user-facing text;
- scope;
- period;
- currencies;
- optional structured cards;
- source refs/tool provenance;
- clarification state.

This enables a world-class UI without scraping markdown to reconstruct business objects.

## UI direction

The assistant workspace should resemble a modern agent console, not a support bot:
- fast streaming text;
- compact tool progress (e.g. “أبحث عن العميل…”, “أقرأ كشف الحساب…”);
- result cards for balances/statements/documents;
- inline follow-up actions such as open statement, PDF, share;
- thread continuity;
- keyboard-first desktop input;
- mobile-first composer;
- no exposure of hidden chain-of-thought.

## Observability

Each turn should eventually record:
- thread/run id;
- authenticated user;
- selected scope/business;
- model + thinking level;
- tool calls and latency;
- token usage and estimated cost;
- final status;
- verifier result;
- user feedback/eval linkage.

Reuse existing SANAD AI cost/eval infrastructure where compatible instead of duplicating it.

## Memory policy

v1:
- durable thread transcript and summary;
- no automatic sensitive long-term memory extraction;
- explicit user preferences may be added later under a separate memory policy.

Financial facts are read from source tools each time and are not “remembered” as truth.

## Mutation policy

ERP/Edaa is read-only.

SANAD-owned actions follow:
`Intent -> resolved entities -> Draft -> Review -> Explicit user approval -> deterministic domain command -> audit`

The model can prepare bounded review drafts only. It has no approval or execution tool. Approval is an authenticated UI action with version checks and an audit trail.

Personal-finance approval may invoke the canonical SANAD personal transaction command. Commercial approval in Action v1 creates only a SANAD commercial Draft; posting and settlement remain outside the Agent.

The model will never post directly to accounting tables or Edaa.

## Implementation packages

### Package 1 — Agent Foundation
- architecture contract;
- model policy;
- tool registry;
- response schema;
- architecture tests.

### Package 2 — Agent Runtime
- authenticated Edge Function;
- Gemini Interactions tool loop;
- tool handlers over existing SANAD RPCs;
- audit/usage integration;
- final-answer verifier;
- non-streaming contract tests first, then SSE streaming.

### Package 3 — Agent Workspace
- real conversation UI;
- streaming;
- tool progress;
- structured result cards;
- thread list/history;
- retry/stop/error states.

### Package 4 — Quality & Intelligence
- Arabic/Yemeni eval suite;
- ambiguity/customer-resolution evals;
- financial correctness evals;
- latency/cost benchmark;
- shadow evaluation of alternate models;
- release gate.

### Package 5 — Action Intelligence
Only after read-only quality is proven:
- daily brief;
- prioritization;
- recommended tasks;
- draft actions;
- explicit approval flow.

## Definition of done for v1

A release is not “done” because the model answers.

It is done when SANAD can reliably pass golden evaluations such as:
- “كم صرفت هذا الشهر؟”
- “من لي عنده فلوس؟”
- “أعطني كشف حساب عبدالله الحبشي.”
- “كم مبيعات المحل هذا الأسبوع؟”
- “اعرض مشتريات أمس.”
- “هل النسخة السحابية محدثة؟”
- “قارن المقبوضات والمدفوعات دون خلط الريال اليمني والسعودي.”
- ambiguous customer names that require clarification rather than guessing.

Correctness, authorization, provenance, latency and UX are all release criteria.
