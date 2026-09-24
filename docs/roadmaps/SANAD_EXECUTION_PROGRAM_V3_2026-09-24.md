# SANAD — Execution Program v3 / 2026-09-24

**Status:** Proposed delivery rebaseline; docs-only review required.  
**Product philosophy:** One Conversation-Centric Operating Layer; **one global sidebar**.  
**Canonical implementation truth:** Production runtime/field evidence → Production Supabase and GitHub main → approved architecture → SANAD.md synthesis.  
**Tracking:** [Execution issue #374](https://github.com/mbhkm25/S/issues/374); immediate [R3 #375](https://github.com/mbhkm25/S/issues/375); [D-ARCH #376](https://github.com/mbhkm25/S/issues/376).  
**Prior roadmap:** `docs/roadmaps/sanad-conversation-operating-layer-roadmap-v2.md` remains historical architectural scope; this program supersedes its dated immediate-execution checklist only, not its underlying approved contracts.

## 1. Verified vs unverified checkpoint

- **GitHub:** R2.V2 PR #373 squash-merged; current main verified at `356fcaa0d1aad181a6375125230b7222018d1618`; earlier exact candidate `d93c20452495c3a452c4323a34ccb99a4accc8f4` passed four CI suites, followed by accepted desktop/preview interaction tests.
- **Runtime evidence:** user reports Production deployment and supplies screens of SANAD in Windows/PWA and Android mirrored window. These demonstrate the new global sidebar/history design is running. **Live Production deploy ID and /version.json SHA have not been independently retrieved in this planning pass**; do not claim a specific deployed SHA until postflight evidence is captured.
- **Confirmed UX defect:** `AssistantWorkspaceSidebar` is still a separate overlay for `memory/settings`. Conversation history was moved into the global sidebar, but memory/preferences were not. This is the reason a second pane/backdrop still appears.
- **Header distinction:** unified ProductAppHeader is already unmounted from target routes. Source retains a 44px `data-sanad-mobile-menu-slot` below desktop breakpoint: eligible for elimination/replacement. The dark bar with X/minimize/extension controls in Windows/PWA is **native host title chrome**; Android OS status/navigation bars are system chrome. They cannot be eliminated by merely deleting React header CSS.
- **Product rule:** one sidebar across /sanad-ai, /today, /financial, /commercial and /business/manage. Business/account/assistant remain capabilities, not four products.

## 2. Immediate trains and acceptance gates

### Gate P0 — Release truth / source alignment (short audit)
- Capture deployed Web/PWA `version.json`, deploy workflow run, SHA and signed Android updater state **separately** (Android build CI PASS ≠ published APK).
- Verify critical Production threads, read-only Edaa, Today, profile/notifications and mobile safe-area.
- Reconcile documentation; preserve actual rollback reference before new release.

### Stage 2B.R3 — Truly single sidebar (START NEXT; issue #375)
**Goal:** eliminate the second memory/settings sidebar and unnecessary full-width in-app header.
- Move **both contents**, not merely their nav links, into lazy inline accordions inside `SanadUnifiedSidebar` (or sidebar-owned child components), below conversation history or in a scoped assistant-options group.
- One navigation scroll owner, stable fixed footer, no nested blocking backdrop on Desktop.
- Preserve preference keys/state: `save_history_enabled`, `memory_enabled`, `proactive_insights_enabled`, `response_cards_enabled`; preserve loading/error/rollback/permission states, owner/shared-thread access and memory fact controls.
- Deep charts or large memory editors that do not fit inside 254px must open in the **main canvas** via a sidebar entry, **not** a second sidebar overlay.
- Remove in-app `data-sanad-mobile-menu-slot` as a persistent full-width top strip and replace it with a discoverable, accessible global drawer toggle in the main workspace chrome; leave the Windows/PWA titlebar and Android system bars alone.
- Expanded desktop wordmark maintains existing logo without duplicated سند; collapsed mode retains a visible expand action; mobile always uses expanded single RTL drawer.
- CI + preview same SHA; inspect 1280/1366/1440/1920, zoom 125/150, 360/390/430, actual Android keyboard/safe-area; verify all target routes, memory/preferences persisted, thread archive/viewer restrictions, notifications/inbox. Only then merge and separately approve Production rollout.
- **No** DB migration, new features, Edaa writes, uncontrolled massive CSS migration.

### Stage 2B.R4 — Trustworthy operational presentation (NEXT after R3)
- Replace ambiguous `تم التنفيذ` with state-specific labels (e.g. `تم إنشاء المسودة`; awaiting explicit approval vs posted). Never conflate draft/action completion with ledger posting.
- Preserve raw source amount; format amount, currency/ISO code, localized date and precision from canonical domain contracts. No silent SAR↔YER conversion.
- Distinguish Today repeated work items via authorized party, amount, currency, reference, business and due date when data exists, rather than generic duplicated headings.
- Improve structured response density/provenance/freshness; financial UX sign-off on real data, negative and empty states. Test with permission variants.
- Mark cosmetic broad Business/Finance migration as later UX, not a blocker for these critical clarity fixes.

### 2B Conversation-management backlog (scoped, not all in R3)
- New / select / owner archive already partially present; verify cross-device continuity with same account and participant read state.
- Separate PRs for rename, pin, delete with confirmation, safe share/participants and `use conversation as reference` after Context Packs contract; global search of full history needs backend search/pagination rather than current 50-thread local filter.

## 3. Parallel architecture gate before schema-dependent work (D-ARCH; issue #376)
Open `PR #366` and branch `docs/stage2b0-product-blueprint-v1` contain substantial Product/Data architecture. Do **not** bulk-merge into main: it is 15 commits ahead and 84 behind and predates shipped D1/D2/D3/R1 runtime. Read-only compare actual Production schema/RPC/RLS/Edge with the architecture; produce one table per existing vs missing contract. Cherry-pick/rewrite still-accurate docs on a **fresh branch from current main** and close/supersede PR #366 after verified reconciliation; never replay historical migrations or weaken authorization.

Deliverables: Product/Capability/Connection/Relationship model; current multi-business and participant ownership; event notification data boundaries; typed actions & audit; memory scopes/glossary; historical Edaa COGS/profit provenance; reconciliation/agreement gaps; migration compatibility and rollback ADRs.

## 4. Subsequent coherent release trains (start only on approved, current main)

| Train | Outcome | Major dependencies / boundaries |
| --- | --- | --- |
| **2C Context + Entity** | Canonical context pack (workspace/view/entity/business/period/filters), entity links/inspector, typed Snapshot/Record/Report/Draft/Approval/Execution/Warning outputs, provenance/freshness, explicit conversation references | D-ARCH contracts; avoid duplicate financial truth |
| **2D Action + Intelligence** | Shared typed Action Registry for UI/AI/quick actions; NL-to-accounting/business intent & Yemen terminology; entity resolution; draft/review/approval/deterministic execution; mandatory financial audit | D-ARCH + Context; AI never directly posts ledger or writes Edaa |
| **2E Operations + Notifications** | Today briefing, tasks/approvals/automations backed by domain events; bilateral targeted notifications and replay/idempotency, tenant/relationship recipient permissions | D3 existing events/Work Items, 2D approvals; no duplicate notification truth |
| **2F Connections + Bridge** | Connection registry UX; chat-assisted SANAD Bridge installation/pairing/diagnostics/reconnect; stable read-only ERP replication; Edaa historical purchase-cost/COGS **read-contract proof**; WhatsApp integration feasibility | Auth, adapter, bridge field-soak and secure token handling; call/contacts permission study separate |
| **2G Knowledge + Collaboration** | Shared/team chat workflow & permission UX; account-wide history validation; user/business MD fact profiles with citations/approval/correction; Yemen/user glossary; scoped visibility | participant-aware R1, D-ARCH fact ownership; don't treat memory as canonical accounts |
| **2H Business Network + Reconciliation** | Customer↔business statements/invoices/claims & review/approval; uploaded statement transaction matching and discrepancy notes; contracts/relationships, scoped audit | 2D actions, 2E notifications, 2F ERP provenance and tenant policy |
| **2I Guided Input + Search + Ecosystem** | Compact interactive composer blocks for invoices/purchases/receipts/payments/journals/reports with authorized customer/product autocomplete; universal Cmd/Ctrl+K; Library artifacts and typed extensions/MCP research | Context/Action/Approval + business relationship model; no AI-generated unsafe execution UI |

**Future, DOCUMENT ONLY:** user SANAD wallet, paid services marketplace and regulated payment flows require explicit legal/security/payment-provider review; no implementation authorization.

Cross-cutting:
- Mobile/Android release hardening at defined larger milestones (safe-area, keyboard, PWA standalone, voice and signed APK updater), not after every desktop PR.
- Performance budget, Arabic typography/accessibility, reduced motion, feature-flag/rollback and Golden Eval remain release gates.
- User data and finance operation security are permanent prerequisites, not postponed visual tasks.

## 5. Branch inventory audit (snapshot 2026-09-24)

Current GitHub search enumerated **393 branch names** (100 + 100 + 100 + 93). Branch existence does **not** mean work is unmerged. High-level counts include `feature/` 102, `fix/` 75, `agent/` 43, `feat/` 39, `ops/` 27, `chore/` 20, `release/` 17 and six `stage2b/` branches.

**Spot-check against main, GitHub history differences are NOT equivalent to tree/content differences after squash merges:**

| Representative branch | Evidence | Action |
| --- | --- | --- |
| `stage2a/visual-foundation-safe-area-v1` | ahead 0 / behind 102 | Historical release branch; eligible for cleanup after retention check |
| `stage2b/data-d1-*`, `data-d2-*`, `data-d3-*`, `runtime-r1-*` | ahead 0 / behind 67, 51, 26, 4 | Their branch commits are already ancestors of main; candidate tidy-up |
| `stage2b/r2-unified-shell-v1` | ahead 69 / behind 1 **due to squash**; checked four key component/docs blob SHAs equal main | R2 already merged via PR #373; NEVER merge the source branch again; archive after snapshot/retention |
| `stage2b/ui-2b1-unified-sidebar-shell` | ahead 15 / behind 1, older shell alternate | Compare to shipped R2; likely superseded; do not merge blindly |
| `docs/stage2b0-product-blueprint-v1` | ahead 15 / behind 84, PR #366 **OPEN** | D-ARCH content reconciliation; do not replay docs/migrations automatically |
| `feat/sanad-bridge-local-agent-v01` / `release/bridge-field-v1-main` | diverged 56/512 and 34/507 | Special field security/soak review, no blanket merge; see issues #280/#284 |
| `develop` | diverged 66/513 | Freeze/audit rather than treating as latest integration base |
| `preview/stage2a-v-64576de` | diverged 11/131; preview workflow files | Preview-only candidate cleanup after verifying no active dependency |
| `feature/whatsapp-ai-assistant-v1` | diverged 7/1494 | Deeply stale branch; re-evaluate scope from current integration before reuse |

**Branch hygiene action (proposed, not auto-deleted):**
1. Export dated inventory and tag/checkpoint actual deployed + Bridge field refs.
2. Match open PRs and manual field blockers to each active branch.
3. Classify every branch as `ACTIVE`, `MERGED/REPLACED`, `CHECKPOINT`, `TEMPORARY`, `SECURITY/FIELD-HOLD`, or `UNKNOWN`.
4. Require owner review before deletion; squash branches may still show nonzero ahead counts.
5. Verify all required code, migrations and documentation in current main and live runtime before closing/cherry-picking.
6. Archive or delete *reviewed* stale branches in small batches after remote backup/pins; preserve essential rollback tags.

## 6. Future Git workflow — Issues first, branches just in time

Do **not** pre-create one long-lived branch per planned phase. They diverge from main, manufacture conflicts and invite inappropriate cherry-picks/scope creep.

Use:
`SANAD.md` (decisions/source of truth) + **this one canonical roadmap** (dependencies/release trains) + GitHub Issues/Milestones/Project (status/ownership/acceptance) + short-lived feature branch created from **latest main only when work starts**.

For each train:
1. Approved issue: problem, scope/non-goals, dependency, DB/ERP security, acceptance and rollback.
2. Fresh named branch, e.g. `stage2b/r3-one-sidebar` **when R3 implementation actually starts**, not months in advance.
3. Small PRs for independent concerns; docs, migrations and major visuals separated; one controlled integration train when appropriate.
4. CI tests on one exact candidate SHA; safe Preview and real desktop + mobile-safe smoke, Android physical at defined checkpoints.
5. Reviewer accepts → merge → independent Production deploy/postflight → update issue, repo roadmap and canonical Library SANAD.md.
6. Short-lived release tags, not hundreds of immortal feature branches. `main` remains integration truth; Bridge field refs remain explicit exceptions.
