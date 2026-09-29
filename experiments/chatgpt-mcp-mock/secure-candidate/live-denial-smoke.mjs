// Public endpoint contract smoke: NO credentials and NO production-data queries.
// This deliberately checks only unauthorized rejection of the dedicated secure gate
// and continued health of the existing synthetic-only demonstration server.
import assert from "node:assert/strict";
const root="https://hudbzlgclghlhazlduas.supabase.co/functions/v1";
async function call(route,{method="GET",headers={},body}={}){
 const signal=AbortSignal.timeout(8000);
 const response=await fetch(root+"/"+route,{method,headers,body,signal,redirect:"error"});
 const raw=(await response.text()).slice(0,450);
 return {status:response.status,text:raw,headers:response.headers};
}
const synthetic=await call("sanad-mcp-demo/health");
assert.equal(synthetic.status,200,"synthetic health must be available");
const health=JSON.parse(synthetic.text);
assert.equal(health.demonstration_only,true);
assert.equal(health.production_connected,false);
console.log("PASS: existing public demo remains synthetic-only");
const attempts=[
 ["anonymous",{}],
 ["malformed token",{headers:{authorization:"Bearer invalid.fixture.signature"}}],
 ["spoofed no-auth identity",{headers:{"x-user-id":"00000000-0000-4000-a000-000000000001"}}]
];
for(const [name,extra] of attempts){
 const response=await call("sanad-mcp-secure-v1/mcp",{
  method:"POST",headers:{"content-type":"application/json",...(extra.headers||{})},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list"})
 });
 assert.equal(response.status,401,name+" unexpectedly passed authenticated gateway: "+response.text);
 assert.doesNotMatch(response.text,/customer_name|account_id|closing_balance|Bearer /i);
 console.log("PASS: "+name+" rejected with 401 and no financial payload");
}
console.log("PASS: independent protected gateway rejection smoke");
