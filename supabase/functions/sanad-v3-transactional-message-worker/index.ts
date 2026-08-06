const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
const META_GRAPH_VERSION = "v20.0";
const WORKER_NAME = "transactional_messages";

type ClaimedMessage = {
  id: string;
  claim_token: string;
  phone: string;
  delivery_kind: "template" | "text";
  template_name?: string | null;
  template_language: string;
  template_parameters: unknown[];
  text_body?: string | null;
  attempt_count: number;
  max_attempts: number;
  pipeline_run_id?: string | null;
};

class DeliveryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DeliveryError";
  }
}

function mustGetEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function serviceHeaders(extra: HeadersInit = {}): HeadersInit {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

async function serviceJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const result = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: serviceHeaders(init.headers || {}),
    signal: init.signal || AbortSignal.timeout(15_000),
  });
  const text = await result.text();
  if (!result.ok) {
    throw new DeliveryError(
      "supabase_request_failed",
      `supabase_${result.status}: ${text.slice(0, 700)}`,
      result.status === 408 || result.status === 429 || result.status >= 500,
      result.status,
    );
  }
  return (text ? JSON.parse(text) : null) as T;
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  return await serviceJson<T>(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function validateToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    return await rpc<boolean>("validate_sanad_worker_token", {
      p_worker_name: WORKER_NAME,
      p_token: token,
    }) === true;
  } catch {
    return false;
  }
}

