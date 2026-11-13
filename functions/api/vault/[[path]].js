import { isAdmin, json, cookie, randHex, currentUser, SITE, h } from "../../_lib/shared.js";
// Private delivery storage on Cloudflare R2 (binding "R2"). Nothing in the bucket is public.
// GET  /api/vault/<key>                → the file, with byte ranges (seeking in the player). Only the studio, or the
//                                        signed-in client whose delivery points at this file.
// POST /api/vault?op=create { name, type, size }        → { key, uploadId }        (studio only)
// PUT  /api/vault?op=part&key=&uploadId=&n=  raw chunk  → { partNumber, etag }    (≤ 90 MB a request, Cloudflare's body limit is 100 MB)
// POST /api/vault?op=complete { key, uploadId, parts }  → { url }
// POST /api/vault?op=abort { key, uploadId }
// Every upload gets its own key, so a new version never replaces an old one.
const VTYPES = /^(video\/(mp4|quicktime|webm)|audio\/(mpeg|mp4|wav|x-wav|aac)|image\/(jpeg|png|webp)|application\/(pdf|zip|x-zip-compressed))$/;
const KEY_OK = /^v\/[a-f0-9]{24}\/[a-z0-9][a-z0-9.\-_]{0,80}$/;
export async function onRequestGet({ request, params, env }) {
  if (!env.R2) return new Response("storage not configured", { status: 503 });
  const key = (params.path || []).join("/");
  const film = KEY_OK.test(key) && await isFilm(env, key);
  if (!KEY_OK.test(key) || !(film || await mayRead(request, env, key))) return new Response("not found", { status: 404 });
  const range = request.headers.get("range");
  const obj = await env.R2.get(key, range ? { range: request.headers } : undefined);
  if (!obj) return new Response("not found", { status: 404 });
  const h = new Headers(); obj.writeHttpMetadata(h);
  h.set("accept-ranges", "bytes"); h.set("cache-control", film ? "public, max-age=31536000, immutable" : "private, max-age=3600"); h.set("etag", obj.httpEtag);
  const name = (obj.customMetadata && obj.customMetadata.name) || key.split("/").pop();
  h.set("content-disposition", (new URL(request.url).searchParams.get("dl") ? "attachment" : "inline") + "; filename*=UTF-8''" + encodeURIComponent(name));
  if (range && obj.range) {
    const off = obj.range.offset || 0, len = obj.range.length ?? (obj.size - off);
    h.set("content-range", `bytes ${off}-${off + len - 1}/${obj.size}`); h.set("content-length", String(len));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set("content-length", String(obj.size));
  return new Response(obj.body, { headers: h });
}
// a work's full film on the site (a key never changes, so it can be cached for good)
async function isFilm(env, key){
  let c = {}; try { c = JSON.parse(await env.EB.get("content", { cacheTtl: 60 }) || "{}"); } catch {}
  return (c.projects || []).some(p => p && p.full && p.full.type === "mp4" && String(p.full.src || "").endsWith("/api/vault/" + key));
}
// the studio (panel session), or the client a delivery with this file was sent to
async function mayRead(request, env, key){
  const a = cookie(request, "eb_a"); if (/^[a-f0-9]{48}$/.test(a) && await env.EB.get("asess:" + a)) return true;
  if (await isAdmin(request, env)) return true;
  const u = await currentUser(request, env); if (!u || !env.DB) return false;
  const r = await env.DB.prepare("SELECT 1 FROM deliverables WHERE client_email=? AND url=? LIMIT 1").bind(u.email, SITE + "/api/vault/" + key).first();
  return !!r;
}
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  if (!env.R2) return json({ ok: false, error: "r2" }, 503);
  const op = new URL(request.url).searchParams.get("op"), d = await request.json().catch(() => ({}));
  if (op === "create") {
    const type = String(d.type || "").toLowerCase(); if (!VTYPES.test(type)) return json({ ok: false, error: "type" }, 415);
    const raw = String(d.name || "file").slice(0, 120), safe = raw.toLowerCase().replace(/[^a-z0-9.\-_]/g, "-").replace(/-+/g, "-").replace(/^[^a-z0-9]+/, "").slice(-60) || "file";
    const key = "v/" + randHex(12) + "/" + safe;
    const mp = await env.R2.createMultipartUpload(key, { httpMetadata: { contentType: type }, customMetadata: { name: raw, size: String(+d.size || 0) } });
    return json({ ok: true, key, uploadId: mp.uploadId });
  }
  if (!KEY_OK.test(String(d.key || ""))) return json({ ok: false, error: "key" }, 400);
  const mp = env.R2.resumeMultipartUpload(d.key, String(d.uploadId || ""));
  if (op === "complete") {
    const parts = (Array.isArray(d.parts) ? d.parts : []).map(p => ({ partNumber: +p.partNumber, etag: String(p.etag || "") })).filter(p => p.partNumber > 0 && p.etag);
    if (!parts.length) return json({ ok: false, error: "parts" }, 400);
    const obj = await mp.complete(parts);
    return json({ ok: true, key: d.key, size: obj.size, url: SITE + "/api/vault/" + d.key });
  }
  if (op === "abort") { await mp.abort().catch(() => {}); return json({ ok: true }); }
  return json({ ok: false }, 400);
}
export async function onRequestPut({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  if (!env.R2) return json({ ok: false, error: "r2" }, 503);
  const q = new URL(request.url).searchParams, key = q.get("key") || "", n = +q.get("n");
  if (!KEY_OK.test(key) || !(n >= 1 && n <= 10000)) return json({ ok: false }, 400);
  const len = +(request.headers.get("content-length") || 0); if (!len || len > 95 * 1024 * 1024) return json({ ok: false, error: "size" }, 413);
  const part = await env.R2.resumeMultipartUpload(key, q.get("uploadId") || "").uploadPart(n, request.body);
  return json({ ok: true, partNumber: part.partNumber, etag: part.etag });
}
