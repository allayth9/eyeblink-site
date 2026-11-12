// GET  /api/auth  — is this password right?
// POST /api/auth  — change the password: { newPassword }  (send the current one as Authorization)
export async function onRequestGet({ request, env }) {
  if (!env.ADMIN_PASSWORD && !(await env.EB.get("auth:hash"))) return json({ ok: false, error: "no password set" }, 500);
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  // a panel opened with only its session cookie (no password sent): it is still signed in, keep that session as it is
  if (!(request.headers.get("authorization") || "").startsWith("Bearer ")) return json({ ok: true, session: true });
  // «remember me on this device»: 30 days instead of 12 hours
  const ttl = new URL(request.url).searchParams.get("remember") ? 30 * 86400 : 12 * 3600;
  const t = [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2, "0")).join("");
  await env.EB.put("asess:" + t, "1", { expirationTtl: ttl });
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": "eb_a=" + t + "; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + ttl } });
}
// sign out: this device's session ends
export async function onRequestDelete({ request, env }) {
  const s = (request.headers.get("cookie") || "").match(/(?:^|;\s*)eb_a=([a-f0-9]{48})(?:;|$)/);
  if (s) await env.EB.delete("asess:" + s[1]);
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": "eb_a=; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" } });
}
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const { newPassword } = await request.json().catch(() => ({}));
  if (!newPassword || newPassword.length < 10) return json({ ok: false, error: "min 10 characters" }, 400);
  await env.EB.put("auth:hash", await adminPwHash(newPassword));
  // sign out every open panel session: from now on only the new password gets in
  let cursor; do { const r = await env.EB.list({ prefix: "asess:", cursor }); for (const k of r.keys) await env.EB.delete(k.name); cursor = r.list_complete ? null : r.cursor; } while (cursor);
  // …and open a fresh one for the panel that just changed it
  const t = [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2, "0")).join("");
  await env.EB.put("asess:" + t, "1", { expirationTtl: 12 * 3600 });
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": "eb_a=" + t + "; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200" } });
}

// ---- shared auth (same block in every route) ----
// Password: a hash saved from the admin panel (KV "auth:hash"), or else the ADMIN_PASSWORD secret.
// More than 10 wrong attempts from one address locks it for an hour.
async function sha256(t){ const b=await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
function same(a,b){ if(a.length!==b.length) return false; let d=0; for(let i=0;i<a.length;i++) d|=a.charCodeAt(i)^b.charCodeAt(i); return d===0; }
async function isAdmin(req, env){
  // the panel's session (cookie set by GET /api/auth after the password was checked): no hashing on every request
  const s=(req.headers.get("cookie")||"").match(/(?:^|;\s*)eb_a=([a-f0-9]{48})(?:;|$)/);
  if(s && await env.EB.get("asess:"+s[1])) return true;
  const h=req.headers.get("authorization")||""; const pw=h.startsWith("Bearer ")?h.slice(7):"";
  if(!pw) return false;
  const ip=req.headers.get("cf-connecting-ip")||"x", fk="fail:"+ip, fails=+(await env.EB.get(fk)||0);
  if(fails>=10) return false;
  const stored=await env.EB.get("auth:hash");
  const ok= stored ? await adminPwCheck(pw, stored) : (!!env.ADMIN_PASSWORD && same(pw, env.ADMIN_PASSWORD));
  if(!ok) await env.EB.put(fk, String(fails+1), { expirationTtl: 3600 });
  else if(stored && !stored.startsWith("pbkdf2$")) await env.EB.put("auth:hash", await adminPwHash(pw));   // old plain SHA-256 → salted PBKDF2
  return ok;
}
// Panel password, stored like client passwords: "pbkdf2$<iterations>$<salt>$<hash>" (salted PBKDF2-SHA256).
// A bare 64-character SHA-256 hash from before still works once, then is replaced.
async function adminPbkdf2(pw, salt, iter){
  const k=await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const b=await crypto.subtle.deriveBits({ name:"PBKDF2", hash:"SHA-256", salt:new TextEncoder().encode(salt), iterations:iter }, k, 256);
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function adminPwHash(pw){
  const salt=[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,"0")).join("");
  return "pbkdf2$100000$"+salt+"$"+await adminPbkdf2(pw, salt, 100000);
}
async function adminPwCheck(pw, stored){
  const p=stored.split("$");
  if(p[0]==="pbkdf2" && p.length===4) return same(await adminPbkdf2(pw, p[2], Math.min(+p[1]||100000, 100000)), p[3]);
  return same(await sha256(pw), stored);
}
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
