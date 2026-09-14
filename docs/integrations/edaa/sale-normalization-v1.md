# Edaa Sale Normalization v1

Status: implemented and exercised on Supabase `develop` only.

This document records the first evidence-based Edaa sale mapping used by SANAD NEXT. It was derived from the real `ibex-1` transaction bundle `sale_1306_20260906_113834.json`. The raw private fixture is intentionally not committed to the repository.

## Source bundle shape

The verified bundle contains these top-level keys:

- `schema_version`
- `event_id`
- `merchant_instance_id`
- `source_system`
- `event_type`
- `source_sale_id`
- `source_sale_number`
- `captured_at`
- `integrity`
- `sale`
- `sale_lines`
- `accounting_entry`
- `accounting_lines`
- `inventory_entry`
- `inventory_lines`

Verified contract values for the fixture:

- `schema_version = ibex-1`
- `source_system = edaa_v5`
- `event_type = sale_transaction`
- one sale line
- two accounting lines
- two inventory lines
- accounting balance check passed
- inventory quantity balance check passed

## Bridge -> ERP Event Envelope v1

The production Bridge should wrap the source bundle in the ERP-neutral Cloud envelope rather than flattening or discarding it.

| Cloud field | Edaa source / rule |
| --- | --- |
| `event_id` | stable Bridge observation identity |
| `adapter_code` | `edaa_v5` for the verified source family |
| `adapter_version` | Bridge/adapter build version; do not infer from ERP data |
| `event_schema_version` | `1` |
| `entity_type` | `sale` |
| `source_record_id` | string form of `source_sale_id` |
| `revision` | deterministic revision identity for the observed transaction state |
| `captured_at` | Bridge capture time |
| `business_date` | date component of `sale.TheDate` |
| `source_enter_time` | `sale.EnterTime` only when plausible/reliable |
| `payload` | the complete `ibex-1` transaction bundle |
| `integrity` | the bundle integrity object |

### Revision rule

The prototype bundle's historical `event_id` identifies the sale but is not sufficient by itself to model later edits/corrections.

Production Bridge work must generate a revision identity from stable transaction state, excluding capture-only values such as `captured_at`. An update must create a new observation/revision instead of silently replacing raw evidence.

## Normalized activity

`public.normalize_edaa_sale_v1(raw_event_id)` converts one accepted raw Edaa sale into one idempotent `business_activity_events` row of type `erp_sale`.

### Amount

For v1:

`net = sum(sale_lines.TotalAmount) - sale.Descount + sale.SalesServices`

The source values remain available in the raw event; the normalized event is a read model, not a replacement for the evidence.

### Payment mode

Known v1 mappings:

- `نقد` -> `cash`
- `آجل` / `اجل` -> `credit`
- anything else -> `unknown`

The raw `ThePay` value is also retained in activity metadata.

### Currency

The normalizer never guesses ISO currency from Edaa `CurrencyID` or from `ExchangePrice`.

Currency resolution uses:

`business_erp_currency_mappings(source_instance_id, source_currency_id -> currency_code)`

If no verified mapping exists:

- amount is preserved;
- `currency` remains null;
- `currency_mapping_missing` is a blocking warning;
- the activity status is `pending_review`.

A source-currency mapping should be created from the Edaa currency master/baseline, not from a single invoice.

### Customer / Party identity

The normalizer does **not** create or link a SANAD Party from `sale.AccountID` alone.

Reason: the Edaa study proved that the same `AccountID` can be used by invoices with different `CustomerName` values, including generic accounts. Therefore `AccountID` is preserved only as source evidence/hint.

For the first vertical slice:

- `CustomerName` is displayed as a counterparty hint;
- `source_account_id` is retained in metadata;
- `party_id` stays null until a trustworthy customer-master/source-reference resolver is available;
- `customer_identity_unresolved` is an enrichment warning, not a financial blocking warning.

This prevents unsafe customer merges while still making the sale useful in the business timeline.

### Integrity and review semantics

Blocking warnings:

- `sale_line_count_mismatch`
- `accounting_line_count_mismatch`
- `inventory_line_count_mismatch`
- `accounting_not_balanced`
- `inventory_not_balanced`
- `currency_mapping_missing`

Non-blocking enrichment warnings currently include:

- `customer_identity_unresolved`

If `sale.Deleted = true`, the normalized activity is `cancelled`.

## Time semantics

- `sale.TheDate` is the business date.
- plausible `sale.EnterTime` may be retained as source chronology.
- known legacy timestamps such as the `1899-12-30` inventory-entry time are not promoted to authoritative transaction time.

## Live development verification

The real source bundle was exercised against the Supabase development branch inside a transaction and rolled back afterward.

Observed behavior without a currency mapping:

- amount: `5000`
- currency: null
- status: `pending_review`
- blocking warning: `currency_mapping_missing`
- enrichment warning: `customer_identity_unresolved`

A synthetic test-only mapping was then inserted inside the same rollback transaction to verify the resolved path. The activity became `recorded`, the blocking warning cleared, and the customer remained deliberately unresolved.

The synthetic currency code used for that control-flow test is not evidence that Edaa CurrencyID `2` means that currency in production.

After rollback, test business/raw/activity row counts were verified as zero.

## Ingestion behavior

`sanad-erp-ingest-v1` now stores the raw event first. For Edaa sale events it then invokes `normalize_edaa_sale_v1`.

A downstream normalization failure does not invalidate the raw-event ACK. The Bridge must not retry forever merely because canonical normalization needs review or repair; the accepted raw evidence can be reprocessed server-side.

## Next required enrichment

Before customer-specific ledgers/timelines are considered authoritative, the Bridge baseline must provide a trustworthy customer-master identity from `tblCustomersInfo` or another verified Edaa relationship. That identity can then populate `business_party_source_refs` and attach future/historical sale activities to canonical Parties without relying on `AccountID` alone.
