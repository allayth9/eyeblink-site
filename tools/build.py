"""Generates every page shell (Arabic at the root, English in /en) from content.json.
Text lives in content.json and is edited from /admin; this file holds layout and interface labels only.
Run from the project folder:  python tools/build.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from worlds import WORLDS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARK = open(os.path.join(ROOT, "assets/img/mark.svg"), encoding="utf-8").read()
CONTENT = json.load(open(os.path.join(ROOT, "content.json"), encoding="utf-8"))
THREE = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
SERVICES = [s["id"] for s in CONTENT["services"]]
import hashlib
def _v(path):
    return hashlib.md5(open(os.path.join(ROOT, path),"rb").read()).hexdigest()[:8]
ASSET_V = {k: _v(k) for k in ["assets/css/site.css","assets/js/bg.js","assets/js/render.js","assets/js/site.js"]}
PAGES = ["index", "services", *[f"service-{s}" for s in SERVICES], "work", "pricing", "about", "contact"]

UI = {
 "ar": {"dir": "rtl", "arrow": "←", "nav": [("services", "الخدمات"), ("work", "أعمالنا"), ("pricing", "الباقات"), ("about", "من نحن"), ("contact", "تواصل")],
        "cta": "ابدأ مشروعك", "menu": "القائمة", "lang_label": "English", "lang_short": "EN", "home": "Eyeblink Studio — الصفحة الرئيسية", "quick": "روابط سريعة",
        "explore": "استكشف الخدمات", "all_work": "كل الأعمال", "all_pkgs": "كل الباقات", "close": "إغلاق",
        "tools": "الأدوات التي نعمل بها", "deliver": "ماذا تستلم", "svc_pkgs": "باقات هذه الخدمة", "others": "خدمات أخرى", "see_pkgs": "شاهد الباقات",
        "order_h": "طلبك", "sel": "الباقة المختارة", "addons": "إضافات", "total": "المجموع التقديري",
        "f_name": "الاسم أو اسم الجهة", "f_contact": "وسيلة التواصل (إنستغرام، واتساب، أو إيميل)", "f_details": "تفاصيل المشروع: نوع الفيديو، المدة، الفكرة",
        "f_link": "رابط المواد (اختياري)", "f_deadline": "الموعد المستهدف (اختياري)", "send": "أرسل الطلب", "copy": "نسخ التفاصيل", "open_ig": "افتح إنستغرام", "again": "طلب جديد",
        "soon": "قريباً", "ig_follow": "تابع الجديد على إنستغرام", "closed_h": "الطلبات متوقفة مؤقتاً", "closed_p": "نستقبل الطلبات حالياً عبر إنستغرام فقط.", "home_l": "الرئيسية",
        "titles": {"index": "Eyeblink Studio — مونتاج وموشن غرافيك وأفلام", "services": "الخدمات", "work": "أعمالنا", "pricing": "الباقات والأسعار", "about": "من نحن", "contact": "تواصل"},
        "slots": [("EDITING", "أعمال المونتاج"), ("MOTION", "أعمال الموشن غرافيك"), ("FILMS", "الأفلام والإعلانات")]},
 "en": {"dir": "ltr", "arrow": "→", "nav": [("services", "Services"), ("work", "Work"), ("pricing", "Pricing"), ("about", "About"), ("contact", "Contact")],
        "cta": "Start a project", "menu": "Menu", "lang_label": "العربية", "lang_short": "ع", "home": "Eyeblink Studio — home", "quick": "Quick links",
        "explore": "Explore services", "all_work": "All work", "all_pkgs": "All packages", "close": "Close",
        "tools": "Tools we work with", "deliver": "What you get", "svc_pkgs": "Packages for this service", "others": "Other services", "see_pkgs": "See packages",
        "order_h": "Your request", "sel": "Selected package", "addons": "Add-ons", "total": "Estimated total",
        "f_name": "Your name or company", "f_contact": "How to reach you (Instagram, WhatsApp or email)", "f_details": "Project details: type of video, length, idea",
        "f_link": "Link to materials (optional)", "f_deadline": "Target date (optional)", "send": "Send request", "copy": "Copy details", "open_ig": "Open Instagram", "again": "New request",
        "soon": "Coming soon", "ig_follow": "Follow new work on Instagram", "closed_h": "Requests are paused", "closed_p": "For now we take requests on Instagram only.", "home_l": "Home",
        "titles": {"index": "Eyeblink Studio — Editing, Motion & Film", "services": "Services", "work": "Work", "pricing": "Packages & Pricing", "about": "About", "contact": "Contact"},
        "slots": [("EDITING", "Editing work"), ("MOTION", "Motion graphics work"), ("FILMS", "Films & ads")]},
}
IG = "https://instagram.com/" + CONTENT["site"]["instagram"]
HERO_DEFS = ('<defs><linearGradient id="heroFlow" gradientUnits="userSpaceOnUse" x1="180" y1="380" x2="900" y2="700" spreadMethod="reflect">'
  '<stop offset="0" stop-color="#FFFFFF"/><stop offset=".2" stop-color="#E2FAFF"/><stop offset=".4" stop-color="#FFFFFF"/>'
  '<stop offset=".6" stop-color="#E8E3FF"/><stop offset=".8" stop-color="#FDEBFF"/><stop offset="1" stop-color="#FFFFFF"/>'
  '<animateTransform attributeName="gradientTransform" type="rotate" values="0 541 540;360 541 540" dur="10s" repeatCount="indefinite"/></linearGradient></defs>')
HERO_MARK = MARK.replace('aria-hidden="true">', 'aria-hidden="true">' + HERO_DEFS, 1)
DOCK_ICONS = {
 "index": '<svg viewBox="0 0 24 24"><path d="M4 11.5 12 5l8 6.5V20H14.5v-5h-5v5H4z"/></svg>',
 "services": '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></svg>',
 "work": '<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m10.5 9.5 4 2.5-4 2.5z"/></svg>',
 "pricing": '<svg viewBox="0 0 24 24"><path d="M4 12.6V5.5A1.5 1.5 0 0 1 5.5 4h7.1L20 11.4 11.4 20z"/><circle cx="8.5" cy="8.5" r="1.3"/></svg>',
 "contact": '<svg viewBox="0 0 24 24"><path d="M4.5 6.5h15v10h-9l-4 3v-3h-2z"/></svg>',
}

def seed():
    return json.dumps(CONTENT, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

def L(v, lang): return v.get(lang) or v.get("ar") if isinstance(v, dict) else v

def cta_band(U):
    return f'''<section class="block"><div class="wrap"><div class="cta glass rv">
  <div><span class="eyebrow">CONTACT</span><h2 data-t="contact.h"></h2><p data-t="contact.p"></p></div>
  <div class="handle"><span class="at latin" data-ig>@{CONTENT["site"]["instagram"]}</span><a class="btn btn-primary" data-ig href="{IG}" target="_blank" rel="noopener">{U["cta"]}</a></div>
</div></div></section>'''

def slots(U):
    return "".join(f'<article class="slot glass rv"><div class="rec"><span>{k}</span><b>● REC</b></div><div class="frame"></div><div><h3>{h}</h3><span class="soon">{U["soon"]}</span></div></article>' for k, h in U["slots"])

def page_hero(crumb, h_path, p_path, extra="", hid=""):
    return f'''<section class="page-hero"{f' id="{hid}"' if hid else ""}><div class="wrap intro">
  <span class="eyebrow crumb">EYEBLINK <b>/ {crumb}</b></span>
  <h1 data-t="{h_path}"></h1>
  <p class="lead" data-t="{p_path}"></p>{extra}
</div></section>'''

def p_index(U, lang):
    return f'''<section class="hero"><div class="wrap grid">
  <div class="intro">
    <span class="eyebrow" data-t="hero.eyebrow"></span>
    <h1 data-t="hero.h1"></h1>
    <p class="lead" data-t="hero.lead"></p>
    <div class="actions"><a class="btn btn-primary" href="pricing.html">{U["cta"]}</a><a class="btn btn-glass glass" href="services.html"><span class="dot"></span>{U["explore"]}</a></div>
  </div>
  <div class="stage" data-field-anchor aria-hidden="true">
    <svg class="ring" viewBox="0 0 400 400" direction="ltr" style="direction:ltr"><defs><path id="rp" d="M200,200 m-186,0 a186,186 0 1,1 372,0 a186,186 0 1,1 -372,0"/></defs><text><textPath href="#rp" textLength="1160" lengthAdjust="spacing">EYEBLINK STUDIO • VIDEO EDIT • MOTION GRAPHICS • FILM •</textPath></text></svg>
    <div class="orb glass opening">{HERO_MARK}</div>
  </div>
</div></section>
<section class="block" style="padding-top:0" data-show="showStats"><div class="wrap"><div class="stats" data-list="stats"></div></div></section>
<section class="block"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">SERVICES</span><h2 data-t="servicesIntro.h"></h2></div><p data-t="servicesIntro.p"></p></div>
  <div class="grid3" data-list="services-cards" data-mode="teaser"></div>
</div></section>
<section class="block" data-show="showWorkTeaser"><div class="wrap">
  <div class="head rv" id="workHead"><div><span class="eyebrow">SHOWREEL • COMING SOON</span><h2 data-t="work.h"></h2></div><p data-t="work.p"></p></div>
  <div class="grid3" id="workGrid" data-limit="3">{slots(U)}</div>
  <div class="center"><a class="btn btn-glass glass" href="work.html"><span class="dot"></span>{U["all_work"]} <span class="arr">{U["arrow"]}</span></a></div>
</div></section>
<section class="block" data-show="showPackagesTeaser"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">PRICING</span><h2 data-t="packages.h"></h2></div><p data-t="packages.p"></p></div>
  <div class="pkgs" data-list="packages-teaser"></div>
  <div class="center"><a class="btn btn-glass glass" href="pricing.html"><span class="dot"></span>{U["all_pkgs"]} <span class="arr">{U["arrow"]}</span></a></div>
</div></section>
{cta_band(U)}'''

def p_services(U, lang):
    return page_hero("SERVICES", "servicesIntro.h", "servicesIntro.p") + f'''
<section class="block" style="padding-top:0"><div class="wrap"><div class="grid3" data-list="services-cards" data-mode="full"></div></div></section>
<section class="block"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">PROCESS</span><h2 data-t="process.h"></h2></div><p data-t="process.p"></p></div>
  <div class="timeline" id="tl" aria-hidden="true"><i></i></div>
  <ol class="steps" data-list="process"></ol>
</div></section>
{cta_band(U)}'''

def p_service(U, lang, sid):
    svc = [s for s in CONTENT["services"] if s["id"] == sid][0]
    return f'''<section><div class="wrap svc-hero">
  <div class="intro">
    <span class="eyebrow crumb"><a href="services.html">SERVICES</a> <b>/ {svc["label"]}</b></span>
    <h1 data-s="name">{L(svc["name"], lang)}</h1>
    <p class="lead" data-s="body"></p>
    <ul class="tags" data-list="svc-tags"></ul>
    <div class="actions" style="margin-top:22px"><a class="btn btn-primary" href="pricing.html">{U["cta"]}</a><a class="btn btn-glass glass" href="#pk"><span class="dot"></span>{U["see_pkgs"]}</a></div>
  </div>
  <div class="world glass" aria-hidden="true">{WORLDS[sid]()}</div>
</div></section>
<section class="block" style="padding-top:clamp(20px,3vw,40px)"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">TOOLS</span><h2>{U["tools"]}</h2></div></div>
  <ul class="tools" data-list="svc-tools"></ul>
</div></section>
<section class="block"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">DELIVERABLES</span><h2>{U["deliver"]}</h2></div></div>
  <ul class="deliver" data-list="svc-deliver"></ul>
</div></section>
<section class="block" id="pk"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">PACKAGES</span><h2>{U["svc_pkgs"]}</h2></div></div>
  <div class="pkgs" data-list="svc-packages"></div>
</div></section>
<section class="block"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">MORE</span><h2>{U["others"]}</h2></div></div>
  <nav class="svc-nav" data-list="svc-nav"></nav>
</div></section>
{cta_band(U)}'''

def p_work(U, lang):
    return f'''<section class="page-hero" id="workHead"><div class="wrap intro">
  <span class="eyebrow">SHOWREEL • COMING SOON</span>
  <h1 data-t="work.h"></h1>
  <p class="lead" data-t="work.p"></p>
</div></section>
<section class="block" style="padding-top:0"><div class="wrap">
  <div class="filters" id="filters" hidden></div>
  <div class="grid3" id="workGrid">{slots(U)}</div>
  <div class="center"><a class="btn btn-glass glass" data-ig href="{IG}" target="_blank" rel="noopener"><span class="dot"></span>{U["ig_follow"]}</a></div>
</div></section>
{cta_band(U)}'''

def p_pricing(U, lang):
    return page_hero("PRICING", "packages.h", "packages.p") + f'''
<section class="block" style="padding-top:0"><div class="wrap">
  <div class="pkgs" data-list="packages"></div>
  <div class="order glass" id="orderClosed" hidden><div><span class="eyebrow">ORDERS</span><h2>{U["closed_h"]}</h2><p class="muted" style="margin:0">{U["closed_p"]}</p></div><div class="handle"><a class="btn btn-primary" data-ig href="{IG}" target="_blank" rel="noopener">{U["open_ig"]}</a></div></div>
  <div class="order glass" id="order">
    <div>
      <span class="eyebrow">ORDER</span>
      <h2>{U["order_h"]}</h2>
      <p class="muted" style="margin:0">{U["sel"]}: <b id="selName" style="color:var(--light)"></b></p>
      <ul class="addons" id="addons" aria-label="{U["addons"]}"></ul>
      <div class="total"><span>{U["total"]}</span><b id="total">—</b></div>
      <p class="fine" id="priceNote" style="margin-top:12px"></p>
      <p class="fine" id="payNote" style="margin-top:6px"></p>
    </div>
    <form class="form" id="orderForm" novalidate>
      <label>{U["f_name"]}<input id="f-name" name="name" required autocomplete="name"></label>
      <label>{U["f_contact"]}<input id="f-contact" name="contact" required></label>
      <label>{U["f_details"]}<textarea id="f-details" name="details" required></textarea></label>
      <div class="row2"><label>{U["f_link"]}<input id="f-link" name="link" type="url" inputmode="url"></label>
      <label>{U["f_deadline"]}<input id="f-deadline" name="deadline" type="date"></label></div>
      <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;inset-inline-start:-9999px;width:1px;height:1px;opacity:0">
      <button class="btn btn-primary" type="submit" style="justify-content:center">{U["send"]}</button>
    </form>
  </div>
  <div class="done glass" id="orderDone" hidden>
    <span class="eyebrow">REQUEST</span><h2></h2><p class="muted"></p>
    <div class="code"></div>
    <textarea id="orderText" class="form" style="width:100%;min-height:150px;font:inherit;color:var(--light);background:rgba(4,6,26,.55);border:0;border-radius:12px;padding:12px" readonly hidden></textarea>
    <div class="actions" style="justify-content:center"><button class="btn btn-glass glass copy" type="button" hidden>{U["copy"]}</button><a class="btn btn-primary" data-ig href="{IG}" target="_blank" rel="noopener">{U["open_ig"]}</a></div>
    <p class="fine pay"></p>
  </div>
</div></section>
<section class="block" data-show="showPayments"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">PAYMENT</span><h2 data-t="payments.h"></h2></div><p data-t="payments.p"></p></div>
  <ul class="paylist" data-list="payments"></ul>
</div></section>'''

def p_about(U, lang):
    return page_hero("ABOUT", "about.h1", "about.lead") + f'''
<section class="block" style="padding-top:0"><div class="wrap">
  <div class="story glass rv"><span class="eyebrow">STORY</span><h2 data-t="about.bioH"></h2><div class="prose" data-list="bio"></div><ul class="values" data-list="values"></ul></div>
</div></section>
<section class="block"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">PRINCIPLES</span><h2 data-t="about.principlesH"></h2></div></div>
  <div class="principles" data-list="principles"></div>
</div></section>
{cta_band(U)}'''

def p_contact(U, lang):
    extra = f'''
  <div class="actions" style="margin-top:6px"><a class="btn btn-primary" data-ig href="{IG}" target="_blank" rel="noopener">{U["cta"]}</a><a class="btn btn-glass glass" href="pricing.html"><span class="dot"></span>{UI[lang]["nav"][2][1]}</a><span class="btn btn-glass glass latin" style="user-select:all" data-ig>@{CONTENT["site"]["instagram"]}</span></div>
  <div class="actions" data-contact-extra style="margin-top:10px"></div>'''
    return page_hero("CONTACT", "contact.h", "contact.p", extra) + '''
<section class="block" style="padding-top:clamp(24px,4vw,48px)"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">BRIEF</span><h2 data-t="contact.briefH"></h2></div></div>
  <ul class="brief" data-list="brief"></ul>
</div></section>'''

def build(lang, page):
    U = UI[lang]; en = lang == "en"; A = "../" if en else ""
    other = f"../{page}.html" if en else f"en/{page}.html"
    sid = page[8:] if page.startswith("service-") else ""
    svc = [s for s in CONTENT["services"] if s["id"] == sid][0] if sid else None
    title = (L(svc["name"], lang) + " — Eyeblink Studio") if svc else (U["titles"][page] if page == "index" else U["titles"][page] + " — Eyeblink Studio")
    cur = "services" if sid else page
    nav = "".join(f'<li><a href="{k}.html"{" aria-current=\"page\"" if k == cur else ""}>{v}</a></li>' for k, v in U["nav"])
    desc = L(CONTENT["hero"]["lead"], lang)
    body = (p_service(U, lang, sid) if sid else globals()["p_" + page](U, lang))
    lb = f'''<div class="lightbox" id="lb" hidden role="dialog" aria-modal="true" aria-labelledby="lbTitle">
  <div class="lb-pattern" aria-hidden="true"><div><span>{"EYEBLINK STUDIO   ·   " * 8}</span><span>{"EYEBLINK STUDIO   ·   " * 8}</span></div><div><span>{"EYEBLINK STUDIO   ·   " * 8}</span><span>{"EYEBLINK STUDIO   ·   " * 8}</span></div><div><span>{"EYEBLINK STUDIO   ·   " * 8}</span><span>{"EYEBLINK STUDIO   ·   " * 8}</span></div><div><span>{"EYEBLINK STUDIO   ·   " * 8}</span><span>{"EYEBLINK STUDIO   ·   " * 8}</span></div></div>
  <canvas class="lb-waves" aria-hidden="true"></canvas>
  <div class="box"><div class="bar2"><h3 id="lbTitle"></h3><button class="close glass" id="lbClose" aria-label="{U["close"]}">×</button></div><div class="frame" id="lbFrame"></div></div>
</div>''' if page in ("index", "work") else ""
    foot_nav = "".join(f'<a href="{k}.html">{v}</a>' for k, v in U["nav"])
    labels = dict(U["nav"]); labels["index"] = U["home_l"]
    dock = "".join(f'<a href="{k}.html"{" aria-current=\"page\"" if k == cur or (k=="index" and page=="index") else ""}>{DOCK_ICONS[k]}<span>{labels[k]}</span></a>' for k in ["index","services","work","pricing","contact"])
    return f'''<!doctype html>
<html lang="{lang}" dir="{U["dir"]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#04061A">
<link rel="icon" href="{A}assets/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{A}assets/img/apple-touch-icon.png">
<link rel="alternate" hreflang="{"ar" if en else "en"}" href="{other}">
<meta property="og:type" content="website"><meta property="og:title" content="{title}"><meta property="og:description" content="{desc}"><meta property="og:image" content="{A}assets/img/og.jpg"><meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="{A}assets/css/site.css?v={ASSET_V["assets/css/site.css"]}">
<script>document.documentElement.classList.add('js');try{{if(sessionStorage.getItem('eb-cut')){{document.documentElement.classList.add('arriving');sessionStorage.removeItem('eb-cut');setTimeout(function(){{document.documentElement.classList.remove('arriving')}},1600)}}}}catch(e){{}}</script>
</head>
<body data-base="{A}"{f' data-service="{sid}"' if sid else ""}>
<div class="sky" aria-hidden="true"></div>
<canvas id="field" aria-hidden="true"></canvas>
<div class="grain" aria-hidden="true"></div>
<div class="rail" aria-hidden="true"><i></i></div>
<div class="cut-lids" aria-hidden="true"><i></i><i></i></div>
<header class="nav"><div class="wrap"><div class="bar glass"><span class="shade" aria-hidden="true"></span>
  <a class="brand" href="index.html" aria-label="{U["home"]}">{MARK}<span class="wm">EYEBLINK<span>STUDIO</span></span></a>
  <ul class="links" id="links">{nav}</ul>
  <a class="btn btn-primary" href="pricing.html">{U["cta"]}</a>
  <a class="lang{" ar" if en else ""}" href="{other}" hreflang="{"ar" if en else "en"}" lang="{"ar" if en else "en"}" aria-label="{U["lang_label"]}">{U["lang_short"]}</a>
  <button class="menu-btn" id="menuBtn" aria-label="{U["menu"]}" aria-expanded="false" aria-controls="links"><span></span><span></span></button>
</div></div></header>
<main>
{body}
</main>
{lb}
<div class="field-end" data-field-end aria-hidden="true"></div>
<footer><div class="wrap row">
  <a class="brand" href="index.html" aria-label="{U["home"]}">{MARK}<span class="wm">EYEBLINK<span>STUDIO</span></span></a>
  <nav aria-label="{U["quick"]}">{foot_nav}</nav>
  <a class="c" href="{A}admin/index.html" rel="nofollow">© 2026 Eyeblink Studio</a>
</div><div class="wrap"><div class="foot2" data-show="showPayments"><ul class="paystrip" data-list="pay-strip" aria-label="Payment methods"></ul></div></div></footer>
<nav class="dock glass" aria-label="{U["menu"]}">{dock}</nav>
<script type="application/json" id="eb-seed">{seed()}</script>
<script src="{THREE}"></script>
<script src="{A}assets/js/bg.js?v={ASSET_V["assets/js/bg.js"]}"></script>
<script src="{A}assets/js/render.js?v={ASSET_V["assets/js/render.js"]}"></script>
<script src="{A}assets/js/site.js?v={ASSET_V["assets/js/site.js"]}"></script>
</body>
</html>
'''

if __name__ == "__main__":
    n = 0
    for lang in ("ar", "en"):
        for page in PAGES:
            out = os.path.join(ROOT, "en" if lang == "en" else "", f"{page}.html")
            open(out, "w", encoding="utf-8").write(build(lang, page)); n += 1
    open(os.path.join(ROOT, "content.js"), "w", encoding="utf-8").write("window.EB_SEED=" + json.dumps(CONTENT, ensure_ascii=False) + ";\n")
    print("built", n, "pages + content.js")
