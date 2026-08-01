import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const secret = Deno.env.get("RETENTION_CRON_SECRET") || "";
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(async (req) => {
  if (!secret || req.headers.get("x-cron-secret") !== secret)
    return new Response("Unauthorized", { status: 401 });
  const result = await supabase.rpc("purge_expired_transport_data");
  if (result.error)
    return new Response(
      JSON.stringify({ detail: "Retention cleanup failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  return new Response(JSON.stringify({ ok: true, result: result.data }), {
    headers: { "Content-Type": "application/json" },
  });
});
