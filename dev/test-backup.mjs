// Guards the backup file: it carries the business data, and never a password, a session, a sign-in code or an invite link.
// Run: node dev/test-backup.mjs  (no dependencies)
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import assert from "node:assert/strict";

const at = new URL("../functions/api/.backup-test.mjs", import.meta.url);
writeFileSync(at, readFileSync(new URL("../functions/api/backup.js", import.meta.url), "utf8") + "\nexport { build };");
const m = await import(at.href).finally(() => rmSync(at));

const kv = new Map([
  ["content", JSON.stringify({ hero: {}, services: [] })],
  ["order:2026:EB-1", JSON.stringify({ code: "EB-1", name: "Client", price: "$300" })],
  ["user:a@b.co", JSON.stringify({ email: "a@b.co", name: "A", hash: "H", salt: "S", sv: 3 })],
  ["member:m@b.co", JSON.stringify({ email: "m@b.co", hash: "MH", tmpPass: "T" })],
  ["sess:abc", "a@b.co"], ["asess:x", "1"], ["tsess:y", "m@b.co"], ["code:a@b.co", "123456"], ["reset:a@b.co", "1"],
  ["invite:tok", JSON.stringify({ email: "c@d.co" })], ["auth:hash", "pbkdf2$1$s$h"], ["backup:1", "{}"],
  ["media:pic", "BINARY"], ["file:doc", "BINARY"]
]);
const env = { EB: {
  list: async ({ prefix }) => ({ keys: [...kv.keys()].filter(k => k.startsWith(prefix || "")).map(name => ({ name })), list_complete: true }),
  get: async k => kv.get(k) ?? null } };
const b = await m.build(env), s = JSON.stringify(b);

assert.ok(b.kv.content && b.kv["order:2026:EB-1"], "the content and the requests are in it");
assert.equal(b.kv["user:a@b.co"].name, "A", "a client's record is in it");
for (const k of ["sess:abc", "asess:x", "tsess:y", "code:a@b.co", "reset:a@b.co", "invite:tok", "auth:hash", "backup:1", "media:pic", "file:doc"]) assert.ok(!(k in b.kv), k + " must not be in the backup");
for (const leak of ['"hash"', '"salt"', '"sv"', '"tmpPass"', "pbkdf2$", "BINARY"]) assert.ok(!s.includes(leak), "the backup leaks " + leak);
assert.deepEqual(b.files.kv.map(f => f.key).sort(), ["file:doc", "media:pic"], "media files are listed by name only");
console.log("backup privacy: ok");
