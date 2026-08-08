# Production Edge Surface Classification — 2026-08-08

This classification is intentionally conservative. It separates endpoints by operational role rather than by name alone.

## Core Production

- `sanad-v3-whatsapp-intake`
- `sanad-v3-analyze-operation`
- `sanad-operation-analysis-worker`
- `sanad-operation-analysis-primary`
- `sanad-operation-preview-worker`
- `sanad-operation-preview-access`
- `sanad-operation-routing-worker`
- `sanad-v3-transactional-message-worker`
- `sanad-file-access`

## Supporting Product Production

Includes active business actions, phone verification, onboarding, reports, knowledge, assistant, print/media and customer-facing application triggers. These remain active pending per-function auth/dependency review.

## Canary / Shadow / Evaluation

Assistant canary/shadow/eval/health endpoints and analyzer/routing shadow orchestration remain active for now. Their names are not sufficient evidence of dead code; they must be retired only after confirming no release gate or monitoring dependency remains.

## Benchmark / Diagnostic

Analyzer/model benchmarks, preview diagnostics and smoke/corpus runners remain a separate cleanup backlog. They should ultimately move off the customer production surface or be strongly gated, but are not retired blindly in this pass.

## Retired

See `supabase/functions/production-retired.json` and `docs/releases/production-cleanup-2026-08-08.md`.

## Rule

Production Pilot must not depend on any endpoint classified Retired. Core and Supporting functions must be the only customer-path dependencies. Canary/Shadow and Benchmark/Diagnostic functions may exist only if they are explicitly gated and have a documented owner/purpose.
