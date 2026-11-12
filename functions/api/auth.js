import { isAdmin, adminPwHash, json, cookie } from "../_lib/shared.js";
// GET  /api/auth  — is this password right?
// POST /api/auth  — change the password: { newPassword }  (send the current one as Authorization)
export async function onRequestGet({ request, env }) {
  if (!env.ADMIN_PASSWORD && !(await env.EB.get("auth:hash"))) return json({ ok: false, error: "no password set" }, 500);
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  // a panel opened with only its session cookie (no password sent): it is still signed in, keep that session as it is
  if (!(request.headers.get("authorization") || "").startsWith("Bearer ")) return json({ ok: true, session: true });
  // «remember me on this device»: 30 days instead of 12 hours
  const ttl = new URL(request.url).searchParams.get("remember") ? 30 * 86400 : 12 * 3600;
  const t = [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2, "0")).join("");
  await env.EB.put("asess:" + t, "1", { expirationTtl: ttl });
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": "eb_a=" + t + "; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + ttl } });
}
// sign out: this device's session ends
export async function onRequestDelete({ request, env }) {
  const s = (request.headers.get("cookie") || "").match(/(?:^|;\s*)eb_a=([a-f0-9]{48})(?:;|$)/);
  if (s) await env.EB.delete("asess:" + s[1]);
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": "eb_a=; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" } });
}
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const { newPassword, current } = await request.json().catch(() => ({}));
  // a signed-in session alone cannot change the password: the current one is checked too (same lockout as signing in)
  const check = new Request(request.url, { headers: { authorization: "Bearer " + String(current || ""), "cf-connecting-ip": request.headers.get("cf-connecting-ip") || "x" } });
  if (!current || !(await isAdmin(check, env))) return json({ ok: false, error: "current" }, 403);
  if (!newPassword || newPassword.length < 10) return json({ ok: false, error: "min 10 characters" }, 400);
  await env.EB.put("auth:hash", await adminPwHash(newPassword));
  // sign out every open panel session: from now on only the new password gets in
  let cursor; do { const r = await env.EB.list({ prefix: "asess:", cursor }); for (const k of r.keys) await env.EB.delete(k.name); cursor = r.list_complete ? null : r.cursor; } while (cursor);
  // …and open a fresh one for the panel that just changed it
  const t = [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2, "0")).join("");
  await env.EB.put("asess:" + t, "1", { expirationTtl: 12 * 3600 });
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": "eb_a=" + t + "; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200" } });
}
