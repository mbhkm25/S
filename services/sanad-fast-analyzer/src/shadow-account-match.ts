export interface ShadowAccountCandidate {
  financial_account_id: string;
  business_id: string;
  financial_identifier_id: string;
  identifier_type: string;
  identifier_value_normalized: string;
  identifier_currency: string | null;
  is_primary: boolean;
  account_holder_name_normalized: string | null;
}

export interface ShadowAccountMatchDecision {
  status: "matched" | "unmatched" | "ambiguous" | "skipped_quality_gate";
  candidateCount: number;
  selected: ShadowAccountCandidate | null;
  candidateAccountIds: string[];
  candidateBusinessIds: string[];
  reasons: string[];
}

export function decideShadowAccountMatch(
  routingEligible: boolean,
  candidates: ShadowAccountCandidate[],
): ShadowAccountMatchDecision {
  if (!routingEligible) {
    return {
      status: "skipped_quality_gate",
      candidateCount: 0,
      selected: null,
      candidateAccountIds: [],
      candidateBusinessIds: [],
      reasons: ["quality_gate_not_eligible"],
    };
  }

  const unique = deduplicateCandidates(candidates);
  if (unique.length === 0) {
    return {
      status: "unmatched",
      candidateCount: 0,
      selected: null,
      candidateAccountIds: [],
      candidateBusinessIds: [],
      reasons: ["no_verified_routable_identifier_match"],
    };
  }

  if (unique.length > 1) {
    return {
      status: "ambiguous",
      candidateCount: unique.length,
      selected: null,
      candidateAccountIds: unique.map((candidate) => candidate.financial_account_id),
      candidateBusinessIds: [...new Set(unique.map((candidate) => candidate.business_id))],
      reasons: ["multiple_verified_routable_identifier_matches"],
    };
  }

  return {
    status: "matched",
    candidateCount: 1,
    selected: unique[0] ?? null,
    candidateAccountIds: [unique[0]!.financial_account_id],
    candidateBusinessIds: [unique[0]!.business_id],
    reasons: [],
  };
}

function deduplicateCandidates(candidates: ShadowAccountCandidate[]): ShadowAccountCandidate[] {
  const byIdentifier = new Map<string, ShadowAccountCandidate>();
  for (const candidate of candidates) {
    const key = candidate.financial_identifier_id ||
      `${candidate.financial_account_id}:${candidate.identifier_type}:${candidate.identifier_value_normalized}`;
    const existing = byIdentifier.get(key);
    if (!existing || (!existing.is_primary && candidate.is_primary)) {
      byIdentifier.set(key, candidate);
    }
  }
  return [...byIdentifier.values()];
}
