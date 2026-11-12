// A short link to one work: /w/<slug> (Arabic) or /w/<slug>?l=en.
// Link previews (WhatsApp, Instagram, iMessage…) read the title, the line about it and the cover from this page;
// a person is sent straight on to the work page, where that work opens by itself (?w=<slug>).
// Real opens are counted (D1, share_opens) so the panel can say how often a link was opened; preview bots are not.
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegrambot|discord|headless|lighthouse|pingdom|monitor|skypeuri|slack/i;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url), en = url.searchParams.get("l") === "en";
  const slug = String([].concat(params.path || [])[0] || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  let c = {}; try { c = JSON.parse(await env.EB.get("content", { cacheTtl: 60 }) || "{}"); } catch {}
  const p = slug && (c.projects || []).find(x => x && x.slug === slug);
  const dest = (en ? "/en/work" : "/work") + (p ? "?w=" + encodeURIComponent(slug) : "");
  if (!p) return Response.redirect(new URL(dest, url).toString(), 302);
  const bot = BOT.test(request.headers.get("user-agent") || "");

  if (!bot) {
    if (env.DB) try {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS share_opens (slug TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, last TEXT)").run();
      await env.DB.prepare("INSERT INTO share_opens (slug, n, last) VALUES (?, 1, ?) ON CONFLICT(slug) DO UPDATE SET n = n + 1, last = excluded.last").bind(slug, new Date().toISOString()).run();
    } catch {}
    return Response.redirect(new URL(dest, url).toString(), 302);
  }
  const pick = o => (o && typeof o === "object") ? ((en ? o.en : o.ar) || o.ar || o.en || "") : String(o || "");
  const title = pick(p.title) + " · Eyeblink Studio", desc = pick(p.summary) || (en ? "A work by Eyeblink Studio" : "عمل من Eyeblink Studio");
  const img = p.poster ? new URL(p.poster, url.origin + "/").toString() : url.origin + "/assets/img/og.jpg";
  const to = new URL(dest, url).toString();
  const html = `<!doctype html><html lang="${en ? "en" : "ar"}" dir="${en ? "ltr" : "rtl"}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="video.other"><meta property="og:site_name" content="Eyeblink Studio">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:url" content="${esc(url.origin + url.pathname)}">
<meta name="twitter:card" content="summary_large_image"><meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${esc(to)}"><link rel="canonical" href="${esc(to)}">
<style>html{background:#04061A;color:#EEF2F6;font:16px system-ui,sans-serif}a{color:#3FE0E8}</style></head>
<body><p style="text-align:center;margin-top:40vh"><a href="${esc(to)}">${esc(pick(p.title))}</a></p>
<script>location.replace(${JSON.stringify(to)})</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
