# SANAD SECURITY DEFINER audit — 2026-07-19

## Scope

The production Supabase project `hudbzlgclghlhazlduas` was reviewed for exposed `SECURITY DEFINER` functions, direct table grants, RLS configuration, and helper-function privilege boundaries.

## Reviewed high-priority RPCs

- `platform_admin_review_business`
- `update_business_profile`
- `update_business_team_member_status`
- `add_business_customer_note`
- `record_business_customer_communication`
- `get_business_customers`
- `get_business_customer_detail`
- `link_operation_to_business`
- `verify_operation`
- `open_operation_access`

All reviewed RPCs:

- deny `anon` execution;
- retain `authenticated` execution where required by the application;
- use a fixed empty `search_path`;
- validate `auth.uid()` directly or delegate to a reviewed authenticated RPC;
- enforce business ownership, platform-admin status, active team membership, current-user verification, or token validity according to the operation.

No function body was changed merely to silence Supabase Advisor warnings. The warnings are generic and do not account for the application-level authorization checks inside these RPCs.

## Intentionally public read-only RPCs

The following `SECURITY DEFINER` functions are intentionally available to `anon`:

- `get_app_public_information()`
- `get_public_business_profile(text)`
- `get_public_businesses(text, uuid, text, text, integer, integer)`

They return approved public projections only. Public business RPCs restrict results to businesses whose `public_status` is `published`.

## RPC-only tables

The following tables have RLS enabled with no policies by design:

- `app_public_information`
- `business_customer_communications`
- `business_customer_notes`

Neither `anon` nor `authenticated` has direct table privileges. Access is only through approved `SECURITY DEFINER` RPCs. Migration `20260719140000_security_definer_contract_guardrails.sql` reasserts these revocations and fails if the reviewed contract drifts.

## Helper-function boundary

Sensitive helpers such as `is_platform_admin`, `sanad_get_active_subscription`, `sanad_user_has_basic_profile`, and `private.assert_business_media_path` are not executable by `anon` or `authenticated`. They remain callable from approved definer functions and by `service_role`.

## Remaining dashboard setting

Supabase Auth leaked-password protection remains a dashboard-level setting and should be enabled separately. It is not representable as a repository SQL migration.

## Production status

The guardrail migration was applied successfully to production before being recorded in GitHub. It changes no application behavior and introduces no new table access.
