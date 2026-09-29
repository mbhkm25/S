// SYNTHETIC DATA ONLY. Never import SANAD production credentials in this prototype.
const DEMO_BUSINESS = Object.freeze({
  business_id: "demo-business-001",
  business_name: "متجر سند التجريبي",
  data_classification: "SYNTHETIC_DEMO_NOT_REAL",
});
const DEMO_CUSTOMERS = Object.freeze([
  { account_id: "1001", display_name: "عميل تجريبي ١", currency: "SAR", opening_balance: 1000, movements: [
    { date: "2026-09-01", kind: "sale", source_document: "DEMO-S-01", debit: 250, credit: 0 },
    { date: "2026-09-03", kind: "receipt", source_document: "DEMO-R-01", debit: 0, credit: 400 },
  ] },
  { account_id: "1002", display_name: "عميل تجريبي ٢", currency: "SAR", opening_balance: 0, movements: [
    { date: "2026-09-05", kind: "sale", source_document: "DEMO-S-02", debit: 600, credit: 0 },
  ] },
]);
export function listDemoBusinesses() {
  return { demonstration_only: true, source: "STATIC_SYNTHETIC_FIXTURE", businesses: [DEMO_BUSINESS] };
}
export function demoSyncStatus(businessId) {
  if (businessId !== DEMO_BUSINESS.business_id) return { error: "demo_business_not_found" };
  return { demonstration_only: true, business: DEMO_BUSINESS, connection: "DEMO_SIMULATED", last_sync_at: null, warning: "No ERP is connected. All numbers are fabricated test fixtures." };
}
export function searchDemoCustomers(businessId, query) {
  if (businessId !== DEMO_BUSINESS.business_id) return { error: "demo_business_not_found" };
  const q = query.trim().toLowerCase();
  return { demonstration_only: true, customers: DEMO_CUSTOMERS.filter(x => x.account_id === q || x.display_name.toLowerCase().includes(q)).map(({account_id, display_name, currency}) => ({account_id,display_name,currency})), source: "STATIC_SYNTHETIC_FIXTURE" };
}
export function demoCustomerStatement(businessId, accountId) {
  if (businessId !== DEMO_BUSINESS.business_id) return { error: "demo_business_not_found" };
  const customer = DEMO_CUSTOMERS.find(x => x.account_id === accountId);
  if (!customer) return { error: "demo_account_not_found", demonstration_only: true };
  let running = customer.opening_balance;
  const movements = customer.movements.map(x => ({ ...x, running_balance: (running += x.debit - x.credit) }));
  return { demonstration_only: true, source: "STATIC_SYNTHETIC_FIXTURE", business: DEMO_BUSINESS, customer: { account_id: customer.account_id, display_name: customer.display_name }, currency: customer.currency, opening_balance: customer.opening_balance, movements, closing_balance: running, warning: "Illustrative fabricated numbers. NOT a real SANAD or Edaa account." };
}
