// WhatsApp Cloud API webhook (Meta, official) — https://eyeblinkstudio.com/api/whatsapp
//   GET   verification handshake (hub.verify_token must equal the WHATSAPP_VERIFY_TOKEN secret)
//   POST  signed by Meta (X-Hub-Signature-256 with the WHATSAPP_APP_SECRET secret):
//         · delivery statuses (sent / delivered / read / failed) are written onto the notification log
//         · a client replying STOP / إيقاف withdraws their WhatsApp consent at once
export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && env.WHATSAPP_VERIFY_TOKEN && same(q.get("hub.verify_token") || "", env.WHATSAPP_VERIFY_TOKEN)) return new Response(q.get("hub.challenge") || "", { status: 200 });
  return new Response("forbidden", { status: 403 });
}
export async function onRequestPost({ request, env }) {
  if (!env.WHATSAPP_APP_SECRET || !env.DB) return new Response("not configured", { status: 503 });
  const raw = await request.text();
  if (raw.length > 500000) return new Response("too large", { status: 413 });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.WHATSAPP_APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)))].map(b => b.toString(16).padStart(2, "0")).join("");
  if (!same(request.headers.get("x-hub-signature-256") || "", "sha256=" + mac)) return new Response("bad signature", { status: 401 });
  let body; try { body = JSON.parse(raw); } catch { return new Response("ok"); }
  const D = env.DB, at = new Date().toISOString();
  for (const e of body.entry || []) for (const c of e.changes || []) {
    const v = c.value || {};
    for (const s of v.statuses || []) {
      const err = s.errors && s.errors[0] ? String(s.errors[0].code || "") + ": " + String(s.errors[0].title || s.errors[0].message || "").slice(0, 200) : null;
      try { await D.prepare("UPDATE notify_log SET delivery=?, status=CASE WHEN ?='failed' THEN 'failed' ELSE status END, error=COALESCE(?, error) WHERE provider_id=?").bind(String(s.status || "").slice(0, 20), s.status, err, String(s.id || "")).run(); } catch {}
    }
    for (const m of v.messages || []) {
      const txt = String((m.text && m.text.body) || (m.button && m.button.text) || (m.interactive && m.interactive.button_reply && m.interactive.button_reply.title) || "").trim().toLowerCase();
      if (!/^(stop|unsubscribe|إيقاف|ايقاف|الغاء|إلغاء|وقف|توقف)$/.test(txt)) continue;
      const from = String(m.from || "").replace(/\D/g, "");
      try {
        await D.prepare("UPDATE notify_prefs SET wa_withdrawn_at=?, updated_at=? WHERE wa_phone=? AND wa_withdrawn_at IS NULL").bind(at, at, from).run();
        await D.prepare("INSERT INTO notify_log (at, channel, recipient, target, kind, status, attempts) VALUES (?, 'whatsapp', 'inbound', ?, 'opt_out', 'received', 1)").bind(at, from).run();
      } catch {}
    }
  }
  return new Response("ok");
}
function same(a, b){ if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
