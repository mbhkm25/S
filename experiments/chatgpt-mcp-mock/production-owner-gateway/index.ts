// SANAD ChatGPT real-production gateway v1: authenticated OWNER METADATA ONLY.
// No financial ERP reads and no anonymous data. Separate from deny-all pilot.
const CLIENT_ID = "ba4d0743-a5f9-434c-bf66-f5561dd15f67";
const J = {"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
const respond=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:J});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async (req)=>{
  // Defense in depth: deploy with verify_jwt:true; revalidate identity at Supabase Auth.
  if(req.method!=="POST" || new URL(req.url).pathname!=="/sanad-chatgpt-prod-v1/execute")return respond({error:"not_found"},404);
  const auth=req.headers.get("authorization")||"";
  if(!/^Bearer [A-Za-z0-9_.-]{30,4096}$/.test(auth))return respond({error:"authentication_required"},401);
  const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY");
  if(!base||!key)return respond({error:"service_not_configured"},503);
  const cl=req.headers.get("content-length");
  if(cl && (!/^\d+$/.test(cl)||Number(cl)>1024))return respond({error:"request_too_large"},413);
  const raw=await req.text();if(raw.length>1024)return respond({error:"request_too_large"},413);
  let input;try{input=JSON.parse(raw)}catch{return respond({error:"invalid_json"},400)}
  if(!input||Array.isArray(input)||typeof input!=="object")return respond({error:"invalid_json"},400);
  if(input.tool!=="sanad_secure_list_businesses"||!input.arguments||Array.isArray(input.arguments)||typeof input.arguments!=="object"||Object.keys(input.arguments).length!==0){
    return respond({error:"feature_not_activated"},403);
  }
  const headers={"authorization":auth,"apikey":key,"accept":"application/json"};
  let user;
  try{
    const identity=await fetch(base+"/auth/v1/user",{headers,redirect:"manual",signal:AbortSignal.timeout(4000)});
    if(!identity.ok)return respond({error:"authentication_required"},401);
    user=await identity.json();
  }catch{return respond({error:"authentication_unavailable"},503)}
  if(!user||typeof user.id!=="string"||!UUID.test(user.id))return respond({error:"authentication_required"},401);
  // SECDEF RPC binds grants and owner to auth.uid() obtained from this same verified bearer.
  let source;
  try{
    source=await fetch(base+"/rest/v1/rpc/sanad_chatgpt_list_permitted_businesses_v1",{
      method:"POST",headers:{...headers,"content-type":"application/json"},
      body:JSON.stringify({p_oauth_client_id:CLIENT_ID}),redirect:"manual",signal:AbortSignal.timeout(5000)});
  }catch{return respond({error:"source_unavailable"},503)}
  if(!source.ok)return respond({error:"source_access_denied"},403);
  let items;
  try{items=await source.json()}catch{return respond({error:"invalid_source_response"},503)}
  if(!Array.isArray(items))return respond({error:"invalid_source_response"},503);
  const safe=items.slice(0,10).filter(x=>x&&UUID.test(x.business_id)&&typeof x.name==="string").map(x=>({business_id:x.business_id,name:x.name}));
  if(!safe.length)return respond({error:"business_access_not_granted"},403);
  return respond({source:"SANAD production",read_only:true,tool:"sanad_secure_list_businesses",businesses:safe});
});