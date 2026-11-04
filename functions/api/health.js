// GET /api/health — public: which storage the site can reach (no secrets, just yes/no)
export async function onRequestGet({ env }) {
  let db = false;
  if (env.DB) { try { await env.DB.prepare("SELECT 1").first(); db = true; } catch {} }
  return new Response(JSON.stringify({ ok: true, kv: !!env.EB, db }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
