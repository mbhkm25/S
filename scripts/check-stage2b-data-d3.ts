import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const core = readFileSync(
  'supabase/migrations/20260923193000_stage2b_domain_events_work_items_v1.sql',
  'utf8',
);
const adapters = readFileSync(
  'supabase/migrations/20260923193500_stage2b_work_projection_adapters_v1.sql',
  'utf8',
);
const paymentMirrorHardening = readFileSync(
  'supabase/migrations/20260923194000_stage2b_payment_event_mirror_contract_hardening_v1.sql',
  'utf8',
);
const resilience = readFileSync(
  'supabase/migrations/20260923194500_stage2b_work_projection_resilience_v1.sql',
  'utf8',
);

for (const token of [
  'public.sanad_domain_events',
  'public.sanad_work_items',
  'private.emit_sanad_domain_event_v1',
  'private.upsert_sanad_work_item_v1',
  'public.list_my_sanad_work_items_v1',
  'public.get_my_sanad_today_v1',
  'public.get_my_sanad_work_item_v1',
  'public.create_my_sanad_task_v1',
  'public.complete_my_sanad_task_v1',
  'public.reopen_my_sanad_task_v1',
  'private.broadcast_sanad_work_item_v1',
]) {
  assert.ok(core.includes(token), `missing D3 core contract: ${token}`);
}

assert.match(core, /item_kind in \('task','approval','attention','follow_up','connection_issue'\)/i);
assert.match(core, /status in \('open','in_progress','done','dismissed','cancelled'\)/i);
assert.match(core, /unique \(recipient_user_id,dedupe_key\)/i);
assert.match(core, /recipient_user_id=\(select auth\.uid\(\)\)/i);
assert.match(core, /realtime\.send\(/i);
assert.match(core, /'user:'\|\|v_row\.recipient_user_id::text/i);
assert.match(core, /revoke all on table public\.sanad_domain_events from anon,authenticated/i);
assert.match(core, /grant select on table public\.sanad_work_items to authenticated/i);
assert.match(core, /source-domain state remains canonical/i);
assert.match(core, /sanad_domain_events_actor_time_idx/i);
for (const readFn of ['public.list_my_sanad_work_items_v1','public.get_my_sanad_today_v1','public.get_my_sanad_work_item_v1']) {
  const start = core.indexOf(`create or replace function ${readFn}`);
  assert.ok(start >= 0, `missing read function: ${readFn}`);
  const end = core.indexOf('as $function

for (const token of [
  'private.project_sanad_agent_action_event_to_work_v1',
  'private.project_payment_inbox_event_to_work_v1',
  'private.project_sanad_connection_to_work_v1',
]) {
  assert.ok(adapters.includes(token), `missing D3 projection adapter: ${token}`);
}

assert.match(adapters, /after insert on public\.sanad_agent_action_events/i);
assert.match(adapters, /after insert on public\.business_payment_inbox_events/i);
assert.match(adapters, /after insert or update of status,health_status,last_error_code,last_error_at/i);
assert.match(adapters, /'agent_action_review:'/i);
assert.match(adapters, /'payment_inbox:'/i);
assert.match(adapters, /'connection_issue:'/i);
assert.match(adapters, /where i\.status in \('new','released','claimed','review_required'\)/i);
assert.match(adapters, /Backfill only currently unhealthy connection states/i);
assert.match(paymentMirrorHardening, /business_payment_review_required/i);
assert.match(paymentMirrorHardening, /business_payment_review_resumed/i);
assert.match(paymentMirrorHardening, /business_payment_claim_conflict/i);
assert.match(paymentMirrorHardening, /business_payment_stale_action_rejected/i);
assert.match(resilience, /sanad_work_item_realtime_broadcast_failed/i);
assert.match(resilience, /sanad_agent_action_work_projection_failed/i);
assert.match(resilience, /payment_inbox_work_projection_failed/i);
assert.match(resilience, /sanad_connection_work_projection_failed/i);
assert.match(resilience, /work_task_completed:[^\n]*gen_random_uuid\(\)/i);
assert.match(resilience, /work_task_reopened:[^\n]*gen_random_uuid\(\)/i);

console.log('SANAD Stage 2B Data Train D3 domain events/work/Today contract checks passed.');
, start);
  assert.match(core.slice(start, end), /security invoker/i, `${readFn} must remain SECURITY INVOKER`);
}

for (const token of [
  'private.project_sanad_agent_action_event_to_work_v1',
  'private.project_payment_inbox_event_to_work_v1',
  'private.project_sanad_connection_to_work_v1',
]) {
  assert.ok(adapters.includes(token), `missing D3 projection adapter: ${token}`);
}

assert.match(adapters, /after insert on public\.sanad_agent_action_events/i);
assert.match(adapters, /after insert on public\.business_payment_inbox_events/i);
assert.match(adapters, /after insert or update of status,health_status,last_error_code,last_error_at/i);
assert.match(adapters, /'agent_action_review:'/i);
assert.match(adapters, /'payment_inbox:'/i);
assert.match(adapters, /'connection_issue:'/i);
assert.match(adapters, /where i\.status in \('new','released','claimed','review_required'\)/i);
assert.match(adapters, /Backfill only currently unhealthy connection states/i);
assert.match(paymentMirrorHardening, /business_payment_review_required/i);
assert.match(paymentMirrorHardening, /business_payment_review_resumed/i);
assert.match(paymentMirrorHardening, /business_payment_claim_conflict/i);
assert.match(paymentMirrorHardening, /business_payment_stale_action_rejected/i);
assert.match(resilience, /sanad_work_item_realtime_broadcast_failed/i);
assert.match(resilience, /sanad_agent_action_work_projection_failed/i);
assert.match(resilience, /payment_inbox_work_projection_failed/i);
assert.match(resilience, /sanad_connection_work_projection_failed/i);
assert.match(resilience, /work_task_completed:[^\n]*gen_random_uuid\(\)/i);
assert.match(resilience, /work_task_reopened:[^\n]*gen_random_uuid\(\)/i);

console.log('SANAD Stage 2B Data Train D3 domain events/work/Today contract checks passed.');
