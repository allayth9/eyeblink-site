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
export async function limited(env, key, max, ttl){ const n=+(await env.EB.get(key)||0); if(n>=max) return true; await env.EB.put(key,String(n+1),{expirationTtl:ttl}); return false; }
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
  ${t.lines.map(x => `<tr><td ${D} style="${F}padding:12px 0;border-bottom:1px solid ${line};font-size:14px;color:#C3CEE2;text-align:${s}">${h(x.name)}${x.qty && x.qty !== 1 ? ` <span style="color:#6F7FA0;font-size:12.5px;${nb}">× ${x.qty}</span>` : ""}</td><td style="${F}padding:12px 0;border-bottom:1px solid ${line};font-size:14px;color:#EEF2F6;text-align:${e};${nb}">${h(x.amount)}</td></tr>`).join("")}
 </table>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">${t.totals.map(x => row(x[0], x[1], x[2], x[3])).join("")}</table>
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
  const seq = (+(await env.EB.get("invseq") || 0)) + 1; await env.EB.put("invseq", String(seq));
  return { no: "INV-" + new Date().getFullYear() + "-" + String(seq).padStart(4, "0"), at: new Date().toISOString(), kind, amount };
}
// payment details sent 48 h ago and no receipt yet → one friendly reminder (checked at most once an hour, on site traffic)
export async function sweepReminders(env){
  try {
    const last = +(await env.EB.get("sweep:at") || 0); if (Date.now() - last < 3600e3) return; await env.EB.put("sweep:at", String(Date.now()));
    const c = await siteContent(env), hrs = num(((c.payments || {}).reminderHours)) || 48, payOn = (c.payments || {}).reminders !== false;
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
  }[kind];
  if (!M) return null;
  const [subject, title, body, cta, link, label] = M();
  return { subject, html: mail(L, title, body, cta, link, hi, { label }) };
}
