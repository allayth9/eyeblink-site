# python dev/seo-apply.py  — writes the search titles, descriptions, social tags and JSON-LD of every public page (AR + EN).
# The keyword map lives HERE (one place). Every phrase comes from the studio's real services (content.json): no invented claims.
import json, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
SITE = "https://eyeblinkstudio.com"
BR = "Eyeblink Studio"

# page -> (ar title, ar description, en title, en description)
P = {
 "index": (
  "Eyeblink Studio | آيبلينك استوديو",
  "استوديو إبداعي مستقل متخصص في صناعة المحتوى البصري والمونتاج والموشن جرافيك والإنتاج السينمائي وإعلانات السوشال ميديا في الوطن العربي.",
  "Eyeblink Studio | آيبلينك استوديو",
  "An independent creative studio specialising in visual content, video editing, motion graphics, cinematic production and social media ads across the Arab world."),
 "services": (
  "الخدمات | Eyeblink Studio",
  "مونتاج فيديو احترافي، موشن غرافيك، ريلز وإعلانات سوشال ميديا، وأفلام قصيرة وإعلانات سينمائية. اختر الخدمة وأرسل تفاصيل مشروعك.",
  "Services | Eyeblink Studio",
  "Professional video editing, motion graphics, Reels and social media ads, short films and cinematic ads. Pick a service and send your project details."),
 "service-editing": (
  "المونتاج | Eyeblink Studio",
  "خدمة مونتاج فيديو احترافي: قصّ وترتيب دقيق، تصحيح ألوان، مكساج صوت وموسيقى، ترجمة ونصوص على الشاشة، وتصدير لكل منصة. من اللقطات الخام إلى قصة تُشاهد حتى النهاية.",
  "Video Editing | Eyeblink Studio",
  "Professional video editing: precise cutting, colour correction, sound and music mix, subtitles and on-screen text, and exports for every platform. From raw footage to a story people watch to the end."),
 "service-motion": (
  "الموشن جرافيك | Eyeblink Studio",
  "تصميم موشن غرافيك من الصفر: شعارات متحركة، مقدّمات فيديو، إنفوغرافيك متحرك وتايبوغرافي حركي، بستوريبورد وأسلوب بصري يعكس هوية علامتك.",
  "Motion Graphics | Eyeblink Studio",
  "Motion graphics designed from scratch: logo animation, video intros, animated infographics and kinetic type, with a storyboard and a visual style that reflects your brand."),
 "service-social": (
  "إعلانات السوشال ميديا | Eyeblink Studio",
  "إعلانات فيديو قصيرة للسوشال ميديا: ريلز وقصص وإعلانات ممولة بخطاف بصري يوقف التمرير، مونتاج عمودي 9:16 ونصوص متحركة وترجمة، بنسخ لكل منصة.",
  "Social Media Ads | Eyeblink Studio",
  "Short social media video ads: Reels, Stories and paid ads with a visual hook that stops the scroll, vertical 9:16 editing, animated text and captions, in versions for every platform."),
 "service-films": (
  "الإنتاج السينمائي | Eyeblink Studio",
  "إنتاج سينمائي متكامل: تطوير الفكرة والسكريبت والستوريبورد، توجيه الأداء والإخراج، ثم مونتاج وتلوين سينمائي وتصميم صوت. أفلام قصيرة وإعلانات سينمائية.",
  "Film Production | Eyeblink Studio",
  "Complete film production: idea, script and storyboard, performance direction, then editing, cinematic colour grading and sound design. Short films and cinematic ads."),
 "work": (
  "أعمالنا | Eyeblink Studio",
  "نماذج من أعمال Eyeblink Studio في المونتاج والموشن غرافيك وإعلانات السوشال ميديا والأفلام. شاهد الأعمال وافتح قصة كل مشروع.",
  "Our Work | Eyeblink Studio",
  "Selected work by Eyeblink Studio in video editing, motion graphics, social media ads and film. Watch the projects and open the story behind each one."),
 "pricing": (
  "الباقات والأسعار | Eyeblink Studio",
  "باقات واضحة لمشاريع المونتاج والموشن غرافيك وإعلانات السوشال ميديا والإنتاج السينمائي. اختر الباقة، أضف ما تحتاجه، وأرسل الطلب، ونؤكد التفاصيل قبل أي دفع.",
  "Packages & Pricing | Eyeblink Studio",
  "Clear packages for video editing, motion graphics, social media ads and film projects. Pick a package, add what you need and send the request; we confirm the details before any payment."),
 "about": (
  "من نحن | Eyeblink Studio",
  "إيبلينك ستوديو (Eyeblink Studio) استوديو إبداعي مستقل للمونتاج والموشن غرافيك وإعلانات السوشال ميديا والإنتاج السينمائي، بمعايير عالية وتواصل واضح من أول رسالة إلى آخر تسليم.",
  "About | Eyeblink Studio",
  "Eyeblink Studio is an independent creative studio for video editing, motion graphics, social media ads and film production, with high standards and clear communication from the first message to the final delivery."),
 "contact": (
  "تواصل | Eyeblink Studio",
  "أرسل تفاصيل مشروعك عبر إنستغرام أو من صفحة الباقات: طبيعة الفيديو، المدة التقريبية، والموعد المستهدف، وسنعود إليك بخطة واضحة وخطوات محددة.",
  "Contact | Eyeblink Studio",
  "Send your project details via Instagram or the packages page: the kind of video, the approximate length and the target date, and we'll come back with a clear plan and defined next steps."),
}
SERV = {  # service pages: id → (AR name, EN name, serviceType, AR description, EN description)
 "service-editing": ("المونتاج الاحترافي", "Video Editing", "Video editing"),
 "service-motion": ("الموشن غرافيك", "Motion Graphics", "Motion graphics"),
 "service-social": ("إعلانات السوشال ميديا", "Social Media Ads", "Social media video ads"),
 "service-films": ("الأفلام والإنتاج السينمائي", "Film Production", "Film production"),
}
SEC = {"services": ("الخدمات", "Services"), "work": ("أعمالنا", "Work"), "pricing": ("الباقات والأسعار", "Packages & Pricing"), "about": ("من نحن", "About"), "contact": ("تواصل", "Contact")}

