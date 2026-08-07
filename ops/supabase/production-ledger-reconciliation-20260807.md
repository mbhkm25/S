# SANAD production Supabase migration-ledger reconciliation — 2026-08-07

Status: PRE-WRITE PREFLIGHT RECORDED

## Scope
Metadata-only reconciliation of `supabase_migrations.schema_migrations` for production project `hudbzlgclghlhazlduas`. No application-schema DDL, business-data mutation, Edge Function deployment, or pipeline migration application is authorized by this operation.

## Authorization and maintenance window
- Production execution explicitly requested by the project owner in ChatGPT on 2026-08-07 at 14:49 (+03:00 / Asia-Aden).
- Execution window: immediate controlled maintenance window beginning 2026-08-07 14:49 +03:00.
- Execution review: preflight checks, immutable repository target, rollback snapshot, and post-write catalog fingerprint verification are mandatory before completion.

## Immutable repository target
- Repository: `mbhkm25/S`
- Production source commit: `3301f7f4433e9d0847812ed95c2a4ff897da096f`
- Canonical migration version: `20260806150947`
- Canonical migration name: `canonical_schema_baseline`
- Canonical migration blob: `2bc4e3c88fd07b1f79892624cb55d4bee4d078fd`
- Canonical payload SHA-256 guard: `8d66799f37b3177644efe9ab2a5a70e3499f26c102f59b65c674fc96c8d69dcc`
- Canonical payload bytes guard: `1375100`

## Immediate production preflight
- Project state: `ACTIVE_HEALTHY`
- Organization plan: `pro`
- Migration ledger rows: `311`
- First version: `20260702130842`
- Last version: `20260806063921`
- Ledger MD5 over all tracked metadata: `000ef2c90f8af11411dac1ec20b4da5f`
- Stored migration statement bytes: `1764166`
- Rows with `created_by`: `311`
- Rows with idempotency key: `0`
- Rows with rollback payload: `0`
- Application catalog object count (`public`, `private`, `app`): `3455`
- Application catalog fingerprint MD5: `742a0b668cbcbaba5b6f431c62d3e10b`

## Backup / rollback control
Before deleting any ledger row, create a timestamped exact copy of all six ledger columns inside the internal `supabase_migrations` schema and verify its row count and MD5 match the preflight values. The backup table is retained through all post-checks. Immediate rollback is an atomic transaction that replaces `schema_migrations` with the exact backup rows and verifies the original count/hash.

Managed Supabase Pro backups provide the platform-level recovery layer; the internal exact ledger snapshot provides immediate row-level rollback for this metadata-only operation.

## Intended mutation
Atomically replace the 311 legacy migration-history rows with exactly one applied canonical history record for version `20260806150947`, name `canonical_schema_baseline`, with a non-null statements payload representing the repository canonical migration. The canonical migration SQL itself MUST NOT execute against production during reconciliation.

## Post-write invariants
- `schema_migrations` contains exactly one row.
- The only remote version is `20260806150947`.
- Application schema object count remains `3455`.
- Application catalog fingerprint remains `742a0b668cbcbaba5b6f431c62d3e10b`.
- No post-baseline pipeline migration is marked applied by this operation.
- No Edge Function or application deployment is started by this operation.
