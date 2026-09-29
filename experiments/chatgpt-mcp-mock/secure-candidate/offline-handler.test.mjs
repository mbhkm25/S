import test from "node:test";
import assert from "node:assert/strict";
import {createOfflineHandler} from "./offline-handler.mjs";
let who={userId:"owner",verified:true}, grants={currentBusinessId:"biz-a",relationships:[{businessId:"biz-a",role:"owner",active:true}]},plan={consent:true,active:true},reads=0,available=true;
const handle=createOfflineHandler({
 verifyIdentity:async token=>token==="fixture"?who:null,
 permissionsFor:async()=>{if(!available)throw Error("offline");return grants},
 entitlementFor:async()=>plan,
 read:async(tool,args,scope)=>{reads++;return{tool,args,scope}}
});
const call=(tool="sanad_secure_get_customer_statement",args={business_id:"biz-a",account_id:"1001"},token="fixture")=>handle(new Request("http://localhost/private-test/execute",{method:"POST",headers:{"content-type":"application/json",...(token?{authorization:"Bearer "+token}:{})},body:JSON.stringify({tool,arguments:args})}));
const reset=()=>{who={userId:"owner",verified:true};grants={currentBusinessId:"biz-a",relationships:[{businessId:"biz-a",role:"owner",active:true}]};plan={consent:true,active:true};reads=0;available=true;};
const denied=async status=>{const r=await call();assert.equal(r.status,status);assert.equal(reads,0)};
test("authorized owner reads scoped fixture",async()=>{reset();const r=await call();assert.equal(r.status,200);assert.equal((await r.json()).result.scope.businessId,"biz-a");assert.equal(reads,1)});
test("missing token denied",async()=>{reset();const r=await call(undefined,undefined,null);assert.equal(r.status,401);assert.equal(reads,0)});
test("invalid token denied",async()=>{reset();const r=await call(undefined,undefined,"bad");assert.equal(r.status,401);assert.equal(reads,0)});
test("consent required",async()=>{reset();plan.consent=false;await denied(403)});
test("active entitlement required",async()=>{reset();plan.active=false;await denied(402)});
test("cross-business denied",async()=>{reset();const r=await call(undefined,{business_id:"biz-b",account_id:"1001"});assert.equal(r.status,403);assert.equal(reads,0)});
test("customer cannot enumerate ERP customers",async()=>{reset();grants.relationships[0].role="customer";await denied(403)});
test("revoked team loses financial access",async()=>{reset();grants.relationships[0]={businessId:"biz-a",role:"team",active:false,financialReadGrant:true};await denied(403)});
test("manager title alone not grant",async()=>{reset();grants.relationships[0]={businessId:"biz-a",role:"team",active:true,jobTitle:"manager"};await denied(403)});
test("explicit financial team grant works",async()=>{reset();grants.relationships[0]={businessId:"biz-a",role:"team",active:true,financialReadGrant:true};const r=await call();assert.equal(r.status,200)});
test("permissions outage fails closed",async()=>{reset();available=false;await denied(503)});
test("reject account name instead of account id",async()=>{reset();const r=await call(undefined,{business_id:"biz-a",account_id:"Ali"});assert.equal(r.status,400);assert.equal(reads,0)});
test("reject arbitrary write tool",async()=>{reset();const r=await call("sanad_secure_post_invoice",{});assert.equal(r.status,400);assert.equal(reads,0)});
test("reject client-supplied principal",async()=>{reset();const r=await call("sanad_secure_get_sync_status",{business_id:"biz-a",principal:{role:"owner"}});assert.equal(r.status,400);assert.equal(reads,0)});
