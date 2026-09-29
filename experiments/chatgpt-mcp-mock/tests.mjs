import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listDemoBusinesses, demoSyncStatus, searchDemoCustomers, demoCustomerStatement } from "./mock-data.mjs";
test("fixture explicitly identifies synthetic data", () => {
  const x = listDemoBusinesses();
  assert.equal(x.demonstration_only, true);
  assert.match(x.businesses[0].data_classification, /SYNTHETIC/);
  assert.equal(demoSyncStatus(x.businesses[0].business_id).last_sync_at, null);
});
test("ledger totals are deterministic, per currency, and never model-calculated", () => {
  const x = demoCustomerStatement("demo-business-001", "1001");
  assert.equal(x.opening_balance, 1000);
  assert.equal(x.closing_balance, 850);
  assert.equal(x.currency, "SAR");
  assert.deepEqual(x.movements.map(y => y.running_balance), [1250, 850]);
});
test("unknown IDs fail closed", () => {
  assert.equal(demoCustomerStatement("wrong-business", "1001").error, "demo_business_not_found");
  assert.equal(demoCustomerStatement("demo-business-001", "nonexistent").error, "demo_account_not_found");
  assert.deepEqual(searchDemoCustomers("demo-business-001", "unknown").customers, []);
});
test("isolated demo server cannot import SANAD secret handling or paid models", () => {
  const source = readFileSync(new URL("./server.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /(?:createClient|service_role|GEMINI_API_KEY|OPENAI_API_KEY|exec\(|child_process)/i);
  assert.match(source, /SYNTHETIC/);
});
