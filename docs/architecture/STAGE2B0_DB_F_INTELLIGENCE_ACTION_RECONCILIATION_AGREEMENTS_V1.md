# Stage 2B.0 — DB-F Intelligence / Action / Reconciliation / Agreements Architecture v1

Status: Draft for approval
Date: 2026-09-23
Source: Production Supabase read-only audit
Runtime mutations: NONE

## 1. SANAD expert layer

The “expert financial / accounting / business / administrative” behavior should not be represented as one larger prompt.

The database already contains useful foundations:
- sanad_assistant_intent_aliases
- sanad_assistant_tool_permissions
- sanad_assistant_tool_executions
- sanad_agent_actions
- sanad_agent_action_events

The target architecture is:

~~~text
Natural language
→ domain interpretation
→ canonical intent
→ entity resolution
→ governed action/query
→ deterministic result
~~~

The LLM performs interpretation/orchestration. Canonical actions perform execution.

## 2. Action Registry

The current sanad_agent_actions table is a good runtime action instance store, but its action_type CHECK currently allows only:
- personal_transaction
- commercial_document_draft

The future system needs a registry of action definitions rather than an ever-growing CHECK list.

Recommended later table:

sanad_action_definitions

Conceptual fields:
- action_key
- version
- display_name
- domain
- input_schema jsonb
- result_schema jsonb
- risk_level
- approval_policy jsonb
- allowed_scope_kinds
- handler_code
- enabled
- created_at
- updated_at

Action instances remain in sanad_agent_actions or a compatible successor.

## 3. Structured Action Composer

The composer should resolve directly to an Action Registry action.

Example:

~~~text
Sales Invoice form
→ commercial.invoice.create_draft
→ typed payload with canonical customer/item ids
→ draft
→ review
→ approval
→ deterministic command
~~~

Do not convert structured form data back into free text for the LLM to guess again.

## 4. Intent aliases and terminology

sanad_assistant_intent_aliases already provides a useful phrase-to-intent layer.

It can coexist with the future Glossary.

Intent aliases answer:
“what operation did the user likely mean?”

Glossary answers:
“what does this local/user/business term mean?”

Do not merge the two concepts.

## 5. Tool permissions

sanad_assistant_tool_permissions already expresses audience-level tool access.

Future Action Registry authorization should become more granular and entity/context aware.

Do not use audience alone as financial authorization.

Every write action must still validate:
- authenticated actor;
- scope/business access;
- entity permissions;
- approval requirement;
- action version;
- exact payload/fingerprint.

## 6. Reconciliation

There is no dedicated reconciliation model today.

This is a real new capability and should have its own canonical workflow.

Recommended future tables:

sanad_reconciliation_runs
- id
- user_id
- business_id nullable
- source_kind
- attachment_id / library artifact
- status
- period_from / period_to
- currency
- created_at / completed_at

sanad_reconciliation_items
- run_id
- source_row_no
- source_date
- description
- amount
- direction
- reference
- normalized_payload

sanad_reconciliation_matches
- run_id
- item_id
- target_type
- target_id
- match_score
- match_method
- status
- reviewed_by
- reviewed_at

sanad_reconciliation_exceptions
- run_id
- item_id
- exception_type
- severity
- details
- status
- resolution_action_id nullable

## 7. Reconciliation safety

Matching is not posting.

Flow:

~~~text
Import
→ normalize
→ candidate matching
→ confidence
→ exception review
→ optional draft correction
→ explicit approval
→ deterministic action
~~~

No unmatched or low-confidence row may create a financial transaction automatically.

## 8. Contracts / Agreements

Contracts are not invoices.

Recommended future model:

business_agreements
- business_id
- agreement_type
- title
- status
- effective_from
- effective_to
- currency nullable
- total_value nullable
- terms jsonb
- created_by

business_agreement_parties
- agreement_id
- party_id / user reference
- role_code

business_agreement_obligations
- agreement_id
- obligation_type
- due_rule/date
- amount/currency nullable
- status
- linked_document_id nullable
- linked_work_item_id nullable

Attachments belong in the Library/file layer.

## 9. Agreement automation

Agreements become operational when linked to:
- reminders;
- obligations;
- payments;
- invoices;
- approvals;
- tasks.

Example:

~~~text
Lease agreement
→ monthly obligation
→ Today item
→ payment/draft
→ receipt
→ audit
~~~

## 10. Commercial documents remain separate

business_commercial_documents should continue to represent operational documents such as invoices/payments.

Do not overload it into a generic legal contract store.

Agreement obligations may generate/link commercial documents.

## 11. Expert interpretation tests

The expert layer needs a Yemen/Arabic accounting golden set.

Examples:
- ambiguous debt direction;
- cash vs credit sale;
- receipt vs payment;
- customer vs supplier;
- local payment-network terms;
- partial settlement;
- reversal/correction;
- multi-currency amounts.

The system must prefer clarification over silently choosing the wrong financial meaning.

## 12. Decision summary

~~~text
One giant expert prompt             NO
Intent/domain interpretation        YES
Action Registry                     ADD later
Structured Action Composer          DIRECT to Action Registry
Reconciliation                      ADD dedicated workflow
Automatic low-confidence posting    NEVER
Contracts as invoices               NO
Agreement entity                    ADD later
Golden accounting intent tests      REQUIRED
~~~
