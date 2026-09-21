import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  chooseSupportedVoiceMimeType,
  classifyCaptureFailure,
  reduceSanadVoiceState,
  voiceFailureMessage,
} from '../src/features/assistant/sanadVoiceRuntime.ts';

let state = reduceSanadVoiceState('idle', 'request_permission');
assert.equal(state, 'requesting_permission');
state = reduceSanadVoiceState(state, 'permission_granted');
assert.equal(state, 'listening');
state = reduceSanadVoiceState(state, 'stop');
assert.equal(state, 'stopping');
state = reduceSanadVoiceState(state, 'stopped');
assert.equal(state, 'transcribing');
state = reduceSanadVoiceState(state, 'transcription_succeeded');
assert.equal(state, 'review');
state = reduceSanadVoiceState(state, 'review_ready');
assert.equal(state, 'ready_to_send');

assert.equal(reduceSanadVoiceState('transcription_failed', 'retry'), 'transcribing');
assert.equal(reduceSanadVoiceState('network_failed', 'retry'), 'transcribing');
assert.equal(reduceSanadVoiceState('listening', 'cancel'), 'cancelled');
assert.equal(reduceSanadVoiceState('idle', 'unsupported'), 'unsupported');

const fakeRecorder = {
  isTypeSupported: (type: string) => type === 'audio/webm' || type === 'audio/mp4',
} as Pick<typeof MediaRecorder, 'isTypeSupported'>;
assert.equal(chooseSupportedVoiceMimeType(fakeRecorder), 'audio/webm');

const mp4Only = {
  isTypeSupported: (type: string) => type === 'audio/mp4',
} as Pick<typeof MediaRecorder, 'isTypeSupported'>;
assert.equal(chooseSupportedVoiceMimeType(mp4Only), 'audio/mp4');

assert.equal(
  classifyCaptureFailure({ name: 'NotAllowedError', message: 'Permission denied' }, 'denied').code,
  'permission_blocked',
);
assert.equal(
  classifyCaptureFailure({ name: 'NotAllowedError', message: 'Permission denied' }, 'prompt').code,
  'permission_denied',
);
assert.equal(
  classifyCaptureFailure({ name: 'NotFoundError', message: 'No device' }).code,
  'no_microphone',
);
assert.match(voiceFailureMessage('network_failed'), /الشبكة|الاتصال/);
assert.match(voiceFailureMessage('timeout'), /إعادة المحاولة/);

const button = readFileSync('src/features/assistant/SanadVoiceDictationButton.tsx', 'utf8');
const api = readFileSync('src/features/assistant/assistantVoiceApi.ts', 'utf8');
const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const edge = readFileSync('supabase/functions/sanad-ai-transcribe-v1/index.ts', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');

for (const required of [
  'retryAudioRef',
  'transcriptionAbortRef',
  'getTracks().forEach((track) => track.stop())',
  'clearRecordingTimers',
  'cleanupRecorder',
  'voice_capture_started',
  'voice_capture_stopped',
  'voice_transcription_requested',
  'voice_transcription_succeeded',
  'voice_transcription_failed',
  'role="status"',
  'aria-live="polite"',
  'focus-visible:ring-2',
]) {
  assert.ok(button.includes(required), `voice runtime missing ${required}`);
}

assert.match(button, /onTranscript\(result\.transcript\)/);
assert.doesNotMatch(button, /sendPrompt\(/, 'Voice capture must never auto-send a message.');
assert.match(workspace, /onTranscript=\{\(text\) => \{/);
assert.match(workspace, /setDraft\(\(current\)/);
assert.doesNotMatch(
  workspace.match(/onTranscript=\{\(text\) => \{[\s\S]{0,500}?\}\}/)?.[0] || '',
  /sendPrompt\(/,
  'Transcription integration must place text in the composer without sending it.',
);

assert.match(api, /VOICE_TRANSCRIPTION_TIMEOUT_MS/);
assert.match(api, /SanadVoiceTranscriptionError/);
assert.match(api, /network_failed/);
assert.match(api, /service_unavailable/);
assert.match(api, /options\.signal/);

assert.match(manifest, /android\.permission\.RECORD_AUDIO/);

assert.match(edge, /isAllowedOrigin/);
assert.match(edge, /trycloudflare\\.com/);
assert.match(edge, /https:\/\/localhost/);
assert.match(edge, /voiceError/);
assert.match(edge, /publicTranscriptionFailure/);
assert.match(edge, /record_sanad_agent_server_metric_v1/);
assert.doesNotMatch(edge, /transcript[^\n]*console\./i, 'Voice telemetry must not log transcript content.');

console.log('SANAD Voice Reliability Stage 1E contract passed.');
