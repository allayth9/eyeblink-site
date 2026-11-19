import { same, isAdmin, json, randHex, currentUser, SITE, h, siteSettings, sendMail, telegram, greet, mail, ticketHTML, notifyStudio, fmt, rows, newInvoice, later, rulesOf, RULES, accountMail, setAvatar, brandKit, brandZip } from "../_lib/shared.js";
// Workspace for Active Clients — projects, task requests, requested vs confirmed dates, activity log.
// Accounts stay where they are (KV "EB"); the workspace lives in Cloudflare D1 (binding "DB"). Tables are created on first use.
//
// Active Client (signed in, role "client"; only their own projects and tasks):
//   GET  /api/work?view=dash            summary, projects, recent tasks, upcoming dates, activity
//   GET  /api/work?project=ID           one project with its tasks and activity
//   GET  /api/work?task=REF             one task with its activity
//   POST /api/work { action:"task", project, title, type, description, details, notes, priority, requested_date, links }
//                  { action:"reply", task, text, links }            answer the studio's request for information
//                  { action:"dateChange", task, date, reason }       ask to move the confirmed date (the studio decides)
//                  { action:"tasks", project, items:[{ title, … same fields as "task" }] }   up to 10 tasks in one go
//                  { action:"cancel", task }                         only before the studio accepts it
//                  { action:"decide", task, deliverable, decision:"approve"|"changes", note, points:[{t:"00:12", text}] }   on the latest version
//                  { action:"comment", scope:"task"|"project", task|project, body, links }   { action:"deleteComment", id }   (own only)
//                  { action:"file", project, category, title, url, note }   { action:"deleteFile", id }   (own only)
// Studio (admin password as Bearer):
//   GET  /api/work?admin=1[&status=&client=&project=]
//   POST /api/work { action:"project", id?, client_email, name, description, type, services, start_date, end_date, status, quota }
//                  { action:"review", task, decision:"review"|"accept"|"info"|"reject", confirmed_date, note }
//                  { action:"status", task, status, note }  { action:"date", task, confirmed_date, note }
//                  { action:"dateDecision", task, approve, date }
//                  { action:"deliver", task, url, title, note, final, links }   V1, V2… or Final (a Google Drive link, etc.)
//                  { action:"point", deliverable, index, done }   tick off a revision point
//                  { action:"studioComment", scope, task|project, body, links }  { action:"removeComment", id }
//                  { action:"studioFile", project, category, title, url, note }  { action:"removeFile", id }
//   GET  /api/work?admin=1&space=PROJECT_ID   that project's discussion, files and deliveries
//   GET  /api/work?admin=1&view=notify       studio inbox, delivery log (e-mail / WhatsApp), WhatsApp setup status
//   POST /api/work { action:"studioRead", ids|all }  { action:"retryNotif", id }  { action:"waConfig", … }  { action:"waTest", phone, lang }
// Billing (Phase 6): invoices for clients, kept by hand (no payment gateway): six statuses — pending, partial, paid, overdue
// (pending/partial past the due date), cancelled, refunded. Same numbering as the order invoices (D1 "seq", see newInvoice).
//   client: GET ?view=invoices | ?invoiceDoc=ID (printable page)
//   studio: GET ?admin=1&view=billing | ?admin=1&invoiceDoc=ID | ?admin=1&view=reports&from=&to= | ?admin=1&profile=EMAIL
//           POST { action:"invoice", id?, client_email, project_id, title, period, items:[{desc,qty,unit}], currency, discount, issue_date, due_date, note, send }
//                { action:"invoicePay", id, amount, method, date, note }  { action:"invoiceUnpay", id, index }
//                { action:"invoiceStatus", id, status:"cancelled"|"refunded"|"reopen", amount, note }  { action:"invoiceSend", id }  { action:"invoiceDelete", id }
// Extensions (Phase 7): monthly quota per project (tasks beyond it are flagged, not blocked), a creative brief on each task,
// recurring tasks made by the studio (weekly / monthly), a monthly report per project (page + PDF, sent by hand or on the 1st),
// the project's Google Drive folder, and timecodes in comments.
//   client: GET ?report=PROJECT&month=YYYY-MM | ?reportDoc=PROJECT&month=YYYY-MM
//   studio: GET ?admin=1&report=… | ?admin=1&reportDoc=…   POST { action:"recurring", id?, project_id, title, type, description, every:"week"|"month", dow, dom, due_days, start, active }
//           { action:"recurringDelete", id }  { action:"recurringRun", id }  { action:"sendReport", project, month }
// Notifications (Phase 5): every studio decision becomes one event → in-app (always) + e-mail + WhatsApp, each by the client's own
// preferences. WhatsApp goes only to a number the client confirmed with explicit consent, through Meta's official Cloud API, and a
// failed send never blocks the work: it is logged and retried (5 min, 30 min, 2 h).
//   client: GET ?view=notifications | ?view=unread | ?view=prefs   POST { action:"read", ids|all }  { action:"prefs", email_cats, wa_cats, wa_phone, wa_consent }
const STATUSES = ["new","review","info","accepted","progress","feedback","revision","final","completed","rejected","cancelled"];
const OPEN = ["new","review","info","accepted","progress","feedback","revision","final"];
const PRIORITIES = ["normal","high","urgent"];
const PTYPES = ["program","monthly","campaign","design","once","content","editing","motion","commercial","custom"];   // program: episodes on a rhythm (cadence)
const DAYS = ["sat","sun","mon","tue","wed","thu","fri"];
// program: the publishing days only (one or several); an older record kept {per, day}
const cadenceOf = (type, c) => { if (type !== "program" || !c) return null;
  const pick = new Set([].concat(c.days || c.day || []).map(String)), days = DAYS.filter(d => pick.has(d));
  return days.length ? JSON.stringify({ days }) : null; };
const SCHEMA = [
  // money a client paid ahead (an advance, «سلفة»): positive rows; using it on an invoice adds a negative row tied to that invoice
  `CREATE TABLE IF NOT EXISTS credits (id TEXT PRIMARY KEY, email TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT '$', method TEXT, note TEXT, date TEXT, invoice_id TEXT, created_at TEXT NOT NULL)`,
  // which months of a client's package an invoice already covers
  `CREATE TABLE IF NOT EXISTS pkg_billed (email TEXT NOT NULL, month TEXT NOT NULL, invoice_id TEXT NOT NULL, PRIMARY KEY (email, month))`,
  `CREATE TABLE IF NOT EXISTS pkg_pay (invoice_id TEXT NOT NULL, email TEXT NOT NULL, month TEXT NOT NULL, amount REAL NOT NULL, kind TEXT NOT NULL DEFAULT 'pkg', created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, client_email TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT 'custom',
     status TEXT NOT NULL DEFAULT 'active', services TEXT NOT NULL DEFAULT '[]', start_date TEXT, end_date TEXT, quota INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS projects_client ON projects(client_email)`,
  `CREATE TABLE IF NOT EXISTS project_members (project_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', added_at TEXT, PRIMARY KEY (project_id, email))`,
  `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, ref TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL, client_email TEXT NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '', details TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL DEFAULT 'normal', requested_date TEXT, confirmed_date TEXT,
     status TEXT NOT NULL DEFAULT 'new', links TEXT NOT NULL DEFAULT '[]', studio_note TEXT NOT NULL DEFAULT '', change_request TEXT, recurring TEXT, created_by TEXT,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS tasks_client ON tasks(client_email, updated_at)`,
  `CREATE INDEX IF NOT EXISTS tasks_status ON tasks(status)`,
  `CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, actor_name TEXT NOT NULL DEFAULT '', client_email TEXT,
     project_id TEXT, task_id TEXT, kind TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}')`,
  `CREATE INDEX IF NOT EXISTS activity_client ON activity(client_email, id)`,
  `CREATE INDEX IF NOT EXISTS activity_project ON activity(project_id, id)`,
  `CREATE INDEX IF NOT EXISTS activity_task ON activity(task_id, id)`,
  `CREATE TABLE IF NOT EXISTS deliverables (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, project_id TEXT NOT NULL, client_email TEXT NOT NULL, version INTEGER NOT NULL, label TEXT NOT NULL,
     is_final INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL DEFAULT '', url TEXT NOT NULL, links TEXT NOT NULL DEFAULT '[]', note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'sent',
     decision_note TEXT NOT NULL DEFAULT '', points TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, decided_at TEXT, decided_by TEXT)`,
  `CREATE INDEX IF NOT EXISTS deliverables_task ON deliverables(task_id, version)`,
  `CREATE INDEX IF NOT EXISTS deliverables_project ON deliverables(project_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, scope TEXT NOT NULL, project_id TEXT NOT NULL, task_id TEXT, client_email TEXT NOT NULL, author TEXT NOT NULL, author_name TEXT NOT NULL DEFAULT '',
     body TEXT NOT NULL, links TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, deleted_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS comments_task ON comments(task_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS comments_project ON comments(project_id, scope, created_at)`,
  `CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, client_email TEXT NOT NULL, task_id TEXT, category TEXT NOT NULL DEFAULT 'other', title TEXT NOT NULL, url TEXT NOT NULL,
     note TEXT NOT NULL DEFAULT '', added_by TEXT NOT NULL, added_name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, deleted_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS files_project ON files(project_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient TEXT NOT NULL, kind TEXT NOT NULL, cat TEXT NOT NULL, link TEXT NOT NULL DEFAULT '',
     data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, read_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS notifications_rcpt ON notifications(recipient, id)`,
  `CREATE TABLE IF NOT EXISTS notify_prefs (email TEXT PRIMARY KEY, email_cats TEXT NOT NULL DEFAULT '{}', wa_cats TEXT NOT NULL DEFAULT '{}', wa_phone TEXT,
     wa_consent_at TEXT, wa_consent_v TEXT, wa_withdrawn_at TEXT, updated_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS notify_prefs_phone ON notify_prefs(wa_phone)`,
  `CREATE TABLE IF NOT EXISTS notify_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, channel TEXT NOT NULL, recipient TEXT NOT NULL, target TEXT, kind TEXT NOT NULL,
     status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 1, error TEXT, next_try_at TEXT, provider_id TEXT, delivery TEXT, payload TEXT)`,
  `CREATE INDEX IF NOT EXISTS notify_log_retry ON notify_log(status, next_try_at)`,
  `CREATE INDEX IF NOT EXISTS notify_log_provider ON notify_log(provider_id)`,
  `CREATE TABLE IF NOT EXISTS scheduled_sends (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, recipient TEXT NOT NULL, kind TEXT NOT NULL, t TEXT NOT NULL, extra TEXT NOT NULL, created_at TEXT NOT NULL, sent_at TEXT, cancelled_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS rule_log (rule TEXT NOT NULL, key TEXT NOT NULL, recipient TEXT NOT NULL DEFAULT '', at TEXT NOT NULL, outcome TEXT NOT NULL DEFAULT 'sent', PRIMARY KEY (rule, key))`,
  `CREATE TABLE IF NOT EXISTS pending_sends (id INTEGER PRIMARY KEY AUTOINCREMENT, rule TEXT NOT NULL, key TEXT NOT NULL, recipient TEXT NOT NULL, kind TEXT NOT NULL, t TEXT NOT NULL, extra TEXT NOT NULL, title TEXT NOT NULL, sub TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, done_at TEXT, outcome TEXT)`,
  `CREATE TABLE IF NOT EXISTS report_cfg (email TEXT PRIMARY KEY, every INTEGER NOT NULL DEFAULT 0, dow INTEGER NOT NULL DEFAULT 1, mode TEXT NOT NULL DEFAULT 'ask', projects TEXT NOT NULL DEFAULT '"all"', inc TEXT NOT NULL DEFAULT '{}', last_to TEXT, started TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS client_reports (id TEXT PRIMARY KEY, email TEXT NOT NULL, from_d TEXT NOT NULL, to_d TEXT NOT NULL, data TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', sent_at TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, no TEXT NOT NULL UNIQUE, client_email TEXT NOT NULL, project_id TEXT, title TEXT NOT NULL DEFAULT '', period TEXT NOT NULL DEFAULT '',
     items TEXT NOT NULL DEFAULT '[]', currency TEXT NOT NULL DEFAULT '$', discount REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, paid REAL NOT NULL DEFAULT 0, refunded REAL NOT NULL DEFAULT 0,
     status TEXT NOT NULL DEFAULT 'pending', issue_date TEXT NOT NULL, due_date TEXT, note TEXT NOT NULL DEFAULT '', payments TEXT NOT NULL DEFAULT '[]', sent_at TEXT, reminded_at TEXT,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS invoices_client ON invoices(client_email, issue_date)`,
  `CREATE INDEX IF NOT EXISTS invoices_status ON invoices(status, due_date)`,
  `CREATE TABLE IF NOT EXISTS recurring (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, client_email TEXT NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
     every TEXT NOT NULL DEFAULT 'month', dow INTEGER, dom INTEGER, due_days INTEGER NOT NULL DEFAULT 5, next_run TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, runs INTEGER NOT NULL DEFAULT 0, last_ref TEXT,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS recurring_next ON recurring(active, next_run)`,
  // phase 9: the studio's record of each client — a stable id, contact details, internal notes and status (active / paused / archived).
  // Every other table already points at the client by its unique account e-mail (client_email); this row gives that client an id of its own.
  `CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
     logo_url TEXT, status TEXT NOT NULL DEFAULT 'active', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS clients_status ON clients(status)`,
  `CREATE INDEX IF NOT EXISTS files_client ON files(client_email, created_at)`,
  `CREATE INDEX IF NOT EXISTS deliverables_client ON deliverables(client_email, created_at)`,
  // phase 10: notifications outside the site — this device (Web Push) and Telegram
  `CREATE TABLE IF NOT EXISTS push_subs (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, ua TEXT, created_at TEXT NOT NULL, last_ok_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS push_subs_email ON push_subs(email)`,
  `CREATE TABLE IF NOT EXISTS tg_links (email TEXT PRIMARY KEY, chat_id TEXT NOT NULL UNIQUE, username TEXT, linked_at TEXT NOT NULL)`,
  // the two quiet first-visit hints (welcome strip, player tip): shown once per client
  `CREATE TABLE IF NOT EXISTS client_tips (email TEXT NOT NULL, k TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (email, k))`,
  // the client's brand library: colours, fonts, style and music here; logos and font files in brand_assets (files in R2 under b/…)
  `CREATE TABLE IF NOT EXISTS brand_kits (email TEXT PRIMARY KEY, colors TEXT NOT NULL DEFAULT '[]', fonts TEXT NOT NULL DEFAULT '[]', style TEXT NOT NULL DEFAULT '', music TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS brand_assets (id TEXT PRIMARY KEY, email TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, key TEXT NOT NULL, size INTEGER, type TEXT, created_at TEXT NOT NULL, deleted_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS brand_assets_email ON brand_assets(email, created_at)`,
];
// columns added to tables that already exist on the live database (run once, in order; meta "schema" keeps the count)
const MIGRATIONS = [
  "ALTER TABLE tasks ADD COLUMN brief TEXT",
  "ALTER TABLE tasks ADD COLUMN over_quota INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE projects ADD COLUMN drive_url TEXT",
  "ALTER TABLE projects ADD COLUMN auto_report INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE tasks ADD COLUMN assignee TEXT",
  "ALTER TABLE notify_prefs ADD COLUMN push_cats TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE notify_prefs ADD COLUMN tg_cats TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE projects ADD COLUMN cadence TEXT",
  "ALTER TABLE invoices ADD COLUMN scope TEXT",
  // logos are now «on a background» or «transparent»: the dark ones had a background; a light one moves to transparent when its format can be (the key keeps its old folder)
  "UPDATE brand_assets SET kind='logo_bg' WHERE kind='logo_dark'",
  "UPDATE brand_assets SET kind=CASE WHEN type IN ('image/png','image/svg+xml','image/webp','image/gif') THEN 'logo_clear' ELSE 'logo_bg' END WHERE kind='logo_light'",
  "ALTER TABLE projects ADD COLUMN terms TEXT",
  "ALTER TABLE tasks ADD COLUMN unit TEXT",
  "ALTER TABLE tasks ADD COLUMN extras TEXT",
  "ALTER TABLE projects ADD COLUMN carry TEXT",
  // 19 Nov: the package belongs to the client (all their projects draw from it); a project can stand outside it
  "ALTER TABLE clients ADD COLUMN terms TEXT",
  "ALTER TABLE clients ADD COLUMN carry TEXT",
  "ALTER TABLE projects ADD COLUMN in_pkg INTEGER NOT NULL DEFAULT 1",
  "UPDATE clients SET terms=(SELECT p.terms FROM projects p WHERE p.client_email=clients.email AND p.terms IS NOT NULL ORDER BY p.updated_at DESC LIMIT 1), carry=(SELECT p.carry FROM projects p WHERE p.client_email=clients.email AND p.terms IS NOT NULL ORDER BY p.updated_at DESC LIMIT 1) WHERE terms IS NULL",
  "ALTER TABLE projects ADD COLUMN single INTEGER NOT NULL DEFAULT 0",
  // 19 Nov: billing from the work itself: a task remembers the invoice it went on; an invoice keeps what it covers
  "ALTER TABLE tasks ADD COLUMN invoice_id TEXT",
  "ALTER TABLE invoices ADD COLUMN annex TEXT",
  "ALTER TABLE invoices ADD COLUMN links TEXT",
  // 19 Nov, once: Otad's «أزميل» episodes were filed under one-off works; they are a finished program of their own
  "INSERT INTO projects (id, client_email, name, type, status, created_at, updated_at) SELECT 'p_azm' || lower(hex(randomblob(5))), c.email, 'أزميل', 'program', 'completed', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM clients c WHERE (c.name LIKE '%أوتاد%' OR c.name LIKE '%اوتاد%') AND NOT EXISTS (SELECT 1 FROM projects x WHERE x.client_email=c.email AND x.name='أزميل') AND EXISTS (SELECT 1 FROM tasks k JOIN projects p ON p.id=k.project_id WHERE p.client_email=c.email AND p.single=1 AND (k.title LIKE 'أزميل%' OR k.title LIKE 'ازميل%'))",
  "UPDATE tasks SET project_id=(SELECT x.id FROM projects x WHERE x.client_email=tasks.client_email AND x.name='أزميل' LIMIT 1), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE (title LIKE 'أزميل%' OR title LIKE 'ازميل%') AND project_id IN (SELECT id FROM projects WHERE single=1) AND EXISTS (SELECT 1 FROM projects x WHERE x.client_email=tasks.client_email AND x.name='أزميل')",
  "UPDATE deliverables SET project_id=(SELECT k.project_id FROM tasks k WHERE k.id=deliverables.task_id) WHERE task_id IN (SELECT k.id FROM tasks k JOIN projects x ON x.id=k.project_id WHERE x.name='أزميل') AND project_id<>(SELECT k.project_id FROM tasks k WHERE k.id=deliverables.task_id)",
];
const FILE_CATS = ["brand","raw","reference","document","other"];
const TC = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;
let READY = false;
async function db(env){
  if (!env.DB) return null;
  if (!READY) {
    await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
    const v = +(((await env.DB.prepare("SELECT v FROM meta WHERE k='schema'").first()) || {}).v || 0);
    for (let i = v; i < MIGRATIONS.length; i++) { try { await env.DB.prepare(MIGRATIONS[i]).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message || e))) throw e; } }
    if (v < MIGRATIONS.length) await env.DB.prepare("INSERT INTO meta (k, v) VALUES ('schema', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(MIGRATIONS.length)).run();
    READY = true;
  }
  return env.DB;
}
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(Date.parse(s + "T00:00:00Z"));
const clip = (v, m) => String(v ?? "").trim().slice(0, m);
function cleanLinks(list){ return (Array.isArray(list) ? list : []).slice(0, 12).map(x => ({ label: clip(x && x.label, 80), url: clip(x && x.url, 600) })).filter(x => /^https?:\/\/[^\s]+$/i.test(x.url)); }
function parse(t){ if (!t) return t; try { t.links = JSON.parse(t.links || "[]"); } catch { t.links = []; } try { t.extras = t.extras ? JSON.parse(t.extras) : null; } catch { t.extras = null; } try { t.brief = t.brief ? JSON.parse(t.brief) : null; } catch { t.brief = null; } try { t.change_request = t.change_request ? JSON.parse(t.change_request) : null; } catch { t.change_request = null; } return t; }
function parseP(p){ if (!p) return p; try { p.services = JSON.parse(p.services || "[]"); } catch { p.services = []; } try { p.terms = p.terms ? JSON.parse(p.terms) : null; } catch { p.terms = null; } try { p.carry = p.carry ? JSON.parse(p.carry) : {}; } catch { p.carry = {}; } return p; }
// units carried into a month (set by hand by the studio): { "YYYY-MM": { unitId: n } }; the package for that month is inc + carried
const carryOf = (p, month) => (p.carry && p.carry[month]) || {};
const monthBefore = m => { const d = new Date(m + "-15T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
// ---- the project's agreement (19 Nov): a monthly package (units included, each with a price for one more) or a price per unit,
// and the extras the studio may add to a task (a flat amount, a share of the unit's price, or by length) — the client approves an extra before the work
const TMODES = ["package", "unit"], XKINDS = ["flat", "pct", "dur"];
const amt = v => Math.max(0, Math.round((+v || 0) * 100) / 100);
function cleanTerms(t){ if (!t || !TMODES.includes(t.mode)) return null;
  // ids stay stable across edits (tasks keep their unit); a new or repeated id takes the next free number
  const seen = new Set(), id = (v, p) => { let k = /^[a-z0-9]{1,10}$/.test(String(v || "")) && !seen.has(String(v)) ? String(v) : ""; for (let n = 1; !k; n++) if (!seen.has(p + n) && !(t.units || []).concat(t.extras || []).some(x => x && x.id === p + n)) k = p + n; seen.add(k); return k; };
  const units = (Array.isArray(t.units) ? t.units : []).slice(0, 12).map(u => ({ id: id(u.id, "u"), name: clip(u.name, 40), inc: Math.max(0, Math.min(999, Math.round(+u.inc || 0))), price: amt(u.price) })).filter(u => u.name);
  const extras = (Array.isArray(t.extras) ? t.extras : []).slice(0, 12).map(x => ({ id: id(x.id, "x"), name: clip(x.name, 60), kind: XKINDS.includes(x.kind) ? x.kind : "flat", amount: amt(x.amount),
    ...(x.kind === "dur" ? { max: Math.max(1, Math.min(3600, Math.round(+x.max || 50))), step: Math.max(1, Math.min(3600, Math.round(+x.step || 30))) } : {}) })).filter(x => x.name && x.amount > 0);
  if (!units.length) return null;
  return JSON.stringify({ mode: t.mode, price: t.mode === "package" ? amt(t.price) : 0, cur: clip(t.cur, 8) || "$", start: /^\d{4}-\d{2}$/.test(t.start || "") ? t.start : null, units, extras });
}
// what one extra costs on a task of this unit; sec: the piece's length (for «by length»)
function extraCost(x, unit, sec){
  if (x.kind === "flat") return { amount: x.amount, detail: "" };
  if (x.kind === "pct") return { amount: unit && unit.price ? amt(unit.price * x.amount / 100) : 0, detail: x.amount + "%" };
  const over = Math.max(0, (+sec || 0) - x.max), steps = Math.ceil(over / x.step);
  return { amount: amt(steps * x.amount), detail: steps ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} · +${steps * x.step}s` : "" };
}
const unitOf = (terms, name) => { const n = String(name || "").trim().toLowerCase(); return terms && n ? (terms.units.find(u => u.name.toLowerCase() === n) || null) : null; };
// the client's agreement (clients.terms / clients.carry); projects with in_pkg=1 draw from it
async function agreementOf(D, email){ const r = await D.prepare("SELECT terms, carry FROM clients WHERE email=?").bind(String(email || "").toLowerCase()).first(); if (!r || !r.terms) return null;
  let terms, carry; try { terms = JSON.parse(r.terms); } catch { return null; } try { carry = r.carry ? JSON.parse(r.carry) : {}; } catch { carry = {}; } return { terms, carry }; }
const PKG = "(SELECT id FROM projects WHERE client_email=?1 AND in_pkg=1)";
// each client's «one-off work»: one standing project for the work that belongs to no project (a single episode, a logo…);
// made the first time it is chosen; in the package, but only tasks given a unit draw from it
const SINGLE = "__single";
async function singlesOf(D, email){
  const e = String(email || "").toLowerCase(), have = await D.prepare("SELECT * FROM projects WHERE client_email=? AND single=1").bind(e).first(); if (have) return have;
  const id = "p_" + randHex(6), at = now();
  await D.prepare("INSERT INTO projects (id, client_email, name, description, type, status, services, start_date, end_date, quota, drive_url, auto_report, created_at, updated_at, in_pkg, single) VALUES (?,?,?,?,'custom','active','[]',NULL,NULL,NULL,NULL,0,?,?,1,1)")
    .bind(id, e, "أعمال منفردة", "", at, at).run();
  return D.prepare("SELECT * FROM projects WHERE id=?").bind(id).first();
}
// units used this month across the client's projects in the package: in total, and by project
async function usageOf(D, email, month){ const used = {}, by = {};
  for (const r of (await D.prepare(`SELECT unit, project_id, COUNT(*) AS n FROM tasks WHERE project_id IN ${PKG} AND unit IS NOT NULL AND substr(created_at,1,7)=?2 AND status NOT IN ('cancelled','rejected') GROUP BY unit, project_id`).bind(email, month).all()).results) {
    used[r.unit] = (used[r.unit] || 0) + r.n; (by[r.unit] ||= {})[r.project_id] = r.n; }
  return { used, by }; }
// a project as the client reads it: never the raw agreement
async function forClientP(D, p, en){ if (!p) return p; delete p.terms; delete p.carry; if (p.single) p.name = en ? "One-off work" : "أعمال منفردة"; return p; }
// the client's view of their package: what is included, what was used (and by which project), what one more costs; never the package price or per-unit prices
async function clientAgreement(D, email){ const a = await agreementOf(D, email); if (!a) return null; const t = a.terms, m = monthOf(now()), u = await usageOf(D, email, m);
  return { mode: t.mode, cur: t.cur, used: u.used, by: u.by, carried: carryOf(a, m), units: t.units.map(x => ({ id: x.id, name: x.name, ...(t.mode === "package" ? { inc: x.inc, price: x.price || undefined } : {}) })) }; }
const monthsFrom = (a, b) => { const out = []; let m = a; for (let i = 0; i < 60 && m <= b; i++) { out.push(m); const d = new Date(m + "-15T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1); m = d.toISOString().slice(0, 7); } return out; };
async function releaseInvoice(D, id){ await D.batch([D.prepare("UPDATE tasks SET invoice_id=NULL WHERE invoice_id=?").bind(id), D.prepare("DELETE FROM pkg_billed WHERE invoice_id=?").bind(id), D.prepare("DELETE FROM pkg_pay WHERE invoice_id=?").bind(id), D.prepare("DELETE FROM credits WHERE invoice_id=?").bind(id)]); }
// what the invoices so far put toward one month of the package (a month billed whole the old way counts as its price)
async function pkgBilledOf(D, email, m, price){ const r = await D.prepare("SELECT SUM(amount) AS s, COUNT(DISTINCT invoice_id) AS n FROM pkg_pay WHERE email=? AND month=? AND kind='pkg'").bind(email, m).first();
  const old = await D.prepare("SELECT 1 FROM pkg_billed WHERE email=? AND month=?").bind(email, m).first();
  return { month: m, amount: amt((r.s || 0) + (old ? +price || 0 : 0)), count: (r.n || 0) + (old ? 1 : 0) }; }
async function creditOf(D, email){ return amt((await D.prepare("SELECT SUM(amount) AS s FROM credits WHERE email=?").bind(email).first()).s || 0); }
// everything a client owes that no invoice covers yet: the package's months, extras they approved, work outside the package, units at a price;
// what is still in progress (shown, not billed); and their prepaid credit
async function unbilledOf(D, email){
  const a = await agreementOf(D, email), t = a && a.terms, cur = (t && t.cur) || "$", now7 = monthOf(now());
  const rows = (await D.prepare(`SELECT k.id, k.ref, k.title, k.unit, k.status, k.created_at, k.completed_at, k.extras, k.invoice_id, k.project_id, p.name AS pname, p.in_pkg, p.single
      FROM tasks k JOIN projects p ON p.id=k.project_id WHERE p.client_email=? AND k.status NOT IN ('cancelled','rejected') ORDER BY k.created_at`).bind(email).all()).results.map(parse);
  const pn = r => r.single ? "أعمال منفردة" : r.pname, inPkg = r => t && r.in_pkg !== 0 && r.unit && t.units.some(u => u.id === r.unit), out = { cur, pkg: !!(t && t.mode === "package"), months: [], pkgTasks: [], extras: [], others: [], units: [], open: [], credit: await creditOf(D, email) };
  if (t && t.mode === "package") {
    const billed = new Set((await D.prepare("SELECT month FROM pkg_billed WHERE email=?").bind(email).all()).results.map(r => r.month));
    const first = t.start || (rows.filter(inPkg).map(r => monthOf(r.created_at)).sort()[0]) || now7;
    const pays = (await D.prepare("SELECT month, kind, SUM(amount) AS s, COUNT(DISTINCT invoice_id) AS n FROM pkg_pay WHERE email=? GROUP BY month, kind").bind(email).all()).results;
    for (const m of monthsFrom(first, now7)) { if (billed.has(m)) continue;
      const mine = rows.filter(r => inPkg(r) && monthOf(r.created_at) === m), cy = carryOf(a, m), used = {}, pp = pays.find(p => p.month === m && p.kind === "pkg");
      mine.forEach(r => used[r.unit] = (used[r.unit] || 0) + 1);
      const paid = amt(pp ? pp.s : 0), remaining = amt(Math.max(0, t.price - paid)), over = pays.some(p => p.month === m && p.kind === "over") ? [] :
        t.units.map(u => ({ name: u.name, qty: (used[u.id] || 0) - u.inc - (+cy[u.id] || 0), price: u.price })).filter(o => o.qty > 0 && o.price);
      if (remaining <= 0.009 && !over.length) continue;
      out.months.push({ month: m, price: t.price, paid, remaining, count: pp ? pp.n : 0, units: t.units.filter(u => u.inc).map(u => ({ name: u.name, used: used[u.id] || 0, have: u.inc + (+cy[u.id] || 0) })), over, current: m === now7 }); }
  }
  for (const r of rows) { if (r.invoice_id) continue;
    if (t && t.mode === "package" && inPkg(r)) out.pkgTasks.push({ id: r.id, title: r.title, pname: pn(r), date: String(r.completed_at || r.created_at || "").slice(0, 10), done: r.status === "completed" });
    if (r.extras && r.extras.state === "accepted") out.extras.push({ id: r.id, title: r.title, pname: pn(r), pid: r.project_id, items: r.extras.items.map(e => ({ name: e.name, detail: e.detail || "", amount: e.amount })) });
    if (r.status !== "completed") { out.open.push({ title: r.title, pname: pn(r), status: r.status, pkg: !!inPkg(r) }); continue; }
    if (t && t.mode === "unit" && inPkg(r)) { const u = t.units.find(x => x.id === r.unit); out.units.push({ id: r.id, title: r.title, pname: pn(r), unit: u.name, price: u.price, pid: r.project_id }); }
    else if (!inPkg(r)) out.others.push({ id: r.id, title: r.title, pname: pn(r), pid: r.project_id, date: String(r.completed_at || "").slice(0, 10) }); }
  return out;
}
// the month's invoice lines for one client: the package (or the units done), units past the package, and the extras the client approved (under their project)
async function monthLines(D, email, month){
  const a = await agreementOf(D, email); if (!a) return []; const t = a.terms;
  const tasks = (await D.prepare(`SELECT ref, title, unit, status, created_at, completed_at, extras, project_id FROM tasks WHERE project_id IN ${PKG} AND status NOT IN ('cancelled','rejected')`).bind(email).all()).results.map(parse);
  const inM = d => String(d || "").slice(0, 7) === month, out = [], MN = new Date(month + "-15T12:00:00Z").toLocaleDateString("ar-u-nu-latn", { month: "long", year: "numeric" });
  if (t.mode === "package") {
    out.push({ desc: "الباقة الشهرية · " + MN, qty: 1, unit: t.price, project: "" });
    const used = {}; tasks.filter(x => x.unit && inM(x.created_at)).forEach(x => used[x.unit] = (used[x.unit] || 0) + 1);
    const cy = carryOf(a, month);
    for (const u of t.units) { const have = u.inc + (+cy[u.id] || 0), more = (used[u.id] || 0) - have; if (more > 0 && u.price) out.push({ desc: u.name + " إضافي (" + used[u.id] + " من " + have + ")", qty: more, unit: u.price, project: "" }); }
  } else {
    for (const u of t.units) { const n = tasks.filter(x => x.unit === u.id && x.status === "completed" && inM(x.completed_at)).length; if (n && u.price) out.push({ desc: u.name + " · " + MN, qty: n, unit: u.price, project: "" }); }
  }
  for (const x of tasks) if (x.extras && x.extras.state === "accepted" && inM(x.completed_at || x.created_at))
    for (const e of x.extras.items || []) out.push({ desc: x.title + " · " + e.name + (e.detail ? " (" + e.detail + ")" : ""), qty: 1, unit: e.amount, project: x.project_id });
  return out;
}
function parseA(a){ try { a.data = JSON.parse(a.data || "{}"); } catch { a.data = {}; } return a; }
function parseD(x){ try { x.links = JSON.parse(x.links || "[]"); } catch { x.links = []; } try { x.points = JSON.parse(x.points || "[]"); } catch { x.points = []; } x.is_final = !!x.is_final; return x; }
function parseC(x){ try { x.links = JSON.parse(x.links || "[]"); } catch { x.links = []; } return x; }
const PT_KIND = ["edit", "ask", "note", "love"], PT_ST = ["open", "progress", "resolved", "na"];
// client notes on their way to a team member: anything that reaches the client (e-mail, phone, handle, social or chat link) is cut out
const SCRUB = [/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi, /https?:\/\/(?:www\.)?(?:wa\.me|api\.whatsapp\.com|t\.me|telegram\.me|instagram\.com|facebook\.com|fb\.com|m\.me|linkedin\.com|tiktok\.com|snapchat\.com|x\.com|twitter\.com|threads\.net)\S*/gi,
  /(?:^|(?<=\s))@[A-Za-z0-9_.]{3,}/g, /(?:\+|00)?\d[\d\s\-().]{6,}\d/g];
function scrubContact(s){ let cut = 0, out = String(s || ""); for (const re of SCRUB) out = out.replace(re, m => { if (/^\d{1,2}:\d{2}$/.test(m.trim()) || m.replace(/\D/g, "").length < 8 && !/@|https?:/.test(m)) return m; cut++; return "[محذوف]"; }); return { text: out, cut }; }
async function forwardToTeam(env, t, label, points, note){
  const keys = []; let cursor; do { const r = await env.EB.list({ prefix: "ttask:", cursor }); keys.push(...r.keys.map(k => k.name)); cursor = r.list_complete ? null : r.cursor; } while (cursor);
  const KN = { edit: "تعديل", ask: "سؤال", note: "ملاحظة", love: "أعجبني" }, at = new Date().toISOString(); let cut = 0;
  const lines = points.map((p, i) => { const s = scrubContact(p.text); cut += s.cut; return (i + 1) + ". " + (p.t ? "[" + p.t + "] " : "") + (KN[p.kind] ? KN[p.kind] + ": " : "") + s.text; });
  const n = note ? scrubContact(note) : null; if (n) cut += n.cut;
  const text = "ملاحظات العميل على " + label + ":\n" + lines.join("\n") + (n && n.text ? "\n\n" + n.text : "");
  let sent = 0;
  for (const k of keys) { const v = await env.EB.get(k); if (!v) continue; const x = JSON.parse(v); if (x.workTask !== t.ref || x.status === "declined") continue;
    (x.comments ||= []).push({ from: "studio", text, at, client: true }); x.status = "changes"; (x.log ||= []).push({ at, what: "client_changes", label }); x.updatedAt = at;
    await env.EB.put(k, JSON.stringify(x)); sent++;
    const m = await env.EB.get("member:" + x.member); const mm = m && JSON.parse(m);
    if (mm && mm.status === "active") await sendMail(env, mm.email, (mm.lang === "en" ? "Changes requested: " : "تعديلات مطلوبة: ") + x.title,
      mail(mm.lang === "en" ? "en" : "ar", mm.lang === "en" ? "The client asked for changes" : "طلب العميل تعديلات", `<p style="margin:0;white-space:pre-wrap">${h(text)}</p>`, mm.lang === "en" ? "Open the task" : "افتح المهمة", SITE + "/team/", null)); }
  // the studio hears when something was taken out, so it can check the original
  if (sent && cut) await telegram(env, "🛡️ حذفت " + cut + " من معلومات التواصل من ملاحظات العميل على " + t.ref + " قبل ما توصل لعضو الفريق. راجع الأصل باللوحة: " + SITE + "/admin/#tasks/" + t.ref);
  return sent;
}
function cleanPoints(list){ return (Array.isArray(list) ? list : []).slice(0, 30).map(x => ({ t: TC.test(clip(x && x.t, 8)) ? clip(x.t, 8) : "", text: clip(x && x.text, 600), kind: PT_KIND.includes(x && x.kind) ? x.kind : "edit", status: "open", done: false })).filter(x => x.text); }
// what the client sees of a version: everything but the studio's internal notes
const forClient = list => list.map(d => ({ ...d, points: (d.points || []).filter(p => !p.internal) }));
const isUrl = u => /^https?:\/\/[^\s]+$/i.test(u || "");
const excerpt = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
async function deliverablesOf(D, taskId){ return (await D.prepare("SELECT * FROM deliverables WHERE task_id=? ORDER BY version DESC").bind(taskId).all()).results.map(parseD); }
async function commentsOf(D, scope, id){ return (await D.prepare(scope === "task" ? "SELECT * FROM comments WHERE task_id=? AND scope='task' AND deleted_at IS NULL ORDER BY created_at LIMIT 300"
  : "SELECT * FROM comments WHERE project_id=? AND scope='project' AND deleted_at IS NULL ORDER BY created_at LIMIT 300").bind(id).all()).results.map(parseC); }
async function spaceOf(D, pid){
  const files = (await D.prepare("SELECT * FROM files WHERE project_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 300").bind(pid).all()).results;
  const delivered = (await D.prepare(`SELECT d.id, d.label, d.title, d.url, d.is_final, d.status, d.created_at, t.ref, t.title AS task_title FROM deliverables d JOIN tasks t ON t.id=d.task_id
    WHERE d.project_id=? ORDER BY d.created_at DESC LIMIT 300`).bind(pid).all()).results.map(x => (x.is_final = !!x.is_final, x));
  return { comments: await commentsOf(D, "project", pid), files, delivered };
}
async function newRef(D){ for (let i = 0; i < 6; i++) { const r = "T-" + randHex(3).toUpperCase().slice(0, 5); if (!(await D.prepare("SELECT 1 FROM tasks WHERE ref=?").bind(r).first())) return r; } return "T-" + randHex(4).toUpperCase(); }
async function act(D, a){ await D.prepare("INSERT INTO activity (at, actor, actor_name, client_email, project_id, task_id, kind, data) VALUES (?,?,?,?,?,?,?,?)")
  .bind(now(), a.actor, a.actor_name || "", a.client_email || null, a.project_id || null, a.task_id || null, a.kind, JSON.stringify(a.data || {})).run(); }
// what a signed-in client may see: projects they own or are a member of
const MINE = "(SELECT id FROM projects WHERE client_email=?1 UNION SELECT project_id FROM project_members WHERE email=?1)";
async function myProject(D, email, id){ return D.prepare(`SELECT * FROM projects WHERE id=?2 AND id IN ${MINE}`).bind(email, id).first(); }
async function myTask(D, email, ref){ return D.prepare(`SELECT t.*, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.ref=?2 AND t.project_id IN ${MINE}`).bind(email, ref).first(); }
// the name the studio gave a client (clients.name) is their name everywhere: e-mails, invoices, notices; an account still holding the old one is brought in line
async function userOf(env, email){ const v = await env.EB.get("user:" + String(email || "").toLowerCase()); if (!v) return null; const u = JSON.parse(v);
  if (u.role === "client" && env.DB) { const c = await env.DB.prepare("SELECT name FROM clients WHERE email=?").bind(u.email).first().catch(() => null);
    if (c && c.name && c.name !== u.name) { u.name = c.name; await env.EB.put("user:" + u.email, JSON.stringify(u)); } }
  return u; }
async function studioNames(env){ if (!env.DB) return {}; const r = await env.DB.prepare("SELECT email, name FROM clients WHERE name IS NOT NULL AND name<>''").all().catch(() => ({ results: [] })); return Object.fromEntries(r.results.map(x => [x.email, x.name])); }
const adminLink = ref => SITE + "/admin/#tasks/" + ref;
const ST_LABEL = { ar:{ new:"طلب جديد", review:"قيد المراجعة", info:"بانتظار معلوماتك", accepted:"تم القبول", progress:"قيد التنفيذ", feedback:"بانتظار ملاحظاتك", revision:"تعديلات مطلوبة", final:"التسليم النهائي", completed:"مكتملة", rejected:"مرفوضة", cancelled:"ملغاة" },
                   en:{ new:"New request", review:"Under review", info:"Awaiting your information", accepted:"Accepted", progress:"In progress", feedback:"Awaiting your feedback", revision:"Revision requested", final:"Final delivery", completed:"Completed", rejected:"Rejected", cancelled:"Cancelled" } };
const fmtDate = (d, lang) => { try { return new Date(d + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-GB" : "ar-u-nu-latn", { weekday:"long", year:"numeric", month:"long", day:"numeric" }); } catch { return d; } };
// ==== extensions (phase 7) ====
const BRIEF_KEYS = ["goal","audience","format","duration","tone","message","cta","music","brand"];
// the brand library, read for the client page and for a task that uses it
async function brandOf(D, email){ const k = await brandKit(D, email); k.assets = k.assets.map(a => ({ ...a, url: SITE + "/api/up/" + a.key })); return k; }
// a task that uses the library carries a short summary in its brief and the library's files among its links (the studio sees both as they are today)
function brandBrief(b, ar){
  const out = [];
  if (b.colors.length) out.push((ar ? "الألوان: " : "Colours: ") + b.colors.map(c => (c.name ? c.name + " " : "") + c.hex).join("، "));
  if (b.fonts.length) out.push((ar ? "الخطوط: " : "Fonts: ") + b.fonts.map(f => f.name + (f.use ? " (" + f.use + ")" : "")).join("، "));
  if (b.style) out.push((ar ? "الأسلوب: " : "Style: ") + b.style);
  if (b.music) out.push((ar ? "الموسيقى: " : "Music: ") + b.music);
  return out.join(" · ") || (ar ? "مكتبة الهوية المعتمدة" : "The approved brand library");
}
function cleanBrief(b){ if (!b || typeof b !== "object") return null; const o = {}; for (const k of BRIEF_KEYS) { const v = clip(b[k], 600); if (v) o[k] = v; } return Object.keys(o).length ? o : null; }
const monthOf = d => String(d || "").slice(0, 7);
const isMonth = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || "");
async function quotaUse(D, pid, month){ return (await D.prepare("SELECT COUNT(*) AS n FROM tasks WHERE project_id=? AND substr(created_at,1,7)=? AND status NOT IN ('cancelled','rejected')").bind(pid, month || monthOf(now())).first()).n; }
function addDays(d, n){ const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function nextRun(after, every, dow, dom){
  const x = new Date(after + "T12:00:00Z");
  if (every === "week") { do { x.setUTCDate(x.getUTCDate() + 1); } while (x.getUTCDay() !== (+dow || 0)); return x.toISOString().slice(0, 10); }
  const day = Math.min(28, Math.max(1, +dom || 1)); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + 1); x.setUTCDate(day); return x.toISOString().slice(0, 10);
}
function firstRun(start, every, dow, dom){ const t = isDate(start) ? start : today();
  if (every === "week") { const x = new Date(t + "T12:00:00Z"); while (x.getUTCDay() !== (+dow || 0)) x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); }
  const day = Math.min(28, Math.max(1, +dom || 1)), x = new Date(t + "T12:00:00Z"); if (x.getUTCDate() > day) { x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + 1); } x.setUTCDate(day); return x.toISOString().slice(0, 10); }
// make the task of one recurring template (status "accepted": it is part of the agreement), then move the template to its next date
async function runRecurring(ctx, env, D, r, on){
  const p = await D.prepare("SELECT * FROM projects WHERE id=?").bind(r.project_id).first(); if (!p || p.status !== "active") return null;
  const at = now(), id = "t_" + randHex(8), ref = await newRef(D), due = addDays(on, Math.max(0, Math.min(90, +r.due_days || 0))), title = clip(r.title + " · " + on, 140);
  await D.prepare(`INSERT INTO tasks (id, ref, project_id, client_email, title, type, description, priority, requested_date, confirmed_date, status, links, recurring, created_by, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,'normal',?,?,'accepted','[]',?,'studio',?,?)`).bind(id, ref, p.id, p.client_email, title, r.type || "", r.description || "", due, due, r.id, at, at).run();
  await D.prepare("UPDATE projects SET updated_at=? WHERE id=?").bind(at, p.id).run();
  await act(D, { actor: "studio", actor_name: "Eyeblink Studio", client_email: p.client_email, project_id: p.id, task_id: id, kind: "task_created", data: { ref, title, recurring: true, confirmed_date: due } });
  let nx = nextRun(on, r.every, r.dow, r.dom); while (nx <= today()) nx = nextRun(nx, r.every, r.dow, r.dom);   // missed runs are not replayed
  await D.prepare("UPDATE recurring SET next_run=?, runs=runs+1, last_ref=?, updated_at=? WHERE id=?").bind(nx, ref, at, r.id).run();
  const pr = later(ctx, tellAdmin(ctx, env, { client_email: p.client_email, ref, title, confirmed_date: due, status: "accepted" }, "recurring", {})); if (pr) await pr;   // the sweep has no waitUntil of its own
  return ref;
}
async function monthReport(D, p, month){
  const tasks = (await D.prepare("SELECT id, ref, title, status, created_at, completed_at, confirmed_date, over_quota, recurring FROM tasks WHERE project_id=?").bind(p.id).all()).results;
  const created = tasks.filter(t => monthOf(t.created_at) === month && !["cancelled","rejected"].includes(t.status));
  const done = tasks.filter(t => t.status === "completed" && monthOf(t.completed_at) === month);
  const dl = (await D.prepare("SELECT d.task_id, d.label, d.status, d.is_final, d.created_at FROM deliverables d WHERE d.project_id=?").bind(p.id).all()).results;
  const versions = dl.filter(x => monthOf(x.created_at) === month), rounds = versions.filter(x => x.status === "changes").length;
  const withDate = done.filter(t => t.confirmed_date), onTime = withDate.filter(t => String(t.completed_at).slice(0, 10) <= t.confirmed_date).length;
  const inv = (await D.prepare("SELECT no, title, currency, total, paid, status, due_date, issue_date, payments, sent_at FROM invoices WHERE (project_id=? OR scope LIKE ? OR scope=?) AND client_email=? AND sent_at IS NOT NULL").bind(p.id, '%"' + p.id + '"%', '"all"', p.client_email).all()).results.map(x => parseI(x));
  const issued = inv.filter(x => monthOf(x.issue_date) === month), paidIn = {};
  inv.forEach(x => x.payments.forEach(y => { if (monthOf(y.date || y.at) === month) paidIn[x.currency] = money((paidIn[x.currency] || 0) + y.amount); }));
  const open = tasks.filter(t => OPEN.includes(t.status)).length;
  return { month, project: { id: p.id, name: p.name, quota: p.quota || null }, created: created.length, completed: done.map(t => ({ ref: t.ref, title: t.title, completed_at: t.completed_at, confirmed_date: t.confirmed_date, on_time: !t.confirmed_date || String(t.completed_at).slice(0, 10) <= t.confirmed_date })),
    versions: versions.length, finals: versions.filter(x => x.is_final).length, rounds, on_time: withDate.length ? Math.round(onTime * 100 / withDate.length) : null, open, over_quota: created.filter(t => t.over_quota).length,
    invoices: issued.map(x => ({ no: x.no, title: x.title, total: x.total, currency: x.currency, state: x.state })), paid: paidIn };
}
const REP_T = { ar: { title:"التقرير الشهري", project:"المشروع", month:"الشهر", created:"مهام جديدة", completed:"مهام مكتملة", versions:"نسخ مُسلّمة", rounds:"جولات تعديل", ontime:"في الموعد", open:"مهام مفتوحة الآن", quota:"الحصة الشهرية",
    list:"المهام المكتملة", task:"المهمة", doneOn:"اكتملت", due:"الموعد المؤكد", inv:"الفواتير الصادرة", paid:"المدفوع خلال الشهر", none:"لا شيء خلال هذا الشهر.", over:"خارج الحصة", foot:"تقرير آلي من مساحة عمل Eyeblink Studio." },
  en: { title:"Monthly report", project:"Project", month:"Month", created:"New tasks", completed:"Completed tasks", versions:"Versions delivered", rounds:"Revision rounds", ontime:"On time", open:"Open tasks now", quota:"Monthly quota",
    list:"Completed tasks", task:"Task", doneOn:"Completed", due:"Confirmed date", inv:"Invoices issued", paid:"Paid this month", none:"Nothing this month.", over:"over quota", foot:"Generated from the Eyeblink Studio workspace." } };
function reportHTML(R, cl, lang){
  const en = lang === "en", L = REP_T[en ? "en" : "ar"], S = BILL_ST[en ? "en" : "ar"], dir = en ? "ltr" : "rtl", s = en ? "left" : "right", e = en ? "right" : "left";
  const F = "font-family:Arial,Helvetica,sans-serif;", ink = "#14172b", grey = "#6b7286", rule = "#e7e9f0", nb = "direction:ltr;unicode-bidi:isolate;white-space:nowrap;";
  const lab = `${F}font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${grey};`;
  const mname = new Date(R.month + "-15T12:00:00Z").toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { month:"long", year:"numeric" });
  const dt = v => v ? new Date(String(v).length === 10 ? v + "T12:00:00Z" : v).toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { day:"numeric", month:"short" }) : "—";
  const quota = R.project.quota ? `${R.created} / ${R.project.quota}` : String(R.created);
  const cells = [[L.created, R.project.quota ? quota : R.created], [L.completed, R.completed.length], [L.versions, R.versions], [L.rounds, R.rounds], [L.ontime, R.on_time === null ? "—" : R.on_time + "%"], [L.open, R.open]];
  const paid = Object.keys(R.paid).map(c => fmt(R.paid[c], c)).join(" · ");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid ${rule};border-radius:10px;text-align:${s};-webkit-print-color-adjust:exact;print-color-adjust:exact">
<tr><td style="height:3px;line-height:3px;font-size:0;background:#2E62FF;background-image:linear-gradient(90deg,#3FE0E8,#2E62FF,#8B5CFF);border-radius:10px 10px 0 0">&nbsp;</td></tr>
<tr><td style="padding:26px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
 <td style="vertical-align:middle;text-align:${s}"><img src="${SITE}/assets/img/invoice-logo.png" width="184" height="20" alt="Eyeblink Studio" style="display:inline-block;width:184px;height:20px;border:0"></td>
 <td style="vertical-align:middle;text-align:${e};${F}font-size:19px;font-weight:bold;color:${ink}">${L.title}</td></tr></table></td></tr>
<tr><td style="padding:20px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
 <td style="text-align:${s}"><div style="${lab}">${L.project}</div><div style="${F}font-size:14px;font-weight:bold;color:${ink};margin-top:4px">${h(R.project.name)}</div><div style="${F}font-size:11.5px;color:${grey}">${h(cl.name || "")}</div></td>
 <td style="text-align:${e}"><div style="${lab}">${L.month}</div><div style="${F}font-size:14px;font-weight:bold;color:${ink};margin-top:4px">${mname}</div></td></tr></table></td></tr>
<tr><td style="padding:18px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate">
 <tr>${cells.slice(0, 3).map(c => `<td style="width:33%;padding:12px;background:#f6f7fa;border-radius:8px;text-align:${s}"><div style="${F}font-size:20px;font-weight:bold;color:${ink};${nb}">${c[1]}</div><div style="${F}font-size:11px;color:${grey};margin-top:2px">${c[0]}</div></td>`).join("")}</tr>
 <tr>${cells.slice(3).map(c => `<td style="width:33%;padding:12px;background:#f6f7fa;border-radius:8px;text-align:${s}"><div style="${F}font-size:20px;font-weight:bold;color:${ink};${nb}">${c[1]}</div><div style="${F}font-size:11px;color:${grey};margin-top:2px">${c[0]}</div></td>`).join("")}</tr>
</table>${R.project.quota ? `<div style="${F}font-size:11px;color:${grey};padding:4px 6px 0">${L.quota}: ${R.project.quota}${R.over_quota ? " · " + R.over_quota + " " + L.over : ""}</div>` : ""}</td></tr>
<tr><td style="padding:20px 30px 0"><div style="${lab};padding-bottom:6px;border-bottom:1px solid ${ink}">${L.list}</div>
 ${R.completed.length ? R.completed.map(t => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${rule}"><tr><td style="padding:9px 0;${F}font-size:12.5px;color:${ink};text-align:${s}"><span style="${nb};color:${grey};font-size:11px">${h(t.ref)}</span> ${h(t.title)}</td><td style="padding:9px 0;${F}font-size:11.5px;color:${t.on_time ? "#127a3a" : "#b42318"};text-align:${e};white-space:nowrap">${dt(t.completed_at)}${t.confirmed_date ? " / " + dt(t.confirmed_date) : ""}</td></tr></table>`).join("") : `<div style="${F}font-size:12px;color:${grey};padding:10px 0">${L.none}</div>`}</td></tr>
${R.invoices.length || paid ? `<tr><td style="padding:20px 30px 0"><div style="${lab};padding-bottom:6px;border-bottom:1px solid ${ink}">${L.inv}</div>
 ${R.invoices.map(x => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${rule}"><tr><td style="padding:8px 0;${F}font-size:12px;color:${ink};text-align:${s}"><span style="${nb}">${h(x.no)}</span> ${h(x.title || "")}</td><td style="padding:8px 0;${F}font-size:12px;color:${ink};text-align:${e};${nb}">${fmt(x.total, x.currency)} · ${S[x.state] || x.state}</td></tr></table>`).join("")}
 ${paid ? `<div style="${F}font-size:12px;color:${ink};padding:8px 0">${L.paid}: <b style="${nb}">${paid}</b></div>` : ""}</td></tr>` : ""}
<tr><td style="padding:18px 30px 24px;${F}font-size:10.5px;color:${grey};text-align:${s}">${L.foot}</td></tr></table>`;
}
// the monthly report inside an e-mail: a dark scoreboard in the invoice ticket's family (one frame, white logo, the numbers first);
// the printable report page keeps the white document above. Tables and inline styles only.
function reportCard(R, lang, intro, link){
  const en = lang === "en", L = REP_T[en ? "en" : "ar"], S = BILL_ST[en ? "en" : "ar"], rtl = !en, dr = rtl ? "rtl" : "ltr", s = rtl ? "right" : "left", e = rtl ? "left" : "right", D = `dir="${dr}"`;
  const F = rtl ? "font-family:'Segoe UI',Tahoma,'Geeza Pro',Arial,sans-serif;" : "font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;";
  const nb = "direction:ltr;unicode-bidi:isolate;white-space:nowrap;", line = "#1B2556";
  const mname = new Date(R.month + "-15T12:00:00Z").toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { month:"long", year:"numeric" });
  const dt = v => v ? new Date(String(v).length === 10 ? v + "T12:00:00Z" : v).toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { day:"numeric", month:"long" }) : "—";
  const pct = R.on_time === null ? null : R.on_time;
  const bar = (w, col) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:9px"><tr>${w > 0 ? `<td width="${w}%" height="4" bgcolor="${col}" style="height:4px;background:${col};border-radius:4px;font-size:0;line-height:0">&nbsp;</td>` : ""}${w < 100 ? `<td height="4" bgcolor="#24306A" style="height:4px;background:#24306A;border-radius:4px;font-size:0;line-height:0">&nbsp;</td>` : ""}</tr></table>`;
  const tile = (v, k) => `<td ${D} width="50%" bgcolor="#070C2A" style="${F}padding:12px 14px;background:#070C2A;border:1px solid ${line};border-radius:14px;text-align:${s};vertical-align:top"><div style="font-size:24px;font-weight:300;color:#EEF2F6;${nb}">${v}</div><div style="font-size:12px;color:#9FB0CC;margin-top:2px">${k}</div></td>`;
  const sec = t => `<div ${D} style="${F}margin:22px 0 2px;font-size:12px;color:#6F7FA0;text-align:${s}">${t}</div>`;
  const q = R.project.quota, used = R.created;
  return `<table role="presentation" ${D} width="100%" cellpadding="0" cellspacing="0" bgcolor="#0A1033" style="background:#0A1033;border:1px solid ${line};border-radius:22px;border-collapse:separate;overflow:hidden">
<tr><td ${D} bgcolor="#12298E" style="background-color:#12298E;background-image:radial-gradient(120% 140% at ${rtl?"0%":"100%"} 0%,#1C45E6 0%,#12298E 38%,#0A1033 82%);border-radius:21px 21px 0 0;padding:24px 24px 22px;text-align:${s}">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="text-align:${s};vertical-align:middle"><img src="${SITE}/assets/img/email-logo.png" width="132" alt="EYEBLINK STUDIO" style="display:inline-block;width:132px;height:auto;border:0"></td>
  <td style="text-align:${e};vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;font-weight:bold;letter-spacing:.3em;color:#9FDCFF;${nb}">MONTHLY REPORT</td>
 </tr></table>
 <div ${D} style="${F}margin:22px 0 2px;font-size:30px;line-height:1.2;font-weight:300;color:#FFFFFF;text-align:${s}">${h(mname)}</div>
 <div ${D} style="${F}font-size:13.5px;color:#C3CEE2;text-align:${s}">${h(L.project)} <b style="color:#fff">${h(R.project.name)}</b></div>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-top:1px solid #2B3C8F"><tr>
  <td ${D} width="50%" style="${F}padding-top:14px;vertical-align:top;text-align:${s}"><div style="font-size:46px;line-height:1;font-weight:200;color:#fff;${nb}">${R.completed.length}</div><div style="font-size:12px;color:#9FB0CC;margin-top:6px">${h(L.completed)}</div></td>
  <td ${D} width="50%" style="${F}padding-top:14px;vertical-align:top;text-align:${s}"><div style="font-size:46px;line-height:1;font-weight:200;color:#fff;${nb}">${pct === null ? "—" : pct + '<span style="font-size:22px">%</span>'}</div><div style="font-size:12px;color:#9FB0CC;margin-top:6px">${h(L.ontime)}</div>${pct === null ? "" : bar(pct, "#3DDC97")}</td>
 </tr></table>
</td></tr>
<tr><td ${D} style="padding:20px 24px 24px;text-align:${s}">
 ${intro ? `<p ${D} style="${F}margin:0 0 14px;font-size:14px;line-height:1.8;color:#C3CEE2">${intro}</p>` : ""}
 <table role="presentation" width="100%" cellpadding="0" cellspacing="8" style="border-collapse:separate;margin:0 -8px">
  <tr>${tile(R.created, h(L.created))}${tile(R.versions, h(L.versions))}</tr>
  <tr>${tile(R.rounds, h(L.rounds))}${tile(R.open, h(L.open))}</tr>
 </table>
 ${q ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px"><tr><td ${D} style="${F}font-size:12.5px;color:#AEBBD2;text-align:${s}">${h(L.quota)}${R.over_quota ? " · " + R.over_quota + " " + h(L.over) : ""}</td><td style="${F}font-size:12.5px;color:#AEBBD2;text-align:${e};${nb}">${used} / ${q}</td></tr></table>${bar(Math.min(100, Math.round(used * 100 / q)), "#2A86E6")}` : ""}
 ${sec(h(L.list))}
 ${R.completed.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${R.completed.map(t => `<tr><td ${D} style="${F}padding:11px 0;border-bottom:1px solid ${line};font-size:14px;color:#C3CEE2;text-align:${s}"><span style="color:#6F7FA0;font-size:11.5px;${nb}">${h(t.ref)}</span>&nbsp; ${h(t.title)}</td><td style="${F}padding:11px 0;border-bottom:1px solid ${line};font-size:12.5px;color:${t.on_time ? "#3DDC97" : "#F0B43C"};text-align:${e};white-space:nowrap">● ${h(dt(t.completed_at))}</td></tr>`).join("")}</table>`
   : `<div ${D} style="${F}font-size:13px;color:#6F7FA0;padding:10px 0;text-align:${s}">${h(L.none)}</div>`}
 ${R.invoices.length ? sec(h(L.inv)) + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${R.invoices.map(x => `<tr><td ${D} style="${F}padding:10px 0;border-bottom:1px solid ${line};font-size:13.5px;color:#C3CEE2;text-align:${s}"><span style="${nb}">${h(x.no)}</span>${x.title ? " · " + h(x.title) : ""}</td><td style="${F}padding:10px 0;border-bottom:1px solid ${line};font-size:13.5px;color:#EEF2F6;text-align:${e};white-space:nowrap"><span style="${nb}">${fmt(x.total, x.currency)}</span> · ${h(S[x.state] || x.state)}</td></tr>`).join("")}</table>` : ""}
 ${Object.keys(R.paid).length ? `<div ${D} style="${F}font-size:13px;color:#AEBBD2;padding:10px 0 0;text-align:${s}">${h(L.paid)}: <b style="color:#fff;${nb}">${Object.keys(R.paid).map(c => fmt(R.paid[c], c)).join(" · ")}</b></div>` : ""}
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px"><tr><td align="center" bgcolor="#2A86E6" style="border-radius:999px;background:#2A86E6;background-image:linear-gradient(180deg,#2A86E6,#1C45E6);border:1px solid #9FB6D6">
  <a href="${link}" style="display:block;padding:15px 20px;${F}font-size:15px;font-weight:700;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:999px">${en ? "Open the report in my workspace" : "افتح التقرير في مساحة العمل"}</a></td></tr></table>
 <p ${D} style="${F}margin:16px 0 0;font-size:12px;line-height:1.75;color:#6F7FA0;text-align:${s}">${h(L.foot)}</p>
