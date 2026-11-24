// Page titles set in the admin (settings → tab titles) are written into the HTML itself on the way out,
// so link previews (WhatsApp, Telegram, X…) show the same title as the browser tab — not the build-time one.
const PAGES = ["index","services","service-editing","service-motion","service-social","service-films","work","pricing","about","contact","account","privacy"];
let memo = { at: 0, titles: null };
async function titles(env) {
  if (Date.now() - memo.at < 60000) return memo.titles;
  let t = null; try { t = (JSON.parse(await env.EB.get("content", { cacheTtl: 60 }) || "{}").titles) || null; } catch {}
  memo = { at: Date.now(), titles: t }; return t;
}
const attr = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Security headers on every response (pages, API, files): no other site may show these pages inside a frame
// (clickjacking: a hidden admin panel or client account laid under a fake page), and browsers stay on HTTPS.
const SECURITY = {
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": "frame-ancestors 'self'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",                       // a file is only ever what its type says (no guessing an upload into a page)
  "Referrer-Policy": "strict-origin-when-cross-origin",      // private links (/d/…, workspace) never leak to other sites in full
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",   // nothing on the site uses these
};
// What a page may load, written down (Content-Security-Policy), and enforced: anything else is blocked, and the browser
// tells /api/csp (kept in D1). A week in report-only (18 to 25 Nov) showed the list complete; the one host it lacked was
// Cloudflare Web Analytics, which Cloudflare adds to every page by itself.
// The outside hosts: three.js (cdnjs, the sky), Google sign-in, Vimeo (oEmbed, thumbnails, player, files), YouTube
// embeds and thumbnails, R2 for direct client uploads, Cloudflare Web Analytics. 'unsafe-inline' stays until the inline
// scripts get hashes.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://accounts.google.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: blob: https://i.vimeocdn.com https://i.ytimg.com https://*.googleusercontent.com https://accounts.google.com",
  "media-src 'self' blob: https://*.vimeocdn.com",
  "font-src 'self' data:",
  "connect-src 'self' https://vimeo.com https://accounts.google.com https://*.r2.cloudflarestorage.com https://cloudflareinsights.com",
  "frame-src 'self' https://player.vimeo.com https://www.youtube-nocookie.com https://accounts.google.com",
  "worker-src 'self' blob:", "manifest-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  "frame-ancestors 'self'", "report-uri /api/csp",
].join("; ");
function secure(res) {
  const r = new Response(res.body, res);
  for (const k in SECURITY) if (!r.headers.has(k)) r.headers.set(k, SECURITY[k]);
  // pages get the whole policy (it includes frame-ancestors); everything else keeps the frame rule from SECURITY above.
  // (Not in _headers: a header there replaces the one set here.)
  if ((r.headers.get("content-type") || "").includes("text/html")) r.headers.set("Content-Security-Policy", CSP);
  return r;
}
export async function onRequest(ctx) {
  // the repo is published as it is: its developer files (dev/, dot-files) are not part of the site
  // (tools/ and the old readme were removed on 12 Nov 2026; the edge cache may still hold them for a week)
  if (/^\/(dev(\/|$)|tools(\/|$)|\.|%D8%A7%D9%82%D8%B1%D8%A3%D9%86%D9%8A-README)/i.test(new URL(ctx.request.url).pathname)) return secure(new Response("Not found", { status: 404 }));
  // the panel is one page: /admin/orders, /admin/clients/<email>… all open /admin/ (its own files keep their paths)
  const p = new URL(ctx.request.url).pathname;
  if (ctx.request.method === "GET" && /^\/admin\/./.test(p) && !/\.(js|css|webmanifest|png|svg|ico|json|map|woff2?)$/i.test(p))
    return secure(await ctx.env.ASSETS.fetch(new Request(new URL("/admin/", ctx.request.url), ctx.request)));
  return secure(await withTitles(ctx));
}
async function withTitles(ctx) {
  const { request, env, next } = ctx;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin") || url.pathname.startsWith("/assets/")) return next();
  const res = await next();
  if (!(res.headers.get("content-type") || "").includes("text/html") || !env.EB) return res;
  const en = url.pathname === "/en" || url.pathname.startsWith("/en/");
  let id = url.pathname.replace(/^\/en/, "").replace(/^\//, "").replace(/\.html$/, "").replace(/\/$/, "") || "index";
  if (!PAGES.includes(id)) return res;
  const T = await titles(env), v = T && T[id] && T[id][en ? "en" : "ar"];
  if (!v || String(v).trim() === "Eyeblink Studio") return res; // the bare brand name is the old default, keep the keyword title
  const t = String(v).trim().slice(0, 140);
  const set = { element(e) { e.setInnerContent(t); } }, meta = { element(e) { e.setAttribute("content", t); } };
  return new HTMLRewriter().on("title", set).on('meta[property="og:title"]', meta).on('meta[name="twitter:title"]', meta).transform(res);
}
