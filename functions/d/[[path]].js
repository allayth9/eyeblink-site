// A quote or an agreement, as its own page: eyeblinkstudio.com/d/<token> (the link the studio sends on WhatsApp, e-mail or the site chat).
// Same family as the invoice — white paper, ink type, thin rules, one gradient hairline — set in the identity's own fonts.
// On screen: a sheet with a «PDF» button and the client's accept / sign box. Printed («Save as PDF»): clean A4 pages, numbered.
// The data is the frozen snapshot saved by /api/docs; nothing here is indexed, cached or framed.
const SITE = "https://eyeblinkstudio.com";
const h = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl = t => h(t).replace(/\n/g, "<br>");
function fmt(n, c){ const a = Math.abs(n), v = (Math.round(a * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: a % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return (n < 0 ? "−" : "") + (c === "$" || c === "€" || c === "£" ? c + v : v + " " + c); }

const T = {
  ar: { quote: "عرض سعر", agreement: "اتفاقية تقديم خدمات", team: "اتفاقية تعاون", latin: { quote: "Quotation", agreement: "Service Agreement", team: "Collaboration Agreement" },
    no: { quote: "رقم العرض", agreement: "رقم الاتفاقية", team: "رقم الاتفاقية" }, p1t: "الطرف الأول · الاستوديو", p2t: "الطرف الثاني · عضو الفريق", date: "تاريخ الإصدار", valid: "صالح حتى", order: "رقم الطلب", ref: "مرجع العرض",
    from: "مقدّم الخدمة", to: "مقدَّم إلى", p1: "الطرف الأول · مقدّم الخدمة", p2: "الطرف الثاني · العميل",
    item: "البند", qty: "الكمية", unit: "سعر الوحدة", amount: "المبلغ", sub: "المجموع", disc: "خصم", total: "الإجمالي", value: "قيمة المشروع",
    days: "مدة التنفيذ", daysV: n => n ? n + " يوم عمل" : "تُحدَّد مع البدء", rev: "جولات التعديل", revV: n => ["بدون تعديلات", "جولة واحدة", "جولتان"][n] || n + " جولات",
    pay: "الدفع", payV: (p, pct) => p === "full" ? "كامل المبلغ قبل البدء" : pct + "% عربون قبل البدء، والباقي قبل التسليم النهائي",
    inc: "يشمل العرض", exc: "لا يشمل", methods: "طرق الدفع المعتمدة", notes: "ملاحظات", scope: "نطاق العمل والمخرجات", terms: "البنود",
    accH: { quote: "الموافقة على العرض", agreement: "التوقيع الإلكتروني", team: "التوقيع الإلكتروني" },
    accP: { quote: "اكتب اسمك الكامل واضغط «أوافق على العرض». تُسجَّل موافقتك بالتاريخ والوقت، ونرتّب معك بعدها الخطوة التالية",
            agreement: "اكتب اسمك الكامل واضغط «أوقّع الاتفاقية». يُعدّ ذلك توقيعاً إلكترونياً ملزماً لجميع بنودها، ويُسجَّل بالتاريخ والوقت",
            team: "اكتب اسمك الكامل واضغط «أوقّع الاتفاقية». بعد التوقيع تُفتح لك مهامك في بوابة الفريق" },
    name: "الاسم الكامل", agree: { quote: "اطّلعت على العرض وأوافق عليه", agreement: "قرأت جميع البنود وأوافق عليها", team: "قرأت جميع البنود وأوافق عليها" },
    btn: { quote: "أوافق على العرض", agreement: "أوقّع الاتفاقية", team: "أوقّع الاتفاقية" }, done: { quote: "تمّت الموافقة على العرض", agreement: "وُقّعت الاتفاقية إلكترونياً", team: "وُقّعت الاتفاقية إلكترونياً" }, portal: "افتح بوابة الفريق",
    by: "الاسم", at: "التاريخ والوقت", sref: "مرجع التوقيع", expired: "انتهت صلاحية هذا العرض. راسلنا لنحدّثه لك",
    pdf: "تحميل PDF", issued: "صادرة إلكترونياً", sig: "التوقيع", sigName: "الاسم", sigDate: "التاريخ",
    err: { email: "اكتب بريداً إلكترونياً صحيحاً", name: "اكتب اسمك الكامل وفعّل خانة الموافقة", slow: "محاولات كثيرة، جرّب بعد قليل", expired: "انتهت صلاحية العرض", done: "تمّت الموافقة مسبقاً", x: "تعذّر الإرسال، جرّب مرة أخرى" },
    svc: "مونتاج · موشن غرافيك · أفلام", status: { sent: "بانتظار موافقتك", accepted: "موافَق عليه", signed: "موقّعة", expired: "منتهي الصلاحية" },
    gone: "هذا الرابط غير متاح. ربما سُحب المستند أو تغيّر رابطه، راسلنا لنرسل لك النسخة الحالية",
    email: "بريدك الإلكتروني (لمساحة العمل والفواتير)",
    next: "الخطوة التالية",
    nextQ: "نرسل لك اتفاقية العمل لتوقيعها، ثم تفاصيل العربون، ونبدأ",
    wsH: "مساحة العمل الخاصة بمشروعك",
    wsP: "من هنا تتابع مراحل التنفيذ، وتراجع النسخ وتعتمدها، وترسل ملاحظاتك وملفاتك، وتجد فواتيرك. فعّلها بالبريد نفسه الذي وقّعت به",
    wsBtn: "فعّل مساحة العمل", wsIn: "ادخل إلى مساحة العمل", wsDone: "مساحة العمل مفعّلة" },
  en: { quote: "Quotation", agreement: "Service Agreement", team: "Collaboration Agreement", latin: { quote: "Quotation", agreement: "Service Agreement", team: "Collaboration Agreement" },
    no: { quote: "Quote no.", agreement: "Agreement no.", team: "Agreement no." }, p1t: "First party · The studio", p2t: "Second party · Collaborator", date: "Date issued", valid: "Valid until", order: "Order", ref: "Quote reference",
    from: "From", to: "Prepared for", p1: "First party · Service provider", p2: "Second party · Client",
    item: "Item", qty: "Qty", unit: "Unit price", amount: "Amount", sub: "Subtotal", disc: "Discount", total: "Total", value: "Project value",
    days: "Timeline", daysV: n => n ? n + " working days" : "Set at kick-off", rev: "Revision rounds", revV: n => ["No revisions", "One round", "Two rounds"][n] || n + " rounds",
    pay: "Payment", payV: (p, pct) => p === "full" ? "Full amount before we start" : pct + "% deposit before we start, the rest before final delivery",
    inc: "Included", exc: "Not included", methods: "Accepted payment methods", notes: "Notes", scope: "Scope and deliverables", terms: "Terms",
    accH: { quote: "Accept this quote", agreement: "Electronic signature", team: "Electronic signature" },
    accP: { quote: "Type your full name and press «Accept quote». Your approval is recorded with the date and time, and we arrange the next step with you",
            agreement: "Type your full name and press «Sign agreement». This counts as a binding electronic signature of every term and is recorded with the date and time",
            team: "Type your full name and press «Sign agreement». Your tasks open in the team portal once it is signed" },
    name: "Full name", agree: { quote: "I have read the quote and accept it", agreement: "I have read every term and agree to it", team: "I have read every term and agree to it" },
    btn: { quote: "Accept quote", agreement: "Sign agreement", team: "Sign agreement" }, done: { quote: "Quote accepted", agreement: "Signed electronically", team: "Signed electronically" }, portal: "Open the team portal",
    by: "Name", at: "Date and time", sref: "Signature reference", expired: "This quote has expired. Message us and we will update it for you",
    pdf: "Download PDF", issued: "Issued electronically", sig: "Signature", sigName: "Name", sigDate: "Date",
    err: { email: "Enter a valid email", name: "Type your full name and tick the box", slow: "Too many attempts, try again shortly", expired: "This quote has expired", done: "Already accepted", x: "Could not send, please try again" },
    svc: "Video editing · Motion graphics · Film", status: { sent: "Awaiting your approval", accepted: "Accepted", signed: "Signed", expired: "Expired" },
    gone: "This link is not available. The document may have been withdrawn or replaced; message us and we will send the current one",
    email: "Your email (for the workspace and invoices)",
    next: "Next step",
    nextQ: "We send you the service agreement to sign, then the deposit details, and we start",
    wsH: "Your project workspace",
    wsP: "Follow every stage, review and approve each version, send feedback and files, and find your invoices. Activate it with the same email you signed with",
    wsBtn: "Activate the workspace", wsIn: "Open the workspace", wsDone: "Workspace active" },
};

export async function onRequestGet({ request, env, params }) {
  const t = String([].concat(params.path || [])[0] || "").toLowerCase();
  const v = /^[a-f0-9]{32}$/.test(t) && await env.EB.get("doc:" + t);
  if (!v) return page(404, "ar", "Eyeblink Studio", `<main class="gone"><img src="/assets/img/invoice-logo.png" alt="Eyeblink Studio" width="184" height="20"><p>${h(T.ar.gone)}</p><p dir="ltr">${h(T.en.gone)}</p></main>`);
  const doc = JSON.parse(v);
  if (doc.onboard && doc.onboard.invite) { const iv = await env.EB.get("invite:" + doc.onboard.invite); doc.onboard.used = !iv || !!JSON.parse(iv).usedAt; }
  return page(200, doc.lang, null, null, doc);
}

function dateOf(iso, en, time){ const d = new Date(iso);
  return d.toLocaleDateString(en ? "en-GB" : "ar-u-nu-latn", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Damascus" }) +
    (time ? " · " + d.toLocaleTimeString(en ? "en-GB" : "ar-u-nu-latn", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Damascus" }) + (en ? " (Damascus)" : " (بتوقيت دمشق)") : ""); }

function page(status, lang, title, main, doc){
  const en = lang === "en", L = T[en ? "en" : "ar"];
  let head = title, body = main, og = "";
  if (doc) {
    const b = doc.body, type = doc.type, q = type === "quote", tm = type === "team";
    const expired = q && !doc.accepted && Date.now() > Date.parse(doc.updatedAt) + b.valid * 864e5;
    const st = doc.accepted ? (q ? "accepted" : "signed") : expired ? "expired" : "sent";
    head = (en ? "Eyeblink " : "Eyeblink · ") + L[type] + " " + doc.no + (b.client.name ? " · " + b.client.name : "");
    og = `<meta property="og:title" content="${h(L[type] + " · " + b.title)}"><meta property="og:description" content="${h("Eyeblink Studio · " + doc.no)}"><meta property="og:image" content="${SITE}/assets/img/og.jpg">`;
    const meta = [[L.no[type], doc.no, 1], [L.date, dateOf(doc.updatedAt, en)], q ? [L.valid, dateOf(Date.parse(doc.updatedAt) + b.valid * 864e5, en)] : (b.quoteNo ? [L.ref, b.quoteNo, 1] : null), doc.code ? [L.order, doc.code, 1] : null].filter(Boolean);
    const party = (lab, name, lines) => `<div class="party"><div class="lab">${h(lab)}</div><div class="pname">${h(name)}</div>${lines.filter(Boolean).map(x => `<div class="pline">${x}</div>`).join("")}</div>`;
    const studioLines = [h(L.svc), b.studio.place && h(b.studio.place), b.studio.contact && `<bdi>${nl(b.studio.contact)}</bdi>`, `<bdi>eyeblinkstudio.com</bdi>`];
    const clientLines = [b.client.company && h(b.client.company), b.client.place && h(b.client.place), b.client.contact && `<bdi>${h(b.client.contact)}</bdi>`, b.client.email && `<bdi>${h(b.client.email)}</bdi>`];
    const facts = `<div class="facts"><div><span>${h(L.days)}</span><b>${h(L.daysV(b.days))}</b></div><div><span>${h(L.rev)}</span><b>${h(L.revV(b.revisions))}</b></div><div><span>${h(L.pay)}</span><b>${h(L.payV(b.plan, b.pct))}</b></div></div>`;
    const lines = (b.items || []).map((x, i) => `<tr><td class="n">${String(i + 1).padStart(2, "0")}</td><td class="it"><b>${h(x.name)}</b>${x.desc ? `<span>${nl(x.desc)}</span>` : ""}</td><td class="c"><bdi class="num">${x.qty}</bdi></td>${q ? `<td class="e mute u"><bdi class="num">${fmt(x.unit, b.cur)}</bdi></td><td class="e"><bdi class="num">${fmt(x.unit * x.qty, b.cur)}</bdi></td>` : ""}</tr>`).join("");
    const table = lines ? `<table class="items"><thead><tr><th class="n">#</th><th>${h(L.item)}</th><th class="c">${h(L.qty)}</th>${q ? `<th class="e u">${h(L.unit)}</th><th class="e">${h(L.amount)}</th>` : ""}</tr></thead><tbody>${lines}</tbody></table>` : "";
    const totals = `<div class="totals">${b.discount ? `<div><span>${h(L.sub)}</span><b class="num">${fmt(b.sub, b.cur)}</b></div><div><span>${h(L.disc)}</span><b class="num">−${fmt(b.discount, b.cur)}</b></div>` : ""}<div class="grand"><span>${h(q ? L.total : L.value)}</span><b class="num">${fmt(b.total, b.cur)}</b></div></div>`;
    const list = (lab, arr, mark) => arr && arr.length ? `<div class="list"><div class="lab">${h(lab)}</div><ul>${arr.map(x => `<li><i>${mark}</i>${h(x)}</li>`).join("")}</ul></div>` : "";
    const incexc = (b.includes.length || b.excludes.length) ? `<section class="cols">${list(L.inc, b.includes, "+")}${list(L.exc, b.excludes, "–")}</section>` : "";
    const methods = b.payMethods ? `<p class="small"><span class="lab inl">${h(L.methods)}</span> ${h(b.payMethods)}</p>` : "";
    const notes = b.notes ? `<section class="notes"><div class="lab">${h(L.notes)}</div><p>${nl(b.notes)}</p></section>` : "";
    const clauses = !q ? `<section class="clauses">${(b.clauses || []).map((c, i) => `<article><h3><em class="num">${String(i + 1).padStart(2, "0")}</em>${h(c.h)}</h3><p>${nl(c.p)}</p></article>`).join("")}</section>` : "";
    const ref = doc.accepted ? doc.token.slice(0, 8).toUpperCase() + "-" + doc.accepted.ip.slice(0, 4).toUpperCase() : "";
    const stamp = doc.accepted ? `<div class="stamp"><div class="sh"><i>✓</i>${h(L.done[type])}</div><dl><div><dt>${h(L.by)}</dt><dd>${h(doc.accepted.name)}</dd></div><div><dt>${h(L.at)}</dt><dd>${h(dateOf(doc.accepted.at, en, 1))}</dd></div><div><dt>${h(L.sref)}</dt><dd><bdi class="num">${h(ref)}</bdi></dd></div></dl></div>` : "";
    const form = !doc.accepted && !expired ? `<form class="accept" id="acc" novalidate><h4>${h(L.accH[type])}</h4><p>${h(L.accP[type])}</p>${!q && !b.client.email ? `<input class="femail" name="email" type="email" autocomplete="email" dir="ltr" placeholder="${h(L.email)}" maxlength="200">` : ""}<div class="frow"><input name="name" autocomplete="name" dir="auto" placeholder="${h(L.name)}" required maxlength="120"><button type="submit">${h(L.btn[type])}</button></div><label class="chk"><input type="checkbox" name="agree"> ${h(L.agree[type])}</label><div class="msg" role="status"></div></form>` : "";
    const exp = expired ? `<div class="expired">${h(L.expired)}</div>` : "";
    const ob = doc.onboard, base = en ? "/en" : "";
    const nextQ = q && doc.accepted ? `<div class="next"><span class="lab">${h(L.next)}</span><p>${h(L.nextQ)}</p></div>` : "";
    const ws = !q && doc.accepted && ob ? `<div class="next ws"><span class="lab">${h(L.next)}</span><h4>${h(L.wsH)}</h4><p>${h(L.wsP)}</p>` +
      (ob.client || ob.used ? `<a class="go" href="${base}/workspace.html">${h(L.wsIn)}</a><span class="wsok">✓ ${h(L.wsDone)}</span>` : `<a class="go" href="${base}/account.html?invite=${h(ob.invite)}">${h(L.wsBtn)}</a><span class="wsmail"><bdi>${h(ob.email)}</bdi></span>`) + `</div>` : "";
    // signatures: the studio's side is issued electronically; the client's side is the e-signature, or blank lines on paper
    const sigs = `<section class="sigs"><div class="sig"><div class="lab">${h(q ? L.from : tm ? L.p1t : L.p1)}</div><div class="sname">${h(b.studio.name)}</div><div class="sline">${h(L.issued)} · ${h(dateOf(doc.updatedAt, en))}</div></div>` +
      `<div class="sig"><div class="lab">${h(q ? L.to : tm ? L.p2t : L.p2)}</div>${doc.accepted ? `<div class="sname">${h(doc.accepted.name)}</div><div class="sline">${h(L.done[type])} · ${h(dateOf(doc.accepted.at, en))}</div>` : `<div class="blank"><span>${h(L.sigName)}</span></div><div class="blank"><span>${h(L.sig)}</span></div><div class="blank"><span>${h(L.sigDate)}</span></div>`}</div></section>`;
    const accBlock = `<section class="acc">${stamp}${nextQ}${ws}${exp}${form}</section>`;
    main = `<div class="bar"><div class="bin"><a class="home" href="${en ? "/en/" : "/"}" aria-label="Eyeblink Studio"><img src="/assets/img/mark.svg" alt=""><span>Eyeblink Studio</span></a><span class="bno num">${h(doc.no)}</span><span class="pill ${st}">${h(L.status[st])}</span><button type="button" class="pdf" id="pdf">${h(L.pdf)}</button></div></div>
<main class="sheet ${type}">
 <header class="top"><img class="logo" src="/assets/img/invoice-logo.png" alt="Eyeblink Studio" width="184" height="20"><div class="kind"><span>${h(L.latin[type])}</span>${en ? "" : `<b>${h(L[type])}</b>`}</div></header>
 <div class="hair"></div>
 <section class="hero"><h1>${h(b.title)}</h1>${b.summary ? `<p>${nl(b.summary)}</p>` : ""}</section>
 <section class="meta">${meta.map(m => `<div><span class="lab">${h(m[0])}</span><b>${m[2] ? `<bdi class="num">${h(m[1])}</bdi>` : h(m[1])}</b></div>`).join("")}</section>
 <section class="parties">${party(q ? L.from : tm ? L.p1t : L.p1, b.studio.name, studioLines)}${party(q ? L.to : tm ? L.p2t : L.p2, b.client.name || "—", clientLines)}</section>
 ${q ? `<section class="block">${table}${totals}</section>${facts}${incexc}${methods}${notes}${accBlock}${sigs}`
     : tm ? `<div class="lab sec">${h(L.terms)}</div>${clauses}${notes}${sigs}${accBlock}${doc.accepted ? `<div class="next"><a class="go" href="/team/">${h(L.portal)}</a></div>` : ""}`
     : `<section class="block"><div class="lab sec">${h(L.scope)}</div>${table}${totals}</section>${facts}${incexc}${methods}<div class="lab sec">${h(L.terms)}</div>${clauses}${notes}${sigs}${accBlock}`}
 <footer class="foot"><span>Eyeblink Studio</span><span class="num">${h(doc.no)}${doc.ver > 1 ? " · v" + doc.ver : ""}</span><span>support@eyeblinkstudio.com · eyeblinkstudio.com</span></footer>
</main>
<script>(function(){var t=${JSON.stringify(doc.token)},E=${JSON.stringify(L.err)};
document.getElementById('pdf').onclick=function(){window.print();};
if(/[?&]print=1/.test(location.search)){(document.fonts&&document.fonts.ready||Promise.resolve()).then(function(){setTimeout(function(){window.print();},350);});}
else{try{fetch('/api/docs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'seen',t:t})});}catch(_){}}
var f=document.getElementById('acc');if(!f)return;var m=f.querySelector('.msg');
f.onsubmit=function(e){e.preventDefault();var n=f.name.value.trim(),a=f.agree.checked,em=f.email?f.email.value.trim():'';if(f.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)){m.textContent=E.email;m.className='msg err';f.email.focus();return;}if(n.length<2||!a){m.textContent=E.name;m.className='msg err';return;}
var btn=f.querySelector('button');btn.disabled=true;m.textContent='';
fetch('/api/docs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'accept',t:t,name:n,email:em,agree:true})}).then(function(r){return r.json();})
.then(function(j){if(j.ok){location.reload();return;}btn.disabled=false;m.textContent=E[j.error]||E.x;m.className='msg err';}).catch(function(){btn.disabled=false;m.textContent=E.x;m.className='msg err';});};})();</script>`;
    body = main;
  }
  const html = `<!doctype html><html lang="${en ? "en" : "ar"}" dir="${en ? "ltr" : "rtl"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#04061A">
<title>${h(head)}</title>${og}<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<style>*,*::before,*::after{font-variant-ligatures:no-common-ligatures!important}${CSS}</style></head><body>${body}</body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" } });
}

const CSS = `
@font-face{font-family:"EYEN Ammon";src:url(/assets/fonts/eyen-ammon-bold.woff2) format("woff2");font-weight:700;font-display:swap}
@font-face{font-family:Hayyakum;src:url(/assets/fonts/hayyakum-regular.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:Hayyakum;src:url(/assets/fonts/hayyakum-medium.woff2) format("woff2");font-weight:500;font-display:swap}
@font-face{font-family:Oswald;src:url(/assets/fonts/oswald-300.woff2) format("woff2");font-weight:300;font-display:swap}
@font-face{font-family:Oswald;src:url(/assets/fonts/oswald-400.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:Oswald;src:url(/assets/fonts/oswald-500.woff2) format("woff2");font-weight:500;font-display:swap}
@font-face{font-family:Manrope;src:url(/assets/fonts/manrope-400.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:Manrope;src:url(/assets/fonts/manrope-600.woff2) format("woff2");font-weight:600;font-display:swap}
:root{--ink:#14172b;--grey:#6b7286;--rule:#e4e7ef;--soft:#f5f6fa;--night:#04061A;--hour:#2E62FF;--dusk:#8B5CFF;--horizon:#3FE0E8}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html{background:#e8eaf1}
body{margin:0;color:var(--ink);font:400 13.5px/1.85 Manrope,Hayyakum,system-ui,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
html[lang=ar] body{font-family:Hayyakum,Manrope,system-ui,sans-serif;font-size:14px}
.num,bdi{font-family:Oswald,Manrope,sans-serif;font-weight:400;letter-spacing:.02em;direction:ltr;unicode-bidi:isolate}
.lab{font:500 10px/1.4 Oswald,Hayyakum,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--grey)}
html[lang=ar] .lab{font:500 11.5px/1.5 Hayyakum,Oswald,sans-serif;letter-spacing:0}
.bar{position:sticky;top:0;z-index:5;background:rgba(4,6,26,.94);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#EEF2F6}
.bin{max-width:210mm;margin:0 auto;display:flex;align-items:center;gap:14px;padding:12px 18px}
.home{display:flex;align-items:center;gap:10px;color:#EEF2F6;text-decoration:none;font:600 13px Manrope,sans-serif;letter-spacing:.04em;margin-inline-end:auto}
.home img{width:30px;height:auto;filter:invert(1)}
.bno{font-size:12.5px;color:#AEBBD2}
.pill{font:500 11.5px/1 Hayyakum,Manrope,sans-serif;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.08);color:#AEBBD2;white-space:nowrap}
.pill.accepted,.pill.signed{background:rgba(63,224,232,.14);color:var(--horizon)}
.pill.expired{background:rgba(224,123,224,.14);color:#E07BE0}
.pdf{font:600 13px Hayyakum,Manrope,sans-serif;border:0;border-radius:999px;padding:9px 16px;background:#EEF2F6;color:var(--night);cursor:pointer}
.pdf:hover{background:#fff}
.sheet{width:210mm;min-height:297mm;margin:28px auto 56px;background:#fff;padding:20mm 19mm 16mm;box-shadow:0 1px 2px rgba(20,23,43,.06),0 18px 50px -20px rgba(20,23,43,.25);border-radius:3px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px}
.logo{width:184px;height:auto;display:block}
.kind{display:flex;flex-direction:column;align-items:flex-end;text-align:end;gap:2px}
.kind span{font:500 10.5px/1 Oswald,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:var(--grey)}
.kind b{font:700 22px/1.25 "EYEN Ammon",Hayyakum,sans-serif;color:var(--ink)}
html[lang=en] .kind span{font-size:15px;letter-spacing:.22em;color:var(--ink)}
.hair{height:2px;margin:18px 0 30px;background:linear-gradient(90deg,var(--horizon),var(--hour) 55%,var(--dusk));border-radius:2px}
html[dir=rtl] .hair{background:linear-gradient(270deg,var(--horizon),var(--hour) 55%,var(--dusk))}
.hero h1{margin:0;font:700 30px/1.3 "EYEN Ammon",Hayyakum,sans-serif;letter-spacing:-.005em;text-wrap:balance}
html[lang=en] .hero h1{font:600 30px/1.2 Manrope,sans-serif;letter-spacing:-.02em}
.hero p{margin:10px 0 0;color:#3d4257;max-width:62ch;text-wrap:pretty}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px 24px;margin:28px 0 0;padding:16px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--rule)}
.meta>div{display:flex;flex-direction:column;gap:4px}
.meta b{font-weight:500;font-size:13.5px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin:26px 0 0}
.pname{font-weight:500;font-size:15px;margin-top:6px}
html[lang=ar] .pname{font:700 16px/1.5 "EYEN Ammon",Hayyakum,sans-serif}
.pline{color:var(--grey);font-size:12.5px;line-height:1.75}
.pline bdi{font-size:12.5px}
.block{margin:34px 0 0}
.sec{margin:34px 0 12px}
.block .sec{margin-top:0}
.items{width:100%;border-collapse:collapse}
.items th{font:500 10px/1.4 Oswald,Hayyakum,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--grey);text-align:start;padding:0 0 9px;border-bottom:1px solid var(--ink)}
html[lang=ar] .items th{font:500 11.5px/1.4 Hayyakum,sans-serif;letter-spacing:0}
.items td{padding:13px 0;border-bottom:1px solid var(--rule);vertical-align:top}
.items .n{width:34px;color:var(--grey);font:400 11.5px Oswald,sans-serif;padding-top:15px}
.items th.n{padding-top:0}
.items .it b{display:block;font-weight:500;font-size:14px}
html[lang=ar] .items .it b{font-weight:500}
.items .it span{display:block;color:var(--grey);font-size:12.5px;line-height:1.75;margin-top:2px;max-width:56ch}
.items .c{text-align:center;width:56px}
.items .e{text-align:end;width:104px;white-space:nowrap}
.items td bdi.num{display:inline-block;padding-top:1px}
.mute{color:var(--grey)}
.totals{margin:14px 0 0 auto;width:min(290px,100%);display:grid;gap:4px}
html[dir=rtl] .totals{margin:14px auto 0 0}
.totals>div{display:flex;justify-content:space-between;align-items:baseline;color:var(--grey);font-size:13px}
.totals .grand{color:var(--ink);border-top:1px solid var(--ink);margin-top:6px;padding-top:12px}
.totals .grand span{font-weight:500}
.totals .grand b{font:300 30px/1 Oswald,sans-serif;letter-spacing:.01em}
.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:28px 0 0}
.facts>div{background:var(--soft);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:4px}
.facts span{font-size:11.5px;color:var(--grey)}
html[lang=en] .facts span{font:500 10px/1.4 Oswald,sans-serif;letter-spacing:.14em;text-transform:uppercase}
.facts b{font-weight:500;font-size:13.5px;line-height:1.6}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin:30px 0 0}
.list ul{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:5px}
.list li{display:flex;gap:10px;font-size:13px;line-height:1.7}
.list i{font:400 13px/1.7 Oswald,sans-serif;font-style:normal;color:var(--hour);flex:none;width:10px}
.small{font-size:12.5px;color:#3d4257;margin:22px 0 0}
.lab.inl{margin-inline-end:8px}
.notes{margin:26px 0 0;padding:14px 16px;border-inline-start:2px solid var(--hour);background:linear-gradient(90deg,rgba(46,98,255,.05),transparent)}
html[dir=rtl] .notes{background:linear-gradient(270deg,rgba(46,98,255,.05),transparent)}
.notes p{margin:6px 0 0;font-size:13px;color:#3d4257}
.clauses{display:grid;gap:18px}
.clauses article{break-inside:avoid}
.clauses h3{margin:0 0 4px;display:flex;align-items:baseline;gap:12px;font:700 15px/1.5 "EYEN Ammon",Hayyakum,sans-serif}
html[lang=en] .clauses h3{font:600 14.5px/1.5 Manrope,sans-serif}
.clauses h3 em{font:400 12px Oswald,sans-serif;font-style:normal;color:var(--hour);min-width:20px}
.clauses p{margin:0;padding-inline-start:32px;color:#2c3146;font-size:13.25px;line-height:1.95;text-wrap:pretty}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin:40px 0 0;break-inside:avoid}
.sig{border-top:1px solid var(--ink);padding-top:12px}
.sname{font-weight:500;font-size:15px;margin-top:6px}
html[lang=ar] .sname{font:700 16px/1.5 "EYEN Ammon",Hayyakum,sans-serif}
.sline{font-size:12px;color:var(--grey)}
.blank{height:34px;border-bottom:1px solid var(--rule);display:flex;align-items:flex-end;padding-bottom:4px}
.blank span{font-size:11px;color:var(--grey)}
.acc{margin:30px 0 0}
.acc:empty{display:none}
.accept{border:1px solid var(--rule);border-radius:14px;padding:20px 22px;background:linear-gradient(180deg,#fff,#f8f9fc)}
.accept h4{margin:0;font:700 17px/1.4 "EYEN Ammon",Hayyakum,sans-serif}
html[lang=en] .accept h4{font:600 16px Manrope,sans-serif}
.accept p{margin:6px 0 14px;font-size:13px;color:var(--grey);max-width:60ch}
.frow{display:flex;gap:10px}
.frow input{flex:1;min-width:0;font:500 15px Hayyakum,Manrope,sans-serif;padding:12px 14px;border:1px solid #cfd4e2;border-radius:10px;color:var(--ink);background:#fff;outline:none}
.frow input:focus{border-color:var(--hour);box-shadow:0 0 0 3px rgba(46,98,255,.14)}
.frow button{font:600 14px Hayyakum,Manrope,sans-serif;border:0;border-radius:10px;padding:0 20px;background:var(--night);color:#fff;cursor:pointer;white-space:nowrap}
.frow button:hover{background:#111842}
.frow button:disabled{opacity:.5;cursor:default}
.chk{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;color:#3d4257;cursor:pointer}
.chk input{width:16px;height:16px;accent-color:var(--hour)}
.msg{min-height:0;font-size:12.5px;margin-top:8px}
.msg.err{color:#c0392b}
.stamp{border:1px solid rgba(46,98,255,.35);border-radius:14px;padding:16px 20px;background:rgba(46,98,255,.04)}
.sh{display:flex;align-items:center;gap:10px;font-weight:500;font-size:15px}
.sh i{width:24px;height:24px;border-radius:50%;background:var(--hour);color:#fff;font:600 12px/24px Manrope,sans-serif;font-style:normal;text-align:center}
.stamp dl{display:grid;grid-template-columns:repeat(3,auto);justify-content:start;gap:4px 34px;margin:12px 0 0}
.stamp dt{font-size:11px;color:var(--grey)}
.stamp dd{margin:0;font-size:13px;font-weight:500}
.femail{width:100%;font:500 15px Manrope,sans-serif;padding:12px 14px;border:1px solid #cfd4e2;border-radius:10px;color:var(--ink);background:#fff;outline:none;margin-bottom:10px;text-align:left}
.femail:focus{border-color:var(--hour);box-shadow:0 0 0 3px rgba(46,98,255,.14)}
.next{margin-top:14px;padding:18px 20px;border-radius:14px;background:var(--night);color:#EEF2F6;display:grid;gap:6px;justify-items:start}
.next .lab{color:#3FE0E8}
.next h4{margin:0;font:700 18px/1.4 "EYEN Ammon",Hayyakum,sans-serif}
html[lang=en] .next h4{font:600 17px Manrope,sans-serif}
.next p{margin:0;color:#AEBBD2;font-size:13.5px;max-width:62ch}
.next .go{margin-top:8px;display:inline-block;padding:11px 20px;border-radius:999px;background:#EEF2F6;color:var(--night);font:600 14px Hayyakum,Manrope,sans-serif;text-decoration:none}
.next .go:hover{background:#fff}
.wsmail,.wsok{font-size:12px;color:#6F7FA0}
.wsok{color:#3FE0E8}
@media print{.next{display:none}}
.expired{padding:14px 18px;border-radius:12px;background:#fbf2fb;color:#8a3f8a;font-size:13.5px}
.foot{margin-top:auto;padding-top:36px;display:flex;justify-content:space-between;gap:10px;font:400 10.5px Oswald,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#9aa1b5}
.gone{max-width:520px;margin:18vh auto;padding:0 24px;text-align:center;color:var(--grey)}
.gone img{width:184px;height:auto;margin-bottom:22px}
@media screen and (max-width:860px){
 html{background:#fff}
 .sheet{width:auto;min-height:0;margin:0;padding:30px 20px 26px;box-shadow:none;border-radius:0}
 .bin{padding:10px 14px;gap:10px}.home span{display:none}.bno{display:none}
 .hero h1{font-size:25px}
 .parties,.cols,.sigs{grid-template-columns:1fr;gap:22px}
 .facts{grid-template-columns:1fr}
 .meta{grid-template-columns:1fr 1fr}
 .items .u{display:none}
 .frow{flex-direction:column}.frow button{padding:13px 20px}
 .stamp dl{grid-template-columns:1fr}
 .clauses p{padding-inline-start:0}
 .logo{width:150px}
}
@page{size:A4;margin:15mm 15mm 16mm;@bottom-center{content:counter(page) " / " counter(pages);font:9px Oswald,sans-serif;color:#9aa1b5;letter-spacing:.1em}}
@media print{
 html,body{background:#fff}
 .bar,.accept,.msg{display:none!important}
 .sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none;border-radius:0;display:block}
 .foot{padding-top:28px}
 .facts,.cols,.stamp,.sigs,.totals,.items tr{break-inside:avoid}
 a{color:inherit;text-decoration:none}
}`;
