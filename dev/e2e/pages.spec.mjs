// Every public page opens, runs without a script error, and never scrolls sideways (desktop and phone)
import { test, expect } from "@playwright/test";

const PAGES = ["/", "/services", "/service-editing", "/service-motion", "/service-social", "/service-films", "/work", "/pricing", "/about", "/contact", "/privacy", "/join",
  "/en/", "/en/services", "/en/work", "/en/pricing", "/en/about", "/en/contact"];

for (const path of PAGES) {
  test(`page ${path}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    const res = await page.goto(path, { waitUntil: "load" });
    expect(res.status()).toBe(200);
    await expect(page).toHaveTitle(/\S/);
    await page.waitForTimeout(600);   // the intro motion settles
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, "no sideways scroll").toBeLessThanOrEqual(1);
    expect(errors, "no script errors").toEqual([]);
  });
}
