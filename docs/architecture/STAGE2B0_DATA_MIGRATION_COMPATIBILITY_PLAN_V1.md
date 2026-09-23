# Stage 2B.0 — Data Migration Compatibility Plan v1

Status: Draft — no migrations applied
Date: 2026-09-23
Target: Production Supabase sanad_verify_v3

## 1. Principle

All data-model changes should use:

~~~text
additive schema
→ backfill
→ v2 contracts
→ dual-compatible client
→ runtime verification
→ deprecate old contract
~~~

Avoid destructive-first migrations.

## 2. Compatibility finding — multi-business ownership

Database blocker:
- business_profiles has one_business_per_owner unique constraint.
- create_business_profile() explicitly rejects a second owned business.

Positive finding:
- get_user_business_contexts() already returns owned_businesses as an array.
- get_my_account_center_v1() already aggregates all owned businesses into an array.
- get_sanad_assistant_user_context() already aggregates owned businesses.
- src/lib/businessApi.ts models owned_businesses as BusinessProfile[].

Therefore the application is already more multi-business-ready than the database creation contract.

### Migration M1 design

Future migration:
1. add tests proving multiple owned rows are returned correctly;
2. remove explicit create_business_profile single-owner guard;
3. drop one_business_per_owner;
4. optionally enforce plan/business-count rules in an explicit policy/RPC;
5. create two businesses in non-production test context;
6. verify contexts, account center, assistant context, public profiles and navigation.

Do not apply M1 until Stage 2B.0 approval.

## 3. Shared conversation compatibility

Current client uses v1 RPCs:
- create_my_sanad_agent_thread_v1
- list_my_sanad_agent_threads_v1
- get_my_sanad_agent_thread_v1
- get_my_sanad_agent_context_v1
- update_my_sanad_agent_thread_v1

These assume thread.user_id ownership.

### Migration M2 design

Phase A:
- add participant table;
- add author_user_id;
- backfill owners/authors;
- no RLS/client behavior change.

Phase B:
- add v2 participant-aware RPCs;
- add helper can_access_sanad_agent_thread_v2(thread_id,user_id).

Phase C:
- migrate client and shared-room feature;
- private Realtime authorization.

Phase D:
- update RLS only after v2 contracts pass.

Keep v1 RPCs for current single-user threads during transition.

## 4. Connection registry compatibility

Current Bridge/ERP contracts are mature and specialized.

M3 must only add a parent registry or projection.

Do not move Bridge credentials or ERP rows into new generic tables.

Recommended rollout:
- create sanad_connections;
- register existing accounting connections as linked connection records through backfill/projection;
- preserve business_accounting_connections ids and RPCs;
- new UI reads unified connection list;
- provider detail routes continue reading specialized tables.

## 5. Event / Work compatibility

Do not rewrite existing domain event tables.

M4:
- create append-only cross-domain event envelope;
- create Work Item projection;
- mirror only selected high-value events initially;
- verify dedupe/idempotency;
- build Today against Work Items.

Existing notifications continue operating unchanged until event policies are proven.

## 6. Notification taxonomy compatibility

Current tests snapshot fixed notification CHECK constraints.

M5 requires coordinated update of:
- database constraint/registry;
- operation pipeline contract baseline test;
- notification deep-link mapping;
- transactional WhatsApp rules;
- client notification rendering.

Preferred migration:
- introduce registry tables/contracts first;
- populate existing types;
- make new producer validate against registry;
- only then relax/remove old CHECK arrays.

## 7. Action Registry compatibility

Current runtime execution in sanad-ai-agent-v1 explicitly branches on:
- personal_transaction
- commercial_document_draft

Current assistantActionApi accepts those values plus string.

M7 therefore needs:
- action definitions registry;
- handlers mapped by action key/version;
- compatibility aliases for the two existing action types;
- existing action rows left valid;
- contract tests preventing unregistered execution.

Do not remove the current deterministic execution path before registry parity.

## 8. Knowledge compatibility

M6 should add structured scoped facts/glossary without deleting sanad_agent_memories or sanad_knowledge_*.

Initial retrieval can read:
- old memory;
- new facts;
- platform knowledge

with explicit source labels.

Derived USER.md/BUSINESS.md is generated after facts are stable.

## 9. Security gate

Before every DDL migration:
- run Supabase security advisors;
- review new RLS;
- review SECURITY DEFINER execute grants;
- index RLS membership predicates;
- verify no public connector secret exposure.

Current advisor baseline includes WARN findings around executable SECURITY DEFINER functions. New migrations must not increase that debt.

## 10. Performance gate

Before/after each migration:
- inspect foreign-key indexing;
- EXPLAIN representative context/thread/work queries;
- preserve lazy application behavior;
- avoid unbounded sidebar/conversation queries.

## 11. Proposed execution trains after architecture approval

~~~text
Data Train D1
M1 Multi-business ownership
+ M2A collaboration additive schema

Data Train D2
M2B/C shared conversation contracts
+ M3 connection registry

Data Train D3
M4 event/work
+ M5 notification registry evolution

Data Train D4
M6 scoped knowledge/glossary
+ M7 Action Registry

Feature Trains later
Reconciliation
Agreements
Historical Edaa profit contract
~~~

These trains can interleave with frontend Stage 2B only where dependencies are clear.

## 12. Stage 2B Shell dependency

The initial Unified Shell does not require all migrations.

It can use current:
- cloud threads;
- business context RPCs;
- profile/settings;
- finance/business routes.

However, the Shell must not encode:
- one owned business only;
- owner-only conversation forever;
- four fixed action types/categories;
- accounting connection as the only connection concept.

That is why architecture approval precedes Shell implementation.
