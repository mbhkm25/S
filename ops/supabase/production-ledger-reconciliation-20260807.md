# SANAD production Supabase migration-ledger reconciliation — 2026-08-07

Status: **COMPLETED / POST-CHECKS PASSED**

## Scope
Metadata-only reconciliation of `supabase_migrations.schema_migrations` for production project `hudbzlgclghlhazlduas`. No application-schema DDL, business-data mutation, Edge Function deployment, or pipeline migration application was authorized or performed by this operation.

## Authorization and maintenance window
- Production execution explicitly requested by the project owner in ChatGPT on 2026-08-07 at 14:49 (+03:00 / Asia-Aden).
- Execution window: immediate controlled maintenance window beginning 2026-08-07 14:49 +03:00.
- Execution review required preflight checks, an immutable repository target, an exact rollback snapshot, atomic guards, and post-write catalog fingerprint verification.

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
An exact pre-write copy of all six migration-ledger columns was captured in:

`supabase_migrations.schema_migrations_backup_20260807_1149z`

The snapshot was verified before the live ledger mutation:
- rows: `311`
- first version: `20260702130842`
- last version: `20260806063921`
- MD5: `000ef2c90f8af11411dac1ec20b4da5f`

The backup table remains present after completion for immediate row-level rollback. Managed Supabase Pro backups remain the platform-level recovery layer.

## Executed mutation
A single guarded transaction:
1. acquired an exclusive lock on `supabase_migrations.schema_migrations`;
2. revalidated the live 311-row count/hash and the rollback snapshot count/hash;
3. deleted only the migration-history rows;
4. inserted exactly one applied canonical history record for `20260806150947_canonical_schema_baseline` with a non-null statements payload corresponding to the immutable repository canonical migration;
5. revalidated ledger cardinality/version and application catalog fingerprint before commit;
6. committed only after every guard passed.

The canonical migration SQL itself was **not executed** against production.

## Independent post-commit verification
Supabase migration history now reports exactly:
- `20260806150947` — `canonical_schema_baseline`

Database post-checks:
- live ledger rows: `1`
- post-baseline applied rows: `0`
- rollback snapshot rows: `311`
- rollback snapshot MD5: `000ef2c90f8af11411dac1ec20b4da5f`
- application catalog object count: `3455`
- application catalog fingerprint MD5: `742a0b668cbcbaba5b6f431c62d3e10b`

Therefore the migration-ledger reconciliation changed migration metadata only. The application schema fingerprint is identical to the immediate pre-write fingerprint, and none of the five post-baseline operation-pipeline migrations was marked applied.

## Remaining production release boundary
The following repository migrations remain pending and were deliberately excluded from this reconciliation:
- `20260806151000_instant_intake_event_pipeline.sql`
- `20260806151100_preview_queue_immediate_dispatch.sql`
- `20260806151200_routing_inbox_single_writer_queue.sql`
- `20260806151300_unified_transactional_outbox_worker.sql`
- `20260806151400_pipeline_observability_percentiles.sql`

Applying those migrations and deploying the associated Edge Functions is a separate production release operation and requires its own explicit approval and preflight.
