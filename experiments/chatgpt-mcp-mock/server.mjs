// Isolated MCP proof-of-concept: NO Supabase, NO Edaa, NO production finance or secrets.
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { listDemoBusinesses, demoSyncStatus, searchDemoCustomers, demoCustomerStatement } from "./mock-data.mjs";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const MCP_PATH = "/mcp";
const apiHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
const demoJson = (res, data, status = 200) => { res.writeHead(status, apiHeaders); res.end(JSON.stringify(data)); };
const respond = (data) => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: data,
  isError: Boolean(data.error),
});
function makeServer() {
  const server = new McpServer({ name: "sanad-demo-synthetic-only", version: "0.0.1" });
  server.registerTool("sanad_demo_list_businesses", {
    title: "List synthetic SANAD demonstration businesses",
    description: "DEMO ONLY: list fabricated businesses to test ChatGPT-SANAD MCP interaction. Never returns real accounts.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => respond(listDemoBusinesses()));
  server.registerTool("sanad_demo_get_sync_status", {
    title: "Get simulated ERP sync status",
    description: "DEMO ONLY: simulated sync status for the fabricated business; not connected to ERP.",
    inputSchema: { business_id: z.string().min(1) },
    annotations: { readOnlyHint: true },
  }, async ({business_id}) => respond(demoSyncStatus(business_id)));
  server.registerTool("sanad_demo_search_customers", {
    title: "Search fabricated customer accounts",
    description: "DEMO ONLY: search synthetic customers. Account IDs are sample data, not live.",
    inputSchema: { business_id: z.string().min(1), query: z.string().min(1) },
    annotations: { readOnlyHint: true },
  }, async ({business_id, query}) => respond(searchDemoCustomers(business_id, query)));
  server.registerTool("sanad_demo_get_customer_statement", {
    title: "Get fabricated customer statement",
    description: "DEMO ONLY: returns an example statement calculated deterministically from fabricated transaction fixtures.",
    inputSchema: { business_id: z.string().min(1), account_id: z.string().min(1) },
    annotations: { readOnlyHint: true },
  }, async ({business_id, account_id}) => respond(demoCustomerStatement(business_id, account_id)));
  return server;
}
const httpServer = createServer(async (req, res) => {
  if (!req.url) return void res.writeHead(400).end("Missing URL");
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    return void res.end(JSON.stringify({ name: "sanad-chatgpt-mcp-mock", demonstration_only: true, production_connected: false }));
  }
  // GPT Actions compatibility adapter. This namespace exposes SYNTHETIC DEMO FIXTURES ONLY.
  // It is intentionally separate from MCP and never reads a production account.
  if (req.method === "GET" && url.pathname.startsWith("/gpt-demo/")) {
    const route = url.pathname;
    const businessId = url.searchParams.get("business_id");
    const accountId = url.searchParams.get("account_id");
    let result;
    if (route === "/gpt-demo/businesses") result = listDemoBusinesses();
    else if (route === "/gpt-demo/sync") result = demoSyncStatus(businessId);
    else if (route === "/gpt-demo/customers") result = businessId
      ? searchDemoCustomers(businessId, url.searchParams.get("query") ?? "")
      : { error: "business_id_required" };
    else if (route === "/gpt-demo/statement") result = businessId && accountId
      ? demoCustomerStatement(businessId, accountId)
      : { error: "business_id_and_account_id_required" };
    else return void demoJson(res, { error: "unknown_demo_endpoint" }, 404);
    return void demoJson(res, result, result.error ? 400 : 200);
  }
  if (url.pathname === "/.well-known/oauth-protected-resource" || url.pathname === "/.well-known/oauth-authorization-server") {
    return void res.writeHead(404).end("OAuth not configured: synthetic demo only");
  }
  if (url.pathname !== MCP_PATH || !["POST","GET","DELETE"].includes(req.method ?? "")) {
    return void res.writeHead(404).end("Not Found");
  }
  // Stateless transport per request; no real-data access or authentication is implemented.
  const server = makeServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { void transport.close(); void server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("MCP demo error:", error);
    if (!res.headersSent) res.writeHead(500).end("Demo MCP error");
  }
});
httpServer.listen(PORT, HOST, () => {
  console.log(`SANAD SYNTHETIC MCP listening on http://${HOST}:${PORT}/mcp`);
  console.log("No SANAD credentials or production data supported by this server.");
});
