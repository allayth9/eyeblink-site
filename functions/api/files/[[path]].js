import { isAdmin, json, cookie, randHex, currentUser, limited } from "../../_lib/shared.js";
// POST /api/files — upload one file into an order's conversation: raw body + headers x-code (EB-XXXXX) and x-filename.
//                   Allowed for the signed-in client who owns the order, or the admin. Max 20 MB.
// GET  /api/files/<key> — the file, only for the client who owns the request it belongs to, or the studio (admin cookie). Supports byte ranges for video.
const TYPES = /^(image\/(jpeg|png|webp|gif|avif|heic|heif)|video\/(mp4|quicktime|webm)|audio\/(mpeg|mp4|wav|x-wav|aac|ogg)|application\/(pdf|zip|x-zip-compressed)|text\/plain)$/;
export async function onRequestGet({ request, params, env }) {
  const key = (params.path || []).join("/");
  if (!/^[a-z0-9][a-z0-9.\-_]{10,120}$/.test(key)) return new Response("not found", { status: 404 });
  const { value, metadata } = await env.EB.getWithMetadata("file:" + key, { type: "arrayBuffer" });
  if (!value) return new Response("not found", { status: 404 });
  if (!(await mayRead(request, env, metadata))) return new Response("not found", { status: 404 });
  const size = value.byteLength, type = metadata?.type || "application/octet-stream";
  const head = { "content-type": type, "accept-ranges": "bytes", "cache-control": "private, max-age=86400",
    "content-disposition": (/^(image|video|audio)\//.test(type) || type === "application/pdf" ? "inline" : "attachment") + "; filename*=UTF-8''" + encodeURIComponent(metadata?.name || key) };
  const m = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") || "");
  if (m) {
    let a = m[1] === "" ? size - +m[2] : +m[1], b = m[1] === "" || m[2] === "" ? size - 1 : Math.min(+m[2], size - 1);
    if (a < 0) a = 0;
    if (a >= size || a > b) return new Response(null, { status: 416, headers: { "content-range": "bytes */" + size } });
    return new Response(value.slice(a, b + 1), { status: 206, headers: { ...head, "content-range": `bytes ${a}-${b}/${size}`, "content-length": String(b - a + 1) } });
  }
  return new Response(value, { headers: { ...head, "content-length": String(size) } });
}
// private files: the owner of the request (signed in) or the studio (signed in to the panel); a bare link is not enough
async function mayRead(request, env, meta){
  const a = cookie(request, "eb_a"); if (/^[a-f0-9]{48}$/.test(a) && await env.EB.get("asess:" + a)) return true;
  if (await isAdmin(request, env)) return true;
  const u = await currentUser(request, env); if (!u || !meta || !meta.code) return false;
  const okey = await env.EB.get("code:" + meta.code); const ov = okey && await env.EB.get(okey);
  const o = ov && JSON.parse(ov); return !!o && o.email === u.email && !(o.manual && !o.clientVisible);
}
export async function onRequestPost({ request, env }) {
  const admin = await isAdmin(request, env);
  const code = String(request.headers.get("x-code") || "").toUpperCase();
  const okey = await env.EB.get("code:" + code); const ov = okey && await env.EB.get(okey);
  if (!ov) return json({ ok: false, error: "order" }, 404);
  const o = JSON.parse(ov);
  if (!admin) {
    const u = await currentUser(request, env);
    if (!u || u.email !== o.email || (o.manual && !o.clientVisible)) return json({ ok: false }, 401);
    if (o.status === "delivered" || o.status === "cancelled") return json({ ok: false, error: "closed" }, 403);
    if (await limited(env, "frl:" + u.email, 30, 3600)) return json({ ok: false, error: "too many files" }, 429);
  }
  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!TYPES.test(type)) return json({ ok: false, error: "type" }, 415);
  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return json({ ok: false }, 400);
  if (buf.byteLength > 20 * 1024 * 1024) return json({ ok: false, error: "size" }, 413);
  const raw = decodeURIComponent(request.headers.get("x-filename") || "file");
  const safe = raw.toLowerCase().replace(/[^a-z0-9.\-_]/g, "-").replace(/-+/g, "-").slice(-50) || "file";
  const key = randHex(12) + "-" + safe.replace(/^[^a-z0-9]+/, "");
  await env.EB.put("file:" + key, buf, { metadata: { type, size: buf.byteLength, name: raw.slice(0, 120), code } });
  return json({ ok: true, file: { url: "/api/files/" + key, name: raw.slice(0, 120), type, size: buf.byteLength } });
}
