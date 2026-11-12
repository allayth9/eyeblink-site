// Guards the team's privacy rules. Run: node dev/test-team.mjs  (no dependencies)
// 1) what a member receives never carries the client, the order, the studio's note or the client price
// 2) no work before the collaboration agreement is signed
// 3) a paused member has no session
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import assert from "node:assert/strict";

// a copy next to team.js (so its import of ../_lib/shared.js resolves) that also exports the parts under test
const at = new URL("../functions/api/.team-test.mjs", import.meta.url);
writeFileSync(at, readFileSync(new URL("../functions/api/team.js", import.meta.url), "utf8") + "\nexport { memberTask, memberAction, member };");
const m = await import(at.href).finally(() => rmSync(at));

const task = { id: "t_1", member: "a@b.co", title: "Reel", alias: "Project Amber", brief: "b", links: [], due: "2026-11-10", fee: 40, cur: "$",
  status: "assigned", orderKey: "order:2026:EB-SECRET", projectId: "p_secret", internal: "client pays 450", clientPrice: 450, createdAt: "x" };
const out = JSON.stringify(m.memberTask(task));
for (const leak of ["EB-SECRET", "p_secret", "client pays", "450"]) assert.ok(!out.includes(leak), "member view leaks " + leak);
assert.equal(m.memberTask(task).fee, 40, "the member still sees their own fee");

const kv = new Map([["ttask:t_1", JSON.stringify(task)], ["tsess:" + "a".repeat(48), "a@b.co"]]);
const env = { EB: { get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v), delete: async k => kv.delete(k) } };
const ctx = { env, waitUntil() {} };
const r = await m.memberAction(ctx, { email: "a@b.co", status: "active", contract: { signedAt: null } }, { action: "start", id: "t_1" });
assert.equal(r.status, 403, "unsigned member is blocked");
assert.equal((await r.json()).error, "contract");

const req = new Request("https://x/", { headers: { cookie: "eb_t=" + "a".repeat(48) } });
kv.set("member:a@b.co", JSON.stringify({ email: "a@b.co", status: "paused" }));
assert.equal(await m.member(req, env), null, "paused member has no session");
kv.set("member:a@b.co", JSON.stringify({ email: "a@b.co", status: "active" }));
assert.ok(await m.member(req, env), "active member keeps the session");

console.log("team privacy: ok");
