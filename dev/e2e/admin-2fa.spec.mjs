// Two-step sign-in in the real panel, with Chrome's virtual authenticator standing in for a phone's fingerprint:
// add a passkey and the app, then sign in with each (and a backup code), then remove both so two-step is off again.
// Runs before flow.spec (alphabetical) and leaves the panel as it found it.
import { test, expect } from "@playwright/test";
import { ADMIN_PASSWORD } from "../playwright.config.mjs";
import { totpAt } from "../../functions/_lib/twofa.js";

const signInPassword = async page => {
  await page.goto("/admin/settings");
  await page.locator('#pw').fill(ADMIN_PASSWORD);
  await page.locator('#pw').press("Enter");
};
const signOut = async page => { await page.locator("#logoutBtn").click(); await expect(page.locator("#loginForm")).toBeVisible(); };
const inPanel = page => expect(page.locator("#app")).toBeVisible({ timeout: 15_000 });

test("passkey, app code and backup code", async ({ page, request }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

  await signInPassword(page); await inPanel(page);
  const box = page.locator("#tfaBox");
  await expect(box.locator(".pill")).toHaveText("غير مفعّل");

  // a passkey first: it turns two-step on and shows the ten backup codes once
  await page.locator("#tfaKeyName").fill("هاتف الاختبار");
  await box.locator('[data-tfa="addKey"]').click();
  await expect(box.locator(".tfa-codes span")).toHaveCount(10);
  const codes = await box.locator(".tfa-codes span").allTextContents();
  await box.locator('[data-tfa="saved"]').click();
  await expect(box.locator(".pill")).toHaveText("مفعّل");
  await expect(box).toContainText("هاتف الاختبار");

  // then the app
  await box.locator('[data-tfa="totp"]').click();
  const secret = (await box.locator(".tfa-secret").textContent()).replace(/\s/g, "");
  await page.locator("#tfaNew").fill(await totpAt(secret, Math.floor(Date.now() / 30000)));
  await box.locator('[data-tfa="totpOk"]').click();
  await expect(box).toContainText("مربوط");

  // the password alone opens nothing now
  expect((await request.get("/api/orders", { headers: { authorization: "Bearer " + ADMIN_PASSWORD } })).status()).toBe(401);

  // sign in with the passkey
  await signOut(page); await signInPassword(page);
  await expect(page.locator("#tfaForm")).toBeVisible();
  await expect(page.locator("#tfaRemember")).toBeVisible();
  await page.locator("#tfaKey").click(); await inPanel(page);

  // with a code from the app (the next 30 s step: the one used to link it is spent)
  await signOut(page); await signInPassword(page);
  await page.locator("#tfaCode").fill("000000"); await page.locator("#tfaCode").press("Enter");
  await expect(page.locator("#tfaMsg")).toHaveText("الرمز غير صحيح.");
  await page.locator("#tfaCode").fill(await totpAt(secret, Math.floor(Date.now() / 30000) + 1));
  await page.locator("#tfaCode").press("Enter"); await inPanel(page);

  // with a backup code
  await signOut(page); await signInPassword(page);
  await page.locator("#tfaBackup").click();
  await page.locator("#tfaCode").fill(codes[0]); await page.locator("#tfaCode").press("Enter"); await inPanel(page);

  // remove both (password + a second step each time): two-step is off again
  await page.goto("/admin/settings"); await expect(box.locator(".pill")).toHaveText("مفعّل");
  await box.locator('[data-tfa="rmTotp"]').click();
  await page.locator("#tfaPw").fill(ADMIN_PASSWORD); await page.locator("#tfaStepCode").fill(codes[1]);
  await box.locator('[data-tfa="stepCode"]').click();
  await expect(box).not.toContainText("مربوط");
  await box.locator('[data-tfa="rmKey"]').click();
  await page.locator("#tfaPw").fill(ADMIN_PASSWORD);
  await box.locator('[data-tfa="stepKey"]').click();
  await expect(box.locator(".pill")).toHaveText("غير مفعّل");
  expect((await request.get("/api/orders", { headers: { authorization: "Bearer " + ADMIN_PASSWORD } })).status()).toBe(200);
});
