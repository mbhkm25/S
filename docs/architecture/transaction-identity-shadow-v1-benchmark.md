# Transaction Identity Shadow v1 — Benchmark

Date: 2026-08-08

## Scope
Historical benchmark against the operations currently stored in SANAD. The purpose is to validate identity/reuse rules before any user-facing warning or enforcement.

## Key finding before implementation
Reference numbers repeat frequently in real SANAD data. A reference number therefore cannot be treated as a globally unique key, and cannot safely be made unique even within an entity without additional evidence.

Examples observed during exploration:
- Alomqy Mobile: 55 analyzed operations, 54 with references, 31 distinct references.
- Kuraimi Haseb: 39 analyzed operations, 39 with references, only 8 distinct references.
- Bin Dowal Exchange: 14 analyzed operations, 14 with references, 3 distinct references.
- Albusaery Mobile: 5 analyzed operations, 5 with references, 3 distinct references.
- Bin Dowal Pay: 3 analyzed operations sharing one reference family in the current sample.

Historical data also shows that destination extraction can vary across different analyzer versions for the same underlying notification: an identifier may appear as receiver_account in an older analysis, merchant_point in a newer analysis, or be absent. This is why destination disagreement is not enough to declare a transaction unique.

## Shadow backfill results
Total operations present: 162.
Analyzed/completed operations evaluated by Identity Shadow v1: 153.
Operations still pending/non-completed: 9.

Classification of the 153 evaluated operations:

| Classification | Count | Meaning in v1 |
| --- | ---: | --- |
| exact_duplicate | 75 | Strong deterministic prior-match evidence |
| probable_duplicate | 7 | Same entity/reference and amount/currency, but destination evidence differs or is incomplete |
| unique_candidate | 49 | No earlier v1 identity match found |
| identity_insufficient | 22 | Entity/reference evidence insufficient for a safe decision |

### Exact duplicate evidence
- 49 cases matched a prior operation by identical file SHA-256.
- 26 cases matched by the semantic fingerprint: entity + reference + destination + amount + currency.

### Probable duplicate evidence
All 7 probable cases share entity/reference plus amount/currency with an older operation, while destination evidence is missing or differs. Examples include historical shifts between receiver-account extraction and merchant-point extraction. These remain shadow-only and must not be enforced as exact duplicates in v1.

## Normalization verification
Verified examples:
- Arabic digits in `٨-٣٤٢٠٣٨٤٥٨` normalize to `8-342038458`.
- `825-121` normalizes to identifier `825121`.
- A legacy Arabic Alomqy entity name normalizes to `alomqy_mobile`.

## Security posture
`private.operation_identity_shadow_runs` and `private.operation_submissions` are internal-only tables. RLS is enabled and SELECT/WRITE privileges are revoked from `anon` and `authenticated`. Supabase Security Advisor reports the expected INFO notice for private deny-by-default tables with no client policies; no new public RPC was introduced by this feature.

## Performance posture
Supabase Performance Advisor identified one missing covering index on `operation_submissions.matched_operation_id`. A follow-up migration adds `operation_submissions_matched_operation_idx`.

## Decision for stage 1
Identity Shadow v1 remains non-enforcing:
- no duplicate UI;
- no Payment Inbox behavior change;
- no operation merge/deletion;
- no Free/Pro quota change;
- no uniqueness constraint on reference or fingerprint.

The seven probable cases are the main review cohort for the next phase. Warning/enforcement must continue to distinguish exact deterministic reuse from historical extraction ambiguity.
