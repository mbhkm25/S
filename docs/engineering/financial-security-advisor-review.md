# Financial Domain Supabase Advisor Review

Date: 2026-09-17
Environment: Supabase `develop`
Scope: SANAD Financial / Commercial / My Account / SANAD AI workstream.

## Purpose

This review records Supabase security/performance advisor output after the new domain migrations. It distinguishes findings introduced by this workstream from older project-wide findings so that unrelated cleanup is not mixed into PR #277.

## Security review

### RLS

The new financial/commercial domain tables use RLS and explicit authenticated policies where direct table access is part of the contract. The advisor still reports many `RLS Enabled No Policy` findings across the wider SANAD database; these belong to existing private/internal/administrative subsystems and are not automatically defects in this workstream.

No decision is made here to add permissive policies merely to silence the advisor. Tables intended to be service-only may legitimately have RLS enabled with no client policy.

Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

### `get_ai_financial_context_v2` SECURITY DEFINER exception

The advisor reports `get_ai_financial_context_v2(...)` as executable by `authenticated` while defined as `SECURITY DEFINER`.

This is currently **intentional and constrained**:
- `search_path` is set to the empty string;
- all object references are schema-qualified;
- `auth.uid()` is required;
- scope and date range are validated;
- business context requires `can_access_business_financial_v1`;
- the unaudited v1 reader is not executable by authenticated users;
- v2 writes the access audit record and returns its `access_log_id`;
- authenticated clients do not receive direct insert rights to forge AI audit records.

This exception is accepted for the develop phase because v2 must combine a protected internal reader with mandatory audit logging. It must be re-reviewed before production promotion. If an equivalent invoker-only design can preserve the same audit guarantee without broadening table grants, prefer that design.

Reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Performance review

### Foreign-key indexes

The advisor reports multiple unindexed foreign keys across the overall project. None of the reported entries belong to the new financial/commercial tables created in this workstream; the previously identified financial/commercial FK indexes were added during hardening.

Reference: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

### RLS initplan

The remaining advisor warning concerns `business_customer_relationship_events`, outside the four-domain changes in PR #277. Do not modify it incidentally in this branch.

Reference: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan

### Unused indexes

Many indexes, including new domain indexes, are reported unused. The `develop` branch has little/no representative traffic, so this is expected and is not sufficient evidence for removal. Index removal should require production query/usage evidence after rollout.

Reference: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Decision

- No broad project-wide advisor cleanup inside PR #277.
- No permissive RLS policies added simply to clear informational findings.
- Preserve the AI v2 audited SECURITY DEFINER gateway as a documented temporary exception.
- Re-run security/performance advisors before production promotion and record any new findings attributable to this workstream.
