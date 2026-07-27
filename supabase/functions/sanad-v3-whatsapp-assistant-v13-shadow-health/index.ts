import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const SB=Deno.env.get("SUPABASE_URL")!,KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,IK=Deno.env.get("SANAD_INTERNAL_API_KEY")!;
const SHADOW=`${SB}/functions/v1/sanad-v3-whatsapp-assistant-v13-shadow`;
const CANDIDATE="sanad-assistant-v15-contextual-engine-candidate";
const ENGINE="sanad-conversation-engine-v3-contextual";
function json(x:unknown,s=200){return new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json"}})}
async function rest(path:string){const r=await fetch(`${SB}/rest/v1/${path}`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}});const t=await r.text();if(!r.ok)throw new Error(`rest_${r.status}:${t.slice(0,500)}`);return t?JSON.parse(t):null}
Deno.serve(async req=>{try{
 const limit=Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")||30),1),30);
 const rows=await rest(`sanad_assistant_messages?direction=eq.inbound&body_text=not.is.null&order=created_at.desc&limit=${limit}&select=id`);
 const ids=(rows||[]).map((x:any)=>x.id);
 const started=Date.now();
 const r=await fetch(SHADOW,{method:"POST",headers:{"content-type":"application/json","x-sanad-internal-key":IK},body:JSON.stringify({message_ids:ids})});
 const b=await r.json();
 const results=Array.isArray(b?.results)?b.results:[];
 const ok=results.filter((x:any)=>x.ok).map((x:any)=>x.comparison);
 const rate=(key:string)=>ok.length?Number((ok.filter((x:any)=>x?.[key]).length/ok.length*100).toFixed(2)):0;
 const avg=ok.length?Number((ok.reduce((s:number,x:any)=>s+Number(x?.response_similarity||0),0)/ok.length).toFixed(3)):0;
 const lat=ok.map((x:any)=>Number(x?.candidate_latency_ms||0)).sort((a:number,b:number)=>a-b);
 const p95=lat.length?lat[Math.min(lat.length-1,Math.ceil(lat.length*.95)-1)]:0;
 return json({ok:r.ok,candidate_version:CANDIDATE,engine_version:ENGINE,sampled:ids.length,completed:ok.length,failed:results.filter((x:any)=>!x.ok).length,intent_match_rate:rate("intent_match"),semantic_intent_match_rate:rate("semantic_intent_match"),media_match_rate:rate("media_match"),average_response_similarity:avg,p95_engine_latency_ms:p95,duration_ms:Date.now()-started});
}catch(e){return json({ok:false,error:String(e)},500)}});
