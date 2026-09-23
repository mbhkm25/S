# Stage 2B.0 — Edaa Profit / Cost Coverage Audit v1

Status: Read-only Production audit
Date: 2026-09-23
ERP source: Edaa Soft replica through SANAD Bridge
Runtime mutations: NONE

## Question

Why can SANAD retrieve an Edaa invoice but not reliably answer its profit?

The evidence shows this is primarily a semantic accounting/read-contract gap, not an LLM-capability gap.

## Relevant replica data exists

The latest logical snapshot includes sales, purchases and inventory structures such as:
- tblSellInvoice / tblSellInvoiceDetailes
- tblBuyInvoice / tblBuyInvoiceDetailes
- tblClasses
- tblUnits
- tblBeginningInventory
- tblClassEntries / tblClassEntriesDetailes
- tblStoreRecieving*
- tblStoreSpending*
- tblStocktaking*
- tblRevalueInventory*
- tblInventorySettings

## Current SANAD document contract

get_business_erp_document_detail_v1() currently exposes invoice quantity, unit price, discounts, source totals, product/class and unit information.

It does not expose a verified cost basis or profit.

So the current assistant limitation is consistent with its read contract.

## Cost fields found

tblUnits contains CostPrice.

All observed unit records in the latest snapshot had numeric CostPrice.

tblBuyInvoiceDetailes contains UnitPrice, Quantity, TotalAmount and SellPrice.

tblBeginningInventory contains UnitPrice, Quantity, TotalAmount and TotalMCAmount.

Latest tblInventorySettings observed:

~~~text
AverageStoreCost = 1
InventoryCostIsSet = 1
InventoryType = 0
~~~

This proves Edaa has an inventory-cost configuration and stores cost information.

## Historical-cost limitation

tblSellInvoiceDetailes has no explicit historical cost field.

Its UnitPrice is the sales price.

tblUnits.CostPrice appears to be a current/master cost value. Using current CostPrice for an old invoice may be wrong if cost changed after the sale.

Therefore current CostPrice must not be labeled actual historical invoice COGS without further proof.

## Inventory movement ledger

Every observed sale invoice in the latest snapshot had a corresponding tblClassEntries record with DocType = فاتورة بيع.

The movement ledger also contains purchase invoices, opening inventory, store receipts/issues, inventory adjustment and sales returns.

This makes historical reconstruction plausible.

## Class-entry detail finding

tblClassEntriesDetailes contains ClassID, UnitID, Quantity, UnitPrice, Amount and MCAmount.

Testing showed that for the large majority of matched sale lines its UnitPrice equals the sale line UnitPrice.

Therefore this field must not be treated as historical COGS.

## Recommended two-level profit contract

Level A — current-cost estimate:
- current unit cost;
- estimated gross margin;
- latest-snapshot timestamp;
- explicit estimate label.

Level B — historical invoice gross profit:
- only after verified historical cost methodology;
- include cost method, source, freshness and coverage.

## Historical reconstruction candidate

Potential chronological inputs:
- opening inventory;
- purchases;
- store receipts;
- cost adjustments;
- store issues;
- sales;
- returns.

If AverageStoreCost represents weighted-average costing, SANAD may reconstruct invoice-time COGS.

But the vendor semantics must be verified first.

The reconstruction must handle:
- unit conversion;
- store/sub-store;
- returns;
- discounts;
- revaluation;
- negative inventory;
- currency/exchange rates;
- deleted/cancelled documents;
- event ordering.

## Preferred next check

Before writing our own costing engine, look for an authoritative Edaa cost/profit source in:
- additional tables;
- views;
- stored procedures;
- accounting postings;
- Edaa reports not yet normalized by Bridge.

If an authoritative Edaa value exists, prefer it.

## Future semantic RPC

Prefer an additive contract such as:

get_business_erp_invoice_profit_v1(...)

When verified historical cost exists, return revenue, COGS, gross profit, gross margin, cost method, source and freshness.

When only current cost is available, return estimate_only and a clear warning that the result is not historical invoice COGS.

## Conclusion

The old statement “purchase cost is unavailable” is too broad.

More accurate:

Edaa replica contains substantial cost and inventory data, including current CostPrice and inventory-cost settings, but SANAD does not yet have a verified historical COGS semantic contract for invoice-time profit.

This is solvable as an accounting data contract, not by prompting the model harder.
