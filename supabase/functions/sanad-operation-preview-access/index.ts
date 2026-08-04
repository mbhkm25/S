import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set(["https://app.sanadflow.com", "https://sanadflow.com", "http://localhost:3000", "http://127.0.0.1:3000"]);
function env(name: string): string { const value = Deno.env.get(name); if (!value) throw new Error(`missing_env_${name}`); return value; }
function cors(req: Request): Record<string, string> { const origin = req.headers.get("origin") || ""; return {"access-control-allow-origin": allowedOrigins.has(origin) ? origin : "https://app.sanadflow.com", "access-control-allow-headers":"authorization, apikey, content-type, x-client-info", "access-control-allow-methods":"POST, OPTIONS", vary:"Origin"}; }
function reply(req: Request, payload: unknown, status = 200): Response { return new Response(JSON.stringify(payload), {status, headers:{...cors(req), "content-type":"application/json; charset=utf-8", "cache-control":"no-store"}}); }

async function kickWorker(): Promise<void> {
  try {
    await fetch(`${env("SUPABASE_URL")}/functions/v1/sanad-operation-preview-worker`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(28_000),
    });
  } catch (error) {
    console.warn("SANAD preview worker kick failed", error);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply(req, { ok:false, error:"method_not_allowed" }, 405);
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return reply(req, {ok:false,error:"not_authenticated"}, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const publicToken = typeof body?.public_token === "string" ? body.public_token.trim() : "";
    if (!/^[0-9a-fA-F-]{36}$/.test(publicToken)) return reply(req, {ok:false,error:"invalid_public_token"}, 400);

    const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {auth:{persistSession:false,autoRefreshToken:false}});
    const {data:access,error:accessError} = await userClient.rpc("open_operation_access", {p_public_token:publicToken,p_source:"app"});
    if (accessError || !access?.allowed || !access?.operation?.id) return reply(req,{ok:false,error:access?.reason||"operation_access_denied"},403);

    const operationId = String(access.operation.id);
    const readMetadata = () => service.from("operations").select("preview_status,preview_bucket,preview_path,preview_mime_type,preview_size,preview_width,preview_height,preview_generated_at").eq("id",operationId).maybeSingle();
    let {data:operation,error:operationError} = await readMetadata();
    if (operationError || !operation) return reply(req,{ok:false,error:"preview_metadata_unavailable"},404);

    if (operation.preview_status !== "ready" || !operation.preview_bucket || !operation.preview_path) {
      if (body?.request_processing !== false && ["pending","processing"].includes(operation.preview_status || "pending")) {
        await kickWorker();
        const refreshed = await readMetadata();
        if (refreshed.data) operation = refreshed.data;
      }
      if (operation.preview_status !== "ready" || !operation.preview_bucket || !operation.preview_path) {
        return reply(req,{ok:true,status:operation.preview_status||"pending",available:false,retry_after_seconds:operation.preview_status==="processing"?5:8});
      }
    }

    const {data:signed,error:signError}=await service.storage.from(operation.preview_bucket).createSignedUrl(operation.preview_path,900);
    if (signError || !signed?.signedUrl) return reply(req,{ok:false,error:"preview_sign_failed"},500);
    return reply(req,{ok:true,status:"ready",available:true,signed_url:signed.signedUrl,mime_type:operation.preview_mime_type||"image/webp",size:operation.preview_size,width:operation.preview_width,height:operation.preview_height,generated_at:operation.preview_generated_at,expires_in:900});
  } catch (cause) {
    console.error("SANAD operation preview access failed", cause);
    return reply(req,{ok:false,error:"preview_access_failed"},500);
  }
});
