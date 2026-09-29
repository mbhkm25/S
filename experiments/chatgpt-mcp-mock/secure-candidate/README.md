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
