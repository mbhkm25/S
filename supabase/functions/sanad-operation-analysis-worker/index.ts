import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type AnalysisJob = {
  job_id: string;
  operation_id: string;
  attempt_count: number;
  max_attempts: number;
  source: string;
};

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_KEY = mustEnv("SANAD_INTERNAL_API_KEY");
const WORKER_NAME = "operation_analysis";
const ANALYZER_URL = `${SUPABASE_URL}/functions/v1/sanad-v3-analyze-operation`;
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
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function isRetryableStatus(status: number): boolean {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
}

function safeMessage(value: unknown): string {
  if (value instanceof Error) return value.message.slice(0, 1800);
  return String(value ?? "unknown_error").slice(0, 1800);
}

async function validateToken(req: Request): Promise<boolean> {
  const token = req.headers.get("x-sanad-worker-token") ?? "";
  if (!token) return false;
  const { data, error } = await sb.rpc("validate_sanad_worker_token", {
    p_worker_name: WORKER_NAME,
    p_token: token,
  });
  return !error && data === true;
}

async function markFailed(
  job: AnalysisJob,
  workerId: string,
  retryable: boolean,
  code: string,
  message: string,
  status?: number,
) {
  const { data, error } = await sb.rpc("fail_operation_analysis_job", {
    p_job_id: job.job_id,
    p_worker_id: workerId,
    p_retryable: retryable,
    p_error_code: code,
    p_error_message: message,
    p_http_status: status ?? null,
  });
  if (error) throw new Error(`fail_job_rpc:${error.message}`);
  return data as string;
}

async function processJob(job: AnalysisJob, workerId: string) {
  const started = Date.now();
  try {
    const response = await fetch(ANALYZER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sanad-internal-key": INTERNAL_KEY,
      },
      body: JSON.stringify({
        operation_id: job.operation_id,
        gateway: "sanad-operation-analysis-worker",
        queue_job_id: job.job_id,
        queue_attempt: job.attempt_count,
      }),
      signal: AbortSignal.timeout(50000),
    });

    const raw = await response.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = { raw: raw.slice(0, 1000) };
    }

    if (!response.ok) {
      const state = await markFailed(
        job,
        workerId,
        isRetryableStatus(response.status),
        `analyzer_http_${response.status}`,
        raw || `Analyzer returned HTTP ${response.status}`,
        response.status,
      );
      return { job_id: job.job_id, operation_id: job.operation_id, ok: false, state, status: response.status };
    }

    const { data: operation, error: operationError } = await sb
      .from("operations")
      .select("ai_status,analysis_completed_at,ai_error")
      .eq("id", job.operation_id)
      .maybeSingle();
    if (operationError) throw new Error(`operation_status:${operationError.message}`);

    if (operation?.ai_status !== "completed") {
      const state = await markFailed(
        job,
        workerId,
        true,
        "analysis_not_completed",
        String(operation?.ai_error || `Analyzer returned successfully but ai_status=${operation?.ai_status ?? "missing"}`),
        202,
      );
      return { job_id: job.job_id, operation_id: job.operation_id, ok: false, state, status: 202 };
    }

    const { data: completed, error: completeError } = await sb.rpc("complete_operation_analysis_job", {
      p_job_id: job.job_id,
      p_worker_id: workerId,
      p_result_metadata: {
        duration_ms: Date.now() - started,
        analyzer_status: response.status,
        analysis_completed_at: operation.analysis_completed_at,
        source: job.source,
      },
    });
    if (completeError) throw new Error(`complete_job_rpc:${completeError.message}`);
    return {
      job_id: job.job_id,
      operation_id: job.operation_id,
      ok: completed === true,
      state: "completed",
      duration_ms: Date.now() - started,
      analyzer: payload,
    };
  } catch (error) {
    const message = safeMessage(error);
    const retryable = error instanceof DOMException || /timeout|network|fetch|connection/i.test(message);
    const state = await markFailed(
      job,
      workerId,
      retryable,
      retryable ? "worker_transient_error" : "worker_error",
      message,
    );
    return { job_id: job.job_id, operation_id: job.operation_id, ok: false, state, error: message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!(await validateToken(req))) return json({ ok: false, error: "unauthorized_worker" }, 401);

  const body = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body?.limit ?? 5) || 5, 5));
  const workerId = `${WORKER_NAME}:${crypto.randomUUID()}`;

  const { data, error } = await sb.rpc("claim_operation_analysis_jobs", {
    p_worker_id: workerId,
    p_limit: limit,
    p_lease_seconds: 120,
  });
  if (error) return json({ ok: false, error: "claim_failed", details: error.message }, 500);

  const jobs = (Array.isArray(data) ? data : []) as AnalysisJob[];
  if (jobs.length === 0) return json({ ok: true, claimed: 0, completed: 0, results: [] });

  const results = await Promise.all(jobs.map((job) => processJob(job, workerId)));
  return json({
    ok: results.every((item) => item.ok || ["retry_scheduled", "failed", "dead_letter"].includes(String(item.state))),
    claimed: jobs.length,
    completed: results.filter((item) => item.ok).length,
    results,
  });
});
