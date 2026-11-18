// Two-step sign-in for the panel: an authenticator-app code (TOTP, RFC 6238), a passkey (fingerprint / Face ID, WebAuthn),
// and one-time backup codes. Web Crypto only, no libraries. The settings live in KV "auth:2fa":
//   { since, totp: "<base32>" | null, lastStep, passkeys: [{ id, pk, alg, name, at, count, tr }], backup: ["<sha256>", …] }
import { sha256, same } from "./shared.js";

const enc = new TextEncoder();
export const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = s => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4)), c => c.charCodeAt(0));
export const randB64u = n => b64u(crypto.getRandomValues(new Uint8Array(n)));

export async function load(env){ try { return JSON.parse(await env.EB.get("auth:2fa") || "null"); } catch { return null; } }
export async function save(env, cfg){
  if (!cfg.totp && !(cfg.passkeys || []).length) return env.EB.delete("auth:2fa");   // no method left: two-step is off
  return env.EB.put("auth:2fa", JSON.stringify(cfg));
}

// ---- authenticator app (TOTP: HMAC-SHA1, 30 s, 6 digits) ----
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newSecret(){ const b = crypto.getRandomValues(new Uint8Array(20)); let bits = "", out = "";
  for (const x of b) bits += x.toString(2).padStart(8, "0"); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; }
function unb32(s){ let bits = ""; for (const c of s.replace(/[\s=]/g, "").toUpperCase()) { const v = B32.indexOf(c); if (v < 0) return null; bits += v.toString(2).padStart(5, "0"); }
  const out = new Uint8Array(Math.floor(bits.length / 8)); for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2); return out; }
export async function totpAt(secret, step){
  const key = await crypto.subtle.importKey("raw", unb32(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new DataView(new ArrayBuffer(8)); msg.setUint32(0, Math.floor(step / 2 ** 32)); msg.setUint32(4, step >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg.buffer)), o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}
// a code from now, 30 s before or after (clock drift); a step already used never works again. Returns the step or 0.
export async function totpCheck(secret, code, lastStep = 0, now = Date.now()){
  code = String(code || "").replace(/\D/g, ""); if (code.length !== 6 || !secret) return 0;
  const t = Math.floor(now / 30000);
  for (const s of [t, t - 1, t + 1]) if (s > lastStep && same(await totpAt(secret, s), code)) return s;
  return 0;
}
export const otpauth = secret => "otpauth://totp/Eyeblink%20Studio:admin?secret=" + secret + "&issuer=Eyeblink%20Studio&algorithm=SHA1&digits=6&period=30";

// ---- backup codes: ten "XXXX-XXXX", stored as hashes, each works once ----
const BC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export async function newBackup(){ const codes = [], b = crypto.getRandomValues(new Uint8Array(80));
  for (let i = 0; i < 10; i++) { let c = ""; for (let j = 0; j < 8; j++) c += BC[b[i * 8 + j] % BC.length]; codes.push(c.slice(0, 4) + "-" + c.slice(4)); }
  return { codes, hashes: await Promise.all(codes.map(c => sha256("bc:" + c.replace("-", "")))) }; }
export async function useBackup(cfg, code){
  const c = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); if (c.length !== 8) return false;
  const h = await sha256("bc:" + c), i = (cfg.backup || []).indexOf(h); if (i < 0) return false;
  cfg.backup.splice(i, 1); return true;
}

// ---- passkeys (WebAuthn): the browser hands over the public key (getPublicKey) so no CBOR parsing is needed ----
async function authDataOk(ad, rpId){
  const want = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(rpId)));
  if (ad.length < 37 || !want.every((x, i) => x === ad[i])) return null;
  const flags = ad[32]; if (!(flags & 1) || !(flags & 4)) return null;   // user present + user verified (fingerprint, face, PIN)
  return { count: new DataView(ad.buffer, ad.byteOffset + 33, 4).getUint32(0) };
}
function clientOk(cdj, type, challenge, origin){
  let c; try { c = JSON.parse(new TextDecoder().decode(cdj)); } catch { return false; }
  return c.type === type && c.challenge === challenge && c.origin === origin;
}
const ALG = { "-7": { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" }, "-257": { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } };
// registration: { id, clientDataJSON, authenticatorData, publicKey (SPKI), alg, transports } — all base64url
export async function verifyRegistration(r, challenge, origin, rpId){
  try {
    if (!ALG[String(r.alg)] || !r.id || !r.publicKey) return null;
    if (!clientOk(unb64u(r.clientDataJSON), "webauthn.create", challenge, origin)) return null;
    const ad = await authDataOk(unb64u(r.authenticatorData), rpId); if (!ad) return null;
    await crypto.subtle.importKey("spki", unb64u(r.publicKey), ALG[String(r.alg)], false, ["verify"]);   // a key we can use later
    return { id: String(r.id).slice(0, 400), pk: r.publicKey, alg: +r.alg, count: ad.count, tr: (Array.isArray(r.transports) ? r.transports : []).slice(0, 6).map(String) };
  } catch { return null; }
}
// ECDSA signatures come DER-encoded; Web Crypto wants r‖s
function derToRaw(der){
  if (der[0] !== 0x30) return null; let i = 2; if (der[1] & 0x80) i += der[1] & 0x7f;
  const part = () => { if (der[i] !== 0x02) return null; const n = der[i + 1]; let v = der.slice(i + 2, i + 2 + n); i += 2 + n;
    while (v.length > 32 && v[0] === 0) v = v.slice(1); if (v.length > 32) return null; const o = new Uint8Array(32); o.set(v, 32 - v.length); return o; };
  const r = part(), s = part(); if (!r || !s) return null; const out = new Uint8Array(64); out.set(r); out.set(s, 32); return out;
}
// sign-in: { id, clientDataJSON, authenticatorData, signature } — returns the matching passkey (with its new count) or null
export async function verifyAssertion(passkeys, a, challenge, origin, rpId){
  try {
    const pk = (passkeys || []).find(p => p.id === a.id); if (!pk) return null;
    const cdj = unb64u(a.clientDataJSON), adb = unb64u(a.authenticatorData);
    if (!clientOk(cdj, "webauthn.get", challenge, origin)) return null;
    const ad = await authDataOk(adb, rpId); if (!ad) return null;
    if (ad.count && pk.count && ad.count <= pk.count) return null;   // a cloned authenticator
    const data = new Uint8Array(adb.length + 32); data.set(adb); data.set(new Uint8Array(await crypto.subtle.digest("SHA-256", cdj)), adb.length);
    const key = await crypto.subtle.importKey("spki", unb64u(pk.pk), ALG[String(pk.alg)], false, ["verify"]);
    let sig = unb64u(a.signature); if (pk.alg === -7) { sig = derToRaw(sig); if (!sig) return null; }
    if (!(await crypto.subtle.verify(ALG[String(pk.alg)], key, sig, data))) return null;
    pk.count = ad.count; return pk;
  } catch { return null; }
}
