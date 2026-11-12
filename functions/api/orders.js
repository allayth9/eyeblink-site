import { same, isAdmin, json, randHex, currentUser, unreadFor, cleanFiles, mail, notifyStudio, notifyClient, num, curOf, fmt, stageOf, stageAmount, STAGE, mailReceived, mailInvoice, newInvoice, sweepReminders, later } from "../_lib/shared.js";
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
    cur: clip(d.cur, 6), ccy: clip(d.ccy, 6), visit: visitOf(request, d.visit),
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
