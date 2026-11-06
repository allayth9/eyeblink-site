// The Syrian pound against the dollar, for pricing quotes in SYP. Admin only.
// GET /api/fx → { ok, SYP, buy, sell, at, stale }  — refreshed at most once a day from the public USD page of sp-today.com
// (their robots.txt disallows /api/, so we read the public page, Damascus market price; we use "sell", the side that protects the studio)
const FX_KEY = "fx:syp", FX_URL = "https://sp-today.com/en/currency/us-dollar", FX_TTL = 20 * 3600e3;

async function fetchSyp(){
  const r = await fetch(FX_URL, { headers: { "user-agent": "EyeblinkStudio/1.0 (+https://eyeblinkstudio.com) daily-rate", accept: "text/html" }, cf: { cacheTtl: 3600 } });
  if (!r.ok) throw new Error("http " + r.status);
  const html = await r.text();
  // the page embeds its data as escaped JSON: \"damascus\":{\"buy\":14350,\"sell\":14425,…
  const m = html.match(/\\?"damascus\\?":\{\\?"buy\\?":(\d+(?:\.\d+)?),\\?"sell\\?":(\d+(?:\.\d+)?)/);
  if (!m) throw new Error("no damascus rate");
  const buy = +m[1], sell = +m[2];
  if (!(buy > 100 && sell >= buy && sell < 1e7)) throw new Error("implausible rate");   // guards against a page change feeding nonsense into prices
  return { buy, sell, SYP: sell, at: new Date().toISOString(), src: "sp-today.com" };
}

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const old = JSON.parse(await env.EB.get(FX_KEY) || "null");
  if (old && Date.now() - Date.parse(old.at) < FX_TTL && !new URL(request.url).searchParams.get("force")) return json({ ok: true, ...old });
  try { const fresh = await fetchSyp(); await env.EB.put(FX_KEY, JSON.stringify(fresh)); return json({ ok: true, ...fresh }); }
  catch (e) { return old ? json({ ok: true, ...old, stale: true, error: String(e.message || e) }) : json({ ok: false, error: String(e.message || e) }, 502); }
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
const json=(o,s=200,h={})=>new Response(JSON.stringify(o),{status:s,headers:Object.assign({"content-type":"application/json; charset=utf-8","cache-control":"no-store"},h)});