async function resolveWorkerToken(req: Request): Promise<string | null> {
  const supplied = req.headers.get("x-sanad-worker-token")?.trim() || "";
  if (await validateToken(supplied)) return supplied;

  const bearer = req.headers.get("authorization")
    ?.replace(/^Bearer\s+/i, "").trim() || "";
  if (!bearer) return null;
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${bearer}`,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json().catch(() => null);
  const userId = typeof user?.id === "string" ? user.id : "";
  if (!userId) return null;
  try {
    const token = await rpc<string>(
      "get_transactional_worker_token_for_admin",
      {
        p_user_id: userId,
      },
    );
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  }
}

function retryableMetaStatus(status: number): boolean {
  return [408, 409, 425, 429].includes(status) || status >= 500;
}

async function sendMessage(message: ClaimedMessage): Promise<string> {
  // Meta credentials are required only after worker authentication and a
  // durable claim. Keeping them lazy prevents a configuration issue from
  // turning every unauthenticated request into a runtime boot failure.
  const metaAccessToken = Deno.env.get("META_WA_ACCESS_TOKEN")?.trim();
  const metaPhoneNumberId = Deno.env.get("META_WA_PHONE_NUMBER_ID")?.trim();
  if (!metaAccessToken || !metaPhoneNumberId) {
    throw new DeliveryError(
      "meta_configuration_missing",
      "Transactional WhatsApp credentials are not configured",
      true,
    );
  }
  let payload: Record<string, unknown>;
  if (message.delivery_kind === "template") {
    if (!message.template_name) {
      throw new DeliveryError(
        "template_name_missing",
        "Template outbox item is missing its template name",
        false,
      );
    }
    const parameters = Array.isArray(message.template_parameters)
      ? message.template_parameters.map((value) => ({
        type: "text",
        text: String(value),
      }))
      : [];
    const template: Record<string, unknown> = {
      name: message.template_name,
      language: { code: message.template_language },
    };
    if (parameters.length > 0) {
      template.components = [{ type: "body", parameters }];
    }
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: message.phone,
      type: "template",
      template,
    };
  } else {
    const body = message.text_body?.trim();
    if (!body) {
      throw new DeliveryError(
        "text_body_missing",
        "Text outbox item is missing its body",
        false,
      );
    }
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: message.phone,
      type: "text",
      text: { preview_url: true, body },
    };
  }

  const metaResponse = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${metaPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${metaAccessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const text = await metaResponse.text();
  if (!metaResponse.ok) {
    throw new DeliveryError(
      `meta_http_${metaResponse.status}`,
      `meta_${metaResponse.status}: ${text.slice(0, 700)}`,
      retryableMetaStatus(metaResponse.status),
      metaResponse.status,
    );
  }
  const data = text ? JSON.parse(text) : {};
  const messageId = data?.messages?.[0]?.id;
  if (!messageId) {
    throw new DeliveryError(
      "meta_message_id_missing",
      "Meta accepted the request without returning a message ID",
      true,
    );
  }
  return String(messageId);
}

function asDeliveryError(error: unknown): DeliveryError {
  if (error instanceof DeliveryError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new DeliveryError(
    "transactional_worker_error",
    message.slice(0, 900),
    error instanceof DOMException ||
      /timeout|network|fetch|connection/i.test(message),
  );
}

async function processMessage(token: string, message: ClaimedMessage) {
  const startedAt = Date.now();
  try {
    const messageId = await sendMessage(message);
    const state = await rpc<string>("mark_transactional_message_result_v2", {
      p_worker_token: token,
      p_id: message.id,
      p_claim_token: message.claim_token,
      p_sent: true,
      p_retryable: false,
      p_message_id: messageId,
      p_error_code: null,
      p_error: null,
    });
    return {
      ok: state === "completed" || state === "not_owned",
      id: message.id,
      state,
      external_message_id: messageId,
      duration_ms: Date.now() - startedAt,
    };
  } catch (error) {
    const deliveryError = asDeliveryError(error);
    try {
      const state = await rpc<string>("mark_transactional_message_result_v2", {
        p_worker_token: token,
        p_id: message.id,
        p_claim_token: message.claim_token,
        p_sent: false,
        p_retryable: deliveryError.retryable,
        p_message_id: null,
        p_error_code: deliveryError.code,
        p_error: deliveryError.message,
      });
      return {
        ok: false,
        id: message.id,
        state,
        error: deliveryError.message,
        duration_ms: Date.now() - startedAt,
      };
    } catch (checkpointError) {
      return {
        ok: false,
        id: message.id,
        state: "failure_checkpoint_failed",
        error: deliveryError.message,
        checkpoint_error: checkpointError instanceof Error
          ? checkpointError.message
          : String(checkpointError),
        duration_ms: Date.now() - startedAt,
      };
    }
  }
}

async function requestDrain(): Promise<void> {
  try {
    await rpc("request_transactional_message_dispatch", {
      p_reason: "worker_drain",
    });
  } catch (error) {
    console.error(JSON.stringify({
      function: "sanad-v3-transactional-message-worker",
      event: "transactional_drain_dispatch_failed",
      error: error instanceof Error
        ? error.message.slice(0, 1000)
        : String(error),
    }));
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    return response({
      ok: true,
      service: "sanad-v3-transactional-message-worker",
    });
  }
  if (req.method !== "POST") {
    return response({ ok: false, error: "method_not_allowed" }, 405);
  }

  const token = await resolveWorkerToken(req);
  if (!token) {
    return response({ ok: false, error: "unauthorized_worker" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestedLimit = Number(body?.limit || 25);
    const limit = Math.max(
      1,
      Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 25, 100),
    );
    const messages = await rpc<ClaimedMessage[]>(
      "claim_transactional_message_batch",
      {
        p_worker_token: token,
        p_limit: limit,
        p_lease_seconds: 120,
      },
    );
    if (!Array.isArray(messages) || messages.length === 0) {
      return response({
        ok: true,
        claimed: 0,
        completed: 0,
        sent: 0,
        failed: 0,
        results: [],
      });
    }

    const results = [];
    for (const message of messages) {
      results.push(await processMessage(token, message));
    }
    await requestDrain();
    return response({
      ok: results.every((item) =>
        item.ok || ["retry_scheduled", "failed", "dead_letter", "not_owned"]
          .includes(String(item.state))
      ),
      claimed: messages.length,
      completed: results.filter((item) => item.ok).length,
      sent: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      function: "sanad-v3-transactional-message-worker",
      event: "worker_failed",
      error: message.slice(0, 1000),
    }));
    return response(
      { ok: false, error: "worker_failed", detail: message },
      500,
    );
  }
});
