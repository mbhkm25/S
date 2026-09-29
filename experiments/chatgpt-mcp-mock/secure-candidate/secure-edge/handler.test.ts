import {createSecureHandler} from "./handler.ts";
const UUID="00000000-0000-4000-a000-000000000001";
function expect(actual: unknown, expected: unknown, name: string) {
 if(actual!==expected)throw Error(name+": expected "+String(expected)+", got "+String(actual));
}
const make=(valid=true)=>createSecureHandler(async token=>token==="fixture" && valid?{id:UUID}:null);
function req(path="/mcp",body:unknown={jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"sanad_secure_get_customer_statement",arguments:{business_id:"any",account_id:"1"}}},token="fixture") {
 return new Request("https://example.invalid"+path,{method:"POST",headers:{"content-type":"application/json",...(token?{authorization:"Bearer "+token}:{})},body:JSON.stringify(body)});
}
Deno.test("missing bearer denied",async()=>expect((await make()(req("/mcp",{}, ""))).status,401,"anonymous"));
Deno.test("unverified bearer denied",async()=>expect((await make()(req("/mcp",{}, "forged"))).status,401,"forged"));
Deno.test("invalid verified principal rejected",async()=>{
 const handler=createSecureHandler(async()=>({id:"not-a-uuid"}));
 expect((await handler(req())).status,401,"forged identity");
});
Deno.test("auth service outage fails closed",async()=>{
 const handler=createSecureHandler(async()=>{throw Error("service offline")});
 const r=await handler(req());expect(r.status,503,"auth outage");
});
Deno.test("valid identity can initialize without data",async()=>{
 const r=await make()(req("/mcp",{jsonrpc:"2.0",id:42,method:"initialize",params:{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"test",version:"1"}}}));
 expect(r.status,200,"initialize");
 const data=await r.json();expect(data.result.serverInfo.name,"sanad-secure-candidate","server name");
});
Deno.test("authenticated tool listing contains no production data",async()=>{
 const r=await make()(req("/mcp",{jsonrpc:"2.0",id:2,method:"tools/list"}));
 const data=await r.json();
 expect(data.result.tools.length,4,"tool count");
 expect(JSON.stringify(data).includes("SYNTHETIC_FIXTURE"),false,"no fixture returned");
});
Deno.test("even an authenticated owner cannot read financial data before consent approval",async()=>{
 const r=await make()(req());
 const data=await r.json();expect(data.error.message,"financial_access_not_configured","deny MCP call");
});
Deno.test("REST adapter shares financial deny gate",async()=>{
 const r=await make()(req("/execute",{tool:"sanad_secure_get_customer_statement",arguments:{business_id:"any",account_id:"1"}}));
 expect(r.status,403,"rest denied");
 const data=await r.json();expect(data.error,"financial_access_not_configured","rest reason");
});
Deno.test("client-supplied principal does not grant read",async()=>{
 const r=await make()(req("/execute",{tool:"sanad_secure_get_customer_statement",principal:{role:"owner"},arguments:{business_id:"other",account_id:"1"}}));
 expect(r.status,403,"cannot impersonate");
});
Deno.test("oversized request denied before processing",async()=>{
 const r=await make()(req("/execute",{tool:"sanad_secure_get_customer_statement",padding:"x".repeat(2048)}));
 expect(r.status,413,"oversized");
});
Deno.test("no permissive CORS or credential echo",async()=>{
 const r=await make()(req("/execute",{tool:"sanad_secure_get_customer_statement"}));
 expect(r.headers.get("access-control-allow-origin"),null,"no CORS");
 expect(JSON.stringify(await r.json()).includes("fixture"),false,"no credential echo");
});
