# Stage 2B.0 — Proposed Data Architecture v2

Status: Architecture proposal only
Date: 2026-09-23
Production mutations: NONE

## 1. Strategy

The current SANAD database should evolve additively.

Do not perform a big-bang rewrite.

Preserve existing canonical finance, business, WhatsApp, ERP, notification and conversation contracts while adding the missing cross-domain layers.

## 2. Keep as canonical

Keep:
- profiles
- business_profiles
- business_team_members
- business_customers
- business_parties / roles / source refs
- personal_finance_*
- business_commercial_*
- business_party_ledger_entries
- business_accounting_connections
- business_erp_*
- business_bridge_*
- sanad_whatsapp_*
- notifications / push_*
- sanad_transactional_message_*
- sanad_agent_threads/messages/actions/memory/preferences
- sanad_knowledge_*

## 3. Modify later

### business_profiles
Remove the one-business-per-owner uniqueness after compatibility review.

### create_business_profile()
Remove the explicit single-business guard.

### sanad_agent_messages
Add author_user_id for shared human authorship.

### notification taxonomy
Move away from large fixed CHECK lists toward an extensible registry/contract.

### sanad_agent_actions
Move action_type validation toward Action Registry definitions.

## 4. Add in collaboration migration

sanad_agent_thread_participants

Purpose:
- shared conversations;
- role/access;
- read state;
- notification preference.

## 5. Add in connection migration

sanad_connections

Purpose:
- generic registry for true external integrations.

Do not migrate platform Push or current WhatsApp contacts into this table blindly.

Specialized adapters remain canonical.

## 6. Add in event/work migration

sanad_domain_events

Purpose:
- append-only cross-domain integration event envelope;
- references canonical source;
- drives fan-out.

sanad_work_items

Purpose:
- actionable cross-domain projection for Today / Tasks / Approvals / follow-up / connection issues.

## 7. Add in knowledge migration

sanad_scoped_knowledge_facts

Purpose:
- user/business/Yemen scoped learned facts with provenance.

sanad_glossary_terms

Purpose:
- local/user/business terminology.

USER.md and BUSINESS.md remain derived artifacts.

## 8. Add in Action Registry migration

sanad_action_definitions

Purpose:
- versioned action schemas;
- domain/risk/approval/handler metadata.

Keep sanad_agent_actions as runtime action instances initially.

## 9. Future capability tables

Not required for Stage 2B Shell:

- sanad_reconciliation_runs
- sanad_reconciliation_items
- sanad_reconciliation_matches
- sanad_reconciliation_exceptions

- business_agreements
- business_agreement_parties
- business_agreement_obligations

These belong to later feature trains.

## 10. No physical Space table in v1

Use a projection over:
- personal user context;
- business context;
- existing relationships.

Only add a generic Space entity if future use cases require a context that is neither a user nor a business.

## 11. Security rules

Any new public table:
- RLS enabled;
- explicit minimal grants;
- ownership/membership authorization;
- no raw connector secrets.

Any SECURITY DEFINER function:
- explicit auth checks;
- fixed empty search_path;
- minimum execute grants;
- advisor review.

Use private schema / Vault for credentials.

## 12. Migration trains

Recommended order:

~~~text
M1  Multi-business ownership compatibility
M2  Shared conversation participants + authorship
M3  Generic Connections registry
M4  Domain event envelope + Work Items
M5  Notification/action registry extensibility
M6  Scoped knowledge facts + glossary
M7  Action Registry
M8+ Reconciliation / Agreements when feature train begins
~~~

Do not combine M1–M7 into one Production migration.

## 13. Compatibility principle

Each migration must support old and new application code long enough for controlled rollout.

Pattern:

~~~text
additive schema
→ backfill
→ v2 RPCs
→ client migration
→ runtime verification
→ deprecate old contract
~~~

Avoid destructive rename/drop first.

## 14. Stage 2B implication

Unified Shell implementation may start only after the data contracts needed by the Shell are approved.

The Shell itself does not require all migrations above.

Minimum runtime dependencies for initial Stage 2B Shell:
- current threads/history;
- current business context read models;
- existing profile/settings;
- existing routes.

Therefore architecture approval can precede migration implementation while preventing the Shell from encoding obsolete assumptions.
