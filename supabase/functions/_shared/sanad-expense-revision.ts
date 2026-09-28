// Chat and transcribed voice are adapters to the SAME deployed v2 expense editor.
type Json = Record<string, unknown>;
type Output = { name: string; output: unknown };
export type RevisionTurnState = { attempted: boolean };
export type RevisionContext = { threadId: string | null; priorToolOutputs: Output[]; revision: RevisionTurnState };
export type RevisionGateway = {
  rpc: (name: string, params: Json) => Promise<unknown>;
  list: (threadId: string) => Promise<Json[]>;
  read: (actionId: string, threadId: string) => Promise<unknown>;
};
const object = (v: unknown): Json => v && typeof v === 'object' && !Array.isArray(v) ? v as Json : {};
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const fieldsFor = (variant: unknown) => variant === 'transfer'
  ? ['transaction_type','amount','currency','source_account_id','destination_account_id','description','transaction_at']
  : ['transaction_type','amount','currency','account_id','category_id','description','transaction_at'];
const personalTools = ['action_list_personal_drafts','action_get_personal_draft','action_edit_personal_transaction'];
export const EXPENSE_REVISION_TOOLS = [...personalTools,'action_list_expense_drafts','action_get_expense_draft','action_edit_personal_expense'];

export function assertExpenseRevisionBatch(names: string[]): void {
  if (names.some(name => ['action_edit_personal_expense','action_edit_personal_transaction'].includes(name)) && names.some(name => name.startsWith('action_prepare_'))) {
    throw new Error('expense_revision_cannot_mix_creation_in_batch');
  }
}

function editable(raw: unknown, threadId: string, variants: string[]): Json {
  const a=object(raw), p=object(a.payload);
  if (!uuid(a.id) || a.thread_id!==threadId || a.business_id!==null || a.action_type!=='personal_transaction'
      || !variants.includes(String(p.transaction_type)) || a.status!=='review' || !Number.isInteger(a.version) || Number(a.version)<1) {
    throw new Error('expense_revision_requires_current_thread_review');
  }
  if(typeof a.amount_text!=='string' || !/^\d+(?:\.\d+)?$/.test(a.amount_text)) throw new Error('expense_revision_exact_amount_unavailable');
  return {...a,payload:{...p,amount:a.amount_text}};
}
function resolved(rows: Output[], tool: string, id: unknown): boolean {
  return rows.some(row => {
    if(row.name!==tool) return false;
    const root=object(row.output);
    if(root.error) return false;
    const items=Array.isArray(row.output) ? row.output : Array.isArray(root.items) ? root.items : [];
    return items.some(item=>object(item).id===id);
  });
}
export function buildExpenseRevisionPayload(action: Json, patchValue: unknown, prior: Output[]): Json {
  const patch=object(patchValue), keys=Object.keys(patch), original=object(action.payload);
  const fields=fieldsFor(original.transaction_type);
  if (!keys.length || patch!==patchValue || keys.some(k=>!fields.includes(k) || k==='transaction_type')) throw new Error('invalid_expense_revision_patch');
  const payload: Json=Object.fromEntries(fields.map(k=>[k,original[k] ?? null]));
  for (const k of keys) payload[k]=patch[k];
  if ('amount' in patch) {
    if (typeof patch.amount!=='string') throw new Error('expense_revision_amount_must_be_decimal_text');
    const amount=patch.amount.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace('٫','.');
    if (!/^\d{1,14}(?:\.\d{1,6})?$/.test(amount) || !/[1-9]/.test(amount)) throw new Error('invalid_expense_revision_amount');
    payload.amount=amount;
  }
  if ('currency' in patch) {
    if(typeof patch.currency!=='string' || !/^[A-Z]{3}$/.test(patch.currency)) throw new Error('invalid_expense_revision_currency');
    if(patch.currency!==original.currency && !(original.transaction_type==='transfer' ? 'source_account_id' in patch && 'destination_account_id' in patch : 'account_id' in patch)) throw new Error('expense_revision_currency_requires_account');
  }
  for (const key of ['account_id','source_account_id','destination_account_id']) {
    if (key in patch && (!uuid(patch[key]) || !resolved(prior,'finance_get_accounts',patch[key]))) throw new Error('expense_revision_account_not_resolved');
  }
  if (original.transaction_type==='transfer' && payload.source_account_id===payload.destination_account_id) throw new Error('valid_transfer_accounts_required');
  if ('category_id' in patch && patch.category_id!==null && (!uuid(patch.category_id) || !resolved(prior,'finance_get_categories',patch.category_id))) throw new Error('expense_revision_category_not_resolved');
  if ('description' in patch && patch.description!==null && (typeof patch.description!=='string' || patch.description.length>500)) throw new Error('invalid_expense_revision_description');
  if ('transaction_at' in patch && (typeof patch.transaction_at!=='string' || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(patch.transaction_at) || !Number.isFinite(Date.parse(patch.transaction_at)))) throw new Error('invalid_expense_revision_date');
  return payload;
}

