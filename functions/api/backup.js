import { isAdmin, json } from "../_lib/shared.js";
// The studio's backup (panel only).
// GET  /api/backup                → the full backup as a file: site content, private settings, requests, clients and their
//                                   workspaces, tasks and deliveries, invoices, quotes and agreements, the team and its fees.
//                                   Never in it: passwords, sessions, sign-in codes, invite links, or the media files themselves
//                                   (their names are listed; the files stay in KV and R2).
// GET  /api/backup?list=1         → the weekly snapshots on our storage (R2) and the content versions kept at each publish
// GET  /api/backup?snap=<key>     → one stored snapshot, as a file
// POST /api/backup {snapshot:1}   → store a snapshot on R2 now (the panel does this by itself once a week); the last 8 are kept
// POST /api/backup {restore:"backup:<ts>"} → put a content version back on the site (the current one is kept as a version first)
const SKIP = /^(sess:|asess:|tsess:|code:|reset:|invite:|tglink:|auth:hash$|backup:|sweep:|rl:|lim:|file:|media:)/;
const BINARY = /^(file:|media:)/;
const SECRET = /^(hash|salt|sv|pw|pass|password|token|secret|tmp\w*|temp\w*)$/i;
const NO_TABLES = /^(sqlite_|_cf_|d1_)|^(view_hits|like_hits|interest|push_subs|tg_links)$/;
const KEEP = 8;

function strip(v) {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) if (!SECRET.test(k)) o[k] = strip(x); return o; }
  return v;
}
async function kvKeys(env, prefix) {
  const out = []; let cursor;
  do { const r = await env.EB.list({ prefix, cursor }); out.push(...r.keys); cursor = r.list_complete ? null : r.cursor; } while (cursor);
  return out;
}
async function build(env) {
  const keys = await kvKeys(env, ""), kv = {}, media = [];
  for (const k of keys) {
    if (BINARY.test(k.name)) { media.push({ key: k.name, ...(k.metadata || {}) }); continue; }
    if (SKIP.test(k.name)) continue;
    const raw = await env.EB.get(k.name); if (raw == null) continue;
    let v = raw; try { v = JSON.parse(raw); } catch {}
    kv[k.name] = strip(v);
  }
  const d1 = {};
  if (env.DB) try {
    const tabs = ((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results || []).map(r => r.name).filter(n => !NO_TABLES.test(n));
    for (const t of tabs) d1[t] = strip(((await env.DB.prepare(`SELECT * FROM "${t.replace(/"/g, "")}"`).all()).results) || []);
  } catch (e) { d1._error = String(e && e.message || e).slice(0, 200); }
  const r2 = [];
  if (env.R2) try { let cursor; do { const l = await env.R2.list({ cursor, limit: 1000 }); for (const o of l.objects) if (!o.key.startsWith("backups/")) r2.push({ key: o.key, size: o.size }); cursor = l.truncated ? l.cursor : null; } while (cursor); } catch {}
  return { kind: "eyeblink-backup", version: 1, made: new Date().toISOString(), kv, d1, files: { kv: media, r2 } };
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const download = (body, name) => new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const q = new URL(request.url).searchParams;
  if (q.get("list") === "1") {
    const snaps = [];
    if (env.R2) try { const l = await env.R2.list({ prefix: "backups/" }); for (const o of l.objects) snaps.push({ key: o.key, size: o.size, at: o.uploaded }); } catch {}
    snaps.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const versions = (await kvKeys(env, "backup:")).map(k => ({ key: k.name, at: new Date(+k.name.slice(7)).toISOString() })).sort((a, b) => b.key.localeCompare(a.key));
    return json({ ok: true, r2: !!env.R2, snaps, versions }, 200, { "cache-control": "no-store" });
  }
  const snap = q.get("snap");
  if (snap) {
    if (!env.R2 || !/^backups\/[\w.-]+\.json$/.test(snap)) return json({ ok: false }, 404);
    const o = await env.R2.get(snap); if (!o) return json({ ok: false }, 404);
    return download(o.body, snap.slice(8));
  }
  return download(JSON.stringify(await build(env)), "eyeblink-backup-" + stamp() + ".json");
}

export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  let d = {}; try { d = await request.json(); } catch {}
  if (d.snapshot) {
    if (!env.R2) return json({ ok: false, error: "r2" }, 400);
    const body = JSON.stringify(await build(env)), key = "backups/" + stamp() + ".json";
    await env.R2.put(key, body, { httpMetadata: { contentType: "application/json" } });
    const l = await env.R2.list({ prefix: "backups/" }), old = l.objects.sort((a, b) => String(b.uploaded).localeCompare(String(a.uploaded))).slice(KEEP);
    for (const o of old) await env.R2.delete(o.key);
    return json({ ok: true, key, size: body.length });
  }
  if (typeof d.restore === "string" && /^backup:\d{10,}$/.test(d.restore)) {
    const v = await env.EB.get(d.restore); if (!v) return json({ ok: false, error: "gone" }, 404);
    let ok = false; try { const c = JSON.parse(v); ok = !!(c && Array.isArray(c.services) && c.hero); } catch {}
    if (!ok) return json({ ok: false, error: "invalid" }, 400);
    const cur = await env.EB.get("content");
    if (cur) await env.EB.put("backup:" + Date.now(), cur, { expirationTtl: 60 * 60 * 24 * 30 });
    await env.EB.put("content", v);
    return json({ ok: true });
  }
  return json({ ok: false }, 400);
}
