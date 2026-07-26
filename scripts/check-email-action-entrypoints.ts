import assert from 'node:assert/strict';
import fs from 'node:fs';

const indexHtml = fs.readFileSync('index.html', 'utf8');
const authActionHtml = fs.readFileSync('auth-action.html', 'utf8');
const resetPasswordHtml = fs.readFileSync('reset-password.html', 'utf8');
const authSource = fs.readFileSync('src/components/Auth.tsx', 'utf8');
const authActionSource = fs.readFileSync('src/auth-action.tsx', 'utf8');
const resetPasswordSource = fs.readFileSync('src/reset-password.tsx', 'utf8');

assert.match(indexHtml, /hasEmailActionPayload/, 'main entry must detect misplaced email callback payloads');
assert.match(indexHtml, /reset-password\.html/, 'recovery callbacks must be quarantined to reset-password.html');
assert.match(indexHtml, /auth-action\.html/, 'non-recovery callbacks must be quarantined to auth-action.html');
assert.match(indexHtml, /window\.location\.replace/, 'callback quarantine must run before application bootstrap');

assert.match(authSource, /emailRedirectTo:\s*getEmailActionUrl\('signup'\)/, 'signup must target the dedicated action page');
assert.match(authSource, /type:\s*'signup'[\s\S]*emailRedirectTo:\s*getEmailActionUrl\('signup'\)/, 'resend confirmation must use the same action page');
assert.match(authSource, /resetPasswordForEmail\([\s\S]*reset-password\.html/, 'password recovery must target the dedicated recovery page');

assert.match(authActionHtml, /auth-action-root/, 'auth action HTML root must exist');
assert.match(authActionSource, /endTemporaryBrowserSession/, 'email action page must end temporary browser sessions');
assert.match(authActionSource, /ارجع إلى تطبيق سند وسجّل الدخول/, 'email action success must require explicit sign-in');
assert.doesNotMatch(authActionSource, /window\.location\.(assign|replace)\([^)]*getAppUrl/, 'email action page must not auto-open the app');

assert.match(resetPasswordHtml, /reset-password-root/, 'password reset HTML root must exist');
assert.match(resetPasswordSource, /updateUser\(\{ password \}\)/, 'recovery page must update the password');
assert.match(resetPasswordSource, /signOut\(\{ scope: 'local' \}\)/, 'recovery page must end its temporary session');
assert.match(resetPasswordSource, /سجّل الدخول باستخدام كلمة المرور الجديدة/, 'recovery success must require explicit sign-in');

console.log('Email action entrypoint contract passed: 16 checks.');
