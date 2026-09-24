import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/main.tsx', 'utf8');
const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx', 'utf8');
const nav = readFileSync('src/components/navigation/SanadUnifiedNavLinks.tsx', 'utf8');
const sidebar = readFileSync('src/components/navigation/SanadUnifiedSidebar.tsx', 'utf8');
const history = readFileSync('src/components/navigation/SanadSidebarConversations.tsx', 'utf8');
const foundation = readFileSync('src/styles/sanad-foundation.css', 'utf8');
const agent = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const assistantSections = readFileSync('src/components/navigation/SanadAssistantSidebarSections.tsx', 'utf8');
const settingsProvider = readFileSync('src/features/shell/SanadAssistantSettingsContext.tsx', 'utf8');
const entry = readFileSync('src/features/shell/SanadUnifiedEntryRoute.tsx', 'utf8');
const businessCapability = readFileSync('src/features/shell/BusinessCapabilityRoute.tsx', 'utf8');

// Exactly one persistent product navigation owner regardless of active route.
assert.match(shell, /data-sanad-persistent-shell="true"/);
assert.equal((shell.match(/<SanadUnifiedSidebar/g) || []).length, 1);
assert.ok(shell.indexOf('<SanadUnifiedSidebar') < shell.indexOf('{assistant ? ('),
  'Product sidebar must be mounted outside route-specific workspaces.');
assert.match(shell, /data-sanad-main-column="true"/);
assert.match(shell, /data-unified-shell-body="true"/);
assert.match(shell, /data-sanad-mobile-menu-fab="true"/);
assert.doesNotMatch(shell, /data-sanad-mobile-menu-slot=/);
assert.doesNotMatch(shell, /<ProductAppHeader/);
assert.doesNotMatch(shell, /ProductBottomNav/);
assert.match(sidebar, /data-sanad-global-sidebar="true"/);
assert.match(sidebar, /lg:sticky lg:top-0/);
assert.match(sidebar, /lg:static lg:self-stretch/);
assert.match(sidebar, /fixed inset-y-0 right-0/);
assert.match(sidebar, /SanadUnifiedNavLinks/);
assert.match(sidebar, /SanadSidebarConversations/);
assert.match(sidebar, /SanadAssistantSidebarSections/);
assert.match(sidebar, /data-sanad-global-nav-scroll="true"/);

// Visual/IA refinements approved for R2.V2.
assert.match(sidebar, /data-sanad-brand-lockup="vertical"/);
assert.match(sidebar, /logo\.png/);
assert.doesNotMatch(sidebar, /<strong[^>]*>سند<\/strong>/);
assert.match(sidebar, /مساحة الذكاء والتشغيل/);
assert.match(sidebar, /data-sanad-primary-action="new-conversation"/);
assert.doesNotMatch(sidebar, />فتح سند</);
assert.match(sidebar, /sanad:sidebar-collapsed-v1/);
assert.match(sidebar, /data-sanad-account-menu="true"/);
assert.match(sidebar, /NotificationBell/);
assert.match(sidebar, /getUserAvatarUrl/);
assert.match(sidebar, /الحساب والإعدادات/);
assert.match(sidebar, /payment-inbox\.html/);

for (const label of ['اليوم', 'المكتبة', 'المهام', 'الموافقات',
  'الأتمتة', 'المال الشخصي', 'الأعمال', 'الاتصالات']) {
  assert.ok(nav.includes(label), 'Unified nav missing ' + label);
}
for (const path of ["'today'", "'library'", "'work/tasks'", "'work/approvals'",
  "'work/automations'", "'financial'", "'commercial'", "'connections'"]) {
  assert.ok(nav.includes(path), 'Unified nav route missing ' + path);
}
assert.match(nav, /data-sanad-sidebar-group/);
assert.match(nav, /font-semibold/);
assert.match(foundation, /--sanad-sidebar-section-bg/);
assert.match(foundation, /\.sanad-sidebar-section-heading/);
assert.match(nav, /--sanad-nav-active-bg/);
assert.doesNotMatch(nav, /border-r-2/);
assert.match(nav, /shouldHandleProductLinkClick/);
assert.match(nav, /\/business\\\/manage/);

// Shared conversation list now belongs to the global sidebar and uses R1
// participant-aware RPCs/roles, never an unrestricted cross-account query.
assert.match(history, /listSanadAgentThreads/);
assert.match(history, /thread\.my_role === 'viewer'/);
assert.match(history, /thread\.my_role === 'owner'/);
assert.match(history, /thread\.unread_count/);
assert.match(history, /archiveSanadAgentThread/);
assert.match(history, /sanad:select-conversation/);
assert.match(history, /sanad:thread-archived/);
assert.match(history, /sanad:threads-updated/);
assert.match(history, /data-sanad-global-conversations="true"/);
assert.match(history, /البحث في المحادثات/);
assert.match(history, /المحادثات/);
assert.doesNotMatch(history, /supabase\.from\(['"]sanad_agent_threads/, 'History must read R1 authorized RPCs.');

assert.match(agent, /data-conversation-surface="open"/);
assert.doesNotMatch(agent, /AssistantWorkspaceSidebar/);
assert.match(agent, /useSanadAssistantSettings/);
assert.match(shell, /SanadAssistantSettingsProvider/);
assert.match(agent, /grid-cols-\[minmax\(0,1fr\)\]/);
assert.match(agent, /sanad:select-conversation/);
assert.match(agent, /sanad:thread-selected/);
assert.match(agent, /sanad:threads-updated/);
assert.match(agent, /sanad:thread-archived/);
assert.match(agent, /data-scroll-owner="timeline"/);
assert.match(agent, /data-workspace-slot="composer"/);
assert.match(assistantSections, /data-sanad-assistant-inline="true"/);
assert.match(assistantSections, /data-sanad-inline-memory="true"/);
assert.match(assistantSections, /data-sanad-inline-settings="true"/);
assert.match(assistantSections, /الذاكرة/);
assert.match(assistantSections, /ضبط المساعد/);
assert.match(settingsProvider, /getSanadAgentPreferences/);
assert.match(settingsProvider, /getSanadAgentContext/);
assert.match(settingsProvider, /forgetSanadAgentMemory/);
assert.doesNotMatch(agent, /data-mobile-sidebar-trigger|data-sanad-context-panel/);
assert.doesNotMatch(assistantSections, /listSanadAgentThreads/);
assert.doesNotMatch(assistantSections, /SanadUnifiedNavLinks/);

for (const token of ['today','library','connections','work\\/(?:tasks|approvals|automations)','business\\/manage']) {
  assert.ok(main.includes(token), 'Router missing ' + token);
  assert.ok(shell.includes(token), 'Shell matcher missing ' + token);
}
for (const rpc of ['get_my_sanad_today_v1','list_my_sanad_work_items_v1','list_my_sanad_connections_v1']) {
  assert.ok(entry.includes(rpc), 'Entry route missing ' + rpc);
}
for (const path of ['/operations','/team','/customers']) {
  assert.ok(businessCapability.includes('business/manage' + path),
    'Business capability route missing ' + path);
}

console.log('Stage 2B R2.V2 unified sidebar, R1 conversation access and contextual panel contract passed.');
