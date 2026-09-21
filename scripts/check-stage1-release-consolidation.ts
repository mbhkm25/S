import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSanadAssistantPreviewState } from '../src/features/assistant/sanadAssistantPresentation.ts';

const productionWorkflow = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const voiceApi = readFileSync('src/features/assistant/assistantVoiceApi.ts', 'utf8');
const voiceFunction = readFileSync('supabase/functions/sanad-ai-transcribe-v1/index.ts', 'utf8');
const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');

assert.equal(
  readSanadAssistantPreviewState('?assistantState=thinking', false),
  null,
  'Production runtime must ignore assistantState query overrides when preview mode is disabled.',
);

assert.match(workspace, /VITE_SANAD_ASSISTANT_STATE_PREVIEW === 'true'/);
assert.doesNotMatch(
  productionWorkflow,
  /VITE_SANAD_ASSISTANT_STATE_PREVIEW|VITE_SANAD_VOICE_ENDPOINT|VITE_SANAD_VOICE_PREVIEW/,
  'Production deployment must not enable preview/debug frontend overrides.',
);

assert.match(voiceApi, /VITE_SANAD_VOICE_PREVIEW === 'true'/);
assert.match(voiceApi, /'sanad-ai-transcribe-v1'/);
assert.match(voiceApi, /VOICE_PREVIEW_ENABLED[\s\S]*VITE_SANAD_VOICE_ENDPOINT/);
assert.doesNotMatch(voiceApi, /sanad-ai-transcribe-stage1e-candidate/);

assert.doesNotMatch(voiceFunction, /trycloudflare\.com/);
assert.doesNotMatch(voiceFunction, /stage1e-candidate/);
assert.match(voiceFunction, /"https:\/\/app\.sanadflow\.com"/);
assert.match(voiceFunction, /"capacitor:\/\/localhost"/);
assert.match(voiceFunction, /SANAD_VOICE_PREVIEW_ORIGINS/);

for (const source of [productionWorkflow, voiceApi, voiceFunction, workspace]) {
  assert.doesNotMatch(source, /__stage1(?:ed|f)|preview[_-]?token|failure[_-]?simulation|timeout[_-]?simulation/i);
}

console.log('SANAD Stage 1 release consolidation safety contract passed.');