</td></tr></table>`;
}
function reportPage(R, cl, lang){ return `<!doctype html><html lang="${lang === "en" ? "en" : "ar"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(R.project.name)} · ${R.month}</title>
<style>@page{size:A5;margin:9mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{margin:0;background:transparent}@media print{html,body{background:#fff}table{max-width:none!important;border:0!important}}</style></head><body>${reportHTML(R, cl, lang).replace(SITE + "/assets/img/", "/assets/img/")}</body></html>`; }
const prevMonth = () => { const x = new Date(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() - 1); return x.toISOString().slice(0, 7); };
async function sendReport(ctx, env, D, p, month){
  const R = await monthReport(D, p, month);
  await tellAdmin(ctx, env, { client_email: p.client_email, ref: "", title: p.name }, "report", { hash: "#w/p/" + p.id + "/report/" + month, report: R, name: p.name, month });
  await D.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind("rep:" + p.id + ":" + month, now()).run();
  return R;
}

// ==== billing (phase 6) ====
const money = n => Math.round((+n || 0) * 100) / 100;
const effStatus = (x, td) => ((x.status === "pending" || x.status === "partial") && x.due_date && x.due_date < td) ? "overdue" : x.status;
function parseI(x, td){ if (!x) return x; try { x.items = JSON.parse(x.items || "[]"); } catch { x.items = []; } try { x.annex = x.annex ? JSON.parse(x.annex) : []; } catch { x.annex = []; } try { x.payments = JSON.parse(x.payments || "[]"); } catch { x.payments = []; }
  x.state = effStatus(x, td || today()); x.balance = x.status === "cancelled" || x.status === "refunded" ? 0 : Math.max(0, money(x.total - x.paid)); return x; }
function cleanItems(list){ return (Array.isArray(list) ? list : []).slice(0, 60).map(i => ({ desc: clip(i && i.desc, 200), qty: Math.max(0.01, Math.min(9999, +(i && i.qty) || 1)), unit: money(i && i.unit), project: clip(i && i.project, 40), ...(i && i.group === "pkg" ? { group: "pkg" } : {}) })).filter(i => i.desc); }
// lines under their project's heading when an invoice spans more than one
function invGroups(items, en){ const g = []; for (const i of items) { const k = i.pname || (i.group === "pkg" && !i.project ? (en ? "Monthly package" : "الباقة الشهرية") : ""); let x = g.find(y => y.k === k); if (!x) g.push(x = { k, items: [] }); x.items.push(i); }
  return g.sort((a, b) => (a.k === "") - (b.k === "")); }
function invCovers(x, en){ let s = null; try { s = JSON.parse(x.scope || "null"); } catch {}
  if (s === "all") return en ? "All projects" : "كل المشاريع";
  const names = [...new Set(x.items.map(i => i.pname).filter(Boolean))]; return names.length ? names.join(en ? ", " : "، ") : (x.project_name || ""); }
const BILL_ST = { ar: { pending:"بانتظار الدفع", partial:"مدفوعة جزئياً", paid:"مدفوعة", overdue:"متأخرة", cancelled:"ملغاة", refunded:"مستردة" },
                  en: { pending:"Awaiting payment", partial:"Partially paid", paid:"Paid", overdue:"Overdue", cancelled:"Cancelled", refunded:"Refunded" } };
const BILL_T = {
  ar: { title:"فاتورة", no:"رقم الفاتورة", issued:"تاريخ الإصدار", due:"تاريخ الاستحقاق", period:"الفترة", from:"من", to:"إلى", desc:"البيان", qty:"الكمية", unit:"سعر الوحدة", amount:"المبلغ",
        sub:"المجموع", disc:"خصم", total:"الإجمالي", paid:"المدفوع", bal:"المتبقي", refunded:"المسترد", status:"الحالة", method:"طريقة الدفع", paidOn:"تاريخ آخر دفعة", project:"المشروع", svc:"مونتاج · موشن غرافيك · أفلام",
        note:{ open:"يُرجى السداد قبل تاريخ الاستحقاق، وتجد تفاصيل الدفع لدى الاستوديو.", paid:"شكراً لتعاملك مع Eyeblink Studio.", cancelled:"أُلغيت هذه الفاتورة، ولا يترتب عليها أي مبلغ.", refunded:"أُعيد المبلغ الموضّح أعلاه." } },
  en: { title:"Invoice", no:"Invoice no.", issued:"Issue date", due:"Due date", period:"Period", from:"From", to:"Bill to", desc:"Description", qty:"Qty", unit:"Unit price", amount:"Amount",
        sub:"Subtotal", disc:"Discount", total:"Total", paid:"Paid", bal:"Balance due", refunded:"Refunded", status:"Status", method:"Payment method", paidOn:"Last payment", project:"Project", svc:"Video editing · Motion graphics · Film",
        note:{ open:"Please pay before the due date; the studio will share the payment details.", paid:"Thank you for working with Eyeblink Studio.", cancelled:"This invoice was cancelled and nothing is due.", refunded:"The amount shown above was refunded." } } };
const BILL_COL = { pending:"#9a6700", partial:"#9a6700", paid:"#127a3a", overdue:"#b42318", cancelled:"#6b7286", refunded:"#3949ab" };
function billHTML(x, cl, lang, opt){
  opt = opt || {}; const en = lang === "en", L = BILL_T[en ? "en" : "ar"], S = BILL_ST[en ? "en" : "ar"], dir = en ? "ltr" : "rtl", s = en ? "left" : "right", e = en ? "right" : "left", c = x.currency || "$";
  const F = "font-family:Arial,Helvetica,sans-serif;", ink = "#14172b", grey = "#6b7286", rule = "#e7e9f0";
  const lab = `${F}font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${grey};`, val = `${F}font-size:12.5px;color:${ink};`, nb = `direction:ltr;unicode-bidi:isolate;white-space:nowrap;`;
  const th = `padding:0 0 8px;border-bottom:1px solid ${ink};${lab}`, td = `padding:11px 0;border-bottom:1px solid ${rule};${val}vertical-align:top;`;
  const dt = v => v ? new Date(v.length === 10 ? v + "T12:00:00Z" : v).toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { year:"numeric", month:"long", day:"numeric" }) : "—";
  const tot = (k, v, strong, col) => `<tr><td style="padding:5px 0;${F}font-size:${strong?13:12}px;color:${strong?ink:grey};font-weight:${strong?"bold":"normal"};text-align:${s}">${k}</td><td style="padding:5px 0;${F}font-size:${strong?13:12}px;color:${col||ink};font-weight:${strong?"bold":"normal"};text-align:${e};${nb}">${v}</td></tr>`;
  const sub = x.items.reduce((a, i) => a + i.unit * i.qty, 0), last = x.payments.length ? x.payments[x.payments.length - 1] : null, st = x.state || x.status;
  const meta = [[L.no, `<span style="${nb}">${h(x.no)}</span>`], [L.issued, dt(x.issue_date)], [L.due, dt(x.due_date)]].concat(x.period ? [[L.period, h(x.period)]] : []);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid ${rule};border-radius:10px;text-align:${s};-webkit-print-color-adjust:exact;print-color-adjust:exact">
<tr><td style="height:3px;line-height:3px;font-size:0;background:#2E62FF;background-image:linear-gradient(90deg,#3FE0E8,#2E62FF,#8B5CFF);border-radius:10px 10px 0 0">&nbsp;</td></tr>
<tr><td style="padding:26px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
 <td style="vertical-align:middle;text-align:${s}"><img src="${SITE}/assets/img/invoice-logo.png" width="184" height="20" alt="Eyeblink Studio" style="display:inline-block;width:184px;height:20px;border:0"></td>
 <td style="vertical-align:middle;text-align:${e};${F}font-size:20px;font-weight:bold;color:${ink}">${L.title}</td></tr></table></td></tr>
<tr><td style="padding:22px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
 ${meta.map(m => `<td style="vertical-align:top;text-align:${s};padding-${e}:8px"><div style="${lab}">${m[0]}</div><div style="${val}margin-top:4px">${m[1]}</div></td>`).join("")}</tr></table></td></tr>
<tr><td style="padding:22px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
 <td style="vertical-align:top;width:50%;text-align:${s};padding-${e}:12px"><div style="${lab}">${L.from}</div><div style="${val}margin-top:5px;font-weight:bold">Eyeblink Studio</div><div style="${F}font-size:11.5px;line-height:1.65;color:${grey}">${L.svc}<br><span style="${nb}">eyeblinkstudio.com</span>${opt.email ? `<br><span style="${nb}">${h(opt.email)}</span>` : ""}</div></td>
 <td style="vertical-align:top;width:50%;text-align:${s}"><div style="${lab}">${L.to}</div><div style="${val}margin-top:5px;font-weight:bold">${h(cl.name || "")}</div><div style="${F}font-size:11.5px;line-height:1.65;color:${grey};${nb}">${h(cl.email || x.client_email)}</div>${opt.project ? `<div style="${F}font-size:11.5px;color:${grey}">${L.project}: ${h(opt.project)}</div>` : ""}</td>
</tr></table></td></tr>
${x.title ? `<tr><td style="padding:20px 30px 0;${F}font-size:14px;font-weight:bold;color:${ink};text-align:${s}">${h(x.title)}</td></tr>` : ""}
<tr><td style="padding:${x.title ? 12 : 26}px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
 <tr><td style="${th}text-align:${s}">${L.desc}</td><td style="${th}text-align:center;width:52px">${L.qty}</td><td style="${th}text-align:${e};width:92px">${L.unit}</td><td style="${th}text-align:${e};width:92px">${L.amount}</td></tr>
 ${invGroups(x.items, lang === "en").flatMap((g, _, all) => (all.length > 1 ? [{ head: g.k || (lang === "en" ? "Other items" : "بنود أخرى") }] : []).concat(g.items)).map(i => i.head ? `<tr><td colspan="4" style="padding:14px 0 4px;${F}font-size:11.5px;font-weight:bold;letter-spacing:.04em;color:#1C45E6;text-align:${s}">${h(i.head)}</td></tr>` : `<tr><td style="${td}text-align:${s}">${h(i.desc)}</td><td style="${td}text-align:center;${nb}">${i.qty}</td><td style="${td}text-align:${e};color:${grey};${nb}">${fmt(i.unit, c)}</td><td style="${td}text-align:${e};${nb}">${fmt(i.unit * i.qty, c)}</td></tr>`).join("")}
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px;margin-${s}:auto;width:260px;max-width:100%">
 ${x.discount ? tot(L.sub, fmt(sub, c)) + tot(L.disc, "−" + fmt(x.discount, c)) : ""}
 ${tot(L.total, fmt(x.total, c), 1)}
 <tr><td colspan="2" style="padding:6px 0 0;border-top:1px solid ${ink}"></td></tr>
 ${x.paid ? tot(L.paid, fmt(x.paid, c)) : ""}${x.refunded ? tot(L.refunded, "−" + fmt(x.refunded, c)) : ""}
 ${st !== "cancelled" && st !== "refunded" ? tot(L.bal, fmt(x.balance, c), 1, x.balance > 0 ? BILL_COL[st] : "#127a3a") : ""}
</table></td></tr>
<tr><td style="padding:22px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fa;border-radius:8px"><tr>
 <td style="padding:12px 14px;text-align:${s}"><div style="${lab}">${L.status}</div><div style="${F}font-size:12px;margin-top:4px;color:${BILL_COL[st] || ink};font-weight:bold">● ${S[st] || st}</div></td>
 ${last && last.method ? `<td style="padding:12px 14px;text-align:${s}"><div style="${lab}">${L.method}</div><div style="${val}margin-top:4px">${h(last.method)}</div></td>` : ""}
 ${last ? `<td style="padding:12px 14px;text-align:${s}"><div style="${lab}">${L.paidOn}</div><div style="${val}margin-top:4px">${dt(last.date || last.at)}</div></td>` : ""}
</tr></table></td></tr>
${x.note ? `<tr><td style="padding:16px 30px 0;${F}font-size:12px;line-height:1.7;color:${ink};text-align:${s}">${h(x.note).replace(/\n/g, "<br>")}</td></tr>` : ""}
${(x.annex || []).length ? (() => { const R = annexRows(x.annex, en), ah = `padding:0 0 6px;border-bottom:1px solid ${ink};${F}font-size:10.5px;font-weight:bold;color:${grey};`, ad = `padding:7px 0;border-bottom:1px solid ${rule};${F}font-size:12px;`;
  return `<tr><td style="padding:20px 30px 0"><div style="${F}font-size:11.5px;font-weight:bold;letter-spacing:.04em;color:#1C45E6;margin-bottom:8px;text-align:${s}">${en ? "Work covered by this invoice" : "الأعمال المشمولة بهذه الفاتورة"}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="${ah}text-align:${s}">${en ? "Work" : "العمل"}</td><td style="${ah}text-align:${s}">${en ? "Project" : "البرنامج"}</td><td style="${ah}text-align:${e};width:92px">${en ? "Delivered" : "التسليم"}</td></tr>
${R.map(r => `<tr><td style="${ad}color:${ink};text-align:${s}">${h(r.t)}</td><td style="${ad}color:${grey};text-align:${s}">${h(r.k)}</td><td style="${ad}color:${grey};text-align:${e};${nb}">${h(r.date)}</td></tr>`).join("")}
<tr><td colspan="3" style="padding:8px 0 0;${F}font-size:11px;color:${grey};text-align:${s}">${annexCount(R.length, en)}</td></tr></table></td></tr>`; })() : ""}
<tr><td style="padding:16px 30px 24px;${F}font-size:11px;line-height:1.7;color:${grey};text-align:${s}">${L.note[st === "paid" ? "paid" : st === "cancelled" ? "cancelled" : st === "refunded" ? "refunded" : "open"]}</td></tr>
</table>`;
}
// the invoice inside an e-mail: the cinema ticket (shared ticketHTML); the printable page (billPage) keeps the white document above
const BILL_TCOL = { pending:"#F0B43C", partial:"#F0B43C", paid:"#3DDC97", overdue:"#FF6B6B", cancelled:"#9AA6BF", refunded:"#8FA2FF" };
// «the work covered by this invoice» as rows: the work, its project, and when it was delivered
function annexRows(annex, en){ const dd = v => v ? new Date(v + "T12:00:00Z").toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { day: "numeric", month: "long" }) : "—";
  return [].concat(...(annex || []).map(g => g.items.map(i => typeof i === "string" ? { t: i, k: g.k || "", date: "—" } : { t: i.t, k: g.k || "", date: dd(i.d) }))); }
const annexCount = (n, en) => en ? n + (n === 1 ? " work" : " works") : n === 1 ? "عمل واحد" : n === 2 ? "عملان" : n <= 10 ? n + " أعمال" : n + " عملاً";
function annexTicket(annex, en){ const R = annexRows(annex, en); if (!R.length) return ""; const s = en ? "left" : "right", e = en ? "right" : "left", D = `dir="${en ? "ltr" : "rtl"}"`;
  const F = en ? "font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;" : "font-family:'Segoe UI',Tahoma,'Geeza Pro',Arial,sans-serif;", ah = `${F}padding:0 0 6px;border-bottom:1px solid #24306A;font-size:11px;color:#9FB0CC;`, ad = `${F}padding:8px 0;border-bottom:1px solid #1B2556;font-size:13px;`, more = R.length - 8;
  return `<div ${D} style="${F}margin-top:20px;font-size:11.5px;font-weight:700;letter-spacing:.04em;color:#3FE0E8;text-align:${s}">${en ? "Work covered by this invoice" : "الأعمال المشمولة بهذه الفاتورة"}</div>
<table role="presentation" ${D} width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px"><tr><td style="${ah}text-align:${s}">${en ? "Work" : "العمل"}</td><td style="${ah}text-align:${s}">${en ? "Project" : "البرنامج"}</td><td style="${ah}text-align:${e}">${en ? "Delivered" : "التسليم"}</td></tr>
${R.slice(0, 8).map(r => `<tr><td style="${ad}color:#EEF2F6;text-align:${s}">${h(r.t)}</td><td style="${ad}color:#9FB0CC;text-align:${s}">${h(r.k)}</td><td style="${ad}color:#9FB0CC;text-align:${e};white-space:nowrap">${h(r.date)}</td></tr>`).join("")}
<tr><td colspan="3" style="${F}padding:8px 0 0;font-size:12px;color:#9FB0CC;text-align:${s}">${more > 0 ? (en ? `and ${more} more · the full list is on the invoice` : `و${annexCount(more, false)} أخرى · القائمة كاملة في الفاتورة`) : annexCount(R.length, en)}</td></tr></table>`; }
function billTicket(x, lang, intro, link){
  const en = lang === "en", L = BILL_T[en ? "en" : "ar"], S = BILL_ST[en ? "en" : "ar"], c = x.currency || "$", st = x.state || x.status;
  const dt = v => v ? new Date(v.length === 10 ? v + "T12:00:00Z" : v).toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { year:"numeric", month:"long", day:"numeric" }) : "—";
  const open = st === "pending" || st === "partial" || st === "overdue", B = s => '<b style="color:#fff">' + h(s) + "</b>";
  const cap = open ? (st === "overdue" ? (en ? "Due since " : "مستحقة منذ ") + B(dt(x.due_date)) : (en ? "Amount due · by " : "المبلغ المستحق · حتى ") + B(dt(x.due_date)))
            : st === "paid" ? (en ? "Paid in full · thank you" : "مدفوعة بالكامل · شكراً لك") : h(S[st] || st);
  const G = invGroups(x.items, en), multi = G.length > 1;
  const items = [].concat(...G.map(g => (multi ? [{ head: g.k || (en ? "Other items" : "بنود أخرى") }] : []).concat(g.items.map(i => ({ name: i.desc, qty: i.qty, amount: fmt(i.unit * i.qty, c) })))))
    .concat(x.discount ? [{ name: L.disc, qty: 1, amount: "−" + fmt(x.discount, c) }] : []);
  const covers = invCovers(x, en);
  const totals = [[L.total, fmt(x.total, c)]].concat(x.paid ? [[L.paid, fmt(x.paid, c)]] : []).concat(x.refunded ? [[L.refunded, "−" + fmt(x.refunded, c)]] : [])
    .concat(st !== "cancelled" && st !== "refunded" ? [[L.bal, fmt(x.balance, c), 1, x.balance > 0 ? BILL_TCOL[st] : "#3DDC97"]] : []);
  return ticketHTML({ lang: en ? "en" : "ar", label: "INVOICE", amount: fmt(open ? x.balance : x.total, c), caption: cap + (covers ? '<br><span style="color:#9FB0CC">' + (multi || covers !== x.project_name ? (en ? "Covers: " : "تشمل: ") : h(L.project) + ": ") + h(covers) + "</span>" : ""),
    meta: [[L.no, x.no, 1], [L.issued, dt(x.issue_date)]], intro, lines: items, totals, after: annexTicket(x.annex, en), status: [S[st] || st, BILL_TCOL[st] || "#EEF2F6"],
    cta: [en ? "View the invoice" : "عرض الفاتورة", link], pdf: [en ? "Download PDF" : "تحميل PDF", SITE + "/api/work?invoiceDoc=" + encodeURIComponent(x.id)],
    note: (x.note ? h(x.note).replace(/\n/g, "<br>") + "<br>" : "") + h(L.note[st === "paid" ? "paid" : st === "cancelled" ? "cancelled" : st === "refunded" ? "refunded" : "open"]) });
}
function billPage(x, cl, lang, opt){
  return `<!doctype html><html lang="${lang === "en" ? "en" : "ar"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(x.no)} · Eyeblink Studio</title>
<style>@page{size:A5;margin:9mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{margin:0;background:transparent}body{padding:0}
@media print{html,body{background:#fff}table{max-width:none!important;border:0!important}}</style></head><body>${billHTML(x, cl, lang, opt).replace(SITE + "/assets/img/", "/assets/img/")}</body></html>`;
}
const htmlRes = (t, st) => new Response(t, { status: st || 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "SAMEORIGIN" } });
async function invoiceOf(D, id){ return parseI(await D.prepare("SELECT i.*, p.name AS project_name FROM invoices i LEFT JOIN projects p ON p.id=i.project_id WHERE i.id=?").bind(clip(id, 40)).first()); }
function invoiceMail(env, x, kind, ctx){ const a = invoiceArgs(x, kind); return tellAdmin(ctx, env, a.t, kind, a.extra); }
function invoiceArgs(x, kind){ return { t: { client_email: x.client_email, ref: "", title: x.title || x.no }, extra: { hash: "#w/invoices/" + x.id, inv: x, no: x.no, amount: fmt(x.total, x.currency), balance: fmt(x.balance, x.currency), paidNow: kind === "invoicePaid" && x.payments.length ? fmt(x.payments[x.payments.length - 1].amount, x.currency) : undefined, due: x.due_date } }; }

