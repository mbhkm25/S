// Credential-free hosted route regression. A fake ID checks URL transport only.
import assert from "node:assert/strict";
const fake="probe_123456789";
const host="https://auth.sanadflow.com";
const route=host+"/oauth/consent?authorization_id="+fake;
const r=await fetch(route,{redirect:"manual",signal:AbortSignal.timeout(10000)});
assert.ok([200,301,302,307,308].includes(r.status),"unexpected consent route HTTP status");
if(r.status===200){
 const html=await r.text();
 assert.match(html,/ربط حساب سند/,"consent HTML missing");
}else{
 const target=new URL(r.headers.get("location"),route);
 assert.equal(target.origin,host,"wrong redirect origin");
 assert.equal(target.searchParams.get("authorization_id"),fake,"authorization ID lost");
 const follow=await fetch(target,{signal:AbortSignal.timeout(10000)});
 assert.equal(follow.status,200,"redirect target unavailable");
 const html=await follow.text();
 assert.match(html,/ربط حساب سند/,"consent HTML missing after redirect");
}
console.log("PASS: secure host serves consent UI and retains authorization ID through redirects");
