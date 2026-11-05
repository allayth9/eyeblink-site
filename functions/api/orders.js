// POST   /api/orders — signed-in client: sends a request (it then lives in their account with a chat thread)
// GET    /api/orders — admin: list requests (newest first)
// POST   /api/orders { action:"manual", name, contact, email?, details, source, value?, nextStep?, followUp? } — admin: an opportunity that came from outside the site (CRM)
// PATCH  /api/orders — admin: { key, status?, price?, method?, paid?, paidAmount?, notes?, message?, files?, seen?, reviewApproved?,
//                               nextStep?, followUp?, lostReason?, source?, email?, touch:{ channel, note }? }
// DELETE /api/orders?key=... — admin
// "discussing" = the back-and-forth before an agreement (between "new" and "confirmed"); the client sees it as "received".
const STATUSES = ["new", "discussing", "confirmed", "awaiting-payment", "paid", "in-progress", "review", "delivered", "cancelled"];
const SOURCES = ["website", "instagram", "whatsapp", "referral", "email", "meeting", "other"];
// an opportunity added by hand stays out of the client account (no listing, no e-mails) until the studio confirms it
const hiddenFromClient = o => !!o.manual && !o.clientVisible;
async function linkUser(env, o){ if (!o.email || hiddenFromClient(o)) return; const uv = await env.EB.get("user:" + o.email); if (!uv) return;
  const u = JSON.parse(uv); if ((u.orders || []).includes(o.key)) return; (u.orders ||= []).push(o.key); await env.EB.put("user:" + o.email, JSON.stringify(u)); }
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  let d; try { d = await request.json(); } catch { return json({ ok: false }, 400); }
  if (d && d.action === "manual") return manualOrder(ctx, d);
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
    items: (Array.isArray(d.items) ? d.items : []).slice(0, 14).map(x => ({ name: clip(x && x.name, 120), qty: Math.max(1, Math.min(50, parseInt(x && x.qty) || 1)), unit: Math.round((+(x && x.unit) || 0) * 100) / 100 })).filter(x => x.name),
    cur: clip(d.cur, 6), visit: visitOf(request, d.visit),
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
// the studio adds someone who wrote on Instagram, WhatsApp, by e-mail or in person: same inbox, same statuses, same payment path
async function manualOrder(ctx, d){
  const { request, env } = ctx;
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const clip = (v, m) => String(v ?? "").trim().slice(0, m);
  const name = clip(d.name, 120); if (!name) return json({ ok: false, error: "name" }, 400);
  const email = clip(d.email, 254).toLowerCase(); if (email && !EMAIL_RE.test(email)) return json({ ok: false, error: "email" }, 400);
  const source = SOURCES.includes(d.source) ? d.source : "other", now = new Date().toISOString();
  let code; do { code = "EB-" + randHex(3).toUpperCase().slice(0, 5); } while (await env.EB.get("code:" + code));
  const key = "order:" + now + ":" + code;
  const order = { key, code, status: "new", createdAt: now, name, contact: clip(d.contact, 200), details: clip(d.details, 4000) || "—",
    link: "", deadline: "", package: "", packageName: clip(d.title, 120) || (d.lang === "en" ? "Opportunity" : "فرصة"), addons: [], total: clip(d.value, 40), lang: d.lang === "en" ? "en" : "ar",
    items: [], cur: "", visit: { source, manual: true }, qty: 1, platforms: [], payPref: "",
    email, messages: [], seenClient: "", seenAdmin: now, manual: true, source,
    nextStep: clip(d.nextStep, 300), followUp: isDate(d.followUp) ? d.followUp : "", touches: [],
    price: "", method: "", paid: false, paidAmount: "", notes: clip(d.notes, 4000), history: [{ at: now, status: "new", by: "admin", note: "manual" }] };
  await env.EB.put(key, JSON.stringify(order));
  await env.EB.put("code:" + code, key);
  return json({ ok: true, code, order });
}
export async function onRequestGet(ctx) {
  const { request, env } = ctx;
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  later(ctx, sweepReminders(env));
  const out = []; let cursor;
  do {
    const r = await env.EB.list({ prefix: "order:", cursor });
    for (const k of r.keys) { const v = await env.EB.get(k.name); if (v) { const x = JSON.parse(v); x.unread = unreadFor(x, "admin"); out.push(x); } }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor && out.length < 1000);
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return json({ ok: true, orders: out });
}
// where the client came from (first visit saved in their browser) + what Cloudflare knows about this request
function visitOf(request, v){
  v = v && typeof v === "object" ? v : {}; const cf = request.cf || {}, ua = request.headers.get("user-agent") || "", c = (x, m) => String(x ?? "").slice(0, m);
  return { source: c(v.source, 60), ref: c(v.ref, 200), landing: c(v.landing, 120), utm: c(v.utm, 120), first: c(v.first, 30), visits: Math.min(9999, parseInt(v.visits) || 0),
    country: c(cf.country, 4), city: c(cf.city, 60), device: /iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop",
    os: /iPhone|iPad|iOS/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "other" };
}
export async function onRequestPatch(ctx) {
  const { request, env } = ctx;
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const d = await request.json().catch(() => ({}));
  if (!d.key?.startsWith("order:")) return json({ ok: false }, 400);
  const v = await env.EB.get(d.key); if (!v) return json({ ok: false }, 404);
  const o = JSON.parse(v), clip = (x, m) => String(x ?? "").slice(0, m);
  let changed = false;
  if (d.status !== undefined) { if (!STATUSES.includes(d.status)) return json({ ok: false }, 400); if (d.status !== o.status) { (o.history ||= []).push({ at: new Date().toISOString(), status: d.status, by: "admin" }); changed = true; } o.status = d.status; }
  // link the request to one of this client's projects (studio only; the project must belong to the same client)
  if (d.project !== undefined) { const pid = clip(d.project, 40);
    if (!pid) { if (o.projectId) { (o.history ||= []).push({ at: new Date().toISOString(), status: o.status, by: "admin", note: "unlinked" }); delete o.projectId; delete o.projectName; } }
    else { if (!env.DB) return json({ ok: false, error: "db" }, 503);
      const p = await env.DB.prepare("SELECT id, name FROM projects WHERE id=? AND client_email=?").bind(pid, String(o.email || "").toLowerCase()).first().catch(() => null);
      if (!p) return json({ ok: false, error: "project" }, 404);
      if (o.projectId !== p.id) (o.history ||= []).push({ at: new Date().toISOString(), status: o.status, by: "admin", note: "linked", project: p.name });
      o.projectId = p.id; o.projectName = p.name; } }
  if (d.price !== undefined) o.price = clip(d.price, 40);
  if (d.method !== undefined) o.method = clip(d.method, 60);
  const inv = [];
  if (d.plan !== undefined) o.plan = d.plan === "split" ? "split" : "full";
  if (d.depositPct !== undefined) o.depositPct = Math.max(10, Math.min(90, parseInt(d.depositPct) || 50));
  if (d.depositPaid !== undefined) { const was = !!(o.deposit && o.deposit.paid);
    if (d.depositPaid && !was) { const amt = (o.payInfo && o.payInfo.stage === "deposit" && num(o.payInfo.amount)) || stageAmount(o, "deposit");
      o.deposit = { amount: amt, paid: true, at: new Date().toISOString(), invoice: await newInvoice(env, "deposit", amt) }; inv.push("deposit");
      if (["new", "confirmed", "awaiting-payment"].includes(o.status)) { (o.history ||= []).push({ at: new Date().toISOString(), status: "paid" }); o.status = "paid"; changed = true; } }
    else if (!d.depositPaid && was) o.deposit.paid = false; }
  if (d.paid !== undefined) { const was = !!o.paid; o.paid = !!d.paid;
    if (o.paid && !was && !o.invoice) { const kind = o.plan === "split" && o.deposit && o.deposit.paid ? "final" : "full", amt = num(d.paidAmount) || stageAmount(o, kind);
      o.invoice = await newInvoice(env, kind, amt); inv.push(kind === "final" ? "final" : "full");
      if (["new", "confirmed", "awaiting-payment"].includes(o.status)) { (o.history ||= []).push({ at: new Date().toISOString(), status: "paid" }); o.status = "paid"; changed = true; } } }
  if (d.paidAmount !== undefined) o.paidAmount = clip(d.paidAmount, 40);
  if (d.notes !== undefined) o.notes = clip(d.notes, 4000);
  // CRM: what happens next and when, why a deal was lost, where it came from, and a short log of each contact
  if (d.nextStep !== undefined) o.nextStep = clip(d.nextStep, 300);
  if (d.followUp !== undefined) { const f = isDate(d.followUp) ? d.followUp : ""; if (f !== o.followUp) { o.followUp = f; delete o.followSent; } }
  if (d.lostReason !== undefined) o.lostReason = clip(d.lostReason, 120);
  if (d.source !== undefined && SOURCES.includes(d.source)) o.source = d.source;
  if (d.email !== undefined && !o.email) { const em = clip(d.email, 254).trim().toLowerCase();
    if (em) { if (!EMAIL_RE.test(em)) return json({ ok: false, error: "email" }, 400); o.email = em; await linkUser(env, o); } }
  if (d.touch && (d.touch.note || d.touch.channel)) { (o.touches ||= []).unshift({ at: new Date().toISOString(), channel: SOURCES.includes(d.touch.channel) ? d.touch.channel : "other", note: clip(d.touch.note, 500) }); o.touches = o.touches.slice(0, 50); }
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
    const stage = stageOf(o), en = o.lang === "en", amount = clip(d.payAmount || fmt(stageAmount(o, stage), curOf(o)), 40);
    o.payInfo = { method: o.method, methodName: m.name, details, amount, at: now, stage };
    const sl = STAGE[en ? "en" : "ar"][stage];
    payMsg = (en ? "Payment details — " : "تفاصيل الدفع — ") + m.name + "\n" + sl + ": " + amount + (stage === "deposit" ? (en ? " (the rest is due before final delivery)" : " (ويُدفع الباقي قبل التسليم النهائي)") : "") + "\n\n" + details + "\n\n" + (en ? "After paying, attach the receipt here." : "بعد الدفع، أرفق صورة الإيصال هنا.");
    (o.messages ||= []).push({ from: "studio", text: payMsg, at: now, kind: "payment" }); o.seenAdmin = now;
    if (!["paid", "in-progress", "review", "delivered"].includes(o.status) && o.status !== "awaiting-payment") { (o.history ||= []).push({ at: now, status: "awaiting-payment" }); o.status = "awaiting-payment"; }
  }
  if (hiddenFromClient(o) && !["new", "discussing", "cancelled"].includes(o.status)) { o.clientVisible = true; await linkUser(env, o); }
  if (d.link) await linkUser(env, o);   // the account was made after the order (e.g. «convert to client»)
  const quiet = hiddenFromClient(o);
  o.updatedAt = new Date().toISOString();
  await env.EB.put(d.key, JSON.stringify(o));
  for (const k of inv) later(ctx, mailInvoice(env, o, k));
  if (d.resendInvoice) later(ctx, mailInvoice(env, o, d.resendInvoice === "deposit" ? "deposit" : "final"));
  if (quiet) { /* still hidden from the client: nothing is sent */ }
  else if (payMsg) later(ctx, notifyClient(env, o, "message", payMsg));
  else if (d.message || files.length) later(ctx, notifyClient(env, o, "message", (d.message || "") + (files.length ? "\n📎 " + files.map(f => f.name).join("، ") : "")));
  else if (changed && !inv.length && o.status !== "discussing") later(ctx, notifyClient(env, o, "status", o.status));
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
const ST_AR = {"new":"استلمنا الطلب","discussing":"نناقش التفاصيل","confirmed":"تأكيد التفاصيل","awaiting-payment":"بانتظار الدفع","paid":"تم الدفع","in-progress":"قيد التنفيذ","review":"بانتظار مراجعتك","delivered":"تم التسليم","cancelled":"ملغى"};
const ST_EN = {"new":"Request received","discussing":"Discussing details","confirmed":"Details confirmed","awaiting-payment":"Awaiting payment","paid":"Paid","in-progress":"In production","review":"Awaiting your review","delivered":"Delivered","cancelled":"Cancelled"};
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
function fmt(n, c){ const neg = n < 0, a = Math.abs(n), v = (Math.round(a * 100) / 100).toFixed(a % 1 ? 2 : 0); return (neg ? "−" : "") + (c === "$" || c === "€" || c === "£" ? c + v : v + " " + c); }
function totalOf(o){ return num(o.price) || (o.items || []).reduce((a, x) => a + num(x.unit) * (num(x.qty) || 1), 0) || num(o.total); }
// what the client pays at each step: everything at once, or a deposit and then the rest
function stageOf(o){ if (o.plan === "split") return (o.deposit && o.deposit.paid) ? "final" : "deposit"; return "full"; }
function stageAmount(o, stage){ const t = totalOf(o), pct = num(o.depositPct) || 50;
  if (stage === "deposit") return Math.round(t * pct) / 100;
  if (stage === "final") return Math.max(0, t - num((o.deposit || {}).amount)); return t; }
