import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type RoutingJob = {
  job_id: string;
  operation_id: string;
  claim_token: string;
  attempt_count: number;
  max_attempts: number;
  pipeline_run_id?: string | null;
  source: string;
};

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const WORKER_NAME = "operation_routing";
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function safeMessage(value: unknown): string {
  return (value instanceof Error
    ? value.message
    : String(value ?? "unknown_error"))
    .slice(0, 1800);
}

async function validateToken(token: string): Promise<boolean> {
  if (!token) return false;
  const { data, error } = await sb.rpc("validate_sanad_worker_token", {
    p_worker_name: WORKER_NAME,
    p_token: token,
  });
  return !error && data === true;
}

async function markFailed(
  token: string,
  job: RoutingJob,
  error: unknown,
): Promise<string> {
  const message = safeMessage(error);
  const retryable = error instanceof DOMException ||
    /timeout|network|fetch|connection|temporar|rate limit/i.test(message);
  const { data, error: checkpointError } = await sb.rpc(
    "fail_operation_routing_job",
    {
      p_worker_token: token,
      p_job_id: job.job_id,
      p_claim_token: job.claim_token,
      p_retryable: retryable,
      p_error_code: retryable
        ? "routing_worker_transient"
        : "routing_worker_error",
      p_error_message: message,
    },
  );
  if (checkpointError) {
    throw new Error(`routing_failure_checkpoint:${checkpointError.message}`);
  }
  return String(data || "unknown");
}

async function processJob(token: string, job: RoutingJob) {
  const startedAt = Date.now();
  try {
    const { data, error } = await sb.rpc("execute_operation_routing_job", {
      p_worker_token: token,
      p_job_id: job.job_id,
      p_claim_token: job.claim_token,
    });
    if (error) throw new Error(`routing_execute:${error.message}`);
    return {
      ok: true,
      job_id: job.job_id,
      operation_id: job.operation_id,
      duration_ms: Date.now() - startedAt,
      result: data,
    };
  } catch (error) {
    const state = await markFailed(token, job, error);
    return {
      ok: false,
      job_id: job.job_id,
      operation_id: job.operation_id,
      duration_ms: Date.now() - startedAt,
      state,
      error: safeMessage(error),
    };
  }
}

async function requestDrain(): Promise<void> {
  const { error } = await sb.rpc("request_operation_routing_dispatch", {
    p_reason: "worker_drain",
  });
  if (error) {
    console.error(JSON.stringify({
      function: "sanad-operation-routing-worker",
      event: "routing_drain_dispatch_failed",
      error: error.message.slice(0, 1000),
    }));
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "GET") {
    return json({ ok: true, service: "sanad-operation-routing-worker" });
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const token = request.headers.get("x-sanad-worker-token")?.trim() || "";
  if (!(await validateToken(token))) {
    return json({ ok: false, error: "unauthorized_worker" }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body?.limit ?? 5) || 5, 10));
  const { data, error } = await sb.rpc("claim_operation_routing_jobs", {
    p_worker_token: token,
    p_limit: limit,
    p_lease_seconds: 120,
  });
  if (error) {
    return json(
      { ok: false, error: "claim_failed", details: error.message },
      500,
    );
  }

  const jobs = (Array.isArray(data) ? data : []) as RoutingJob[];
  if (!jobs.length) {
    return json({ ok: true, claimed: 0, completed: 0, results: [] });
  }

  const results = await Promise.all(jobs.map((job) => processJob(token, job)));
  await requestDrain();
  return json({
    ok: results.every((item) =>
      item.ok || ["retry_scheduled", "failed", "dead_letter", "not_owned"]
        .includes(String(item.state))
    ),
    claimed: jobs.length,
    completed: results.filter((item) => item.ok).length,
    results,
  });
});
