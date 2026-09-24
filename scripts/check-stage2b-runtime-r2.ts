import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/main.tsx', 'utf8');
const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx', 'utf8');
const header = readFileSync('src/components/navigation/ProductAppHeader.tsx', 'utf8');
const nav = readFileSync('src/components/navigation/SanadUnifiedNavLinks.tsx', 'utf8');
const sidebar = readFileSync('src/components/navigation/SanadUnifiedSidebar.tsx', 'utf8');
const agent = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const agentSidebar = readFileSync('src/features/assistant/AssistantWorkspaceSidebar.tsx', 'utf8');
const entry = readFileSync('src/features/shell/SanadUnifiedEntryRoute.tsx', 'utf8');
const businessCapability = readFileSync('src/features/shell/BusinessCapabilityRoute.tsx', 'utf8');

// One shell-owned primary sidebar must survive route transitions, including /sanad-ai.
assert.match(shell, /data-sanad-persistent-shell="true"/);
assert.equal((shell.match(/<SanadUnifiedSidebar/g) || []).length, 1);
assert.ok(shell.indexOf('<SanadUnifiedSidebar') < shell.indexOf('{assistant ? ('),
  'Global sidebar must be mounted above route-specific conditional rendering.');
assert.match(shell, /data-sanad-main-column="true"/);
assert.match(shell, /data-unified-shell-body="true"/);
assert.match(shell, /onOpenNavigation=\{\(\) => setNavigationOpen\(true\)\}/);
assert.doesNotMatch(shell, /ProductBottomNav/);
assert.match(header, /onOpenNavigation/);
assert.match(header, /utilityOnly/);
assert.match(header, /فتح تنقل سند/);

// The primary sidebar is desktop-sticky for document routes and shell-owned for viewport routes.
// Only the global drawer is viewport-fixed on mobile; the contextual conversation panel stays
// inside the assistant's workspace body.
assert.match(sidebar, /data-sanad-global-sidebar="true"/);
assert.match(sidebar, /data-sanad-sidebar-position=/);
assert.match(sidebar, /lg:sticky lg:top-0/);
assert.match(sidebar, /lg:static lg:self-stretch/);
assert.match(sidebar, /fixed inset-y-0 right-0/);
assert.match(sidebar, /SanadUnifiedNavLinks/);
assert.match(sidebar, /sections=\{\['primary', 'work', 'capabilities'\]\}/);
assert.match(sidebar, /sections=\{\['utility'\]\}/);
assert.match(sidebar, /فتح سند/);

for (const label of [
  'اليوم', 'المكتبة', 'المهام', 'الموافقات',
  'الأتمتة', 'المال الشخصي', 'الأعمال', 'الاتصالات', 'الحساب والإعدادات',
]) {
  assert.ok(nav.includes(label), 'Global navigation missing: ' + label);
}
for (const path of [
  "'today'", "'library'", "'work/tasks'", "'work/approvals'",
  "'work/automations'", "'financial'", "'commercial'",
  "'connections'", "'account-center'",
]) {
  assert.ok(nav.includes(path), 'Global navigation route missing: ' + path);
}
assert.match(nav, /title="القدرات"/);
assert.doesNotMatch(nav, /القدرات والاتصالات/);
assert.match(nav, /--sanad-interactive/);
assert.match(nav, /\/business\\\/manage/);
assert.match(nav, /data-sanad-unified-navigation="true"/);
assert.match(nav, /shouldHandleProductLinkClick/);

// Conversation-specific state may never redefine the product's global navigation.
assert.match(agent, /AssistantWorkspaceSidebar/);
assert.match(agent, /xl:grid-cols-\[252px_minmax\(0,1fr\)\]/);
assert.match(agentSidebar, /data-sidebar-density="compact"/);
assert.match(agentSidebar, /مساحة المحادثة/);
assert.match(agentSidebar, /محادثة جديدة/);
assert.match(agentSidebar, /المحادثات/);
assert.match(agentSidebar, /الذاكرة/);
assert.doesNotMatch(agentSidebar, /SanadUnifiedNavLinks/);
assert.doesNotMatch(agentSidebar, /العمل والقدرات/);

for (const routeToken of ['today','library','connections','work\\/(?:tasks|approvals|automations)','business\\/manage']) {
  assert.ok(main.includes(routeToken), 'Router missing ' + routeToken);
  assert.ok(shell.includes(routeToken), 'Shell route matcher missing ' + routeToken);
}
for (const rpc of ['get_my_sanad_today_v1','list_my_sanad_work_items_v1','list_my_sanad_connections_v1']) {
  assert.ok(entry.includes(rpc), 'Entry surface missing backend contract ' + rpc);
}
for (const route of ['/operations','/team','/customers']) {
  assert.ok(businessCapability.includes('business/manage' + route),
    'Business management capability route missing ' + route);
}

console.log('Stage 2B R2 persistent global shell and contextual conversation contract passed.');
