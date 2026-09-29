# SANAD — Independent OAuth Consent UI (candidate, not hosted)

This standalone Vite build is intentionally separate from the unpaid Hetzner SANAD web app. It uses **the same existing Supabase Auth accounts** and its documented `auth.oauth` methods; there is no new password database, fake OAuth exchange, shared secret or SANAD financial-read path. No customer data is loaded.

## Status and prerequisite truth — 2026-09-29
Credential-free public discovery on the existing Supabase project showed:
- `/.well-known/oauth-authorization-server/auth/v1`: **404**. The documented MCP-specific OAuth authorization-server metadata endpoint is **not currently available on this tested URL**.
- `/auth/v1/.well-known/openid-configuration`: **200**, with issuer, authorization/token endpoints and S256 support present.
This is NOT proof that third-party OAuth client registration, authorization flow, ChatGPT callbacks or consent are enabled. In particular, OIDC discovery being present does not replace the absent documented MCP metadata route. Do not auto-enable or change shared project settings based on this partial result.

## Build and test
In `experiments/chatgpt-mcp-mock/oauth-consent`:
```sh
npm install
npm test
cp .env.example .env.local
# Fill only project PUBLIC browser key and the exact registered client callback.
npm run build
npm run dev
```
`.env.local`, browser access tokens, passwords, client secrets, refresh tokens and actual authorization codes must not be committed, pasted into ChatGPT or printed in CI. Use a **trusted, owner-controlled HTTPS origin** for real consent, not localhost, random tunnel aliases or the currently unavailable app origin. The consent UI uses browser `signInWithPassword` *directly to Supabase Auth*; it never sends passwords to the SANAD MCP function or any new backend.

The browser page receives a Supabase-validated `authorization_id` and calls `getAuthorizationDetails`, displays the **returned** client name, exact redirect URI and requested scopes, and requires an explicit Approve or Deny. Before any redirection it pins origin/path against `VITE_OAUTH_CALLBACK_URL`. This is a narrow single-client **pilot** by design; client-wide marketplace registration requires an independently reviewed redirect policy and user consent model.

No promise of financial access is made by pressing Approve: a **separate business-level consent/plan entitlement** must gate every read in `sanad-mcp-secure-v1` (which currently denies all monetary calls). Identity/consent UI alone is not sufficient to enable RPCs.

## Critical shared-auth deployment gate
Supabase's documented OAuth Server settings combine the configured **Site URL** with **Authorization Path** to choose the consent URL. Changing the existing project's global Site URL could change normal SANAD auth redirect behavior. Do **not** change it while the original app is unavailable without a reviewed rollback and an alternative login-redirect plan. In particular, configuring `/oauth/consent` on the currently offline Hetzner app will fail.

Do not enable unaudited **Dynamic Client Registration** initially. Register one explicit private GPT OAuth client with its actual callback, then verify callback/issuer/PKCE from the real ChatGPT configuration (never invent them), and test only the owner identity. Maintain `verify_jwt:true` on the protected function; account for its preflight/discovery behavior separately for future MCP client auto-discovery.

## Acceptance gate
1. Core helper tests and isolated frontend build in CI PASS.
2. A stable HTTPS origin for the consent page is confirmed as owner controlled and affordable; it does not disturb the existing SANAD production app.
3. Owner checks **Authentication > OAuth Server** settings and existing **Site URL**, approving an exact redirect plan. No OAuth server global change until step 2 and rollback are ready.
4. Register a private client with the *actual* callback and verify login→consent→code+state→token exchange; do not disclose tokens to ChatGPT chat or logs.
5. Independently verify a client-origin-bound entitlement and business-specific owner permission in deployed secure function before enabling any real customer, ERP account or ledger retrieval.

Official references: Supabase Auth OAuth 2.1 Server and MCP Authentication documentation. This candidate has no OAuth client registration and is not a verified installed ChatGPT plugin.

## Owner dashboard confirmation — 2026-09-29
Owner supplied screenshots of existing `sanad_verify_v3` production Authentication settings. OAuth Server enable toggle is currently **OFF**. The Site URL is `https://app.sanadflow.com` (presently unreachable due to suspended external hosting), with four existing auth redirect allowlist entries: app wildcard, localhost:3000 wildcard, and the app reset-password and auth-action pages. Supabase dashboard also displays an **outstanding invoices / potential service disruption warning**; confirm billing continuity before depending on Supabase as the sole live integration host. No dashboard setting change has been authorized or made.

**Correct execution order:** (1) settle/assess Supabase service continuity; (2) create and validate independently controlled HTTPS consent host without breaking the app; (3) document plan for OAuth authorization UI given that Supabase concatenates Site URL + Authorization Path and existing Site URL must be preserved unless approved; (4) only then enable OAuth server with rollback plan, register a specific client, and test the actual authorization-code/PKCE consent flow. Do not assume adding a redirect URL alone changes the OAuth consent host. While toggle is OFF, the discovery 404 is expected. The independent secure Edge JWT session smoke remains PASS and does not require OAuth Server to be enabled.
