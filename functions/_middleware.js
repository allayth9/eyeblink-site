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
export async function onRequest(ctx) {
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
