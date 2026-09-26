import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unscopedAssistantHomeRedirect } from '../src/lib/sanadLaunchRoute';

const cases: Array<[string, string, string, string | null]> = [
  ['/sanad-ai', '', '/', '/today'],
  ['/sanad-ai/', '?new=1', '/', '/today'],
  ['/sanad-ai', '?project=business&business=abc', '/', '/today'],
  ['/sanad-ai', '?thread=real-thread&project=business', '/', null],
  ['/sanad-ai', '?thread=real-thread&project=personal', '/', null],
  ['/sanad-ai', '?thread=%20%20', '/', '/today'],
  ['/financial', '', '/', null],
  ['/today', '', '/', null],
  ['/reports/view/public-id', '', '/', null],
  ['/app/sanad-ai', '', '/app/', '/app/today'],
  ['/app/sanad-ai/', '?thread=123', '/app', null],
  ['/sanad-ai', '', '/app/', null],
];
for (const [path, query, base, result] of cases) {
  assert.equal(
    unscopedAssistantHomeRedirect(path, query, base),
    result,
    `Unexpected landing for ${path}${query} (base ${base})`,
  );
}

const startup = readFileSync('src/main.tsx', 'utf8');
const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const home = readFileSync('src/components/Home.tsx', 'utf8');
const nav = readFileSync('src/components/navigation/SanadUnifiedNavLinks.tsx', 'utf8');

assert.ok(
  startup.indexOf('initialHomeRedirect') < startup.indexOf('const isFinancialWorkspaceRoute'),
  'Normalize the cold-start path before selecting the app runtime',
);
assert.match(startup, /window\.history\.replaceState\(window\.history\.state, '', initialHomeRedirect\)/);
assert.match(shell, /unscopedAssistantHomeRedirect/);
assert.match(shell, /navigateProduct\('today', \{ replace: true \}\)/);
assert.match(shell, /if \(obsoleteAssistantEntry\) return <RouteFallback \/>/);
assert.match(app, /window\.location\.replace\(\x60\$\{cleanBase\}today\x60\)/);
assert.match(home, /return \x60\$\{cleanBase\}today\x60/);
assert.match(nav, /label: 'الرئيسية', path: 'today'/);
assert.doesNotMatch(nav, /label: 'محادثة جديدة'|label: 'المزيد'/);
console.log('SANAD landing: old unscoped native/PWA routes go to Home; project thread deep links remain intact PASS');
