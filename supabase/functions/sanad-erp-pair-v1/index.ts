import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function randomHex(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: "server_not_configured" }, 500);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const payload = body as Record<string, unknown>;
  const pairingToken = optionalString(payload.pairing_token);
  if (!pairingToken || pairingToken.length < 32 || pairingToken.length > 128) {
    return jsonResponse({ ok: false, error: "invalid_pairing_token" }, 400);
  }

  const deviceToken = randomHex(32);
  const [pairingHash, credentialHash] = await Promise.all([
    sha256Hex(pairingToken),
    sha256Hex(deviceToken),
  ]);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("consume_business_bridge_pairing_v1", {
    p_pairing_token_hash: pairingHash,
    p_device_label: optionalString(payload.device_label),
    p_bridge_version: optionalString(payload.bridge_version),
    p_adapter_version: optionalString(payload.adapter_version),
    p_credential_hash: credentialHash,
    p_credential_prefix: deviceToken.slice(0, 8),
  });

  if (error) {
    const message = String(error.message || "");
    console.warn("erp_pair_failed", { code: error.code });

    if (
      message.includes("pairing_token_invalid") ||
      message.includes("pairing_token_not_pending") ||
      message.includes("pairing_token_expired") ||
      message.includes("pairing_source_not_active")
    ) {
      return jsonResponse({ ok: false, error: "pairing_not_available" }, 401);
    }

    return jsonResponse({ ok: false, error: "pairing_failed" }, 500);
  }

  const result = data && typeof data === "object" ? data as Record<string, unknown> : {};

  return jsonResponse({
    ok: true,
    device_public_id: result.device_public_id,
    device_token: deviceToken,
    connection_id: result.connection_id,
    source_instance_id: result.source_instance_id,
    contract_version: 1,
  });
});