const STAGE = { ar:{ full:"كامل المبلغ", deposit:"العربون", final:"الدفعة النهائية" }, en:{ full:"Full amount", deposit:"Deposit", final:"Final payment" } };

// ---- the invoice: a quiet, precise document (white, small type, thin rules) — one design for e-mail, the account page and PDF ----
const INV_T = {
  en:{ title:"Invoice", no:"Invoice no.", date:"Date issued", order:"Order", status:"Status", from:"From", to:"Billed to", desc:"Description", qty:"Qty", unit:"Unit price", amount:"Amount",
       sub:"Subtotal", dep:"Deposit paid", paid:"Amount paid", bal:"Balance due", method:"Payment method", paidOn:"Paid on", st:{ full:"Paid", final:"Paid in full", deposit:"Deposit paid" },
       adj:"Adjustment (agreed on the brief)", disc:"Discount", note:{ deposit:"The balance is due before final delivery.", other:"Thank you for working with Eyeblink Studio." }, svc:"Video editing · Motion graphics · Film" },
  ar:{ title:"فاتورة", no:"رقم الفاتورة", date:"تاريخ الإصدار", order:"رقم الطلب", status:"الحالة", from:"من", to:"إلى", desc:"البيان", qty:"الكمية", unit:"سعر الوحدة", amount:"المبلغ",
       sub:"المجموع", dep:"العربون المدفوع", paid:"المبلغ المدفوع", bal:"المتبقي", method:"طريقة الدفع", paidOn:"تاريخ الدفع", st:{ full:"مدفوعة", final:"مدفوعة بالكامل", deposit:"عربون مدفوع" },
       adj:"تعديل وفق المتطلبات المتفق عليها", disc:"خصم", note:{ deposit:"المبلغ المتبقي يُدفع قبل التسليم النهائي.", other:"شكراً لتعاملك مع Eyeblink Studio." }, svc:"مونتاج · موشن غرافيك · أفلام" } };
