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

## Cloudflare Pages staging procedure — existing Namecheap DNS preserved
Owner confirmed direct access to Namecheap Advanced DNS. Screenshot showed existing A records for `@`, `admin`, `app`, `ibex`, and `lab` pointing to the suspended server. **Do not delete/edit those records, change nameservers or replace the root website.** The candidate consent UI now includes `public/_redirects` to serve `/oauth/consent` and restrictive `public/_headers`; Vite copies both into its `dist` output.

**Create a separate Pages project from GitHub** (not a SANAD main-branch redeployment):
- Connect private repository `mbhkm25/S` with limited repository-specific GitHub access.
- Suggested new Pages project name: `sanad-auth-pilot` (subject to actual availability).
- Production branch: `experiment/sanad-chatgpt-mcp-mock-20260929` **only for this independent pilot Pages project**. It does not merge SANAD's main branch or trigger the old production app.
- Root directory: `experiments/chatgpt-mcp-mock/oauth-consent`
- Build command: `npm install --no-audit --no-fund && npm run build`
- Build output directory: `dist`
- Environment: `NODE_VERSION=22`; `VITE_SUPABASE_URL=https://hudbzlgclghlhazlduas.supabase.co`; `VITE_SUPABASE_PUBLISHABLE_KEY` may be entered **privately** as the project's **public publishable client key** in the Pages dashboard. Do **not** supply service-role keys. Leave `VITE_OAUTH_CALLBACK_URL` unset until the exact independently verified OAuth client callback is known, so the site remains inert during hosting validation.
- Verify the generated `*.pages.dev` hostname and GET `/oauth/consent` serve the same static HTML over HTTPS with security headers. The app intentionally reports an incomplete setup without an authorization ID and callback configuration.

**Only after successful Pages staging and approval**, in Cloudflare Pages > Custom domains register `auth.sanadflow.com`. Copy the actual Pages project's `<assigned-name>.pages.dev` hostname from Cloudflare's dashboard. Then in Namecheap Advanced DNS add one NEW `CNAME` with Host `auth`, Value set to that **actual assigned Pages hostname**, TTL Automatic. Never guess the target hostname or add CNAME before registering the domain in Pages. Since Namecheap serves current DNS, there is no requirement to move existing nameservers to Cloudflare to serve only this subdomain. Check whether an existing `auth` record is hidden behind Show More before adding anything.

**OAuth caveat:** With the existing Supabase Site URL `https://app.sanadflow.com`, setting Authorization Path `/oauth/consent` would still redirect to `https://app.sanadflow.com/oauth/consent` (offline), NOT automatically to the new `auth.sanadflow.com`. Do not enable OAuth until we choose and approve a safe, reversible Site URL strategy; adding the new DNS CNAME alone does not solve that. The Cloudflare Pages deployment is an isolated hosting verification, not permission to modify global Supabase Auth settings.

## DNS and consent-route verification / required OAuth Site URL cutover
Owner has verified external DNS at Google and Cloudflare resolvers: `auth.sanadflow.com CNAME sanad-auth-pilot.pages.dev`; Cloudflare dashboard shows **Active** and **SSL enabled**. Live curl shows `GET /oauth/consent?authorization_id=<dummy>` returns **308** redirect to `/?authorization_id=<same dummy>`, and the root returns **200** with the SANAD consent-page HTML. Therefore Cloudflare's existing redirect is not dropping the authorization identifier; **do not alter _redirects or DNS solely because HTTP 308 appears**. Future real flow should be tested with browser query preservation and a genuine server-issued authorization ID after enabling OAuth.

**Root cause still outstanding:** the existing Supabase OAuth Server switch is OFF and its `Site URL` is `https://app.sanadflow.com`, which is offline. Official Supabase documentation states the configured OAuth **Authorization Path is appended to Site URL**, so enabling `/oauth/consent` without revising Site URL would send users to the unavailable app. Adding `auth.sanadflow.com` to ordinary redirect allowlist does **not** fix the OAuth authorization-page URL.

**Controlled single-project cutover option requiring explicit dashboard action and rollback** (do not perform automatically):
1. Check billing/service continuity first. Confirm custom Pages host returns the consent HTML at root and preserves `authorization_id` on redirect.
2. Before changing Site URL, independently verify all known legacy authentication callback code. At repository snapshot, `src/components/Auth.tsx` explicitly sets `emailRedirectTo: getEmailActionUrl('signup')` for sign-up and `redirectTo: recoveryUrl` for password reset; both derive from the existing app origin when app is available. This **does not prove every third-party/magic-link/invitation/email-template path is explicit**. Audit templates, login providers and Auth Hooks before global change.
3. Snapshot exact prechange auth config: original Site URL `https://app.sanadflow.com` and all four existing redirect allowlist entries; preserve all entries. Add only a **specific** `https://auth.sanadflow.com/oauth/consent` redirect if required for any ordinary Auth callback (distinct from OAuth Server app-client callbacks). Avoid wildcarding the new auth host.
4. Once independently reviewed and owner approves impact on fallback email redirects, set shared Supabase **Site URL** to `https://auth.sanadflow.com`, and enable OAuth Server with Authorization Path `/oauth/consent`. Do not enable dynamic registration for first private-client pilot. This is a **shared global auth setting change** and will change fallback/default links until reversed.
5. From the private GPT's actual OAuth configuration, obtain and **verify** its OAuth redirect URI and register exactly one controlled test client. Configure Cloudflare Pages build-time `VITE_SUPABASE_URL`, public `VITE_SUPABASE_PUBLISHABLE_KEY` and exact `VITE_OAUTH_CALLBACK_URL` for that client; never add service-role credentials or reveal a private client secret. Trigger Pages redeployment to inject Vite variables.
6. Test issuer discovery, real authorization code + S256 PKCE, signed-in consent, denial, callback state, and subsequent secured MCP deny-all response. Real data must stay OFF.
7. **Rollback** if any login, reset link, confirmation email, callback, consent or old-app restoration test fails: switch OAuth Server OFF; restore original Site URL exactly `https://app.sanadflow.com`; retain existing old callback allowlist. Re-test direct Supabase Auth and the private deny-all MCP endpoint. Do not modify original application DNS.

**Important:** OAuth client registry redirect URLs and ordinary Auth `Redirect URLs` serve different purposes; the exact ChatGPT callback is not yet available and cannot be invented. This cutover is an available path, not a completed change.
