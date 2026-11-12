// The Eyeblink team: people who apply, are tried, sign a collaboration agreement, and then work on tasks the studio gives them.
// Kept apart from clients on purpose: own accounts (KV "member:<email>"), own sessions (cookie "eb_t"), own portal (/team/).
// A member only ever sees their own tasks and their own fee: never the client's name or contact, never what the client pays.
//
// public   GET  /api/team?open=1                         → { open, roles, intro }  (is the studio hiring?)
//          POST /api/team { action:"apply", … }          → an application (rate-limited, honeypot)
// member   POST /api/team { action:"login", email, password } | { action:"logout" } | { action:"password", current, next }
//          GET  /api/team?me=1                           → profile, tasks (member view), earnings, agreement link
//          POST /api/team { action:"start"|"submit"|"comment", id, … }
// admin    GET  /api/team?admin=1                        → applications, members, tasks, settings
//          POST /api/team { action:"settings"|"app"|"appDelete"|"memberCreate"|"memberUpdate"|"memberReset"|"taskSave"|"taskReview"|"taskPaid"|"taskDelete", … }
const ROLES = ["editor", "motion", "color", "sound", "writer", "shooter", "designer", "producer", "voice", "illustrator", "social", "subtitles"];
// the application fields the studio can show as optional, require, or hide (name and e-mail are always asked)
const FIELDS = ["gender", "phone", "city", "langs", "reel", "links", "tools", "about"];
const cleanFields = x => Object.fromEntries(FIELDS.map(k => [k, ["hidden", "optional", "required"].includes((x || {})[k]) ? x[k] : "optional"]));
const ROLE_AR = { editor: "مونتير", motion: "موشن ديزاينر", color: "كولوريست", sound: "مهندس صوت", writer: "كاتب محتوى", shooter: "مصوّر", designer: "مصمم", producer: "منسّق إنتاج", voice: "معلّق صوتي", illustrator: "رسّام", social: "مدير سوشال ميديا", subtitles: "مترجم ومحرّر نصوص" };
const APP_ST = ["new", "trial", "interview", "accepted", "rejected"];
const TASK_ST = ["assigned", "progress", "qc", "changes", "approved"];
const MAIL_OK = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const URL_OK = /^https?:\/\/[^\s<>"]{3,600}$/i;
const TSESS_DAYS = 30;
const C_ = (v, m) => String(v ?? "").trim().slice(0, m);
const L_ = (a, n, m) => (Array.isArray(a) ? a : String(a || "").split("\n")).map(x => C_(x, m)).filter(Boolean).slice(0, n);

async function kvJSON(env, k){ const v = await env.EB.get(k); return v ? JSON.parse(v) : null; }
async function listJSON(env, prefix){ const out = []; let cursor;
  do { const r = await env.EB.list({ prefix, cursor }); for (const k of r.keys) { const v = await kvJSON(env, k.name); if (v) out.push(v); } cursor = r.list_complete ? null : r.cursor; } while (cursor);
  return out; }
async function settingsOf(env){ return (await kvJSON(env, "team:settings")) || { open: false, roles: ["editor", "motion"], intro: "" }; }
function tempPass(){ const A = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = crypto.getRandomValues(new Uint8Array(12)); let s = "";
  for (let i = 0; i < 12; i++) { s += A[b[i] % A.length]; if (i === 3 || i === 7) s += "-"; } return s; }
async function member(req, env){
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)eb_t=([a-f0-9]{48})(?:;|$)/); if (!m) return null;
  const email = await env.EB.get("tsess:" + m[1]); if (!email) return null;
  const u = await kvJSON(env, "member:" + email); return u && u.status === "active" ? u : null;   // paused or removed: no way in
}
// what a member may see of a task: no client, no order, no studio price — only the brief, the dates, their own fee and the conversation
function memberTask(t){ return { id: t.id, title: t.title, alias: t.alias, brief: t.brief, links: t.links || [], due: t.due, fee: t.fee, cur: t.cur,
  status: t.status, versions: t.versions || [], comments: (t.comments || []).map(c => ({ from: c.from === "studio" ? "studio" : "me", text: c.text, at: c.at })),
  paid: !!(t.payout && t.payout.paid), paidAt: t.payout && t.payout.at || null, createdAt: t.createdAt, updatedAt: t.updatedAt }; }
