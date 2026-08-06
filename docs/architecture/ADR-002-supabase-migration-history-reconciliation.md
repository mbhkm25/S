# ADR-002: Supabase migration history reconciliation

- Status: Accepted for preparation; production reconciliation not authorized
- Date: 2026-08-06
- Project: `hudbzlgclghlhazlduas`
- Repository baseline: `b4af81e6370357fd4798dd6f747767f072bf8888`

## Context

GitHub is the source of truth for SANAD code and all database changes must be represented in `supabase/migrations`. A read-only comparison of the production migration ledger with `main` found material drift:

| Check | Result |
| --- | ---: |
| Production ledger entries | 311 |
| Local migration files | 210 |
| Valid 14-digit local versions | 186 |
| Exact version + name + SQL hash matches | 3 |
| Production entries missing exact local identity | 262 |
| Exact identity but different SQL | 46 |
| Same name under a different version | 142 |
| Invalid local CLI versions | 24 |
| Duplicate local versions | 8 groups |

The first recorded production entry calls an older function that is not created by the recorded history before it. Therefore neither the production ledger nor the current local migration directory is proven to be an empty-database baseline.

## Decision

We will reconcile migration history in three separately reviewed stages:

1. **Evidence and fail-closed gate.** Store a read-only metadata snapshot containing only version, name, byte count, and SHA-256 hash. Run an offline auditor in CI. The gate must fail whenever an applied production migration lacks one exact local version/name/hash identity, or when historical/duplicate/invalid files exist.
2. **Canonical baseline.** In a later PR, create a current-schema baseline using an official Supabase schema pull or equivalent schema-only dump from an authorized environment. The baseline must exclude business rows and secrets, replay successfully into an empty isolated project, and produce a schema equivalent to production for the explicitly scoped schemas.
3. **History maintenance window.** Only after the baseline is reviewed and replay-verified may a separate, dual-approved maintenance procedure reconcile `supabase_migrations.schema_migrations`. It requires a backup, an explicit version-by-version manifest, observed rollback criteria, and post-change comparison. This ADR does not authorize that mutation.

Until all stages pass, database deployment from this history remains blocked. Application PRs may be developed, but a PR containing new migrations—such as the event-driven pipeline—must not be deployed through this inconsistent ledger.

## Rejected approaches

- **Mass-renaming local files to production timestamps:** names and timestamps do not prove equivalent SQL; 46 matching identities already have different content.
- **Marking all missing versions applied with `migration repair`:** this only edits the history ledger and cannot prove the corresponding schema exists.
- **Using `db push` to discover the difference in production:** the current inputs are not replay-safe and the action would cross the production mutation boundary.
- **Replacing history with only the production ledger statements:** the oldest recorded statement depends on schema that predates the ledger.
- **Disabling the gate temporarily:** it would restore the same untracked-deployment risk this work is intended to remove.

## Gate contract

The deploy gate passes only when:

- every production entry has exactly one local file with the same 14-digit version, name, and byte-exact SQL hash;
- no matching identity has changed SQL;
- no local historical migration is absent from production;
- no newer local migration reuses a production name or content hash;
- local and production versions are unique; and
- any genuinely pending local migration is newer than the production high-water mark.

The preparation CI intentionally expects exit code `2` while the known drift exists. The baseline reconciliation PR must change that assertion to require a passing gate.

## Security and data handling

The committed production snapshot contains no SQL bodies, row values, credentials, URLs with tokens, or secrets. It is evidence metadata only. A future schema baseline must be reviewed for security-definer functions, ownership, grants, policies, storage objects, extensions, and environment-specific configuration before commit.

## Consequences

- Migration drift becomes visible and blocks unsafe deployment deterministically.
- Reconciliation takes an additional reviewed stage, but avoids asserting schema state from timestamps alone.
- PR #170 remains unmerged and undeployed until the canonical baseline and migration ledger are proven consistent, after which it must be rebased and its migrations retested in a fresh isolated branch.

## References

- `docs/operations/supabase-production-migration-history-2026-08-06.json`
- `docs/operations/supabase-migration-history-audit-2026-08-06.json`
- `scripts/audit-supabase-migration-history.mjs`
- Supabase CLI migration commands: <https://supabase.com/docs/reference/cli/introduction>
- Supabase database migrations: <https://supabase.com/docs/guides/deployment/database-migrations>
- Supabase branch migration troubleshooting: <https://supabase.com/docs/guides/troubleshooting/new-branch-doesnt-copy-database>
