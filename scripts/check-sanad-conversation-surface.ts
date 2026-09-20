import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync('src/features/financial/FinancialWorkspaceRoute.tsx', 'utf8');
const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const sidebar = readFileSync('src/features/assistant/AssistantWorkspaceSidebar.tsx', 'utf8');

assert.match(route, /\{!viewportMode \? \(\s*<header/s, 'AI viewport mode must omit the secondary route header.');
assert.match(route, /\{!viewportMode \? \(\s*<section className="rounded-\[1\.6rem\]/s, 'AI viewport mode must omit the static description card.');
assert.match(route, /data-conversation-route-surface="open"/);
assert.match(workspace, /data-conversation-surface="open"/);
assert.doesNotMatch(
  workspace,
  /id="sanad-agent-workspace"[^>]*className="[^"]*(?:rounded-\[1\.5rem\]|shadow-\[0_10px_32px|border border-slate-200\/70)/s,
  'The conversation workspace must not regress into an outer framed card.',
);
assert.match(workspace, /data-mobile-sidebar-trigger/);
assert.match(workspace, /data-scroll-owner="timeline"/);
assert.match(workspace, /data-workspace-slot="composer"/);
assert.match(workspace, /data-composer-density="compact"/);
assert.match(workspace, /rows=\{1\}/);
assert.match(workspace, /max-h-\[64px\]/);
assert.match(workspace, /syncComposerTextareaHeight/);
assert.doesNotMatch(workspace, /max-h-40 min-h-\[56px\]/);

assert.match(sidebar, /data-sidebar-density="compact"/);
assert.match(sidebar, /مساعد سند/);
assert.match(sidebar, /assistantStatus/);
assert.match(sidebar, /businessLabel/);
assert.doesNotMatch(
  sidebar,
  /bg-white text-slate-950 shadow-sm ring-1 ring-slate-200/,
  'Sidebar tabs must stay flat rather than card-like.',
);

console.log('SANAD conversation surface simplification contract passed.');
