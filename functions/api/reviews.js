// GET /api/reviews — public: reviews clients agreed to publish and the studio approved
export async function onRequestGet({ env }) {
  const v = await env.EB.get("reviews");
  return new Response(v || "[]", { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
}
