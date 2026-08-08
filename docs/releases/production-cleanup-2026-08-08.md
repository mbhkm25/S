# Production Cleanup — 2026-08-08

## Scope

Production cleanup performed after closure of the Production Security Hardening gate. The objective is to reduce historical Edge Function surface without touching current SANAD operation-pipeline workers or customer data.

## Production core — preserve

The following current pipeline functions are explicitly out of cleanup scope and must remain active:

- `sanad-v3-whatsapp-intake`
- `sanad-v3-analyze-operation`
- `sanad-operation-analysis-worker`
- `sanad-operation-analysis-primary`
- `sanad-operation-preview-worker`
- `sanad-operation-preview-access`
- `sanad-operation-routing-worker`
- `sanad-v3-transactional-message-worker`

Product-facing functions such as business actions, phone verification, reporting, file access, WhatsApp assistant, knowledge and onboarding are also not retired merely because `verify_jwt=false`; their custom authentication/application role must be reviewed independently.

## Retired in Production in this cleanup pass

Each endpoint below was a historical one-shot/test/dry-run/session-specific deployment. Its old implementation has been replaced in Production with a deterministic HTTP `410 retired_production_cleanup` tombstone and JWT verification enabled.

1. `sanad-operation-600-reprocess-once`
2. `sanad-operation-600-v24-run-once`
3. `sanad-reanalyze-operation-220-once`
4. `sanad-preview-inspect-once`
5. `sanad-report-delivery-dry-run`
6. `sanad-report-delivery-fixed-dry-run`
7. `sanad-v3-process-report-v2-test`
8. `sanad-preview-v4-test-runner`
9. `sanad-report-retry-2f0e09db`
10. `sanad-report-v2-1-visual-test`
11. `sanad-shadow-batch-20260806`
12. `sanad-contract-fix-validation`

No customer rows were changed. No current operation pipeline worker was retired.

## Already retired by Production Security Hardening

The nine historical high-risk endpoints retired in the preceding security gate remain tombstoned and are not re-enabled by this cleanup.

## Deferred classification — do not retire blindly

The following classes remain active until their references and intended use are explicitly classified:

- reusable analyzer/model benchmark functions;
- assistant canary/shadow/eval/health functions;
- routing/analyzer shadow orchestration and smoke runners;
- preview diagnostics;
- current report worker variants;
- candidate/recovery functions protected by internal authorization.

These are operational-surface debt, but not automatically dead code. A function name containing `test`, `preview`, `benchmark`, `shadow`, or `candidate` is not sufficient evidence to retire it.

## Cleanup gate

Production Cleanup can be considered closed only when:

1. current production Edge Functions are classified into Core / Supporting / Canary-Shadow / Benchmark-Diagnostic / Retired;
2. historical one-shot/test endpoints with no live dependency are tombstoned or removed from deployment;
3. GitHub and Production state are reconciled;
4. production quality/security checks are green;
5. SANAD OS is updated with the final inventory and remaining intentional non-core surface.
