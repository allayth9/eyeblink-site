// Guards client accounts against pre-hijacking. Run: node dev/test-account.mjs  (no dependencies)
// Anyone can register any address with a password. When the real owner later signs in with Google,
// that password must stop working and every session opened with it must end.
import assert from "node:assert/strict";
const { onRequestPost, onRequestGet } = await import("../functions/api/account.js");

const kv = new Map([["content", JSON.stringify({ settings: { googleClientId: "cid" } })]]);
const env = { EB: { get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, String(v)), delete: async k => kv.delete(k) } };
globalThis.fetch = async () => new Response(JSON.stringify({ aud: "cid", email_verified: "true", exp: String(Date.now() / 1000 + 600), email: "owner@client.co", name: "Owner" }));
const call = async (body, cookie = "") => {
  const r = await onRequestPost({ request: new Request("https://x/api/account", { method: "POST", body: JSON.stringify(body), headers: { cookie, "cf-connecting-ip": "1.1.1.1" } }), env });
  return { status: r.status, cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
};
const me = async cookie => (await (await onRequestGet({ request: new Request("https://x/api/account?lite=1", { headers: { cookie } }), env })).json()).ok;

// the squatter registers the owner's address and stays signed in
const squat = await call({ action: "register", email: "owner@client.co", password: "squatter-pass", name: "Squatter" });
assert.equal(squat.status, 200); assert.ok(await me(squat.cookie), "squatter is signed in");
// the owner signs in with Google
const owner = await call({ action: "google", credential: "t" });
assert.equal(owner.status, 200); assert.ok(await me(owner.cookie), "owner is signed in");
assert.equal(await me(squat.cookie), false, "the squatter's session ended");
assert.notEqual((await call({ action: "login", email: "owner@client.co", password: "squatter-pass" })).status, 200, "the squatter's password no longer works");
// a later Google sign-in by the owner does not sign the owner out
const again = await call({ action: "google", credential: "t" });
assert.ok(await me(owner.cookie) && await me(again.cookie), "the owner's own sessions stay");
console.log("account pre-hijacking: ok");
