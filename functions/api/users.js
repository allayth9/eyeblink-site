// GET    /api/users — admin: client accounts
// PATCH  /api/users — admin: { email, password } sets a new password for a client who forgot theirs
// DELETE /api/users?email=... — admin: removes the account (their orders stay)
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const out = []; let cursor;
  do { const r = await env.EB.list({ prefix: "user:", cursor });
    for (const k of r.keys) { const v = await env.EB.get(k.name); if (!v) continue; const u = JSON.parse(v);
      out.push({ email: u.email, name: u.name, provider: u.provider, google: !!u.google, hasPassword: !!u.hash, createdAt: u.createdAt, lastLogin: u.lastLogin, orders: (u.orders || []).length }); }
    cursor = r.list_complete ? null : r.cursor; } while (cursor && out.length < 2000);
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return json({ ok: true, users: out });
}
export async function onRequestPatch({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const d = await request.json().catch(() => ({}));
  const v = await env.EB.get("user:" + String(d.email || "").toLowerCase()); if (!v) return json({ ok: false }, 404);
  const pw = String(d.password || ""); if (pw.length < 8) return json({ ok: false, error: "min 8" }, 400);
  const u = JSON.parse(v); u.salt = randHex(16); u.hash = await pbkdf2(pw, u.salt);
  await env.EB.put("user:" + u.email, JSON.stringify(u));
  return json({ ok: true });
}
export async function onRequestDelete({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const email = (new URL(request.url).searchParams.get("email") || "").toLowerCase();
  await env.EB.delete("user:" + email);
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
