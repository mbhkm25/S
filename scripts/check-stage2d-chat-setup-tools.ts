// Operational contracts only: no browser, rendering, live model or production DB.
import assert from 'node:assert/strict';
// Shared core targets Deno; this Node-only contract test never calls the model.
// Describe the single environment API referenced by its default argument.
declare global { const Deno: { env: { get(name: string): string | undefined } }; }

import { ACTION_PREPARATION_TYPES, assertSetupLookup, isPersistedActionReview } from '../supabase/functions/_shared/sanad-action-contract.ts';
import { TOOLS, verifyAndRepair } from '../supabase/functions/_shared/sanad-agent-core.ts';
import { buildAgentPresentation } from '../supabase/functions/_shared/sanad-agent-presentation.ts';
import { describeSanadActionStatus } from '../src/features/assistant/sanadOperationalState.ts';
let cases=0;
for (const [tool, type] of Object.entries(ACTION_PREPARATION_TYPES)) {
  const output={id:'10000000-0000-4000-8000-000000000001',action_type:type,status:'review',version:1,review:{title:'مراجعة',summary:'اختبار',fields:[{label:'اسم',value:'اختبار'}],writes_to_erp:false}};
  const row={name:tool,args:{},output};
  assert.equal(isPersistedActionReview(tool,output),true); cases++;
  assert.equal(buildAgentPresentation([row]).cards[0]?.action_id,output.id); cases++;
  for (const invalid of [{error:'not_available'}, {...output,id:''}, {...output,action_type:'untrusted'}, {...output,version:0}, {...output,status:'failed'}, {...output,review:null}]) {
    assert.equal(buildAgentPresentation([{...row,output:invalid}]).cards.length,0); cases++;
  }
}
for (const [kind,lookup] of [['account','finance_get_accounts'],['category','finance_get_categories']]) {
  const tool='action_prepare_personal_'+kind;
  assert.throws(()=>assertSetupLookup(tool,[]),/current_lookup/); cases++;
  assert.throws(()=>assertSetupLookup(tool,[{name:lookup,output:{error:'failed'}}]),/current_lookup/); cases++;
  assert.doesNotThrow(()=>assertSetupLookup(tool,[{name:lookup,output:{items:[]}}])); cases++;
  const definition=TOOLS.find(x=>x.name===tool);
  assert.equal(definition?.parameters.additionalProperties,false); cases++;
  assert.equal(Object.hasOwn(definition!.parameters.properties,'opening_balance'),false); cases++;
}
assert.equal(describeSanadActionStatus('completed','personal_account_setup',{account_id:'actual-id'}).label,'أُضيف الحساب'); cases++;
assert.equal(describeSanadActionStatus('completed','personal_category_setup',{category_id:'actual-id'}).label,'أُضيف التصنيف'); cases++;
assert.equal(describeSanadActionStatus('completed','personal_account_setup',{}).tone,'warning'); cases++;
assert.equal(verifyAndRepair('تعذر الإعداد',[{name:'action_prepare_personal_account',args:{},output:{error:'failed'}}]).verification.action_draft_guard_applied,false); cases++;
console.log(`Chat setup: ${cases} tool/presentation contracts PASS; no rendered UI tests.`);
