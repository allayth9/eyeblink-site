// Starts the site from the repo root on a fresh, empty local state (so every run begins the same way)
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const state = fileURLToPath(new URL("../.e2e-state", import.meta.url));
rmSync(state, { recursive: true, force: true });
const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const p = spawn(process.execPath, [wrangler, "pages", "dev", ".", "--port", process.env.PORT, "--kv", "EB", "--d1", "DB=eb-e2e", "--r2", "R2",
  "--binding", "ADMIN_PASSWORD=" + process.env.ADMIN_PASSWORD, "--compatibility-date", "2024-11-01", "--persist-to", state], { cwd: root, stdio: "inherit" });
const stop = () => p.kill();
process.on("SIGINT", stop); process.on("SIGTERM", stop); process.on("exit", stop);
p.on("exit", code => process.exit(code ?? 0));
