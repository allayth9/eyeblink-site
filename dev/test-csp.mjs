// Guards the CSP report collector: bounded (5 per line, 100 lines a day), ignores add-ons, panel-only to read.
// Run: node dev/test-csp.mjs  (no dependencies)
import assert from "node:assert/strict";
const { onRequestPost, onRequestGet } = await import("../functions/api/csp.js");
const kv = new Map(); let writes = 0;
const env = { EB: { get: async k => kv.get(k) ?? null, put: async (k, v) => { writes++; kv.set(k, String(v)); } } };
const send = r => onRequestPost({ request: new Request("https://x/api/csp", { method: "POST", body: JSON.stringify({ "csp-report": r }) }), env });
const rep = (blocked, page = "/work.html") => ({ "document-uri": "https://eyeblinkstudio.com" + page, "effective-directive": "script-src-elem", "blocked-uri": blocked });

for (let i = 0; i < 20; i++) assert.equal((await send(rep("https://evil.example/a.js?x=" + i))).status, 204);
const day = () => JSON.parse([...kv.values()][0]);
assert.deepEqual(day(), { "script-src-elem https://evil.example · /work": 5 }, "one line per origin and page, counted up to 5");
assert.equal(writes, 5, "no writes after the cap");
await send(rep("chrome-extension://abc/x.js")); assert.equal(Object.keys(day()).length, 1, "the visitor's add-ons are ignored");
await send(rep("inline")); assert.ok("script-src-elem inline · /work" in day());
for (let i = 0; i < 150; i++) await send(rep("https://h" + i + ".example/x.js"));
assert.equal(Object.keys(day()).length, 100, "at most 100 lines a day");
assert.equal((await send(null)).status, 204);
assert.equal((await onRequestGet({ request: new Request("https://x/api/csp"), env })).status, 401, "reading them needs the panel");
console.log("csp reports: ok");
