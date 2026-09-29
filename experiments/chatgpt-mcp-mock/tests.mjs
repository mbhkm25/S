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

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

test("actual Streamable HTTP MCP handshake and synthetic account lookup", { timeout: 20000 }, async () => {
  const port = 18787;
  const child = spawn(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url))], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: "ignore",
  });
  let client;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (child.exitCode !== null) throw new Error("Demo MCP server exited unexpectedly");
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(750) });
        if (response.ok) {
          const status = await response.json();
          assert.equal(status.production_connected, false);
          ready = true;
          break;
        }
      } catch {}
      await sleep(150);
    }
    assert.equal(ready, true, "Demo MCP server did not become ready");
    const rest = await fetch(`http://127.0.0.1:${port}/gpt-demo/statement?business_id=demo-business-001&account_id=1001`);
    assert.equal(rest.status, 200);
    const restStatement = await rest.json();
    assert.equal(restStatement.demonstration_only, true);
    assert.equal(restStatement.closing_balance, 850);
    const denied = await fetch(`http://127.0.0.1:${port}/gpt-demo/statement?business_id=invalid&account_id=1001`);
    assert.equal(denied.status, 400);
    const deniedPayload = await denied.json();
    assert.equal(deniedPayload.error, "demo_business_not_found");
    client = new Client({ name: "sanad-mcp-ci", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name).sort(),
      [
        "sanad_demo_get_customer_statement",
        "sanad_demo_get_sync_status",
        "sanad_demo_list_businesses",
        "sanad_demo_search_customers",
      ],
    );
    const result = await client.callTool({
      name: "sanad_demo_get_customer_statement",
      arguments: { business_id: "demo-business-001", account_id: "1001" },
    });
    assert.equal(result.isError, false);
    const statement = JSON.parse(result.content[0].text);
    assert.equal(statement.demonstration_only, true);
    assert.equal(statement.closing_balance, 850);
  } finally {
    if (client) await client.close();
    child.kill("SIGTERM");
  }
});
