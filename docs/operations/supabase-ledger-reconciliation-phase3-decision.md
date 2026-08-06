# Phase 3 reconciliation decision gate

## Current decision

**NO-GO for production mutation. GO for reviewed preparation.**

The production ledger was rechecked read-only after PR #173 merged. It still contains 311 rows and matches the approved aggregate fingerprint. This proves there was no intervening ledger change, but it does not replace backup, restore, reviewer, or maintenance-window requirements.

## What this branch authorizes

- deterministic read-only preflight;
- exact before-state manifest;
- reviewed runbook and abort criteria;
- preparation of the eventual atomic repository cutover.

## What this branch does not authorize

- migration repair against production;
- direct writes to `supabase_migrations.schema_migrations`;
- activation of the canonical baseline in `supabase/migrations`;
- production DDL, `db push`, or Edge Function deployment;
- merge or deployment of PR #170.

## Promotion criteria

This decision becomes **GO** only when the manifest records:

1. verified backup evidence;
2. verified restore path;
3. two independent approvals;
4. approved maintenance window;
5. paused database deployments;
6. empty-project replay of the exact activated migration chain;
7. immediate preflight equality;
8. frozen reviewed commit SHA and command manifest.
