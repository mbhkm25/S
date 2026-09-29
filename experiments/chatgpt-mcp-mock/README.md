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
