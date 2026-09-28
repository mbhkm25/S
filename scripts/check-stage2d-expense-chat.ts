// Operational adapter tests only: no browser, model calls or production writes.
import assert from 'node:assert/strict';
import { assertExpenseRevisionBatch, buildExpenseRevisionPayload, executeExpenseRevisionTool, type RevisionContext, type RevisionGateway } from '../supabase/functions/_shared/sanad-expense-revision.ts';
import { buildAgentPresentation } from '../supabase/functions/_shared/sanad-agent-presentation.ts';
import { invalidateSanadActionReviews, subscribeSanadActionReviews } from '../src/features/assistant/actionReviewInvalidation.ts';
const id='10000000-0000-4000-8000-000000000001',thread='20000000-0000-4000-8000-000000000001',account='30000000-0000-4000-8000-000000000001',category='40000000-0000-4000-8000-000000000001';
const base={id,thread_id:thread,business_id:null,action_type:'personal_transaction',status:'review',version:2,amount_text:'99999999999998.123456',payload:{transaction_type:'expense',amount:99999999999998.12,currency:'YER',account_id:account,category_id:category,description:'وقود',transaction_at:'2026-09-27T10:30:00+03:00',metadata:{keep:true}},review:{title:'مراجعة',fields:[],amount:2000}};
const cap={thread_id:thread,project_kind:'personal',business_id:null,source:'server_authorized',actions:[{id:'personal_expense',form_edit_supported:true}]};
let current:any=structuredClone(base), capabilities:any=structuredClone(cap), list:any[]=[base],calls:any[]=[], checks=0;
const gateway:RevisionGateway={
  rpc:async(name,params)=>{
    if(name==='get_my_sanad_action_capabilities_v1') return capabilities;
    assert.equal(name,'update_my_sanad_agent_action_draft_v2','Only canonical draft update may mutate');
    calls.push(params);
    return {...current,version:3,payload:params.p_payload};
  },read:async()=>current,list:async()=>list,
};
const context=():RevisionContext=>({threadId:thread,priorToolOutputs:[],revision:{attempted:false}});
const read=async(ctx:RevisionContext)=>{
  const output=await executeExpenseRevisionTool('action_get_expense_draft',{action_id:id},ctx,gateway);
  ctx.priorToolOutputs.push({name:'action_get_expense_draft',output}); return output as any;
};
const edit=(ctx:RevisionContext,patch:any={description:'وصف جديد'},version=2)=>executeExpenseRevisionTool('action_edit_personal_expense',{action_id:id,expected_version:version,patch},ctx,gateway);
const rejects=async(fn:()=>Promise<unknown>,pattern:RegExp)=>{await assert.rejects(fn,pattern);checks++;};
let ctx=context();const observed=await read(ctx);
assert.equal(observed.payload.amount,base.amount_text);checks++;
assert.equal(observed.payload.metadata,undefined);checks++;
const updated:any=await edit(ctx);
assert.equal(updated.id,id);assert.equal(calls[0].p_expected_version,2);assert.equal(calls[0].p_payload.amount,base.amount_text);assert.equal(calls[0].p_payload.transaction_at,base.payload.transaction_at);checks+=4;
assert.deepEqual(Object.keys(calls[0].p_payload).sort(),['transaction_type','amount','currency','account_id','category_id','description','transaction_at'].sort());checks++;
assert.equal(buildAgentPresentation([{name:'action_edit_personal_expense',args:{},output:updated}]).cards[0]?.action_id,id);checks++;
await rejects(()=>edit(ctx),/already_attempted/);
await rejects(()=>edit(context()),/read_in_current_turn/);
ctx=context();await read(ctx);current={...base,version:3};await rejects(()=>edit(ctx),/version_conflict/);current=structuredClone(base);
for(const delta of [{thread_id:'other'}, {status:'completed'}, {status:'cancelled'}, {business_id:account}, {action_type:'personal_account_setup'}, {payload:{...base.payload,transaction_type:'income'}},{amount_text:undefined}]) {
  current={...base,...delta};await rejects(()=>read(context()),/current_thread_review|exact_amount_unavailable/);
} current=structuredClone(base);
for(const delta of [{project_kind:'business'}, {thread_id:'other'}, {business_id:account}, {source:'model'}, {actions:[]}]) {
 capabilities={...cap,...delta};await rejects(()=>read(context()),/not_available/);
}capabilities=structuredClone(cap);
for(const patch of [{},null,[],{user_id:id},{metadata:{}},{transaction_type:'income'},{opening_balance:1},{amount:3},{amount:'1e3'},{amount:'0'},{amount:'-1'},{amount:'1,000'},{amount:'0.0000001'},{currency:'SAR'},{account_id:account},{category_id:category},{description:'x'.repeat(501)},{transaction_at:'2026-09-27'},{transaction_at:null}]){
 ctx=context();await read(ctx);await rejects(()=>edit(ctx,patch),/invalid_|must_be_decimal|requires_account|not_resolved/);
}
ctx=context();await read(ctx);const arabic:any=await edit(ctx,{amount:'٣٠٠٠٫١٢٣٤٥٦'});assert.equal(arabic.payload.amount,'3000.123456');checks++;
ctx=context();await read(ctx);const cleared:any=await edit(ctx,{category_id:null,description:null});assert.equal(cleared.payload.category_id,null);assert.equal(cleared.payload.description,null);checks+=2;
ctx=context();await read(ctx);ctx.priorToolOutputs.push({name:'finance_get_accounts',output:[{id:account}]},{name:'finance_get_categories',output:{items:[{id:category}]}});
await edit(ctx,{account_id:account,category_id:category,currency:'YER'});checks++;
ctx=context();await read(ctx);ctx.priorToolOutputs.push({name:'finance_get_accounts',output:{error:'failure',items:[{id:account}]}});await rejects(()=>edit(ctx,{account_id:account}),/not_resolved/);
ctx=context();await read(ctx);ctx.priorToolOutputs.push({name:'action_prepare_personal_transaction',output:{id}});await rejects(()=>edit(ctx),/cannot_follow_creation/);
// Same-turn concurrent attempts share state; exactly one RPC mutation is permitted.
ctx=context();await read(ctx);const before=calls.length;
const race=await Promise.allSettled([edit(ctx),edit(ctx)]);
assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(calls.length,before+1);checks+=2;
const uncertain:RevisionGateway={...gateway,rpc:async(name,params)=>{if(name==='get_my_sanad_action_capabilities_v1')return cap;throw new Error('response_lost');}};
ctx=context();await read(ctx);
await rejects(()=>executeExpenseRevisionTool('action_edit_personal_expense',{action_id:id,expected_version:2,patch:{amount:'20'}},ctx,uncertain),/response_lost/);
await rejects(()=>edit(ctx),/already_attempted/);
list=Array.from({length:21},()=>base);const listed:any=await executeExpenseRevisionTool('action_list_expense_drafts',{},context(),gateway);assert.equal(listed.items.length,20);assert.equal(listed.has_more,true);checks+=2;
for(const version of [null,0,1.5]) {ctx=context();await read(ctx);await rejects(()=>edit(ctx,{amount:'2'},version as any),/valid_expected_version/);}
ctx=context();await read(ctx);const noAuthGateway:RevisionGateway={...gateway,read:async()=>{throw new Error('permission_denied');}};
await rejects(()=>executeExpenseRevisionTool('action_get_expense_draft',{action_id:id},ctx,noAuthGateway),/permission_denied/);
let invalidations=0;const off=subscribeSanadActionReviews(()=>invalidations++);invalidateSanadActionReviews();off();invalidateSanadActionReviews();assert.equal(invalidations,1);checks++;
for (const names of [['action_prepare_personal_transaction','action_edit_personal_expense'],['action_edit_personal_expense','action_prepare_personal_account']]) {
  assert.throws(()=>assertExpenseRevisionBatch(names),/cannot_mix_creation/);checks++;
}
assertExpenseRevisionBatch(['action_get_expense_draft','finance_get_accounts']);checks++;
for(const variant of ['income','transfer']) {
 capabilities={...cap,actions:[{id:'personal_'+variant,form_edit_supported:true}]};
 current={...structuredClone(base),payload:variant==='income' ? {...base.payload,transaction_type:'income'} : {transaction_type:'transfer',amount:20,currency:'YER',source_account_id:account,destination_account_id:category,description:'تحويل',transaction_at:base.payload.transaction_at}};
 ctx=context();
 const observed:any=await executeExpenseRevisionTool('action_get_personal_draft',{action_id:id},ctx,gateway);
 ctx.priorToolOutputs.push({name:'action_get_personal_draft',output:observed});
 const result:any=await executeExpenseRevisionTool('action_edit_personal_transaction',{action_id:id,expected_version:2,patch:{description:'جديد'}},ctx,gateway);
 assert.equal(result.payload.transaction_type,variant);assert.equal(result.payload.amount,base.amount_text);checks+=2;
 assert.deepEqual(Object.keys(result.payload).sort(),(variant==='transfer'?['transaction_type','amount','currency','source_account_id','destination_account_id','description','transaction_at']:['transaction_type','amount','currency','account_id','category_id','description','transaction_at']).sort());checks++;
 for(const patch of variant==='transfer' ? [{category_id:null},{source_account_id:category},{destination_account_id:account}] : [{source_account_id:category},{transaction_type:'expense'}]) {
   ctx=context();const row=await executeExpenseRevisionTool('action_get_personal_draft',{action_id:id},ctx,gateway);ctx.priorToolOutputs.push({name:'action_get_personal_draft',output:row});
   await rejects(()=>executeExpenseRevisionTool('action_edit_personal_transaction',{action_id:id,expected_version:2,patch},ctx,gateway),/invalid_|not_resolved|transfer_accounts/);
 }
 capabilities=structuredClone(cap);
 await rejects(()=>executeExpenseRevisionTool('action_get_personal_draft',{action_id:id},context(),gateway),/variant_not_available/);
 await rejects(()=>read(context()),/requires_current_thread_review/);
}
assert.throws(()=>assertExpenseRevisionBatch(['action_prepare_personal_account','action_edit_personal_transaction']),/cannot_mix/);checks++;

console.log(`Expense chat revision: ${checks} operational cases PASS; no rendered UI/model/financial execution.`);
