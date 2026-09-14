# SANAD NEXT — Architecture Assessment (September 2026)

Status: implementation baseline for `feat/sanad-next-foundation`.

## 1. Product boundary

SANAD NEXT does not turn SANAD into a full ERP. The accounting system remains an accounting source of truth; SANAD adds remote access, business operations, customer relationships, payment context, tasks, documents, reports and intelligence.

The initial ERP direction is read-only:

`ERP -> Bridge -> Ingestion -> Raw Evidence -> Normalization -> SANAD Business Read Models`

No Phase-1 path may write back to the ERP.

## 2. Current SANAD architecture — observed state

### Business aggregate root

The current database does **not** contain a physical `business_workspaces` table. The operational workspace shown to users is assembled by `get_my_business_workspaces()` from existing business tables and payment-inbox state.

Therefore the canonical business aggregate root for SANAD NEXT is:

- `business_profiles.id` — business identity / aggregate root.
- `business_team_members` — team membership, role and permissions.
- `business_customers` — existing relationship for customers who are SANAD users.
- `business_payment_inbox` — production-critical operational payment queue.
- `business_operation_links` — current operation-to-business linkage.
- `operations` — current SANAD financial/payment evidence domain.

The term **Business Workspace** remains a product/API concept, not a new duplicated identity table.

### Existing production paths to protect

The following are classified `ISOLATE / DO NOT TOUCH` for the first SANAD NEXT slice except through explicit contracts:

- payment intake and `operations` pipeline;
- payment verification and public token flows;
- `business_payment_inbox` claim/review/complete semantics;
- existing user authentication;
- current team membership and permission model;
- existing notifications and push delivery;
- current production deployment flow.

## 3. Architecture choice

Decision: **Hybrid Modular Monolith**.

### Inside the current SANAD application

Keep as modules in the existing React/Supabase product:

- Business management UI;
- Party / relationship experience;
- activity timeline;
- balances and invoice read models;
- business inbox and attention items;
- tasks, documents and reports;
- payment matching;
- customer self-service;
- authorized AI tools.

### Separate boundary

Keep these behind explicit contracts:

- Windows ERP Bridge;
- ERP-specific adapters;
- device authentication;
- raw-event ingestion;
- normalization/reconciliation workers.

This avoids premature microservices while preventing legacy ERP details from leaking into the SANAD UI/domain.

## 4. Current component classification

| Area | Classification | Decision |
| --- | --- | --- |
| Auth / profiles | KEEP | Reuse current SANAD identity. |
| `business_profiles` | EXTEND | Canonical business root for SANAD NEXT. |
| `business_team_members` | EXTEND | Reuse current role/permission boundary. |
| `business_customers` | KEEP | Keep for SANAD-user relationships; do not force imported ERP customers into it. |
| Party/relationship domain | ADD | Represents ERP/manual parties independently of SANAD account existence. |
| `operations` | ISOLATE | Keep current payment/evidence semantics. Do not use as generic ERP-event storage. |
| `business_payment_inbox` | ISOLATE + EXTEND LATER | Preserve workflow; integrate later through matching/contracts. |
| Business Manage UI | EXTEND | Add role-aware business intelligence modules incrementally. |
| ERP Integration | ADD | Locations, connections, source instances, devices, raw evidence. |
| Accounting read model | ADD | Canonical SANAD projections, independent from Edaa table names. |
| Timeline | ADD | Unifies ERP/payment/manual/system business events without merging source truths. |
| AI | ADD LATER | Domain tools calculate; AI interprets only. |
| Full GL / ERP write-back | DEFER | Explicitly outside initial phase. |

## 5. Identity model

Do not introduce a second `merchant` identity parallel to SANAD business identity.

Target hierarchy:

`business_profiles.id -> business_location -> accounting_connection -> erp_source_instance -> bridge_device`

Source entity identity is always scoped by source instance:

`source_instance_id + entity_type + source_record_id + revision`

A source record ID alone is never globally unique.

## 6. Party / relationship model

Imported ERP customers cannot be modeled only through `business_customers`, because the current table represents users who already have SANAD identities.

SANAD NEXT adds:

- `business_parties` — person/organization in the business domain;
- `business_party_roles` — customer/supplier/contact/other;
- `business_party_source_refs` — stable ERP-source mapping;
- optional `sanad_user_id` — link to a SANAD identity when one exists.

Rules:

- do not infer party identity from Edaa `AccountID` alone;
- do not auto-merge by display name alone;
- one party may have multiple roles;
- SANAD identity linking is optional and can happen later.

## 7. ERP ingestion foundation implemented on development

Migrations:

- `20260914094632_sanad_next_erp_integration_foundation_v1.sql`
- `20260914094703_sanad_next_party_relationship_foundation_v1.sql`
- `20260914094730_sanad_next_activity_timeline_foundation_v1.sql`

Primary new objects:

- `business_locations`
- `business_accounting_connections`
- `business_erp_source_instances`
- `business_bridge_devices`
- `business_bridge_device_credentials`
- `business_erp_raw_events`
- `business_parties`
- `business_party_roles`
- `business_party_source_refs`
- `business_activity_events`

Raw ERP payloads are deliberately separate from canonical activity/read-model records.

## 8. Security boundary

- Bridge credentials are per device, not shared merchant passwords.
- Plaintext device secrets are never stored in PostgreSQL.
- `business_bridge_device_credentials` and `business_erp_raw_events` deny authenticated direct access.
- ERP ingestion/normalization RPCs are callable only by `service_role`.
- Business timeline reads require an authenticated business owner or active team member.
- Existing payment permissions remain separate from ERP-ingestion permissions.
- No ERP/SQL/Windows passwords belong in cloud logs or SANAD data.

## 9. First vertical slice

The first production-worthy slice is intentionally narrow:

1. Edaa read-only Bridge captures one complete sale transaction bundle.
2. Bridge emits `EventEnvelope v1` with stable event identity and revision.
3. `sanad-erp-ingest-v1` authenticates the device and stores raw evidence idempotently.
4. Edaa normalizer resolves the source customer to a SANAD Party without guessing from `AccountID` alone.
5. Normalizer creates a canonical business activity event.
6. Business manager can read that event in the SANAD activity timeline.
7. Re-sending the same event does not duplicate logical data.
8. A later source revision produces a new raw observation and an updated/reconciled canonical state rather than deleting history.

After this is proven:

`balance -> outstanding invoices -> payment matching -> collection follow-up -> customer self-service`.

## 10. Deliberately not implemented yet

The Edaa-specific normalizer is not implemented in this foundation because the current reference documents describe the semantic bundle but do not contain the exact JSON fixture emitted by the prototype. Field names must be mapped from a real/anonymized bundle instead of invented.

Also deferred:

- ERP write-back;
- full accounting ledger inside SANAD;
- large inventory domain;
- purchasing platform;
- marketplace;
- broad AI agent autonomy;
- automatic party merging by weak identity signals.

## 11. Definition of done for the first slice

The slice is not complete until all of the following are proven on development/staging:

- known Edaa sale captured read-only;
- no database writes to Edaa;
- raw event preserved;
- repeated send is idempotent;
- offline queue can resume safely;
- party mapping is traceable;
- activity event is visible only to an authorized business member;
- source provenance can be traced back to source instance/entity/record/revision;
- schema/RLS/security checks pass;
- rollback does not affect Edaa;
- production SANAD payment flows remain unchanged.
