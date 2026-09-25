import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx', 'utf8');
const route = readFileSync('src/features/financial/FinancialWorkspaceRoute.tsx', 'utf8');
const agent = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const assistantSettings = readFileSync('src/features/settings/SanadAssistantManagementPanel.tsx', 'utf8');
const unifiedSidebar = readFileSync('src/components/navigation/SanadUnifiedSidebar.tsx', 'utf8');
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
assert.match(shell, /relative flex h-dvh min-h-0 overflow-hidden/);
assert.match(shell, /min-h-0 flex-1 overflow-hidden/);
assert.match(shell, /data-workspace-body="viewport"/);
assert.match(shell, /relative min-h-0 flex-1 overflow-hidden pt-1\.5/);
assert.doesNotMatch(shell, /ProductBottomNav/, 'target shell must not retain permanent legacy bottom navigation');
assert.match(shell, /data-unified-shell-body="true"/);
assert.match(shell, /data-sanad-persistent-shell="true"/);
assert.match(shell, /data-sanad-main-column="true"/);
assert.ok(shell.indexOf('<SanadUnifiedSidebar') < shell.indexOf('{assistant ? ('), 'Primary sidebar must be a persistent shell child on every route.');
assert.match(shell, /SanadUnifiedSidebar/);
assert.match(
  shell,
  /: 'sanad-canvas relative flex min-h-screen items-stretch'/,
  'Document workspaces must retain document flow inside the unified shell.',
);

assert.match(route, /const viewportMode = kind === 'ai'/);
assert.match(route, /flex h-full min-h-0 flex-col overflow-hidden/);
assert.match(route, /flex-1 flex-col overflow-hidden/);
assert.match(route, /data-conversation-route-surface="open"[\s\S]*<Suspense/s);

// Stage 2C: one global sidebar remains, while assistant memory/settings move to account settings.
assert.doesNotMatch(unifiedSidebar, /SanadAssistantSidebarSections|SanadSidebarConversations/);
assert.match(assistantSettings, /إدارة مساعد سند/);
assert.doesNotMatch(agent, /AssistantWorkspaceSidebar|data-mobile-sidebar-trigger/);

assert.match(
  route,
  /: 'mx-auto w-full max-w-\[1440px\] space-y-5 px-4 py-5 pb-32/,
  'Document route geometry must remain available for non-AI workspaces.',
);

assert.match(unifiedSidebar, /data-sanad-global-sidebar="true"/);
assert.match(unifiedSidebar, /fixed inset-y-0 right-0/);
assert.match(unifiedSidebar, /lg:static/);
assert.match(unifiedSidebar, /lg:sticky lg:top-0/);
assert.match(unifiedSidebar, /data-sanad-sidebar-position=/);
assert.match(unifiedSidebar, /onCloseMobile/);

assert.match(header, /sticky top-0 z-\[60\] shrink-0/);
assert.doesNotMatch(shell, /<ProductAppHeader/, 'Unified shell must not render the legacy top product header.');
assert.match(shell, /data-sanad-mobile-menu-fab="true"/);
assert.doesNotMatch(shell, /data-sanad-mobile-menu-slot=/);

assert.match(html, /viewport-fit=cover/);
assert.match(html, /interactive-widget=resizes-content/);
assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);

for (const source of [shell, route, agent, unifiedSidebar]) {
  assert.doesNotMatch(
    source,
    /visualViewport/,
    'Stage 1B stays CSS/platform-first; VisualViewport JS is not part of the baseline contract.',
  );
}

console.log('SANAD viewport and scroll contract checks passed.');
