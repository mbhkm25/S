import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const assetsDir = 'dist/assets';
const files = readdirSync(assetsDir);

const budgets = [
  { label: 'application entry', pattern: /^app-[A-Za-z0-9_-]+\.js$/, maxKb: 20 },
  { label: 'product shell', pattern: /^FinancialWorkspaceShell-[A-Za-z0-9_-]+\.js$/, maxKb: 15 },
  { label: 'workspace route', pattern: /^FinancialWorkspaceRoute-[A-Za-z0-9_-]+\.js$/, maxKb: 35 },
  { label: 'product navigation', pattern: /^ProductBottomNav-[A-Za-z0-9_-]+\.js$/, maxKb: 30 },
  { label: 'SANAD Agent workspace', pattern: /^SanadAgentWorkspace-[A-Za-z0-9_-]+\.js$/, maxKb: 120 },
  { label: 'legacy application gate', pattern: /^OperationEntryGate-[A-Za-z0-9_-]+\.js$/, maxKb: 425 },
  {
    label: 'generic vendor',
    pattern: /^vendor-(?!react-|supabase-|motion-|capacitor-|qr-)[A-Za-z0-9_-]+\.js$/,
    maxKb: 150,
  },
];

let failed = false;

for (const budget of budgets) {
  const matches = files.filter((file) => budget.pattern.test(file));
  if (matches.length !== 1) {
    console.error(`[bundle-budget] Expected one ${budget.label} chunk, found ${matches.length}: ${matches.join(', ') || 'none'}`);
    failed = true;
    continue;
  }

  const file = matches[0];
  const size = statSync(join(assetsDir, file)).size;
  const sizeKb = size / 1024;
  const passed = size <= budget.maxKb * 1024;
  console.log(
    `[bundle-budget] ${passed ? 'PASS' : 'FAIL'} ${budget.label}: ${sizeKb.toFixed(2)} KB / ${budget.maxKb} KB — ${file}`
  );
  if (!passed) failed = true;
}

if (failed) {
  throw new Error('SANAD production bundle budget exceeded or required chunk was not found.');
}

console.log('SANAD production bundle budget passed.');
