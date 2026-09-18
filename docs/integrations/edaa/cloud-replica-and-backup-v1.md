# Edaa Cloud Replica and Backup Architecture v1

Status: implementation in progress on `feat/erp-cloud-replica-v1`.

## Product requirement

After an accounting system is linked, SANAD should provide two outcomes that must not be conflated:

1. **Remote accounting-data access** — the business can read its Edaa data from SANAD, including detailed customer statements, invoices, balances, inventory/accounting evidence and later other reports.
2. **Backup assurance** — SANAD should preserve periodic copies so the business is not dependent on the shop PC alone.

These outcomes require different technical layers.

## Layer A — operational synchronization

The minute-level Bridge agent remains the near-real-time path for supported transaction bundles. It currently detects and sends verified Edaa sale revisions through the durable outbox.

This path is optimized for freshness and normalized SANAD activity/read models.

## Layer B — logical cloud replica

A periodic full logical snapshot copies the safe structured contents of every discovered Edaa user table to SANAD.

Default cadence: every 360 minutes. It can be changed with:

`SANAD_LOGICAL_SNAPSHOT_INTERVAL_MINUTES`

Minimum cadence is 60 minutes to prevent accidental full-database export every minute.

Properties:

- Edaa remains read-only.
- the already-authorized/core schema fingerprint remains the compatibility guard;
- the complete schema has its own full-schema fingerprint in snapshot metadata;
- all user tables are discovered dynamically;
- table rows are split into durable chunks;
- each chunk is idempotent through the existing ERP event envelope;
- snapshot completeness is validated by table row counts before completion;
- the latest completed snapshot is queryable from SANAD;
- incomplete network transfers remain durable locally and retry safely.

### Data coverage in v1

The logical snapshot exports all safe structured scalar columns.

The following are deliberately not copied in v1:

- `binary`, `varbinary`, `image`, `timestamp/rowversion` columns;
- columns with credential-like names such as password, secret, credential or token.

The manifest explicitly records exported and omitted columns.

This means v1 is a **logical structured-data backup/replica**, not a byte-for-byte database backup.

## Layer C — physical disaster-recovery backup

A SQL Server `.bak` or equivalent physical image is a separate capability and must not be advertised until all of the following are implemented and tested:

- explicit owner opt-in;
- safe SQL Server 2000 backup procedure;
- encrypted transfer/storage;
- retention policy;
- integrity verification;
- documented restoration procedure;
- successful restore drill to a clean SQL Server environment.

Until this layer exists, the UI must say "نسخة سحابية منطقية" and must not claim that SANAD can restore the Edaa program/database exactly.

## Cloud storage model

`business_erp_baseline_runs` now supports `logical_backup` runs.

`business_erp_snapshot_rows` materializes rows from completed logical snapshots with:

- snapshot identity;
- business/source identity;
- source table name;
- stable row key when a primary key exists;
- row hash;
- original structured row JSON;
- capture time.

Raw ERP events remain the provenance/evidence layer. The materialized snapshot rows are a read surface, not canonical SANAD accounting truth.

## User access

Authenticated business owners and active members can read the latest completed snapshot through governed RPCs:

- `get_business_erp_snapshot_status_v1`
- `get_business_erp_snapshot_table_rows_v1`

The accounting-system screen shows:

- last completed logical copy;
- table count;
- snapshot type;
- a technical source-table browser.

The raw table browser is intentionally transitional. End users should not need to understand legacy table names.

## Semantic accounting read models

The next layer maps verified Edaa semantics into user-facing accounting queries without modifying Edaa.

Priority read models:

1. **Customer statement**
   - customer/source identity;
   - opening balance;
   - invoices;
   - receipts/payments;
   - returns/adjustments;
   - running balance;
   - source document number/date/currency;
   - links back to raw source evidence.
2. Supplier statement.
3. Sales/purchases documents and line details.
4. Cash/bank account movements.
5. Inventory/card movement.
6. General-ledger/account statement where source semantics are verified.

A request such as "اعطني كشف حساب العميل فلان" must query a verified semantic read model, not guess joins directly from legacy table names.

## Security and correctness invariants

- SANAD never writes or edits Edaa records in this phase.
- No SQL/Windows/ERP passwords are uploaded.
- Raw source evidence is preserved.
- Snapshot rows are scoped to the authenticated business/source.
- A partial snapshot is never presented as complete.
- A logical snapshot is never described as a physical/restorable SQL backup.
- Semantic mappings are introduced only after exact source relationships are verified from the real Edaa schema/fixtures.
