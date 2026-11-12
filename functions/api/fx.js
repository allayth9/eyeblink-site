import { json, isAdmin } from "../_lib/shared.js";
// The Syrian pound against the dollar, for pricing quotes in SYP. Admin only.
// GET /api/fx → { ok, SYP, buy, sell, at, stale }  — refreshed at most once a day from the public USD page of sp-today.com
// (their robots.txt disallows /api/, so we read the public page, Damascus market price; we use "sell", the side that protects the studio)
const FX_KEY = "fx:syp", FX_URL = "https://sp-today.com/en/currency/us-dollar", FX_TTL = 20 * 3600e3;

async function fetchSyp(){
  const r = await fetch(FX_URL, { headers: { "user-agent": "EyeblinkStudio/1.0 (+https://eyeblinkstudio.com) daily-rate", accept: "text/html" }, cf: { cacheTtl: 3600 } });
  if (!r.ok) throw new Error("http " + r.status);
  const html = await r.text();
  // the page embeds its data as escaped JSON: \"damascus\":{\"buy\":14350,\"sell\":14425,…
  const m = html.match(/\\?"damascus\\?":\{\\?"buy\\?":(\d+(?:\.\d+)?),\\?"sell\\?":(\d+(?:\.\d+)?)/);
  if (!m) throw new Error("no damascus rate");
  const buy = +m[1], sell = +m[2];
  if (!(buy > 100 && sell >= buy && sell < 1e7)) throw new Error("implausible rate");   // guards against a page change feeding nonsense into prices
  return { buy, sell, SYP: sell, at: new Date().toISOString(), src: "sp-today.com" };
}

export async function onRequestGet({ request, env }) {
  // public: visitors who pick the pound need it; the source is read at most once a day whoever asks
  const old = JSON.parse(await env.EB.get(FX_KEY) || "null");
  if (old && Date.now() - Date.parse(old.at) < FX_TTL && !(new URL(request.url).searchParams.get("force") && await isAdmin(request, env))) return json({ ok: true, ...old });
  try { const fresh = await fetchSyp(); await env.EB.put(FX_KEY, JSON.stringify(fresh)); return json({ ok: true, ...fresh }); }
  catch (e) { return old ? json({ ok: true, ...old, stale: true, error: String(e.message || e) }) : json({ ok: false, error: String(e.message || e) }, 502); }
}
