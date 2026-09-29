# SANAD — Business-First Revenue Gate & Product Recalibration
**Date:** 2026-09-29  
**Status:** OWNER-REQUESTED STRATEGIC REBASELINE — PROPOSED DOCS-ONLY; requires owner review/merge.  
**Implementation:** No runtime, database, ERP Bridge, permissions, deployment, or pricing change authorized by this document.  
**Relationship to existing plans:** Supplements the owner-approved v4 execution program and the 2026-09-28 business relationship context. It **changes delivery priority and commercial acceptance criteria**, not the technical invariants or historical stage status. Actual main/Production/PR status must be refreshed at execution.

## 1. Product thesis and target customer

**SANAD is a business-first, relationship-aware, conversation-centric intelligence and operating layer above a business's existing systems.** Its first paying user to test is the owner/decision-maker of a small business with an existing accounting workflow. Team and authorized customer relationships are central to the long-term product. The Personal Manager remains an optional, secondary capability, not the driver of the first commercial launch.

Conversation is the primary entry point, not the only interface. Readable statements, financial tables, permissions, audit trails, and approvals still need typed work surfaces. SANAD is **not** a replacement ERP, uncontrolled ledger, bank, payment wallet, or generic chatbot.

**Near-term customer job:** “From the accounting data I already have, let me ask authorized questions about sales, receivables, outstanding customer balances and business activity; show reliable source/freshness and make next actions understandable.”

**Initial beachhead hypothesis, not a verified market claim:** independent merchants who already use Edaa Soft and share the integration's read-only constraints. No claims of multi-ERP support until independently verified. Owners/managers are buyers to test; staff and customers receive only their actual role-bound permissions.

## 2. Commercial survival changes the decision rule

Before adding features, answer:
1. Which named customer and urgent business problem does it serve?
2. Does an existing verified SANAD capability already solve this problem?
3. What is the smallest secure demonstration that produces a concrete observable result?
4. What will we charge and what are the actual marginal API/cloud/support/onboarding costs?
5. What is the measurable result by a pre-defined checkpoint?

**Order of priority for the next sprint:**
1. Preserve stability, security, accounting integrity, customer isolation and existing user-accepted flows.
2. Audit **current** main/Production and reusable capabilities: read-only Bridge health, financial source fidelity, scoped business questions, customer statements, real reports, project conversation and relevant role checks.
3. Choose and validate **one sellable read-only workflow** without waiting for stages 2D–2I.
4. Build only demonstrated critical missing parts for an owner-facing demo and onboarding.
5. Resume platform expansion based on customer evidence and affordability.

Business-first is not permission to unlock customer-wide ERP data for users with only a customer relationship, mix personal and business memory, guess ERP AccountID binding, or let LLM responses become financial postings.

## 3. Two parallel tracks with a hard capacity ceiling

### Track A — Revenue experiment (immediate)
Offer a narrowly-scoped **authorized financial visibility / business intelligence pilot** on existing Edaa read-only integration, only after current source/role/accuracy smoke. First scope candidate: natural-language questions and trustworthy drill-down for sales, receivables and customer balances, with source/provenance/freshness visible. If existing runtime cannot meet safe quality, downgrade to a **manual or semi-automated reporting service** using legally obtained customer-exported data and explicit customer consent; do not conceal limitations.

Candidate offers to validate with customers:
- A one-time setup/analysis service (price based on actual work and market interviews).
- Optional recurring reporting/monitoring subscription after repeat value is demonstrated.
The previously discussed USD 15–30/month is a **test hypothesis**, not an approved price, profitability finding, or revenue forecast.

### Track B — Core SANAD
Maintain the existing v4 project/conversation and business relationship architecture, but limit work to defects, shared components reused by Track A and non-deferrable trust/security requirements until the first commercial gate. No speculative consumer/personal expansion, marketplace, write-back ERP adapter, broad multi-ERP claims, or cosmetic release train without an explicit revenue or critical-risk rationale.

**Resource discipline:** The founder needs near-term income. Do not make household livelihood dependent on SANAD forecast revenues; review a separate authorized service-income path in parallel. No guaranteed 14-day income claim.

## 4. 14-day hypothesis-validation sprint (relative to actual start date)

