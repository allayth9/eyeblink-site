// Guards the panel's two-step sign-in. Run: node dev/test-2fa.mjs  (no dependencies)
// 1) without two-step: the password signs in, as before
// 2) with it on: the password alone opens nothing (not the sign-in, not a Bearer call to any route)
// 3) app codes: right one works once, wrong/replayed ones fail, five misses end the ticket
// 4) backup codes work once; a passkey (simulated authenticator, real signatures) signs in; a forged one does not
// 5) removing a method needs the password and a second step; removing the last turns two-step off
// 6) Telegram notes: new device, two-step off
import assert from "node:assert/strict";
const auth = await import("../functions/api/auth.js");
const { isAdmin } = await import("../functions/_lib/shared.js");
const { totpAt, b64u } = await import("../functions/_lib/twofa.js");

const kv = new Map(), tg = [];
const env = { ADMIN_PASSWORD: "panel-pass-123", TELEGRAM_TOKEN: "t", TELEGRAM_CHAT: "c", EB: {
  get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, String(v)), delete: async k => kv.delete(k),
  list: async ({ prefix }) => ({ keys: [...kv.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }) } };
globalThis.fetch = async (u, o) => { if (String(u).includes("telegram")) tg.push(JSON.parse(o.body).text); return new Response(JSON.stringify({ ok: true })); };

const ORIGIN = "https://eyeblinkstudio.com";
const jar = {}; const cookies = () => Object.entries(jar).map(([k, v]) => k + "=" + v).join("; ");
const keep = r => { for (const c of r.headers.getSetCookie()) { const [kv0] = c.split(";"); const [k, v] = kv0.split("="); if (v) jar[k] = v; else delete jar[k]; } return r; };
const req = (method, path, body, extra = {}) => new Request(ORIGIN + path, { method, body: body ? JSON.stringify(body) : undefined, headers: { cookie: cookies(), "cf-connecting-ip": "9.9.9.9", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130", ...extra } });
const get = async (path, extra) => { const r = keep(await auth.onRequestGet({ request: req("GET", path, null, extra), env })); return { s: r.status, j: await r.json() }; };
const post = async body => { const r = keep(await auth.onRequestPost({ request: req("POST", "/api/auth", body), env })); return { s: r.status, j: await r.json() }; };
const bearer = { authorization: "Bearer panel-pass-123" };
const code = async (secret, offset = 0) => totpAt(secret, Math.floor(Date.now() / 30000) + offset);

// 1
assert.equal((await get("/api/auth", { authorization: "Bearer wrong" })).s, 401);
assert.equal((await get("/api/auth?remember=1", bearer)).j.ok, true, "the password signs in while two-step is off");
assert.ok(jar.eb_a && jar.eb_d); assert.equal(tg.filter(t => t.includes("جهاز جديد")).length, 1, "a new device is announced");
assert.equal((await get("/api/auth?remember=1", bearer)).j.ok, true); assert.equal(tg.filter(t => t.includes("جهاز جديد")).length, 1, "a known device is not");

// enable the app
const st = await post({ action: "totpStart" }); const secret = st.j.secret; assert.match(st.j.uri, /^otpauth:\/\/totp\//);
assert.equal((await post({ action: "totpConfirm", code: "000000" })).s, 400);
const on = await post({ action: "totpConfirm", code: await code(secret) });
assert.equal(on.j.codes.length, 10, "ten backup codes, shown once");
const backup = on.j.codes;

// 2
assert.equal(await isAdmin(new Request(ORIGIN + "/api/orders", { headers: { ...bearer, "cf-connecting-ip": "8.8.8.8" } }), env), false, "Bearer password alone no longer opens a route");
delete jar.eb_a;
const s1 = await get("/api/auth?remember=1", bearer); assert.equal(s1.j.need2fa, true); assert.equal(s1.j.totp, true); assert.equal(s1.j.passkey, null);
assert.equal(jar.eb_a, undefined, "no session after the password alone");

// 3
assert.equal((await post({ action: "verify", ticket: s1.j.ticket, code: "123456" })).s, 401);
const now = await code(secret, 1);   // the next step: the one used to enable is spent
assert.equal((await post({ action: "verify", ticket: s1.j.ticket, code: now })).j.ok, true, "the right code signs in");
assert.ok(jar.eb_a);
const sessOk = jar.eb_a; delete jar.eb_a;
const s2 = await get("/api/auth", bearer);
assert.equal((await post({ action: "verify", ticket: s2.j.ticket, code: now })).s, 401, "a code never works twice");
for (let i = 0; i < 4; i++) await post({ action: "verify", ticket: s2.j.ticket, code: "111111" });
assert.equal((await post({ action: "verify", ticket: s2.j.ticket, code: await code(secret, 2) })).j.error, "expired", "five misses end the ticket");
kv.delete("fail:9.9.9.9");

// 4: backup code, once
const s3 = await get("/api/auth", bearer);
assert.equal((await post({ action: "verify", ticket: s3.j.ticket, code: backup[0].toLowerCase() })).j.ok, true, "a backup code signs in");
delete jar.eb_a; const s4 = await get("/api/auth", bearer);
assert.equal((await post({ action: "verify", ticket: s4.j.ticket, code: backup[0] })).s, 401, "…once");

// 4: a passkey, with a simulated authenticator
jar.eb_a = sessOk;
const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const spki = b64u(await crypto.subtle.exportKey("spki", keys.publicKey));
const rpHash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("eyeblinkstudio.com")));
const authData = (count) => { const a = new Uint8Array(37); a.set(rpHash); a[32] = 0x05; new DataView(a.buffer).setUint32(33, count); return a; };
const cdj = (type, challenge) => new TextEncoder().encode(JSON.stringify({ type, challenge, origin: ORIGIN }));
const der = raw => { const int = b => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); return b[0] & 0x80 ? [0, ...b] : [...b]; };
  const r = int(raw.slice(0, 32)), s = int(raw.slice(32)); return new Uint8Array([0x30, r.length + s.length + 4, 0x02, r.length, ...r, 0x02, s.length, ...s]); };
