import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SANAD_COMPOSER_ACTIONS,
  buildGuidedComposerPrompt,
  composerActionsForScope,
  type SanadComposerActionDescriptor,
} from '../src/features/assistant/sanadSpecialistComposerCatalog';

const personal = composerActionsForScope('personal');
const commercial = composerActionsForScope('business');
assert.ok(personal.some((item) => item.id === 'personal_review'));
assert.ok(personal.some((item) => item.id === 'personal_expense'));
assert.ok(commercial.some((item) => item.id === 'customer_statement'));
assert.ok(commercial.some((item) => item.id === 'business_review'));
assert.ok(!personal.some((item) => item.projectKind === 'business'));
assert.ok(!commercial.some((item) => item.projectKind === 'personal'));
assert.deepEqual(composerActionsForScope('legacy_unclassified'), []);
assert.deepEqual(composerActionsForScope(null), []);
assert.deepEqual(composerActionsForScope('business', []), [], 'Missing server tools cannot yield an active launcher item.');

const customer = commercial.find((item) => item.id === 'customer_statement')!;
assert.equal(buildGuidedComposerPrompt(customer, {}), null);
assert.equal(buildGuidedComposerPrompt(customer, { query: ' ' }), null);
assert.equal(buildGuidedComposerPrompt(customer, { query: 'x'.repeat(121) }), null);
assert.equal(buildGuidedComposerPrompt(customer, { query: 'عميل', from: '2026-09-25', to: '2026-01-01' }), null);
assert.equal(buildGuidedComposerPrompt(customer, { query: 'عميل', from: '25/09/2026' }), null);
assert.equal(buildGuidedComposerPrompt(customer, { query: 'عميل', from: '2026-02-30' }), null);
const prepared = buildGuidedComposerPrompt(customer, { query: 'بلحيث', from: '2026-01-01' });
assert.ok(prepared?.includes('بلحيث'));
assert.ok(prepared?.includes('المرشحين'));
assert.ok(!prepared?.includes('account_id'), 'The UI must never invent canonical customer IDs.');

const expense = personal.find((item) => item.id === 'personal_expense')!;
assert.equal(expense.state, 'guided_chat_only');
assert.equal(expense.formFields.length, 0, 'Stage 2C must not build shadow expense drafts.');
assert.match(buildGuidedComposerPrompt(expense, {})!, /الموافقة الصريحة/);
const commercialDraft = commercial.find((item) => item.id === 'commercial_draft')!;
assert.match(buildGuidedComposerPrompt(commercialDraft, {})!, /لا ترحّل شيئًا إلى إبداع/);
assert.ok(SANAD_COMPOSER_ACTIONS.every((item) => item.schemaVersion === 1));
assert.ok(SANAD_COMPOSER_ACTIONS.every((item) => item.sourceTools.length > 0));

const launcher = readFileSync('src/features/assistant/SanadSmartComposerLauncher.tsx', 'utf8');
const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
assert.match(launcher, /composerActionsForScope\(scope\)/);
assert.match(launcher, /data-sanad-smart-composer-panel/);
assert.match(launcher, /role="dialog"/);
assert.match(launcher, /aria-expanded=\{open\}/);
assert.match(launcher, /event\.key === 'ArrowDown'/);
assert.match(launcher, /event\.key === 'Escape'/);
assert.match(launcher, /onPreparePrompt\(prompt\)/);
assert.doesNotMatch(launcher, /supabase\.|\.rpc\(|create_my_sanad_agent_action_draft_v1/,
  'The launcher cannot become an independent server/action execution path.');
assert.match(workspace, /threadId=\\{selectedThreadId\\}/);
assert.match(workspace, /scope=\{verifiedThreadScope\}/);
assert.match(workspace, /disabled=\{sending \|\| threadReadOnly \|\| threadLoading\}/);
assert.match(workspace, /setDraft\(prompt\)/, 'The user must review suggested text before sending.');
assert.match(workspace, /<SanadAttachmentComposer/);
assert.match(workspace, /<SanadVoiceDictationButton/);
assert.match(workspace, /data-workspace-slot="composer"/);
assert.equal((workspace.match(/<form/g) || []).length, 1, 'Do not add a second form/scroll owner.');
const backend = readFileSync('supabase/functions/_shared/sanad-agent-insights.ts', 'utf8');
assert.match(backend, /buildAgentInsights/, 'Reposition existing deterministic insights, do not duplicate the engine.');
console.log('Stage 2C.5 specialist catalog, read-only guided prototype and single-composer guards PASS.');
