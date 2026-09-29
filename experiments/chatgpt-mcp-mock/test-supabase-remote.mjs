// Run from experiments/chatgpt-mcp-mock/ after npm install.
// node test-supabase-remote.mjs
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const base = "https://hudbzlgclghlhazlduas.supabase.co/functions/v1/sanad-mcp-demo";
const health = await fetch(base + "/health", { signal: AbortSignal.timeout(15000) });
assert.equal(health.status, 200, "Supabase health endpoint failed");
const status = await health.json();
assert.equal(status.demonstration_only, true);
assert.equal(status.production_connected, false);
console.log("SANAD Supabase demo health:", status);
const client = new Client({ name:"sanad-supabase-remote-test", version:"0.1.0" });
try {
 await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp")));
 const tools = await client.listTools();
 const actual = tools.tools.map(t => t.name).sort();
 const expected = [
  "sanad_demo_get_customer_statement",
  "sanad_demo_get_sync_status",
  "sanad_demo_list_businesses",
  "sanad_demo_search_customers",
 ].sort();
 assert.deepEqual(actual, expected);
 console.log("TOOLS PASS:", actual);
 for (const [name,args] of [
  ["sanad_demo_list_businesses", {}],
  ["sanad_demo_get_sync_status", {business_id:"demo-business-001"}],
  ["sanad_demo_search_customers", {business_id:"demo-business-001",query:"1001"}],
  ["sanad_demo_get_customer_statement", {business_id:"demo-business-001",account_id:"1001"}]
 ]) {
  const result = await client.callTool({ name, arguments:args });
  assert.equal(result.isError, false, name + ": " + JSON.stringify(result));
  const data = result.structuredContent ?? JSON.parse(result.content[0].text);
  assert.equal(data.demonstration_only, true, name);
  if (name === "sanad_demo_get_customer_statement") assert.equal(data.closing_balance,850);
  console.log(name, "PASS", JSON.stringify(data));
 }
 console.log("REMOTE MCP ALL FOUR TOOLS PASS");
} finally { await client.close(); }
