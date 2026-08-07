# Phase 3 rollback manifest

## Status

**Rollback is not yet production-approved.**

The authoritative recovery path remains the verified restore-grade production backup until an isolated simulation proves a narrower ledger-only rollback that restores the approved before-state without changing schema or business data.

## Why rollback is a separate gate

The forward reconciliation removes 311 legacy history records and marks the canonical version as applied. Supabase CLI documentation describes the record-level semantics of `migration repair`, but production safety also depends on observed behavior for multi-version execution, partial failure, naming/payload reconstruction, and resumability.

Because the historical migrations are archived outside the active migration directory, this runbook does not assume that simply marking all 311 versions `applied` will reconstruct the original ledger row payloads or aggregate fingerprint.

## Authoritative before-state

Rollback success means restoring the approved state represented by:

- migration count: `311`;
- first version: `20260702130842`;
- last version: `20260806063921`;
- total statement bytes: `1764166`;
- ledger manifest SHA-256: `60285fa75234648a39cf3de5f139c18e61440d04876048c28f54f0eef30d6903`.

Rollback must also preserve the immediately captured production schema fingerprint and protected application/original-document data checks.

## Recovery hierarchy

### Level 1 — abort before mutation

If any production gate fails before the first mutation command, execute nothing. No rollback is required.

### Level 2 — simulation-proven ledger-only recovery

This path may be used in production only if isolated simulation proves that the exact frozen rollback commands restore the approved before-state and preserve schema/data invariants. The exact commands, CLI version, outputs, and evidence must be committed and receive two independent approvals before production GO.

Until that proof exists, Level 2 is **not approved**.

### Level 3 — restore-grade backup recovery

If mutation has begun and the approved ledger-only recovery is unavailable, incomplete, or fails any equality check:

1. keep database/migration deployments paused;
2. preserve all forward-command output and capture the failed ledger state read-only;
3. invoke the verified backup restore procedure exactly as reviewed;
4. verify the restored ledger against the approved 311-row before-state;
5. verify the scoped schema fingerprint;
6. verify protected application/original-document data checks;
7. run critical RPC, trigger, RLS, Storage, and application smoke tests;
8. keep PR #170 blocked until the incident is reviewed and production is re-approved.

## Isolated rollback proof requirements

The isolated repair simulation must intentionally prove recovery from at least these states:

1. before any repair command;
2. after the legacy-version revert step but before canonical apply;
3. after the full expected-after state;
4. after a deliberately interrupted/failed candidate step if the CLI can be safely made to demonstrate partial-failure behavior.

For each state, capture:

- CLI version;
- exact command and arguments;
- exit code;
- migration-history version set;
- ledger fingerprint where comparable;
- schema fingerprint;
- protected data checks.

## Production rollback stop conditions

Do not attempt further ad-hoc recovery commands if:

- output differs from the simulation-proven rollback evidence;
- ledger equality cannot be proven;
- schema or protected-data fingerprints differ;
- the selected CLI version differs from the reviewed version;
- a deployment starts during recovery.

Escalate to the verified backup recovery procedure instead.

## Approval boundary

This file documents the recovery policy only. It does not authorize production repair or restore. A final frozen rollback command/evidence manifest must be produced after isolated simulation and before a separate production execution approval.
