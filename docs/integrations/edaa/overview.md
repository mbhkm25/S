# Edaa Soft Integration — SANAD NEXT

Status: Phase-1 read-only integration contract.

## Purpose

Edaa Soft is the first ERP adapter for SANAD NEXT. It is not SANAD's cloud domain model and SANAD must not mirror Edaa's legacy tables directly.

Target flow:

`Edaa -> Edaa Adapter -> Change Detection -> Transaction Bundle -> SQLite Durable Outbox -> Device-authenticated HTTPS -> Raw ERP Event -> Normalizer -> SANAD Business Read Models`

## Verified environment and constraints

The reference installation studied for Bahkum Honey is a VB6 Win32 desktop application backed by SQL Server 2000. The active database can be discovered through the Registry value named `DefultDataBase`.

The integration prototypes proved:

- Registry discovery;
- read-only SQL connectivity;
- schema inspection;
- full export;
- incremental insert detection;
- sale transaction bundling;
- durable local outbox concept;
- ACK/idempotency feasibility.

These findings are verified for the studied installation and must not be generalized blindly to every Edaa installation. Every new installation requires discovery, version detection, schema validation and adapter compatibility checks.

## Phase-1 invariants

- Never write to Edaa.
- Never patch or inject the Edaa executable.
- Never upload ERP, SQL, Windows, SMS or user passwords.
- Never identify a customer solely from `AccountID`.
- Never rely on `tblHistory` as a complete CDC feed.
- Never rely on MaxID alone to detect updates.
- Never treat a sale header as the whole commercial transaction.
- Never use a source record ID without source-instance scope.
- Never destructively convert away the original transaction currency.
- Never discard raw source evidence.

## Known quirks

- Registry field spelling is `DefultDataBase`.
- `tblClassEntries.EnterTime` may contain invalid legacy values such as `1899-12-30` and is not authoritative time.
- `tblHistory` did not reliably capture every tested new transaction.
- `AccountID` can be shared while invoice `CustomerName` differs.
- `tblCustomersAccounts` may be empty and cannot be assumed to be the customer-account relationship source.
- SQL Server 2000 compatibility constrains queries and excludes modern CDC/JSON/temporal assumptions.

## Sale transaction integrity

A sale may span:

- `tblSellInvoice` — header;
- `tblSellInvoiceDetailes` — sale lines;
- `tblEntries` + `tblEntriesDetails` — accounting entry;
- `tblClassEntries` + `tblClassEntriesDetails` — inventory entry.

The adapter should emit a complete transaction bundle when the related evidence is available. Missing optional legacy relationships should produce integrity warnings rather than crash or silently discard the source observation.

## Change detection

Production change detection must be layered:

1. ID watermarks for new records where reliable.
2. `tblHistory`, deleted/cancelled flags and trustworthy source fields where useful.
3. Periodic fingerprint/reconciliation scans for updates, corrections and missed changes.

A source correction creates a new source observation/revision. SANAD must not rewrite history as though the previous observation never existed.

## Identity model

SANAD cloud identity hierarchy:

`business_profiles.id -> business_location -> accounting_connection -> erp_source_instance -> bridge_device`

Entity identity:

`source_instance_id + entity_type + source_record_id + revision`

The Bridge installation identity is not the merchant identity.

## Source of truth

For Phase 1:

- Edaa remains accounting truth for official ERP/accounting records.
- SANAD stores raw evidence and derived read models.
- SANAD provides business/customer experience, remote access, timeline, alerts, tasks, documents and later authorized intelligence.

## Current cloud implementation

Development-only foundation currently includes:

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
- Edge Function `sanad-erp-ingest-v1`

The Edaa-specific normalizer is deliberately not implemented until an exact real/anonymized Edaa bundle fixture is available. Conceptual documentation is not sufficient to invent production field mappings.
