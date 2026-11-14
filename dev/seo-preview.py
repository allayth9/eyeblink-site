import re,subprocess,importlib.util,html,sys
spec=importlib.util.spec_from_file_location('sa','dev/seo-apply.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def old(path):
    s=subprocess.run(['git','show','HEAD~1:'+path],capture_output=True).stdout.decode('utf-8')
    t=re.search(r'<title>(.*?)</title>',s,re.S).group(1)
    d=re.search(r'<meta name="description" content="(.*?)">',s,re.S).group(1)
    return html.unescape(t),html.unescape(d)
def card(u,t,d,cls):
    return f'<div class="serp {cls}"><div class="u">{html.escape(u)}</div><div class="t">{html.escape(t)}</div><div class="d">{html.escape(d[:160]+("…" if len(d)>160 else ""))}</div></div>'
rows=''
for lang,folder,i in (('ar','',0),('en','en/',2)):
    rows+=f'<h2>{"النسخة العربية" if lang=="ar" else "النسخة الإنجليزية"}</h2>'
    for p in m.P:
        ot,od=old(f'{folder}{p}.html'); nt,nd=m.P[p][i],m.P[p][i+1]
        u=m.url(p,lang).replace('https://','').replace('/',' › ').rstrip(' › ')
        rows+=f'<div class="pair"><div><b>قبل</b>{card(u,ot,od,"old")}</div><div><b>بعد</b>{card(u,nt,nd,"new")}</div></div>'
open('dev/seo-preview.html','w',encoding='utf-8').write('''<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>معاينة السيو</title>
<style>body{background:#04061A;color:#EEF2F6;font:16px/1.7 system-ui,sans-serif;margin:0;padding:24px 16px;max-width:1100px;margin-inline:auto}h1{font-size:26px}h2{margin-top:36px;color:#3FE0E8}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0}@media(max-width:760px){.pair{grid-template-columns:1fr}}
.serp{background:#fff;border-radius:12px;padding:14px 16px;color:#202124;direction:inherit}.serp .u{font-size:12px;color:#5f6368;direction:ltr;text-align:right}.serp .t{font-size:19px;color:#1a0dab;margin:2px 0}.serp .d{font-size:13.5px;color:#4d5156}
.old{opacity:.65}.pair b{display:block;margin-bottom:4px;color:#AEBBD2}.box{background:#0B1236;border-radius:12px;padding:14px 18px;margin:14px 0}code{color:#3FE0E8}li{margin:4px 0}</style>
<h1>ما رح يتغيّر بالموقع: كيف رح يبين بنتائج Google</h1>
<p>هي معاينة شكلية لنتيجة البحث (Google بيقرر بالنهاية، وممكن يقص الوصف). ما في شي طالع على الموقع الحي.</p>
<div class=box><b>تغييرات غير مرئية بالزائر (بالكود فقط):</b><ul><li>بيانات منظّمة (JSON-LD): الاسم البديل «إيبلينك ستوديو»، قائمة الخدمات، مسار التنقّل (Breadcrumbs)</li><li>وصف وصورة للمشاركة على واتساب وتويتر</li><li>ملف <code>llms.txt</code> لمحركات الذكاء الاصطناعي</li><li>عنوان تبويب المتصفح بيصير هو العنوان الجديد (بدل «Eyeblink Studio» فقط)</li></ul><b>ما بيتغيّر أبداً:</b> تصميم الصفحات، نصوصها الظاهرة، الصور، الأسعار، الأعمال.</div>'''+rows)
