// Offline SDK compatibility check. Never sign in or contact Supabase.
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
const s=createClient("https://hudbzlgclghlhazlduas.supabase.co","public-dummy-fixture-only",{auth:{persistSession:false,autoRefreshToken:false}});
assert.equal(typeof s.auth.oauth?.getAuthorizationDetails,"function");
assert.equal(typeof s.auth.oauth?.approveAuthorization,"function");
assert.equal(typeof s.auth.oauth?.denyAuthorization,"function");
console.log("PASS: installed Supabase SDK exposes all three OAuth consent APIs");
