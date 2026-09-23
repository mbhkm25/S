# Stage 2B.0 — DB-E Knowledge / Memory / Glossary Architecture v1

Status: Draft for approval
Date: 2026-09-23
Source: Production Supabase read-only audit
Runtime mutations: NONE

## 1. Existing knowledge layers

### Personal assistant memory

sanad_agent_memories already stores:
- user
- memory key/category
- value text
- confidence
- source thread/message
- status
- expiry
- metadata

This is useful for personal conversational memory.

### Platform knowledge

sanad_knowledge_sources / versions / units / references / files form a strong curated knowledge system for official/platform knowledge.

These should remain separate concepts.

## 2. Gap

The new SANAD model needs scoped learned knowledge that is neither:
- a casual assistant memory;
- nor official platform documentation.

Examples:
- user-specific financial/business conventions;
- business operational facts;
- Yemen/local terminology;
- business glossary/aliases;
- durable learned preferences with provenance.

## 3. Proposed scoped fact layer

Add later a structured fact model, conceptually:

sanad_scoped_knowledge_facts

Suggested fields:
- id
- scope_kind: platform | yemen | user | business
- user_id nullable
- business_id nullable
- fact_key
- category
- value_text nullable
- value_json nullable
- confidence
- status
- source_type
- source_thread_id nullable
- source_message_id nullable
- source_knowledge_id nullable
- effective_from
- expires_at
- supersedes_fact_id nullable
- metadata
- created_at
- updated_at

Financial truth must never be inferred into this table as a substitute for ledger/ERP truth.

## 4. Provenance

Every learned fact should answer:

- where did this come from?
- who asserted it?
- when was it learned?
- how confident are we?
- is it current?
- was it superseded?

This is essential before using generated USER.md or BUSINESS.md operationally.

## 5. USER.md / BUSINESS.md

These should be derived profiles, not canonical storage.

Pipeline:

~~~text
Structured active facts
+ explicit preferences
+ safe conversation summaries
→ profile compiler
→ USER.md / BUSINESS.md
~~~

The generated Markdown should include:
- generation timestamp/version;
- scope;
- source/fact references internally;
- no unsupported financial balances.

Storage options:
- generated Library artifact;
- cached derived profile record;
- regenerated on meaningful fact changes.

## 6. Glossary

Create a separate structured terminology model rather than burying terminology inside Markdown.

Conceptual:

sanad_glossary_terms

Fields:
- scope_kind
- user_id/business_id nullable
- term
- normalized_term
- meaning
- canonical_term
- domain
- locale
- confidence
- source/provenance
- status
- priority
- created_at
- updated_at

Precedence:

~~~text
User/Business explicit term
→ Yemen/local term
→ SANAD domain glossary
→ generic language model understanding
~~~

But higher precedence must not override hard accounting semantics incorrectly.

## 7. Yemen/local context

The Yemen glossary can represent terms such as local payment-network names, accounting expressions and colloquial financial language.

It should be curated and testable.

Do not let one user's private vocabulary automatically become global Yemen knowledge.

Promotion to broader scope requires review.

## 8. Business memory

Business-scoped knowledge belongs to the business, subject to permissions.

Examples:
- preferred invoice wording;
- operational schedule;
- common customer aliases;
- product aliases;
- collection policy;
- approved internal terminology.

Do not expose business-scoped facts to customers/suppliers unless visibility explicitly allows it.

## 9. Personal memory distinction

Keep sanad_agent_memories for lightweight user memory/preferences initially.

Gradually move durable structured facts into the scoped fact layer.

Do not break Stage 1 memory while introducing the new model.

## 10. Retrieval contract

Future SANAD context assembly should distinguish:
- financial truth from canonical ledger/ERP;
- operational entity truth;
- scoped structured facts;
- conversation history;
- curated platform knowledge;
- glossary.

Each result needs provenance.

## 11. Knowledge conflict handling

When two facts conflict:
- prefer explicit/canonical sources;
- compare effective time;
- use supersession;
- lower confidence on unresolved conflict;
- ask user when necessary.

Never silently merge contradictory financial/business facts.

## 12. Privacy / forget semantics

User-scoped learned facts must support:
- inspect;
- correct;
- supersede;
- forget/delete according to retention policy.

Business facts require role-based management.

Derived Markdown must be regenerated after fact removal so stale content is not retained.

## 13. Decision summary

~~~text
sanad_agent_memories             KEEP
sanad_knowledge_*                KEEP
Scoped structured facts          ADD later
Structured glossary              ADD later
USER.md / BUSINESS.md            DERIVED, not truth
Financial balances in Markdown   NEVER canonical
Provenance/confidence            REQUIRED
Scope-aware privacy              REQUIRED
~~~
