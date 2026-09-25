import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/main.tsx', 'utf8');
const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx', 'utf8');
const nav = readFileSync('src/components/navigation/SanadUnifiedNavLinks.tsx', 'utf8');
const sidebar = readFileSync('src/components/navigation/SanadUnifiedSidebar.tsx', 'utf8');
const foundation = readFileSync('src/styles/sanad-foundation.css', 'utf8');
const agent = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const assistantSettings = readFileSync('src/features/settings/SanadAssistantManagementPanel.tsx', 'utf8');
const settingsProvider = readFileSync('src/features/shell/SanadAssistantSettingsContext.tsx', 'utf8');
const entry = readFileSync('src/features/shell/SanadUnifiedEntryRoute.tsx', 'utf8');
const businessCapability = readFileSync('src/features/shell/BusinessCapabilityRoute.tsx', 'utf8');
const projects = readFileSync('src/features/projects/SanadProjectWorkspaceRoute.tsx', 'utf8');
const projectData = readFileSync('src/features/projects/projectQuickAccess.ts', 'utf8');

// One persistent shell/sidebar remains the only global navigation owner.
assert.match(shell, /data-sanad-persistent-shell="true"/);
assert.equal((shell.match(/<SanadUnifiedSidebar/g) || []).length, 1);
assert.ok(shell.indexOf('<SanadUnifiedSidebar') < shell.indexOf('{assistant ? ('),
  'Product sidebar must be mounted outside route-specific workspaces.');
assert.match(shell, /data-sanad-main-column="true"/);
assert.match(shell, /data-unified-shell-body="true"/);
assert.match(shell, /data-sanad-mobile-menu-fab="true"/);
assert.doesNotMatch(shell, /data-sanad-mobile-menu-slot=/);
assert.doesNotMatch(shell, /<ProductAppHeader|ProductBottomNav/);

assert.match(sidebar, /data-sanad-global-sidebar="true"/);
assert.match(sidebar, /lg:sticky lg:top-0/);
assert.match(sidebar, /lg:static lg:self-stretch/);
assert.match(sidebar, /fixed inset-y-0 right-0/);
assert.match(sidebar, /SanadUnifiedNavLinks/);
assert.match(sidebar, /data-sanad-global-nav-scroll="true"/);
assert.match(sidebar, /data-sanad-brand-lockup="vertical"/);
assert.match(sidebar, /logo\.png/);
assert.match(sidebar, /مساحة الذكاء والتشغيل/);
assert.match(sidebar, /NotificationBell/);
assert.match(sidebar, /showWorkspaces=\{false\}/);
assert.match(sidebar, /sanad:sidebar-collapsed-v1/);
assert.match(sidebar, /data-sanad-account-menu="true"/);
assert.match(sidebar, /getUserAvatarUrl/);
assert.match(sidebar, /الحساب والإعدادات/);
assert.doesNotMatch(sidebar, /SanadSidebarConversations|SanadAssistantSidebarSections|data-sanad-primary-action="new-conversation"|payment-inbox\.html/);

for (const label of ['الرئيسية','المدير الشخصي','الأعمال']) {
  assert.ok(nav.includes(label), 'Unified nav missing ' + label);
}
for (const retired of ['محادثة جديدة','المحادثات','المال الشخصي']) {
  assert.ok(!nav.includes(retired), 'Global nav must not contain ' + retired);
}
for (const path of ["'today'","'financial'","'commercial'"]) {
  assert.ok(nav.includes(path), 'Unified nav route missing ' + path);
}
assert.match(nav, /--sanad-nav-active-bg/);
assert.doesNotMatch(nav, /border-r-2/);
assert.match(nav, /shouldHandleProductLinkClick/);
assert.match(foundation, /--sanad-sidebar-section-bg/);

// Conversation history is now project-owned rather than a global sidebar list.
assert.match(projectData, /listSanadProjectThreads/);
assert.match(projectData, /createSanadProjectThread/);
assert.match(projects, /setSanadProjectThreadPinned/);
assert.match(projects, /legacy_unclassified/);
assert.match(projects, /المحادثات/);
assert.match(projects, /ابحث في محادثات هذه المساحة/);

assert.match(agent, /data-conversation-surface="open"/);
assert.doesNotMatch(agent, /AssistantWorkspaceSidebar/);
assert.match(agent, /useSanadAssistantSettings/);
assert.match(shell, /SanadAssistantSettingsProvider/);
assert.match(agent, /grid-cols-\[minmax\(0,1fr\)\]/);
assert.match(agent, /sanad:thread-selected/);
assert.doesNotMatch(agent, /sanad:select-conversation|sanad:threads-updated|sanad:thread-archived|sanad:new-conversation/);
assert.match(agent, /data-scroll-owner="timeline"/);
assert.match(agent, /data-workspace-slot="composer"/);
assert.match(agent, /لا توجد محادثة عامة في سند/);
assert.match(assistantSettings, /إدارة مساعد سند/);
assert.match(assistantSettings, /الذاكرة/);
assert.match(assistantSettings, /SettingSwitch/);
assert.match(settingsProvider, /getSanadAgentPreferences/);
assert.match(settingsProvider, /getSanadAgentContext/);
assert.match(settingsProvider, /forgetSanadAgentMemory/);
assert.doesNotMatch(agent, /data-mobile-sidebar-trigger|data-sanad-context-panel/);

for (const token of ['today','more','library','connections','work\\/(?:tasks|approvals|automations)','business\\/manage']) {
  assert.ok(main.includes(token), 'Router missing ' + token);
  assert.ok(shell.includes(token), 'Shell matcher missing ' + token);
}
for (const rpc of ['get_my_sanad_today_v1','list_my_sanad_work_items_v1','list_my_sanad_connections_v1']) {
  assert.ok(entry.includes(rpc), 'Entry route missing ' + rpc);
}
assert.match(projects, /payment-inbox\.html/);
for (const path of ['/operations','/team','/customers']) {
  assert.ok(businessCapability.includes('business/manage' + path),
    'Business capability route missing ' + path);
}

console.log('Stage 2B R2 shell invariants preserved while Stage 2C project navigation owns conversations PASS');
