// POST   /api/orders — signed-in client: sends a request (it then lives in their account with a chat thread)
// GET    /api/orders — admin: list requests (newest first)
// PATCH  /api/orders — admin: { key, status?, price?, method?, paid?, paidAmount?, notes?, message?, seen? }
// DELETE /api/orders?key=... — admin
const STATUSES = ["new", "confirmed", "awaiting-payment", "paid", "in-progress", "review", "delivered", "cancelled"];
export async function onRequestPost({ request, env }) {
  let d; try { d = await request.json(); } catch { return json({ ok: false }, 400); }
  if (d.website) return json({ ok: true, code: "EB-00000" });
  const user = await currentUser(request, env);
  if (!user) return json({ ok: false, error: "login" }, 401);
  const ip = request.headers.get("cf-connecting-ip") || "x";
  const rl = "rl:" + ip, n = +(await env.EB.get(rl) || 0);
  if (n >= 6) return json({ ok: false, error: "too many requests" }, 429);
  await env.EB.put(rl, String(n + 1), { expirationTtl: 3600 });
  const clip = (v, m) => String(v ?? "").slice(0, m);
  const name = clip(user.name, 120), contact = clip(d.contact, 200), details = clip(d.details, 4000);
  if (!details) return json({ ok: false, error: "missing fields" }, 400);
  let code; do { code = "EB-" + randHex(3).toUpperCase().slice(0, 5); } while (await env.EB.get("code:" + code));
  const key = "order:" + new Date().toISOString() + ":" + code;
  const order = { key, code, status: "new", createdAt: new Date().toISOString(), name, contact, details,
    link: clip(d.link, 500), deadline: clip(d.deadline, 20), package: clip(d.package, 60), packageName: clip(d.packageName, 120),
    addons: (Array.isArray(d.addons) ? d.addons : []).slice(0, 12).map(a => clip(a, 80)), total: clip(d.total, 40), lang: clip(d.lang, 4),
    email: user.email, messages: [], seenClient: "", seenAdmin: "",
    price: "", method: "", paid: false, paidAmount: "", notes: "", history: [{ at: new Date().toISOString(), status: "new" }] };
  await env.EB.put(key, JSON.stringify(order));
  await env.EB.put("code:" + code, key);
  (user.orders ||= []).push(key); await env.EB.put("user:" + user.email, JSON.stringify(user));
  return json({ ok: true, code });
}
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const out = []; let cursor;
  do {
    const r = await env.EB.list({ prefix: "order:", cursor });
    for (const k of r.keys) { const v = await env.EB.get(k.name); if (v) { const x = JSON.parse(v); x.unread = unreadFor(x, "admin"); out.push(x); } }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor && out.length < 1000);
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return json({ ok: true, orders: out });
}
export async function onRequestPatch({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const d = await request.json().catch(() => ({}));
  if (!d.key?.startsWith("order:")) return json({ ok: false }, 400);
  const v = await env.EB.get(d.key); if (!v) return json({ ok: false }, 404);
  const o = JSON.parse(v), clip = (x, m) => String(x ?? "").slice(0, m);
  if (d.status !== undefined) { if (!STATUSES.includes(d.status)) return json({ ok: false }, 400); if (d.status !== o.status) (o.history ||= []).push({ at: new Date().toISOString(), status: d.status }); o.status = d.status; }
  if (d.price !== undefined) o.price = clip(d.price, 40);
  if (d.method !== undefined) o.method = clip(d.method, 60);
  if (d.paid !== undefined) o.paid = !!d.paid;
  if (d.paidAmount !== undefined) o.paidAmount = clip(d.paidAmount, 40);
  if (d.notes !== undefined) o.notes = clip(d.notes, 4000);
  const now = new Date().toISOString();
  if (d.message) { (o.messages ||= []).push({ from: "studio", text: clip(d.message, 4000), at: now }); o.seenAdmin = now; }
  if (d.seen) o.seenAdmin = now;
  o.updatedAt = new Date().toISOString();
  await env.EB.put(d.key, JSON.stringify(o));
  return json({ ok: true, order: o });
}
export async function onRequestDelete({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!key.startsWith("order:")) return json({ ok: false }, 400);
  const v = await env.EB.get(key);
  if (v) { const o = JSON.parse(v); await env.EB.delete("code:" + o.code); }
  await env.EB.delete(key);
  return json({ ok: true });
}

// ---- shared auth (same block in every route) ----
// Password: a hash saved from the admin panel (KV "auth:hash"), or else the ADMIN_PASSWORD secret.
// More than 10 wrong attempts from one address locks it for an hour.
async function sha256(t){ const b=await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
function same(a,b){ if(a.length!==b.length) return false; let d=0; for(let i=0;i<a.length;i++) d|=a.charCodeAt(i)^b.charCodeAt(i); return d===0; }
async function isAdmin(req, env){
  const h=req.headers.get("authorization")||""; const pw=h.startsWith("Bearer ")?h.slice(7):"";
  if(!pw) return false;
  const ip=req.headers.get("cf-connecting-ip")||"x", fk="fail:"+ip, fails=+(await env.EB.get(fk)||0);
  if(fails>=10) return false;
  const stored=await env.EB.get("auth:hash");
  const ok= stored ? same(await sha256(pw), stored) : (!!env.ADMIN_PASSWORD && same(pw, env.ADMIN_PASSWORD));
  if(!ok) await env.EB.put(fk, String(fails+1), { expirationTtl: 3600 });
  return ok;
}
const json=(o,s=200,h={})=>new Response(JSON.stringify(o),{status:s,headers:Object.assign({"content-type":"application/json; charset=utf-8","cache-control":"no-store"},h)});

// ---- client accounts (same block in every route that needs it) ----
// Sessions: random token in an HttpOnly cookie "eb_s" → KV "sess:<token>" = email (30 days).
const SESSION_DAYS = 30;
function cookie(req, name){ const m=(req.headers.get("cookie")||"").match(new RegExp("(?:^|;\\s*)"+name+"=([^;]+)")); return m?m[1]:""; }
function randHex(n){ return [...crypto.getRandomValues(new Uint8Array(n))].map(x=>x.toString(16).padStart(2,"0")).join(""); }
async function currentUser(req, env){
  const t=cookie(req,"eb_s"); if(!/^[a-f0-9]{48}$/.test(t)) return null;
  const email=await env.EB.get("sess:"+t); if(!email) return null;
  const u=await env.EB.get("user:"+email); return u?JSON.parse(u):null;
}
async function startSession(env, email){
  const t=randHex(24); await env.EB.put("sess:"+t, email, { expirationTtl: SESSION_DAYS*86400 });
  return "eb_s="+t+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+(SESSION_DAYS*86400);
}
async function pbkdf2(pw, salt){
  const k=await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const b=await crypto.subtle.deriveBits({ name:"PBKDF2", hash:"SHA-256", salt:new TextEncoder().encode(salt), iterations:100000 }, k, 256);
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function limited(env, key, max, ttl){ const n=+(await env.EB.get(key)||0); if(n>=max) return true; await env.EB.put(key,String(n+1),{expirationTtl:ttl}); return false; }
function unreadFor(o, who){ const seen = who==="client" ? (o.seenClient||"") : (o.seenAdmin||""); const other = who==="client" ? "studio" : "client";
  return (o.messages||[]).filter(m=>m.from===other && m.at>seen).length; }
function publicOrder(o){ return { code:o.code, status:o.status, createdAt:o.createdAt, packageName:o.packageName, package:o.package, addons:o.addons||[], total:o.total, price:o.price,
  paid:!!o.paid, details:o.details, link:o.link, deadline:o.deadline, history:o.history||[], messages:(o.messages||[]).map(m=>({from:m.from,text:m.text,at:m.at})), unread:unreadFor(o,"client") }; }
