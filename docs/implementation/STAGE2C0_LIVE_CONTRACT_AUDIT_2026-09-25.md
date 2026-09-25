# Stage 2C.0 — Read-only live contract audit, compatibility and first local preview gate

**Snapshot:** 2026-09-25, GitHub main `90cb6ab405f2d78c53fd7522ee4389ab71a192ed`; read-only inspection of Production Supabase `sanad_verify_v3`. **Evidence class:** schema/RPC/code confirmed and *aggregate-only* counts; no production records, metadata values, secrets or personal names exported. Production may change—repeat before any security-sensitive migration. **Status:** audit evidence captured; responsive UX **prototype for owner review**, no 2C feature code or schema migration. Parent #386; approved v4 roadmap and Projects/Composer ADR. This is the first **preview bundle**, not a release candidate for production.

## 1. Findings: verify before deciding schema

| Existing contract | Read-only fact | Stage 2C consequence |
| --- | --- | --- |
| Active project/relationship selection | `get_user_business_contexts()` currently returns `owned_businesses`, **active** `team_businesses`, `customer_businesses` and `pending_invitations`. RPC requires `auth.uid()` and is authenticated-only. Live `business_profiles` has no single-business ownership constraint. | **Personal Manager** is virtual for current actor. **Business workspace** includes only owner / active team projects. Customer relationships may be surfaced in customer experiences **without** administrator project privileges. Invitations are not current workspaces. Deduplicate owned/team overlap by stable business ID, preserve effective permissions. |
| Conversation scope | `sanad_agent_threads` contains `business_id`, owner `user_id`, `metadata`, message sequence; participant table tracks role/last-read/status. `create_my_sanad_agent_thread_v1` enforces owner or active team for non-null business. The current chat client uses `business_id` selection and its list RPC caps `p_limit` at **100**, default **50**. | Reuse existing business threads, **do not** create a duplicate `projects` ledger. Derive business project by business ID only after session-authorized membership. Pinned list and exhaustive search need new *permissioned*, paginated RPC(s); local search of 50 threads is not global. |
| Legacy no-business threads | **10** total current threads: **9** business-linked; **1** null-business; **2** archived; **0** carry `metadata.project_context` today. Null-business threads with business actions: **0**, and null-business shared with non-owner active participant: **0** in this snapshot. | **Do not silently classify null = personal**—historical no-business thread could be general/system. Display as **غير مصنفة** for explicit user move after a safe compatibility plan; new personal threads need explicit typed scope independent of `business_id = null`. Re-run counts at migration time. |
| Current action/attachment consistency | Snapshot: **1** assistant action and **0** attachments; mismatched action/thread business IDs **0**, active owner-participant gaps **0**. `sanad_agent_actions` carries version/status/bound business/thread, but check constraint permits only current `personal_transaction` and `commercial_document_draft`. | Preserve current approval/version/state and financial origin; changes to sidebar project may **not** mutate existing action `business_id`. Do not expand supported Composer writes based on menu aspirations alone. |
| Shared chat access | Private `can_access_sanad_agent_thread_v2` requires active participant and, for business threads, active owner/team access. `can_write_sanad_agent_thread_v2` additionally requires role owner/member. Thread/message SELECT uses helper RLS, owner-only UPDATE/DELETE. RPCs are authenticated-only and security-definer. | Business membership does **not** imply access to all business conversations. Private personal thread visibility stays participant-specific. Explicitly test owner/member/viewer/revocation and do not replace helper authorization with sidebar `currentProject`. |
| **Critical rebinding risk** | Live `update_my_sanad_agent_thread_v1` lets an authenticated **thread owner** set a different authorized `business_id` or null using `p_change_business=true`. No current action-bearing immutable-origin check in this RPC. `assistantWorkspaceApi.bindSanadAgentThreadBusiness` calls it. | **BLOCKER before a fixed-project UI is considered secure:** design additively hardened *server-side* rebind contract, including existing action/draft/memory/attachments/participant consequences and legacy migration. Do **not** paper over by hiding client selector only. Do not apply patch within 2C.0; 2C.1 separate reviewed security migration if justified. |
| Project knowledge/source truth | Live platform knowledge has **13** source rows and **1** knowledge file (aggregate). `sanad_knowledge_sources` and `sanad_knowledge_files` have platform moderation/versioning, not an audited per-project share/access or owner instructions contract. `sanad_agent_memories` are user-owned and not a project library. | **Do not infer these are immediately safe project-file stores.** 2C can expose available **safe references only**; full scoped project instructions/files/index/revocation must receive a separate 2G contract or earlier independently reviewed additive ACL design. No copying live ERP balances into project instructions. |
| Existing navigation and composer | `SanadUnifiedSidebar` shows New separately, inline conversations, sections Today/Library, Tasks/Approvals/Automation, Personal Finance/Business and Connections, inline Memory/Assistant Settings, bottom notification/account. Existing `SanadAgentWorkspace` owns chat timeline and workspace composer. | Proposed short nav and footer are **first-stage prototype only**, keep legacy routes until acceptance. Move actual memory settings controls under Settings (not links only). Preserve R3 one-sidebar viewport, conversation scroll and fixed-within-workspace Composer. |

These are **catalog/RPC/aggregate checks, not end-to-end user-role penetration tests**. The Supabase RPCs are `SECURITY DEFINER`; before an actual migration, inspect complete dependency definitions, `EXECUTE` grants, RLS behavior, anonymized role fixtures, cross-tenant negative tests and security advisor deltas. Production read-only audit does **not** authorize schema or data writes.

