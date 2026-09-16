import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.0";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
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

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const adminKey = getAdminKey();
  if (!supabaseUrl || !adminKey) {
    return jsonResponse({ ok: false, error: "server_not_configured" }, 500);
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const sessionPublicId = typeof body?.session_public_id === "string" ? body.session_public_id.trim() : "";
  const claimSecret = typeof body?.claim_secret === "string" ? body.claim_secret.trim() : "";

  if (!sessionPublicId || claimSecret.length < 32) {
    return jsonResponse({ ok: false, error: "invalid_claim_request" }, 400);
  }

  const claimSecretHash = await sha256Hex(claimSecret);
  const supabaseAdmin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabaseAdmin.rpc("claim_bridge_authorization_session_v1", {
    p_session_public_id: sessionPublicId,
    p_claim_secret_hash: claimSecretHash,
  });

  if (error) {
    const message = String(error.message || "");
    console.warn("bridge_auth_claim_failed", { code: error.code, session_public_id: sessionPublicId });
    if (message.includes("claim_session_invalid")) {
      return jsonResponse({ ok: false, error: "claim_session_invalid" }, 401);
    }
    return jsonResponse({ ok: false, error: "claim_failed" }, 500);
  }

  const result = (data || {}) as Record<string, unknown>;
  const status = typeof result.status === "string" ? result.status : "unknown";

  return jsonResponse({ ok: true, ...result }, status === "pending" ? 202 : 200);
});