const ps = await post({ action: "passkeyStart" }); const ch = ps.j.options.challenge;
assert.equal(ps.j.options.authenticatorSelection.userVerification, "required");
const added = await post({ action: "passkeyAdd", challenge: ch, name: "iPhone", credential: { id: "cred-1", alg: -7, publicKey: spki,
  clientDataJSON: b64u(cdj("webauthn.create", ch)), authenticatorData: b64u(authData(0)), transports: ["hybrid", "internal"] } });
assert.equal(added.j.ok, true); assert.equal(added.j.codes, undefined, "backup codes only come with the first method");
const assertion = async (challenge, count, key = keys.privateKey) => { const ad = authData(count), c = cdj("webauthn.get", challenge);
  const data = new Uint8Array([...ad, ...new Uint8Array(await crypto.subtle.digest("SHA-256", c))]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, data));
  return { id: "cred-1", clientDataJSON: b64u(c), authenticatorData: b64u(ad), signature: b64u(der(sig)) }; };
delete jar.eb_a;
const s5 = await get("/api/auth?remember=1", bearer); assert.equal(s5.j.passkey.allowCredentials[0].id, "cred-1");
const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
assert.equal((await post({ action: "verify", ticket: s5.j.ticket, passkey: await assertion(s5.j.passkey.challenge, 1, other.privateKey) })).s, 401, "a forged passkey fails");
assert.equal((await post({ action: "verify", ticket: s5.j.ticket, passkey: await assertion("another-challenge", 1) })).s, 401, "another challenge fails");
assert.equal((await post({ action: "verify", ticket: s5.j.ticket, passkey: await assertion(s5.j.passkey.challenge, 1) })).j.ok, true, "the passkey signs in");

// 5
const status = await get("/api/auth?status=1"); assert.equal(status.j.enabled, true); assert.equal(status.j.backupLeft, 9); assert.equal(status.j.passkeys.length, 1);
assert.equal((await post({ action: "remove", what: "totp", password: "panel-pass-123" })).s, 403, "removing needs a second step");
assert.equal((await post({ action: "remove", what: "totp", password: "nope", code: backup[1] })).j.error, "password");
assert.equal((await post({ action: "remove", what: "totp", password: "panel-pass-123", code: backup[1] })).j.enabled, true);
const sc = await post({ action: "stepStart" });
assert.equal((await post({ action: "remove", what: "cred-1", password: "panel-pass-123", challenge: sc.j.challenge, passkey: await assertion(sc.j.challenge, 2) })).j.enabled, false, "the last method off: two-step off");
assert.equal(kv.get("auth:2fa"), undefined);
assert.ok(tg.some(t => t.includes("أُوقف التحقق بخطوتين")), "turning it off is announced");
assert.equal(await isAdmin(new Request(ORIGIN + "/api/orders", { headers: { ...bearer, "cf-connecting-ip": "8.8.8.8" } }), env), true, "with it off the password works again");

// the backup never carries the two-step settings
assert.match(String((await import("node:fs")).readFileSync(new URL("../functions/api/backup.js", import.meta.url), "utf8").match(/const SKIP = .*/)[0]), /auth:\|adev:/);

console.log("two-step sign-in: ok");