def url(page, lang):
    base = SITE + ("/en/" if lang == "en" else "/")
    return base if page == "index" else base + page

def org(lang):
    ar = lang == "ar"
    names = {k: v for k, v in zip(SERV, [SERV[k] for k in SERV])}
    offers = [{"@type": "Offer", "itemOffered": {"@type": "Service", "name": SERV[k][0 if ar else 1], "url": url(k, lang)}} for k in SERV]
    return {
        "@type": ["ProfessionalService", "Organization"], "@id": SITE + "/#studio", "name": BR,
        "alternateName": (["آيبلينك استوديو", "إيبلينك ستوديو", "ايبلينك ستوديو", "Eyeblink"] if ar else ["Eyeblink"]),
        "url": SITE + "/", "logo": SITE + "/assets/img/email-logo.png", "image": SITE + "/assets/img/og-home.jpg?v=2",
        "slogan": "Every cut is a blink",
        "description": P["index"][1 if ar else 3],
        "sameAs": ["https://instagram.com/eyeblnk"],
        "areaServed": ["AE", "SA", "OM", "QA", "KW", "BH", "SY"],
        "knowsAbout": (["مونتاج الفيديو", "المونتاج الاحترافي", "الموشن غرافيك", "إعلانات السوشال ميديا", "ريلز", "الإنتاج السينمائي", "الأفلام القصيرة", "التلوين السينمائي"]
                       if ar else ["Video editing", "Motion graphics", "Social media video ads", "Reels", "Film production", "Short films", "Colour grading"]),
        "serviceType": (["مونتاج فيديو", "موشن غرافيك", "إعلانات سوشال ميديا", "إنتاج سينمائي"] if ar else ["Video editing", "Motion graphics", "Social media video ads", "Film production"]),
        "hasOfferCatalog": {"@type": "OfferCatalog", "name": ("خدمات Eyeblink Studio" if ar else "Eyeblink Studio services"), "itemListElement": offers},
        "contactPoint": {"@type": "ContactPoint", "email": "info@eyeblinkstudio.com", "contactType": "customer support", "availableLanguage": ["Arabic", "English"]},
        "priceRange": "$$", "email": "info@eyeblinkstudio.com",
    }