// ==== client notifications (phase 5): one event → in-app + e-mail + WhatsApp, by the client's preferences ====
const CAT = { accept:"tasks", reject:"tasks", progress:"tasks", status:"tasks", date:"tasks", dateNo:"tasks", completed:"tasks", info:"requests", deliver:"deliveries", comment:"comments", project:"projects", file:"projects",
  invoice:"billing", invoicePaid:"billing", invoiceDue:"billing", recurring:"tasks", report:"projects", added:"tasks",
  invoiceSoon:"billing", invoiceFollow:"billing", reviewWaiting:"deliveries", infoWaiting:"requests", periodReport:"projects", extras:"requests" };
const CATS = ["tasks","requests","deliveries","comments","projects","billing"];
// the picture that goes with a WhatsApp message (drawn by the panel): an amount for invoices, otherwise the message's title, with two facts under it
function waCard(kind, t, extra, subject, line, en){
  const cat = CAT[kind] || "tasks", x = extra.inv, dd = v => v ? new Date(String(v).slice(0, 10) + "T12:00:00Z").toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { day: "numeric", month: "long" }) : "";
  const label = { billing: "INVOICE", deliveries: "DELIVERY", tasks: kind === "added" ? "NEW TASK" : "TASK", requests: "REQUEST", comments: "MESSAGE", projects: /report/i.test(kind) ? "REPORT" : "PROJECT" }[cat] || "UPDATE";
  if (x) { const st = x.state || x.status, paid = st === "paid", last = x.payments.length ? x.payments[x.payments.length - 1] : null;
    return { label, big: fmt(paid ? x.total : x.balance, x.currency), sub: (en ? "Invoice " : "فاتورة ") + x.no + (x.title ? " · " + x.title : ""),
      pill: paid ? [en ? "Paid in full · thank you" : "مدفوعة بالكامل · شكراً لك", "ok"] : [en ? "Amount due" : "المبلغ المستحق", "wait"],
      meta: paid && last ? [[en ? "Paid on" : "تاريخ الدفع", dd(last.date)], [en ? "Method" : "الطريقة", last.method || "—"]] : [[en ? "Issued" : "تاريخ الإصدار", dd(x.issue_date)], [en ? "Due by" : "الاستحقاق", dd(x.due_date) || "—"]] }; }
  if (!subject) return null;
  const meta = []; if (t.confirmed_date) meta.push([en ? "Delivery" : "موعد التسليم", dd(t.confirmed_date)]); if (t.ref) meta.push([en ? "Task" : "المهمة", t.ref]);
  const end = s => s.replace(/\s*\.$/, "");   // a design carries no full stop at the end of a line
  return { label, title: end(subject.replace(/ · T-[A-Z0-9]+$/, "")), sub: end(String(line || "").replace(/\s+/g, " ").trim().slice(0, 150)),
    pill: kind === "deliver" ? [en ? "Awaiting your review" : "بانتظار ملاحظاتك", "wait"] : kind === "completed" ? [en ? "Completed" : "اكتملت", "ok"] : null, meta: meta.slice(0, 2) }; }
const ESSENTIAL = ["deliveries","billing"];   // e-mail for these cannot be switched off
const WA_DEFAULT = { tasks:true, requests:true, deliveries:true, comments:false, projects:false, billing:true };
const CONSENT_V = "wa-v1";
const BACKOFF = [5, 30, 120];   // minutes between retries
const nextTry = n => n > BACKOFF.length ? null : new Date(Date.now() + BACKOFF[n - 1] * 60000).toISOString();
const oneLine = (t, n) => String(t || "").replace(/[\r\n\t]+/g, " · ").replace(/ {2,}/g, " ").trim().slice(0, n);
const normPhone = p => { const x = String(p || "").replace(/[\s\-().]/g, "").replace(/^00/, "+"); return /^\+?[1-9]\d{7,14}$/.test(x) ? x.replace(/^\+/, "") : null; };
async function prefsOf(D, email){
  const r = await D.prepare("SELECT * FROM notify_prefs WHERE email=?").bind(email).first(); let ec = {}, wc = {}, pc = {}, tc = {};
  try { ec = JSON.parse((r && r.email_cats) || "{}"); } catch {} try { wc = JSON.parse((r && r.wa_cats) || "{}"); } catch {}
  try { pc = JSON.parse((r && r.push_cats) || "{}"); } catch {} try { tc = JSON.parse((r && r.tg_cats) || "{}"); } catch {}
  return { essential: ESSENTIAL, email_cats: Object.fromEntries(CATS.map(c => [c, ESSENTIAL.includes(c) || ec[c] !== false])), push_cats: Object.fromEntries(CATS.map(c => [c, pc[c] !== false])), tg_cats: Object.fromEntries(CATS.map(c => [c, tc[c] !== false])), wa_cats: Object.fromEntries(CATS.map(c => [c, c in wc ? !!wc[c] : WA_DEFAULT[c]])),
    wa_phone: (r && r.wa_phone) || "", wa_consent_at: (r && r.wa_consent_at) || null, wa_withdrawn_at: (r && r.wa_withdrawn_at) || null,
    consent: !!(r && r.wa_phone && r.wa_consent_at && !r.wa_withdrawn_at) };
}
async function waConfig(env){ let c = {}; try { c = JSON.parse(await env.EB.get("wa:config") || "{}"); } catch {}
  return { enabled: !!c.enabled, template: c.template || "eyeblink_update", langAr: c.langAr || "ar", langEn: c.langEn || "en", button: c.button !== false, version: /^v\d{2}\.0$/.test(c.version || "") ? c.version : "v25.0" }; }
const waReady = (env, cfg) => !!(cfg.enabled && env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID);
// ==== notifications outside the site (phase 10) ====
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ub64 = s => { s = String(s || "").replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const b = atob(s), o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; };
const cat8 = (...a) => { const n = a.reduce((x, y) => x + y.length, 0), o = new Uint8Array(n); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const utf8 = t => new TextEncoder().encode(t);
// the site's own VAPID key pair: made once, kept in D1 (no setup needed)
async function vapid(D){
  const row = await D.prepare("SELECT v FROM meta WHERE k='vapid'").first();
  if (row) { const v = JSON.parse(row.v); return { pub: v.pub, key: await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]) }; }
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey)), jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  await D.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('vapid', ?)").bind(JSON.stringify({ pub, jwk })).run();
  return vapid(D);
}
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com|push\.microsoft\.com)$/i;
function okEndpoint(e){ try { const u = new URL(e); return u.protocol === "https:" && PUSH_HOSTS.test(u.hostname); } catch { return false; } }
async function hkdf(salt, ikm, info, len){ const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8)); }
async function pushSend(D, sub, payload){
  const V = await vapid(D), ua = ub64(sub.p256dh), auth = ub64(sub.auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat8(utf8("WebPush: info\0"), ua, asPub), 32), salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16), nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat8(utf8(JSON.stringify(payload)), new Uint8Array([2]))));
  const head = new Uint8Array(21); head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096); head[20] = 65;
  const ep = new URL(sub.endpoint), jh = b64u(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" }))), jc = b64u(utf8(JSON.stringify({ aud: ep.origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:info@eyeblinkstudio.com" })));
  const sig = b64u(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, V.key, utf8(jh + "." + jc)));
  const r = await fetch(sub.endpoint, { method: "POST", headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal",
    Authorization: `vapid t=${jh}.${jc}.${sig}, k=${V.pub}` }, body: cat8(head, asPub, ct) }).catch(e => ({ ok: false, status: 0, _e: String(e) }));
  if (r.status === 404 || r.status === 410) { await D.prepare("DELETE FROM push_subs WHERE id=?").bind(sub.id).run(); return { ok: false, gone: true, error: "expired" }; }
  if (r.ok) { await D.prepare("UPDATE push_subs SET last_ok_at=? WHERE id=?").bind(now(), sub.id).run(); return { ok: true }; }
  return { ok: false, error: "push " + r.status, retry: r.status === 0 || r.status === 429 || r.status >= 500 };
}
const tgTok = env => String(env.TELEGRAM_TOKEN || "").trim().replace(/^bot/i, "");
async function tgApi(env, method, body){ const t = tgTok(env); if (!t) return { ok: false, description: "no token" };
  const r = await fetch(`https://api.telegram.org/bot${t}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }).catch(() => null);
  return r ? r.json().catch(() => ({ ok: false })) : { ok: false, description: "network" }; }
async function tgConf(env){ try { return JSON.parse(await env.EB.get("tg:clients") || "null"); } catch { return null; } }
async function tgSend(env, chat, text, url, label){
  const r = await tgApi(env, "sendMessage", { chat_id: chat, text, disable_web_page_preview: true, ...(url ? { reply_markup: { inline_keyboard: [[{ text: label, url }]] } } : {}) });
  return r && r.ok ? { ok: true, id: r.result && String(r.result.message_id) } : { ok: false, error: (r && r.description) || "telegram", retry: !r || r.error_code === 429 || r.error_code >= 500 };
}
// what goes to the phone: the same one-line text as the WhatsApp template
function shortText(lang, kind, data, L, max){ const f = WA_TXT[lang][kind]; if (!f) return "";
  return oneLine(f({ ...data, dateText: data.date ? fmtDate(data.date, lang) : "—", dueText: data.due ? fmtDate(data.due, lang) : "", statusText: L[data.status] || data.status || "" }), max || 400); }
async function logSend(D, r){ if (!D) return; try {
  await D.prepare("INSERT INTO notify_log (at, channel, recipient, target, kind, status, attempts, error, next_try_at, provider_id, payload) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind(now(), r.channel, r.recipient, r.target || null, r.kind, r.status, r.attempts || 1, r.error || null, r.next || null, r.provider_id || null, r.payload ? JSON.stringify(r.payload) : null).run(); } catch {} }
// Resend, with a result we can log (sendMail above only says yes/no)
async function mailSend(env, to, subject, html){
  if (!env.RESEND_API_KEY) return { ok: false, skip: "e-mail not configured" };
  try { const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM || "Eyeblink Studio <info@eyeblinkstudio.com>", to: [to], subject, html }) });
    const j = await r.json().catch(() => ({})); if (r.ok) return { ok: true, id: j.id };
    return { ok: false, error: "HTTP " + r.status + (j.message ? ": " + String(j.message).slice(0, 160) : ""), retry: r.status === 429 || r.status >= 500 };
  } catch { return { ok: false, error: "network", retry: true }; }
}
// WhatsApp Cloud API (Meta, official): one approved utility template — body {{1}} name, {{2}} the update; URL button eyeblinkstudio.com/go/{{1}}
async function waSend(env, cfg, to, lang, p){
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) return { ok: false, skip: "WhatsApp not configured" };
  const comps = [{ type: "body", parameters: [{ type: "text", text: p.name || "-" }, { type: "text", text: p.text || "-" }] }];
  if (cfg.button) comps.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: p.path || "w" }] });
  try { const r = await fetch("https://graph.facebook.com/" + cfg.version + "/" + env.WHATSAPP_PHONE_ID + "/messages", { method: "POST",
      headers: { authorization: "Bearer " + env.WHATSAPP_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "template", template: { name: cfg.template, language: { code: lang === "en" ? cfg.langEn : cfg.langAr }, components: comps } }) });
    const j = await r.json().catch(() => ({})); if (r.ok && j.messages && j.messages[0]) return { ok: true, id: j.messages[0].id };
    const e = j.error || {}; return { ok: false, error: (e.code ? e.code + ": " : "HTTP " + r.status + ": ") + String(e.message || "").slice(0, 200), retry: r.status === 429 || r.status >= 500 || [130429, 131056, 131000, 2].includes(e.code) };
  } catch { return { ok: false, error: "network", retry: true }; }
}
// Arabic counts: «مهمة»، «مهمتين»، «3 مهام»، «11 مهمة» (and «مهمة جديدة»، «مهمتان جديدتان»… with fresh)
const arTasks = (n, fresh) => !(n > 1) ? (fresh ? "مهمة جديدة" : "مهمة") : n === 2 ? (fresh ? "مهمتان جديدتان" : "مهمتين") : n <= 10 ? n + (fresh ? " مهام جديدة" : " مهام") : n + (fresh ? " مهمة جديدة" : " مهمة");
const WA_TXT = {
  ar: { accept: d => `قُبلت مهمة «${d.title}»${d.w || ""} (${d.ref})، وموعد التسليم المؤكد ${d.dateText}.`, info: d => `نحتاج إلى بعض المعلومات منك لبدء مهمة «${d.title}»${d.w || ""} (${d.ref}).`,
        reject: d => `بخصوص مهمة «${d.title}»${d.w || ""} (${d.ref}): تعذّر تنفيذها كما طُلبت، والسبب موضّح في مساحة العمل.`, progress: d => `بدأنا تنفيذ «${d.title}»${d.w || ""} (${d.ref}).`,
        status: d => `أصبحت حالة «${d.title}»${d.w || ""} (${d.ref}): ${d.statusText}.`, date: d => `أصبح موعد تسليم «${d.title}»${d.w || ""} (${d.ref}) ${d.dateText}.`, dateNo: d => `بقي موعد تسليم «${d.title}»${d.w || ""} (${d.ref}) ${d.dateText}.`,
        completed: d => `اكتملت مهمة «${d.title}»${d.w || ""} (${d.ref}). شكراً لك!`, deliver: d => d.final ? `التسليم النهائي لـ«${d.title}»${d.w || ""} (${d.ref}) جاهز للمراجعة.` : `النسخة ${d.label} من «${d.title}»${d.w || ""} (${d.ref}) جاهزة للمراجعة.`,
        comment: d => `تعليق جديد من الاستوديو على «${d.title}»${d.w || ""}${d.ref ? " (" + d.ref + ")" : ""}.`, project: d => `فتحنا لك مشروع «${d.name}» في مساحة العمل.`, file: d => `أضفنا ملف «${d.file}» إلى مشروع «${d.name}».`,
        invoice: d => `صدرت لك فاتورة جديدة ${d.no} بقيمة ${d.amount}${d.dueText ? "، وتاريخ استحقاقها " + d.dueText : ""}.`, invoicePaid: d => `وصلت دفعتك ${d.paidNow || ""} للفاتورة ${d.no}. شكراً لك!`,
        invoiceDue: d => `نودّ أن نذكّرك بلطف بالفاتورة ${d.no}، والمبلغ المتبقي ${d.balance}. إن كنت قد أتممت الدفع فلك جزيل الشكر.`,
        invoiceSoon: d => `تذكير ودّي: يحلّ موعد استحقاق الفاتورة ${d.no} في ${d.dueText}، والمبلغ ${d.balance}. إن كنت قد أتممت الدفع فلك جزيل الشكر.`,
        invoiceFollow: d => `نتابع معك بخصوص الفاتورة ${d.no}، والمبلغ المتبقي ${d.balance}. إن كان بوسعنا تسهيل الأمر فيسعدنا أن نسمع منك.`,
        reviewWaiting: d => `النسخة ${d.label} من «${d.title}»${d.w || ""} (${d.ref}) بانتظار رأيك متى سنح وقتك.`, periodReport: d => `تقريرك جاهز: ما أنجزناه ${d.name}.`, extras: d => `على «${d.title}»${d.w || ""} (${d.ref}) إضافة صغيرة بانتظار موافقتك: ${d.note}.`, infoWaiting: d => `ما زلنا بانتظار بعض التفاصيل لبدء «${d.title}»${d.w || ""} (${d.ref}).`,
        recurring: d => `أُضيفت مهمة «${d.title}»${d.w || ""} (${d.ref}) ضمن الجدول الدوري، وموعد تسليمها المؤكد ${d.dateText}.`, added: d => `أضاف الاستوديو ${arTasks(d.count)} «${d.title}» إلى ${d.to || "مشروعك"}${d.date ? "، وموعد التسليم المبدئي " + d.dateText : ""}.`, report: d => `التقرير الشهري لمشروع «${d.name}» جاهز.` },
  en: { accept: d => `Your task "${d.title}"${d.w || ""} (${d.ref}) is accepted. Confirmed delivery: ${d.dateText}.`, info: d => `We need a little more information to start "${d.title}"${d.w || ""} (${d.ref}).`,
        reject: d => `About "${d.title}"${d.w || ""} (${d.ref}): we can't take it as requested — the reason is in your workspace.`, progress: d => `We started working on "${d.title}"${d.w || ""} (${d.ref}).`,
        status: d => `"${d.title}"${d.w || ""} (${d.ref}) is now: ${d.statusText}.`, date: d => `The delivery date of "${d.title}"${d.w || ""} (${d.ref}) is now ${d.dateText}.`, dateNo: d => `The delivery date of "${d.title}"${d.w || ""} (${d.ref}) stays ${d.dateText}.`,
        completed: d => `"${d.title}"${d.w || ""} (${d.ref}) is complete. Thank you!`, deliver: d => d.final ? `The final delivery of "${d.title}"${d.w || ""} (${d.ref}) is ready for review.` : `Version ${d.label} of "${d.title}"${d.w || ""} (${d.ref}) is ready for review.`,
        comment: d => `New comment from the studio on "${d.title}"${d.w || ""}${d.ref ? " (" + d.ref + ")" : ""}.`, project: d => `We opened the project "${d.name}" in your workspace.`, file: d => `We added "${d.file}" to the files of "${d.name}".`,
        invoice: d => `A new invoice ${d.no} for ${d.amount} is ready${d.dueText ? ", due " + d.dueText : ""}.`, invoicePaid: d => `We received your payment ${d.paidNow || ""} for invoice ${d.no}. Thank you!`,
        invoiceDue: d => `A gentle reminder about invoice ${d.no}; the remaining balance is ${d.balance}. If you have already settled it, thank you.`,
        invoiceSoon: d => `A gentle reminder: invoice ${d.no} is due on ${d.dueText}, for ${d.balance}. If you have already settled it, thank you.`,
        invoiceFollow: d => `Following up on invoice ${d.no}; ${d.balance} is still due. If we can make it easier, we would be glad to hear from you.`,
        reviewWaiting: d => `Version ${d.label} of "${d.title}"${d.w || ""} (${d.ref}) is waiting for your review whenever you have a moment.`, periodReport: d => `Your report is ready: what we did ${d.name}.`, extras: d => `A small addition on "${d.title}"${d.w || ""} (${d.ref}) awaits your approval: ${d.note}.`, infoWaiting: d => `We are still waiting for a few details to start "${d.title}"${d.w || ""} (${d.ref}).`,
        recurring: d => `"${d.title}"${d.w || ""} (${d.ref}) was added from your recurring schedule; confirmed delivery ${d.dateText}.`, added: d => `The studio added ${d.count > 1 ? d.count + " tasks" : "a task"}, "${d.title}", to ${d.to || "your project"}${d.date ? "; provisional delivery " + d.dateText : ""}.`, report: d => `The monthly report for "${d.name}" is ready.` } };
// the e-mail for one event, built once: tellClient sends it, the admin's send sheet previews it
function composeMail(u, t, kind, extra, hash){
  extra = extra || {}; const lang = u.lang === "en" ? "en" : "ar", en = lang === "en", L = ST_LABEL[lang];
  const T = {
    accept:  en ? ["Task accepted · " + t.ref, `<b style="color:#fff">${h(t.title)}</b>${t.where || ""} is accepted. Confirmed delivery date: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`]
                : ["قُبلت مهمتك · " + t.ref, `قبلنا مهمة <b style="color:#fff">${h(t.title)}</b>${t.where || ""}. موعد التسليم المؤكد: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`],
    info:    en ? ["We need a little more · " + t.ref, `To start <b style="color:#fff">${h(t.title)}</b>${t.where || ""} we need:`] : ["نحتاج إلى أمر بسيط منك · " + t.ref, `لنبدأ مهمة <b style="color:#fff">${h(t.title)}</b>${t.where || ""} نحتاج إلى ما يلي:`],
    reject:  en ? ["About your task · " + t.ref, `We can't take <b style="color:#fff">${h(t.title)}</b>${t.where || ""} as requested.`] : ["بخصوص مهمتك · " + t.ref, `تعذّر علينا تنفيذ مهمة <b style="color:#fff">${h(t.title)}</b>${t.where || ""} كما طُلبت.`],
    progress:en ? ["Work has started · " + t.ref, `We started working on <b style="color:#fff">${h(t.title)}</b>${t.where || ""}.`] : ["بدأ العمل · " + t.ref, `بدأنا تنفيذ <b style="color:#fff">${h(t.title)}</b>${t.where || ""}.`],
    date:    en ? ["New delivery date · " + t.ref, `The confirmed delivery date for <b style="color:#fff">${h(t.title)}</b>${t.where || ""} is now <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`]
                : ["موعد تسليم جديد · " + t.ref, `أصبح موعد التسليم المؤكد لمهمة <b style="color:#fff">${h(t.title)}</b>${t.where || ""} <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`],
    dateNo:  en ? ["About the date change · " + t.ref, `We kept the delivery date of <b style="color:#fff">${h(t.title)}</b>${t.where || ""} on <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`]
                : ["بخصوص تغيير الموعد · " + t.ref, `بقي موعد تسليم <b style="color:#fff">${h(t.title)}</b>${t.where || ""} كما هو: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`],
    completed: en ? ["Task completed · " + t.ref, `<b style="color:#fff">${h(t.title)}</b>${t.where || ""} is complete. Thank you!`] : ["اكتملت المهمة · " + t.ref, `اكتملت مهمة <b style="color:#fff">${h(t.title)}</b>${t.where || ""}. شكراً لك!`],
    status:  en ? ["Task update · " + t.ref, `<b style="color:#fff">${h(t.title)}</b>${t.where || ""} is now: <b style="color:#3FE0E8">${h(L[t.status] || t.status)}</b>.`] : ["تحديث على مهمتك · " + t.ref, `أصبحت حالة مهمة <b style="color:#fff">${h(t.title)}</b>${t.where || ""}: <b style="color:#3FE0E8">${h(L[t.status] || t.status)}</b>.`],
    deliver: en ? [(extra && extra.final ? "Final delivery is ready · " : "Version " + (extra && extra.label) + " is ready · ") + t.ref, `<b style="color:#fff">${h(t.title)}</b>${t.where || ""} — <b style="color:#3FE0E8">${h(extra && extra.label)}</b> is ready for you. Take a look and send us your approval or your notes.`]
                 : [(extra && extra.final ? "التسليم النهائي جاهز · " : "النسخة " + (extra && extra.label) + " جاهزة · ") + t.ref, `<b style="color:#fff">${h(t.title)}</b>${t.where || ""} — النسخة <b style="color:#3FE0E8">${h(extra && extra.label)}</b> جاهزة. اطّلع عليها وأرسل إلينا موافقتك أو ملاحظاتك.`],
    comment: en ? ["New comment from the studio" + (t.ref ? " · " + t.ref : ""), `On <b style="color:#fff">${h(t.title)}</b>${t.where || ""}:`] : ["تعليق جديد من الاستوديو" + (t.ref ? " · " + t.ref : ""), `على <b style="color:#fff">${h(t.title)}</b>${t.where || ""}:`],
    invoice: en ? ["Invoice " + extra.no + " · Eyeblink Studio", `Your invoice <b style="color:#fff">${h(extra.no)}</b> for <b style="color:#3FE0E8">${h(extra.amount)}</b> is below${extra.due ? ", due <b style=\"color:#fff\">" + h(fmtDate(extra.due, lang)) + "</b>" : ""}.`]
                 : ["فاتورة " + extra.no + " · Eyeblink Studio", `تجد أدناه فاتورتك <b style="color:#fff">${h(extra.no)}</b> بقيمة <b style="color:#3FE0E8">${h(extra.amount)}</b>${extra.due ? "، وتاريخ استحقاقها <b style=\"color:#fff\">" + h(fmtDate(extra.due, lang)) + "</b>" : ""}.`],
    invoicePaid: en ? ["Payment received · " + extra.no, `We received <b style="color:#3FE0E8">${h(extra.paidNow || "")}</b> for invoice <b style="color:#fff">${h(extra.no)}</b>. Thank you! The updated invoice is below.`]
                    : ["وصلت دفعتك · " + extra.no, `وصلتنا دفعتك <b style="color:#3FE0E8">${h(extra.paidNow || "")}</b> للفاتورة <b style="color:#fff">${h(extra.no)}</b>. شكراً لك! تجد الفاتورة المحدّثة أدناه.`],
    invoiceDue: en ? ["A gentle reminder · invoice " + extra.no, `A gentle reminder about invoice <b style="color:#fff">${h(extra.no)}</b>; the remaining balance is <b style="color:#3FE0E8">${h(extra.balance)}</b>. If you have already settled it, thank you, and please disregard this note. We are always happy to help with any question.`]
                   : ["تذكير ودّي · الفاتورة " + extra.no, `نودّ أن نذكّرك بلطف بالفاتورة <b style="color:#fff">${h(extra.no)}</b>، والمبلغ المتبقي <b style="color:#3FE0E8">${h(extra.balance)}</b>. إن كنت قد أتممت الدفع فلك جزيل الشكر، ويسعدنا دائماً الإجابة عن أي استفسار.`],
    invoiceSoon: en ? ["A gentle reminder · invoice " + extra.no + " is due soon", `A gentle reminder that invoice <b style="color:#fff">${h(extra.no)}</b> is due on <b style="color:#fff">${h(fmtDate(extra.due, lang))}</b>, for <b style="color:#3FE0E8">${h(extra.balance)}</b>. If you have already settled it, thank you.`]
                    : ["تذكير ودّي · الفاتورة " + extra.no + " تستحق قريباً", `نودّ أن نذكّرك بلطف بأن الفاتورة <b style="color:#fff">${h(extra.no)}</b> يحلّ موعد استحقاقها في <b style="color:#fff">${h(fmtDate(extra.due, lang))}</b>، والمبلغ <b style="color:#3FE0E8">${h(extra.balance)}</b>. إن كنت قد أتممت الدفع فلك جزيل الشكر.`],
    invoiceFollow: en ? ["About invoice " + extra.no, `We are following up on invoice <b style="color:#fff">${h(extra.no)}</b>; the remaining balance is <b style="color:#3FE0E8">${h(extra.balance)}</b>. If we can make it easier, with another payment method or a date that suits you better, we would be glad to hear from you.`]
                      : ["بخصوص الفاتورة " + extra.no, `نتابع معك بخصوص الفاتورة <b style="color:#fff">${h(extra.no)}</b>، والمبلغ المتبقي <b style="color:#3FE0E8">${h(extra.balance)}</b>. إن كان بوسعنا تسهيل الأمر، كطريقة دفع أخرى أو موعد يناسبك أكثر، فيسعدنا أن نسمع منك.`],
    reviewWaiting: en ? ["Version " + extra.label + " is waiting for your review · " + t.ref, `We recently sent you version <b style="color:#3FE0E8">${h(extra.label)}</b> of <b style="color:#fff">${h(t.title)}</b>${t.where || ""}. We look forward to your thoughts whenever you have a moment; your approval or notes help us finish on time.`, "Review the version",
                         t.confirmed_date ? `<p style="margin:16px 0 0;font-size:13px;color:#8E9BB8">Confirmed delivery: ${h(fmtDate(t.confirmed_date, lang))}</p>` : ""]
                      : ["النسخة " + extra.label + " بانتظار رأيك · " + t.ref, `أرسلنا إليك مؤخراً النسخة <b style="color:#3FE0E8">${h(extra.label)}</b> من <b style="color:#fff">${h(t.title)}</b>${t.where || ""}. نتطلع إلى رأيك متى سنح وقتك؛ فموافقتك أو ملاحظاتك تساعدنا على إكمال العمل في موعده.`, "راجع النسخة",
                         t.confirmed_date ? `<p style="margin:16px 0 0;font-size:13px;color:#8E9BB8">موعد التسليم المؤكد: ${h(fmtDate(t.confirmed_date, lang))}</p>` : ""],
    infoWaiting: en ? ["We are still waiting for a few details · " + t.ref, `To start <b style="color:#fff">${h(t.title)}</b>${t.where || ""} we need what we asked for:`, "Send the details", `<p style="margin:16px 0 0;font-size:13px;color:#8E9BB8">As soon as they arrive, we begin.</p>`]
                    : ["ما زلنا بانتظار بعض التفاصيل · " + t.ref, `لنبدأ تنفيذ <b style="color:#fff">${h(t.title)}</b>${t.where || ""} نحتاج إلى ما طلبناه منك:`, "أرسل التفاصيل", `<p style="margin:16px 0 0;font-size:13px;color:#8E9BB8">حالما تصلنا نبدأ مباشرة.</p>`],
    extras: en ? ["A small addition awaits your approval · " + t.ref, `Before we start <b style="color:#fff">${h(t.title)}</b>${t.where || ""}, we would like to share what goes beyond the scope we agreed on: <b style="color:#3FE0E8">${h(extra.note || "")}</b>. We would be glad to hear what you prefer.`, "Review it"]
                : ["إضافة بانتظار موافقتك · " + t.ref, `قبل أن نبدأ تنفيذ <b style="color:#fff">${h(t.title)}</b>${t.where || ""}، نودّ أن نطلعك على ما يتجاوز الإطار المتفق عليه: <b style="color:#3FE0E8">${h(extra.note || "")}</b>. يسعدنا أن نعرف ما تفضّله.`, "راجع الإضافة"],
    periodReport: en ? ["What we did · " + (extra.name || ""), "", "Open the full report"] : ["ما أنجزناه · " + (extra.name || ""), "", "افتح التقرير الكامل"],
    recurring: en ? ["Recurring task added · " + t.ref, `<b style="color:#fff">${h(t.title)}</b>${t.where || ""} was added from your recurring schedule. Confirmed delivery date: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`]
                  : ["مهمة دورية جديدة · " + t.ref, `أُضيفت مهمة <b style="color:#fff">${h(t.title)}</b>${t.where || ""} ضمن الجدول الدوري المتفق عليه. موعد التسليم المؤكد: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`],
    added:   en ? [(extra.count > 1 ? extra.count + " new tasks from the studio · " : "New task from the studio · ") + t.ref, `The studio added <b style="color:#fff">${h(t.title)}</b> to ${h(extra.to || "your project")}${t.confirmed_date ? `. Provisional delivery date: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>` : ""}.`]
                 : [arTasks(extra.count, true) + " من الاستوديو · " + t.ref, `أضاف الاستوديو ${arTasks(extra.count)} <b style="color:#fff">${h(t.title)}</b> إلى ${h(extra.to || "مشروعك")}${t.confirmed_date ? `. موعد التسليم المبدئي: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>` : ""}.`],
    report:  en ? ["Monthly report · " + (extra.name || ""), `Here is the monthly report for <b style="color:#fff">${h(extra.name || "")}</b>.`] : ["التقرير الشهري · " + (extra.name || ""), `تجد أدناه التقرير الشهري لمشروع <b style="color:#fff">${h(extra.name || "")}</b>.`],
    file:    en ? ["New file in " + (extra && extra.name), `The studio added <b style="color:#fff">${h(extra && extra.file)}</b> to the files of <b style="color:#fff">${h(extra && extra.name)}</b>.`]
                 : ["ملف جديد في مشروع " + (extra && extra.name), `أضاف الاستوديو ملف <b style="color:#fff">${h(extra && extra.file)}</b> إلى ملفات مشروع <b style="color:#fff">${h(extra && extra.name)}</b>.`],
    project: en ? ["New project in your workspace", `The studio opened <b style="color:#fff">${h(extra && extra.name)}</b> for you. You can send tasks to it from your workspace.`]
                : ["مشروع جديد في مساحة العمل", `فتح لك الاستوديو مشروع <b style="color:#fff">${h(extra && extra.name)}</b>، ويمكنك إرسال مهامك إليه من مساحة العمل.`],
  }[kind]; if (!T) return null;
    const note = extra.note ? `<p style="margin:14px 0 0;padding:12px 14px;border-radius:12px;background:#121a48;color:#DCE3F0">${h(extra.note).replace(/\n/g, "<br>")}</p>` : "";
    const wsLink = SITE + (en ? "/en" : "") + "/workspace" + hash;
    const html = extra.inv ? mail(lang, T[0], billTicket(extra.inv, lang, T[1] + note, wsLink), null, null, greet({ name: u.name, lang }), { bare: true })   // invoices: the ticket is the whole e-mail
      : extra.report ? mail(lang, T[0], reportCard(extra.report, lang, T[1] + note, wsLink), null, null, greet({ name: u.name, lang }), { bare: true })   // the monthly report: the scoreboard
      : extra.preport ? mail(lang, en ? "What we did together" : "ما أنجزناه معاً", periodCard(extra.preport, lang, extra.studioNote || extra.preport.note || ""), T[2], wsLink, greet({ name: u.name, lang }), { label: "REPORT" })   // the periodic report
      : mail(lang, T[0], `<p style="margin:0">${T[1]}</p>` + note + (T[3] || ""), T[2] || (en ? "Open in my workspace" : "افتح في مساحة العمل"), wsLink, greet({ name: u.name, lang }));
    return { subject: T[0], html };
}
function tellData(t, extra){ return { title: t.title || "", ref: t.ref || "", date: t.confirmed_date || null, status: t.status || null, label: extra.label, final: extra.final || undefined, name: extra.name, project: extra.project, to: extra.to, w: extra.w || "", count: extra.count || undefined, file: extra.file, note: extra.note ? excerpt(extra.note, 160) : undefined,
    no: extra.no, amount: extra.amount, balance: extra.balance, paidNow: extra.paidNow, due: extra.due || undefined, month: extra.month }; }
