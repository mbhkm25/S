import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/main.tsx', 'utf8');
const home = readFileSync('src/components/Home.tsx', 'utf8');
const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx', 'utf8');
const workspace = readFileSync('src/features/financial/FinancialWorkspaceRoute.tsx', 'utf8');
const projectWorkspace = readFileSync('src/features/projects/SanadProjectWorkspaceRoute.tsx', 'utf8');
const projectData = readFileSync('src/features/projects/projectQuickAccess.ts', 'utf8');
const unifiedEntry = readFileSync('src/features/shell/SanadUnifiedEntryRoute.tsx', 'utf8');
const unifiedNav = readFileSync('src/components/navigation/SanadUnifiedNavLinks.tsx', 'utf8');
const actionRoute = readFileSync('src/features/financial/FinancialActionRoute.tsx', 'utf8');
const sectionRoute = readFileSync('src/features/financial/PersonalFinanceSectionRoute.tsx', 'utf8');
const overview = readFileSync('src/features/financial/PersonalFinanceOverview.tsx', 'utf8');
const masterActions = readFileSync('src/features/financial/FinancialMasterDataActions.tsx', 'utf8');
const financeActions = readFileSync('src/features/financial/FinancialWorkspaceActions.tsx', 'utf8');
const api = readFileSync('src/features/financial/api/financialApi.ts', 'utf8');
const productHeader = readFileSync('src/components/navigation/ProductAppHeader.tsx', 'utf8');
const unifiedSidebar = readFileSync('src/components/navigation/SanadUnifiedSidebar.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');


assert.match(home, /window\.location\.replace\(sanadUrl\(\)\)/, 'authenticated root must open the unified SANAD shell');
assert.match(home, /today/, 'authenticated root must land on Today, not a general chat');
assert.match(home, /single SANAD workspace shell/, 'authenticated root must remain inside the unified SANAD shell');
assert.doesNotMatch(workspace, /onClick=\{\(\) => go\(\)\}/, 'top-level workspaces must not navigate back to the retired root');
for (const label of ['اليوم', 'المدير الشخصي', 'الأعمال', 'المزيد']) {
  assert.match(unifiedNav, new RegExp(label), `unified navigation must include ${label}`);
}
for (const retired of ['محادثة جديدة', 'المحادثات', 'المال الشخصي']) {
  assert.doesNotMatch(unifiedNav, new RegExp(retired), `global navigation must not include ${retired}`);
}
assert.match(shell, /SanadUnifiedSidebar/);
assert.match(unifiedSidebar, /الحساب والإعدادات/, 'Account/settings belongs to the global sidebar account menu.');
assert.doesNotMatch(shell, /<ProductAppHeader/, 'The legacy product header is no longer mounted by SANAD unified shell.');
assert.doesNotMatch(unifiedSidebar, /payment-inbox\.html/, 'Payment inbox must not remain in the global sidebar footer.');
assert.match(unifiedEntry, /payment-inbox\.html/, 'Payment inbox remains reachable under More.');
assert.match(unifiedSidebar, /NotificationBell/, 'Global sidebar must preserve notifications utility.');
assert.doesNotMatch(shell, /ProductBottomNav/, 'target workspace shell must not render the legacy four-product navigation');

assert.match(productHeader, /payment-inbox\.html/, 'shared product header must expose Payment Inbox');
assert.match(productHeader, /وارد المدفوعات/, 'shared product header must label Payment Inbox access');
assert.match(app, /payment-inbox\.html/, 'global app header must expose Payment Inbox');
assert.match(styles, /noto-sans-arabic-arabic-wght-normal\.woff2/, 'Noto Sans Arabic Arabic variable subset must be self-hosted');
assert.match(styles, /noto-sans-arabic-latin-wght-normal\.woff2/, 'Noto Sans Arabic Latin variable subset must be self-hosted');
assert.match(styles, /font-display:\s*swap/, 'self-hosted Noto Sans Arabic must use font-display swap');
assert.doesNotMatch(styles, /fonts\.googleapis\.com/, 'primary SANAD typography must not depend on Google Fonts at runtime');

for (const route of ['financial', 'commercial', 'account-center', 'sanad-ai', 'today', 'more', 'library', 'connections', 'tasks', 'approvals', 'automations']) {
  assert.match(main, new RegExp(route.replace('-', '\\-')), `main.tsx must recognize /${route}`);
}

for (const actionRouteName of ['financial', 'commercial']) {
  assert.match(shell, new RegExp(actionRouteName), `workspace shell must include ${actionRouteName} action routing`);
}

for (const section of ['accounts', 'transactions', 'obligations', 'budgets', 'goals', 'parties']) {
  assert.match(main, new RegExp(section), `main.tsx must recognize /financial/${section}`);
  assert.match(shell, new RegExp(section), `workspace shell must route /financial/${section}`);
  assert.match(sectionRoute, new RegExp(section), `personal finance section route must expose ${section}`);
  assert.match(overview, new RegExp(`financial/${section}`), `personal finance overview must link to ${section}`);
}

assert.match(projectWorkspace, /محادثات/);
assert.match(projectWorkspace, /المصادر/);
assert.match(projectWorkspace, /الأدوات/);
assert.match(projectWorkspace, /المكتبة/);
assert.match(projectWorkspace, /إدارة النشاط/);
assert.match(projectData, /listSanadProjectThreads/);
assert.match(projectData, /createSanadProjectThread/);
assert.match(projectData, /setSanadProjectThreadPinned/);
assert.match(projectWorkspace, /لا توجد محادثات عامة خارجها/);
assert.match(shell, /SanadProjectWorkspaceRoute/);

assert.match(actionRoute, /PersonalMasterDataActions/, 'personal actions must expose master-data management');
assert.match(actionRoute, /personalFocus/, 'personal action route must support contextual focus');
assert.match(actionRoute, /FOCUS_META/, 'personal action route must return to the originating section');
assert.match(sectionRoute, /financial\/actions\?focus=/, 'personal finance sections must deep-link focused actions');
assert.match(masterActions, /initialMode/, 'personal master-data actions must accept an initial focused mode');
assert.match(financeActions, /initialMode/, 'personal finance actions must accept an initial focused mode');
assert.match(actionRoute, /BusinessMasterDataActions/, 'commercial actions must expose party management');
assert.match(actionRoute, /CommercialSettlementPanel/, 'commercial actions must use compatibility-filtered settlement panel');

for (const rpc of [
  'create_personal_finance_account_v1',
  'create_personal_finance_category_v1',
  'create_personal_finance_party_v1',
  'create_business_party_v1',
  'get_business_commercial_settlement_candidates_v1',
  'settle_business_commercial_document_v1',
  'get_my_finance_balances_v1',
]) {
  assert.match(api, new RegExp(rpc), `financial API gateway must expose ${rpc}`);
}

console.log('Financial workspace route/API contract passed.');
