import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (path) => readFileSync(path, 'utf8');
const migrations = [
  '20260926190000_sanad_erp_on_demand_refresh_v1.sql',
  '20260926190100_sanad_erp_owner_refresh_request_v1.sql',
  '20260926190200_sanad_erp_refresh_read_status_v1.sql',
  '20260926190300_sanad_erp_device_claim_refresh_v1.sql',
].map((name) => src('supabase/migrations/' + name)).join('\n');
const heartbeat = src('supabase/functions/sanad-erp-heartbeat-v1/index.ts');
const device = src('bridge/windows/Sanad.Bridge/BridgeHeartbeatCommand.cs');
const cycle = src('bridge/windows/Sanad.Bridge/BridgeAgentCycleCommand.cs');
const ui = src('src/features/shell/SanadBridgeRefreshControl.tsx');
const route = src('src/features/shell/SanadUnifiedEntryRoute.tsx');

assert.match(migrations, /sanad_erp_refresh_requests enable row level security/i);
assert.match(migrations, /revoke all on public\.sanad_erp_refresh_requests from public, anon, authenticated/i);
assert.match(migrations, /private\.user_is_business_owner\(p_business_id,v_uid\)/);
assert.match(migrations, /d\.last_heartbeat_at>now\(\)-interval '5 minutes'/);
assert.match(migrations, /remote_refresh_v1/, 'Only upgraded device may accept request');
assert.match(migrations, /pg_advisory_xact_lock/, 'Parallel owner clicks must serialize');
assert.match(migrations, /status in \('requested','claimed'\)/);
assert.match(migrations, /bridge_device_id=v_req\.bridge_device_id/);
assert.match(migrations, /b\.started_at>=v_req\.created_at/, 'Never certify stale snapshot as a new refresh');
assert.match(migrations, /b\.status='completed'/, 'Only cloud-acknowledged snapshot confirms success');
assert.match(migrations, /for update skip locked/i, 'Single atomic claim per device');
assert.match(migrations, /grant execute on function public\.bridge_claim_sanad_erp_refresh_v1\(uuid\)\s+to service_role/i);
assert.match(migrations, /revoke all on function public\.bridge_claim_sanad_erp_refresh_v1\(uuid\)\s+from public,anon,authenticated/i);
assert.match(heartbeat, /invalid_device_credential/);
assert.match(heartbeat, /remoteRefreshCapable = body\?\.remote_refresh_v1 === true/);
assert.match(heartbeat, /pollingFromAgentCycle = body\?\.poll_remote_refresh_v1 === true/);
assert.match(heartbeat, /if \(remoteRefreshCapable && pollingFromAgentCycle\)/,
  'Standalone heartbeat diagnostics must not claim refresh commands');
assert.match(device, /string\.Equals\(item, "--agent-cycle"/,
  'Only the mutex-owned agent-cycle may request pending commands');
assert.match(device, /poll_remote_refresh_v1/,
  'On-prem heartbeat must declare whether it is actually polling');

assert.match(heartbeat, /bridge_claim_sanad_erp_refresh_v1/);
assert.match(heartbeat, /refresh_request_id: refreshRequestId/);
assert.doesNotMatch(heartbeat, /\bexec\(|Deno\.Command\(/, 'Cloud never executes Edaa/Windows code');
assert.match(device, /Guid\.TryParse\(requestedValue/);
assert.match(device, /remote_refresh_v1/);
assert.match(cycle, /PendingForcedRefreshRequestId/);
assert.match(cycle, /--force-logical-snapshot/);
assert.match(cycle, /EdaaLogicalSnapshotCommand\.RunAsync\(snapshotArgs\)/);
assert.match(ui, /get_sanad_erp_refresh_status_v1/);
assert.match(ui, /request_sanad_erp_refresh_v1/);
assert.match(ui, /status === 'completed'/);
assert.match(ui, /snapshot_public_id/);
assert.match(route, /SanadBridgeRefreshControl/);
assert.match(route, /connection\.provider_code === 'edaa_v5'/);
console.log('SANAD on-demand Bridge remote command, authorization and source freshness guard PASS');
