// Stage 1C.1 density and rendering hardening contract.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync('src/features/financial/FinancialWorkspaceRoute.tsx', 'utf8');
const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const sidebar = readFileSync('src/features/assistant/AssistantWorkspaceSidebar.tsx', 'utf8');
const markdown = readFileSync('src/features/assistant/SanadConversationMarkdown.tsx', 'utf8');
const attachmentComposer = readFileSync('src/features/assistant/SanadAttachmentComposer.tsx', 'utf8');

assert.match(route, /\{!viewportMode \? \(\s*<header/s, 'AI viewport mode must omit the secondary route header.');
assert.match(route, /\{!viewportMode \? \(\s*<section className="rounded-\[1\.6rem\]/s, 'AI viewport mode must omit the static description card.');
assert.match(route, /data-conversation-route-surface="open"/);
assert.match(workspace, /data-conversation-surface="open"/);
assert.doesNotMatch(
  workspace,
  /id="sanad-agent-workspace"[^>]*className="[^"]*(?:rounded-\[1\.5rem\]|shadow-\[0_10px_32px|border border-slate-200\/70)/s,
  'The conversation workspace must not regress into an outer framed card.',
);
assert.match(workspace, /data-mobile-sidebar-trigger/);
assert.match(workspace, /data-scroll-owner="timeline"/);
assert.match(workspace, /data-workspace-slot="composer"/);
assert.match(workspace, /data-composer-density="compact"/);
assert.match(workspace, /rows=\{1\}/);
assert.match(workspace, /max-h-\[60px\]/);
assert.match(workspace, /min-h-9/);
assert.match(workspace, /data-composer-layout="single-row-controls"/);
assert.match(workspace, /layout="inline-grid"/);
assert.match(workspace, /Math\.min\(textarea\.scrollHeight, 60\)/);
assert.match(workspace, /Math\.max\(nextHeight, 36\)/);
assert.match(workspace, /syncComposerTextareaHeight/);
assert.doesNotMatch(workspace, /max-h-40 min-h-\[56px\]/);
assert.doesNotMatch(workspace, /max-h-\[64px\]/);

assert.match(workspace, /SanadConversationMarkdown content=\{message\.content\}/);
assert.match(workspace, /max-w-\[48rem\]/, 'Narrative assistant text must retain a readable measure.');
assert.match(workspace, /data-structured-response-surface="wide"/);
assert.match(workspace, /max-w-\[72rem\]/, 'Structured responses may use a wider surface than narrative text.');

assert.match(attachmentComposer, /layout\?: 'stacked' \| 'inline-grid'/);
assert.match(attachmentComposer, /inlineGrid \? 'contents'/);
assert.match(attachmentComposer, /col-span-full/, 'Attachment tray must span above compact composer controls when present.');

for (const required of [
  '<strong',
  '<em',
  '<ul',
  '<ol',
  '<hr',
  '<a',
  '<code',
]) {
  assert.ok(markdown.includes(required), `conversation markdown renderer missing ${required}`);
}
assert.match(markdown, /safeHref/);
assert.doesNotMatch(markdown, /dangerouslySetInnerHTML/);
assert.match(
  workspace,
  /\{assistant\s*\? <SanadConversationMarkdown content=\{message\.content\} \/>\s*:\s*<p[^>]*>\{message\.content\}<\/p>\}/s,
  'Assistant narrative must use Markdown while user messages may remain plain text.',
);

assert.match(sidebar, /data-sidebar-density="compact"/);
assert.match(sidebar, /مساحة المحادثة/, 'Contextual conversation panel must be labeled as workspace-specific, not duplicate the global SANAD brand.');
assert.doesNotMatch(sidebar, /SanadUnifiedNavLinks/, 'Only the shell-owned sidebar may render global navigation.');
assert.match(sidebar, /assistantState/);
assert.match(sidebar, /SanadAssistantStatus/);
assert.match(sidebar, /businessLabel/);
assert.doesNotMatch(
  sidebar,
  /bg-white text-slate-950 shadow-sm ring-1 ring-slate-200/,
  'Sidebar tabs must stay flat rather than card-like.',
);

console.log('SANAD conversation surface simplification contract passed.');
