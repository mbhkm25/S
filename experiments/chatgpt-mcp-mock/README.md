# SANAD ↔ ChatGPT MCP — isolated synthetic proof of concept
**Status:** Unreleased experiment. These tools use fabricated data only; no login, commercial contract, source synchronization or real ERP access is implemented. The source tree intentionally contains **no Supabase or Edaa credentials** and never calls Gemini or OpenAI APIs.

## Goal
Validate whether ChatGPT can call four SANAD-style read tools and answer Arabic follow-up questions using synthetic, deterministic account data. This prototype does **not** validate customer OAuth, ChatGPT account entitlements, production accuracy, app review, operational cost or a commercial launch.

## Local prerequisites
- Node.js 20+ and npm.
- In this folder run: `npm install`, `npm test`, `npm start`.
- Health endpoint: http://127.0.0.1:8787/ ; MCP: http://127.0.0.1:8787/mcp.
- Run `npx @modelcontextprotocol/inspector@latest`; choose Streamable HTTP and connect to the MCP address. Test all four tools and invalid IDs.

## ChatGPT-only synthetic connectivity test
Follow OpenAI's current Plugins quickstart: https://developers.openai.com/plugins/quickstart and MCP guide: https://developers.openai.com/plugins/build/app-quickstart.
Only after local tests pass, optionally expose **this synthetic-only local server** through a temporary HTTPS tunnel (for example `ngrok http 8787`). Add the tunnel URL suffixed with `/mcp` in a personal developer-mode plugin, where available. Use your own session and explicitly verify tool outputs say `demonstration_only`. The tunnel makes the unauthenticated **synthetic mock** publicly reachable; terminate the tunnel after testing. **Never add real data or real credentials to this unauthenticated server**.

Suggested questions:
1. «يا سند، ما الأنشطة التجريبية المتاحة؟»
2. «ما حالة المزامنة للنشاط demo-business-001؟»
3. «ابحث عن الحساب 1001، ثم أعطني كشفه وبيّن الرصيد النهائي ومصدر الأرقام.»

Expected statement: opening 1000 SAR, +250 sale, -400 receipt, closing 850 SAR. Every response must say synthetic/demo, no actual ERP connection.

## Next gate (NOT implemented in this branch)
- Review current SANAD canonical read RPCs and tenant/role contracts; map proposed tools to existing APIs without duplicating accounting calculations.
- Build a **different authenticated production-grade adapter** with OAuth 2.1 and per-request bearer-token validation. Recheck business and relationship permissions server-side on every call; no project IDs or ERP AccountIDs may be inferred from natural language alone.
- Ensure account/customer self-service is blocked without explicit audited SANAD user↔business party↔ERP AccountID binding. Preserve read-only Bridge.
- Restrict tool scopes and minimize financial payload; source/version/freshness and audit in each result. Unit economics and real permissions require authenticated acceptance tests.
- Review existing production release PR #424 independently. This isolated experiment must not ship with the SANAD web release or change `SANAD.md` ahead of its Library checkpoint.
- Before connecting live: explicit owner approval after security threat model, negative cross-tenant tests, pilot consent, privacy policy and separate staging deployment.

