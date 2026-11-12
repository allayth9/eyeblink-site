import { same, json, currentUser, limited, unreadFor, cleanFiles, siteSettings, notifyStudio, notifyClient, invoicePage, later } from "../_lib/shared.js";
// GET  /api/thread?code=EB-XXXXX[&invoice=deposit|final] — the signed-in client's order: progress + messages (marks studio messages as read)
// POST /api/thread — { code, text, files? }: the client writes to the studio (closed once delivered or cancelled)
//                    { code, review: { stars, text, publish } }: rating after delivery
async function load(request, env, code){
  const u = await currentUser(request, env); if (!u) return [null, json({ ok: false }, 401)];
  const key = await env.EB.get("code:" + String(code || "").toUpperCase());
  const v = key && await env.EB.get(key); if (!v) return [null, json({ ok: false }, 404)];
  const o = JSON.parse(v); if (o.email !== u.email || (o.manual && !o.clientVisible)) return [null, json({ ok: false }, 404)];
  return [o, null];
}
export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const [o, err] = await load(request, env, q.get("code")); if (err) return err;
  // ?invoice=deposit|final → the invoice as a printable page
  if (q.get("invoice")) { const inv = q.get("invoice") === "deposit" ? (o.deposit || {}).invoice : o.invoice; if (!inv) return json({ ok: false }, 404);
    const s = await siteSettings(env); return new Response(invoicePage(o, inv, { email: s.email }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }); }
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
    later(ctx, notifyStudio(env, "تقييم جديد ★".repeat(1)+stars+" — "+o.code, o.name+": "+(o.review.text||"—")+(o.review.publish?"\n(وافق على النشر — يمكنك إظهاره من لوحة التحكم)":"")));
    return json({ ok: true, order: publicOrder(o) });
  }
  if (d.cancel) {
    if (!canCancel(o)) return json({ ok: false, error: "locked" }, 409);
    const reason = String(d.reason || "").trim().slice(0, 600);
    o.status = "cancelled"; (o.history ||= []).push({ at, status: "cancelled", by: "client", ...(reason ? { note: reason } : {}) }); o.updatedAt = at;
    await env.EB.put(o.key, JSON.stringify(o));
    later(ctx, Promise.all([ notifyStudio(env, "❌ ألغى العميل طلبه " + o.code + " — " + o.name, (o.packageName || "") + (reason ? "\nالسبب: " + reason : "")), notifyClient(env, o, "status", "cancelled") ]));
    return json({ ok: true, order: publicOrder(o) });
  }
  if (d.edit) {
    if (!canEdit(o)) return json({ ok: false, error: "locked" }, 409);
    const e = d.edit || {}, c = (v, m) => String(v ?? "").trim().slice(0, m), details = c(e.details, 4000);
    if (!details) return json({ ok: false, error: "missing fields" }, 400);
    const link = c(e.link, 500), deadline = c(e.deadline, 20), contact = c(e.contact, 200);
    if (link && !/^https?:\/\/\S+$/i.test(link)) return json({ ok: false, error: "link" }, 400);
    if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return json({ ok: false, error: "date" }, 400);
    const changed = [["details", details], ["link", link], ["deadline", deadline], ["contact", contact]].filter(([k, v]) => (o[k] || "") !== v).map(([k]) => k);
    if (!changed.length) return json({ ok: true, order: publicOrder(o), same: true });
    o.details = details; o.link = link; o.deadline = deadline; o.contact = contact; o.editedAt = at; o.updatedAt = at;
    (o.history ||= []).push({ at, status: o.status, by: "client", note: "edited", fields: changed });
    await env.EB.put(o.key, JSON.stringify(o));
    const en = o.lang === "en";
    later(ctx, Promise.all([ notifyStudio(env, "✏️ عدّل العميل طلبه " + o.code + " — " + o.name, "الحقول: " + changed.join("، ") + "\n\n" + details.slice(0, 600)),
      notifyClient(env, o, "message", en ? "We saved the changes to your request. The studio will review them and get back to you." : "حُفظت التعديلات على طلبك، وسيراجعها الاستوديو ويعود إليك.") ]));
    return json({ ok: true, order: publicOrder(o) });
  }
  if (o.status === "delivered" || o.status === "cancelled") return json({ ok: false, error: "closed" }, 403);
  const text = String(d.text || "").trim().slice(0, 3000), files = cleanFiles(d.files);
  if (!text && !files.length) return json({ ok: false }, 400);
  if (await limited(env, "mrl:" + o.email, 40, 600)) return json({ ok: false, error: "too many messages" }, 429);
  const receipt = !!d.receipt && files.length > 0;
  (o.messages ||= []).push({ from: "client", text, at, ...(files.length ? { files } : {}), ...(receipt ? { kind: "receipt" } : {}) }); if (o.messages.length > 600) o.messages = o.messages.slice(-600);
  o.seenClient = at; o.updatedAt = at;
  await env.EB.put(o.key, JSON.stringify(o));
  later(ctx, notifyStudio(env, (receipt ? "🧾 إيصال دفع من " : "رسالة من ")+o.name+" — "+o.code, text + (files.length ? "\n📎 " + files.map(f => f.name).join("، ") : "")));
  return json({ ok: true, order: publicOrder(o) });
}
// the client may change a request while the studio is still confirming it, and withdraw it until anything is paid or work starts
function canEdit(o){ return ["new","confirmed"].includes(o.status) && !o.paid && !(o.deposit && o.deposit.paid); }
function canCancel(o){ return ["new","confirmed","awaiting-payment"].includes(o.status) && !o.paid && !(o.deposit && o.deposit.paid); }
function publicOrder(o){ return { canEdit:canEdit(o), canCancel:canCancel(o), contact:o.contact||"", editedAt:o.editedAt||null, code:o.code, status:o.status, createdAt:o.createdAt, packageName:o.packageName, package:o.package, addons:o.addons||[], total:o.total, price:o.price,
  paid:!!o.paid, details:o.details, link:o.link, deadline:o.deadline, history:o.history||[], messages:(o.messages||[]).map(m=>({from:m.from,text:m.text,at:m.at,files:m.files||undefined,kind:m.kind||undefined})), unread:unreadFor(o,"client"),
  name:o.name, email:o.email, method:o.method, review:o.review||null, payInfo:o.payInfo||null, invoice:o.invoice||null, deposit:o.deposit||null, plan:o.plan||"full", items:o.items||[], cur:o.cur||"", qty:o.qty||1, platforms:o.platforms||[], payPref:o.payPref||"" }; }
