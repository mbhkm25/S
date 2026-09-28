# SANAD — Specialized Agents & Contextual Intelligence Architecture v1

**Decision date:** 2026-09-26  
**Stage:** Stage 2C.5 (specialist catalog + contextual Smart Composer prototype).  
**State:** implementation candidate, separate branch; no unapproved model fan-out or autonomous financial execution.  
**Related:** `SANAD_EXECUTION_PROGRAM_V4_2026-09-25.md`, `SANAD_PROJECTS_SMART_COMPOSER_V1_2026-09-25.md`, `STAGE2C_PROJECTS_COMPOSER_EXECUTION_CHECKLIST_2026-09-25.md`.  
**Canonical principle:** One conversation-facing SANAD, several **internal** specialist capabilities, one authorized source and one authoritative action/draft lifecycle.

## 1. Actual reused baseline, not a new assistant engine

As of this candidate, the deployed/repository agent already has:
- `src/features/assistant/agentFoundation.ts`: scope-tagged `SANAD_ASSISTANT_TOOLS` and strict read-only/draft-only/approval-required risk bands.
- `supabase/functions/_shared/sanad-agent-core.ts`: one model/tool orchestration contract and bounded tool rounds and calls.
- `supabase/functions/_shared/sanad-agent-insights.ts`: deterministic, source-bound rules for personal obligations, budgets, goals, commercial dashboard and ERP copy age. **Important limitation:** it only inspects tool outputs already gathered by the active turn, so a customer statement alone does not prove anything about the broader customer portfolio.
- `SanadAgentResponseBlocks.tsx`: one structured result renderer for Snapshot/Record/Report/Draft/Approval/Execution Result/Warning; permission-checked ERP source inspectors from Stage 2C.4.
- Existing personal-transaction and SANAD-commercial-document **drafts** are built by authorized server tools with separate review UI. A commercial document draft is NOT an Edaa posting.

Do not create one separately deployed model for every thread or put a parallel agent directly in the browser. A specialist is initially a policy-and-tool bundle whose runtime may share the current model; an extra model invocation must demonstrate material evidence-quality benefit over deterministic source rules, given latency and cost.

## 2. Single answer orchestrator with scoped specialist catalog

```text
authenticated actor + server-resolved Project/Thread/Request Context
   → one SANAD intent/context router (no model authorization)
   → task-specific specialist plan (bounded by server-approved tools)
       personal_finance    → finance_get_* (personal owner)
       business_health     → business_get_dashboard + optional ERP replica status
       erp_customers       → erp_search_customers → resolved ID → customer statement
       erp_documents       → ERP source sales/purchases (read only)
       business_payments   → dedicated payment inbox permission, not generic membership
       business_drafts     → current SANAD commercial draft handlers only
   → authorized tool reads; source/freshness + account/currency identity retained
   → deterministic, evidence-checked insight rules on available results
   → SINGLE response composer: asked-for answer + <=2 relevant attention findings
     + optional next supported read-only step; full detail expands on demand
   → existing structured renderer or owner-approved draft review
```

**Privacy/isolation:** Project or thread hints are NOT capability tokens. Neither a browser catalog entry nor a specialist's confidence can override server permission checks. Personal finance is not delegated to a business team. ERP Bridge remains READ-ONLY. Business payment inbox must use its dedicated permission check. Historical legacy/unclassified threads receive no financial actions until explicit verified scope resolution.

**No unrequested surveillance:** A user requesting one account statement receives the statement; supplementary cross-customer conclusions require an additional independent permissioned read and should be opt-in or clearly justified by requested contextual review. Never describe another customer's identity or balance without a documented scope, provenance and an authorized query.

## 3. Evidence and insight contract

