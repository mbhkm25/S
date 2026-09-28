# Stage 2D — Personal draft family: income, expense, same-currency transfer

## Accepted baseline and scope

Owner accepted #419 and authorized continuation on 2026-09-28, retaining owner-run local UI acceptance, merge and Web publication. Personal laptop repository is `C:\sanad-v3`. #419 is accepted, not merged/deployed Web; it remains at `c344add37f993395efb8d18f30921bc9431d39c9`. Current main `3f00e59f1c460acd3f8f622bafdac8d1ae1b1779` is an ancestor of this baseline. Branch `stage2d/personal-draft-variants-20260928` builds on #419 without altering earlier branches or Bridge.

One coherent package extends the existing expense editor and conversational adapter to income and same-currency transfers. Creation, account/category prerequisites, review, cancellation and explicit approval continue through the existing canonical action lifecycle. This is not closure of Stage 2D: commercial party/line editing and full entity picker parity remain.

## Server contract and operational review

The only migration replaces the existing `update_my_sanad_agent_action_draft_v2` body and its read-only capability descriptor. No new tables, RPC signatures, execution handlers, normalizer, grants, RLS policies or triggers. Live normalizer, approval, editor and descriptor bodies were compared to #419 source: exact matches before changing anything. Private normalizer denies authenticated/anonymous direct execution. Public editor/descriptor remain authenticated-only, owner-checked, SECURITY DEFINER with empty search_path.

- Lock owner row, require review and exact positive version; action/thread/business/attachment provenance retained.
- Existing transaction type is immutable. Income/expense accept exactly their seven fields; transfer accepts exactly transaction_type, amount, currency, source_account_id, destination_account_id, description, transaction_at. Unknown fields and missing explicit nulls fail closed.
- Existing shared normalizer validates active owned accounts, income/expense category kind, two distinct transfer accounts and equal currency. Transfer currency is derived by normalizer and must match submitted currency. No currency conversion workflow or exchange rates.
- Decimal validation precedes numeric(24,6) casting, so excessive precision cannot silently round during edit. Canonical amount bounds remain. Full review, fingerprint collision, version event and existing Work Item refresh remain unchanged.
- No-op does not increment; stale approval cannot execute. No financial executor is invoked by edit.

## Conversation and form

The existing adapter now advertises `action_list_personal_drafts`, `action_get_personal_draft`, `action_edit_personal_transaction`. Old expense tool names remain restricted compatibility aliases, not separate paths or advertised duplicate tools. A current-turn read and fresh version are required; changed account IDs must come from successful current-turn lookups. Per-turn mutation limit, mixed create/edit batch rejection and no create fallback after an edit attempt remain.

The existing lazy form is reused. Income loads income categories; transfer replaces category with destination account and filters to distinct same-currency accounts. Descriptor gates each actual variant. Full form sessions pin the original expected version and preserve unsaved fields until explicit reload. Date precision is retained when unchanged. Arabic/Persian decimal input remains supported.

Canonical UI action reads additionally fetch `payload->>amount` and the row version under existing owner RLS. A version mismatch between the two reads fails closed; exact text replaces the JS-parsed numeric amount before form use. This adds one bounded read and can require reloading during a concurrent change; it does not write or maintain a second cache. Save response retains the validated decimal text. Chat continues reading amount text and version in a single existing RLS query.

Voice remains reviewable transcription into the same composer; no auto-send or financial approval. Renderer uses the existing ActionCard; no parallel UI or redesign.

## Evidence and remaining acceptance

- 122 PGlite cases cover actual migrations and both new variants through form-RPC -> conversation adapter -> same row, immutable type/attachments/metadata, exact decimals, duplicate collision, wrong account/category/currency, cancelled/foreign actor and stale edit/approval, one Work Item, zero financial executor calls. PostgreSQL CI adds the existing two setup concurrency cases; shared expense locking contract separately has 59 PostgreSQL cases.
- 78 operational adapter tests and 50 pure form/descriptor contract cases. Existing 46 prerequisite tool/presentation cases remain.
- TypeScript, production build and budget pass locally: workspace 112.62 KB / 120 KB. Final-head CI must pass before backend activation.
- No browser, UI render preview, microphone or live model test by the assistant. Owner acceptance remains required for actual interaction and visual quality. No real financial approval for testing.

## Activation, rollback and source integration

After CI, independently install only the reviewed migration, align its filename to the actual Supabase ledger version, verify deployed function bodies/permissions and compare security advisors. Then deploy the seven-file assistant bundle with `verify_jwt=true`, `import_map_path=deno.json`, verify source equality and unauthenticated HTTP rejection. Activation evidence is recorded in the PR body. Do not bulk db push or reapply earlier Stage 2D migrations.

UI merge/Web publication remain owner-controlled. Stacked PR base is #419; do not merge into its feature branch. Retarget onto main only after required parents are integrated; existing release-trigger PR #414 needs a fresh release-scope review before use.

Rollback: restore only the two affected function definitions from #419 in a reviewed forward migration, keep their grants and all rows/events, and redeploy Edge v10 source from #419 with the relative deno.json path and JWT verification. Do not replay the entire prerequisite migration or remove edited drafts. Old frontend remains compatible with the expanded server contract.

## Owner checklist (personal laptop, port 3000)

1. Prepare an income draft in an existing account; edit amount/description in chat, then form; confirm increased version, same draft, income-only categories.
2. Prepare an unapproved same-currency transfer between two existing accounts; edit amount and destination in chat/form. Confirm source/destination labels, distinct accounts and no category field.
3. Attempt same-account or different-currency transfer: reject, no fallback duplicate draft.
4. Edit one draft from two windows: stale save fails; explicit reload is required before another attempt.
5. Recheck expense edit and existing account/category preparation. Cancel financial test drafts; never approve them for testing.
