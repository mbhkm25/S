# Supabase canonical baseline cutover layout

Status: preparation-only; production unchanged.

## Purpose

This change defines the deterministic repository layout that will be used only after the Phase 3 controls are approved:

- move every historical SQL migration from `supabase/migrations` to `supabase/migration_archive/pre_canonical_20260806` without changing its bytes;
- assemble the two reviewed baseline parts in their declared order;
- verify the assembled baseline is exactly 1,375,100 bytes with SHA-256 `8d66799f37b3177644efe9ab2a5a70e3499f26c102f59b65c674fc96c8d69dcc`;
- make `20260806150947_canonical_schema_baseline.sql` the only active historical migration;
- write an archive manifest with the exact file count and baseline identity.

## Safety behavior

`node scripts/prepare-supabase-baseline-cutover.mjs` is dry-run only. It prints the proposed manifest and must leave the working tree unchanged.

`node scripts/prepare-supabase-baseline-cutover.mjs --write` materializes the layout on disk. CI runs this command only inside `/tmp/sanad-cutover`, then runs the verifier. The checked-out PR branch must remain preparation-only and must not contain the active baseline or archive layout.

## Non-claims

This change does not:

- alter `supabase_migrations.schema_migrations`;
- run `supabase migration repair`;
- execute database DDL;
- deploy Edge Functions;
- authorize a production maintenance window;
- merge or deploy PR #170.

A fresh isolated Supabase replay of the finalized active layout is still mandatory before any production ledger operation.
