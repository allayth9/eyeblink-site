import { same, isAdmin, json, h } from "../_lib/shared.js";
// GET /api/content — public: the live site content (404 until the first publish)
// PUT /api/content — admin: replace the content; the previous version is kept for 30 days
// «فـي» → «في»: a tatweel once typed after the faa to dodge a font fault (now fixed in CSS) is dropped, on reading and on saving
const unFaa = s => s.replace(/فـ+(?=[يى])/g, "ف");
export async function onRequestGet({ env }) {
  const v = await env.EB.get("content");
  if (!v) return new Response("not found", { status: 404 });
  return new Response(unFaa(v), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
export async function onRequestPut({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const body = unFaa(await request.text());
  if (body.length > 1_000_000) return json({ ok: false, error: "too large" }, 413);
  let data; try { data = JSON.parse(body); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  if (!data || !Array.isArray(data.services) || !data.hero) return json({ ok: false, error: "missing sections" }, 400);
  const prev = await env.EB.get("content");
  if (prev) await env.EB.put("backup:" + Date.now(), prev, { expirationTtl: 60 * 60 * 24 * 30 });
  // every work keeps a permanent id (its view count is stored under it); same key the site uses before one exists
  const seen = new Set();
  for (const p of Array.isArray(data.projects) ? data.projects : []) {
    if (!p || typeof p !== "object") continue;
    let id = p.id || workKey(p), k = id, i = 2;
    while (seen.has(k)) k = id + "-" + i++;
    p.id = k; seen.add(k);
  }
  data.updatedAt = new Date().toISOString();
  await env.EB.put("content", JSON.stringify(data));
  return json({ ok: true, updatedAt: data.updatedAt });
}
// a work's key before it has an id (same as functions/api/views.js and assets/js/render.js)
function fp(s){ let h = 5381; s = String(s); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function workKey(p){ return "w" + fp(p.poster || p.preview || (p.full && (p.full.id || p.full.src)) || (p.title && p.title.ar) || ""); }
