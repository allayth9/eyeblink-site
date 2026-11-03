// GET    /api/users — admin: client accounts
// PATCH  /api/users — admin: { email, password } sets a new password for a client who forgot theirs
// DELETE /api/users?email=... — admin: removes the account (their orders stay)
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const out = []; let cursor;
  do { const r = await env.EB.list({ prefix: "user:", cursor });
    for (const k of r.keys) { const v = await env.EB.get(k.name); if (!v) continue; const u = JSON.parse(v);
      out.push({ email: u.email, name: u.name, provider: u.provider, google: !!u.google, hasPassword: !!u.hash, createdAt: u.createdAt, lastLogin: u.lastLogin, orders: (u.orders || []).length }); }
    cursor = r.list_complete ? null : r.cursor; } while (cursor && out.length < 2000);
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return json({ ok: true, users: out });
}
export async function onRequestPatch({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const d = await request.json().catch(() => ({}));
  const v = await env.EB.get("user:" + String(d.email || "").toLowerCase()); if (!v) return json({ ok: false }, 404);
  const pw = String(d.password || ""); if (pw.length < 8) return json({ ok: false, error: "min 8" }, 400);
  const u = JSON.parse(v); u.salt = randHex(16); u.hash = await pbkdf2(pw, u.salt);
  await env.EB.put("user:" + u.email, JSON.stringify(u));
  return json({ ok: true });
}
export async function onRequestDelete({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const email = (new URL(request.url).searchParams.get("email") || "").toLowerCase();
  await env.EB.delete("user:" + email);
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
  paid:!!o.paid, details:o.details, link:o.link, deadline:o.deadline, history:o.history||[], messages:(o.messages||[]).map(m=>({from:m.from,text:m.text,at:m.at,files:m.files||undefined,kind:m.kind||undefined})), unread:unreadFor(o,"client"),
  name:o.name, email:o.email, method:o.method, review:o.review||null, payInfo:o.payInfo||null, invoice:o.invoice||null, deposit:o.deposit||null, plan:o.plan||"full", items:o.items||[], cur:o.cur||"", qty:o.qty||1, platforms:o.platforms||[], payPref:o.payPref||"" }; }
// attachments must point at files uploaded through /api/files
function cleanFiles(list){ return (Array.isArray(list)?list:[]).slice(0,8).filter(f=>f&&/^\/api\/files\/[a-z0-9][a-z0-9.\-_]{10,120}$/.test(f.url||""))
  .map(f=>({url:f.url, name:String(f.name||"file").slice(0,120), type:String(f.type||"").slice(0,80), size:+f.size||0})); }

// ---- notifications: Resend e-mail + Telegram (each one is skipped quietly until its secrets are set) ----
// (this block is copied into every route by tools/sync_api.py — edit it here, then run the script)
const SITE = "https://eyeblinkstudio.com";
const ST_AR = {"new":"استلمنا الطلب","confirmed":"تأكيد التفاصيل","awaiting-payment":"بانتظار الدفع","paid":"تم الدفع","in-progress":"قيد التنفيذ","review":"بانتظار مراجعتك","delivered":"تم التسليم","cancelled":"ملغى"};
const ST_EN = {"new":"Request received","confirmed":"Details confirmed","awaiting-payment":"Awaiting payment","paid":"Paid","in-progress":"In production","review":"Awaiting your review","delivered":"Delivered","cancelled":"Cancelled"};
function h(t){ return String(t??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
async function siteContent(env){ try { return JSON.parse(await env.EB.get("content")||"{}"); } catch { return {}; } }
async function siteSettings(env){ return (await siteContent(env)).settings || {}; }
async function sendMail(env, to, subject, html){
  if (!env.RESEND_API_KEY || !to) return false;
  try { const r = await fetch("https://api.resend.com/emails", { method:"POST", headers:{ authorization:"Bearer "+env.RESEND_API_KEY, "content-type":"application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "Eyeblink Studio <hello@eyeblinkstudio.com>", to:[to], subject, html }) }); return r.ok; } catch { return false; }
}
async function telegram(env, text){
  if (!env.TELEGRAM_TOKEN || !env.TELEGRAM_CHAT) return { ok:false, description:"TELEGRAM_TOKEN or TELEGRAM_CHAT is not set" };
  const token = String(env.TELEGRAM_TOKEN).trim().replace(/^bot/i, ""), chat = String(env.TELEGRAM_CHAT).trim();
  try { const r = await fetch("https://api.telegram.org/bot"+token+"/sendMessage", { method:"POST", headers:{ "content-type":"application/json" },
    body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3900), disable_web_page_preview: true }) }); return await r.json(); } catch (e) { return { ok:false, description:String(e) }; }
}
function greet(o){ const f = String((o && o.name) || "").trim().split(/\s+/)[0]; return o && o.lang === "en" ? "Hi" + (f ? " " + f : "") + "," : "أهلاً" + (f ? " " + f : "") + "،"; }
// one layout for every e-mail: logo centred on top → the greeting on its own line → title → details → button → logo in the footer
function mail(lang, title, bodyHtml, cta, link, hi){
  const rtl = lang !== "en", al = rtl ? "right" : "left";
  return `<!doctype html><html dir="${rtl?"rtl":"ltr"}" lang="${rtl?"ar":"en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="dark light"></head>
<body style="margin:0;background:#04061A;padding:28px 12px;font-family:Tahoma,Arial,sans-serif;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#0b1236;border-radius:20px;border:1px solid #1d2758">
<tr><td align="center" style="padding:30px 24px 22px"><a href="${SITE}" style="text-decoration:none"><img src="${SITE}/assets/img/email-logo.png" width="190" alt="EYEBLINK STUDIO" style="display:block;width:190px;max-width:70%;height:auto;border:0;margin:0 auto"></a></td></tr>
<tr><td style="padding:0 28px"><div style="height:2px;line-height:2px;font-size:0;background:#2E62FF;background-image:linear-gradient(90deg,#3FE0E8,#2E62FF,#8B5CFF);border-radius:2px">&nbsp;</div></td></tr>
<tr><td style="padding:26px 28px 30px;color:#EEF2F6;text-align:${al}">
${hi?`<p style="margin:0 0 18px;font-size:17px;line-height:1.6;color:#ffffff">${h(hi)}</p>`:""}
<h1 style="font-size:20px;line-height:1.5;margin:0 0 12px;color:#ffffff">${h(title)}</h1>
<div style="font-size:15px;line-height:1.8;color:#C3CEE2">${bodyHtml}</div>
${cta?`<div style="margin-top:24px"><a href="${link}" style="display:inline-block;background:#EEF2F6;color:#04061A;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 26px;border-radius:999px">${h(cta)}</a></div>`:""}
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto"><tr><td align="center" style="padding:22px 12px 6px">
<a href="${SITE}" style="text-decoration:none"><img src="${SITE}/assets/img/apple-touch-icon.png" width="38" height="38" alt="Eyeblink" style="display:block;width:38px;height:38px;border-radius:10px;border:0;margin:0 auto"></a>
<p style="margin:10px 0 0;color:#8E9BB8;font-size:12px;line-height:1.7;direction:ltr">Eyeblink Studio · <a href="${SITE}" style="color:#8E9BB8">eyeblinkstudio.com</a> · <a href="https://instagram.com/eyeblnk" style="color:#8E9BB8">@eyeblnk</a></p>
</td></tr></table></body></html>`;
}
// to the studio: e-mail (to the address in the site settings) + Telegram
async function notifyStudio(env, subject, text){
  const s = await siteSettings(env), to = env.NOTIFY_EMAIL || s.email;
  await Promise.all([ sendMail(env, to, subject, mail("ar", subject, h(text).replace(/\n/g,"<br>"), "افتح لوحة التحكم", SITE+"/admin/")),
    telegram(env, "🔔 "+subject+"\n\n"+text+"\n\n"+SITE+"/admin/") ]);
}
// to the client: new message from the studio / status change
async function notifyClient(env, o, kind, text){
  if (!o.email) return;
  if (kind === "received") return mailReceived(env, o);
  const en = o.lang === "en", link = SITE + (en ? "/en" : "") + "/account.html#" + o.code;
  const T = en ? { message:"New message about your request "+o.code, status:"Update on your request "+o.code, cta:"Open my request", statusP:"Your request is now: " }
               : { message:"رسالة جديدة بخصوص طلبك "+o.code, status:"تحديث على طلبك "+o.code, cta:"افتح طلبي", statusP:"حالة طلبك الآن: " };
  const body = kind==="message" ? h(text).replace(/\n/g,"<br>") : h(T.statusP) + "<b style=\"color:#fff\">"+h((en?ST_EN:ST_AR)[text]||text)+"</b>";
  await sendMail(env, o.email, T[kind], mail(en?"en":"ar", T[kind], body, T.cta, link, greet(o)));
}

// ---- money helpers ----
function num(v){ const n = parseFloat(String(v ?? "").replace(/,/g, "").replace(/[^0-9.]/g, "")); return isFinite(n) ? n : 0; }
function curOf(o){ return o.cur || (String(o.price || o.total || "").match(/[^\d\s.,]+/) || ["$"])[0]; }
function fmt(n, c){ const v = (Math.round(n * 100) / 100).toFixed(n % 1 ? 2 : 0); return c === "$" || c === "€" || c === "£" ? c + v : v + " " + c; }
function totalOf(o){ return num(o.price) || (o.items || []).reduce((a, x) => a + num(x.unit) * (num(x.qty) || 1), 0) || num(o.total); }
// what the client pays at each step: everything at once, or a deposit and then the rest
function stageOf(o){ if (o.plan === "split") return (o.deposit && o.deposit.paid) ? "final" : "deposit"; return "full"; }
function stageAmount(o, stage){ const t = totalOf(o), pct = num(o.depositPct) || 50;
  if (stage === "deposit") return Math.round(t * pct) / 100;
  if (stage === "final") return Math.max(0, t - num((o.deposit || {}).amount)); return t; }
const STAGE = { ar:{ full:"كامل المبلغ", deposit:"العربون", final:"الدفعة النهائية" }, en:{ full:"Full amount", deposit:"Deposit", final:"Final payment" } };

// ---- the invoice: compact (fits an e-mail), Eyeblink colours; one design for e-mail, the account page and PDF ----
function invoiceHTML(o, inv, opt){
  opt = opt || {}; const c = curOf(o), total = totalOf(o);
  let lines = (o.items || []).filter(x => x && x.name).map(x => ({ name: x.name, qty: num(x.qty) || 1, unit: num(x.unit) }));
  if (!lines.length) lines = [{ name: o.packageName || o.package || "Service", qty: o.qty || 1, unit: total / (o.qty || 1) }];
  const sub = lines.reduce((a, x) => a + x.unit * x.qty, 0);
  if (Math.abs(sub - total) > 0.009 && total) lines.push({ name: total < sub ? "Discount / خصم" : "Adjustment / تعديل حسب البريف", qty: 1, unit: total - sub });
  const d = new Date(inv.at || Date.now()), date = d.toLocaleDateString("en-GB", { year:"numeric", month:"long", day:"numeric" });
  const dep = num((o.deposit || {}).amount), paidNow = num(inv.amount) || total;
  const balance = inv.kind === "deposit" ? Math.max(0, total - paidNow) : 0;
  const pill = inv.kind === "deposit" ? ["DEPOSIT PAID · عربون مدفوع", "#e3f0ff", "#1d4fd8"] : ["PAID · مدفوعة", "#dcf7e6", "#127a3a"];
  const td = "padding:9px 10px;border-bottom:1px solid #e9edf5;font-size:13px;color:#0b1236";
  const row = (k, v, strong) => `<tr><td style="padding:5px 10px;font-size:${strong?14:12.5}px;color:${strong?"#0b1236":"#5b6785"};font-weight:${strong?"bold":"normal"};text-align:right">${k}</td><td style="padding:5px 10px;font-size:${strong?14:12.5}px;font-weight:bold;color:#0b1236;text-align:right;white-space:nowrap">${v}</td></tr>`;
  const method = (o.payInfo && o.payInfo.methodName) || o.method || "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="ltr" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,Tahoma,sans-serif;text-align:left;border:1px solid #e3e8f2">
<tr><td style="background:#04061A;background-image:linear-gradient(120deg,#04061A 0%,#0b1236 55%,#1b1f6b 100%);padding:20px 22px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="vertical-align:middle"><img src="${SITE}/assets/img/email-logo.png" width="150" alt="EYEBLINK STUDIO" style="display:block;width:150px;height:auto;border:0"></td>
  <td style="vertical-align:middle;text-align:right"><div style="font:bold 24px/1 Arial,sans-serif;letter-spacing:3px;color:#ffffff">INVOICE</div><div style="font:12px/1.6 Arial,sans-serif;color:#3FE0E8;letter-spacing:1px;margin-top:4px">#${h(inv.no)}</div></td>
 </tr></table></td></tr>
<tr><td style="height:3px;line-height:3px;font-size:0;background:#2E62FF;background-image:linear-gradient(90deg,#3FE0E8,#2E62FF,#8B5CFF)">&nbsp;</td></tr>
<tr><td style="padding:18px 22px 6px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="vertical-align:top;width:50%"><div style="font-size:10.5px;letter-spacing:1.5px;color:#8a95ad;font-weight:bold">FROM</div><div style="font-size:14px;font-weight:bold;color:#0b1236;margin-top:4px">Eyeblink Studio</div><div style="font-size:12px;color:#5b6785;line-height:1.6">Video Editing · Motion · Film<br>eyeblinkstudio.com${opt.email?"<br>"+h(opt.email):""}</div></td>
  <td style="vertical-align:top;width:50%;text-align:right"><div style="font-size:10.5px;letter-spacing:1.5px;color:#8a95ad;font-weight:bold">BILL TO</div><div style="font-size:14px;font-weight:bold;color:#0b1236;margin-top:4px">${h(o.name)}</div><div style="font-size:12px;color:#5b6785;line-height:1.6">${h(o.email)}</div></td>
 </tr></table>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;background:#f5f7fb;border-radius:10px"><tr>
  <td style="padding:10px 12px;font-size:12px;color:#5b6785">Issue date<br><b style="color:#0b1236;font-size:13px">${date}</b></td>
  <td style="padding:10px 12px;font-size:12px;color:#5b6785">Order<br><b style="color:#0b1236;font-size:13px">${h(o.code)}</b></td>
  <td style="padding:10px 12px;text-align:right"><span style="display:inline-block;padding:5px 10px;border-radius:99px;background:${pill[1]};color:${pill[2]};font:bold 11px Arial;letter-spacing:.5px">✓ ${pill[0]}</span></td>
 </tr></table>
</td></tr>
<tr><td style="padding:12px 22px 0">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
  <tr style="background:#0b1236"><td style="padding:9px 10px;font-size:11.5px;color:#fff;font-weight:bold;border-radius:8px 0 0 8px">Description / البيان</td><td style="padding:9px 6px;font-size:11.5px;color:#fff;font-weight:bold;text-align:center">Qty</td><td style="padding:9px 6px;font-size:11.5px;color:#fff;font-weight:bold;text-align:right">Unit</td><td style="padding:9px 10px;font-size:11.5px;color:#fff;font-weight:bold;text-align:right;border-radius:0 8px 8px 0">Total</td></tr>
  ${lines.map((x, i) => `<tr style="background:${i%2?"#fafbfd":"#ffffff"}"><td style="${td}">${h(x.name)}</td><td style="${td};text-align:center">${x.qty}</td><td style="${td};text-align:right;white-space:nowrap">${fmt(x.unit, c)}</td><td style="${td};text-align:right;font-weight:bold;white-space:nowrap">${fmt(x.unit * x.qty, c)}</td></tr>`).join("")}
 </table>
 <table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 0 auto;min-width:240px">
  ${row("Total / الإجمالي", fmt(total, c))}
  ${inv.kind === "final" && dep ? row("Deposit paid / العربون المدفوع", "−" + fmt(dep, c)) : ""}
  <tr><td colspan="2" style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1236;border-radius:8px;margin-top:4px"><tr><td style="padding:10px 12px;color:#fff;font-size:13px;font-weight:bold">${inv.kind === "deposit" ? "DEPOSIT PAID · العربون" : "PAID · المدفوع"}</td><td style="padding:10px 12px;color:#3FE0E8;font-size:16px;font-weight:bold;text-align:right;white-space:nowrap">${fmt(paidNow, c)}</td></tr></table></td></tr>
  ${inv.kind === "deposit" ? row("Balance due / المتبقي", fmt(balance, c), 1) : ""}
 </table>
</td></tr>
<tr><td style="padding:14px 22px 18px">
 ${method ? `<div style="font-size:12px;color:#5b6785">Payment method / طريقة الدفع: <b style="color:#0b1236">${h(method)}</b></div>` : ""}
 <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e9edf5;font-size:11.5px;color:#8a95ad;line-height:1.7">Thank you for working with us. · شكراً لثقتك بنا.<br>${inv.kind === "deposit" ? "The balance is due before final delivery. · المتبقي يُدفع قبل التسليم النهائي." : "This invoice confirms your payment in full for this stage. · هذه الفاتورة تأكيد لاستلام الدفعة."}</div>
</td></tr>
<tr><td style="background:#f5f7fb;padding:10px 22px;font-size:11px;color:#8a95ad;text-align:center;letter-spacing:.5px">EYEBLINK STUDIO · eyeblinkstudio.com · @eyeblnk</td></tr>
</table>`;
}
// the invoice as its own page (account → «الفاتورة», saves as a small PDF)
function invoicePage(o, inv, opt){
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${h(inv.no)} — Eyeblink Studio</title>
<style>@page{size:150mm 190mm;margin:6mm}html,body{margin:0;background:#e9edf5}body{padding:18px 10px}@media print{html,body{background:#fff}body{padding:0}.bar{display:none}}
.bar{max-width:560px;margin:0 auto 12px;display:flex;justify-content:flex-end;gap:8px}.bar button{font:bold 13px Arial;border:0;border-radius:99px;padding:10px 18px;background:#0b1236;color:#fff;cursor:pointer}</style></head>
<body><div class="bar"><button onclick="print()">Save PDF · حفظ PDF</button></div>${invoiceHTML(o, inv, opt)}</body></html>`;
}

// ---- client e-mails: the request summary; an invoice for every payment ----
function rows(list, rtl){ return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 4px">${list.filter(r=>r&&r[1]!==""&&r[1]!=null).map(([k,v,strong])=>`<tr><td style="padding:10px 0;border-bottom:1px solid #1d2758;color:#8E9BB8;font-size:13px;width:38%;vertical-align:top">${h(k)}</td><td style="padding:10px 0;border-bottom:1px solid #1d2758;color:${strong?"#fff":"#DCE3F0"};font-size:${strong?"17px":"14px"};font-weight:${strong?"bold":"normal"};text-align:${rtl?"right":"left"}">${v}</td></tr>`).join("")}</table>`; }
function steps(list){ return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 0">${list.map((s,i)=>`<tr><td style="vertical-align:top;padding:0 0 12px;width:26px"><div style="width:24px;height:24px;line-height:24px;border-radius:12px;background:#3FE0E8;color:#04061A;text-align:center;font:bold 12px/24px Arial">${i+1}</div></td><td style="padding:2px 12px 12px;color:#C3CEE2;font-size:14px;line-height:1.7">${h(s)}</td></tr>`).join("")}</table>`; }
async function mailReceived(env, o){
  if (!o.email) return;
  const en = o.lang === "en", link = SITE + (en ? "/en" : "") + "/account.html#" + o.code, rtl = !en;
  const c = await siteContent(env); let next = ((c.order||{}).next||{})[en?"en":"ar"] || [];
  if (!next.length) next = en ? ["We review your request and reply in your account within 24 hours","We agree on the details and date, then you get the payment details","We start production; you follow every stage until delivery"]
                              : ["نراجع طلبك ونرد عليك بحسابك خلال 24 ساعة","نتفق على التفاصيل والموعد، وبعدها توصلك تفاصيل الدفع","نبدأ التنفيذ، وتتابع كل مرحلة لحد التسليم"];
  const T = en ? ["Request no.","Service","Quantity","Add-ons","Platforms","Preferred payment","Target date","Estimated total","What happens next","Thank you — your request is in. Here is the summary; keep the request number for any question."]
               : ["رقم الطلب","الخدمة","العدد","الإضافات","المنصات","طريقة الدفع المفضّلة","الموعد المستهدف","المجموع التقديري","الخطوات الجاية","شكراً لك، وصلنا طلبك. هذا ملخّصه، واحتفظ برقم الطلب لأي استفسار."];
  const body = `<p style="margin:0 0 10px">${h(T[9])}</p>` +
    rows([[T[0], `<span style="font:bold 16px Arial;letter-spacing:2px;color:#3FE0E8">${h(o.code)}</span>`],[T[1], h(o.packageName)],[T[2], o.qty>1? "×"+o.qty : ""],[T[3], h((o.addons||[]).join(en?", ":"، "))],
      [T[4], h((o.platforms||[]).join(", "))],[T[5], h(o.payPref)],[T[6], h(o.deadline)],[T[7], `<span dir="ltr">${h(o.total)}</span>`, 1]], rtl) +
    `<p style="margin:24px 0 0;color:#fff;font-weight:bold;font-size:15px">${h(T[8])}</p>` + steps(next);
  await sendMail(env, o.email, (en ? "We received your request " : "استلمنا طلبك ") + o.code, mail(en?"en":"ar", (en ? "Request received · " : "وصل طلبك · ") + o.code, body, en ? "Follow my request" : "تابع طلبي", link, greet(o)));
}
async function mailInvoice(env, o, kind){
  const inv = kind === "deposit" ? (o.deposit || {}).invoice : o.invoice;
  if (!o.email || !inv) return;
  const en = o.lang === "en", link = SITE + (en ? "/en" : "") + "/account.html#" + o.code, s = await siteSettings(env), c = curOf(o);
  const T = en ? { deposit:"Deposit received ✓", final:"Final payment received ✓", full:"Payment received ✓",
                   depositP:"Your deposit is confirmed and production starts now. The remaining "+fmt(Math.max(0,totalOf(o)-num(inv.amount)),c)+" is due before final delivery. Your invoice is below.",
                   finalP:"Your request is now fully paid. Thank you! Your invoice is below.", fullP:"Your payment is confirmed and production starts now. You can follow every stage from your account. Your invoice is below.", cta:"View my request" }
               : { deposit:"وصل العربون ✓", final:"وصلت الدفعة النهائية ✓", full:"وصلت دفعتك ✓",
                   depositP:"تأكّد العربون وبدأنا التنفيذ. المتبقي "+fmt(Math.max(0,totalOf(o)-num(inv.amount)),c)+" يُدفع قبل التسليم النهائي. الفاتورة تحت.",
                   finalP:"صار طلبك مدفوع بالكامل، شكراً لك! الفاتورة تحت.", fullP:"تأكّدت دفعتك وبدأنا التنفيذ، وتقدر تتابع كل مرحلة من حسابك. الفاتورة تحت.", cta:"عرض طلبي" };
  const k = inv.kind || "full", body = `<p style="margin:0 0 18px">${h(T[k+"P"])}</p>` + invoiceHTML(o, inv, { email: s.email });
  await sendMail(env, o.email, (en ? "Invoice " : "فاتورة ") + inv.no + " · Eyeblink Studio", mail(en?"en":"ar", T[k] + " · " + o.code, body, T.cta, link, greet(o)));
}
async function newInvoice(env, kind, amount){
  const seq = (+(await env.EB.get("invseq") || 0)) + 1; await env.EB.put("invseq", String(seq));
  return { no: "INV-" + new Date().getFullYear() + "-" + String(seq).padStart(4, "0"), at: new Date().toISOString(), kind, amount };
}
// payment details sent 48 h ago and no receipt yet → one friendly reminder (checked at most once an hour, on site traffic)
async function sweepReminders(env){
  try {
    const last = +(await env.EB.get("sweep:at") || 0); if (Date.now() - last < 3600e3) return; await env.EB.put("sweep:at", String(Date.now()));
    const c = await siteContent(env), hrs = num(((c.payments || {}).reminderHours)) || 48; if ((c.payments || {}).reminders === false) return;
    let cursor; do {
      const r = await env.EB.list({ prefix: "order:", cursor });
      for (const k of r.keys) {
        const v = await env.EB.get(k.name); if (!v) continue; const o = JSON.parse(v), p = o.payInfo;
        if (!p || p.reminded || o.status === "cancelled" || !o.email) continue;
        if ((p.stage === "deposit" && o.deposit && o.deposit.paid) || ((p.stage || "full") !== "deposit" && o.paid)) continue;
        if (Date.now() - Date.parse(p.at) < hrs * 3600e3) continue;
        if ((o.messages || []).some(m => m.from === "client" && m.kind === "receipt" && m.at > p.at)) continue;
        p.reminded = new Date().toISOString(); await env.EB.put(k.name, JSON.stringify(o));
        const en = o.lang === "en", link = SITE + (en ? "/en" : "") + "/account.html#" + o.code;
        const body = en ? `A quick reminder: the payment details for <b style="color:#fff">${h(o.code)}</b> are waiting in your account (${h(p.methodName||"")} · <span dir="ltr">${h(p.amount)}</span>). Once you pay, attach the receipt there and we start right away. If anything is unclear, just reply in the chat.`
                        : `تذكير صغير: تفاصيل الدفع لطلبك <b style="color:#fff">${h(o.code)}</b> بانتظارك بحسابك (${h(p.methodName||"")} · <span dir="ltr">${h(p.amount)}</span>). بعد الدفع أرفق الإيصال هناك ومنبلّش فوراً. وإذا في شي مو واضح احكينا بالمحادثة.`;
        await sendMail(env, o.email, en ? "Reminder: payment for " + o.code : "تذكير بالدفع لطلبك " + o.code, mail(en?"en":"ar", en ? "Your payment details are waiting" : "تفاصيل الدفع بانتظارك", body, en ? "Open my request" : "افتح طلبي", link, greet(o)));
        await telegram(env, "⏰ أُرسل تذكير دفع تلقائي — " + o.code + " · " + o.name);
      }
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor);
  } catch {}
}
function later(ctx, p){ if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(p); else return p; }
