// POST   /api/orders — signed-in client: sends a request (it then lives in their account with a chat thread)
// GET    /api/orders — admin: list requests (newest first)
// PATCH  /api/orders — admin: { key, status?, price?, method?, paid?, paidAmount?, notes?, message?, files?, seen?, reviewApproved? }
// DELETE /api/orders?key=... — admin
const STATUSES = ["new", "confirmed", "awaiting-payment", "paid", "in-progress", "review", "delivered", "cancelled"];
export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  let d; try { d = await request.json(); } catch { return json({ ok: false }, 400); }
  if (d.website) return json({ ok: true, code: "EB-00000" });
  const user = await currentUser(request, env);
  if (!user) return json({ ok: false, error: "login" }, 401);
  const ip = request.headers.get("cf-connecting-ip") || "x";
  const rl = "rl:" + ip, n = +(await env.EB.get(rl) || 0);
  if (n >= 6) return json({ ok: false, error: "too many requests" }, 429);
  await env.EB.put(rl, String(n + 1), { expirationTtl: 3600 });
  const clip = (v, m) => String(v ?? "").slice(0, m);
  const name = clip(user.name, 120), contact = clip(d.contact, 200), details = clip(d.details, 4000);
  if (!details) return json({ ok: false, error: "missing fields" }, 400);
  let code; do { code = "EB-" + randHex(3).toUpperCase().slice(0, 5); } while (await env.EB.get("code:" + code));
  const key = "order:" + new Date().toISOString() + ":" + code;
  const order = { key, code, status: "new", createdAt: new Date().toISOString(), name, contact, details,
    link: clip(d.link, 500), deadline: clip(d.deadline, 20), package: clip(d.package, 60), packageName: clip(d.packageName, 120),
    addons: (Array.isArray(d.addons) ? d.addons : []).slice(0, 12).map(a => clip(a, 80)), total: clip(d.total, 40), lang: clip(d.lang, 4),
    qty: Math.max(1, Math.min(50, parseInt(d.qty) || 1)), platforms: (Array.isArray(d.platforms) ? d.platforms : []).slice(0, 8).map(a => clip(a, 30)), payPref: clip(d.payPref, 60),
    email: user.email, messages: [], seenClient: "", seenAdmin: "",
    price: "", method: "", paid: false, paidAmount: "", notes: "", history: [{ at: new Date().toISOString(), status: "new" }] };
  await env.EB.put(key, JSON.stringify(order));
  await env.EB.put("code:" + code, key);
  (user.orders ||= []).push(key); await env.EB.put("user:" + user.email, JSON.stringify(user));
  later(ctx, Promise.all([ notifyStudio(env, "طلب جديد "+code+" — "+order.packageName, order.name+" · "+order.email+(order.contact?" · "+order.contact:"")+"\n"+order.total+(order.qty>1?" · ×"+order.qty:"")+(order.platforms.length?"\n📱 "+order.platforms.join(", "):"")+(order.payPref?"\n💳 "+order.payPref:"")+"\n\n"+order.details),
    mailReceived(env, order) ]));
  return json({ ok: true, code });
}
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const out = []; let cursor;
  do {
    const r = await env.EB.list({ prefix: "order:", cursor });
    for (const k of r.keys) { const v = await env.EB.get(k.name); if (v) { const x = JSON.parse(v); x.unread = unreadFor(x, "admin"); out.push(x); } }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor && out.length < 1000);
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return json({ ok: true, orders: out });
}
export async function onRequestPatch(ctx) {
  const { request, env } = ctx;
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const d = await request.json().catch(() => ({}));
  if (!d.key?.startsWith("order:")) return json({ ok: false }, 400);
  const v = await env.EB.get(d.key); if (!v) return json({ ok: false }, 404);
  const o = JSON.parse(v), clip = (x, m) => String(x ?? "").slice(0, m);
  let changed = false;
  if (d.status !== undefined) { if (!STATUSES.includes(d.status)) return json({ ok: false }, 400); if (d.status !== o.status) { (o.history ||= []).push({ at: new Date().toISOString(), status: d.status }); changed = true; } o.status = d.status; }
  if (d.price !== undefined) o.price = clip(d.price, 40);
  if (d.method !== undefined) o.method = clip(d.method, 60);
  let invoiced = false;
  if (d.paid !== undefined) { const was = !!o.paid; o.paid = !!d.paid;
    if (o.paid && !was && !o.invoice) { const seq = (+(await env.EB.get("invseq") || 0)) + 1; await env.EB.put("invseq", String(seq));
      o.invoice = { no: "INV-" + new Date().getFullYear() + "-" + String(seq).padStart(4, "0"), at: new Date().toISOString() }; invoiced = true; } }
  if (d.paidAmount !== undefined) o.paidAmount = clip(d.paidAmount, 40);
  if (d.notes !== undefined) o.notes = clip(d.notes, 4000);
  const now = new Date().toISOString();
  const files = cleanFiles(d.files);
  if (d.message || files.length) { (o.messages ||= []).push({ from: "studio", text: clip(d.message, 4000), at: now, ...(files.length ? { files } : {}) }); o.seenAdmin = now; }
  if (d.seen) o.seenAdmin = now;
  if (d.reviewApproved !== undefined && o.review) { o.review.approved = !!d.reviewApproved; await syncReviews(env, o); }
  // one click: the private payment details for the chosen method go to the client as a payment card + a chat message
  let payMsg = "";
  if (d.sendPayment) {
    if (!o.method || !o.price) return json({ ok: false, error: "set price and method first" }, 400);
    let priv = {}, content = {}; try { priv = JSON.parse(await env.EB.get("private") || "{}"); content = JSON.parse(await env.EB.get("content") || "{}"); } catch {}
    const m = ((content.payments || {}).methods || []).find(x => x.id === o.method) || { name: o.method };
    const details = String(((priv.payments || {})[o.method]) || "").slice(0, 2000);
    if (!details) return json({ ok: false, error: "no private details for this method" }, 400);
    const amount = clip(d.payAmount || o.price, 40), en = o.lang === "en";
    o.payInfo = { method: o.method, methodName: m.name, details, amount, at: now };
    payMsg = (en ? "Payment details — " : "تفاصيل الدفع — ") + m.name + "\n" + (en ? "Amount: " : "المبلغ: ") + amount + "\n\n" + details + "\n\n" + (en ? "After paying, attach the receipt here." : "بعد الدفع، أرفق صورة الإيصال هنا.");
    (o.messages ||= []).push({ from: "studio", text: payMsg, at: now, kind: "payment" }); o.seenAdmin = now;
    if (!["paid", "in-progress", "review", "delivered"].includes(o.status) && o.status !== "awaiting-payment") { (o.history ||= []).push({ at: now, status: "awaiting-payment" }); o.status = "awaiting-payment"; }
  }
  o.updatedAt = new Date().toISOString();
  await env.EB.put(d.key, JSON.stringify(o));
  if (invoiced || d.resendInvoice) later(ctx, mailInvoice(env, o));
  if (payMsg) later(ctx, notifyClient(env, o, "message", payMsg));
  else if (d.message || files.length) later(ctx, notifyClient(env, o, "message", (d.message || "") + (files.length ? "\n📎 " + files.map(f => f.name).join("، ") : "")));
  else if (changed) later(ctx, notifyClient(env, o, "status", o.status));
  return json({ ok: true, order: o });
}
export async function onRequestDelete({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!key.startsWith("order:")) return json({ ok: false }, 400);
  const v = await env.EB.get(key);
  if (v) { const o = JSON.parse(v); await env.EB.delete("code:" + o.code); }
  await env.EB.delete(key);
  return json({ ok: true });
}

