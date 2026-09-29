# SANAD ChatGPT Production — Stage P1

Scope: one owner's business metadata only. No customers, ledger, ERP writes or automatic live grants.

Completed on real Supabase production project on 2026-09-29:
- Applied additive default-deny grant migration: owner, business, OAuth client, specific permission, expiry and explicit approval; RLS prevents authenticated self-grant.
- Created two owner-bound permission RPCs bound to verified auth.uid().
- Deployed separate sanad-chatgpt-prod-v1 Edge Function version 1 with verify_jwt=true. Its only implemented real data operation is granted business names and IDs; all other operations deny.
- Verified zero active grants and empty/false response under an authenticated database role without a verified user.
- Prepared exactly one disabled businesses:read permission for the owner's business. No consent or production data reads have been enabled.
- Previous SANAD secure deny-all Edge Function, existing OAuth Worker, old GPT, legacy app and Edaa Bridge are unchanged.

Critical integration gate:
The ChatGPT OAuth broker currently issues an opaque bearer. A separate locally tested integration patch conditionally encrypts and forwards the Supabase OAuth bearer to this JWT-verifying gateway using AES-256-GCM, with no service-role key or plaintext bearer stored. This patch remains UNDEPLOYED and its feature flag must remain false until gated acceptance. Tested 11/11 Node tests including no-key fail-closed, encrypted storage, successful fixture and grant rejection. Tests are offline, NOT live production OAuth acceptance.

Activation order:
1. Owner checks billing continuity and reviews local patch, backups and all eleven tests.
2. Provision Worker-only 32-byte BROKER_SESSION_ENCRYPTION_KEY using secure Wrangler prompt; never put secret in Pages or repo.
3. Recheck exact private GPT callback and owner identity and verify compatibility of upstream OAuth JWT with gateway verify_jwt=true. Stop on mismatch.
4. Activate the one per-business businesses:read grant for an approved short period in an attended cutover.
5. Set ENABLE_REAL_METADATA=true and deploy Worker only after reviewed stage gate; new OAuth login is mandatory so token can be encrypted from callback.
6. Confirm allowed owner result, denied ungranted/revoked access, wrong JWT and other tools denied.
7. Roll back by disabling enabled grants and turning flag false on Worker.

Further scope requires distinct audit and explicit consent: sync status, customer search, then statement with precision/freshness checks; never auto-enable.
Cloudflare Worker patch supplied separately as SANAD-Production-Metadata-Stage1.zip for owner-local integration. No automatic Worker deploy was performed.