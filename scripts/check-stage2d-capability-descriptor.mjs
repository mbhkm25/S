import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  'supabase/migrations/20260927003500_stage2d_server_capability_descriptor_v1.sql','utf8'
);
const actions = readFileSync(
  'supabase/migrations/20260920121815_sanad_agent_actions_v1.sql','utf8'
);

for (const item of [
  'get_my_sanad_action_capabilities_v1',
  "id=p_thread_id and user_id=v_uid and status='active'",
  "v_thread.project_kind='personal' and v_thread.business_id is null",
  "v_thread.project_kind='business' and v_thread.business_id is not null",
  'private.user_is_business_owner(v_thread.business_id,v_uid)',
  "from public,anon;",
  'to authenticated;',
  "'form_edit_supported',false",
  "'erp_write_supported',false",
  "'approval_requires_expected_version',true",
  "'personal_transaction'",
  "'commercial_document_draft'",
]) assert.ok(sql.includes(item),'Missing descriptor guard/contract: '+item);

assert.match(sql, /return v_common \|\| jsonb_build_object\('actions','\[\]'::jsonb\)/);
assert.doesNotMatch(sql, /alter table|create table|post_business_commercial_document_v1|create_personal_finance_transaction_v1|grant execute .* to anon/i);
assert.match(actions,/create_my_sanad_agent_action_draft_v1/);
assert.match(actions,/approve_my_sanad_agent_action_v1/);
assert.match(actions,/if v_row.version<>p_expected_version/);
assert.match(actions,/action_type in \('personal_transaction','commercial_document_draft'\)/);
assert.match(actions,/if v_document_type not in \('quotation','sales_invoice','purchase_invoice','receipt','payment','expense'\)/);
assert.match(actions,/if v_type not in \('income','expense','transfer'\)/);
console.log('2D.1 server-read descriptor maps existing scope/variant/approval without creating a second execution path: PASS');
