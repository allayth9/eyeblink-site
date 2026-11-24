import { isAdmin, json } from "../_lib/shared.js";
// POST /api/csp — browsers report what the page policy (functions/_middleware.js, report only) would have blocked.
//                 Kept per day in D1 (table csp, not KV: reports must never spend KV's daily writes) as
//                 { "<directive> <blocked origin> · <page>": count }; KV only where there is no D1 (local tests).
//                 Bounded so it can never cost much: 100 distinct lines a day, each counted up to 5 (then no more writes).
// GET  /api/csp — admin: the last 7 days
const DAYS = 7, LINES = 100, CAP = 5;
const where = u => { try { const x = new URL(u); return x.protocol === "data:" || x.protocol === "blob:" ? x.protocol : x.origin; } catch { return String(u || "").slice(0, 40); } };
export async function onRequestPost({ request, env }) {
  const raw = await request.text(); if (raw.length > 8000) return new Response(null, { status: 204 });
  let r; try { r = JSON.parse(raw)["csp-report"]; } catch {} if (!r) return new Response(null, { status: 204 });
  const blocked = String(r["blocked-uri"] || "");
  if (/^(chrome|moz|safari|safari-web|ms-browser)-extension/.test(blocked)) return new Response(null, { status: 204 });   // the visitor's own add-ons
  let page = ""; try { page = new URL(r["document-uri"]).pathname.replace(/\.html$/, ""); } catch {}
  const dir = String(r["effective-directive"] || r["violated-directive"] || "").split(" ")[0].slice(0, 30);
  const line = (dir + " " + (/^(inline|eval|wasm-eval)$/.test(blocked) ? blocked : where(blocked)) + " · " + page.slice(0, 60)).slice(0, 160);
  const today = new Date().toISOString().slice(0, 10);
  if (env.DB) {
    const D = env.DB; await D.prepare("CREATE TABLE IF NOT EXISTS csp (day TEXT NOT NULL, line TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, line))").run();
    const known = await D.prepare("SELECT n FROM csp WHERE day=? AND line=?").bind(today, line).first();
    if (known ? known.n >= CAP : (await D.prepare("SELECT COUNT(*) AS c FROM csp WHERE day=?").bind(today).first()).c >= LINES) return new Response(null, { status: 204 });
    await D.prepare("INSERT INTO csp (day, line, n) VALUES (?, ?, 1) ON CONFLICT(day, line) DO UPDATE SET n = n + 1").bind(today, line).run();
    if (Math.random() < 0.02) await D.prepare("DELETE FROM csp WHERE day < ?").bind(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).run();
    return new Response(null, { status: 204 });
  }
  const key = "csp:" + today;
  let day = {}; try { day = JSON.parse(await env.EB.get(key) || "{}"); } catch {}
  if ((day[line] || 0) >= CAP || (!(line in day) && Object.keys(day).length >= LINES)) return new Response(null, { status: 204 });
  day[line] = (day[line] || 0) + 1;
  await env.EB.put(key, JSON.stringify(day), { expirationTtl: 30 * 86400 });
  return new Response(null, { status: 204 });
}
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const out = {}, from = new Date(Date.now() - (DAYS - 1) * 86400000).toISOString().slice(0, 10);
  if (env.DB) try { for (const r of (await env.DB.prepare("SELECT day, line, n FROM csp WHERE day >= ? ORDER BY day DESC").bind(from).all()).results || []) (out[r.day] ||= {})[r.line] = r.n; } catch {}
  for (let i = 0; i < DAYS; i++) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); if (out[d]) continue; const v = await env.EB.get("csp:" + d); if (v) out[d] = JSON.parse(v); }   // the days before the move
  return json({ ok: true, days: out });
}
