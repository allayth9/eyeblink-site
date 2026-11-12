import { isAdmin, json, siteSettings, telegram, mail } from "../_lib/shared.js";
// POST /api/notify-test — admin: sends a test Telegram message and a test e-mail, and reports what each service answered
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const s = await siteSettings(env), to = env.NOTIFY_EMAIL || s.email;
  const tg = await telegram(env, "✅ Eyeblink: تنبيهات تيليغرام تعمل");
  let mailRes = { ok: false, description: env.RESEND_API_KEY ? "" : "RESEND_API_KEY is not set" };
  if (env.RESEND_API_KEY) {
    if (!to) mailRes.description = "no e-mail address in the site settings";
    else try { const r = await fetch("https://api.resend.com/emails", { method:"POST", headers:{ authorization:"Bearer "+env.RESEND_API_KEY, "content-type":"application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM || "Eyeblink Studio <info@eyeblinkstudio.com>", to:[to], subject:"Eyeblink: test e-mail", html: mail("ar","البريد الإلكتروني يعمل","هذه رسالة تجريبية من لوحة التحكم.","","") }) });
      const j = await r.json().catch(() => ({})); mailRes = { ok: r.ok, description: r.ok ? "sent to " + to : (j.message || j.name || ("HTTP " + r.status)) }; } catch (e) { mailRes.description = String(e); }
  }
  return json({ ok: true, telegram: { ok: !!(tg && tg.ok), description: (tg && (tg.description || (tg.ok ? "sent" : ""))) || "" }, email: mailRes });
}
