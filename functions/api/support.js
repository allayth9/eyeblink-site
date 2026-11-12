import { isAdmin, json, randHex, currentUser, limited, SITE, h, sendMail, telegram, greet, mail, later } from "../_lib/shared.js";
// Support chat: the «هل يوجد مشكلة؟» window on the site, and the «الدعم» inbox in the admin.
// A visitor opens a ticket (KV "sup:<id>"); a short automatic reply answers at once; the studio replies from the admin
// (the reply also goes by e-mail). The visitor reads the thread with the ticket's private token, kept in their browser.
// public  POST /api/support { action:"open", name, email, text, page, lang } → { id, token, messages }
//         POST /api/support { action:"send", id, token, text }               GET /api/support?id=&token= → the thread
// admin   GET  /api/support?admin=1 → tickets          POST /api/support { action:"reply"|"close"|"reopen"|"seen", id, text? }
const MAIL_RE2 = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const T_ = (v, m) => String(v ?? "").trim().slice(0, m);
// the automatic first answer: an acknowledgement, plus the right link when the message names a common problem
function autoReply(text, lang, id){
  const en = lang === "en", p = en ? "/en" : "", t = String(text).toLowerCase(), tips = [];
  const has = (...w) => w.some(x => t.includes(x));
  if (has("كلمة السر", "كلمة المرور", "password", "تسجيل الدخول", "login", "sign in")) tips.push(en ? "Password trouble: use «Forgot password» on " + SITE + p + "/account" : "لمشكلة كلمة السر: استخدم «نسيت كلمة السر» في " + SITE + p + "/account");
  if (has("فاتورة", "فواتير", "invoice")) tips.push(en ? "Your invoices are in your workspace: " + SITE + p + "/workspace" : "فواتيرك موجودة في مساحة العمل: " + SITE + p + "/workspace");
  if (has("دفع", "تحويل", "باينانس", "binance", "pay", "usdt", "western")) tips.push(en ? "Payment details are sent inside your request page, with a place to attach the receipt" : "تفاصيل الدفع تصلك داخل صفحة طلبك، ومعها مكان لإرفاق الإيصال");
  if (has("ملف", "رفع", "file", "upload")) tips.push(en ? "Files up to 20 MB attach in the chat of your request; larger ones by a Drive or WeTransfer link" : "الملفات حتى 20MB تُرفق في محادثة طلبك، والأكبر برابط Drive أو WeTransfer");
  return (en ? "Thanks, your message reached the studio (ticket " + id + "). We reply here and by email, usually within a few hours."
             : "شكراً، وصلت رسالتك إلى الاستوديو (تذكرة " + id + "). نرد عليك هنا وعلى بريدك، عادةً خلال ساعات.") + (tips.length ? "\n\n" + tips.join("\n") : "");
}
const view = s => ({ id: s.id, status: s.status, lang: s.lang, messages: s.messages.map(m => ({ from: m.from, text: m.text, at: m.at })) });
async function load(env, id){ const v = await env.EB.get("sup:" + T_(id, 20)); return v ? JSON.parse(v) : null; }
async function save(env, s){ s.updatedAt = new Date().toISOString(); await env.EB.put("sup:" + s.id, JSON.stringify(s)); }

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  if (q.get("admin")) {
    if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
    const out = []; let cursor;
    do { const r = await env.EB.list({ prefix: "sup:", cursor }); for (const k of r.keys) { const v = await env.EB.get(k.name); if (v) { const s = JSON.parse(v); delete s.token; out.push(s); } } cursor = r.list_complete ? null : r.cursor; } while (cursor);
    return json({ ok: true, tickets: out.sort((a, b) => (a.updatedAt || a.at) < (b.updatedAt || b.at) ? 1 : -1) });
  }
  const s = await load(env, q.get("id")); if (!s || s.token !== q.get("token")) return json({ ok: false }, 404);
  return json({ ok: true, ticket: view(s) });
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx, d = await request.json().catch(() => ({})), now = new Date().toISOString();
  const ip = request.headers.get("cf-connecting-ip") || "x";
  if (d.action === "open") {
    if (d.website) return json({ ok: true });                                   // honeypot
    if (await limited(env, "supo:" + ip, 5, 3600)) return json({ ok: false, error: "slow" }, 429);
    const u = await currentUser(request, env), text = T_(d.text, 3000), lang = d.lang === "en" ? "en" : "ar";
    const email = u ? u.email : T_(d.email, 254).toLowerCase(), name = u ? T_(u.name, 120) || email.split("@")[0] : T_(d.name, 120) || email.split("@")[0];
    if (!MAIL_RE2.test(email) || text.length < 2) return json({ ok: false, error: "fields" }, 400);
    let id; do { id = "S-" + randHex(3).toUpperCase().slice(0, 5); } while (await env.EB.get("sup:" + id));
    const s = { id, token: randHex(16), name, email, acct: u ? 1 : 0, src: !u && d.src === "team" ? "team" : "", lang, page: T_(d.page, 300), ua: T_(request.headers.get("user-agent"), 200), status: "open", unread: 1, at: now,
      messages: [{ from: "client", text, at: now }, { from: "bot", text: autoReply(text, lang, id), at: now }] };
    await save(env, s);
    later(ctx, telegram(env, "🛟 تذكرة دعم جديدة " + id + " — " + name + "\n" + text.slice(0, 300) + "\n" + SITE + "/admin/#support"));
    return json({ ok: true, id, token: s.token, ticket: view(s) });
  }
  if (d.action === "send") {
    if (await limited(env, "sups:" + ip, 30, 3600)) return json({ ok: false, error: "slow" }, 429);
    const s = await load(env, d.id); if (!s || s.token !== d.token) return json({ ok: false }, 404);
    const text = T_(d.text, 3000); if (!text) return json({ ok: false }, 400);
    s.messages.push({ from: "client", text, at: now }); s.unread = (s.unread || 0) + 1; if (s.status === "closed") s.status = "open";
    await save(env, s);
    later(ctx, telegram(env, "🛟 " + s.id + " · " + s.name + ": " + text.slice(0, 300)));
    return json({ ok: true, ticket: view(s) });
  }
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const s = await load(env, d.id); if (!s) return json({ ok: false }, 404);
  if (d.action === "reply") {
    const text = T_(d.text, 4000); if (!text) return json({ ok: false }, 400);
    s.messages.push({ from: "studio", text, at: now, by: T_(d.by, 80) || "studio" }); s.unread = 0; s.status = "answered";
    await save(env, s);
    const en = s.lang === "en", link = SITE + (en ? "/en/" : "/") + "?support=" + s.id + "." + s.token;
    later(ctx, sendMail(env, s.email, (en ? "Reply to your support ticket " : "رد على تذكرة الدعم ") + s.id,
      mail(en ? "en" : "ar", en ? "The studio replied" : "وصلك رد من الاستوديو", `<p style="margin:0;white-space:pre-wrap">${h(text)}</p>`, en ? "Open the conversation" : "افتح المحادثة", link, greet(s))));
  } else if (d.action === "close") s.status = "closed";
  else if (d.action === "reopen") s.status = "open";
  else if (d.action === "seen") s.unread = 0;
  else return json({ ok: false }, 400);
  if (d.action !== "reply") await save(env, s);
  const out = { ...s }; delete out.token; return json({ ok: true, ticket: out });
}
