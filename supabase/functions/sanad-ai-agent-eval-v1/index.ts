import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.110.0";
import {
  MAX_PARALLEL_TOOLS,
  MAX_TOOL_CALLS,
  MAX_TOOL_ROUNDS,
  MODEL,
  SYSTEM_INSTRUCTION,
  TOOLS,
  chooseThinking,
  cleanText,
  detectClarification,
  extractText,
  extractToolCalls,
  geminiInteraction,
  inferScope,
  userInput,
  verifyAndRepair,
  type Json,
} from "../_shared/sanad-agent-core.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const ALLOWED_MODELS = new Set([
  MODEL,
  "gemini-3.1-pro-preview",
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function rpc<T = unknown>(client: SupabaseClient, name: string, args: Json = {}): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}:${error.message}`);
  return data as T;
}

function asObject(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function caseFixtures(testCase: Json): Json {
  return asObject(asObject(testCase.metadata).tool_fixtures);
}

function businessIdForCase(testCase: Json): string | null {
  const value = asObject(testCase.user_scenario).business_id;
  return typeof value === "string" && value ? value : null;
}

async function isAdmin(userClient: SupabaseClient) {
  const { data, error } = await userClient.rpc("is_current_platform_admin");
  if (error) throw new Error(`admin_check:${error.message}`);
  return data === true;
}

async function runCase(testCase: Json, model: string) {
  const input = cleanText(testCase.input_text, 4000);
  const metadata = asObject(testCase.metadata);
  const fixtures = caseFixtures(testCase);
  const businessId = businessIdForCase(testCase);
  const thinkingLevel = chooseThinking(input);
  const started = Date.now();

  const actualToolNames: string[] = [];
  const toolArguments: Record<string, Json> = {};
  const toolOutputs: Array<{ name: string; args: Json; output: unknown }> = [];

  let interaction = await geminiInteraction({
    model,
    system_instruction: SYSTEM_INSTRUCTION,
    input: userInput(input, [], businessId),
    tools: TOOLS,
    generation_config: { thinking_level: thinkingLevel, temperature: 0.2 },
  }, GEMINI_API_KEY);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const calls = extractToolCalls(interaction);
    if (!calls.length) break;
    if (actualToolNames.length + calls.length > MAX_TOOL_CALLS) throw new Error("tool_call_limit_exceeded");
    if (calls.length > MAX_PARALLEL_TOOLS) throw new Error("parallel_tool_limit_exceeded");

    const results = calls.map((call) => {
      actualToolNames.push(call.name);
      toolArguments[call.name] = call.arguments;

      const hasFixture = Object.prototype.hasOwnProperty.call(fixtures, call.name);
      const output = hasFixture
        ? fixtures[call.name]
        : { error: "eval_fixture_missing", requested_tool: call.name };

      toolOutputs.push({ name: call.name, args: call.arguments, output });

      return {
        type: "function_result",
        name: call.name,
        call_id: call.id,
        result: [{ type: "text", text: JSON.stringify(output) }],
      };
    });

    const previousId = cleanText(interaction.id, 200);
    if (!previousId) throw new Error("missing_interaction_id");

    interaction = await geminiInteraction({
      model,
      previous_interaction_id: previousId,
      input: results,
      tools: TOOLS,
      generation_config: { thinking_level: thinkingLevel, temperature: 0.2 },
    }, GEMINI_API_KEY);
  }

  const remaining = extractToolCalls(interaction);
  if (remaining.length) throw new Error("tool_round_limit_exceeded");

  const text = extractText(interaction);
  if (!text) throw new Error("empty_model_answer");

  const verified = verifyAndRepair(text, toolOutputs);
  const latency = Date.now() - started;
  const scope = inferScope(actualToolNames);

  return {
    actual_response: verified.text,
    actual_tool_names: actualToolNames,
    latency_ms: latency,
    raw_output: {
      response: {
        text: verified.text,
        scope,
        period: verified.period,
        currencies: verified.currencies,
        needs_clarification: detectClarification(verified.text),
      },
      verification: verified.verification,
      tool_arguments: toolArguments,
      model,
      thinking_level: thinkingLevel,
      fixture_mode: true,
      category: metadata.category ?? null,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
    return json({ ok: false, error: "runtime_not_configured" }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "authentication_required" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authHeader.slice(7);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return json({ ok: false, error: "invalid_session" }, 401);

  let admin = false;
  try { admin = await isAdmin(userClient); } catch (cause) {
    return json({ ok: false, error: cleanText(cause instanceof Error ? cause.message : cause, 500) }, 403);
  }
  if (!admin) return json({ ok: false, error: "platform_admin_required" }, 403);

  let body: Json = {};
  try { body = await req.json(); } catch { body = {}; }

  const requestedModel = cleanText(body.model, 120) || MODEL;
  if (!ALLOWED_MODELS.has(requestedModel)) return json({ ok: false, error: "model_not_allowed" }, 400);

  const assistantVersion = cleanText(body.assistant_version, 160)
    || `sanad-ai-agent-v1:${requestedModel}`;
  const runnerVersion = "sanad-agent-live-eval-v1";

  const suite = await rpc<unknown>(adminClient, "get_sanad_agent_eval_suite_v1");
  const cases = Array.isArray(suite) ? suite.filter((row) => row && typeof row === "object") as Json[] : [];
  if (!cases.length) return json({ ok: false, error: "eval_suite_empty" }, 500);

  const runId = await rpc<string>(adminClient, "start_sanad_agent_eval_run_v1", {
    p_assistant_version: assistantVersion,
    p_runner_version: runnerVersion,
    p_metadata: {
      model: requestedModel,
      initiated_by: authData.user.id,
      fixture_mode: true,
      suite_size: cases.length,
    },
  });

  const caseResults: Array<Json> = [];

  for (const testCase of cases) {
    const caseKey = cleanText(testCase.case_key, 160);
    if (!caseKey) continue;

    try {
      const result = await runCase(testCase, requestedModel);
      await rpc(adminClient, "record_sanad_agent_eval_result_v1", {
        p_run_id: runId,
        p_case_key: caseKey,
        p_actual_response: result.actual_response,
        p_actual_tool_names: result.actual_tool_names,
        p_latency_ms: result.latency_ms,
        p_raw_output: result.raw_output,
      });
      caseResults.push({
        case_key: caseKey,
        status: "recorded",
        latency_ms: result.latency_ms,
        tools: result.actual_tool_names,
      });
    } catch (cause) {
      const error = cleanText(cause instanceof Error ? cause.message : cause, 1000);
      await rpc(adminClient, "record_sanad_agent_eval_result_v1", {
        p_run_id: runId,
        p_case_key: caseKey,
        p_actual_response: `EVAL_ERROR: ${error}`,
        p_actual_tool_names: [],
        p_latency_ms: 2147483647,
        p_raw_output: {
          response: {
            text: `EVAL_ERROR: ${error}`,
            scope: asObject(testCase.metadata).expected_scope ?? "personal",
            currencies: [],
            needs_clarification: false,
          },
          verification: { passed: false, no_currency_merge: false },
          tool_arguments: {},
          model: requestedModel,
          fixture_mode: true,
          error,
        },
      });
      caseResults.push({ case_key: caseKey, status: "error", error });
    }
  }

  const gate = await rpc<Json>(adminClient, "finalize_sanad_agent_eval_run_v1", {
    p_run_id: runId,
    p_min_pass_rate: 95,
  });

  await adminClient.rpc("record_ai_usage", {
    p_request_id: crypto.randomUUID(),
    p_operation_id: null,
    p_source: "sanad_ai_live_eval_v1",
    p_purpose: "golden_suite",
    p_model: requestedModel,
    p_billing_mode: "standard",
    p_status: gate.release_gate_passed === true ? "completed" : "failed",
    p_latency_ms: caseResults.reduce((sum, item) => sum + Number(item.latency_ms || 0), 0),
    p_usage_metadata: {},
    p_metadata: {
      run_id: runId,
      runner_version: runnerVersion,
      suite_size: cases.length,
      release_gate_passed: gate.release_gate_passed === true,
      initiated_by: authData.user.id,
    },
  }).catch(() => undefined);

  return json({
    ok: true,
    run_id: runId,
    assistant_version: assistantVersion,
    runner_version: runnerVersion,
    model: requestedModel,
    gate,
    cases: caseResults,
  });
});
