import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/main.tsx', 'utf8');
const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx', 'utf8');
const actionRoute = readFileSync('src/features/financial/FinancialActionRoute.tsx', 'utf8');
const sectionRoute = readFileSync('src/features/financial/PersonalFinanceSectionRoute.tsx', 'utf8');
const overview = readFileSync('src/features/financial/PersonalFinanceOverview.tsx', 'utf8');
const api = readFileSync('src/features/financial/api/financialApi.ts', 'utf8');

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
