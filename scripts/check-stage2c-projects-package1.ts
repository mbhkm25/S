import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sidebar = readFileSync('src/components/navigation/SanadUnifiedSidebar.tsx','utf8');
const nav = readFileSync('src/components/navigation/SanadUnifiedNavLinks.tsx','utf8');
const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx','utf8');
const project = readFileSync('src/features/projects/SanadProjectWorkspaceRoute.tsx','utf8');
const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx','utf8');
const api = readFileSync('src/features/assistant/assistantWorkspaceApi.ts','utf8');
const settings = readFileSync('src/features/settings/SanadAssistantManagementPanel.tsx','utf8');
const notification = readFileSync('src/components/notifications/NotificationBell.tsx','utf8');
const app = readFileSync('src/App.tsx','utf8');
const home = readFileSync('src/components/Home.tsx','utf8');
const migration = readFileSync('supabase/migrations/20260925211500_stage2c_project_scoped_conversations_v1.sql','utf8');

for (const label of ['اليوم','المدير الشخصي','الأعمال','المزيد']) assert.match(nav,new RegExp(label));
for (const forbidden of ['محادثة جديدة','المحادثات','المكتبة','الاتصالات']) {
  assert.doesNotMatch(nav,new RegExp(forbidden), 'global sidebar primary nav must stay short: '+forbidden);
}
assert.doesNotMatch(sidebar,/SanadSidebarConversations|SanadAssistantSidebarSections|data-sanad-primary-action="new-conversation"/);
assert.match(sidebar,/مساحة الذكاء والتشغيل/);
assert.match(sidebar,/NotificationBell/);
assert.match(sidebar,/showWorkspaces=\{false\}/);
assert.match(notification,/showWorkspaces\?: boolean/);
assert.match(notification,/showWorkspaces && workspaces\.length > 0/);

assert.match(app,/window\.location\.replace\(\x60\$\{cleanBase\}today\x60\)/);
assert.match(home,/return \x60\$\{cleanBase\}today\x60/);
assert.match(shell,/SanadProjectWorkspaceRoute/);
assert.match(shell,/kind=\{commercial \? 'business' : 'personal'\}/);
assert.match(shell,/\(today\|more\|library\|connections/);

for (const label of ['المحادثات','المصادر','الأدوات','المكتبة','إدارة النشاط']) assert.match(project,new RegExp(label));
assert.match(project,/getUserBusinessContexts/);
assert.match(project,/dedupeBusinesses/);
assert.match(project,/listSanadProjectThreads/);
assert.match(project,/createSanadProjectThread/);
assert.match(project,/setSanadProjectThreadPinned/);
assert.match(project,/legacy_unclassified/);
assert.match(project,/لا توجد محادثات عامة خارجها/);
assert.match(project,/علاقة العميل بالنشاط لا تمنح صلاحيات إدارة المشروع/);

assert.match(workspace,/لا توجد محادثة عامة في سند/);
assert.match(workspace,/getSanadAgentThread\(selectedThreadId\)/);
assert.doesNotMatch(workspace,/sanad:new-conversation|اختر النشاط لهذه المحادثة|createThreadForBusiness/);
assert.match(workspace,/\{selectedThreadId \? \(\s*<form/s,'composer must render only for a selected project conversation');

for (const fn of [
  'list_my_sanad_project_threads_v1',
  'create_my_sanad_agent_thread_v2',
  'set_my_sanad_agent_thread_pin_v1',
  'classify_my_legacy_sanad_agent_thread_v1',
]) {
  assert.match(api,new RegExp(fn));
  assert.match(migration,new RegExp(fn));
}
assert.match(migration,/legacy_unclassified/);
assert.match(migration,/thread_project_rebind_not_allowed/);
assert.match(migration,/sanad_agent_thread_preferences/);
assert.match(migration,/private\.user_is_active_business_member/);
assert.match(migration,/revoke all on public\.sanad_agent_thread_preferences from public,anon,authenticated/);
assert.match(migration,/project_scope_consistency/);

for (const key of ['save_history_enabled','memory_enabled','proactive_insights_enabled','response_cards_enabled']) assert.match(settings,new RegExp(key));
assert.match(settings,/إدارة مساعد سند/);
assert.match(settings,/forgetMemory/);

console.log('Stage 2C Package 1 project shell, scoped conversation and sidebar contract PASS');
