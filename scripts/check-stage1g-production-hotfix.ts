import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const voice = readFileSync('src/features/assistant/assistantVoiceApi.ts', 'utf8');
const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const sidebar = readFileSync('src/components/navigation/SanadAssistantSidebarSections.tsx', 'utf8');
const unifiedSidebar = readFileSync('src/components/navigation/SanadUnifiedSidebar.tsx', 'utf8');
const shell = readFileSync('src/features/financial/FinancialWorkspaceShell.tsx', 'utf8');
const navigation = readFileSync('src/components/navigation/ProductBottomNav.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');
const voiceWorkflow = readFileSync('.github/workflows/deploy-sanad-ai-transcribe-production.yml', 'utf8');
const voiceFunction = readFileSync('supabase/functions/sanad-ai-transcribe-v1/index.ts', 'utf8');

assert.match(voice, /PRODUCTION_VOICE_ENDPOINT/);
assert.match(voice, /supabase\.auth\.refreshSession\(\)/);
assert.match(voice, /isTransportFailure/);
assert.match(voice, /VOICE_PREVIEW_ENABLED \|\| !isTransportFailure/);
assert.match(voice, /endpointUrl: PRODUCTION_VOICE_ENDPOINT/);
assert.match(voice, /requestBody/);
assert.match(voice, /signal: request\.signal/);
assert.doesNotMatch(
  voice,
  /PRODUCTION_VOICE_ENDPOINT[\s\S]*sanad-ai-transcribe-stage1e-candidate/,
  'Production recovery must remain on the production function name.',
);

assert.match(workspace, /data-assistant-status-slot="error"/);
assert.match(workspace, /relative z-30[^"]*shrink-0/);
// Original sidebar-hotfix intent is preserved by a single shell-owned scroll
// region and inline, independently expandable settings and memory content.
assert.doesNotMatch(workspace, /PanelRightOpen|data-mobile-sidebar-trigger/);
assert.match(shell, /data-sanad-mobile-menu-fab="true"/);
assert.match(unifiedSidebar, /data-sanad-global-nav-scroll="true"/);
assert.match(unifiedSidebar, /overflow-y-auto overscroll-contain/);
assert.match(sidebar, /data-sanad-inline-settings="true"/);
assert.match(sidebar, /data-sanad-inline-memory="true"/);

assert.match(navigation, /data-active=\{selected \? 'true' : 'false'\}/);
assert.match(navigation, /sanad-primary-nav-item/);
assert.match(navigation, /SanadIntelligenceMark state="idle" size=\{18\} monochrome/);
assert.doesNotMatch(
  styles,
  /\.sanad-intelligence-mark\s*\{[^}]*color:\s*#0f172a/s,
  'The mark must inherit active-shell contrast instead of forcing dark ink.',
);

assert.match(voiceWorkflow, /--no-verify-jwt/);
assert.match(voiceWorkflow, /REQUESTED_SHA:-\$GITHUB_SHA/);
assert.match(voiceWorkflow, /hudbzlgclghlhazlduas\.supabase\.co\/functions\/v1\/sanad-ai-transcribe-v1/);
assert.match(voiceFunction, /adminClient\.auth\.getUser\(token\)/);
assert.match(voiceFunction, /service_unavailable/);
assert.doesNotMatch(voiceFunction, /trycloudflare\.com/);

console.log('SANAD Stage 1G.HF production closure hotfix contract passed.');
