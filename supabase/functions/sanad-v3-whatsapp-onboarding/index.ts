const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
const SERVICE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
const META_TOKEN = mustGetEnv("META_WA_ACCESS_TOKEN");
const META_PHONE_ID = mustGetEnv("META_WA_PHONE_NUMBER_ID");
const INTERNAL_KEY = mustGetEnv("SANAD_INTERNAL_API_KEY");

const APP_URL =
  Deno.env.get("PUBLIC_APP_BASE_URL") ||
  "https://app.sanadflow.com";

const SUPABASE_HEADERS = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

function mustGetEnv(name: string): string {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function safeError(error: unknown): string {
  const value =
    error instanceof Error
      ? error.message
      : String(error ?? "unknown_error");

  return value.length > 1000
    ? `${value.slice(0, 1000)}…`
    : value;
}

async function callRpc<T>(
  name: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/${name}`,
    {
      method: "POST",
      headers: SUPABASE_HEADERS,
      body: JSON.stringify(payload),
    },
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `rpc_${name}_${response.status}:${text}`,
    );
  }

  return (text ? JSON.parse(text) : null) as T;
}

function buildWelcomeMessage(
  displayName?: string | null,
): string {
  const greeting = displayName
    ? `أهلًا ${displayName} 👋`
    : "أهلًا بك في سند 👋";

  return [
    greeting,
    "",
    "سند يساعدك على حفظ إشعاراتك المالية وتنظيمها ومراجعتها والتحقق منها والرجوع إليها بسهولة.",
    "",
    "عند إنشاء حسابك وتثبيت تطبيق سند ستتمكن من:",
    "• الاحتفاظ بسجل عملياتك في مكان واحد",
    "• متابعة حالة الإشعارات التي رفعتها",
    "• الوصول إلى عملياتك وتقاريرك بسهولة",
    "• مشاركة الإشعارات المالية مباشرة إلى سند دون الحاجة إلى واتساب",
    "",
    "افتح صفحة التثبيت الذكية، وستظهر لك الخطوات المناسبة لجهازك:",
    `${APP_URL}/install/`,
  ].join("\n");
}

async function sendWhatsAppText(
  recipient: string,
  body: string,
): Promise<string> {
  const response = await fetch(
    `https://graph.facebook.com/v20.0/${META_PHONE_ID}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${META_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "text",
        text: {
          preview_url: true,
          body,
        },
      }),
    },
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `meta_send_${response.status}:${text}`,
    );
  }

  const payload = JSON.parse(text);
  const messageId = payload?.messages?.[0]?.id;

  if (!messageId) {
    throw new Error(
      `meta_send_missing_message_id:${text}`,
    );
  }

  return String(messageId);
}

type ClaimedContact = {
  contact_id: string;
  phone: string;
  wa_id?: string | null;
  display_name?: string | null;
  version?: number | null;
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        error: "method_not_allowed",
      },
      405,
    );
  }

  if (
    request.headers.get("x-sanad-internal-key") !==
      INTERNAL_KEY
  ) {
    return jsonResponse(
      {
        ok: false,
        error: "forbidden",
      },
      403,
    );
  }

  try {
    const input = await request
      .json()
      .catch(() => ({}));

    const requestedLimit = Number(input?.limit ?? 10);

    const limit = Number.isFinite(requestedLimit)
      ? Math.max(
          1,
          Math.min(Math.trunc(requestedLimit), 25),
        )
      : 10;

    await callRpc<number>(
      "release_stale_whatsapp_welcome_claims",
      {
        p_older_than: "10 minutes",
      },
    );

    const claimed = await callRpc<{
      items?: ClaimedContact[];
      count?: number;
    }>(
      "claim_whatsapp_welcome_batch",
      {
        p_limit: limit,
      },
    );

    const items = Array.isArray(claimed?.items)
      ? claimed.items
      : [];

    const results: Array<Record<string, unknown>> = [];

    for (const item of items) {
      const recipient = item.wa_id || item.phone;

      try {
        const messageId = await sendWhatsAppText(
          recipient,
          buildWelcomeMessage(item.display_name),
        );

        await callRpc(
          "mark_whatsapp_welcome_result",
          {
            p_contact_id: item.contact_id,
            p_status: "sent",
            p_message_id: messageId,
            p_error: null,
            p_version: item.version || 1,
            p_metadata: {
              worker:
                "sanad-v3-whatsapp-onboarding",
            },
          },
        );

        results.push({
          contact_id: item.contact_id,
          status: "sent",
          message_id: messageId,
        });
      } catch (error) {
        const detail = safeError(error);

        await callRpc(
          "mark_whatsapp_welcome_result",
          {
            p_contact_id: item.contact_id,
            p_status: "failed",
            p_message_id: null,
            p_error: detail,
            p_version: item.version || 1,
            p_metadata: {
              worker:
                "sanad-v3-whatsapp-onboarding",
            },
          },
        ).catch(() => undefined);

        results.push({
          contact_id: item.contact_id,
          status: "failed",
          error: detail,
        });
      }
    }

    return jsonResponse({
      ok: true,
      claimed: items.length,
      results,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: safeError(error),
      },
      500,
    );
  }
});
