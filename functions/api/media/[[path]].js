import { isAdmin, json } from "../../_lib/shared.js";
// GET  /api/media/<key> — public: serves an uploaded preview video, image or logo. Answers byte ranges
//                         (Safari and iPhones only play a video that can be fetched in parts).
// POST /api/media        — admin: upload a file (raw body, header x-filename); max 24 MB
export async function onRequestGet({ request, params, env }) {
  const key = (params.path || []).join("/");
  if (!key) return new Response("not found", { status: 404 });
  const { value, metadata } = await env.EB.getWithMetadata("media:" + key, { type: "arrayBuffer" });
  if (!value) return new Response("not found", { status: 404 });
  const size = value.byteLength;
  const head = { "content-type": metadata?.type || "application/octet-stream", "cache-control": "public, max-age=31536000, immutable", "accept-ranges": "bytes" };
  const m = /^bytes=(\d*)-(\d*)$/.exec((request.headers.get("range") || "").trim());
  if (m && (m[1] !== "" || m[2] !== "")) {
    let a = m[1] === "" ? size - +m[2] : +m[1], b = m[1] === "" || m[2] === "" ? size - 1 : Math.min(+m[2], size - 1);
    if (a < 0) a = 0;
    if (a >= size || a > b) return new Response(null, { status: 416, headers: { ...head, "content-range": "bytes */" + size } });
    return new Response(value.slice(a, b + 1), { status: 206, headers: { ...head, "content-range": `bytes ${a}-${b}/${size}`, "content-length": String(b - a + 1) } });
  }
  return new Response(value, { headers: { ...head, "content-length": String(size) } });
}
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const type = request.headers.get("content-type") || "application/octet-stream";
  if (!/^(video\/(mp4|webm)|image\/(jpeg|png|webp|gif|avif|svg\+xml))$/.test(type)) return json({ ok: false, error: "only mp4/webm video or images" }, 415);
  const buf = await request.arrayBuffer();
  if (buf.byteLength > 24 * 1024 * 1024) return json({ ok: false, error: "max 24 MB" }, 413);
  const name = (request.headers.get("x-filename") || "file").toLowerCase().replace(/[^a-z0-9.\-_]/g, "-").slice(-60);
  const key = Date.now().toString(36) + "-" + name;
  await env.EB.put("media:" + key, buf, { metadata: { type, size: buf.byteLength } });
  return json({ ok: true, url: "/api/media/" + key });
}
