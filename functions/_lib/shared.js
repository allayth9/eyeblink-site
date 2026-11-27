// Shared by every route in functions/api: admin auth, client accounts, notifications, money, invoices, e-mails.
// ---- admin auth ----
// Password: a hash saved from the admin panel (KV "auth:hash"), or else the ADMIN_PASSWORD secret.
// More than 10 wrong attempts from one address locks it for an hour.
export async function sha256(t){ const b=await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
export function same(a,b){ if(a.length!==b.length) return false; let d=0; for(let i=0;i<a.length;i++) d|=a.charCodeAt(i)^b.charCodeAt(i); return d===0; }
export async function isAdmin(req, env){
  // the panel's session (cookie set by GET /api/auth after the password was checked): no hashing on every request
  const s=(req.headers.get("cookie")||"").match(/(?:^|;\s*)eb_a=([a-f0-9]{48})(?:;|$)/);
  if(s && await env.EB.get("asess:"+s[1])) return true;
  const h=req.headers.get("authorization")||""; const pw=h.startsWith("Bearer ")?h.slice(7):"";
  if(!pw) return false;
  // with two-step sign-in on, the password alone opens nothing: only a session made after the second step does
  if(await env.EB.get("auth:2fa")) return false;
  return adminPwOk(req, env, pw);
}
// the panel password itself (sign-in step one, and the "current password" checks), with the lockout per address
export async function adminPwOk(req, env, pw){
  const ip=req.headers.get("cf-connecting-ip")||"x", fk="fail:"+ip, fails=await hits(env, fk);
  if(fails>=10) return false;
  const stored=await env.EB.get("auth:hash");
  const ok= !!pw && (stored ? await adminPwCheck(pw, stored) : (!!env.ADMIN_PASSWORD && same(pw, env.ADMIN_PASSWORD)));
  if(!ok) { const n=await bump(env, fk, 3600); await secLog(env, req, "fail", { step: "password" }); if(n===10) { await secLog(env, req, "lock"); await adminAlert(env, req, "lock"); } }
  else if(stored && !stored.startsWith("pbkdf2$")) await env.EB.put("auth:hash", await adminPwHash(pw));   // old plain SHA-256 → salted PBKDF2
  return ok;
}
// Telegram notes about the panel's own security (new device, lockout, two-step turned off)
// browser and system in a few words (the Telegram notes and the security log)
export function uaShort(ua){ ua=String(ua||"");
  const br=/Edg\//.test(ua)?"Edge":/OPR\//.test(ua)?"Opera":/Chrome\//.test(ua)?"Chrome":/Firefox\//.test(ua)?"Firefox":/Safari\//.test(ua)?"Safari":"متصفح آخر";
  const os=/iPhone|iPad/.test(ua)?"iOS":/Android/.test(ua)?"Android":/Windows/.test(ua)?"Windows":/Mac OS/.test(ua)?"macOS":/Linux/.test(ua)?"Linux":"نظام آخر";
  return br+" على "+os; }
// The panel's security log (settings → security): D1 table security_log, kept 90 days. Never a password, a code or a full IP.
// kind: login | fail | lock | password | 2fa_add | 2fa_remove | 2fa_off | codes | logout_all | backup;  data: a small object
export async function secLog(env, req, kind, data){
  if(!env.DB) return;
  try {
    const D=env.DB, cf=req.cf||{}, ip=req.headers.get("cf-connecting-ip")||"";
    const masked=ip.includes(":")?ip.split(":").slice(0,3).join(":")+":…":ip.replace(/\.\d+$/,".xxx");
    await D.prepare("CREATE TABLE IF NOT EXISTS security_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, kind TEXT NOT NULL, ip TEXT, city TEXT, country TEXT, agent TEXT, data TEXT)").run();
    await D.prepare("INSERT INTO security_log (at, kind, ip, city, country, agent, data) VALUES (?,?,?,?,?,?,?)")
      .bind(new Date().toISOString(), kind, masked.slice(0,48), String(cf.city||"").slice(0,60), String(cf.country||"").slice(0,4), uaShort(req.headers.get("user-agent")), data?JSON.stringify(data).slice(0,300):null).run();
    if(Math.random()<0.02) await D.prepare("DELETE FROM security_log WHERE at < ?").bind(new Date(Date.now()-90*86400e3).toISOString()).run();
  } catch {}
}
export async function adminAlert(env, req, kind){
  const cf=req.cf||{}, ua=req.headers.get("user-agent")||"";
  const where=[cf.city,cf.country].filter(Boolean).join("، ")||"غير معروف";
  const when=new Date().toLocaleString("ar-u-nu-latn",{timeZone:"Asia/Damascus",day:"numeric",month:"long",hour:"numeric",minute:"2-digit"});
  const T={ device:["🔐 دخول جديد إلى لوحة التحكم","تمّ الدخول من جهاز جديد."],
            lock:["⚠️ أُوقف الدخول إلى لوحة التحكم مؤقتاً","عشر محاولات خاطئة لكلمة السر من العنوان نفسه، فأُوقف الدخول منه لمدة ساعة."],
            off:["🔓 أُوقف التحقق بخطوتين","أصبح الدخول إلى لوحة التحكم بكلمة السر وحدها."] }[kind];
  return telegram(env, T[0]+"\n"+T[1]+"\nالمتصفح: "+uaShort(ua)+"\nالموقع التقريبي: "+where+"\nالوقت: "+when+
    "\n\nإن لم يكن هذا أنت، سجّل الخروج من كل الأجهزة وغيّر كلمة السر:\n"+SITE+"/admin/settings");
}
// Panel password, stored like client passwords: "pbkdf2$<iterations>$<salt>$<hash>" (salted PBKDF2-SHA256).
// A bare 64-character SHA-256 hash from before still works once, then is replaced.
export async function adminPbkdf2(pw, salt, iter){
  const k=await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const b=await crypto.subtle.deriveBits({ name:"PBKDF2", hash:"SHA-256", salt:new TextEncoder().encode(salt), iterations:iter }, k, 256);
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function adminPwHash(pw){
  const salt=[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,"0")).join("");
  return "pbkdf2$100000$"+salt+"$"+await adminPbkdf2(pw, salt, 100000);
}
export async function adminPwCheck(pw, stored){
  const p=stored.split("$");
  if(p[0]==="pbkdf2" && p.length===4) return same(await adminPbkdf2(pw, p[2], Math.min(+p[1]||100000, 100000)), p[3]);
  return same(await sha256(pw), stored);
}
export const json=(o,s=200,h={})=>new Response(JSON.stringify(o),{status:s,headers:Object.assign({"content-type":"application/json; charset=utf-8","cache-control":"no-store"},h)});

// ---- client accounts ----
// Sessions: random token in an HttpOnly cookie "eb_s" → KV "sess:<token>" = email (30 days).
export const SESSION_DAYS = 30;
export function cookie(req, name){ const m=(req.headers.get("cookie")||"").match(new RegExp("(?:^|;\\s*)"+name+"=([^;]+)")); return m?m[1]:""; }
export function randHex(n){ return [...crypto.getRandomValues(new Uint8Array(n))].map(x=>x.toString(16).padStart(2,"0")).join(""); }
export async function currentUser(req, env){
  const t=cookie(req,"eb_s"); if(!/^[a-f0-9]{48}$/.test(t)) return null;
  // a session is "email|version": a password change, a reset or a Google takeover raises the account's version and ends every older session
  const v=await env.EB.get("sess:"+t); if(!v) return null;
  const [email, sv]=v.split("|");
  const u=await env.EB.get("user:"+email); if(!u) return null;
  const user=JSON.parse(u); return (user.sv||0)===(+sv||0)?user:null;
}
export async function startSession(env, email){
  const u=JSON.parse(await env.EB.get("user:"+email)||"{}"), t=randHex(24);
  await env.EB.put("sess:"+t, email+(u.sv?"|"+u.sv:""), { expirationTtl: SESSION_DAYS*86400 });
  return "eb_s="+t+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+(SESSION_DAYS*86400);
}
export async function pbkdf2(pw, salt){
  const k=await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const b=await crypto.subtle.deriveBits({ name:"PBKDF2", hash:"SHA-256", salt:new TextEncoder().encode(salt), iterations:100000 }, k, 256);
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
// Attempt counters (sign-in tries, codes, messages an hour…) live in D1: one statement each, exact under load, and they never
// spend KV's daily writes (on the free plan a burst of bad sign-ins could otherwise use them all and stop everyone's sign-in
// for the rest of the day). Without D1 (local tests) they fall back to KV.
let LIM = false;
async function limTable(env){ if (!LIM) { await env.DB.prepare("CREATE TABLE IF NOT EXISTS limits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, exp INTEGER NOT NULL)").run(); LIM = true; } }
export async function hits(env, key){
  if (!env.DB) return +(await env.EB.get(key) || 0);
  await limTable(env); const r = await env.DB.prepare("SELECT n FROM limits WHERE k=? AND exp>=?").bind(key, Date.now()).first(); return r ? r.n : 0;
}
export async function bump(env, key, ttl){   // +1, the window starting at the first try; returns the new count
  if (!env.DB) { const n = +(await env.EB.get(key) || 0) + 1; await env.EB.put(key, String(n), { expirationTtl: ttl }); return n; }
  await limTable(env); const now = Date.now();
  const r = await env.DB.prepare("INSERT INTO limits (k, n, exp) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN exp < ?3 THEN 1 ELSE n + 1 END, exp = CASE WHEN exp < ?3 THEN ?2 ELSE exp END RETURNING n")
    .bind(key, now + ttl * 1000, now).first();
  if (Math.random() < 0.01) await env.DB.prepare("DELETE FROM limits WHERE exp < ?").bind(now).run();
  return r.n;
}
export async function limited(env, key, max, ttl){ if ((await hits(env, key)) >= max) return true; await bump(env, key, ttl); return false; }
export function unreadFor(o, who){ const seen = who==="client" ? (o.seenClient||"") : (o.seenAdmin||""); const other = who==="client" ? "studio" : "client";
  return (o.messages||[]).filter(m=>m.from===other && m.at>seen).length; }
export function publicOrder(o){ return { code:o.code, status:o.status, createdAt:o.createdAt, packageName:o.packageName, package:o.package, addons:o.addons||[], total:o.total, price:o.price,
  paid:!!o.paid, details:o.details, link:o.link, deadline:o.deadline, history:o.history||[], messages:(o.messages||[]).map(m=>({from:m.from,text:m.text,at:m.at,files:m.files||undefined,kind:m.kind||undefined})), unread:unreadFor(o,"client"),
  name:o.name, email:o.email, method:o.method, review:o.review||null, payInfo:o.payInfo||null, invoice:o.invoice||null, deposit:o.deposit||null, plan:o.plan||"full", items:o.items||[], cur:o.cur||"", qty:o.qty||1, platforms:o.platforms||[], payPref:o.payPref||"" }; }
// attachments must point at files uploaded through /api/files
export function cleanFiles(list){ return (Array.isArray(list)?list:[]).slice(0,8).filter(f=>f&&/^\/api\/files\/[a-z0-9][a-z0-9.\-_]{10,120}$/.test(f.url||""))
  .map(f=>({url:f.url, name:String(f.name||"file").slice(0,120), type:String(f.type||"").slice(0,80), size:+f.size||0})); }

// ---- notifications: Resend e-mail + Telegram (each one is skipped quietly until its secrets are set) ----
export const SITE = "https://eyeblinkstudio.com";
export const ST_AR = {"new":"استلمنا الطلب","discussing":"نناقش التفاصيل","confirmed":"تأكيد التفاصيل","awaiting-payment":"بانتظار الدفع","paid":"تم الدفع","in-progress":"قيد التنفيذ","review":"بانتظار مراجعتك","delivered":"تم التسليم","cancelled":"ملغى"};
export const ST_EN = {"new":"Request received","discussing":"Discussing details","confirmed":"Details confirmed","awaiting-payment":"Awaiting payment","paid":"Paid","in-progress":"In production","review":"Awaiting your review","delivered":"Delivered","cancelled":"Cancelled"};
export function h(t){ return String(t??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
export async function siteContent(env){ try { return JSON.parse(await env.EB.get("content")||"{}"); } catch { return {}; } }
export async function siteSettings(env){ return (await siteContent(env)).settings || {}; }
export async function sendMail(env, to, subject, html){
  if (!env.RESEND_API_KEY || !to) return false;
  try { const r = await fetch("https://api.resend.com/emails", { method:"POST", headers:{ authorization:"Bearer "+env.RESEND_API_KEY, "content-type":"application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "Eyeblink Studio <info@eyeblinkstudio.com>", to:[to], subject, html }) }); return r.ok; } catch { return false; }
}
export async function telegram(env, text){
  if (!env.TELEGRAM_TOKEN || !env.TELEGRAM_CHAT) return { ok:false, description:"TELEGRAM_TOKEN or TELEGRAM_CHAT is not set" };
  const token = String(env.TELEGRAM_TOKEN).trim().replace(/^bot/i, ""), chat = String(env.TELEGRAM_CHAT).trim();
  try { const r = await fetch("https://api.telegram.org/bot"+token+"/sendMessage", { method:"POST", headers:{ "content-type":"application/json" },
    body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3900), disable_web_page_preview: true }) }); return await r.json(); } catch (e) { return { ok:false, description:String(e) }; }
}
export function greet(o){ const f = String((o && o.name) || "").trim().split(/\s+/)[0]; return o && o.lang === "en" ? "Hi" + (f ? " " + f : "") + "," : "أهلاً" + (f ? " " + f : "") + "،"; }
// one layout for every e-mail (14 Nov redesign): the identity's night, one quiet card, the identity gradient as a hairline
// (cyan → blue → navy, not the old cyan → violet), a blue pill button with a light metal edge, generous spacing.
// Table-based and inline-styled so Gmail, Outlook and Apple Mail draw it the same; RTL for Arabic, LTR for English
export function mail(lang, title, bodyHtml, cta, link, hi, opt){
  if (opt && opt.bare) return mailBare(lang, title, bodyHtml, hi);
  const rtl = lang !== "en", al = rtl ? "right" : "left", dr = rtl ? "rtl" : "ltr", D = `dir="${dr}"`, DS = `direction:${dr};unicode-bidi:embed;`;
  const font = rtl ? "'Segoe UI',Tahoma,'Geeza Pro',Arial,sans-serif" : "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
  return `<!doctype html><html dir="${dr}" lang="${rtl?"ar":"en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${h(title)}</title></head>
<body ${D} style="${DS}margin:0;padding:0;background:#04061A;font-family:${font};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#04061A" style="background:#04061A"><tr><td align="center" style="padding:36px 14px 28px">
<table role="presentation" ${D} width="100%" cellpadding="0" cellspacing="0" style="${DS}max-width:580px">
<tr><td bgcolor="#0A1033" style="background:#0A1033;border:1px solid #1B2556;border-radius:22px;overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td ${D} bgcolor="#12298E" style="${DS}background-color:#12298E;background-image:radial-gradient(120% 160% at ${rtl?"0%":"100%"} 0%,#1C45E6 0%,#12298E 40%,#0A1033 85%);border-radius:21px 21px 0 0;padding:26px 24px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="text-align:${al};vertical-align:middle"><a href="${SITE}" style="text-decoration:none"><img src="${SITE}/assets/img/email-logo.png" width="180" alt="EYEBLINK STUDIO" style="display:inline-block;width:180px;max-width:62%;height:auto;border:0"></a></td>
  ${opt && opt.label ? `<td style="text-align:${rtl?"left":"right"};vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;font-weight:bold;letter-spacing:.3em;color:#9FDCFF;direction:ltr;white-space:nowrap">${h(opt.label)}</td>` : ""}
 </tr></table>
</td></tr>
<tr><td ${D} align="${al}" style="${DS}padding:26px 24px 28px;text-align:${al}">
${hi?`<p ${D} style="${DS}margin:0 0 10px;font-size:15px;line-height:1.7;color:#AEBBD2">${h(hi)}</p>`:""}
<h1 ${D} style="${DS}margin:0 0 12px;font-size:21px;line-height:1.5;font-weight:700;color:#EEF2F6">${h(title)}</h1>
<div ${D} style="${DS}font-size:15px;line-height:1.85;color:#C3CEE2;text-align:${al}">${bodyHtml}</div>
${cta?`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 0"><tr><td align="center" bgcolor="#2A86E6" style="border-radius:999px;background:#2A86E6;background-image:linear-gradient(180deg,#2A86E6,#1C45E6);border:1px solid #9FB6D6">
<a href="${link}" style="display:block;padding:15px 20px;font-family:${font};font-size:15px;font-weight:700;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:999px">${h(cta)}</a></td></tr></table>`:""}
</td></tr></table></td></tr>
<tr><td align="center" style="padding:28px 12px 0">
<p style="margin:0;color:#6F7FA0;font-size:12px;line-height:1.8;direction:ltr;letter-spacing:.04em"><a href="${SITE}" style="color:#AEBBD2;text-decoration:none">eyeblinkstudio.com</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="https://instagram.com/eyeblnk" style="color:#AEBBD2;text-decoration:none">@eyeblnk</a></p>
<p ${D} style="${DS}margin:8px 0 0;color:#6F7FA0;font-size:12px;line-height:1.8">${rtl?"مشكلة تقنية أو سؤال عن حسابك؟ ":"A technical issue or a question about your account? "}<a href="mailto:support@eyeblinkstudio.com" style="color:#AEBBD2;text-decoration:none">support@eyeblinkstudio.com</a></p>
</td></tr></table></td></tr></table></body></html>`;
}
// an e-mail whose body is its own frame (the invoice ticket): greeting and title on the night, then the body, then the usual footer
function mailBare(lang, title, bodyHtml, hi){
  const rtl = lang !== "en", al = rtl ? "right" : "left", dr = rtl ? "rtl" : "ltr", D = `dir="${dr}"`, DS = `direction:${dr};unicode-bidi:embed;`;
  const font = rtl ? "'Segoe UI',Tahoma,'Geeza Pro',Arial,sans-serif" : "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
  return `<!doctype html><html dir="${dr}" lang="${rtl?"ar":"en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${h(title)}</title></head>
<body ${D} style="${DS}margin:0;padding:0;background:#04061A;font-family:${font};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#04061A" style="background:#04061A"><tr><td align="center" style="padding:30px 14px 28px">
<table role="presentation" ${D} width="100%" cellpadding="0" cellspacing="0" style="${DS}max-width:560px">
<tr><td ${D} align="${al}" style="${DS}padding:0 6px 18px;text-align:${al}">
${hi?`<p ${D} style="${DS}margin:0 0 6px;font-size:15px;line-height:1.7;color:#AEBBD2">${h(hi)}</p>`:""}
<h1 ${D} style="${DS}margin:0;font-size:19px;line-height:1.5;font-weight:700;color:#EEF2F6">${h(title)}</h1>
</td></tr>
<tr><td style="padding:0">${bodyHtml}</td></tr>
<tr><td align="center" style="padding:26px 12px 0">
<p style="margin:0;color:#6F7FA0;font-size:12px;line-height:1.8;direction:ltr;letter-spacing:.04em"><a href="${SITE}" style="color:#AEBBD2;text-decoration:none">eyeblinkstudio.com</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="https://instagram.com/eyeblnk" style="color:#AEBBD2;text-decoration:none">@eyeblnk</a></p>
<p ${D} style="${DS}margin:8px 0 0;color:#6F7FA0;font-size:12px;line-height:1.8">${rtl?"مشكلة تقنية أو سؤال عن حسابك؟ ":"A technical issue or a question about your account? "}<a href="mailto:support@eyeblinkstudio.com" style="color:#AEBBD2;text-decoration:none">support@eyeblinkstudio.com</a></p>
</td></tr></table></td></tr></table></body></html>`;
}
// ---- the invoice in an e-mail: a cinema ticket (16 Nov) — a stub with the amount, a perforated tear, then the details.
// Dark on purpose: a white invoice gets inverted by Gmail's dark mode (and the navy logo vanishes); tables and inline styles only.
// t = { lang, label, amount, caption(html), meta:[[k,v,ltr]], lines:[{name,qty,amount}], totals:[[k,v,strong,colour]], status:[label,colour], intro(html), cta:[text,link], pdf:[text,link], note(html) }
export function ticketHTML(t){
  const rtl = t.lang !== "en", dr = rtl ? "rtl" : "ltr", s = rtl ? "right" : "left", e = rtl ? "left" : "right", D = `dir="${dr}"`;
  const F = rtl ? "font-family:'Segoe UI',Tahoma,'Geeza Pro',Arial,sans-serif;" : "font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;";
  const nb = "direction:ltr;unicode-bidi:isolate;white-space:nowrap;", line = "#1B2556", night = "#04061A";
  const row = (k, v, strong, col) => `<tr><td ${D} style="${F}padding:${strong?"12px 0 0":"6px 0"};font-size:${strong?15:13.5}px;font-weight:${strong?700:400};color:${strong?"#EEF2F6":"#AEBBD2"};text-align:${s}">${k}</td><td style="${F}padding:${strong?"12px 0 0":"6px 0"};font-size:${strong?15:13.5}px;font-weight:${strong?700:400};color:${col||"#EEF2F6"};text-align:${e};${nb}">${v}</td></tr>`;
  return `<table role="presentation" ${D} width="100%" cellpadding="0" cellspacing="0" bgcolor="#0A1033" style="background:#0A1033;border:1px solid ${line};border-radius:22px;border-collapse:separate;overflow:hidden">
<tr><td ${D} bgcolor="#12298E" style="background-color:#12298E;background-image:radial-gradient(120% 140% at ${rtl?"0%":"100%"} 0%,#1C45E6 0%,#12298E 38%,#0A1033 82%);border-radius:21px 21px 0 0;padding:24px 24px 22px;text-align:${s}">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="text-align:${s};vertical-align:middle"><img src="${SITE}/assets/img/email-logo.png" width="132" alt="EYEBLINK STUDIO" style="display:inline-block;width:132px;height:auto;border:0"></td>
  <td style="text-align:${e};vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;font-weight:bold;letter-spacing:.3em;color:#9FDCFF;${nb}">${h(t.label)}</td>
 </tr></table>
 <div style="${F}margin:24px 0 6px;font-size:54px;line-height:1;font-weight:200;letter-spacing:-.01em;color:#FFFFFF;text-align:${s};${nb}">${h(t.amount)}</div>
 <div ${D} style="${F}font-size:13.5px;line-height:1.7;color:#C3CEE2;text-align:${s}">${t.caption}</div>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-top:1px solid #2B3C8F"><tr>
  ${t.meta.map(m => `<td ${D} style="${F}vertical-align:top;padding-top:12px;text-align:${s};width:${Math.floor(100 / t.meta.length)}%"><div style="font-size:11px;color:#9FB0CC">${h(m[0])}</div><div style="font-size:13.5px;color:#FFFFFF;margin-top:3px;${m[2]?nb:""}">${h(m[1])}</div></td>`).join("")}
 </tr></table>
</td></tr>
<tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
 <td width="14" height="28" bgcolor="${night}" style="width:14px;height:28px;background:${night};border-radius:${rtl?"14px 0 0 14px":"0 14px 14px 0"};font-size:0;line-height:0">&nbsp;</td>
 <td style="padding:0 10px"><div style="height:13px;border-bottom:2px dashed #24306A;font-size:0;line-height:0">&nbsp;</div></td>
 <td width="14" height="28" bgcolor="${night}" style="width:14px;height:28px;background:${night};border-radius:${rtl?"0 14px 14px 0":"14px 0 0 14px"};font-size:0;line-height:0">&nbsp;</td>
</tr></table></td></tr>
<tr><td ${D} style="padding:8px 24px 24px;text-align:${s}">
 ${t.intro ? `<p ${D} style="${F}margin:0 0 10px;font-size:14px;line-height:1.8;color:#C3CEE2">${t.intro}</p>` : ""}
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
  ${t.lines.map(x => x.head ? `<tr><td colspan="2" ${D} style="${F}padding:14px 0 2px;font-size:11.5px;font-weight:700;letter-spacing:.04em;color:#3FE0E8;text-align:${s}">${h(x.head)}</td></tr>` : `<tr><td ${D} style="${F}padding:12px 0;border-bottom:1px solid ${line};font-size:14px;color:#C3CEE2;text-align:${s}">${h(x.name)}${x.qty && x.qty !== 1 ? ` <span style="color:#6F7FA0;font-size:12.5px;${nb}">× ${x.qty}</span>` : ""}</td><td style="${F}padding:12px 0;border-bottom:1px solid ${line};font-size:14px;color:#EEF2F6;text-align:${e};${nb}">${h(x.amount)}</td></tr>`).join("")}
 </table>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">${t.totals.map(x => row(x[0], x[1], x[2], x[3])).join("")}</table>
 ${t.after || ""}
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#070C2A" style="margin-top:18px;background:#070C2A;border:1px solid ${line};border-radius:14px;border-collapse:separate"><tr>
  <td ${D} style="${F}padding:12px 14px;font-size:13px;color:#AEBBD2;text-align:${s}">${rtl?"الحالة":"Status"}</td>
  <td style="${F}padding:12px 14px;font-size:13px;font-weight:700;color:${t.status[1]};text-align:${e}">● ${h(t.status[0])}</td>
 </tr></table>
 ${t.cta ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px"><tr><td align="center" bgcolor="#2A86E6" style="border-radius:999px;background:#2A86E6;background-image:linear-gradient(180deg,#2A86E6,#1C45E6);border:1px solid #9FB6D6">
  <a href="${t.cta[1]}" style="display:block;padding:15px 20px;${F}font-size:15px;font-weight:700;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:999px">${h(t.cta[0])}</a></td></tr></table>` : ""}
 ${t.pdf ? `<div style="${F}text-align:center;margin-top:12px;font-size:13px"><a href="${t.pdf[1]}" style="color:#AEBBD2;text-decoration:none">${h(t.pdf[0])}</a></div>` : ""}
 ${t.note ? `<p ${D} style="${F}margin:16px 0 0;font-size:12px;line-height:1.75;color:#6F7FA0;text-align:${s}">${t.note}</p>` : ""}
</td></tr></table>`;
}
// to the studio: e-mail (to the address in the site settings) + Telegram
export async function notifyStudio(env, subject, text){
  const s = await siteSettings(env), to = env.NOTIFY_EMAIL || s.email;
  await Promise.all([ sendMail(env, to, subject, mail("ar", subject, h(text).replace(/\n/g,"<br>"), "افتح لوحة التحكم", SITE+"/admin/")),
    telegram(env, "🔔 "+subject+"\n\n"+text+"\n\n"+SITE+"/admin/") ]);
}
// to the client: new message from the studio / status change
export async function notifyClient(env, o, kind, text){
  if (!o.email) return;
  if (kind === "received") return mailReceived(env, o);
  const en = o.lang === "en", link = SITE + (en ? "/en" : "") + "/account.html#" + o.code;
  const T = en ? { message:"New message about your request "+o.code, status:"Update on your request "+o.code, cta:"Open my request", statusP:"Your request is now: " }
               : { message:"رسالة جديدة بخصوص طلبك "+o.code, status:"تحديث على طلبك "+o.code, cta:"افتح طلبي", statusP:"حالة طلبك الآن: " };
  const body = kind==="message" ? h(text).replace(/\n/g,"<br>") : h(T.statusP) + "<b style=\"color:#fff\">"+h((en?ST_EN:ST_AR)[text]||text)+"</b>";
  await sendMail(env, o.email, T[kind], mail(en?"en":"ar", T[kind], body, T.cta, link, greet(o)));
}

// ---- money helpers ----
export function num(v){ const n = parseFloat(String(v ?? "").replace(/,/g, "").replace(/[^0-9.]/g, "")); return isFinite(n) ? n : 0; }
export function curOf(o){ return o.cur || (String(o.price || o.total || "").match(/[^\d\s.,]+/) || ["$"])[0]; }
export function fmt(n, c){ const neg = n < 0, a = Math.abs(n), v = (Math.round(a * 100) / 100).toFixed(a % 1 ? 2 : 0); return (neg ? "−" : "") + (c === "$" || c === "€" || c === "£" ? c + v : v + " " + c); }
export function totalOf(o){ return num(o.price) || (o.items || []).reduce((a, x) => a + num(x.unit) * (num(x.qty) || 1), 0) || num(o.total); }
// what the client pays at each step: everything at once, or a deposit and then the rest
export function stageOf(o){ if (o.plan === "split") return (o.deposit && o.deposit.paid) ? "final" : "deposit"; return "full"; }
export function stageAmount(o, stage){ const t = totalOf(o), pct = num(o.depositPct) || 50;
  if (stage === "deposit") return Math.round(t * pct) / 100;
  if (stage === "final") return Math.max(0, t - num((o.deposit || {}).amount)); return t; }
export const STAGE = { ar:{ full:"كامل المبلغ", deposit:"العربون", final:"الدفعة النهائية" }, en:{ full:"Full amount", deposit:"Deposit", final:"Final payment" } };

// ---- the invoice: a quiet, precise document (white, small type, thin rules) — one design for e-mail, the account page and PDF ----
export const INV_T = {
  en:{ title:"Invoice", no:"Invoice no.", date:"Date issued", order:"Order", status:"Status", from:"From", to:"Billed to", desc:"Description", qty:"Qty", unit:"Unit price", amount:"Amount",
       sub:"Subtotal", dep:"Deposit paid", paid:"Amount paid", bal:"Balance due", method:"Payment method", paidOn:"Paid on", st:{ full:"Paid", final:"Paid in full", deposit:"Deposit paid" },
       adj:"Adjustment (agreed on the brief)", disc:"Discount", note:{ deposit:"The balance is due before final delivery.", other:"Thank you for working with Eyeblink Studio." }, svc:"Video editing · Motion graphics · Film" },
  ar:{ title:"فاتورة", no:"رقم الفاتورة", date:"تاريخ الإصدار", order:"رقم الطلب", status:"الحالة", from:"من", to:"إلى", desc:"البيان", qty:"الكمية", unit:"سعر الوحدة", amount:"المبلغ",
       sub:"المجموع", dep:"العربون المدفوع", paid:"المبلغ المدفوع", bal:"المتبقي", method:"طريقة الدفع", paidOn:"تاريخ الدفع", st:{ full:"مدفوعة", final:"مدفوعة بالكامل", deposit:"عربون مدفوع" },
       adj:"تعديل وفق المتطلبات المتفق عليها", disc:"خصم", note:{ deposit:"المبلغ المتبقي يُدفع قبل التسليم النهائي.", other:"شكراً لتعاملك مع Eyeblink Studio." }, svc:"مونتاج · موشن غرافيك · أفلام" } };
export function invoiceHTML(o, inv, opt){
  opt = opt || {}; const en = o.lang === "en", L = INV_T[en ? "en" : "ar"], dir = en ? "ltr" : "rtl", s = en ? "left" : "right", e = en ? "right" : "left";
  const c = curOf(o), total = totalOf(o);
  let lines = (o.items || []).filter(x => x && x.name).map(x => ({ name: x.name, qty: num(x.qty) || 1, unit: num(x.unit) }));
  if (!lines.length) lines = [{ name: o.packageName || o.package || "Service", qty: o.qty || 1, unit: total / (o.qty || 1) }];
  const sub = lines.reduce((a, x) => a + x.unit * x.qty, 0);
  if (Math.abs(sub - total) > 0.009 && total) lines.push({ name: total < sub ? L.disc : L.adj, qty: 1, unit: total - sub });
  const kind = inv.kind || "full", d = new Date(inv.at || Date.now()), date = d.toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { year:"numeric", month:"long", day:"numeric" });
  const dep = num((o.deposit || {}).amount), paidNow = num(inv.amount) || total, balance = kind === "deposit" ? Math.max(0, total - paidNow) : 0;
  const method = (o.payInfo && o.payInfo.methodName) || o.method || "";
  const F = "font-family:Arial,Helvetica,sans-serif;", ink = "#14172b", grey = "#6b7286", rule = "#e7e9f0";
  const lab = `${F}font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${grey};`;
  const val = `${F}font-size:12.5px;color:${ink};`;
  const num_ = `direction:ltr;unicode-bidi:isolate;white-space:nowrap;`;
  const th = `padding:0 0 8px;border-bottom:1px solid ${ink};${lab}`;
  const td = `padding:11px 0;border-bottom:1px solid ${rule};${val}vertical-align:top;`;
  const tot = (k, v, strong) => `<tr><td style="padding:5px 0;${F}font-size:${strong?13:12}px;color:${strong?ink:grey};font-weight:${strong?"bold":"normal"};text-align:${s}">${k}</td><td style="padding:5px 0;${F}font-size:${strong?13:12}px;color:${ink};font-weight:${strong?"bold":"normal"};text-align:${e};${num_}">${v}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid ${rule};border-radius:10px;text-align:${s};-webkit-print-color-adjust:exact;print-color-adjust:exact">
<tr><td style="height:3px;line-height:3px;font-size:0;background:#2E62FF;background-image:linear-gradient(90deg,#3FE0E8,#2E62FF,#8B5CFF);border-radius:10px 10px 0 0">&nbsp;</td></tr>
<tr><td style="padding:26px 30px 0">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="vertical-align:middle;text-align:${s}"><img src="${SITE}/assets/img/invoice-logo.png" width="184" height="20" alt="Eyeblink Studio" style="display:inline-block;width:184px;height:20px;border:0"></td>
  <td style="vertical-align:middle;text-align:${e};${F}font-size:20px;font-weight:bold;color:${ink};letter-spacing:.01em">${L.title}</td>
 </tr></table>
</td></tr>
<tr><td style="padding:22px 30px 0">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="vertical-align:top;width:34%;text-align:${s}"><div style="${lab}">${L.no}</div><div style="${val}margin-top:4px;${num_}">${h(inv.no)}</div></td>
  <td style="vertical-align:top;width:33%;text-align:${s}"><div style="${lab}">${L.date}</div><div style="${val}margin-top:4px">${date}</div></td>
  <td style="vertical-align:top;width:33%;text-align:${s}"><div style="${lab}">${L.order}</div><div style="${val}margin-top:4px;${num_}">${h(o.code)}</div></td>
 </tr></table>
</td></tr>
<tr><td style="padding:22px 30px 0">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="vertical-align:top;width:50%;text-align:${s};padding-${e}:12px"><div style="${lab}">${L.from}</div><div style="${val}margin-top:5px;font-weight:bold">Eyeblink Studio</div><div style="${F}font-size:11.5px;line-height:1.65;color:${grey}">${L.svc}<br><span style="${num_}">eyeblinkstudio.com</span>${opt.email?`<br><span style="${num_}">${h(opt.email)}</span>`:""}</div></td>
  <td style="vertical-align:top;width:50%;text-align:${s}"><div style="${lab}">${L.to}</div><div style="${val}margin-top:5px;font-weight:bold">${h(o.name)}</div><div style="${F}font-size:11.5px;line-height:1.65;color:${grey};${num_}">${h(o.email)}</div></td>
 </tr></table>
</td></tr>
<tr><td style="padding:26px 30px 0">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
  <tr><td style="${th}text-align:${s}">${L.desc}</td><td style="${th}text-align:center;width:52px">${L.qty}</td><td style="${th}text-align:${e};width:92px">${L.unit}</td><td style="${th}text-align:${e};width:92px">${L.amount}</td></tr>
  ${lines.map(x => `<tr><td style="${td}text-align:${s}">${h(x.name)}</td><td style="${td}text-align:center;${num_}">${x.qty}</td><td style="${td}text-align:${e};color:${grey};${num_}">${fmt(x.unit, c)}</td><td style="${td}text-align:${e};${num_}">${fmt(x.unit * x.qty, c)}</td></tr>`).join("")}
 </table>
 <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px;margin-${s}:auto;width:260px;max-width:100%">
  ${tot(L.sub, fmt(total, c))}
  ${kind === "final" && dep ? tot(L.dep, "−" + fmt(dep, c)) : ""}
  <tr><td colspan="2" style="padding:6px 0 0;border-top:1px solid ${ink}"></td></tr>
  ${tot(L.paid, fmt(paidNow, c), 1)}
  ${kind === "deposit" ? tot(L.bal, fmt(balance, c)) : ""}
 </table>
</td></tr>
<tr><td style="padding:22px 30px 0">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fa;border-radius:8px"><tr>
  <td style="padding:12px 14px;text-align:${s}"><div style="${lab}">${L.status}</div><div style="${F}font-size:12px;margin-top:4px;color:#127a3a;font-weight:bold">● ${L.st[kind]}</div></td>
  ${method ? `<td style="padding:12px 14px;text-align:${s}"><div style="${lab}">${L.method}</div><div style="${val}margin-top:4px">${h(method)}</div></td>` : ""}
  <td style="padding:12px 14px;text-align:${s}"><div style="${lab}">${L.paidOn}</div><div style="${val}margin-top:4px">${date}</div></td>
 </tr></table>
</td></tr>
<tr><td style="padding:20px 30px 24px;${F}font-size:11px;line-height:1.7;color:${grey};text-align:${s}">${kind === "deposit" ? L.note.deposit + " " : ""}${L.note.other}</td></tr>
</table>`;
}
// the invoice as its own page (account → «الفاتورة»): small A5 PDF, colours kept when printing
export function invoicePage(o, inv, opt){
  return `<!doctype html><html lang="${o.lang === "en" ? "en" : "ar"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(inv.no)} · Eyeblink Studio</title>
<style>@page{size:A5;margin:9mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{margin:0;background:transparent}body{padding:0}
@media print{html,body{background:#fff}table{max-width:none!important;border:0!important}}img{image-rendering:auto}</style></head>
<body>${invoiceHTML(o, inv, opt).replace(SITE + "/assets/img/", "/assets/img/")}</body></html>`;
}

// ---- client e-mails: the request summary; an invoice for every payment ----
export function rows(list, rtl){ return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 4px">${list.filter(r=>r&&r[1]!==""&&r[1]!=null).map(([k,v,strong])=>`<tr><td style="padding:12px 0;border-bottom:1px solid #1B2556;color:#8E9BB8;font-size:13.5px;width:38%;vertical-align:top">${h(k)}</td><td style="padding:12px 0;border-bottom:1px solid #1B2556;color:${strong?"#fff":"#DCE3F0"};font-size:${strong?"17px":"14px"};font-weight:${strong?"bold":"normal"};text-align:${rtl?"right":"left"}">${v}</td></tr>`).join("")}</table>`; }
export function steps(list){ return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 0">${list.map((s,i)=>`<tr><td style="vertical-align:top;padding:0 0 12px;width:26px"><div style="width:24px;height:24px;line-height:24px;border-radius:12px;background:#2A86E6;color:#FFFFFF;text-align:center;font:bold 12px/24px Arial">${i+1}</div></td><td style="padding:2px 12px 12px;color:#C3CEE2;font-size:14px;line-height:1.7">${h(s)}</td></tr>`).join("")}</table>`; }
export async function mailReceived(env, o){
  if (!o.email) return;
  const en = o.lang === "en", link = SITE + (en ? "/en" : "") + "/account.html#" + o.code, rtl = !en;
  const c = await siteContent(env); let next = ((c.order||{}).next||{})[en?"en":"ar"] || [];
  if (!next.length) next = en ? ["We review your request and reply in your account within 24 hours","We agree on the details and date, then you get the payment details","We start production; you follow every stage until delivery"]
                              : ["نراجع طلبك ونرد عليك في حسابك خلال 24 ساعة","نتفق على التفاصيل والموعد، ثم تصلك تفاصيل الدفع","نبدأ التنفيذ، وتتابع كل مرحلة حتى التسليم"];
  const T = en ? ["Request no.","Service","Quantity","Add-ons","Platforms","Preferred payment","Target date","Estimated total","What happens next","Thank you — your request is in. Here is the summary; keep the request number for any question."]
               : ["رقم الطلب","الخدمة","العدد","الإضافات","المنصات","طريقة الدفع المفضّلة","الموعد المستهدف","المجموع التقديري","الخطوات التالية","شكراً لك، وصلنا طلبك. هذا ملخّصه، واحتفظ برقم الطلب لأي استفسار."];
  const body = `<p style="margin:0 0 10px">${h(T[9])}</p>` +
    rows([[T[0], `<span style="font:bold 16px Arial;letter-spacing:2px;color:#3FE0E8">${h(o.code)}</span>`],[T[1], h(o.packageName)],[T[2], o.qty>1? "×"+o.qty : ""],[T[3], h((o.addons||[]).join(en?", ":"، "))],
      [T[4], h((o.platforms||[]).join(", "))],[T[5], h(o.payPref)],[T[6], h(o.deadline)],[T[7], `<span dir="ltr">${h(o.total)}</span>`, 1]], rtl) +
    `<p style="margin:24px 0 0;color:#fff;font-weight:bold;font-size:15px">${h(T[8])}</p>` + steps(next);
  await sendMail(env, o.email, (en ? "We received your request " : "استلمنا طلبك ") + o.code, mail(en?"en":"ar", (en ? "Request received · " : "وصل طلبك · ") + o.code, body, en ? "Follow my request" : "تابع طلبي", link, greet(o)));
}
export async function mailInvoice(env, o, kind){
  const inv = kind === "deposit" ? (o.deposit || {}).invoice : o.invoice;
  if (!o.email || !inv) return;
  const en = o.lang === "en", link = SITE + (en ? "/en" : "") + "/account.html#" + o.code, s = await siteSettings(env), c = curOf(o);
  const T = en ? { deposit:"Deposit received ✓", final:"Final payment received ✓", full:"Payment received ✓",
                   depositP:"Your deposit is confirmed and production starts now. The remaining "+fmt(Math.max(0,totalOf(o)-num(inv.amount)),c)+" is due before final delivery. Your invoice is below.",
                   finalP:"Your request is now fully paid. Thank you! Your invoice is below.", fullP:"Your payment is confirmed and production starts now. You can follow every stage from your account. Your invoice is below.", cta:"View my request" }
               : { deposit:"وصل العربون ✓", final:"وصلت الدفعة النهائية ✓", full:"وصلت دفعتك ✓",
                   depositP:"تأكّد وصول العربون وبدأنا التنفيذ. يُدفع المتبقي "+fmt(Math.max(0,totalOf(o)-num(inv.amount)),c)+" قبل التسليم النهائي. تجد الفاتورة أدناه.",
                   finalP:"أصبح طلبك مدفوعاً بالكامل، شكراً لك! تجد الفاتورة أدناه.", fullP:"تأكّد وصول دفعتك وبدأنا التنفيذ، ويمكنك متابعة كل مرحلة من حسابك. تجد الفاتورة أدناه.", cta:"عرض طلبي" };
  // the e-mail shows the receipt as a ticket (dark, survives Gmail's dark mode); the printable invoice page stays the white document
  const k = inv.kind || "full", L = INV_T[en ? "en" : "ar"], total = totalOf(o), paidNow = num(inv.amount) || total, dep = num((o.deposit || {}).amount);
  const date = new Date(inv.at || Date.now()).toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { year:"numeric", month:"long", day:"numeric" });
  let lines = (o.items || []).filter(x => x && x.name).map(x => ({ name: x.name, qty: num(x.qty) || 1, unit: num(x.unit) }));
  if (!lines.length) lines = [{ name: o.packageName || o.package || "Service", qty: o.qty || 1, unit: total / (o.qty || 1) }];
  const sub = lines.reduce((a, x) => a + x.unit * x.qty, 0); if (Math.abs(sub - total) > 0.009 && total) lines.push({ name: total < sub ? L.disc : L.adj, qty: 1, unit: total - sub });
  const body = ticketHTML({ lang: en ? "en" : "ar", label: en ? "RECEIPT" : "INVOICE", amount: fmt(paidNow, c), caption: h(L.st[k]) + ' · <b style="color:#fff">' + h(date) + "</b>",
    meta: [[L.no, inv.no, 1], [L.order, o.code, 1]], intro: h(T[k+"P"]),
    lines: lines.map(x => ({ name: x.name, qty: x.qty, amount: fmt(x.unit * x.qty, c) })),
    totals: [[L.sub, fmt(total, c)]].concat(k === "final" && dep ? [[L.dep, "−" + fmt(dep, c)]] : []).concat([[L.paid, fmt(paidNow, c), 1]]).concat(k === "deposit" ? [[L.bal, fmt(Math.max(0, total - paidNow), c), 0, "#F0B43C"]] : []),
    status: [L.st[k], "#3DDC97"], cta: [T.cta, link], note: (k === "deposit" ? L.note.deposit + " " : "") + L.note.other });
  await sendMail(env, o.email, (en ? "Invoice " : "فاتورة ") + inv.no + " · Eyeblink Studio", mail(en?"en":"ar", T[k] + " · " + o.code, body, null, null, greet(o), { bare: true }));
}
export async function newInvoice(env, kind, amount){
  // one counter in D1, raised in a single statement, so two invoices made at the same moment never share a number.
  // The first time it carries on from the old KV counter; KV keeps a copy (for the backup, and the counter where there is no D1).
  // If D1 fails the invoice is not made (an error, tried again) rather than risk a number that D1 would hand out again.
  let seq = +(await env.EB.get("invseq") || 0) + 1, no;
  if (env.DB) await env.DB.prepare("CREATE TABLE IF NOT EXISTS seq (name TEXT PRIMARY KEY, n INTEGER NOT NULL)").run();
  // a number an imported (earlier) invoice already carries is skipped
  for (let k = 0; k < 50; k++) {
    if (env.DB) seq = (await env.DB.prepare("INSERT INTO seq (name, n) VALUES ('inv', ?) ON CONFLICT(name) DO UPDATE SET n = n + 1 RETURNING n").bind(seq).first()).n;
    no = "INV-" + new Date().getFullYear() + "-" + String(seq).padStart(4, "0");
    if (!env.DB || !(await env.DB.prepare("SELECT 1 FROM invoices WHERE no=?").bind(no).first().catch(() => null))) break;
  }
  await env.EB.put("invseq", String(seq));
  return { no, at: new Date().toISOString(), kind, amount };
}
// payment details sent 48 h ago and no receipt yet → one friendly reminder (checked at most once an hour, on site traffic)
export async function sweepReminders(env){
  try {
    const last = +(await env.EB.get("sweep:at") || 0); if (Date.now() - last < 3600e3) return; await env.EB.put("sweep:at", String(Date.now()));
    const c = await siteContent(env), RR = (await rulesOf(env)).rules.orderPay;   // the rule from Settings → automatic messages
    const hrs = (RR.days || 2) * 24, payOn = (c.payments || {}).reminders !== false && RR.mode !== "off";
    let cursor; do {
      const r = await env.EB.list({ prefix: "order:", cursor });
      for (const k of r.keys) {
        const v = await env.EB.get(k.name); if (!v) continue; const o = JSON.parse(v), p = o.payInfo;
        // CRM: on its follow-up day (from 10:00 Damascus time) the studio gets one Telegram reminder
        if (o.followUp && o.followSent !== o.followUp && !["cancelled", "delivered"].includes(o.status) && Date.now() >= Date.parse(o.followUp + "T10:00:00+03:00")) {
          o.followSent = o.followUp; await env.EB.put(k.name, JSON.stringify(o));
          await telegram(env, "🔔 متابعة اليوم — " + o.code + " · " + o.name + (o.nextStep ? "\nالخطوة الجاية: " + o.nextStep : "") + (o.contact ? "\nالتواصل: " + o.contact : "") + "\n" + SITE + "/admin/");
        }
        if (!payOn || !p || p.reminded || o.status === "cancelled" || !o.email) continue;
        if ((p.stage === "deposit" && o.deposit && o.deposit.paid) || ((p.stage || "full") !== "deposit" && o.paid)) continue;
        if (Date.now() - Date.parse(p.at) < hrs * 3600e3) continue;
        if ((o.messages || []).some(m => m.from === "client" && m.kind === "receipt" && m.at > p.at)) continue;
        p.reminded = new Date().toISOString(); await env.EB.put(k.name, JSON.stringify(o));
        const en = o.lang === "en", link = SITE + (en ? "/en" : "") + "/account.html#" + o.code;
        const body = en ? `A quick reminder: the payment details for <b style="color:#fff">${h(o.code)}</b> are waiting in your account (${h(p.methodName||"")} · <span dir="ltr">${h(p.amount)}</span>). Once you pay, attach the receipt there and we start right away. If anything is unclear, just reply in the chat.`
                        : `تذكير لطيف: تفاصيل الدفع لطلبك <b style="color:#fff">${h(o.code)}</b> بانتظارك في حسابك (${h(p.methodName||"")} · <span dir="ltr">${h(p.amount)}</span>). بعد الدفع أرفق الإيصال هناك وسنبدأ فوراً. وإن كان أي أمر غير واضح، فراسلنا في المحادثة.`;
        await sendMail(env, o.email, en ? "Reminder: payment for " + o.code : "تذكير بالدفع لطلبك " + o.code, mail(en?"en":"ar", en ? "Your payment details are waiting" : "تفاصيل الدفع بانتظارك", body, en ? "Open my request" : "افتح طلبي", link, greet(o)));
        await telegram(env, "⏰ أُرسل تذكير دفع تلقائي — " + o.code + " · " + o.name);
      }
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor);
  } catch {}
}
export function later(ctx, p){ if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(p); else return p; }

// ---- account and security e-mails (phase 2, 18 Nov 2026): welcome, e-mail confirmation, new-device sign-in, password changed, reset code ----
// Calm and courteous in every case; the security ones tell the person what happened and the one thing to do if it was not them.
function amP(t){ return `<p style="margin:0 0 12px">${t}</p>`; }
function amMuted(t){ return `<p style="margin:16px 0 0;font-size:13px;line-height:1.8;color:#8E9BB8">${t}</p>`; }
function amPerks(lang, rows){ const rtl = lang !== "en";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px;border-collapse:collapse">${rows.map(r =>
    `<tr><td width="22" style="vertical-align:top;padding:9px 0;${rtl ? "padding-left:10px" : "padding-right:10px"}"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3FE0E8;margin-top:8px"></span></td><td style="padding:7px 0;border-bottom:1px solid #1B2556;font-size:14.5px;color:#DCE3F0;text-align:${rtl ? "right" : "left"}">${r}</td></tr>`).join("")}</table>`; }
function amFacts(lang, rows){ const rtl = lang !== "en";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#070C2A" style="margin:18px 0 6px;background:#070C2A;border:1px solid #1B2556;border-radius:14px;border-collapse:separate">${rows.filter(r => r[1]).map((r, i) =>
    `<tr><td style="padding:12px 16px;${i ? "border-top:1px solid #1B2556;" : ""}font-size:13px;color:#8E9BB8;white-space:nowrap;text-align:${rtl ? "right" : "left"}">${r[0]}</td><td style="padding:12px 16px;${i ? "border-top:1px solid #1B2556;" : ""}font-size:14px;color:#EEF2F6;text-align:${rtl ? "left" : "right"}">${h(r[1])}</td></tr>`).join("")}</table>`; }
function amCode(c){ return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px"><tr><td align="center" bgcolor="#070C2A" style="background:#070C2A;border:1px solid #2B3C8F;border-radius:16px;padding:22px 10px"><div style="font-family:'SF Mono',Consolas,'Courier New',monospace;font-size:34px;font-weight:600;letter-spacing:12px;color:#FFFFFF;direction:ltr;padding-left:12px">${h(c)}</div></td></tr></table>`; }
const AM_SUPPORT = `<a href="mailto:support@eyeblinkstudio.com" style="color:#3FE0E8;text-decoration:none;direction:ltr;unicode-bidi:isolate">support@eyeblinkstudio.com</a>`;
// where and on what someone signed in: Cloudflare's city/country (approximate) and a plain reading of the browser string
export function deviceInfo(request, lang){
  const en = lang === "en", cf = request.cf || {}, ua = request.headers.get("user-agent") || "";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  let country = ""; try { country = cf.country ? new Intl.DisplayNames([en ? "en" : "ar"], { type: "region" }).of(cf.country) : ""; } catch {}
  const place = [cf.city, country].filter(Boolean).join(en ? ", " : "، ");
  let when = ""; try { when = new Date().toLocaleString(en ? "en-GB" : "ar-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: cf.timezone || "Asia/Damascus" }); } catch { when = new Date().toISOString(); }
  return { when, device: br && os ? br + (en ? " on " : " على ") + os : br || os, place: place ? place + (en ? " (approximate)" : " (تقريبي)") : "" };
}
// a device the account has not been used with: a long-lived random cookie per browser, the last 20 kept on the account.
// The first sign-in after this ships only learns the device (no alert), so nobody gets a surprise e-mail for a browser they always use.
export function seenDevice(request, u){
  let id = cookie(request, "eb_d"); const fresh = !/^[a-f0-9]{32}$/.test(id); if (fresh) id = randHex(16);
  const first = !Array.isArray(u.devs), known = first || u.devs.includes(id);
  u.devs = [id].concat((u.devs || []).filter(x => x !== id)).slice(0, 20);
  return { alert: !known, cookie: fresh ? "eb_d=" + id + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=63072000" : "" };
}
export function withCookie(res, c){ if (c) res.headers.append("set-cookie", c); return res; }
// one place for all of them: { subject, html }. x: { link, code, info:{when,device,place} }
// ---- a client leaves with everything that hangs on them (moved here from work.js, 27 Nov, so a self-deletion can run from any request).
// The rows go to R2 (backups/purge/…, kept 8 weeks) before anything is deleted; the client's uploads in R2 go too.
// keepMoney (a client deleting their own account): invoices and paid site orders stay, for the accounts. ----
export const PURGE = [["deliverables","client_email"],["comments","client_email"],["files","client_email"],["tasks","client_email"],["recurring","client_email"],["invoices","client_email"],
  ["project_members","email"],["projects","client_email"],["activity","client_email"],["notifications","recipient"],["notify_prefs","email"],["notify_log","recipient"],
  ["scheduled_sends","recipient"],["pending_sends","recipient"],["rule_log","recipient"],["push_subs","email"],["tg_links","email"],["client_tips","email"],
  ["brand_kits","email"],["brand_assets","email"],["report_cfg","email"],["client_reports","email"],["clients","email"]];
export async function kvEach(env, prefix, fn){ let c; do { const r = await env.EB.list({ prefix, cursor: c }); for (const k of r.keys) { let v = null; try { v = JSON.parse(await env.EB.get(k.name)); } catch {} if (v) await fn(k.name, v); } c = r.list_complete ? null : r.cursor; } while (c); }
export async function purgeClient(env, D, email, keepMoney){
  const snap = { email, at: new Date().toISOString(), rows: {}, kv: {} }, P = keepMoney ? PURGE.filter(([t]) => t !== "invoices") : PURGE;
  for (const [t, c] of P) snap.rows[t] = (await D.prepare(`SELECT * FROM ${t} WHERE ${c}=?`).bind(email).all()).results;
  snap.kv.user = await env.EB.get("user:" + email);
  await setAvatar(env, email, null).catch(() => {});   // the photo is public media: it goes first
  const refs = new Set(snap.rows.tasks.map(t => t.ref));
  if (env.R2) { await env.R2.put("backups/purge/" + Date.now() + "-" + email.replace(/[^a-z0-9.@_-]/g, "_") + ".json", JSON.stringify(snap)).catch(() => {});
    for (const f of snap.rows.files) if (String(f.url).startsWith(SITE + "/api/up/")) await env.R2.delete(f.url.slice(SITE.length + 8)).catch(() => {});
    for (const a of snap.rows.brand_assets) await env.R2.delete(a.key).catch(() => {}); }
  await D.batch(P.map(([t, c]) => D.prepare(`DELETE FROM ${t} WHERE ${c}=?`).bind(email)));
  await env.EB.delete("user:" + email); await env.EB.delete("accreq:" + email);
  // a site order that carries a payment is a money record too: it stays when the money is kept
  await kvEach(env, "order:", async (k, o) => { if (String(o.email || "").toLowerCase() === email && !(keepMoney && (o.paid || (o.deposit && o.deposit.paid) || o.invoice))) { await env.EB.delete(k); if (o.code) await env.EB.delete("code:" + o.code); } });
  await kvEach(env, "sup:", async (k, s) => { if (String(s.email || "").toLowerCase() === email) await env.EB.delete(k); });
  await unlinkTeam(env, refs);
}
// team tasks that pointed at client tasks which no longer exist keep their work, without the dead link
export async function unlinkTeam(env, refs){ if (!refs.size) return;
  await kvEach(env, "ttask:", async (k, t) => { if (t.workTask && refs.has(t.workTask)) { t.workTask = ""; await env.EB.put(k, JSON.stringify(t)); } }); }

// ---- self-deletion (27 Nov): an account the client asked to delete is frozen 14 days (KV «delq:<email>» = until), then deleted
// for good here, keeping invoices and payments. Checked at most once an hour, on site traffic, like the reminders. ----
export const DELETE_DAYS = 14;
export async function sweepDeletions(env){
  try {
    if (!env.DB) return;
    const last = +(await env.EB.get("delsweep:at") || 0); if (Date.now() - last < 3600e3) return; await env.EB.put("delsweep:at", String(Date.now()));
    const l = await env.EB.list({ prefix: "delq:" });
    for (const k of l.keys) { const email = k.name.slice(5), u = JSON.parse(await env.EB.get("user:" + email) || "null");
      if (!u || !u.del) { await env.EB.delete(k.name); continue; }   // restored, or already gone
      if (Date.parse(u.del.until) > Date.now()) continue;
      const m = accountMail("deleted", u.lang === "en" ? "en" : "ar", u.name, {}); if (m) await sendMail(env, u.email, m.subject, m.html).catch(() => {});
      await purgeClient(env, env.DB, email, true); await env.EB.delete(k.name); }
  } catch {}
}

export function accountMail(kind, lang, name, x){
  const en = lang === "en", L = en ? "en" : "ar", hi = greet({ name, lang: L }), ws = SITE + (en ? "/en" : "") + "/account";
  const perks = en ? ["Your orders and invoices in one place", "A direct line to the studio team", "A private workspace for your project once we begin"]
                   : ["طلباتك وفواتيرك في مكان واحد", "تواصل مباشر مع فريق الاستوديو", "مساحة عمل خاصة بمشروعك حين نبدأ معاً"];
  const i = (x && x.info) || {}, facts = rows => amFacts(L, rows);
  const M = {
    welcome: () => [en ? "Welcome to Eyeblink Studio" : "أهلاً بك في Eyeblink Studio", en ? "We're glad to have you" : "يسعدنا انضمامك إلينا",
      amP(en ? "Your account is ready. One last step: confirm your e-mail, so updates on your orders and invoices always reach you." : "أُنشئ حسابك بنجاح، وبقيت خطوة واحدة: تأكيد بريدك الإلكتروني، لتصلك تحديثات طلباتك وفواتيرك دون انقطاع.") +
      amPerks(L, perks) + amMuted(en ? "The confirmation link is valid for 24 hours." : "رابط التأكيد صالح لمدة 24 ساعة."), en ? "Confirm my e-mail" : "أكّد بريدي", x.link, "WELCOME"],
    welcomeGoogle: () => [en ? "Welcome to Eyeblink Studio" : "أهلاً بك في Eyeblink Studio", en ? "We're glad to have you" : "يسعدنا انضمامك إلينا",
      amP(en ? "Your account was created with Google. You can follow your orders and invoices from your account at any time." : "أُنشئ حسابك بنجاح عبر Google، وأصبح بإمكانك متابعة طلباتك وفواتيرك من حسابك في أي وقت.") + amPerks(L, perks),
      en ? "Open my account" : "افتح حسابي", ws, "WELCOME"],
    verify: () => [en ? "Confirm your e-mail" : "أكّد بريدك الإلكتروني", en ? "Confirm your e-mail" : "تأكيد بريدك الإلكتروني",
      amP(en ? "Tap the button below to confirm this address is yours, so the studio's important messages always reach you and your account stays secure." : "اضغط الزر أدناه لتأكيد أن هذا البريد لك؛ بذلك تصلك رسائل الاستوديو المهمة دون انقطاع، ويبقى حسابك في أمان.") +
      amMuted(en ? "The link is valid for 24 hours. If you did not create an account with us, you can safely ignore this message; your address will not be used." : "الرابط صالح لمدة 24 ساعة. إن لم تُنشئ حساباً لدينا، فتجاهل هذه الرسالة بكل اطمئنان، ولن يُستخدم بريدك."),
      en ? "Confirm my e-mail" : "أكّد بريدي", x.link, "VERIFY"],
    device: () => [en ? "A new sign-in to your account" : "دخول جديد إلى حسابك", en ? "Signed in on a new device" : "دخول من جهاز جديد",
      amP(en ? "Your Eyeblink Studio account was just signed in on a device it has not been used with before." : "سُجّل دخول إلى حسابك في Eyeblink Studio من جهاز لم يُستخدم معه من قبل.") +
      facts(en ? [["Time", i.when], ["Device", i.device], ["Location", i.place]] : [["الوقت", i.when], ["الجهاز", i.device], ["الموقع", i.place]]) +
      amP(`<span style="display:block;margin-top:14px">${en ? "If this was you, there is nothing to do." : "إن كنت أنت، فلا حاجة إلى أي إجراء."}</span>`) +
      amP(en ? "If it was not, choose a new password now and every other device will be signed out automatically." : "وإن لم تكن أنت، فاختر كلمة سر جديدة الآن، وسيُسجَّل الخروج من جميع الأجهزة الأخرى تلقائياً."),
      en ? "Secure my account" : "تأمين حسابي", x.link || ws + "?reset=1", "SECURITY"],
    password: () => [en ? "Your password was changed" : "تغيّرت كلمة السر لحسابك", en ? "Your password was changed" : "تغيّرت كلمة السر بنجاح",
      amP(x.keep ? (en ? "This is to confirm your account password was changed." : "نؤكد لك أن كلمة السر لحسابك قد تغيّرت بنجاح.")
        : (en ? "This is to confirm your account password was changed, and your other devices were signed out to keep your account secure." : "نؤكد لك أن كلمة السر لحسابك قد تغيّرت، وسُجّل الخروج من الأجهزة الأخرى حفاظاً على أمان حسابك.")) +
      facts(en ? [["Time", i.when], ["Device", i.device]] : [["الوقت", i.when], ["الجهاز", i.device]]) +
      amMuted(en ? "If you did not make this change, write to us right away at " + AM_SUPPORT + " and we will secure your account with you, step by step." : "إن لم تقم بهذا التغيير، فراسلنا فوراً على " + AM_SUPPORT + "، وسنعيد تأمين حسابك معك خطوة بخطوة."), "", "", "SECURITY"],
    code: () => [en ? "Your password reset code" : "رمز استعادة كلمة السر", en ? "Your password reset code" : "رمز استعادة كلمة السر",
      amP(en ? "Use this code to choose a new password for your account:" : "استخدم الرمز التالي لاختيار كلمة سر جديدة لحسابك:") + amCode(String(x.code).replace(/^(\d{3})(\d{3})$/, "$1 $2")) +
      amMuted(en ? "The code is valid for 15 minutes and works once. If you did not ask for it, ignore this message and your password stays as it is." : "الرمز صالح لمدة 15 دقيقة ويُستخدم مرة واحدة. إن لم تطلب ذلك، فتجاهل هذه الرسالة، وستبقى كلمة السر كما هي."), "", "", "SECURITY"],
    deleting: () => [en ? "Your account is set to be deleted" : "طلبتَ حذف حسابك", en ? "Your account is set to be deleted" : "حسابك مجدول للحذف",
      amP(en ? "We have received your request. Your account is now frozen and will be deleted for good on " + x.until + "." : "استلمنا طلبك. جُمِّد حسابك الآن، وسيُحذف نهائياً في " + x.until + ".") +
      amP(en ? "Changed your mind? Sign in before that date and restore it in one step; everything will be just as you left it." : "إن غيّرت رأيك، سجّل دخولك قبل هذا التاريخ واستعده بخطوة واحدة، فيعود كل شيء كما تركته.") +
      amMuted(en ? "Your invoices and payment records are kept for accounting, as our privacy policy explains. If you did not ask for this, sign in now and restore your account, then choose a new password." : "تبقى فواتيرك وسجل مدفوعاتك لأغراض محاسبية كما توضّح سياسة الخصوصية. وإن لم تطلب ذلك، فسجّل دخولك الآن واستعد حسابك، ثم اختر كلمة سر جديدة."),
      en ? "Restore my account" : "استعد حسابي", ws, "ACCOUNT"],
    deleted: () => [en ? "Your account has been deleted" : "حُذف حسابك", en ? "Your account has been deleted" : "حُذف حسابك نهائياً",
      amP(en ? "As you asked, your account and its projects, files and messages have been deleted. Thank you for the time you spent with us; you are always welcome back." : "كما طلبت، حُذف حسابك ومشاريعه وملفاته ورسائله. نشكرك على الوقت الذي قضيته معنا، ويسعدنا دائماً أن نعمل معك من جديد.") +
      amMuted(en ? "Your invoices and payment records are kept for accounting, as our privacy policy explains." : "تبقى فواتيرك وسجل مدفوعاتك لأغراض محاسبية، كما توضّح سياسة الخصوصية."), "", "", "ACCOUNT"],
  }[kind];
  if (!M) return null;
  const [subject, title, body, cta, link, label] = M();
  return { subject, html: mail(L, title, body, cta, link, hi, { label }) };
}

// ---- automatic messages (Phase 3, 18 Nov 2026): the studio's rules, set in Settings and kept in KV "rules" ----
// id: [default mode, default days, which modes it offers]. Client rules can wait for the studio's approval ("ask"); the rest are on or off.
export const RULES = {
  invSoon: ["auto", 3, "aao"], invDue: ["auto", 2, "aao"], invFollow: ["ask", 10, "aao"], review: ["auto", 3, "aao"], info: ["auto", 2, "aao"],
  orderPay: ["auto", 2, "ao"], report: ["auto", 0, "ao"], teamSoon: ["auto", 1, "ao"], teamLate: ["auto", 1, "ao"], qcWait: ["auto", 1, "ao"], invPersonal: ["auto", 4, "ao"] };
export const QUIET = { from: 10, to: 19, fri: true };   // Gulf time (UTC+4)
export const DIGEST = { on: true, time: "09:30", tg: true, email: true, fri: true, skipEmpty: true };   // the studio's morning summary
export async function rulesOf(env){
  let r = {}; try { r = JSON.parse(await env.EB.get("rules") || "{}") || {}; } catch {}
  const q = r.quiet || {}, out = { quiet: { from: Math.min(23, Math.max(0, parseInt(q.from ?? QUIET.from) || 0)), to: Math.min(24, Math.max(1, parseInt(q.to ?? QUIET.to) || 24)), fri: q.fri !== undefined ? !!q.fri : QUIET.fri }, rules: {} };
  for (const k in RULES) { const v = (r.rules || {})[k] || {}, ok = RULES[k][2] === "aao" ? ["auto", "ask", "off"] : ["auto", "off"];
    out.rules[k] = { mode: ok.includes(v.mode) ? v.mode : RULES[k][0], days: Math.max(0, Math.min(60, parseInt(v.days ?? RULES[k][1]) || 0)) }; }
  const dg = r.digest || {}; out.digest = { on: dg.on !== undefined ? !!dg.on : DIGEST.on, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(dg.time || "") ? dg.time : DIGEST.time,
    tg: dg.tg !== undefined ? !!dg.tg : DIGEST.tg, email: dg.email !== undefined ? !!dg.email : DIGEST.email, fri: dg.fri !== undefined ? !!dg.fri : DIGEST.fri, skipEmpty: dg.skipEmpty !== undefined ? !!dg.skipEmpty : DIGEST.skipEmpty };
  return out;
}

// ---- the client's photo: one small square image, set by the client (account page) or by the studio (client profile); the latest wins ----
// kept as public KV media under a random name (/api/media/av-…), on the account (user.pic) and on the client row (clients.logo_url)
const AV_MAX = 400 * 1024;
export function avatarType(b){ if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8) return "image/jpeg"; if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return "image/png"; return ""; }
export async function setAvatar(env, email, dataUrl){   // dataUrl: "data:image/…;base64,…" or null to remove → { ok, url } | { ok:false, error }
  let bytes = null, type = "";
  if (dataUrl) { const m = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl)); if (!m) return { ok: false, error: "type" };
    try { bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)); } catch { return { ok: false, error: "type" }; }
    if (bytes.length > AV_MAX) return { ok: false, error: "size" }; type = avatarType(bytes); if (!type) return { ok: false, error: "type" }; }
  const k = "user:" + email, v = await env.EB.get(k), u = v ? JSON.parse(v) : null;
  const row = env.DB ? await env.DB.prepare("SELECT logo_url FROM clients WHERE email=?").bind(email).first().catch(() => null) : null;
  let url = null;
  if (bytes) { const key = "av-" + randHex(8) + (type === "image/png" ? ".png" : type === "image/jpeg" ? ".jpg" : ".webp"); await env.EB.put("media:" + key, bytes, { metadata: { type, size: bytes.length } }); url = "/api/media/" + key; }
  for (const o of new Set([u && u.pic, row && row.logo_url])) if (o && o !== url && String(o).startsWith("/api/media/av-")) await env.EB.delete("media:" + String(o).slice(11));
  if (u) { if (url) u.pic = url; else delete u.pic; await env.EB.put(k, JSON.stringify(u)); }
  if (row) await env.DB.prepare("UPDATE clients SET logo_url=?, updated_at=? WHERE email=?").bind(url, new Date().toISOString(), email).run();
  return { ok: true, url };
}

// ---- the brand library, as stored (files in R2 by key); each reader turns keys into the links it serves ----
export async function brandKit(D, email){
  const k = await D.prepare("SELECT * FROM brand_kits WHERE email=?").bind(email).first() || {};
  const j = v => { try { return JSON.parse(v || "[]"); } catch { return []; } };
  const assets = (await D.prepare("SELECT id, kind, title, key, size, type, created_at FROM brand_assets WHERE email=? AND deleted_at IS NULL ORDER BY created_at").bind(email).all()).results;
  return { colors: j(k.colors), fonts: j(k.fonts), style: k.style || "", music: k.music || "", assets, updated_at: k.updated_at || null };
}
// the whole library as one .zip (stored, not compressed: logos and fonts are compressed already), with a text file of colours, fonts and style
const ZDIR = { logo_bg: "logo-on-background", logo_clear: "logo-transparent", logo_dark: "logo-on-background", logo_light: "logo-transparent", vector: "vector", font: "fonts", other: "other" };
const ZMAX = 90 * 1024 * 1024;   // shortcut: the zip is built in memory (an isolate has 128 MB); past this a file is listed in the text file instead
let CRC = null;
function crc32(b){ if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
export function zipStore(files){   // [{ name, data: Uint8Array }] → Uint8Array
  const enc = new TextEncoder(), local = [], central = []; let off = 0;
  for (const f of files) { const nm = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, n, true); h.setUint32(22, n, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    local.push(new Uint8Array(h.buffer), nm, f.data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, n, true); c.setUint32(24, n, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + n; }
  const cl = central.reduce((a, x) => a + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cl, true); e.setUint32(16, off, true);
  const parts = [...local, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(parts.reduce((a, x) => a + x.length, 0)); let p = 0; for (const x of parts) { out.set(x, p); p += x.length; } return out;
}
export async function brandZip(env, kit, label){
  const files = [], left = [], used = new Set(); let total = 0;
  for (const a of kit.assets) { if (total + (a.size || 0) > ZMAX) { left.push(a.title); continue; }
    const o = env.R2 ? await env.R2.get(a.key) : null; if (!o) continue; const data = new Uint8Array(await o.arrayBuffer()); total += data.length;
    let name = (ZDIR[a.kind] || "other") + "/" + String(a.title || a.key.split("/").pop()).replace(/[\/\\:*?"<>|]+/g, "-"), i = 1; while (used.has(name)) name = name.replace(/(\.[^.]*)?$/, m => "-" + (++i) + m); used.add(name);
    files.push({ name, data }); }
  const txt = ["Brand library · " + label, "",
    kit.colors.length ? "Colours / الألوان\r\n" + kit.colors.map(c => c.hex + (c.name ? "  " + c.name : "")).join("\r\n") : "",
    kit.fonts.length ? "Fonts / الخطوط\r\n" + kit.fonts.map(f => f.name + (f.use ? "  (" + f.use + ")" : "")).join("\r\n") : "",
    kit.style ? "Style / الأسلوب\r\n" + kit.style : "", kit.music ? "Music / الموسيقى\r\n" + kit.music : "",
    left.length ? "Too large for this file, download them one by one / ملفات أكبر من أن تُضمّ هنا:\r\n" + left.join("\r\n") : ""].filter(Boolean).join("\r\n\r\n");
  files.unshift({ name: "brand.txt", data: new TextEncoder().encode("﻿" + txt) });
  const slug = String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40), fname = (slug ? slug + "-" : "") + "brand-library.zip";
  return new Response(zipStore(files), { headers: { "content-type": "application/zip", "content-disposition": "attachment; filename=\"" + fname + "\"", "cache-control": "private, no-store" } });
}
