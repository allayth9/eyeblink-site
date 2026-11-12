import { isAdmin, json, h, telegram, sweepReminders, later } from "../_lib/shared.js";
// POST /api/track — the site: one anonymous page view (no cookies, no personal data; IP is never stored)
// GET  /api/track?days=30 — admin: daily totals, sources, pages, countries, devices and the latest visits
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegrambot|discord|headless|lighthouse|pingdom|monitor/i;
function sourceOf(ref, utm){
  if (utm) return utm.split(" / ")[0].toLowerCase().slice(0, 40);
  let h = ""; try { h = new URL(ref).host.replace(/^www\.|^m\.|^l\./, ""); } catch {}
  if (!h) return "direct";
  const map = [[/instagram/, "instagram"], [/facebook|fb\.com|fb\.me/, "facebook"], [/google\./, "google"], [/bing\./, "bing"], [/t\.co$|twitter|x\.com/, "x"], [/tiktok/, "tiktok"],
    [/youtube|youtu\.be/, "youtube"], [/linkedin|lnkd/, "linkedin"], [/t\.me|telegram/, "telegram"], [/wa\.me|whatsapp/, "whatsapp"], [/behance/, "behance"], [/snapchat/, "snapchat"], [/duckduckgo/, "duckduckgo"], [/yandex/, "yandex"]];
  for (const [re, n] of map) if (re.test(h)) return n;
  return h.slice(0, 60);
}
function uaInfo(ua){
  return { device: /iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop",
    os: /iPhone|iPad|iOS/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "macOS" : /CrOS/i.test(ua) ? "ChromeOS" : /Linux/i.test(ua) ? "Linux" : "other",
    browser: /Instagram/i.test(ua) ? "Instagram app" : /FBAN|FBAV/i.test(ua) ? "Facebook app" : /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "other" };
}
const inc = (o, k) => { if (!k) return; o[k] = (o[k] || 0) + 1; };
export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const ua = request.headers.get("user-agent") || "";
  if (BOT.test(ua)) return new Response(null, { status: 204 });
  // only page views sent by the site itself count (keeps the daily KV writes for real visits)
  const org = request.headers.get("origin") || request.headers.get("referer") || "";
  try { if (new URL(org).host !== new URL(request.url).host) return new Response(null, { status: 204 }); } catch { return new Response(null, { status: 204 }); }
  if (+(request.headers.get("content-length") || 0) > 4000) return new Response(null, { status: 204 });
  let d; try { d = await request.json(); } catch { return new Response(null, { status: 204 }); }
  const c = (v, m) => String(v ?? "").slice(0, m), cf = request.cf || {}, day = new Date().toISOString().slice(0, 10), key = "stat:" + day;
  const page = c(d.p, 80).replace(/\.html$/, "").replace(/^\/en/, "/en ") || "/", u = uaInfo(ua), src = sourceOf(c(d.r, 300), c(d.u, 120));
  let s; try { s = JSON.parse(await env.EB.get(key) || "null"); } catch {}
  s ||= { day, views: 0, visits: 0, visitors: 0, pages: {}, sources: {}, countries: {}, devices: {}, browsers: {}, os: {}, langs: {}, recent: [] };
  s.views++; if (d.ns) { s.visits++; inc(s.sources, src); inc(s.devices, u.device); inc(s.browsers, u.browser); inc(s.os, u.os); inc(s.countries, c(cf.country, 4) || "?"); inc(s.langs, d.l === "en" ? "en" : "ar"); }
  if (d.nv) s.visitors++;
  inc(s.pages, page);
  s.recent.unshift({ at: new Date().toISOString(), page, src, ref: c(d.r, 160), utm: c(d.u, 80), country: c(cf.country, 4), city: c(cf.city, 40), ...u, w: +d.w || 0, nv: !!d.nv, sid: c(d.s, 12) });
  s.recent = s.recent.slice(0, 80);
  await env.EB.put(key, JSON.stringify(s), { expirationTtl: 400 * 86400 });
  later(ctx, sweepReminders(env));
  return new Response(null, { status: 204 });
}
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const n = Math.max(1, Math.min(90, parseInt(new URL(request.url).searchParams.get("days")) || 30)), days = [];
  for (let i = n - 1; i >= 0; i--) { const day = new Date(Date.now() - i * 86400e3).toISOString().slice(0, 10); days.push(day); }
  const vals = await Promise.all(days.map(dd => env.EB.get("stat:" + dd)));
  return json({ ok: true, days: days.map((dd, i) => { try { return JSON.parse(vals[i]) || { day: dd, views: 0, visits: 0, visitors: 0 }; } catch { return { day: dd, views: 0, visits: 0, visitors: 0 }; } }) });
}
