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
];
const FILE_CATS = ["brand","raw","reference","document","other"];
const TC = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;
let READY = false;
async function db(env){
  if (!env.DB) return null;
  if (!READY) { await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s))); READY = true; }
  return env.DB;
}
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(Date.parse(s + "T00:00:00Z"));
const clip = (v, m) => String(v ?? "").trim().slice(0, m);
function cleanLinks(list){ return (Array.isArray(list) ? list : []).slice(0, 12).map(x => ({ label: clip(x && x.label, 80), url: clip(x && x.url, 600) })).filter(x => /^https?:\/\/[^\s]+$/i.test(x.url)); }
function parse(t){ if (!t) return t; try { t.links = JSON.parse(t.links || "[]"); } catch { t.links = []; } try { t.change_request = t.change_request ? JSON.parse(t.change_request) : null; } catch { t.change_request = null; } return t; }
function parseP(p){ if (!p) return p; try { p.services = JSON.parse(p.services || "[]"); } catch { p.services = []; } return p; }
function parseA(a){ try { a.data = JSON.parse(a.data || "{}"); } catch { a.data = {}; } return a; }
function parseD(x){ try { x.links = JSON.parse(x.links || "[]"); } catch { x.links = []; } try { x.points = JSON.parse(x.points || "[]"); } catch { x.points = []; } x.is_final = !!x.is_final; return x; }
function parseC(x){ try { x.links = JSON.parse(x.links || "[]"); } catch { x.links = []; } return x; }
function cleanPoints(list){ return (Array.isArray(list) ? list : []).slice(0, 30).map(x => ({ t: TC.test(clip(x && x.t, 8)) ? clip(x.t, 8) : "", text: clip(x && x.text, 600), done: false })).filter(x => x.text); }
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
const taskLink = (lang, ref) => SITE + (lang === "en" ? "/en" : "") + "/account.html#w/t/" + ref;
const adminLink = ref => SITE + "/admin/#tasks/" + ref;
const ST_LABEL = { ar:{ new:"طلب جديد", review:"قيد المراجعة", info:"بانتظار معلوماتك", accepted:"تم القبول", progress:"قيد التنفيذ", feedback:"بانتظار ملاحظاتك", revision:"تعديلات مطلوبة", final:"التسليم النهائي", completed:"مكتملة", rejected:"مرفوضة", cancelled:"ملغاة" },
                   en:{ new:"New request", review:"Under review", info:"Awaiting your information", accepted:"Accepted", progress:"In progress", feedback:"Awaiting your feedback", revision:"Revision requested", final:"Final delivery", completed:"Completed", rejected:"Rejected", cancelled:"Cancelled" } };
