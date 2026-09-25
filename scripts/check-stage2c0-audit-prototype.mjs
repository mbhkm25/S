import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { Script } from 'node:vm';

const prototype = readFileSync(new URL('../docs/prototypes/STAGE2C0_PROJECTS_COMPOSER_PREVIEW.html', import.meta.url),'utf8');
const audit = readFileSync(new URL('../docs/implementation/STAGE2C0_LIVE_CONTRACT_AUDIT_2026-09-25.md', import.meta.url),'utf8');
const match = prototype.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, 'self-contained prototype must include one local script');
new Script(match[1], { filename: 'STAGE2C0_PROJECTS_COMPOSER_PREVIEW.html' });

// This preview is intentionally disconnected from the app and Production data.
assert.match(prototype, /no network calls|لا يتصل ببياناتك الحقيقية/);
assert.doesNotMatch(match[1], /\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(|sendBeacon\s*\(|\bsupabase\b/i, 'prototype script must never access live APIs');
assert.doesNotMatch(prototype, /<script[^>]+src=|<link[^>]+href=["']https?:|<iframe/i, 'prototype must not import network resources');
for (const label of ['محادثة جديدة','المحادثات','اليوم','المدير الشخصي','الأعمال','المزيد','إجراء','تسجيل مصروف','فاتورة مبيعات','المصادر','إدارة المشروع']) {
  assert.ok(prototype.includes(label), 'missing owner-review UI concept: ' + label);
}
for (const requirement of [
  'null-business', 'can_access_sanad_agent_thread_v2','update_my_sanad_agent_thread_v1',
  'get_user_business_contexts', 'READ ONLY', '2C.1'
]) {
  assert.ok(audit.includes(requirement), 'audit must retain security/compatibility evidence: ' + requirement);
}
assert.match(prototype, /@media\(max-width:650px\)/, 'responsive mobile preview required');
assert.match(prototype, /prefers-reduced-motion:reduce/, 'reduced motion preview required');
console.info('Stage 2C.0: static audit and no-network responsive prototype checks PASS.');
