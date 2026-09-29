// FUTURE PILOT ADAPTER — NOT WIRED OR DEPLOYED.
// Owner-only even though several existing ERP RPCs permit all active members.
// The caller MUST pass the *verified* bearer from Supabase Auth; no service role.
export class PilotReadError extends Error {
 constructor(code){super(code);this.name="PilotReadError";this.code=code}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateDate(s){
 if(typeof s!=="string"||!/^\d{4}-\d\d-\d\d$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s+"T00:00:00Z").toISOString().slice(0,10)!==s)throw new PilotReadError("invalid_date");
 return s;
}
function validRange(from,to){
 validateDate(from);validateDate(to);
 const diff=(Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000;
 if(diff<0||diff>31)throw new PilotReadError("invalid_date_range");
}
export function createOwnerOnlyReader({baseUrl,publicKey,bearer,fetchImpl=fetch}){
 if(typeof baseUrl!=="string"||!/^https:\/\/[a-z0-9.-]+\/??$/i.test(baseUrl)||typeof publicKey!=="string"||!publicKey||typeof bearer!=="string"||!bearer)throw new PilotReadError("missing_verified_configuration");
 const target=baseUrl.replace(/\/$/,"");
 async function rpc(name,payload){
  const response=await fetchImpl(target+"/rest/v1/rpc/"+name,{
   method:"POST",
   headers:{"apikey":publicKey,"authorization":"Bearer "+bearer,"content-type":"application/json","accept":"application/json"},
   body:JSON.stringify(payload),
   signal:AbortSignal.timeout(4000)
  });
  if(!response.ok)throw new PilotReadError(response.status===401?"authentication_required":response.status===403?"source_access_denied":"source_unavailable");
  try{return await response.json()}catch{throw new PilotReadError("invalid_source_response")}
 }
 return async function read(tool,{businessId,query,accountId,fromDate,toDate}={}){
  if(typeof businessId!=="string"||!uuid.test(businessId))throw new PilotReadError("invalid_business_id");
  if(!["sync_status","search_customer","customer_statement"].includes(tool))throw new PilotReadError("unsupported_tool");
  // A second server-side owner check is mandatory because canonical financial
  // RPCs presently permit ALL active team members, not just selected owners.
  const owner=await rpc("is_business_owner_v1",{p_business_id:businessId});
  if(owner!==true)throw new PilotReadError("owner_required");
  if(tool==="sync_status"){
   const raw=await rpc("get_business_accounting_connections_v1",{p_business_id:businessId});
   const items=Array.isArray(raw?.items)?raw.items:[];
   return{source:"get_business_accounting_connections_v1",business_id:businessId,items:items.filter(x=>x.business_id===businessId).map(x=>({
    connection_mode:x.connection_mode,status:x.status,last_sync_at:x.last_sync_at,last_heartbeat_at:x.last_heartbeat_at
   }))};
  }
  if(tool==="search_customer"){
   if(typeof query!=="string"||query.trim().length<2||query.trim().length>60)throw new PilotReadError("invalid_customer_query");
   const raw=await rpc("get_business_erp_customer_candidates_v1",{p_business_id:businessId,p_query:query.trim(),p_limit:10});
   if(raw?.status==="snapshot_unavailable")throw new PilotReadError("source_snapshot_unavailable");
   return{source:"get_business_erp_customer_candidates_v1",snapshot_public_id:raw?.snapshot_public_id??null,status:raw?.status,
     candidates:(Array.isArray(raw?.items)?raw.items:[]).slice(0,10).map(x=>({customer_name:x.customer_name,account_id:x.account_id,
      resolution_status:x.resolution_status,account_count:x.account_count}))
   };
  }
  if(!/^[0-9]{1,15}$/.test(String(accountId??"")))throw new PilotReadError("account_id_required");
  validRange(fromDate,toDate);
  const raw=await rpc("get_business_erp_customer_statement_v1",{
   p_business_id:businessId,p_account_id:accountId,p_from_date:fromDate,p_to_date:toDate
  });
  if(raw?.status==="snapshot_unavailable"||raw?.status!=="ok")throw new PilotReadError("source_snapshot_unavailable");
  if(!raw?.snapshot_public_id)throw new PilotReadError("source_snapshot_unavailable");
  const items=Array.isArray(raw.items)?raw.items:[];
  return{
   source:"get_business_erp_customer_statement_v1",
   snapshot_public_id:raw.snapshot_public_id,
   status:raw.status,
   account:{account_id:raw.account?.account_id,account_name:raw.account?.account_name},
   from_date:fromDate,to_date:toDate,
   opening_by_currency:raw.opening_by_currency,
   totals_by_currency:raw.totals_by_currency,
   sign_convention:raw.sign_convention,
   items:items.slice(0,30).map(x=>({date:x.date,doc_number:x.doc_number,currency_id:x.currency_id,
    currency_name:x.currency_name,debit:x.debit,credit:x.credit,running_balance:x.running_balance})),
   result_limit:30,has_more:items.length>30,
   precision_warning:"Amounts are parsed from existing JSON numeric fields. Exact original ERP decimal precision is not yet guaranteed."
  };
 };
}
