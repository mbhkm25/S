# SANAD × ChatGPT production — resume checkpoint (2026-09-29)

**State:** Production foundation deployed, not activated for real reads. Use the full downloadable handoff `SANAD_CHATGPT_PRODUCTION_RESUME_2026-09-29.md` from the conversation for execution details. Never assume the demo 403 proves production data access.

## Completed and verified
- Original private OAuth demo: ChatGPT → independent Cloudflare Worker `sanad-oauth-broker-pilot` → Supabase OAuth/consent on `auth.sanadflow.com` → ChatGPT callback succeeded (`oauth_success=true`). A test tool returned `financial_access_not_configured` with no financial data. Generic 401/403 debug retries occurred; production bearer compatibility remains unverified.
- Supabase project: `hudbzlgclghlhazlduas` (`sanad_verify_v3`). Existing `sanad-mcp-secure-v1` remains `verify_jwt=true` / deny-all.
- Production-only branch created: `feature/chatgpt-production-owner-read-20260929` from isolated experiment branch (NOT main). Pilot PR #426 is experiment-only and must not be merged automatically.
- Additive SQL migration `supabase/migrations/20260929190000_sanad_chatgpt_prod_default_deny.sql` committed (`e13aadff86deed82055bf67b2b00c8db0e6d67de`) and successfully applied to Supabase production as `sanad_chatgpt_prod_default_deny`. It adds private per-owner/business/OAuth-client/permission grants, default disabled, expiry + approval, and owner-bound security-definer RPCs.
- Isolated Supabase Edge gateway `sanad-chatgpt-prod-v1`, version 1, `verify_jwt=true`, was deployed and its source committed at `experiments/chatgpt-mcp-mock/production-owner-gateway/index.ts` (`5997500caf1bb048e16b7f1aba00d8c17e0874fe`). Only `sanad_secure_list_businesses` is implemented, returning owner-granted business ID/name, not financial details; all other tools remain disabled.
- Production database verification: `grant_count=0`, `enabled_count=0`; an authenticated-role no-user negative test returned `false` and `[]`. **No real-data access enabled**.

## Critical blocker to solve first
Cloudflare Broker issues its own GPT-facing OAuth token. It has **NOT** been proved to be a Supabase JWT accepted by deployed `sanad-chatgpt-prod-v1` and `/auth/v1/user`. The production Edge gateway must not be linked to GPT as if this were proven; preserve `verify_jwt=true`. Design and test a secure exchange/proxy/session-bound approach linking GPT's verified broker token to actual Supabase Auth identity and trusted client, with explicit revocation and negative tests. Also ensure the OAuth-client identity used for grants comes from trusted session context and cannot be chosen freely by callers.

## Next execution gates
1. Re-fetch this branch, migration, Edge deployment and database grant counts. Confirm Supabase billing continuity.
2. Review the installed local Worker source at `C:\SANAD-OAUTH-BROKER` against the deployed worker and test signed-in production identity without disclosing bearer/refresh tokens.
3. Implement and test secure bearer linkage; verify invalid user/client/tenant, expired/revoked grant, replay and no-grant fail closed.
4. Only with a new, separate owner approval may a short-lived `businesses:read` grant be enabled for the owner's selected business. Never automatically seed grants.
5. Prove complete authenticated GPT → production `list_businesses` E2E, including 401, 403 and permitted 200. Then propose independent gates for `sync:read`, `customers:read`, `statements:read`. The existing RPCs for customer search and statements permit active team members too, so add stronger owner+grant checks at the integration gateway. Limit dates/records and validate ERP money precision.
6. Preserve separate production PR, CI gates, rollback. Do not merge experiment branch to main or alter the original 4-tool synthetic GPT.

## OAuth infrastructure
- Consent: `https://auth.sanadflow.com` Cloudflare Pages `sanad-auth-pilot`.
- Worker: `https://sanad-oauth-broker-pilot.m-bhkm25.workers.dev`.
- GPT-facing broker client ID: `ba4d0743-a5f9-434c-bf66-f5561dd15f67`; Supabase upstream client ID: `84ac4b8e-f3c2-45de-b8f0-081b412b95c2`.
- Retrieve the current exact callback URL from the GPT editor before future changes; it has changed during pilot tests.
- Never share secrets, bearer/refresh tokens, authorization codes, callback URLs with `code/state`, or raw HAR.
