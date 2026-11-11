// GET /api/content — public: the live site content (404 until the first publish)
// PUT /api/content — admin: replace the content; the previous version is kept for 30 days
// «فـي» → «في»: a tatweel once typed after the faa to dodge a font fault (now fixed in CSS) is dropped, on reading and on saving
const unFaa = s => s.replace(/فـ+(?=[يى])/g, "ف");
export async function onRequestGet({ env }) {
  const v = await env.EB.get("content");
  if (!v) return new Response("not found", { status: 404 });
  return new Response(unFaa(v), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
export async function onRequestPut({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const body = unFaa(await request.text());
  if (body.length > 1_000_000) return json({ ok: false, error: "too large" }, 413);
  let data; try { data = JSON.parse(body); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  if (!data || !Array.isArray(data.services) || !data.hero) return json({ ok: false, error: "missing sections" }, 400);
  const prev = await env.EB.get("content");
  if (prev) await env.EB.put("backup:" + Date.now(), prev, { expirationTtl: 60 * 60 * 24 * 30 });
  // every work keeps a permanent id (its view count is stored under it); same key the site uses before one exists
  const seen = new Set();
  for (const p of Array.isArray(data.projects) ? data.projects : []) {
    if (!p || typeof p !== "object") continue;
    let id = p.id || workKey(p), k = id, i = 2;
    while (seen.has(k)) k = id + "-" + i++;
    p.id = k; seen.add(k);
  }
  data.updatedAt = new Date().toISOString();
  await env.EB.put("content", JSON.stringify(data));
  return json({ ok: true, updatedAt: data.updatedAt });
}
// a work's key before it has an id (same as functions/api/views.js and assets/js/render.js)
function fp(s){ let h = 5381; s = String(s); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function workKey(p){ return "w" + fp(p.poster || p.preview || (p.full && (p.full.id || p.full.src)) || (p.title && p.title.ar) || ""); }

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
