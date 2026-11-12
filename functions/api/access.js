import { isAdmin, json, randHex, currentUser, pbkdf2, limited, SITE, h, sendMail, greet, mail, notifyStudio, later } from "../_lib/shared.js";
// Client roles — one account system, two kinds of customer:
//   "customer" (default): buys services, follows their requests, invoices and deliveries.
//   "client"  (Active Client): also gets the studio workspace. Only the studio can grant it — by invitation, by accepting a request, or by upgrading.
// GET  /api/access                — signed in: { role, request }            (?invite=TOKEN, public: what the invitation is for)
// POST /api/access                — signed in: { action:"request", note, company, lang } | { action:"accept", token }
//                                    admin:     { action:"invite", email, name, lang, note } | { action:"revoke", token }
//                                               { action:"approve"|"reject", email, reason } | { action:"setRole", email, role }
//                                               { action:"createAccount", email, name, lang, mail } — the studio prepares a ready Active Client account (temporary password, changed at first sign-in)
//                                               { action:"tempPassword", email, mail } — a new temporary password for an existing account
// GET  /api/access?admin=1        — admin: pending requests + open invitations
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const INVITE_DAYS = 14;
function roleOf(u){ return u && u.role === "client" ? "client" : "customer"; }
function logAct(u, by, what){ (u.log ||= []).unshift({ at: new Date().toISOString(), by, what }); u.log = u.log.slice(0, 60); }
async function getUser(env, email){ const v = await env.EB.get("user:" + String(email || "").toLowerCase()); return v ? JSON.parse(v) : null; }
async function putUser(env, u){ await env.EB.put("user:" + u.email, JSON.stringify(u)); }
// a temporary password that is easy to read and type: no 0/O, 1/l/I
function tempPw(){ const A = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = crypto.getRandomValues(new Uint8Array(12)); let s = ""; for (let i = 0; i < 12; i++) { s += A[b[i] % A.length]; if (i === 3 || i === 7) s += "-"; } return s; }
function acctLink(lang, extra){ return SITE + (lang === "en" ? "/en" : "") + "/account" + (extra || ""); }

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  if (q.get("invite")) {
    const t = q.get("invite"); if (!/^[a-f0-9]{48}$/.test(t)) return json({ ok: true, valid: false });
    const v = await env.EB.get("invite:" + t); if (!v) return json({ ok: true, valid: false });
    const inv = JSON.parse(v);
    return json({ ok: true, valid: !inv.usedAt, used: !!inv.usedAt, email: inv.email, name: inv.name || "", lang: inv.lang || "ar" });
  }
  if (q.get("admin")) {
    if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
    const requests = [], invites = []; let cursor;
    do { const r = await env.EB.list({ prefix: "accreq:", cursor }); for (const k of r.keys) { const v = await env.EB.get(k.name); if (v) requests.push(JSON.parse(v)); } cursor = r.list_complete ? null : r.cursor; } while (cursor);
    do { const r = await env.EB.list({ prefix: "invite:", cursor }); for (const k of r.keys) { const v = await env.EB.get(k.name); if (v) { const i = JSON.parse(v); if (!i.usedAt) invites.push({ ...i, token: k.name.slice(7) }); } } cursor = r.list_complete ? null : r.cursor; } while (cursor);
    requests.sort((a, b) => (a.at < b.at ? 1 : -1)); invites.sort((a, b) => (a.at < b.at ? 1 : -1));
    return json({ ok: true, requests, invites });
  }
  const u = await currentUser(request, env); if (!u) return json({ ok: false }, 401);
  const r = await env.EB.get("accreq:" + u.email);
  return json({ ok: true, role: roleOf(u), clientSince: u.clientSince || null, request: r ? JSON.parse(r) : null });
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const d = await request.json().catch(() => ({}));
  const clip = (v, m) => String(v ?? "").trim().slice(0, m);
  const ADMIN = ["invite", "revoke", "approve", "reject", "setRole", "createAccount", "tempPassword"];
  if (ADMIN.includes(d.action)) {
    if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
    return adminAction(ctx, d, clip);
  }
  const u = await currentUser(request, env); if (!u) return json({ ok: false, error: "login" }, 401);

  if (d.action === "request") {
    if (roleOf(u) === "client") return json({ ok: false, error: "already" }, 409);
    const prev = await env.EB.get("accreq:" + u.email);
    if (prev && JSON.parse(prev).status === "pending") return json({ ok: true, request: JSON.parse(prev) });
    if (await limited(env, "aqrl:" + u.email, 3, 86400)) return json({ ok: false, error: "too many attempts" }, 429);
    const req = { email: u.email, name: u.name, company: clip(d.company, 120), note: clip(d.note, 1500), lang: d.lang === "en" ? "en" : "ar", status: "pending", at: new Date().toISOString() };
    await env.EB.put("accreq:" + u.email, JSON.stringify(req));
    u.lang = req.lang; logAct(u, "client", "requested workspace access"); await putUser(env, u);
    later(ctx, notifyStudio(env, "طلب وصول لمساحة العمل — " + u.name, u.name + " · " + u.email + (req.company ? " · " + req.company : "") + "\n\n" + (req.note || "—") + "\n\nيمكنك قبوله أو رفضه من لوحة التحكم ← العملاء."));
    return json({ ok: true, request: req });
  }

  if (d.action === "accept") {
    const t = String(d.token || ""); if (!/^[a-f0-9]{48}$/.test(t)) return json({ ok: false, error: "invite" }, 400);
    const v = await env.EB.get("invite:" + t); if (!v) return json({ ok: false, error: "invite" }, 404);
    const inv = JSON.parse(v);
    if (inv.usedAt) return json({ ok: false, error: "used" }, 410);
    if (inv.email !== u.email) return json({ ok: false, error: "other email", email: inv.email }, 403);
    inv.usedAt = new Date().toISOString(); await env.EB.put("invite:" + t, JSON.stringify(inv), { expirationTtl: 30 * 86400 });
    const already = roleOf(u) === "client";
    u.role = "client"; u.clientSince ||= inv.usedAt; u.clientVia ||= "invite"; u.verified = true; logAct(u, "client", "accepted the invitation");
    await putUser(env, u); await env.EB.delete("accreq:" + u.email);
    if (!already) later(ctx, notifyStudio(env, "✅ " + u.name + " فعّل مساحة العمل", u.email + " قبِل الدعوة وأصبح عميلاً متعاقداً."));
    return json({ ok: true, role: "client" });
  }
  return json({ ok: false }, 400);
}

