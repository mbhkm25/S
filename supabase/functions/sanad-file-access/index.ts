import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
    },
  });
}

function normalizePath(path: string | null | undefined) {
  return String(path || "")
    .trim()
    .replace(/^\/+/, "");
}

function safeFilename(name: string | null | undefined, fallbackPath: string) {
  const raw = String(name || "").trim();
  if (raw) return raw;

  const parts = fallbackPath.split("/");
  return parts[parts.length - 1] || "sanad-original-file";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { ok: false, error: "method_not_allowed", message: "Method not allowed" },
      405,
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse(
        {
          ok: false,
          error: "server_not_configured",
          message: "Server is not configured correctly.",
        },
        500,
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const body = await req.json().catch(() => ({}));

    const publicToken = String(body.public_token || "").trim();
    const purpose = String(body.purpose || "open").trim();

    if (!publicToken) {
      return jsonResponse(
        {
          ok: false,
          error: "missing_public_token",
          message: "Missing public_token.",
        },
        400,
      );
    }

    if (!["open", "download"].includes(purpose)) {
      return jsonResponse(
        {
          ok: false,
          error: "invalid_purpose",
          message: "Invalid purpose.",
        },
        400,
      );
    }

    const { data: operation, error: opError } = await supabase
      .from("operations")
      .select(`
        id,
        public_token,
        token_status,
        token_expires_at,
        original_file_status,
        file_bucket,
        file_path,
        file_mime_type,
        file_original_name,
        file_size
      `)
      .eq("public_token", publicToken)
      .maybeSingle();

    if (opError) {
      console.error("operation_lookup_error", opError);
      return jsonResponse(
        {
          ok: false,
          error: "operation_lookup_failed",
          message: "تعذر الوصول إلى بيانات العملية.",
        },
        500,
      );
    }

    if (!operation) {
      return jsonResponse(
        {
          ok: false,
          error: "operation_not_found",
          message: "لم يتم العثور على العملية.",
        },
        404,
      );
    }

    if (operation.token_status !== "active") {
      return jsonResponse(
        {
          ok: false,
          error: "token_not_active",
          message: "رابط العملية غير نشط.",
        },
        403,
      );
    }

    if (
      operation.token_expires_at &&
      new Date(operation.token_expires_at).getTime() < Date.now()
    ) {
      return jsonResponse(
        {
          ok: false,
          error: "token_expired",
          message: "انتهت صلاحية رابط العملية.",
        },
        403,
      );
    }

    if (operation.original_file_status !== "stored") {
      return jsonResponse(
        {
          ok: false,
          error: "file_not_stored",
          message: "لا يوجد ملف أصلي محفوظ لهذه العملية.",
        },
        404,
      );
    }

    const bucket = String(operation.file_bucket || "operation-files").trim();
    const path = normalizePath(operation.file_path);

    if (!bucket || !path) {
      return jsonResponse(
        {
          ok: false,
          error: "missing_file_metadata",
          message: "بيانات الملف الأصلي غير مكتملة.",
        },
        400,
      );
    }

    const filename = safeFilename(operation.file_original_name, path);
    const expiresIn = 300;

    const signedOptions =
      purpose === "download"
        ? {
            download: filename,
          }
        : undefined;

    const { data: signed, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn, signedOptions);

    if (signedError || !signed?.signedUrl) {
      console.error("signed_url_error", {
        operation_id: operation.id,
        bucket,
        path,
        error: signedError,
      });

      return jsonResponse(
        {
          ok: false,
          error: "signed_url_failed",
          message:
            "تعذر تجهيز رابط الملف الأصلي. قد يكون الملف غير موجود أو تعذرت صلاحية الوصول.",
        },
        500,
      );
    }

    return jsonResponse({
      ok: true,
      operation_id: operation.id,
      public_token: operation.public_token,
      signed_url: signed.signedUrl,
      filename,
      mime_type: operation.file_mime_type || "application/octet-stream",
      file_size: operation.file_size,
      expires_in: expiresIn,
      purpose,
    });
  } catch (error) {
    console.error("sanad_file_access_unhandled_error", error);

    return jsonResponse(
      {
        ok: false,
        error: "unexpected_error",
        message: "حدث خطأ غير متوقع أثناء تجهيز الملف.",
      },
      500,
    );
  }
});