Every attention item must include `rule_id`, `source_tool`, stable source/entity reference, source timestamp/snapshot when available, affected project and currency; preserve explicit unknown/unavailable values rather than replacing with zero. Classify an item as:
1. **Source fact:** value exactly available from an authorized live/snapshot tool, with freshness and currency.
2. **Derived observation:** deterministic, transparent rule using independently retrieved values with the same source account, business and period; e.g. aged replica or outstanding obligations. Missing confidence/source data suppress the claim.
3. **Optional next step:** user-triggered permissioned read, or safe guided draft. The system must never present an unexecuted search as completed analysis.

Existing `sanad-agent-insights.ts` is reused, not duplicated. Add source-graph/planning only after the server supplies per-specialist authorization, per-entity source references and source timestamp in a versioned contract. Strong baseline: **zero ungrounded financial observations**, fewer than three unsolicited insight items, separate currencies, no stale-copy “fully reconciled” assertion and no invented related customers.

## 4. 2C.5 implementation slices and non-goals

| Slice | Deliverable | Explicit boundary |
| --- | --- | --- |
| 2C.5-A (this PR) | typed **presentation** catalog derived from existing tool names/risk/scope; mapping to internal specialist IDs | NOT an executable registry, authority or separate new model |
| 2C.5-B (this PR) | one searchable RTL launcher embedded within the **existing** text/voice/attachment composer | keep one timeline scroll owner, no global duplicate + |
| 2C.5-C (this PR) | safe small read-only personal/business/customer lookup/date prompt-preparation form; user reviews resulting text before sending | customer text is not canonical identity; existing backend resolves or asks clarification |
| 2C.5-D (this PR) | existing personal/commercial draft entry **via current conversation tool** only; explanatory notice of missing two-way draft/form editing | no second client draft; do not promise same ID/revision until 2D |
| 2C.V | synthetic scope/cross-business tests, denied-access sessions, desktop/mobile safe areas and owner preview on exact SHA | Android build != signed production native updater |

## 5. Later server enhancement, deliberately not slipped into frontend work

A bounded **context planner** behind the current JWT-protected agent may, for explicit contextual requests, select a small set of independently authorized related-source tools by specialist policy. It should:
- enforce max fan-out/time budget and tool risk, distinguish default concise answer from explicit “حلّل/ما الذي يستحق الانتباه”;
- run existing deterministic insights, deduplicate findings across specialists by `rule_id + business/project + account + currency + source snapshot`;
- separate retrieved fact from rule-derived observation and suggested further query;
- use the shared response renderer and existing `source_refs` rather than injecting free-form claimed facts; audit latency, tool count, user-expanded insights and source disputes.

Do not load other customers' private records simply because an entity appeared in an unrelated discussion. Do not convert source recency to proof of full account reconciliation. Do not fire approval/execution autonomously. Full canonical action/form revision sync remains Stage 2D, and durable cross-project alerts/Today delivery remain 2E.

## 6. Acceptance and failure matrix

- Personal thread displays only personal catalog; business thread only scoped business catalog; legacy/null/unverified displays nothing. Server rechecks for every actual tool call.
- Same typed launcher action uses the existing chat request path; no hidden financial submission or shadow draft.
- Customer lookup with ambiguous Arabic name requests identification, never silently picks an account. Dates invalid or reversed are rejected before prompt preparation.
- Assistant's structured report remains the primary content, not a repeated free-form report; insights must be source-backed and the default must not overwhelm the answer.
- Test keyboard arrows/Enter/Escape, mouse outside close, touch min-44px, Arabic/English numbers, long query, viewport zoom 125/150, 360–430 px mobile and keyboard-open state.
- Switching projects or read-only conversation must clear/hide the previous launcher; pending text remains user-reviewable and does not auto-execute. Existing voice/mic/attachment/send unchanged.
- Unsupported business ERP posting must remain absent; if user asks, explain supported SANAD draft-only capability and required later authorization.

**Deployment:** developer quality gates → independent local preview → owner acceptance → merge and separate Web rollout. This PR requires no new DB, Edge function deployment or shop workstation access. Upgrade of the on-demand Bridge binary is a separate, explicitly deferred store-PC operational task.
