import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type PreviewJob={job_id:string;operation_id:string;source_bucket:string;source_path:string;source_mime_type:string;source_sha256?:string|null};
type ServiceClient=ReturnType<typeof createClient>;
const jsonHeaders={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
function env(name:string):string{const value=Deno.env.get(name);if(!value)throw new Error(`missing_env_${name}`);return value;}
function reply(payload:unknown,status=200):Response{return new Response(JSON.stringify(payload),{status,headers:jsonHeaders});}
function joinUrl(base:string,path:string):string{return `${base.replace(/\/$/,"")}/${path.replace(/^\//,"")}`;}
function escapeAttribute(value:string):string{return value.replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");}
function isWebp(bytes:Uint8Array):boolean{if(bytes.byteLength<12)return false;const header=new TextDecoder().decode(bytes.slice(0,12));return header.startsWith("RIFF")&&header.slice(8,12)==="WEBP";}
function imageHtml(sourceUrl:string):string{const url=escapeAttribute(sourceUrl);return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fff}body{display:flex;align-items:center;justify-content:center}img{display:block;width:100%;height:100%;object-fit:contain;background:#fff}</style></head><body><img src="${url}"></body></html>`;}
function appendScreenshotOptions(form:FormData,waitDelay:string):void{form.append("width","1240");form.append("height","1754");form.append("clip","true");form.append("deviceScaleFactor","1");form.append("format","webp");form.append("omitBackground","false");form.append("optimizeForSpeed","true");form.append("waitDelay",waitDelay);}
async function gotenbergScreenshot(route:string,form:FormData):Promise<Uint8Array>{const result=await fetch(joinUrl(env("GOTENBERG_URL"),route),{method:"POST",headers:{"X-Gotenberg-Token":env("GOTENBERG_TOKEN")},body:form,signal:AbortSignal.timeout(25000)});if(!result.ok)throw new Error(`gotenberg_preview_failed_${result.status}_${(await result.text().catch(()=>"")).slice(0,200)}`);const bytes=new Uint8Array(await result.arrayBuffer());if(!isWebp(bytes))throw new Error("gotenberg_preview_invalid_webp");return bytes;}
async function renderWebp(sourceUrl:string,mimeType:string):Promise<Uint8Array>{if(mimeType==="application/pdf"){const form=new FormData();form.append("url",`${sourceUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`);appendScreenshotOptions(form,"2400ms");const bytes=await gotenbergScreenshot("/forms/chromium/screenshot/url",form);if(bytes.byteLength<10000)throw new Error("gotenberg_pdf_preview_probably_blank");return bytes;}const form=new FormData();form.append("files",new Blob([imageHtml(sourceUrl)],{type:"text/html; charset=utf-8"}),"index.html");appendScreenshotOptions(form,"600ms");const bytes=await gotenbergScreenshot("/forms/chromium/screenshot/html",form);if(bytes.byteLength<4000)throw new Error("gotenberg_image_preview_too_small");return bytes;}
async function recordFailure(service:ServiceClient,workerToken:string,job:PreviewJob,message:string){await service.rpc("fail_operation_media_preview_job",{p_worker_token:workerToken,p_job_id:job.job_id,p_error:message}).catch(()=>null);}
async function processJob(service:ServiceClient,workerToken:string,job:PreviewJob){try{const {data:signed,error:signedError}=await service.storage.from(job.source_bucket).createSignedUrl(job.source_path,600);if(signedError||!signed?.signedUrl)throw new Error(`source_sign_failed_${signedError?.message||"missing_url"}`);const preview=await renderWebp(signed.signedUrl,job.source_mime_type);const previewBucket=job.source_bucket||"operation-files";const version=(job.source_sha256||Date.now().toString()).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,64)||"source";const previewPath=`previews/operations/${job.operation_id}/${version}.webp`;const {error:uploadError}=await service.storage.from(previewBucket).upload(previewPath,preview,{contentType:"image/webp",cacheControl:"31536000",upsert:true});if(uploadError)throw new Error(`preview_upload_failed_${uploadError.message}`);const {data:completed,error:completeError}=await service.rpc("complete_operation_media_preview_job",{p_worker_token:workerToken,p_job_id:job.job_id,p_preview_bucket:previewBucket,p_preview_path:previewPath,p_preview_size:preview.byteLength,p_preview_width:1240,p_preview_height:1754});if(completeError||completed!==true)throw new Error("preview_commit_rejected");return{ok:true,job_id:job.job_id,operation_id:job.operation_id,bytes:preview.byteLength};}catch(cause){const message=cause instanceof Error?cause.message:"preview_generation_failed";await recordFailure(service,workerToken,job,message);return{ok:false,job_id:job.job_id,operation_id:job.operation_id,error:message};}}

Deno.serve(async(req:Request)=>{
 if(req.method==="GET")return reply({ok:true,service:"sanad-operation-preview-worker"});
 if(req.method!=="POST")return reply({ok:false,error:"method_not_allowed"},405);
 const workerToken=req.headers.get("x-sanad-worker-token")?.trim()||"";
 const bearer=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"").trim()||"";
 const internalCall=bearer!==""&&bearer===env("SUPABASE_SERVICE_ROLE_KEY");
 try{
  const service=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
  let effectiveToken=workerToken;
  if(internalCall&&!effectiveToken){const {data,error}=await service.rpc("get_operation_media_preview_worker_token_internal");if(error||!data)return reply({ok:false,error:"worker_token_unavailable"},500);effectiveToken=String(data);}
  if(!effectiveToken)return reply({ok:false,error:"missing_worker_token"},401);
  const {data,error}=await service.rpc("claim_operation_media_preview_jobs",{p_worker_token:effectiveToken,p_limit:1});
  if(error){const invalidToken=error.message?.includes("invalid_worker_token");return reply({ok:false,error:invalidToken?"invalid_worker_token":"claim_failed"},invalidToken?401:500);}
  const jobs=Array.isArray(data)?data as PreviewJob[]:[];if(jobs.length===0)return reply({ok:true,claimed:0,completed:0,failed:0,results:[]});
  const result=await processJob(service,effectiveToken,jobs[0]);return reply({ok:true,claimed:1,completed:result.ok?1:0,failed:result.ok?0:1,results:[result]});
 }catch(cause){console.error("SANAD operation preview worker failed",cause);return reply({ok:false,error:"worker_failed",detail:cause instanceof Error?cause.message:"worker_failed"},500);}
});
