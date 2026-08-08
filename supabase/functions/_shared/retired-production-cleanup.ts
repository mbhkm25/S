import "jsr:@supabase/functions-js/edge-runtime.d.ts";

export function retiredProductionCleanupResponse(): Response {
  return new Response(
    JSON.stringify({ ok: false, error: "retired_production_cleanup" }),
    {
      status: 410,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    },
  );
}
