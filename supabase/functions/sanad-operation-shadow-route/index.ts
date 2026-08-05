import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type JsonRecord = Record<string, unknown>;

type ShadowRun = {
  id: string;
  operation_id: string;
  status: string;
  normalized_output: JsonRecord | null;
  routing_decision: JsonRecord | null;
};

type MatchCandidate = {
  financial_account_id: string;
  business_id: string;
  financial_identifier_id: string;
  identifier_type: string;
  identifier_value_normalized: string;
  identifier_currency: string | null;
  is_primary: boolean;
  account_holder_name_normalized: string | null;
};

const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_KEY = mustGetEnv("SANAD_INTERNAL_API_KEY");

const SERVICE_HEADERS = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (request.headers.get("x-sanad-internal-key") !== INTERNAL_KEY) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const body = await request.json() as JsonRecord;
    const runId = stringValue(body.run_id);
    if (!runId) return json({ ok: false, error: "run_id_required" }, 400);

    const run = await getShadowRun(runId);
    if (!run) return json({ ok: false, error: "shadow_run_not_found" }, 404);
    if (run.status !== "completed") {
      return json({ ok: false, error: "shadow_run_not_completed" }, 409);
    }

    const quality = run.routing_decision ?? {};
    const qualityEligible = quality.eligible === true;
    const normalized = run.normalized_output ?? {};

    if (!qualityEligible) {
      const accountMatch = {
        status: "skipped_quality_gate",
        candidate_count: 0,
        selected_financial_account_id: null,
        selected_business_id: null,
        selected_financial_identifier_id: null,
        candidate_account_ids: [],
        candidate_business_ids: [],
        reasons: ["quality_gate_not_eligible"],
      };
      await updateRoutingDecision(run.id, quality, accountMatch);
      return json({
        ok: true,
        run_id: run.id,
        operation_id: run.operation_id,
        account_match: accountMatch,
      });
    }

    const entityCode = stringValue(normalized.financialEntityCode);
    const identifierType = stringValue(normalized.receiverIdentifierType);
    const identifierValue = stringValue(normalized.receiverIdentifierValue);
    const currency = stringValue(normalized.currency);

    if (!entityCode || !identifierType || !identifierValue) {
      const accountMatch = {
        status: "skipped_quality_gate",
        candidate_count: 0,
        selected_financial_account_id: null,
        selected_business_id: null,
        selected_financial_identifier_id: null,
        candidate_account_ids: [],
        candidate_business_ids: [],
        reasons: ["routing_basis_incomplete"],
      };
      await updateRoutingDecision(run.id, quality, accountMatch);
      return json({ ok: true, run_id: run.id, operation_id: run.operation_id, account_match: accountMatch });
    }

    const normalizedIdentifier = normalizeIdentifier(identifierType, identifierValue);
    if (!normalizedIdentifier) {
      const accountMatch = {
        status: "skipped_quality_gate",
        candidate_count: 0,
        selected_financial_account_id: null,
        selected_business_id: null,
        selected_financial_identifier_id: null,
        candidate_account_ids: [],
        candidate_business_ids: [],
        reasons: ["identifier_normalization_failed"],
      };
      await updateRoutingDecision(run.id, quality, accountMatch);
      return json({ ok: true, run_id: run.id, operation_id: run.operation_id, account_match: accountMatch });
    }

    const candidates = deduplicateCandidates(await matchCandidates({
      entityCode,
      identifierType,
      normalizedIdentifier,
      currency,
    }));

    const accountMatch = decideMatch(candidates, {
      entityCode,
      identifierType,
      normalizedIdentifier,
      currency,
    });

    await updateRoutingDecision(run.id, quality, accountMatch);

    return json({
      ok: true,
      run_id: run.id,
      operation_id: run.operation_id,
      account_match: accountMatch,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: "shadow_route_internal_error", detail: message.slice(0, 500) }, 500);
  }
});

