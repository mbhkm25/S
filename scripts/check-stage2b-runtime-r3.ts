import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx', 'utf8');
const globalSidebar = readFileSync('src/components/navigation/SanadUnifiedSidebar.tsx', 'utf8');
const inline = readFileSync('src/components/navigation/SanadAssistantSidebarSections.tsx', 'utf8');
const provider = readFileSync('src/features/shell/SanadAssistantSettingsContext.tsx', 'utf8');
const agent = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const history = readFileSync('src/features/shell/SanadProjectWorkspaceRoute.tsx', 'utf8');
const css = readFileSync('src/styles/sanad-foundation.css', 'utf8');

assert.equal((shell.match(/<SanadUnifiedSidebar/g) || []).length, 1, 'The shell must mount exactly one navigation sidebar.');
assert.match(shell, /<SanadAssistantSettingsProvider userId=\{userId\}>/);
assert.match(shell, /data-sanad-mobile-menu-fab="true"/);
assert.doesNotMatch(shell, /data-sanad-mobile-menu-slot=|<ProductAppHeader|ProductBottomNav/);
assert.match(shell, /lg:hidden/);
assert.match(shell, /aria-label="فتح تنقل سند"/);
assert.match(shell, /--sanad-safe-top/);
assert.match(css, /--sanad-safe-top:\s*max\(env\(safe-area-inset-top, 0px\), 0px\)/);

assert.match(globalSidebar, /data-sanad-global-sidebar="true"/);
assert.match(globalSidebar, /data-sanad-global-nav-scroll="true"/);
assert.doesNotMatch(globalSidebar, /SanadSidebarConversations/);
assert.doesNotMatch(globalSidebar, /SanadAssistantSidebarSections/);
assert.match(globalSidebar, /sanad:sidebar-collapsed-v1/);
assert.match(globalSidebar, /NotificationBell/);
assert.match(globalSidebar, /data-sanad-header-notifications="true"/);
assert.match(globalSidebar, /getUserAvatarUrl/);
assert.match(history, /list_my_sanad_project_threads_v1/);
assert.match(history, /thread\.my_role === 'viewer'/);
assert.match(history, /thread\.my_role !== 'owner'/);

assert.match(inline, /data-sanad-assistant-inline="true"/);
assert.match(inline, /data-sanad-inline-memory="true"/);
assert.match(inline, /data-sanad-inline-settings="true"/);
assert.match(inline, /aria-expanded=\{panel === 'memory'\}/);
assert.match(inline, /aria-expanded=\{panel === 'settings'\}/);
assert.match(inline, /getMySanadAgentPerformance/);
assert.match(inline, /forgetMemory/);
assert.match(inline, /SettingSwitch/);
assert.doesNotMatch(inline, /fixed inset|absolute inset|z-50.*overlay/s, 'Assistant options must be ordinary sidebar sections.');

for (const key of ['save_history_enabled','memory_enabled','proactive_insights_enabled','response_cards_enabled']) {
  assert.ok(inline.includes(key), 'Assistant preference missing '+key);
}
assert.match(provider, /getSanadAgentPreferences/);
assert.match(provider, /getSanadAgentContext/);
assert.match(provider, /forgetSanadAgentMemory/);
assert.match(provider, /listSanadAgentThreads/);
assert.match(provider, /pendingPreferenceRef\.current/);
assert.match(provider, /setPreferences\(previous\)/);
assert.match(provider, /setPreferences\(\{ \.\.\.preferences, \[key\]: value \}\)/);
assert.match(provider, /return \(\s*<AssistantSettingsContext.Provider/);

assert.match(agent, /useSanadAssistantSettings/);
assert.match(agent, /setMemorySnapshot\(selectedThreadId, context\.memories\)/);
assert.match(agent, /data-scroll-owner="timeline"/);
assert.match(agent, /data-workspace-slot="composer"/);
assert.doesNotMatch(agent, /AssistantWorkspaceSidebar|data-mobile-sidebar-trigger|setSidebarOpen/, 'No second assistant sidebar/backdrop may be mounted.');

console.log('R3 single-sidebar, shared-memory and mobile floating drawer contract PASS');
