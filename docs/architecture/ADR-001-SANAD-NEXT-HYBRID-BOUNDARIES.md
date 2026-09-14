# ADR-001 — SANAD NEXT hybrid boundaries

- Status: Accepted for development
- Date: 2026-09-14
- Scope: SANAD NEXT / IBEX capability integration

## Context

SANAD already owns user identity, business profiles, teams, customer links, payments, notifications and production workflows. Edaa Soft is a legacy ERP/accounting source that can be read safely through an external bridge, but its source schema and desktop runtime must not become SANAD's domain model.

A separate IBEX application would duplicate SANAD identity/business/team/customer foundations. Directly embedding Edaa table semantics into the SANAD frontend would couple the product to one ERP. A broad microservice decomposition would add operational cost before the first commercial slice is proven.

## Decision

Adopt a **Hybrid Modular Monolith**:

1. SANAD remains one product and one user-facing application.
2. `business_profiles.id` is the canonical business aggregate root.
3. Business intelligence/relationship capabilities live as explicit modules within SANAD.
4. ERP Bridge, adapter semantics and cloud ingestion stay behind versioned contracts.
5. Raw source evidence is stored separately from canonical SANAD read models.
6. Existing payment `operations` and `business_payment_inbox` remain separate source domains; cross-domain links are explicit rather than achieved by reusing one table for everything.
7. Phase 1 ERP integration is read-only.

## Consequences

### Positive

- preserves current SANAD production workflows;
- avoids duplicate merchant/user/team identity;
- allows Edaa to be the first adapter rather than a permanent platform dependency;
- keeps provenance and reconciliation possible;
- permits incremental release through isolated modules;
- avoids premature microservice infrastructure.

### Costs

- requires canonical contracts and normalization instead of direct table mirroring;
- requires explicit party resolution because ERP customers may not be SANAD users;
- requires reconciliation and source-version management;
- Bridge deployment has a separate lifecycle from the web/mobile application.

## Rejected alternatives

### Separate IBEX SaaS

Rejected for the current stage because it duplicates identity, business, team and customer foundations already present in SANAD.

### Direct Edaa schema mirror in Supabase

Rejected. Tables such as `tblSellInvoiceCloud` would leak one ERP's source schema into the cloud domain and block future adapters.

### Full microservices architecture

Rejected for the initial stage. Service boundaries are preserved logically and at the Bridge/ingestion edge, but the SANAD cloud/domain remains simple until workload or organizational constraints justify further separation.

### ERP write-back in Phase 1

Rejected due to accounting/inventory integrity risk. Any future write-back requires an explicit later ADR, test database, repeatable transactional tests, reconciliation, rollback and approval controls.

## Invariants

- never write to Edaa in Phase 1;
- never upload ERP passwords or unrelated secrets;
- never identify a party solely from Edaa `AccountID`;
- never rely on `tblHistory` or MaxID alone as complete CDC;
- never discard raw source observations;
- never destructively normalize currencies;
- never use source record ID without source-instance scope;
- never merge ERP events into SANAD payment `operations` merely for convenience.
