import { same, json, cookie, randHex, currentUser, startSession, pbkdf2, limited, unreadFor, sendMail, mail } from "../_lib/shared.js";
// GET  /api/account — the signed-in client and a summary of their orders (401 if not signed in)
// POST /api/account — { action: "register", name, email, password } | { action: "login", email, password }
//                     | { action: "google", credential } | { action: "logout" }
//                     | { action: "forgot", email } → 6-digit code by e-mail | { action: "reset", email, code, password }
const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export async function onRequestGet({ request, env }) {
  const u = await currentUser(request, env);
  if (!u) return json({ ok: false, guest: true });          // a visitor who is not signed in: not an error
  // the header on every page only needs who this is (no orders read)
  if (new URL(request.url).searchParams.get("lite")) return json({ ok: true, user: { email: u.email, name: u.name, role: u.role === "client" ? "client" : "customer", mustChange: !!u.mustChange } });
  const orders = [];
  for (const k of (u.orders || []).slice(-60).reverse()) {
    const v = await env.EB.get(k); if (!v) continue; const o = JSON.parse(v); if (o.manual && !o.clientVisible) continue;
    orders.push({ code: o.code, status: o.status, createdAt: o.createdAt, packageName: o.packageName, unread: unreadFor(o, "client"),
      lastAt: ((o.messages || []).slice(-1)[0] || {}).at || o.updatedAt || o.createdAt });
  }
  const ar = await env.EB.get("accreq:" + u.email);
  return json({ ok: true, user: { email: u.email, name: u.name, provider: u.provider, role: u.role === "client" ? "client" : "customer", clientSince: u.clientSince || null, mustChange: !!u.mustChange }, access: ar ? JSON.parse(ar) : null, orders });
}
export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const ip = request.headers.get("cf-connecting-ip") || "x";
  if (d.action === "logout") {
    const t = cookie(request, "eb_s"); if (t) await env.EB.delete("sess:" + t);
    return json({ ok: true }, 200, { "set-cookie": "eb_s=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });
  }
  // a signed-in client chooses a new password (required after a temporary one the studio issued)
  if (d.action === "setPassword") {
    const u = await currentUser(request, env); if (!u) return json({ ok: false }, 401);
    const pw = String(d.password || ""); if (pw.length < 8 || pw.length > 200) return json({ ok: false, error: "password" }, 400);
    if (!u.mustChange) { if (!u.hash || (await pbkdf2(String(d.current || ""), u.salt)) !== u.hash) return json({ ok: false, error: "current" }, 403); }
    else if (u.hash && (await pbkdf2(pw, u.salt)) === u.hash) return json({ ok: false, error: "same" }, 400);
    u.salt = randHex(16); u.hash = await pbkdf2(pw, u.salt); delete u.mustChange;
    (u.log ||= []).unshift({ at: new Date().toISOString(), by: "client", what: "chose a new password" }); u.log = u.log.slice(0, 60);
    u.sv = (u.sv || 0) + 1;   // every other device is signed out
    await env.EB.put("user:" + u.email, JSON.stringify(u));
    return json({ ok: true }, 200, { "set-cookie": await startSession(env, u.email) });
  }
  // the client switched the workspace language: their e-mails and notifications follow it
  if (d.action === "lang") {
    const u = await currentUser(request, env); if (!u) return json({ ok: false }, 401);
    if (d.lang !== "ar" && d.lang !== "en") return json({ ok: false }, 400);
    if (u.lang !== d.lang) { u.lang = d.lang; await env.EB.put("user:" + u.email, JSON.stringify(u)); }
    return json({ ok: true });
  }
  if (await limited(env, "arl:" + ip, 25, 3600)) return json({ ok: false, error: "too many attempts" }, 429);
  let user;
  if (d.action === "forgot") {
    const email = String(d.email || "").trim().toLowerCase();
    if (!EMAIL.test(email)) return json({ ok: false, error: "email" }, 400);
    if (!env.RESEND_API_KEY) return json({ ok: false, error: "mail off" }, 503);
    const v = await env.EB.get("user:" + email);
    if (v) {   // same answer either way, so the form does not reveal who has an account
      const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
      await env.EB.put("reset:" + email, JSON.stringify({ code, tries: 0 }), { expirationTtl: 900 });
      const en = d.lang === "en";
      await sendMail(env, email, en ? "Your Eyeblink password code" : "رمز استعادة كلمة السر — Eyeblink",
        mail(en ? "en" : "ar", en ? "Reset your password" : "استعادة كلمة السر",
          (en ? "Your code (valid for 15 minutes):" : "رمزك (صالح لمدة 15 دقيقة):") + `<div style="font:bold 30px/1.4 Arial;letter-spacing:8px;color:#fff;margin:14px 0;direction:ltr">${code}</div>` +
          (en ? "If you did not ask for this, ignore this e-mail." : "إن لم تطلب ذلك، تجاهل هذه الرسالة."), "", ""));
    }
    return json({ ok: true });
  }
  if (d.action === "reset") {
    const email = String(d.email || "").trim().toLowerCase(), pw = String(d.password || "");
    const r = await env.EB.get("reset:" + email); if (!r) return json({ ok: false, error: "code" }, 400);
    const rec = JSON.parse(r);
    if (rec.tries >= 5) { await env.EB.delete("reset:" + email); return json({ ok: false, error: "code" }, 400); }
    if (String(d.code || "").trim() !== rec.code) { rec.tries++; await env.EB.put("reset:" + email, JSON.stringify(rec), { expirationTtl: 900 }); return json({ ok: false, error: "code" }, 400); }
    if (pw.length < 8 || pw.length > 200) return json({ ok: false, error: "password" }, 400);
    const v = await env.EB.get("user:" + email); if (!v) return json({ ok: false, error: "code" }, 400);
    user = JSON.parse(v); user.salt = randHex(16); user.hash = await pbkdf2(pw, user.salt); user.verified = true; user.sv = (user.sv || 0) + 1;
    await env.EB.delete("reset:" + email);
  } else
  if (d.action === "register" || d.action === "login") {
    const email = String(d.email || "").trim().toLowerCase(), pw = String(d.password || "");
    if (!EMAIL.test(email)) return json({ ok: false, error: "email" }, 400);
    const existing = await env.EB.get("user:" + email);
    if (d.action === "register") {
      const name = String(d.name || "").trim().slice(0, 80);
      if (!name) return json({ ok: false, error: "name" }, 400);
      if (pw.length < 8 || pw.length > 200) return json({ ok: false, error: "password" }, 400);
      if (existing) return json({ ok: false, error: "exists" }, 409);
      const salt = randHex(16);
      user = { email, name, provider: "password", salt, hash: await pbkdf2(pw, salt), createdAt: new Date().toISOString(), orders: [] };
    } else {
      if (!existing) return json({ ok: false, error: "wrong" }, 401);
      user = JSON.parse(existing);
      if (!user.hash) return json({ ok: false, error: "google" }, 400);
      if (!same(await pbkdf2(pw, user.salt), user.hash)) return json({ ok: false, error: "wrong" }, 401);
    }
  } else if (d.action === "google") {
    let clientId = env.GOOGLE_CLIENT_ID || "";
    if (!clientId) { const c = await env.EB.get("content"); try { clientId = (JSON.parse(c || "{}").settings || {}).googleClientId || ""; } catch {} }
    if (!clientId) return json({ ok: false, error: "google not set up" }, 400);
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(String(d.credential || "")));
    if (!r.ok) return json({ ok: false, error: "google" }, 401);
    const g = await r.json();
    if (g.aud !== clientId || !(g.email_verified === true || g.email_verified === "true") || +g.exp * 1000 < Date.now()) return json({ ok: false, error: "google" }, 401);
    const email = String(g.email).toLowerCase();
    const existing = await env.EB.get("user:" + email);
    user = existing ? JSON.parse(existing) : { email, name: String(g.name || email.split("@")[0]).slice(0, 80), provider: "google", createdAt: new Date().toISOString(), orders: [] };
    if (existing && user.hash && !user.verified && !user.mustChange && user.clientVia !== "admin") { delete user.hash; delete user.salt; user.sv = (user.sv || 0) + 1; }
    user.google = true; user.verified = true;
  } else return json({ ok: false }, 400);
  user.lastLogin = new Date().toISOString(); if (d.lang === "en" || d.lang === "ar") user.lang = d.lang;
  await env.EB.put("user:" + user.email, JSON.stringify(user));
  return json({ ok: true, user: { email: user.email, name: user.name } }, 200, { "set-cookie": await startSession(env, user.email) });
}
