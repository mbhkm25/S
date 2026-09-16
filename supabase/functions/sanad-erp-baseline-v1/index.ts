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

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
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

function stringValue(value: unknown, max = 1000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
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

  const devicePublicId = (req.headers.get("x-sanad-device-id") || "").trim();
  const deviceToken = (req.headers.get("x-sanad-device-token") || "").trim();
  if (!devicePublicId || !deviceToken || deviceToken.length < 32) {
    return jsonResponse({ ok: false, error: "missing_device_credentials" }, 401);
  }

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: device, error: deviceError } = await admin
    .from("business_bridge_devices")
    .select("id, device_public_id, status")
    .eq("device_public_id", devicePublicId)
    .eq("status", "active")
    .maybeSingle();

  if (deviceError) {
    console.error("erp_baseline_device_lookup_failed", { code: deviceError.code });
    return jsonResponse({ ok: false, error: "device_lookup_failed" }, 500);
  }
  if (!device) return jsonResponse({ ok: false, error: "device_not_active" }, 401);

  const { data: credential, error: credentialError } = await admin
    .from("business_bridge_device_credentials")
    .select("id, secret_hash, status, expires_at")
    .eq("device_id", device.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (credentialError) {
    console.error("erp_baseline_credential_lookup_failed", { code: credentialError.code });
    return jsonResponse({ ok: false, error: "credential_lookup_failed" }, 500);
  }
  if (!credential) return jsonResponse({ ok: false, error: "device_credential_missing" }, 401);
  if (credential.expires_at && new Date(credential.expires_at).getTime() <= Date.now()) {
    return jsonResponse({ ok: false, error: "device_credential_expired" }, 401);
  }

  const presentedHash = await sha256Hex(deviceToken);
  if (!safeEqual(presentedHash, String(credential.secret_hash || ""))) {
    return jsonResponse({ ok: false, error: "invalid_device_credential" }, 401);
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return jsonResponse({ ok: false, error: "invalid_json" }, 400);

  const action = stringValue(body.action, 32).toLowerCase();
  const baselinePublicId = stringValue(body.baseline_public_id, 64);
  if (!baselinePublicId) return jsonResponse({ ok: false, error: "baseline_public_id_required" }, 400);

  let rpcName = "";
  let rpcArgs: Record<string, unknown> = {};

  if (action === "start") {
    const adapterCode = stringValue(body.adapter_code, 32).toLowerCase();
    const adapterVersion = stringValue(body.adapter_version, 64);
    const schemaFingerprint = stringValue(body.schema_fingerprint, 128).toLowerCase();
    const baselineKind = stringValue(body.baseline_kind, 32) || "initial";
    const manifest = body.manifest && typeof body.manifest === "object" ? body.manifest : {};
    const expectedCounts = body.expected_counts && typeof body.expected_counts === "object" ? body.expected_counts : {};

    if (!adapterCode || !adapterVersion || !/^[a-f0-9]{64}$/.test(schemaFingerprint)) {
      return jsonResponse({ ok: false, error: "invalid_baseline_start" }, 400);
    }

    rpcName = "start_erp_baseline_v1";
    rpcArgs = {
      p_device_public_id: devicePublicId,
      p_baseline_public_id: baselinePublicId,
      p_baseline_kind: baselineKind,
      p_adapter_code: adapterCode,
      p_adapter_version: adapterVersion,
      p_schema_fingerprint: schemaFingerprint,
      p_manifest: manifest,
      p_expected_counts: expectedCounts,
    };
  } else if (action === "complete") {
    rpcName = "complete_erp_baseline_v1";
    rpcArgs = {
      p_device_public_id: devicePublicId,
      p_baseline_public_id: baselinePublicId,
    };
  } else if (action === "fail") {
    const errorCode = stringValue(body.error_code, 160);
    if (!errorCode) return jsonResponse({ ok: false, error: "baseline_error_code_required" }, 400);
    rpcName = "fail_erp_baseline_v1";
    rpcArgs = {
      p_device_public_id: devicePublicId,
      p_baseline_public_id: baselinePublicId,
      p_error_code: errorCode,
      p_error_detail: stringValue(body.error_detail, 1000) || null,
      p_incompatible: body.incompatible === true,
    };
  } else {
    return jsonResponse({ ok: false, error: "unsupported_action" }, 400);
  }

  const { data, error } = await admin.rpc(rpcName, rpcArgs);
  if (error) {
    const message = String(error.message || "");
    console.warn("erp_baseline_rpc_failed", {
      action,
      code: error.code,
      baseline_public_id: baselinePublicId,
    });

    if (message.includes("bridge_device_not_active") || message.includes("bridge_device_not_found")) {
      return jsonResponse({ ok: false, error: "device_not_active" }, 401);
    }
    if (message.includes("schema_fingerprint_mismatch")) {
      return jsonResponse({ ok: false, error: "schema_fingerprint_mismatch" }, 409);
    }
    if (message.includes("baseline_snapshot_missing")) {
      return jsonResponse({ ok: false, error: "baseline_snapshot_missing" }, 409);
    }
    if (message.includes("baseline_snapshot_count_mismatch")) {
      return jsonResponse({ ok: false, error: "baseline_snapshot_count_mismatch" }, 409);
    }
    if (message.includes("baseline_id_conflict")) {
      return jsonResponse({ ok: false, error: "baseline_id_conflict" }, 409);
    }
    if (message.includes("invalid_") || message.includes("baseline_run_")) {
      return jsonResponse({ ok: false, error: "invalid_baseline_request" }, 400);
    }
    return jsonResponse({ ok: false, error: "baseline_operation_failed" }, 500);
  }

  await admin
    .from("business_bridge_device_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", credential.id);

  return jsonResponse({ ok: true, ...((data || {}) as Record<string, unknown>) }, action === "start" ? 201 : 200);
});
