// GET /api/content — public: the live site content (404 until the first publish)
// PUT /api/content — admin: replace the content; the previous version is kept for 30 days
export async function onRequestGet({ env }) {
  const v = await env.EB.get("content");
  if (!v) return new Response("not found", { status: 404 });
  return new Response(v, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
export async function onRequestPut({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const body = await request.text();
  if (body.length > 1_000_000) return json({ ok: false, error: "too large" }, 413);
  let data; try { data = JSON.parse(body); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  if (!data || !Array.isArray(data.services) || !data.hero) return json({ ok: false, error: "missing sections" }, 400);
  const prev = await env.EB.get("content");
  if (prev) await env.EB.put("backup:" + Date.now(), prev, { expirationTtl: 60 * 60 * 24 * 30 });
  data.updatedAt = new Date().toISOString();
  await env.EB.put("content", JSON.stringify(data));
  return json({ ok: true, updatedAt: data.updatedAt });
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
