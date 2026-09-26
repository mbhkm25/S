import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectQuickPrompts } from '../src/features/assistant/sanadProjectQuickPrompts';

const personal = projectQuickPrompts('personal');
const business = projectQuickPrompts('business');

assert.equal(personal.length, 4);
assert.equal(business.length, 4);
assert.ok(personal.every(text => /شخصي|الشخصية/.test(text)), 'Personal prompts must refer only to personal records');
assert.ok(business.every(text => /نشاط|التجاري|التجارية|المحاسبي/.test(text)), 'Business prompts must refer only to business records');
for (const prompt of personal) assert.ok(!business.includes(prompt), 'Never share scope-specific prompts');
assert.deepEqual(projectQuickPrompts('legacy_unclassified'), [], 'Legacy threads cannot silently inherit a scope');
assert.deepEqual(projectQuickPrompts(null), [], 'Unverified threads have no actionable scope prompts');

const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
assert.match(workspace, /setVerifiedThreadScope\(null\)/);
assert.match(workspace, /detail\.thread\.project_kind === 'personal'/);
assert.match(workspace, /detail\.thread\.project_kind === 'business'/);
assert.match(workspace, /detail\.thread\.project_kind === 'legacy_unclassified'/);
assert.match(workspace, /projectQuickPrompts\(verifiedThreadScope\)/);
assert.doesNotMatch(workspace, /const QUICK_PROMPTS\s*=/);
console.log('Verified project-specific assistant starter prompts PASS');
