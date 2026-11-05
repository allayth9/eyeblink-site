// POST /api/translate — admin: Arabic → English for the panel's bilingual fields.
//   body { items: { "<id>": "<Arabic text>", … } }  →  { ok, items: { "<id>": "<English text>", … } }
// Uses Cloudflare Workers AI (binding "AI": Pages → Settings → Bindings → Workers AI). Free daily allowance.
// Without the binding it answers 501 and the panel simply leaves the English fields as they are.
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const BATCH = 15, MAX_ITEMS = 80, MAX_LEN = 4000;
const SYSTEM = `You translate website copy for Eyeblink Studio, an independent studio for video editing, motion graphics and film production, from Arabic into English.
Write natural, polished English marketing copy that reads as if written in English (not word-for-word), in the same tone and length.
Input: a JSON object mapping ids to Arabic text. Output: ONLY a JSON object with exactly the same ids mapping to the English text. No comments, no code fences.
Rules:
- Keep HTML tags and their attributes exactly as they are (for example <span class="grad">…</span>); translate only the text inside them.
- Keep placeholders in curly braces unchanged, e.g. {name}, {code}, {price}.
- Keep brand, product and tool names and any Latin-script words as they are (Eyeblink Studio, Premiere Pro, After Effects, Vimeo, Reels).
- Keep numbers, prices, currency symbols, emoji and separators such as • · — | / as they are. Use Western digits.
- Keep line breaks (\\n) in the same places: one English line per Arabic line.
- Short labels and button texts stay short. Headings use sentence case.
- If a value is already English or only a name, return it unchanged.`;

export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  if (!env.AI) return json({ ok: false, error: "ai" }, 501);
  const d = await request.json().catch(() => ({}));
  const all = Object.entries(d && typeof d.items === "object" && d.items ? d.items : {})
    .filter(([k, v]) => /^[\w.\-:]{1,200}$/.test(k) && typeof v === "string" && v.trim())
    .slice(0, MAX_ITEMS).map(([k, v]) => [k, v.slice(0, MAX_LEN)]);
  const out = {};
  for (let i = 0; i < all.length; i += BATCH) {
    const part = all.slice(i, i + BATCH);
    let got = await ask(env, Object.fromEntries(part));
    // a batch the model could not return as clean JSON: one string at a time
    if (!got) { got = {}; for (const [k, v] of part) { const one = await ask(env, { [k]: v }); if (one && one[k]) got[k] = one[k]; } }
    for (const [k] of part) if (typeof got[k] === "string" && got[k].trim()) out[k] = got[k].trim();
  }
  return json({ ok: true, items: out, model: MODEL });
}

async function ask(env, obj) {
  try {
    const r = await env.AI.run(MODEL, {
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(obj) }],
      temperature: 0.2, max_tokens: 3000,
    });
    const t = typeof r?.response === "string" ? r.response : JSON.stringify(r?.response ?? "");
    const m = t.match(/\{[\s\S]*\}/); if (!m) return null;
    const j = JSON.parse(m[0]);
    return j && typeof j === "object" ? j : null;
  } catch { return null; }
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
