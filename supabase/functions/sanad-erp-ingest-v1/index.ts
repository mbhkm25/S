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

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
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
      .select("id, device_public_id, business_id, connection_id, source_instance_id, status")
      .eq("device_public_id", devicePublicId)
      .eq("status", "active")
      .maybeSingle();

    if (deviceError) {
      console.error("erp_ingest_device_lookup_failed", { code: deviceError.code });
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
      console.error("erp_ingest_credential_lookup_failed", { code: credentialError.code });
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

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse({ ok: false, error: "invalid_json" }, 400);
    }

    const event = body as Record<string, unknown>;
    const eventId = optionalString(event.event_id);
    const adapterCode = optionalString(event.adapter_code);
    const adapterVersion = optionalString(event.adapter_version);
    const entityType = optionalString(event.entity_type);
    const sourceRecordId = optionalString(event.source_record_id);
    const revision = optionalString(event.revision);
    const capturedAt = optionalString(event.captured_at);
    const eventSchemaVersion = Number(event.event_schema_version || 0);

    if (
      !eventId || !adapterCode || !adapterVersion || !entityType ||
      !sourceRecordId || !revision || !capturedAt ||
      !Number.isInteger(eventSchemaVersion) || eventSchemaVersion <= 0
    ) {
      return jsonResponse({ ok: false, error: "invalid_event_envelope" }, 400);
    }

    const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
    const integrity = event.integrity && typeof event.integrity === "object" ? event.integrity : {};

    const { data: ack, error: acceptError } = await supabase.rpc("accept_erp_event_v1", {
      p_device_public_id: devicePublicId,
      p_event_id: eventId,
      p_adapter_code: adapterCode,
      p_adapter_version: adapterVersion,
      p_event_schema_version: eventSchemaVersion,
      p_entity_type: entityType,
      p_source_record_id: sourceRecordId,
      p_revision: revision,
      p_captured_at: capturedAt,
      p_business_date: optionalString(event.business_date),
      p_source_enter_time: optionalString(event.source_enter_time),
      p_payload: payload,
      p_integrity: integrity,
    });

    if (acceptError) {
      const message = String(acceptError.message || "");
      console.warn("erp_ingest_accept_failed", {
        code: acceptError.code,
        event_id: eventId,
        device_id: devicePublicId,
      });

      if (message.includes("event_id_conflict")) {
        return jsonResponse({ ok: false, error: "event_id_conflict" }, 409);
      }
      if (message.includes("invalid_event")) {
        return jsonResponse({ ok: false, error: "invalid_event_envelope" }, 400);
      }
      if (message.includes("bridge_device_not_active")) {
        return jsonResponse({ ok: false, error: "device_not_active" }, 401);
      }
      return jsonResponse({ ok: false, error: "event_accept_failed" }, 500);
    }

    const ackRecord = (ack || {}) as Record<string, unknown>;
    const receiptId = optionalString(ackRecord.receipt_id);
    let normalization: Record<string, unknown> | null = null;

    if (
      receiptId &&
      (adapterCode === "edaa" || adapterCode === "edaa_v5") &&
      (entityType === "sale" || entityType === "sale_transaction")
    ) {
      const { data: normalized, error: normalizationError } = await supabase.rpc(
        "normalize_edaa_sale_v1",
        { p_raw_event_id: receiptId },
      );

      if (normalizationError) {
        console.error("erp_ingest_normalization_rpc_failed", {
          code: normalizationError.code,
          event_id: eventId,
          receipt_id: receiptId,
        });
        normalization = { status: "failed", error: "normalization_rpc_failed" };
      } else {
        normalization = (normalized || {}) as Record<string, unknown>;
      }
    } else if (
      receiptId &&
      (adapterCode === "edaa" || adapterCode === "edaa_v5") &&
      entityType === "erp_logical_snapshot_chunk"
    ) {
      const { data: applied, error: applyError } = await supabase.rpc(
        "apply_erp_logical_snapshot_chunk_v1",
        { p_raw_event_id: receiptId },
      );

      if (applyError) {
        console.error("erp_ingest_snapshot_apply_failed", {
          code: applyError.code,
          event_id: eventId,
          receipt_id: receiptId,
        });
        normalization = { status: "failed", error: "snapshot_apply_failed" };
      } else {
        normalization = (applied || {}) as Record<string, unknown>;
      }
    }

    const syncTime = new Date().toISOString();

    const [credentialTouch, connectionTouch, sourceTouch, deviceTouch] = await Promise.all([
      supabase
        .from("business_bridge_device_credentials")
        .update({ last_used_at: syncTime })
        .eq("id", credential.id),
      supabase
        .from("business_accounting_connections")
        .update({
          last_sync_at: syncTime,
          last_error_code: null,
          last_error_at: null,
          updated_at: syncTime,
        })
        .eq("id", device.connection_id),
      supabase
        .from("business_erp_source_instances")
        .update({ last_seen_at: syncTime, updated_at: syncTime })
        .eq("id", device.source_instance_id),
      supabase
        .from("business_bridge_devices")
        .update({ last_heartbeat_at: syncTime, updated_at: syncTime })
        .eq("id", device.id),
    ]);

    const touchError =
      credentialTouch.error || connectionTouch.error || sourceTouch.error || deviceTouch.error;
    if (touchError) {
      console.warn("erp_ingest_sync_health_update_failed", {
        code: touchError.code,
        event_id: eventId,
        device_id: devicePublicId,
      });
    }

    return jsonResponse({ ok: true, ...ackRecord, normalization }, 200);
  } catch (error) {
    console.error("erp_ingest_unhandled", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return jsonResponse({ ok: false, error: "unexpected_error" }, 500);
  }
});
