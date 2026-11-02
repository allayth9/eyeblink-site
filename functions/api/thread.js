// GET  /api/thread?code=EB-XXXXX — the signed-in client's order: progress + messages (marks studio messages as read)
// POST /api/thread — { code, text, files? }: the client writes to the studio (closed once delivered or cancelled)
//                    { code, review: { stars, text, publish } }: rating after delivery
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
export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const d = await request.json().catch(() => ({}));
  const [o, err] = await load(request, env, d.code); if (err) return err;
  const at = new Date().toISOString();
  if (d.review) {
    if (o.status !== "delivered") return json({ ok: false, error: "not delivered" }, 403);
    const stars = Math.max(1, Math.min(5, Math.round(+d.review.stars || 0)));
    o.review = { stars, text: String(d.review.text || "").trim().slice(0, 600), publish: !!d.review.publish, approved: false, at };
    await env.EB.put(o.key, JSON.stringify(o));
    later(ctx, notifyStudio(env, "تقييم جديد ★".repeat(1)+stars+" — "+o.code, o.name+": "+(o.review.text||"—")+(o.review.publish?"\n(وافق على النشر — فعّله من لوحة التحكم)":"")));
    return json({ ok: true, order: publicOrder(o) });
  }
  if (o.status === "delivered" || o.status === "cancelled") return json({ ok: false, error: "closed" }, 403);
  const text = String(d.text || "").trim().slice(0, 3000), files = cleanFiles(d.files);
  if (!text && !files.length) return json({ ok: false }, 400);
  if (await limited(env, "mrl:" + o.email, 40, 600)) return json({ ok: false, error: "too many messages" }, 429);
  (o.messages ||= []).push({ from: "client", text, at, ...(files.length ? { files } : {}) }); if (o.messages.length > 600) o.messages = o.messages.slice(-600);
  o.seenClient = at; o.updatedAt = at;
  await env.EB.put(o.key, JSON.stringify(o));
  later(ctx, notifyStudio(env, "رسالة من "+o.name+" — "+o.code, text + (files.length ? "\n📎 " + files.map(f => f.name).join("، ") : "")));
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
  paid:!!o.paid, details:o.details, link:o.link, deadline:o.deadline, history:o.history||[], messages:(o.messages||[]).map(m=>({from:m.from,text:m.text,at:m.at,files:m.files||undefined})), unread:unreadFor(o,"client"),
  name:o.name, email:o.email, method:o.method, review:o.review||null }; }
// attachments must point at files uploaded through /api/files
function cleanFiles(list){ return (Array.isArray(list)?list:[]).slice(0,8).filter(f=>f&&/^\/api\/files\/[a-z0-9][a-z0-9.\-_]{10,120}$/.test(f.url||""))
  .map(f=>({url:f.url, name:String(f.name||"file").slice(0,120), type:String(f.type||"").slice(0,80), size:+f.size||0})); }

// ---- notifications: Resend e-mail + Telegram (each one is skipped quietly until its secrets are set) ----
const SITE = "https://eyeblinkstudio.com";
const ST_AR = {"new":"استلمنا الطلب","confirmed":"تأكيد التفاصيل","awaiting-payment":"بانتظار الدفع","paid":"تم الدفع","in-progress":"قيد التنفيذ","review":"بانتظار مراجعتك","delivered":"تم التسليم","cancelled":"ملغى"};
const ST_EN = {"new":"Request received","confirmed":"Details confirmed","awaiting-payment":"Awaiting payment","paid":"Paid","in-progress":"In production","review":"Awaiting your review","delivered":"Delivered","cancelled":"Cancelled"};
function h(t){ return String(t??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
async function siteSettings(env){ try { return (JSON.parse(await env.EB.get("content")||"{}").settings)||{}; } catch { return {}; } }
async function sendMail(env, to, subject, html){
  if (!env.RESEND_API_KEY || !to) return false;
  try { const r = await fetch("https://api.resend.com/emails", { method:"POST", headers:{ authorization:"Bearer "+env.RESEND_API_KEY, "content-type":"application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "Eyeblink Studio <hello@eyeblinkstudio.com>", to:[to], subject, html }) }); return r.ok; } catch { return false; }
}
async function telegram(env, text){
  if (!env.TELEGRAM_TOKEN || !env.TELEGRAM_CHAT) return;
  try { await fetch("https://api.telegram.org/bot"+env.TELEGRAM_TOKEN+"/sendMessage", { method:"POST", headers:{ "content-type":"application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT, text: text.slice(0, 3900), disable_web_page_preview: true }) }); } catch {}
}
function mail(lang, title, bodyHtml, cta, link){
  const rtl = lang !== "en";
  return `<!doctype html><html dir="${rtl?"rtl":"ltr"}"><body style="margin:0;background:#04061A;padding:28px 12px;font-family:Tahoma,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#0b1236;border-radius:18px;padding:28px;color:#EEF2F6;text-align:${rtl?"right":"left"}">
<div style="font:600 12px/1 Arial,sans-serif;letter-spacing:4px;color:#3FE0E8;margin-bottom:18px;direction:ltr;text-align:${rtl?"right":"left"}">EYEBLINK STUDIO</div>
<h1 style="font-size:20px;margin:0 0 14px;color:#fff">${h(title)}</h1><div style="font-size:15px;line-height:1.8;color:#AEBBD2">${bodyHtml}</div>
${cta?`<a href="${link}" style="display:inline-block;margin-top:22px;background:#EEF2F6;color:#04061A;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">${h(cta)}</a>`:""}
</div><p style="text-align:center;color:#6F7FA0;font-size:12px;margin-top:16px">eyeblinkstudio.com</p></body></html>`;
}
// to the studio: e-mail (to the address in the site settings) + Telegram
async function notifyStudio(env, subject, text){
  const s = await siteSettings(env), to = env.NOTIFY_EMAIL || s.email;
  await Promise.all([ sendMail(env, to, subject, mail("ar", subject, h(text).replace(/\n/g,"<br>"), "افتح لوحة التحكم", SITE+"/admin/")),
    telegram(env, "🔔 "+subject+"\n\n"+text+"\n\n"+SITE+"/admin/") ]);
}
// to the client: new message from the studio / status change / request received
async function notifyClient(env, o, kind, text){
  if (!o.email) return;
  const en = o.lang === "en", link = SITE + (en ? "/en" : "") + "/account.html#" + o.code;
  const T = en ? { message:"New message about your request "+o.code, status:"Update on your request "+o.code, received:"We received your request "+o.code, cta:"Open my account",
                   statusP:"Your request is now: ", receivedP:"Thank you! We will review the details and reply in your account within 24 hours." }
               : { message:"رسالة جديدة بخصوص طلبك "+o.code, status:"تحديث على طلبك "+o.code, received:"استلمنا طلبك "+o.code, cta:"افتح حسابي",
                   statusP:"حالة طلبك الآن: ", receivedP:"شكراً لك! سنراجع التفاصيل ونرد عليك في حسابك خلال 24 ساعة." };
  const body = kind==="message" ? h(text).replace(/\n/g,"<br>") : kind==="status" ? h(T.statusP) + "<b style=\"color:#fff\">"+h((en?ST_EN:ST_AR)[text]||text)+"</b>" : h(T.receivedP);
  await sendMail(env, o.email, T[kind], mail(en?"en":"ar", T[kind], body, T.cta, link));
}
function later(ctx, p){ if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(p); else return p; }
