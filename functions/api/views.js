import { isAdmin, telegram, currentUser, limited } from "../_lib/shared.js";
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
      env.DB.prepare("CREATE TABLE IF NOT EXISTS work_likes (id TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS like_seed (id TEXT PRIMARY KEY, seed INTEGER NOT NULL DEFAULT 0)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS like_hits (k TEXT PRIMARY KEY, id TEXT NOT NULL, at TEXT, who TEXT)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS interest (k TEXT PRIMARY KEY, day TEXT NOT NULL, works TEXT, told INTEGER NOT NULL DEFAULT 0)"),
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

export async function onRequestGet({ request, env }) {
  // the panel: how often each shared link (/w/<slug>) was opened
  if (new URL(request.url).searchParams.get("shares") === "1") {
    if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
    const shares = {}; try { const r = (await env.DB.prepare("SELECT slug, n, last FROM share_opens").all()).results || []; for (const x of r) shares[x.slug] = { n: x.n, last: x.last }; } catch {}
    return json({ ok: true, shares }, 200, { "cache-control": "no-store" });
  }
  const D = await db(env); if (!D) return json({ ok: true, views: {} });
  const ids = await workIds(env); if (!ids.length) return json({ ok: true, views: {} });
  await seedMissing(D, ids);
  const rows = (await D.prepare(`SELECT id, n FROM work_views WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results || [];
  const views = {}; for (const r of rows) views[r.id] = r.n;
  // likes start from 40% of the views the first time a work is seen; real likes add to that
  await D.batch(rows.map(r => D.prepare("INSERT OR IGNORE INTO like_seed (id, seed) VALUES (?, ?)").bind(r.id, Math.round(r.n * 0.4))));
  const likes = {}; for (const r of ((await D.prepare(`SELECT s.id, s.seed + COALESCE(l.n, 0) AS n FROM like_seed s LEFT JOIN work_likes l ON l.id = s.id WHERE s.id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results || [])) likes[r.id] = r.n;
  return json({ ok: true, views, likes }, 200, { "cache-control": "public, max-age=10" });
}

export async function onRequestPost({ request, env }) {
  const D = await db(env); if (!D) return json({ ok: false }, 503);
  const ua = request.headers.get("user-agent") || "";
  const d = await request.json().catch(() => ({}));
  const id = String(d.id || "").slice(0, 80);
  if (!id || BOT.test(ua)) return json({ ok: true, counted: false });
  if (!(await workIds(env)).includes(id)) return json({ ok: false, error: "work" }, 404);
  const ip = request.headers.get("cf-connecting-ip") || "x", now = new Date().toISOString();
  const k = (await sha256("v|" + ip + "|" + ua + "|" + id)).slice(0, 32);
  if (typeof d.like === "boolean") return like(request, env, D, id, k, d.like, now);
  await seedMissing(D, [id]);
  // every open and every replay is a view, the same visitor included
  const counted = true;
  await D.prepare("UPDATE work_views SET n = n + 1, updated_at = ? WHERE id = ?").bind(now, id).run();
  const row = await D.prepare("SELECT n FROM work_views WHERE id = ?").bind(id).first();
  await interest(request, env, D, ip, ua, id, now).catch(() => {});
  return json({ ok: true, counted, n: row ? row.n : null });
}
const SAME = 3, ALL = 5;
async function interest(request, env, D, ip, ua, id, now) {
  const k = (await sha256("i|" + ip + "|" + ua)).slice(0, 32), day = now.slice(0, 10);
  const r = await D.prepare("SELECT day, works, told FROM interest WHERE k = ?").bind(k).first();
  let works = {}, told = 0; if (r && r.day === day) { try { works = JSON.parse(r.works || "{}"); } catch {} told = r.told; }
  works[id] = (works[id] || 0) + 1;
  const all = Object.values(works).reduce((a, b) => a + b, 0), top = Object.entries(works).sort((a, b) => b[1] - a[1])[0];
  const hot = !told && (top[1] >= SAME || all >= ALL);
  await D.prepare("INSERT INTO interest (k, day, works, told) VALUES (?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET day = excluded.day, works = excluded.works, told = excluded.told")
    .bind(k, day, JSON.stringify(works), hot ? 1 : told).run();
  if (Math.random() < 0.02) await D.prepare("DELETE FROM interest WHERE day < ?").bind(new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)).run();
  if (!hot) return;
  let c = {}; try { c = JSON.parse(await env.EB.get("content", { cacheTtl: 60 }) || "{}"); } catch {}
  const name = wid => { const p = (c.projects || []).find(x => x && workKey(x) === wid); return (p && p.title && (p.title.ar || p.title.en)) || wid; };
  const cf = request.cf || {}, u = await currentUser(request, env).catch(() => null);
  const who = [u && (u.name || u.email), [cf.city, cf.country].filter(Boolean).join("، "), /iphone|ipad|android|mobile/i.test(ua) ? "موبايل" : "كمبيوتر"].filter(Boolean).join(" · ");
  const list = Object.entries(works).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w, n]) => "«" + name(w) + "»" + (n > 1 ? " ×" + n : "")).join("، ");
  await telegram(env, "👀 زائر مهتم بشغلك اليوم\n" + who + "\nفتح " + all + " مرات: " + list + "\n\nممكن يكون عميل محتمل. إذا كان مسجّل دخول، اسمه بأول سطر");
}
// «أعجبني»: one per visitor per work (tap again to take it back); the studio hears who on Telegram
async function like(request, env, D, id, k, on, now) {
  if (await limited(env, "like:" + (request.headers.get("cf-connecting-ip") || "x"), 60, 3600)) return json({ ok: false, error: "slow" }, 429);
  let changed = false, who = "";
  if (on) {
    const cf = request.cf || {}, ua = request.headers.get("user-agent") || "", u = await currentUser(request, env).catch(() => null);
    const place = [cf.city, cf.country].filter(Boolean).join("، "), dev = /iphone|ipad|android|mobile/i.test(ua) ? "موبايل" : "كمبيوتر";
    who = [u && (u.name || u.email), place, dev].filter(Boolean).join(" · ");
    const r = await D.prepare("INSERT OR IGNORE INTO like_hits (k, id, at, who) VALUES (?, ?, ?, ?)").bind(k, id, now, who).run();
    changed = !!(r.meta && r.meta.changes);
    if (changed) await D.prepare("INSERT INTO work_likes (id, n) VALUES (?, 1) ON CONFLICT(id) DO UPDATE SET n = n + 1").bind(id).run();
  } else {
    const r = await D.prepare("DELETE FROM like_hits WHERE k = ?").bind(k).run();
    changed = !!(r.meta && r.meta.changes);
    if (changed) await D.prepare("UPDATE work_likes SET n = MAX(n - 1, 0) WHERE id = ?").bind(id).run();
  }
  const row = await D.prepare("SELECT COALESCE((SELECT n FROM work_likes WHERE id = ?), 0) + COALESCE((SELECT seed FROM like_seed WHERE id = ?), 0) AS n").bind(id, id).first(), n = row ? row.n : 0;
  if (on && changed) {
    let c = {}; try { c = JSON.parse(await env.EB.get("content", { cacheTtl: 60 }) || "{}"); } catch {}
    const p = (c.projects || []).find(x => x && workKey(x) === id), t = (p && p.title && (p.title.ar || p.title.en)) || id;
    await telegram(env, "♥ أعجب أحدهم بعمل «" + t + "»\n" + (who || "زائر") + "\nصار عنده " + n + " إعجاب").catch(() => {});
  }
  return json({ ok: true, liked: on, n });
}

async function sha256(t){ const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...h } });
