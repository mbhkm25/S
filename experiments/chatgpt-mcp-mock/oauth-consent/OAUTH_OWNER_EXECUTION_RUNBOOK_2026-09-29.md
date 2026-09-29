# SANAD OAuth private-client cutover — actionable readiness checklist
Date: 2026-09-29. **STAGED ONLY — no Supabase global auth setting change.**

## Verified state
- Domain `auth.sanadflow.com`: owner showed Cloudflare **Active / SSL enabled**, public DNS resolvers match `sanad-auth-pilot.pages.dev`.
- Automated hosted-route test confirms `/oauth/consent?authorization_id=probe_123456789` redirects 308 to `/?authorization_id=probe_123456789` and serves the SANAD consent page with HTTP 200. URL parameter is **preserved**; no redirect code change required.
- Direct, owner-run **Supabase session** successfully initialized protected MCP and listed tools; protected MCP and REST **denied real financial calls**. This is NOT third-party OAuth.
- Supabase OAuth Server toggle was shown **OFF**. Existing global Site URL is `https://app.sanadflow.com` (old app offline), and the older explicit redirect allowlist contains the app wildcard, localhost wildcard, app reset-password and auth-action pages. Supabase OAuth's Authorization Path is appended to Site URL.
- Latest separate one-operation private GPT smoke schema: `../secure-candidate/gpt-actions-deny-all.openapi.yaml`. It targets **only** the protected `/execute`, whose intentional result is HTTP 403. **Do not replace existing synthetic 4-action GPT**.

## Not yet safe to activate
- The original Supabase project's global Site URL controls *fallback* Auth redirects and email template `SiteURL` behavior, not merely OAuth consent. A cutover to the new host may redirect some old flows to the wrong page when the app returns. Existing `src/components/Auth.tsx` explicitly sets signup email callback `auth-action.html` and password recovery `reset-password.html` relative to the old app; this helps but is not proof for invite, magic links, email templates, admin tools or third-party callbacks.
- The Pages consent frontend still requires **build-time browser-only config**, the actual **registered callback URI**, and a real OAuth client. A publicly working static HTML page is not a verified login/consent flow.
- OIDC discovery returning HTTP 200 does not demonstrate OAuth Server enablement; documented OAuth authorization-server metadata returned 404 when disabled. The password-based direct Auth test must not be confused with OAuth authorization-code+PKCE.
- Supabase dashboard shows outstanding invoices; owner should verify the service will remain available before making it the sole auth host.

## Safe execution order (owner-present change window)
1. Preserve existing Supabase Site URL, all allowlisted redirects, and current Cloudflare deployment config. Do **not** edit domain DNS.
2. In ChatGPT create a **separate private test GPT Action** importing the deny-all schema; leave the successful synthetic GPT untouched. Its settings require real client ID, secret, authorization URL, token URL, scope and callback. Do not invent the callback; the editor exposes it after sufficient configuration. If unavailable, register a temporary isolated test app with a known and verified callback first and test Supabase, or use the existing native-plugin MCP test track.
3. Validate the exact callback against the actual client UI. Supabase Auth OAuth Server settings should keep dynamic registration **OFF** for the initial single-client pilot; use a manually registered confidential client if supported and keep its secret only in credential UI.
4. Get explicit approval for temporary global Site URL cutover from old `https://app.sanadflow.com` to `https://auth.sanadflow.com`. Set Authorization Path `/oauth/consent` **only after** browser-only Pages config, a registered test client and safe rollback plan are ready. As old app hosting is suspended, rollback must remain possible from Supabase dashboard alone.
5. Cloudflare Pages build-time PUBLIC variables: `VITE_SUPABASE_URL=https://hudbzlgclghlhazlduas.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY=<publishable browser key added privately by owner>`, `VITE_OAUTH_CALLBACK_URL=<exact registered test-client callback>`. **Never** use a service-role, secret, refresh token or password in Pages env or git.
6. Test (a) OAuth discovery and PKCE S256; (b) browser login at consent host; (c) deny path; (d) approve path, code and state preserved; (e) token exchange by client; (f) authenticated protected `/execute` still responds 403; (g) original explicit password reset/signup callback paths and fallback behavior when app is restored. **Stop on mismatch**.
7. Restore old Site URL, switch OAuth Server OFF, and recheck direct authenticated deny-only MCP if any of these fail. Never connect customer/ERP RPCs as part of this exercise.

## GPT Actions private test configuration (when manually registered client exists)
- Authorization URL: `https://hudbzlgclghlhazlduas.supabase.co/auth/v1/oauth/authorize`
- Token URL: `https://hudbzlgclghlhazlduas.supabase.co/auth/v1/oauth/token`
- Scope for minimal test: `email`; avoid requesting `openid` until signing-key compatibility is reviewed (Supabase requires asymmetric signing keys for ID tokens).
- Token exchange method: HTTP POST as supported by ChatGPT and the registered OAuth client.
- Client ID and Client Secret: **only** from the registered app; never invent or include them in repo/chat.
- The private test GPT Action can only attempt the deny-only `testSanadProtectedReadDenial` tool. Its successful test is **403 and zero financial data**, not a customer statement.

## Longer-term compatibility
Official OpenAI docs now describe migration from custom GPTs toward Plugins; the GPT Actions pilot is a short-lived interoperability check. Preserve MCP server contracts as the main reusable backend; native plugin connectivity and compliant MCP metadata/resource challenges remain independently unverified.

## Owner authorization recorded — 2026-09-29
The owner explicitly approved changing Supabase Site URL and enabling OAuth under the reversible procedure. **This records authorization, not execution:** existing available Supabase connector capabilities do not include writing Auth Site URL or toggling OAuth Server. Neither was changed in this commit; the owner must make the two dashboard updates. Safe order: enable OAuth Server first while retaining the old Site URL and disabling dynamic registration; confirm discovery. Set or validate the Pages browser-only publishable key and actual registered client callback; ONLY THEN perform the approved short Site URL cutover in an attended test window, and check behavior before approving any authorization. Roll back if legacy account recovery/default redirects break. Supabase project currently has an enabled modern public publishable key (value deliberately omitted); do not use a service-role credential in Pages. Do not assume GPT callback details until the interface provides them.
