# Production Cleanup — CLOSED CANDIDATE — 2026-08-08

## Outcome

Production cleanup follows the closed Production Security Hardening gate. The cleanup reduces historical Edge Function surface without changing customer data or retiring the current SANAD operation pipeline.

## Preserved Core Production

- `sanad-v3-whatsapp-intake`
- `sanad-v3-analyze-operation`
- `sanad-operation-analysis-worker`
- `sanad-operation-analysis-primary`
- `sanad-operation-preview-worker`
- `sanad-operation-preview-access`
- `sanad-operation-routing-worker`
- `sanad-v3-transactional-message-worker`
- `sanad-file-access`

Customer-facing Supporting Production functions for business actions, onboarding, phone verification, reports, knowledge, assistant, media/print and application triggers are also preserved.

## Retired Production surface

Twenty-nine historical one-shot, test, dry-run, session-specific, assistant canary/shadow/eval, and obsolete analyzer candidate endpoints were replaced in Supabase Production with deterministic HTTP `410 retired_production_cleanup` tombstones and JWT verification enabled. The canonical list is `supabase/functions/production-retired.json`.

No customer rows were changed. No current operation-pipeline worker was retired.

## Intentionally retained engineering surface

Reusable model/analyzer benchmark and diagnostic endpoints, plus authenticated analyzer/routing shadow tools, remain as engineering-only surfaces. They are not customer-path dependencies and must remain strongly gated. Their presence is intentional rather than production debt requiring blind removal.

## Source hygiene

The completed one-shot workflow that enabled Supabase leaked-password protection is removed after successful execution. It must not remain as a long-lived production workflow.

## Closure criteria

Production Cleanup is closed when this final source-of-truth change is merged into `main`, required GitHub checks are green, and the result is recorded in SANAD OS.
