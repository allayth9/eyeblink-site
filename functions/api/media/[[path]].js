// GET  /api/media/<key> — public: serves an uploaded preview video, image or logo. Answers byte ranges
//                         (Safari and iPhones only play a video that can be fetched in parts).
// POST /api/media        — admin: upload a file (raw body, header x-filename); max 24 MB
export async function onRequestGet({ request, params, env }) {
  const key = (params.path || []).join("/");
  if (!key) return new Response("not found", { status: 404 });
  const { value, metadata } = await env.EB.getWithMetadata("media:" + key, { type: "arrayBuffer" });
  if (!value) return new Response("not found", { status: 404 });
  const size = value.byteLength;
  const head = { "content-type": metadata?.type || "application/octet-stream", "cache-control": "public, max-age=31536000, immutable", "accept-ranges": "bytes" };
  const m = /^bytes=(\d*)-(\d*)$/.exec((request.headers.get("range") || "").trim());
  if (m && (m[1] !== "" || m[2] !== "")) {
    let a = m[1] === "" ? size - +m[2] : +m[1], b = m[1] === "" || m[2] === "" ? size - 1 : Math.min(+m[2], size - 1);
    if (a < 0) a = 0;
    if (a >= size || a > b) return new Response(null, { status: 416, headers: { ...head, "content-range": "bytes */" + size } });
    return new Response(value.slice(a, b + 1), { status: 206, headers: { ...head, "content-range": `bytes ${a}-${b}/${size}`, "content-length": String(b - a + 1) } });
  }
  return new Response(value, { headers: { ...head, "content-length": String(size) } });
}
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const type = request.headers.get("content-type") || "application/octet-stream";
  if (!/^(video\/(mp4|webm)|image\/(jpeg|png|webp|gif|avif|svg\+xml))$/.test(type)) return json({ ok: false, error: "only mp4/webm video or images" }, 415);
  const buf = await request.arrayBuffer();
  if (buf.byteLength > 24 * 1024 * 1024) return json({ ok: false, error: "max 24 MB" }, 413);
  const name = (request.headers.get("x-filename") || "file").toLowerCase().replace(/[^a-z0-9.\-_]/g, "-").slice(-60);
  const key = Date.now().toString(36) + "-" + name;
  await env.EB.put("media:" + key, buf, { metadata: { type, size: buf.byteLength } });
  return json({ ok: true, url: "/api/media/" + key });
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
