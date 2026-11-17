// End-to-end checks on a local copy of the site (wrangler pages dev, empty local KV/D1/R2). Run from dev/: npm run e2e
// Nothing here touches the live site.
import { defineConfig, devices } from "@playwright/test";

export const PORT = 8790;
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "e2e-local-pass-2026";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 860 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /pages\.spec/ },
  ],
  webServer: {
    command: "node e2e/serve.mjs",
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORT), ADMIN_PASSWORD },
  },
});