// the public list of approved reviews lives in one KV value so the home page reads it in one go
async function syncReviews(env, o){
  let list = []; try { list = JSON.parse(await env.EB.get("reviews") || "[]"); } catch {}
  list = list.filter(r => r.code !== o.code);
  if (o.review && o.review.approved && o.review.publish) list.unshift({ code: o.code, name: String(o.name || "").split(/\s+/)[0], stars: o.review.stars, text: o.review.text, service: o.packageName, at: o.review.at });
  await env.EB.put("reviews", JSON.stringify(list.slice(0, 60)));
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
  name:o.name, email:o.email, method:o.method, review:o.review||null, payInfo:o.payInfo||null, invoice:o.invoice||null, qty:o.qty||1, platforms:o.platforms||[], payPref:o.payPref||"" }; }
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
  if (!env.TELEGRAM_TOKEN || !env.TELEGRAM_CHAT) return { ok:false, description:"TELEGRAM_TOKEN or TELEGRAM_CHAT is not set" };
  const token = String(env.TELEGRAM_TOKEN).trim().replace(/^bot/i, ""), chat = String(env.TELEGRAM_CHAT).trim();
  try { const r = await fetch("https://api.telegram.org/bot"+token+"/sendMessage", { method:"POST", headers:{ "content-type":"application/json" },
    body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3900), disable_web_page_preview: true }) }); return await r.json(); } catch (e) { return { ok:false, description:String(e) }; }
}
function mail(lang, title, bodyHtml, cta, link){
  const rtl = lang !== "en";
  return `<!doctype html><html dir="${rtl?"rtl":"ltr"}"><body style="margin:0;background:#04061A;padding:28px 12px;font-family:Tahoma,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#0b1236;border-radius:18px;padding:28px;color:#EEF2F6;text-align:${rtl?"right":"left"}">
<div style="margin:0 0 22px;text-align:${rtl?"right":"left"}"><a href="${SITE}" style="text-decoration:none"><img src="${SITE}/assets/img/email-logo.png" width="220" alt="EYEBLINK STUDIO" style="display:inline-block;width:220px;max-width:70%;height:auto;border:0"></a></div>
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
// ---- richer client e-mails: the request summary, and the invoice once it is paid ----
function rows(list, rtl){ return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0 4px">${list.filter(r=>r&&r[1]!==""&&r[1]!=null).map(([k,v,strong])=>`<tr><td style="padding:10px 0;border-bottom:1px solid #1d2758;color:#6F7FA0;font-size:13px;width:38%;vertical-align:top">${h(k)}</td><td style="padding:10px 0;border-bottom:1px solid #1d2758;color:${strong?"#fff":"#D6DEEC"};font-size:${strong?"17px":"14px"};font-weight:${strong?"bold":"normal"};text-align:${rtl?"right":"left"}">${v}</td></tr>`).join("")}</table>`; }
function steps(list){ return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 0">${list.map((s,i)=>`<tr><td style="vertical-align:top;padding:0 0 12px"><span style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:12px;background:#3FE0E8;color:#04061A;text-align:center;font:bold 12px Arial">${i+1}</span></td><td style="padding:2px 12px 12px;color:#AEBBD2;font-size:14px;line-height:1.7">${h(s)}</td></tr>`).join("")}</table>`; }
async function mailReceived(env, o){
  if (!o.email) return;
  const en = o.lang === "en", link = SITE + (en ? "/en" : "") + "/account.html#" + o.code, rtl = !en;
  let next = []; try { const c = JSON.parse(await env.EB.get("content") || "{}"); next = ((c.order||{}).next||{})[en?"en":"ar"] || []; } catch {}
  if (!next.length) next = en ? ["We review your request and reply in your account within 24 hours","We agree on the details and date, then you get the payment details","We start production; you follow every stage until delivery"]
                              : ["نراجع طلبك ونرد عليك بحسابك خلال 24 ساعة","نتفق على التفاصيل والموعد، وبعدها توصلك تفاصيل الدفع","نبدأ التنفيذ، وتتابع كل مرحلة لحد التسليم"];
  const T = en ? ["Request","Service","Quantity","Add-ons","Platforms","Preferred payment","Target date","Estimated total","What happens next","Hi ","we got your request. Here is the summary — keep the code for any question."]
               : ["رقم الطلب","الخدمة","العدد","الإضافات","المنصات","طريقة الدفع المفضّلة","الموعد المستهدف","المجموع التقديري","الخطوات الجاية","أهلاً ","وصلنا طلبك. هذا ملخّصه — احتفظ برقم الطلب لأي استفسار."];
  const first = String(o.name||"").split(/\s+/)[0];
  const body = `<p style="margin:0">${h(T[9]+first)}${en?", ":"، "}${h(T[10])}</p>` +
    rows([[T[0], `<span style="font:bold 16px Arial;letter-spacing:2px;color:#3FE0E8">${h(o.code)}</span>`],[T[1], h(o.packageName)],[T[2], o.qty>1? "×"+o.qty : ""],[T[3], h((o.addons||[]).join(en?", ":"، "))],
      [T[4], h((o.platforms||[]).join(", "))],[T[5], h(o.payPref)],[T[6], h(o.deadline)],[T[7], `<span dir="ltr">${h(o.total)}</span>`, 1]], rtl) +
    `<p style="margin:22px 0 0;color:#fff;font-weight:bold">${h(T[8])}</p>` + steps(next);
  await sendMail(env, o.email, (en ? "We received your request " : "استلمنا طلبك ") + o.code, mail(en?"en":"ar", (en ? "Request received — " : "وصل طلبك — ") + o.code, body, en ? "Follow my request" : "تابع طلبي", link));
}
async function mailInvoice(env, o){
  if (!o.email || !o.invoice) return;
  const en = o.lang === "en", rtl = !en, link = SITE + (en ? "/en" : "") + "/account.html#" + o.code;
  const s = await siteSettings(env), amt = o.paidAmount || o.price || o.total;
  const d = new Date(o.invoice.at).toLocaleDateString(en ? "en-GB" : "ar", { year:"numeric", month:"long", day:"numeric" });
  const T = en ? ["INVOICE","Invoice no.","Date","Order","Billed to","Description","Amount","Total paid","Payment method","PAID","Thank you — your payment is confirmed and production starts now. You can follow every stage from your account.","View my request"]
               : ["فاتورة","رقم الفاتورة","التاريخ","رقم الطلب","إلى","البيان","المبلغ","الإجمالي المدفوع","طريقة الدفع","مدفوعة","شكراً لك — تم تأكيد دفعتك وبدأنا التنفيذ. تقدر تتابع كل مرحلة من حسابك.","عرض طلبي"];
  const al = rtl ? "right" : "left", ar2 = rtl ? "left" : "right";
  const inv = `<div style="background:#fff;border-radius:14px;padding:22px;color:#0b1236;margin:4px 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font:bold 22px Arial;letter-spacing:3px;color:#0b1236;text-align:${al}">${T[0]}</td>
<td style="text-align:${ar2}"><span style="display:inline-block;padding:5px 12px;border-radius:99px;background:#dcf7e6;color:#127a3a;font:bold 12px Arial;letter-spacing:1px">✓ ${T[9]}</span></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:13px"><tr>
<td style="vertical-align:top;padding:4px 0;text-align:${al}"><div style="color:#6F7FA0;font-size:11px">${T[1]}</div><b dir="ltr">${h(o.invoice.no)}</b></td>
<td style="vertical-align:top;padding:4px 0;text-align:${al}"><div style="color:#6F7FA0;font-size:11px">${T[2]}</div><b>${h(d)}</b></td>
<td style="vertical-align:top;padding:4px 0;text-align:${al}"><div style="color:#6F7FA0;font-size:11px">${T[3]}</div><b dir="ltr">${h(o.code)}</b></td></tr>
<tr><td colspan="3" style="padding:10px 0 0;text-align:${al}"><div style="color:#6F7FA0;font-size:11px">${T[4]}</div><b>${h(o.name)}</b> · <span dir="ltr">${h(o.email)}</span></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
<tr><td style="padding:8px 0;border-bottom:2px solid #0b1236;color:#6F7FA0;font-size:11px;text-align:${al}">${T[5]}</td><td style="padding:8px 0;border-bottom:2px solid #0b1236;color:#6F7FA0;font-size:11px;text-align:${ar2}">${T[6]}</td></tr>
<tr><td style="padding:12px 0;border-bottom:1px solid #e6eaf2;text-align:${al}">${h(o.packageName)}${o.qty>1?" ×"+o.qty:""}${(o.addons||[]).length?`<div style="color:#6F7FA0;font-size:12px;margin-top:3px">+ ${h(o.addons.join(en?", ":"، "))}</div>`:""}</td><td style="padding:12px 0;border-bottom:1px solid #e6eaf2;text-align:${ar2}" dir="ltr">${h(amt)}</td></tr>
<tr><td style="padding:14px 0 0;font-weight:bold;font-size:16px;text-align:${al}">${T[7]}</td><td style="padding:14px 0 0;font-weight:bold;font-size:20px;text-align:${ar2}" dir="ltr">${h(amt)}</td></tr></table>
${o.method?`<p style="margin:14px 0 0;color:#6F7FA0;font-size:12px">${T[8]}: <b style="color:#0b1236">${h((o.payInfo&&o.payInfo.methodName)||o.method)}</b></p>`:""}
<p style="margin:18px 0 0;padding-top:12px;border-top:1px solid #e6eaf2;color:#6F7FA0;font-size:11px;direction:ltr;text-align:${al}">EYEBLINK STUDIO · eyeblinkstudio.com${s.email?" · "+h(s.email):""}</p></div>`;
  const body = `<p style="margin:0 0 16px">${h(T[10])}</p>` + inv;
  await sendMail(env, o.email, (en ? "Invoice " : "فاتورة ") + o.invoice.no + " — Eyeblink Studio", mail(en?"en":"ar", (en ? "Payment received ✓ " : "تم استلام دفعتك ✓ ") + o.code, body, T[11], link));
}
function later(ctx, p){ if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(p); else return p; }
