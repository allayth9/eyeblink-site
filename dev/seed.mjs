// Locks the pages' built-in copy of the content to what the live site serves now, so a first visit paints
// the current text at once (the pages still swap in /api/content right after, for anything changed since).
// Run from the site folder:  node dev/seed.mjs            (reads https://eyeblinkstudio.com/api/content)
//                            node dev/seed.mjs file.json  (reads a saved copy instead)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const arg = process.argv[2];
const C = arg ? JSON.parse(readFileSync(arg, "utf8")) : await (await fetch("https://eyeblinkstudio.com/api/content")).json();
if (!C || !C.services || !C.hero) throw new Error("that is not the site's content");
const at = C.updatedAt; delete C.updatedAt;
const inline = JSON.stringify(C).replace(/<\//g, "<\\/");   // safe inside <script>

writeFileSync("content.json", JSON.stringify(C, null, 1) + "\n");
writeFileSync("content.js", "window.EB_SEED=" + inline + ";\n");
const pages = [...readdirSync(".").filter(f => f.endsWith(".html")), ...readdirSync("en").filter(f => f.endsWith(".html")).map(f => "en/" + f)];
let n = 0;
for (const f of pages) {
  const t = readFileSync(f, "utf8");
  const u = t.replace(/(<script type="application\/json" id="eb-seed">)[\s\S]*?(<\/script>)/, (_, a, b) => a + inline + b);
  if (u !== t) { writeFileSync(f, u); n++; }
}
console.log("content.json, content.js and", n, "pages now carry the content of", at || "the live site");
