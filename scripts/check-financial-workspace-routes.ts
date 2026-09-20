import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/main.tsx', 'utf8');
const home = readFileSync('src/components/Home.tsx', 'utf8');
const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx', 'utf8');
const workspace = readFileSync('src/features/financial/FinancialWorkspaceRoute.tsx', 'utf8');
const productNav = readFileSync('src/components/navigation/ProductBottomNav.tsx', 'utf8');
const actionRoute = readFileSync('src/features/financial/FinancialActionRoute.tsx', 'utf8');
const sectionRoute = readFileSync('src/features/financial/PersonalFinanceSectionRoute.tsx', 'utf8');
const overview = readFileSync('src/features/financial/PersonalFinanceOverview.tsx', 'utf8');
const masterActions = readFileSync('src/features/financial/FinancialMasterDataActions.tsx', 'utf8');
const financeActions = readFileSync('src/features/financial/FinancialWorkspaceActions.tsx', 'utf8');
const api = readFileSync('src/features/financial/api/financialApi.ts', 'utf8');
const productHeader = readFileSync('src/components/navigation/ProductAppHeader.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');


assert.match(home, /window\.location\.replace\(financialUrl\(\)\)/, 'authenticated root must hand off into a product workspace');
assert.match(home, /not a fifth SANAD workspace/, 'authenticated root must remain explicitly non-product');
assert.doesNotMatch(workspace, /onClick=\{\(\) => go\(\)\}/, 'top-level workspaces must not navigate back to the retired root');
for (const label of ['سند', 'سند المالي', 'سند للأعمال', 'حسابي']) {
  assert.match(productNav, new RegExp(label), `four-domain navigation must include ${label}`);
}

assert.match(productHeader, /payment-inbox\.html/, 'shared product header must expose Payment Inbox');
assert.match(productHeader, /وارد المدفوعات/, 'shared product header must label Payment Inbox access');
assert.match(app, /payment-inbox\.html/, 'global app header must expose Payment Inbox');
assert.match(styles, /noto-sans-arabic-arabic-wght-normal\\.woff2/, 'Noto Sans Arabic Arabic variable subset must be self-hosted');
assert.match(styles, /noto-sans-arabic-latin-wght-normal\\.woff2/, 'Noto Sans Arabic Latin variable subset must be self-hosted');
assert.match(styles, /font-display:\\s*swap/, 'self-hosted Noto Sans Arabic must use font-display swap');
assert.doesNotMatch(styles, /fonts\\.googleapis\\.com/, 'primary SANAD typography must not depend on Google Fonts at runtime');

for (const route of ['financial', 'commercial', 'account-center', 'sanad-ai']) {
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