function invoiceHTML(o, inv, opt){
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
function invoicePage(o, inv, opt){
  return `<!doctype html><html lang="${o.lang === "en" ? "en" : "ar"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(inv.no)} · Eyeblink Studio</title>
<style>@page{size:A5;margin:9mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{margin:0;background:transparent}body{padding:0}
@media print{html,body{background:#fff}table{max-width:none!important;border:0!important}}img{image-rendering:auto}</style></head>
<body>${invoiceHTML(o, inv, opt).replace(SITE + "/assets/img/", "/assets/img/")}</body></html>`;
}

// ---- client e-mails: the request summary; an invoice for every payment ----
function rows(list, rtl){ return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 4px">${list.filter(r=>r&&r[1]!==""&&r[1]!=null).map(([k,v,strong])=>`<tr><td style="padding:10px 0;border-bottom:1px solid #1d2758;color:#8E9BB8;font-size:13px;width:38%;vertical-align:top">${h(k)}</td><td style="padding:10px 0;border-bottom:1px solid #1d2758;color:${strong?"#fff":"#DCE3F0"};font-size:${strong?"17px":"14px"};font-weight:${strong?"bold":"normal"};text-align:${rtl?"right":"left"}">${v}</td></tr>`).join("")}</table>`; }
function steps(list){ return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 0">${list.map((s,i)=>`<tr><td style="vertical-align:top;padding:0 0 12px;width:26px"><div style="width:24px;height:24px;line-height:24px;border-radius:12px;background:#3FE0E8;color:#04061A;text-align:center;font:bold 12px/24px Arial">${i+1}</div></td><td style="padding:2px 12px 12px;color:#C3CEE2;font-size:14px;line-height:1.7">${h(s)}</td></tr>`).join("")}</table>`; }
async function mailReceived(env, o){
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
async function mailInvoice(env, o, kind){
  const inv = kind === "deposit" ? (o.deposit || {}).invoice : o.invoice;
  if (!o.email || !inv) return;
  const en = o.lang === "en", link = SITE + (en ? "/en" : "") + "/account.html#" + o.code, s = await siteSettings(env), c = curOf(o);
  const T = en ? { deposit:"Deposit received ✓", final:"Final payment received ✓", full:"Payment received ✓",
                   depositP:"Your deposit is confirmed and production starts now. The remaining "+fmt(Math.max(0,totalOf(o)-num(inv.amount)),c)+" is due before final delivery. Your invoice is below.",
                   finalP:"Your request is now fully paid. Thank you! Your invoice is below.", fullP:"Your payment is confirmed and production starts now. You can follow every stage from your account. Your invoice is below.", cta:"View my request" }
               : { deposit:"وصل العربون ✓", final:"وصلت الدفعة النهائية ✓", full:"وصلت دفعتك ✓",
                   depositP:"تأكّد وصول العربون وبدأنا التنفيذ. يُدفع المتبقي "+fmt(Math.max(0,totalOf(o)-num(inv.amount)),c)+" قبل التسليم النهائي. تجد الفاتورة أدناه.",
                   finalP:"أصبح طلبك مدفوعاً بالكامل، شكراً لك! تجد الفاتورة أدناه.", fullP:"تأكّد وصول دفعتك وبدأنا التنفيذ، ويمكنك متابعة كل مرحلة من حسابك. تجد الفاتورة أدناه.", cta:"عرض طلبي" };
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
function later(ctx, p){ if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(p); else return p; }
