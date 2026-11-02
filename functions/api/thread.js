// GET  /api/thread?code=EB-XXXXX — the signed-in client's order: progress + messages (marks studio messages as read)
// POST /api/thread — { code, text }: the client writes to the studio (closed once the order is delivered or cancelled)
async function load(request, env, code){
  const u = await currentUser(request, env); if (!u) return [null, json({ ok: false }, 401)];
  const key = await env.EB.get("code:" + String(code || "").toUpperCase());
  const v = key && await env.EB.get(key); if (!v) return [null, json({ ok: false }, 404)];
  const o = JSON.parse(v); if (o.email !== u.email) return [null, json({ ok: false }, 404)];
  return [o, null];
}
export async function onRequestGet({ request, env }) {
  const [o, err] = await load(request, env, new URL(request.url).searchParams.get("code")); if (err) return err;
  if (unreadFor(o, "client")) { o.seenClient = new Date().toISOString(); await env.EB.put(o.key, JSON.stringify(o)); }
  return json({ ok: true, order: publicOrder(o) });
}
export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const [o, err] = await load(request, env, d.code); if (err) return err;
  if (o.status === "delivered" || o.status === "cancelled") return json({ ok: false, error: "closed" }, 403);
  const text = String(d.text || "").trim().slice(0, 3000); if (!text) return json({ ok: false }, 400);
  if (await limited(env, "mrl:" + o.email, 40, 600)) return json({ ok: false, error: "too many messages" }, 429);
  const at = new Date().toISOString();
  (o.messages ||= []).push({ from: "client", text, at }); if (o.messages.length > 600) o.messages = o.messages.slice(-600);
  o.seenClient = at; o.updatedAt = at;
  await env.EB.put(o.key, JSON.stringify(o));
  return json({ ok: true, order: publicOrder(o) });
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
