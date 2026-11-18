// The two counters that moved to D1: invoice numbers (never shared, even when made at the same moment)
// and the daily visit totals (read back by the panel, without touching KV's daily write allowance).
// (four, not more: the site allows six requests an hour from one address, and flow.spec needs one)
import { test, expect } from "@playwright/test";
import { ADMIN_PASSWORD, PORT } from "../playwright.config.mjs";

const admin = { authorization: "Bearer " + ADMIN_PASSWORD };

test("four invoices at the same moment get four numbers", async ({ browser, request }) => {
  const client = await browser.newContext();
  expect((await client.request.post("/api/account", { data: { action: "register", name: "Counter", email: `counter.${Date.now()}@example.test`, password: "e2e-pass-123456" } })).status()).toBe(200);
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await (await client.request.post("/api/orders", { data: { details: "invoice " + i, packageName: "E2E" } })).json()).code);
  const all = (await (await request.get("/api/orders", { headers: admin })).json()).orders.filter(o => codes.includes(o.code));
  expect(all).toHaveLength(4);
  const res = await Promise.all(all.map(o => request.patch("/api/orders", { headers: admin, data: { key: o.key, price: "$100", paid: true } })));
  const nos = await Promise.all(res.map(async r => { expect(r.status()).toBe(200); return (await r.json()).order.invoice.no; }));
  expect(new Set(nos).size, nos.join(", ")).toBe(4);
  const n = nos.map(x => +x.split("-").pop()).sort((a, b) => a - b);
  expect(n[3] - n[0], "consecutive").toBe(3);
  await client.close();
});

test("visits are counted and read back", async ({ request }) => {
  const today = async () => ((await (await request.get("/api/track?days=1", { headers: admin })).json()).days.pop() || {}).views || 0;
  const before = await today();
  const origin = { origin: `http://localhost:${PORT}`, "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130" };
  for (let i = 0; i < 3; i++) expect((await request.post("/api/track", { headers: origin, data: { p: "/work", ns: i === 0, nv: i === 0, l: "ar" } })).status()).toBe(204);
  expect(await today()).toBe(before + 3);
});
