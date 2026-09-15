import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function getAdminKey(): string | null {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // Fall back during API-key migration.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const adminKey = getAdminKey();
  if (!supabaseUrl || !adminKey) return jsonResponse({ ok: false, error: "server_not_configured" }, 500);

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return jsonResponse({ ok: false, error: "not_authenticated" }, 401);

  const supabaseAdmin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return jsonResponse({ ok: false, error: "invalid_user_session" }, 401);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return jsonResponse({ ok: false, error: "invalid_json" }, 400);

  const action = stringValue(body.action);
  const sessionPublicId = stringValue(body.session_public_id);
  const browserSecret = stringValue(body.browser_secret);
  if (!sessionPublicId || browserSecret.length < 32) {
    return jsonResponse({ ok: false, error: "invalid_authorization_request" }, 400);
  }

  const browserSecretHash = await sha256Hex(browserSecret);
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("business_bridge_authorization_sessions")
    .select("id, session_public_id, browser_secret_hash, device_label, bridge_version, adapter_code, adapter_version, source_key, source_label, source_version, status, expires_at, business_id, location_id, authorized_by_user_id, authorized_at, metadata")
    .eq("session_public_id", sessionPublicId)
    .eq("browser_secret_hash", browserSecretHash)
    .maybeSingle();

  if (sessionError) {
    console.error("bridge_authorize_session_lookup_failed", { code: sessionError.code });
    return jsonResponse({ ok: false, error: "authorization_session_lookup_failed" }, 500);
  }
  if (!session) return jsonResponse({ ok: false, error: "authorization_session_invalid" }, 401);

  if (new Date(session.expires_at).getTime() <= Date.now() && ["pending", "authorized"].includes(session.status)) {
    await supabaseAdmin.from("business_bridge_authorization_sessions").update({ status: "expired" }).eq("id", session.id);
    return jsonResponse({ ok: false, error: "authorization_session_expired", status: "expired" }, 410);
  }

  const safeSession = {
    session_public_id: session.session_public_id,
    device_label: session.device_label,
    bridge_version: session.bridge_version,
    adapter_code: session.adapter_code,
    adapter_version: session.adapter_version,
    source_label: session.source_label,
    source_version: session.source_version,
    status: session.status,
    expires_at: session.expires_at,
    business_id: session.business_id,
    location_id: session.location_id,
    authorized_at: session.authorized_at,
  };

  if (action === "context") {
    if (session.status !== "pending") {
      let businessName: string | null = null;
      if (session.business_id) {
        const { data: business } = await supabaseAdmin.from("business_profiles").select("name").eq("id", session.business_id).maybeSingle();
        businessName = business?.name ?? null;
      }
      return jsonResponse({ ok: true, session: safeSession, business_name: businessName, businesses: [], contract_version: 1 });
    }

    const [{ data: owned, error: ownedError }, { data: memberships, error: membershipError }] = await Promise.all([
      supabaseAdmin
        .from("business_profiles")
        .select("id, name, slug, owner_user_id, profile_image_path, city, governorate")
        .eq("owner_user_id", user.id),
      supabaseAdmin
        .from("business_team_members")
        .select("business_id, job_title, permissions")
        .eq("user_id", user.id)
        .eq("status", "active"),
    ]);

    if (ownedError || membershipError) {
      console.error("bridge_authorize_business_lookup_failed", { owned: ownedError?.code, membership: membershipError?.code });
      return jsonResponse({ ok: false, error: "business_access_lookup_failed" }, 500);
    }

    const ownerRows = owned || [];
    const delegated = (memberships || []).filter((row) => {
      const permissions = (row.permissions || {}) as Record<string, unknown>;
      return permissions.manage_accounting_integrations === true;
    });

    const delegatedIds = delegated.map((row) => row.business_id);
    const ownedIds = ownerRows.map((row) => row.id);
    const businessIds = Array.from(new Set([...ownedIds, ...delegatedIds]));

    let delegatedBusinesses: Array<Record<string, unknown>> = [];
    if (delegatedIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("business_profiles")
        .select("id, name, slug, owner_user_id, profile_image_path, city, governorate")
        .in("id", delegatedIds);
      if (error) return jsonResponse({ ok: false, error: "business_access_lookup_failed" }, 500);
      delegatedBusinesses = (data || []) as Array<Record<string, unknown>>;
    }

    const allBusinesses = [...ownerRows, ...delegatedBusinesses].filter(
      (row, index, rows) => rows.findIndex((candidate) => candidate.id === row.id) === index,
    );

    let locations: Array<Record<string, unknown>> = [];
    if (businessIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("business_locations")
        .select("id, business_id, name, code, is_primary, status")
        .in("business_id", businessIds)
        .eq("status", "active");
      if (error) return jsonResponse({ ok: false, error: "business_location_lookup_failed" }, 500);
      locations = (data || []) as Array<Record<string, unknown>>;
    }

    const businesses = allBusinesses
      .map((business) => {
        const delegation = delegated.find((row) => row.business_id === business.id);
        return {
          ...business,
          is_owner: business.owner_user_id === user.id,
          job_title: business.owner_user_id === user.id ? "مالك النشاط" : delegation?.job_title || "عضو فريق",
          locations: locations.filter((location) => location.business_id === business.id),
        };
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));

    return jsonResponse({
      ok: true,
      user: { id: user.id, email: user.email ?? null },
      session: safeSession,
      businesses,
      contract_version: 1,
    });
  }

  if (action === "authorize") {
    if (session.status !== "pending") {
      return jsonResponse({ ok: false, error: "authorization_session_not_pending", status: session.status }, 409);
    }
    const businessId = stringValue(body.business_id);
    const locationId = stringValue(body.location_id) || null;
    if (!businessId) return jsonResponse({ ok: false, error: "business_required" }, 400);

    const { data, error } = await supabaseAdmin.rpc("authorize_bridge_installation_v1", {
      p_session_public_id: sessionPublicId,
      p_browser_secret_hash: browserSecretHash,
      p_user_id: user.id,
      p_business_id: businessId,
      p_location_id: locationId,
      p_location_name: "الفرع الرئيسي",
    });

    if (error) {
      const message = String(error.message || "");
      console.warn("bridge_authorize_rpc_failed", { code: error.code, user_id: user.id, business_id: businessId });
      if (message.includes("accounting_integration_permission_required")) {
        return jsonResponse({ ok: false, error: "accounting_integration_permission_required" }, 403);
      }
      if (message.includes("business_location_invalid")) {
        return jsonResponse({ ok: false, error: "business_location_invalid" }, 400);
      }
      if (message.includes("authorization_session")) {
        return jsonResponse({ ok: false, error: "authorization_session_invalid" }, 409);
      }
      return jsonResponse({ ok: false, error: "authorization_failed" }, 500);
    }

    return jsonResponse({ ok: true, ...((data || {}) as Record<string, unknown>) });
  }

  if (action === "deny") {
    if (session.status !== "pending") {
      return jsonResponse({ ok: true, status: session.status, contract_version: 1 });
    }
    const metadata = {
      ...((session.metadata || {}) as Record<string, unknown>),
      denied_by_user_id: user.id,
      denied_via: "sanad_web",
    };
    const { error } = await supabaseAdmin
      .from("business_bridge_authorization_sessions")
      .update({ status: "denied", denied_at: new Date().toISOString(), metadata })
      .eq("id", session.id)
      .eq("status", "pending");
    if (error) return jsonResponse({ ok: false, error: "authorization_denial_failed" }, 500);
    return jsonResponse({ ok: true, status: "denied", contract_version: 1 });
  }

  return jsonResponse({ ok: false, error: "unsupported_action" }, 400);
});
