"""Copies tools/api_shared.js (notifications, e-mails, invoices) into every Pages Function that uses it."""
import glob, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
block = open(os.path.join(ROOT, "tools/api_shared.js"), encoding="utf-8").read().rstrip() + "\n"
M = "// ---- notifications:"
for f in sorted(glob.glob(os.path.join(ROOT, "functions/api/**/*.js"), recursive=True)):
    t = open(f, encoding="utf-8").read()
    if M not in t: continue
    i = t.index(M); tail = t[i:]
    j = tail.index("function later(ctx, p)"); end = tail.index("\n", j) + 1
    rest = tail[end:]
    open(f, "w", encoding="utf-8").write(t[:i] + block + rest)
    print("synced", os.path.relpath(f, ROOT), "| after-block:", len(rest.strip()))
