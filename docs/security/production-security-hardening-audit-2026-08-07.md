# Production Security Hardening Audit — 2026-08-07

## Executive status

**Overall posture:** production is materially safer after the canonical migration cutover and operation-pipeline deployment, but it is **not yet considered security-hardened** because the Supabase project still contains a large legacy Edge Function attack surface outside the current `main` deployment contract.

No production mutation was performed by this audit. All database checks were read-only and Edge Function review was source/inventory inspection only.

### Priority summary

| Priority | Finding | Status |
| --- | --- | --- |
| P0 / High | Legacy privileged Edge Functions remain ACTIVE in production, including unauthenticated one-shot/test/candidate runners | Confirmed |
| P0 / High | At least one legacy test endpoint uses a static embedded test credential while running with service-role capabilities | Confirmed |
| P1 / Medium | Production Edge Function inventory can drift from GitHub because CI validates only a fixed subset of required tracked functions | Confirmed |
| P1 / Medium | Supabase Auth leaked-password protection is disabled | Confirmed by Supabase Security Advisor |
| P2 / Low-Medium | `EXECUTE` grants on `SECURITY DEFINER` RPCs are broader than necessary, despite robust internal guards in sampled functions | Confirmed hardening gap |
| P2 / Low | Worker tokens are stored as plaintext values in a private table and compared directly | Confirmed defense-in-depth gap |

## Scope and evidence

- Supabase production project: `hudbzlgclghlhazlduas`
- GitHub repository: `mbhkm25/S`
- `main` audited at: `ed4a5e03e52d50dd0c010f477488962f95c94c62`
- Database audit timestamp: 2026-08-07 12:55 UTC
- Sources reviewed:
  - Supabase Security Advisor
  - PostgreSQL catalog, grants, RLS policies, function definitions, and Storage policies
  - Live Supabase Edge Function inventory and deployed function source
  - current GitHub `main` Edge Function sources and production quality gate

This audit intentionally did not read customer documents, message bodies, or application secrets.

## Confirmed findings

### PSH-001 — Legacy privileged Edge Functions remain exposed in production

**Severity:** High  
**Priority:** P0

The live Supabase project contains numerous historical functions with names indicating testing, benchmarking, candidate evaluation, shadow execution, diagnostics, sanity checks, and one-shot administration. Several remain `ACTIVE` with `verify_jwt=false`.

Validated examples include:

- `sanad-operation-preview-test`
- `sanad-operation-600-candidate-runner`
- `sanad-report-v2-storage-test-runner`
- `sanad-shadow-batch-20260806`
- `sanad-contract-fix-validation`
- two legacy `sanad-admin-*-once` functions

Not every legacy function is exploitable. Some have already been converted to explicit `410 Gone` closed runners. However, sampled active functions prove that the production inventory still includes privileged endpoints that can invoke service-role database operations or internal services without the same authentication contract as current production functions.

Two legacy one-shot administrative functions were confirmed to accept POST requests without JWT or an internal authorization guard before performing privileged service-role / messaging actions. Their idempotency markers reduce repeat impact but are not an authorization boundary.

A candidate runner was confirmed to accept unauthenticated POST and use a deployment secret internally to invoke a candidate analysis path for a fixed operation. This permits unauthorized triggering and resource consumption even though the downstream secret itself is not disclosed.

**Required remediation:**

1. Build an explicit production allowlist of Edge Functions.
2. Delete all one-shot/test/candidate/benchmark/shadow/diagnostic runners that are no longer part of the runtime architecture.
3. For any temporary function that must remain, require JWT or a purpose-specific server-side secret and set an expiry/removal owner.
4. Re-run the live inventory after deletion and retain the inventory as release evidence.

### PSH-002 — Static test credentials exist in privileged production test endpoints

**Severity:** High  
**Priority:** P0

