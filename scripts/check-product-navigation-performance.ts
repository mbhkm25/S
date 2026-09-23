import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/main.tsx', 'utf8');
const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx', 'utf8');
const workspace = readFileSync('src/features/financial/FinancialWorkspaceRoute.tsx', 'utf8');
const sectionRoute = readFileSync('src/features/financial/PersonalFinanceSectionRoute.tsx', 'utf8');
const actionRoute = readFileSync('src/features/financial/FinancialActionRoute.tsx', 'utf8');
const productNav = readFileSync('src/components/navigation/ProductBottomNav.tsx', 'utf8');
const unifiedSidebar = readFileSync('src/components/navigation/UnifiedProductSidebar.tsx', 'utf8');
const productHeader = readFileSync('src/components/navigation/ProductAppHeader.tsx', 'utf8');
const navigation = readFileSync('src/lib/productNavigation.ts', 'utf8');
const loaders = readFileSync('src/features/financial/productRouteLoaders.ts', 'utf8');

for (const required of [
  'PRODUCT_NAVIGATION_EVENT',
  'navigateProduct',
  'productHref',
  'subscribeProductNavigation',
  'shouldHandleProductLinkClick',
]) {
  assert.ok(navigation.includes(required), `product navigation runtime missing ${required}`);
}

assert.match(shell, /lazy\(loadFinancialWorkspaceRoute\)/);
assert.match(shell, /lazy\(loadFinancialActionRoute\)/);
assert.match(shell, /lazy\(loadPersonalFinanceSectionRoute\)/);
assert.match(shell, /subscribeProductNavigation/);
assert.match(shell, /navigateProduct/);
assert.match(shell, /UnifiedProductSidebar/);
assert.match(shell, /data-shell-model="unified-sidebar-v1"/);
assert.match(shell, /sanad:unified-sidebar:collapsed:v1/);
assert.match(shell, /<Suspense fallback=\{<RouteFallback/);

assert.match(productNav, /spaNavigation = legacyPage === undefined/);
assert.match(productNav, /navigateProduct/);
assert.match(productNav, /prefetchProductArea/);
assert.match(productNav, /shouldHandleProductLinkClick/);
assert.match(productNav, /aria-current=\{selected \? 'page'/);
assert.match(productNav, /lg:hidden/, 'legacy primary product nav must be mobile-only after 2B.1');

assert.match(unifiedSidebar, /data-sanad-unified-sidebar/);
assert.match(unifiedSidebar, /مساحات سند/);
assert.match(unifiedSidebar, /الحساب والإعدادات/);
assert.match(unifiedSidebar, /PanelRightClose/);
assert.match(unifiedSidebar, /PanelRightOpen/);
assert.match(unifiedSidebar, /prefetchProductArea/);
assert.match(unifiedSidebar, /navigateProduct/);

assert.match(productHeader, /productHref\('sanad-ai'\)/);
assert.match(productHeader, /handleBrandClick/);
assert.match(productHeader, /navigateProduct\('sanad-ai'\)/);

assert.doesNotMatch(sectionRoute, /ProductBottomNav/, 'financial section routes must not render a second primary product nav');
assert.match(sectionRoute, /navigateProduct\(path\)/);
assert.match(actionRoute, /navigateProduct\(backPath\)/);

assert.match(workspace, /lazy\(loadPersonalFinanceOverview\)/);
assert.match(workspace, /lazy\(loadSanadAgentWorkspace\)/);
assert.match(loaders, /loadSanadAgentWorkspace/);
assert.match(loaders, /loadPersonalFinanceOverview/);

for (const lazyRuntime of [
  'OperationEntryGate',
  'OperationDetailsRuntimeV2',
  'OperationIdentityDetailsBanner',
  'OperationDetailsActionIntent',
  'OperationDocumentPreviewEnhancer',
  'LocalRuntimeController',
  'CaptureFirstNavigationRuntime',
]) {
  assert.match(main, new RegExp(`const ${lazyRuntime} = lazy\\(\\(\\) => import`), `${lazyRuntime} must be lazy-loaded`);
  assert.doesNotMatch(main, new RegExp(`import ${lazyRuntime} from`), `${lazyRuntime} must not remain an eager import`);
}

assert.match(main, /import\('\.\/features\/local-first\/deviceLedgerRuntime'\)/);
assert.match(main, /isLegacyApplicationRoute/);
assert.match(main, /LegacyAppFallback/);
assert.doesNotMatch(workspace, /lg:pl-32/, 'workspace must not reserve space for the retired floating rail');
assert.doesNotMatch(sectionRoute, /lg:pl-32/, 'section routes must not reserve space for the retired floating rail');

console.log('SANAD Phase 3 navigation and performance contract passed.');
