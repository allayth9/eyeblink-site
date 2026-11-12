import { isAdmin, json } from "../_lib/shared.js";
// GET/PUT /api/private — admin only: payment details and reply templates. Never shown on the public site.
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const v = await env.EB.get("private");
  return json({ ok: true, data: v ? JSON.parse(v) : null });
}
export async function onRequestPut({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const body = await request.text();
  if (body.length > 200_000) return json({ ok: false }, 413);
  try { JSON.parse(body); } catch { return json({ ok: false }, 400); }
  await env.EB.put("private", body);
  return json({ ok: true });
}