At least one active no-JWT preview test endpoint contains a static test token in source and uses the service-role client to obtain a signed URL for a fixed operation artifact. Another storage/report test runner uses a fixed test credential and service-role access for a fixed report workflow.

The audit does not reproduce the tokens or target identifiers here.

A static credential embedded in function source is not an acceptable production authorization mechanism. Query-string token use is additionally vulnerable to accidental disclosure through logs, histories, or observability systems.

**Required remediation:** delete the endpoints. If equivalent diagnostics are required later, use short-lived authenticated admin tooling rather than reusable static credentials.

### PSH-003 — GitHub CI does not enforce production Edge Function inventory convergence

**Severity:** Medium  
**Priority:** P1

The current quality gate validates a static list of required tracked functions. It does not compare the live Supabase function inventory with a repository-owned production manifest. The legacy function audit is also `continue-on-error` and can only inspect functions that still exist in the repository.

Consequently, functions removed from `main` can remain deployed indefinitely and pass CI, which is the control failure that allowed PSH-001 to persist.

**Required remediation:**

- Introduce `supabase/production-edge-functions.json` (or equivalent) as the canonical allowlist containing slug and JWT mode.
- Add a scheduled/manual production drift check that compares `supabase functions list` with the manifest.
- Fail release gates on unexpected active functions or JWT-mode mismatch.
- Make temporary function creation include an expiry/removal step.

### PSH-004 — Leaked-password protection is disabled

**Severity:** Medium  
**Priority:** P1

Supabase Security Advisor reports Auth leaked-password protection as disabled.

This does not expose existing passwords, but it allows users to choose passwords known to appear in breach corpora, increasing credential-stuffing risk.

**Required remediation:** enable leaked-password protection in Supabase Auth settings and verify login/signup/reset behavior in staging before treating the control as complete.

### PSH-005 — `SECURITY DEFINER` execution grants are broader than necessary

**Severity:** Low-Medium  
**Priority:** P2

Catalog inspection found:

- 395 `SECURITY DEFINER` functions across `public` and `private`.
- 29 were executable by `anon` across those schemas at the grant layer.
- 191 were executable by `authenticated` at the grant layer.
- **0** `SECURITY DEFINER` functions were missing an explicitly fixed `search_path`.

The public anonymous RPC surface was manually triaged. Public directory/information functions appear intentionally public. The sampled write-capable functions have effective internal guards:

- `admin_set_pro_payment_transfer_reference(...)` rejects callers whose `auth.role()` is not `service_role`.
- `create_pro_payment_request(...)` rejects when `auth.uid()` is null.
- platform-admin mutations call `is_platform_admin(auth.uid())` before mutation.
- `is_platform_admin(...)` requires an active profile with `global_role = 'platform_admin'`.

Therefore this is **not currently classified as an authorization bypass**. The grants remain unnecessarily broad and create future risk if an internal guard is weakened or a private schema becomes exposed.

**Required remediation:** explicitly revoke `EXECUTE` from `PUBLIC`/`anon` on non-public RPCs and grant only the intended roles. Maintain an RPC exposure manifest or automated grant test.

### PSH-006 — Worker tokens are stored as plaintext values

**Severity:** Low  
**Priority:** P2

Pipeline worker authentication is structurally sound: no-JWT workers validate `x-sanad-worker-token` through service-role-only RPCs or validate authenticated platform-admin identity before obtaining a worker token. However, `private.sanad_worker_tokens` stores token values directly and validation compares plaintext values.

Because the table is private and the retrieval RPCs are service-role-only, this is not a current external exposure. It is a defense-in-depth opportunity.

**Required remediation:** consider storing only a cryptographic digest of worker tokens and compare digests, or move worker credentials wholly to managed secrets where operationally practical. Add rotation metadata and rotation procedure.

## Validated controls / advisor noise dismissed

### RLS and table grants

The audit found no `public` or `private` ordinary table without RLS that is directly readable or writable by `anon` or `authenticated`.

