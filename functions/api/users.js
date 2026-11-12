import { isAdmin, json, randHex, pbkdf2 } from "../_lib/shared.js";
// GET    /api/users — admin: client accounts
// PATCH  /api/users — admin: { email, password } sets a new password for a client who forgot theirs
// DELETE /api/users?email=... — admin: removes the account (their orders stay)
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const out = []; let cursor;
  do { const r = await env.EB.list({ prefix: "user:", cursor });
    for (const k of r.keys) { const v = await env.EB.get(k.name); if (!v) continue; const u = JSON.parse(v);
      out.push({ email: u.email, name: u.name, provider: u.provider, google: !!u.google, hasPassword: !!u.hash, createdAt: u.createdAt, lastLogin: u.lastLogin, orders: (u.orders || []).length,
      role: u.role === "client" ? "client" : "customer", clientSince: u.clientSince || null, clientVia: u.clientVia || null, lang: u.lang || "", log: (u.log || []).slice(0, 12) }); }
    cursor = r.list_complete ? null : r.cursor; } while (cursor && out.length < 2000);
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return json({ ok: true, users: out });
}
export async function onRequestPatch({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const d = await request.json().catch(() => ({}));
  const v = await env.EB.get("user:" + String(d.email || "").toLowerCase()); if (!v) return json({ ok: false }, 404);
  const pw = String(d.password || ""); if (pw.length < 8) return json({ ok: false, error: "min 8" }, 400);
  const u = JSON.parse(v); u.salt = randHex(16); u.hash = await pbkdf2(pw, u.salt);
  await env.EB.put("user:" + u.email, JSON.stringify(u));
  return json({ ok: true });
}
export async function onRequestDelete({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const email = (new URL(request.url).searchParams.get("email") || "").toLowerCase();
  await env.EB.delete("user:" + email); await env.EB.delete("accreq:" + email);
  return json({ ok: true });
}
