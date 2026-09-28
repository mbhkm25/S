// Projects/relationships are server facts, not claims supplied by the browser or model.
type Json = Record<string, unknown>;
type Rpc = (name: string, args?: Json) => Promise<unknown>;
export type ProjectBoundary = {
  threadId: string | null; projectKind: 'personal' | 'business' | 'unscoped';
  businessId: string | null; businessName: string | null;
  threadRole: 'owner' | 'member' | 'viewer' | null;
  relationships: Array<'owner' | 'team' | 'customer'>;
};
const object = (v: unknown): Json => v && typeof v==='object' && !Array.isArray(v) ? v as Json : {};
const rows = (v: unknown): Json[] => Array.isArray(v) ? v.map(object) : [];
const uuid = (v: unknown): v is string => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function loadProjectBoundary(threadId: string | null, requestedBusinessId: string | null, rpc: Rpc): Promise<ProjectBoundary> {
  if(!threadId) {
    if(requestedBusinessId) throw new Error('verified_project_thread_required');
    return {threadId:null,projectKind:'unscoped',businessId:null,businessName:null,threadRole:null,relationships:[]};
  }
  const result=object(await rpc('get_my_sanad_agent_thread_v2',{p_thread_id:threadId,p_message_limit:1}));
  const thread=object(result.thread);
  if(thread.id!==threadId || thread.status!=='active' || !['owner','member','viewer'].includes(String(thread.my_role))) throw new Error('agent_thread_not_found');
  const businessId=uuid(thread.business_id) ? thread.business_id : null;
  if(requestedBusinessId && requestedBusinessId!==businessId) throw new Error('agent_project_context_mismatch');
  const projectKind=thread.project_kind==='business' && businessId ? 'business'
    : thread.project_kind==='personal' && thread.business_id===null ? 'personal' : 'unscoped';
  if(projectKind==='unscoped' && businessId) throw new Error('agent_project_context_mismatch');
  const boundary:ProjectBoundary={threadId,projectKind,businessId,businessName:null,threadRole:thread.my_role as ProjectBoundary['threadRole'],relationships:[]};
  if(projectKind!=='business') return boundary;
  // Never expose this broad account-center payload, invitation tokens, permissions or other businesses to the model.
  const contexts=object(await rpc('get_user_business_contexts',{}));
  const owned=rows(contexts.owned_businesses).find(b=>b.id===businessId);
  const member=rows(contexts.team_businesses).find(m=>m.status==='active' && object(m.business).id===businessId);
  const customer=rows(contexts.customer_businesses).find(c=>c.status==='active' && object(c.business).id===businessId);
  if(owned) boundary.relationships.push('owner');
  if(member) boundary.relationships.push('team');
  if(customer) boundary.relationships.push('customer');
  const name=(owned ?? object(member?.business ?? customer?.business)).name;
  boundary.businessName=typeof name==='string' ? name.slice(0,160) : null;
  return boundary;
}
export function permitsProjectTool(name: string, b: ProjectBoundary): boolean {
  if(b.threadRole==='viewer') return false;
  if(name==='sanad_search_knowledge') return true;
  if(!b.threadId || b.projectKind==='unscoped') return false;
  const personal=name.startsWith('finance_') || name.startsWith('action_prepare_personal_') ||
    ['action_list_personal_drafts','action_get_personal_draft','action_edit_personal_transaction','action_list_expense_drafts','action_get_expense_draft','action_edit_personal_expense'].includes(name);
  if(personal) return b.projectKind==='personal' && b.threadRole==='owner';
  if(b.projectKind!=='business' || !b.businessId) return false;
  if(['business_get_my_relationship','business_list_accessible'].includes(name)) return true;
  if(name==='action_prepare_commercial_document') return b.relationships.includes('owner') && b.threadRole==='owner';
  // This mirrors existing read RPC eligibility; each domain RPC still rechecks its own permissions.
  if(name.startsWith('business_') || name.startsWith('erp_')) return b.relationships.includes('owner') || b.relationships.includes('team');
  return false;
}
export function assertProjectTool(name: string, args: Json, b: ProjectBoundary): void {
  if(!permitsProjectTool(name,b)) throw new Error('tool_not_available_in_project_relationship');
  if(b.projectKind==='business' && name!=='sanad_search_knowledge' && !['business_get_my_relationship','business_list_accessible'].includes(name)) {
    if(args.business_id!==b.businessId) throw new Error('tool_business_context_mismatch');
  }
  if(['business_get_my_relationship','business_list_accessible'].includes(name) && Object.keys(args).length) throw new Error('unexpected_relationship_arguments');
}
export function relationshipSummary(b: ProjectBoundary): Json {
  return {source:'server_verified_relationship',business_id:b.businessId,business_name:b.businessName,
    relationship_roles:b.relationships,conversation_role:b.threadRole,
    can_prepare_commercial_draft:permitsProjectTool('action_prepare_commercial_document',b),
    customer_self_service_financial_tools:false,erp_write_supported:false,
    note:'Conversation role is separate from business ownership. Domain permissions are checked for each operation; no manager authority is inferred from job title.'};
}
export function mayUsePersonalMemory(b: ProjectBoundary): boolean { return b.projectKind==='personal' && b.threadRole==='owner'; }
