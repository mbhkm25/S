// SANAD secure candidate: NOT DEPLOYED, no financial database access.
// Separate future endpoint. Supabase JWT gateway must also be enabled at deployment.
// Authentication only is insufficient: grants, explicit consent and subscription
// are purposefully fail-closed until audited adapters are separately approved.
const MAX_BODY_BYTES = 1024;
const MCP_TOOL_NAMES = [
  "sanad_secure_list_businesses",
  "sanad_secure_get_sync_status",
  "sanad_secure_search_customers",
  "sanad_secure_get_customer_statement",
] as const;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
const rpcError = (id: unknown, code: number, message: string) => ({
  jsonrpc: "2.0", id, error: { code, message },
});
type Identity = { id: string };
async function verifiedUser(bearer: string): Promise<Identity | null> {
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!projectUrl || !publicKey) return null;
  const endpoint = new URL("/auth/v1/user", projectUrl);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { apikey: publicKey, authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const user: unknown = await response.json();
    if (!user || typeof user !== "object" || !("id" in user)) return null;
    const id = (user as { id?: unknown }).id;
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id)) return null;
    return { id };
  } catch {
    return null;
  }
}
const edgeRuntime = Deno as typeof Deno & {
  serve: (handler: (request: Request) => Promise<Response>) => void;
};
edgeRuntime.serve(async (req: Request): Promise<Response> => {
  // No wildcard CORS and no anonymous business list. This candidate is
  // deliberately inaccessible until the consent/entitlement grants are live.
  const rawBearer = req.headers.get("authorization") ?? "";
  const matches = /^Bearer ([A-Za-z0-9_\-.]+)$/i.exec(rawBearer);
  if (!matches) {
    return json({ error: "authentication_required" }, 401);
  }
  const user = await verifiedUser(matches[1]);
  if (!user) return json({ error: "authentication_required" }, 401);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  if (!url.pathname.endsWith("/mcp") && !url.pathname.endsWith("/execute")) {
    return json({ error: "not_found" }, 404);
  }
  const length = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return json({ error: "request_too_large" }, 413);
  }
  const input = await req.text();
  if (input.length > MAX_BODY_BYTES) return json({ error: "request_too_large" }, 413);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(input);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw Error();
    body = parsed as Record<string, unknown>;
  } catch { return json({ error: "invalid_json" }, 400); }
  if (url.pathname.endsWith("/execute")) {
    // REST and MCP will share the same eventual authorization gateway.
    // No tool is executable yet, even by a signed-in owner.
    const name = body.tool;
    return json({ error: typeof name === "string" && MCP_TOOL_NAMES.includes(name as typeof MCP_TOOL_NAMES[number])
      ? "financial_access_not_configured" : "unsupported_tool" }, 403);
  }
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return json(rpcError(body.id ?? null, -32600, "Invalid request"), 400);
  }
  if (!("id" in body)) return new Response(null, { status: 202 });
  if (body.method === "initialize") {
    return json({
      jsonrpc: "2.0", id: body.id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "sanad-secure-candidate", version: "0.1.0" },
      },
    });
  }
  if (body.method === "tools/list") {
    return json({
      jsonrpc: "2.0", id: body.id,
      result: {
        tools: MCP_TOOL_NAMES.map((name) => ({
          name,
          description: "Proposed authenticated read-only SANAD tool. Real access is disabled pending authorization review.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true },
        })),
      },
    });
  }
  if (body.method === "tools/call") {
    return json(rpcError(body.id, -32003, "financial_access_not_configured"));
  }
  if (body.method === "ping") return json({ jsonrpc: "2.0", id: body.id, result: {} });
  return json(rpcError(body.id, -32601, "Method not found"));
});