export async function executeExpenseRevisionTool(name: string, args: Json, context: RevisionContext, gateway: RevisionGateway): Promise<unknown> {
  if (!EXPENSE_REVISION_TOOLS.includes(name)) throw new Error('unsupported_expense_revision_tool');
  if (!context.threadId) throw new Error('action_thread_required');
  const threadId=context.threadId;
  const generic=personalTools.includes(name);
  const variants=generic ? ['expense','income','transfer'] : ['expense'];
  const isEdit=['action_edit_personal_expense','action_edit_personal_transaction'].includes(name);
  const isList=['action_list_expense_drafts','action_list_personal_drafts'].includes(name);
  const isRead=['action_get_expense_draft','action_get_personal_draft'].includes(name);
  if(isEdit) {
    if(context.revision.attempted) throw new Error('expense_revision_already_attempted_this_turn');
    context.revision.attempted=true; // Shared across parallel calls; never automatically retry a mutation.
  }
  const capabilities=object(await gateway.rpc('get_my_sanad_action_capabilities_v1',{p_thread_id:threadId}));
  if(capabilities.thread_id!==threadId || capabilities.project_kind!=='personal' || capabilities.business_id!==null
      || capabilities.source!=='server_authorized' || !Array.isArray(capabilities.actions)
      || !capabilities.actions.some(item=>variants.some(v=>object(item).id==='personal_'+v) && object(item).form_edit_supported===true)) throw new Error('expense_revision_not_available_in_project');
  if(isList) {
    if(Object.keys(args).length) throw new Error('unexpected_expense_list_arguments');
    const rows=await gateway.list(threadId);
    return {items:rows.slice(0,20).map(row=>({id:row.id,version:row.version,variant:object(row.payload).transaction_type,summary:object(row.review).summary,amount:typeof row.amount_text==='string' ? row.amount_text : null,currency:object(row.review).currency})),has_more:rows.length>20};
  }
  const allowed=isRead ? ['action_id'] : ['action_id','expected_version','patch'];
  if(Object.keys(args).some(k=>!allowed.includes(k)) || !uuid(args.action_id)) throw new Error('invalid_expense_revision_arguments');
  const current=editable(await gateway.read(args.action_id,threadId),threadId,variants);
  if (!capabilities.actions.some(item=>object(item).id==='personal_'+object(current.payload).transaction_type && object(item).form_edit_supported===true)) throw new Error('expense_revision_variant_not_available');
  if(isRead) return {...current,payload:Object.fromEntries(fieldsFor(object(current.payload).transaction_type).map(k=>[k,object(current.payload)[k]??null])),user_id:undefined,attachment_ids:undefined};
  if(!Number.isInteger(args.expected_version) || Number(args.expected_version)<1) throw new Error('valid_expected_version_required');
  const observed=context.priorToolOutputs.some(row=>{
    const a=object(row.output);
    return row.name===(generic ? 'action_get_personal_draft' : 'action_get_expense_draft') && !a.error && a.id===args.action_id && a.thread_id===threadId
      && a.status==='review' && a.version===args.expected_version;
  });
  if(!observed) throw new Error('expense_revision_requires_read_in_current_turn');
  if(current.version!==args.expected_version) throw new Error('agent_action_version_conflict');
  if(context.priorToolOutputs.some(row=>row.name.startsWith('action_prepare_') && uuid(object(row.output).id))) throw new Error('expense_revision_cannot_follow_creation_in_same_turn');
  const payload=buildExpenseRevisionPayload(current,args.patch,context.priorToolOutputs);
  return await gateway.rpc('update_my_sanad_agent_action_draft_v2',{p_action_id:current.id,p_expected_version:args.expected_version,p_payload:payload});
}
