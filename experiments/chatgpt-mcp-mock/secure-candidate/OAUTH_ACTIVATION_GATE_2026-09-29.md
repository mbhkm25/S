# SANAD — OAuth activation design and consent acceptance gate (2026-09-29)
**Status:** DESIGN ONLY; shared Supabase Auth settings and protected function access remain unchanged.

## What is verified
- Existing Supabase project independently hosts the unauthenticated **synthetic-only** `sanad-mcp-demo` and the separate `sanad-mcp-secure-v1`.
- The latter's deployment v1 has `verify_jwt:true`. It verifies the bearer identity through the same project's `/auth/v1/user`, advertises four proposed read-only tools after authenticated initialization, and rejects **every** financial tool call, even from a verified owner. Neither protected REST nor MCP calls run actual accounting RPCs.
- Credential-free GitHub CI made real Internet calls: demo health says `demonstration_only:true`, `production_connected:false`; anonymous, malformed-token and forged-identity-header calls to the protected MCP endpoint each received 401 and no financial payload.
- Offline CI passed 31 Node tests and 11 Deno handler tests. **Real signed-in OAuth handshake remains untested.**

## OAuth interoperability work before activation
1. Decide client surface explicitly: near-term private GPT Actions (manually configured OAuth provider) versus portable remote MCP plugin (automatic metadata discovery), then test each independently. A working Actions schema does not prove MCP plugin availability in ordinary Chat.
2. Review **official Supabase Auth OAuth 2.1 server** configuration. Supabase documents authorization-code + PKCE, an owner-controlled authorization/consent UI, standard discovery, and OAuth JWTs respecting existing RLS. Enable only after the owner approves the application's consent text, callbacks, verified redirect URI, scope and client policy. Do not put any authorization code, JWT, refresh token or service-role key into ChatGPT messages, git, screenshots or CI logs.
3. The current `verify_jwt:true` platform gateway correctly denies anonymous data calls; it may also intercept unauthenticated MCP protected-resource discovery. A remote MCP implementation needs compliant unauthenticated resource metadata, a 401 challenge with metadata as appropriate, and Auth discovery/registration routes. Do not turn off gateway JWT enforcement solely to display metadata; design and test a separately scoped public metadata endpoint or a properly audited custom-auth front door first. Confirm actual ChatGPT compatibility instead of assuming it.
4. Verify OAuth access tokens from the correct Supabase issuer, current user subject, client identity/audience and authorized app. A regular SANAD session JWT should not automatically imply third-party consent. Server-side consent and plan entitlement must be bound to both actor and OAuth client and revalidated before *each* business data read.
5. The **first pilot is owner-only**. Repository migrations `20260917174600_financial_rpc_authorization_hardening_v3.sql` and `20260918141500_erp_customer_statement_read_model_v1.sql` show underlying financial RPC eligibility includes owner OR any active team member. `is_business_owner_v1` must therefore be independently enforced before each owner-pilot call; the offline adapter already demonstrates the intended check with stub transport. Inspect the *actual deployed SQL* and user-token RLS before wiring.
6. When owner approves an isolated authenticated test, obtain the user JWT inside their trusted local/browser session without displaying it. Test initialize, listing, blocked financial calls, token expiry, logout/revocation, unrelated business and REST/MCP consistency. Do not test with customer data or publish the private GPT.

## Follow-on production readiness
A separate server-side consent/entitlement store or verified compatible existing SANAD records is required; the current offline policy's `financialReadGrant` and `entitlement.active` values are **not** backed by real database grants. Rate limits, audit, short timeouts, freshness, ERP reconciliation and precision checks must pass before the `owner-only-reader.mjs` prototype is wired into the deployed handler. Keep the deployed version deny-all until then.

References: Supabase Auth OAuth 2.1 Server guide and MCP Authentication guide in official Supabase documentation. These references are architectural guidance, not evidence that the setting is active in this account.

## Browser preflight finding and real-session smoke test
A credential-free GitHub Actions OPTIONS probe of the live secure MCP endpoint from the SANAD app origin returned HTTP **401** without CORS allow-origin headers. Therefore a browser-console cross-origin POST cannot currently test this deployment: the Edge JWT gateway blocks preflight before the function. Do not weaken `verify_jwt:true` just to pass a browser test. Instead run a local PowerShell smoke from the owner's signed-in workstation, loading a short-lived existing SANAD access token from the local clipboard and clearing the clipboard immediately. The script must never print, upload, commit or log the token. Test real-session initialize and tools/list, followed by both MCP and REST calls that must still deny all financial reads. Do not interpret this direct SANAD-session test as proof that the ChatGPT OAuth 2.1 consent handshake works; that remains a separate later gate.

## Live authenticated session smoke — owner-reported 2026-09-29
Owner executed the direct-Supabase PowerShell smoke on their own Windows machine after their Hetzner-hosted app became unavailable. A regular SANAD email/password session against Supabase Auth succeeded without needing the SANAD application; token was deliberately omitted from shared output. Observed output:
- SIGN_IN PASS
- Authenticated MCP initialize PASS, HTTP 200
- Authenticated MCP tools/list PASS, HTTP 200
- Protected MCP tools/call denied as intended PASS, HTTP 200 (JSON-RPC error contained in a successful HTTP transport response; HTTP 200 is **not financial access approval**)
- Protected REST execute denied as intended PASS, HTTP 403
- Summary: **4/4 service checks PASS** after sign-in; user-supplied local execution output, not an independently inspected token or backend authorization audit.

**Decision:** Signed-in Supabase user token is accepted by deployed secure function; it still blocks all financial reads. This test does not prove OAuth authorization-code/PKCE, third-party per-client consent, token revocation, subscriptions, business tenant scoping under live data, or ChatGPT plugin connection. Do not commit user login details, share access tokens or connect production ERP yet. Next independent gate: configure/test third-party OAuth client with a trusted consent UI, and verify client identity plus per-business consent/entitlement before enabling owner-only RPC adapter. Existing app hosting outage need not block the Supabase-only adapter development, but its login UI requires an independent authorization route for OAuth.
