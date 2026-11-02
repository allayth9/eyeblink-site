// GET  /api/account — the signed-in client and a summary of their orders (401 if not signed in)
// POST /api/account — { action: "register", name, email, password } | { action: "login", email, password }
//                     | { action: "google", credential } | { action: "logout" }
const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export async function onRequestGet({ request, env }) {
  const u = await currentUser(request, env);
  if (!u) return json({ ok: false }, 401);
  const orders = [];
  for (const k of (u.orders || []).slice(-60).reverse()) {
    const v = await env.EB.get(k); if (!v) continue; const o = JSON.parse(v);
    orders.push({ code: o.code, status: o.status, createdAt: o.createdAt, packageName: o.packageName, unread: unreadFor(o, "client"),
      lastAt: ((o.messages || []).slice(-1)[0] || {}).at || o.updatedAt || o.createdAt });
  }
  return json({ ok: true, user: { email: u.email, name: u.name, provider: u.provider }, orders });
}
export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const ip = request.headers.get("cf-connecting-ip") || "x";
  if (d.action === "logout") {
    const t = cookie(request, "eb_s"); if (t) await env.EB.delete("sess:" + t);
    return json({ ok: true }, 200, { "set-cookie": "eb_s=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });
  }
  if (await limited(env, "arl:" + ip, 25, 3600)) return json({ ok: false, error: "too many attempts" }, 429);
  let user;
  if (d.action === "register" || d.action === "login") {
    const email = String(d.email || "").trim().toLowerCase(), pw = String(d.password || "");
    if (!EMAIL.test(email)) return json({ ok: false, error: "email" }, 400);
    const existing = await env.EB.get("user:" + email);
    if (d.action === "register") {
      const name = String(d.name || "").trim().slice(0, 80);
      if (!name) return json({ ok: false, error: "name" }, 400);
      if (pw.length < 8 || pw.length > 200) return json({ ok: false, error: "password" }, 400);
      if (existing) return json({ ok: false, error: "exists" }, 409);
      const salt = randHex(16);
      user = { email, name, provider: "password", salt, hash: await pbkdf2(pw, salt), createdAt: new Date().toISOString(), orders: [] };
    } else {
      if (!existing) return json({ ok: false, error: "wrong" }, 401);
      user = JSON.parse(existing);
      if (!user.hash) return json({ ok: false, error: "google" }, 400);
      if (!same(await pbkdf2(pw, user.salt), user.hash)) return json({ ok: false, error: "wrong" }, 401);
    }
  } else if (d.action === "google") {
    let clientId = env.GOOGLE_CLIENT_ID || "";
    if (!clientId) { const c = await env.EB.get("content"); try { clientId = (JSON.parse(c || "{}").settings || {}).googleClientId || ""; } catch {} }
    if (!clientId) return json({ ok: false, error: "google not set up" }, 400);
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(String(d.credential || "")));
    if (!r.ok) return json({ ok: false, error: "google" }, 401);
    const g = await r.json();
    if (g.aud !== clientId || !(g.email_verified === true || g.email_verified === "true") || +g.exp * 1000 < Date.now()) return json({ ok: false, error: "google" }, 401);
    const email = String(g.email).toLowerCase();
    const existing = await env.EB.get("user:" + email);
    user = existing ? JSON.parse(existing) : { email, name: String(g.name || email.split("@")[0]).slice(0, 80), provider: "google", createdAt: new Date().toISOString(), orders: [] };
    user.google = true;
  } else return json({ ok: false }, 400);
  user.lastLogin = new Date().toISOString();
  await env.EB.put("user:" + user.email, JSON.stringify(user));
  return json({ ok: true, user: { email: user.email, name: user.name } }, 200, { "set-cookie": await startSession(env, user.email) });
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
