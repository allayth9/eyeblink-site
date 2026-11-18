// Security headers, closed developer files, and panel-only routes that refuse anyone without the panel session
import { test, expect } from "@playwright/test";

test("security headers on pages and API", async ({ request }) => {
  for (const path of ["/", "/api/health"]) {
    const h = (await request.get(path)).headers();
    expect(h["x-frame-options"], path).toBe("SAMEORIGIN");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["strict-transport-security"], path).toContain("max-age=");
    expect(h["content-security-policy"], path).toContain("frame-ancestors 'self'");
  }
});

test("pages carry the report-only policy; reports are kept, bounded, and readable by the panel only", async ({ request }) => {
  const page = (await request.get("/")).headers()["content-security-policy-report-only"];
  expect(page).toContain("default-src 'self'"); expect(page).toContain("report-uri /api/csp");
  expect((await request.get("/api/health")).headers()["content-security-policy-report-only"], "not on API answers").toBeUndefined();
  const report = { "csp-report": { "document-uri": "http://localhost/work", "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js" } };
  for (let i = 0; i < 8; i++) expect((await request.post("/api/csp", { data: report, headers: { "content-type": "application/csp-report" } })).status()).toBe(204);
  expect((await request.post("/api/csp", { data: { "csp-report": { "blocked-uri": "chrome-extension://abc" } } })).status()).toBe(204);
  expect((await request.get("/api/csp")).status(), "the report list is the panel's").toBe(401);
});

test("developer and dot files are not served", async ({ request }) => {
  for (const path of ["/.env", "/.dev.vars", "/.gitignore", "/.github/workflows/tests.yml", "/dev/README.md", "/dev/package.json", "/dev/test-orders.mjs"])
    expect((await request.get(path)).status(), path).toBe(404);
});

test("panel routes need the panel session", async ({ request }) => {
  for (const [method, path] of [["GET", "/api/orders"], ["GET", "/api/users"], ["GET", "/api/private"], ["GET", "/api/backup"], ["GET", "/api/work?admin=1"],
    ["GET", "/api/team?admin=1"], ["PATCH", "/api/orders"], ["PUT", "/api/content"], ["POST", "/api/translate"]])
    expect((await request.fetch(path, { method, data: method === "GET" ? undefined : {} })).status(), method + " " + path).toBe(401);
  expect((await request.get("/api/orders", { headers: { authorization: "Bearer wrong-password" } })).status()).toBe(401);
});
