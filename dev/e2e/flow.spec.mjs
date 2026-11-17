// The main path: a client sends a request and sees it in their account; another client cannot;
// the studio signs in to the panel, finds it, and cannot bill it before setting its price
import { test, expect } from "@playwright/test";
import { ADMIN_PASSWORD } from "../playwright.config.mjs";

const stamp = Date.now();
const register = async (ctx, who) => {
  const r = await ctx.request.post("/api/account", { data: { action: "register", name: who, email: `${who}.${stamp}@example.test`, password: "e2e-pass-123456" } });
  expect(r.status()).toBe(200);
};

test("request → account → panel", async ({ browser }) => {
  const alice = await browser.newContext(), bob = await browser.newContext(), studio = await browser.newContext();
  await register(alice, "alice"); await register(bob, "bob");

  const sent = await alice.request.post("/api/orders", { data: { details: "E2E reel", link: "javascript:alert(1)", packageName: "E2E", items: [{ name: "Edit", qty: 1, unit: -50 }] } });
  expect(sent.status()).toBe(200);
  const { code } = await sent.json();

  // alice sees her request in her account, with no dangerous link
  const page = await alice.newPage();
  await page.goto("/account#" + code);
  await expect(page.getByText(code).first()).toBeVisible();
  expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);

  // bob does not
  expect((await bob.request.get("/api/thread?code=" + code)).status()).toBe(404);
  const bobPage = await bob.newPage();
  await bobPage.goto("/account");
  await expect(bobPage.getByText(code)).toHaveCount(0);

  // the studio signs in through the panel's own form and finds it
  const panel = await studio.newPage();
  await panel.goto("/admin/orders");
  await panel.locator('input[type="password"]:visible').fill(ADMIN_PASSWORD);
  await panel.keyboard.press("Enter");
  await expect(panel.getByText(code).first()).toBeVisible({ timeout: 15_000 });

  // no invoice from the client's own numbers
  const list = await (await studio.request.get("/api/orders")).json();
  const o = list.orders.find(x => x.code === code);
  expect(o.items[0].unit).toBe(0);
  const early = await studio.request.patch("/api/orders", { data: { key: o.key, paid: true } });
  expect(early.status()).toBe(400);
  const billed = await studio.request.patch("/api/orders", { data: { key: o.key, price: "$300", paid: true } });
  expect((await billed.json()).order.invoice.amount).toBe(300);

  await Promise.all([alice.close(), bob.close(), studio.close()]);
});