async function adminAction(ctx, d, clip){
  const { env } = ctx;
  if (d.action === "invite") {
    const email = clip(d.email, 254).toLowerCase(); if (!EMAIL.test(email)) return json({ ok: false, error: "email" }, 400);
    const ex = await getUser(env, email); if (ex && roleOf(ex) === "client") return json({ ok: false, error: "already" }, 409);
    const lang = d.lang === "en" ? "en" : "ar", token = randHex(24), now = new Date().toISOString();
    const inv = { email, name: clip(d.name, 80), lang, note: clip(d.note, 800), at: now, expires: new Date(Date.now() + INVITE_DAYS * 86400e3).toISOString() };
    await env.EB.put("invite:" + token, JSON.stringify(inv), { expirationTtl: INVITE_DAYS * 86400 });
    const link = acctLink(lang, "?invite=" + token), en = lang === "en";
    const first = (inv.name || "").split(/\s+/)[0];
    const body = (en ? `You have been invited to the <b style="color:#fff">Eyeblink Studio client workspace</b> — one place to send your tasks, follow the work, review every version and talk to the studio.`
                     : `يدعوك Eyeblink Studio إلى <b style="color:#fff">مساحة العمل الخاصة بالعملاء</b> — مكان واحد ترسل منه مهامك، وتتابع التنفيذ، وتراجع كل نسخة، وتتواصل مع الاستوديو.`) +
      (inv.note ? `<p style="margin:16px 0 0;padding:12px 14px;border-radius:12px;background:#121a48;color:#DCE3F0">${h(inv.note).replace(/\n/g, "<br>")}</p>` : "") +
      `<p style="margin:16px 0 0;font-size:13px;color:#8E9BB8">${en ? "Sign in or create your account with <b style=\"color:#fff\">" + h(email) + "</b>. The link works once and expires in " + INVITE_DAYS + " days."
                                                                  : "سجّل دخولك أو أنشئ حسابك بالبريد <b style=\"color:#fff\">" + h(email) + "</b>. الرابط يعمل مرة واحدة وينتهي خلال " + INVITE_DAYS + " يوماً."}</p>`;
    const sent = await sendMail(env, email, en ? "Your invitation to the Eyeblink client workspace" : "دعوتك إلى مساحة عمل Eyeblink",
      mail(lang, en ? "Your client workspace is ready" : "مساحة العمل الخاصة بك جاهزة", body, en ? "Accept the invitation" : "اقبل الدعوة", link, en ? "Hi" + (first ? " " + first : "") + "," : "أهلاً" + (first ? " " + first : "") + "،"));
    if (ex) { logAct(ex, "admin", "invited to the workspace"); await putUser(env, ex); }
    return json({ ok: true, token, link, sent });
  }
  // ready accounts: the studio prepares everything, then sends the client the link + a temporary password (shown once, stored only as a hash)
  if (d.action === "createAccount" || d.action === "tempPassword") {
    const email = clip(d.email, 254).toLowerCase(); if (!EMAIL.test(email)) return json({ ok: false, error: "email" }, 400);
    const ex = await getUser(env, email), now = new Date().toISOString(), pw = tempPw();
    let u;
    if (d.action === "createAccount") {
      if (ex) return json({ ok: false, error: "exists", role: roleOf(ex) }, 409);
      const name = clip(d.name, 80); if (!name) return json({ ok: false, error: "name" }, 400);
      u = { email, name, provider: "password", createdAt: now, orders: [], lang: d.lang === "en" ? "en" : "ar", role: "client", clientSince: now, clientVia: "admin" };
      logAct(u, "admin", "account prepared by the studio");
    } else { if (!ex) return json({ ok: false, error: "no account" }, 404); u = ex; logAct(u, "admin", "temporary password issued"); }
    u.salt = randHex(16); u.hash = await pbkdf2(pw, u.salt); u.mustChange = true; u.provider ||= "password"; u.sv = (u.sv || 0) + 1;   // older sessions end
    await putUser(env, u);
    const lang = u.lang === "en" ? "en" : "ar", en = lang === "en", link = SITE + (en ? "/en" : "") + "/workspace";
    let sent = false;
    if (d.mail) {
      const body = (en ? `Your <b style="color:#fff">Eyeblink Studio workspace</b> is ready. Sign in with the details below; you will choose your own password the first time.`
                       : `جهّزنا لك <b style="color:#fff">مساحة العمل في Eyeblink Studio</b>. سجّل دخولك بالبيانات التالية، وستختار كلمة سر خاصة بك عند أول دخول.`) +
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 0;border-collapse:collapse"><tr><td style="padding:6px 0;color:#8E9BB8">${en ? "E-mail" : "البريد"}</td><td style="padding:6px 14px;color:#fff;direction:ltr">${h(email)}</td></tr>` +
        `<tr><td style="padding:6px 0;color:#8E9BB8">${en ? "Temporary password" : "كلمة السر المؤقتة"}</td><td style="padding:6px 14px;color:#3FE0E8;font:bold 16px monospace;direction:ltr">${h(pw)}</td></tr></table>`;
      const r = await sendMail(env, email, en ? "Your Eyeblink workspace is ready" : "مساحة العمل الخاصة بك جاهزة", mail(lang, en ? "Welcome to your workspace" : "أهلاً بك في مساحة العمل", body, en ? "Open my workspace" : "افتح مساحة العمل", link, greet({ name: u.name, lang })));
      sent = !!(r && (r.ok || r === true));
    }
    return json({ ok: true, email, name: u.name, lang, password: pw, link, sent, role: "client" });
  }
  if (d.action === "revoke") {
    const t = String(d.token || ""); if (!/^[a-f0-9]{48}$/.test(t)) return json({ ok: false }, 400);
    await env.EB.delete("invite:" + t); return json({ ok: true });
  }
  const email = clip(d.email, 254).toLowerCase(), u = await getUser(env, email);
  if (!u) return json({ ok: false, error: "no account" }, 404);
  const lang = u.lang === "en" ? "en" : "ar", en = lang === "en", now = new Date().toISOString();
  const grant = async (via, what) => {
    const was = roleOf(u) === "client";
    u.role = "client"; u.clientSince ||= now; u.clientVia ||= via; logAct(u, "admin", what); await putUser(env, u); await env.EB.delete("accreq:" + email);
    if (!was) later(ctx, sendMail(env, u.email, en ? "Your Eyeblink workspace is active" : "فُعّلت مساحة العمل الخاصة بك",
      mail(lang, en ? "Welcome to your client workspace" : "أهلاً بك في مساحة العمل",
        en ? "Your account is now an <b style=\"color:#fff\">Active Client</b> account. Your requests, invoices and history stay exactly as they were; the workspace is added on top of them."
           : "أصبح حسابك حساب <b style=\"color:#fff\">عميل متعاقد</b>. بقيت طلباتك وفواتيرك وسجلك كما هي، وأُضيفت إليها مساحة العمل.",
        en ? "Open my workspace" : "افتح مساحة العمل", SITE + (lang === "en" ? "/en" : "") + "/workspace", greet({ name: u.name, lang }))));
  };
  if (d.action === "approve") {
    const r = await env.EB.get("accreq:" + email); if (!r) return json({ ok: false, error: "no request" }, 404);
    await grant("request", "access request approved"); return json({ ok: true, role: "client" });
  }
  if (d.action === "reject") {
    const r = await env.EB.get("accreq:" + email); if (!r) return json({ ok: false, error: "no request" }, 404);
    const req = JSON.parse(r); req.status = "rejected"; req.reason = clip(d.reason, 600); req.decidedAt = now;
    await env.EB.put("accreq:" + email, JSON.stringify(req), { expirationTtl: 30 * 86400 });
    logAct(u, "admin", "access request declined"); await putUser(env, u);
    later(ctx, sendMail(env, u.email, en ? "About your workspace request" : "بخصوص طلب مساحة العمل",
      mail(lang, en ? "We could not open the workspace yet" : "تعذّر تفعيل مساحة العمل حالياً",
        (en ? "Thank you for your request. The workspace is for clients with an ongoing agreement with the studio." : "شكراً لطلبك. مساحة العمل مخصّصة للعملاء الذين يجمعهم اتفاق مستمر مع الاستوديو.") +
        (req.reason ? `<p style="margin:14px 0 0;color:#DCE3F0">${h(req.reason)}</p>` : "") +
        `<p style="margin:14px 0 0">${en ? "You can still order any service and follow it from your account." : "ولا يزال بإمكانك طلب أي خدمة ومتابعتها من حسابك كالمعتاد."}</p>`,
        en ? "Open my account" : "افتح حسابي", acctLink(lang), greet({ name: u.name, lang }))));
    return json({ ok: true });
  }
  if (d.action === "setRole") {
    if (d.role === "client") { await grant("upgrade", "upgraded to Active Client"); return json({ ok: true, role: "client" }); }
    if (d.role === "customer") { u.role = "customer"; logAct(u, "admin", "workspace access removed"); await putUser(env, u); return json({ ok: true, role: "customer" }); }
    return json({ ok: false }, 400);
  }
  return json({ ok: false }, 400);
}
