import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const foundation = readFileSync('src/styles/sanad-foundation.css', 'utf8');
const index = readFileSync('src/index.css', 'utf8');
const nav = readFileSync('src/components/navigation/ProductBottomNav.tsx', 'utf8');
const header = readFileSync('src/components/navigation/ProductAppHeader.tsx', 'utf8');
const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx', 'utf8');
const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const sidebar = readFileSync('src/features/assistant/AssistantWorkspaceSidebar.tsx', 'utf8');
const settings = readFileSync('src/components/settings/SettingsControls.tsx', 'utf8');
const responses = readFileSync('src/features/assistant/SanadAgentResponseBlocks.tsx', 'utf8');
const primitives = readFileSync('src/components/ui/SanadVisualPrimitives.tsx', 'utf8');
const html = readFileSync('index.html', 'utf8');

assert.match(index, /@import "\.\/styles\/sanad-foundation\.css";/);
assert.match(index, /Noto Sans Arabic/);
assert.match(index, /system-ui, -apple-system, "Segoe UI"/);

for (const token of [
  '--sanad-brand-lime',
  '--sanad-brand-green',
  '--sanad-brand-mint',
  '--sanad-brand-aqua',
  '--sanad-brand-ink',
  '--sanad-bg-canvas',
  '--sanad-surface-1',
  '--sanad-border-subtle',
  '--sanad-text-strong',
  '--sanad-text-muted',
  '--sanad-success',
  '--sanad-warning',
  '--sanad-danger',
  '--sanad-info',
  '--sanad-focus',
  '--sanad-selection',
]) {
  assert.ok(foundation.includes(token), `missing semantic token: ${token}`);
}

const brandGreen = foundation.match(/--sanad-brand-green:\s*([^;]+);/)?.[1]?.trim();
const successGreen = foundation.match(/--sanad-success:\s*([^;]+);/)?.[1]?.trim();
assert.ok(brandGreen && successGreen);
assert.notEqual(brandGreen, successGreen, 'Brand Green must remain distinct from Success Green.');

for (const token of [
  '--sanad-text-xs',
  '--sanad-text-sm',
  '--sanad-text-md',
  '--sanad-text-lg',
  '--sanad-text-xl',
  '--sanad-text-2xl',
  '--sanad-space-1',
  '--sanad-space-12',
  '--sanad-radius-sm',
  '--sanad-radius-xl',
  '--sanad-shadow-1',
  '--sanad-shadow-3',
]) {
  assert.ok(foundation.includes(token), `missing scale token: ${token}`);
}

for (const signature of ['assistant', 'financial', 'commercial', 'account']) {
  assert.ok(foundation.includes(`--sanad-signature-${signature}`), `missing section signature: ${signature}`);
}

assert.match(foundation, /--sanad-safe-bottom:\s*max\(env\(safe-area-inset-bottom, 0px\), 0px\)/);
assert.match(foundation, /--sanad-mobile-system-clearance:\s*max\(var\(--sanad-safe-bottom\), 0\.75rem\)/);
assert.match(foundation, /--sanad-mobile-nav-stack-height:/);
assert.match(html, /viewport-fit=cover/);
assert.match(html, /interactive-widget=resizes-content/);

assert.match(nav, /sanad-primary-nav/);
assert.match(nav, /pb-\[var\(--sanad-mobile-system-clearance\)\]/);
assert.match(nav, /data-active=\{selected \? 'true' : 'false'\}/);
assert.match(header, /sanad-product-header/);
assert.match(shell, /data-product-area=/);
assert.match(shell, /sanad-canvas/);
assert.match(shell, /var\(--sanad-mobile-nav-stack-height\)/);
assert.match(workspace, /sanad-workspace-canvas/);
assert.match(workspace, /sanad-composer-surface/);
assert.match(sidebar, /sanad-sidebar-surface/);
assert.match(settings, /var\(--sanad-interactive\)/);
assert.match(responses, /sanad-surface overflow-hidden/);
assert.match(responses, /sanad-section-title/);

assert.match(primitives, /function SanadSurface/);
assert.match(primitives, /function SanadSectionHeader/);
assert.match(primitives, /function SanadStatusChip/);
assert.match(primitives, /function SanadIconContainer/);

assert.match(foundation, /\[data-theme='dark'\]/);
assert.match(foundation, /prefers-reduced-motion: reduce/);

console.log('SANAD Stage 2A visual foundation and safe-area contract checks passed.');
