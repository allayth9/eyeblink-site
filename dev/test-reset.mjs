// Guards the client password reset. Run: node dev/test-reset.mjs  (no dependencies)
// 1) a code works once; 2) asking for new codes does not buy more guesses: ten wrong ones an hour per address, from any IP;
// 3) at most three codes an hour reach an inbox, and the answer stays the same (no account enumeration)
import assert from "node:assert/strict";
const { onRequestPost } = await import("../functions/api/account.js");

const kv = new Map([["user:owner@client.co", JSON.stringify({ email: "owner@client.co", name: "Owner", hash: "h", salt: "s", orders: [] })]]);
const env = { RESEND_API_KEY: "k", EB: { get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, String(v)), delete: async k => kv.delete(k) } };
let mails = 0; globalThis.fetch = async () => { mails++; return new Response("{}"); };
let ip = 0;   // every call from a new address: the per-IP limit is not what holds the line here
const call = async body => { const r = await onRequestPost({ request: new Request("https://x/api/account", { method: "POST", body: JSON.stringify(body), headers: { "cf-connecting-ip": "10.0.0." + (++ip) } }), env }); return { s: r.status, j: await r.json() }; };
const code = () => JSON.parse(kv.get("reset:owner@client.co")).code;
const wrong = c => String((+c + 1) % 1000000).padStart(6, "0");

assert.deepEqual((await call({ action: "forgot", email: "nobody@x.co" })).j, { ok: true }, "no account: the same answer");
await call({ action: "forgot", email: "owner@client.co" }); assert.equal(mails, 1);

// ten wrong guesses, spread over fresh codes and fresh IPs
for (let i = 0; i < 10; i++) {
  if (i === 4 || i === 8) await call({ action: "forgot", email: "owner@client.co" });
  assert.equal((await call({ action: "reset", email: "owner@client.co", code: wrong(code()), password: "new-pass-123" })).s, 400);
}
assert.equal(mails, 3, "three codes reached the inbox");
await call({ action: "forgot", email: "owner@client.co" });
assert.equal(mails, 3, "a fourth code in the hour is not sent…");
assert.deepEqual((await call({ action: "forgot", email: "owner@client.co" })).j, { ok: true }, "…and the answer does not say so");
assert.equal((await call({ action: "reset", email: "owner@client.co", code: code(), password: "new-pass-123" })).s, 400, "after ten wrong guesses even the right code waits");

// an hour later (the counters expire): the right code works, once
kv.delete("rtry:owner@client.co"); kv.delete("fgt:owner@client.co");
await call({ action: "forgot", email: "owner@client.co" });
const c = code();
assert.equal((await call({ action: "reset", email: "owner@client.co", code: c, password: "new-pass-123" })).s, 200, "the right code resets");
assert.equal((await call({ action: "reset", email: "owner@client.co", code: c, password: "other-pass-123" })).s, 400, "…once");
console.log("password reset: ok");
