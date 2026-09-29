import test from "node:test";import assert from "node:assert/strict";
import {createOwnerOnlyReader,PilotReadError} from "./owner-only-reader.mjs";
const business="00000000-0000-4000-a000-000000000001",other="00000000-0000-4000-a000-000000000002";
function build({owner=true,statementStatus="ok",fail}={}){
 const seen=[];
 const fixtures={
  is_business_owner_v1:owner,
  get_business_accounting_connections_v1:{items:[{business_id:business,status:"connected",connection_mode:"read_only",last_sync_at:"2026-09-29T09:00:00Z",last_heartbeat_at:"2026-09-29T09:01:00Z",secret:"never"},{business_id:other,status:"connected",secret:"cross"}]},
  get_business_erp_customer_candidates_v1:{status:"ok",snapshot_public_id:"snap",items:[{customer_name:"Demo A",account_id:1001,resolution_status:"resolved_unique_sale_account",account_count:1,mobile:"private"}]},
  get_business_erp_customer_statement_v1:{status:statementStatus,snapshot_public_id:"snap",account:{account_id:1001,account_name:"Demo A",mobile:"private"},from_date:"2026-09-01",to_date:"2026-09-29",opening_by_currency:[{currency_id:1,balance:1000}],totals_by_currency:[{currency_id:1,closing_balance:850}],sign_convention:{source_negative:"debit"},items:[{date:"2026-09-03",doc_number:"DEMO-R-01",currency_id:1,currency_name:"SAR",debit:0,credit:400,running_balance:850,description:"private"}]}
 };
 const reader=createOwnerOnlyReader({baseUrl:"https://project.supabase.co",publicKey:"public-fixture",bearer:"verified-fixture",fetchImpl:async(url,opts)=>{
  const name=url.split("/").at(-1);seen.push({name,opts});
  return new Response(JSON.stringify(fixtures[name]),{status:fail===name?503:200,headers:{"content-type":"application/json"}});
 }});
 return {read:reader,seen};
}
const err=async(p,code)=>assert.rejects(p,e=>e instanceof PilotReadError&&e.code===code);
test("owner gets minimal sync fields only",async()=>{const t=build();const x=await t.read("sync_status",{businessId:business});assert.equal(x.items.length,1);assert.equal(x.items[0].secret,undefined);assert.deepEqual(t.seen.map(z=>z.name),["is_business_owner_v1","get_business_accounting_connections_v1"]);});
test("non-owner cannot call broad existing RPC",async()=>{const t=build({owner:false});await err(t.read("sync_status",{businessId:business}),"owner_required");assert.deepEqual(t.seen.map(z=>z.name),["is_business_owner_v1"]);});
test("search strips customer contact fields",async()=>{const t=build();const x=await t.read("search_customer",{businessId:business,query:"Demo"});assert.equal(x.candidates[0].mobile,undefined);assert.deepEqual(t.seen.map(z=>z.name),["is_business_owner_v1","get_business_erp_customer_candidates_v1"]);});
test("statement exposes currency separated source totals and strips free text",async()=>{const t=build();const x=await t.read("customer_statement",{businessId:business,accountId:"1001",fromDate:"2026-09-01",toDate:"2026-09-29"});assert.equal(x.totals_by_currency[0].closing_balance,850);assert.equal(x.items[0].description,undefined);assert.match(x.precision_warning,/not yet guaranteed/);assert.equal(t.seen[1].name,"get_business_erp_customer_statement_v1");});
test("unknown or write tool never reaches RPC",async()=>{const t=build();await err(t.read("post_invoice",{businessId:business}),"unsupported_tool");assert.equal(t.seen.length,0);});
test("invalid business UUID never reaches RPC",async()=>{const t=build();await err(t.read("sync_status",{businessId:"demo-business-001"}),"invalid_business_id");assert.equal(t.seen.length,0);});
test("account name is not numeric ID",async()=>{const t=build();await err(t.read("customer_statement",{businessId:business,accountId:"Ali",fromDate:"2026-09-01",toDate:"2026-09-29"}),"account_id_required");assert.deepEqual(t.seen.map(z=>z.name),["is_business_owner_v1"]);});
test("date ranges are bounded to 31 days",async()=>{const t=build();await err(t.read("customer_statement",{businessId:business,accountId:"1001",fromDate:"2026-01-01",toDate:"2026-09-29"}),"invalid_date_range");assert.equal(t.seen.length,1);});
test("missing snapshot must not be reported as zero balance",async()=>{const t=build({statementStatus:"snapshot_unavailable"});await err(t.read("customer_statement",{businessId:business,accountId:"1001",fromDate:"2026-09-01",toDate:"2026-09-29"}),"source_snapshot_unavailable");});
test("permission RPC outage fails closed",async()=>{const t=build({fail:"is_business_owner_v1"});await err(t.read("sync_status",{businessId:business}),"source_unavailable");assert.equal(t.seen.length,1);});
test("each separate read revalidates owner grant",async()=>{const t=build();await t.read("sync_status",{businessId:business});await t.read("search_customer",{businessId:business,query:"Demo"});assert.equal(t.seen.filter(z=>z.name==="is_business_owner_v1").length,2);});
test("outgoing RPC uses caller bearer not a service-role credential",async()=>{const t=build();await t.read("sync_status",{businessId:business});for(const x of t.seen){assert.equal(x.opts.headers.authorization,"Bearer verified-fixture");assert.equal(x.opts.headers.apikey,"public-fixture");}});
