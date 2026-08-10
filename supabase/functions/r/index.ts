const TARGET = "https://api.sanadflow.com/functions/v1/sanad-interactive-report";

function response(status: number, body: string, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

Deno.serve((req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return response(405, "Method Not Allowed", { allow: "GET, HEAD" });
  }

  const incoming = new URL(req.url);
  const token = (incoming.searchParams.get("token") || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    return response(400, "Invalid report link");
  }

  const destination = new URL(TARGET);
  destination.searchParams.set("token", token);
  return response(302, "", { location: destination.toString() });
});
