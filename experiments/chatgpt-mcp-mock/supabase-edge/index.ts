// SANAD synthetic-only MCP POC. Deliberately no Supabase/database/secret imports.
// WARNING: Public unauthenticated endpoint; safe ONLY with the fabricated fixtures below.
// Production data integrations require OAuth, tenant isolation and separate approval.
const BUSINESS = {business_id:"demo-business-001",business_name:"متجر سند التجريبي",data_classification:"SYNTHETIC_DEMO_NOT_REAL"};
const CUSTOMERS = [
 {account_id:"1001",display_name:"عميل تجريبي ١",currency:"SAR",opening_balance:1000,movements:[
  {date:"2026-09-01",kind:"sale",source_document:"DEMO-S-01",debit:250,credit:0},
  {date:"2026-09-03",kind:"receipt",source_document:"DEMO-R-01",debit:0,credit:400}
 ]},
 {account_id:"1002",display_name:"عميل تجريبي ٢",currency:"SAR",opening_balance:0,movements:[
  {date:"2026-09-05",kind:"sale",source_document:"DEMO-S-02",debit:600,credit:0}
 ]}
];
const specs = [
 {name:"sanad_demo_list_businesses",description:"DEMO ONLY: list fabricated SANAD example businesses. No real account access.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:"sanad_demo_get_sync_status",description:"DEMO ONLY: fabricated business sync status; no ERP connected.",inputSchema:{type:"object",properties:{business_id:{type:"string"}},required:["business_id"],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:"sanad_demo_search_customers",description:"DEMO ONLY: search fabricated customers of specified demo business.",inputSchema:{type:"object",properties:{business_id:{type:"string"},query:{type:"string"}},required:["business_id","query"],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:"sanad_demo_get_customer_statement",description:"DEMO ONLY: fabricated account statement; returns accounting balances for sample fixtures, not real customers.",inputSchema:{type:"object",properties:{business_id:{type:"string"},account_id:{type:"string"}},required:["business_id","account_id"],additionalProperties:false},annotations:{readOnlyHint:true}}
];
function runTool(name,args) {
 const businessId=args.business_id;
 if(name==="sanad_demo_list_businesses")return {demonstration_only:true,source:"STATIC_SYNTHETIC_FIXTURE",businesses:[BUSINESS]};
 if (typeof businessId!=="string")return {error:"business_id_required"};
 if(businessId!==BUSINESS.business_id)return {error:"demo_business_not_found"};
 if(name==="sanad_demo_get_sync_status")return {demonstration_only:true,business:BUSINESS,connection:"DEMO_SIMULATED",last_sync_at:null,warning:"No ERP is connected. All numbers are fabricated test fixtures."};
 if(name==="sanad_demo_search_customers"){
  if(typeof args.query!=="string")return {error:"query_required"};
  const q=args.query.trim().toLowerCase();
  return {demonstration_only:true,customers:CUSTOMERS.filter(x=>x.account_id===q||x.display_name.toLowerCase().includes(q)).map(({account_id,display_name,currency})=>({account_id,display_name,currency})),source:"STATIC_SYNTHETIC_FIXTURE"};
 }
 if(name==="sanad_demo_get_customer_statement"){
  if(typeof args.account_id!=="string")return {error:"account_id_required"};
  const customer=CUSTOMERS.find(x=>x.account_id===args.account_id);
  if(!customer)return {error:"demo_account_not_found",demonstration_only:true};
  let running=customer.opening_balance;
  const movements=customer.movements.map(x=>({...x,running_balance:(running+=x.debit-x.credit)}));
  return {demonstration_only:true,source:"STATIC_SYNTHETIC_FIXTURE",business:BUSINESS,customer:{account_id:customer.account_id,display_name:customer.display_name},currency:customer.currency,opening_balance:customer.opening_balance,movements,closing_balance:running,warning:"Illustrative fabricated numbers. NOT a real SANAD or Edaa account."};
 }
 return {error:"unknown_tool"};
}
const cors={"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type,accept,mcp-protocol-version,mcp-session-id,authorization","access-control-expose-headers":"mcp-session-id"};
function json(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...cors,...extra}})}
const rpc=(id,result)=>({jsonrpc:"2.0",id,result});
const rpcError=(id,code,message)=>({jsonrpc:"2.0",id,error:{code,message}});
Deno.serve(async(req)=>{
 const url=new URL(req.url);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method==="GET"&&(url.pathname.endsWith("/health")||url.pathname.endsWith("/sanad-mcp-demo"))){
  return json({name:"sanad-mcp-demo",demonstration_only:true,production_connected:false,tool_count:4,transport:"stateless-streamable-http"});
 }
 // Read-only synthetic REST adapter for legacy private Custom GPT Actions.
 if(req.method==="GET" && url.pathname.includes("/gpt-demo/")){
  const path=url.pathname.split("/gpt-demo/")[1], businessId=url.searchParams.get("business_id")??undefined;
  const q=url.searchParams.get("query")??undefined, accountId=url.searchParams.get("account_id")??undefined;
  const names={businesses:"sanad_demo_list_businesses",sync:"sanad_demo_get_sync_status",customers:"sanad_demo_search_customers",statement:"sanad_demo_get_customer_statement"};
  const chosen=names[path as keyof typeof names];
  if(!chosen)return json({error:"unknown_demo_route"},404);
  const result=runTool(chosen,{business_id:businessId,query:q,account_id:accountId});
  return json(result, "error" in result ? 400 : 200);
 }
 if(!url.pathname.endsWith("/mcp"))return json({error:"not_found"},404);
 if(req.method==="GET"||req.method==="DELETE")return new Response(null,{status:405,headers:{"allow":"POST, OPTIONS",...cors}});
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 let msg;
 try{msg=await req.json()}catch{return json(rpcError(null,-32700,"Parse error"),400)}
 if(!msg||Array.isArray(msg)||msg.jsonrpc!=="2.0"||typeof msg.method!=="string")return json(rpcError(msg?.id??null,-32600,"Invalid Request"),400);
 if(!("id" in msg))return new Response(null,{status:202,headers:cors});
 if(msg.method==="initialize")return json(rpc(msg.id,{protocolVersion:"2025-06-18",capabilities:{tools:{listChanged:false}},serverInfo:{name:"sanad-supabase-synthetic-mcp",version:"0.1.0"}}));
 if(msg.method==="ping")return json(rpc(msg.id,{}));
 if(msg.method==="tools/list")return json(rpc(msg.id,{tools:specs}));
 if(msg.method==="tools/call"){
  const name=msg.params?.name, args=msg.params?.arguments??{};
  if(!specs.some(x=>x.name===name))return json(rpcError(msg.id,-32602,"Unknown tool"));
  if(!args||Array.isArray(args)||typeof args!=="object")return json(rpcError(msg.id,-32602,"Invalid arguments"));
  const result=runTool(name,args);
  return json(rpc(msg.id,{content:[{type:"text",text:JSON.stringify(result)}],structuredContent:result,isError:!!result.error}));
 }
 return json(rpcError(msg.id,-32601,"Method not found"));
});
