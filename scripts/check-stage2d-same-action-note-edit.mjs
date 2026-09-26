import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260927004500_stage2d_same_action_note_edit_v1.sql','utf8'
);
const origin = readFileSync(
  'supabase/migrations/20260926214052_stage2d_action_origin_scope_guard_v1.sql','utf8'
);
const actionApi = readFileSync('src/features/assistant/assistantActionApi.ts','utf8');
const card = readFileSync('src/features/assistant/SanadAgentActionCard.tsx','utf8');
const canonical = readFileSync(
  'supabase/migrations/20260920121815_sanad_agent_actions_v1.sql','utf8'
);

for (const part of [
  'update_my_sanad_agent_action_note_v1',
  "where id=p_action_id and user_id=v_uid for update",
  "v_row.status<>'review'",
  "v_row.version<>p_expected_version",
  "v_thread.project_kind is distinct from 'personal'",
  "v_thread.project_kind is distinct from 'business'",
  'private.user_is_business_owner(v_row.business_id,v_uid)',
  "v_thread.business_id is distinct from v_row.business_id",
  "v_payload - 'metadata'",
  "'agent_action_version_conflict'",
  "'edited'",
  "version=version+1",
  "updated_at=now()",
  "jsonb_set(v_review,'{fields}'",
]) assert.ok(migration.includes(part), 'Missing draft note editor invariant: '+part);

assert.match(migration,/revoke all on function public\.update_my_sanad_agent_action_note_v1\(uuid,integer,text\)\s+from public,anon/);
assert.match(migration,/grant execute on function public\.update_my_sanad_agent_action_note_v1\(uuid,integer,text\)\s+to authenticated/);
assert.match(migration,/p_note is null or length\(p_note\)>500/);
assert.match(migration,/coalesce\(to_jsonb\(v_note\),'null'::jsonb\)/);
assert.match(origin,/agent_action_origin_immutable/);
assert.match(canonical,/if v_row\.version<>p_expected_version/);
assert.match(actionApi,/updateSanadAgentActionNote/);
assert.match(actionApi,/p_expected_version: expectedVersion/);
assert.match(card,/data-sanad-canonical-note-editor/);
assert.match(card,/updateSanadAgentActionNote\(card\.action_id, version, noteDraft\)/);
assert.match(card,/status === 'review' && verified && action/);
assert.match(card,/ملاحظات المسودة/);
assert.match(card,/وصف المسودة/);
assert.doesNotMatch(migration,/\bcreate_personal_finance_transaction_v1\s*\(|\bcreate_business_commercial_draft_v1\s*\(|\bpost_business_commercial_document_v1\s*\(/);
assert.doesNotMatch(migration,/set\s+(?:thread_id|business_id|user_id|action_type)\s*=/);
console.log('Stage 2D.2-A same-ID owner-only note revision, optimistic version, review and audit static contract PASS');
