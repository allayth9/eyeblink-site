// A page for one work: /w/<slug> (Arabic) or /w/<slug>?l=en.
// It is the work page of the site (same header, footer, styles), with its middle replaced by this work: the title and
// the line about it, the film, views · like · share, its story and Behind the Frame, then similar works and the contact
// block. Link previews (WhatsApp, Instagram…) and search engines read its own title, description and cover.
// Real opens are counted (D1, share_opens) so the panel can say how often a link was opened; preview bots are not.
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegrambot|discord|headless|lighthouse|pingdom|monitor|skypeuri|slack/i;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const attr = (html, re, val) => html.replace(re, (m, a, b) => a + esc(val) + b);

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url), en = url.searchParams.get("l") === "en";
  const slug = String([].concat(params.path || [])[0] || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  let c = {}; try { c = JSON.parse(await env.EB.get("content", { cacheTtl: 60 }) || "{}"); } catch {}
  const p = slug && (c.projects || []).find(x => x && x.slug === slug);
  if (!p) return Response.redirect(new URL(en ? "/en/work" : "/work", url).toString(), 302);

  if (env.DB && !BOT.test(request.headers.get("user-agent") || "")) try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS share_opens (slug TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, last TEXT)").run();
    await env.DB.prepare("INSERT INTO share_opens (slug, n, last) VALUES (?, 1, ?) ON CONFLICT(slug) DO UPDATE SET n = n + 1, last = excluded.last").bind(slug, new Date().toISOString()).run();
  } catch {}

  const base = await env.ASSETS.fetch(new Request(new URL(en ? "/en/work" : "/work", url)));
  if (!base.ok) return Response.redirect(new URL((en ? "/en/work" : "/work") + "?w=" + slug, url).toString(), 302);
  let html = await base.text();
  const pick = o => (o && typeof o === "object") ? ((en ? o.en : o.ar) || o.ar || o.en || "") : String(o || "");
  const svc = (c.services || []).find(s => s.id === p.service) || {};
  const title = pick(p.title), sum = pick(p.summary), client = pick(p.client);
  const full = title + " · Eyeblink Studio", desc = sum || (en ? "A work by Eyeblink Studio" : "عمل من Eyeblink Studio");
  const img = p.poster ? new URL(p.poster, url.origin + "/").toString() : url.origin + "/assets/img/og.jpg";
  const self = url.origin + "/w/" + slug + (en ? "?l=en" : "");
  const ar = await filmSize(p);

  // head: a base so the page's relative links still work from /w/, then this work's title, description and cover
  html = html.replace(/<meta charset="utf-8">/i, '<meta charset="utf-8"><base href="' + (en ? "/en/" : "/") + '">');
  html = html.replace(/<title>[^<]*<\/title>/, "<title>" + esc(full) + "</title>");
  html = attr(html, /(<meta name="description" content=")[^"]*(")/, desc);
  html = attr(html, /(<meta property="og:title" content=")[^"]*(")/, full);
  html = attr(html, /(<meta property="og:description" content=")[^"]*(")/, desc);
  html = attr(html, /(<meta property="og:url" content=")[^"]*(")/, self);
  html = attr(html, /(<link rel="canonical" href=")[^"]*(")/, self);
  html = html.replace(/<meta property="og:type" content="website">/, '<meta property="og:type" content="video.other">');
  html = /<meta property="og:image"/.test(html) ? attr(html, /(<meta property="og:image" content=")[^"]*(")/, img)
    : html.replace("</head>", '<meta property="og:image" content="' + esc(img) + '"><meta name="twitter:card" content="summary_large_image"></head>');
  html = html.replace(/<link rel="alternate" hreflang="ar" href="[^"]*"><link rel="alternate" hreflang="en" href="[^"]*"><link rel="alternate" hreflang="x-default" href="[^"]*">/,
    '<link rel="alternate" hreflang="ar" href="' + esc(url.origin + "/w/" + slug) + '"><link rel="alternate" hreflang="en" href="' + esc(url.origin + "/w/" + slug + "?l=en") + '">');
  html = html.replace(/data-page="work"/, 'data-page="case"');
  // the language switch keeps you on this work
  html = html.replace(/(<a class="lang[^"]*" href=")[^"]*(")/, (m, a, b) => a + (en ? "/w/" + slug : "/w/" + slug + "?l=en") + b);

  // the middle: this work, its story, similar works; the contact block stays
  const cta = (html.match(/<section class="block" data-sec="cta">[\s\S]*?<\/section>/) || [""])[0];
  const eyebrow = [svc.label || "", p.year || ""].filter(Boolean).join(" · ");
  const main = `<main>
<section class="page-hero case-hero"><div class="wrap intro">
  ${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ""}
  <h1>${esc(title)}</h1>
  ${sum ? `<p class="lead">${esc(sum)}</p>` : ""}
  ${client ? `<p class="case-client">${en ? "For" : "لصالح"} <b>${esc(client)}</b></p>` : ""}
</div></section>
<section class="block" style="padding-top:0"><div class="wrap" id="casePage" data-slug="${esc(slug)}">
  <div class="case-player${ar && ar[1] > ar[0] ? " tall" : ""}" id="casePlayer"${ar ? ` data-real style="--ar:${ar[0]}/${ar[1]};--arn:${(ar[0] / ar[1]).toFixed(4)}"` : ""}>${p.poster ? `<img alt="" src="${esc(img)}" fetchpriority="high">` : ""}<button type="button" class="case-play glass" aria-label="${en ? "Play" : "تشغيل"}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 1.5v13l11-6.5z"/></svg></button></div>
  <script>document.getElementById('casePlayer').addEventListener('click',function(){ this._want=1; },{once:true});</script>
  <div class="cact" id="caseAct"></div>
  <div class="lb-case case-story" id="caseStory" hidden></div>
</div></section>
<section class="block case-sim"><div class="wrap">
  <h2>${en ? "Similar work" : "أعمال مشابهة"}</h2>
  <div class="grid3" id="workGrid" data-similar="${esc(slug)}" data-limit="3"></div>
  <div class="center"><a class="btn btn-glass glass" href="work">${en ? "All our work" : "كل الأعمال"}</a></div>
</div></section>
${cta}
</main>`;
  html = html.replace(/<main>[\s\S]*?<\/main>/, () => main);
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" } });
}

// the film's real width and height: Vimeo's own answer, else the panel's ratio (YouTube Shorts are 9:16)
async function filmSize(p) {
  const f = p.full || {}, raw = String(f.id || f.src || ""), m = /vimeo\.com\/(?:.*?\/)?(?:video\/)?(\d{5,})(?:\/([0-9a-f]{6,}))?/i.exec(raw) || (f.type === "vimeo" && /^(\d{5,})$/.exec(raw));
  if (m) try {
    const h = (/[?&]h=([0-9a-f]+)/i.exec(raw) || [])[1] || m[2] || "";
    const r = await fetch("https://vimeo.com/api/oembed.json?url=" + encodeURIComponent("https://vimeo.com/" + m[1] + (h ? "/" + h : "")),
      { headers: { referer: "https://eyeblinkstudio.com/" }, cf: { cacheTtl: 86400, cacheEverything: true }, signal: AbortSignal.timeout(1500) });
    const j = r.ok ? await r.json() : null; if (j && j.width && j.height) return [j.width, j.height];
  } catch {}
  if (/youtube\.com\/shorts\//i.test(raw)) return [9, 16];
  const q = /^(\d+(?:\.\d+)?)[:\/](\d+(?:\.\d+)?)$/.exec(p.ratio || ""); return q ? [+q[1], +q[2]] : null;
}
