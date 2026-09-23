import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/main.tsx', 'utf8');
const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx', 'utf8');
const header = readFileSync('src/components/navigation/ProductAppHeader.tsx', 'utf8');
const nav = readFileSync('src/components/navigation/SanadUnifiedNavLinks.tsx', 'utf8');
const sidebar = readFileSync('src/components/navigation/SanadUnifiedSidebar.tsx', 'utf8');
const agentSidebar = readFileSync('src/features/assistant/AssistantWorkspaceSidebar.tsx', 'utf8');
const entry = readFileSync('src/features/shell/SanadUnifiedEntryRoute.tsx', 'utf8');
const businessCapability = readFileSync('src/features/shell/BusinessCapabilityRoute.tsx', 'utf8');
const bottomNav = readFileSync('src/components/navigation/ProductBottomNav.tsx', 'utf8');

assert.match(shell, /SanadUnifiedSidebar/);
assert.match(shell, /data-unified-shell-body="true"/);
assert.doesNotMatch(shell, /<ProductBottomNav/, 'legacy four-product nav must not render in the target shell');
assert.match(header, /onOpenNavigation/);
assert.match(header, /فتح تنقل سند/);

for (const label of [
  'اليوم',
  'المكتبة',
  'المهام',
  'الموافقات',
  'الأتمتة',
  'المال الشخصي',
  'الأعمال',
  'الاتصالات',
  'الحساب والإعدادات',
]) {
  assert.ok(nav.includes(label), 'unified SANAD navigation missing ' + label);
}

for (const path of [
  "'today'",
  "'library'",
  "'work/tasks'",
  "'work/approvals'",
  "'work/automations'",
  "'financial'",
  "'commercial'",
  "'connections'",
  "'account-center'",
]) {
  assert.ok(nav.includes(path), 'unified SANAD route missing ' + path);
}

for (const routeToken of ['today', 'library', 'connections', 'work\\/(?:tasks|approvals|automations)', 'business\\/manage']) {
  assert.ok(main.includes(routeToken), 'main route matcher missing ' + routeToken);
  assert.ok(shell.includes(routeToken), 'shell route matcher missing ' + routeToken);
}

assert.match(agentSidebar, /SanadUnifiedNavLinks/);
assert.match(agentSidebar, />سند</);
assert.ok(
  agentSidebar.indexOf('محادثة جديدة') < agentSidebar.indexOf("sections={['work', 'capabilities', 'utility']}"),
  'Conversation sidebar must prioritize New Chat/history before secondary product navigation.',
);
assert.doesNotMatch(agentSidebar, />مساعد سند</);

assert.match(entry, /get_my_sanad_today_v1/);
assert.match(entry, /list_my_sanad_work_items_v1/);
assert.match(entry, /list_my_sanad_connections_v1/);
assert.match(entry, /p_view:\s*view/);
assert.match(entry, /p_business_id:\s*null/);
assert.match(entry, /p_limit:/);

assert.match(sidebar, /data-sanad-global-sidebar="true"/);
assert.match(sidebar, /lg:static/);
assert.match(sidebar, /SanadUnifiedNavLinks/);
assert.match(nav, /title="القدرات"/);
assert.doesNotMatch(nav, /القدرات والاتصالات/);
assert.match(businessCapability, /BusinessManage/);
assert.match(businessCapability, /business\/manage\/operations/);
assert.match(businessCapability, /business\/manage\/team/);
assert.match(businessCapability, /business\/manage\/customers/);
assert.doesNotMatch(sidebar, /fixed inset-(?:0|y-0)/);

assert.ok(bottomNav.includes('TRANSITIONAL') || bottomNav.includes('ProductBottomNav'),
  'legacy component may remain for compatibility but must be unmounted from target shell');

console.log('SANAD Stage 2B R2 unified shell contract passed.');
