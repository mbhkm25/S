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

## Protected-edge deny-all candidate (deployed in isolation; no financial reads)
The `secure-edge/index.ts` candidate has Supabase Auth-backed token verification (via `/auth/v1/user`) and is intended to run with `verify_jwt:true`. The pure `secure-edge/handler.ts` deliberately prevents **all** monetary tool execution, including for authenticated owners, until reviewed ownership, consent, entitlement, per-request audit and source-fidelity adapters exist. Its authenticated MCP `tools/list` describes proposed tool names only; these do not imply data access. Public demo and its four tools remain independent and synthetic.

Run `deno check secure-candidate/secure-edge/index.ts secure-candidate/secure-edge/handler.test.ts` followed by `deno test secure-candidate/secure-edge/handler.test.ts` in the experiment root. CI is configured to run these in addition to the Node mock suite. A passing fake-verifier test is **not** proof of real OAuth interoperability.

## Prepared owner-only canonical RPC adapter (not wired or deployed)
`owner-only-reader.mjs` is an injectable prototype for the **one-merchant owner-only** pilot. Each invocation first performs the existing `is_business_owner_v1(p_business_id)` RPC with the verified user's own bearer token and a publishable public API key. Only after the owner check succeeds may it call the whitelisted existing `get_business_accounting_connections_v1`, `get_business_erp_customer_candidates_v1` or `get_business_erp_customer_statement_v1` RPC.

It rejects arbitrary tool names and business IDs, requires explicit numeric ERP AccountID and bounded statement dates (31 days), limits search to 10 results and statement movements to 30, strips customer phone/address/free-text, returns provenance, snapshot ID, sign convention and currency-specific totals, and warns that end-to-end original decimal fidelity has not been established. It does **not** calculate or combine balances across currencies. It deliberately has no generic SQL query, service-role client or payment/write methods. Mocked-fetch tests ensure owner-only scope even though the existing lower-level statement RPC is broader.

**Not sufficient for production:** current `secure-edge/handler.ts` still rejects every financial call. Wiring this adapter will require a real verified request user, explicit scoped consent, a separately reviewed entitlement source, rate limiting and redacted per-call audit, live deployed-RPC review and paid pilot owner's approval. Never expose `createOwnerOnlyReader` as an unauthenticated endpoint.

## Deployment receipt — 2026-09-29
- Function: `sanad-mcp-secure-v1` in the existing `sanad_verify_v3` project, independently named from `sanad-mcp-demo`.
- Initial deployed version: **1**, Supabase returned **ACTIVE**, `verify_jwt: true`, digest `5345d01fbe354f425c17635f2d0de70647f2625e8590e065c99097a3f8fe3feb`. The deployed entrypoint contains only Supabase Auth user verification and the fail-closed MCP/REST candidate. No ERP imports, financial RPC wiring or service-role credentials.
- Dedicated GitHub workflow live smoke confirmed: existing synthetic demo health remains demo-only; anonymous, malformed-bearer and forged-header requests to the secure endpoint each received **401** with no financial payload. 31 Node isolated tests and 11 Deno checks/tests passed in that CI run.
- The live smoke did **not** demonstrate a real signed-in OAuth handshake. Authenticated `initialize`/`tools/list` and deny-all tool calls are covered by locally injected verifier tests, not a real user token.
- Current repo entrypoint adjusts the leading deployment comment only; functional deployed code corresponds to initial candidate implementation. Future functional changes require separately verified versioned deployment.

**Stop condition:** Do not wire `owner-only-reader.mjs` into deployed handler without reviewed real entitlement/consent source and rate-limited per-business audit; the current protected deployment must refuse all financial calls.
