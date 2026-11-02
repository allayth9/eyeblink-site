// GET  /api/media/<key> — public: serves an uploaded preview video, image or logo
// POST /api/media        — admin: upload a file (raw body, header x-filename); max 24 MB
export async function onRequestGet({ params, env }) {
  const key = (params.path || []).join("/");
  if (!key) return new Response("not found", { status: 404 });
  const { value, metadata } = await env.EB.getWithMetadata("media:" + key, { type: "arrayBuffer" });
  if (!value) return new Response("not found", { status: 404 });
  return new Response(value, { headers: { "content-type": metadata?.type || "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" } });
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
  const h=req.headers.get("authorization")||""; const pw=h.startsWith("Bearer ")?h.slice(7):"";
  if(!pw) return false;
  const ip=req.headers.get("cf-connecting-ip")||"x", fk="fail:"+ip, fails=+(await env.EB.get(fk)||0);
  if(fails>=10) return false;
  const stored=await env.EB.get("auth:hash");
  const ok= stored ? same(await sha256(pw), stored) : (!!env.ADMIN_PASSWORD && same(pw, env.ADMIN_PASSWORD));
  if(!ok) await env.EB.put(fk, String(fails+1), { expirationTtl: 3600 });
  return ok;
}
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
