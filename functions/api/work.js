import { same, isAdmin, json, randHex, currentUser, SITE, h, siteSettings, sendMail, telegram, greet, mail, notifyStudio, fmt, rows, newInvoice, later } from "../_lib/shared.js";
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
// (pending/partial past the due date), cancelled, refunded. Same numbering as the order invoices (KV "invseq").
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
const PTYPES = ["once","monthly","campaign","content","editing","motion","commercial","custom"];
const SCHEMA = [
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
function parse(t){ if (!t) return t; try { t.links = JSON.parse(t.links || "[]"); } catch { t.links = []; } try { t.brief = t.brief ? JSON.parse(t.brief) : null; } catch { t.brief = null; } try { t.change_request = t.change_request ? JSON.parse(t.change_request) : null; } catch { t.change_request = null; } return t; }
function parseP(p){ if (!p) return p; try { p.services = JSON.parse(p.services || "[]"); } catch { p.services = []; } return p; }
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
async function userOf(env, email){ const v = await env.EB.get("user:" + String(email || "").toLowerCase()); return v ? JSON.parse(v) : null; }
const adminLink = ref => SITE + "/admin/#tasks/" + ref;
const ST_LABEL = { ar:{ new:"طلب جديد", review:"قيد المراجعة", info:"بانتظار معلوماتك", accepted:"تم القبول", progress:"قيد التنفيذ", feedback:"بانتظار ملاحظاتك", revision:"تعديلات مطلوبة", final:"التسليم النهائي", completed:"مكتملة", rejected:"مرفوضة", cancelled:"ملغاة" },
                   en:{ new:"New request", review:"Under review", info:"Awaiting your information", accepted:"Accepted", progress:"In progress", feedback:"Awaiting your feedback", revision:"Revision requested", final:"Final delivery", completed:"Completed", rejected:"Rejected", cancelled:"Cancelled" } };
const fmtDate = (d, lang) => { try { return new Date(d + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-GB" : "ar-u-nu-latn", { weekday:"long", year:"numeric", month:"long", day:"numeric" }); } catch { return d; } };
// ==== extensions (phase 7) ====
const BRIEF_KEYS = ["goal","audience","format","duration","tone","message","cta","music"];
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
  const pr = later(ctx, tellClient(env, { client_email: p.client_email, ref, title, confirmed_date: due, status: "accepted" }, "recurring", {})); if (pr) await pr;   // the sweep has no waitUntil of its own
  return ref;
}
async function monthReport(D, p, month){
  const tasks = (await D.prepare("SELECT id, ref, title, status, created_at, completed_at, confirmed_date, over_quota, recurring FROM tasks WHERE project_id=?").bind(p.id).all()).results;
  const created = tasks.filter(t => monthOf(t.created_at) === month && !["cancelled","rejected"].includes(t.status));
  const done = tasks.filter(t => t.status === "completed" && monthOf(t.completed_at) === month);
  const dl = (await D.prepare("SELECT d.task_id, d.label, d.status, d.is_final, d.created_at FROM deliverables d WHERE d.project_id=?").bind(p.id).all()).results;
  const versions = dl.filter(x => monthOf(x.created_at) === month), rounds = versions.filter(x => x.status === "changes").length;
  const withDate = done.filter(t => t.confirmed_date), onTime = withDate.filter(t => String(t.completed_at).slice(0, 10) <= t.confirmed_date).length;
  const inv = (await D.prepare("SELECT no, title, currency, total, paid, status, due_date, issue_date, payments, sent_at FROM invoices WHERE project_id=? AND sent_at IS NOT NULL").bind(p.id).all()).results.map(x => parseI(x));
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
function reportPage(R, cl, lang){ return `<!doctype html><html lang="${lang === "en" ? "en" : "ar"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(R.project.name)} · ${R.month}</title>
<style>@page{size:A5;margin:9mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{margin:0;background:transparent}@media print{html,body{background:#fff}table{max-width:none!important;border:0!important}}</style></head><body>${reportHTML(R, cl, lang).replace(SITE + "/assets/img/", "/assets/img/")}</body></html>`; }
const prevMonth = () => { const x = new Date(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() - 1); return x.toISOString().slice(0, 7); };
async function sendReport(ctx, env, D, p, month){
  const R = await monthReport(D, p, month);
  await tellClient(env, { client_email: p.client_email, ref: "", title: p.name }, "report", { hash: "#w/p/" + p.id + "/report/" + month, report: R, name: p.name, month });
  await D.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind("rep:" + p.id + ":" + month, now()).run();
  return R;
}

// ==== billing (phase 6) ====
const money = n => Math.round((+n || 0) * 100) / 100;
const effStatus = (x, td) => ((x.status === "pending" || x.status === "partial") && x.due_date && x.due_date < td) ? "overdue" : x.status;
function parseI(x, td){ if (!x) return x; try { x.items = JSON.parse(x.items || "[]"); } catch { x.items = []; } try { x.payments = JSON.parse(x.payments || "[]"); } catch { x.payments = []; }
  x.state = effStatus(x, td || today()); x.balance = x.status === "cancelled" || x.status === "refunded" ? 0 : Math.max(0, money(x.total - x.paid)); return x; }
function cleanItems(list){ return (Array.isArray(list) ? list : []).slice(0, 30).map(i => ({ desc: clip(i && i.desc, 200), qty: Math.max(0.01, Math.min(9999, +(i && i.qty) || 1)), unit: money(i && i.unit) })).filter(i => i.desc); }
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
 ${x.items.map(i => `<tr><td style="${td}text-align:${s}">${h(i.desc)}</td><td style="${td}text-align:center;${nb}">${i.qty}</td><td style="${td}text-align:${e};color:${grey};${nb}">${fmt(i.unit, c)}</td><td style="${td}text-align:${e};${nb}">${fmt(i.unit * i.qty, c)}</td></tr>`).join("")}
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
<tr><td style="padding:16px 30px 24px;${F}font-size:11px;line-height:1.7;color:${grey};text-align:${s}">${L.note[st === "paid" ? "paid" : st === "cancelled" ? "cancelled" : st === "refunded" ? "refunded" : "open"]}</td></tr>
</table>`;
}
function billPage(x, cl, lang, opt){
  return `<!doctype html><html lang="${lang === "en" ? "en" : "ar"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(x.no)} · Eyeblink Studio</title>
<style>@page{size:A5;margin:9mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{margin:0;background:transparent}body{padding:0}
@media print{html,body{background:#fff}table{max-width:none!important;border:0!important}}</style></head><body>${billHTML(x, cl, lang, opt).replace(SITE + "/assets/img/", "/assets/img/")}</body></html>`;
}
const htmlRes = (t, st) => new Response(t, { status: st || 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "SAMEORIGIN" } });
async function invoiceOf(D, id){ return parseI(await D.prepare("SELECT i.*, p.name AS project_name FROM invoices i LEFT JOIN projects p ON p.id=i.project_id WHERE i.id=?").bind(clip(id, 40)).first()); }
function invoiceMail(env, x, kind){ const s = { client_email: x.client_email, ref: "", title: x.title || x.no };
  return tellClient(env, s, kind, { hash: "#w/invoices/" + x.id, inv: x, no: x.no, amount: fmt(x.total, x.currency), balance: fmt(x.balance, x.currency), paidNow: kind === "invoicePaid" && x.payments.length ? fmt(x.payments[x.payments.length - 1].amount, x.currency) : undefined, due: x.due_date }); }

// ==== client notifications (phase 5): one event → in-app + e-mail + WhatsApp, by the client's preferences ====
const CAT = { accept:"tasks", reject:"tasks", progress:"tasks", status:"tasks", date:"tasks", dateNo:"tasks", completed:"tasks", info:"requests", deliver:"deliveries", comment:"comments", project:"projects", file:"projects",
  invoice:"billing", invoicePaid:"billing", invoiceDue:"billing", recurring:"tasks", report:"projects", added:"tasks" };
const CATS = ["tasks","requests","deliveries","comments","projects","billing"];
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
function shortText(lang, kind, data, L){ const f = WA_TXT[lang][kind]; if (!f) return "";
  return oneLine(f({ ...data, dateText: data.date ? fmtDate(data.date, lang) : "—", dueText: data.due ? fmtDate(data.due, lang) : "", statusText: L[data.status] || data.status || "" }), 400); }
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
const WA_TXT = {
  ar: { accept: d => `قُبلت مهمة «${d.title}» (${d.ref})، وموعد التسليم المؤكد ${d.dateText}.`, info: d => `نحتاج إلى بعض المعلومات منك لبدء مهمة «${d.title}» (${d.ref}).`,
        reject: d => `بخصوص مهمة «${d.title}» (${d.ref}): تعذّر تنفيذها كما طُلبت، والسبب موضّح في مساحة العمل.`, progress: d => `بدأنا تنفيذ «${d.title}» (${d.ref}).`,
        status: d => `أصبحت حالة «${d.title}» (${d.ref}): ${d.statusText}.`, date: d => `أصبح موعد تسليم «${d.title}» (${d.ref}) ${d.dateText}.`, dateNo: d => `بقي موعد تسليم «${d.title}» (${d.ref}) ${d.dateText}.`,
        completed: d => `اكتملت مهمة «${d.title}» (${d.ref}). شكراً لك!`, deliver: d => d.final ? `التسليم النهائي لـ«${d.title}» (${d.ref}) جاهز للمراجعة.` : `النسخة ${d.label} من «${d.title}» (${d.ref}) جاهزة للمراجعة.`,
        comment: d => `تعليق جديد من الاستوديو على «${d.title}»${d.ref ? " (" + d.ref + ")" : ""}.`, project: d => `فتحنا لك مشروع «${d.name}» في مساحة العمل.`, file: d => `أضفنا ملف «${d.file}» إلى مشروع «${d.name}».`,
        invoice: d => `صدرت لك فاتورة جديدة ${d.no} بقيمة ${d.amount}${d.dueText ? "، وتاريخ استحقاقها " + d.dueText : ""}.`, invoicePaid: d => `وصلت دفعتك ${d.paidNow || ""} للفاتورة ${d.no}. شكراً لك!`,
        invoiceDue: d => `تذكير: الفاتورة ${d.no} تجاوزت تاريخ استحقاقها، والمبلغ المتبقي ${d.balance}.`,
        recurring: d => `أُضيفت مهمة «${d.title}» (${d.ref}) ضمن الجدول الدوري، وموعد تسليمها المؤكد ${d.dateText}.`, added: d => `أضاف الاستوديو مهمة «${d.title}» (${d.ref}) إلى مشروعك${d.date ? "، وموعد تسليمها المؤكد " + d.dateText : ""}.`, report: d => `التقرير الشهري لمشروع «${d.name}» جاهز.` },
  en: { accept: d => `Your task "${d.title}" (${d.ref}) is accepted. Confirmed delivery: ${d.dateText}.`, info: d => `We need a little more information to start "${d.title}" (${d.ref}).`,
        reject: d => `About "${d.title}" (${d.ref}): we can't take it as requested — the reason is in your workspace.`, progress: d => `We started working on "${d.title}" (${d.ref}).`,
        status: d => `"${d.title}" (${d.ref}) is now: ${d.statusText}.`, date: d => `The delivery date of "${d.title}" (${d.ref}) is now ${d.dateText}.`, dateNo: d => `The delivery date of "${d.title}" (${d.ref}) stays ${d.dateText}.`,
        completed: d => `"${d.title}" (${d.ref}) is complete. Thank you!`, deliver: d => d.final ? `The final delivery of "${d.title}" (${d.ref}) is ready for review.` : `Version ${d.label} of "${d.title}" (${d.ref}) is ready for review.`,
        comment: d => `New comment from the studio on "${d.title}"${d.ref ? " (" + d.ref + ")" : ""}.`, project: d => `We opened the project "${d.name}" in your workspace.`, file: d => `We added "${d.file}" to the files of "${d.name}".`,
        invoice: d => `A new invoice ${d.no} for ${d.amount} is ready${d.dueText ? ", due " + d.dueText : ""}.`, invoicePaid: d => `We received your payment ${d.paidNow || ""} for invoice ${d.no}. Thank you!`,
        invoiceDue: d => `Reminder: invoice ${d.no} is past its due date; ${d.balance} is still due.`,
        recurring: d => `"${d.title}" (${d.ref}) was added from your recurring schedule; confirmed delivery ${d.dateText}.`, added: d => `The studio added "${d.title}" (${d.ref}) to your project${d.date ? "; confirmed delivery " + d.dateText : ""}.`, report: d => `The monthly report for "${d.name}" is ready.` } };
async function tellClient(env, t, kind, extra){
  extra = extra || {};
  const u = await userOf(env, t.client_email); if (!u) return;
  const D = await db(env).catch(() => null), cat = CAT[kind] || "tasks", lang = u.lang === "en" ? "en" : "ar", en = lang === "en", L = ST_LABEL[lang];
  const hash = extra.hash || (kind === "project" ? "#w/p/" + extra.id : "#w/t/" + t.ref);
  const data = { title: t.title || "", ref: t.ref || "", date: t.confirmed_date || null, status: t.status || null, label: extra.label, final: extra.final || undefined, name: extra.name, file: extra.file, note: extra.note ? excerpt(extra.note, 160) : undefined,
    no: extra.no, amount: extra.amount, balance: extra.balance, paidNow: extra.paidNow, due: extra.due || undefined, month: extra.month };
  // 1) in-app — always on
  if (D) { try { await D.prepare("INSERT INTO notifications (recipient, kind, cat, link, data, created_at) VALUES (?,?,?,?,?,?)").bind(u.email, kind, cat, hash, JSON.stringify(data), now()).run(); } catch {} }
  const P = D ? await prefsOf(D, u.email).catch(() => null) : null, jobs = [];
  // 2) e-mail — unless the client switched this category off
  if (!P || P.email_cats[cat] || ESSENTIAL.includes(cat)) jobs.push((async () => {
  const T = {
    accept:  en ? ["Task accepted · " + t.ref, `<b style="color:#fff">${h(t.title)}</b> is accepted. Confirmed delivery date: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`]
                : ["قُبلت مهمتك · " + t.ref, `قبلنا مهمة <b style="color:#fff">${h(t.title)}</b>. موعد التسليم المؤكد: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`],
    info:    en ? ["We need a little more · " + t.ref, `To start <b style="color:#fff">${h(t.title)}</b> we need:`] : ["نحتاج إلى أمر بسيط منك · " + t.ref, `لنبدأ مهمة <b style="color:#fff">${h(t.title)}</b> نحتاج إلى ما يلي:`],
    reject:  en ? ["About your task · " + t.ref, `We can't take <b style="color:#fff">${h(t.title)}</b> as requested.`] : ["بخصوص مهمتك · " + t.ref, `تعذّر علينا تنفيذ مهمة <b style="color:#fff">${h(t.title)}</b> كما طُلبت.`],
    progress:en ? ["Work has started · " + t.ref, `We started working on <b style="color:#fff">${h(t.title)}</b>.`] : ["بدأ العمل · " + t.ref, `بدأنا تنفيذ <b style="color:#fff">${h(t.title)}</b>.`],
    date:    en ? ["New delivery date · " + t.ref, `The confirmed delivery date for <b style="color:#fff">${h(t.title)}</b> is now <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`]
                : ["موعد تسليم جديد · " + t.ref, `أصبح موعد التسليم المؤكد لمهمة <b style="color:#fff">${h(t.title)}</b> <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`],
    dateNo:  en ? ["About the date change · " + t.ref, `We kept the delivery date of <b style="color:#fff">${h(t.title)}</b> on <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`]
                : ["بخصوص تغيير الموعد · " + t.ref, `بقي موعد تسليم <b style="color:#fff">${h(t.title)}</b> كما هو: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`],
    completed: en ? ["Task completed · " + t.ref, `<b style="color:#fff">${h(t.title)}</b> is complete. Thank you!`] : ["اكتملت المهمة · " + t.ref, `اكتملت مهمة <b style="color:#fff">${h(t.title)}</b>. شكراً لك!`],
    status:  en ? ["Task update · " + t.ref, `<b style="color:#fff">${h(t.title)}</b> is now: <b style="color:#3FE0E8">${h(L[t.status] || t.status)}</b>.`] : ["تحديث على مهمتك · " + t.ref, `أصبحت حالة مهمة <b style="color:#fff">${h(t.title)}</b>: <b style="color:#3FE0E8">${h(L[t.status] || t.status)}</b>.`],
    deliver: en ? [(extra && extra.final ? "Final delivery is ready · " : "Version " + (extra && extra.label) + " is ready · ") + t.ref, `<b style="color:#fff">${h(t.title)}</b> — <b style="color:#3FE0E8">${h(extra && extra.label)}</b> is ready for you. Take a look and send us your approval or your notes.`]
                 : [(extra && extra.final ? "التسليم النهائي جاهز · " : "النسخة " + (extra && extra.label) + " جاهزة · ") + t.ref, `<b style="color:#fff">${h(t.title)}</b> — النسخة <b style="color:#3FE0E8">${h(extra && extra.label)}</b> جاهزة. اطّلع عليها وأرسل إلينا موافقتك أو ملاحظاتك.`],
    comment: en ? ["New comment from the studio" + (t.ref ? " · " + t.ref : ""), `On <b style="color:#fff">${h(t.title)}</b>:`] : ["تعليق جديد من الاستوديو" + (t.ref ? " · " + t.ref : ""), `على <b style="color:#fff">${h(t.title)}</b>:`],
    invoice: en ? ["Invoice " + extra.no + " · Eyeblink Studio", `Your invoice <b style="color:#fff">${h(extra.no)}</b> for <b style="color:#3FE0E8">${h(extra.amount)}</b> is below${extra.due ? ", due <b style=\"color:#fff\">" + h(fmtDate(extra.due, lang)) + "</b>" : ""}.`]
                 : ["فاتورة " + extra.no + " · Eyeblink Studio", `تجد أدناه فاتورتك <b style="color:#fff">${h(extra.no)}</b> بقيمة <b style="color:#3FE0E8">${h(extra.amount)}</b>${extra.due ? "، وتاريخ استحقاقها <b style=\"color:#fff\">" + h(fmtDate(extra.due, lang)) + "</b>" : ""}.`],
    invoicePaid: en ? ["Payment received · " + extra.no, `We received <b style="color:#3FE0E8">${h(extra.paidNow || "")}</b> for invoice <b style="color:#fff">${h(extra.no)}</b>. Thank you! The updated invoice is below.`]
                    : ["وصلت دفعتك · " + extra.no, `وصلتنا دفعتك <b style="color:#3FE0E8">${h(extra.paidNow || "")}</b> للفاتورة <b style="color:#fff">${h(extra.no)}</b>. شكراً لك! تجد الفاتورة المحدّثة أدناه.`],
    invoiceDue: en ? ["Reminder: invoice " + extra.no, `Invoice <b style="color:#fff">${h(extra.no)}</b> is past its due date. The balance due is <b style="color:#3FE0E8">${h(extra.balance)}</b>.`]
                   : ["تذكير بالفاتورة " + extra.no, `تجاوزت الفاتورة <b style="color:#fff">${h(extra.no)}</b> تاريخ استحقاقها، والمبلغ المتبقي <b style="color:#3FE0E8">${h(extra.balance)}</b>.`],
    recurring: en ? ["Recurring task added · " + t.ref, `<b style="color:#fff">${h(t.title)}</b> was added from your recurring schedule. Confirmed delivery date: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`]
                  : ["مهمة دورية جديدة · " + t.ref, `أُضيفت مهمة <b style="color:#fff">${h(t.title)}</b> ضمن الجدول الدوري المتفق عليه. موعد التسليم المؤكد: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`],
    added:   en ? ["New task from the studio · " + t.ref, `The studio added <b style="color:#fff">${h(t.title)}</b> to your project${t.confirmed_date ? `. Confirmed delivery date: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>` : ""}.`]
                 : ["مهمة جديدة من الاستوديو · " + t.ref, `أضاف الاستوديو مهمة <b style="color:#fff">${h(t.title)}</b> إلى مشروعك${t.confirmed_date ? `. موعد التسليم المؤكد: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>` : ""}.`],
    report:  en ? ["Monthly report · " + (extra.name || ""), `Here is the monthly report for <b style="color:#fff">${h(extra.name || "")}</b>.`] : ["التقرير الشهري · " + (extra.name || ""), `تجد أدناه التقرير الشهري لمشروع <b style="color:#fff">${h(extra.name || "")}</b>.`],
    file:    en ? ["New file in " + (extra && extra.name), `The studio added <b style="color:#fff">${h(extra && extra.file)}</b> to the files of <b style="color:#fff">${h(extra && extra.name)}</b>.`]
                 : ["ملف جديد في مشروع " + (extra && extra.name), `أضاف الاستوديو ملف <b style="color:#fff">${h(extra && extra.file)}</b> إلى ملفات مشروع <b style="color:#fff">${h(extra && extra.name)}</b>.`],
    project: en ? ["New project in your workspace", `The studio opened <b style="color:#fff">${h(extra && extra.name)}</b> for you. You can send tasks to it from your workspace.`]
                : ["مشروع جديد في مساحة العمل", `فتح لك الاستوديو مشروع <b style="color:#fff">${h(extra && extra.name)}</b>، ويمكنك إرسال مهامك إليه من مساحة العمل.`],
  }[kind]; if (!T) return;
    const note = extra.note ? `<p style="margin:14px 0 0;padding:12px 14px;border-radius:12px;background:#121a48;color:#DCE3F0">${h(extra.note).replace(/\n/g, "<br>")}</p>` : "";
    const invHtml = extra.inv ? `<div style="margin:18px 0 0">${billHTML(extra.inv, u, lang, { project: extra.inv.project_name })}</div>` : extra.report ? `<div style="margin:18px 0 0">${reportHTML(extra.report, u, lang)}</div>` : "";
    const subject = T[0], html = mail(lang, T[0], `<p style="margin:0">${T[1]}</p>` + note + invHtml, en ? "Open in my workspace" : "افتح في مساحة العمل", SITE + (en ? "/en" : "") + "/workspace" + hash, greet({ name: u.name, lang }));
    const r = await mailSend(env, u.email, subject, html);
    await logSend(D, { channel: "email", recipient: u.email, target: u.email, kind, status: r.ok ? "sent" : r.skip ? "skipped" : r.retry ? "retry" : "failed", error: r.error || r.skip, next: r.retry ? nextTry(1) : null, provider_id: r.id, payload: r.ok || r.skip ? null : { to: u.email, subject, html } });
  })());
  // 3) WhatsApp — only with explicit consent, a confirmed number, the category on, and the studio's WhatsApp switched on
  if (P && P.consent && P.wa_cats[cat]) jobs.push((async () => {
    const cfg = await waConfig(env); if (!waReady(env, cfg)) return;
    const f = WA_TXT[lang][kind]; if (!f) return;
    const text = oneLine(f({ ...data, dateText: data.date ? fmtDate(data.date, lang) : "—", dueText: data.due ? fmtDate(data.due, lang) : "", statusText: L[data.status] || data.status || "" }), 700);
    const pl = { name: oneLine(u.name, 60), text, path: (en ? "en/" : "") + hash.replace(/^#w\/?/, "") };
    const r = await waSend(env, cfg, P.wa_phone, lang, pl);
    await logSend(D, { channel: "whatsapp", recipient: u.email, target: P.wa_phone, kind, status: r.ok ? "sent" : r.skip ? "skipped" : r.retry ? "retry" : "failed", error: r.error || r.skip, next: r.retry ? nextTry(1) : null, provider_id: r.id, payload: r.ok ? null : { phone: P.wa_phone, lang, p: pl } });
  })());
  // 4) this device (Web Push) — every device the client switched on, for the categories left on
  if (D && (!P || P.push_cats[cat])) jobs.push((async () => {
    const subs = (await D.prepare("SELECT * FROM push_subs WHERE email=?").bind(u.email).all()).results; if (!subs.length) return;
    const body = shortText(lang, kind, data, L); if (!body) return;
    const url = SITE + (en ? "/en" : "") + "/workspace" + hash;
    for (const sub of subs) { const r = await pushSend(D, sub, { title: "Eyeblink Studio", body, url, tag: (t.ref || kind), lang, dir: en ? "ltr" : "rtl" }).catch(e => ({ ok: false, error: String(e).slice(0, 120) }));
      await logSend(D, { channel: "push", recipient: u.email, target: new URL(sub.endpoint).hostname, kind, status: r.ok ? "sent" : "failed", error: r.error }); }
  })());
  // 5) Telegram — once the client linked their chat with the studio's bot
  if (D && (!P || P.tg_cats[cat])) jobs.push((async () => {
    const link = await D.prepare("SELECT * FROM tg_links WHERE email=?").bind(u.email).first(); if (!link || !tgTok(env)) return;
    const body = shortText(lang, kind, data, L); if (!body) return;
    const r = await tgSend(env, link.chat_id, "✦ Eyeblink Studio\n\n" + body, SITE + (en ? "/en" : "") + "/workspace" + hash, en ? "Open in my workspace" : "افتح في مساحة العمل");
    await logSend(D, { channel: "telegram", recipient: u.email, target: link.username ? "@" + link.username : "chat", kind, status: r.ok ? "sent" : "failed", error: r.error, provider_id: r.id });
  })());
  await Promise.allSettled(jobs);
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
    .bind(st, n, res.ok ? null : (res.error || res.skip || null), st === "retry" ? nextTry(n) : null, res.id || null, res.ok ? null : r.payload, r.id).run();
  return res;
}
async function sweepNotify(env){ try {
  const D = await db(env); if (!D) return;
  const last = await D.prepare("SELECT v FROM meta WHERE k='nsweep'").first(); if (last && Date.now() - +last.v < 300000) return;
  await D.prepare("INSERT INTO meta (k, v) VALUES ('nsweep', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(Date.now())).run();
  const rows = (await D.prepare("SELECT * FROM notify_log WHERE status='retry' AND next_try_at<=? ORDER BY id LIMIT 10").bind(now()).all()).results;
  for (const r of rows) await retryRow(env, D, r);
  // one reminder per invoice once it passes its due date
  const due = (await D.prepare("SELECT i.*, p.name AS project_name FROM invoices i LEFT JOIN projects p ON p.id=i.project_id WHERE i.status IN ('pending','partial') AND i.due_date<? AND i.reminded_at IS NULL AND i.sent_at IS NOT NULL LIMIT 10").bind(today()).all()).results;
  for (const x of due) { await D.prepare("UPDATE invoices SET reminded_at=? WHERE id=?").bind(now(), x.id).run(); await invoiceMail(env, parseI(x), "invoiceDue"); }
  // recurring tasks whose date has come
  const rec = (await D.prepare("SELECT * FROM recurring WHERE active=1 AND next_run<=? LIMIT 10").bind(today()).all()).results;
  for (const r of rec) await runRecurring({}, env, D, r, r.next_run);
  // monthly reports switched to automatic: during the first days of the month, once per project
  if (new Date().getUTCDate() <= 5) { const pm = prevMonth();
    const auto = (await D.prepare("SELECT p.* FROM projects p WHERE p.auto_report=1 AND p.status='active' AND NOT EXISTS (SELECT 1 FROM meta m WHERE m.k='rep:'||p.id||':'||?) LIMIT 5").bind(pm).all()).results;
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
    projects: (await D.prepare(`SELECT id, name, type, status FROM projects WHERE id IN ${MINE} ORDER BY name`).bind(e).all()).results });
  if (q.get("view") === "notifications") return json({ ok: true, unread: await unreadN(), items: (await D.prepare("SELECT * FROM notifications WHERE recipient=? ORDER BY id DESC LIMIT 40").bind(e).all()).results.map(parseA) });
  if (q.get("report") || q.get("reportDoc")) {
    const p = await myProject(D, e, clip(q.get("report") || q.get("reportDoc"), 40)); if (!p) return q.get("reportDoc") ? htmlRes("not found", 404) : json({ ok: false }, 404);
    const month = isMonth(q.get("month")) ? q.get("month") : monthOf(now()), R = await monthReport(D, p, month);
    return q.get("reportDoc") ? htmlRes(reportPage(R, u, u.lang === "en" ? "en" : "ar")) : json({ ok: true, report: R });
  }
  if (q.get("view") === "invoices") return json({ ok: true, invoices: (await D.prepare("SELECT i.*, p.name AS project_name FROM invoices i LEFT JOIN projects p ON p.id=i.project_id WHERE i.client_email=? AND i.sent_at IS NOT NULL ORDER BY i.issue_date DESC, i.created_at DESC LIMIT 200").bind(e).all()).results.map(x => parseI(x)) });
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
    return json({ ok: true, me: e, project: p, tasks, activity, quota_used: await quotaUse(D, p.id), recurring, ...(await spaceOf(D, p.id)) });
  }
  if (q.get("task")) {
    const t = cparse(await myTask(D, e, q.get("task"))); if (!t) return json({ ok: false }, 404);
    const activity = (await D.prepare("SELECT * FROM activity WHERE task_id=? ORDER BY id DESC LIMIT 80").bind(t.id).all()).results.map(parseA).filter(a => !(a.data && a.data.internal));
    return json({ ok: true, me: e, task: t, activity, deliverables: forClient(await deliverablesOf(D, t.id)), comments: await commentsOf(D, "task", t.id) });
  }
  const projects = (await D.prepare(`SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status IN (${open})) AS open_tasks,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status='completed') AS done_tasks,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND substr(t.created_at,1,7)=?2 AND t.status NOT IN ('cancelled','rejected')) AS month_tasks FROM projects p WHERE p.id IN ${MINE} ORDER BY p.status='active' DESC, p.updated_at DESC`).bind(e, monthOf(now())).all()).results.map(parseP);
  const counts = {}; for (const r of (await D.prepare(`SELECT status, COUNT(*) AS n FROM tasks WHERE project_id IN ${MINE} GROUP BY status`).bind(e).all()).results) counts[r.status] = r.n;
  const tasks = (await D.prepare(`SELECT t.*, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.project_id IN ${MINE} ORDER BY t.updated_at DESC LIMIT 12`).bind(e).all()).results.map(cparse);
  const upcoming = (await D.prepare(`SELECT t.ref, t.title, t.confirmed_date, t.status, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.project_id IN ${MINE}
      AND t.confirmed_date >= ?2 AND t.status IN (${open}) ORDER BY t.confirmed_date LIMIT 6`).bind(e, today()).all()).results;
  const activity = (await D.prepare(`SELECT a.*, t.ref AS task_ref, t.title AS task_title FROM activity a LEFT JOIN tasks t ON t.id=a.task_id WHERE a.project_id IN ${MINE} ORDER BY a.id DESC LIMIT 20`).bind(e).all()).results.map(parseA);
  const waiting = (await D.prepare(`SELECT t.ref, t.title, t.status, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.project_id IN ${MINE}
      AND t.status IN ('info','feedback','final') ORDER BY t.updated_at DESC LIMIT 10`).bind(e).all()).results;
  const bills = await D.prepare("SELECT COUNT(*) AS open, SUM(CASE WHEN due_date<?2 THEN 1 ELSE 0 END) AS overdue FROM invoices WHERE client_email=?1 AND sent_at IS NOT NULL AND status IN ('pending','partial')").bind(e, today()).first();
  return json({ ok: true, projects, counts, tasks, upcoming, activity, waiting, unread: await unreadN(), bills: { open: (bills && bills.open) || 0, overdue: (bills && bills.overdue) || 0 } });
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  if (new URL(request.url).searchParams.get("tg") === "hook") return tgHook(ctx);
  const d = await request.json().catch(() => ({}));
  if (["project","review","status","date","dateDecision","deliver","point","pointAdd","studioComment","removeComment","studioFile","removeFile","studioRead","retryNotif","waConfig","waTest","invoice","invoicePay","invoiceUnpay","invoiceStatus","invoiceSend","invoiceDelete","recurring","recurringDelete","recurringRun","sendReport","clientSave","clientArchive","studioTask","taskEdit","taskDelete","tgSetup"].includes(d.action)) {
    if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
    return adminPost(ctx, d);
  }
  const u = await currentUser(request, env); if (!u) return json({ ok: false, error: "login" }, 401);
  if (u.role !== "client") return json({ ok: false, error: "not client" }, 403);
  if (u.mustChange) return json({ ok: false, error: "password" }, 403);   // a temporary password: choose your own first
  const D = await db(env); if (!D) return json({ ok: false, error: "db" }, 503);
  const at = now(), who = { actor: u.email, actor_name: u.name, client_email: u.email };
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
    const p = await myProject(D, u.email, clip(d.project, 40)); if (!p) return json({ ok: false, error: "project" }, 404);
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
    for (const x of items) {
      const title = clip(x.title, 140), rd = clip(x.requested_date, 10), id = "t_" + randHex(8), ref = await newRef(D), pr = PRIORITIES.includes(x.priority) ? x.priority : "normal", brief = cleanBrief(x.brief);
      const over = p.quota && used >= p.quota ? 1 : 0; used++;   // flagged for the studio, never blocked
      await D.prepare(`INSERT INTO tasks (id, ref, project_id, client_email, title, type, description, details, notes, priority, requested_date, status, links, brief, over_quota, created_by, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,'new',?,?,?,?,?,?)`).bind(id, ref, p.id, p.client_email, title, clip(x.type, 60), clip(x.description, 4000), clip(x.details, 6000), clip(x.notes, 3000), pr, rd || null,
        JSON.stringify(cleanLinks(x.links)), brief ? JSON.stringify(brief) : null, over, u.email, at, at).run();
      await act(D, { ...who, client_email: p.client_email, project_id: p.id, task_id: id, kind: "task_created", data: { ref, title, requested_date: rd || null, priority: pr } });
      made.push({ ref, title, rd, pr, over: !!over });
    }
    await D.prepare("UPDATE projects SET updated_at=? WHERE id=?").bind(at, p.id).run();
    const line = m => m.ref + " — " + m.title + (m.rd ? " · " + m.rd : "") + (m.pr !== "normal" ? " · " + ({ high: "عالية", urgent: "عاجلة" })[m.pr] : "") + (m.over ? " · ⚠️ خارج الحصة" : "");
    if (made.length === 1) toStudio(ctx, env, "مهمة جديدة " + made[0].ref + " — " + u.name, made[0].title + "\nالمشروع: " + p.name + (made[0].rd ? "\nالموعد المطلوب: " + made[0].rd : "") + (made[0].pr !== "normal" ? "\nالأولوية: " + ({ high: "عالية", urgent: "عاجلة" })[made[0].pr] : "") + (made[0].over ? "\n⚠️ خارج الحصة الشهرية (" + used + " من " + p.quota + ")" : "") + "\n\nافتحها: " + adminLink(made[0].ref));
    else toStudio(ctx, env, made.length + " مهام جديدة " + made[0].ref + " — " + u.name, "المشروع: " + p.name + "\n\n" + made.map(line).join("\n") + "\n\n" + SITE + "/admin/#tasks");
    return d.action === "task" ? json({ ok: true, ref: made[0].ref, over_quota: made[0].over }) : json({ ok: true, refs: made.map(m => m.ref), over_quota: made.filter(m => m.over).length });
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
    later(ctx, tellClient(env, o.task ? o.task : { client_email: p.client_email, ref: "", title: p.name }, "comment", { note: body, hash: o.task ? undefined : "#w/p/" + p.id + "/talk" })); }
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
  if (o.by === "studio") later(ctx, tellClient(ctx.env, { client_email: o.project.client_email, ref: "", title: o.project.name }, "file", { file: title, name: o.project.name, hash: "#w/p/" + o.project.id + "/files" }));
  else toStudio(ctx, ctx.env, "ملف جديد من " + o.by_name + " · " + o.project.name, title + "\n" + url);
  return json({ ok: true, id });
}

async function clientsList(env){ const out = []; let cursor;
  do { const r = await env.EB.list({ prefix: "user:", cursor }); for (const k of r.keys) { const v = await env.EB.get(k.name); if (!v) continue; const u = JSON.parse(v); if (u.role === "client") out.push({ email: u.email, name: u.name, lang: u.lang || "ar" }); } cursor = r.list_complete ? null : r.cursor; } while (cursor);
  return out; }
// ==== client records (phase 9) ====
const CSTATUS = ["active","paused","archived"];
const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");
async function clientRow(D, email){ return D.prepare("SELECT * FROM clients WHERE email=?").bind(String(email || "").toLowerCase()).first(); }
async function ensureClients(D, list){   // a stable id for every client the studio works with (never overwrites what the studio wrote)
  const st = list.filter(x => x && isEmail(x.email)).map(x => D.prepare("INSERT OR IGNORE INTO clients (id, email, name, created_at, updated_at) VALUES (?,?,?,?,?)").bind("c_" + randHex(6), x.email.toLowerCase(), clip(x.name, 120), now(), now()));
  for (let i = 0; i < st.length; i += 50) await D.batch(st.slice(i, i + 50));
}
async function allUsers(env){ const out = []; let cursor;
  do { const r = await env.EB.list({ prefix: "user:", cursor });
    for (const k of r.keys) { const v = await env.EB.get(k.name); if (!v) continue; const u = JSON.parse(v);
      out.push({ email: u.email, name: u.name, role: u.role === "client" ? "client" : "customer", lang: u.lang || "ar", created: u.createdAt || null, lastLogin: u.lastLogin || null, orders: (u.orders || []).length, clientSince: u.clientSince || null }); }
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
    return { id: r.id || null, email: e, name: r.name || (u && u.name) || "", company: r.company || "", phone: r.phone || "", logo_url: r.logo_url || null, status: r.status || "active", archived_at: r.archived_at || null,
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
    const projects = (await D.prepare("SELECT id, name, client_email, status FROM projects ORDER BY updated_at DESC").all()).results;
    return json({ ok: true, invoices, projects, clients: await clientsList(env), today: today() });
  }
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
    return json({ ok: true, client: cr, account: !!u0, files, delivered, today: today(), user: { name: u.name, email: u.email, role: u.role || "customer", clientSince: u.clientSince || null, clientVia: u.clientVia || null, lang: u.lang || "ar", created: u.created || u.createdAt || null, google: !!u.google, log: (u.log || []).slice(-20) },
      projects, tasks, invoices, activity, sends, prefs: { email_cats: P.email_cats, wa_cats: P.wa_cats, consent: P.consent, wa_phone: P.wa_phone ? "+" + P.wa_phone.replace(/\d(?=\d{4})/g, "•") : "", wa_consent_at: P.wa_consent_at, wa_withdrawn_at: P.wa_withdrawn_at } });
  }
  if (q.get("view") === "notify") {
    const inbox = (await D.prepare("SELECT * FROM notifications WHERE recipient='studio' ORDER BY id DESC LIMIT 60").all()).results.map(parseA);
    const where = [], args = [];
    if (["email","whatsapp","push","telegram"].includes(q.get("channel"))) { where.push("channel=?"); args.push(q.get("channel")); }
    if (["sent","failed","retry","skipped"].includes(q.get("status"))) { where.push("status=?"); args.push(q.get("status")); }
    const log = (await D.prepare(`SELECT id, at, channel, recipient, target, kind, status, attempts, error, next_try_at, delivery FROM notify_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 200`).bind(...args).all()).results;
    const stats = (await D.prepare("SELECT channel, status, COUNT(*) AS n FROM notify_log WHERE at>=? GROUP BY channel, status").bind(new Date(Date.now() - 30 * 864e5).toISOString()).all()).results;
    const cfg = await waConfig(env);
    return json({ ok: true, inbox, unread: (await D.prepare("SELECT COUNT(*) AS n FROM notifications WHERE recipient='studio' AND read_at IS NULL").first()).n, log, stats,
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
  return json({ ok: true, tasks, projects, clients, activity, deliverables, comments, inboxUnread, today: today() });
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
    const pid = d.project_id ? clip(d.project_id, 40) : null;
    if (pid) { const p = await D.prepare("SELECT client_email FROM projects WHERE id=?").bind(pid).first(); if (!p || p.client_email !== email) return json({ ok: false, error: "project" }, 400); }
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
      await act(D, { ...studio, client_email: email, project_id: pid, kind: "invoice_updated", data: { no: x.no, total, cur } });
      if (d.send) { await D.prepare("UPDATE invoices SET sent_at=? WHERE id=?").bind(at, x.id).run(); later(ctx, invoiceMail(env, await invoiceOf(D, x.id), "invoice")); }
      return json({ ok: true, id: x.id, no: x.no });
    }
    const n = await newInvoice(env, "bill", total), id = "i_" + randHex(6);
    await D.prepare("INSERT INTO invoices (id, no, client_email, project_id, title, period, items, currency, discount, total, paid, refunded, status, issue_date, due_date, note, payments, sent_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,0,'pending',?,?,?,'[]',?,?,?)")
      .bind(id, n.no, email, pid, title, period, JSON.stringify(items), cur, disc, total, issue, due, note, d.send ? at : null, at, at).run();
    await act(D, { ...studio, client_email: email, project_id: pid, kind: "invoice_issued", data: { no: n.no, total, cur, sent: !!d.send } });
    if (d.send) later(ctx, invoiceMail(env, await invoiceOf(D, id), "invoice"));
    return json({ ok: true, id, no: n.no });
  }
  if (["invoicePay","invoiceUnpay","invoiceStatus","invoiceSend","invoiceDelete"].includes(d.action)) {
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
      if (y.sent_at) later(ctx, invoiceMail(env, y, "invoicePaid"));
      return json({ ok: true, status: y.state, balance: y.balance });
    }
    if (d.action === "invoiceUnpay") {
      const i = +d.index; if (!x.payments[i]) return json({ ok: false }, 404); if (x.status === "refunded") return json({ ok: false, error: "state" }, 409);
      const pays = x.payments.filter((_, k) => k !== i), paid = money(pays.reduce((a, p) => a + p.amount, 0));
      const y = await save({ paid, payments: pays, status: x.status === "cancelled" ? "cancelled" : byPaid(paid) }, "invoice_payment_removed", { amount: x.payments[i].amount, cur: x.currency });
      return json({ ok: true, status: y.state });
    }
    if (d.action === "invoiceStatus") {
      if (d.status === "cancelled") { if (x.paid > 0) return json({ ok: false, error: "paid" }, 409); const y = await save({ status: "cancelled" }, "invoice_status", { to: "cancelled" }); return json({ ok: true, status: y.state }); }
      if (d.status === "refunded") { if (x.paid <= 0) return json({ ok: false, error: "nothing paid" }, 409); const amt = d.amount !== undefined && d.amount !== "" ? money(d.amount) : x.paid; if (amt <= 0 || amt > x.paid + 0.009) return json({ ok: false, error: "amount" }, 400);
        const y = await save({ status: "refunded", refunded: amt }, "invoice_status", { to: "refunded", amount: amt, cur: x.currency }); return json({ ok: true, status: y.state }); }
      if (d.status === "reopen") { if (x.status !== "cancelled" && x.status !== "refunded") return json({ ok: false, error: "state" }, 409); const y = await save({ status: byPaid(x.paid), refunded: 0 }, "invoice_status", { to: "reopened" }); return json({ ok: true, status: y.state }); }
      return json({ ok: false }, 400);
    }
    if (d.action === "invoiceSend") { if (x.status === "cancelled") return json({ ok: false, error: "state" }, 409); const y = await save({ sent_at: x.sent_at || at }, "invoice_sent", {}); later(ctx, invoiceMail(env, y, y.status === "paid" ? "invoicePaid" : "invoice")); return json({ ok: true }); }
    if (d.action === "invoiceDelete") { if (x.sent_at || x.paid > 0) return json({ ok: false, error: "sent" }, 409); await D.prepare("DELETE FROM invoices WHERE id=?").bind(x.id).run(); return json({ ok: true }); }
  }
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
      await act(D, { ...studio, client_email: email, project_id: p.id, kind: "project_updated", data: { name: f.name, status: f.status } });
      return json({ ok: true, id: p.id });
    }
    const id = "p_" + randHex(6);
    await D.prepare("INSERT INTO projects (id, client_email, name, description, type, status, services, start_date, end_date, quota, drive_url, auto_report, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, email, f.name, f.description, f.type, f.status, f.services, f.start_date, f.end_date, f.quota, f.drive_url, f.auto_report, at, at).run();
    await act(D, { ...studio, client_email: email, project_id: id, kind: "project_created", data: { name: f.name } });
    later(ctx, tellClient(env, { client_email: email }, "project", { id, name: f.name }));
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
  if (d.action === "clientSave") {
    const email = clip(d.email, 254).toLowerCase(); if (!isEmail(email)) return json({ ok: false, error: "email" }, 400);
    const name = clip(d.name, 120), old = await clientRow(D, email), u = await userOf(env, email);
    if (!old && !name && !u) return json({ ok: false, error: "name" }, 400);
    const logo = clip(d.logo_url, 600), f = { name: name || (old && old.name) || (u && u.name) || "", company: clip(d.company, 120), phone: clip(d.phone, 40), logo_url: isUrl(logo) ? logo : null, notes: clip(d.notes, 4000),
      status: CSTATUS.includes(d.status) ? d.status : (old ? old.status : "active") };
    if (old) await D.prepare("UPDATE clients SET name=?, company=?, phone=?, logo_url=?, notes=?, status=?, archived_at=?, updated_at=? WHERE id=?")
      .bind(f.name, f.company, f.phone, f.logo_url, f.notes, f.status, f.status === "archived" ? (old.archived_at || at) : null, at, old.id).run();
    else await D.prepare("INSERT INTO clients (id, email, name, company, phone, logo_url, notes, status, created_at, updated_at, archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind("c_" + randHex(6), email, f.name, f.company, f.phone, f.logo_url, f.notes, f.status, at, at, f.status === "archived" ? at : null).run();
    await act(D, { ...studio, client_email: email, kind: old ? "client_updated" : "client_added", data: { name: f.name } });
    return json({ ok: true, id: (await clientRow(D, email)).id, account: !!u, role: u ? (u.role === "client" ? "client" : "customer") : null });
  }
  if (d.action === "clientArchive") {
    const c = await clientRow(D, clip(d.email, 254)); if (!c) return json({ ok: false }, 404);
    const arch = d.archive !== false;
    await D.prepare("UPDATE clients SET status=?, archived_at=?, updated_at=? WHERE id=?").bind(arch ? "archived" : "active", arch ? at : null, at, c.id).run();
    await act(D, { ...studio, client_email: c.email, kind: arch ? "client_archived" : "client_restored", data: { name: c.name } });
    return json({ ok: true });
  }
  if (d.action === "studioTask") {
    const p = await D.prepare("SELECT * FROM projects WHERE id=?").bind(clip(d.project, 40)).first(); if (!p) return json({ ok: false, error: "project" }, 404);
    const title = clip(d.title, 140); if (!title) return json({ ok: false, error: "title" }, 400);
    const cd = clip(d.confirmed_date, 10); if (cd && !isDate(cd)) return json({ ok: false, error: "date" }, 400);
    const id = "t_" + randHex(8), ref = await newRef(D), pr = PRIORITIES.includes(d.priority) ? d.priority : "normal", st = cd ? "accepted" : "review";
    await D.prepare(`INSERT INTO tasks (id, ref, project_id, client_email, title, type, description, priority, confirmed_date, status, assignee, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'studio',?,?)`)
      .bind(id, ref, p.id, p.client_email, title, clip(d.type, 60), clip(d.description, 4000), pr, cd || null, st, clip(d.assignee, 80) || null, at, at).run();
    await act(D, { ...studio, client_email: p.client_email, project_id: p.id, task_id: id, kind: "task_created", data: { ref, title, by_studio: true, confirmed_date: cd || null, priority: pr } });
    await D.prepare("UPDATE projects SET updated_at=? WHERE id=?").bind(at, p.id).run();
    later(ctx, tellClient(env, { client_email: p.client_email, ref, title, confirmed_date: cd || null, status: st }, "added"));
    return json({ ok: true, ref });
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
    t.status = to; later(ctx, tellClient(env, t, "deliver", { label, final: fin, note }));
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
      later(ctx, tellClient(env, t, "accept", { note })); return json({ ok: true });
    }
    if (d.decision === "info") { if (!note) return json({ ok: false, error: "note" }, 400); await setStatus("info"); later(ctx, tellClient(env, t, "info", { note })); return json({ ok: true }); }
    if (d.decision === "reject") { await setStatus("rejected"); later(ctx, tellClient(env, t, "reject", { note })); return json({ ok: true }); }
    return json({ ok: false }, 400);
  }
  if (d.action === "status") {
    if (!STATUSES.includes(d.status)) return json({ ok: false }, 400);
    if (d.status === "accepted" && !t.confirmed_date) return json({ ok: false, error: "date first" }, 400);
    if (d.status === t.status) return json({ ok: true });
    await setStatus(d.status);
    later(ctx, tellClient(env, t, d.status === "progress" ? "progress" : d.status === "completed" ? "completed" : "status", { note }));
    return json({ ok: true });
  }
  if (d.action === "date") {
    const cd = clip(d.confirmed_date, 10); if (!isDate(cd)) return json({ ok: false, error: "date" }, 400);
    if (cd === t.confirmed_date) return json({ ok: true });
    await D.prepare("UPDATE tasks SET confirmed_date=?, updated_at=? WHERE id=?").bind(cd, at, t.id).run();
    await act(D, { ...tw, kind: "date_changed", data: { from: t.confirmed_date, to: cd, note: note || undefined } });
    const had = !!t.confirmed_date; t.confirmed_date = cd;
    if (had) later(ctx, tellClient(env, t, "date", { note }));
    return json({ ok: true });
  }
  if (d.action === "dateDecision") {
    const cr = t.change_request; if (!cr || cr.status !== "pending") return json({ ok: false, error: "no request" }, 404);
    cr.status = d.approve ? "approved" : "declined"; cr.decidedAt = at;
    const to = d.approve ? (isDate(d.date) ? d.date : cr.date) : t.confirmed_date;
    await D.prepare("UPDATE tasks SET change_request=?, confirmed_date=?, updated_at=? WHERE id=?").bind(JSON.stringify(cr), to, at, t.id).run();
    await act(D, { ...tw, kind: "date_change_decided", data: { approved: !!d.approve, from: t.confirmed_date, to } });
    t.confirmed_date = to; later(ctx, tellClient(env, t, d.approve ? "date" : "dateNo", { note }));
    return json({ ok: true });
  }
  return json({ ok: false }, 400);
}