function publicMember(u){ return { email: u.email, name: u.name, role: u.role, roleAr: ROLE_AR[u.role] || u.role, status: u.status, lang: u.lang || "ar", mustChange: !!u.mustChange,
  contract: u.contract ? { no: u.contract.no, signedAt: u.contract.signedAt || null, url: u.contract.token ? SITE + "/team-agreement/" + u.contract.token : null } : null }; }
async function sessionCookie(env, email){ const t = randHex(24); await env.EB.put("tsess:" + t, email, { expirationTtl: TSESS_DAYS * 86400 });
  return "eb_t=" + t + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + TSESS_DAYS * 86400; }

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  if (q.get("open")) { const s = await settingsOf(env); return json({ ok: true, open: !!s.open, roles: s.open ? s.roles.filter(r => ROLES.includes(r)) : [], intro: s.open ? s.intro || "" : "", fields: cleanFields(s.fields) }); }
  if (q.get("me")) {
    const u = await member(request, env); if (!u) return json({ ok: false }, 401);
    // shortcut: reads every task to find this member’s (one KV read each), fine up to a few hundred tasks; past that keep task ids on the member record
    const tasks = (await listJSON(env, "ttask:")).filter(t => t.member === u.email).sort((a, b) => (a.due || "9") < (b.due || "9") ? -1 : 1);
    const earned = tasks.filter(t => t.status === "approved"), sum = (l) => l.reduce((a, t) => a + num(t.fee), 0);
    return json({ ok: true, me: publicMember(u), tasks: tasks.map(memberTask),
      earnings: { approved: sum(earned), paid: sum(earned.filter(t => t.payout && t.payout.paid)), due: sum(earned.filter(t => !(t.payout && t.payout.paid))), cur: (tasks[0] && tasks[0].cur) || "$" } });
  }
  if (q.get("admin")) {
    if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
    const [apps, members, tasks, settings] = await Promise.all([listJSON(env, "teamapp:"), listJSON(env, "member:"), listJSON(env, "ttask:"), settingsOf(env)]);
    return json({ ok: true, apps: apps.sort((a, b) => a.at < b.at ? 1 : -1), members: members.map(m => { const x = { ...m }; delete x.salt; delete x.hash; return x; }),
      tasks: tasks.sort((a, b) => a.createdAt < b.createdAt ? 1 : -1), settings });
  }
  return json({ ok: false }, 400);
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const d = await request.json().catch(() => ({}));
  const ip = request.headers.get("cf-connecting-ip") || "x";
  if (d.action === "apply") return apply(ctx, d, ip);
  if (d.action === "login") {
    if (await limited(env, "tlog:" + ip, 12, 3600)) return json({ ok: false, error: "slow" }, 429);
    const email = C_(d.email, 254).toLowerCase(), u = await kvJSON(env, "member:" + email);
    if (!u || u.status !== "active" || !u.hash || (await pbkdf2(String(d.password || ""), u.salt)) !== u.hash) return json({ ok: false, error: "wrong" }, 401);
    u.lastLogin = new Date().toISOString(); await env.EB.put("member:" + email, JSON.stringify(u));
    return json({ ok: true, me: publicMember(u) }, 200, { "set-cookie": await sessionCookie(env, email) });
  }
  if (d.action === "logout") { const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)eb_t=([a-f0-9]{48})/); if (m) await env.EB.delete("tsess:" + m[1]);
    return json({ ok: true }, 200, { "set-cookie": "eb_t=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" }); }
  if (["password", "start", "submit", "comment"].includes(d.action)) {
    const u = await member(request, env); if (!u) return json({ ok: false }, 401);
    return memberAction(ctx, u, d);
  }
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  return adminAction(ctx, d);
}

