import { isAdmin, json, cookie, randHex, pbkdf2, limited, SITE, h, sendMail, telegram, greet, mail, num, rows, steps } from "../_lib/shared.js";
// The Eyeblink team: people who apply, are tried, sign a collaboration agreement, and then work on tasks the studio gives them.
// Kept apart from clients on purpose: own accounts (KV "member:<email>"), own sessions (cookie "eb_t"), own portal (/team/).
// A member only ever sees their own tasks and their own fee: never the client's name or contact, never what the client pays.
//
// public   GET  /api/team?open=1                         → { open, roles, intro }  (is the studio hiring?)
//          POST /api/team { action:"apply", … }          → an application (rate-limited, honeypot)
// member   POST /api/team { action:"login", email, password } | { action:"logout" } | { action:"password", current, next }
//          GET  /api/team?me=1                           → profile, tasks (member view), earnings, agreement link
//          POST /api/team { action:"start"|"decline"|"submit"|"comment", id, … }
// admin    GET  /api/team?admin=1                        → applications, members, tasks, settings
//          POST /api/team { action:"settings"|"app"|"appDelete"|"memberCreate"|"memberUpdate"|"memberReset"|"taskSave"|"taskReview"|"taskPaid"|"taskDelete", … }
const ROLES = ["editor", "motion", "color", "sound", "writer", "shooter", "designer", "producer", "voice", "illustrator", "social", "subtitles", "support", "marketing"];
// roles that are jobs (a monthly salary), not task-by-task work; the studio can still change a member's type
const STAFF_ROLES = ["support", "marketing"];
const TYPES = ["freelance", "staff"];
const cleanProb = p => [1, 2, 3].includes(+p) ? +p : null, cleanHours = n => +n >= 5 && +n <= 60 ? Math.round(+n) : null;
const cleanSalary = s => s && +s.amount > 0 ? { amount: Math.round(+s.amount * 100) / 100, cur: C_(s.cur, 8) || "$" } : null;
// the application fields the studio can show as optional, require, or hide (name and e-mail are always asked)
const FIELDS = ["gender", "phone", "city", "langs", "reel", "links", "tools", "about"];
const cleanFields = x => Object.fromEntries(FIELDS.map(k => [k, ["hidden", "optional", "required"].includes((x || {})[k]) ? x[k] : "optional"]));
const ROLE_AR = { editor: "مونتير", motion: "موشن ديزاينر", color: "كولوريست", sound: "مهندس صوت", writer: "كاتب محتوى", shooter: "مصوّر", designer: "مصمم", producer: "منسّق إنتاج", voice: "معلّق صوتي", illustrator: "رسّام", social: "مدير سوشال ميديا", subtitles: "مترجم ومحرّر نصوص", support: "دعم العملاء", marketing: "مدير تسويق" };
// how a member's fee is paid, as agreed with them (studio only; it also goes into their agreement)
const cleanPay = p => p && ["usdt", "wu", "bank", "wise", "payoneer", "shamcash", "local", "other"].includes(p.method) ? { method: p.method, details: C_(p.details, 200) } : null;
const APP_ST = ["new", "trial", "interview", "accepted", "rejected"];
const TASK_ST = ["assigned", "progress", "qc", "changes", "approved", "declined"];
const DECLINE_MS = 60 * 60 * 1000;   // the agreement: one hour from receiving a task
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
  paid: !!(t.payout && t.payout.paid), paidAt: t.payout && t.payout.at || null, createdAt: t.createdAt, offeredAt: t.offeredAt || t.createdAt, updatedAt: t.updatedAt,
  canDecline: t.status === "assigned" && Date.now() - Date.parse(t.offeredAt || t.createdAt) < DECLINE_MS }; }
function publicMember(u){ return { email: u.email, name: u.name, role: u.role, roleAr: ROLE_AR[u.role] || u.role, status: u.status, lang: u.lang || "ar", type: u.type || "freelance", salary: u.salary || null, probation: u.probation || null, hours: u.hours || null, mustChange: !!u.mustChange,
  contract: u.contract ? { no: u.contract.no, signedAt: u.contract.signedAt || null, url: u.contract.token ? SITE + "/team-agreement/" + u.contract.token : null } : null }; }
