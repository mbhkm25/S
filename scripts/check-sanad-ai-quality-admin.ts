import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync('src/lib/platformAdminApi.ts', 'utf8');
const quality = readFileSync('src/components/admin/SanadAgentQualityAdmin.tsx', 'utf8');
const platform = readFileSync('src/components/admin/PlatformAdmin.tsx', 'utf8');
const workspace = readFileSync('admin/src/AdminWorkspace.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260919221500_platform_admin_agent_eval_overview_v1.sql', 'utf8');

for (const required of [
  'platform_admin_get_agent_eval_overview',
  'sanad-ai-agent-eval-v1',
  'gemini-3.8-flash',
  'gemini-3.1-pro-preview',
]) {
  assert.ok(api.includes(required) || quality.includes(required), `quality admin missing ${required}`);
}

for (const required of [
  'assistant_quality',
  'جودة مساعد سند',
  'SanadAgentQualityAdmin',
]) {
  assert.ok(platform.includes(required), `PlatformAdmin missing ${required}`);
}

assert.ok(workspace.includes("'assistant_quality'"), 'standalone admin navigation must include assistant quality');
assert.ok(workspace.includes('جودة مساعد سند'), 'standalone admin label missing');
assert.ok(quality.includes('Golden Eval'), 'quality panel must expose golden eval action');
assert.ok(quality.includes('Release Gate'), 'quality panel must display release gate');
assert.ok(quality.includes('لا توجد ترقية تلقائية'), 'quality panel must state no automatic promotion');
assert.doesNotMatch(quality, /promote_sanad_assistant_release/);
assert.doesNotMatch(api, /promote_sanad_assistant_release/);

assert.match(migration, /is_platform_admin\(v_uid\)/);
assert.match(migration, /grant execute[\s\S]*authenticated/);
assert.match(migration, /revoke all[\s\S]*anon/);
assert.ok(migration.includes("metadata->>'eval_family'='agent_v1'"), 'overview must be scoped to agent_v1');

console.log('SANAD Agent Quality Admin v1 contract passed.');