| Gate | Window | Evidence/exit requirement |
|---|---|---|
| G0 — Live truth | Days 1–2 | Read latest main, open PRs and Production; inventory working and missing contracts; measure actual monthly spend; zero customer data without authorization. |
| G1 — Offer | Days 3–4 | One-page offer, short live demo using owned or consented data, onboarding steps, documented source/permission limitations, provisional pricing hypothesis. |
| G2 — Discovery | Days 5–7 | Approach ~10 relevant merchants; record contacts, pain points, existing systems and explicit willingness to pilot. 10 is an activity target, not evidence of demand. |
| G3 — Pilot | Days 8–10 | Start a small consented pilot only if G0 safety/data-quality gate passed; log actual task completion, errors, onboarding time, costs and support effort. |
| G4 — Payment decision | Days 11–14 | Ask for actual payment/commitment; record number approached, qualified, activated and paid; decide CONTINUE / ADJUST / PAUSE from evidence. |

These windows are **execution targets**, not a commitment to collect payment or a reason to weaken compliance. If cash flow is more urgent than pilot maturity, sell consented reporting/technical services first, not unproven software promises.

## 5. Metrics and stop/go rules

Keep a single dated scorecard:
- Cash runway: available development budget, fixed cloud/API bills, variable cost per active business, separate essential living budget (private, **never committed to Git**).
- Funnel: contacts → qualified discovery → consented demo → pilot activated → paying customers → retained customers.
- Value: time to first useful and sourced insight; repeat use; pilot owner's willingness to pay.
- Reliability: financial answer reconciliation and exact source amounts/currency, source freshness, authorization failures, severe defects, onboarding/support hours.
- Unit economics: realized recurring revenue and setup fees **separated** from COGS, human service hours and projected revenue.
- Decision gate: do not expand engineering scope solely for sign-ups or positive verbal feedback; prioritize paid commitment and repeat usage. A critical security or accounting-integrity failure blocks release regardless of sales.

## 6. Engineering/knowledge constraints that do not change

- Existing Edaa SANAD Bridge remains **read-only**.
- ERP observations preserve exact source/provenance and freshness; #384-style decimal/historical-cost gaps require validation before relevant commercial financial claims.
- Relationships and tenant permissions are checked server-side on every read and action. Customers do not inherit staff-wide reports. No identity-by-name/phone shortcut for customer↔ERP account binding.
- Keep separate personal/business truth; no silent financial writes, unreviewed transactions, unsupported product claims, or weakening audit/approvals.
- **REUSE → ADAPT → REFACTOR → BUILD → DEFER** inventory before new work. Preserve accepted workflows and avoid colliding with active implementation branches.
- Documentation-only proposal does not grant merge, release or production approval. Branches/PRs follow current execution chat's owner acceptance workflow.

## 7. Immediate handoff for execution chat

1. Read this rebaseline alongside current v4 roadmap, capability repositioning, the 2026-09-28 business relationship addendum and the consolidated knowledge delta.
2. Check exact latest main, open PRs/branches and deployed state; avoid assuming stale stage status.
3. Produce a **revenue-readiness capability audit** (REUSE / ADAPT / REFACTOR / BUILD / DEFER), including evidence and permission boundaries, without interrupting active accepted development.
4. Recommend only **one** sellable safe pilot slice and an explicit acceptance checklist, cost sheet, offer draft and first 10-customer outreach plan.
5. Before code changes, present the minimal package, exact files/contracts affected, risk, local preview, tests, release/rollback plan and owner approval checkpoint.
6. Keep current implementation efforts isolated from this docs-only PR. After owner acceptance, merge/reconcile document precedence; do not overwrite canonical owner Library SANAD.md automatically. Append a dated candidate to docs/implementation/SANAD_KNOWLEDGE_DELTA_WORKING.md for the next approved batch.

## 8. Precedence and reality labels

This document is the commercial **priority overlay** if merged. V4 remains the architectural/stage plan; the 2026-09-28 relationship document remains the role/identity evidence for its package. Existing source code, current main and live Production remain implementation truth. Labels: OWNER_REQUESTED_DIRECTION, PROPOSED_PLAN, VERIFIED_RUNTIME and COMMERCIAL_HYPOTHESIS must never be conflated.
