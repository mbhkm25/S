# Stage 2B.R3 — Historical Implementation Note (SUPERSEDED)

This early R3 candidate note is retained as a stable link only. Its prior claim that `AssistantWorkspaceSidebar.tsx` was kept as dormant source is **obsolete**; the final R3 implementation candidate deletes that component.

**Current and sole R3 runtime/preview contract:** [STAGE2B_R3_SINGLE_SIDEBAR.md](./STAGE2B_R3_SINGLE_SIDEBAR.md).

**Reconciliation evidence (2026-09-24):** R2.V2 PR #373 merged to `main` at `356fcaa0d1aad181a6375125230b7222018d1618`; GitHub Production deployment workflow #81 (`36009231310`) recorded successful publication of that SHA and successful HTTP app/APK path postflight. The external `/version.json` response and the signed Android updater metadata remain separately unverified. R3 stays on PR #378 pending exact-final-SHA CI, authenticated local preview, user acceptance, merge and independent controlled release.

No runtime/database/Bridge changes are authorized by this historical link.
