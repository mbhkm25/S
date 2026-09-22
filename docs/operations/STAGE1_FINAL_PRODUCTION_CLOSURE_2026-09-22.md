# SANAD Stage 1 — Final Production Closure Record

**Closure date:** 2026-09-22  
**Repository:** `mbhkm25/S`  
**Production:** `https://app.sanadflow.com`  
**Supabase Production:** `hudbzlgclghlhazlduas`  
**Stage 1 functional production baseline:** `7c2460169c0eb05279d4828b5fe7e0d3509c8c03`

## Final judgment

`STAGE 1 CLOSED`

No Stage 2 work is included in this record.

## Production smoke

| Area | Result | Closure evidence |
|---|---|---|
| Voice | PASS | Live Production dictation succeeded; text inserted into Composer without auto-send. Server metrics recorded completed `voice_transcription` runs. |
| Assistant / message ordering | PASS | No null/non-positive/duplicate sequence numbers, no counter mismatch, no adjacency violations in Production. |
| Sidebar scrolling | PASS | Stage 1G hotfix deployed; independent scroll regions and `min-h-0 / overflow-y-auto` contract remain unchanged in Production frontend baseline. |
| Settings persistence | PASS | Production preferences exist, have persisted updates, and contain no null preference flags. |
| Assistant Identity | PASS | Unified identity/state contract is present and Quality Gate is green. |
| `assistantState` production negative check | PASS | Preview state is disabled unless explicit preview mode is enabled; production deploy contract contains no preview injection. |
| Error/status presentation | PASS | Stage 1G hotfix status layer contract deployed and unchanged after Voice-only backend work. |
| Primary rail active state | PASS | Deployed selected-state contrast contract and live Production observation agree. |
| Assistant sidebar toggle geometry | PASS | Deployed narrow-sidebar toggle contract remains unchanged after backend-only Voice closure work. |
| Financial | PASS | Route/API contract green; required Production RPCs and personal finance data plane present. |
| Commercial | PASS | Route/API contract green; required Production business RPC and business profile data plane present. |
| Account | PASS | Account route and `get_my_account_center_v1` Production contract present. |

## Voice Production Root Cause Closure

**Voice Production Root Cause:** non-fatal metrics RPC handling  
**Production Voice Function:** `sanad-ai-transcribe-v1`  
**Production function version:** v6  
**Runtime:** `sanad-voice-v2`  
**Model:** `gemini-3.5-transcribe`

Production evidence after the fix included completed Voice metrics with `error_code = null`, `retry_count = 0`, and successful Composer insertion.

The incident established this architectural rule:

> **Observability telemetry must be non-fatal to the primary user operation.**

Exception: mandatory Financial Audit is a separate integrity contract. Required financial audit must not be downgraded to best-effort merely because observability telemetry is non-fatal.

## Reconciliation and cleanup

- PRs #347, #348, #349, and #350 were closed as superseded/already integrated after verifying their heads were ancestors of current `main`.
- PR #356 merged: Voice outer runtime guard and phase telemetry.
- PR #357 merged: pre-provider phase diagnosis.
- PR #358 merged: Voice metric RPC made non-fatal.
- PR #359 merged: guarded Stage 1 cleanup.
- Temporary Edge Functions `sanad-ai-transcribe-stage1e-candidate` and `sanad-ai-transcribe-stage1g-hf-candidate` were removed.
- Canonical Voice Function `sanad-ai-transcribe-v1` remained ACTIVE at v6.
- Stage 1 branches were deleted only when verified as ancestors of `main`.

## Rollback references

- Stage 1 functional production baseline: `7c2460169c0eb05279d4828b5fe7e0d3509c8c03`
- Last full UI/PWA Production deploy baseline: `8ebc5f7521df2f016681f252d0c161e39e4adb7a`
- Stage 1G.HF UI/application merge before release trigger: `91507cb04b0d592ac63a72c7dc97439f38c4b57f`
- Voice v6 bundle SHA256: `cd1ee83d056a35c1ee3cb7430b66f3c53080fe99838ee4433d81fe8d2c26a176`

## Evidence boundary

The final closure combines:
- live user-observed Production behavior,
- Production Supabase runtime/database invariants,
- deployed function inventory,
- green GitHub Quality Gates,
- and deployed frontend static contracts.

No independent browser-automation session was used for every UI surface; no unobserved UI redesign claim is implied by this closure.

## Next-stage gate

Stage 2 must begin only from the live current `main` after re-reading this record and the operating playbook. The Stage 1 runtime baseline above is immutable historical evidence; later documentation/cleanup commits do not alter that runtime baseline.
