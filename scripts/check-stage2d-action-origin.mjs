import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260927002000_stage2d_action_origin_scope_guard_v1.sql', 'utf8'
);
const canonicalSource = readFileSync(
  'supabase/migrations/20260920121815_sanad_agent_actions_v1.sql', 'utf8'
);
const foundation = readFileSync('src/features/assistant/agentFoundation.ts', 'utf8');
const agent = readFileSync('supabase/functions/sanad-ai-agent-v1/index.ts', 'utf8');
const composer = readFileSync('src/features/assistant/sanadSpecialistComposerCatalog.ts', 'utf8');

// This migration is additive: leave previously reviewed create/review/approve
// handlers and the two authorized action types intact.
assert.match(migration, /create or replace function private\.sanad_agent_action_origin_guard_v1/);
assert.match(migration, /before insert or update on public\.sanad_agent_actions/);
assert.match(migration, /where id=new\.thread_id and user_id=new\.user_id and status='active'/);
assert.match(migration, /v_thread\.project_kind<>'personal'/);
assert.match(migration, /v_thread\.project_kind<>'business'/);
assert.match(migration, /v_thread\.business_id is null/);
assert.match(migration, /new\.business_id is distinct from v_thread\.business_id/);
assert.match(migration, /agent_action_origin_immutable/);
assert.match(migration, /raise exception 'agent_action_personal_project_required'/);
assert.match(migration, /raise exception 'agent_action_business_project_mismatch'/);
assert.doesNotMatch(migration, /create_personal_finance_transaction_v1|post_business_commercial_document_v1|alter table.+disable row level security/is,
  'Origin-guard migration must never create or approve finance records or relax RLS.');
assert.match(migration, /revoke all on function private\.sanad_agent_action_origin_guard_v1\(\)\s+from public,anon,authenticated/);

for (const name of [
  'create_my_sanad_agent_action_draft_v1',
  'approve_my_sanad_agent_action_v1',
  'cancel_my_sanad_agent_action_v1',
  'get_my_sanad_agent_action_v1',
]) assert.ok(canonicalSource.includes(name), 'Existing action lifecycle must be reused: ' + name);
assert.match(canonicalSource, /if v_row\.version<>p_expected_version/);
assert.match(canonicalSource, /status='completed' then return to_jsonb\(v_row\)/);
assert.match(canonicalSource, /v_fingerprint := md5/);
assert.match(canonicalSource, /if v_thread\.business_id is not null and v_thread\.business_id<>v_business/);
assert.match(agent, /create_my_sanad_agent_action_draft_v1/);
assert.match(foundation, /name: 'action_prepare_personal_transaction'/);
assert.match(foundation, /name: 'action_prepare_commercial_document'/);
assert.match(composer, /state: 'guided_chat_only'/);
console.log('Stage 2D.0 action project/origin guard + existing draft/approval semantics PASS.');
