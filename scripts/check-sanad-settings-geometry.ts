import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const controls = readFileSync('src/components/settings/SettingsControls.tsx', 'utf8');
const sidebar = readFileSync('src/features/assistant/AssistantWorkspaceSidebar.tsx', 'utf8');
const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const api = readFileSync('src/features/assistant/assistantWorkspaceApi.ts', 'utf8');

for (const required of [
  'grid-cols-[minmax(0,1fr)_auto]',
  'data-setting-content',
  'min-w-0',
  'data-setting-control',
  'shrink-0',
]) {
  assert.ok(controls.includes(required), `SettingRow geometry missing: ${required}`);
}

for (const required of [
  'role="switch"',
  'aria-checked={checked}',
  'aria-busy={pending || undefined}',
  'disabled={unavailable}',
  'aria-label={label}',
  'focus-visible:ring-2',
  'h-11 w-11',
  '[inset-inline-start:1.25rem]',
  '[inset-inline-start:0.25rem]',
]) {
  assert.ok(controls.includes(required), `SettingSwitch contract missing: ${required}`);
}

assert.doesNotMatch(
  controls,
  /translate-x-|rtl:|flex-row-reverse/,
  'Settings primitives must not manually invert geometry for RTL.',
);
assert.doesNotMatch(controls, /dangerouslySetInnerHTML/);

assert.ok(sidebar.includes("from '../../components/settings/SettingsControls'"));
assert.match(sidebar, /<SettingRow/);
assert.match(sidebar, /<SettingSwitch/);
assert.match(sidebar, /<SettingsSection/);
assert.doesNotMatch(sidebar, /function Toggle\(/, 'Agent settings must not keep a duplicate custom switch.');
assert.doesNotMatch(sidebar, /type="checkbox"/, 'Agent settings must not fall back to raw visual checkbox hacks.');
assert.match(sidebar, /pendingPreferenceKey/);
assert.match(sidebar, /disabled=\{busy && !pending\}/);
assert.match(sidebar, /pending=\{pending\}/);

for (const key of [
  'save_history_enabled',
  'memory_enabled',
  'proactive_insights_enabled',
  'response_cards_enabled',
]) {
  assert.ok(sidebar.includes(key), `Sidebar mapping missing ${key}`);
  assert.ok(workspace.includes(key), `Workspace persistence mapping missing ${key}`);
  assert.ok(api.includes(key), `API persistence mapping missing ${key}`);
}

assert.match(workspace, /if \(!preferences \|\| pendingPreferenceKey\) return;/);
assert.match(workspace, /setPreferences\(\{ \.\.\.preferences, \[key\]: value \}\)/);
assert.match(workspace, /setPreferences\(previous\)/);
assert.match(workspace, /setPendingPreferenceKey\(key\)/);
assert.match(workspace, /setPendingPreferenceKey\(null\)/);
assert.match(workspace, /updateSanadAgentPreferences\(\{ \[key\]: value \}\)/);

assert.match(api, /get_my_sanad_agent_preferences_v1/);
assert.match(api, /update_my_sanad_agent_preferences_v1/);

console.log('SANAD controls and settings geometry contract passed.');
