import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const sidebar = read('src/components/navigation/SanadUnifiedSidebar.tsx');
const nav = read('src/components/navigation/SanadUnifiedNavLinks.tsx');
const shell = read('src/features/financial/FinancialWorkspaceShell.tsx');
const project = read('src/features/shell/SanadProjectWorkspaceRoute.tsx');
const agent = read('src/features/assistant/SanadAgentWorkspace.tsx');
const context = read('src/features/assistant/sanadProjectContext.ts');
const api = read('src/features/assistant/assistantWorkspaceApi.ts');
const migration = read('supabase/migrations/20260925213000_stage2c_project_threads_v1.sql');
const entry = read('src/features/shell/SanadUnifiedEntryRoute.tsx');
const app = read('src/App.tsx');
const bell = read('src/components/notifications/NotificationBell.tsx');

assert.match(app, /window\.location\.replace\(\x60\$\{cleanBase\}today\x60\)/);
assert.equal((shell.match(/<SanadUnifiedSidebar/g) || []).length, 1);
assert.match(shell, /SanadProjectWorkspaceRoute/);
assert.match(shell, /SanadNotificationRoute/);
assert.match(shell, /data-workspace-body="viewport"/);
assert.match(sidebar, /data-sanad-header-notifications="true"/);
assert.match(sidebar, /مساحة الذكاء والتشغيل/);
assert.match(sidebar, /NotificationBell showWorkspaces=\{false\}/);
assert.match(bell, /showWorkspaces = true/);
assert.doesNotMatch(sidebar, /SanadSidebarConversations|MessageSquarePlus|SanadAssistantSidebarSections|data-sanad-primary-action="new-conversation"/);
for(const label of ['اليوم','المدير الشخصي','الأعمال','المزيد']) assert.ok(nav.includes(label), label);
for(const old of ["label: 'المحادثات'","label: 'محادثة جديدة'","title=\"العمل\""]) assert.ok(!nav.includes(old), old);
assert.match(nav, /readSanadProject/);
assert.match(entry, /list_my_sanad_work_items_v1/);
assert.match(entry, /get_my_sanad_today_v1/);
assert.match(entry, /more/);
assert.match(project, /get_user_business_contexts/);
assert.match(project, /create_my_sanad_project_thread_v1/);
assert.match(project, /list_my_sanad_project_threads_v1/);
assert.match(project, /set_my_sanad_agent_thread_pin_v1/);
assert.match(project, /classifySanadLegacyPersonalThread/);
assert.match(project, /rememberActiveManagedBusiness/);
assert.doesNotMatch(project, /customer_businesses|pending_invitations/, 'customer or invitation cannot grant admin project');
assert.match(agent, /getSanadProjectThread/);
assert.match(agent, /projectScope\.kind === 'business'/);
assert.match(agent, /projectBackendReady/);
assert.match(agent, /threadReadOnly = !projectScope/);
assert.match(context, /readSanadProject/);
assert.match(api, /createSanadProjectThread/);
for(const contract of [
  'sanad_agent_thread_pins',
  'create_my_sanad_project_thread_v1',
  'get_my_sanad_project_thread_v1',
  'list_my_sanad_project_threads_v1',
  'set_my_sanad_agent_thread_pin_v1',
  'classify_my_sanad_legacy_thread_v1',
  'thread_origin_immutable',
  'action_project_scope_mismatch',
  'can_access_sanad_agent_thread_v2',
  'revoke all on public.sanad_agent_thread_pins'
]) assert.ok(migration.includes(contract), contract);
assert.doesNotMatch(migration, /drop table|truncate table/i);
console.info('2C.1: project-only navigation, independent permissions and single-shell layout static contracts PASS');
