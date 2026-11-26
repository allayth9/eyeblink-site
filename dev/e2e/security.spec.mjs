// Security headers, closed developer files, and panel-only routes that refuse anyone without the panel session
import { test, expect } from "@playwright/test";
import { ADMIN_PASSWORD } from "../playwright.config.mjs";

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

test("pages carry the enforced policy; reports are kept, bounded, and readable by the panel only", async ({ request }) => {
  const page = (await request.get("/")).headers()["content-security-policy"];
  expect(page).toContain("frame-ancestors 'self'"); expect(page).toContain("default-src 'self'"); expect(page).toContain("static.cloudflareinsights.com");
  expect((await request.get("/")).headers()["content-security-policy-report-only"], "no longer report-only").toBeUndefined();
  expect(page).toContain("default-src 'self'"); expect(page).toContain("report-uri /api/csp");
  expect((await request.get("/api/health")).headers()["content-security-policy"], "not on API answers").not.toContain("default-src");
  const report = { "csp-report": { "document-uri": "http://localhost/work", "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js" } };
  for (let i = 0; i < 8; i++) expect((await request.post("/api/csp", { data: report, headers: { "content-type": "application/csp-report" } })).status()).toBe(204);
  expect((await request.post("/api/csp", { data: { "csp-report": { "blocked-uri": "chrome-extension://abc" } } })).status()).toBe(204);
  expect((await request.get("/api/csp")).status(), "the report list is the panel's").toBe(401);
  const days = (await (await request.get("/api/csp", { headers: { authorization: "Bearer " + ADMIN_PASSWORD } })).json()).days;
  expect(Object.values(days).map(d => d["script-src-elem https://evil.example · /work"]).find(Boolean), "kept in D1, counted up to 5").toBe(5);
});

test("inline scripts run only with the response's nonce (no 'unsafe-inline')", async ({ request }) => {
  const seen = new Set();
  for (const path of ["/", "/work", "/account", "/admin/", "/en/pricing"]) {
    const r = await request.get(path), csp = r.headers()["content-security-policy"], html = await r.text();
    const script = csp.split("; ").find(d => d.startsWith("script-src"));
    expect(script, path).not.toContain("unsafe-inline");
    const nonce = (script.match(/'nonce-([^']+)'/) || [])[1];
    expect(nonce, path + " has a nonce").toBeTruthy();
    expect(seen.has(nonce), "a fresh nonce for every response").toBe(false); seen.add(nonce);
    const tags = html.match(/<script[\s>][^>]*>/g) || [];
    expect(tags.length, path).toBeGreaterThan(0);
    for (const tag of tags) expect(tag, path).toContain('nonce="' + nonce + '"');
    expect(html, path + ": no inline event attributes").not.toMatch(/<[^>]+\son(click|load|error|submit|change|input)=/i);
  }
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

// last in the run on purpose: it locks this address out of the panel for the rest of the hour
test("ten wrong panel passwords lock the address (counted in D1, not KV)", async ({ request }) => {
  for (let i = 0; i < 10; i++) expect((await request.get("/api/auth", { headers: { authorization: "Bearer wrong-" + i } })).status()).toBe(401);
  expect((await request.get("/api/auth", { headers: { authorization: "Bearer " + ADMIN_PASSWORD } })).status(), "even the right password waits").toBe(401);
});
