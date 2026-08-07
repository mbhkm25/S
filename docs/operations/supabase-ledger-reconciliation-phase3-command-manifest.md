# Phase 3 candidate command manifest

## Status

**Candidate only. Not authorized for production execution.**

This document defines how the exact production command set is generated and frozen. The final executable manifest must be produced from the committed 311-row history evidence, tested in an isolated reproduction of that ledger, reviewed by two independent reviewers, and bound to one repository SHA and one Supabase CLI version.

## Authoritative inputs

- Repository: `mbhkm25/S`
- Post-cutover base: `e0d87f052f47e8bb592baeeb739e4ae2effe53bb`
- Production project ref: `hudbzlgclghlhazlduas`
- Before-state evidence: `docs/operations/supabase-production-migration-history-2026-08-06.json`
- Before-state aggregate: `docs/operations/supabase-ledger-reconciliation-phase3-manifest.json`
- Canonical version: `20260806150947`
- Expected-after contract: `docs/operations/supabase-ledger-reconciliation-phase3-expected-after.json`

## CLI semantics to verify and freeze

The selected Supabase CLI version must be recorded together with the output of:

```text
supabase --version
supabase migration repair --help
```

The reviewed CLI behavior must confirm that `migration repair ... --status reverted` removes migration-history records and `--status applied` inserts migration-history records without executing migration SQL. Multi-version argument support must be verified for the selected version.

## Deterministic generation

Run the repository-only generator:

```text
node scripts/build-supabase-ledger-reconciliation-command-manifest.mjs
```

The generator is non-mutating. It validates the pinned 311-row evidence, refuses to include the canonical version in the legacy set, and emits a candidate JSON plan containing the exact legacy version arguments and the canonical apply step.

The generated plan is not executable approval. Its output must be committed as frozen evidence only after isolated simulation succeeds.

## Candidate forward sequence

Conceptually the candidate sequence is:

```text
supabase migration repair <all 311 approved legacy versions> --status reverted --linked
supabase migration repair 20260806150947 --status applied --linked
```

No production command may be copied from this conceptual example. Only the simulation-proven, frozen generated manifest may be used during the maintenance window.

## Required expected outputs

The frozen command manifest must record expected output for each mutation step, including:

- target project confirmation;
- exact versions reported repaired;
- command exit status;
- resulting remote migration-version set;
- `supabase migration list` output;
- expected-after verification output;
- `supabase db push --dry-run` output.

Any output difference during production is a stop condition.

## Atomicity rule

No transaction-level atomicity is assumed. The isolated simulation must explicitly determine whether a multi-version repair is all-or-nothing, partially durable on failure, or otherwise resumable. The production procedure must be written around observed behavior, not assumptions.

## Prohibited commands during reconciliation

- applying `supabase db push`;
- production DDL;
- direct ad-hoc SQL writes to `supabase_migrations.schema_migrations`;
- Edge Function deployment;
- commands not present in the frozen reviewed manifest.

## Freeze requirements

Before production GO, create a final immutable evidence record containing:

1. repository commit SHA;
2. Supabase CLI version;
3. project ref;
4. exact forward commands and arguments;
5. exact expected output/after-state;
6. exact rollback procedure;
7. isolated simulation evidence;
8. reviewer approvals;
9. backup identifier and restore procedure;
10. maintenance-window identifier/time.
