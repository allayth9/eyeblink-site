// Presigned URLs for the R2 bucket's S3 endpoint (AWS Signature V4, query string), with WebCrypto only.
// Used instead of the aws4fetch package because the site deploys without a build step. Self-test: node dev/test-s3sign.mjs
// Secrets (Cloudflare Pages → Settings → Variables): R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const sha = async t => hex(await crypto.subtle.digest("SHA-256", enc.encode(t)));
const hmac = async (key, t) => crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", typeof key === "string" ? enc.encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), enc.encode(t));
// RFC 3986 encoding, as SigV4 wants it
const rfc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());

// the general form (also what the AWS test vector checks)
export async function presign({ method, host, path, region, accessKey, secret, date, expires, query = {}, headers = {} }){
  const amz = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""), day = amz.slice(0, 8), scope = `${day}/${region}/s3/aws4_request`;
  const hs = { host, ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])) };
  const signed = Object.keys(hs).sort().join(";");
  const q = { ...query, "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${accessKey}/${scope}`, "X-Amz-Date": amz, "X-Amz-Expires": String(expires), "X-Amz-SignedHeaders": signed };
  const qs = Object.keys(q).sort().map(k => rfc(k) + "=" + rfc(q[k])).join("&");
  const canon = [method, path.split("/").map(rfc).join("/"), qs, Object.keys(hs).sort().map(k => k + ":" + hs[k] + "\n").join(""), signed, "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amz, scope, await sha(canon)].join("\n");
  let k = await hmac("AWS4" + secret, day); k = await hmac(k, region); k = await hmac(k, "s3"); k = await hmac(k, "aws4_request");
  return `https://${host}${path.split("/").map(rfc).join("/")}?${qs}&X-Amz-Signature=${hex(await hmac(k, toSign))}`;
}

export const s3Ready = env => !!(env.R2_ACCOUNT_ID && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
// a link to one object in our bucket, path-style on <account>.r2.cloudflarestorage.com, region "auto"
export function r2Sign(env, method, key, { expires = 900, query, headers } = {}){
  return presign({ method, host: `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, path: `/${env.R2_BUCKET}/${key}`, region: "auto",
    accessKey: env.R2_ACCESS_KEY_ID, secret: env.R2_SECRET_ACCESS_KEY, date: new Date(), expires, query, headers });
}
