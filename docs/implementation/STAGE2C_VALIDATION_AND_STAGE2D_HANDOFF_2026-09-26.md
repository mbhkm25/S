# Stage 2C.V — Integration evidence, outstanding owner smoke and 2D handoff

**Checkpoint:** 2026-09-26; evidence status updated after PRs #404 and #405.  
**Classification:** Implementation 2C.5 MERGED; backend v8 ACTIVE; production Web deploy triggered, final live-site verification and formal 2C.V closure remain **OPEN**. Do not silently reinterpret a prior local screenshot as a production smoke.

## Verified implementation and change boundaries

| Evidence | State | Exact reference |
|---|---|---|
| Projects/interactive results | MERGED earlier | 2C.1–2C.4 source PRs, including #398; canonical V4 roadmap |
| Scope-aware action catalog and inline searchable Smart Composer | MERGED | PR #404 at candidate `1beb27a021a28d7e9a573f48b09aeb400f15f8fa`; squash `00fe3fe1a2368dcd292bfed283f989623dc45ed4` |
| Icon alignment and functional menu | OWNER LOCAL VISUAL ACCEPTED | Owner provided local `127.0.0.1:3000` screenshot confirming final 36px visual trigger aligned with attachment and voice |
| Premerge candidate engineering checks | PASS, four of four | GitHub Actions exact-head `1beb27a021a28d7e9a573f48b09aeb400f15f8fa`: Production / Operation / Admin / Android field build |
| Backend agent bounded terminal-answer patch | MERGED AND DEPLOYED, RUNTIME SMOKE PENDING | `sanad-ai-agent-v1` version 8 ACTIVE; JWT enabled; actual deployed files checked against merged source |
| Guarded Web/PWA production publish | TRIGGERED; **success not independently observed yet** | PR #405 merge `c14414a9dc24873ee5d8c4dcaede710fd67e22d3` changed existing production recovery marker; GitHub deploy workflow must pass before claiming live release |
| ERP Bridge upgraded on the Edaa shop host | EXPLICITLY DEFERRED | Do not install Bridge on personal laptop; independent store-PC and remote refresh field smoke later |
| Signed Android production updater | OUT OF SCOPE FOR THIS WEB TRAIN | Successful Android field build does not prove signed updater publication |

The 2C.5 launcher is a **scoped prompt-preparation prototype**, not a universal server action registry or client-side financial draft authority. A business customer statement follow-up inserts a reviewable prompt into the existing conversation and does not autonomously fetch other customers. Customer ID ambiguity is resolved by the existing server-side agent; typed in-form Arabic entity autocomplete is not implemented and belongs to the upcoming server-authenticated 2D entity-resolution work.

## Formal integration matrix — no invented PASS statuses

| Planned test | Verified scope / missing evidence |
|---|---|
| S1 commercial chat asks for personal spending | Current verified project prompt restrictions + automated catalog isolation PASS; owner authenticated negative request fixture remains OPEN |
| S2 business A→B mid-draft | Existing immutable draft-source contracts expected; cross-business runtime fixture OPEN |
| S3 restricted viewer/private chat + attachment | Existing server-side RLS/rpc and viewer contract; explicit live role-denial fixture OPEN |
| S4 old pinned conversation beyond recent 50 on second device | Cross-device >50 fixture OPEN |
| S5 launcher versus natural language | Limited read-only prompt-entry prototype demonstrated locally; no independent shadow draft; versioned two-way same canonical draft in Stage 2D |
| S6 edit form after approval | Versioned draft mutation/approval invalidation belongs to Stage 2D; do not report complete |
| S7 similarly named Arabic customers | Existing server-restricted candidate search and clarification flow; ambiguity owner smoke OPEN; full typed autocomplete planned for 2D |
| S8 large source statement and 150% desktop/mobile | Desktop statement/launcher screenshot evidence exists; 150%/mobile keyboard and screen-reader retest OPEN |
| S9 Today unified personal/business pending work | Full cross-project Today projection belongs to Stage 2E; not part of scoped 2C.5 closure |
| S10 unsupported ERP posting | Backend source Bridge READ-ONLY; scoped UI offers guided SANAD draft only; owner negative smoke OPEN |
| S11 connection loss/retry | Launcher produces unsent ordinary composer text; no in-popup persisted draft; canonical versioned draft idempotency belongs to Stage 2D |
| S12 project-specific documents vs live financial ledger | Future scoped Project Sources indexing belongs to Stage 2G; live source must remain financial authority |

**Release-blocking for 2C scope only:** deployed Web SHA must match expected branch release, v8 scoped owner smoke for: customer statement succeeds (no `tool_round_limit_exceeded`), optional context follow-up is truthful, personal-only composer, no role bypass, attachment+voice regression, 125/150 zoom + mobile-safe. Check production metrics and preserve actual trace if live agent fails.

**Known prior incident:** performance metrics recorded `tool_round_limit_exceeded` with 8 tool calls around 21:08 Yemen on 2026-09-26, **before** the v8 backend deployment at approx. 21:16 Yemen. This is baseline evidence, not a post-v8 regression or post-v8 fix proof.

## Next stage after formal 2C.V

**Stage 2D — Unified Action + Draft Intelligence** is the next feature train, not extensive launcher visual rework. At gate approval, begin with an audit of existing personal action draft and SANAD commercial draft canonical IDs/revisions, server-side entity resolution, permission and provenance contracts, then versioned single-draft create/edit/review/explicit approve/deterministic command lifecycle across natural language, voice and compact form. The existing stage 2C scoped catalog is a presentation adapter; remove duplicate tool names only after introducing and measuring the canonical registry. No automatic ERP posting and no unverified cross-business suggestions. Stage 2E Today automation and 2F ERP fidelity are later, separate plans.

**Checkpoint update policy:** mark 2C.V PASS only after the exact production Web+Edge evidence and owner authenticated smoke. The deferred shop-PC Bridge upgrade remains a separately tracked operation and is not a gate for the scoped 2C.5 Web/assistant release.
