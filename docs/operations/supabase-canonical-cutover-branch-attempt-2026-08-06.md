# Canonical baseline isolated branch attempt — 2026-08-06

## Scope

- Parent project: `hudbzlgclghlhazlduas`
- Temporary branch name: `canonical-cutover-validation-20260806`
- Temporary branch project ref: `fjnbrtqlrgpcapxxoemi`
- Temporary branch id: `6ff40b14-efd6-4313-a51c-7c9cc4ae8723`
- Data copied: no
- Approved hourly rate: `$0.01344/hour`
- Created at: `2026-08-06T16:50:55.473722Z`
- Deletion confirmed at approximately: `2026-08-06T17:03:13Z`
- Approximate active duration: `12m 18s`
- Estimated cost: `$0.00275`

## Result

The branch reproduced the known historical replay failure. Supabase applied only:

- `20260702130842_fix_yemen_phone_normalization_leading_zero`

The branch then reported `MIGRATIONS_FAILED`, confirming again that the historical migration directory is not a valid empty-database bootstrap.

## Canonical baseline replay attempt

A guarded GitHub Actions workflow was prepared to:

1. target only `fjnbrtqlrgpcapxxoemi`;
2. reject the production ref `hudbzlgclghlhazlduas`;
3. assemble the two baseline parts;
4. require exactly `1,375,100` bytes and SHA-256 `8d66799f37b3177644efe9ab2a5a70e3499f26c102f59b65c674fc96c8d69dcc`;
5. apply SQL through the official Supabase Management API; and
6. verify the expected schema counts and critical operation-document contracts.

GitHub Actions remained queued without receiving a runner. To avoid paying for idle infrastructure, the temporary branch was deleted before the workflow executed. The one-off workflow containing the expired branch ref was then removed from the PR branch.

## Safety outcome

- Production schema changed: no
- Production migration ledger changed: no
- Application or business rows changed: no
- Edge Functions deployed: no
- PR #170 merged or deployed: no
- Temporary Supabase branch deleted: yes
- Billing stopped: yes

## Follow-up

The replay workflow design remains documented by commit history. A future attempt must create a new temporary branch, insert its new ref into a freshly reviewed one-off workflow, run immediately when GitHub Actions runners are available, capture evidence, and delete the branch regardless of success or failure.
