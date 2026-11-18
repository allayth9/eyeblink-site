import { isAdmin, adminPwOk, adminPwHash, adminAlert, json, cookie, randHex } from "../_lib/shared.js";
import { load, save, newSecret, totpCheck, otpauth, newBackup, useBackup, verifyRegistration, verifyAssertion, randB64u } from "../_lib/twofa.js";
// The panel's sign-in. With two-step sign-in off it is one step (the password); with it on, two:
//   GET  /api/auth  (Authorization: Bearer <password>, ?remember=1) → { ok:true } and a session
//                                                                  | { need2fa:true, ticket, totp, passkey: <request options> | null }
//   POST /api/auth { action:"verify", ticket, code | passkey }     → the session (code = 6 digits from the app, or a backup code)
//   GET  /api/auth  (session cookie only)                          → { ok:true, session:true }
// A session made with «remember me» lasts 30 days on that device: no password and no second step until it ends.
// With the session (panel → settings → security):
//   GET  /api/auth?status=1
//   POST { action:"totpStart" } → { secret, uri }       { action:"totpConfirm", code } → { codes? }  (codes: the backup codes, shown once)
//   POST { action:"passkeyStart" } → { options }        { action:"passkeyAdd", credential, name } → { codes? }
//   POST { action:"stepStart" } → { passkey options }   (for the checks below with a passkey)
//   POST { action:"remove", what:"totp"|<passkey id>, password, code|passkey }   { action:"backupNew", password, code|passkey } → { codes }
//   POST { action:"logoutAll" }                          { current, newPassword } (change the password)
// DELETE /api/auth — sign out this device
const SESSION = /(?:^|;\s*)eb_a=([a-f0-9]{48})(?:;|$)/;
const H = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const where = req => { const u = new URL(req.url); return { origin: u.origin, rpId: u.hostname }; };

