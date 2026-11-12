import { sha256, same, isAdmin, json, randHex, limited, SITE, h, telegram, num, fmt, later } from "../_lib/shared.js";
// Quotes and agreements: documents the studio prepares for one order and shares as a private link — eyeblinkstudio.com/d/<token>
// (the page itself is drawn by functions/d/[[path]].js; this route stores them and records what the client does with them)
// GET  /api/docs?key=order:…                                   — admin: every document of that order
// POST /api/docs { action:"issue", key, type, doc, token? }   — admin: a new document, or a new version of one the client has not accepted yet
// POST /api/docs { action:"remove", key, token }              — admin: withdraw a document (its link stops working)
// POST /api/docs { action:"seen", t }                          — the client opened it (the first time: a Telegram note to the studio)
// POST /api/docs { action:"accept", t, name, agree:true }      — the client accepts the quote / signs the agreement electronically
// Each document is a frozen snapshot (KV "doc:<token>"): changing the templates later never changes what a client already saw or signed.
// "team": the collaboration agreement a new team member signs (key "member:<email>" instead of an order)
const TYPES = ["quote", "agreement", "team"];
const NO_PREFIX = { quote: "Q", agreement: "AG", team: "TA" };
const TYPE_AR = { quote: "عرض السعر", agreement: "الاتفاقية", team: "اتفاقية التعاون" };
const PATH = { quote: "quote", agreement: "agreement", team: "team-agreement" };
const TOKEN = /^[a-f0-9]{32}$/;
const MAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const INVITE_DAYS_DOC = 30;

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const key = new URL(request.url).searchParams.get("key") || "";
  const o = await getOrder(env, key); if (!o) return json({ ok: false, error: "order" }, 404);
  const docs = [];
  for (const s of o.docs || []) { const v = await env.EB.get("doc:" + s.token); if (v) docs.push(JSON.parse(v)); }
  return json({ ok: true, docs });
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const d = await request.json().catch(() => ({}));
  if (d.action === "seen") return seen(ctx, d);
  if (d.action === "accept") return accept(ctx, d);
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  if (d.action === "issue") return issue(env, d);
  if (d.action === "remove") {
    const o = await getOrder(env, d.key); if (!o || !TOKEN.test(d.token || "")) return json({ ok: false }, 404);
    await env.EB.delete("doc:" + d.token);
    o.docs = (o.docs || []).filter(x => x.token !== d.token); await env.EB.put(o.key, JSON.stringify(o));
    return json({ ok: true, docs: o.docs });
  }
  return json({ ok: false }, 400);
}

