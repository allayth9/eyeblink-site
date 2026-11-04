// Short links for WhatsApp buttons (Meta appends one path segment to a fixed URL; a "#" would be encoded away).
//   /go/t/T-ABC12  →  /account.html#w/t/T-ABC12      /go/en/p/p_123/talk  →  /en/account.html#w/p/p_123/talk
export function onRequestGet({ request, params }) {
  const parts = [].concat(params.path || []).map(String);
  const en = parts[0] === "en"; if (en) parts.shift();
  const rest = parts.join("/").replace(/[^A-Za-z0-9_\/-]/g, "").slice(0, 80);
  const hash = rest && rest !== "w" ? "#w/" + rest : "#w";
  return Response.redirect(new URL((en ? "/en" : "") + "/account.html" + hash, request.url).toString(), 302);
}
