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

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
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

  const devicePublicId = (req.headers.get("x-sanad-device-id") || "").trim();
  const deviceToken = (req.headers.get("x-sanad-device-token") || "").trim();
  if (!devicePublicId || !deviceToken || deviceToken.length < 32) {
    return jsonResponse({ ok: false, error: "missing_device_credentials" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: device, error: deviceError } = await supabase
      .from("business_bridge_devices")
      .select("id, device_public_id, business_id, connection_id, source_instance_id, status, metadata")
      .eq("device_public_id", devicePublicId)
      .eq("status", "active")
      .maybeSingle();

    if (deviceError) {
      console.error("erp_heartbeat_device_lookup_failed", { code: deviceError.code });
      return jsonResponse({ ok: false, error: "device_lookup_failed" }, 500);
    }
    if (!device) {
      return jsonResponse({ ok: false, error: "device_not_active" }, 401);
    }

    const { data: credential, error: credentialError } = await supabase
      .from("business_bridge_device_credentials")
      .select("id, secret_hash, status, expires_at")
      .eq("device_id", device.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credentialError) {
      console.error("erp_heartbeat_credential_lookup_failed", { code: credentialError.code });
      return jsonResponse({ ok: false, error: "credential_lookup_failed" }, 500);
    }
    if (!credential) {
      return jsonResponse({ ok: false, error: "device_credential_missing" }, 401);
    }
    if (credential.expires_at && new Date(credential.expires_at).getTime() <= Date.now()) {
      return jsonResponse({ ok: false, error: "device_credential_expired" }, 401);
    }

    const presentedHash = await sha256Hex(deviceToken);
    if (!safeEqual(presentedHash, String(credential.secret_hash || ""))) {
      return jsonResponse({ ok: false, error: "invalid_device_credential" }, 401);
    }

    // A legacy Bridge sends {}. Only a token-authenticated upgraded device
    // can advertise support for the fixed on-demand operation.
    let remoteRefreshCapable = false;
    let pollingFromAgentCycle = false;
    try {
      const body = await req.json();
      remoteRefreshCapable = body?.remote_refresh_v1 === true;
      pollingFromAgentCycle = body?.poll_remote_refresh_v1 === true;
    } catch { /* legacy heartbeat body: no capability */ }
    const now = new Date().toISOString();

    const [deviceUpdate, connectionUpdate, sourceUpdate, credentialUpdate] = await Promise.all([
      supabase
        .from("business_bridge_devices")
        .update({
          last_heartbeat_at: now, updated_at: now,
          metadata: {
            ...((device.metadata && typeof device.metadata === "object") ? device.metadata : {}),
            remote_refresh_v1: remoteRefreshCapable,
          },
        })
        .eq("id", device.id),
      supabase
        .from("business_accounting_connections")
        .update({ last_heartbeat_at: now, updated_at: now })
        .eq("id", device.connection_id),
      supabase
        .from("business_erp_source_instances")
        .update({ last_seen_at: now, updated_at: now })
        .eq("id", device.source_instance_id),
      supabase
        .from("business_bridge_device_credentials")
        .update({ last_used_at: now })
        .eq("id", credential.id),
    ]);

    const updateError =
      deviceUpdate.error || connectionUpdate.error || sourceUpdate.error || credentialUpdate.error;
    if (updateError) {
      console.error("erp_heartbeat_state_update_failed", { code: updateError.code });
      return jsonResponse({ ok: false, error: "heartbeat_update_failed" }, 500);
    }

    // Only this device-token-authenticated service endpoint claims commands.
    let refreshRequestId: string | null = null;
    if (remoteRefreshCapable && pollingFromAgentCycle) {
      const { data: command, error: commandError } = await supabase.rpc(
        "bridge_claim_sanad_erp_refresh_v1", { p_device_id: device.id },
      );
      if (commandError) {
        console.error("erp_refresh_claim_failed", { code: commandError.code });
      } else if (command?.command_kind === "erp_logical_snapshot_refresh"
        && typeof command?.refresh_request_id === "string") {
        refreshRequestId = command.refresh_request_id;
      }
    }

    return jsonResponse({
      ok: true,
      status: "alive",
      device_public_id: device.device_public_id,
      business_id: device.business_id,
      connection_id: device.connection_id,
      source_instance_id: device.source_instance_id,
      server_time: now,
      refresh_request_id: refreshRequestId,
    });
  } catch (error) {
    console.error("erp_heartbeat_unhandled", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return jsonResponse({ ok: false, error: "unexpected_error" }, 500);
  }
});
