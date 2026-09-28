import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProjectBoundary, permitsProjectTool, assertProjectTool, relationshipSummary, mayUsePersonalMemory } from '../supabase/functions/_shared/sanad-agent-project-boundary';
import { TOOLS } from '../supabase/functions/_shared/sanad-agent-core';
const id='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', thread='thread';
let checks=0;
let saved:any={id:thread,status:'active',project_kind:'business',business_id:id,my_role:'owner'};
let contexts:any={owned_businesses:[{id,name:'Current'},{id:other,name:'OTHER_PRIVATE'}],pending_invitations:[{token:'SECRET'}]};
let calls:string[]=[];
const rpc=async(name:string,args?:any)=>{calls.push(name);if(name==='get_my_sanad_agent_thread_v2'){assert.equal(args.p_thread_id,thread);assert.equal(args.p_message_limit,1);return {thread:saved};}if(name==='get_user_business_contexts')return contexts;throw Error('unexpected_rpc');};
const load=()=>loadProjectBoundary(thread,null,rpc);
const equal=(actual:unknown,expected:unknown)=>{assert.deepEqual(actual,expected);checks++;};
const reject=async(fn:()=>Promise<unknown>,message:RegExp)=>{await assert.rejects(fn,message);checks++;};
let b=await load();equal(b.relationships,['owner']);equal(b.businessId,id);
equal(JSON.stringify(relationshipSummary(b)).includes('SECRET'),false);equal(JSON.stringify(b).includes('OTHER_PRIVATE'),false);
await reject(()=>loadProjectBoundary(thread,other,rpc),/context_mismatch/);
await reject(()=>loadProjectBoundary(null,id,rpc),/verified_project_thread_required/);
for(const delta of [{id:'wrong'},{status:'archived'},{my_role:'admin'}]) {const before=saved;saved={...saved,...delta};await reject(load,/thread_not_found/);saved=before;}
for(const tool of TOOLS) {
 if(tool.name.startsWith('finance_')||tool.name.startsWith('action_prepare_personal_')||tool.name.includes('personal_draft')||tool.name==='action_edit_personal_transaction') equal(permitsProjectTool(tool.name,b),false);
}
equal(mayUsePersonalMemory(b),false);
assertProjectTool('business_get_dashboard',{business_id:id},b);checks++;
for(const args of [{},{business_id:other}]){assert.throws(()=>assertProjectTool('business_get_dashboard',args,b),/business_context_mismatch/);checks++;}
assert.throws(()=>assertProjectTool('business_get_my_relationship',{business_id:id},b),/unexpected_relationship_arguments/);checks++;
equal(permitsProjectTool('action_prepare_commercial_document',b),true);
saved.my_role='member';b=await load();equal(b.relationships,['owner']);equal(permitsProjectTool('action_prepare_commercial_document',b),false);
saved.my_role='owner';contexts={team_businesses:[{status:'active',job_title:'Owner',permissions:{all:true},business:{id,name:'Current'}}]};b=await load();equal(b.relationships,['team']);equal(permitsProjectTool('erp_get_customer_statement',b),true);equal(permitsProjectTool('action_prepare_commercial_document',b),false);
contexts.team_businesses[0].status='removed';b=await load();equal(b.relationships,[]);equal(permitsProjectTool('erp_get_customer_statement',b),false);
contexts={customer_businesses:[{status:'active',business:{id,name:'Current'}}]};b=await load();equal(b.relationships,['customer']);equal(permitsProjectTool('business_get_my_relationship',b),true);equal(permitsProjectTool('erp_search_customers',b),false);equal(permitsProjectTool('business_get_dashboard',b),false);
contexts.customer_businesses[0].status='pending';equal((await load()).relationships,[]);
contexts={owned_businesses:[{id}],team_businesses:[{status:'active',business:{id}}],customer_businesses:[{status:'active',business:{id}}]};equal((await load()).relationships,['owner','team','customer']);
saved.my_role='viewer';b=await load();for(const tool of TOOLS)equal(permitsProjectTool(tool.name,b),false);
saved={...saved,my_role:'owner',project_kind:'personal',business_id:null};calls=[];b=await load();equal(calls,['get_my_sanad_agent_thread_v2']);equal(mayUsePersonalMemory(b),true);equal(permitsProjectTool('finance_get_accounts',b),true);equal(permitsProjectTool('action_prepare_personal_account',b),true);equal(permitsProjectTool('business_get_dashboard',b),false);
saved.my_role='member';b=await load();equal(mayUsePersonalMemory(b),false);equal(permitsProjectTool('finance_get_accounts',b),false);
b=await loadProjectBoundary(null,null,rpc);equal(permitsProjectTool('finance_get_accounts',b),false);equal(permitsProjectTool('sanad_search_knowledge',b),true);equal(mayUsePersonalMemory(b),false);
await reject(()=>loadProjectBoundary(thread,null,async()=>{throw Error('permission_denied');}),/permission_denied/);
const source=readFileSync('supabase/functions/sanad-ai-agent-v1/index.ts','utf8');
equal(source.match(/TOOLS.filter\(tool => permitsProjectTool\(tool.name, cloud.boundary\)\)/g)?.length,4);
equal(source.match(/boundary: cloud.boundary/g)?.length,2);
assert.match(source,/const fresh = await loadProjectBoundary/);checks++;
assert.match(source,/assertProjectTool\(name,args,fresh\)/);checks++;
assert.match(source,/memories: mayUsePersonalMemory\(boundary\) \? memories : \[\]/);checks++;
assert.match(source,/memory_enabled: mayUsePersonalMemory\(boundary\) &&/);checks++;
console.log(`PASS ${checks} business project boundary checks (isolated RPC fixtures; no live financial calls).`);
