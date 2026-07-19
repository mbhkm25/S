import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Connection": "keep-alive" },
  });
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name}_required`);
  }
  return value.trim();
}

async function getAuthedClient(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("supabase_env_missing");
  }

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new Error("missing_authorization_header");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("not_authenticated");
  }

  return { supabase, user: data.user };
}

async function rpc(supabase: any, fn: string, args: JsonRecord = {}) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.error(`[business-actions] rpc ${fn} failed`, error);
    throw new Error(error.message || `${fn}_failed`);
  }
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const { supabase, user } = await getAuthedClient(req);
    const body = await req.json().catch(() => ({}));
    const action = requiredString(body.action, "action");
    const payload = (body.payload && typeof body.payload === "object") ? body.payload as JsonRecord : {};

    let result: unknown;

    switch (action) {
      case "update_business_profile": {
        result = await rpc(supabase, "update_business_profile", {
          p_business_id: requiredString(payload.business_id, "business_id"),
          p_name: payload.name ?? null,
          p_slug: payload.slug ?? null,
          p_category_id: payload.category_id ?? null,
          p_governorate: payload.governorate ?? null,
          p_city: payload.city ?? null,
          p_whatsapp: payload.whatsapp ?? null,
          p_description: payload.description ?? null,
          p_display_tagline: payload.display_tagline ?? null,
          p_address_text: payload.address_text ?? null,
          p_latitude: payload.latitude ?? null,
          p_longitude: payload.longitude ?? null,
          p_cover_image_path: payload.cover_image_path ?? null,
          p_profile_image_path: payload.profile_image_path ?? null,
          p_gallery_paths: payload.gallery_paths ?? null,
          p_working_hours: payload.working_hours ?? null,
          p_contact_links: payload.contact_links ?? null,
          p_profile_sections: payload.profile_sections ?? null,
          p_resubmit_review: Boolean(payload.resubmit_review),
        });
        break;
      }

      case "get_business_team": {
        result = await rpc(supabase, "get_business_team", {
          p_business_id: requiredString(payload.business_id, "business_id"),
        });
        break;
      }

      case "update_team_member_status": {
        result = await rpc(supabase, "update_business_team_member_status", {
          p_business_id: requiredString(payload.business_id, "business_id"),
          p_member_user_id: requiredString(payload.member_user_id, "member_user_id"),
          p_action: requiredString(payload.member_action, "member_action"),
          p_reason: payload.reason ?? null,
        });
        break;
      }

      case "upsert_catalog_item": {
        result = await rpc(supabase, "upsert_business_catalog_item", {
          p_business_id: requiredString(payload.business_id, "business_id"),
          p_item_id: payload.item_id ?? null,
          p_item_type: payload.item_type ?? "product",
          p_title: payload.title ?? null,
          p_description: payload.description ?? null,
          p_price: payload.price ?? null,
          p_currency: payload.currency ?? null,
          p_image_paths: payload.image_paths ?? [],
          p_features: payload.features ?? [],
          p_status: payload.status ?? "active",
          p_display_order: payload.display_order ?? 100,
        });
        break;
      }

      case "get_business_catalog": {
        result = await rpc(supabase, "get_business_catalog", {
          p_business_id: requiredString(payload.business_id, "business_id"),
          p_include_hidden: Boolean(payload.include_hidden),
        });
        break;
      }

      case "create_inquiry": {
        const businessId = requiredString(payload.business_id, "business_id");
        const { data, error } = await supabase
          .from("business_inquiries")
          .insert({
            business_id: businessId,
            customer_user_id: user.id,
            catalog_item_id: payload.catalog_item_id ?? null,
            inquiry_type: payload.inquiry_type ?? "general",
            message: typeof payload.message === "string" ? payload.message.trim() : null,
            metadata: { source: "sanad_business_actions" },
          })
          .select("id,business_id,customer_user_id,catalog_item_id,inquiry_type,message,status,created_at")
          .single();
        if (error) {
          console.error("[business-actions] create_inquiry failed", error);
          throw new Error(error.message || "create_inquiry_failed");
        }
        result = { ok: true, inquiry: data };
        break;
      }

      default:
        return jsonResponse({ ok: false, error: "unknown_business_action", action }, 400);
    }

    return jsonResponse({ ok: true, action, result });
  } catch (error) {
    console.error("[business-actions] failed", error);
    const message = error instanceof Error ? error.message : "unknown_error";
    const status = message.includes("not_authenticated") || message.includes("authorization") ? 401 : 400;
    return jsonResponse({ ok: false, error: message }, status);
  }
});