async function sessionCookie(env, email, remember = true){ const t = randHex(24); await env.EB.put("tsess:" + t, email, { expirationTtl: remember ? TSESS_DAYS * 86400 : 86400 });
  return "eb_t=" + t + "; Path=/; HttpOnly; Secure; SameSite=Lax" + (remember ? "; Max-Age=" + TSESS_DAYS * 86400 : ""); }

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  if (q.get("open")) { const s = await settingsOf(env); return json({ ok: true, open: !!s.open, roles: s.open ? s.roles.filter(r => ROLES.includes(r)) : [], staff: STAFF_ROLES, intro: s.open ? s.intro || "" : "", fields: cleanFields(s.fields) }); }
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
    return json({ ok: true, me: publicMember(u) }, 200, { "set-cookie": await sessionCookie(env, email, d.remember !== false) });
  }
  if (d.action === "logout") { const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)eb_t=([a-f0-9]{48})/); if (m) await env.EB.delete("tsess:" + m[1]);
    return json({ ok: true }, 200, { "set-cookie": "eb_t=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" }); }
  if (["password", "start", "decline", "submit", "comment"].includes(d.action)) {
    const u = await member(request, env); if (!u) return json({ ok: false }, 401);
    return memberAction(ctx, u, d);
  }
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  return adminAction(ctx, d);
}

// ---- e-mails to applicants: Modern Standard Arabic, the site's own template ----
const IV_TZ = { dxb: "بتوقيت الإمارات", ruh: "بتوقيت السعودية", dam: "بتوقيت دمشق", cai: "بتوقيت القاهرة" };
const IV_PF = { meet: "Google Meet", zoom: "Zoom", whatsapp: "WhatsApp (مكالمة فيديو)" };
const IV_TZ_EN = { dxb: "UAE time", ruh: "Saudi time", dam: "Damascus time", cai: "Cairo time" };
const ROLE_EN = { editor: "video editor", motion: "motion designer", color: "colorist", sound: "sound engineer", writer: "writer", shooter: "photographer", designer: "designer", producer: "production coordinator", voice: "voice-over artist", illustrator: "illustrator", social: "social media manager", subtitles: "translator", support: "customer support specialist", marketing: "marketing manager" };
function ivWhenEn(iv){ const [d, t] = iv.at.split("T"), dt = new Date(d + "T12:00:00Z");
  const day = dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  let [hh, mm] = t.split(":").map(Number); const pm = hh >= 12; hh = hh % 12 || 12;
  return day + ", " + hh + ":" + String(mm).padStart(2, "0") + (pm ? " pm " : " am ") + "(" + IV_TZ_EN[iv.tz] + ")"; }
function ivWhen(iv){ const [d, t] = iv.at.split("T"), dt = new Date(d + "T12:00:00Z");
  const day = dt.toLocaleDateString("ar-u-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  let [hh, mm] = t.split(":").map(Number); const pm = hh >= 12; hh = hh % 12 || 12;
  return day + "، الساعة " + hh + ":" + String(mm).padStart(2, "0") + (pm ? " مساءً " : " صباحاً ") + IV_TZ[iv.tz]; }
async function appMail(env, a, kind, pw, ag){
  if (a.lang === "en") return appMailEn(env, a, kind, pw, ag);
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
    body = "<p style=\"margin:0\">يسعدنا أن نعمل معاً. أمامك خطوتان قبل أول مهمة:</p>" +
      (ag ? "<p style=\"margin:14px 0 0\"><b style=\"color:#ffffff\">1. " + (a.type === "staff" ? "عقد العمل" : "اتفاقية التعاون") + "</b><br>اقرأ بنودها بعناية ووقّعها إلكترونياً من الزر أدناه.</p>" : "") +
      "<p style=\"margin:14px 0 0\"><b style=\"color:#ffffff\">" + (ag ? "2. " : "") + "مساحة الفريق</b><br>ادخل من <a href=\"" + SITE + "/team/\" style=\"color:#3FE0E8\">" + SITE.replace("https://", "") + "/team</a> بهذه البيانات، واختر كلمة سرك عند أول دخول:</p>" + box([["البريد", a.email], ["كلمة السر المؤقتة", pw]]) +
      "<p style=\"margin:14px 0 0\">تُفتح لك المهام بعد توقيع الاتفاقية، ومع كل مهمة البريف والموعد وأجرك.</p>";
    cta = ag ? (a.type === "staff" ? "اقرأ العقد ووقّعه" : "اقرأ الاتفاقية ووقّعها") : "افتح مساحة الفريق"; link = ag || SITE + "/team/"; }
  else return false;
  return sendMail(env, a.email, subject, mail("ar", title, body, cta, link, hi));
}

