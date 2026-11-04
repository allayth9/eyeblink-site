"""Generates every page shell (Arabic at the root, English in /en) from content.json.
Text lives in content.json and is edited from /admin; this file holds layout and interface labels only.
Run from the project folder:  python tools/build.py"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from worlds import WORLDS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARK = open(os.path.join(ROOT, "assets/img/mark.svg"), encoding="utf-8").read()
CONTENT = json.load(open(os.path.join(ROOT, "content.json"), encoding="utf-8"))
SITE = "https://eyeblinkstudio.com"   # the one official address; other hosts redirect here
THREE = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
SERVICES = [s["id"] for s in CONTENT["services"]]
import hashlib
def _v(path):
    return hashlib.md5(open(os.path.join(ROOT, path),"rb").read()).hexdigest()[:8]
ASSET_V = {k: _v(k) for k in ["assets/css/site.css","assets/js/bg.js","assets/js/render.js","assets/js/site.js","assets/js/account.js","assets/js/brands.js","assets/img/favicon.svg"]}
PAGES = ["index", "services", *[f"service-{s}" for s in SERVICES], "work", "pricing", "about", "contact", "account", "privacy"]

UI = {
 "ar": {"dir": "rtl", "arrow": "←", "nav": [("services", "الخدمات"), ("work", "أعمالنا"), ("pricing", "الباقات"), ("about", "من نحن"), ("contact", "تواصل")],
        "cta": "ابدأ مشروعك", "menu": "القائمة", "lang_label": "English", "lang_short": "EN", "home": "Eyeblink Studio — الصفحة الرئيسية", "quick": "روابط سريعة",
        "explore": "استكشف الخدمات", "all_work": "كل الأعمال", "all_pkgs": "كل الباقات", "close": "إغلاق",
        "tools": "الأدوات التي نعمل بها", "deliver": "ماذا تستلم", "svc_pkgs": "باقات هذه الخدمة", "others": "خدمات أخرى", "see_pkgs": "شاهد الباقات",
        "reel": "شاهد الشوريل", "order_h": "طلبك", "sel": "اخترت", "svc_h": "اطلب خدمة", "svc_p": "سعر واضح لكل فيديو. اختر الخدمة، أضف ما تحتاجه، وأرسل الطلب.", "acct": "حسابي", "f_step1": "ماذا تحتاج؟", "f_step2": "تفاصيل المشروع", "addons": "إضافات", "total": "المجموع التقديري",
        "f_name": "الاسم أو اسم الجهة", "f_contact": "واتساب أو إنستغرام (اختياري)", "f_details": "تفاصيل المشروع: نوع الفيديو، المدة، الفكرة",
        "f_link": "رابط المواد (اختياري)", "f_deadline": "الموعد المستهدف (اختياري)", "send": "أرسل الطلب", "copy": "نسخ التفاصيل", "open_ig": "افتح إنستغرام", "again": "طلب جديد",
        "soon": "قريباً", "ig_follow": "تابع الجديد على إنستغرام", "closed_h": "الطلبات متوقفة مؤقتاً", "closed_p": "نستقبل الطلبات حالياً عبر إنستغرام فقط.", "home_l": "الرئيسية",
        "titles": {"index": "Eyeblink Studio — مونتاج وموشن غرافيك وأفلام", "services": "الخدمات", "work": "أعمالنا", "pricing": "الباقات والأسعار", "about": "من نحن", "contact": "تواصل", "account": "حسابي", "privacy": "سياسة الخصوصية"},
        "slots": [("EDITING", "أعمال المونتاج"), ("MOTION", "أعمال الموشن غرافيك"), ("FILMS", "الأفلام والإعلانات")]},
 "en": {"dir": "ltr", "arrow": "→", "nav": [("services", "Services"), ("work", "Work"), ("pricing", "Pricing"), ("about", "About"), ("contact", "Contact")],
        "cta": "Start a project", "menu": "Menu", "lang_label": "العربية", "lang_short": "ع", "home": "Eyeblink Studio — home", "quick": "Quick links",
        "explore": "Explore services", "all_work": "All work", "all_pkgs": "All packages", "close": "Close",
        "tools": "Tools we work with", "deliver": "What you get", "svc_pkgs": "Packages for this service", "others": "Other services", "see_pkgs": "See packages",
        "reel": "Watch the showreel", "order_h": "Your request", "sel": "You picked", "svc_h": "Order a service", "svc_p": "A clear price per video. Pick the service, add what you need, and send the request.", "acct": "My account", "f_step1": "What do you need?", "f_step2": "Project details", "addons": "Add-ons", "total": "Estimated total",
        "f_name": "Your name or company", "f_contact": "WhatsApp or Instagram (optional)", "f_details": "Project details: type of video, length, idea",
        "f_link": "Link to materials (optional)", "f_deadline": "Target date (optional)", "send": "Send request", "copy": "Copy details", "open_ig": "Open Instagram", "again": "New request",
        "soon": "Coming soon", "ig_follow": "Follow new work on Instagram", "closed_h": "Requests are paused", "closed_p": "For now we take requests on Instagram only.", "home_l": "Home",
        "titles": {"index": "Eyeblink Studio — Editing, Motion & Film", "services": "Services", "work": "Work", "pricing": "Packages & Pricing", "about": "About", "contact": "Contact", "account": "My account", "privacy": "Privacy policy"},
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

def reviews_block(U):
    return '''<section class="block" hidden data-sec="reviews"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">REVIEWS</span><h2 data-t="reviews.h"></h2></div></div>
  <div class="revs" data-list="reviews"></div>
</div></section>'''

def cta_band(U):
    return f'''<section class="block" data-sec="cta"><div class="wrap"><div class="cta glass rv">
  <div><span class="eyebrow">CONTACT</span><h2 data-t="contact.h"></h2><p data-t="contact.p"></p></div>
  <div class="handle"><div class="cta-links" data-cta-links></div></div>
</div></div></section>'''

def slots(U):
    return "".join(f'<article class="slot glass rv"><div class="rec"><span>{k}</span><b>● REC</b></div><div class="frame"></div><div><h3>{h}</h3><span class="soon">{U["soon"]}</span></div></article>' for k, h in U["slots"])

CRUMB_AR = {"SERVICES": "الخدمات", "PRICING": "الباقات", "ABOUT": "من نحن", "CONTACT": "تواصل", "PRIVACY": "الخصوصية", "WORK": "أعمالنا", "ACCOUNT": "حسابي"}
LANG = ["ar"]
def crumb_word(c):
    return f'<b class="ar">/ {CRUMB_AR.get(c, c)}</b>' if LANG[0] == "ar" else f"<b>/ {c}</b>"

def page_hero(crumb, h_path, p_path, extra="", hid=""):
    return f'''<section class="page-hero"{f' id="{hid}"' if hid else ""}><div class="wrap intro">
  <span class="eyebrow crumb">EYEBLINK {crumb_word(crumb)}</span>
  <h1 data-t="{h_path}"></h1>
  <p class="lead" data-t="{p_path}"></p>{extra}
</div></section>'''

def p_index(U, lang):
    return f'''<section class="hero"><div class="wrap grid">
  <div class="intro">
    <span class="eyebrow" data-t="hero.eyebrow"></span>
    <h1 data-t="hero.h1"></h1>
    <p class="lead" data-t="hero.lead"></p>
    <div class="actions"><a class="btn btn-primary" href="pricing.html">{U["cta"]}</a><a class="btn btn-glass glass" href="services.html"><span class="dot"></span>{U["explore"]}</a>
      <button class="btn btn-glass glass reel-btn" type="button" id="reelBtn" hidden><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>{U["reel"]}</button></div>
  </div>
  <div class="stage" data-field-anchor aria-hidden="true">
    <svg class="ring" viewBox="0 0 400 400" direction="ltr" style="direction:ltr"><defs><path id="rp" d="M200,200 m-186,0 a186,186 0 1,1 372,0 a186,186 0 1,1 -372,0"/></defs><text><textPath href="#rp" textLength="1160" lengthAdjust="spacing">EYEBLINK STUDIO • VIDEO EDIT • MOTION GRAPHICS • FILM •</textPath></text></svg>
    <div class="orb glass opening">{HERO_MARK}</div>
    <button class="reel-card glass" type="button" id="reelCard" hidden aria-label="{U["reel"]}"><video muted loop playsinline autoplay preload="metadata"></video><span><i></i>SHOWREEL</span></button>
  </div>
</div></section>
<section class="block" style="padding-top:0" data-show="showStats" data-sec="stats"><div class="wrap"><div class="stats" data-list="stats"></div></div></section>
<section class="block teaser" data-sec="services"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">SERVICES</span><h2 data-t="servicesIntro.h"></h2></div><p data-t="servicesIntro.p"></p></div>
  <div class="grid3" data-list="services-cards" data-mode="teaser"></div>
</div></section>
<section class="block teaser" data-show="showWorkTeaser" data-sec="work"><div class="wrap">
  <div class="head rv" id="workHead"><div><span class="eyebrow">SHOWREEL • COMING SOON</span><h2 data-t="work.h"></h2></div><p data-t="work.p"></p></div>
  <div class="grid3" id="workGrid" data-limit="3">{slots(U)}</div>
  <div class="center"><a class="btn btn-glass glass" href="work.html"><span class="dot"></span>{U["all_work"]} <span class="arr">{U["arrow"]}</span></a></div>
</div></section>
<section class="block teaser" data-show="showPackagesTeaser" data-sec="packages"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">PRICING</span><h2 data-t="packages.h"></h2></div><p data-t="packages.p"></p></div>
  <div class="pkgs" data-list="packages-teaser"></div>
  <div class="center"><a class="btn btn-glass glass" href="pricing.html"><span class="dot"></span>{U["all_pkgs"]} <span class="arr">{U["arrow"]}</span></a></div>
</div></section>
{reviews_block(U)}
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
    <span class="eyebrow crumb"><a href="services.html">{"SERVICES" if lang == "en" else '<span class="ar">الخدمات</span>'}</a> {f'<b>/ {svc["label"]}</b>' if lang == "en" else f'<b class="ar">/ {L(svc["name"], lang)}</b>'}</span>
    <h1 data-s="name">{L(svc["name"], lang)}</h1>
    <p class="lead" data-s="body"></p>
    <ul class="tags" data-list="svc-tags"></ul>
    <div class="actions" style="margin-top:22px"><a class="btn btn-primary" href="pricing.html">{U["cta"]}</a><a class="btn btn-glass glass" href="#pk"><span class="dot"></span>{U["see_pkgs"]}</a></div>
    <div class="svc-tools"><span class="tl">{U["tools"]}</span><ul class="tools" data-list="svc-tools"></ul></div>
  </div>
  <div class="world glass" aria-hidden="true">{WORLDS[sid]()}</div>
  <div class="svc-tools m"><span class="tl">{U["tools"]}</span><ul class="tools" data-list="svc-tools"></ul></div>
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

PATTERN = "".join(f'<div><span>{"EYEBLINK STUDIO   ·   " * 8}</span><span>{"EYEBLINK STUDIO   ·   " * 8}</span></div>' for _ in range(4))
def order_modal(U, lang):
    en = lang == "en"
    T = (lambda a, e: e if en else a)
    return f'''<div class="lightbox olb" id="olb" hidden role="dialog" aria-modal="true" aria-labelledby="olbTitle">
  <div class="lb-pattern" aria-hidden="true">{PATTERN}</div>
  <canvas class="lb-waves" aria-hidden="true"></canvas><i class="owc" aria-hidden="true"></i>
  <div class="oscroll"><div class="box obox glass">
    <div class="bar2"><div><span class="eyebrow">ORDER</span><h3 id="olbTitle" data-ot="title">{U["order_h"]}</h3></div><button class="close glass" id="olbClose" type="button" aria-label="{U["close"]}">×</button></div>
    <div class="order" id="order">
      <aside class="osum">
        <div class="ocard"><span class="k" id="selKind"></span><h4 id="selName"></h4><p id="selDesc"></p>
          <div class="oprice"><b id="selPrice"></b><span id="selUnit"></span></div><ul class="ofeats" id="selFeats"></ul></div>
        <div class="oqty" id="qtyRow" hidden><span data-ot="qty">{T("عدد الفيديوهات", "Number of videos")}</span><div class="stepper"><button type="button" data-q="-1" aria-label="−">−</button><output id="qty">1</output><button type="button" data-q="1" aria-label="+">+</button></div></div>
        <p class="olab" data-ot="addons">{U["addons"]}</p>
        <ul class="addons" id="addons" aria-label="{U["addons"]}"></ul>
        <div class="total"><span>{U["total"]}</span><b id="total">—</b></div>
        <p class="fine" id="priceNote"></p>
        <p class="fine" id="payNote"></p>
      </aside>
      <form class="form" id="orderForm" novalidate>
        <label><span data-ot="details">{U["f_details"]}</span><textarea id="f-details" name="details" required data-otp="detailsPh" placeholder="{T("مثال: ريل لإطلاق منتج جديد، 30 ثانية، أسلوب سريع وحماسي…", "e.g. a launch reel for a new product, 30 seconds, fast and energetic…")}"></textarea></label>
        <fieldset class="plats" id="platforms"><legend data-ot="platforms">{T("موقع النشر المستهدف", "Target platform")}</legend><div class="opts"></div></fieldset>
        <div class="row2"><label><span data-ot="link">{U["f_link"]}</span><input id="f-link" name="link" type="url" inputmode="url" dir="ltr" placeholder="Drive / Dropbox / WeTransfer"></label>
        <label><span data-ot="deadline">{U["f_deadline"]}</span><input id="f-deadline" name="deadline" type="date"></label></div>
        <div class="row2"><label><span data-ot="contact">{U["f_contact"]}</span><input id="f-contact" name="contact" dir="auto"></label>
        <label><span data-ot="pay">{T("طريقة الدفع المفضّلة", "Preferred payment")}</span><select id="f-pay" name="pay"></select></label></div>
        <div class="onext"><p class="olab" data-ot="next">{T("شو بيصير بعد الإرسال؟", "What happens next?")}</p><ol id="oNext"></ol></div>
        <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;inset-inline-start:-9999px;width:1px;height:1px;opacity:0">
        <button class="btn btn-primary osend" type="submit"><span data-ot="send">{U["send"]}</span> <span class="arr">{U["arrow"]}</span></button>
        <p class="who" id="who"></p>
      </form>
    </div>
    <div class="done" id="orderDone" hidden>
      <span class="eyebrow">REQUEST</span><h2></h2><p class="muted"></p>
      <div class="code"></div>
      <textarea id="orderText" class="form" style="width:100%;min-height:150px;font:inherit;color:var(--light);background:rgba(4,6,26,.55);border:0;border-radius:12px;padding:12px" readonly hidden></textarea>
      <div class="actions" style="justify-content:center"><button class="btn btn-glass glass copy" type="button" hidden>{U["copy"]}</button><a class="btn btn-primary" data-ig href="{IG}" target="_blank" rel="noopener">{U["open_ig"]}</a></div>
      <p class="fine pay"></p>
    </div>
  </div></div>
</div>'''

def p_pricing(U, lang):
    return page_hero("PRICING", "packages.h", "packages.p") + f'''
<section class="block" style="padding-top:0"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">SERVICES</span><h2>{U["svc_h"]}</h2></div><p>{U["svc_p"]}</p></div>
  <div class="pkgs" data-list="packages" data-kind="service"></div>
  <div class="plan" data-list="packages" data-kind="package"></div>
  <div class="order glass" id="orderClosed" hidden><div><span class="eyebrow">ORDERS</span><h2>{U["closed_h"]}</h2><p class="muted" style="margin:0">{U["closed_p"]}</p></div><div class="handle"><a class="btn btn-primary" data-ig href="{IG}" target="_blank" rel="noopener">{U["open_ig"]}</a></div></div>
</div></section>
<section class="block" data-show="showPayments"><div class="wrap">
  <div class="head"><div><span class="eyebrow">PAYMENT</span><h2 data-t="payments.h"></h2></div><p data-t="payments.p"></p></div>
  <ul class="paylist" data-list="payments"></ul>
</div></section>
{reviews_block(U)}
<section class="block"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">FAQ</span><h2 data-t="faq.h"></h2></div></div>
  <div class="faq" data-list="faq"></div>
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
  <div class="cta-links wide" data-contact-extra></div>'''
    return page_hero("CONTACT", "contact.h", "contact.p", extra) + '''
<section class="block" style="padding-top:clamp(24px,4vw,48px)"><div class="wrap">
  <div class="head rv"><div><span class="eyebrow">BRIEF</span><h2 data-t="contact.briefH"></h2></div></div>
  <ul class="brief" data-list="brief"></ul>
</div></section>'''

PRIVACY = {
 "ar": [("ما نجمعه", ["عند إنشاء حساب أو إرسال طلب نحفظ: اسمك، بريدك الإلكتروني، تفاصيل الطلب التي تكتبها، والرسائل بينك وبيننا داخل الموقع.", "إن سجّلت عبر Google نستلم من Google اسمك وبريدك الإلكتروني فقط، ولا نصل إلى أي بيانات أخرى في حسابك.", "كلمة السر تُحفظ مشفّرة، ولا يمكن لأحد قراءتها، بما في ذلك نحن."]),
        ("لماذا نجمعه", ["لتنفيذ طلبك، والتواصل معك بخصوصه، وإظهار حالته في حسابك. لا نستخدم بياناتك لأي غرض آخر."]),
        ("مع من نشاركها", ["لا نبيع بياناتك ولا نستخدمها للإعلانات. لتشغيل الموقع نعتمد على مزوّدين يعالجون جزءاً منها نيابةً عنا فقط:", "Cloudflare: استضافة الموقع وتخزين حسابك وطلباتك ورسائلك وملفاتك.", "Resend: إرسال الإيميلات إليك (تأكيد الطلب، الرسائل، الفواتير، الدعوات)، فيصلها بريدك ومحتوى الرسالة.", "Google: فقط إن اخترت الدخول عبر Google، فنستلم اسمك وبريدك.", "Telegram: تصل إلى الاستوديو تنبيهات داخلية بالطلبات الجديدة والرسائل، وفيها اسمك وبريدك وتفاصيل الطلب.", "عند تفعيل إشعارات WhatsApp لاحقاً، لن نرسل لك أي رسالة إلا بموافقتك، وستُذكر هنا."]),
        ("ملفات تعريف الارتباط والإحصائيات", ["نستخدم ملف ارتباط واحداً ضرورياً ليبقى تسجيل دخولك فعّالاً. لا نستخدم ملفات تتبّع أو إعلانات.", "نعدّ الزيارات بشكل مجهول لنعرف أي الصفحات مفيدة ومن أين يصل الزوار (الصفحة، الدولة، نوع الجهاز، الموقع الذي أحالك). لا نحفظ عنوان IP ولا أي بيانات تعرّف بك، ولا نشاركها مع أي جهة."]),
        ("حقوقك", ["يمكنك طلب نسخة من بياناتك أو حذف حسابك وكل ما يتعلق به في أي وقت عبر البريد: hello@eyeblinkstudio.com"]),
        ("التحديثات", ["قد نحدّث هذه السياسة عند الحاجة، وتظهر أحدث نسخة دائماً في هذه الصفحة. آخر تحديث: نوفمبر 2026."])],
 "en": [("What we collect", ["When you create an account or send a request we store your name, email address, the request details you write, and the messages between you and us on the site.", "If you sign in with Google we receive only your name and email address from Google. We cannot access anything else in your Google account.", "Passwords are stored hashed. Nobody can read them, including us."]),
        ("Why", ["To deliver your request, talk to you about it, and show its progress in your account. We do not use your data for anything else."]),
        ("Sharing", ["We never sell your data or use it for ads. To run the site we rely on providers that process part of it on our behalf only:", "Cloudflare: hosts the site and stores your account, requests, messages and files.", "Resend: sends our e-mails to you (request confirmations, messages, invoices, invitations), so it receives your address and the message.", "Google: only if you choose to sign in with Google; we receive your name and e-mail.", "Telegram: the studio receives internal alerts about new requests and messages, including your name, e-mail and request details.", "If WhatsApp notifications are added later, we will only message you with your consent, and they will be listed here."]),
        ("Cookies and statistics", ["We use one essential cookie that keeps you signed in. No tracking or advertising cookies.", "We count visits anonymously to learn which pages help and where visitors come from (page, country, device type, the site that sent you). We never store your IP address or anything that identifies you, and we share none of it."]),
        ("Your rights", ["You can ask for a copy of your data or have your account and everything linked to it deleted at any time: hello@eyeblinkstudio.com"]),
        ("Updates", ["We may update this policy when needed; the latest version always lives on this page. Last updated: November 2026."])]}

def p_privacy(U, lang):
    body = "".join(f'<h2>{h}</h2>' + "".join(f"<p>{x}</p>" for x in ps) for h, ps in PRIVACY[lang])
    return f'''<section class="page-hero"><div class="wrap intro"><span class="eyebrow crumb">EYEBLINK {crumb_word("PRIVACY")}</span><h1>{U["titles"]["privacy"]}</h1></div></section>
<section class="block" style="padding-top:0"><div class="wrap"><div class="legal glass">{body}</div></div></section>'''

def p_account(U, lang):
    return '<section class="page-hero acct-page"><div class="wrap"><div id="acct" class="acct"></div></div></section>'

def html_attr(s): return str(s).replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")

def clip(s, n=158):
    s = " ".join(str(s or "").split())
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0] + "…"

# one description per page, from the content people actually read there
def page_desc(lang, page, svc):
    C = CONTENT
    pick = {"index": C["hero"]["lead"], "services": C["servicesIntro"]["p"], "work": C["work"]["p"], "pricing": C["packages"]["p"],
            "about": C["about"]["lead"], "contact": C["contact"]["p"], "account": C["hero"]["lead"],
            "privacy": {"ar": "كيف يتعامل Eyeblink Studio مع بياناتك: ما نجمعه، لماذا، ومع من لا نشاركه.", "en": "How Eyeblink Studio handles your data: what we collect, why, and who we never share it with."}}
    v = svc["body"] if svc else pick.get(page, C["hero"]["lead"])
    return clip(L(v, lang))

# structured data so search engines understand the studio, each service and the FAQ
def json_ld(lang, page, svc, title, desc):
    org = {"@type": "ProfessionalService", "@id": SITE + "/#studio", "name": "Eyeblink Studio", "url": SITE + "/",
           "logo": SITE + "/assets/img/email-logo.png", "image": SITE + "/assets/img/og.jpg",
           "description": clip(L(CONTENT["hero"]["lead"], lang), 300),
           "sameAs": ["https://instagram.com/" + CONTENT["site"]["instagram"]],
           "areaServed": ["AE", "SA", "OM", "QA", "KW", "BH", "SY"],
           "knowsAbout": [L(s["name"], lang) for s in CONTENT["services"]], "priceRange": "$$"}
    email = (CONTENT.get("settings") or {}).get("email")
    if email: org["email"] = email
    graph = [org, {"@type": "WebPage", "@id": url(lang, page), "url": url(lang, page), "name": title, "description": desc,
                   "inLanguage": lang, "isPartOf": {"@type": "WebSite", "@id": SITE + "/#site", "url": SITE + "/", "name": "Eyeblink Studio"}}]
    if svc:
        graph.append({"@type": "Service", "name": L(svc["name"], lang), "serviceType": svc["label"], "description": clip(L(svc["body"], lang), 300),
                      "provider": {"@id": SITE + "/#studio"}, "areaServed": org["areaServed"], "url": url(lang, page)})
    if page == "pricing":
        for it in (CONTENT.get("packages") or {}).get("items", []):
            o = {"@type": "Offer", "name": L(it["name"], lang), "description": L(it.get("desc", {}), lang), "seller": {"@id": SITE + "/#studio"}, "url": url(lang, page) + "#" + it["id"]}
            if it.get("price") not in (None, ""): o.update({"price": str(it["price"]), "priceCurrency": "USD"})
            graph.append(o)
        faq = (CONTENT.get("faq") or {}).get("items", [])
        if faq: graph.append({"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": L(f["q"], lang), "acceptedAnswer": {"@type": "Answer", "text": L(f["a"], lang)}} for f in faq]})
    return json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False).replace("</", "<\\/")

def url(lang, page):
    path = ("en/" if lang == "en" else "") + ("" if page == "index" else page + ".html")
    return f"{SITE}/{path}"

def build(lang, page):
    LANG[0] = lang
    U = UI[lang]; en = lang == "en"; A = "../" if en else ""
    other = f"../{page}.html" if en else f"en/{page}.html"
    sid = page[8:] if page.startswith("service-") else ""
    svc = [s for s in CONTENT["services"] if s["id"] == sid][0] if sid else None
    title = (L(svc["name"], lang) + " — Eyeblink Studio") if svc else (U["titles"][page] if page == "index" else U["titles"][page] + " — Eyeblink Studio")
    cur = "services" if sid else page
    nav = "".join(f'<li><a href="{k}.html"{" aria-current=\"page\"" if k == cur else ""}>{v}</a></li>' for k, v in U["nav"])
    desc = page_desc(lang, page, svc)
    ld = json_ld(lang, page, svc, title, desc)
    body = (p_service(U, lang, sid) if sid else globals()["p_" + page](U, lang))
    lb = f'''<div class="lightbox" id="lb" hidden role="dialog" aria-modal="true" aria-labelledby="lbTitle">
  <div class="lb-pattern" aria-hidden="true"><div><span>{"EYEBLINK STUDIO   ·   " * 8}</span><span>{"EYEBLINK STUDIO   ·   " * 8}</span></div><div><span>{"EYEBLINK STUDIO   ·   " * 8}</span><span>{"EYEBLINK STUDIO   ·   " * 8}</span></div><div><span>{"EYEBLINK STUDIO   ·   " * 8}</span><span>{"EYEBLINK STUDIO   ·   " * 8}</span></div><div><span>{"EYEBLINK STUDIO   ·   " * 8}</span><span>{"EYEBLINK STUDIO   ·   " * 8}</span></div></div>
  <canvas class="lb-waves" aria-hidden="true"></canvas>
  <div class="box"><div class="bar2"><h3 id="lbTitle"></h3><button class="close glass" id="lbClose" aria-label="{U["close"]}">×</button></div><div class="frame" id="lbFrame"></div><div class="lb-case" id="lbCase" hidden></div></div>
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
<meta name="description" content="{html_attr(desc)}">
<meta name="theme-color" content="#04061A">{'<meta name="robots" content="noindex">' if page=="account" else ""}
<link rel="icon" href="{A}assets/img/favicon.svg?v={ASSET_V["assets/img/favicon.svg"]}" type="image/svg+xml">
<link rel="apple-touch-icon" href="{A}assets/img/apple-touch-icon.png">
<link rel="canonical" href="{url(lang, page)}">
<link rel="alternate" hreflang="ar" href="{url("ar", page)}"><link rel="alternate" hreflang="en" href="{url("en", page)}"><link rel="alternate" hreflang="x-default" href="{url("ar", page)}">
<meta property="og:type" content="website"><meta property="og:url" content="{url(lang, page)}"><meta property="og:site_name" content="Eyeblink Studio"><meta property="og:locale" content="{"en_US" if en else "ar_AR"}">
<meta property="og:title" content="{title}"><meta property="og:description" content="{html_attr(desc)}"><meta property="og:image" content="{SITE}/assets/img/og.jpg"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{title}"><meta name="twitter:image" content="{SITE}/assets/img/og.jpg">
<link rel="stylesheet" href="{A}assets/css/site.css?v={ASSET_V["assets/css/site.css"]}">
<script>if(/(^|\\.)pages\\.dev$|^www\\./.test(location.hostname)&&!/--|^[0-9a-f]{{8}}\\./.test(location.hostname))location.replace("{SITE}"+location.pathname+location.search+location.hash);document.documentElement.classList.add('js');try{{document.documentElement.classList.add('cur-'+(localStorage.getItem('eb-cursor')||'glass'))}}catch(e){{}}try{{if(!sessionStorage.getItem('eb-intro')&&localStorage.getItem('eb-nointro')!=='1'&&!sessionStorage.getItem('eb-cut')&&!matchMedia('(prefers-reduced-motion: reduce)').matches){{sessionStorage.setItem('eb-intro','1');document.documentElement.classList.add('intro-on');setTimeout(function(){{document.documentElement.classList.remove('intro-on')}},3000)}}}}catch(e){{}}try{{if(sessionStorage.getItem('eb-cut')){{document.documentElement.classList.add('arriving');sessionStorage.removeItem('eb-cut');setTimeout(function(){{document.documentElement.classList.remove('arriving')}},1600)}}}}catch(e){{}}</script>
<script type="application/ld+json">{ld}</script>
</head>
<body data-base="{A}" data-page="{page}"{f' data-service="{sid}"' if sid else ""}>
<div class="eb-intro" aria-hidden="true"><i class="seam"></i><i class="lid top"></i><i class="lid bot"></i></div>
<div class="sky" aria-hidden="true"></div>
<canvas id="field" aria-hidden="true"></canvas>
<div class="grain" aria-hidden="true"></div>
<div class="rail" aria-hidden="true"><i></i></div>
<div class="cut-lids" aria-hidden="true"><i></i><i></i></div>
<header class="nav"><div class="wrap"><div class="bar glass"><span class="shade" aria-hidden="true"></span>
  <a class="brand" href="index.html" aria-label="{U["home"]}">{MARK}<span class="wm">EYEBLINK<span>STUDIO</span></span></a>
  <ul class="links" id="links">{nav}</ul>
  <a class="btn btn-primary" href="pricing.html">{U["cta"]}</a>
  <a class="acct-link" href="account.html" aria-label="{U["acct"]}" title="{U["acct"]}"{" aria-current=\"page\"" if page=="account" else ""}><svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 19.5c1.3-3.4 4-5 7.2-5s5.9 1.6 7.2 5"/></svg></a>
  <a class="lang{" ar" if en else ""}" href="{other}" hreflang="{"ar" if en else "en"}" lang="{"ar" if en else "en"}" aria-label="{U["lang_label"]}">{U["lang_short"]}</a>
  <button class="menu-btn" id="menuBtn" aria-label="{U["menu"]}" aria-expanded="false" aria-controls="links"><span></span><span></span></button>
</div></div></header>
<main>
{body}
</main>
{lb}{order_modal(U, lang) if page == "pricing" else ""}
<div class="field-end" data-field-end aria-hidden="true"></div>
<footer><div class="wrap row">
  <a class="brand" href="index.html" aria-label="{U["home"]}">{MARK}<span class="wm">EYEBLINK<span>STUDIO</span></span></a>
  <nav aria-label="{U["quick"]}">{foot_nav}</nav>
  <span class="c"><a href="privacy.html">{U["titles"]["privacy"]}</a> · <a href="{A}admin/index.html" rel="nofollow">© 2026 Eyeblink Studio</a></span>
</div><div class="wrap"><div class="foot2" data-show="showPayments"><ul class="paystrip" data-list="pay-strip" aria-label="Payment methods"></ul></div></div></footer>
<nav class="dock glass" aria-label="{U["menu"]}">{dock}</nav>
<script type="application/json" id="eb-seed">{seed()}</script>
<script src="{THREE}"></script>
<script src="{A}assets/js/bg.js?v={ASSET_V["assets/js/bg.js"]}"></script>
<script src="{A}assets/js/brands.js?v={ASSET_V["assets/js/brands.js"]}"></script>
<script src="{A}assets/js/render.js?v={ASSET_V["assets/js/render.js"]}"></script>
<script src="{A}assets/js/site.js?v={ASSET_V["assets/js/site.js"]}"></script>{f'{chr(10)}<script src="{A}assets/js/account.js?v={ASSET_V["assets/js/account.js"]}"></script>' if page in ("pricing","account") else ""}
</body>
</html>
'''

if __name__ == "__main__":
    n = 0
    for lang in ("ar", "en"):
        for page in PAGES:
            out = os.path.join(ROOT, "en" if lang == "en" else "", f"{page}.html")
            open(out, "w", encoding="utf-8").write(build(lang, page)); n += 1
    # search engines: every public page in both languages; account + admin stay out
    pub = [p for p in PAGES if p != "account"]
    sm = "".join(f'<url><loc>{url(l, p)}</loc><xhtml:link rel="alternate" hreflang="ar" href="{url("ar", p)}"/><xhtml:link rel="alternate" hreflang="en" href="{url("en", p)}"/></url>' for p in pub for l in ("ar", "en"))
    open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' + sm + '</urlset>\n')
    open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8").write(f"User-agent: *\nDisallow: /admin/\nDisallow: /api/\nDisallow: /account.html\nDisallow: /en/account.html\n\nSitemap: {SITE}/sitemap.xml\n")
    # the admin page is hand-written: stamp its css/js with content hashes so a new version is never served from cache
    ap = os.path.join(ROOT, "admin/index.html"); ah = open(ap, encoding="utf-8").read()
    ah = re.sub(r'href="admin\.css(\?v=\w+)?"', f'href="admin.css?v={_v("admin/admin.css")}"', ah)
    ah = re.sub(r'src="admin\.js(\?v=\w+)?"', f'src="admin.js?v={_v("admin/admin.js")}"', ah)
    open(ap, "w", encoding="utf-8").write(ah)
    open(os.path.join(ROOT, "content.js"), "w", encoding="utf-8").write("window.EB_SEED=" + json.dumps(CONTENT, ensure_ascii=False) + ";\n")
    print("built", n, "pages + content.js")