Sensitive tables sampled from the Advisor's “RLS enabled, no policy” list—including admin audit, report access tokens, payment verification claims, routing policy, and transactional outbox—have RLS enabled and grant no direct SELECT/INSERT/UPDATE/DELETE to API roles. In this architecture these warnings represent intentional RPC/service-only deny-all behavior, not a data leak.

### `SECURITY DEFINER` search path

All 395 inspected `SECURITY DEFINER` functions had a fixed `search_path`. API roles also have USAGE, not CREATE, on `public` and `private`. The common search-path object-shadowing escalation path is therefore not present in the audited state.

### Current operation-pipeline Edge Functions

The newly deployed operation pipeline has appropriate boundaries:

| Function class | Runtime JWT mode | Verified internal boundary |
| --- | --- | --- |
| analysis worker | no JWT | purpose-specific worker token validated by RPC |
| preview worker | no JWT | worker token; service-role bearer accepted only for internal token retrieval |
| routing worker | no JWT | purpose-specific worker token validated by RPC |
| transactional worker | no JWT | worker token, or Auth JWT mapped to an active platform admin before token retrieval |
| WhatsApp intake | no JWT | Meta HMAC-SHA256 signature on raw request body; recovery path uses worker token |
| preview access | JWT required | Supabase JWT boundary |
| app trigger analysis | JWT required | Supabase JWT boundary |

The WhatsApp intake validates `x-hub-signature-256` using `META_APP_SECRET`, performs constant-time comparison, and production has `REQUIRE_META_SIGNATURE=true`.

### Storage

Sensitive buckets are private:

- `operation-files`
- `operation-note-audio`
- `business-media`
- `sanad-knowledge-files`
- `render-html`

Storage policies reviewed constrain operation/payment files to the owning authenticated user or platform admin as appropriate. Public buckets are limited to intentionally public presentation assets (logo/avatar classes).

## Hardening execution plan

### Phase A — P0 containment

1. Capture live Edge Function inventory and current versions.
2. Define the production allowlist from current `main` architecture.
3. Delete obsolete one-shot/test/candidate/benchmark/shadow/diagnostic functions, starting with unauthenticated service-role-capable endpoints.
4. Verify all retained no-JWT functions have an explicit custom authentication boundary.
5. Smoke-test current user, WhatsApp, analysis, preview, routing, messaging, and admin paths.

### Phase B — P1 preventive controls

1. Add a repository-owned production Edge Function manifest.
2. Add drift detection to CI/scheduled production checks.
3. Enable leaked-password protection in Supabase Auth and test the auth lifecycle.
4. Add a rule prohibiting static credentials in Edge Function source and query-string authentication.

### Phase C — P2 least privilege

1. Generate an RPC exposure matrix from `pg_proc`/ACLs.
2. Revoke unnecessary anonymous/authenticated EXECUTE grants.
3. Preserve explicit public read RPCs and user-facing authenticated RPCs only.
4. Evaluate worker-token hashing/rotation.
5. Re-run Security Advisor after the migration and compare warning deltas.

## Acceptance criteria for “production hardened”

The production security hardening phase is complete only when:

- the live Edge Function inventory exactly matches an approved manifest;
- no temporary/test/one-shot endpoint remains active unless explicitly approved and authenticated;
- no static test credential remains in deployed Edge Function source;
- leaked-password protection is enabled;
- security-sensitive RPC grants have an explicit role contract;
- all retained no-JWT Edge Functions have tested custom authentication;
- Supabase Security Advisor is re-run and every remaining warning is either remediated or documented as accepted architecture;
- post-hardening smoke tests pass without weakening the current operation pipeline.

## Change-safety notes

This audit recommends **separating cleanup from authorization refactoring**. Deleting obsolete Edge Functions is lower-risk and should happen before broad RPC grant changes. RPC grant changes should be delivered through migrations, tested on an isolated branch, and verified against the PWA, admin, WhatsApp, reporting, and business workflows before production deployment.
