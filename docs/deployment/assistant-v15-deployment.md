# SANAD Assistant v15 — Deployment Runbook

## Scope

This package prepares the contextual assistant engine and its shadow-evaluation path for deployment. It does **not** switch production WhatsApp traffic from `sanad-v3-whatsapp-assistant` v12.

## Components

- `sanad-v3-assistant-engine`
  - Engine: `sanad-conversation-engine-v3-contextual`
- `sanad-v3-whatsapp-assistant-v13-shadow`
  - Candidate: `sanad-assistant-v15-contextual-engine-candidate`
- `sanad-v3-whatsapp-assistant-v13-shadow-health`
- Migration: `20260727_assistant_v15_deployment_hardening.sql`

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SANAD_INTERNAL_API_KEY`

The Edge Functions use `verify_jwt=false` because they enforce custom internal authentication through `x-sanad-internal-key`. They must not be exposed without that check.

## Deployment order

1. Back up the current production deployment metadata and confirm `sanad-v3-whatsapp-assistant` v12 remains active.
2. Apply `20260727_assistant_v15_deployment_hardening.sql`.
3. Deploy `sanad-v3-assistant-engine` with `verify_jwt=false`.
4. Deploy `sanad-v3-whatsapp-assistant-v13-shadow` with `verify_jwt=false`.
5. Deploy `sanad-v3-whatsapp-assistant-v13-shadow-health` with `verify_jwt=false`.
6. Run engine contract tests and shadow health checks.
7. Confirm media assets remain healthy and WhatsApp production messages continue through v12.
8. Do not promote the candidate until the release gate passes.

## Current gate status

The candidate is staged only. Latest measured shadow indicators before this preparation:

- Semantic intent match: 80%
- Media match: 50%
- Average response similarity: 0.276
- P95 engine latency: 97 ms
- Technical shadow failures: 0 on the latest 30-message batch

`release_gate_passed` remains `false`.

## Server deployment

The web application continues to deploy only from `main`:

- Server repository: `/opt/sanad-app`
- Published root: `/var/www/app.sanadflow.com/html`
- Backups: `/var/backups/sanad-app`

Recommended sequence after this PR is reviewed and merged:

```bash
cd /opt/sanad-app
git fetch origin
git checkout main
git pull --ff-only origin main
npm ci
npm run build
```

Before replacing the published root, create a timestamped backup. Do not deploy from this feature branch directly.

## Rollback

- Keep `sanad-v3-whatsapp-assistant` v12 as the production responder.
- If the contextual engine or shadow checks fail, redeploy the previous Edge Function version or source.
- Set candidate traffic to zero and leave the release status as `candidate` or `rejected`.
- Restore the previous web build from `/var/backups/sanad-app` if the web deployment fails.

## Promotion rule

Production promotion requires all of the following:

- Contract test suite passes.
- No critical safety failures.
- Canary/shadow policy passes its sample and quality thresholds.
- Media delivery and Meta status tracking remain healthy.
- Explicit approval to switch production traffic.
