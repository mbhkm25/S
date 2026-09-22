import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx', 'utf8');
const route = readFileSync('src/features/financial/FinancialWorkspaceRoute.tsx', 'utf8');
const agent = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const sidebar = readFileSync('src/features/assistant/AssistantWorkspaceSidebar.tsx', 'utf8');
const nav = readFileSync('src/components/navigation/ProductBottomNav.tsx', 'utf8');
const header = readFileSync('src/components/navigation/ProductAppHeader.tsx', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const html = readFileSync('index.html', 'utf8');

assert.doesNotMatch(
  agent,
  /calc\(100(?:d|s|l)?vh\s*-/i,
  'SANAD Agent must not subtract external chrome from viewport height.',
);
assert.doesNotMatch(
  agent,
  /h-\[calc\(100dvh-/,
  'SANAD Agent must not own an outer viewport-height formula.',
);
assert.match(agent, /h-full min-h-0 min-w-0 flex-col overflow-hidden/);
assert.match(agent, /data-scroll-owner="timeline"/);
assert.match(agent, /overflow-y-auto overscroll-contain/);
assert.match(agent, /\[scrollbar-gutter:stable\]/);
assert.match(agent, /data-workspace-slot="composer"/);
assert.doesNotMatch(
  agent,
  /<form[^>]*className="[^"]*sticky\s+bottom-0/s,
  'Composer must be a normal non-scrolling layout slot, not sticky overlay chrome.',
);
assert.match(agent, /timeline\.scrollTo\(\{ top: timeline\.scrollHeight/);
assert.doesNotMatch(
  agent,
  /endRef\.current\?\.scrollIntoView/,
  'Conversation autoscroll must target the timeline owner directly.',
);

assert.match(shell, /data-workspace-mode=\{assistant \? 'viewport' : 'document'\}/);
assert.match(shell, /flex h-dvh min-h-0 flex-col overflow-hidden/);
assert.match(shell, /min-h-0 flex-1 overflow-hidden/);
assert.match(shell, /data-workspace-body="viewport"/);
assert.match(shell, /relative min-h-0 flex-1 overflow-hidden pt-1\.5/);
assert.match(shell, /layoutMode=\{assistant \? 'viewport' : 'document'\}/);
assert.match(
  shell,
  /: 'sanad-canvas min-h-screen'/,
  'Document workspaces must retain document flow.',
);

assert.match(route, /const viewportMode = kind === 'ai'/);
assert.match(route, /flex h-full min-h-0 flex-col overflow-hidden/);
assert.match(route, /flex-1 flex-col overflow-hidden/);
assert.match(route, /data-conversation-route-surface="open"[\s\S]*<Suspense/s);

assert.match(sidebar, /className="absolute inset-0 z-40/);
assert.match(sidebar, /className=\{`sanad-sidebar-surface absolute inset-y-0 right-0 z-50/);
assert.doesNotMatch(
  sidebar,
  /fixed inset-(?:0|y-0)/,
  'Assistant sidebar and backdrop must stay inside the shell-owned workspace body, not the viewport.',
);
assert.doesNotMatch(
  sidebar,
  /top-\[[^\]]+\]|top:\s*\d|calc\([^)]*header/i,
  'Sidebar must not guess global header height with magic top offsets.',
);
assert.match(
  route,
  /: 'mx-auto w-full max-w-\[1440px\] space-y-5 px-4 py-5 pb-32/,
  'Document route geometry must remain available for non-AI workspaces.',
);

assert.match(nav, /layoutMode\?: 'document' \| 'viewport'/);
assert.match(nav, /viewportMode \? 'relative shrink-0' : 'fixed inset-x-0 bottom-0'/);
assert.match(nav, /pb-\[var\(--sanad-mobile-system-clearance\)\]/);
assert.match(nav, /lg:fixed/);

assert.match(header, /sticky top-0 z-\[60\] shrink-0/);

assert.match(html, /viewport-fit=cover/);
assert.match(html, /interactive-widget=resizes-content/);
assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);

for (const source of [shell, route, agent, nav]) {
  assert.doesNotMatch(
    source,
    /visualViewport/,
    'Stage 1B stays CSS/platform-first; VisualViewport JS is not part of the baseline contract.',
  );
}

console.log('SANAD viewport and scroll contract checks passed.');
