import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("./",import.meta.url);
const schema=readFileSync(new URL("secure-candidate/gpt-actions-deny-all.openapi.yaml",root),"utf8");
const consent=readFileSync(new URL("oauth-consent/main.mjs",root),"utf8");
const instructions=readFileSync(new URL("oauth-consent/OAUTH_OWNER_EXECUTION_RUNBOOK_2026-09-29.md",root),"utf8");
test("protected smoke schema targets only separate deny-all endpoint",()=>{
 assert.match(schema,/\/execute:\s*\n\s+post:/);
 assert.match(schema,/operationId:\s*testSanadProtectedReadDenial/);
 assert.match(schema,/financial_access_not_configured/);
 assert.doesNotMatch(schema,/\/gpt-demo\//);
 assert.doesNotMatch(schema,/SERVICE_ROLE|sk_[a-zA-Z0-9]{10,}/i);
});
test("existing private synthetic GPT remains separate from OAuth candidate",()=>{
 assert.match(instructions,/leave the successful synthetic GPT untouched/);
 assert.match(instructions,/Do not invent the callback/);
});
test("consent UI requires exact client callback and browser-only Supabase key",()=>{
 assert.match(consent,/VITE_OAUTH_CALLBACK_URL/);
 assert.match(consent,/VITE_SUPABASE_PUBLISHABLE_KEY/);
 assert.match(consent,/safeSupabaseRedirect/);
 assert.doesNotMatch(consent,/SERVICE_ROLE|SUPABASE_SECRET_KEY/);
});
test("old Site URL preservation and rollback are explicit",()=>{
 assert.match(instructions,/https:\/\/app\.sanadflow\.com/);
 assert.match(instructions,/https:\/\/auth\.sanadflow\.com/);
 assert.match(instructions,/Restore old Site URL/);
});
