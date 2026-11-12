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
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",                       // a file is only ever what its type says (no guessing an upload into a page)
  "Referrer-Policy": "strict-origin-when-cross-origin",      // private links (/d/…, workspace) never leak to other sites in full
};
function secure(res) {
  const r = new Response(res.body, res);
  for (const k in SECURITY) if (!r.headers.has(k)) r.headers.set(k, SECURITY[k]);
  return r;
}
export async function onRequest(ctx) {
  // the repo is published as it is: its developer files (dev/, dot-files) are not part of the site
  if (/^\/(dev(\/|$)|\.)/i.test(new URL(ctx.request.url).pathname)) return secure(new Response("Not found", { status: 404 }));
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
  if (!v) return res;
  const t = String(v).trim().slice(0, 140);
  const set = { element(e) { e.setInnerContent(t); } }, meta = { element(e) { e.setAttribute("content", t); } };
  return new HTMLRewriter().on("title", set).on('meta[property="og:title"]', meta).on('meta[name="twitter:title"]', meta).transform(res);
}