// ---- e-mails to applicants: Modern Standard Arabic, the site's own template ----
const IV_TZ = { dxb: "بتوقيت الإمارات", ruh: "بتوقيت السعودية", dam: "بتوقيت دمشق", cai: "بتوقيت القاهرة" };
const IV_PF = { meet: "Google Meet", zoom: "Zoom", whatsapp: "WhatsApp (مكالمة فيديو)" };
function ivWhen(iv){ const [d, t] = iv.at.split("T"), dt = new Date(d + "T12:00:00Z");
  const day = dt.toLocaleDateString("ar-u-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  let [hh, mm] = t.split(":").map(Number); const pm = hh >= 12; hh = hh % 12 || 12;
  return day + "، الساعة " + hh + ":" + String(mm).padStart(2, "0") + (pm ? " مساءً " : " صباحاً ") + IV_TZ[iv.tz]; }
async function appMail(env, a, kind, pw){
  const hi = "أهلاً " + (String(a.name || "").trim().split(/\s+/)[0] || "") + "،", role = ROLE_AR[a.role] || "";
  const box = rows => '<div style="margin-top:14px;padding:12px 14px;border-radius:12px;background:#0f1a4a;border:1px solid #1d2758;line-height:1.9">' + rows.map(r => '<b style="color:#ffffff">' + h(r[0]) + ':</b> ' + h(r[1])).join("<br>") + "</div>";
  let subject, title, body, cta = null, link = null;
  if (kind === "received") { subject = "تأكيد استلام طلب الانضمام · Eyeblink Studio"; title = "تم استلام طلبك بنجاح";
    body = "<p style=\"margin:0\">شكراً لاهتمامك بالانضمام إلى Eyeblink Studio" + (role ? " بدور " + h(role) : "") + ". نراجع كل طلب بعناية، ونبدأ دائماً من الأعمال قبل أي شيء آخر.</p><p style=\"margin:12px 0 0\">إن كانت هناك خطوة تالية، سنتواصل معك عبر هذا البريد.</p>"; }
  else if (kind === "interview") { const iv = a.interview; subject = "موعد المقابلة · Eyeblink Studio"; title = "يسعدنا أن نتحدث معك";
    body = "<p style=\"margin:0\">أعجبنا ما رأيناه في أعمالك، وحددنا موعداً لمقابلة قصيرة نتعرّف فيها على طريقتك في العمل.</p>" + box([["الموعد", ivWhen(iv)], ["المنصة", IV_PF[iv.platform]]].concat(iv.link && !/^https?:/i.test(iv.link) ? [["التفاصيل", iv.link]] : [])) +
      "<p style=\"margin:14px 0 0\">إن لم يناسبك الموعد، يمكنك الرد على هذه الرسالة باقتراح موعد آخر.</p>";
    if (/^https?:\/\//i.test(iv.link || "")) { cta = "رابط المقابلة"; link = iv.link; } }
  else if (kind === "reject") { subject = "بخصوص طلب انضمامك · Eyeblink Studio"; title = "شكراً لوقتك واهتمامك";
    body = "<p style=\"margin:0\">راجعنا طلبك وأعمالك بعناية. لا يتوافق ما نحتاجه في هذه المرحلة مع ما تقدّمه، وهذا لا ينتقص من قيمة عملك.</p><p style=\"margin:12px 0 0\">نحتفظ بطلبك، وسنتواصل معك إن فُتح دور أقرب إلى اختصاصك.</p>"; }
  else if (kind === "welcome") { subject = "أهلاً بك في فريق Eyeblink Studio"; title = "أصبحت من فريق Eyeblink";
    body = "<p style=\"margin:0\">يسعدنا أن نعمل معاً. جهّزنا حسابك في مساحة الفريق، وهذه خطواتك الأولى:</p>" + box([["البريد", a.email], ["كلمة السر المؤقتة", pw]]) +
      "<p style=\"margin:14px 0 0\">1. ادخل وغيّر كلمة السر.<br>2. اقرأ اتفاقية التعاون ووقّعها إلكترونياً.<br>3. تصلك المهام في المساحة نفسها، ومعها البريف والموعد وأجرك.</p>";
    cta = "افتح مساحة الفريق"; link = SITE + "/team/"; }
  else return false;
  return sendMail(env, a.email, subject, mail("ar", title, body, cta, link, hi));
}

async function apply(ctx, d, ip){
  const { env } = ctx;
  if (d.website) return json({ ok: true });                                   // honeypot: bots fill every field
  const s = await settingsOf(env); if (!s.open) return json({ ok: false, error: "closed" }, 403);
  if (await limited(env, "tapp:" + ip, 4, 3600)) return json({ ok: false, error: "slow" }, 429);
  const a = { id: "a_" + randHex(6), at: new Date().toISOString(), status: "new",
    name: C_(d.name, 120), email: C_(d.email, 254).toLowerCase(), phone: C_(d.phone, 40), role: ROLES.includes(d.role) ? d.role : "editor",
    city: C_(d.city, 120), tz: C_(d.tz, 60), links: L_(d.links, 6, 400).filter(x => URL_OK.test(x)), reel: URL_OK.test(C_(d.reel, 600)) ? C_(d.reel, 600) : "",
    tools: C_(d.tools, 300), langs: C_(d.langs, 120), about: C_(d.about, 2000), gender: ["male", "female"].includes(d.gender) ? d.gender : "",
    notes: "", history: [] };
  const fl = cleanFields(s.fields), linksShown = fl.reel !== "hidden" || fl.links !== "hidden";
  const missing = FIELDS.filter(k => fl[k] === "required" && !(Array.isArray(a[k]) ? a[k].length : a[k]));
  if (a.name.length < 2 || !MAIL_OK.test(a.email) || missing.length || (linksShown && !(a.links.length || a.reel))) return json({ ok: false, error: "fields", missing }, 400);
  await env.EB.put("teamapp:" + a.id, JSON.stringify(a));
  ctx.waitUntil(appMail(env, a, "received"));
  ctx.waitUntil(telegram(env, "🧑‍🎨 طلب انضمام جديد — " + a.name + " · " + (ROLE_AR[a.role] || a.role) + (a.city ? " · " + a.city : "") + "\n" + SITE + "/admin/#team"));
  return json({ ok: true });
}

async function memberAction(ctx, u, d){
  const { env } = ctx, now = new Date().toISOString();
  if (d.action === "password") {
    const next = String(d.next || "");
    if (!u.mustChange && (await pbkdf2(String(d.current || ""), u.salt)) !== u.hash) return json({ ok: false, error: "wrong" }, 401);
    if (next.length < 10) return json({ ok: false, error: "short" }, 400);
    u.salt = randHex(16); u.hash = await pbkdf2(next, u.salt); u.mustChange = false; await env.EB.put("member:" + u.email, JSON.stringify(u));
    return json({ ok: true, me: publicMember(u) });
  }
  if (u.mustChange) return json({ ok: false, error: "password" }, 403);
  if (!u.contract || !u.contract.signedAt) return json({ ok: false, error: "contract" }, 403);   // no work before the agreement is signed
  const t = await kvJSON(env, "ttask:" + C_(d.id, 40)); if (!t || t.member !== u.email) return json({ ok: false }, 404);
  if (d.action === "start") { if (t.status === "assigned" || t.status === "changes") { t.status = "progress"; (t.log ||= []).push({ at: now, what: "started" }); } }
  if (d.action === "submit") {
    const url = C_(d.url, 600); if (!URL_OK.test(url)) return json({ ok: false, error: "url" }, 400);
    if (t.status === "approved") return json({ ok: false, error: "approved" }, 409);
    (t.versions ||= []).push({ n: t.versions.length + 1, url, note: C_(d.note, 1000), at: now }); t.status = "qc"; (t.log ||= []).push({ at: now, what: "submitted" });
    ctx.waitUntil(telegram(env, "🎬 نسخة للمراجعة الداخلية — " + t.title + " · v" + t.versions.length + " · " + u.name + "\n" + SITE + "/admin/#team"));
  }
  if (d.action === "comment") { const text = C_(d.text, 2000); if (!text) return json({ ok: false }, 400);
    (t.comments ||= []).push({ from: "member", text, at: now });
    ctx.waitUntil(telegram(env, "💬 " + u.name + " على «" + t.title + "»: " + text.slice(0, 200))); }
  t.updatedAt = now; await env.EB.put("ttask:" + t.id, JSON.stringify(t));
  return json({ ok: true, task: memberTask(t) });
}

async function adminAction(ctx, d){
  const { env } = ctx, now = new Date().toISOString();
  if (d.action === "settings") {
    const s = { open: !!d.open, roles: (Array.isArray(d.roles) ? d.roles : []).filter(r => ROLES.includes(r)), intro: C_(d.intro, 1200), fields: cleanFields(d.fields) };
    await env.EB.put("team:settings", JSON.stringify(s)); return json({ ok: true, settings: s });
  }
  if (d.action === "appReject") {
    const a = await kvJSON(env, "teamapp:" + C_(d.id, 40)); if (!a) return json({ ok: false }, 404);
    if (a.status !== "rejected") return json({ ok: false, error: "status" }, 400);
    if (!(await appMail(env, a, "reject"))) return json({ ok: false, error: "mail" }, 502);
    a.rejectMailAt = now; a.history.push({ at: now, status: "rejected", mail: "reject" }); await env.EB.put("teamapp:" + a.id, JSON.stringify(a)); return json({ ok: true, app: a });
  }
  if (d.action === "app" || d.action === "appDelete") {
    const a = await kvJSON(env, "teamapp:" + C_(d.id, 40)); if (!a) return json({ ok: false }, 404);
    if (d.action === "appDelete") { await env.EB.delete("teamapp:" + a.id); return json({ ok: true }); }
    if (d.status && APP_ST.includes(d.status) && d.status !== a.status) { a.history.push({ at: now, status: d.status }); a.status = d.status; }
    if (d.notes !== undefined) a.notes = C_(d.notes, 4000);
    if (d.interview) { const iv = d.interview, prev = a.interview || {};
      const n = { at: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iv.at || "") ? iv.at : "", tz: IV_TZ[iv.tz] ? iv.tz : "dxb", platform: IV_PF[iv.platform] ? iv.platform : "", link: C_(iv.link, 600), sentAt: prev.sentAt || "" };
      const changed = n.at !== prev.at || n.tz !== prev.tz || n.platform !== prev.platform || n.link !== prev.link;
      a.interview = n;
      if ((d.status || a.status) === "interview" && n.at && n.platform && (changed || !n.sentAt)) { if (await appMail(env, a, "interview")) { n.sentAt = now; a.history.push({ at: now, status: "interview", mail: "interview" }); } else n.mailFailed = now; } }
    if (d.trial) a.trial = { brief: C_(d.trial.brief, 3000), link: URL_OK.test(C_(d.trial.link, 600)) ? C_(d.trial.link, 600) : "", due: /^\d{4}-\d{2}-\d{2}$/.test(d.trial.due || "") ? d.trial.due : "", result: C_(d.trial.result, 600) };
    await env.EB.put("teamapp:" + a.id, JSON.stringify(a)); return json({ ok: true, app: a });
  }
  if (d.action === "memberCreate") {
    const email = C_(d.email, 254).toLowerCase(); if (!MAIL_OK.test(email)) return json({ ok: false, error: "email" }, 400);
    if (await env.EB.get("member:" + email)) return json({ ok: false, error: "exists" }, 409);
    const pw = tempPass(), salt = randHex(16);
    const u = { email, name: C_(d.name, 120) || email, role: ROLES.includes(d.role) ? d.role : "editor", status: "active", lang: d.lang === "en" ? "en" : "ar",
      phone: C_(d.phone, 40), rate: C_(d.rate, 120), app: C_(d.app, 40), salt, hash: await pbkdf2(pw, salt), mustChange: true, createdAt: now, contract: null, notes: "" };
    await env.EB.put("member:" + email, JSON.stringify(u));
    if (u.app) { const a = await kvJSON(env, "teamapp:" + u.app); if (a) { if (a.status !== "accepted") { a.history.push({ at: now, status: "accepted" }); a.status = "accepted"; } a.member = email; await env.EB.put("teamapp:" + a.id, JSON.stringify(a)); } }
    const welcomed = await appMail(env, { name: u.name, email: u.email, role: u.role }, "welcome", pw);
    return json({ ok: true, member: publicMember(u), password: pw, link: SITE + "/team/", welcomed });
  }
  if (d.action === "memberUpdate" || d.action === "memberReset") {
    const u = await kvJSON(env, "member:" + C_(d.email, 254).toLowerCase()); if (!u) return json({ ok: false }, 404);
    if (d.action === "memberReset") { const pw = tempPass(); u.salt = randHex(16); u.hash = await pbkdf2(pw, u.salt); u.mustChange = true; await env.EB.put("member:" + u.email, JSON.stringify(u));
      return json({ ok: true, password: pw, link: SITE + "/team/" }); }
    if (d.name !== undefined) u.name = C_(d.name, 120) || u.name;
    if (d.role && ROLES.includes(d.role)) u.role = d.role;
    if (d.status && ["active", "paused", "removed"].includes(d.status)) u.status = d.status;
    if (d.rate !== undefined) u.rate = C_(d.rate, 120);
    if (d.notes !== undefined) u.notes = C_(d.notes, 4000);
    if (d.phone !== undefined) u.phone = C_(d.phone, 40);
    await env.EB.put("member:" + u.email, JSON.stringify(u)); const x = { ...u }; delete x.salt; delete x.hash; return json({ ok: true, member: x });
  }
  if (d.action === "taskSave") {
    const x = d.task || {}, old = x.id ? await kvJSON(env, "ttask:" + C_(x.id, 40)) : null;
    const m = await kvJSON(env, "member:" + C_(x.member, 254).toLowerCase()); if (!m) return json({ ok: false, error: "member" }, 400);
    const t = Object.assign(old || { id: "t_" + randHex(6), createdAt: now, status: "assigned", versions: [], comments: [], log: [] }, {
      member: m.email, title: C_(x.title, 160), alias: C_(x.alias, 80), brief: C_(x.brief, 6000), links: L_(x.links, 12, 600).filter(l => URL_OK.test(l)),
      due: /^\d{4}-\d{2}-\d{2}$/.test(x.due || "") ? x.due : "", fee: Math.max(0, num(x.fee)), cur: C_(x.cur, 8) || "$",
      orderKey: C_(x.orderKey, 120), projectId: C_(x.projectId, 40), internal: C_(x.internal, 2000), updatedAt: now });
    if (!t.title) return json({ ok: false, error: "title" }, 400);
    await env.EB.put("ttask:" + t.id, JSON.stringify(t));
    if (!old && m.status === "active") ctx.waitUntil(sendMail(env, m.email, (m.lang === "en" ? "New task: " : "مهمة جديدة: ") + t.title,
      mail(m.lang === "en" ? "en" : "ar", m.lang === "en" ? "A new task is waiting for you" : "وصلتك مهمة جديدة",
        `<p style="margin:0 0 10px"><b style="color:#fff">${h(t.title)}</b>${t.alias ? " · " + h(t.alias) : ""}</p>` + (t.due ? `<p style="margin:0;color:#8E9BB8">${m.lang === "en" ? "Due" : "التسليم"}: <span dir="ltr">${h(t.due)}</span></p>` : ""),
        m.lang === "en" ? "Open the team portal" : "افتح بوابة الفريق", SITE + "/team/", greet(m))));
    return json({ ok: true, task: t });
  }
  const t = await kvJSON(env, "ttask:" + C_(d.id, 40)); if (!t) return json({ ok: false }, 404);
  if (d.action === "taskDelete") { await env.EB.delete("ttask:" + t.id); return json({ ok: true }); }
  if (d.action === "taskReview") {
    const ok = d.decision === "approve"; t.status = ok ? "approved" : "changes"; (t.log ||= []).push({ at: now, what: ok ? "approved" : "changes" });
    if (C_(d.note, 2000)) (t.comments ||= []).push({ from: "studio", text: C_(d.note, 2000), at: now });
  }
  if (d.action === "taskPaid") { t.payout = d.paid ? { paid: true, at: now } : null; }
  if (d.action === "taskComment") { const text = C_(d.text, 2000); if (!text) return json({ ok: false }, 400); (t.comments ||= []).push({ from: "studio", text, at: now }); }
  t.updatedAt = now; await env.EB.put("ttask:" + t.id, JSON.stringify(t));
  return json({ ok: true, task: t });
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
    body: JSON.stringify({ from: env.MAIL_FROM || "Eyeblink Studio <info@eyeblinkstudio.com>", to:[to], subject, html }) }); return r.ok; } catch { return false; }
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
  const rtl = lang !== "en", al = rtl ? "right" : "left", dr = rtl ? "rtl" : "ltr", D = `dir="${dr}"`, DS = `direction:${dr};unicode-bidi:embed;`;
  return `<!doctype html><html dir="${rtl?"rtl":"ltr"}" lang="${rtl?"ar":"en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="dark light"></head>
<body ${D} style="${DS}margin:0;background:#04061A;padding:28px 12px;font-family:Tahoma,Arial,sans-serif;-webkit-text-size-adjust:100%">
<table role="presentation" ${D} width="100%" cellpadding="0" cellspacing="0" style="${DS}max-width:560px;margin:0 auto;background:#0b1236;border-radius:20px;border:1px solid #1d2758">
<tr><td align="center" style="padding:30px 24px 22px"><a href="${SITE}" style="text-decoration:none"><img src="${SITE}/assets/img/email-logo.png" width="190" alt="EYEBLINK STUDIO" style="display:block;width:190px;max-width:70%;height:auto;border:0;margin:0 auto"></a></td></tr>
<tr><td style="padding:0 28px"><div style="height:2px;line-height:2px;font-size:0;background:#2E62FF;background-image:linear-gradient(90deg,#3FE0E8,#2E62FF,#8B5CFF);border-radius:2px">&nbsp;</div></td></tr>
<tr><td ${D} align="${al}" style="${DS}padding:26px 28px 30px;color:#EEF2F6;text-align:${al}">
${hi?`<p ${D} style="${DS}margin:0 0 18px;font-size:17px;line-height:1.6;color:#ffffff">${h(hi)}</p>`:""}
<h1 ${D} style="${DS}font-size:20px;line-height:1.5;margin:0 0 12px;color:#ffffff">${h(title)}</h1>
<div ${D} style="${DS}font-size:15px;line-height:1.8;color:#C3CEE2;text-align:${al}">${bodyHtml}</div>
${cta?`<div ${D} style="${DS}margin-top:24px"><a href="${link}" style="display:inline-block;background:#EEF2F6;color:#04061A;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 26px;border-radius:999px">${h(cta)}</a></div>`:""}
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto"><tr><td align="center" style="padding:22px 12px 6px">
<a href="${SITE}" style="text-decoration:none"><img src="${SITE}/assets/img/apple-touch-icon.png" width="38" height="38" alt="Eyeblink" style="display:block;width:38px;height:38px;border-radius:10px;border:0;margin:0 auto"></a>
<p style="margin:10px 0 0;color:#8E9BB8;font-size:12px;line-height:1.7;direction:ltr">Eyeblink Studio · <a href="${SITE}" style="color:#8E9BB8">eyeblinkstudio.com</a> · <a href="https://instagram.com/eyeblnk" style="color:#8E9BB8">@eyeblnk</a></p>
<p ${D} style="${DS}margin:6px 0 0;color:#6F7FA0;font-size:11.5px;line-height:1.7">${rtl?"مشكلة تقنية أو استفسار عن حسابك؟ ":"A technical issue or a question about your account? "}<a href="mailto:support@eyeblinkstudio.com" style="color:#8E9BB8">support@eyeblinkstudio.com</a></p>
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
