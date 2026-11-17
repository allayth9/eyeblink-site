// Guards the order inbox. Run: node dev/test-orders.mjs  (no dependencies)
// 1) a request's link is only ever http(s): a javascript: link never reaches the panel or the account page
// 2) a client cannot send negative unit prices
// 3) no invoice is made from the client's own estimate: the studio's price comes first
// 4) one client never reads another client's request, thread or attachment
import assert from "node:assert/strict";
const orders = await import("../functions/api/orders.js");
const thread = await import("../functions/api/thread.js");
const files = await import("../functions/api/files/[[path]].js");

const kv = new Map();
const env = { EB: {
  get: async (k, o) => { const v = kv.get(k); if (v == null) return null; return o && o.type === "arrayBuffer" ? v.value : (typeof v === "object" && v.value ? v.value : v); },
  getWithMetadata: async k => { const v = kv.get(k); return v ? { value: v.value, metadata: v.metadata } : { value: null, metadata: null }; },
  put: async (k, v, o) => kv.set(k, o && o.metadata ? { value: v, metadata: o.metadata } : String(v)),
  delete: async k => kv.delete(k), list: async ({ prefix }) => ({ keys: [...kv.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }) } };
globalThis.fetch = async () => new Response("{}");

const hex = c => c.repeat(48);
const client = (email, tok) => { kv.set("user:" + email, JSON.stringify({ email, name: email.split("@")[0], orders: [] })); kv.set("sess:" + tok, email); return "eb_s=" + tok; };
const alice = client("alice@a.co", hex("a")), bob = client("bob@b.co", hex("b"));
kv.set("asess:" + hex("c"), "1"); const admin = "eb_a=" + hex("c");
const req = (url, method, body, cookie, extra = {}) => new Request("https://x" + url, { method, body: body == null ? undefined : (typeof body === "string" || body instanceof ArrayBuffer ? body : JSON.stringify(body)), headers: { cookie, "cf-connecting-ip": "1.1.1.1", ...extra } });
const call = async (h, r) => { const res = await h({ request: r, env, params: { path: new URL(r.url).pathname.split("/").slice(3) } }); return { status: res.status, j: await res.clone().json().catch(() => null), res }; };

// 1 + 2
const sent = await call(orders.onRequestPost, req("/api/orders", "POST", { details: "a reel", link: "javascript:alert(1)", items: [{ name: "Edit", qty: 2, unit: -500 }], total: "-1000" }, alice));
assert.equal(sent.status, 200);
const key = kv.get("code:" + sent.j.code), o = JSON.parse(kv.get(key));
assert.equal(o.link, "", "a javascript: link is dropped");
assert.equal(o.items[0].unit, 0, "a negative unit price becomes 0");
const ok = await call(orders.onRequestPost, req("/api/orders", "POST", { details: "b", link: "https://drive.google.com/x" }, alice));
assert.equal(JSON.parse(kv.get(kv.get("code:" + ok.j.code))).link, "https://drive.google.com/x", "a real link stays");

// 3
const noPrice = await call(orders.onRequestPatch, req("/api/orders", "PATCH", { key, paid: true }, admin));
assert.equal(noPrice.status, 400); assert.equal(noPrice.j.error, "set price first");
assert.equal(JSON.parse(kv.get(key)).invoice, undefined, "no invoice without the studio's price");
const noPriceDep = await call(orders.onRequestPatch, req("/api/orders", "PATCH", { key, plan: "split", depositPaid: true }, admin));
assert.equal(noPriceDep.j.error, "set price first");
const priced = await call(orders.onRequestPatch, req("/api/orders", "PATCH", { key, price: "$400", paid: true }, admin));
assert.equal(priced.status, 200); assert.equal(JSON.parse(kv.get(key)).invoice.amount, 400, "the invoice uses the studio's price");

// 4
assert.equal((await call(thread.onRequestGet, req("/api/thread?code=" + sent.j.code, "GET", null, alice))).status, 200);
assert.equal((await call(thread.onRequestGet, req("/api/thread?code=" + sent.j.code, "GET", null, bob))).status, 404, "bob cannot read alice's request");
assert.equal((await call(thread.onRequestPost, req("/api/thread", "POST", { code: sent.j.code, text: "hi" }, bob))).status, 404, "bob cannot write into it");
const code2 = ok.j.code;
const up = await call(files.onRequestPost, req("/api/files", "POST", new TextEncoder().encode("brief").buffer, alice, { "x-code": code2, "x-filename": "brief.txt", "content-type": "text/plain" }));
assert.equal(up.status, 200);
const fk = up.j.file.url.split("/").pop();
const get = (cookie) => files.onRequestGet({ request: req("/api/files/" + fk, "GET", null, cookie), env, params: { path: [fk] } });
assert.equal((await get(alice)).status, 200);
assert.equal((await get(bob)).status, 404, "bob cannot open alice's attachment");
assert.equal((await get("")).status, 404, "a bare link is not enough");
assert.equal((await call(files.onRequestPost, req("/api/files", "POST", new TextEncoder().encode("x").buffer, bob, { "x-code": code2, "x-filename": "x.txt", "content-type": "text/plain" }))).status, 401, "bob cannot attach to alice's request");
assert.equal((await call(orders.onRequestGet, req("/api/orders", "GET", null, alice))).status, 401, "a client cannot list the inbox");

console.log("orders: ok");