def website(lang):
    return {"@type": "WebSite", "@id": SITE + "/#site", "url": SITE + "/", "name": BR, "alternateName": ["Eyeblink"], "inLanguage": ["ar", "en"], "publisher": {"@id": SITE + "/#studio"}}

def crumbs(page, lang):
    ar = lang == "ar"
    items = [("الرئيسية" if ar else "Home", url("index", lang))]
    if page in SERV:
        items += [(SEC["services"][0 if ar else 1], url("services", lang)), (SERV[page][0 if ar else 1], url(page, lang))]
    elif page != "index":
        items += [(SEC[page][0 if ar else 1], url(page, lang))]
    return {"@type": "BreadcrumbList", "@id": url(page, lang) + "#breadcrumb",
            "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(items)]}

def img(page): return SITE + "/assets/img/og-" + (page[8:] + ".jpg" if page.startswith("service-") else "home.jpg?v=2")

def graph(page, lang):
    ar = lang == "ar"; i = 0 if ar else 2
    g = [org(lang), website(lang)]
    wp = {"@type": "CollectionPage" if page in ("services", "work") else "ContactPage" if page == "contact" else "AboutPage" if page == "about" else "WebPage",
          "@id": url(page, lang), "url": url(page, lang), "name": P[page][i], "description": P[page][i + 1], "inLanguage": lang,
          "isPartOf": {"@id": SITE + "/#site"}, "about": {"@id": SITE + "/#studio"}, "primaryImageOfPage": {"@type": "ImageObject", "url": img(page), "width": 1200, "height": 630}}
    if page != "index": wp["breadcrumb"] = {"@id": url(page, lang) + "#breadcrumb"}
    g.append(wp)
    if page != "index": g.append(crumbs(page, lang))
    if page in SERV:
        g.append({"@type": "Service", "@id": url(page, lang) + "#service", "name": SERV[page][0 if ar else 1], "serviceType": SERV[page][2],
                  "description": P[page][i + 1], "provider": {"@id": SITE + "/#studio"}, "areaServed": ["AE", "SA", "OM", "QA", "KW", "BH", "SY"], "url": url(page, lang), "inLanguage": lang})
    return {"@context": "https://schema.org", "@graph": g}

def esc(s): return s.replace("&", "&amp;").replace('"', "&quot;")

def apply(path, page, lang):
    s = open(path, encoding="utf-8", newline="").read()
    i = 0 if lang == "ar" else 2
    T, D = P[page][i], P[page][i + 1]
    def sub(pat, rep, flags=re.S, must=True):
        nonlocal s
        n = len(re.findall(pat, s, flags))
        if must and n != 1: raise SystemExit(f"{path}: {pat[:40]} matched {n}")
        s = re.sub(pat, lambda m: rep, s, count=1, flags=flags)
    sub(r"<title>.*?</title>", f"<title>{esc(T)}</title>")
    sub(r'<meta name="description" content=".*?">', f'<meta name="description" content="{esc(D)}">')
    sub(r'<meta property="og:title" content=".*?">', f'<meta property="og:title" content="{esc(T)}">')
    sub(r'<meta property="og:description" content=".*?">', f'<meta property="og:description" content="{esc(D)}">')
    sub(r'<meta name="twitter:title" content=".*?">', f'<meta name="twitter:title" content="{esc(T)}"><meta name="twitter:description" content="{esc(D)}">')
    if 'og:image:alt' not in s:
        sub(r'(<meta property="og:image" content="[^"]*">)', '\\1' if False else None or "", must=False) if False else None
        s = re.sub(r'(<meta property="og:image" content="[^"]*">)', lambda m: m.group(1) + '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="EYEBLINK STUDIO — Every cut is a blink">', s, count=1)
    ld = json.dumps(graph(page, lang), ensure_ascii=False)
    sub(r'<script type="application/ld\+json">.*?</script>', f'<script type="application/ld+json">{ld}</script>')
    open(path, "w", encoding="utf-8", newline="").write(s)
    return T, D

if __name__ == "__main__":
    for page in P:
        for lang, folder in (("ar", ""), ("en", "en/")):
            T, D = apply(f"{folder}{page}.html", page, lang)
            print(f"{folder}{page:16s} title {len(T):3d}  desc {len(D):3d}")
