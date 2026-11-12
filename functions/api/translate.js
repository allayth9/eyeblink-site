import { same, isAdmin, json } from "../_lib/shared.js";
// POST /api/translate — admin: Arabic → English for the panel's bilingual fields.
//   body { items: { "<id>": "<Arabic text>", … } }  →  { ok, items: { "<id>": "<English text>", … } }
// Uses Cloudflare Workers AI (binding "AI": Pages → Settings → Bindings → Workers AI). Free daily allowance.
// Without the binding it answers 501 and the panel simply leaves the English fields as they are.
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const BATCH = 15, MAX_ITEMS = 80, MAX_LEN = 4000;
const SYSTEM = `You translate website copy for Eyeblink Studio, an independent studio for video editing, motion graphics and film production, from Arabic into English.
Write natural, polished English marketing copy that reads as if written in English (not word-for-word), in the same tone and length.
Input: a JSON object mapping ids to Arabic text. Output: ONLY a JSON object with exactly the same ids mapping to the English text. No comments, no code fences.
Rules:
- Keep HTML tags and their attributes exactly as they are (for example <span class="grad">…</span>); translate only the text inside them.
- Keep placeholders in curly braces unchanged, e.g. {name}, {code}, {price}.
- Keep brand, product and tool names and any Latin-script words as they are (Eyeblink Studio, Premiere Pro, After Effects, Vimeo, Reels).
- Keep numbers, prices, currency symbols, emoji and separators such as • · — | / as they are. Use Western digits.
- Keep line breaks (\\n) in the same places: one English line per Arabic line.
- Short labels and button texts stay short. Headings use sentence case.
- If a value is already English or only a name, return it unchanged.`;

export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  if (!env.AI) return json({ ok: false, error: "ai" }, 501);
  const d = await request.json().catch(() => ({}));
  const all = Object.entries(d && typeof d.items === "object" && d.items ? d.items : {})
    .filter(([k, v]) => /^[\w.\-:]{1,200}$/.test(k) && typeof v === "string" && v.trim())
    .slice(0, MAX_ITEMS).map(([k, v]) => [k, v.slice(0, MAX_LEN)]);
  const out = {};
  for (let i = 0; i < all.length; i += BATCH) {
    const part = all.slice(i, i + BATCH);
    let got = await ask(env, Object.fromEntries(part));
    // a batch the model could not return as clean JSON: one string at a time
    if (!got) { got = {}; for (const [k, v] of part) { const one = await ask(env, { [k]: v }); if (one && one[k]) got[k] = one[k]; } }
    for (const [k] of part) if (typeof got[k] === "string" && got[k].trim()) out[k] = got[k].trim();
  }
  return json({ ok: true, items: out, model: MODEL });
}

async function ask(env, obj) {
  try {
    const r = await env.AI.run(MODEL, {
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(obj) }],
      temperature: 0.2, max_tokens: 3000,
    });
    const t = typeof r?.response === "string" ? r.response : JSON.stringify(r?.response ?? "");
    const m = t.match(/\{[\s\S]*\}/); if (!m) return null;
    const j = JSON.parse(m[0]);
    return j && typeof j === "object" ? j : null;
  } catch { return null; }
}
