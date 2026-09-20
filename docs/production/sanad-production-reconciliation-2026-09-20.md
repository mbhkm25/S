# SANAD Production Reconciliation — 2026-09-20

Status: **Merged; awaiting Production deployment**

## Release lineage

Combined feature PR: **#340 — SANAD refinement — Phases 2–4**

Feature merge commit:

`ac9e11ba20e4d8a5ecf0dc9553225cfa211a76d9`

The final Production deployment SHA is the current `main` after this documentation-only reconciliation is merged.

## Scope merged

The combined release contains:

- Phase 2 — Noto Sans Arabic local variable WOFF2, professional typography scale, reduced Agent card density, bounded conversation scroll and sticky composer;
- Phase 3 — Product Shell SPA navigation, route-level code splitting, legacy-runtime isolation, interaction prefetch, Lucide vendor reduction and production bundle budgets;
- Phase 4 — SANAD Fluid Orb states, Canvas 2D + CSS fallback, reduced-motion handling, voice/Agent event state mapping and final accessibility polish.

## Production backend reconciliation

PR #340 changed **no Supabase migration file and no Supabase Edge Function source**.

Production Supabase remains the backend source of truth.

Verified immediately before merge:

- project: `sanad_verify_v3`
- project ref: `hudbzlgclghlhazlduas`
- status: `ACTIVE_HEALTHY`
- PostgreSQL: 17
- required migrations present:
  - `20260920071058_sanad_agent_workspace_v2`
  - `20260920121801_sanad_agent_message_feedback_v1`
  - `20260920121807_sanad_agent_attachments_v1`
  - `20260920121815_sanad_agent_actions_v1`
  - `20260920121821_sanad_agent_observability_v1`
- required Edge Functions active with JWT verification:
  - `sanad-ai-agent-v1`
  - `sanad-ai-transcribe-v1`
  - `sanad-ai-attachment-analyze-v1`
- private bucket `sanad-agent-attachments` exists with 20 MiB file limit;
- required Agent attachment/action/performance RPCs are present;
- required Agent table/storage policies are present.

## Deployment reconciliation

The Production workflow in `.github/workflows/deploy-production.yml` is the release path.

It verifies before SSH deployment:

1. requested SHA exists on `main`;
2. TypeScript and route contracts pass;
3. production build succeeds;
4. production bundle budget passes;
5. Agent backend migrations are aligned in Production;
6. required Agent Edge Functions exist;
7. the server deploy helper publishes the selected release;
8. the app URL and release artifacts are verified.

The workflow does **not** deploy on every merge. Normal release uses `workflow_dispatch`.

## Cross-production compatibility

- Edaa/Bridge contract remains read-only.
- Windows Bridge is still covered by the Production Quality Gate.
- No Edaa schema/write behavior was changed by this release.
- Supabase schema and Agent function runtime were not mutated by PR #340.
- Product navigation retains a safe document-navigation boundary when crossing from legacy runtime screens into the new Product Shell.
- Android build remains covered by the dedicated APK workflow and the production asset build.
- Agent action governance remains:
  `Intent -> Draft -> Review -> Explicit UI approval -> deterministic SANAD command -> audit`.

## Required post-deployment acceptance

After the operator deploys current `main`, validate together:

1. the four primary product areas switch without unintended full reload inside Product Shell;
2. legacy-to-Product-Shell crossing still works;
3. Noto Sans Arabic loads locally and typography hierarchy is correct;
4. composer remains fixed within the Agent workspace while messages scroll;
5. voice: record -> transcribe -> editable text;
6. attachment: select -> upload -> analyze without schema-cache/bucket errors;
7. Fluid Orb states: idle, listening, thinking, executing, success;
8. statement/document structured results;
9. Draft action review and explicit approval path;
10. PWA and Android critical navigation paths.

Production should not be considered acceptance-complete until these checks pass on the deployed release.
