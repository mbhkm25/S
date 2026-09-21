import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const voice = readFileSync('src/features/assistant/assistantVoiceApi.ts', 'utf8');
const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const sidebar = readFileSync('src/features/assistant/AssistantWorkspaceSidebar.tsx', 'utf8');
const navigation = readFileSync('src/components/navigation/ProductBottomNav.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');

assert.match(voice, /CANONICAL_VOICE_ENDPOINT/);
assert.match(voice, /supabase\.auth\.refreshSession\(\)/);
assert.match(voice, /isTransportFailure/);
assert.match(voice, /VOICE_PREVIEW_ENABLED \|\| !isTransportFailure/);
assert.match(voice, /endpointUrl: CANONICAL_VOICE_ENDPOINT/);
assert.match(voice, /requestBody/);
assert.match(voice, /signal: request\.signal/);
assert.doesNotMatch(
  voice,
  /CANONICAL_VOICE_ENDPOINT[\s\S]*sanad-ai-transcribe-stage1e-candidate/,
  'Production recovery must remain on the production function name.',
);

assert.match(workspace, /data-assistant-status-slot="error"/);
assert.match(workspace, /relative z-30[^"]*shrink-0/);
assert.match(workspace, /PanelRightOpen/);
assert.doesNotMatch(
  workspace,
  /data-mobile-sidebar-trigger[\s\S]{0,260}rounded-full/,
  'Sidebar trigger must not regress to the detached floating-circle treatment.',
);

assert.match(sidebar, /flex h-full min-h-0[^"]*overflow-hidden/);
assert.match(sidebar, /data-sidebar-scroll-region="settings"/);
assert.match(sidebar, /data-sidebar-scroll-region="memory"/);
assert.match(sidebar, /overflow-y-auto overscroll-contain/);
assert.match(sidebar, /shrink-0 border-b/);

assert.match(navigation, /selected \? 'bg-slate-950 text-white shadow-sm'/);
assert.match(navigation, /font-semibold text-white/);
assert.match(navigation, /SanadIntelligenceMark state="idle" size=\{18\} monochrome/);
assert.doesNotMatch(
  styles,
  /\.sanad-intelligence-mark\s*\{[^}]*color:\s*#0f172a/s,
  'The mark must inherit active-shell contrast instead of forcing dark ink.',
);

console.log('SANAD Stage 1G.HF production closure hotfix contract passed.');