const fmtDate = (d, lang) => { try { return new Date(d + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-GB" : "ar-u-nu-latn", { weekday:"long", year:"numeric", month:"long", day:"numeric" }); } catch { return d; } };
// one e-mail to the client for each studio decision on their task
async function tellClient(env, t, kind, extra){
  const u = await userOf(env, t.client_email); if (!u) return;
  const lang = u.lang === "en" ? "en" : "ar", en = lang === "en", L = ST_LABEL[lang];
  const T = {
    accept:  en ? ["Task accepted · " + t.ref, `<b style="color:#fff">${h(t.title)}</b> is accepted. Confirmed delivery date: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`]
                : ["قبلنا مهمتك · " + t.ref, `قبلنا مهمة <b style="color:#fff">${h(t.title)}</b>. موعد التسليم المؤكد: <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`],
    info:    en ? ["We need a little more · " + t.ref, `To start <b style="color:#fff">${h(t.title)}</b> we need:`] : ["محتاجين منك شي صغير · " + t.ref, `لنبلّش بمهمة <b style="color:#fff">${h(t.title)}</b> محتاجين:`],
    reject:  en ? ["About your task · " + t.ref, `We can't take <b style="color:#fff">${h(t.title)}</b> as requested.`] : ["بخصوص مهمتك · " + t.ref, `ما منقدر ننفّذ مهمة <b style="color:#fff">${h(t.title)}</b> متل ما انطلبت.`],
    progress:en ? ["Work has started · " + t.ref, `We started working on <b style="color:#fff">${h(t.title)}</b>.`] : ["بلّشنا الشغل · " + t.ref, `بلّشنا التنفيذ على <b style="color:#fff">${h(t.title)}</b>.`],
    date:    en ? ["New delivery date · " + t.ref, `The confirmed delivery date for <b style="color:#fff">${h(t.title)}</b> is now <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`]
                : ["موعد تسليم جديد · " + t.ref, `موعد التسليم المؤكد لمهمة <b style="color:#fff">${h(t.title)}</b> صار <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`],
    dateNo:  en ? ["About the date change · " + t.ref, `We kept the delivery date of <b style="color:#fff">${h(t.title)}</b> on <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`]
                : ["بخصوص تغيير الموعد · " + t.ref, `ضلّ موعد تسليم <b style="color:#fff">${h(t.title)}</b> على <b style="color:#3FE0E8">${h(fmtDate(t.confirmed_date, lang))}</b>.`],
    completed: en ? ["Task completed · " + t.ref, `<b style="color:#fff">${h(t.title)}</b> is complete. Thank you!`] : ["خلصت المهمة · " + t.ref, `خلصت مهمة <b style="color:#fff">${h(t.title)}</b>. شكراً لك!`],
    status:  en ? ["Task update · " + t.ref, `<b style="color:#fff">${h(t.title)}</b> is now: <b style="color:#3FE0E8">${h(L[t.status] || t.status)}</b>.`] : ["تحديث على مهمتك · " + t.ref, `حالة مهمة <b style="color:#fff">${h(t.title)}</b> صارت: <b style="color:#3FE0E8">${h(L[t.status] || t.status)}</b>.`],
    deliver: en ? [(extra && extra.final ? "Final delivery is ready · " : "Version " + (extra && extra.label) + " is ready · ") + t.ref, `<b style="color:#fff">${h(t.title)}</b> — <b style="color:#3FE0E8">${h(extra && extra.label)}</b> is ready for you. Take a look and send us your approval or your notes.`]
                 : [(extra && extra.final ? "التسليم النهائي جاهز · " : "النسخة " + (extra && extra.label) + " جاهزة · ") + t.ref, `<b style="color:#fff">${h(t.title)}</b> — النسخة <b style="color:#3FE0E8">${h(extra && extra.label)}</b> جاهزة. شوفها وابعتلنا موافقتك أو ملاحظاتك.`],
    comment: en ? ["New comment from the studio" + (t.ref ? " · " + t.ref : ""), `On <b style="color:#fff">${h(t.title)}</b>:`] : ["تعليق جديد من الاستوديو" + (t.ref ? " · " + t.ref : ""), `على <b style="color:#fff">${h(t.title)}</b>:`],
    project: en ? ["New project in your workspace", `The studio opened <b style="color:#fff">${h(extra && extra.name)}</b> for you. You can send tasks to it from your workspace.`]
                : ["مشروع جديد بمساحة العمل", `فتحلك الاستوديو مشروع <b style="color:#fff">${h(extra && extra.name)}</b>. فيك تبعت مهامك عليه من مساحة العمل.`],
  }[kind]; if (!T) return;
  const note = extra && extra.note ? `<p style="margin:14px 0 0;padding:12px 14px;border-radius:12px;background:#121a48;color:#DCE3F0">${h(extra.note).replace(/\n/g, "<br>")}</p>` : "";
  const link = extra && extra.link ? extra.link : kind === "project" ? SITE + (en ? "/en" : "") + "/account.html#w/p/" + (extra && extra.id) : taskLink(lang, t.ref);
  await sendMail(env, u.email, T[0], mail(lang, T[0], `<p style="margin:0">${T[1]}</p>` + note, en ? "Open in my workspace" : "افتح بمساحة العمل", link, greet({ name: u.name, lang })));
}

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  if (q.get("admin")) return adminGet(request, env, q);
  const u = await currentUser(request, env); if (!u) return json({ ok: false, error: "login" }, 401);
  if (u.role !== "client") return json({ ok: false, error: "not client" }, 403);
  const D = await db(env); if (!D) return json({ ok: false, error: "db" }, 503);
  const e = u.email, open = OPEN.map(s => `'${s}'`).join(",");
  if (q.get("project")) {
    const p = parseP(await myProject(D, e, q.get("project"))); if (!p) return json({ ok: false }, 404);
    const tasks = (await D.prepare("SELECT * FROM tasks WHERE project_id=? ORDER BY updated_at DESC").bind(p.id).all()).results.map(parse);
    const activity = (await D.prepare("SELECT * FROM activity WHERE project_id=? ORDER BY id DESC LIMIT 40").bind(p.id).all()).results.map(parseA);
    return json({ ok: true, me: e, project: p, tasks, activity, ...(await spaceOf(D, p.id)) });
  }
  if (q.get("task")) {
    const t = parse(await myTask(D, e, q.get("task"))); if (!t) return json({ ok: false }, 404);
    const activity = (await D.prepare("SELECT * FROM activity WHERE task_id=? ORDER BY id DESC LIMIT 80").bind(t.id).all()).results.map(parseA);
    return json({ ok: true, me: e, task: t, activity, deliverables: await deliverablesOf(D, t.id), comments: await commentsOf(D, "task", t.id) });
  }
  const projects = (await D.prepare(`SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status IN (${open})) AS open_tasks,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status='completed') AS done_tasks FROM projects p WHERE p.id IN ${MINE} ORDER BY p.status='active' DESC, p.updated_at DESC`).bind(e).all()).results.map(parseP);
  const counts = {}; for (const r of (await D.prepare(`SELECT status, COUNT(*) AS n FROM tasks WHERE project_id IN ${MINE} GROUP BY status`).bind(e).all()).results) counts[r.status] = r.n;
  const tasks = (await D.prepare(`SELECT t.*, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.project_id IN ${MINE} ORDER BY t.updated_at DESC LIMIT 12`).bind(e).all()).results.map(parse);
  const upcoming = (await D.prepare(`SELECT t.ref, t.title, t.confirmed_date, t.status, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.project_id IN ${MINE}
      AND t.confirmed_date >= ?2 AND t.status IN (${open}) ORDER BY t.confirmed_date LIMIT 6`).bind(e, today()).all()).results;
  const activity = (await D.prepare(`SELECT a.*, t.ref AS task_ref, t.title AS task_title FROM activity a LEFT JOIN tasks t ON t.id=a.task_id WHERE a.project_id IN ${MINE} ORDER BY a.id DESC LIMIT 20`).bind(e).all()).results.map(parseA);
  const waiting = (await D.prepare(`SELECT t.ref, t.title, t.status, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.project_id IN ${MINE}
      AND t.status IN ('info','feedback','final') ORDER BY t.updated_at DESC LIMIT 10`).bind(e).all()).results;
  return json({ ok: true, projects, counts, tasks, upcoming, activity, waiting });
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const d = await request.json().catch(() => ({}));
  if (["project","review","status","date","dateDecision","deliver","point","studioComment","removeComment","studioFile","removeFile"].includes(d.action)) {
    if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
    return adminPost(ctx, d);
  }
  const u = await currentUser(request, env); if (!u) return json({ ok: false, error: "login" }, 401);
  if (u.role !== "client") return json({ ok: false, error: "not client" }, 403);
  const D = await db(env); if (!D) return json({ ok: false, error: "db" }, 503);
  const at = now(), who = { actor: u.email, actor_name: u.name, client_email: u.email };

  if (d.action === "task") {
    const p = await myProject(D, u.email, clip(d.project, 40)); if (!p) return json({ ok: false, error: "project" }, 404);
    if (p.status !== "active") return json({ ok: false, error: "project closed" }, 409);
    const title = clip(d.title, 140); if (!title) return json({ ok: false, error: "title" }, 400);
    const rd = clip(d.requested_date, 10); if (rd && (!isDate(rd) || rd < today())) return json({ ok: false, error: "date" }, 400);
    const n = (await D.prepare("SELECT COUNT(*) AS n FROM tasks WHERE client_email=? AND created_at>=?").bind(u.email, today()).first()).n;
    if (n >= 40) return json({ ok: false, error: "too many attempts" }, 429);
    const id = "t_" + randHex(8), ref = await newRef(D), pr = PRIORITIES.includes(d.priority) ? d.priority : "normal";
    await D.prepare(`INSERT INTO tasks (id, ref, project_id, client_email, title, type, description, details, notes, priority, requested_date, status, links, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'new',?,?,?,?)`).bind(id, ref, p.id, p.client_email, title, clip(d.type, 60), clip(d.description, 4000), clip(d.details, 6000), clip(d.notes, 3000), pr, rd || null,
      JSON.stringify(cleanLinks(d.links)), u.email, at, at).run();
    await D.prepare("UPDATE projects SET updated_at=? WHERE id=?").bind(at, p.id).run();
    await act(D, { ...who, client_email: p.client_email, project_id: p.id, task_id: id, kind: "task_created", data: { ref, title, requested_date: rd || null, priority: pr } });
    later(ctx, notifyStudio(env, "مهمة جديدة " + ref + " — " + u.name, title + "\nالمشروع: " + p.name + (rd ? "\nالموعد المطلوب: " + rd : "") + (pr !== "normal" ? "\nالأولوية: " + ({ high: "عالية", urgent: "عاجلة" })[pr] : "") + "\n\nافتحها: " + adminLink(ref)));
    return json({ ok: true, ref });
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
    return addFile(D, { project: p, by: u.email, by_name: u.name, d });
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
      await D.prepare("UPDATE deliverables SET status='approved', decision_note=?, decided_at=?, decided_by=? WHERE id=?").bind(note, at, u.email, dl.id).run();
      await D.prepare("UPDATE tasks SET status=?, updated_at=?" + (to === "completed" ? ", completed_at=?" : "") + " WHERE id=?").bind(...[to, at].concat(to === "completed" ? [at] : []), t.id).run();
      await act(D, { ...tw, kind: "approved", data: { label: dl.label, final: dl.is_final, note: note || undefined } });
      await act(D, { ...tw, kind: "status", data: { from: t.status, to } });
      later(ctx, notifyStudio(env, (dl.is_final ? "العميل وافق على التسليم النهائي " : "العميل وافق على النسخة " + dl.label + " ") + t.ref, u.name + " · " + t.title + (note ? "\n" + note : "") + (dl.is_final ? "\n\nالمهمة صارت مكتملة." : "\n\nجهّز التسليم النهائي.") + "\n\n" + adminLink(t.ref)));
      return json({ ok: true, status: to });
    }
    if (d.decision === "changes") {
      const points = cleanPoints(d.points); if (!points.length && !note) return json({ ok: false, error: "text" }, 400);
      await D.prepare("UPDATE deliverables SET status='changes', points=?, decision_note=?, decided_at=?, decided_by=? WHERE id=?").bind(JSON.stringify(points), note, at, u.email, dl.id).run();
      await D.prepare("UPDATE tasks SET status='revision', updated_at=? WHERE id=?").bind(at, t.id).run();
      const round = (await D.prepare("SELECT COUNT(*) AS n FROM deliverables WHERE task_id=? AND status='changes'").bind(t.id).first()).n;
      await act(D, { ...tw, kind: "changes_requested", data: { label: dl.label, points: points.length, round, note: note || undefined } });
      await act(D, { ...tw, kind: "status", data: { from: t.status, to: "revision" } });
      later(ctx, notifyStudio(env, "تعديلات مطلوبة على " + dl.label + " · " + t.ref + " (جولة " + round + ")", u.name + " · " + t.title + "\n\n" + points.map((x, i) => (i + 1) + ". " + (x.t ? "[" + x.t + "] " : "") + x.text).join("\n") + (note ? "\n\n" + note : "") + "\n\n" + adminLink(t.ref)));
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
    later(ctx, notifyStudio(env, "ردّ العميل على طلب المعلومات " + t.ref, u.name + ": " + (text || "—") + "\n\n" + adminLink(t.ref)));
    return json({ ok: true });
  }
  if (d.action === "dateChange") {
    if (!["accepted","progress","feedback","revision"].includes(t.status) || !t.confirmed_date) return json({ ok: false, error: "state" }, 409);
    if (t.change_request && t.change_request.status === "pending") return json({ ok: false, error: "pending" }, 409);
    const date = clip(d.date, 10); if (!isDate(date) || date < today()) return json({ ok: false, error: "date" }, 400);
    const cr = { date, reason: clip(d.reason, 1500), at, status: "pending" };
    await D.prepare("UPDATE tasks SET change_request=?, updated_at=? WHERE id=?").bind(JSON.stringify(cr), at, t.id).run();
    await act(D, { ...tw, kind: "date_change_requested", data: { date, reason: cr.reason, current: t.confirmed_date } });
    later(ctx, notifyStudio(env, "طلب تغيير موعد " + t.ref, u.name + " بدّه الموعد يصير " + date + " بدل " + t.confirmed_date + (cr.reason ? "\nالسبب: " + cr.reason : "") + "\n\n" + adminLink(t.ref)));
    return json({ ok: true });
  }
  if (d.action === "cancel") {
    if (!["new","review","info"].includes(t.status)) return json({ ok: false, error: "state" }, 409);
    await D.prepare("UPDATE tasks SET status='cancelled', updated_at=? WHERE id=?").bind(at, t.id).run();
    await act(D, { ...tw, kind: "status", data: { from: t.status, to: "cancelled" } });
    later(ctx, notifyStudio(env, "العميل ألغى المهمة " + t.ref, u.name + " ألغى «" + t.title + "» قبل القبول."));
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
  if (o.client) later(ctx, notifyStudio(env, "تعليق جديد من " + o.author_name + " · " + (o.task ? o.task.ref : p.name), where + "\n\n" + body + "\n\n" + (o.task ? adminLink(o.task.ref) : SITE + "/admin/#tasks")));
  else { const u = await userOf(env, p.client_email), en = u && u.lang === "en";
    later(ctx, tellClient(env, o.task ? o.task : { client_email: p.client_email, ref: "", title: p.name }, "comment", { note: body, link: o.task ? undefined : SITE + (en ? "/en" : "") + "/account.html#w/p/" + p.id + "/talk" })); }
  return json({ ok: true, id });
}
async function addFile(D, o){
  const d = o.d, url = clip(d.url, 600), title = clip(d.title, 140) || url.replace(/^https?:\/\//, "").slice(0, 60);
  if (!isUrl(url)) return json({ ok: false, error: "url" }, 400);
  if ((await D.prepare("SELECT COUNT(*) AS n FROM files WHERE project_id=? AND deleted_at IS NULL").bind(o.project.id).first()).n >= 300) return json({ ok: false, error: "too many" }, 429);
  const id = "f_" + randHex(6), cat = FILE_CATS.includes(d.category) ? d.category : "other";
  await D.prepare("INSERT INTO files (id, project_id, client_email, category, title, url, note, added_by, added_name, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(id, o.project.id, o.project.client_email, cat, title, url, clip(d.note, 1000), o.by, o.by_name || "", now()).run();
  await act(D, { actor: o.by, actor_name: o.by_name, client_email: o.project.client_email, project_id: o.project.id, kind: "file_added", data: { title, category: cat } });
  return json({ ok: true, id });
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
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) AS all_tasks FROM projects p ORDER BY p.updated_at DESC`).all()).results.map(parseP);
  if (q.get("space")) { const p = parseP(await D.prepare("SELECT * FROM projects WHERE id=?").bind(q.get("space")).first()); if (!p) return json({ ok: false }, 404);
    return json({ ok: true, project: p, ...(await spaceOf(D, p.id)) }); }
  let activity = [], deliverables = [], comments = [];
  if (q.get("task")) { const t = await D.prepare("SELECT id FROM tasks WHERE ref=?").bind(q.get("task")).first();
    if (t) { activity = (await D.prepare("SELECT * FROM activity WHERE task_id=? ORDER BY id DESC LIMIT 80").bind(t.id).all()).results.map(parseA); deliverables = await deliverablesOf(D, t.id); comments = await commentsOf(D, "task", t.id); } }
  const clients = []; let cursor;
  do { const r = await env.EB.list({ prefix: "user:", cursor }); for (const k of r.keys) { const v = await env.EB.get(k.name); if (!v) continue; const u = JSON.parse(v); if (u.role === "client") clients.push({ email: u.email, name: u.name }); } cursor = r.list_complete ? null : r.cursor; } while (cursor);
  return json({ ok: true, tasks, projects, clients, activity, deliverables, comments, today: today() });
}

async function adminPost(ctx, d){
  const { env } = ctx;
  const D = await db(env); if (!D) return json({ ok: false, error: "db" }, 503);
  const at = now(), studio = { actor: "studio", actor_name: "Eyeblink Studio" };
  if (d.action === "project") {
    const email = clip(d.client_email, 254).toLowerCase(), u = await userOf(env, email);
    if (!u) return json({ ok: false, error: "no account" }, 404);
    if (u.role !== "client") return json({ ok: false, error: "not client" }, 409);
    const name = clip(d.name, 140); if (!name) return json({ ok: false, error: "name" }, 400);
    const f = { name, description: clip(d.description, 4000), type: PTYPES.includes(d.type) ? d.type : "custom", status: ["active","paused","completed","archived"].includes(d.status) ? d.status : "active",
      services: JSON.stringify((Array.isArray(d.services) ? d.services : []).slice(0, 12).map(s => clip(s, 60)).filter(Boolean)),
      start_date: isDate(d.start_date) ? d.start_date : null, end_date: isDate(d.end_date) ? d.end_date : null, quota: Number.isFinite(+d.quota) && +d.quota > 0 ? Math.min(999, Math.round(+d.quota)) : null };
    if (d.id) {
      const p = await D.prepare("SELECT * FROM projects WHERE id=?").bind(clip(d.id, 40)).first(); if (!p) return json({ ok: false }, 404);
      await D.prepare("UPDATE projects SET client_email=?, name=?, description=?, type=?, status=?, services=?, start_date=?, end_date=?, quota=?, updated_at=? WHERE id=?")
        .bind(email, f.name, f.description, f.type, f.status, f.services, f.start_date, f.end_date, f.quota, at, p.id).run();
      await act(D, { ...studio, client_email: email, project_id: p.id, kind: "project_updated", data: { name: f.name, status: f.status } });
      return json({ ok: true, id: p.id });
    }
    const id = "p_" + randHex(6);
    await D.prepare("INSERT INTO projects (id, client_email, name, description, type, status, services, start_date, end_date, quota, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, email, f.name, f.description, f.type, f.status, f.services, f.start_date, f.end_date, f.quota, at, at).run();
    await act(D, { ...studio, client_email: email, project_id: id, kind: "project_created", data: { name: f.name } });
    later(ctx, tellClient(env, { client_email: email }, "project", { id, name: f.name }));
    return json({ ok: true, id });
  }
  if (d.action === "point") {
    const dl = parseD(await D.prepare("SELECT * FROM deliverables WHERE id=?").bind(clip(d.deliverable, 40)).first() || {}); const i = +d.index;
    if (!dl.id || !dl.points[i]) return json({ ok: false }, 404);
    dl.points[i].done = !!d.done; await D.prepare("UPDATE deliverables SET points=? WHERE id=?").bind(JSON.stringify(dl.points), dl.id).run(); return json({ ok: true });
  }
  if (d.action === "removeComment" || d.action === "removeFile") {
    const tb = d.action === "removeComment" ? "comments" : "files", r = await D.prepare(`SELECT * FROM ${tb} WHERE id=? AND deleted_at IS NULL`).bind(clip(d.id, 40)).first();
    if (!r) return json({ ok: false }, 404);
    await D.prepare(`UPDATE ${tb} SET deleted_at=? WHERE id=?`).bind(at, r.id).run(); return json({ ok: true });
  }
  if (d.action === "studioFile" || (d.action === "studioComment" && d.scope === "project")) {
    const p = await D.prepare("SELECT * FROM projects WHERE id=?").bind(clip(d.project, 40)).first(); if (!p) return json({ ok: false, error: "project" }, 404);
    if (d.action === "studioFile") return addFile(D, { project: p, by: "studio", by_name: "Eyeblink Studio", d });
    return addComment(ctx, D, { scope: "project", project: p, author: "studio", author_name: "Eyeblink Studio", body: d.body, links: d.links });
  }
  const t = parse(await D.prepare("SELECT t.*, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.ref=?").bind(clip(d.task, 12)).first());
  if (!t) return json({ ok: false, error: "task" }, 404);
  const tw = { ...studio, client_email: t.client_email, project_id: t.project_id, task_id: t.id }, note = clip(d.note, 3000);
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

