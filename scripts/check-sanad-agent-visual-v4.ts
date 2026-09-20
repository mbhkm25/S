import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orb = readFileSync('src/features/assistant/SanadFluidOrb.tsx', 'utf8');
const pulseCompat = readFileSync('src/features/assistant/SanadPulseMark.tsx', 'utf8');
const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const sidebar = readFileSync('src/features/assistant/AssistantWorkspaceSidebar.tsx', 'utf8');
const voice = readFileSync('src/features/assistant/SanadVoiceDictationButton.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');

for (const state of ['idle', 'listening', 'thinking', 'executing', 'success']) {
  assert.ok(orb.includes(`'${state}'`), `fluid orb missing state ${state}`);
  assert.ok(styles.includes(`.sanad-orb-${state}`), `fluid orb CSS missing state ${state}`);
}

for (const required of [
  "canvas.getContext('2d'",
  'requestAnimationFrame',
  'cancelAnimationFrame',
  "matchMedia('(prefers-reduced-motion: reduce)')",
  'sanad-orb-css-fallback',
  'sanad-fluid-orb__fallback',
  'preferCssFallback',
  'data-orb-state',
  "label = 'سند'",
]) {
  assert.ok(orb.includes(required), `fluid orb runtime missing ${required}`);
}

assert.match(styles, /sanad-fluid-orb__wave--a/);
assert.match(styles, /sanad-fluid-orb__wave--b/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(styles, /sanad-orb-listening-shell/);
assert.match(styles, /sanad-orb-executing-shell/);
assert.match(styles, /sanad-orb-success-shell/);
assert.doesNotMatch(styles, /sanad-pulse-working/, 'legacy working pulse CSS must not return');

for (const required of [
  'SanadFluidOrb',
  "useState<SanadOrbState>('idle')",
  "setOrbState('thinking')",
  "setOrbState('executing')",
  'markOrbSuccess',
  'handleVoiceStateChange',
  'onStateChange={handleVoiceStateChange}',
  'aria-live="polite"',
]) {
  assert.ok(workspace.includes(required), `workspace fluid-orb contract missing ${required}`);
}

assert.doesNotMatch(workspace, /SanadPulseMark/, 'workspace must not render the retired pulse SVG');
assert.doesNotMatch(workspace, /state="working"/, 'workspace must use explicit executing state');
assert.match(sidebar, /SanadFluidOrb/);
assert.match(sidebar, /state=\{props\.assistantState\}/, 'sidebar owns the live assistant identity/status in Stage 1C');

for (const required of [
  "export type SanadVoiceState = 'idle' | 'listening' | 'transcribing'",
  'onStateChange?:',
  "recording ? 'listening' : transcribing ? 'transcribing' : 'idle'",
]) {
  assert.ok(voice.includes(required), `voice state bridge missing ${required}`);
}

assert.match(pulseCompat, /SanadFluidOrb/);
assert.match(pulseCompat, /SanadOrbState/);

console.log('SANAD Agent Fluid Orb v1 / Phase 4 visual contract passed.');
