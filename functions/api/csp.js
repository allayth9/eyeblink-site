import { isAdmin, json } from "../_lib/shared.js";
// POST /api/csp — browsers report what the page policy (functions/_middleware.js, report only) would have blocked.
//                 Kept per day in KV "csp:<day>" as { "<directive> <blocked origin> · <page>": count }.
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
  const key = "csp:" + new Date().toISOString().slice(0, 10);
  let day = {}; try { day = JSON.parse(await env.EB.get(key) || "{}"); } catch {}
  if ((day[line] || 0) >= CAP || (!(line in day) && Object.keys(day).length >= LINES)) return new Response(null, { status: 204 });
  day[line] = (day[line] || 0) + 1;
  await env.EB.put(key, JSON.stringify(day), { expirationTtl: 30 * 86400 });
  return new Response(null, { status: 204 });
}
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const out = {};
  for (let i = 0; i < DAYS; i++) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10), v = await env.EB.get("csp:" + d); if (v) out[d] = JSON.parse(v); }
  return json({ ok: true, days: out });
}
