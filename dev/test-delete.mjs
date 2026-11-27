// Guards self-deletion (27 Nov 2026): an account is removed only after its 14 days, and the money stays (invoices, paid site orders),
// while everything else about the client goes. Run: node dev/test-delete.mjs  (no dependencies)
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import assert from "node:assert/strict";

const at = new URL("../functions/_lib/.shared-test.mjs", import.meta.url);
writeFileSync(at, readFileSync(new URL("../functions/_lib/shared.js", import.meta.url), "utf8"));
const m = await import(at.href).finally(() => rmSync(at));

const day = 864e5, past = new Date(Date.now() - day).toISOString(), future = new Date(Date.now() + 5 * day).toISOString();
const kv = new Map([
  ["user:gone@x.co", JSON.stringify({ email: "gone@x.co", name: "Gone", del: { at: past, until: past } })],
  ["delq:gone@x.co", past],
  ["user:wait@x.co", JSON.stringify({ email: "wait@x.co", name: "Wait", del: { at: past, until: future } })],
  ["delq:wait@x.co", future],
  ["user:back@x.co", JSON.stringify({ email: "back@x.co", name: "Back" })],   // restored: no «del» any more
  ["delq:back@x.co", future],
  ["order:2026:EB-1", JSON.stringify({ email: "gone@x.co", code: "EB-1", paid: true })],
  ["order:2026:EB-2", JSON.stringify({ email: "gone@x.co", code: "EB-2" })],
  ["code:EB-2", "order:2026:EB-2"],
]);
const EB = {
  get: async k => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, String(v)); }, delete: async k => { kv.delete(k); },
  list: async ({ prefix }) => ({ keys: [...kv.keys()].filter(k => k.startsWith(prefix || "")).map(name => ({ name })), list_complete: true }),
};
const ran = [];
const DB = {
  prepare: sql => ({ bind: (...a) => ({ sql, a, all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) }),
  batch: async list => { for (const s of list) ran.push(s.sql + " ← " + s.a.join(",")); return []; },
};
await m.sweepDeletions({ EB, DB });

// the account whose 14 days are over is gone, with its rows; its invoices are not touched
assert.equal(kv.get("user:gone@x.co"), undefined, "the expired account is deleted");
assert.equal(kv.get("delq:gone@x.co"), undefined, "its place in the queue is cleared");
assert.ok(ran.some(s => /DELETE FROM tasks WHERE client_email=\? ← gone@x.co/.test(s)), "its tasks are deleted");
assert.ok(ran.some(s => /DELETE FROM clients WHERE email=\? ← gone@x.co/.test(s)), "its client record is deleted");
assert.ok(!ran.some(s => /DELETE FROM invoices/.test(s)), "its invoices stay, for the accounts");
assert.ok(kv.has("order:2026:EB-1"), "a paid site order stays");
assert.ok(!kv.has("order:2026:EB-2") && !kv.has("code:EB-2"), "an unpaid site order goes, with its code");
// still within its days: untouched; restored: only the stale queue entry goes
assert.ok(kv.has("user:wait@x.co") && kv.has("delq:wait@x.co"), "an account still within its 14 days stays");
assert.ok(!ran.some(s => /wait@x\.co/.test(s)), "nothing of it is deleted");
assert.ok(kv.has("user:back@x.co") && !kv.has("delq:back@x.co"), "a restored account stays, and leaves the queue");
assert.ok(!ran.some(s => /back@x\.co/.test(s)), "nothing of a restored account is deleted");
// the sweep runs at most once an hour
const before = ran.length; kv.set("user:gone2@x.co", JSON.stringify({ email: "gone2@x.co", del: { until: past } })); kv.set("delq:gone2@x.co", past);
await m.sweepDeletions({ EB, DB }); assert.equal(ran.length, before, "a second sweep within the hour does nothing");
// the studio's own purge (keepMoney off) still removes invoices
ran.length = 0; await m.purgeClient({ EB }, DB, "admin@x.co"); assert.ok(ran.some(s => /DELETE FROM invoices WHERE client_email=\? ← admin@x.co/.test(s)), "the studio's purge still removes invoices");
console.log("self-deletion: ok");
