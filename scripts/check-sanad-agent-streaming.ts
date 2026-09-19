import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync('supabase/functions/sanad-ai-agent-v1/index.ts', 'utf8');
const api = readFileSync('src/features/assistant/assistantAgentApi.ts', 'utf8');
const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');

for (const required of [
  'text/event-stream',
  'streamAgentResponse',
  'tool.started',
  'tool.completed',
  'answer.final',
  'run.completed',
  'body.stream === true',
  'X-Accel-Buffering',
]) {
  assert.ok(runtime.includes(required), `runtime streaming contract missing ${required}`);
}

for (const required of [
  'streamSanadAiAgentTurn',
  "Accept: 'text/event-stream'",
  'Authorization:',
  'apikey:',
  'response.body.getReader()',
  'parseSseBlock',
]) {
  assert.ok(api.includes(required), `client streaming contract missing ${required}`);
}

for (const required of [
  'streamSanadAiAgentTurn',
  'liveStatus',
  'liveTools',
  "event.type === 'tool.started'",
  "event.type === 'tool.completed'",
]) {
  assert.ok(workspace.includes(required), `workspace live stream contract missing ${required}`);
}

assert.ok(!workspace.includes('progressLabels'), 'workspace must not use simulated progress labels');
assert.ok(!workspace.includes('setInterval('), 'workspace must not simulate agent progress with timers');
assert.doesNotMatch(api, /service_role/i, 'browser streaming client must not contain service role access');
assert.doesNotMatch(workspace, /service_role/i, 'workspace must not contain service role access');
assert.doesNotMatch(runtime, /from\(["']business_erp_snapshot_rows["']\)/, 'streaming runtime must not query raw ERP snapshot rows');

console.log('SANAD Agent Streaming v1 contract passed.');
