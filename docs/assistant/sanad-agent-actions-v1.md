# SANAD Agent Action Integration v1

## Purpose

Action Integration v1 introduces the first approval-gated write path from SANAD Agent into SANAD-owned domains.

The invariant is:

`Intent -> resolved entities -> Draft review -> explicit UI approval -> deterministic domain command -> audit`

The model never receives an approval or execution tool.

## Supported action drafts

### Personal finance

`action_prepare_personal_transaction`

Supported intents:
- income
- expense
- same-currency transfer

Before the draft can be prepared, the Agent must resolve account UUIDs through `finance_get_accounts`. A category UUID, when present, must be resolved through `finance_get_categories`.

Preparing the action writes only a row to `sanad_agent_actions` with status `review`.

After explicit approval, the server invokes the existing canonical `create_personal_finance_transaction_v1` contract. That canonical contract posts the personal transaction inside SANAD.

### Commercial

`action_prepare_commercial_document`

Supported document kinds:
- quotation
- sales invoice
- purchase invoice
- receipt
- payment
- expense

Business context is revalidated server-side. A party UUID, when supplied, must have been resolved in the same turn through `business_search_parties`.

Approval invokes only `create_business_commercial_draft_v1`.

**Approval creates a SANAD commercial Draft. It does not post the document.**

`post_business_commercial_document_v1` and settlement commands are intentionally absent from Agent Action v1.

## Explicit approval

The response contains an `action_review` card.

The card displays:
- action summary
- resolved account / party where applicable
- amount and currency
- date
- the exact effect of approval

The card provides:
- اعتماد
- تعديل
- إلغاء

Approval requires an explicit user interaction in the authenticated UI. The browser then invokes `approve_my_sanad_agent_action_v1` with the action id and expected version.

The model cannot call this RPC as a tool.

Modification cancels the old review first so a stale draft cannot remain approvable.

## Concurrency and idempotency

- review actions carry a monotonic `version`
- approval and cancellation require `p_expected_version`
- the action row is locked `FOR UPDATE`
- an active logical fingerprint prevents duplicate pending drafts
- completed action cards are idempotent when re-opened

## Audit

`sanad_agent_action_events` records:
- created
- approved
- executing
- completed
- cancelled
- failed

The action stores its originating thread, request id, tool call id and optional attachment ids.

## Payment Inbox integration

`business_get_payment_inbox` is read-only.

It can display:
- new/pending inbox items
- status
- amount and currency
- financial entity
- reference
- related operation link

It cannot:
- claim
- complete
- release
- reassign
- reject
- resolve duplicate/reuse state

Those Payment Inbox mutations remain outside Action v1.

## ERP / Edaa boundary

ERP/Edaa remains read-only.

Action Integration v1 contains no ERP mutation RPC, no SQL write toward ERP, and no Bridge write path.

Commercial actions write only to SANAD's own commercial domain and initially create Draft records.

## Security boundary

- model tools: read-only + draft-only preparation
- authenticated UI: explicit approval/cancel
- server RPC: ownership, status, version and domain validation
- domain contracts: canonical SANAD commands
- audit: action + event records
