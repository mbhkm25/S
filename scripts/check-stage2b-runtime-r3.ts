import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx', 'utf8');
const globalSidebar = readFileSync('src/components/navigation/SanadUnifiedSidebar.tsx', 'utf8');
const provider = readFileSync('src/features/shell/SanadAssistantSettingsContext.tsx', 'utf8');
const agent = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const settingsPanel = readFileSync('src/features/settings/SanadAssistantManagementPanel.tsx', 'utf8');
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
assert.match(globalSidebar, /sanad:sidebar-collapsed-v1/);
assert.match(globalSidebar, /NotificationBell/);
assert.match(globalSidebar, /showWorkspaces=\{false\}/);
assert.match(globalSidebar, /مساحة الذكاء والتشغيل/);
assert.match(globalSidebar, /getUserAvatarUrl/);
assert.doesNotMatch(globalSidebar, /SanadSidebarConversations|SanadAssistantSidebarSections|محادثة جديدة/, 'Global sidebar must not expose project conversations or new-chat action.');
assert.doesNotMatch(globalSidebar, /payment-inbox\.html/, 'Payment inbox moves under More, not the sidebar footer.');

for (const label of ['اليوم','المدير الشخصي','الأعمال','المزيد']) {
  assert.match(readFileSync('src/components/navigation/SanadUnifiedNavLinks.tsx','utf8'), new RegExp(label));
}

for (const key of ['save_history_enabled','memory_enabled','proactive_insights_enabled','response_cards_enabled']) {
  assert.ok(settingsPanel.includes(key), 'Assistant preference missing '+key);
}
assert.match(settingsPanel, /إدارة مساعد سند/);
assert.match(settingsPanel, /forgetMemory/);
assert.match(settingsPanel, /SettingSwitch/);

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
assert.match(agent, /لا توجد محادثة عامة في سند/);
assert.doesNotMatch(agent, /sanad:new-conversation|اختر النشاط لهذه المحادثة|AssistantWorkspaceSidebar|data-mobile-sidebar-trigger|setSidebarOpen/);

console.log('R3/R4 single-sidebar contract remains intact after project-scoped navigation transition PASS');