async function getShadowRun(runId: string): Promise<ShadowRun | null> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/operation_analysis_shadow_runs?select=id,operation_id,status,normalized_output,routing_decision&id=eq.${encodeURIComponent(runId)}&limit=1`,
    { headers: SERVICE_HEADERS },
  );
  if (!response.ok) throw new Error(`shadow_run_read_${response.status}`);
  const rows = await response.json() as ShadowRun[];
  return rows[0] ?? null;
}

async function matchCandidates(input: {
  entityCode: string;
  identifierType: string;
  normalizedIdentifier: string;
  currency: string | null;
}): Promise<MatchCandidate[]> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/sanad_shadow_match_financial_identifier`,
    {
      method: "POST",
      headers: SERVICE_HEADERS,
      body: JSON.stringify({
        p_financial_entity_code: input.entityCode,
        p_identifier_type: input.identifierType,
        p_identifier_value_normalized: input.normalizedIdentifier,
        p_currency: input.currency,
      }),
    },
  );
  if (!response.ok) throw new Error(`shadow_match_rpc_${response.status}`);
  return await response.json() as MatchCandidate[];
}

function decideMatch(
  candidates: MatchCandidate[],
  basis: {
    entityCode: string;
    identifierType: string;
    normalizedIdentifier: string;
    currency: string | null;
  },
): JsonRecord {
  const candidateAccountIds = [...new Set(candidates.map((candidate) => candidate.financial_account_id))];
  const candidateBusinessIds = [...new Set(candidates.map((candidate) => candidate.business_id))];

  if (candidates.length === 0) {
    return {
      status: "unmatched",
      candidate_count: 0,
      selected_financial_account_id: null,
      selected_business_id: null,
      selected_financial_identifier_id: null,
      candidate_account_ids: [],
      candidate_business_ids: [],
      basis: {
        financial_entity_code: basis.entityCode,
        identifier_type: basis.identifierType,
        identifier_value_normalized: basis.normalizedIdentifier,
        currency: basis.currency,
      },
      reasons: ["no_verified_routable_identifier_match"],
    };
  }

  if (candidates.length > 1) {
    return {
      status: "ambiguous",
      candidate_count: candidates.length,
      selected_financial_account_id: null,
      selected_business_id: null,
      selected_financial_identifier_id: null,
      candidate_account_ids: candidateAccountIds,
      candidate_business_ids: candidateBusinessIds,
      basis: {
        financial_entity_code: basis.entityCode,
        identifier_type: basis.identifierType,
        identifier_value_normalized: basis.normalizedIdentifier,
        currency: basis.currency,
      },
      reasons: ["multiple_verified_routable_identifier_matches"],
    };
  }

  const selected = candidates[0]!;
  return {
    status: "matched",
    candidate_count: 1,
    selected_financial_account_id: selected.financial_account_id,
    selected_business_id: selected.business_id,
    selected_financial_identifier_id: selected.financial_identifier_id,
    candidate_account_ids: candidateAccountIds,
    candidate_business_ids: candidateBusinessIds,
    basis: {
      financial_entity_code: basis.entityCode,
      identifier_type: basis.identifierType,
      identifier_value_normalized: basis.normalizedIdentifier,
      currency: basis.currency,
    },
    reasons: [],
  };
}

async function updateRoutingDecision(
  runId: string,
  quality: JsonRecord,
  accountMatch: JsonRecord,
): Promise<void> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/operation_analysis_shadow_runs?id=eq.${encodeURIComponent(runId)}`,
    {
      method: "PATCH",
      headers: SERVICE_HEADERS,
      body: JSON.stringify({
        routing_decision: {
          ...quality,
          account_match: accountMatch,
        },
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!response.ok) throw new Error(`shadow_run_patch_${response.status}`);
}

function deduplicateCandidates(candidates: MatchCandidate[]): MatchCandidate[] {
  const map = new Map<string, MatchCandidate>();
  for (const candidate of candidates) {
    const key = candidate.financial_identifier_id ||
      `${candidate.financial_account_id}:${candidate.identifier_type}:${candidate.identifier_value_normalized}`;
    const existing = map.get(key);
    if (!existing || (!existing.is_primary && candidate.is_primary)) map.set(key, candidate);
  }
  return [...map.values()];
}

function normalizeIdentifier(type: string, value: string): string {
  if (type === "phone_number") return normalizeYemeniPhone(value);
  return toLatinDigits(value).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeYemeniPhone(value: string): string {
  let digits = toLatinDigits(value).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("967")) return digits;
  if (digits.startsWith("0") && digits.length >= 9) digits = digits.slice(1);
  return digits.length === 9 ? `967${digits}` : digits;
}

function toLatinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mustGetEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name}_required`);
  return value;
}

function json(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