async function appMailEn(env, a, kind, pw, ag){
  const hi = "Hi " + (String(a.name || "").trim().split(/\s+/)[0] || "") + ",", role = ROLE_EN[a.role] || "";
  const box = rows => '<div style="margin-top:14px;padding:12px 14px;border-radius:12px;background:#0f1a4a;border:1px solid #1d2758;line-height:1.9">' + rows.map(r => '<b style="color:#ffffff">' + h(r[0]) + ':</b> ' + h(r[1])).join("<br>") + "</div>";
  const P = (s, top) => '<p style="margin:' + (top ? "12px" : "0") + ' 0 0">' + s + "</p>";
  let subject, title, body, cta = null, link = null;
  if (kind === "received") { subject = "We received your application · Eyeblink Studio"; title = "Your application was received";
    body = P("Thank you for your interest in joining Eyeblink Studio" + (role ? " as a " + h(role) : "") + ". We review every application carefully, and we always start with the work.") + P("If there is a next step, we will write to you at this address.", 1); }
  else if (kind === "interview") { const iv = a.interview; subject = "Your interview · Eyeblink Studio"; title = "We would like to talk with you";
    body = P("We liked what we saw in your work, and we have set a time for a short conversation about how you work.") + box([["When", ivWhenEn(iv)], ["Where", IV_PF[iv.platform].replace(" (مكالمة فيديو)", " (video call)")]].concat(iv.link && !/^https?:/i.test(iv.link) ? [["Details", iv.link]] : [])) +
      P("If this time does not suit you, reply to this email with another one.", 1);
    if (/^https?:\/\//i.test(iv.link || "")) { cta = "Interview link"; link = iv.link; } }
  else if (kind === "reject") { subject = "About your application · Eyeblink Studio"; title = "Thank you for your time";
    body = P("We reviewed your application and your work carefully. What we need at this stage does not match what you offer, and that says nothing against the quality of your work.") + P("We will keep your application and write to you if a closer role opens.", 1); }
  else if (kind === "welcome") { subject = "Welcome to the Eyeblink Studio team"; title = "You are now part of Eyeblink";
    body = P("We are glad to work together. Two steps before your first task:") +
      (ag ? P('<b style="color:#ffffff">1. ' + (a.type === 'staff' ? 'Your employment contract' : 'The collaboration agreement') + '</b><br>Read it carefully and sign it online with the button below.', 1) : "") +
      P('<b style="color:#ffffff">' + (ag ? "2. " : "") + 'The team space</b><br>Sign in at <a href="' + SITE + '/team/" style="color:#3FE0E8">' + SITE.replace("https://", "") + '/team</a> with these details, and choose your own password the first time:', 1) + box([["Email", a.email], ["Temporary password", pw]]) +
      P("Your tasks open once the agreement is signed, each with its brief, deadline and fee.", 1);
    cta = ag ? (a.type === "staff" ? "Read and sign the contract" : "Read and sign the agreement") : "Open the team space"; link = ag || SITE + "/team/"; }
  else return false;
  return sendMail(env, a.email, subject, mail("en", title, body, cta, link, hi));
}

async function apply(ctx, d, ip){
  const { env } = ctx;
  if (d.website) return json({ ok: true });                                   // honeypot: bots fill every field
  const s = await settingsOf(env); if (!s.open) return json({ ok: false, error: "closed" }, 403);
  if (await limited(env, "tapp:" + ip, 4, 3600)) return json({ ok: false, error: "slow" }, 429);
  const a = { id: "a_" + randHex(6), at: new Date().toISOString(), status: "new",
    name: C_(d.name, 120), email: C_(d.email, 254).toLowerCase(), phone: C_(d.phone, 40), role: ROLES.includes(d.role) ? d.role : "editor",
    city: C_(d.city, 120), tz: C_(d.tz, 60), links: L_(d.links, 6, 400).filter(x => URL_OK.test(x)), reel: URL_OK.test(C_(d.reel, 600)) ? C_(d.reel, 600) : "",
    tools: C_(d.tools, 300), langs: C_(d.langs, 120), about: C_(d.about, 2000), gender: ["male", "female"].includes(d.gender) ? d.gender : "", lang: d.lang === "en" ? "en" : "ar",
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
  if (d.action === "start") { if (t.status === "assigned" || t.status === "changes") { const fresh = t.status === "assigned"; t.status = "progress"; (t.log ||= []).push({ at: now, what: fresh ? "accepted" : "started" });
      if (fresh) ctx.waitUntil(telegram(env, "✅ " + u.name + " استلم المهمة وبدأ التنفيذ: «" + t.title + "»")); } }
  if (d.action === "decline") {
    if (t.status !== "assigned" || Date.now() - Date.parse(t.offeredAt || t.createdAt) >= DECLINE_MS) return json({ ok: false, error: "late" }, 409);
    t.status = "declined"; (t.log ||= []).push({ at: now, what: "declined", reason: C_(d.reason, 300) });
    ctx.waitUntil(telegram(env, "↩️ " + u.name + " اعتذر عن المهمة «" + t.title + "»" + (d.reason ? ": " + C_(d.reason, 300) : "") + "\nأسندها لحدا تاني من " + SITE + "/admin/#team")); }
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
      phone: C_(d.phone, 40), rate: C_(d.rate, 120), app: C_(d.app, 40), pay: cleanPay(d.pay), type: TYPES.includes(d.type) ? d.type : STAFF_ROLES.includes(d.role) ? "staff" : "freelance", salary: cleanSalary(d.salary), probation: cleanProb(d.probation), hours: cleanHours(d.hours), salt, hash: await pbkdf2(pw, salt), mustChange: true, createdAt: now, contract: null, notes: "" };
    await env.EB.put("member:" + email, JSON.stringify(u));
    if (u.app) { const a = await kvJSON(env, "teamapp:" + u.app); if (a) { if (a.status !== "accepted") { a.history.push({ at: now, status: "accepted" }); a.status = "accepted"; } a.member = email; await env.EB.put("teamapp:" + a.id, JSON.stringify(a)); } }
    const fromApp = u.app ? await kvJSON(env, "teamapp:" + u.app) : null; if (fromApp && fromApp.lang === "en") { u.lang = "en"; await env.EB.put("member:" + email, JSON.stringify(u)); }
    const welcomed = d.deferWelcome ? false : await appMail(env, { name: u.name, email: u.email, role: u.role, lang: u.lang }, "welcome", pw);
    return json({ ok: true, member: { ...publicMember(u), pay: u.pay, phone: u.phone }, password: pw, link: SITE + "/team/", welcomed });
  }
  if (d.action === "welcome") {
    const u = await kvJSON(env, "member:" + C_(d.email, 254).toLowerCase()); if (!u) return json({ ok: false }, 404);
    const ag = /^https:\/\/[^\s]+\/team-agreement\/[a-f0-9]+$/i.test(C_(d.agreement, 300)) ? C_(d.agreement, 300) : "";
    const sent = await appMail(env, { name: u.name, email: u.email, role: u.role, lang: u.lang, type: u.type }, "welcome", C_(d.password, 80), ag);
    return json({ ok: !!sent, error: sent ? undefined : "mail" });
  }
  if (d.action === "memberUpdate" || d.action === "memberReset") {
    const u = await kvJSON(env, "member:" + C_(d.email, 254).toLowerCase()); if (!u) return json({ ok: false }, 404);
    if (d.action === "memberReset") { const pw = tempPass(); u.salt = randHex(16); u.hash = await pbkdf2(pw, u.salt); u.mustChange = true; await env.EB.put("member:" + u.email, JSON.stringify(u));
      return json({ ok: true, password: pw, link: SITE + "/team/" }); }
    if (d.name !== undefined) u.name = C_(d.name, 120) || u.name;
    if (d.role && ROLES.includes(d.role)) u.role = d.role;
    if (d.status && ["active", "paused", "removed"].includes(d.status)) u.status = d.status;
    if (d.rate !== undefined) u.rate = C_(d.rate, 120);
    if (d.pay !== undefined) u.pay = cleanPay(d.pay);
    if (TYPES.includes(d.type)) u.type = d.type;
    if (d.salary !== undefined) u.salary = cleanSalary(d.salary);
    if (d.probation !== undefined) u.probation = cleanProb(d.probation);
    if (d.hours !== undefined) u.hours = cleanHours(d.hours);
    if (d.notes !== undefined) u.notes = C_(d.notes, 4000);
    if (d.phone !== undefined) u.phone = C_(d.phone, 40);
    await env.EB.put("member:" + u.email, JSON.stringify(u)); const x = { ...u }; delete x.salt; delete x.hash; return json({ ok: true, member: x });
  }
  if (d.action === "taskSave") {
    const x = d.task || {}, old = x.id ? await kvJSON(env, "ttask:" + C_(x.id, 40)) : null;
    const m = await kvJSON(env, "member:" + C_(x.member, 254).toLowerCase()); if (!m) return json({ ok: false, error: "member" }, 400);
    const moved = old && old.member !== m.email;
    const t = Object.assign(old || { id: "t_" + randHex(6), createdAt: now, offeredAt: now, status: "assigned", versions: [], comments: [], log: [] }, moved ? { status: "assigned", offeredAt: now } : {}, {
      member: m.email, title: C_(x.title, 160), alias: C_(x.alias, 80), brief: C_(x.brief, 6000), links: L_(x.links, 12, 600).filter(l => URL_OK.test(l)),
      due: /^\d{4}-\d{2}-\d{2}$/.test(x.due || "") ? x.due : "", fee: Math.max(0, num(x.fee)), cur: C_(x.cur, 8) || "$",
      orderKey: C_(x.orderKey, 120), projectId: C_(x.projectId, 40), workTask: C_(x.workTask, 12), internal: C_(x.internal, 2000), updatedAt: now });
    if (!t.title) return json({ ok: false, error: "title" }, 400);
    await env.EB.put("ttask:" + t.id, JSON.stringify(t));
    if ((!old || moved) && m.status === "active") ctx.waitUntil(sendMail(env, m.email, (m.lang === "en" ? "New task: " : "مهمة جديدة: ") + t.title,
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
