// View counts for the works in the gallery (D1, binding "DB").
// GET  /api/views         — public: { ok, views: { "<work id>": n } } for every work on the site
// POST /api/views { id }  — public: one real view of a work (a visitor opened it to watch it).
//                           Counted once per visitor per work per day; bots and unknown ids are ignored.
// A work starts from a small number (20–89) the first time it is seen, then only real views add to it.
// Visitors are told apart by a daily hash of address + browser; the address itself is never stored.
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegrambot|discord|headless|lighthouse|pingdom|monitor/i;
const SEED_MIN = 20, SEED_MAX = 89;

// the same key the site computes (assets/js/render.js → workKey)
function fp(s){ let h = 5381; s = String(s); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function workKey(p){ return p.id || ("w" + fp(p.poster || p.preview || (p.full && (p.full.id || p.full.src)) || (p.title && p.title.ar) || "")); }
async function workIds(env){
  let c = {}; try { c = JSON.parse(await env.EB.get("content", { cacheTtl: 60 }) || "{}"); } catch {}
  return [...new Set((c.projects || []).filter(p => p && p.title).map(workKey))];
}
let ready = false;
async function db(env){
  if (!env.DB) return null;
  if (!ready) {
    await env.DB.batch([
      env.DB.prepare("CREATE TABLE IF NOT EXISTS work_views (id TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, seed INTEGER NOT NULL DEFAULT 0, updated_at TEXT)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS view_hits (k TEXT PRIMARY KEY, day TEXT NOT NULL)"),
    ]);
    ready = true;
  }
  return env.DB;
}
function seedN(){ return SEED_MIN + (crypto.getRandomValues(new Uint32Array(1))[0] % (SEED_MAX - SEED_MIN + 1)); }
async function seedMissing(D, ids){
  if (!ids.length) return;
  const at = new Date().toISOString();
  await D.batch(ids.map(id => { const n = seedN(); return D.prepare("INSERT OR IGNORE INTO work_views (id, n, seed, updated_at) VALUES (?, ?, ?, ?)").bind(id, n, n, at); }));
}

export async function onRequestGet({ env }) {
  const D = await db(env); if (!D) return json({ ok: true, views: {} });
  const ids = await workIds(env); if (!ids.length) return json({ ok: true, views: {} });
  await seedMissing(D, ids);
  const rows = (await D.prepare(`SELECT id, n FROM work_views WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results || [];
  const views = {}; for (const r of rows) views[r.id] = r.n;
  return json({ ok: true, views }, 200, { "cache-control": "public, max-age=20" });
}

export async function onRequestPost({ request, env }) {
  const D = await db(env); if (!D) return json({ ok: false }, 503);
  const ua = request.headers.get("user-agent") || "";
  const d = await request.json().catch(() => ({}));
  const id = String(d.id || "").slice(0, 80);
  if (!id || BOT.test(ua)) return json({ ok: true, counted: false });
  if (!(await workIds(env)).includes(id)) return json({ ok: false, error: "work" }, 404);
  await seedMissing(D, [id]);
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get("cf-connecting-ip") || "x";
  const k = (await sha256(day + "|" + ip + "|" + ua + "|" + id)).slice(0, 32);
  const hit = await D.prepare("INSERT OR IGNORE INTO view_hits (k, day) VALUES (?, ?)").bind(k, day).run();
  const counted = !!(hit.meta && hit.meta.changes);
  if (counted) await D.prepare("UPDATE work_views SET n = n + 1, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
  if (Math.random() < 0.02) await D.prepare("DELETE FROM view_hits WHERE day < ?").bind(new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)).run();
  const row = await D.prepare("SELECT n FROM work_views WHERE id = ?").bind(id).first();
  return json({ ok: true, counted, n: row ? row.n : null });
}

async function sha256(t){ const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...h } });
