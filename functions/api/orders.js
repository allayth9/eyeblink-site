// POST   /api/orders — public: a visitor sends a package request
// GET    /api/orders — admin: list requests (newest first)
// PATCH  /api/orders — admin: { key, status?, price?, method?, paid?, paidAmount?, notes? }
// DELETE /api/orders?key=... — admin
const STATUSES = ["new", "confirmed", "awaiting-payment", "paid", "in-progress", "review", "delivered", "cancelled"];
export async function onRequestPost({ request, env }) {
  let d; try { d = await request.json(); } catch { return json({ ok: false }, 400); }
  if (d.website) return json({ ok: true, code: "EB-00000" });
  const ip = request.headers.get("cf-connecting-ip") || "x";
  const rl = "rl:" + ip, n = +(await env.EB.get(rl) || 0);
  if (n >= 6) return json({ ok: false, error: "too many requests" }, 429);
  await env.EB.put(rl, String(n + 1), { expirationTtl: 3600 });
  const clip = (v, m) => String(v ?? "").slice(0, m);
  const name = clip(d.name, 120), contact = clip(d.contact, 200), details = clip(d.details, 4000);
  if (!name || !contact || !details) return json({ ok: false, error: "missing fields" }, 400);
  const code = "EB-" + Math.random().toString(36).slice(2, 7).toUpperCase();
  const key = "order:" + new Date().toISOString() + ":" + code;
  const order = { key, code, status: "new", createdAt: new Date().toISOString(), name, contact, details,
    link: clip(d.link, 500), deadline: clip(d.deadline, 20), package: clip(d.package, 60), packageName: clip(d.packageName, 120),
    addons: (Array.isArray(d.addons) ? d.addons : []).slice(0, 12).map(a => clip(a, 80)), total: clip(d.total, 40), lang: clip(d.lang, 4),
    price: "", method: "", paid: false, paidAmount: "", notes: "", history: [{ at: new Date().toISOString(), status: "new" }] };
  await env.EB.put(key, JSON.stringify(order));
  return json({ ok: true, code });
}
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const out = []; let cursor;
  do {
    const r = await env.EB.list({ prefix: "order:", cursor });
    for (const k of r.keys) { const v = await env.EB.get(k.name); if (v) out.push(JSON.parse(v)); }
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
  o.updatedAt = new Date().toISOString();
  await env.EB.put(d.key, JSON.stringify(o));
  return json({ ok: true, order: o });
}
export async function onRequestDelete({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!key.startsWith("order:")) return json({ ok: false }, 400);
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
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
