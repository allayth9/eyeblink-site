// The security log in settings: wrong passwords grouped, the sign-in with its method and «this device», the filters.
// Runs before security.spec (alphabetical), which locks this address out at the very end.
import { test, expect } from "@playwright/test";
import { ADMIN_PASSWORD } from "../playwright.config.mjs";

test("security log: wrong tries, the sign-in, filters", async ({ page, request }) => {
  for (const pw of ["wrong-one", "wrong-two"]) expect((await request.get("/api/auth", { headers: { authorization: "Bearer " + pw } })).status()).toBe(401);
  expect((await request.get("/api/auth?log=1")).status(), "the log is the panel's").toBe(401);

  await page.goto("/admin/settings");
  await page.locator("#pw").fill(ADMIN_PASSWORD); await page.locator("#pw").press("Enter");
  await expect(page.locator("#app")).toBeVisible({ timeout: 15_000 });
  const box = page.locator("#slBox");
  await expect(box.locator(".sl-row").first()).toContainText("دخول ناجح بكلمة السر");
  await expect(box.locator(".sl-row").first()).toContainText("هذا الجهاز");
  await expect(box).toContainText("محاولة خاطئة لكلمة السر (×2)");
  expect(+(await box.locator(".sl-kpi.wait b").textContent())).toBeGreaterThanOrEqual(2);

  await box.locator('[data-slg="login"]').click();
  await expect(box.locator(".sl-chip.on")).toHaveText("الدخول");
  await expect(box).not.toContainText("محاولة خاطئة لكلمة السر (×2)");
  for (const t of await box.locator(".sl-row b").allTextContents()) expect(t).toContain("دخول ناجح");

  // nothing secret in what the panel reads
  const raw = await (await page.request.get("/api/auth?log=1")).text();
  expect(raw).not.toContain(ADMIN_PASSWORD);
  expect(raw).not.toContain("wrong-one");
});
