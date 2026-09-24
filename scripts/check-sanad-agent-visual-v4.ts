import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mark = readFileSync('src/features/assistant/SanadIntelligenceMark.tsx', 'utf8');
const state = readFileSync('src/features/assistant/sanadAssistantPresentation.ts', 'utf8');
const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const sidebar = readFileSync('src/components/navigation/SanadAssistantSidebarSections.tsx', 'utf8');
const unifiedSidebar = readFileSync('src/components/navigation/SanadUnifiedSidebar.tsx', 'utf8');
const navigation = readFileSync('src/components/navigation/ProductBottomNav.tsx', 'utf8');
const voice = readFileSync('src/features/assistant/SanadVoiceDictationButton.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');

for (const required of [
  'SanadIntelligenceMark',
  'data-sanad-intelligence-mark',
  'data-assistant-state',
  'viewBox="0 0 24 24"',
  'monochrome',
]) {
  assert.ok(mark.includes(required), `intelligence mark missing ${required}`);
}

for (const assistantState of [
  'idle',
  'listening',
  'transcribing',
  'thinking',
  'executing',
  'waiting_approval',
  'success',
  'error',
]) {
  assert.ok(state.includes(`'${assistantState}'`), `presentation state missing ${assistantState}`);
}

assert.match(styles, /sanad-intelligence-mark--listening/);
assert.match(styles, /sanad-intelligence-mark--transcribing/);
assert.match(styles, /sanad-intelligence-mark--thinking/);
assert.match(styles, /sanad-intelligence-mark--executing/);
assert.match(styles, /sanad-intelligence-mark--waiting_approval/);
assert.match(styles, /sanad-intelligence-mark--success/);
assert.match(styles, /sanad-intelligence-mark--error/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*sanad-intelligence-mark/);
assert.doesNotMatch(styles, /sanad-intelligence-mark--idle[^\{]*\{[^}]*animation:/s, 'idle identity must remain static');

assert.match(workspace, /mapSanadAssistantPresentationState/);
assert.match(workspace, /readSanadAssistantPreviewState/);
assert.match(workspace, /SanadIntelligenceMark/);
assert.match(workspace, /SanadAssistantStatus/);
assert.doesNotMatch(workspace, /SanadFluidOrb/);
assert.doesNotMatch(workspace, /SanadOrbState|orbState|setOrbState/);
assert.match(unifiedSidebar, /data-sanad-brand-lockup="vertical"/);
assert.match(sidebar, /data-sanad-assistant-inline="true"/);
assert.match(workspace, /data-assistant-state=\{assistantPresentationState\}/);
assert.doesNotMatch(sidebar, /SanadFluidOrb/);

assert.match(navigation, /SanadIntelligenceMark/);
assert.doesNotMatch(navigation, /\bBot\b/, 'Primary navigation must not use a generic Bot icon for SANAD assistant');

for (const required of [
  "export type { SanadVoiceState } from './sanadVoiceRuntime'",
  'onStateChange?:',
  'requesting_permission',
  'ready_to_send',
  'network_failed',
]) {
  assert.ok(voice.includes(required), `voice state bridge missing ${required}`);
}

console.log('SANAD Assistant Identity & State Language visual contract passed.');