async function openSession(env, request, remember, body = { ok: true }){
  const ttl = remember ? 30 * 86400 : 12 * 3600, t = randHex(24), h = new Headers(H);
  await env.EB.put("asess:" + t, "1", { expirationTtl: ttl });
  h.append("set-cookie", "eb_a=" + t + "; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + ttl);
  // a device the panel has not seen before: a note on Telegram (a long-lived device mark, separate from the session)
  let dev = cookie(request, "eb_d"); if (!/^[a-f0-9]{32}$/.test(dev) || !(await env.EB.get("adev:" + dev))) {
    dev = randHex(16); await env.EB.put("adev:" + dev, "1", { expirationTtl: 400 * 86400 }); await adminAlert(env, request, "device"); }
  h.append("set-cookie", "eb_d=" + dev + "; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + 400 * 86400);
  return new Response(JSON.stringify(body), { headers: h });
}
const passkeyRequest = (cfg, challenge, rpId) => cfg.passkeys && cfg.passkeys.length ? { challenge, rpId, timeout: 90000, userVerification: "required",
  allowCredentials: cfg.passkeys.map(p => ({ type: "public-key", id: p.id, transports: p.tr && p.tr.length ? p.tr : undefined })) } : null;
// the second step: an app code, a backup code, or a passkey signed over this challenge. Mutates cfg (replay step, used code, counter).
async function second(cfg, d, challenge, request){
  if (d.passkey) { const { origin, rpId } = where(request); return !!challenge && !!(await verifyAssertion(cfg.passkeys, d.passkey, challenge, origin, rpId)); }
  const code = String(d.code || "");
  if (/^\D*\d{3}\D*\d{3}\D*$/.test(code)) { const s = await totpCheck(cfg.totp, code, cfg.lastStep || 0); if (s) { cfg.lastStep = s; return true; } return false; }
  return useBackup(cfg, code);
}

export async function onRequestGet({ request, env }) {
  if (!env.ADMIN_PASSWORD && !(await env.EB.get("auth:hash"))) return json({ ok: false, error: "no password set" }, 500);
  const q = new URL(request.url).searchParams, auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {   // sign-in, step one
    if (!(await adminPwOk(request, env, auth.slice(7)))) return json({ ok: false }, 401);
    const cfg = await load(env), remember = !!q.get("remember");
    if (!cfg) return openSession(env, request, remember);
    const ticket = randHex(24), challenge = randB64u(32);
    await env.EB.put("a2t:" + ticket, JSON.stringify({ remember, challenge, tries: 0 }), { expirationTtl: 300 });
    return json({ ok: false, need2fa: true, ticket, totp: !!cfg.totp, passkey: passkeyRequest(cfg, challenge, where(request).rpId) });
  }
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  if (!q.get("status")) return json({ ok: true, session: true });
  const cfg = await load(env); let sessions = 0, cursor;
  do { const r = await env.EB.list({ prefix: "asess:", cursor }); sessions += r.keys.length; cursor = r.list_complete ? null : r.cursor; } while (cursor);
  return json({ ok: true, enabled: !!cfg, since: cfg && cfg.since || null, totp: !!(cfg && cfg.totp), backupLeft: cfg ? (cfg.backup || []).length : 0, sessions,
    passkeys: cfg ? (cfg.passkeys || []).map(p => ({ id: p.id, name: p.name, at: p.at })) : [] });
}

export async function onRequestDelete({ request, env }) {
  const s = (request.headers.get("cookie") || "").match(SESSION);
  if (s) await env.EB.delete("asess:" + s[1]);
  return new Response(JSON.stringify({ ok: true }), { headers: { ...H, "set-cookie": "eb_a=; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" } });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  if (d.action === "verify") {   // sign-in, step two
    const tk = /^[a-f0-9]{48}$/.test(d.ticket || "") && JSON.parse(await env.EB.get("a2t:" + d.ticket) || "null");
    if (!tk) return json({ ok: false, error: "expired" }, 401);
    const cfg = await load(env); if (!cfg) return json({ ok: false, error: "expired" }, 401);
    if (!(await second(cfg, d, tk.challenge, request))) {
      tk.tries++;
      if (tk.tries >= 5) await env.EB.delete("a2t:" + d.ticket); else await env.EB.put("a2t:" + d.ticket, JSON.stringify(tk), { expirationTtl: 300 });
      // wrong second steps count toward the same lockout as wrong passwords
      const fk = "fail:" + (request.headers.get("cf-connecting-ip") || "x"), n = +(await env.EB.get(fk) || 0) + 1;
      await env.EB.put(fk, String(n), { expirationTtl: 3600 }); if (n === 10) await adminAlert(env, request, "lock");
      return json({ ok: false, error: tk.tries >= 5 ? "expired" : "code" }, 401);
    }
    await env.EB.delete("a2t:" + d.ticket); await save(env, cfg);
    return openSession(env, request, tk.remember);
  }

  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const { origin, rpId } = where(request);
  const cfg = await load(env) || { since: null, totp: null, passkeys: [], backup: [] };
  // the first method turns two-step on and makes the backup codes (shown once)
  const enable = async () => { let codes; if (!cfg.since) { cfg.since = new Date().toISOString(); const b = await newBackup(); cfg.backup = b.hashes; codes = b.codes; }
    await save(env, cfg); return json({ ok: true, codes }); };
  // removing a method or making new backup codes: the password and a second step, not the session alone
  const stepUp = async () => {
    if (!(await adminPwOk(request, env, String(d.password || "")))) return "password";
    const ch = d.passkey ? (await env.EB.get("a2c:" + d.challenge)) === "step" && d.challenge : null; if (ch) await env.EB.delete("a2c:" + d.challenge);
    return (await second(cfg, d, ch, request)) ? "" : "code";
  };

  if (d.action === "totpStart") {
    const secret = newSecret(); await env.EB.put("a2s:pending", secret, { expirationTtl: 900 });
    return json({ ok: true, secret, uri: otpauth(secret) });
  }
  if (d.action === "totpConfirm") {
    const secret = await env.EB.get("a2s:pending"); if (!secret) return json({ ok: false, error: "expired" }, 400);
    const s = await totpCheck(secret, d.code); if (!s) return json({ ok: false, error: "code" }, 400);
    await env.EB.delete("a2s:pending"); cfg.totp = secret; cfg.lastStep = s; return enable();
  }
  if (d.action === "passkeyStart" || d.action === "stepStart") {
    const challenge = randB64u(32); await env.EB.put("a2c:" + challenge, d.action === "passkeyStart" ? "add" : "step", { expirationTtl: 300 });
    if (d.action === "stepStart") return json({ ok: true, challenge, passkey: passkeyRequest(cfg, challenge, rpId) });
    return json({ ok: true, options: { challenge, timeout: 90000, attestation: "none", rp: { name: "Eyeblink Studio", id: rpId },
      user: { id: "ZXllYmxpbmstYWRtaW4", name: "Eyeblink admin", displayName: "Eyeblink Studio" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      excludeCredentials: (cfg.passkeys || []).map(p => ({ type: "public-key", id: p.id })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" } } });
  }
  if (d.action === "passkeyAdd") {
    const c = d.credential || {}, ch = String(d.challenge || "");
    if ((await env.EB.get("a2c:" + ch)) !== "add") return json({ ok: false, error: "expired" }, 400);
    await env.EB.delete("a2c:" + ch);
    const pk = await verifyRegistration(c, ch, origin, rpId); if (!pk) return json({ ok: false, error: "passkey" }, 400);
    if ((cfg.passkeys || []).some(p => p.id === pk.id)) return json({ ok: false, error: "exists" }, 409);
    (cfg.passkeys ||= []).push({ ...pk, name: String(d.name || "").trim().slice(0, 40) || "Passkey", at: new Date().toISOString() });
    if (cfg.passkeys.length > 10) return json({ ok: false, error: "too many" }, 400);
    return enable();
  }
  if (d.action === "remove" || d.action === "backupNew") {
    if (!cfg.since) return json({ ok: false }, 400);
    const bad = await stepUp(); if (bad) return json({ ok: false, error: bad }, 403);
    if (d.action === "backupNew") { const b = await newBackup(); cfg.backup = b.hashes; await save(env, cfg); return json({ ok: true, codes: b.codes }); }
    if (d.what === "totp") cfg.totp = null; else cfg.passkeys = (cfg.passkeys || []).filter(p => p.id !== d.what);
    await save(env, cfg);
    if (!cfg.totp && !cfg.passkeys.length) await adminAlert(env, request, "off");
    return json({ ok: true, enabled: !!(cfg.totp || cfg.passkeys.length) });
  }
  if (d.action === "logoutAll") { await endSessions(env); return json({ ok: true }); }

  // change the password: the current one is checked too (same lockout as signing in)
  if (!d.current || !(await adminPwOk(request, env, String(d.current)))) return json({ ok: false, error: "current" }, 403);
  if (!d.newPassword || d.newPassword.length < 10) return json({ ok: false, error: "min 10 characters" }, 400);
  await env.EB.put("auth:hash", await adminPwHash(d.newPassword));
  await endSessions(env);   // from now on only the new password gets in…
  const t = randHex(24); await env.EB.put("asess:" + t, "1", { expirationTtl: 12 * 3600 });   // …and this panel stays signed in
  return new Response(JSON.stringify({ ok: true }), { headers: { ...H, "set-cookie": "eb_a=" + t + "; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200" } });
}
async function endSessions(env){ let cursor; do { const r = await env.EB.list({ prefix: "asess:", cursor }); for (const k of r.keys) await env.EB.delete(k.name); cursor = r.list_complete ? null : r.cursor; } while (cursor); }
