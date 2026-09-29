// ISOLATED TEST HARNESS ONLY. No real auth, DB, ERP or Supabase integration.
// Supply trusted identity/grants via external dependencies in future reviewed production code.
import {evaluateMockReadPolicy} from "./policy.mjs";
const map=Object.freeze({
 sanad_secure_list_businesses:["list_businesses",[]],
 sanad_secure_get_sync_status:["get_sync_status",["business_id"]],
 sanad_secure_search_customers:["search_customers",["business_id","query"]],
 sanad_secure_get_customer_statement:["get_customer_statement",["business_id","account_id"]]
});
const output=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const reject=(code,reason)=>output({error:reason},code);
export function createOfflineHandler({verifyIdentity,permissionsFor,entitlementFor,read}) {
 if([verifyIdentity,permissionsFor,entitlementFor,read].some(x=>typeof x!=="function"))throw Error("missing_trusted_dependencies");
 return async function handle(request) {
  const bearer=request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if(!bearer)return reject(401,"authentication_required");
  let identity;
  try{identity=await verifyIdentity(bearer)}catch{return reject(401,"authentication_required")}
  if(!identity?.verified||!identity.userId)return reject(401,"authentication_required");
  if(request.method!=="POST"||new URL(request.url).pathname!=="/private-test/execute")return reject(404,"not_found");
  let body;
  try{body=await request.json()}catch{return reject(400,"invalid_json")}
  const pair=map[body?.tool];
  if(!pair)return reject(400,"unsupported_tool");
  const [tool,required]=pair,args=body?.arguments;
  if(!args||typeof args!=="object"||Array.isArray(args)||required.some(k=>typeof args[k]!=="string"||!args[k].trim()))return reject(400,"invalid_arguments");
  if(Object.keys(args).some(k=>!required.includes(k)))return reject(400,"unexpected_argument");
  if(JSON.stringify(args).length>512)return reject(413,"request_too_large");
  let grants,plan;
  try{[grants,plan]=await Promise.all([permissionsFor(identity.userId),entitlementFor(identity.userId)])}
  catch{return reject(503,"authorization_unavailable")}
  const principal={...grants,userId:identity.userId,verified:true,consent:plan?.consent===true};
  const decision=evaluateMockReadPolicy({principal,tool,businessId:args.business_id,accountId:args.account_id,entitlement:{active:plan?.active===true}});
  if(!decision.allow)return reject(decision.reason==="authentication_required"?401:decision.reason==="subscription_or_trial_inactive"?402:decision.reason==="valid_account_id_required"?400:403,decision.reason);
  try{
   const result=await read(tool,args,{userId:identity.userId,businessId:decision.businessId,allowedBusinessIds:decision.businessIds});
   return output({demonstration_only:true,result});
  }catch{return reject(503,"read_unavailable")}
 };
}
