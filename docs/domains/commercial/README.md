# SANAD Commercial Domain

Status: active development on `feat/unified-financial-core-v1`; Supabase contracts validated on `develop` only.

## Product boundary

SANAD Commercial owns business-side commercial records: customers/suppliers, sales and purchase documents, receipts, payments, expenses, party ledger, posting and settlement. It is scoped to a business context and must enforce business authorization for every read and write.

## Frontend entrypoints

- `/commercial` — business commercial overview.
- `/commercial/actions` — party creation, Draft → Post document workflow and compatibility-filtered settlement.
- `src/features/financial/api/financialApi.ts` — temporary shared client gateway while the domain extraction is staged.
- `src/features/financial/CommercialSettlementPanel.tsx` — settlement UI backed by server-side candidate filtering.

## Primary database objects

- `business_parties`
- `business_commercial_documents`
- `business_commercial_document_lines`
- `business_party_ledger_entries`
- `business_commercial_settlements`

## Command/read contracts

- `create_business_party_v1`
- `create_business_commercial_draft_v1`
- `post_business_commercial_document_v1`
- `get_business_commercial_settlement_candidates_v1`
- `settle_business_commercial_document_v1`
- `get_business_commercial_dashboard_v1`
- `get_business_party_statement_v1`

## Settlement invariant

A settlement is allowed only when both documents are posted, belong to the same business, same party and same currency, and have compatible document types. Sales invoices settle against receipts; purchase invoices/expenses settle against payments. The server prevents settling beyond either invoice outstanding or payment available amount.

## Release rule

The UI must not infer settlement compatibility independently from raw document lists. Candidate selection comes from the server contract and the final settlement is revalidated server-side. Production promotion requires green CI plus authenticated database fixtures.
