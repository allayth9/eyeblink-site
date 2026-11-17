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
