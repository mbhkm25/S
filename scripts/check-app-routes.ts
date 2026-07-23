import assert from 'node:assert/strict';
import { buildAppLocation, parseAppLocation, type AppRoute } from '../src/lib/appRoutes';

const basePath = '/app/';
const cases: Array<{ path: string; expected: AppRoute }> = [
  { path: '/app/', expected: { page: 'home' } },
  { path: '/app/profile', expected: { page: 'profile', profileSection: undefined } },
  { path: '/app/profile/security', expected: { page: 'profile', profileSection: 'security' } },
  { path: '/app/notifications', expected: { page: 'notifications' } },
  { path: '/app/business/manage', expected: { page: 'business-manage' } },
  { path: '/app/business/manage/profile', expected: { page: 'business-manage-profile' } },
  { path: '/app/business/manage/catalog', expected: { page: 'business-whatsapp-catalog', replace: true } },
  { path: '/app/business/manage/whatsapp-catalog', expected: { page: 'business-whatsapp-catalog', replace: false } },
  { path: '/app/b/bhkam-honey', expected: { page: 'public-business-profile', token: 'bhkam-honey' } },
  { path: '/app/b/bhkam-honey/p/item-1', expected: { page: 'public-product-detail', token: 'bhkam-honey', productToken: 'item-1' } },
  { path: '/app/v/token-1?src=qr', expected: { page: 'details', token: 'token-1', source: 'qr' } },
  { path: '/app/platform-admin', expected: { page: 'platform-admin' } }
];

for (const testCase of cases) {
  const url = new URL(testCase.path, 'https://app.sanadflow.com');
  const parsed = parseAppLocation(url, { basePath, internalCatalogEnabled: true });
  assert.equal(parsed.page, testCase.expected.page, `${testCase.path}: page`);
  assert.equal(parsed.token, testCase.expected.token, `${testCase.path}: token`);
  assert.equal(parsed.productToken, testCase.expected.productToken, `${testCase.path}: product token`);
  assert.equal(parsed.source, testCase.expected.source, `${testCase.path}: source`);
  assert.equal(parsed.profileSection, testCase.expected.profileSection, `${testCase.path}: profile section`);
  if (testCase.expected.replace !== undefined) assert.equal(Boolean(parsed.replace), testCase.expected.replace, `${testCase.path}: replace`);
}

const buildCases: Array<{ route: AppRoute; expected: string }> = [
  { route: { page: 'home' }, expected: '/app/' },
  { route: { page: 'profile', profileSection: 'security' }, expected: '/app/profile/security' },
  { route: { page: 'details', token: 'abc', source: 'qr' }, expected: '/app/v/abc?src=qr' },
  { route: { page: 'public-business-profile', token: 'نشاط تجريبي' }, expected: '/app/b/%D9%86%D8%B4%D8%A7%D8%B7%20%D8%AA%D8%AC%D8%B1%D9%8A%D8%A8%D9%8A' },
  { route: { page: 'public-product-detail', token: 'store', productToken: 'item/1' }, expected: '/app/b/store/p/item%2F1' },
  { route: { page: 'business-whatsapp-catalog' }, expected: '/app/business/manage/whatsapp-catalog' }
];

for (const testCase of buildCases) {
  assert.equal(buildAppLocation(testCase.route, basePath), testCase.expected);
}

const catalogDisabled = parseAppLocation(
  new URL('https://app.sanadflow.com/app/b/store/p/item'),
  { basePath, internalCatalogEnabled: false }
);
assert.deepEqual(catalogDisabled, { page: 'public-business-profile', token: 'store', replace: true });

console.log(`Route contract passed: ${cases.length + buildCases.length + 1} checks.`);
