// Account and security e-mails reach the right person at the right moment, and only then. Run: node dev/test-account-mails.mjs  (no dependencies)
// welcome (with a confirmation link) on sign-up, the link confirms the e-mail, a new browser gets one calm alert, a known one gets none,
// a changed password is confirmed, and the reset code goes out in the new design.
import assert from "node:assert/strict";
const { onRequestPost, onRequestGet } = await import("../functions/api/account.js");

const kv = new Map();
const env = { RESEND_API_KEY: "test", EB: { get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, String(v)), delete: async k => kv.delete(k) } };
let sent = [];
globalThis.fetch = async (url, o) => { if (String(url).includes("resend")) sent.push(JSON.parse(o.body)); return new Response("{}"); };
const call = async (body, cookie = "", ua = "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36") => {
  const wait = [];
  const r = await onRequestPost({ request: new Request("https://x/api/account", { method: "POST", body: JSON.stringify(body), headers: { cookie, "user-agent": ua, "cf-connecting-ip": "1.1.1." + Math.floor(Math.random() * 200) } }), env, waitUntil: p => wait.push(p) });
  await Promise.all(wait);
  const cs = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""]).map(c => c.split(";")[0]);
  return { status: r.status, body: await r.json(), session: cs.find(c => c.startsWith("eb_s=")) || "", device: cs.find(c => c.startsWith("eb_d=")) || "" };
};
const subjects = () => { const s = sent.map(m => m.subject); sent = []; return s; };
const acct = async cookie => (await (await onRequestGet({ request: new Request("https://x/api/account", { headers: { cookie } }), env })).json());

// sign-up: one welcome e-mail carrying the confirmation link; the account shows as unconfirmed
const reg = await call({ action: "register", email: "sara@client.co", password: "first-pass-1", name: "Sara Ali", lang: "ar" });
assert.equal(reg.status, 200); assert.ok(reg.device, "the browser gets a device id");
const welcome = sent[0]; assert.deepEqual(subjects(), ["أهلاً بك في Eyeblink Studio"]);
assert.equal((await acct(reg.session)).user.unverified, true);
const token = /account\?verify=([a-f0-9]{48})/.exec(welcome.html)[1];
// the link confirms the e-mail once
assert.equal((await call({ action: "verify", token })).status, 200);
assert.equal((await acct(reg.session)).user.unverified, false);
assert.equal((await call({ action: "verify", token })).status, 400, "the link works once");

// the same browser signs in again: no alert
await call({ action: "login", email: "sara@client.co", password: "first-pass-1" }, reg.device);
assert.deepEqual(subjects(), []);
// a new browser: one calm alert with the device in it
await call({ action: "login", email: "sara@client.co", password: "first-pass-1" }, "", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1");
const alert = sent[0]; assert.deepEqual(subjects(), ["دخول جديد إلى حسابك"]); assert.match(alert.html, /Safari على iPhone/);

// accounts from before this change learn their first browser without an alert
kv.set("user:old@client.co", JSON.stringify({ email: "old@client.co", name: "Old", provider: "password", salt: "", hash: "", orders: [] }));
const old = JSON.parse(kv.get("user:old@client.co")); const { pbkdf2 } = await import("../functions/_lib/shared.js");
old.salt = "aa"; old.hash = await pbkdf2("old-pass-123", "aa"); kv.set("user:old@client.co", JSON.stringify(old));
await call({ action: "login", email: "old@client.co", password: "old-pass-123" });
assert.deepEqual(subjects(), [], "no surprise alert for an existing account's first sign-in after the change");

// changing the password is confirmed by e-mail
const s2 = await call({ action: "login", email: "sara@client.co", password: "first-pass-1" }, reg.device); subjects();
assert.equal((await call({ action: "setPassword", current: "first-pass-1", password: "second-pass-2" }, s2.session)).status, 200);
assert.deepEqual(subjects(), ["تغيّرت كلمة السر لحسابك"]);
// the reset code, then the confirmation after the reset
await call({ action: "forgot", email: "sara@client.co", lang: "ar" });
const code = /(\d{3}) (\d{3})/.exec(sent[0].html); assert.deepEqual(subjects(), ["رمز استعادة كلمة السر"]);
await call({ action: "reset", email: "sara@client.co", code: code[1] + code[2], password: "third-pass-3" });
assert.deepEqual(subjects(), ["تغيّرت كلمة السر لحسابك"]);
// Google sign-up gets the welcome without a confirmation button
globalThis.fetch = async (url, o) => { if (String(url).includes("resend")) { sent.push(JSON.parse(o.body)); return new Response("{}"); }
  return new Response(JSON.stringify({ aud: "cid", email_verified: "true", exp: String(Date.now() / 1000 + 600), email: "g@client.co", name: "Gee" })); };
env.GOOGLE_CLIENT_ID = "cid";
await call({ action: "google", credential: "t", lang: "en" });
assert.equal(sent[0].subject, "Welcome to Eyeblink Studio"); assert.doesNotMatch(sent[0].html, /verify=/); subjects();
console.log("account e-mails: ok");
