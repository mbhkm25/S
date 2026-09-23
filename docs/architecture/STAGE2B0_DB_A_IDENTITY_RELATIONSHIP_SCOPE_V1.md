# Stage 2B.0 — DB-A Identity / Relationship / Scope Architecture v1

Status: Draft for approval
Date: 2026-09-23
Source: Production Supabase read-only audit
Runtime mutations: NONE

## Decision

Do not create a generic physical spaces table in v1. “Space / Context” is a product projection over canonical identity and relationship data.

Initial context kinds:

~~~text
personal → authenticated user/profile
business → business_profile
~~~

## Existing canonical identities

User:
- auth.users
- public.profiles

Business:
- public.business_profiles

External/business party:
- public.business_parties

A business party may link to a SANAD account through business_parties.sanad_user_id.

## Existing relationship sources

Owner:
- business_profiles.owner_user_id

Team:
- business_team_members

Customer account relationship:
- business_customers

ERP/business party relationship:
- business_parties + business_party_roles

Current party roles already include customer, supplier, contact, other.

Keep these sources canonical. Do not collapse them into one generic relationship table yet.

## Product context projection

Add a read-model/RPC later, conceptually get_my_sanad_contexts_v1(), that merges and deduplicates relationships per business.

A context may expose:
- context kind
- business id
- display name
- relationship roles
- effective permissions
- status

The context object is navigation state, never an authorization token.

## Existing useful contract

get_user_business_contexts() already returns owned, team, customer and invitation contexts. It is a better seed for the new product-context contract than the current UI suggests.

get_my_business_workspaces() is payment-workflow specific and should remain specialized.

## Critical blocker — one business per owner

Production currently enforces UNIQUE(owner_user_id) through the constraint one_business_per_owner.

create_business_profile() also explicitly throws business_already_exists_for_user when a user already owns a business.

This conflicts with the new multi-business context model.

Future approved migration must:
1. remove/replace the unique owner constraint;
2. remove the explicit single-business guard;
3. retain id and slug identity guarantees;
4. enforce subscription/business-count limits at policy level instead of a hard one-row rule;
5. regression-test RPC/UI assumptions about a single owned business.

No migration is applied in Stage 2B.0.

## Team role model

business_team_members.membership_role is currently constrained to employee, while operational permissions live in JSON.

Do not simply add arbitrary role strings.

Principle:
- relationship role answers what the person is;
- permissions answer what the person may do;
- job title stays descriptive.

## Customer vs Party

business_customers is an application/account relationship with communication preferences.

business_parties is the accounting/business party and can exist without a SANAD user.

They should remain distinct but linkable.

## Supplier relationship

A registered SANAD user can already be linked through business_parties.sanad_user_id with business_party_roles.role_code = supplier.

This can support future supplier contexts without a separate supplier-membership system.

## Context switching

For conversations:
- a new conversation may inherit selected business context;
- an existing conversation keeps its own context;
- selecting another context must not silently rewrite thread history;
- business context should remain visible.

Current sanad_agent_threads.business_id is sufficient as the v1 business-context anchor.

## DB-A deliverables before migration

- design get_my_sanad_contexts_v1();
- enumerate single-business assumptions in DB and UI;
- design the owner-constraint migration;
- define role vs permission semantics;
- define which customer/supplier/team relationships appear in the sidebar;
- security-test RLS/BOLA boundaries.

## Decision summary

~~~text
Generic spaces table          NO for v1
Personal context              profiles/auth user
Business context              business_profiles
Relationship truth            existing domain tables
Multi-business ownership      REQUIRED future change
Context projection RPC        RECOMMENDED
Context object grants access  NEVER
~~~
