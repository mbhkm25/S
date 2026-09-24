import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const controls = readFileSync('src/components/settings/SettingsControls.tsx', 'utf8');
const sidebar = readFileSync('src/components/navigation/SanadAssistantSidebarSections.tsx', 'utf8');
const provider = readFileSync('src/features/shell/SanadAssistantSettingsContext.tsx', 'utf8');
const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const api = readFileSync('src/features/assistant/assistantWorkspaceApi.ts', 'utf8');
const foundation = readFileSync('src/styles/sanad-foundation.css', 'utf8');

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
  'sanad-focus-ring',
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
assert.match(foundation, /\.sanad-focus-ring:focus-visible[\s\S]*--sanad-focus/);

// R3 retains the exact SettingsSwitch primitive and optimistic rollback
// contract, but moves their ownership from assistant panel to shell provider.
assert.match(sidebar, /SettingSwitch/);
assert.match(sidebar, /from '..\\/settings\\/SettingsControls'/);
assert.doesNotMatch(sidebar, /type="checkbox"/);
assert.match(sidebar, /pendingPreferenceKey/);
assert.match(sidebar, /disabled=\\{pendingPreferenceKey !== null && pendingPreferenceKey !== key\\}/);
assert.match(sidebar, /pending=\\{pendingPreferenceKey === key\\}/);

for (const key of [
  'save_history_enabled',
  'memory_enabled',
  'proactive_insights_enabled',
  'response_cards_enabled',
]) {
  assert.ok(sidebar.includes(key), `Inline settings missing ${key}`);
  assert.ok(api.includes(key), `API persistence missing ${key}`);
}
assert.match(workspace, /useSanadAssistantSettings/);
assert.match(provider, /pendingPreferenceRef\\.current/);
assert.match(provider, /setPreferences\\(\\{ \\.\\.\\.preferences, \\[key\\]: value \\}\\)/);
assert.match(provider, /setPreferences\\(previous\\)/);
assert.match(provider, /setPendingPreferenceKey\\(key\\)/);
assert.match(provider, /setPendingPreferenceKey\\(null\\)/);
assert.match(provider, /updateSanadAgentPreferences\\(\\{ \\[key\\]: value \\}\\)/);

assert.match(api, /get_my_sanad_agent_preferences_v1/);
assert.match(api, /update_my_sanad_agent_preferences_v1/);

console.log('SANAD controls and settings geometry contract passed.');