async function getOrder(env, key){
  if (!String(key || "").startsWith("order:")) return null;
  const v = await env.EB.get(key); return v ? JSON.parse(v) : null;
}
const S = (v, m) => String(v ?? "").trim().slice(0, m);
const LINES = (a, n, m) => (Array.isArray(a) ? a : String(a || "").split("\n")).map(x => S(x, m)).filter(Boolean).slice(0, n);
const INT = (v, lo, hi, dflt) => { const n = parseInt(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };

// everything the page shows, cleaned and bounded; totals are always worked out here, never trusted from the browser
function clean(type, d){
  d = d || {}; const c = d.client || {}, st = d.studio || {};
  const items = (Array.isArray(d.items) ? d.items : []).slice(0, 30)
    .map(x => ({ name: S(x && x.name, 160), desc: S(x && x.desc, 700), qty: Math.max(1, Math.min(999, num(x && x.qty) || 1)), unit: Math.max(0, num(x && x.unit)) }))
    .filter(x => x.name);
  const sub = items.reduce((a, x) => a + x.qty * x.unit, 0), discount = Math.min(sub, Math.max(0, num(d.discount)));
  const b = {
    lang: d.lang === "en" ? "en" : "ar",
    title: S(d.title, 160), summary: S(d.summary, 1500),
    client: { name: S(c.name, 120), company: S(c.company, 120), place: S(c.place, 120), contact: S(c.contact, 160), email: S(c.email, 200) },
    studio: { name: S(st.name, 120) || "Eyeblink Studio", place: S(st.place, 120), contact: S(st.contact, 240) },
    items, cur: S(d.cur, 8) || "$", sub, discount, total: Math.round((sub - discount) * 100) / 100,
    days: INT(d.days, 0, 365, 0), revisions: INT(d.revisions, 0, 10, 2), valid: INT(d.valid, 1, 120, 14),
    plan: d.plan === "full" ? "full" : "split", pct: INT(d.pct, 10, 90, 50),
    includes: LINES(d.includes, 20, 260), excludes: LINES(d.excludes, 20, 260),
    payMethods: S(d.payMethods, 260), payIds: LINES(d.payIds, 12, 40), payOther: S(d.payOther, 120), notes: S(d.notes, 2000), quoteNo: S(d.quoteNo, 30),
  };
  if (type !== "quote") b.clauses = (Array.isArray(d.clauses) ? d.clauses : []).slice(0, 40)
    .map(x => ({ h: S(x && x.h, 140), p: S(x && x.p, 4000) })).filter(x => x.h || x.p);
  if (type === "team") b.kind = d.kind === "staff" ? "staff" : "freelance";   // a staff contract or a freelance agreement (same signing flow)
  return b;
}
function summaryOf(doc){ return { token: doc.token, type: doc.type, no: doc.no, ver: doc.ver, at: doc.updatedAt, status: doc.status,
  viewedAt: doc.viewedAt || null, acceptedAt: doc.accepted ? doc.accepted.at : null, acceptedBy: doc.accepted ? doc.accepted.name : null,
  total: doc.body.total, cur: doc.body.cur, title: doc.body.title }; }
function putSummary(o, doc){ const s = summaryOf(doc); o.docs = (o.docs || []).filter(x => x.token !== doc.token); o.docs.unshift(s); o.docs = o.docs.slice(0, 30); }

async function issue(env, d){
  if (!TYPES.includes(d.type)) return json({ ok: false, error: "type" }, 400);
  if (d.type === "team") return issueTeam(env, d);
  const o = await getOrder(env, d.key); if (!o) return json({ ok: false, error: "order" }, 404);
  const body = clean(d.type, d.doc);
  if (!body.title) return json({ ok: false, error: "title" }, 400);
  if (d.type === "quote" && !body.items.length) return json({ ok: false, error: "items" }, 400);
  if (d.type === "agreement" && !body.clauses.length) return json({ ok: false, error: "clauses" }, 400);
  const now = new Date().toISOString();
  let doc = TOKEN.test(d.token || "") ? JSON.parse(await env.EB.get("doc:" + d.token) || "null") : null;
  if (doc && doc.orderKey !== o.key) doc = null;
  if (doc) {
    if (doc.accepted) return json({ ok: false, error: "locked" }, 409);
    doc.body = body; doc.ver = (doc.ver || 1) + 1; doc.updatedAt = now; doc.lang = body.lang;
  } else {
    const seqKey = "docseq:" + d.type, seq = (+(await env.EB.get(seqKey) || 0)) + 1; await env.EB.put(seqKey, String(seq));
    doc = { token: randHex(16), type: d.type, no: NO_PREFIX[d.type] + "-" + new Date().getFullYear() + "-" + String(seq).padStart(4, "0"),
      ver: 1, orderKey: o.key, code: o.code, lang: body.lang, createdAt: now, updatedAt: now, status: "sent", body };
  }
  await env.EB.put("doc:" + doc.token, JSON.stringify(doc));
  putSummary(o, doc); await env.EB.put(o.key, JSON.stringify(o));
  return json({ ok: true, doc, url: SITE + "/" + PATH[doc.type] + "/" + doc.token, docs: o.docs });
}
async function issueTeam(env, d){
  const mk = "member:" + String(d.key || "").replace(/^member:/, "").toLowerCase(), m = JSON.parse(await env.EB.get(mk) || "null"); if (!m) return json({ ok: false, error: "member" }, 404);
  const body = clean("team", d.doc); if (!body.title) return json({ ok: false, error: "title" }, 400); if (!body.clauses.length) return json({ ok: false, error: "clauses" }, 400);
  const now = new Date().toISOString(); let doc = m.contract && m.contract.token ? JSON.parse(await env.EB.get("doc:" + m.contract.token) || "null") : null;
  if (doc && doc.accepted) return json({ ok: false, error: "locked" }, 409);
  if (doc) { doc.body = body; doc.ver = (doc.ver || 1) + 1; doc.updatedAt = now; doc.lang = body.lang; }
  else { const seq = (+(await env.EB.get("docseq:team") || 0)) + 1; await env.EB.put("docseq:team", String(seq));
    doc = { token: randHex(16), type: "team", no: "TA-" + new Date().getFullYear() + "-" + String(seq).padStart(4, "0"), ver: 1, memberKey: mk, code: "", lang: body.lang, createdAt: now, updatedAt: now, status: "sent", body }; }
  await env.EB.put("doc:" + doc.token, JSON.stringify(doc));
  m.contract = { token: doc.token, no: doc.no, at: now, signedAt: null }; await env.EB.put(mk, JSON.stringify(m));
  return json({ ok: true, doc, url: SITE + "/team-agreement/" + doc.token });
}

async function seen(ctx, d){
  const { request, env } = ctx;
  if (!TOKEN.test(d.t || "")) return json({ ok: false }, 400);
  if (await isAdmin(request, env)) return json({ ok: true, admin: true });      // the studio previewing its own link does not count
  const doc = JSON.parse(await env.EB.get("doc:" + d.t) || "null"); if (!doc) return json({ ok: false }, 404);
  if (doc.viewedAt) return json({ ok: true });
  doc.viewedAt = new Date().toISOString(); await env.EB.put("doc:" + doc.token, JSON.stringify(doc));
  const o = await getOrder(env, doc.orderKey);
  if (o) { putSummary(o, doc); await env.EB.put(o.key, JSON.stringify(o)); }
  later(ctx, telegram(env, "👀 " + (doc.body.client.name || (o && o.name) || "العميل") + " فتح " + TYPE_AR[doc.type] + " " + doc.no + (o ? " · " + o.code : "") + "\n" + SITE + "/admin/"));
  return json({ ok: true });
}

async function accept(ctx, d){
  const { request, env } = ctx;
  if (!TOKEN.test(d.t || "")) return json({ ok: false }, 400);
  const name = S(d.name, 120);
  if (name.length < 2 || d.agree !== true) return json({ ok: false, error: "name" }, 400);
  const ip = request.headers.get("cf-connecting-ip") || "x";
  if (await limited(env, "dacc:" + ip, 12, 3600)) return json({ ok: false, error: "slow" }, 429);
  const doc = JSON.parse(await env.EB.get("doc:" + d.t) || "null"); if (!doc) return json({ ok: false }, 404);
  if (doc.accepted) return json({ ok: false, error: "done" }, 409);
  if (doc.type === "quote" && Date.now() > Date.parse(doc.updatedAt) + doc.body.valid * 864e5) return json({ ok: false, error: "expired" }, 410);
  const o0 = doc.orderKey ? await getOrder(env, doc.orderKey) : null;
  let email = S(doc.body.client.email, 200).toLowerCase() || (o0 && o0.email) || "";
  if (doc.type === "agreement" && !MAIL_RE.test(email)) { const em = S(d.email, 200).toLowerCase(); if (!MAIL_RE.test(em)) return json({ ok: false, error: "email" }, 400); email = em; }
  const now = new Date().toISOString();
  doc.accepted = { name, at: now, country: (request.cf && request.cf.country) || "", ip: (await sha256("eb-doc|" + ip)).slice(0, 16), ver: doc.ver };
  doc.status = "accepted"; if (!doc.viewedAt) doc.viewedAt = now;
  // the agreement is signed: the next step is the client workspace — an invitation made right here, offered on the same page
  if (doc.type === "agreement" && MAIL_RE.test(email)) {
    const uv = await env.EB.get("user:" + email), u = uv ? JSON.parse(uv) : null;
    if (u && u.role === "client") doc.onboard = { email, client: true };
    else { const tok = randHex(24);
      await env.EB.put("invite:" + tok, JSON.stringify({ email, name: doc.body.client.name || name, lang: doc.lang, note: "", at: now, expires: new Date(Date.now() + INVITE_DAYS_DOC * 864e5).toISOString(), via: "agreement", doc: doc.no }), { expirationTtl: INVITE_DAYS_DOC * 86400 });
      doc.onboard = { email, invite: tok }; }
  }
  await env.EB.put("doc:" + doc.token, JSON.stringify(doc));
  if (doc.type === "team" && doc.memberKey) { const m = JSON.parse(await env.EB.get(doc.memberKey) || "null"); if (m) { m.contract = Object.assign({}, m.contract, { token: doc.token, no: doc.no, signedAt: now, signedName: name }); await env.EB.put(doc.memberKey, JSON.stringify(m)); } }
  const o = o0;
  if (o) {
    const note = doc.type === "quote" ? "وافق على عرض السعر " + doc.no : "وقّع الاتفاقية " + doc.no;
    (o.history ||= []).push({ at: now, status: o.status, by: "client", note: doc.type === "quote" ? "quote accepted" : "agreement signed", doc: doc.no });
    (o.touches ||= []).unshift({ at: now, channel: "website", note: note + " (" + name + ")" }); o.touches = o.touches.slice(0, 50);
    if (doc.type === "quote") {
      // the accepted quote becomes the order's price and payment plan, and an opportunity still being discussed becomes confirmed
      o.price = fmt(doc.body.total, doc.body.cur); o.cur = doc.body.cur; o.plan = doc.body.plan; o.depositPct = doc.body.pct;
      if ((doc.body.payIds || []).length === 1 && !o.method) o.method = doc.body.payIds[0];
    }
    if (!o.email && MAIL_RE.test(email)) o.email = email;
    if (["new", "discussing"].includes(o.status)) { o.history.push({ at: now, status: "confirmed", by: "client" }); o.status = "confirmed"; }
    if (o.manual && !o.clientVisible && o.status !== "cancelled") o.clientVisible = true;
    if (o.email && !(o.manual && !o.clientVisible)) { const uv = await env.EB.get("user:" + o.email); if (uv) { const u = JSON.parse(uv); if (!(u.orders || []).includes(o.key)) { (u.orders ||= []).push(o.key); await env.EB.put("user:" + o.email, JSON.stringify(u)); } } }
    if (doc.onboard) o.onboard = Object.assign({}, o.onboard, doc.onboard, { at: now, doc: doc.no });
    putSummary(o, doc); o.updatedAt = now; await env.EB.put(o.key, JSON.stringify(o));
  }
  later(ctx, telegram(env, "✅ " + name + (doc.type === "quote" ? " وافق على عرض السعر " : doc.type === "team" ? " وقّع اتفاقية التعاون " : " وقّع الاتفاقية ") + doc.no + (doc.type === "team" ? "" : " · " + fmt(doc.body.total, doc.body.cur)) + (o ? " · " + o.code : "") + "\n" + SITE + "/admin/"));
  return json({ ok: true, accepted: doc.accepted });
}
