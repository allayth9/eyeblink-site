import { isAdmin, json, randHex, currentUser, sha256, SITE } from "../../_lib/shared.js";
import { s3Ready, r2Sign } from "../../_lib/s3.js";
// Client uploads straight from the browser to R2: the file never passes through this Function (Cloudflare caps a request
// body at 100 MB and an isolate at 128 MB). This Function only checks who may write where, and signs short-lived links.
//   POST /api/up { op:"sign", scope:"project"|"brand", project?, category?|kind?, name, type, size }
//        → { mode:"put", key, url, type }                 under 100 MB: one presigned PUT, Content-Type pinned in the signature
//        → { mode:"multi", key, uploadId, part, type }    100 MB and over: multipart, parts ≥ 5 MiB, each part signed when it is sent
//        → { mode:"proxy", key, uploadId, part, type }    only when the S3 keys are missing (local dev): parts go through PUT /api/up
//   POST /api/up { op:"parts", key, uploadId, numbers:[n…] } → { urls:{ n: url } }   (fresh links; the browser asks again on expiry)
//   POST /api/up { op:"done", key, uploadId?, parts?, name, title? } → { ok, file }  completes a multipart, checks the object, records it in D1
//   POST /api/up { op:"abort", key, uploadId }
//   GET  /api/up/<key> → the file (byte ranges), for whoever may read that project or brand library
// Keys say where a file belongs, so every later check is made from the key alone:
//   p/<project id>/<category>/<16 hex>/<safe name>     b/<16 hex of the client's e-mail hash>/<kind>/<16 hex>/<safe name>
const CATS = ["brand","raw","reference","document","other"], KINDS = ["logo_dark","logo_light","vector","font","other"];
const KEY = /^(p\/p_[a-f0-9]{6,24}\/(brand|raw|reference|document|other)|b\/[a-f0-9]{16}\/(logo_dark|logo_light|vector|font|other))\/[a-f0-9]{16}\/[a-z0-9][a-z0-9.\-_]{0,80}$/;
const EXT = /\.(mp4|mov|m4v|webm|mxf|avi|mp3|wav|aac|m4a|aif|aiff|flac|jpg|jpeg|png|webp|gif|heic|tif|tiff|psd|ai|eps|svg|pdf|doc|docx|ppt|pptx|xls|xlsx|txt|rtf|zip|rar|7z|ttf|otf|woff|woff2|prproj|aep|drp|srt|vtt|csv|json)$/i;
const MAX = 5 * 1024 ** 3, BIG = 100 * 1024 ** 2;
const MIB = 1024 * 1024, partOf = size => Math.max(16 * MIB, Math.ceil(size / 9000 / MIB) * MIB);   // ≥ 5 MiB, and under R2's 10,000 parts
const brandOf = async email => (await sha256("brand:" + email)).slice(0, 16);

// may this request touch this key? (studio always; a client only inside their own project or their own brand library)
async function allowed(request, env, key){
  if (await isAdmin(request, env)) return { by: "studio", name: "Eyeblink Studio" };
  const u = await currentUser(request, env); if (!u || u.role !== "client" || u.mustChange || !env.DB) return null;
  const who = { by: u.email, name: u.name || "", email: u.email };
  if (key.startsWith("b/")) return key.split("/")[1] === await brandOf(u.email) ? who : null;
  const pid = key.split("/")[1];
  const p = await env.DB.prepare("SELECT id FROM projects WHERE id=?1 AND (client_email=?2 OR id IN (SELECT project_id FROM project_members WHERE email=?2))").bind(pid, u.email).first();
  return p ? who : null;
}
const safeName = raw => raw.toLowerCase().replace(/[^a-z0-9.\-_]/g, "-").replace(/-+/g, "-").replace(/^[^a-z0-9]+/, "").slice(-60) || "file";

