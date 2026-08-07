# Production Security Hardening Audit — 2026-08-07

## Scope

- Repository: `mbhkm25/S`
- Production Supabase project: `hudbzlgclghlhazlduas`
- Baseline source: protected `main`
- Scope: PostgreSQL/RLS/RPC privileges, SECURITY DEFINER posture, Storage policies, Auth advisor findings, and production Edge Function attack surface.
- No customer data was modified as part of the audit.

## Executive result

The production database authorization model is materially stronger than the raw advisor count suggests: every audited SECURITY DEFINER function has a fixed `search_path`, platform-admin RPCs contain explicit authorization guards, sensitive Storage buckets are private, and RLS-enabled tables without policies are also missing anon/authenticated DML grants and therefore remain deny-by-default.

The material finding was the historical Edge Function attack surface. Nine obsolete one-shot/test functions remained ACTIVE and externally invokable with insufficient inbound authentication while holding privileged runtime credentials, access to private resources, or trigger capability. They were retired immediately in production by replacing their bodies with a 410 tombstone and enabling JWT verification. Their tombstone sources are included in this branch so GitHub remains the source of truth.

## Findings

### HIGH — obsolete privileged Edge endpoints exposed in production — REMEDIATED

The following historical functions were no longer referenced by current `main` but remained deployed with insufficient inbound authentication:

- `sanad-admin-omar-apology-once`
- `sanad-admin-omar-business-approved-once`
- `sanad-report-v2-storage-test-runner`
- `sanad-report-v2-test-download`
- `sanad-report-v2-test-base64`
- `sanad-report-v2-1-run-once`
- `sanad-report-v2-2-mobile-run`
- `sanad-operation-preview-test`
- `sanad-operation-600-candidate-runner`

Risk included privileged service-role access, access to private report/preview resources, externally triggerable processing, and/or privileged WhatsApp side effects. Two legacy report runners also relied on source-embedded fixed tokens rather than a runtime secret, which was not accepted as a production authentication boundary.

Production remediation already completed:

- replaced each implementation with a deterministic HTTP 410 tombstone;
- enabled platform JWT verification;
- removed privileged runtime behavior from the deployed version;
- preserved function slugs only to provide a safe failure mode and reversible deployment record.

No current production pipeline worker was retired.

### MEDIUM — mutating SECURITY DEFINER RPCs have broader EXECUTE ACLs than required — FIX PREPARED

`admin_set_pro_payment_transfer_reference(uuid,text,jsonb,numeric,text)` is internally restricted to `service_role`, but `anon` and `authenticated` currently possess EXECUTE grants.

`create_pro_payment_request(uuid,text,text,text,text,text,bigint,text)` rejects unauthenticated callers using `auth.uid()`, but `anon` currently possesses an unnecessary EXECUTE grant.

The migration `20260807144500_production_security_hardening.sql` narrows the ACLs without changing either function body or application data:

- admin setter: EXECUTE only for `service_role`;
- create payment request: EXECUTE for `authenticated` and `service_role`, not `anon`/PUBLIC.

### MEDIUM — Supabase leaked-password protection disabled — PENDING AUTH CONFIG

Supabase Security Advisor reports leaked-password protection disabled. The production project is eligible for the feature. This is an Auth service configuration, not a PostgreSQL migration. It must be enabled through the supported Supabase Auth configuration surface after verifying the exact Management API/Dashboard setting. No configuration key is guessed in this audit.

### INFORMATIONAL — SECURITY DEFINER posture

Production inventory at audit time:

- SECURITY DEFINER functions: 321;
- functions with fixed `search_path`: 321/321;
- missing fixed `search_path`: 0;
- anon-executable SECURITY DEFINER functions before ACL hardening: 9.

The two mutating anon-executable functions above were inspected in full and have internal authorization guards. The remaining anon-executable functions are intentional public information/directory readers and should remain separately reviewable rather than being revoked indiscriminately.

### INFORMATIONAL — platform admin authorization

All 52 `platform_admin_*` SECURITY DEFINER RPCs were reviewed structurally for an explicit platform-admin/reviewer authorization guard. Heuristic matching covered 50, and the remaining two were inspected directly and also contain `is_platform_admin(...)` checks. No platform-admin privilege bypass was identified.

### INFORMATIONAL — RLS tables without policies are deny-by-default

There are 70 RLS-enabled public/private tables with no policy. Neither `anon` nor `authenticated` has DML grants on any of those 70 tables. They therefore remain closed rather than publicly exposed. Policies should not be added merely to silence the advisor.

### INFORMATIONAL — Storage posture

Sensitive buckets are private:

- `operation-files`
- `operation-note-audio`
- `business-media`
- `render-html`
- `sanad-knowledge-files`

The public buckets are `LOGO` and `user-avatars`, consistent with their intended public-content role. Reviewed Storage policies scope operation files/receipts/audio to the owning user or platform-admin context; no unrestricted anon policy was found on the sensitive buckets.

### LOW / PERFORMANCE — separate hardening backlog

The Performance Advisor reports unindexed foreign keys, unused indexes, and an Auth RLS init-plan optimization opportunity. These are not evidence of unauthorized access and are intentionally excluded from the immediate security remediation to avoid unsafe index churn. They should be handled through a separate performance review with workload evidence.

## Edge-function review methodology

`verify_jwt=false` was not treated as a vulnerability by itself. Function bodies were inspected for custom authentication or a closed/tombstone implementation. Examples found to be controlled include `SANAD_INTERNAL_API_KEY`-protected candidate/recovery functions and existing 410 validation/batch runners. This avoids breaking intentional webhook/internal-worker authentication flows merely to reduce advisor noise.

## Verification gates

Before this audit can be closed:

1. required CI checks must pass on this hardening branch;
2. this branch must merge through protected `main`;
3. the ACL migration must be applied to production and its ledger version reconciled to `20260807144500`;
4. function privileges must be re-read from production;
5. Security Advisor must be re-run;
6. leaked-password protection must be enabled through a documented Supabase Auth configuration surface, or explicitly carried as the only remaining manual configuration item.
