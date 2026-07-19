Deno.serve(() =>
  new Response(
    JSON.stringify({ ok: false, error: "retry_window_closed" }),
    {
      status: 410,
      headers: { "content-type": "application/json" },
    },
  ));