export async function onRequestPost({ request, env }){
  if (!env.R2) return json({ ok: false, error: "r2" }, 503);
  const d = await request.json().catch(() => ({})), op = d.op;
  if (op === "sign") {
    const name = String(d.name || "").slice(0, 160), size = +d.size || 0, type = /^[\w.+-]+\/[\w.+-]+$/.test(d.type || "") ? String(d.type).toLowerCase() : "application/octet-stream";
    if (!EXT.test(name)) return json({ ok: false, error: "type" }, 415);
    if (!(size > 0) || size > MAX) return json({ ok: false, error: "size" }, 413);
    let key;
    if (d.scope === "brand") {
      const u = await currentUser(request, env); if (!u || u.role !== "client") return json({ ok: false }, 401);
      key = "b/" + await brandOf(u.email) + "/" + (KINDS.includes(d.kind) ? d.kind : "other");
    } else key = "p/" + String(d.project || "") + "/" + (CATS.includes(d.category) ? d.category : "other");
    key += "/" + randHex(8) + "/" + safeName(name);
    if (!KEY.test(key) || !(await allowed(request, env, key))) return json({ ok: false }, 403);
    if (!s3Ready(env)) { const mp = await env.R2.createMultipartUpload(key, { httpMetadata: { contentType: type } }); return json({ ok: true, mode: "proxy", key, uploadId: mp.uploadId, part: 50 * MIB, type }); }
    if (size < BIG) return json({ ok: true, mode: "put", key, type, url: await r2Sign(env, "PUT", key, { headers: { "content-type": type } }) });
    const mp = await env.R2.createMultipartUpload(key, { httpMetadata: { contentType: type } });
    return json({ ok: true, mode: "multi", key, uploadId: mp.uploadId, part: partOf(size), type });
  }
  const key = String(d.key || ""); if (!KEY.test(key)) return json({ ok: false, error: "key" }, 400);
  const who = await allowed(request, env, key); if (!who) return json({ ok: false }, 403);
  if (op === "parts") {
    if (!s3Ready(env)) return json({ ok: false, error: "s3" }, 409);
    const urls = {}; for (const n of (Array.isArray(d.numbers) ? d.numbers : []).slice(0, 20).map(Number).filter(n => n >= 1 && n <= 10000))
      urls[n] = await r2Sign(env, "PUT", key, { query: { partNumber: String(n), uploadId: String(d.uploadId || "") } });
    return json({ ok: true, urls });
  }
  if (op === "abort") { await env.R2.resumeMultipartUpload(key, String(d.uploadId || "")).abort().catch(() => {}); return json({ ok: true }); }
  if (op === "done") {
    if (d.uploadId) {
      const parts = (Array.isArray(d.parts) ? d.parts : []).map(p => ({ partNumber: +p.partNumber, etag: String(p.etag || "").replace(/"/g, "") })).filter(p => p.partNumber > 0 && p.etag);
      if (!parts.length) return json({ ok: false, error: "parts" }, 400);
      await env.R2.resumeMultipartUpload(key, String(d.uploadId)).complete(parts.sort((a, b) => a.partNumber - b.partNumber));
    }
    const obj = await env.R2.head(key); if (!obj) return json({ ok: false, error: "missing" }, 404);
    return json({ ok: true, file: await record(env, key, obj, who, d) });
  }
  return json({ ok: false }, 400);
}
// the file's row in D1 (the only source of truth): a project file joins the file center, a brand file joins the library
async function record(env, key, obj, who, d){
  const D = env.DB, at = new Date().toISOString(), id = "f_" + randHex(6), parts = key.split("/");
  const title = String(d.title || d.name || parts[4]).trim().slice(0, 140), url = SITE + "/api/up/" + key;
  if (parts[0] === "b") {
    const email = who.email || String(d.client_email || "").toLowerCase();
    await D.prepare("INSERT INTO brand_assets (id, email, kind, title, key, size, type, created_at) VALUES (?,?,?,?,?,?,?,?)").bind(id, email, parts[2], title, key, obj.size, (obj.httpMetadata && obj.httpMetadata.contentType) || "", at).run();
    return { id, kind: parts[2], title, url, size: obj.size };
  }
  const p = await D.prepare("SELECT id, client_email FROM projects WHERE id=?").bind(parts[1]).first();
  await D.prepare("INSERT INTO files (id, project_id, client_email, category, title, url, note, added_by, added_name, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(id, p.id, p.client_email, parts[2], title, url, "", who.by, who.name, at).run();
  await D.prepare("INSERT INTO activity (at, actor, actor_name, client_email, project_id, kind, data) VALUES (?,?,?,?,?,?,?)").bind(at, who.by, who.name, p.client_email, p.id, "file_added", JSON.stringify({ title, category: parts[2] })).run();
  return { id, category: parts[2], title, url, size: obj.size };
}
// only without the S3 keys (local dev): one part through the Function, ≤ 50 MB
export async function onRequestPut({ request, env }){
  if (!env.R2) return json({ ok: false, error: "r2" }, 503);
  const q = new URL(request.url).searchParams, key = q.get("key") || "", n = +q.get("n");
  if (s3Ready(env) || !KEY.test(key) || !(n >= 1 && n <= 10000)) return json({ ok: false }, 400);
  if (!(await allowed(request, env, key))) return json({ ok: false }, 403);
  const len = +(request.headers.get("content-length") || 0); if (!len || len > 60 * MIB) return json({ ok: false, error: "size" }, 413);
  const part = await env.R2.resumeMultipartUpload(key, q.get("uploadId") || "").uploadPart(n, request.body);
  return json({ ok: true, partNumber: part.partNumber, etag: part.etag });
}
// read: byte ranges for the player; never rendered as a page from our origin (sandbox + nosniff), so an uploaded SVG or HTML cannot run
export async function onRequestGet({ request, params, env }){
  if (!env.R2) return new Response("storage not configured", { status: 503 });
  const key = (params.path || []).join("/");
  if (!KEY.test(key) || !(await allowed(request, env, key))) return new Response("not found", { status: 404 });
  const range = request.headers.get("range"), obj = await env.R2.get(key, range ? { range: request.headers } : undefined);
  if (!obj) return new Response("not found", { status: 404 });
  const h = new Headers(); obj.writeHttpMetadata(h);
  const type = h.get("content-type") || "", inline = /^(image\/(jpeg|png|webp|gif)|video\/|audio\/|application\/pdf)/.test(type) && !new URL(request.url).searchParams.get("dl");
  h.set("accept-ranges", "bytes"); h.set("cache-control", "private, max-age=3600"); h.set("etag", obj.httpEtag);
  h.set("x-content-type-options", "nosniff"); h.set("content-security-policy", "sandbox; default-src 'none'; img-src 'self'; media-src 'self'");
  h.set("content-disposition", (inline ? "inline" : "attachment") + "; filename*=UTF-8''" + encodeURIComponent(key.split("/").pop()));
  if (range && obj.range) {
    const off = obj.range.offset || 0, len = obj.range.length ?? (obj.size - off);
    h.set("content-range", `bytes ${off}-${off + len - 1}/${obj.size}`); h.set("content-length", String(len));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set("content-length", String(obj.size));
  return new Response(obj.body, { headers: h });
}
