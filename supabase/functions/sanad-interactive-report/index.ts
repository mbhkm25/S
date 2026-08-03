const APP_REPORT_BASE = (Deno.env.get("PUBLIC_REPORT_APP_BASE_URL") || "https://app.sanadflow.com/reports/view").replace(/\/$/, "");

Deno.serve((request) => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token") || url.pathname.split("/").filter(Boolean).pop() || "";
  if (token.length < 32 || token.length > 256) {
    return new Response("رابط التقرير غير صالح", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const target = `${APP_REPORT_BASE}/${encodeURIComponent(token)}`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "cache-control": "private, no-store, max-age=0",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
});
