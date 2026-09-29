# Secure Candidate — Offline Test Gate (NOT DEPLOYABLE)

This directory is a deliberately isolated reference design, not a protected Supabase MCP server or a real financial API. It has no production credentials, DB access, real OAuth verifier or customer data. Do not deploy this package or advertise it as user-authenticated.

## Implemented
- `policy.mjs`: strict read-tool allowlist and per-business decision, using explicitly **fixture-only** authenticated principal, consent and trial entitlement objects.
- `offline-handler.mjs`: HTTP-like injectable handler that rejects missing/invalid bearer authorization, unrecognized tools, unexpected input fields and non-numeric account IDs. Identity, permission resolution, entitlement checks and data access are injected abstractions. Permission dependency failures return a closed denial rather than bypassing authorization.
- `offline-handler.test.mjs`: adversarial owner/active-team/customer/revoked-role and cross-tenant cases.

Run in the experiment root: `npm test`. This runs existing synthetic MCP regression tests and secure-candidate offline checks.

## Hard gates before deployment
1. Implement Supabase Auth JWT signature/issuer/audience/time validation and real OAuth 2.1 login/consent; client cannot set principal or grants.
2. Create **separate named protected** Edge Function; keep public `sanad-mcp-demo` synthetic-only. No shared REST bypass of the MCP authorization path.
3. Audit **actual deployed** canonical RPC definitions and grants; especially owner vs team/customer eligibility and RLS under authenticated user token, not service-role access. A job title or arbitrary user-provided business ID is not authorization.
4. Obtain owner approval for one explicitly authorized sandbox business identity and verify tenant isolation, customer-account identity mapping, currency/precision, stale snapshots and source reconciliation against read-only Edaa.
5. Implement per-actor/business quotas, minimal audit, safe errors, idempotent request handling, revocation verification and operational cost controls.
6. Run a real ChatGPT OAuth handshake and test transport parity before any real commercial-data connection.

No merging, real data, migration, production Edge release, hosted server or subscription charge is authorized by this offline candidate.

## Verified repository permission finding (2026-09-29)
Source: `supabase/migrations/20260917174600_financial_rpc_authorization_hardening_v3.sql` currently defines `can_access_business_financial_v1` as **owner OR any active business team member**, with no differentiated financial read grant. `supabase/migrations/20260918141500_erp_customer_statement_read_model_v1.sql` defines customer search and statement as SECURITY DEFINER RPCs with owner-or-active-member eligibility. Accordingly, the mocked `financialReadGrant` field is **only a target policy fixture**. It is not a verified deployed grant or a safe drop-in substitute. Stage 2D also forbids treating a customer relationship or manager job title as financial authorization.

**Commercial pilot scope decision:** first secured release MUST be owner-only, unless a separately approved granular delegation implementation passes explicit tests. Check ownership using an authenticated-user-bound verified source (`is_business_owner_v1` and/or reviewed owner profile), not the broader `can_access_business_financial_v1` alone. Do not expose raw ERP phone/address or customer master records just because the canonical search RPC returns them; map the result to an explicit minimum response schema. Confirm effective production definitions and role grants at runtime before any real-data path.

## Prepared protected-edge candidate (not deployed)
The `secure-edge/index.ts` candidate has Supabase Auth-backed token verification (via `/auth/v1/user`) and is intended to run with `verify_jwt:true`. The pure `secure-edge/handler.ts` deliberately prevents **all** monetary tool execution, including for authenticated owners, until reviewed ownership, consent, entitlement, per-request audit and source-fidelity adapters exist. Its authenticated MCP `tools/list` describes proposed tool names only; these do not imply data access. Public demo and its four tools remain independent and synthetic.

Run `deno check secure-candidate/secure-edge/index.ts secure-candidate/secure-edge/handler.test.ts` followed by `deno test secure-candidate/secure-edge/handler.test.ts` in the experiment root. CI is configured to run these in addition to the Node mock suite. A passing fake-verifier test is **not** proof of real OAuth interoperability.
