import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import SanadIntelligenceMark from '../src/features/assistant/SanadIntelligenceMark.tsx';
import SanadAssistantStatus from '../src/features/assistant/SanadAssistantStatus.tsx';
import {
  SANAD_ASSISTANT_STATE_LABELS,
  mapActionStatusToAssistantPresentation,
  mapSanadAssistantPresentationState,
  mapVoiceStateToAssistantPresentation,
  readSanadAssistantPreviewState,
  type SanadAssistantPresentationState,
} from '../src/features/assistant/sanadAssistantPresentation.ts';

const states: SanadAssistantPresentationState[] = [
  'idle',
  'listening',
  'transcribing',
  'thinking',
  'executing',
  'waiting_approval',
  'success',
  'error',
];

for (const state of states) {
  const mark = renderToStaticMarkup(<SanadIntelligenceMark state={state} size={20} />);
  assert.match(mark, new RegExp(`data-assistant-state="${state}"`));
  const status = renderToStaticMarkup(<SanadAssistantStatus state={state} showMark />);
  assert.ok(status.includes(SANAD_ASSISTANT_STATE_LABELS[state]), `missing Arabic label for ${state}`);
}

assert.equal(SANAD_ASSISTANT_STATE_LABELS.idle, 'جاهز');
assert.equal(SANAD_ASSISTANT_STATE_LABELS.listening, 'يستمع');
assert.equal(SANAD_ASSISTANT_STATE_LABELS.transcribing, 'يحوّل الصوت إلى نص');
assert.equal(SANAD_ASSISTANT_STATE_LABELS.thinking, 'يفكر');
assert.equal(SANAD_ASSISTANT_STATE_LABELS.executing, 'ينفذ');
assert.equal(SANAD_ASSISTANT_STATE_LABELS.waiting_approval, 'ينتظر اعتمادك');
assert.equal(SANAD_ASSISTANT_STATE_LABELS.success, 'تم');
assert.equal(SANAD_ASSISTANT_STATE_LABELS.error, 'تعذر');

assert.equal(mapVoiceStateToAssistantPresentation('listening'), 'listening');
assert.equal(mapVoiceStateToAssistantPresentation('transcribing'), 'transcribing');
assert.equal(mapVoiceStateToAssistantPresentation('requesting_permission'), 'thinking');
assert.equal(mapVoiceStateToAssistantPresentation('ready_to_send'), 'idle');
assert.equal(mapVoiceStateToAssistantPresentation('network_failed'), 'error');

assert.equal(mapActionStatusToAssistantPresentation('review'), 'waiting_approval');
assert.equal(mapActionStatusToAssistantPresentation('executing'), 'executing');
assert.equal(mapActionStatusToAssistantPresentation('failed'), 'error');
assert.equal(mapActionStatusToAssistantPresentation('cancelled'), null);

assert.equal(mapSanadAssistantPresentationState({ runPhase: 'thinking' }), 'thinking');
assert.equal(mapSanadAssistantPresentationState({ runPhase: 'executing' }), 'executing');
assert.notEqual(
  mapSanadAssistantPresentationState({ runPhase: 'thinking' }),
  mapSanadAssistantPresentationState({ runPhase: 'executing' }),
);
assert.equal(
  mapSanadAssistantPresentationState({ runPhase: 'idle', actionStatus: 'review' }),
  'waiting_approval',
);
assert.equal(
  mapSanadAssistantPresentationState({ runPhase: 'thinking', actionStatus: 'review' }),
  'thinking',
  'active reasoning must remain distinct from waiting approval',
);
assert.equal(
  mapSanadAssistantPresentationState({ voiceState: 'listening', runPhase: 'executing' }),
  'listening',
  'active voice capture owns the assistant presentation while listening',
);

assert.equal(readSanadAssistantPreviewState('?assistantState=thinking', false), null);
assert.equal(readSanadAssistantPreviewState('?assistantState=thinking', true), 'thinking');
assert.equal(readSanadAssistantPreviewState('?assistantState=bogus', true), null);

const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const sidebar = readFileSync('src/features/assistant/AssistantWorkspaceSidebar.tsx', 'utf8');
const navigation = readFileSync('src/components/navigation/ProductBottomNav.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');

assert.doesNotMatch(workspace, /SanadFluidOrb|SanadOrbState|orbState/);
assert.doesNotMatch(sidebar, /SanadFluidOrb/);
assert.doesNotMatch(navigation, /\bBot\b/);
assert.match(workspace, /setRunPhase\('success'\)/);
assert.match(workspace, /setRunPhase\('idle'\)/);
assert.match(workspace, /700/);
assert.match(styles, /prefers-reduced-motion: reduce/);
assert.doesNotMatch(styles, /sanad-intelligence-mark--idle[^\{]*\{[^}]*animation:/s);

console.log('SANAD Stage 1F assistant identity/state mapping contract passed.');