## 2. 2C.0 decisions for prototype, distinct from unapproved backend changes

1. Represent user-facing project with **virtual** `personal:<user-id>` or authorized `business:<business-id>` (no new physical project table assumed); maintain participant-level chat privacy separate from business project access.
2. A project contains **multiple conversations**, optional project instructions/sources (not yet indexed by new project ACL), scoped tools, recent work and management entry. Main conversational workspace remains central; administration/security/connector pairing remain dedicated pages.
3. Sidebar order: independent **محادثة جديدة** action, **المحادثات**, **اليوم**, **المدير الشخصي**, **الأعمال**, flat **المزيد**; aligned bottom notification/context/profile dock. Avoid icon proliferation or repeated preference controls.
4. A project-aware **Smart Composer** keeps chat text/voice/attachments and adds searchable action picker; one **visual-only** guided expense form prototype. Its draft preview and autocomplete options are demonstrative static fixtures—not connected to accounts, persistence, Supabase or financial execution. Future source-bound forms use a single authorized versioned draft (2D).
5. Project header and conversation list support pinning **visually in prototype only**. Real per-user cross-device pins must be stored and fetched by authorized backend independently of last-50 threads in 2C.3. Do not ship fake local-storage pins as a backend feature.
6. One shared typed request context for future chat, form, entity actions and Today; it is **not an auth grant**. An unrelated personal request inside Business requires explicit scope transfer before any draft.

## 3. Proposed security/compatibility decision matrix for 2C.1

| Case | Target behavior | Evidence gate |
| --- | --- | --- |
| Owner, active member, customer-only, pending invite | Owner/active member see authorized business project; customer-only sees customer area if permitted but no business admin project; pending invite sees invitation only | Session-auth RPC negative role fixtures |
| Business A chat → personal expense | Explicit switch to Personal Manager; no commercial draft/side effect | Authorized action/draft server assertion |
| Business A thread moved to B with existing action | Preserve original action/binding or reject move; never reinterpret B's finances | New server rebind policy + migration/negative tests |
| Legacy null thread | Remains **unclassified** until explicit user action; no implied personal exposure of unrelated history | Snapshot migration inventory and owner-approved migration UX |
| Owner personal vs business team participants | Business membership does not reveal owner private chat or memory | RLS + participant helper + source ACL negative tests |
| Pinned chat older than 50 | Returns through separate authorized paginated index across devices | Independent backend RPC, indexes and boundary fixtures |
| Shared viewer vs writer | Viewer reads only, writer may send, revoked participant loses access | RPC, RLS and Realtime tests |
| Source file or reference vs live ledger | Reference marked authority/freshness; no project reference overwrites actual ERP balance | Scoped lookup and provenance test |
| New Smart Composer with future ERP action | Clearly unavailable; Edaa Bridge unchanged READ ONLY | Capability contract test and negative server call |
| Existing legacy Finance/Business URLs | Continue to work until feature-equivalent interactive flows are explicitly approved | Route/refresh/mobile regression and rollback |

## 4. First preview bundle — deliverable and local review

Preview asset `docs/prototypes/STAGE2C0_PROJECTS_COMPOSER_PREVIEW.html` is **self-contained interactive HTML with fictional sample labels and no network calls**. It is a design prototype for project switch, per-project multi-conversation list, pin/unpin appearance, compact sidebar, Today, project sources/tools, contextual action search, and responsive guided input (desktop/mobile). Nothing created there persists or writes finance.

**Suggested isolated local worktree** after all exact-head PR checks pass:
```powershell
cd C:\sanad-v3
git fetch origin stage2c/c0-audit-interactive-prototype
git worktree add --detach C:\SANAD-2C0-PREVIEW origin/stage2c/c0-audit-interactive-prototype
Start-Process "C:\SANAD-2C0-PREVIEW\docs\prototypes\STAGE2C0_PROJECTS_COMPOSER_PREVIEW.html"
```
If the worktree directory exists, first inspect status and use an alternate new directory, **do not delete it blindly**. For browser `file://` restrictions, start a local static HTTP server scoped to the preview worktree if available; this prototype has no network dependencies. **Do not preview Production** for unmerged 2C0 changes or use live credentials to fill sample input.

### Owner UX acceptance prompts

- Is a ChatGPT-Projects-like structure obvious: one personal project, multiple authorized business projects, multiple threads/pins/sources/settings in each?
- Is **محادثة جديدة** visually consistent without taking a sixth giant primary navigation slot?
- Does the footer make active project context and account/settings discoverable at 360/390/430 and 1280–1440 widths, zoom 125/150?
- Does contextual **إجراء** list differ correctly between personal and business without falsely implying unsupported features are live?
- Can an expense mini-form be completed rapidly by mouse/keyboard; can the user return to text without losing *prototype* input? Would dense business invoice need expanded chat canvas?
- Are empty/loading/error/locked-source and legacy-unclassified states understandable without claiming access?

**Next step:** owner reviews this isolated prototype and audit findings. Record defects in #386, revise the **same PR branch**, rerun exact-head CI, update local worktree, then obtain explicit approval to merge this first bundle. **No Production release** for docs/prototype alone. Then begin a short-lived, security-gated **2C.1** implementation branch from latest merged main, and later batch local feature preview → QA → separate merge → controlled Web/Edge deployment → authenticated postflight.
