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
      // Fall back to the legacy service role key during key migration.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

function randomToken(bytes = 32): string {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return btoa(String.fromCharCode(...raw))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function optionalString(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, max);
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
  if (!body) return jsonResponse({ ok: false, error: "invalid_json" }, 400);

  const deviceCredentialHash = optionalString(body.device_credential_hash, 64)?.toLowerCase() ?? null;
  const deviceCredentialPrefix = optionalString(body.device_credential_prefix, 16);
  const adapterCode = optionalString(body.adapter_code, 32)?.toLowerCase() ?? null;
  const sourceKey = optionalString(body.source_key, 240);

  if (!deviceCredentialHash || !/^[a-f0-9]{64}$/.test(deviceCredentialHash)) {
    return jsonResponse({ ok: false, error: "invalid_device_credential_hash" }, 400);
  }
  if (!deviceCredentialPrefix || !/^[A-Za-z0-9_-]{4,16}$/.test(deviceCredentialPrefix)) {
    return jsonResponse({ ok: false, error: "invalid_device_credential_prefix" }, 400);
  }
  if (!adapterCode || !/^[a-z0-9_]{2,32}$/.test(adapterCode) || !sourceKey) {
    return jsonResponse({ ok: false, error: "invalid_bridge_identity" }, 400);
  }

  const browserSecret = randomToken();
  const claimSecret = randomToken();
  const [browserSecretHash, claimSecretHash] = await Promise.all([
    sha256Hex(browserSecret),
    sha256Hex(claimSecret),
  ]);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const supabaseAdmin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: session, error } = await supabaseAdmin
    .from("business_bridge_authorization_sessions")
    .insert({
      browser_secret_hash: browserSecretHash,
      claim_secret_hash: claimSecretHash,
      device_credential_hash: deviceCredentialHash,
      device_credential_prefix: deviceCredentialPrefix,
      device_label: optionalString(body.device_label, 160),
      bridge_version: optionalString(body.bridge_version, 64),
      adapter_code: adapterCode,
      adapter_version: optionalString(body.adapter_version, 64),
      source_key: sourceKey,
      source_label: optionalString(body.source_label, 240),
      source_version: optionalString(body.source_version, 120),
      schema_fingerprint: optionalString(body.schema_fingerprint, 256),
      status: "pending",
      expires_at: expiresAt,
      authorization_method: "browser_session",
      metadata: {
        initiated_by: "sanad_bridge_windows",
        contract_version: 1,
      },
    })
    .select("session_public_id, expires_at")
    .single();

  if (error || !session) {
    console.error("bridge_auth_init_insert_failed", { code: error?.code });
    return jsonResponse({ ok: false, error: "authorization_session_create_failed" }, 500);
  }

  const appUrl = (Deno.env.get("SANAD_APP_URL") || "https://app.sanadflow.com").replace(/\/$/, "");
  const authorizationUrl = `${appUrl}/bridge/authorize?session=${encodeURIComponent(session.session_public_id)}#key=${encodeURIComponent(browserSecret)}`;

  return jsonResponse({
    ok: true,
    status: "pending",
    session_public_id: session.session_public_id,
    claim_secret: claimSecret,
    authorization_url: authorizationUrl,
    expires_at: session.expires_at,
    contract_version: 1,
  }, 201);
});