## Branch isolation
Started from GitHub main `064e8e113924a7f14c6e62b51fd0a0daf54add82` (business-first docs #425). Keep existing local Antigravity branch `stage2d/business-operations-antigravity` undisturbed. This branch changes only `experiments/chatgpt-mcp-mock/`. Merge is optional and **not needed** to try the branch locally.

## GitHub Actions: isolated server deployment (not automatic)
The main SANAD deployment workflow does not publish MCP. This experiment adds:
- `.github/workflows/sanad-mcp-demo.yml`: synthetic unit + real HTTP MCP handshake tests on the PR.
- `.github/workflows/deploy-sanad-mcp-demo.yml`: **manual workflow_dispatch only**, once merged and separately approved. It never calls `sanad-deploy-production`, applies migrations or deploys Edge functions.

Before the manual deployment, an operator must configure a **dedicated HTTPS subdomain** and isolated reverse-proxy route to `127.0.0.1:8787` on the intended SSH host. Do not point DNS at the main production web hostname or modify the production app route. Use a dedicated limited SSH account with Node.js 22+, npm, a systemd user manager and user lingering configured; check this independently on the host. No sudo access is required by the deployment script. Use HTTPS and a valid certificate.

Create a GitHub Actions environment named `mcp-demo` and configure its protections. Add these environment secrets (do not commit their values):
- `MCP_DEMO_SSH_HOST` and `MCP_DEMO_SSH_USER`: isolated deployment SSH target.
- `MCP_DEMO_SSH_PORT`: optional SSH port (defaults to 22).
- `MCP_DEMO_SSH_KEY` and `MCP_DEMO_SSH_KNOWN_HOSTS`: dedicated deploy key and pinned SSH host public key.
- `MCP_DEMO_PUBLIC_URL`: HTTPS **origin** only (e.g. `https://mcp-demo.example.com`, **without** `/mcp`).

Once the PR's **MCP-specific** test is green, merge only after owner approval. In GitHub Actions, run `Deploy isolated SANAD MCP synthetic demo` from the default branch, leaving the optional release SHA empty. The workflow packages the mock, deploys it as `$HOME/sanad-mcp-demo` under the dedicated account, starts `sanad-mcp-demo.service` as a **user service** bound to loopback only, and checks the public HTTPS health response. If infrastructure/secrets are missing, it fails closed instead of deploying to the production application.

Only after the public health check passes, connect `MCP_DEMO_PUBLIC_URL/mcp` to a **private** ChatGPT plugin/developer connection if that feature is available to this account. The mock endpoint has no authentication and is appropriate for fabricated fixtures **only**. Do not add real customer data or financial credentials to it.

To stop: `systemctl --user stop sanad-mcp-demo.service` on the isolated SSH account. To restore the previous release, inspect `$HOME/sanad-mcp-demo/releases`, repoint the `current` symlink, then restart that dedicated service. This is independent of SANAD Web, Edge, and Bridge rollbacks.

## Private custom GPT trial on ChatGPT Plus (GPT Actions, not Plugins)
This experiment also exposes **synthetic-only REST routes** for the existing custom GPT Actions editor:
- `GET /gpt-demo/businesses`
- `GET /gpt-demo/sync?business_id=demo-business-001`
- `GET /gpt-demo/customers?business_id=demo-business-001&query=1001`
- `GET /gpt-demo/statement?business_id=demo-business-001&account_id=1001`

Do **not** paste `/mcp` in the GPT Actions editor. Actions uses **OpenAPI REST**, while the independent `/mcp` route remains available for Plugins/MCP.

To try an existing *editable* custom GPT on Plus:
1. Fetch the latest experiment branch, stop and restart the local Node server to activate REST routes, and keep the Cloudflare tunnel running. A restarted tunnel may have a new hostname.
2. Test from another PowerShell window: `Invoke-RestMethod "https://YOUR-TUNNEL.trycloudflare.com/gpt-demo/statement?business_id=demo-business-001&account_id=1001"`; ensure 850 SAR and `demonstration_only=true`.
3. Open the existing GPT editor -> Configure -> Actions -> Create new action. Choose **Authentication: None** for this synthetic fixture only.
4. Copy the contents of `openapi-gpt-actions.json` into the OpenAPI schema editor; replace the placeholder server URL with the **current** Cloudflare HTTPS tunnel origin (no `/mcp`).
5. Preview your private GPT with the prompt: «استخدم إجراءات سند: ابحث عن الحساب 1001 في demo-business-001 ثم استخرج كشف حسابه، وأكد أنها بيانات تجريبية». Verify the model calls the actual `sanadDemo...` Action and returns opening 1000, sale +250, receipt -400, closing 850 SAR. Do not assume a plausible text answer proves an Action ran.

**Current product warning:** Custom GPTs are scheduled to retire and migrate to Plugins. GPT custom Actions are **not** transferred automatically to migrated plugins. This REST adapter is a short-lived **private proof of concept**, not our long-term distribution architecture. Preserve the existing MCP route for the future product.

**Security:** `None` authentication is acceptable only because these routes have *synthetic fabricated fixtures and no production imports*. Never expose a real financial API through these unauthenticated endpoints, and never publish/share the GPT until independent authentication, privacy and policy review.

## Stable synthetic-only MCP experiment on Supabase Edge Functions (September 29, 2026)

An **independent new function** was deployed to the existing Supabase project `sanad_verify_v3`, slug `sanad-mcp-demo`, version 1. It has **no imports from the production database, Supabase client, credentials, Edaa, or any real account**. All outputs are hard-coded fabricated fixtures and explicitly flagged as synthetic. The original production functions and database were not changed. Because this POC is unauthenticated, **NEVER put production data or credentials inside it**. Hosting on the existing project can still incur platform usage and quota consumption.

Public demo health endpoint:
`https://hudbzlgclghlhazlduas.supabase.co/functions/v1/sanad-mcp-demo/health`

MCP Streamable HTTP endpoint:
`https://hudbzlgclghlhazlduas.supabase.co/functions/v1/sanad-mcp-demo/mcp`

Code: `supabase-edge/index.ts` and `supabase-edge/deno.json`. Do not connect Supabase's *administrative* MCP server to customer-facing agents; this is SANAD's own four-tool, synthetic-only function.

After fetching the experiment branch and running `npm install` inside this isolated experiment folder:
```powershell
node .\\test-supabase-remote.mjs
```
This verifies real public-network HTTP health, MCP initialization, dynamic tool discovery and calls **each** of the four tools; the statement balance must be SAR 850. Successful deployment status alone is not a remote smoke test, and a connected MCP client does **not** by itself establish that ChatGPT exposes it inside normal conversations.

To point the already-private SANAD plugin at this endpoint, update its **`mcp.json` and `.mcp.json` URLs** from the disposable Cloudflare tunnel to the fixed URL above and increment the plugin version. Do this only after the remote smoke test succeeds. This change does not automatically solve model-side/plugin tool availability; test that separately using a fresh ChatGPT Work task. Do not merge the experiment PR or trigger production app deployment as part of this POC.

Future real access gate: OAuth 2.1, authenticated user binding, per-business access isolation, authorization on every tool call, auditing, and approved data contracts. The live-data implementation should be a separate function/release.