// the admin's choice from the send sheet: { ch:{ email, push, wa }, at } — at = a later time (kept in scheduled_sends until then)
function cleanNotify(v){ if (!v || typeof v !== "object") return null;
  const ch = { email: !!(v.ch && v.ch.email), push: !!(v.ch && v.ch.push), wa: !!(v.ch && v.ch.wa) };
  const t = v.at ? new Date(v.at) : null, at = t && !isNaN(t) && t > Date.now() + 60000 && t < Date.now() + 90 * 864e5 ? t.toISOString() : null;
  return { ch, at, note: clip(v.note, 600) }; }
async function tellAdmin(ctx, env, t, kind, extra){
  const n = ctx && ctx.notify; extra = n ? { ...(extra || {}), ch: n.ch, ...(n.note ? { studioNote: n.note } : {}) } : extra;
  if (n && n.at) { const D = await db(env); if (D) { await D.prepare("INSERT INTO scheduled_sends (at, recipient, kind, t, extra, created_at) VALUES (?,?,?,?,?,?)")
    .bind(n.at, String(t.client_email || "").toLowerCase(), kind, JSON.stringify(t), JSON.stringify(extra), now()).run(); return; } }
  return tellClient(env, t, kind, extra);
}
// where a task sits, in words: «حلقة 4» ضمن برنامج «محراب» — from its ref, or (before it exists) from the chosen project; "__single" is one-off work
async function projWhere(D, pid, ref, en){
  let pr = null;
  try { pr = pid === "__single" ? { name: "", single: 1 } : pid ? await D.prepare("SELECT name, type, single FROM projects WHERE id=?").bind(String(pid).slice(0, 40)).first()
    : ref ? await D.prepare("SELECT p.name, p.type, p.single FROM tasks k JOIN projects p ON p.id=k.project_id WHERE k.ref=?").bind(ref).first() : null; } catch {}
  if (!pr) return {};
  const nm = pr.single ? (en ? "One-off work" : "أعمال منفردة") : pr.name, prog = !en && pr.type === "program" && !/^برنامج/.test(nm);
  const to = en ? `"${nm}"` : (prog ? "برنامج " : "") + "«" + nm + "»";
  return { project: nm, to, w: en ? " in " + to : " ضمن " + to };
}
async function tellClient(env, t, kind, extra){
  extra = extra || {};
  const u = await userOf(env, t.client_email); if (!u) return;
  const D = await db(env).catch(() => null), cat = CAT[kind] || "tasks", lang = u.lang === "en" ? "en" : "ar", en = lang === "en", L = ST_LABEL[lang];
  const hash = extra.hash || (kind === "project" ? "#w/p/" + extra.id : "#w/t/" + t.ref);
  if (D && t.ref && !extra.to) extra = { ...extra, ...(await projWhere(D, null, t.ref, en)) };
  t = { ...t, where: extra.w ? h(extra.w) : "" };
  const data = tellData(t, extra), ch = extra.ch;   // ch: the admin's channel choice (in-app is always kept)
  // 1) in-app — always on
  if (D) { try { await D.prepare("INSERT INTO notifications (recipient, kind, cat, link, data, created_at) VALUES (?,?,?,?,?,?)").bind(u.email, kind, cat, hash, JSON.stringify(data), now()).run(); } catch {} }
  if (D && kind === "periodReport" && extra.rid) { try { await D.prepare("UPDATE client_reports SET sent_at=?, note=? WHERE id=?").bind(now(), extra.studioNote || "", extra.rid).run(); } catch {} }
  const P = D ? await prefsOf(D, u.email).catch(() => null) : null, jobs = [];
  // 2) e-mail — unless the client switched this category off
  if ((!ch || ch.email) && (!P || P.email_cats[cat] || ESSENTIAL.includes(cat))) jobs.push((async () => {
    const m = composeMail(u, t, kind, extra, hash); if (!m) return; const { subject, html } = m;
    const r = await mailSend(env, u.email, subject, html);
    await logSend(D, { channel: "email", recipient: u.email, target: u.email, kind, status: r.ok ? "sent" : r.skip ? "skipped" : r.retry ? "retry" : "failed", error: r.error || r.skip, next: r.retry ? nextTry(1) : null, provider_id: r.id, payload: { to: u.email, subject, html } });
  })());
  // 3) WhatsApp — only with explicit consent, a confirmed number, the category on, and the studio's WhatsApp switched on
  if ((!ch || ch.wa) && P && P.consent && P.wa_cats[cat]) jobs.push((async () => {
    const cfg = await waConfig(env); if (!waReady(env, cfg)) return;
    const f = WA_TXT[lang][kind]; if (!f) return;
    const text = oneLine(f({ ...data, dateText: data.date ? fmtDate(data.date, lang) : "—", dueText: data.due ? fmtDate(data.due, lang) : "", statusText: L[data.status] || data.status || "" }), 700);
    const pl = { name: oneLine(u.name, 60), text, path: (en ? "en/" : "") + hash.replace(/^#w\/?/, "") };
    const r = await waSend(env, cfg, P.wa_phone, lang, pl);
    await logSend(D, { channel: "whatsapp", recipient: u.email, target: P.wa_phone, kind, status: r.ok ? "sent" : r.skip ? "skipped" : r.retry ? "retry" : "failed", error: r.error || r.skip, next: r.retry ? nextTry(1) : null, provider_id: r.id, payload: r.ok ? null : { phone: P.wa_phone, lang, p: pl } });
  })());
  // 4) this device (Web Push) — every device the client switched on, for the categories left on
  if ((!ch || ch.push) && D && (!P || P.push_cats[cat])) jobs.push((async () => {
    const subs = (await D.prepare("SELECT * FROM push_subs WHERE email=?").bind(u.email).all()).results; if (!subs.length) return;
    const body = shortText(lang, kind, data, L); if (!body) return;
    const url = SITE + (en ? "/en" : "") + "/workspace" + hash;
    for (const sub of subs) { const r = await pushSend(D, sub, { title: "Eyeblink Studio", body, url, tag: (t.ref || kind), lang, dir: en ? "ltr" : "rtl" }).catch(e => ({ ok: false, error: String(e).slice(0, 120) }));
      await logSend(D, { channel: "push", recipient: u.email, target: new URL(sub.endpoint).hostname, kind, status: r.ok ? "sent" : "failed", error: r.error }); }
  })());
  // 5) Telegram — once the client linked their chat with the studio's bot
  if ((!ch || ch.push) && D && (!P || P.tg_cats[cat])) jobs.push((async () => {
    const link = await D.prepare("SELECT * FROM tg_links WHERE email=?").bind(u.email).first(); if (!link || !tgTok(env)) return;
    const body = shortText(lang, kind, data, L); if (!body) return;
    const r = await tgSend(env, link.chat_id, "✦ Eyeblink Studio\n\n" + body, SITE + (en ? "/en" : "") + "/workspace" + hash, en ? "Open in my workspace" : "افتح في مساحة العمل");
    await logSend(D, { channel: "telegram", recipient: u.email, target: link.username ? "@" + link.username : "chat", kind, status: r.ok ? "sent" : "failed", error: r.error, provider_id: r.id });
  })());
  await Promise.allSettled(jobs);
}
// ---- automatic messages (Phase 3): each rule fires once per item (rule_log), inside the quiet hours (Gulf time),
// at most one message a day per client (the next run sends the rest). "ask" rules wait in Today (pending_sends). ----
const gulf = () => new Date(Date.now() + 4 * 3600e3);
async function runRules(env, D, force, dry){
  const R = await rulesOf(env), g = gulf(), hr = g.getUTCHours(), td = g.toISOString().slice(0, 10);
  if (!force && (hr < R.quiet.from || hr >= R.quiet.to || (R.quiet.fri && g.getUTCDay() === 5))) return { quiet: true };
  if (!force) { const last = await D.prepare("SELECT v FROM meta WHERE k='rsweep'").first(); if (last && Date.now() - +last.v < 3600e3) return { wait: true };
    await D.prepare("INSERT INTO meta (k, v) VALUES ('rsweep', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(Date.now())).run();
    await D.prepare("UPDATE notify_log SET payload=NULL WHERE status='sent' AND payload IS NOT NULL AND at<?").bind(new Date(Date.now() - 60 * 864e5).toISOString()).run(); }
  const dayStart = new Date(Date.parse(td + "T00:00:00Z") - 4 * 3600e3).toISOString(), out = [];
  const told = new Set((await D.prepare("SELECT DISTINCT recipient FROM rule_log WHERE at>=? AND outcome='sent'").bind(dayStart).all()).results.map(r => r.recipient));
  const got = async (rule, key) => (await D.prepare("SELECT outcome, at FROM rule_log WHERE rule=? AND key=?").bind(rule, key).first()) || null;
  const mark = (rule, key, who, outcome) => D.prepare("INSERT OR IGNORE INTO rule_log (rule, key, recipient, at, outcome) VALUES (?,?,?,?,?)").bind(rule, key, who || "", now(), outcome || "sent").run();
  const day = n => new Date(Date.parse(td + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const on = k => R.rules[k].mode !== "off", N = k => R.rules[k].days, cut = n => new Date(Date.now() - n * 864e5).toISOString();
  const client = async (rule, key, t, kind, extra, title, sub) => {
    if (!on(rule) || await got(rule, key)) return; const who = String(t.client_email || "").toLowerCase();
    if (dry) { if (R.rules[rule].mode === "auto") out.push({ rule, kind, who, title: t.title || extra.no || "" }); return; }
    if (R.rules[rule].mode === "ask") {
      await D.prepare("INSERT INTO pending_sends (rule, key, recipient, kind, t, extra, title, sub, created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(rule, key, who, kind, JSON.stringify(t), JSON.stringify(extra), title, sub || "", now()).run();
      await mark(rule, key, who, "asked"); out.push(rule + ":ask"); return; }
    if (told.has(who)) return;   // one a day per client; this one goes on the next run
    told.add(who); await mark(rule, key, who); await tellClient(env, t, kind, extra).catch(() => {}); out.push(rule + ":" + key); };
  const studio = async (rule, key, subject, text, link) => {
    if (!on(rule) || await got(rule, key)) return; if (dry) { out.push({ rule, kind: rule, who: "studio", title: subject }); return; } await mark(rule, key, "studio");
    try { await D.prepare("INSERT INTO notifications (recipient, kind, cat, link, data, created_at) VALUES ('studio','event','studio',?,?,?)").bind(link || "#today", JSON.stringify({ subject, text }), now()).run(); } catch {}
    await notifyStudio(env, subject, text).catch(() => {}); out.push(rule + ":" + key); };
  // invoices: after the due date first (the most pressing), then the final follow-up, the studio's personal touch, and before the due date
  const inv = (await D.prepare("SELECT i.*, p.name AS project_name, c.name AS client_name FROM invoices i LEFT JOIN projects p ON p.id=i.project_id LEFT JOIN clients c ON c.email=i.client_email WHERE i.status IN ('pending','partial') AND i.sent_at IS NOT NULL AND i.due_date IS NOT NULL ORDER BY i.due_date LIMIT 200").all()).results;
  for (const row of inv) { const x = parseI(row), a = k => invoiceArgs(x, k), who = row.client_name || x.client_email;
    if (x.due_date <= day(-N("invDue"))) {
      if (x.reminded_at && x.reminded_at.slice(0, 10) >= x.due_date && !(await got("invDue", x.id))) await mark("invDue", x.id, x.client_email, "earlier");   // reminded before the rules (or by hand)
      else { const A = a("invoiceDue"); await client("invDue", x.id, A.t, "invoiceDue", A.extra); } }
    if (x.due_date <= day(-N("invFollow")) && await got("invDue", x.id)) { const A = a("invoiceFollow");
      await client("invFollow", x.id, A.t, "invoiceFollow", A.extra, "متابعة أخيرة بالفاتورة " + x.no, who + " · المتبقي " + fmt(x.balance, x.currency)); }
    const fu = await got("invFollow", x.id);   // the personal touch counts from when the final follow-up actually went (or was skipped), not from the due date
    if (fu && fu.outcome !== "asked" && fu.at <= cut(N("invPersonal")))
      await studio("invPersonal", x.id, "فاتورة تحتاج متابعة شخصية · " + x.no, x.no + " · " + who + " · " + fmt(x.balance, x.currency) + " · بعد متابعتين", "#billing");
    if (x.due_date >= td && x.due_date <= day(N("invSoon"))) { const A = a("invoiceSoon"); await client("invSoon", x.id, A.t, "invoiceSoon", A.extra); } }
  // a version the client has not answered
  const rv = (await D.prepare("SELECT t.*, d.id AS did, d.label AS dlabel, d.is_final AS dfin FROM tasks t JOIN deliverables d ON d.task_id=t.id WHERE t.status IN ('feedback','final') AND d.status='sent' AND d.created_at<=? AND d.version=(SELECT MAX(version) FROM deliverables WHERE task_id=t.id) LIMIT 100").bind(cut(N("review"))).all()).results;
  for (const t of rv) await client("review", t.did, parse(t), "reviewWaiting", { label: t.dlabel, final: !!t.dfin }, "تذكير بمراجعة " + t.dlabel + " · " + t.ref, t.title);
  // details the studio asked for and has not received
  const inf = (await D.prepare("SELECT * FROM tasks WHERE status='info' AND updated_at<=? LIMIT 100").bind(cut(N("info"))).all()).results;
  for (const t of inf) await client("info", t.id + ":" + t.updated_at, parse(t), "infoWaiting", { note: t.studio_note || "" }, "تذكير بالتفاصيل المطلوبة · " + t.ref, t.title);
  // the team (KV): due tomorrow, past due, and internal reviews waiting for the studio
  if (!dry && (on("teamSoon") || on("teamLate") || on("qcWait"))) {
    const tt = [], members = {}; let c; do { const r = await env.EB.list({ prefix: "ttask:", cursor: c }); for (const k of r.keys) { try { tt.push(JSON.parse(await env.EB.get(k.name))); } catch {} } c = r.list_complete ? null : r.cursor; } while (c);
    const mem = async e => members[e] !== undefined ? members[e] : (members[e] = await env.EB.get("member:" + e).then(v => v ? JSON.parse(v) : null).catch(() => null));
    for (const t of tt) { if (!t || !t.member) continue; const open = ["assigned", "progress", "changes"].includes(t.status);
      if (open && t.due && t.due >= td && t.due <= day(N("teamSoon")) && on("teamSoon") && !(await got("teamSoon", t.id + ":" + t.due))) { const m = await mem(t.member);
        if (m && m.status === "active") { await mark("teamSoon", t.id + ":" + t.due, m.email); await sendMail(env, m.email, ...teamMail("soon", m, t)); out.push("teamSoon:" + t.id); } }
      if (open && t.due && t.due <= day(-N("teamLate")) && on("teamLate") && !(await got("teamLate", t.id + ":" + t.due))) { const m = await mem(t.member);
        if (m && m.status === "active") { await mark("teamLate", t.id + ":" + t.due, m.email); await sendMail(env, m.email, ...teamMail("late", m, t));
          try { await notifyStudio(env, "مهمة متأخرة لدى " + (m.name || m.email), t.title + " · كان موعدها " + t.due); } catch {} out.push("teamLate:" + t.id); } }
      const lv = (t.versions || []).slice(-1)[0];
      if (t.status === "qc" && lv && lv.at <= cut(N("qcWait"))) { const m = await mem(t.member);
        await studio("qcWait", t.id + ":" + lv.at, "تسليم داخلي بانتظار مراجعتك", t.title + " · من " + ((m && m.name) || t.member), "#team"); } }
  }
  return { sent: out };
}
// the team's two reminders, in the site's template; Modern Standard Arabic, English for members who chose it
function teamMail(kind, m, t){ const en = m.lang === "en", lang = en ? "en" : "ar", W = s => `<b style="color:#fff">${h(s)}</b>`, link = SITE + "/team";
  const when = t.due ? new Date(t.due + "T12:00:00Z").toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { weekday: "long", day: "numeric", month: "long" }) : "";
  const muted = x => `<p style="margin:16px 0 0;font-size:13px;line-height:1.8;color:#8E9BB8">${x}</p>`;
  if (kind === "soon") return [en ? "Due soon · " + t.title : "موعد التسليم يقترب · " + t.title,
    mail(lang, en ? "Your delivery date is near" : "موعد التسليم يقترب", `<p style="margin:0 0 12px">${en ? "A reminder that " + W(t.title) + " is due on " : "نذكّرك بأن موعد تسليم مهمة " + W(t.title) + " هو "}<b style="color:#3FE0E8">${h(when)}</b>.</p>` +
      muted(en ? "If you need anything clarified, or more time, tell us early so we can arrange it together." : "إن احتجت إلى أي توضيح أو وقت إضافي، فأخبرنا مبكراً لنرتّب الأمر معاً."), en ? "Open the task" : "افتح المهمة", link, greet({ name: m.name, lang }), { label: "TEAM" })];
  return [en ? "About " + t.title : "بخصوص مهمة " + t.title,
    mail(lang, en ? "Checking in on your task" : "نودّ الاطمئنان على سير المهمة", `<p style="margin:0 0 12px">${en ? W(t.title) + " has passed its agreed delivery date. We would like to check in: upload what you have so far, or tell us the new expected date." : "تجاوزت مهمة " + W(t.title) + " موعد تسليمها المتفق عليه. نودّ الاطمئنان على سيرها: ارفع ما أنجزته حتى الآن، أو أخبرنا بالموعد الجديد المتوقع."}</p>` +
      muted(en ? "The studio receives this note too, so we can help if you need it." : "يصل الاستوديو هذا التنبيه أيضاً، لنساعدك إن احتجت."), en ? "Open the task" : "افتح المهمة", link, greet({ name: m.name, lang }), { label: "TEAM" })];
}

// ---- the studio's morning digest (Phase 4): what waits for a decision, what happens today, what happened yesterday ----
async function digestData(env, D){
  const g = gulf(), td = g.toISOString().slice(0, 10), yd = new Date(Date.parse(td + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
  const yStart = new Date(Date.parse(yd + "T00:00:00Z") - 4 * 3600e3).toISOString(), tStart = new Date(Date.parse(td + "T00:00:00Z") - 4 * 3600e3).toISOString();
  const wait = [], today = [], yest = [];
  for (const p of (await D.prepare("SELECT title, sub FROM pending_sends WHERE done_at IS NULL ORDER BY id LIMIT 10").all()).results) wait.push([p.title, p.sub]);
  const tt = []; let c; do { const r = await env.EB.list({ prefix: "ttask:", cursor: c }); for (const k of r.keys) { try { tt.push(JSON.parse(await env.EB.get(k.name))); } catch {} } c = r.list_complete ? null : r.cursor; } while (c);
  for (const t of tt) { if (!t) continue; if (t.status === "qc") wait.push(["تسليم داخلي بانتظار مراجعتك: " + t.title, ""]);
    if (t.due === td && ["assigned", "progress", "changes"].includes(t.status)) today.push(["تسليم من الفريق: " + t.title, ""]); }
  c = null; do { const r = await env.EB.list({ prefix: "order:", cursor: c }); for (const k of r.keys) { try { const o = JSON.parse(await env.EB.get(k.name)); if (o && o.status === "new" && !o.demo && o.createdAt >= yStart) wait.push(["طلب جديد من الموقع" + (o.packageName ? ": " + o.packageName : ""), o.name || ""]); } catch {} } c = r.list_complete ? null : r.cursor; } while (c);
  for (const t of (await D.prepare("SELECT t.title, p.name AS pn FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.confirmed_date=? AND t.status NOT IN ('completed','rejected','cancelled') LIMIT 10").bind(td).all()).results) today.push(["تسليم: " + t.title, t.pn]);
  for (const x of (await D.prepare("SELECT no, total, currency FROM invoices WHERE due_date=? AND status IN ('pending','partial') AND sent_at IS NOT NULL LIMIT 10").bind(td).all()).results) today.push(["فاتورة تستحق اليوم: " + x.no, fmt(x.total, x.currency)]);
  const sent = (await D.prepare("SELECT COUNT(*) AS n FROM notify_log WHERE at>=? AND at<? AND status='sent' AND channel='email'").bind(yStart, tStart).first()).n;
  if (sent) yest.push(["رسائل بريد أُرسلت إلى العملاء", String(sent)]);
  for (const x of (await D.prepare("SELECT no, payments, currency FROM invoices WHERE updated_at>=?").bind(yStart).all()).results) { let ps = []; try { ps = JSON.parse(x.payments || "[]"); } catch {}
    for (const p of ps) if (p.date === yd) yest.push(["دفعة وصلت: " + x.no, fmt(p.amount, x.currency)]); }
  const done = (await D.prepare("SELECT COUNT(*) AS n FROM tasks WHERE completed_at>=? AND completed_at<?").bind(yStart, tStart).first()).n;
  if (done) yest.push(["مهام اكتملت", String(done)]);
  return { td, wait, today, yest };
}
function digestMail(G){
  const iso = s => String(s).replace(/(INV-\d{4}-\d{4}|T-[A-Z0-9]{4,})/g, '<span style="direction:ltr;unicode-bidi:isolate">$1</span>');
  const sec = (t, rows, col) => rows.length ? `<div style="margin:22px 0 4px;font-size:12px;color:#6F7FA0">${t}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows.map(r =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #1B2556;font-size:14px;color:#DCE3F0;text-align:right"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${col};margin-left:8px"></span>${iso(h(r[0]))}</td><td style="padding:10px 0;border-bottom:1px solid #1B2556;font-size:12.5px;color:#9FB0CC;text-align:left;white-space:nowrap">${h(r[1] || "")}</td></tr>`).join("")}</table>` : "";
  const tile = (v, k, col) => `<td width="33%" style="padding:12px 10px;background:#070C2A;border:1px solid #1B2556;border-radius:14px;text-align:right;vertical-align:top"><div style="font-size:26px;font-weight:300;color:${col};direction:ltr;text-align:right">${v}</div><div style="font-size:12px;color:#9FB0CC">${k}</div></td>`;
  // Arabic counting: one / two / three to ten / eleven and more
  const cnt = (n, one, two, few, many) => n === 1 ? one : n === 2 ? two : n <= 10 ? n + " " + few : n + " " + many;
  const lead = G.wait.length || G.today.length ? `${G.wait.length ? cnt(G.wait.length, "أمر واحد ينتظر", "أمران ينتظران", "أمور تنتظر", "أمراً ينتظر") + " قرارك" : "لا شيء ينتظر قرارك"}، و${G.today.length ? cnt(G.today.length, "موعد واحد", "موعدان", "مواعيد", "موعداً") + " اليوم" : "لا مواعيد اليوم"}.` : "يوم هادئ: لا قرارات تنتظرك ولا مواعيد اليوم.";
  const body = `<p style="margin:0 0 16px">${lead}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="8" style="border-collapse:separate;margin:0 -8px"><tr>${tile(G.wait.length, "بانتظار قرارك", "#F7C76A")}${tile(G.today.length, "مواعيد اليوم", "#3FE0E8")}${tile(G.yest.length, "من أمس", "#6EE7B0")}</tr></table>` +
    sec("بانتظار قرارك", G.wait, "#F7C76A") + sec("اليوم", G.today, "#3FE0E8") + sec("أمس", G.yest, "#6EE7B0");
  const text = ["صباح الخير، هذا يومك", "", ...(G.wait.length ? ["بانتظار قرارك · " + G.wait.length, ...G.wait.map(r => r[0] + (r[1] ? " · " + r[1] : "")), ""] : []),
    ...(G.today.length ? ["اليوم", ...G.today.map(r => r[0] + (r[1] ? " · " + r[1] : "")), ""] : []), ...(G.yest.length ? ["أمس", G.yest.map(r => r[0] + " " + r[1]).join(" · "), ""] : []), SITE + "/admin/"].join("\n");
  return { subject: "صباح الخير · ملخص " + new Date(G.td + "T12:00:00Z").toLocaleDateString("ar-u-nu-latn", { weekday: "long", day: "numeric", month: "long" }), html: mail("ar", "صباح الخير، هذا يومك", body, "افتح صفحة اليوم", SITE + "/admin/", "", { label: "DAILY DIGEST" }), text };
}
async function runDigest(env, D, force){
  const R = await rulesOf(env), C = R.digest, g = gulf(), td = g.toISOString().slice(0, 10);
  if (!force) { if (!C.on || g.toISOString().slice(11, 16) < C.time || (C.fri && g.getUTCDay() === 5)) return { wait: true };
    if (await D.prepare("SELECT 1 FROM meta WHERE k=?").bind("digest:" + td).first()) return { done: true };
    await D.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO NOTHING").bind("digest:" + td, now()).run(); }
  const G = await digestData(env, D);
  if (!force && C.skipEmpty && !G.wait.length && !G.today.length && !G.yest.length) return { empty: true };
  const m = digestMail(G), s = await siteSettings(env), to = env.NOTIFY_EMAIL || s.email;
  if (C.tg) await telegram(env, m.text).catch(() => {});
  if (C.email && to) await sendMail(env, to, m.subject, m.html).catch(() => {});
  return { sent: true, tg: C.tg, email: C.email && !!to };
}
// samples for the Templates tab: the real builders with clearly sample data
function tplSample(kind, lang){
  const en = lang === "en", name = en ? "Sarah" : "سارة", due = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const info = { when: new Date().toLocaleString(en ? "en-GB" : "ar-u-nu-latn", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dubai" }), device: en ? "Chrome on Windows" : "Chrome على Windows", place: en ? "Dubai, United Arab Emirates (approximate)" : "دبي، الإمارات (تقريبي)" };
  if (["welcome", "welcomeGoogle", "verify", "device", "password", "code"].includes(kind)) return accountMail(kind, lang, name, { link: SITE + (en ? "/en" : "") + "/account", code: "482916", info });
  if (kind === "teamSoon" || kind === "teamLate") { const r = teamMail(kind === "teamSoon" ? "soon" : "late", { name: en ? "Nour" : "نور", lang }, { title: en ? "Offer launch poster" : "بوستر إطلاق العرض", due }); return { subject: r[0], html: r[1] }; }
  const u = { name, lang, email: "client@example.com" }, t = { client_email: u.email, ref: "T-A62CA", title: en ? "Apartments reel" : "ريل عرض الشقق", confirmed_date: due, status: "feedback", studio_note: "" };
  const inv = { id: "sample", no: "INV-2026-0006", items: [{ desc: en ? "Monthly reels · November" : "ريلز شهرية · نوفمبر", qty: 1, unit: 300 }], currency: "$", total: 300, paid: 0, refunded: 0, discount: 0, balance: 300, status: "pending", state: kind === "invoiceFollow" ? "overdue" : "pending", due_date: due, issue_date: new Date().toISOString().slice(0, 10), project_name: en ? "Monthly reels" : "ريلز شهرية", note: "" };
  const extra = /^invoice/.test(kind) ? { inv, no: inv.no, amount: "$300", balance: "$300", due } : kind === "infoWaiting" ? { note: en ? "The logo as an SVG, and two product photos" : "الشعار بصيغة SVG، وصورتان للمنتج" } : { label: "V2" };
  return composeMail(u, t, kind, extra, /^invoice/.test(kind) ? "#w/invoices/sample" : "#w/t/T-A62CA");
}
// ---- clean-up (19 Nov): a client or a project leaves with everything that hangs on it. Counts first; the rows go to R2 as a JSON
// backup (backups/purge/…) before anything is deleted; the client's uploads in R2 go too. Invoices of a deleted project stay (money), unlinked. ----
const PURGE = [["deliverables","client_email"],["comments","client_email"],["files","client_email"],["tasks","client_email"],["recurring","client_email"],["invoices","client_email"],
  ["project_members","email"],["projects","client_email"],["activity","client_email"],["notifications","recipient"],["notify_prefs","email"],["notify_log","recipient"],
  ["scheduled_sends","recipient"],["pending_sends","recipient"],["rule_log","recipient"],["push_subs","email"],["tg_links","email"],["client_tips","email"],
  ["brand_kits","email"],["brand_assets","email"],["report_cfg","email"],["client_reports","email"],["clients","email"]];
async function kvEach(env, prefix, fn){ let c; do { const r = await env.EB.list({ prefix, cursor: c }); for (const k of r.keys) { let v = null; try { v = JSON.parse(await env.EB.get(k.name)); } catch {} if (v) await fn(k.name, v); } c = r.list_complete ? null : r.cursor; } while (c); }
async function purgeCounts(env, D, email){
  const n = async (sql, ...a) => ((await D.prepare(sql).bind(...a).first()) || {}).n || 0;
  const out = { projects: await n("SELECT COUNT(*) AS n FROM projects WHERE client_email=?", email), tasks: await n("SELECT COUNT(*) AS n FROM tasks WHERE client_email=?", email),
    deliverables: await n("SELECT COUNT(*) AS n FROM deliverables WHERE client_email=?", email), invoices: await n("SELECT COUNT(*) AS n FROM invoices WHERE client_email=?", email),
    paid: await n("SELECT COUNT(*) AS n FROM invoices WHERE client_email=? AND paid>0", email), files: await n("SELECT COUNT(*) AS n FROM files WHERE client_email=?", email) + await n("SELECT COUNT(*) AS n FROM brand_assets WHERE email=?", email),
    notifications: await n("SELECT COUNT(*) AS n FROM notifications WHERE recipient=?", email), orders: 0, tickets: 0, account: !!(await env.EB.get("user:" + email)) };
  await kvEach(env, "order:", async (k, o) => { if (String(o.email || "").toLowerCase() === email) out.orders++; });
  await kvEach(env, "sup:", async (k, s) => { if (String(s.email || "").toLowerCase() === email) out.tickets++; });
  return out;
}
async function purgeClient(env, D, email){
  const snap = { email, at: now(), rows: {}, kv: {} };
  for (const [t, c] of PURGE) snap.rows[t] = (await D.prepare(`SELECT * FROM ${t} WHERE ${c}=?`).bind(email).all()).results;
  snap.kv.user = await env.EB.get("user:" + email);
  await setAvatar(env, email, null).catch(() => {});   // the photo is public media: it goes first
  const refs = new Set(snap.rows.tasks.map(t => t.ref));
  if (env.R2) { await env.R2.put("backups/purge/" + Date.now() + "-" + email.replace(/[^a-z0-9.@_-]/g, "_") + ".json", JSON.stringify(snap)).catch(() => {});
    for (const f of snap.rows.files) if (String(f.url).startsWith(SITE + "/api/up/")) await env.R2.delete(f.url.slice(SITE.length + 8)).catch(() => {});
    for (const a of snap.rows.brand_assets) await env.R2.delete(a.key).catch(() => {}); }
  await D.batch(PURGE.map(([t, c]) => D.prepare(`DELETE FROM ${t} WHERE ${c}=?`).bind(email)));
  await env.EB.delete("user:" + email); await env.EB.delete("accreq:" + email);
  await kvEach(env, "order:", async (k, o) => { if (String(o.email || "").toLowerCase() === email) { await env.EB.delete(k); if (o.code) await env.EB.delete("code:" + o.code); } });
  await kvEach(env, "sup:", async (k, s) => { if (String(s.email || "").toLowerCase() === email) await env.EB.delete(k); });
  await unlinkTeam(env, refs);
}
// team tasks that pointed at client tasks which no longer exist keep their work, without the dead link
async function unlinkTeam(env, refs){ if (!refs.size) return;
  await kvEach(env, "ttask:", async (k, t) => { if (t.workTask && refs.has(t.workTask)) { t.workTask = ""; await env.EB.put(k, JSON.stringify(t)); } }); }
async function purgeProject(env, D, id){
  const tasks = (await D.prepare("SELECT id, ref FROM tasks WHERE project_id=?").bind(id).all()).results, files = (await D.prepare("SELECT url FROM files WHERE project_id=?").bind(id).all()).results;
  if (env.R2) for (const f of files) if (String(f.url).startsWith(SITE + "/api/up/")) await env.R2.delete(f.url.slice(SITE.length + 8)).catch(() => {});
  await D.batch([D.prepare("DELETE FROM deliverables WHERE project_id=?").bind(id), D.prepare("DELETE FROM comments WHERE project_id=?").bind(id), D.prepare("DELETE FROM files WHERE project_id=?").bind(id),
    D.prepare("DELETE FROM tasks WHERE project_id=?").bind(id), D.prepare("DELETE FROM recurring WHERE project_id=?").bind(id), D.prepare("DELETE FROM project_members WHERE project_id=?").bind(id),
    D.prepare("UPDATE invoices SET project_id=NULL WHERE project_id=?").bind(id), D.prepare("DELETE FROM projects WHERE id=?").bind(id)]);
  await unlinkTeam(env, new Set(tasks.map(t => t.ref)));
  return tasks.length;
}
// ---- periodic client reports (19 Nov): what we did since the last report, on the client's rhythm (every N days, on a weekday),
// for all their projects or the chosen ones; "ask" waits in Today for the studio's word, "auto" goes on its own ----
const RINC = { done: 1, nums: 1, waiting: 1, next: 1, money: 0 };
function rcfgOf(row, email){ let pj = "all", inc = {}; try { pj = JSON.parse(row && row.projects || '"all"'); } catch {} try { inc = JSON.parse(row && row.inc || "{}"); } catch {}
  return { email, every: row ? row.every : 0, dow: row ? row.dow : 1, mode: row && row.mode === "auto" ? "auto" : "ask", projects: pj, inc: { ...RINC, ...inc }, last_to: row ? row.last_to : null, started: row ? row.started : null }; }
const dAdd = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
function rNext(c){ if (!c.every) return null; const base = c.last_to || (c.started ? dAdd(c.started, -1) : null); if (!base) return null;
  const t = dAdd(base, c.every); let d = t;   // the chosen weekday nearest the target (within three days either way)
  for (const k of [0, -1, 1, -2, 2, -3, 3]) { const x = dAdd(t, k); if (new Date(x + "T12:00:00Z").getUTCDay() === c.dow) { d = x; break; } }
  if (d <= base) d = dAdd(d, 7);
  return { date: d, from: dAdd(base, 1), to: dAdd(d, -1) }; }
function rPeriod(R, en){ const f = d => new Date(d + "T12:00:00Z").toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { day: "numeric", month: "long" });
  return en ? f(R.from) + " to " + f(R.to) : "من " + f(R.from) + " إلى " + f(R.to); }
async function periodReport(D, email, from, to, c){
  const all = (await D.prepare("SELECT id, name, type FROM projects WHERE client_email=? AND status!='archived' ORDER BY created_at").bind(email).all()).results;
  const want = c.projects === "all" ? all : all.filter(p => (c.projects || []).includes(p.id)), ids = want.map(p => p.id), pn = Object.fromEntries(want.map(p => [p.id, p]));
  const R = { from, to, every: c.every, inc: c.inc, nums: { done: 0, versions: 0, ontime: null }, projects: [], next: [], money: null };
  if (!ids.length) return R;
  const IN = "(" + ids.map(() => "?").join(",") + ")", inR = d => d && String(d).slice(0, 10) >= from && String(d).slice(0, 10) <= to;
  const tasks = (await D.prepare(`SELECT id, ref, title, project_id, status, confirmed_date, completed_at FROM tasks WHERE project_id IN ${IN}`).bind(...ids).all()).results;
  const dls = (await D.prepare(`SELECT task_id, label, version, created_at FROM deliverables WHERE project_id IN ${IN}`).bind(...ids).all()).results;
  const done = tasks.filter(t => t.status === "completed" && inR(t.completed_at)), dated = done.filter(t => t.confirmed_date);
  R.nums = { done: done.length, versions: dls.filter(x => inR(x.created_at)).length, ontime: dated.length ? Math.round(dated.filter(t => String(t.completed_at).slice(0, 10) <= t.confirmed_date).length * 100 / dated.length) : null };
  const last = {}; for (const x of dls) if (!last[x.task_id] || x.version > last[x.task_id].version) last[x.task_id] = x;
  R.projects = want.map(p => ({ name: p.name, type: p.type,
    done: done.filter(t => t.project_id === p.id).map(t => ({ title: t.title, date: String(t.completed_at).slice(0, 10) })),
    waiting: tasks.filter(t => t.project_id === p.id && ["feedback","final"].includes(t.status)).map(t => ({ title: t.title, label: (last[t.id] || {}).label || "" })) })).filter(p => p.done.length || p.waiting.length);
  const horizon = dAdd(to, c.every || 14);
  R.next = tasks.filter(t => !["completed","rejected","cancelled"].includes(t.status) && t.confirmed_date && t.confirmed_date > to && t.confirmed_date <= horizon)
    .sort((a, b) => a.confirmed_date < b.confirmed_date ? -1 : 1).slice(0, 12).map(t => ({ title: t.title, project: pn[t.project_id].name, date: t.confirmed_date }));
  if (c.inc.money) { const inv = (await D.prepare("SELECT no, total, currency, payments, issue_date FROM invoices WHERE client_email=? AND sent_at IS NOT NULL").bind(email).all()).results.map(x => parseI(x));
    const paid = {}; inv.forEach(x => x.payments.forEach(y => { if (inR(y.date || y.at)) paid[x.currency] = money((paid[x.currency] || 0) + y.amount); }));
    const cr = await creditOf(D, email); R.money = { issued: inv.filter(x => inR(x.issue_date)).map(x => ({ no: x.no, total: fmt(x.total, x.currency) })), paid: Object.keys(paid).map(k => fmt(paid[k], k)), credit: cr > 0 ? fmt(cr, "$") : "" }; }
  // the client's package in the month the report ends in: what was used of each unit (with the carried units)
  const ag = await agreementOf(D, email);
  if (ag && ag.terms.mode === "package") { const m = to.slice(0, 7), use = (await usageOf(D, email, m)).used, cy = carryOf(ag, m);
    R.pkg = { month: m, units: ag.terms.units.filter(u => u.inc).map(u => ({ name: u.name, used: use[u.id] || 0, have: u.inc + (+cy[u.id] || 0) })) }; }
  return R;
}
const rMonth = (m, en) => new Date(m + "-15T12:00:00Z").toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { month: "long", year: "numeric" });
const RTYPE = { ar: { program: "برنامج", design: "تصاميم", monthly: "تعاون شهري", campaign: "حملة", once: "مشروع لمرة واحدة" }, en: { program: "Program", design: "Design", monthly: "Monthly", campaign: "Campaign", once: "One-off" } };
// the report inside the e-mail (dark, the site's template)
function periodCard(R, lang, note){ const en = lang === "en", rtl = !en, s = rtl ? "right" : "left", e = rtl ? "left" : "right", I = R.inc || RINC;
  const fd = d => new Date(d + "T12:00:00Z").toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { weekday: "long", day: "numeric", month: "long" });
  const tile = (v, k, col) => `<td width="33%" style="padding:12px 10px;background:#070C2A;border:1px solid #1B2556;border-radius:14px;text-align:${s};vertical-align:top"><div style="font-size:28px;font-weight:200;color:${col};direction:ltr;text-align:${s}">${v}</div><div style="font-size:12px;color:#9FB0CC">${k}</div></td>`;
  const sec = t => `<div style="margin:24px 0 6px;font-size:12px;color:#6F7FA0">${t}</div>`;
  const row = (txt, side, dot) => `<tr><td style="padding:7px 14px;border-top:1px solid #121a44;font-size:13.5px;color:#C3CEE2;text-align:${s}"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${dot};margin-${e}:8px"></span>${h(txt)}${side ? `<span style="float:${e};color:#6F7FA0;font-size:12px">${h(side)}</span>` : ""}</td></tr>`;
  let b = `<p style="margin:0 0 6px;font-size:12.5px;color:#8E9BB8">${h(rPeriod(R, en))}</p>` + (note ? `<p style="margin:0 0 16px;padding:12px 14px;border-radius:12px;background:#121a48;color:#DCE3F0">${h(note).replace(/\n/g, "<br>")}</p>` : "");
  if (I.nums) b += `<table role="presentation" width="100%" cellpadding="0" cellspacing="8" style="border-collapse:separate;margin:0 -8px"><tr>${tile(R.nums.done, en ? "Tasks completed" : "مهام اكتملت", "#3DDC97")}${tile(R.nums.versions, en ? "Versions delivered" : "نسخ سُلّمت", "#3FE0E8")}${tile(R.nums.ontime === null ? "—" : R.nums.ontime + "%", en ? "On time" : "في الموعد", "#F7C76A")}</tr></table>`;
  if (I.nums && R.pkg && R.pkg.units.length) b += sec((en ? "Your package · " : "باقتك · ") + rMonth(R.pkg.month, en)) + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` +
    R.pkg.units.map(u => `<tr><td style="padding:7px 0;border-bottom:1px solid #1B2556;font-size:13.5px;color:#C3CEE2;text-align:${s}">${h(u.name)}</td><td style="padding:7px 0;border-bottom:1px solid #1B2556;font-size:13.5px;color:${u.used >= u.have ? "#F7C76A" : "#3FE0E8"};text-align:${e};direction:ltr">${u.used} / ${u.have}</td></tr>`).join("") + `</table>`;
  const P = R.projects.filter(p => (I.done && p.done.length) || (I.waiting && p.waiting.length));
  if (P.length) b += sec(en ? "What we did" : "ما أنجزناه") + P.map(p => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 0;border:1px solid #1B2556;border-radius:14px;border-collapse:separate;background:#0A1033"><tr><td style="padding:12px 14px 4px;text-align:${s}"><span style="font-size:15px;font-weight:700;color:#fff">${h(p.name)}</span> <span style="font-size:11.5px;color:#3FE0E8">${h(RTYPE[en ? "en" : "ar"][p.type] || "")}</span></td></tr>` +
    (I.done ? p.done.map(t => row(t.title, fd(t.date), "#3DDC97")).join("") : "") + (I.waiting ? p.waiting.map(t => row(t.title + (t.label ? " · " + t.label : ""), en ? "Waiting for your review" : "بانتظار رأيك", "#F7C76A")).join("") : "") + `<tr><td style="padding:4px"></td></tr></table>`).join("");
  else if (I.done) b += `<p style="margin:16px 0 0;color:#8E9BB8">${en ? "A quiet stretch: nothing was completed in this period." : "فترة هادئة: لم تكتمل مهام في هذه الفترة."}</p>`;
  if (I.next && R.next.length) b += sec(en ? "Coming next" : "القادم") + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` + R.next.map(t => `<tr><td style="padding:8px 0;border-bottom:1px solid #1B2556;font-size:13.5px;color:#C3CEE2;text-align:${s}">${h(t.project)} · ${h(t.title)}</td><td style="padding:8px 0;border-bottom:1px solid #1B2556;font-size:12.5px;color:#9FB0CC;text-align:${e};white-space:nowrap">${h(fd(t.date))}</td></tr>`).join("") + `</table>`;
  if (R.money && R.money.credit) b += `<p style="margin:10px 0 0;font-size:13px;color:#9FB0CC">${en ? "Your prepaid credit: " : "رصيدك المقدّم: "}<b style="color:#3FE0E8;direction:ltr">${h(R.money.credit)}</b></p>`;
  if (R.money && (R.money.issued.length || R.money.paid.length)) b += sec(en ? "Invoices and payments" : "الفواتير والمدفوعات") + `<p style="margin:0;font-size:13.5px;color:#C3CEE2">${R.money.issued.map(x => h(x.no) + " · " + h(x.total)).join("<br>")}${R.money.paid.length ? `<br>${en ? "Paid" : "المدفوع"}: <b style="color:#fff">${h(R.money.paid.join(" · "))}</b>` : ""}</p>`;
  return b;
}
// the printable page (white, the invoice family), for the workspace and its PDF
function periodPage(R, cl, lang, note){ const en = lang === "en", I = R.inc || RINC, dir = en ? "ltr" : "rtl";
  const fd = d => new Date(d + "T12:00:00Z").toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { day: "numeric", month: "long" });
  const box = (v, k) => `<div style="flex:1;border:1px solid #DDE3EE;border-radius:12px;padding:12px 14px"><div style="font-size:26px;font-weight:300;color:#0E1A5C">${v}</div><div style="font-size:12px;color:#5B6785">${k}</div></div>`;
  const P = R.projects.filter(p => (I.done && p.done.length) || (I.waiting && p.waiting.length));
  return `<!doctype html><html lang="${en ? "en" : "ar"}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(rPeriod(R, en))}</title>
<style>@page{size:A4;margin:14mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}body{margin:0;background:#fff;color:#04061A;font:14px/1.75 'Segoe UI',Tahoma,Arial,sans-serif}.w{max-width:760px;margin:0 auto;padding:28px 22px}h1{font-size:22px;margin:0}.m{color:#5B6785;font-size:13px}.n{display:flex;gap:10px;margin:18px 0}.p{border:1px solid #DDE3EE;border-radius:12px;margin:10px 0;padding:10px 14px}.p b{font-size:15px}.r{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #EEF1F6;padding:6px 0;font-size:13.5px}.r span:last-child{color:#5B6785;white-space:nowrap}.h{margin:22px 0 4px;font-size:12px;color:#5B6785;letter-spacing:.04em}.note{background:#F1F5FD;border-radius:12px;padding:12px 14px;margin:14px 0}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1C45E6;padding-bottom:12px;margin-bottom:16px}</style></head><body><div class="w">
<div class="top"><img src="/assets/img/invoice-logo.png" alt="EYEBLINK STUDIO" style="height:28px;width:auto"><span class="m">${en ? "Report" : "تقرير"}</span></div>
<h1>${en ? "What we did together" : "ما أنجزناه معاً"}</h1><div class="m">${h(cl.name || "")} · ${h(rPeriod(R, en))}</div>
${note ? `<div class="note">${h(note).replace(/\n/g, "<br>")}</div>` : ""}
${I.nums ? `<div class="n">${box(R.nums.done, en ? "Tasks completed" : "مهام اكتملت")}${box(R.nums.versions, en ? "Versions delivered" : "نسخ سُلّمت")}${box(R.nums.ontime === null ? "—" : R.nums.ontime + "%", en ? "On time" : "في الموعد")}</div>` : ""}
${I.nums && R.pkg && R.pkg.units.length ? `<div class="h">${en ? "Your package · " : "باقتك · "}${h(rMonth(R.pkg.month, en))}</div>` + R.pkg.units.map(u => `<div class="r"><span>${h(u.name)}</span><span dir="ltr">${u.used} / ${u.have}</span></div>`).join("") : ""}
${P.length ? `<div class="h">${en ? "What we did" : "ما أنجزناه"}</div>` + P.map(p => `<div class="p"><b>${h(p.name)}</b> <span class="m">${h(RTYPE[en ? "en" : "ar"][p.type] || "")}</span>` + (I.done ? p.done.map(t => `<div class="r"><span>${h(t.title)}</span><span>${h(fd(t.date))}</span></div>`).join("") : "") + (I.waiting ? p.waiting.map(t => `<div class="r"><span>${h(t.title)}${t.label ? " · " + h(t.label) : ""}</span><span>${en ? "Waiting for your review" : "بانتظار رأيك"}</span></div>`).join("") : "") + `</div>`).join("") : ""}
${I.next && R.next.length ? `<div class="h">${en ? "Coming next" : "القادم"}</div>` + R.next.map(t => `<div class="r"><span>${h(t.project)} · ${h(t.title)}</span><span>${h(fd(t.date))}</span></div>`).join("") : ""}
${R.money && (R.money.issued.length || R.money.paid.length) ? `<div class="h">${en ? "Invoices and payments" : "الفواتير والمدفوعات"}</div>` + R.money.issued.map(x => `<div class="r"><span>${h(x.no)}</span><span>${h(x.total)}</span></div>`).join("") + (R.money.paid.length ? `<div class="r"><span>${en ? "Paid" : "المدفوع"}</span><span>${h(R.money.paid.join(" · "))}</span></div>` : "") : ""}
<p class="m" style="margin-top:26px">Eyeblink Studio · eyeblinkstudio.com</p></div></body></html>`;
}
async function reportArgs(env, D, row){ const u = await userOf(env, row.email), en = u && u.lang === "en", R = JSON.parse(row.data);
  return { t: { client_email: row.email, ref: "", title: rPeriod(R, en) }, extra: { preport: R, rid: row.id, name: rPeriod(R, en), hash: "#w/reports/" + row.id, studioNote: row.note || undefined } }; }
async function makeReport(env, D, email, from, to, c){ const R = await periodReport(D, email, from, to, c), id = "r_" + randHex(6);
  await D.prepare("INSERT INTO client_reports (id, email, from_d, to_d, data, created_at) VALUES (?,?,?,?,?,?)").bind(id, email, from, to, JSON.stringify(R), now()).run();
  return D.prepare("SELECT * FROM client_reports WHERE id=?").bind(id).first(); }
// the sweep: reports that are due today (Gulf time), inside the quiet hours, at most hourly
async function runClientReports(env, D){
  const Q = (await rulesOf(env)).quiet, g = gulf(), hr = g.getUTCHours(), td = g.toISOString().slice(0, 10);
  if (hr < Q.from || hr >= Q.to) return;
  const last = await D.prepare("SELECT v FROM meta WHERE k='crsweep'").first(); if (last && Date.now() - +last.v < 3600e3) return;
  await D.prepare("INSERT INTO meta (k, v) VALUES ('crsweep', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(Date.now())).run();
  for (const row of (await D.prepare("SELECT * FROM report_cfg WHERE every>0").all()).results) { const c = rcfgOf(row, row.email), n = rNext(c);
    if (!n || n.date > td || n.from > n.to) continue;
    await D.prepare("UPDATE report_cfg SET last_to=? WHERE email=?").bind(n.to, row.email).run();   // claimed first: never twice
    const r = await makeReport(env, D, row.email, n.from, n.to, c), A = await reportArgs(env, D, r), cl = await D.prepare("SELECT name FROM clients WHERE email=?").bind(row.email).first();
    if (c.mode === "ask") await D.prepare("INSERT INTO pending_sends (rule, key, recipient, kind, t, extra, title, sub, created_at) VALUES ('creport',?,?,'periodReport',?,?,?,?,?)")
      .bind(r.id, row.email, JSON.stringify(A.t), JSON.stringify(A.extra), "تقرير دوري · " + ((cl && cl.name) || row.email), rPeriod(JSON.parse(r.data), false), now()).run();
    else await tellClient(env, A.t, "periodReport", A.extra).catch(() => {}); }
}
// to the studio: the in-app inbox in the admin panel + the e-mail/Telegram it already had
function toStudio(ctx, env, subject, text){
  const m = /T-[A-Z0-9]{4,}/.exec(subject);
  later(ctx, (async () => { try { const D = await db(env); if (D) await D.prepare("INSERT INTO notifications (recipient, kind, cat, link, data, created_at) VALUES ('studio','event','studio',?,?,?)")
    .bind(m ? "#tasks/" + m[0] : "#tasks", JSON.stringify({ subject, text: excerpt(text, 260) }), now()).run(); } catch {} await notifyStudio(env, subject, text); })());
}
// failed sends come back here: a few at a time, at most every 5 minutes, on ordinary traffic
async function retryRow(env, D, r){
  let p = null; try { p = JSON.parse(r.payload || "null"); } catch {} if (!p) return { ok: false, error: "nothing to resend" };
  const res = r.channel === "email" ? await mailSend(env, p.to, p.subject, p.html) : await waSend(env, await waConfig(env), p.phone, p.lang, p.p);
  const n = r.attempts + 1, st = res.ok ? "sent" : res.skip ? "skipped" : (res.retry && n <= BACKOFF.length) ? "retry" : "failed";
  await D.prepare("UPDATE notify_log SET status=?, attempts=?, error=?, next_try_at=?, provider_id=COALESCE(?, provider_id), payload=? WHERE id=?")
    .bind(st, n, res.ok ? null : (res.error || res.skip || null), st === "retry" ? nextTry(n) : null, res.id || null, r.payload, r.id).run();
  return res;
}
async function sweepNotify(env){ try {
  const D = await db(env); if (!D) return;
  const last = await D.prepare("SELECT v FROM meta WHERE k='nsweep'").first(); if (last && Date.now() - +last.v < 300000) return;
  await D.prepare("INSERT INTO meta (k, v) VALUES ('nsweep', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(Date.now())).run();
  const rows = (await D.prepare("SELECT * FROM notify_log WHERE status='retry' AND next_try_at<=? ORDER BY id LIMIT 10").bind(now()).all()).results;
  for (const r of rows) await retryRow(env, D, r);
  // sends the admin scheduled for later (claimed first, so two sweeps never send twice)
  const sch = (await D.prepare("SELECT * FROM scheduled_sends WHERE sent_at IS NULL AND cancelled_at IS NULL AND at<=? ORDER BY at LIMIT 10").bind(now()).all()).results;
  for (const r of sch) { const c = await D.prepare("UPDATE scheduled_sends SET sent_at=? WHERE id=? AND sent_at IS NULL").bind(now(), r.id).run();
    if (c.meta && c.meta.changes) await tellClient(env, JSON.parse(r.t), r.kind, JSON.parse(r.extra)).catch(() => {}); }
  // the automatic messages (Notifications → rules): at most hourly, inside the quiet hours; then the studio's morning digest
  await runRules(env, D);
  await runDigest(env, D);
  await runClientReports(env, D);
  // recurring tasks whose date has come
  const rec = (await D.prepare("SELECT * FROM recurring WHERE active=1 AND next_run<=? LIMIT 10").bind(today()).all()).results;
  for (const r of rec) await runRecurring({}, env, D, r, r.next_run);
  // monthly reports switched to automatic: during the first days of the month, once per project
  if (new Date().getUTCDate() <= 5 && (await rulesOf(env)).rules.report.mode !== "off") { const pm = prevMonth();
    const auto = (await D.prepare("SELECT p.* FROM projects p WHERE p.auto_report=1 AND p.status='active' AND NOT EXISTS (SELECT 1 FROM meta m WHERE m.k='rep:'||p.id||':'||?) AND NOT EXISTS (SELECT 1 FROM report_cfg r WHERE r.email=p.client_email AND r.every>0) LIMIT 5").bind(pm).all()).results;
    for (const p of auto) await sendReport({}, env, D, p, pm); }
} catch {} }

// Telegram calls this when someone writes to the bot. Only "/start <one-time code>" (link) and "/stop" (unlink) do anything.
async function tgHook(ctx){ const { request, env } = ctx, conf = await tgConf(env);
  if (!conf || !conf.secret || request.headers.get("x-telegram-bot-api-secret-token") !== conf.secret) return json({ ok: false }, 401);
  const up = await request.json().catch(() => ({})), m = up.message || {}, chat = m.chat && m.chat.id, text = String(m.text || "").trim();
  if (!chat || (m.chat.type && m.chat.type !== "private")) return json({ ok: true });
  const D = await db(env); if (!D) return json({ ok: true });
  const st = /^\/start(?:@\w+)?\s+([a-f0-9]{24})$/.exec(text);
  if (st) { const email = await env.EB.get("tglink:" + st[1]); if (!email) { await tgSend(env, chat, "انتهت صلاحية رابط الربط. افتح إعدادات الإشعارات في مساحة العمل واضغط «اربط تيليغرام» من جديد.\n\nThis link has expired — open your workspace notification settings and tap “Link Telegram” again."); return json({ ok: true }); }
    await env.EB.delete("tglink:" + st[1]);
    const u = await userOf(env, email), en = u && u.lang === "en";
    await D.batch([D.prepare("DELETE FROM tg_links WHERE chat_id=? OR email=?").bind(String(chat), email), D.prepare("INSERT INTO tg_links (email, chat_id, username, linked_at) VALUES (?,?,?,?)").bind(email, String(chat), (m.from && m.from.username) || null, now())]);
    await act(D, { actor: email, actor_name: u ? u.name : email, client_email: email, kind: "tg_linked", data: {} });
    await tgSend(env, chat, en ? "✦ Linked. Updates from Eyeblink Studio about your projects will arrive here. Send /stop any time to turn them off." : "✦ تم الربط. ستصلك هنا تحديثات Eyeblink Studio عن مشاريعك ومهامك. أرسل /stop في أي وقت لإيقافها.");
    return json({ ok: true }); }
  if (/^\/stop\b/.test(text)) { const l = await D.prepare("SELECT email FROM tg_links WHERE chat_id=?").bind(String(chat)).first();
    if (l) { await D.prepare("DELETE FROM tg_links WHERE chat_id=?").bind(String(chat)).run(); await act(D, { actor: l.email, actor_name: l.email, client_email: l.email, kind: "tg_unlinked", data: {} }); }
    await tgSend(env, chat, "أوقفنا الرسائل هنا. يمكنك إعادة الربط من إعدادات الإشعارات في مساحة العمل.\n\nStopped. You can link again from your workspace notification settings."); return json({ ok: true }); }
  return json({ ok: true });
}
// what a client receives about a task: everything but the studio's internal fields
function cparse(t){ t = parse(t); if (t) delete t.assignee; return t; }
export async function onRequestGet(ctx) {
  const { request, env } = ctx, q = new URL(request.url).searchParams;
  later(ctx, sweepNotify(env));
  if (q.get("admin")) return adminGet(request, env, q);
  const u = await currentUser(request, env); if (!u) return json({ ok: false, error: "login" }, 401);
  if (u.role !== "client") return json({ ok: false, error: "not client" }, 403);
  if (u.mustChange) return json({ ok: false, error: "password" }, 403);   // a temporary password: choose your own first
  const D = await db(env); if (!D) return json({ ok: false, error: "db" }, 503);
  const e = u.email, open = OPEN.map(s => `'${s}'`).join(",");
  const unreadN = async () => (await D.prepare("SELECT COUNT(*) AS n FROM notifications WHERE recipient=? AND read_at IS NULL").bind(e).first()).n;
  if (q.get("view") === "unread") return json({ ok: true, unread: await unreadN() });
  if (q.get("view") === "tasks") return json({ ok: true, tasks: (await D.prepare(`SELECT t.*, p.name AS project_name, p.type AS project_type FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.project_id IN ${MINE} ORDER BY t.updated_at DESC LIMIT 500`).bind(e).all()).results.map(cparse),
    projects: (await D.prepare(`SELECT id, name, type, status FROM projects WHERE id IN ${MINE} ORDER BY name`).bind(e).all()).results,
    recurring: (await D.prepare(`SELECT r.id, r.title, r.every, r.dow, r.dom, r.due_days, r.next_run, r.project_id, p.name AS project_name FROM recurring r JOIN projects p ON p.id=r.project_id WHERE r.project_id IN ${MINE} AND r.active=1`).bind(e).all()).results });
  if (q.get("view") === "brand") return json({ ok: true, brand: await brandOf(D, e) });
  if (q.get("view") === "brandZip") return brandZip(env, await brandKit(D, e), u.name || e.split("@")[0]);
  if (q.get("view") === "notifications") return json({ ok: true, unread: await unreadN(), items: (await D.prepare("SELECT * FROM notifications WHERE recipient=? ORDER BY id DESC LIMIT 40").bind(e).all()).results.map(parseA) });
  if (q.get("report") || q.get("reportDoc")) {
    const p = await myProject(D, e, clip(q.get("report") || q.get("reportDoc"), 40)); if (!p) return q.get("reportDoc") ? htmlRes("not found", 404) : json({ ok: false }, 404);
    const month = isMonth(q.get("month")) ? q.get("month") : monthOf(now()), R = await monthReport(D, p, month);
    return q.get("reportDoc") ? htmlRes(reportPage(R, u, u.lang === "en" ? "en" : "ar")) : json({ ok: true, report: R });
  }
  if (q.get("view") === "reports") return json({ ok: true, reports: (await D.prepare("SELECT id, from_d, to_d, data, sent_at FROM client_reports WHERE email=? AND sent_at IS NOT NULL ORDER BY to_d DESC LIMIT 60").bind(e).all()).results
    .map(r => { let R = {}; try { R = JSON.parse(r.data); } catch {} return { id: r.id, from: r.from_d, to: r.to_d, nums: R.nums || {}, projects: (R.projects || []).map(p => p.name) }; }) });
  if (q.get("creportDoc")) { const r = await D.prepare("SELECT * FROM client_reports WHERE id=? AND email=? AND sent_at IS NOT NULL").bind(clip(q.get("creportDoc"), 20), e).first(); if (!r) return htmlRes("not found", 404);
    return htmlRes(periodPage(JSON.parse(r.data), u, u.lang === "en" ? "en" : "ar", r.note)); }
  if (q.get("view") === "invoices") return json({ ok: true, invoices: (await D.prepare("SELECT i.*, p.name AS project_name FROM invoices i LEFT JOIN projects p ON p.id=i.project_id WHERE i.client_email=? AND i.sent_at IS NOT NULL ORDER BY i.issue_date DESC, i.created_at DESC LIMIT 200").bind(e).all()).results.map(x => parseI(x)), credit: await creditOf(D, e), creditCur: ((await D.prepare("SELECT currency FROM credits WHERE email=? ORDER BY created_at DESC LIMIT 1").bind(e).first()) || {}).currency || "$" });
  if (q.get("invoiceDoc")) { const x = await invoiceOf(D, q.get("invoiceDoc")); if (!x || x.client_email !== e || !x.sent_at) return htmlRes("not found", 404);
    return htmlRes(billPage(x, u, u.lang === "en" ? "en" : "ar", { project: x.project_name, email: (await siteSettings(env)).email })); }
  if (q.get("view") === "prefs") { const cfg = await waConfig(env), tg = await tgConf(env), link = await D.prepare("SELECT username, linked_at FROM tg_links WHERE email=?").bind(e).first();
    const subs = (await D.prepare("SELECT endpoint FROM push_subs WHERE email=?").bind(e).all()).results;
    return json({ ok: true, prefs: await prefsOf(D, e), cats: CATS, wa: { available: waReady(env, cfg) },
      push: { key: (await vapid(D)).pub, devices: subs.length, endpoints: subs.map(x => x.endpoint.slice(-24)) },
      tg: { available: !!(tg && tg.bot && tgTok(env)), bot: tg && tg.bot, linked: !!link, username: link && link.username, since: link && link.linked_at } }); }
  if (q.get("project")) {
    const p = parseP(await myProject(D, e, q.get("project"))); if (!p) return json({ ok: false }, 404);
    const tasks = (await D.prepare("SELECT * FROM tasks WHERE project_id=? ORDER BY updated_at DESC").bind(p.id).all()).results.map(cparse);
    const activity = (await D.prepare("SELECT * FROM activity WHERE project_id=? ORDER BY id DESC LIMIT 40").bind(p.id).all()).results.map(parseA);
    const recurring = (await D.prepare("SELECT id, title, every, dow, dom, due_days, next_run, active FROM recurring WHERE project_id=? AND active=1 ORDER BY next_run").bind(p.id).all()).results;
    return json({ ok: true, me: e, project: await forClientP(D, p, u.lang === "en"), agreement: await clientAgreement(D, e), tasks, activity, quota_used: await quotaUse(D, p.id), recurring, ...(await spaceOf(D, p.id)) });
  }
  if (q.get("task")) {
    const t = cparse(await myTask(D, e, q.get("task"))); if (!t) return json({ ok: false }, 404);
    const activity = (await D.prepare("SELECT * FROM activity WHERE task_id=? ORDER BY id DESC LIMIT 80").bind(t.id).all()).results.map(parseA).filter(a => !(a.data && a.data.internal));
    const files = (await D.prepare("SELECT id, category, title, url, created_at FROM files WHERE task_id=? ORDER BY created_at").bind(t.id).all()).results;   // the client's own attachments to this task
    return json({ ok: true, me: e, task: t, activity, files, deliverables: forClient(await deliverablesOf(D, t.id)), comments: await commentsOf(D, "task", t.id) });
  }
  const projects = (await D.prepare(`SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status IN (${open})) AS open_tasks,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status='completed') AS done_tasks,
      (SELECT MIN(t.confirmed_date) FROM tasks t WHERE t.project_id=p.id AND t.status IN (${open}) AND t.confirmed_date >= ?3) AS next_date,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND substr(t.created_at,1,7)=?2 AND t.status NOT IN ('cancelled','rejected')) AS month_tasks FROM projects p WHERE p.id IN ${MINE} ORDER BY p.status='active' DESC, p.updated_at DESC`).bind(e, monthOf(now()), today()).all()).results.map(parseP);
  for (const p of projects) await forClientP(D, p, u.lang === "en");
  const counts = {}; for (const r of (await D.prepare(`SELECT status, COUNT(*) AS n FROM tasks WHERE project_id IN ${MINE} GROUP BY status`).bind(e).all()).results) counts[r.status] = r.n;
  const tasks = (await D.prepare(`SELECT t.*, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.project_id IN ${MINE} ORDER BY t.updated_at DESC LIMIT 12`).bind(e).all()).results.map(cparse);
  const upcoming = (await D.prepare(`SELECT t.ref, t.title, t.confirmed_date, t.status, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.project_id IN ${MINE}
      AND t.confirmed_date >= ?2 AND t.status IN (${open}) ORDER BY t.confirmed_date LIMIT 6`).bind(e, today()).all()).results;
  // the home screen: what waits on the client, each project's pulse, the latest versions and what is coming
  const due = (await D.prepare("SELECT id, no, title, currency, total, paid, status, due_date FROM invoices WHERE client_email=?1 AND sent_at IS NOT NULL AND status IN ('pending','partial') ORDER BY due_date IS NULL, due_date LIMIT 8").bind(e).all()).results;
  const delivered = (await D.prepare(`SELECT d.id, d.label, d.is_final, d.status, d.created_at, t.ref, t.title, t.status AS task_status, p.name AS project_name FROM deliverables d JOIN tasks t ON t.id=d.task_id JOIN projects p ON p.id=d.project_id
      WHERE d.project_id IN ${MINE} ORDER BY d.created_at DESC LIMIT 5`).bind(e).all()).results;
  const recurring = (await D.prepare(`SELECT r.title, r.next_run, p.name AS project_name FROM recurring r JOIN projects p ON p.id=r.project_id WHERE r.project_id IN ${MINE} AND r.active=1 ORDER BY r.next_run LIMIT 4`).bind(e).all()).results;
  const moves = (await D.prepare(`SELECT t.ref, t.title, t.confirmed_date, t.change_request, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.project_id IN ${MINE}
      AND t.change_request LIKE '%"pending"%' LIMIT 6`).bind(e).all()).results.map(cparse).filter(t => t.change_request && t.change_request.status === "pending");
  const tips = (await D.prepare("SELECT k FROM client_tips WHERE email=?").bind(e).all()).results.map(r => r.k);
  // what the library still lacks for a clean delivery: a transparent logo, and the colours
  const gap = await D.prepare("SELECT (SELECT COUNT(*) FROM brand_assets WHERE email=?1 AND deleted_at IS NULL AND kind IN ('logo_clear','vector')) AS clear, (SELECT COUNT(*) FROM brand_kits WHERE email=?1 AND colors<>'[]') AS colors").bind(e).first();
  const brandN = (await D.prepare("SELECT (SELECT COUNT(*) FROM brand_assets WHERE email=?1 AND deleted_at IS NULL) + (SELECT COUNT(*) FROM brand_kits WHERE email=?1 AND (colors<>'[]' OR fonts<>'[]' OR style<>'' OR music<>'')) AS n").bind(e).first()).n;
  const waiting = (await D.prepare(`SELECT t.ref, t.title, t.status, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.project_id IN ${MINE}
      AND t.status IN ('info','feedback','final') ORDER BY t.updated_at DESC LIMIT 10`).bind(e).all()).results;
  const bills = await D.prepare("SELECT COUNT(*) AS open, SUM(CASE WHEN due_date<?2 THEN 1 ELSE 0 END) AS overdue FROM invoices WHERE client_email=?1 AND sent_at IS NOT NULL AND status IN ('pending','partial')").bind(e, today()).first();
  return json({ ok: true, projects, counts, tasks, upcoming, waiting, due, delivered, recurring, moves, tips, agreement: await clientAgreement(D, e), brand_n: brandN, brand_gap: { clear: !gap.clear, colors: !gap.colors }, unread: await unreadN(), bills: { open: (bills && bills.open) || 0, overdue: (bills && bills.overdue) || 0 } });
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  if (new URL(request.url).searchParams.get("tg") === "hook") return tgHook(ctx);
  const d = await request.json().catch(() => ({}));
  if (["project","review","status","date","dateDecision","deliver","point","pointAdd","studioComment","removeComment","studioFile","removeFile","studioRead","retryNotif","waConfig","waTest","invoice","invoicePay","invoiceUnpay","invoiceStatus","invoiceSend","invoiceRemind","invoiceDelete","notifyPreview","scheduledCancel","rulesGet","rulesSave","pendingSend","pendingSkip","rulesRun","reportCfgGet","reportCfgSave","reportBuild","reportSend","purgePreview","clientPurge","projectPurge","logView","scheduledNow","tplPreview","digestPreview","digestNow","recurring","recurringDelete","recurringRun","sendReport","brandSave","brandAssetDel","clientSave","clientAvatar","taskUnit","taskExtras","taskRename","monthBill","clientTerms","unbilled","creditAdd","creditDel","invoicesPurge","carryInfo","carrySave","clientArchive","studioTask","taskEdit","taskDelete","tgSetup"].includes(d.action)) {
    if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
    ctx.notify = cleanNotify(d.notify);   // the send sheet: channels and time for whatever this action tells the client
    return adminPost(ctx, d);
  }
  const u = await currentUser(request, env); if (!u) return json({ ok: false, error: "login" }, 401);
  if (u.role !== "client") return json({ ok: false, error: "not client" }, 403);
  if (u.mustChange) return json({ ok: false, error: "password" }, 403);   // a temporary password: choose your own first
  const D = await db(env); if (!D) return json({ ok: false, error: "db" }, 503);
  const at = now(), who = { actor: u.email, actor_name: u.name, client_email: u.email };
  if (d.action === "projectNew") {
    const name = clip(d.name, 80); if (!name) return json({ ok: false, error: "name" }, 400);
    const type = ["program","monthly","campaign","design","once","custom"].includes(d.type) ? d.type : "custom";
    if ((await D.prepare("SELECT COUNT(*) AS n FROM projects WHERE client_email=?").bind(u.email).first()).n >= 40) return json({ ok: false, error: "limit" }, 429);
    const id = "p_" + randHex(6);
    await D.prepare("INSERT INTO projects (id, client_email, name, description, type, status, services, start_date, end_date, quota, drive_url, auto_report, created_at, updated_at, cadence) VALUES (?,?,?,?,?,'active','[]',NULL,NULL,NULL,NULL,0,?,?,?)")
      .bind(id, u.email, name, clip(d.description, 1000), type, at, at, cadenceOf(type, d.cadence)).run();
    await act(D, { ...who, project_id: id, kind: "project_created", data: { name, by: "client" } });
    toStudio(ctx, env, "مشروع جديد من " + (u.name || u.email) + " · " + name, "أضاف العميل مشروعاً جديداً في مساحة عمله: " + name);
    return json({ ok: true, id });
  }
  if (d.action === "brand") {
    const hex = /^#[0-9a-f]{6}$/i;
    const colors = (Array.isArray(d.colors) ? d.colors : []).slice(0, 24).map(c => ({ name: clip(c && c.name, 40), hex: String(c && c.hex || "").trim().toUpperCase() })).filter(c => hex.test(c.hex));
    const fonts = (Array.isArray(d.fonts) ? d.fonts : []).slice(0, 12).map(f => ({ name: clip(f && f.name, 60), use: clip(f && f.use, 60) })).filter(f => f.name);
    await D.prepare("INSERT INTO brand_kits (email, colors, fonts, style, music, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET colors=excluded.colors, fonts=excluded.fonts, style=excluded.style, music=excluded.music, updated_at=excluded.updated_at")
      .bind(u.email, JSON.stringify(colors), JSON.stringify(fonts), clip(d.style, 1500), clip(d.music, 1500), at).run();
    return json({ ok: true, brand: await brandOf(D, u.email) });
  }
  if (d.action === "brandDel") {
    const a = await D.prepare("SELECT * FROM brand_assets WHERE id=? AND email=? AND deleted_at IS NULL").bind(clip(d.id, 40), u.email).first(); if (!a) return json({ ok: false }, 404);
    await D.prepare("UPDATE brand_assets SET deleted_at=? WHERE id=?").bind(at, a.id).run();
    if (env.R2) await env.R2.delete(a.key).catch(() => {});
    return json({ ok: true });
  }
  if (d.action === "extrasDecide") {
    const t = parse(await myTask(D, u.email, clip(d.task, 20))); if (!t || !t.extras || t.extras.state !== "pending") return json({ ok: false }, 404);
    const yes = d.decision === "accept"; t.extras.state = yes ? "accepted" : "declined"; t.extras.at = at;
    await D.prepare("UPDATE tasks SET extras=?, updated_at=? WHERE id=?").bind(JSON.stringify(t.extras), at, t.id).run();
    await act(D, { ...who, client_email: t.client_email, project_id: t.project_id, task_id: t.id, kind: "extras_decided", data: { ref: t.ref, accepted: yes } });
    toStudio(ctx, env, (yes ? "وافق العميل على الإضافة " : "طلب العميل الالتزام بالإطار المتفق عليه ") + t.ref + " — " + (u.name || u.email), t.title + "\n" + t.extras.items.map(x => x.name + ": " + x.amount).join("\n"));
    return json({ ok: true, state: t.extras.state });
  }
  if (d.action === "tip") { if (!["welcome","player","brandgap"].includes(d.k)) return json({ ok: false }, 400);
    await D.prepare("INSERT OR IGNORE INTO client_tips (email, k, at) VALUES (?, ?, ?)").bind(u.email, d.k, at).run(); return json({ ok: true }); }
  if (d.action === "read") {
    if (d.all) await D.prepare("UPDATE notifications SET read_at=? WHERE recipient=? AND read_at IS NULL").bind(at, u.email).run();
    else for (const id of (Array.isArray(d.ids) ? d.ids : []).slice(0, 100).map(Number).filter(Number.isInteger))
      await D.prepare("UPDATE notifications SET read_at=? WHERE id=? AND recipient=? AND read_at IS NULL").bind(at, id, u.email).run();
    return json({ ok: true });
  }
  if (d.action === "pushSub") {
    const s2 = d.sub || {}, k = s2.keys || {}; if (!okEndpoint(s2.endpoint) || !/^[\w-]{80,100}$/.test(k.p256dh || "") || !/^[\w-]{16,32}$/.test(k.auth || "")) return json({ ok: false, error: "sub" }, 400);
    const n = (await D.prepare("SELECT COUNT(*) AS n FROM push_subs WHERE email=?").bind(u.email).first()).n; if (n >= 10) await D.prepare("DELETE FROM push_subs WHERE id=(SELECT id FROM push_subs WHERE email=? ORDER BY id LIMIT 1)").bind(u.email).run();
    await D.prepare("INSERT INTO push_subs (email, endpoint, p256dh, auth, ua, created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET email=excluded.email, p256dh=excluded.p256dh, auth=excluded.auth")
      .bind(u.email, s2.endpoint, k.p256dh, k.auth, clip(request.headers.get("user-agent"), 160), at).run();
    return json({ ok: true });
  }
  if (d.action === "pushUnsub") { await D.prepare("DELETE FROM push_subs WHERE email=? AND endpoint=?").bind(u.email, String(d.endpoint || "")).run(); return json({ ok: true }); }
  if (d.action === "pushTest" || d.action === "tgTest") {
    const en = u.lang === "en", body = en ? "Notifications are on. You'll hear from us here when something changes in your workspace." : "الإشعارات تعمل. ستصلك هنا تحديثات مساحة العمل أولاً بأول.", url = SITE + (en ? "/en" : "") + "/workspace#w/settings";
    if (d.action === "tgTest") { const l = await D.prepare("SELECT chat_id FROM tg_links WHERE email=?").bind(u.email).first(); if (!l) return json({ ok: false, error: "not linked" }, 409);
      const r = await tgSend(env, l.chat_id, "✦ Eyeblink Studio\n\n" + body); return json({ ok: r.ok, error: r.error }); }
    const subs = (await D.prepare("SELECT * FROM push_subs WHERE email=?").bind(u.email).all()).results; if (!subs.length) return json({ ok: false, error: "no device" }, 409);
    let ok = 0; for (const sub of subs) if ((await pushSend(D, sub, { title: "Eyeblink Studio", body, url, tag: "test", lang: en ? "en" : "ar", dir: en ? "ltr" : "rtl" }).catch(() => ({}))).ok) ok++;
    return json({ ok: ok > 0, sent: ok });
  }
  if (d.action === "tgLink") { const conf = await tgConf(env); if (!conf || !conf.bot || !tgTok(env)) return json({ ok: false, error: "tg off" }, 409);
    const code = randHex(12); await env.EB.put("tglink:" + code, u.email, { expirationTtl: 1800 });
    return json({ ok: true, url: "https://t.me/" + conf.bot + "?start=" + code }); }
  if (d.action === "tgUnlink") { const l = await D.prepare("SELECT chat_id FROM tg_links WHERE email=?").bind(u.email).first();
    if (l) { await D.prepare("DELETE FROM tg_links WHERE email=?").bind(u.email).run(); await act(D, { ...who, kind: "tg_unlinked", data: {} }); }
    return json({ ok: true }); }
  if (d.action === "prefs") {
    const cur = await prefsOf(D, u.email), pick = (src, c, dflt) => src && typeof src === "object" && c in src ? !!src[c] : dflt;
    const ec = Object.fromEntries(CATS.map(c => [c, ESSENTIAL.includes(c) || pick(d.email_cats, c, cur.email_cats[c])])), wc = Object.fromEntries(CATS.map(c => [c, pick(d.wa_cats, c, cur.wa_cats[c])]));
    const pcs = Object.fromEntries(CATS.map(c => [c, pick(d.push_cats, c, cur.push_cats[c])])), tcs = Object.fromEntries(CATS.map(c => [c, pick(d.tg_cats, c, cur.tg_cats[c])]));
    let phone = cur.wa_phone || null, cAt = cur.wa_consent_at, wAt = cur.wa_withdrawn_at, logKind = null;
    if (d.wa_consent === true) {
      const np = normPhone(d.wa_phone); if (!np) return json({ ok: false, error: "phone" }, 400);
      if (!cur.consent || np !== cur.wa_phone) { phone = np; cAt = at; wAt = null; logKind = "wa_consent"; }   // a new number needs a fresh consent
    } else if (d.wa_consent === false && cur.consent) { wAt = at; logKind = "wa_withdrawn"; }
    await D.prepare(`INSERT INTO notify_prefs (email, email_cats, wa_cats, push_cats, tg_cats, wa_phone, wa_consent_at, wa_consent_v, wa_withdrawn_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(email) DO UPDATE SET email_cats=excluded.email_cats, wa_cats=excluded.wa_cats, push_cats=excluded.push_cats, tg_cats=excluded.tg_cats, wa_phone=excluded.wa_phone, wa_consent_at=excluded.wa_consent_at,
      wa_consent_v=excluded.wa_consent_v, wa_withdrawn_at=excluded.wa_withdrawn_at, updated_at=excluded.updated_at`)
      .bind(u.email, JSON.stringify(ec), JSON.stringify(wc), JSON.stringify(pcs), JSON.stringify(tcs), phone, cAt, cAt ? CONSENT_V : null, wAt, at).run();
    if (logKind) await act(D, { ...who, kind: logKind, data: { phone: phone ? phone.replace(/\d(?=\d{4})/g, "•") : undefined, v: CONSENT_V } });
    return json({ ok: true, prefs: await prefsOf(D, u.email) });
  }

  if (d.action === "task" || d.action === "tasks") {
    const p = d.project === SINGLE ? await singlesOf(D, u.email) : await myProject(D, u.email, clip(d.project, 40)); if (!p) return json({ ok: false, error: "project" }, 404);
    if (p.status !== "active") return json({ ok: false, error: "project closed" }, 409);
    const items = d.action === "tasks" ? (Array.isArray(d.items) ? d.items.slice(0, 10) : []) : [d];
    if (!items.length) return json({ ok: false, error: "title" }, 400);
    for (let k = 0; k < items.length; k++) {          // check everything first: either all tasks are created or none
      const x = items[k] || {}; if (!clip(x.title, 140)) return json({ ok: false, error: "title", index: k }, 400);
      const rd = clip(x.requested_date, 10); if (rd && (!isDate(rd) || rd < today())) return json({ ok: false, error: "date", index: k }, 400);
    }
    const n = (await D.prepare("SELECT COUNT(*) AS n FROM tasks WHERE client_email=? AND created_at>=?").bind(u.email, today()).first()).n;
    if (n + items.length > 40) return json({ ok: false, error: "too many attempts" }, 429);
    let used = p.quota ? await quotaUse(D, p.id) : 0; const made = [];
    const lib = items.some(x => x.brand_lib) ? await brandOf(D, p.client_email) : null, libLinks = lib ? lib.assets.filter(a => a.kind !== "other").map(a => ({ label: (u.lang === "en" ? "Brand library · " : "مكتبة الهوية · ") + a.title, url: a.url })) : [];
    const ag = p.in_pkg !== 0 ? await agreementOf(D, p.client_email) : null;
    for (const x of items) {
      const title = clip(x.title, 140), rd = clip(x.requested_date, 10), id = "t_" + randHex(8), ref = await newRef(D), pr = PRIORITIES.includes(x.priority) ? x.priority : "normal", brief = cleanBrief(x.brief && lib && x.brand_lib ? { ...x.brief, brand: brandBrief(lib, u.lang !== "en") } : lib && x.brand_lib ? { brand: brandBrief(lib, u.lang !== "en") } : x.brief);
      const over = p.quota && used >= p.quota ? 1 : 0; used++;   // flagged for the studio, never blocked
      await D.prepare(`INSERT INTO tasks (id, ref, project_id, client_email, title, type, description, details, notes, priority, requested_date, status, links, brief, over_quota, created_by, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,'new',?,?,?,?,?,?)`).bind(id, ref, p.id, p.client_email, title, clip(x.type, 60), clip(x.description, 4000), clip(x.details, 6000), clip(x.notes, 3000), pr, rd || null,
        JSON.stringify(cleanLinks((Array.isArray(x.links) ? x.links : []).concat(x.brand_lib ? libLinks : []))), brief ? JSON.stringify(brief) : null, over, u.email, at, at).run();
      const un = unitOf(ag && ag.terms, x.type); if (un) await D.prepare("UPDATE tasks SET unit=? WHERE id=?").bind(un.id, id).run();
      await act(D, { ...who, client_email: p.client_email, project_id: p.id, task_id: id, kind: "task_created", data: { ref, title, requested_date: rd || null, priority: pr } });
      made.push({ id, ref, title, rd, pr, over: !!over });
    }
    await D.prepare("UPDATE projects SET updated_at=? WHERE id=?").bind(at, p.id).run();
    const line = m => m.ref + " — " + m.title + (m.rd ? " · " + m.rd : "") + (m.pr !== "normal" ? " · " + ({ high: "عالية", urgent: "عاجلة" })[m.pr] : "") + (m.over ? " · ⚠️ خارج الحصة" : "");
    if (made.length === 1) toStudio(ctx, env, "مهمة جديدة " + made[0].ref + " — " + u.name, made[0].title + "\nالمشروع: " + p.name + (made[0].rd ? "\nالموعد المطلوب: " + made[0].rd : "") + (made[0].pr !== "normal" ? "\nالأولوية: " + ({ high: "عالية", urgent: "عاجلة" })[made[0].pr] : "") + (made[0].over ? "\n⚠️ خارج الحصة الشهرية (" + used + " من " + p.quota + ")" : "") + "\n\nافتحها: " + adminLink(made[0].ref));
    else toStudio(ctx, env, made.length + " مهام جديدة " + made[0].ref + " — " + u.name, "المشروع: " + p.name + "\n\n" + made.map(line).join("\n") + "\n\n" + SITE + "/admin/#tasks");
    return d.action === "task" ? json({ ok: true, ref: made[0].ref, over_quota: made[0].over }) : json({ ok: true, refs: made.map(m => m.ref), ids: made.map(m => m.id), over_quota: made.filter(m => m.over).length });
  }
  if (d.action === "comment" && d.scope === "project") {
    const p = await myProject(D, u.email, clip(d.project, 40)); if (!p) return json({ ok: false, error: "project" }, 404);
    return addComment(ctx, D, { scope: "project", project: p, author: u.email, author_name: u.name, body: d.body, links: d.links, client: true });
  }
  if (d.action === "deleteComment") {
    const c = await D.prepare(`SELECT * FROM comments WHERE id=?2 AND deleted_at IS NULL AND author=?1 AND project_id IN ${MINE}`).bind(u.email, clip(d.id, 40)).first();
    if (!c) return json({ ok: false }, 404);
    await D.prepare("UPDATE comments SET deleted_at=? WHERE id=?").bind(at, c.id).run(); return json({ ok: true });
  }
  if (d.action === "file") {
    const p = await myProject(D, u.email, clip(d.project, 40)); if (!p) return json({ ok: false, error: "project" }, 404);
    return addFile(ctx, D, { project: p, by: u.email, by_name: u.name, d });
  }
  if (d.action === "deleteFile") {
    const f = await D.prepare(`SELECT * FROM files WHERE id=?2 AND deleted_at IS NULL AND added_by=?1 AND project_id IN ${MINE}`).bind(u.email, clip(d.id, 40)).first();
    if (!f) return json({ ok: false }, 404);
    await D.prepare("UPDATE files SET deleted_at=? WHERE id=?").bind(at, f.id).run();
    if (env.R2 && f.url.startsWith(SITE + "/api/up/")) await env.R2.delete(f.url.slice(SITE.length + 8)).catch(() => {});
    await act(D, { ...who, client_email: f.client_email, project_id: f.project_id, kind: "file_removed", data: { title: f.title } });
    return json({ ok: true });
  }
  const t = parse(await myTask(D, u.email, clip(d.task, 12))); if (!t) return json({ ok: false, error: "task" }, 404);
  const tw = { ...who, client_email: t.client_email, project_id: t.project_id, task_id: t.id };
  if (d.action === "comment") return addComment(ctx, D, { scope: "task", task: t, author: u.email, author_name: u.name, body: d.body, links: d.links, client: true });
  if (d.action === "decide") {
    const dl = parseD(await D.prepare("SELECT * FROM deliverables WHERE task_id=? ORDER BY version DESC LIMIT 1").bind(t.id).first() || {});
    if (!dl.id || dl.id !== clip(d.deliverable, 40) || dl.status !== "sent" || !["feedback","final"].includes(t.status)) return json({ ok: false, error: "state" }, 409);
    const note = clip(d.note, 3000);
    if (d.decision === "approve") {
      const to = dl.is_final ? "completed" : "progress";
      const kept = cleanPoints(d.points);
      await D.prepare("UPDATE deliverables SET status='approved', decision_note=?, decided_at=?, decided_by=?" + (kept.length ? ", points=?" : "") + " WHERE id=?").bind(...[note, at, u.email].concat(kept.length ? [JSON.stringify(dl.points.filter(p => p.by === "studio").concat(kept))] : [], [dl.id])).run();
      await D.prepare("UPDATE tasks SET status=?, updated_at=?" + (to === "completed" ? ", completed_at=?" : "") + " WHERE id=?").bind(...[to, at].concat(to === "completed" ? [at] : []), t.id).run();
      await act(D, { ...tw, kind: "approved", data: { label: dl.label, final: dl.is_final, note: note || undefined } });
      await act(D, { ...tw, kind: "status", data: { from: t.status, to } });
      toStudio(ctx, env, (dl.is_final ? "العميل وافق على التسليم النهائي " : "العميل وافق على النسخة " + dl.label + " ") + t.ref, u.name + " · " + t.title + (note ? "\n" + note : "") + (dl.is_final ? "\n\nأصبحت المهمة مكتملة." : "\n\nيمكنك تجهيز التسليم النهائي.") + "\n\n" + adminLink(t.ref));
      return json({ ok: true, status: to });
    }
    if (d.decision === "changes") {
      const points = cleanPoints(d.points); if (!points.length && !note) return json({ ok: false, error: "text" }, 400);
      // the studio's own notes on this version (internal or not) stay; the client's are added after them
      await D.prepare("UPDATE deliverables SET status='changes', points=?, decision_note=?, decided_at=?, decided_by=? WHERE id=?").bind(JSON.stringify(dl.points.filter(p => p.by === "studio").concat(points)), note, at, u.email, dl.id).run();
      await D.prepare("UPDATE tasks SET status='revision', updated_at=? WHERE id=?").bind(at, t.id).run();
      const round = (await D.prepare("SELECT COUNT(*) AS n FROM deliverables WHERE task_id=? AND status='changes'").bind(t.id).first()).n;
      await act(D, { ...tw, kind: "changes_requested", data: { label: dl.label, points: points.length, round, note: note || undefined } });
      await act(D, { ...tw, kind: "status", data: { from: t.status, to: "revision" } });
      later(ctx, forwardToTeam(env, t, dl.label, points, note));
      toStudio(ctx, env, "تعديلات مطلوبة على " + dl.label + " · " + t.ref + " (جولة " + round + ")", u.name + " · " + t.title + "\n\n" + points.map((x, i) => (i + 1) + ". " + (x.t ? "[" + x.t + "] " : "") + x.text).join("\n") + (note ? "\n\n" + note : "") + "\n\n" + adminLink(t.ref));
      return json({ ok: true, status: "revision", round });
    }
    return json({ ok: false }, 400);
  }
  if (d.action === "reply") {
    if (t.status !== "info") return json({ ok: false, error: "state" }, 409);
    const text = clip(d.text, 4000), links = cleanLinks(d.links); if (!text && !links.length) return json({ ok: false, error: "text" }, 400);
    await D.prepare("UPDATE tasks SET status='review', links=?, updated_at=? WHERE id=?").bind(JSON.stringify(t.links.concat(links).slice(0, 24)), at, t.id).run();
    await act(D, { ...tw, kind: "info_provided", data: { text, links } });
    await act(D, { ...tw, kind: "status", data: { from: "info", to: "review" } });
    toStudio(ctx, env, "ردّ العميل على طلب المعلومات " + t.ref, u.name + ": " + (text || "—") + "\n\n" + adminLink(t.ref));
    return json({ ok: true });
  }
  if (d.action === "dateChange") {
    if (!["accepted","progress","feedback","revision"].includes(t.status) || !t.confirmed_date) return json({ ok: false, error: "state" }, 409);
    if (t.change_request && t.change_request.status === "pending") return json({ ok: false, error: "pending" }, 409);
    const date = clip(d.date, 10); if (!isDate(date) || date < today()) return json({ ok: false, error: "date" }, 400);
    const cr = { date, reason: clip(d.reason, 1500), at, status: "pending" };
    await D.prepare("UPDATE tasks SET change_request=?, updated_at=? WHERE id=?").bind(JSON.stringify(cr), at, t.id).run();
    await act(D, { ...tw, kind: "date_change_requested", data: { date, reason: cr.reason, current: t.confirmed_date } });
    toStudio(ctx, env, "طلب تغيير موعد " + t.ref, u.name + " يطلب تغيير الموعد إلى " + date + " بدلاً من " + t.confirmed_date + (cr.reason ? "\nالسبب: " + cr.reason : "") + "\n\n" + adminLink(t.ref));
    return json({ ok: true });
  }
  if (d.action === "cancel") {
    if (!["new","review","info"].includes(t.status)) return json({ ok: false, error: "state" }, 409);
    await D.prepare("UPDATE tasks SET status='cancelled', updated_at=? WHERE id=?").bind(at, t.id).run();
    await act(D, { ...tw, kind: "status", data: { from: t.status, to: "cancelled" } });
    toStudio(ctx, env, "العميل ألغى المهمة " + t.ref, u.name + " ألغى «" + t.title + "» قبل القبول.");
    return json({ ok: true });
  }
  return json({ ok: false }, 400);
}

async function addComment(ctx, D, o){
  const body = clip(o.body, 4000), links = cleanLinks(o.links); if (!body && !links.length) return json({ ok: false, error: "text" }, 400);
  const p = o.project || { id: o.task.project_id, client_email: o.task.client_email, name: o.task.project_name }, at = now();
  if (o.client) { const n = (await D.prepare("SELECT COUNT(*) AS n FROM comments WHERE author=? AND created_at>=?").bind(o.author, today()).first()).n; if (n >= 80) return json({ ok: false, error: "too many attempts" }, 429); }
  const id = "c_" + randHex(6), taskId = o.task ? o.task.id : null;
  await D.prepare("INSERT INTO comments (id, scope, project_id, task_id, client_email, author, author_name, body, links, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(id, o.scope, p.id, taskId, p.client_email, o.author, o.author_name || "", body, JSON.stringify(links), at).run();
  await act(D, { actor: o.author, actor_name: o.author_name, client_email: p.client_email, project_id: p.id, task_id: taskId, kind: "comment", data: { scope: o.scope, text: excerpt(body, 140) } });
  const env = ctx.env, where = o.task ? "«" + o.task.title + "» " + o.task.ref : "نقاش مشروع «" + p.name + "»";
  if (o.client) toStudio(ctx, env, "تعليق جديد من " + o.author_name + " · " + (o.task ? o.task.ref : p.name), where + "\n\n" + body + "\n\n" + (o.task ? adminLink(o.task.ref) : SITE + "/admin/#tasks"));
  else {
    later(ctx, tellAdmin(ctx, env, o.task ? o.task : { client_email: p.client_email, ref: "", title: p.name }, "comment", { note: body, hash: o.task ? undefined : "#w/p/" + p.id + "/talk" })); }
  return json({ ok: true, id });
}
async function addFile(ctx, D, o){
  const d = o.d, url = clip(d.url, 600), title = clip(d.title, 140) || url.replace(/^https?:\/\//, "").slice(0, 60);
  if (!isUrl(url)) return json({ ok: false, error: "url" }, 400);
  if ((await D.prepare("SELECT COUNT(*) AS n FROM files WHERE project_id=? AND deleted_at IS NULL").bind(o.project.id).first()).n >= 300) return json({ ok: false, error: "too many" }, 429);
  const id = "f_" + randHex(6), cat = FILE_CATS.includes(d.category) ? d.category : "other";
  await D.prepare("INSERT INTO files (id, project_id, client_email, category, title, url, note, added_by, added_name, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(id, o.project.id, o.project.client_email, cat, title, url, clip(d.note, 1000), o.by, o.by_name || "", now()).run();
  await act(D, { actor: o.by, actor_name: o.by_name, client_email: o.project.client_email, project_id: o.project.id, kind: "file_added", data: { title, category: cat } });
  if (o.by === "studio") later(ctx, tellAdmin(ctx, ctx.env, { client_email: o.project.client_email, ref: "", title: o.project.name }, "file", { file: title, name: o.project.name, hash: "#w/p/" + o.project.id + "/files" }));
  else toStudio(ctx, ctx.env, "ملف جديد من " + o.by_name + " · " + o.project.name, title + "\n" + url);
  return json({ ok: true, id });
}

async function clientsList(env){ const out = [], N = await studioNames(env); let cursor;
  do { const r = await env.EB.list({ prefix: "user:", cursor }); for (const k of r.keys) { const v = await env.EB.get(k.name); if (!v) continue; const u = JSON.parse(v); if (u.role === "client") out.push({ email: u.email, name: N[u.email] || u.name, lang: u.lang || "ar" }); } cursor = r.list_complete ? null : r.cursor; } while (cursor);
  return out; }
// ==== client records (phase 9) ====
const CSTATUS = ["active","paused","archived"];
const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");
// every client's package, with this month's use and carried units (the Today page warns when one runs past it)
async function agreementsAll(D){ const o = {}, m = monthOf(now());
  for (const r of (await D.prepare("SELECT email, terms, carry FROM clients WHERE terms IS NOT NULL").all()).results) { try { const t = JSON.parse(r.terms), c = r.carry ? JSON.parse(r.carry) : {};
    t._used = (await usageOf(D, r.email, m)).used; t._carry = c[m] || {};
    // what no invoice covers yet, roughly: past package months (the running month is not «late» yet), approved extras, finished work outside the package
    const ub = await unbilledOf(D, r.email), past = ub.months.filter(x => !x.current);
    t._owed = { months: past.length, amount: amt(past.reduce((a, x) => a + x.remaining + x.over.reduce((b, v) => b + v.qty * v.price, 0), 0) + ub.extras.reduce((a, e) => a + e.items.reduce((b, x) => b + x.amount, 0), 0) + ub.units.reduce((a, u) => a + u.price, 0)), others: ub.others.length, credit: ub.credit };
    o[r.email] = t; } catch {} }
  return o; }
async function clientRow(D, email){ return D.prepare("SELECT * FROM clients WHERE email=?").bind(String(email || "").toLowerCase()).first(); }
async function ensureClients(D, list){   // a stable id for every client the studio works with (never overwrites what the studio wrote)
  const st = list.filter(x => x && isEmail(x.email)).map(x => D.prepare("INSERT OR IGNORE INTO clients (id, email, name, created_at, updated_at) VALUES (?,?,?,?,?)").bind("c_" + randHex(6), x.email.toLowerCase(), clip(x.name, 120), now(), now()));
  for (let i = 0; i < st.length; i += 50) await D.batch(st.slice(i, i + 50));
}
async function allUsers(env){ const out = [], N = await studioNames(env); let cursor;
  do { const r = await env.EB.list({ prefix: "user:", cursor });
    for (const k of r.keys) { const v = await env.EB.get(k.name); if (!v) continue; const u = JSON.parse(v);
      out.push({ email: u.email, name: (u.role === "client" && N[u.email]) || u.name, role: u.role === "client" ? "client" : "customer", lang: u.lang || "ar", created: u.createdAt || null, lastLogin: u.lastLogin || null, orders: (u.orders || []).length, clientSince: u.clientSince || null, pic: u.pic || null }); }
    cursor = r.list_complete ? null : r.cursor; } while (cursor && out.length < 3000);
  return out; }
async function clientsOverview(env, D){
  const users = await allUsers(env), td = today();
  await ensureClients(D, users.filter(u => u.role === "client").concat((await D.prepare("SELECT DISTINCT client_email AS email FROM projects").all()).results));
  const by = {}, row = e => (by[e] ||= { projects: 0, active_projects: 0, late_projects: 0, open_tasks: 0, new_tasks: 0, late_tasks: 0, done_tasks: 0, due_invoices: 0, overdue_invoices: 0, due: {}, paid: {}, last_activity: null, files: 0 });
  for (const r of (await D.prepare("SELECT client_email AS e, COUNT(*) AS n, SUM(status='active') AS a, SUM(status='active' AND end_date IS NOT NULL AND end_date<?) AS l FROM projects GROUP BY client_email").bind(td).all()).results) Object.assign(row(r.e), { projects: r.n, active_projects: r.a || 0, late_projects: r.l || 0 });
  for (const r of (await D.prepare(`SELECT client_email AS e, SUM(status IN (${OPEN.map(x => `'${x}'`).join(",")})) AS o, SUM(status='new') AS nw, SUM(status IN ('new','review','info','accepted','progress','revision') AND confirmed_date IS NOT NULL AND confirmed_date<?) AS l,
      SUM(status='completed') AS c, MAX(updated_at) AS u FROM tasks GROUP BY client_email`).bind(td).all()).results) { const x = row(r.e); x.open_tasks = r.o || 0; x.new_tasks = r.nw || 0; x.late_tasks = r.l || 0; x.done_tasks = r.c || 0; x.last_activity = r.u; }
  for (const i of (await D.prepare("SELECT * FROM invoices WHERE sent_at IS NOT NULL").all()).results.map(v => parseI(v))) { const x = row(i.client_email);
    if (["pending","partial","overdue"].includes(i.state)) { x.due_invoices++; x.due[i.currency] = money((x.due[i.currency] || 0) + i.balance); } if (i.state === "overdue") x.overdue_invoices++;
    if (i.status !== "cancelled") x.paid[i.currency] = money((x.paid[i.currency] || 0) + i.paid - (i.refunded || 0)); }
  for (const r of (await D.prepare("SELECT client_email AS e, MAX(at) AS a FROM activity WHERE client_email IS NOT NULL GROUP BY client_email").all()).results) { const x = row(r.e); if (!x.last_activity || r.a > x.last_activity) x.last_activity = r.a; }
  for (const r of (await D.prepare("SELECT client_email AS e, COUNT(*) AS n FROM files WHERE deleted_at IS NULL GROUP BY client_email").all()).results) row(r.e).files = r.n;
  const rows = (await D.prepare("SELECT id, email, name, company, phone, logo_url, status, created_at, updated_at, archived_at FROM clients").all()).results, U = {};
  users.forEach(u => U[u.email] = u);
  const emails = new Set(users.map(u => u.email).concat(rows.map(r => r.email)));
  const R = {}; rows.forEach(r => R[r.email] = r);
  return [...emails].map(e => { const r = R[e] || {}, u = U[e] || null, st = by[e] || row(e);
    return { id: r.id || null, email: e, name: r.name || (u && u.name) || "", company: r.company || "", phone: r.phone || "", logo_url: r.logo_url || (u && u.pic) || null, status: r.status || "active", archived_at: r.archived_at || null,
      added: r.created_at || (u && u.created), account: u ? { role: u.role, lang: u.lang, created: u.created, lastLogin: u.lastLogin, orders: u.orders, clientSince: u.clientSince } : null, ...st,
      last_activity: [st.last_activity, u && u.lastLogin].filter(Boolean).sort().pop() || r.updated_at || null }; });
}
async function adminGet(request, env, q){
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  const D = await db(env); if (!D) return json({ ok: false, error: "db" }, 503);
  const where = [], args = [];
  if (STATUSES.includes(q.get("status"))) { where.push("t.status=?"); args.push(q.get("status")); }
  if (q.get("client")) { where.push("t.client_email=?"); args.push(q.get("client").toLowerCase()); }
  if (q.get("project")) { where.push("t.project_id=?"); args.push(q.get("project")); }
  const tasks = (await D.prepare(`SELECT t.*, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY t.updated_at DESC LIMIT 500`).bind(...args).all()).results.map(parse);
  const projects = (await D.prepare(`SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status IN (${OPEN.map(s => `'${s}'`).join(",")})) AS open_tasks,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) AS all_tasks,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND substr(t.created_at,1,7)=? AND t.status NOT IN ('cancelled','rejected')) AS month_tasks FROM projects p ORDER BY p.updated_at DESC`).bind(monthOf(now())).all()).results.map(parseP);
  if (q.get("view") === "billing") {
    const invoices = (await D.prepare("SELECT i.*, p.name AS project_name FROM invoices i LEFT JOIN projects p ON p.id=i.project_id ORDER BY i.issue_date DESC, i.created_at DESC LIMIT 1000").all()).results.map(x => parseI(x));
    const projects = (await D.prepare("SELECT id, name, client_email, status, in_pkg FROM projects ORDER BY updated_at DESC").all()).results;
    return json({ ok: true, invoices, projects, agreements: await agreementsAll(D), clients: await clientsList(env), today: today() });
  }
  if (q.get("brandZip")) { const em = clip(q.get("brandZip"), 254).toLowerCase(), c = await clientRow(D, em), uu = await userOf(env, em);
    return brandZip(env, await brandKit(D, em), (c && (c.company || c.name)) || (uu && uu.name) || em.split("@")[0]); }
  if (q.get("creportDoc")) { const r = await D.prepare("SELECT * FROM client_reports WHERE id=?").bind(clip(q.get("creportDoc"), 20)).first(); if (!r) return htmlRes("not found", 404);
    const u = (await userOf(env, r.email)) || { email: r.email, name: "" }; return htmlRes(periodPage(JSON.parse(r.data), u, u.lang === "en" ? "en" : "ar", r.note)); }
  if (q.get("invoiceDoc")) { const x = await invoiceOf(D, q.get("invoiceDoc")); if (!x) return htmlRes("not found", 404);
    const u = (await userOf(env, x.client_email)) || { email: x.client_email, name: "" };
    return htmlRes(billPage(x, u, q.get("lang") === "en" ? "en" : q.get("lang") === "ar" ? "ar" : (u.lang === "en" ? "en" : "ar"), { project: x.project_name, email: (await siteSettings(env)).email })); }
  if (q.get("view") === "reports") {
    const tasks = (await D.prepare("SELECT t.id, t.ref, t.title, t.client_email, t.project_id, t.status, t.created_at, t.completed_at, t.confirmed_date, t.requested_date, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id").all()).results;
    const deliverables = (await D.prepare("SELECT task_id, status, is_final, created_at FROM deliverables").all()).results;
    const invoices = (await D.prepare("SELECT id, no, client_email, currency, total, paid, refunded, status, issue_date, due_date, payments, sent_at FROM invoices").all()).results.map(x => { x = parseI(x); delete x.items; return x; });
    const projects = (await D.prepare("SELECT id, name, client_email, status, quota, type FROM projects").all()).results;
    return json({ ok: true, today: today(), tasks, deliverables, invoices, projects, clients: await clientsList(env) });
  }
  if (q.get("view") === "clients") return json({ ok: true, today: today(), clients: await clientsOverview(env, D) });
  if (q.get("profile")) {
    const em = clip(q.get("profile"), 254).toLowerCase(), u0 = await userOf(env, em); let cr = await clientRow(D, em);
    if (!u0 && !cr) return json({ ok: false }, 404);
    if (!cr) { await ensureClients(D, [{ email: em, name: u0.name }]); cr = await clientRow(D, em); }
    const u = u0 || { name: cr.name, email: em, role: "none", lang: "ar" };
    const projects = (await D.prepare(`SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) AS all_tasks, (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status='completed') AS done_tasks,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status IN (${OPEN.map(x => `'${x}'`).join(",")})) AS open_tasks FROM projects p WHERE p.client_email=? ORDER BY p.updated_at DESC`).bind(em).all()).results.map(parseP);
    const tasks = (await D.prepare("SELECT t.id, t.ref, t.title, t.type, t.description, t.status, t.priority, t.requested_date, t.confirmed_date, t.completed_at, t.created_at, t.updated_at, t.created_by, t.over_quota, t.recurring, t.assignee, t.project_id, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.client_email=? ORDER BY t.updated_at DESC LIMIT 400").bind(em).all()).results;
    const files = (await D.prepare("SELECT f.id, f.project_id, f.task_id, f.category, f.title, f.url, f.note, f.added_by, f.added_name, f.created_at, p.name AS project_name FROM files f JOIN projects p ON p.id=f.project_id WHERE f.client_email=? AND f.deleted_at IS NULL ORDER BY f.created_at DESC LIMIT 400").bind(em).all()).results;
    const delivered = (await D.prepare("SELECT d.id, d.project_id, d.label, d.is_final, d.title, d.url, d.status, d.created_at, t.ref, t.title AS task_title, p.name AS project_name FROM deliverables d JOIN tasks t ON t.id=d.task_id JOIN projects p ON p.id=d.project_id WHERE d.client_email=? ORDER BY d.created_at DESC LIMIT 400").bind(em).all()).results;
    const invoices = (await D.prepare("SELECT i.*, p.name AS project_name FROM invoices i LEFT JOIN projects p ON p.id=i.project_id WHERE i.client_email=? ORDER BY i.issue_date DESC LIMIT 100").bind(em).all()).results.map(x => parseI(x));
    const activity = (await D.prepare("SELECT a.*, t.ref AS task_ref, p.name AS project_name FROM activity a LEFT JOIN tasks t ON t.id=a.task_id LEFT JOIN projects p ON p.id=a.project_id WHERE a.client_email=? ORDER BY a.id DESC LIMIT 250").bind(em).all()).results.map(parseA);
    const sends = (await D.prepare("SELECT channel, status, COUNT(*) AS n FROM notify_log WHERE recipient=? GROUP BY channel, status").bind(em).all()).results;
    const P = await prefsOf(D, em);
    const ag = await agreementOf(D, em), credits = (await D.prepare("SELECT * FROM credits WHERE email=? ORDER BY created_at DESC LIMIT 60").bind(em).all()).results;
    return json({ ok: true, client: cr, credits, credit: await creditOf(D, em), agreement: ag ? { ...ag.terms, carry: ag.carry, use: await usageOf(D, em, monthOf(now())), billed: await pkgBilledOf(D, em, monthOf(now()), ag.terms.price) } : null, account: !!u0, files, delivered, brand: await brandOf(D, em), today: today(), user: { name: u.name, email: u.email, role: u.role || "customer", clientSince: u.clientSince || null, clientVia: u.clientVia || null, lang: u.lang || "ar", created: u.created || u.createdAt || null, google: !!u.google, log: (u.log || []).slice(-20) },
      projects, tasks, invoices, activity, sends, prefs: { email_cats: P.email_cats, wa_cats: P.wa_cats, consent: P.consent, wa_phone: P.wa_phone ? "+" + P.wa_phone.replace(/\d(?=\d{4})/g, "•") : "", wa_consent_at: P.wa_consent_at, wa_withdrawn_at: P.wa_withdrawn_at } });
  }
  if (q.get("view") === "notify") {
    const inbox = (await D.prepare("SELECT * FROM notifications WHERE recipient='studio' ORDER BY id DESC LIMIT 60").all()).results.map(parseA);
    const where = [], args = [];
    if (["email","whatsapp","push","telegram"].includes(q.get("channel"))) { where.push("channel=?"); args.push(q.get("channel")); }
    if (["sent","failed","retry","skipped"].includes(q.get("status"))) { where.push("status=?"); args.push(q.get("status")); }
    const log = (await D.prepare(`SELECT id, at, channel, recipient, target, kind, status, attempts, error, next_try_at, delivery, (channel='email' AND payload IS NOT NULL) AS view FROM notify_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 200`).bind(...args).all()).results;
    const stats = (await D.prepare("SELECT channel, status, COUNT(*) AS n FROM notify_log WHERE at>=? GROUP BY channel, status").bind(new Date(Date.now() - 30 * 864e5).toISOString()).all()).results;
    const cfg = await waConfig(env);
    const scheduled = (await D.prepare("SELECT id, at, recipient, kind, t, extra FROM scheduled_sends WHERE sent_at IS NULL AND cancelled_at IS NULL ORDER BY at LIMIT 50").all()).results
      .map(r => { let t = {}, x = {}; try { t = JSON.parse(r.t); x = JSON.parse(r.extra); } catch {} return { id: r.id, at: r.at, recipient: r.recipient, kind: r.kind, title: t.title || x.no || "", ch: x.ch || null }; });
    const pending = (await D.prepare("SELECT id, rule, recipient, kind, title, sub, created_at FROM pending_sends WHERE done_at IS NULL ORDER BY id LIMIT 50").all()).results;
    const upcoming = ((await runRules(env, D, true, true)) || {}).sent || [];
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    return json({ ok: true, inbox, unread: (await D.prepare("SELECT COUNT(*) AS n FROM notifications WHERE recipient='studio' AND read_at IS NULL").first()).n, log, stats, scheduled, pending, upcoming,
      sent30: (await D.prepare("SELECT COUNT(*) AS n FROM notify_log WHERE at>=? AND status='sent'").bind(since).first()).n, retry: (await D.prepare("SELECT COUNT(*) AS n FROM notify_log WHERE status IN ('failed','retry')").first()).n,
      clientNames: Object.fromEntries((await D.prepare("SELECT email, name FROM clients").all()).results.map(c => [c.email, c.name])),
      consents: (await D.prepare("SELECT COUNT(*) AS n FROM notify_prefs WHERE wa_consent_at IS NOT NULL AND wa_withdrawn_at IS NULL").first()).n,
      wa: { config: cfg, ready: waReady(env, cfg), secrets: { token: !!env.WHATSAPP_TOKEN, phoneId: !!env.WHATSAPP_PHONE_ID, appSecret: !!env.WHATSAPP_APP_SECRET, verifyToken: !!env.WHATSAPP_VERIFY_TOKEN } },
      email: { ready: !!env.RESEND_API_KEY }, webhook: SITE + "/api/whatsapp", goBase: SITE + "/go/",
      tg: { token: !!tgTok(env), clients: await tgConf(env).then(c => c ? { bot: c.bot, at: c.at } : null), linked: (await D.prepare("SELECT COUNT(*) AS n FROM tg_links").first()).n },
      push: { devices: (await D.prepare("SELECT COUNT(*) AS n FROM push_subs").first()).n, clients: (await D.prepare("SELECT COUNT(DISTINCT email) AS n FROM push_subs").first()).n } });
  }
  if (q.get("space")) { const p = parseP(await D.prepare("SELECT * FROM projects WHERE id=?").bind(q.get("space")).first()); if (!p) return json({ ok: false }, 404);
    const recurring = (await D.prepare("SELECT * FROM recurring WHERE project_id=? ORDER BY active DESC, next_run").bind(p.id).all()).results;
    const sentReports = (await D.prepare("SELECT k, v FROM meta WHERE k LIKE ?").bind("rep:" + p.id + ":%").all()).results.map(r => ({ month: r.k.split(":").pop(), at: r.v }));
    return json({ ok: true, project: p, quota_used: await quotaUse(D, p.id), recurring, sentReports, ...(await spaceOf(D, p.id)) }); }
  if (q.get("report") || q.get("reportDoc")) { const p = await D.prepare("SELECT * FROM projects WHERE id=?").bind(clip(q.get("report") || q.get("reportDoc"), 40)).first(); if (!p) return json({ ok: false }, 404);
    const month = isMonth(q.get("month")) ? q.get("month") : monthOf(now()), R = await monthReport(D, p, month), u = (await userOf(env, p.client_email)) || { name: "" };
    return q.get("reportDoc") ? htmlRes(reportPage(R, u, q.get("lang") === "en" ? "en" : q.get("lang") === "ar" ? "ar" : (u.lang === "en" ? "en" : "ar"))) : json({ ok: true, report: R }); }
  let activity = [], deliverables = [], comments = [];
  if (q.get("task")) { const t = await D.prepare("SELECT id FROM tasks WHERE ref=?").bind(q.get("task")).first();
    if (t) { activity = (await D.prepare("SELECT * FROM activity WHERE task_id=? ORDER BY id DESC LIMIT 80").bind(t.id).all()).results.map(parseA); deliverables = await deliverablesOf(D, t.id); comments = await commentsOf(D, "task", t.id); } }
  const clients = await clientsList(env);
  const inboxUnread = (await D.prepare("SELECT COUNT(*) AS n FROM notifications WHERE recipient='studio' AND read_at IS NULL").first()).n;
  const pending = (await D.prepare("SELECT id, rule, recipient, kind, title, sub, created_at FROM pending_sends WHERE done_at IS NULL ORDER BY id LIMIT 50").all()).results;   // "ask me first" messages, for Today
  return json({ ok: true, tasks, projects, clients, agreements: await agreementsAll(D), activity, deliverables, comments, inboxUnread, pending, today: today() });
}

async function adminPost(ctx, d){
  const { env, request } = ctx;
  const D = await db(env); if (!D) return json({ ok: false, error: "db" }, 503);
  const at = now(), studio = { actor: "studio", actor_name: "Eyeblink Studio" };
  if (d.action === "recurring") {
    const p = await D.prepare("SELECT * FROM projects WHERE id=?").bind(clip(d.project_id, 40)).first(); if (!p) return json({ ok: false, error: "project" }, 404);
    const title = clip(d.title, 120); if (!title) return json({ ok: false, error: "title" }, 400);
    const every = d.every === "week" ? "week" : "month", dow = Math.max(0, Math.min(6, parseInt(d.dow) || 0)), dom = Math.max(1, Math.min(28, parseInt(d.dom) || 1)), dueDays = Math.max(0, Math.min(90, parseInt(d.due_days) || 5));
    const f = [title, clip(d.type, 60), clip(d.description, 3000), every, every === "week" ? dow : null, every === "month" ? dom : null, dueDays, d.active === false ? 0 : 1];
    if (d.id) {
      const r = await D.prepare("SELECT * FROM recurring WHERE id=?").bind(clip(d.id, 40)).first(); if (!r) return json({ ok: false }, 404);
      const nx = (r.every !== every || r.dow !== f[4] || r.dom !== f[5] || isDate(d.start)) ? firstRun(isDate(d.start) ? d.start : today(), every, dow, dom) : r.next_run;
      await D.prepare("UPDATE recurring SET title=?, type=?, description=?, every=?, dow=?, dom=?, due_days=?, active=?, next_run=?, updated_at=? WHERE id=?").bind(...f, nx, at, r.id).run();
      return json({ ok: true, id: r.id, next_run: nx });
    }
    const id = "r_" + randHex(6), nx = firstRun(d.start, every, dow, dom);
    await D.prepare("INSERT INTO recurring (id, project_id, client_email, title, type, description, every, dow, dom, due_days, active, next_run, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, p.id, p.client_email, ...f, nx, at, at).run();
    await act(D, { ...studio, client_email: p.client_email, project_id: p.id, kind: "recurring_added", data: { title, every } });
    return json({ ok: true, id, next_run: nx });
  }
  if (d.action === "recurringDelete") { await D.prepare("DELETE FROM recurring WHERE id=?").bind(clip(d.id, 40)).run(); return json({ ok: true }); }
  if (d.action === "recurringRun") { const r = await D.prepare("SELECT * FROM recurring WHERE id=?").bind(clip(d.id, 40)).first(); if (!r) return json({ ok: false }, 404);
    const ref = await runRecurring(ctx, env, D, r, today()); if (!ref) return json({ ok: false, error: "project closed" }, 409); return json({ ok: true, ref }); }
  if (d.action === "sendReport") { const p = await D.prepare("SELECT * FROM projects WHERE id=?").bind(clip(d.project, 40)).first(); if (!p) return json({ ok: false }, 404);
    const month = isMonth(d.month) ? d.month : prevMonth(); await sendReport(ctx, env, D, p, month); return json({ ok: true, month }); }
  if (d.action === "invoice") {
    const email = clip(d.client_email, 254).toLowerCase(), u = await userOf(env, email); if (!u && !(await clientRow(D, email))) return json({ ok: false, error: "no account" }, 404);
    const items = cleanItems(d.items); if (!items.length) return json({ ok: false, error: "items" }, 400);
    const PN = Object.fromEntries((await D.prepare("SELECT id, name FROM projects WHERE client_email=?").bind(email).all()).results.map(p => [p.id, p.name]));
    for (const i of items) { if (!PN[i.project]) i.project = ""; i.pname = i.project ? PN[i.project] : ""; if (!i.project) { delete i.project; delete i.pname; } }
    const ids = [...new Set(items.map(i => i.project).filter(Boolean))], scope = d.scope === "all" ? "all" : ids;
    const pid = d.scope !== "all" && ids.length === 1 ? ids[0] : (d.project_id && PN[d.project_id] && !ids.length ? clip(d.project_id, 40) : null);
    const cur = clip(d.currency, 8) || "$", disc = Math.max(0, money(d.discount)), sub = money(items.reduce((a, i) => a + i.unit * i.qty, 0)), total = Math.max(0, money(sub - disc));
    const issue = isDate(d.issue_date) ? d.issue_date : today(), due = isDate(d.due_date) ? d.due_date : null;
    if (due && due < issue) return json({ ok: false, error: "due" }, 400);
    const title = clip(d.title, 140), period = clip(d.period, 60), note = clip(d.note, 2000);
    if (d.id) {
      const x = await invoiceOf(D, d.id); if (!x) return json({ ok: false }, 404);
      if (x.status === "cancelled" || x.status === "refunded") return json({ ok: false, error: "state" }, 409);
      if (total + 0.009 < x.paid) return json({ ok: false, error: "below paid" }, 400);
      const st = x.paid > 0 ? (x.paid + 0.009 >= total ? "paid" : "partial") : "pending";
      await D.prepare("UPDATE invoices SET client_email=?, project_id=?, title=?, period=?, items=?, currency=?, discount=?, total=?, status=?, issue_date=?, due_date=?, note=?, reminded_at=CASE WHEN due_date IS ? THEN reminded_at ELSE NULL END, updated_at=? WHERE id=?")
        .bind(email, pid, title, period, JSON.stringify(items), cur, disc, total, st, issue, due, note, due, at, x.id).run();
      await D.prepare("UPDATE invoices SET scope=? WHERE id=?").bind(JSON.stringify(scope), x.id).run();
      await act(D, { ...studio, client_email: email, project_id: pid, kind: "invoice_updated", data: { no: x.no, total, cur } });
      if (d.send) { await D.prepare("UPDATE invoices SET sent_at=? WHERE id=?").bind(at, x.id).run(); later(ctx, invoiceMail(env, await invoiceOf(D, x.id), "invoice", ctx)); }
      return json({ ok: true, id: x.id, no: x.no });
    }
    const n = await newInvoice(env, "bill", total), id = "i_" + randHex(6);
    await D.prepare("INSERT INTO invoices (id, no, client_email, project_id, title, period, items, currency, discount, total, paid, refunded, status, issue_date, due_date, note, payments, sent_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,0,'pending',?,?,?,'[]',?,?,?)")
      .bind(id, n.no, email, pid, title, period, JSON.stringify(items), cur, disc, total, issue, due, note, d.send ? at : null, at, at).run();
    await D.prepare("UPDATE invoices SET scope=? WHERE id=?").bind(JSON.stringify(scope), id).run();
    // built from the work: the tasks and package months it covers can never be billed again; the annex lists the work inside the package
    const L = d.links && typeof d.links === "object" ? d.links : {}, tids = (Array.isArray(L.tasks) ? L.tasks : []).map(x => clip(x, 40)).slice(0, 400), months = (Array.isArray(L.months) ? L.months : []).filter(m => /^\d{4}-\d{2}$/.test(m)).slice(0, 60);
    for (const tid of tids) await D.prepare("UPDATE tasks SET invoice_id=? WHERE id=? AND client_email=? AND invoice_id IS NULL").bind(id, tid, email).run();
    for (const m of months) await D.prepare("INSERT OR IGNORE INTO pkg_billed (email, month, invoice_id) VALUES (?,?,?)").bind(email, m, id).run();
    const pk = (Array.isArray(L.pkg) ? L.pkg : []).slice(0, 24).map(x => ({ month: String(x && x.month || ""), amount: amt(x && x.amount), kind: x && x.kind === "over" ? "over" : "pkg" })).filter(x => /^\d{4}-\d{2}$/.test(x.month) && x.amount > 0);
    for (const x of pk) await D.prepare("INSERT INTO pkg_pay (invoice_id, email, month, amount, kind, created_at) VALUES (?,?,?,?,?,?)").bind(id, email, x.month, x.amount, x.kind, at).run();
    const annex = (Array.isArray(d.annex) ? d.annex : []).slice(0, 40).map(g => ({ k: clip(g.k, 80), items: (Array.isArray(g.items) ? g.items : []).slice(0, 200).map(x => x && typeof x === "object" ? { t: clip(x.t, 140), d: isDate(x.d) ? x.d : "" } : clip(x, 140)).filter(x => x && (x.t || typeof x === "string")) })).filter(g => g.items.length);
    let credit = Math.min(amt(d.credit), await creditOf(D, email), total); credit = credit > 0.009 ? amt(credit) : 0;
    await D.prepare("UPDATE invoices SET annex=?, links=? WHERE id=?").bind(annex.length ? JSON.stringify(annex) : null, JSON.stringify({ tasks: tids, months, pkg: pk, credit }), id).run();
    const pays0 = [], rc = d.received && typeof d.received === "object" ? d.received : null, rest = amt(total - credit);
    if (credit) { const en0 = u && u.lang === "en";
      await D.prepare("INSERT INTO credits (id, email, amount, currency, method, note, date, invoice_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind("cr_" + randHex(6), email, -credit, cur, "invoice", n.no, issue, id, at).run();
      pays0.push({ amount: credit, method: en0 ? "From your prepaid credit" : "من الرصيد المقدّم", credit: true, date: issue, at }); }
    if (rc && rest > 0.009) pays0.push({ amount: rest, method: clip(rc.method, 80), date: isDate(rc.date) ? rc.date : issue, note: "", at });
    if (pays0.length) { const paid0 = amt(pays0.reduce((a, p) => a + p.amount, 0));
      await D.prepare("UPDATE invoices SET paid=?, status=?, payments=? WHERE id=?").bind(paid0, paid0 + 0.009 >= total ? "paid" : "partial", JSON.stringify(pays0), id).run(); }
    await act(D, { ...studio, client_email: email, project_id: pid, kind: "invoice_issued", data: { no: n.no, total, cur, sent: !!d.send } });
    if (d.send) later(ctx, invoiceMail(env, await invoiceOf(D, id), "invoice", ctx));
    return json({ ok: true, id, no: n.no });
  }
  if (["invoicePay","invoiceUnpay","invoiceStatus","invoiceSend","invoiceRemind","invoiceDelete"].includes(d.action)) {
    const x = await invoiceOf(D, d.id); if (!x) return json({ ok: false }, 404);
    const save = async (patch, kind, data) => {
      const y = { ...x, ...patch }; await D.prepare("UPDATE invoices SET paid=?, refunded=?, status=?, payments=?, sent_at=?, updated_at=? WHERE id=?").bind(money(y.paid), money(y.refunded), y.status, JSON.stringify(y.payments), y.sent_at || null, at, x.id).run();
      await act(D, { ...studio, client_email: x.client_email, project_id: x.project_id, kind, data: { no: x.no, ...data } });
      return invoiceOf(D, x.id);
    };
    const byPaid = (paid) => paid > 0 ? (paid + 0.009 >= x.total ? "paid" : "partial") : "pending";
    if (d.action === "invoicePay") {
      if (x.status === "cancelled" || x.status === "refunded") return json({ ok: false, error: "state" }, 409);
      const amt = money(d.amount); if (amt <= 0) return json({ ok: false, error: "amount" }, 400); if (amt > x.balance + 0.009) return json({ ok: false, error: "too much" }, 400);
      const pay = { amount: amt, method: clip(d.method, 80), date: isDate(d.date) ? d.date : today(), note: clip(d.note, 300), at };
      const paid = money(x.paid + amt), y = await save({ paid, payments: x.payments.concat([pay]), status: byPaid(paid) }, "invoice_paid", { amount: amt, cur: x.currency });
      if (y.sent_at) later(ctx, invoiceMail(env, y, "invoicePaid", ctx));
      return json({ ok: true, status: y.state, balance: y.balance });
    }
    if (d.action === "invoiceUnpay") {
      const i = +d.index; if (!x.payments[i]) return json({ ok: false }, 404); if (x.status === "refunded") return json({ ok: false, error: "state" }, 409);
      const pays = x.payments.filter((_, k) => k !== i), paid = money(pays.reduce((a, p) => a + p.amount, 0));
      const y = await save({ paid, payments: pays, status: x.status === "cancelled" ? "cancelled" : byPaid(paid) }, "invoice_payment_removed", { amount: x.payments[i].amount, cur: x.currency });
      return json({ ok: true, status: y.state });
    }
    if (d.action === "invoiceStatus") {
      if (d.status === "cancelled") { const cash = x.payments.filter(p => !p.credit).reduce((a, p) => a + p.amount, 0); if (cash > 0) return json({ ok: false, error: "paid" }, 409);
        await releaseInvoice(D, x.id); const y = await save({ status: "cancelled", paid: 0, payments: [] }, "invoice_status", { to: "cancelled" }); return json({ ok: true, status: y.state }); }
      if (d.status === "refunded") { if (x.paid <= 0) return json({ ok: false, error: "nothing paid" }, 409); const amt = d.amount !== undefined && d.amount !== "" ? money(d.amount) : x.paid; if (amt <= 0 || amt > x.paid + 0.009) return json({ ok: false, error: "amount" }, 400);
        const y = await save({ status: "refunded", refunded: amt }, "invoice_status", { to: "refunded", amount: amt, cur: x.currency }); return json({ ok: true, status: y.state }); }
      if (d.status === "reopen") { if (x.status !== "cancelled" && x.status !== "refunded") return json({ ok: false, error: "state" }, 409); const y = await save({ status: byPaid(x.paid), refunded: 0 }, "invoice_status", { to: "reopened" }); return json({ ok: true, status: y.state }); }
      return json({ ok: false }, 400);
    }
    if (d.action === "invoiceRemind") { if (!["pending","partial"].includes(x.status) || !x.sent_at) return json({ ok: false, error: "state" }, 409);
      await D.prepare("UPDATE invoices SET reminded_at=? WHERE id=?").bind(at, x.id).run();
      await act(D, { ...studio, client_email: x.client_email, project_id: x.project_id, kind: "invoice_reminded", data: { no: x.no } });
      later(ctx, invoiceMail(env, x, "invoiceDue", ctx)); return json({ ok: true, scheduled: !!(ctx.notify && ctx.notify.at) }); }
    if (d.action === "invoiceSend") { if (x.status === "cancelled") return json({ ok: false, error: "state" }, 409); const y = await save({ sent_at: x.sent_at || at }, "invoice_sent", {}); later(ctx, invoiceMail(env, y, y.status === "paid" ? "invoicePaid" : "invoice", ctx)); return json({ ok: true }); }
    if (d.action === "invoiceDelete") { if (x.sent_at || x.payments.some(p => !p.credit)) return json({ ok: false, error: "sent" }, 409); await releaseInvoice(D, x.id); await D.prepare("DELETE FROM invoices WHERE id=?").bind(x.id).run(); return json({ ok: true }); }
  }
  if (d.action === "notifyPreview") {   // the send sheet: the exact e-mail, the WhatsApp text to copy, and which channels reach this client
    const kind = clip(d.kind, 20); let t, extra = {};
    if (d.pending) { const p = await D.prepare("SELECT * FROM pending_sends WHERE id=?").bind(+d.pending || 0).first(); if (!p) return json({ ok: false }, 404); t = JSON.parse(p.t); extra = JSON.parse(p.extra); }
    else if (d.creport) { const r = await D.prepare("SELECT * FROM client_reports WHERE id=?").bind(clip(d.creport, 20)).first(); if (!r) return json({ ok: false }, 404); ({ t, extra } = await reportArgs(env, D, r)); }
    else if (d.invoice) { const x = await invoiceOf(D, d.invoice); if (!x) return json({ ok: false }, 404); ({ t, extra } = invoiceArgs(x, kind)); }
    else if (d.ref) { const row = await D.prepare("SELECT * FROM tasks WHERE ref=? OR id=?").bind(clip(d.ref, 40), clip(d.ref, 40)).first(); if (!row) return json({ ok: false }, 404);
      const o = d.over || {}; t = { ...parse(row), ...(STATUSES.includes(o.status) ? { status: o.status } : {}), ...(isDate(o.confirmed_date) ? { confirmed_date: o.confirmed_date } : {}) };
      extra = { label: clip(d.label, 20), final: !!d.final, note: clip(d.note, 4000) };
      if (kind === "deliver" && !extra.label) extra.label = d.final ? "Final" : "V" + (((await D.prepare("SELECT MAX(version) AS v FROM deliverables WHERE task_id=?").bind(row.id).first()).v || 0) + 1); }
    else if (d.project) { const p = await D.prepare("SELECT * FROM projects WHERE id=?").bind(clip(d.project, 40)).first(); if (!p) return json({ ok: false }, 404);
      t = { client_email: p.client_email, ref: "", title: p.name }; extra = { id: p.id, name: p.name, file: clip(d.file, 120), note: clip(d.note, 4000), hash: "#w/p/" + p.id + (kind === "file" ? "/files" : kind === "comment" ? "/talk" : "") };
      if (kind === "report") { const month = isMonth(d.month) ? d.month : prevMonth(); Object.assign(extra, { report: await monthReport(D, p, month), month, hash: "#w/p/" + p.id + "/report/" + month }); } }
    else if (d.client) {   // something not created yet (a new project, task, invoice): the form's own values
      t = { client_email: String(d.client).toLowerCase().trim(), ref: "", title: clip(d.title, 120), confirmed_date: isDate(d.date) ? d.date : null, status: "accepted" }; extra = { name: clip(d.name, 120), id: "" }; }
    else return json({ ok: false }, 400);
    if (d.note !== undefined && extra.preport) extra.studioNote = clip(d.note, 600);
    const u = await userOf(env, t.client_email); if (!u) return json({ ok: true, account: false });
    const lang = u.lang === "en" ? "en" : "ar", en = lang === "en", hash = extra.hash || (kind === "project" ? "#w/p/" + extra.id : "#w/t/" + t.ref);
    if (!extra.to && (d.pid || t.ref)) extra = { ...extra, ...(await projWhere(D, d.pid, t.ref, en)) };
    if (+d.count > 1) extra.count = Math.min(30, Math.round(+d.count));
    t = { ...t, where: extra.w ? h(extra.w) : "" };
    const m = d.client && /^invoice/.test(kind) ? { subject: "", html: "" } : composeMail(u, t, kind, extra, hash); if (!m) return json({ ok: false, error: "kind" }, 400);
    if (d.client && / · $/.test(m.subject)) { const s2 = m.subject.slice(0, -3); m.html = m.html.split(h(m.subject)).join(h(s2)); m.subject = s2; }   // no task number before it exists
    const P = await prefsOf(D, u.email).catch(() => null), cfg = await waConfig(env), cl = await D.prepare("SELECT phone FROM clients WHERE email=?").bind(u.email).first();
    const devices = (await D.prepare("SELECT (SELECT COUNT(*) FROM push_subs WHERE email=?) + (SELECT COUNT(*) FROM tg_links WHERE email=?) AS n").bind(u.email, u.email).first()).n;
    const line = shortText(lang, kind, tellData(t, extra), ST_LABEL[lang], 700), link = SITE + (en ? "/en" : "") + "/workspace" + hash, first = String(u.name || "").trim().split(/\s+/)[0];
    const wa = (en ? "Hello" + (first ? " " + first : "") + "," : "مرحباً" + (first ? " " + first : "") + "،") + "\n\n*" + m.subject.replace(/\*/g, "") + "*\n" + line + "\n\n" + link + "\n\n" + (en ? "With our regards,\n*Eyeblink Studio*" : "مع خالص التقدير،\n*Eyeblink Studio*");
    return json({ ok: true, account: true, lang, name: u.name || "", subject: m.subject, html: m.html, wa, card: waCard(kind, t, extra, m.subject, line, en), phone: (P && P.wa_phone) || (cl && cl.phone) || "",
      channels: { email: !!(P ? (P.email_cats[CAT[kind] || "tasks"] || ESSENTIAL.includes(CAT[kind] || "tasks")) : true), push: devices > 0, wa: !!(P && P.consent && P.wa_phone && waReady(env, cfg)) },
      why: { email: P && !(P.email_cats[CAT[kind] || "tasks"] || ESSENTIAL.includes(CAT[kind] || "tasks")) ? "off" : "", push: devices > 0 ? "" : "none", wa: !waReady(env, cfg) ? "meta" : !(P && P.consent && P.wa_phone) ? "consent" : "" } });
  }
  if (d.action === "reportCfgGet" || d.action === "reportCfgSave") {
    const email = clip(d.email, 254).toLowerCase(); let row = await D.prepare("SELECT * FROM report_cfg WHERE email=?").bind(email).first();
    if (d.action === "reportCfgSave") { const every = [0, 7, 14, 30, 45, 60].includes(+d.every) ? +d.every : 0, dow = Math.max(0, Math.min(6, parseInt(d.dow) || 0));
      const pids = Array.isArray(d.projects) ? d.projects.map(x => clip(x, 40)).slice(0, 50) : "all", inc = {}; for (const k in RINC) inc[k] = d.inc && d.inc[k] ? 1 : 0;
      await D.prepare("INSERT INTO report_cfg (email, every, dow, mode, projects, inc, started, updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET every=excluded.every, dow=excluded.dow, mode=excluded.mode, projects=excluded.projects, inc=excluded.inc, started=COALESCE(report_cfg.started, excluded.started), updated_at=excluded.updated_at")
        .bind(email, every, dow, d.mode === "auto" ? "auto" : "ask", JSON.stringify(pids), JSON.stringify(inc), every ? gulf().toISOString().slice(0, 10) : null, at).run();
      row = await D.prepare("SELECT * FROM report_cfg WHERE email=?").bind(email).first(); }
    const c = rcfgOf(row, email), reports = (await D.prepare("SELECT id, from_d, to_d, sent_at, created_at, data FROM client_reports WHERE email=? ORDER BY created_at DESC LIMIT 30").bind(email).all()).results
      .map(r => { let n = {}; try { n = JSON.parse(r.data).nums; } catch {} return { id: r.id, from: r.from_d, to: r.to_d, sent_at: r.sent_at, nums: n }; });
    return json({ ok: true, cfg: c, next: rNext(c), reports, projects: (await D.prepare("SELECT id, name, type FROM projects WHERE client_email=? AND status!='archived' ORDER BY created_at").bind(email).all()).results });
  }
  if (d.action === "reportBuild") {   // "send a report now": from the day after the last one (or the last 30 days) to today
    const email = clip(d.email, 254).toLowerCase(), c = rcfgOf(await D.prepare("SELECT * FROM report_cfg WHERE email=?").bind(email).first(), email), td = gulf().toISOString().slice(0, 10);
    const from = isDate(d.from) ? d.from : c.last_to ? dAdd(c.last_to, 1) : dAdd(td, -30), to = isDate(d.to) ? d.to : td;
    if (from > to) return json({ ok: false, error: "range" }, 400);
    const r = await makeReport(env, D, email, from, to, c); return json({ ok: true, id: r.id });
  }
  if (d.action === "reportSend") { const r = await D.prepare("SELECT * FROM client_reports WHERE id=?").bind(clip(d.id, 20)).first(); if (!r) return json({ ok: false }, 404);
    const A = await reportArgs(env, D, r);
    await D.prepare("UPDATE report_cfg SET last_to=? WHERE email=? AND (last_to IS NULL OR last_to<?)").bind(r.to_d, r.email, r.to_d).run();
    later(ctx, tellAdmin(ctx, env, A.t, "periodReport", A.extra)); return json({ ok: true, scheduled: !!(ctx.notify && ctx.notify.at) }); }
  if (d.action === "rulesGet") return json({ ok: true, ...(await rulesOf(env)), defaults: RULES });
  if (d.action === "rulesSave") {
    const cur = await rulesOf(env), r = d.rules || {}, q = d.quiet || {}, rules = {};
    for (const k in RULES) { const v = r[k] || cur.rules[k]; rules[k] = { mode: String(v.mode || ""), days: parseInt(v.days) }; }
    await env.EB.put("rules", JSON.stringify({ rules, quiet: { from: parseInt(q.from ?? cur.quiet.from), to: parseInt(q.to ?? cur.quiet.to), fri: q.fri !== undefined ? !!q.fri : cur.quiet.fri }, digest: { ...cur.digest, ...(d.digest || {}) } }));
    return json({ ok: true, ...(await rulesOf(env)) });   // read back through the same checks
  }
  if (d.action === "rulesRun") return json({ ok: true, ...(await runRules(env, D, true)) });   // "check now", outside the hour and the quiet hours
  if (d.action === "pendingSend" || d.action === "pendingSkip") {
    const p = await D.prepare("SELECT * FROM pending_sends WHERE id=? AND done_at IS NULL").bind(+d.id || 0).first(); if (!p) return json({ ok: false, error: "gone" }, 404);
    await D.prepare("UPDATE pending_sends SET done_at=?, outcome=? WHERE id=?").bind(at, d.action === "pendingSend" ? "sent" : "skipped", p.id).run();
    await D.prepare("UPDATE rule_log SET outcome=?, at=? WHERE rule=? AND key=?").bind(d.action === "pendingSend" ? "sent" : "skipped", at, p.rule, p.key).run();
    if (d.action === "pendingSend") later(ctx, tellAdmin(ctx, env, JSON.parse(p.t), p.kind, JSON.parse(p.extra)));
    return json({ ok: true, scheduled: !!(ctx.notify && ctx.notify.at) });
  }
  if (d.action === "logView") { const r = await D.prepare("SELECT channel, payload FROM notify_log WHERE id=?").bind(+d.id || 0).first(); let p = null; try { p = JSON.parse(r && r.payload || "null"); } catch {}
    return p && p.html ? json({ ok: true, subject: p.subject, html: p.html }) : json({ ok: false, error: "gone" }, 404); }
  if (d.action === "scheduledNow") { const r = await D.prepare("SELECT * FROM scheduled_sends WHERE id=? AND sent_at IS NULL AND cancelled_at IS NULL").bind(+d.id || 0).first(); if (!r) return json({ ok: false, error: "gone" }, 404);
    await D.prepare("UPDATE scheduled_sends SET sent_at=? WHERE id=?").bind(at, r.id).run(); later(ctx, tellClient(env, JSON.parse(r.t), r.kind, JSON.parse(r.extra))); return json({ ok: true }); }
  if (d.action === "tplPreview") { const m = tplSample(clip(d.kind, 20), d.lang === "en" ? "en" : "ar"); return m ? json({ ok: true, ...m }) : json({ ok: false }, 400); }
  if (d.action === "digestPreview") { const m = digestMail(await digestData(env, D)); return json({ ok: true, ...m }); }
  if (d.action === "digestNow") return json({ ok: true, ...(await runDigest(env, D, true)) });
  if (d.action === "scheduledCancel") { await D.prepare("UPDATE scheduled_sends SET cancelled_at=? WHERE id=? AND sent_at IS NULL").bind(at, +d.id || 0).run(); return json({ ok: true }); }
  if (d.action === "studioRead") {
    if (d.all) await D.prepare("UPDATE notifications SET read_at=? WHERE recipient='studio' AND read_at IS NULL").bind(at).run();
    else for (const id of (Array.isArray(d.ids) ? d.ids : []).slice(0, 100).map(Number).filter(Number.isInteger)) await D.prepare("UPDATE notifications SET read_at=? WHERE id=? AND recipient='studio'").bind(at, id).run();
    return json({ ok: true });
  }
  if (d.action === "retryNotif") {
    const r = await D.prepare("SELECT * FROM notify_log WHERE id=?").bind(+d.id || 0).first(); if (!r) return json({ ok: false }, 404);
    if (r.status === "sent") return json({ ok: true, already: true });
    const res = await retryRow(env, D, r); return json({ ok: !!res.ok, error: res.error || res.skip || null });
  }
  if (d.action === "waConfig") {
    const c = { enabled: !!d.enabled, template: clip(d.template, 120).toLowerCase().replace(/[^a-z0-9_]/g, "") || "eyeblink_update", langAr: clip(d.langAr, 10).replace(/[^A-Za-z_]/g, "") || "ar",
      langEn: clip(d.langEn, 10).replace(/[^A-Za-z_]/g, "") || "en", button: d.button !== false, version: /^v\d{2}\.0$/.test(d.version || "") ? d.version : "v25.0" };
    await env.EB.put("wa:config", JSON.stringify(c)); return json({ ok: true, config: c });
  }
  if (d.action === "waTest") {
    const ph = normPhone(d.phone); if (!ph) return json({ ok: false, error: "phone" }, 400);
    const cfg = await waConfig(env), lang = d.lang === "en" ? "en" : "ar";
    const r = await waSend(env, cfg, ph, lang, { name: "Eyeblink", text: lang === "en" ? "This is a test message from your Eyeblink Studio setup." : "هذه رسالة تجريبية من إعدادات Eyeblink Studio.", path: lang === "en" ? "en/w" : "w" });
    await logSend(D, { channel: "whatsapp", recipient: "studio", target: ph, kind: "test", status: r.ok ? "sent" : r.skip ? "skipped" : "failed", error: r.error || r.skip, provider_id: r.id });
    return json({ ok: !!r.ok, error: r.error || r.skip || null, id: r.id || null });
  }
  if (d.action === "project") {
    const email = clip(d.client_email, 254).toLowerCase(), u = await userOf(env, email), cr = await clientRow(D, email);
    if (!u && !(cr && cr.status !== "archived")) return json({ ok: false, error: "no account" }, 404);
    if (u && u.role !== "client") return json({ ok: false, error: "not client" }, 409);
    if (!cr) await ensureClients(D, [{ email, name: u.name }]);
    const name = clip(d.name, 140); if (!name) return json({ ok: false, error: "name" }, 400);
    const f = { name, description: clip(d.description, 4000), type: PTYPES.includes(d.type) ? d.type : "custom", status: ["active","paused","completed","archived"].includes(d.status) ? d.status : "active",
      services: JSON.stringify((Array.isArray(d.services) ? d.services : []).slice(0, 12).map(s => clip(s, 60)).filter(Boolean)),
      start_date: isDate(d.start_date) ? d.start_date : null, end_date: isDate(d.end_date) ? d.end_date : null, quota: Number.isFinite(+d.quota) && +d.quota > 0 ? Math.min(999, Math.round(+d.quota)) : null,
      drive_url: isUrl(clip(d.drive_url, 600)) ? clip(d.drive_url, 600) : null, auto_report: d.auto_report ? 1 : 0 };
    if (d.id) {
      const p = await D.prepare("SELECT * FROM projects WHERE id=?").bind(clip(d.id, 40)).first(); if (!p) return json({ ok: false }, 404);
      await D.prepare("UPDATE projects SET client_email=?, name=?, description=?, type=?, status=?, services=?, start_date=?, end_date=?, quota=?, drive_url=?, auto_report=?, updated_at=? WHERE id=?")
        .bind(email, f.name, f.description, f.type, f.status, f.services, f.start_date, f.end_date, f.quota, f.drive_url, f.auto_report, at, p.id).run();
      await D.prepare("UPDATE projects SET cadence=? WHERE id=?").bind(cadenceOf(f.type, d.cadence), p.id).run();
      if (d.in_pkg !== undefined) await D.prepare("UPDATE projects SET in_pkg=? WHERE id=?").bind(d.in_pkg ? 1 : 0, p.id).run();
      await act(D, { ...studio, client_email: email, project_id: p.id, kind: "project_updated", data: { name: f.name, status: f.status } });
      return json({ ok: true, id: p.id });
    }
    const id = "p_" + randHex(6);
    await D.prepare("INSERT INTO projects (id, client_email, name, description, type, status, services, start_date, end_date, quota, drive_url, auto_report, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, email, f.name, f.description, f.type, f.status, f.services, f.start_date, f.end_date, f.quota, f.drive_url, f.auto_report, at, at).run();
    await D.prepare("UPDATE projects SET cadence=? WHERE id=?").bind(cadenceOf(f.type, d.cadence), id).run();
    if (d.in_pkg !== undefined) await D.prepare("UPDATE projects SET in_pkg=? WHERE id=?").bind(d.in_pkg ? 1 : 0, id).run();
    await act(D, { ...studio, client_email: email, project_id: id, kind: "project_created", data: { name: f.name } });
    later(ctx, tellAdmin(ctx, env, { client_email: email }, "project", { id, name: f.name }));
    return json({ ok: true, id });
  }
  if (d.action === "tgSetup") {
    if (!tgTok(env)) return json({ ok: false, error: "no token" }, 409);
    const me = await tgApi(env, "getMe"); if (!me.ok) return json({ ok: false, error: me.description || "telegram" }, 502);
    if (d.off) { await tgApi(env, "deleteWebhook", {}); await env.EB.delete("tg:clients"); return json({ ok: true, off: true }); }
    const secret = randHex(16), hook = new URL(request.url).origin + "/api/work?tg=hook";
    const r = await tgApi(env, "setWebhook", { url: hook, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
    if (!r.ok) return json({ ok: false, error: r.description || "webhook" }, 502);
    await env.EB.put("tg:clients", JSON.stringify({ bot: me.result.username, secret, at }));
    return json({ ok: true, bot: me.result.username, hook });
  }
  // the studio fills in or corrects a client's brand library (the same rules as the client's own save)
  if (d.action === "brandSave") {
    const em = clip(d.email, 254).toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return json({ ok: false, error: "email" }, 400);
    const hex = /^#[0-9a-f]{6}$/i;
    const colors = (Array.isArray(d.colors) ? d.colors : []).slice(0, 24).map(c => ({ name: clip(c && c.name, 40), hex: String(c && c.hex || "").trim().toUpperCase() })).filter(c => hex.test(c.hex));
    const fonts = (Array.isArray(d.fonts) ? d.fonts : []).slice(0, 12).map(f => ({ name: clip(f && f.name, 60), use: clip(f && f.use, 60) })).filter(f => f.name);
    await D.prepare("INSERT INTO brand_kits (email, colors, fonts, style, music, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET colors=excluded.colors, fonts=excluded.fonts, style=excluded.style, music=excluded.music, updated_at=excluded.updated_at")
      .bind(em, JSON.stringify(colors), JSON.stringify(fonts), clip(d.style, 1500), clip(d.music, 1500), now()).run();
    return json({ ok: true, brand: await brandOf(D, em) });
  }
  if (d.action === "brandAssetDel") {
    const a = await D.prepare("SELECT * FROM brand_assets WHERE id=? AND deleted_at IS NULL").bind(clip(d.id, 40)).first(); if (!a) return json({ ok: false }, 404);
    await D.prepare("UPDATE brand_assets SET deleted_at=? WHERE id=?").bind(now(), a.id).run();
    if (env.R2) await env.R2.delete(a.key).catch(() => {});
    return json({ ok: true });
  }
  if (d.action === "clientAvatar") {   // the studio sets or removes a client's photo (the same photo the client sets on their account page)
    const email = clip(d.email, 254).toLowerCase(); if (!isEmail(email)) return json({ ok: false, error: "email" }, 400);
    if (!(await userOf(env, email)) && !(await clientRow(D, email))) return json({ ok: false, error: "client" }, 404);
    const r = await setAvatar(env, email, d.data || null); return json(r, r.ok ? 200 : 400);
  }
  if (d.action === "clientSave") {
    const email = clip(d.email, 254).toLowerCase(); if (!isEmail(email)) return json({ ok: false, error: "email" }, 400);
    const name = clip(d.name, 120), old = await clientRow(D, email), u = await userOf(env, email);
    if (!old && !name && !u) return json({ ok: false, error: "name" }, 400);
    // the photo is set on its own (clientAvatar); a save without logo_url keeps it
    const logo = clip(d.logo_url, 600), f = { name: name || (old && old.name) || (u && u.name) || "", company: clip(d.company, 120), phone: clip(d.phone, 40), logo_url: d.logo_url === undefined ? ((old && old.logo_url) || (u && u.pic) || null) : (isUrl(logo) || logo.startsWith("/api/media/") ? logo : null), notes: clip(d.notes, 4000),
      status: CSTATUS.includes(d.status) ? d.status : (old ? old.status : "active") };
    if (old) await D.prepare("UPDATE clients SET name=?, company=?, phone=?, logo_url=?, notes=?, status=?, archived_at=?, updated_at=? WHERE id=?")
      .bind(f.name, f.company, f.phone, f.logo_url, f.notes, f.status, f.status === "archived" ? (old.archived_at || at) : null, at, old.id).run();
    else await D.prepare("INSERT INTO clients (id, email, name, company, phone, logo_url, notes, status, created_at, updated_at, archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind("c_" + randHex(6), email, f.name, f.company, f.phone, f.logo_url, f.notes, f.status, at, at, f.status === "archived" ? at : null).run();
    if (u && f.name && u.name !== f.name) { u.name = f.name; await env.EB.put("user:" + u.email, JSON.stringify(u)); }   // their account carries the same name
    await act(D, { ...studio, client_email: email, kind: old ? "client_updated" : "client_added", data: { name: f.name } });
    return json({ ok: true, id: (await clientRow(D, email)).id, account: !!u, role: u ? (u.role === "client" ? "client" : "customer") : null });
  }
  if (d.action === "purgePreview") {
    if (d.project) { const p = await D.prepare("SELECT * FROM projects WHERE id=?").bind(clip(d.project, 40)).first(); if (!p) return json({ ok: false }, 404);
      const n = async (sql) => ((await D.prepare(sql).bind(p.id).first()) || {}).n || 0;
      return json({ ok: true, project: { name: p.name, tasks: await n("SELECT COUNT(*) AS n FROM tasks WHERE project_id=?"), deliverables: await n("SELECT COUNT(*) AS n FROM deliverables WHERE project_id=?"),
        files: await n("SELECT COUNT(*) AS n FROM files WHERE project_id=?"), invoices: await n("SELECT COUNT(*) AS n FROM invoices WHERE project_id=?") } }); }
    const list = [].concat(d.emails || d.email || []).slice(0, 50).map(e => clip(e, 254).toLowerCase()).filter(Boolean), out = {};
    for (const e of list) out[e] = await purgeCounts(env, D, e);
    return json({ ok: true, counts: out });
  }
  if (d.action === "clientPurge") {   // permanent: the panel asks for the e-mail typed back (one) or the count (several)
    if (d.confirm !== true) return json({ ok: false, error: "confirm" }, 400);
    const list = [].concat(d.emails || []).slice(0, 50).map(e => clip(e, 254).toLowerCase()).filter(e => /@/.test(e));
    for (const e of list) await purgeClient(env, D, e);
    return json({ ok: true, deleted: list.length });
  }
  if (d.action === "projectPurge") {
    const p = await D.prepare("SELECT * FROM projects WHERE id=?").bind(clip(d.id, 40)).first(); if (!p) return json({ ok: false }, 404);
    if (d.mode === "archive") { await D.prepare("UPDATE projects SET status='archived', updated_at=? WHERE id=?").bind(at, p.id).run(); await act(D, { ...studio, client_email: p.client_email, project_id: p.id, kind: "project_archived", data: { name: p.name } }); return json({ ok: true }); }
    if (d.confirm !== true) return json({ ok: false, error: "confirm" }, 400);
    const n = await purgeProject(env, D, p.id); await act(D, { ...studio, client_email: p.client_email, kind: "project_deleted", data: { name: p.name, tasks: n } });
    return json({ ok: true });
  }
  if (d.action === "clientArchive") {
    const c = await clientRow(D, clip(d.email, 254)); if (!c) return json({ ok: false }, 404);
    const arch = d.archive !== false;
    await D.prepare("UPDATE clients SET status=?, archived_at=?, updated_at=? WHERE id=?").bind(arch ? "archived" : "active", arch ? at : null, at, c.id).run();
    await act(D, { ...studio, client_email: c.email, kind: arch ? "client_archived" : "client_restored", data: { name: c.name } });
    return json({ ok: true });
  }
  // a task's name, or the name of one delivered version (empty: the version shows the task's name again)
  if (d.action === "taskRename") { const title = clip(String(d.title || "").trim(), 140);
    if (d.deliverable) { const r = await D.prepare("UPDATE deliverables SET title=? WHERE id=?").bind(title, clip(d.deliverable, 40)).run(); return json({ ok: !!r.meta.changes }, r.meta.changes ? 200 : 404); }
    if (!title) return json({ ok: false, error: "title" }, 400);
    const r = await D.prepare("UPDATE tasks SET title=?, updated_at=? WHERE ref=?").bind(title, at, clip(d.task, 20)).run(); return json({ ok: !!r.meta.changes }, r.meta.changes ? 200 : 404); }
  if (d.action === "taskUnit" || d.action === "taskExtras") {
    const t = parse(await D.prepare("SELECT * FROM tasks WHERE ref=?").bind(clip(d.task, 20)).first()); if (!t) return json({ ok: false, error: "task" }, 404);
    const p = await D.prepare("SELECT in_pkg FROM projects WHERE id=?").bind(t.project_id).first(), ag = p && p.in_pkg !== 0 ? await agreementOf(D, t.client_email) : null, terms = ag && ag.terms;
    if (!terms) return json({ ok: false, error: "terms" }, 409);
    if (d.action === "taskUnit") { const un = terms.units.find(x => x.id === d.unit) || null;
      await D.prepare("UPDATE tasks SET unit=?, type=COALESCE(?, type), updated_at=? WHERE id=?").bind(un ? un.id : null, un ? un.name : null, at, t.id).run(); return json({ ok: true }); }
    if (t.extras && t.extras.state === "accepted") return json({ ok: false, error: "accepted" }, 409);   // the client already approved these: leave them be
    const un = terms.units.find(x => x.id === t.unit) || null, sec = Math.max(0, Math.min(36000, Math.round(+d.sec || 0)));
    const items = (Array.isArray(d.items) ? d.items : []).map(id => terms.extras.find(x => x.id === id)).filter(Boolean)
      .map(x => ({ id: x.id, name: x.name, ...extraCost(x, un, sec), ...(x.kind === "dur" ? { max: x.max } : {}) })).filter(x => x.amount > 0);
    const ex = items.length ? { items, cur: terms.cur, state: "pending", at } : null;
    await D.prepare("UPDATE tasks SET extras=?, updated_at=? WHERE id=?").bind(ex ? JSON.stringify(ex) : null, at, t.id).run();
    await act(D, { ...studio, client_email: t.client_email, project_id: t.project_id, task_id: t.id, kind: "extras_set", data: { ref: t.ref, total: items.reduce((a, x) => a + x.amount, 0) } });
    if (ex) later(ctx, tellAdmin(ctx, env, { client_email: t.client_email, ref: t.ref, title: t.title }, "extras",
      { note: items.map(x => x.name + (x.detail ? " (" + x.detail + ")" : "") + " · " + fmt(x.amount, terms.cur)).join("، ") }));
    return json({ ok: true, extras: ex });
  }
  // carrying unused units into a month, by hand: the panel offers what was left last month, the studio decides
  // the client's package itself, saved from their profile
  if (d.action === "unbilled") { const email = clip(d.email, 254).toLowerCase(); return json({ ok: true, ...(await unbilledOf(D, email)) }); }
  if (d.action === "creditAdd") {   // an advance («سلفة») the client sent before the work is done
    const email = clip(d.email, 254).toLowerCase(); if (!isEmail(email)) return json({ ok: false, error: "email" }, 400);
    const a = amt(d.amount); if (!(a > 0)) return json({ ok: false, error: "amount" }, 400);
    await D.prepare("INSERT INTO credits (id, email, amount, currency, method, note, date, invoice_id, created_at) VALUES (?,?,?,?,?,?,?,NULL,?)")
      .bind("cr_" + randHex(6), email, a, clip(d.currency, 8) || "$", clip(d.method, 80), clip(d.note, 300), isDate(d.date) ? d.date : today(), at).run();
    await act(D, { ...studio, client_email: email, kind: "credit_added", data: { amount: a, cur: clip(d.currency, 8) || "$" } });
    return json({ ok: true, credit: await creditOf(D, email) });
  }
  if (d.action === "creditDel") { const r = await D.prepare("SELECT * FROM credits WHERE id=? AND invoice_id IS NULL").bind(clip(d.id, 20)).first(); if (!r) return json({ ok: false }, 404);
    if (r.amount > (await creditOf(D, r.email)) + 0.009) return json({ ok: false, error: "used" }, 409);   // already spent on an invoice
    await D.prepare("DELETE FROM credits WHERE id=?").bind(r.id).run(); return json({ ok: true }); }
  if (d.action === "clientTerms") {
    const email = clip(d.email, 254).toLowerCase(); if (!isEmail(email)) return json({ ok: false, error: "email" }, 400);
    if (!(await clientRow(D, email))) { const u = await userOf(env, email); if (!u) return json({ ok: false, error: "client" }, 404); await ensureClients(D, [{ email, name: u.name }]); }
    await D.prepare("UPDATE clients SET terms=?, updated_at=? WHERE email=?").bind(cleanTerms(d.terms), at, email).run();
    await act(D, { ...studio, client_email: email, kind: "terms_set", data: { mode: d.terms && d.terms.mode || null } });
    return json({ ok: true });
  }
  // carrying unused units into a month, by hand, for the whole client: the panel offers what was left last month, the studio decides
  if (d.action === "carryInfo" || d.action === "carrySave") {
    const email = d.email ? clip(d.email, 254).toLowerCase() : ((await D.prepare("SELECT client_email FROM projects WHERE id=?").bind(clip(d.project, 40)).first()) || {}).client_email;
    const a = email && await agreementOf(D, email); if (!a || a.terms.mode !== "package") return json({ ok: false, error: "terms" }, 404);
    const month = /^\d{4}-\d{2}$/.test(d.month || "") ? d.month : monthOf(now()), pm = monthBefore(month);
    if (d.action === "carrySave") {
      const units = {}; for (const u of a.terms.units) { const n = Math.max(0, Math.min(999, Math.round(+((d.units || {})[u.id]) || 0))); if (n) units[u.id] = n; }
      const c = { ...(a.carry || {}), [month]: units }; Object.keys(c).sort().slice(0, -6).forEach(k => delete c[k]);   // the last six months are enough
      await D.prepare("UPDATE clients SET carry=?, updated_at=? WHERE email=?").bind(JSON.stringify(c), at, email).run();
      await act(D, { ...studio, client_email: email, kind: "carry_set", data: { month, units } });
      return json({ ok: true });
    }
    const used = (await usageOf(D, email, pm)).used, pc = carryOf(a, pm);
    return json({ ok: true, email, month, prev: pm, current: carryOf(a, month),
      units: a.terms.units.map(u => ({ id: u.id, name: u.name, left: Math.max(0, u.inc + (+pc[u.id] || 0) - (used[u.id] || 0)) })) });
  }
  // a clean start for billing (test invoices): every client invoice, and the invoices on requests (the requests stay); the numbering starts again.
  // preview first; with confirm a JSON copy goes to R2 before anything is removed
  if (d.action === "invoicesPurge") {
    const rows = (await D.prepare("SELECT * FROM invoices").all()).results, orders = [];
    await kvEach(env, "order:", async (k, o) => { if (o.invoice || (o.deposit && o.deposit.invoice)) orders.push([k, o]); });
    if (!d.confirm) return json({ ok: true, invoices: rows.length, orders: orders.length });
    if (env.R2) await env.R2.put("backups/purge/" + Date.now() + "-invoices.json", JSON.stringify({ at, invoices: rows, orders: orders.map(([k, o]) => ({ key: k, invoice: o.invoice || null, deposit: o.deposit || null })) })).catch(() => {});
    await D.prepare("DELETE FROM invoices").run();
    await D.batch([D.prepare("UPDATE tasks SET invoice_id=NULL WHERE invoice_id IS NOT NULL"), D.prepare("DELETE FROM pkg_billed"), D.prepare("DELETE FROM pkg_pay"), D.prepare("DELETE FROM credits WHERE invoice_id IS NOT NULL")]);
    for (const [k, o] of orders) { delete o.invoice; if (o.deposit) delete o.deposit.invoice; await env.EB.put(k, JSON.stringify(o)); }
    await D.prepare("CREATE TABLE IF NOT EXISTS seq (name TEXT PRIMARY KEY, n INTEGER NOT NULL)").run();
    await D.prepare("DELETE FROM seq WHERE name='inv'").run(); await env.EB.put("invseq", "0");
    return json({ ok: true, invoices: rows.length, orders: orders.length });
  }
  if (d.action === "monthBill") {
    const email = d.email ? clip(d.email, 254).toLowerCase() : ((await D.prepare("SELECT client_email FROM projects WHERE id=?").bind(clip(d.project, 40)).first()) || {}).client_email;
    const a = email && await agreementOf(D, email); if (!a) return json({ ok: false, error: "terms" }, 404);
    const month = /^\d{4}-\d{2}$/.test(d.month || "") ? d.month : monthOf(now()), c = await clientRow(D, email), u = await userOf(env, email);
    return json({ ok: true, email, project: "", cur: a.terms.cur, month, items: await monthLines(D, email, month),
      title: ((c && (c.company || c.name)) || (u && u.name) || email) + " · " + new Date(month + "-15T12:00:00Z").toLocaleDateString("ar-u-nu-latn", { month: "long", year: "numeric" }) });
  }
  if (d.action === "studioTask") {
    const p = d.project === SINGLE ? (isEmail(clip(d.client_email, 254).toLowerCase()) ? await singlesOf(D, clip(d.client_email, 254)) : null)
      : await D.prepare("SELECT * FROM projects WHERE id=?").bind(clip(d.project, 40)).first(); if (!p) return json({ ok: false, error: "project" }, 404);
    const title = clip(d.title, 140); if (!title) return json({ ok: false, error: "title" }, 400);
    const cd = clip(d.confirmed_date, 10); if (cd && !isDate(cd)) return json({ ok: false, error: "date" }, 400);
    // work already finished (before the client joined the workspace, or done off the platform): recorded as completed on its day,
    // so the reports count it in its period; the client is not notified about it
    const dd = d.done ? clip(d.done_date, 10) : ""; if (d.done && (!isDate(dd) || dd > today())) return json({ ok: false, error: "date" }, 400);
    const pr = PRIORITIES.includes(d.priority) ? d.priority : "normal", st = d.done ? "completed" : cd ? "accepted" : "review", born = d.done ? dd + "T12:00:00.000Z" : at;
    // several at once (4 posters, 3 episodes…): each its own task, named one by one or numbered after the title; with the unit of the client's package
    const n = Math.max(1, Math.min(30, Math.round(+d.count || 1))), names = Array.isArray(d.names) ? d.names.map(x => clip(x, 140)) : [];
    const ag = p.in_pkg !== 0 && d.unit ? await agreementOf(D, p.client_email) : null, un = ag && ag.terms.units.find(u => u.id === d.unit) || null;
    const refs = [];
    for (let i = 0; i < n; i++) {
      const id = "t_" + randHex(8), ref = await newRef(D), tt = names[i] || (n > 1 ? title + " " + (i + 1) : title);
      await D.prepare(`INSERT INTO tasks (id, ref, project_id, client_email, title, type, description, priority, confirmed_date, status, assignee, created_by, created_at, updated_at, completed_at, unit) VALUES (?,?,?,?,?,?,?,?,?,?,?,'studio',?,?,?,?)`)
        .bind(id, ref, p.id, p.client_email, tt, un ? un.name : clip(d.type, 60), clip(d.description, 4000), pr, cd || null, st, clip(d.assignee, 80) || null, born, born, d.done ? born : null, un ? un.id : null).run();
      await act(D, { ...studio, client_email: p.client_email, project_id: p.id, task_id: id, kind: "task_created", data: { ref, title: tt, by_studio: true, confirmed_date: cd || null, priority: pr, done_before: d.done ? dd : undefined } });
      refs.push(ref);
    }
    await D.prepare("UPDATE projects SET updated_at=? WHERE id=?").bind(at, p.id).run();
    // one message to the client, even for several tasks
    const all = Array.from({ length: n }, (_, i) => names[i] || (n > 1 ? title + " " + (i + 1) : title));
    if (!d.done) later(ctx, tellAdmin(ctx, env, { client_email: p.client_email, ref: refs[0], title: n > 1 ? all.slice(0, 4).join("، ") + (n > 4 ? "…" : "") : title, confirmed_date: cd || null, status: st }, "added", { count: n }));
    return json({ ok: true, ref: refs[0], refs });
  }
  if (d.action === "point" || d.action === "pointAdd") {
    const dl = parseD(await D.prepare("SELECT * FROM deliverables WHERE id=?").bind(clip(d.deliverable, 40)).first() || {}); if (!dl.id) return json({ ok: false }, 404);
    const aw = { ...studio, client_email: dl.client_email, project_id: dl.project_id, task_id: dl.task_id };
    if (d.action === "pointAdd") {
      const p = cleanPoints([{ t: d.t, text: d.text, kind: d.kind }])[0]; if (!p) return json({ ok: false, error: "text" }, 400);
      p.by = "studio"; p.at = at; if (d.internal) p.internal = true; dl.points.push(p);
      await D.prepare("UPDATE deliverables SET points=? WHERE id=?").bind(JSON.stringify(dl.points), dl.id).run();
      await act(D, { ...aw, kind: "point_added", data: { label: dl.label, t: p.t || undefined, internal: !!p.internal, kind: p.kind } });
      return json({ ok: true, points: dl.points });
    }
    const i = +d.index, p = dl.points[i]; if (!p) return json({ ok: false }, 404);
    const st = PT_ST.includes(d.status) ? d.status : d.done !== undefined ? (d.done ? "resolved" : "open") : null; if (!st) return json({ ok: false }, 400);
    const from = p.status || (p.done ? "resolved" : "open"); p.status = st; p.done = st === "resolved" || st === "na"; p.statusAt = at;
    await D.prepare("UPDATE deliverables SET points=? WHERE id=?").bind(JSON.stringify(dl.points), dl.id).run();
    if (from !== st) await act(D, { ...aw, kind: "point_status", data: { label: dl.label, t: p.t || undefined, text: p.text.slice(0, 80), from, to: st, internal: !!p.internal } });
    return json({ ok: true });
  }
  if (d.action === "removeComment" || d.action === "removeFile") {
    const tb = d.action === "removeComment" ? "comments" : "files", r = await D.prepare(`SELECT * FROM ${tb} WHERE id=? AND deleted_at IS NULL`).bind(clip(d.id, 40)).first();
    if (!r) return json({ ok: false }, 404);
    await D.prepare(`UPDATE ${tb} SET deleted_at=? WHERE id=?`).bind(at, r.id).run(); return json({ ok: true });
  }
  if (d.action === "studioFile" || (d.action === "studioComment" && d.scope === "project")) {
    const p = await D.prepare("SELECT * FROM projects WHERE id=?").bind(clip(d.project, 40)).first(); if (!p) return json({ ok: false, error: "project" }, 404);
    if (d.action === "studioFile") return addFile(ctx, D, { project: p, by: "studio", by_name: "Eyeblink Studio", d });
    return addComment(ctx, D, { scope: "project", project: p, author: "studio", author_name: "Eyeblink Studio", body: d.body, links: d.links });
  }
  const t = parse(await D.prepare("SELECT t.*, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.ref=?").bind(clip(d.task, 12)).first());
  if (!t) return json({ ok: false, error: "task" }, 404);
  const tw = { ...studio, client_email: t.client_email, project_id: t.project_id, task_id: t.id }, note = clip(d.note, 3000);
  if (d.action === "taskEdit") {
    const f = {}; if (d.title !== undefined) { f.title = clip(d.title, 140); if (!f.title) return json({ ok: false, error: "title" }, 400); }
    if (d.description !== undefined) f.description = clip(d.description, 4000); if (d.type !== undefined) f.type = clip(d.type, 60);
    if (d.priority !== undefined) { if (!PRIORITIES.includes(d.priority)) return json({ ok: false }, 400); f.priority = d.priority; }
    if (d.assignee !== undefined) f.assignee = clip(d.assignee, 80) || null;
    const k = Object.keys(f); if (!k.length) return json({ ok: true });
    await D.prepare(`UPDATE tasks SET ${k.map(x => x + "=?").join(", ")}, updated_at=? WHERE id=?`).bind(...k.map(x => f[x]), at, t.id).run();
    await act(D, { ...tw, kind: "task_edited", data: { ref: t.ref, title: f.title || t.title, fields: k } });
    return json({ ok: true });
  }
  if (d.action === "taskDelete") {
    await D.batch([D.prepare("DELETE FROM deliverables WHERE task_id=?").bind(t.id), D.prepare("DELETE FROM comments WHERE task_id=?").bind(t.id), D.prepare("UPDATE files SET task_id=NULL WHERE task_id=?").bind(t.id), D.prepare("DELETE FROM tasks WHERE id=?").bind(t.id)]);
    await act(D, { ...studio, client_email: t.client_email, project_id: t.project_id, kind: "task_deleted", data: { ref: t.ref, title: t.title } });
    await unlinkTeam(env, new Set([t.ref]));
    return json({ ok: true });
  }
  if (d.action === "studioComment") return addComment(ctx, D, { scope: "task", task: t, author: "studio", author_name: "Eyeblink Studio", body: d.body, links: d.links });
  if (d.action === "deliver") {
    if (!["accepted","progress","revision","feedback","final"].includes(t.status)) return json({ ok: false, error: "state" }, 409);
    const url = clip(d.url, 600); if (!isUrl(url)) return json({ ok: false, error: "url" }, 400);
    const v = ((await D.prepare("SELECT MAX(version) AS v FROM deliverables WHERE task_id=?").bind(t.id).first()).v || 0) + 1, fin = !!d.final, label = fin ? "Final" : "V" + v, to = fin ? "final" : "feedback";
    const id = "d_" + randHex(6);
    await D.prepare("UPDATE deliverables SET status='superseded' WHERE task_id=? AND status='sent'").bind(t.id).run();
    await D.prepare("INSERT INTO deliverables (id, task_id, project_id, client_email, version, label, is_final, title, url, links, note, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'sent',?)")
      .bind(id, t.id, t.project_id, t.client_email, v, label, fin ? 1 : 0, clip(d.title, 140), url, JSON.stringify(cleanLinks(d.links)), note, at).run();
    await D.prepare("UPDATE tasks SET status=?, updated_at=? WHERE id=?").bind(to, at, t.id).run();
    await act(D, { ...tw, kind: "delivered", data: { label, version: v, final: fin, note: note || undefined } });
    if (t.status !== to) await act(D, { ...tw, kind: "status", data: { from: t.status, to } });
    t.status = to; later(ctx, tellAdmin(ctx, env, t, "deliver", { label, final: fin, note }));
    return json({ ok: true, id, label });
  }
  const setStatus = async (to, extra) => {
    await D.prepare("UPDATE tasks SET status=?, studio_note=?, updated_at=?" + (to === "completed" ? ", completed_at=?" : "") + " WHERE id=?").bind(...[to, note || "", at].concat(to === "completed" ? [at] : []), t.id).run();
    await act(D, { ...tw, kind: "status", data: { from: t.status, to, note: note || undefined, ...(extra || {}) } });
    t.status = to;
  };
  if (d.action === "review") {
    if (d.decision === "review") { await setStatus("review"); return json({ ok: true }); }
    if (d.decision === "accept") {
      const cd = clip(d.confirmed_date, 10); if (!isDate(cd)) return json({ ok: false, error: "date" }, 400);
      await D.prepare("UPDATE tasks SET confirmed_date=? WHERE id=?").bind(cd, t.id).run(); t.confirmed_date = cd;
      await setStatus("accepted", { confirmed_date: cd });
      later(ctx, tellAdmin(ctx, env, t, "accept", { note })); return json({ ok: true });
    }
    if (d.decision === "info") { if (!note) return json({ ok: false, error: "note" }, 400); await setStatus("info"); later(ctx, tellAdmin(ctx, env, t, "info", { note })); return json({ ok: true }); }
    if (d.decision === "reject") { await setStatus("rejected"); later(ctx, tellAdmin(ctx, env, t, "reject", { note })); return json({ ok: true }); }
    return json({ ok: false }, 400);
  }
  if (d.action === "status") {
    if (!STATUSES.includes(d.status)) return json({ ok: false }, 400);
    if (d.status === "accepted" && !t.confirmed_date) return json({ ok: false, error: "date first" }, 400);
    if (d.status === t.status) return json({ ok: true });
    await setStatus(d.status);
    later(ctx, tellAdmin(ctx, env, t, d.status === "progress" ? "progress" : d.status === "completed" ? "completed" : "status", { note }));
    return json({ ok: true });
  }
  if (d.action === "date") {
    const cd = clip(d.confirmed_date, 10); if (!isDate(cd)) return json({ ok: false, error: "date" }, 400);
    if (cd === t.confirmed_date) return json({ ok: true });
    await D.prepare("UPDATE tasks SET confirmed_date=?, updated_at=? WHERE id=?").bind(cd, at, t.id).run();
    await act(D, { ...tw, kind: "date_changed", data: { from: t.confirmed_date, to: cd, note: note || undefined } });
    const had = !!t.confirmed_date; t.confirmed_date = cd;
    if (had) later(ctx, tellAdmin(ctx, env, t, "date", { note }));
    return json({ ok: true });
  }
  if (d.action === "dateDecision") {
    const cr = t.change_request; if (!cr || cr.status !== "pending") return json({ ok: false, error: "no request" }, 404);
    cr.status = d.approve ? "approved" : "declined"; cr.decidedAt = at;
    const to = d.approve ? (isDate(d.date) ? d.date : cr.date) : t.confirmed_date;
    await D.prepare("UPDATE tasks SET change_request=?, confirmed_date=?, updated_at=? WHERE id=?").bind(JSON.stringify(cr), to, at, t.id).run();
    await act(D, { ...tw, kind: "date_change_decided", data: { approved: !!d.approve, from: t.confirmed_date, to } });
    t.confirmed_date = to; later(ctx, tellAdmin(ctx, env, t, d.approve ? "date" : "dateNo", { note }));
    return json({ ok: true });
  }
  return json({ ok: false }, 400);
}
