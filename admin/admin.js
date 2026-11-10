/* Eyeblink admin — edits content.json through /api (Cloudflare) or, without a server, as a local draft. */
(function(){
  var API='../api', PW='', LIVE=false, C=null, SAVED='', TAB='today', ORDERS=[], P=null, PSAVED='', OFILTER='all', USERS=null;
  var $=function(s,r){return (r||document).querySelector(s)};
  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function toast(t,bad){ var d=$('#toast'); d.textContent=t; d.className='toast'+(bad?' bad':''); d.hidden=false; clearTimeout(d._t); d._t=setTimeout(function(){d.hidden=true},2600); }
  function get(o,p){ return p.split('.').reduce(function(a,k){return a==null?a:a[k]},o); }
  function set(o,p,v){ var ks=p.split('.'), last=ks.pop(); var t=ks.reduce(function(a,k){ if(a[k]==null) a[k]=/^\d+$/.test(k)?[]:{}; return a[k]; },o); t[last]=v; }
  function bi(a,e){ return {ar:a||'',en:e||''}; }
  function headers(extra){ var h={'authorization':'Bearer '+PW}; for(var k in extra) h[k]=extra[k]; return h; }
  var onHttp=/^https?:/.test(location.protocol);

  /* ---------------- automatic English ----------------
     Arabic is the source. Every {ar,en} text gets its English from /api/translate when an Arabic field is left
     (blur) and again before publishing, whenever the English is empty or does not belong to the current Arabic.
     Whether an English belongs to its Arabic is remembered per text pair (fingerprint "arabic:english"), not per
     position, so reordering works or packages changes nothing:
       C._auto  pairs written by the translator (shown with «تلقائي»)
       C._ok    pairs where the English was typed by hand: kept until that Arabic changes
       the pairs already published count as matching. */
  function fp(s){ var h=5381; s=String(s); for(var i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(36); }
  function isText(v){ return typeof v==='string' || (Array.isArray(v) && v.every(function(x){return typeof x==='string'})); }
  function biPairs(o,base,out){
    out=out||[]; if(!o||typeof o!=='object') return out;
    if(!Array.isArray(o)){ var ks=Object.keys(o);
      if(ks.length && 'ar' in o && ks.every(function(k){return k==='ar'||k==='en'}) && isText(o.ar) && (o.en==null||isText(o.en))){ out.push({p:base,o:o}); return out; } }
    Object.keys(o).forEach(function(k){ if(!base && (k==='_auto'||k==='_ok')) return; biPairs(o[k], base?base+'.'+k:k, out); });
    return out;
  }
  function arText(o){ return Array.isArray(o.ar)? o.ar.join('\n') : String(o.ar||''); }
  function enText(o){ return Array.isArray(o.en)? o.en.join('\n') : String(o.en||''); }
  function enEmpty(o){ return !enText(o).trim(); }
  function pk(o){ return fp(arText(o))+':'+fp(enText(o)); }
  var PUB={src:null,set:{}};
  function pubOk(k){
    if(PUB.src!==SAVED){ PUB.src=SAVED; PUB.set={}; try{ biPairs(JSON.parse(SAVED||'{}'),'').forEach(function(x){ if(!enEmpty(x.o)) PUB.set[pk(x.o)]=1; }); }catch(_){} }
    return !!PUB.set[k];
  }
  function inSync(o){ var k=pk(o); return !!((C._auto&&C._auto[k]) || (C._ok&&C._ok[k]) || pubOk(k)); }
  function needsEn(x){ return !!arText(x.o).trim() && (enEmpty(x.o) || !inSync(x.o)); }
  function enInputs(p){ return document.querySelectorAll('[data-p="'+p.replace(/"/g,'')+'.en"]'); }
  function pairAt(p){ return biPairs(C,'').filter(function(y){return y.p===p})[0]; }
  function showEn(x){ [].forEach.call(enInputs(x.p),function(el){ el.value=enText(x.o); }); decorate(); }
  function decorate(){ if(!C) return; var auto=C._auto||{};
    [].forEach.call(document.querySelectorAll('[data-p$=".en"]'),function(el){ var x=pairAt(el.dataset.p.slice(0,-3)); el.parentNode.classList.toggle('is-auto',!!(x&&!enEmpty(x.o)&&auto[pk(x.o)])); }); }
  // keep only the marks of texts that still exist
  function pruneMarks(){ var live={}; biPairs(C,'').forEach(function(x){ live[pk(x.o)]=1; });
    ['_auto','_ok'].forEach(function(m){ if(C[m]) Object.keys(C[m]).forEach(function(k){ if(!live[k]) delete C[m][k]; }); }); }
  var TR_OFF=false, TR_BUSY=null;
  function autoEnglish(only){
    if(TR_OFF||!LIVE||!C) return Promise.resolve(0);
    var todo=biPairs(C,'').filter(function(x){ return (!only||x.p===only) && needsEn(x); }).slice(0,80);
    if(!todo.length) return Promise.resolve(0);
    var items={}; todo.forEach(function(x){ items[x.p]=arText(x.o); });
    todo.forEach(function(x){ [].forEach.call(enInputs(x.p),function(el){ el.classList.add('translating'); }); });
    return fetch(API+'/translate',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({items:items})})
      .then(function(r){ if(r.status===501){ TR_OFF=true; throw new Error('off'); } if(!r.ok) throw new Error('fail'); return r.json(); })
      .then(function(j){ var n=0; C._auto=C._auto||{};
        todo.forEach(function(x){ var en=j.items&&j.items[x.p]; if(!en||arText(x.o)!==items[x.p]) return;   // skipped, or the Arabic changed meanwhile
          x.o.en=Array.isArray(x.o.ar)? en.split('\n').map(function(s){return s.trim()}).filter(Boolean) : en;
          C._auto[pk(x.o)]=1; n++; showEn(x); });
        if(n){ dirty(); saveDraft(); } return n; })
      .catch(function(e){ if(e.message==='off') toast('الترجمة التلقائية تحتاج تفعيل Workers AI على Cloudflare (مرة واحدة).',true); return 0; })
      .then(function(n){ todo.forEach(function(x){ [].forEach.call(enInputs(x.p),function(el){ el.classList.remove('translating'); }); }); return n; });
  }
  // everything still missing, in rounds of 80 (the first publish after this feature may have many empty English fields)
  function autoEnglishAll(){ var round=0; return (function next(){ return autoEnglish().then(function(n){ return n && ++round<6 ? next() : null; }); })(); }
  // English typed by hand belongs to the Arabic as it is now (runs after the field's value reaches C)
  document.addEventListener('input',function(e){ var p=e.target.dataset&&e.target.dataset.p; if(!p || !/\.en$/.test(p) || !C) return;
    setTimeout(function(){ var x=pairAt(p.slice(0,-3)); if(!x||enEmpty(x.o)) return; C._ok=C._ok||{}; C._ok[pk(x.o)]=1; decorate(); dirty(); saveDraft(); },0); });
  // leaving an Arabic field: translate it now; emptied → its English is cleared too
  document.addEventListener('change',function(e){ var p=e.target.dataset&&e.target.dataset.p; if(!p || !/\.ar$/.test(p) || !C) return;
    var b=p.slice(0,-3), x=pairAt(b);
    if(x && !arText(x.o).trim() && !enEmpty(x.o)){ x.o.en=Array.isArray(x.o.ar)?[]:''; showEn(x); dirty(); saveDraft(); return; }
    TR_BUSY=autoEnglish(b); });

  /* ---------------- schema: what can be edited, and how ---------------- */
  var SVC=function(){ return (C.services||[]).map(function(s){return [s.id, (s.name&&s.name.ar)||s.id]}); };
  var TABS=[
    {id:'today', title:'اليوم', today:1},
    {id:'home', title:'الرئيسية', grp:'محتوى الموقع', secs:[
      {h:'شريط الإطلاق (Early Access)', hint:'سطر رفيع تحت القائمة العلوية بكل صفحات الموقع. الزائر يقدر يسكّره. يختفي وحده بعد تاريخ الانتهاء أو لما يكتمل العدد. اكتب أرقاماً حقيقية فقط.', fields:[
        {p:'launch.show', t:'check', l:'إظهار شريط الإطلاق'},
        {p:'launch.text', t:'bi', l:'النص', hint:'مثال: إطلاق Eyeblink Studio · نستقبل عدداً محدوداً من المشاريع بشروط الإطلاق'},
        {row:[{p:'launch.cta', t:'bi', l:'نص الرابط'},{p:'launch.link', t:'text', l:'الرابط', ltr:1, hint:'مثال: pricing.html أو contact.html'}]},
        {row:[{p:'launch.total', t:'num', l:'عدد المشاريع الكلي'},{p:'launch.taken', t:'num', l:'المحجوز منها'},{p:'launch.until', t:'date', l:'ينتهي بتاريخ (اختياري)'}]},
        {p:'launch.counter', t:'check', l:'إظهار العدّاد («تبقّى 3 من 5»)'} ]},
      {h:'العنوان الرئيسي', fields:[
        {p:'hero.eyebrow', t:'text', l:'السطر الصغير فوق العنوان', ltr:1},
        {p:'hero.h1', t:'bi', l:'العنوان', hint:'لتلوين جزء بالتدرّج ضعه بين <span class="grad"> و </span>'},
        {p:'hero.lead', t:'bita', l:'الفقرة تحت العنوان'} ]},
      {h:'خانة الأرقام', hint:'تظهر تحت العنوان في الصفحة الرئيسية. اكتب أرقاماً دقيقة فقط.', rep:{p:'stats', name:function(x){return (x.value||'')+' '+((x.label&&x.label.ar)||'')}, add:function(){return {value:'',label:bi()}},
        fields:[{p:'value', t:'text', l:'الرقم', ltr:1},{p:'label', t:'bi', l:'الوصف'}]}},
      {h:'الشوريل', hint:'يظهر زر «شاهد الشوريل» في الواجهة عند وضع رابط. المعاينة القصيرة (اختيارية) تعمل تلقائياً بلا صوت بجانب الشعار: 6–10 ثوانٍ، أقل من 5MB.', fields:[
        {row:[{p:'hero.reel.type', t:'select', l:'مصدر الفيديو', opts:function(){return [['vimeo','Vimeo'],['youtube','YouTube'],['mp4','ملف MP4']]}},{p:'hero.reel.id', t:'text', l:'رابط الشوريل على Vimeo أو YouTube', ltr:1}]},
        {p:'hero.reel.src', t:'media', l:'ملف MP4 (فقط إذا اخترت MP4)', accept:'video/mp4'},
        {p:'hero.reelPreview', t:'media', l:'معاينة قصيرة بلا صوت', accept:'video/mp4,video/webm'} ]},
      {h:'مقدمة الخدمات', fields:[{p:'servicesIntro.h', t:'bi', l:'العنوان'},{p:'servicesIntro.p', t:'bita', l:'الوصف'}]},
      {h:'آراء العملاء', hint:'تظهر في الرئيسية وصفحة الأسعار فقط بعد أن يقيّم عميل طلبه المسلَّم، يوافق على النشر، وتفعّل أنت التقييم من صندوق الطلبات.', fields:[{p:'reviews.h', t:'bi', l:'عنوان القسم'}]} ]},
    {id:'services', title:'الخدمات', secs:[
      {h:'الخدمات الأربع', hint:'لكل خدمة صفحة خاصة بعالمها البصري. إضافة نوع خدمة جديد بالكامل يحتاج تصميم صفحته.', rep:{p:'services', fixed:1, name:function(x){return (x.name&&x.name.ar)||x.id}, fields:[
        {p:'label', t:'text', l:'التسمية اللاتينية الصغيرة', ltr:1},
        {p:'name', t:'bi', l:'الاسم'},
        {p:'short', t:'bita', l:'وصف مختصر (البطاقة في الرئيسية)'},
        {p:'body', t:'bita', l:'الوصف الكامل (صفحة الخدمة)'},
        {p:'tags', t:'bilist', l:'الوسوم', hint:'كل وسم بسطر'},
        {p:'deliverables', t:'bilist', l:'ماذا يستلم العميل', hint:'كل بند بسطر'},
        {p:'tools', t:'list', l:'الأدوات والبرامج', hint:'كل أداة بسطر', ltr:1} ]}},
      {h:'شعارات الأدوات', hint:'Premiere وAfter Effects وPhotoshop وIllustrator وAudition وDaVinci وElevenLabs تظهر بشعاراتها تلقائياً. لأي أداة ثانية (مثل Higgsfield) أو لتبديل شعار: اكتب الاسم بالضبط كما هو بقائمة الأدوات وارفع الشعار (PNG أو SVG مربّع بخلفية).', rep:{p:'toolLogos',
        name:function(x){return x.name||'أداة'}, add:function(){return {name:'',logo:''}}, fields:[{p:'name', t:'text', l:'اسم الأداة', ltr:1},{p:'logo', t:'media', l:'الشعار', accept:'image/*'}]}} ]},
    {id:'packages', title:'الباقات والأسعار', secs:[
      {h:'نصوص الصفحة', fields:[{p:'packages.h', t:'bi', l:'العنوان'},{p:'packages.p', t:'bita', l:'الوصف'},
        {p:'packages.currency', t:'text', l:'رمز العملة', ltr:1},{p:'packages.note', t:'bita', l:'ملاحظة الأسعار'},{p:'packages.payment', t:'bita', l:'طرق الدفع (تظهر بعد الطلب)'}]},
      {h:'الخدمات والباقة', hint:'«خدمة» تظهر في شبكة «اطلب خدمة». «باقة» (مثل الشهرية) تظهر ببطاقة عريضة تحتها. السعر القديم اختياري: إن كان أعلى من السعر يظهر مشطوباً مع نسبة التوفير.', rep:{p:'packages.items', name:function(x){return ((x.name&&x.name.ar)||'باقة')+(x.price!=null&&x.price!==''?' · '+x.price:' · عرض سعر')+(+x.oldPrice>+x.price?' (بدل '+x.oldPrice+')':'')},
        add:function(){return {id:'pkg-'+Date.now().toString(36),service:'editing',featured:false,price:null,unit:bi('للفيديو','per video'),name:bi('باقة جديدة','New package'),desc:bi(),features:bi([],[])}},
        fields:[{p:'name', t:'bi', l:'اسم الباقة'},
          {row:[{p:'kind', t:'select', l:'النوع', opts:function(){return [['','تلقائي'],['service','خدمة'],['package','باقة']]}},{p:'service', t:'select', l:'الخدمة', opts:SVC},{p:'featured', t:'check', l:'الأكثر طلباً'}]},
          {row:[{p:'price', t:'num', l:'السعر (اتركه فارغاً = عرض سعر)'},{p:'oldPrice', t:'num', l:'السعر القديم (يظهر مشطوباً)'}]},
          {p:'unit', t:'bi', l:'الوحدة (للفيديو، شهرياً…)'},{p:'desc', t:'bita', l:'وصف قصير'},{p:'features', t:'bilist', l:'المميزات', hint:'كل ميزة بسطر'},
          {p:'id', t:'text', l:'المعرّف (يظهر في الرابط)', ltr:1} ]}},
      {h:'الإضافات', rep:{p:'packages.addons', name:function(x){return ((x.name&&x.name.ar)||'إضافة')+' · '+(x.type==='percent'?x.price+'%':x.price)},
        add:function(){return {id:'add-'+Date.now().toString(36),name:bi('إضافة','Add-on'),price:10,type:'fixed'}},
        fields:[{p:'name', t:'bi', l:'الاسم'},{row:[{p:'price', t:'num', l:'القيمة'},{p:'type', t:'select', l:'النوع', opts:function(){return [['fixed','مبلغ ثابت'],['percent','نسبة %']]}},{p:'id', t:'text', l:'المعرّف', ltr:1}]} ]}},
      {h:'نافذة الطلب', hint:'تنفتح فوق الصفحة عندما يضغط العميل «اطلب». حدّد ما تسأله النافذة وما يراه العميل فيها.', fields:[
        {row:[{p:'order.askQty', t:'check', l:'عدّاد عدد الفيديوهات (للخدمات)'},{p:'order.askPlatform', t:'check', l:'سؤال المنصة'},{p:'order.askPay', t:'check', l:'طريقة الدفع المفضّلة'}]},
        {row:[{p:'order.ask_link', t:'check', l:'خانة رابط المواد'},{p:'order.ask_deadline', t:'check', l:'خانة الموعد'},{p:'order.ask_contact', t:'check', l:'خانة التواصل الخارجي'}]},
        {p:'order.platforms', t:'list', l:'المنصات المعروضة', hint:'كل منصة بسطر (Instagram، TikTok…)', ltr:1},
        {p:'order.next', t:'bilist', l:'«ماذا يحدث بعد الإرسال؟»', hint:'كل خطوة بسطر'}]},
      {h:'نصوص نافذة الطلب', hint:'اترك أي خانة فارغة ليبقى النص الافتراضي.', fields:[
        {p:'order.text.title', t:'bi', l:'عنوان النافذة'},{p:'order.text.details', t:'bi', l:'عنوان خانة التفاصيل'},{p:'order.text.detailsPh', t:'bi', l:'المثال داخل خانة التفاصيل'},
        {p:'order.text.platforms', t:'bi', l:'سؤال المنصة'},{p:'order.text.qty', t:'bi', l:'عدّاد الفيديوهات'},{p:'order.text.addons', t:'bi', l:'عنوان الإضافات'},
        {p:'order.text.link', t:'bi', l:'خانة رابط المواد'},{p:'order.text.deadline', t:'bi', l:'خانة الموعد'},{p:'order.text.contact', t:'bi', l:'خانة التواصل الخارجي'},
        {p:'order.text.pay', t:'bi', l:'خانة طريقة الدفع'},{p:'order.text.next', t:'bi', l:'عنوان الخطوات'},{p:'order.text.send', t:'bi', l:'زر الإرسال'}]},
      {h:'الأسئلة الشائعة', hint:'تظهر أسفل صفحة الأسعار. راجع الأجوبة لتطابق طريقة عملك.', fields:[{p:'faq.h', t:'bi', l:'عنوان القسم'}], rep:{p:'faq.items', name:function(x){return (x.q&&x.q.ar)||'سؤال'}, add:function(){return {q:bi(),a:bi()}},
        fields:[{p:'q', t:'bi', l:'السؤال'},{p:'a', t:'bita', l:'الجواب'}]}} ]},
    {id:'work', title:'الأعمال', secs:[
      {h:'دراسات الحالة', hint:'قصة كل عمل (البريف، التحدي، الفكرة، التنفيذ، النتيجة) وصور الكواليس، تظهر تحت الفيديو عند فتحه. تُكتب داخل كل مشروع بالأسفل.', fields:[
        {p:'settings.casesOff', t:'check', l:'إخفاء كل دراسات الحالة وصور الكواليس من الموقع'} ]},
      {h:'نصوص القسم', fields:[{p:'work.h', t:'bi', l:'العنوان قبل إضافة أعمال'},{p:'work.p', t:'bita', l:'الوصف قبل إضافة أعمال'},{p:'work.filledH', t:'bi', l:'العنوان بعد إضافة أعمال'},{p:'work.filledP', t:'bita', l:'الوصف بعد إضافة أعمال'}]},
      {h:'المشاريع', hint:'أول 3 مشاريع تظهر في الرئيسية. المعاينة: 6–8 ثوانٍ بدون صوت، حتى 5MB. الفيديو الكامل الأفضل على Vimeo أو YouTube.', rep:{p:'projects',
        name:function(x){return (x.title&&x.title.ar)||'مشروع'}, add:function(){return {title:bi('مشروع جديد',''),service:'editing',summary:bi(),client:'',year:String(new Date().getFullYear()),ratio:'16:9',preview:'',poster:'',full:{type:'vimeo',id:''}}},
        fields:[{p:'title', t:'bi', l:'اسم المشروع'},
          {row:[{p:'service', t:'select', l:'الخدمة', opts:SVC},{p:'ratio', t:'select', l:'المقاس', opts:function(){return [['16:9','أفقي 16:9'],['9:16','عمودي 9:16'],['1:1','مربع 1:1'],['4:5','4:5']]}},{p:'year', t:'text', l:'السنة', ltr:1}]},
          {p:'summary', t:'bi', l:'سطر عن المشروع'},{p:'client', t:'text', l:'العميل (اختياري)'},
          {p:'caseHidden', t:'check', l:'إخفاء دراسة الحالة وصور الكواليس لهذا العمل'},
          {p:'brief', t:'bita', l:'دراسة الحالة — البريف: ماذا طلب العميل (اختياري)'},
          {p:'challenge', t:'bita', l:'التحدي (اختياري)'},{p:'idea', t:'bita', l:'الفكرة (اختياري)'},
          {p:'execution', t:'bita', l:'التنفيذ: كيف صنعناه (اختياري)'},
          {p:'result', t:'bita', l:'النتيجة، بأرقام حقيقية فقط (اختياري)', hint:'تظهر الخانات المعبّأة فقط، كبطاقات تحت الفيديو عند فتحه. اتركها كلها فارغة لعرض الفيديو وحده.'},
          {p:'frames', t:'frames', l:'Behind the Frame — صور من الكواليس (حتى 8)', hint:'ستوريبورد، لقطة من التايملاين، قبل وبعد التلوين، لقطة من التصوير… لكل صورة وصف قصير. تظهر كصف تحت دراسة الحالة.'},
          {p:'preview', t:'media', l:'معاينة قصيرة (فيديو)', accept:'video/mp4,video/webm', make:1, hint:'«صنع من الفيديو»: اختر الفيديو الكامل من جهازك، فتُقتطع منه 4 لقطات قصيرة من أجزاء مختلفة وتُدمج في معاينة صامتة (~7 ثوانٍ) تُرفع وحدها. أبقِ هذه الصفحة مفتوحة أثناء الصنع.'},
          {p:'poster', t:'media', l:'صورة الغلاف', accept:'image/*'},
          {row:[{p:'full.type', t:'select', l:'الفيديو الكامل', opts:function(){return [['vimeo','Vimeo'],['youtube','YouTube'],['mp4','ملف MP4'],['none','المعاينة فقط']]}},{p:'full.id', t:'text', l:'رابط الفيديو على Vimeo أو YouTube (الصق الرابط كاملاً)', ltr:1}]},
          {p:'full.src', t:'media', l:'ملف MP4 كامل (فقط إذا اخترت MP4)', accept:'video/mp4'} ]}} ]},
    {id:'about', title:'من نحن', secs:[
      {h:'المقدمة', fields:[{p:'about.h1', t:'bi', l:'العنوان'},{p:'about.lead', t:'bita', l:'الوصف'}]},
      {h:'قصة الرمز', fields:[{p:'about.markH', t:'bi', l:'العنوان'},{p:'about.markP', t:'bilist', l:'الفقرات', hint:'كل فقرة بسطر'},{p:'about.values', t:'bilist', l:'القيم', hint:'كل قيمة بسطر'}]},
      {h:'الأفكار', fields:[{p:'about.principlesH', t:'bi', l:'عنوان القسم'}], rep:{p:'about.principles', name:function(x){return (x.h&&x.h.ar)||''}, add:function(){return {k:'IDEA',h:bi(),p:bi()}},
        fields:[{p:'k', t:'text', l:'التسمية اللاتينية', ltr:1},{p:'h', t:'bi', l:'العنوان'},{p:'p', t:'bita', l:'النص'}]}} ]},
    {id:'contact', title:'التواصل والمراحل', secs:[
      {h:'التواصل', fields:[{p:'site.instagram', t:'text', l:'حساب إنستغرام (بدون @)', ltr:1},{p:'contact.h', t:'bi', l:'العنوان'},{p:'contact.p', t:'bita', l:'الوصف'},{p:'contact.briefH', t:'bi', l:'عنوان «ماذا ترسل لنا»'}],
        rep:{p:'contact.brief', name:function(x){return (x.h&&x.h.ar)||''}, add:function(){return {k:'ITEM',h:bi(),p:bi()}}, fields:[{p:'k', t:'text', l:'التسمية', ltr:1},{p:'h', t:'bi', l:'العنوان'},{p:'p', t:'bi', l:'التوضيح'}]}},
      {h:'آلية العمل', fields:[{p:'process.h', t:'bi', l:'العنوان'},{p:'process.p', t:'bita', l:'الوصف'}],
        rep:{p:'process.steps', name:function(x,i){return (i+1)+'. '+((x.h&&x.h.ar)||'')}, add:function(){return {h:bi(),p:bi()}}, fields:[{p:'h', t:'bi', l:'المرحلة'},{p:'p', t:'bita', l:'الشرح'}]}} ]},
    {id:'payments', title:'طرق الدفع', secs:[
      {h:'نصوص القسم', fields:[{p:'payments.h', t:'bi', l:'العنوان'},{p:'payments.p', t:'bita', l:'الوصف'}]},
      {h:'الطرق المعروضة على الموقع', hint:'تظهر في صفحة الباقات وأسفل كل صفحة. ارفع شعار كل طريقة من ملفات الشركة الرسمية (Brand kit)، أو اتركها فيظهر الاسم.', rep:{p:'payments.methods',
        name:function(x){return (x.name||'طريقة')+(x.enabled===false?' (مخفية)':'')}, add:function(){return {id:'pay-'+Date.now().toString(36),name:'',logo:'',enabled:true}},
        fields:[{row:[{p:'name', t:'text', l:'الاسم', ltr:1},{p:'enabled', t:'check', l:'ظاهرة على الموقع'}]},{p:'logo', t:'media', l:'الشعار (PNG أو SVG بخلفية شفافة)', accept:'image/*'},{p:'id', t:'text', l:'المعرّف', ltr:1}]}},
      {h:'الدفع التلقائي والتذكير', hint:'«عربون» = يدفع العميل نسبة قبل البدء والباقي قبل التسليم، ولكل دفعة فاتورتها. يصل التذكير إلى العميل مرة واحدة إن لم يرفع الإيصال.', fields:[
        {row:[{p:'payments.defaultPlan', t:'select', l:'خطة الدفع الافتراضية للطلبات', opts:function(){return [['full','كامل المبلغ دفعة واحدة'],['split','عربون + الباقي قبل التسليم']]}},{p:'payments.depositPct', t:'num', l:'نسبة العربون %'}]},
        {row:[{p:'payments.reminders', t:'check', l:'تذكير تلقائي بالدفع'},{p:'payments.reminderHours', t:'num', l:'بعد كم ساعة من إرسال التفاصيل'}]}]},
      {h:'تفاصيل الدفع الخاصة', hint:'لا تظهر على الموقع أبداً. تُستخدم فقط في رسائل الرد على الطلبات (رقم المحفظة، البريد، بيانات الاستلام…).', priv:'payments'} ]},
    {id:'layout', title:'التصميم والترتيب', layout:1},
    {id:'settings', title:'الإعدادات', settings:1},
    {id:'orders', title:'الطلبات والفرص', orders:1},
    {id:'tasks', title:'المشاريع والمهام', tasks:1},
    {id:'billing', title:'الفوترة', billing:1},
    {id:'clients', title:'العملاء', clients:1},
    {id:'team', title:'الفريق', team:1},
    {id:'notify', title:'الإشعارات', notify:1},
    {id:'reports', title:'التقارير', reports:1},
    {id:'stats', title:'إحصائيات الزيارات', stats:1},
    {id:'backup', title:'نسخ احتياطي', backup:1}
  ];

  var PAGES=[['index','الرئيسية','Eyeblink Studio — مونتاج وموشن غرافيك وأفلام','Eyeblink Studio — Editing, Motion & Film'],['services','الخدمات','الخدمات — Eyeblink Studio','Services — Eyeblink Studio'],
    ['service-editing','خدمة المونتاج','المونتاج الاحترافي — Eyeblink Studio','Video Editing — Eyeblink Studio'],['service-motion','خدمة الموشن','الموشن غرافيك — Eyeblink Studio','Motion Graphics — Eyeblink Studio'],
    ['service-social','خدمة السوشال','إعلانات السوشال ميديا — Eyeblink Studio','Social Media Ads — Eyeblink Studio'],['service-films','خدمة الأفلام','الأفلام والإنتاج السينمائي — Eyeblink Studio','Film Production — Eyeblink Studio'],
    ['work','أعمالنا','أعمالنا — Eyeblink Studio','Work — Eyeblink Studio'],['pricing','الأسعار','الباقات والأسعار — Eyeblink Studio','Packages & Pricing — Eyeblink Studio'],
    ['about','من نحن','من نحن — Eyeblink Studio','About — Eyeblink Studio'],['contact','تواصل','تواصل — Eyeblink Studio','Contact — Eyeblink Studio'],['account','حساب العميل','حسابي — Eyeblink Studio','My account — Eyeblink Studio'],['privacy','سياسة الخصوصية','سياسة الخصوصية — Eyeblink Studio','Privacy policy — Eyeblink Studio']];

  /* ---------------- field widgets ---------------- */
  function fid(){ return 'f'+Math.random().toString(36).slice(2,9); }
  function field(obj,f){
    if(f.row) return '<div class="row">'+f.row.map(function(x){return field(obj,x)}).join('')+'</div>';
    var v=get(obj,f.p), id=fid(), hint=f.hint?'<span class="hint">'+esc(f.hint)+'</span>':'', d=' data-p="'+esc(f.p)+'" data-t="'+f.t+'"';
    var lab='<label for="'+id+'">'+esc(f.l)+'</label>';
    switch(f.t){
      case 'text': return '<div class="field">'+lab+'<input id="'+id+'"'+d+(f.ltr?' dir="ltr"':'')+' value="'+esc(v)+'">'+hint+'</div>';
      case 'date': return '<div class="field">'+lab+'<input id="'+id+'" data-p="'+esc(f.p)+'" data-t="text" type="date" dir="ltr" value="'+esc(v||'')+'">'+hint+'</div>';
      case 'num': return '<div class="field">'+lab+'<input id="'+id+'"'+d+' type="number" min="0" step="1" dir="ltr" value="'+esc(v==null?'':v)+'">'+hint+'</div>';
      case 'check': return '<div class="field"><label class="check" style="margin-top:26px"><input type="checkbox"'+d+(v?' checked':'')+'> '+esc(f.l)+'</label></div>';
      // a list of images, each with a bilingual caption: add, remove, reorder (Behind the Frame)
      case 'frames':
        var fl=Array.isArray(v)?v:[], fp=esc(f.p);
        return '<div class="field">'+lab+'<div class="frames">'+fl.map(function(fr,i){ fr=fr||{}; var pp=fp+'.'+i, cap=fr.cap||{};
          return '<div class="frame-row">'+(fr.src?'<img class="thumb" alt="" src="'+esc(abs(fr.src))+'">':'<span class="thumb"></span>')+
            '<div class="frame-body"><div class="media"><input data-p="'+pp+'.src" data-t="text" dir="ltr" placeholder="رابط الصورة أو ارفعها" value="'+esc(fr.src||'')+'"><label class="btn sm">رفع<input type="file" accept="image/*" data-upload="'+pp+'.src" hidden></label></div>'+
            '<div class="bi"><div><small>عربي</small><input data-p="'+pp+'.cap.ar" data-t="text" placeholder="وصف قصير: ستوريبورد، قبل التلوين…" value="'+esc(cap.ar||'')+'"></div><div><small>ENGLISH</small><input data-p="'+pp+'.cap.en" data-t="text" dir="ltr" value="'+esc(cap.en||'')+'"></div></div></div>'+
            '<div class="frame-act"><button class="btn sm" type="button" data-fr="'+fp+'" data-fr-act="up" data-fr-i="'+i+'" aria-label="أعلى">↑</button><button class="btn sm" type="button" data-fr="'+fp+'" data-fr-act="down" data-fr-i="'+i+'" aria-label="أسفل">↓</button><button class="btn sm danger" type="button" data-fr="'+fp+'" data-fr-act="del" data-fr-i="'+i+'">حذف</button></div></div>'; }).join('')+
          '</div>'+(fl.length<8?'<div><button class="btn sm" type="button" data-fr="'+fp+'" data-fr-act="add">+ صورة</button></div>':'')+hint+'</div>';
      case 'select': var o=(typeof f.opts==='function'?f.opts():f.opts); return '<div class="field">'+lab+'<select id="'+id+'"'+d+'>'+o.map(function(x){return '<option value="'+esc(x[0])+'"'+(String(v)===String(x[0])?' selected':'')+'>'+esc(x[1])+'</option>'}).join('')+'</select>'+hint+'</div>';
      case 'list': return '<div class="field">'+lab+'<textarea id="'+id+'"'+d+(f.ltr?' dir="ltr"':'')+'>'+esc((v||[]).join('\n'))+'</textarea>'+hint+'</div>';
      case 'bi': case 'bita': case 'bilist':
        v=v||{}; var ta=f.t!=='bi', list=f.t==='bilist';
        var a=list?(v.ar||[]).join('\n'):v.ar||'', e=list?(v.en||[]).join('\n'):v.en||'';
        var inp=function(lang,val){ return ta? '<textarea data-p="'+esc(f.p)+'.'+lang+'" data-t="'+(list?'list':'text')+'"'+(lang==='en'?' dir="ltr"':'')+' aria-label="'+esc(f.l)+' '+lang+'">'+esc(val)+'</textarea>'
                                          : '<input data-p="'+esc(f.p)+'.'+lang+'" data-t="text"'+(lang==='en'?' dir="ltr"':'')+' aria-label="'+esc(f.l)+' '+lang+'" value="'+esc(val)+'">'; };
        return '<div class="field"><label>'+esc(f.l)+'</label><div class="bi"><div><small>عربي</small>'+inp('ar',a)+'</div><div><small>ENGLISH</small>'+inp('en',e)+'</div></div>'+hint+'</div>';
      case 'media':
        var isV=/video/.test(f.accept||''), prev=v? (isV?'<video class="thumb" src="'+esc(abs(v))+'" muted></video>':'<img class="thumb" alt="" src="'+esc(abs(v))+'">') : '';
        return '<div class="field">'+lab+'<div class="media">'+prev+'<input id="'+id+'"'+d+' dir="ltr" placeholder="رابط أو ارفع ملفاً" value="'+esc(v)+'"><label class="btn sm">رفع<input type="file" accept="'+esc(f.accept||'*/*')+'" data-upload="'+esc(f.p)+'" hidden></label>'+
          (f.make?'<label class="btn sm primary">صنع من الفيديو<input type="file" accept="video/*" data-make="'+esc(f.p)+'" hidden></label>':'')+'</div><p class="mkstate small" data-mkstate="'+esc(f.p)+'" hidden></p>'+hint+'</div>';
    }
    return '';
  }
  function abs(u){ return /^(https?:|data:|blob:|\/)/.test(u)? u : '../'+u; }

  /* ---------------- render ---------------- */
  function render(){
    renderTabs();
    var tab=TABS.filter(function(t){return t.id===TAB})[0];
    $('#tabTitle').textContent=tab.title;
    if(tab.today) return renderToday();
    if(tab.team) return renderTeam();
    if(tab.orders) return renderOrders();
    if(tab.stats) return renderStats();
    if(tab.tasks) return renderWork();
    if(tab.notify) return renderNotify();
    if(tab.billing) return renderBilling();
    if(tab.reports) return renderReports();
    if(tab.clients) return renderClients();
    if(tab.layout) return renderLayout();
    if(tab.backup) return renderBackup();
    if(tab.settings) return renderSettings();
    $('#panel').innerHTML=tab.secs.map(function(s,si){
      var html='<section class="sec"><h3>'+esc(s.h)+'</h3>'+(s.hint?'<p class="hint">'+esc(s.hint)+'</p>':'');
      if(s.fields) html+=s.fields.map(function(f){return field(C,f)}).join('');
      if(s.priv==='payments'){ var pm=(P&&P.payments)||{};
        html+=((C.payments&&C.payments.methods)||[]).map(function(m){ return '<div class="field"><label>'+esc(m.name||m.id)+'</label><textarea data-priv="payments.'+esc(m.id)+'" dir="auto" placeholder="مثال: Binance ID / رقم المحفظة / بريد PayPal">'+esc(pm[m.id]||'')+'</textarea></div>'; }).join('');
      }
      if(s.rep){ var arr=get(C,s.rep.p)||[];
        html+='<div class="rep" data-rep="'+esc(s.rep.p)+'">'+arr.map(function(it,i){
          return '<details class="item"'+(arr.length<=1?' open':'')+'><summary><span class="chev">‹</span><b>'+esc(s.rep.name(it,i))+'</b>'+
            (s.rep.fixed?'':'<button class="btn sm" type="button" data-move="'+si+':'+i+':-1" aria-label="أعلى">↑</button><button class="btn sm" type="button" data-move="'+si+':'+i+':1" aria-label="أسفل">↓</button><button class="btn sm danger" type="button" data-del="'+si+':'+i+'">حذف</button>')+
            '</summary><div class="body">'+s.rep.fields.map(function(f){ return field(it, f).replace(/data-p="/g,'data-p="'+s.rep.p+'.'+i+'.').replace(/data-upload="/g,'data-upload="'+s.rep.p+'.'+i+'.').replace(/data-(make|mkstate|fr)="/g,'data-$1="'+s.rep.p+'.'+i+'.'); }).join('')+'</div></details>';
        }).join('')+'</div>'+(s.rep.fixed?'':'<div><button class="btn" type="button" data-add="'+si+'">+ إضافة</button></div>');
      }
      return html+'</section>';
    }).join('');
    decorate();
  }
  function dirty(){ var d=JSON.stringify(C)!==SAVED || JSON.stringify(P)!==PSAVED; $('#state').textContent=d?'تعديلات غير منشورة':'محفوظ'; $('#state').classList.toggle('dirty',d); }

  /* ---------------- events ---------------- */
  document.addEventListener('input',function(e){
    var el=e.target, p=el.dataset.p; if(!p||!C) return;
    var t=el.dataset.t, v;
    if(t==='list') v=el.value.split('\n').map(function(x){return x.trim()}).filter(Boolean);
    else if(t==='num') v=el.value===''? null : +el.value;
    else if(t==='check') v=el.checked;
    else v=el.value;
    set(C,p,v); dirty(); saveDraft();
  });
  document.addEventListener('input',function(e){
    var el=e.target, k=el.dataset.priv; if(!k) return;
    P=P||{}; var parts=k.split('.'); P[parts[0]]=P[parts[0]]||{}; P[parts[0]][parts.slice(1).join('.')]=el.value; dirty(); savePrivDraft();
  });
  document.addEventListener('change',function(e){
    var el=e.target;
    if(el.dataset.t==='check'||el.tagName==='SELECT'){ el.dispatchEvent(new Event('input',{bubbles:true})); }
    if(el.dataset.upload) upload(el);
    if(el.dataset.make) makePreview(el);
  });
  document.addEventListener('click',function(e){
    var b=e.target.closest('button'); if(!b) return;
    if(b.dataset.tab){ go(b.dataset.tab); return; }
    var tab=TABS.filter(function(t){return t.id===TAB})[0];
    if(b.dataset.fr){ e.preventDefault(); var fp2=b.dataset.fr, act=b.dataset.frAct, fi=+b.dataset.frI, fa=(get(C,fp2)||[]).slice();
      if(act==='add'){ if(fa.length>=8) return; fa.push({src:'',cap:bi()}); }
      else if(act==='del'){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد؟'; setTimeout(function(){ if(b.isConnected){ b.dataset.armed=''; b.textContent='حذف'; } },3000); return; } fa.splice(fi,1); }
      else { var fj=fi+(act==='up'?-1:1); if(fj<0||fj>=fa.length) return; var ft=fa[fi]; fa[fi]=fa[fj]; fa[fj]=ft; }
      set(C,fp2,fa); render(); keepOpen(fp2); dirty(); saveDraft(); return; }
    if(b.dataset.add!=null){ var s=tab.secs[+b.dataset.add]; var arr=get(C,s.rep.p)||[]; arr.push(s.rep.add()); set(C,s.rep.p,arr); render(); dirty(); saveDraft();
      var items=document.querySelectorAll('[data-rep="'+s.rep.p+'"] .item'); var last=items[items.length-1]; if(last){ last.open=true; last.scrollIntoView({block:'center'}); } return; }
    if(b.dataset.del){ e.preventDefault(); var q=b.dataset.del.split(':'), s2=tab.secs[+q[0]], a2=get(C,s2.rep.p);
      if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد الحذف؟'; setTimeout(function(){ if(b.isConnected){ b.dataset.armed=''; b.textContent='حذف'; } },3000); return; }
      a2.splice(+q[1],1); render(); dirty(); saveDraft(); return; }
    if(b.dataset.move){ e.preventDefault(); var m=b.dataset.move.split(':'), s3=tab.secs[+m[0]], a3=get(C,s3.rep.p), i=+m[1], j=i+(+m[2]);
      if(j<0||j>=a3.length) return; var tmp=a3[i]; a3[i]=a3[j]; a3[j]=tmp; render(); dirty(); saveDraft(); return; }
  });
  $('#publishBtn').addEventListener('click',publish);
  $('#previewBtn').addEventListener('click',function(){ saveDraft(); try{ localStorage.setItem('eb-preview','1'); }catch(_){} });
  addEventListener('beforeunload',function(e){ if(LIVE && JSON.stringify(C)!==SAVED){ e.preventDefault(); e.returnValue=''; } });

  function saveDraft(){ try{ localStorage.setItem('eb-draft',JSON.stringify(C)); }catch(_){} }
  function savePrivDraft(){ if(!LIVE){ try{ localStorage.setItem('eb-private',JSON.stringify(P)); }catch(_){} } }
  var DEFAULT_TPL={
    ar:{confirm:'أهلاً {name}،\nاستلمنا طلبك {code} ({package}).\nالسعر النهائي: {price}\nطريقة الدفع: {method}\n{details}\n\nبعد الدفع أرسل لنا صورة الإيصال ونبدأ العمل مباشرة.',
        paid:'شكراً {name}، وصلنا الدفع لطلب {code}. بدأنا العمل وسنرسل لك أول نسخة للمراجعة قريباً.',
        delivered:'{name}، سلّمنا طلبك {code}. نتمنى أن ينال إعجابك، ويسعدنا سماع رأيك.'},
    en:{confirm:'Hi {name},\nWe received your request {code} ({package}).\nFinal price: {price}\nPayment method: {method}\n{details}\n\nOnce paid, send us the receipt and we start right away.',
        paid:'Thank you {name}, we received the payment for {code}. Work has started and the first draft is coming soon.',
        delivered:'{name}, your order {code} has been delivered. We hope you love it, and we would be glad to hear your feedback.'}};

  /* ---------------- server ---------------- */
  function publish(){
    var btn=$('#publishBtn');
    if(!LIVE){ saveDraft(); try{ localStorage.setItem('eb-preview','1'); }catch(_){}
      SAVED=JSON.stringify(C); PSAVED=JSON.stringify(P); savePrivDraft(); dirty(); toast('حُفظت المسودة في هذا المتصفح. للنشر الفعلي ارفع الموقع على Cloudflare.'); return; }
    btn.disabled=true; btn.textContent='جارٍ الترجمة…';
    Promise.resolve(TR_BUSY).then(autoEnglishAll).then(function(){ pruneMarks(); btn.textContent='جارٍ النشر…'; return fetch(API+'/content',{method:'PUT',headers:headers({'content-type':'application/json'}),body:JSON.stringify(C)}); })
      .then(function(r){ if(r.status===401) throw new Error('auth'); if(!r.ok) throw new Error('fail'); return r.json(); })
      .then(function(){ SAVED=JSON.stringify(C);
        if(JSON.stringify(P)!==PSAVED) return fetch(API+'/private',{method:'PUT',headers:headers({'content-type':'application/json'}),body:JSON.stringify(P)}).then(function(r){ if(!r.ok) throw new Error('fail'); PSAVED=JSON.stringify(P); }); })
      .then(function(){ dirty(); try{ localStorage.removeItem('eb-preview'); }catch(_){} toast('نُشرت التعديلات على الموقع'); })
      .catch(function(err){ toast(err.message==='auth'?'انتهت الجلسة، سجّل الدخول من جديد':'تعذّر النشر، حاول مرة أخرى',true); })
      .then(function(){ btn.disabled=false; btn.textContent='نشر التعديلات'; });
  }
  /* ---------------- short preview made from the full video ----------------
     Done in this browser: the video plays hidden, 4 short moments spread across it are drawn onto a canvas and
     recorded (silent, ≤1280px, ~2.5 Mbps), with a quick fade between moments. Only the result is uploaded. */
  var MK={clips:4, len:1.7, fade:0.18, max:1280, bitrate:2500000, busy:false};
  function recType(){ var c=['video/mp4;codecs=avc1.42E01F','video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    for(var i=0;i<c.length;i++){ try{ if(window.MediaRecorder&&MediaRecorder.isTypeSupported(c[i])) return c[i]; }catch(_){} } return ''; }
  function once(el,ev){ return new Promise(function(res,rej){ function ok(){ el.removeEventListener(ev,ok); el.removeEventListener('error',bad); res(); } function bad(){ el.removeEventListener(ev,ok); el.removeEventListener('error',bad); rej(new Error('read')); } el.addEventListener(ev,ok); el.addEventListener('error',bad); }); }
  function previewMoments(dur){
    var n=Math.max(1,Math.min(MK.clips,Math.floor(dur/2.5))), len=Math.min(MK.len,dur/(n+1)), out=[];
    for(var i=0;i<n;i++){ var c=dur*(n===1?0.5:0.12+0.76*i/(n-1)); out.push(Math.max(0,Math.min(dur-len-0.05,c-len/2))); }
    return {starts:out,len:len};
  }
  function makePreview(input){
    var file=input.files[0], path=input.dataset.make; input.value=''; if(!file) return;
    var st=document.querySelector('[data-mkstate="'+path+'"]');
    function say(t,bad){ if(st){ st.hidden=false; st.textContent=t; st.classList.toggle('bad',!!bad); } }
    if(!LIVE){ toast('صنع المعاينة يعمل بعد نشر الموقع على Cloudflare (يرفع الملف الناتج).',true); return; }
    if(MK.busy){ toast('هناك معاينة قيد الصنع، انتظر قليلاً.',true); return; }
    var mime=recType(); if(!mime||!HTMLCanvasElement.prototype.captureStream){ say('متصفحك لا يدعم صنع المعاينة. استعمل Chrome أو Edge على الكمبيوتر.',true); return; }
    MK.busy=true; say('جارٍ تحميل الفيديو…');
    var url=URL.createObjectURL(file), v=document.createElement('video'), stopDraw=false, rec=null;
    v.muted=true; v.playsInline=true; v.preload='auto'; v.src=url;
    v.style.cssText='position:fixed;left:-9999px;width:2px;height:2px'; document.body.appendChild(v);
    var cv=document.createElement('canvas'), ctx=cv.getContext('2d'), fadeA=0, rvfc=!!v.requestVideoFrameCallback;
    // one canvas frame per decoded video frame (requestVideoFrameCallback), or per screen frame on older browsers
    function paint(){ if(stopDraw||v.readyState<2) return; ctx.drawImage(v,0,0,cv.width,cv.height); if(fadeA>0){ ctx.fillStyle='rgba(0,0,0,'+fadeA.toFixed(3)+')'; ctx.fillRect(0,0,cv.width,cv.height); } }
    function draw(){ paint(); }
    once(v,'loadedmetadata').then(function(){
      var dur=v.duration; if(!isFinite(dur)||dur<2||!v.videoWidth) throw new Error('short');
      var sc=Math.min(1,MK.max/Math.max(v.videoWidth,v.videoHeight));
      cv.width=Math.round(v.videoWidth*sc/2)*2; cv.height=Math.round(v.videoHeight*sc/2)*2;
      var m=previewMoments(dur), chunks=[];
      rec=new MediaRecorder(cv.captureStream(30),{mimeType:mime,videoBitsPerSecond:MK.bitrate});
      rec.ondataavailable=function(e){ if(e.data&&e.data.size) chunks.push(e.data); };
      var done=new Promise(function(res){ rec.onstop=function(){ res(new Blob(chunks,{type:mime.split(';')[0]})); }; });
      draw(); rec.start(250); rec.pause();
      // page hidden (another tab): the browser pauses the video, so recording pauses too and resumes on return
      var onVis=function(){ if(!rec||rec.state==='inactive'||stopDraw) return;
        if(document.hidden){ if(rec.state==='recording'){ rec.pause(); v.pause(); MK.hid=true; say('متوقف مؤقتاً: ارجع إلى هذه الصفحة ليكمل الصنع.'); } }
        else if(MK.hid){ MK.hid=false; say('جارٍ صنع المعاينة…'); var pr=v.play(); if(pr&&pr.then) pr.then(function(){ rec.resume(); }); else rec.resume(); } };
      document.addEventListener('visibilitychange',onVis); MK.offVis=function(){ document.removeEventListener('visibilitychange',onVis); };
      // one moment: seek, record while it plays, fade in and out at its edges
      function clip(i){
        if(i>=m.starts.length) return Promise.resolve();
        say('جارٍ صنع المعاينة… اللقطة '+(i+1)+' من '+m.starts.length+' (أبقِ الصفحة مفتوحة)');
        var t0=m.starts[i]; v.currentTime=t0;
        return once(v,'seeked').then(function(){ fadeA=1; paint(); rec.resume(); return v.play(); }).then(function(){
          return new Promise(function(res,rej){ var fin=false, last=performance.now();
            function end(err){ if(fin) return; fin=true; clearInterval(guard); v.pause(); fadeA=1; paint(); setTimeout(function(){ try{ rec.pause(); }catch(_){} err? rej(err) : res(); },60); }
            function step(now,meta){ if(fin) return; last=performance.now(); var t=(meta&&meta.mediaTime!=null? meta.mediaTime : v.currentTime)-t0;
              fadeA=t<MK.fade? 1-t/MK.fade : t>m.len-MK.fade? Math.min(1,(t-(m.len-MK.fade))/MK.fade) : 0;
              if(t>=m.len||v.ended) return end();
              paint(); rvfc? v.requestVideoFrameCallback(step) : requestAnimationFrame(step); }
            // safety net: the moment's end is reached even if the browser stops delivering frames; no frames at all for 4s → stop with a clear message
            var guard=setInterval(function(){ if(fin) return; if(v.currentTime-t0>=m.len||v.ended) return end(); if(performance.now()-last>4000 && !document.hidden) end(new Error('empty')); },250);
            rvfc? v.requestVideoFrameCallback(step) : requestAnimationFrame(step); });
        }).then(function(){ return clip(i+1); });
      }
      return clip(0).then(function(){ rec.stop(); return done; });
    }).then(function(blob){
      stopDraw=true;
      if(!blob||blob.size<10000) throw new Error('empty');
      if(blob.size>24*1024*1024) throw new Error('big');
      say('جارٍ رفع المعاينة ('+(blob.size/1048576).toFixed(1)+' MB)…');
      var ext=/mp4/.test(blob.type)?'mp4':'webm', work=get(C,path.replace(/\.preview$/,''))||{};
      var name=mediaName(file.name.replace(/\.[^.]+$/,''), work.id||'work')+'-preview.'+ext;
      return fetch(API+'/media',{method:'POST',headers:headers({'content-type':blob.type,'x-filename':name}),body:blob})
        .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'upload'); return j; }); });
    }).then(function(j){
      set(C,path,j.url); dirty(); saveDraft(); render(); keepOpen(path);
      toast('جاهزة: المعاينة صُنعت ورُفعت. اضغط «نشر التعديلات» لتظهر على الموقع.');
    }).catch(function(e){
      stopDraw=true; try{ if(rec&&rec.state!=='inactive') rec.stop(); }catch(_){}
      var msg={read:'تعذّرت قراءة الفيديو في المتصفح. صدّره MP4 (H.264) ثم جرّب مرة أخرى.',short:'الفيديو قصير جداً لصنع معاينة منه.',empty:'لم يُسجَّل شيء. أبقِ الصفحة مفتوحة وفي المقدمة أثناء الصنع ثم جرّب مرة أخرى.',big:'المعاينة الناتجة أكبر من 24MB.'}[e.message]||('تعذّر صنع المعاينة: '+e.message);
      say(msg,true); toast(msg,true);
    }).then(function(){ MK.busy=false; MK.hid=false; if(MK.offVis) MK.offVis(); v.remove(); URL.revokeObjectURL(url); });
  }
  // after a re-render, reopen the list item a path belongs to (e.g. "projects.3.frames" → the 4th project)
  function keepOpen(path){ var m=/^([a-zA-Z.]+?)\.(\d+)\./.exec(String(path||'')+'.'); if(!m) return;
    var it=document.querySelectorAll('[data-rep="'+m[1]+'"] .item')[+m[2]]; if(it) it.open=true; }
  // a header may only carry Latin-1, and the server keeps a-z0-9.-_ anyway: Arabic or other names become a plain slug
  function mediaName(n,fallback){ var s=String(n||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').replace(/-{2,}/g,'-').slice(0,40); return s||fallback; }
  function upload(input){
    var file=input.files[0], path=input.dataset.upload; if(!file) return;
    if(!LIVE){ toast('رفع الملفات يعمل بعد نشر الموقع على Cloudflare. ضع رابطاً مباشراً الآن.',true); input.value=''; return; }
    if(file.size>24*1024*1024){ toast('الحد الأقصى 24MB. اضغط الفيديو أولاً.',true); input.value=''; return; }
    toast('جارٍ رفع '+file.name+'…');
    var m=/\.[a-z0-9]{2,5}$/i.exec(file.name), safe=mediaName(file.name.replace(/\.[^.]+$/,''),'file')+(m?m[0].toLowerCase():'');
    fetch(API+'/media',{method:'POST',headers:headers({'content-type':file.type||'application/octet-stream','x-filename':safe}),body:file})
      .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'fail'); return j; }); })
      .then(function(j){ set(C,path,j.url); dirty(); saveDraft(); render(); keepOpen(path); toast('تم الرفع. اضغط «نشر التعديلات» ليظهر على الموقع.'); })
      .catch(function(e){ toast('تعذّر الرفع: '+e.message,true); });
  }

  /* ---------------- orders ---------------- */
  var ST={'new':'جديد','discussing':'قيد النقاش','confirmed':'مؤكَّد','awaiting-payment':'بانتظار الدفع','paid':'مدفوع','in-progress':'قيد التنفيذ','review':'بانتظار المراجعة','delivered':'مُسلَّم','cancelled':'ملغى'};
  function sampleOrders(){ return [{key:'order:demo',code:'EB-DEMO1',status:'new',createdAt:new Date().toISOString(),name:'طلب تجريبي',contact:'@client.account',details:'فيديو موشن 45 ثانية لإطلاق منتج. (هذا طلب تجريبي ليظهر لك شكل الصندوق)',package:'motion',packageName:'فيديو موشن غرافيك',addons:['كتابة السكريبت'],total:'85 $',lang:'ar',price:'',method:'',paid:false,paidAmount:'',notes:'',history:[{at:new Date().toISOString(),status:'new'}],email:'client@example.com',unread:1,messages:[{from:'client',text:'مرحباً، هل يمكن التسليم قبل نهاية الأسبوع؟',at:new Date().toISOString()}],demo:true}]; }
  function loadOrders(){
    if(!LIVE){ if(!ORDERS.length) ORDERS=sampleOrders(); if(TAB==='orders') renderOrders(); else renderTabs(); return; }
    fetch(API+'/orders',{headers:headers({})}).then(function(r){return r.json()}).then(function(j){ ORDERS=j.orders||[]; ORD_READY=true; if(TAB==='orders') renderOrders(); else renderTabs(); }).catch(function(){});
  }
  function contactLink(c,text){
    c=String(c||'').trim(); var digits=c.replace(/[^0-9]/g,'');
    if(/@/.test(c) && /\./.test(c.split('@')[1]||'')) return 'mailto:'+c+'?body='+encodeURIComponent(text);
    if(/^\+?[0-9 ()-]{8,}$/.test(c)) return 'https://wa.me/'+digits+'?text='+encodeURIComponent(text);
    var h=c.replace(/^@/,'').replace(/^https?:\/\/(www\.)?instagram\.com\//,'').split(/[/?]/)[0];
    return h? 'https://ig.me/m/'+h : '';
  }
  function fill(tpl,o){
    var pm=(P&&P.payments)||{}, m=((C.payments&&C.payments.methods)||[]).filter(function(x){return x.id===o.method})[0];
    return tpl.replace(/\{(\w+)\}/g,function(_,k){ return ({name:o.name,code:o.code,package:o.packageName||o.package,price:o.price||o.total,method:m?m.name:'—',details:o.method?(pm[o.method]||''):''})[k]||''; });
  }
  /* ---------- the payment path of one order: four clear steps, one button at a time ---------- */
  function pnum(v){ var n=parseFloat(String(v==null?'':v).replace(/,/g,'').replace(/[^0-9.]/g,'')); return isFinite(n)?n:0; }
  function pcur(o){ return (String(o.price||o.total||'').match(/[^\d\s.,]+/)||[(C.packages&&C.packages.currency)||'$'])[0]; }
  function pfmt(n,c){ var v=(Math.round(n*100)/100).toFixed(n%1?2:0); return c==='$'||c==='€'?c+v:v+' '+c; }
  function payState(o){ var Pm=C.payments||{}, plan=o.plan||Pm.defaultPlan||'full', pct=+(o.depositPct||Pm.depositPct||50), total=pnum(o.price), dep=o.deposit&&o.deposit.paid;
    var stage= plan==='split'? (dep?'final':'deposit') : 'full', amt= stage==='deposit'? Math.round(total*pct)/100 : stage==='final'? Math.max(0,total-pnum(o.deposit&&o.deposit.amount)) : total;
    var asked=o.payInfo&&(o.payInfo.stage||'full')===stage, receipt=asked&&(o.messages||[]).some(function(m){return m.kind==='receipt'&&m.at>o.payInfo.at});
    var done= o.paid || (stage==='full'&&o.paid);
    return {plan:plan,pct:pct,total:total,stage:stage,amt:amt,asked:asked,receipt:receipt,done:done}; }
  var STG={full:'المبلغ كامل',deposit:'العربون',final:'الباقي'};
  function payFlow(o,k,methods){
    var S=payState(o), c=pcur(o), pm=(P&&P.payments)||{}, m=methods.filter(function(x){return x.id===o.method})[0], has=!!(o.method&&pm[o.method]);
    var step=function(n,ok,title,body){ return '<li class="pstep'+(ok?' ok':'')+'"><i>'+(ok?'✓':n)+'</i><div><b>'+title+'</b>'+body+'</div></li>'; };
    var methodSel='<select data-of="method" data-pmethod="'+k+'"><option value="">اختر…</option>'+methods.map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===o.method?' selected':'')+'>'+esc(x.name)+'</option>'}).join('')+'</select>';
    var acct= !o.method? '' : has? '<div class="pnote ok">✓ حساب الاستلام جاهز: <span dir="auto">'+esc(String(pm[o.method]).split('\n')[0].slice(0,60))+'</span></div>'
      : '<div class="pnote warn">لم تكتب بعد الحساب الذي يدفع إليه العميل عبر '+esc(m?m.name:o.method)+'. اكتبه هنا مرة واحدة ويُحفظ لجميع الطلبات:<textarea data-pacct="'+esc(o.method)+'" dir="auto" placeholder="مثال: إيميل PayPal أو Binance ID أو اسم المستلم والمدينة"></textarea></div>';
    var ask='', got='';
    if(S.done) got='<div class="pnote ok">✓ مدفوع بالكامل'+(o.invoice?' · فاتورة <b dir="ltr">'+esc(o.invoice.no)+'</b> <button class="btn sm" type="button" data-oinv="'+k+'" data-kind="final">أعد إرسالها</button>':'')+'</div>';
    else {
      ask='<button class="btn sm primary" type="button" data-pask="'+k+'"'+(o.email?'':' disabled')+'>'+(S.asked?'أعد إرسال طلب الدفع':'اطلب الدفع من العميل')+' · <span dir="ltr">'+esc(pfmt(S.amt,c))+'</span>'+(S.stage!=='full'?' ('+STG[S.stage]+')':'')+'</button>'+
        (S.asked?'<div class="pnote">'+(S.receipt?'📎 العميل رفع إيصال الدفع — تأكّد من وصول المبلغ واكبس «وصل الدفع».':'⏳ وصل للعميل طلب دفع '+esc(o.payInfo.amount)+' · '+esc(new Date(o.payInfo.at).toLocaleString('ar',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+(o.payInfo.reminded?' · ⏰ وصله تذكير':'')+'</div>'):'');
      got='<button class="btn sm'+(S.asked?' primary':'')+'" type="button" data-pgot="'+k+'">✓ وصل '+STG[S.stage]+' · <span dir="ltr">'+esc(pfmt(S.amt,c))+'</span></button><div class="pnote">تُنشأ فاتورة برقم تسلسلي وتُرسل إلى العميل بالبريد الإلكتروني تلقائياً.</div>';
    }
    var depLine= o.deposit&&o.deposit.paid? '<div class="pnote ok">✓ العربون مدفوع <span dir="ltr">'+esc(pfmt(pnum(o.deposit.amount),c))+'</span>'+(o.deposit.invoice?' · فاتورة <b dir="ltr">'+esc(o.deposit.invoice.no)+'</b> <button class="btn sm" type="button" data-oinv="'+k+'" data-kind="deposit">أعد إرسالها</button>':'')+'</div>':'';
    return '<div class="pflow"><div class="ph"><b>مسار الدفع</b><span class="small muted">'+(S.done?'مكتمل':S.stage==='final'?'باقي الدفعة النهائية':'خطوة بخطوة')+'</span></div><ol>'+
      step(1,S.total>0,'السعر النهائي','<input data-of="price" dir="ltr" value="'+esc(o.price)+'" placeholder="'+esc(o.total)+'">')+
      step(2,true,'خطة الدفع','<div class="prow"><select data-of="plan" data-pplan="'+k+'"><option value="full"'+(S.plan==='full'?' selected':'')+'>المبلغ كاملاً دفعة واحدة</option><option value="split"'+(S.plan==='split'?' selected':'')+'>عربون والباقي قبل التسليم</option></select>'+
        (S.plan==='split'?'<label class="pct">العربون <input data-of="depositPct" type="number" min="10" max="90" value="'+esc(S.pct)+'">%</label>':'')+'</div>')+
      step(3,has,'طريقة الدفع وحساب الاستلام',methodSel+acct)+
      step(4,S.done,'الدفع',depLine+ask+got)+
    '</ol></div>';
  }
  function orderReq(o,extra,btn,okMsg){
    var box=btn.closest('.order'), d=readOrderForm(box); Object.assign(d,extra||{}); d.key=o.key;
    if(!LIVE||o.demo){ toast('يعمل على الموقع المنشور',true); return Promise.resolve(); }
    btn.disabled=true;
    return fetch(API+'/orders',{method:'PATCH',headers:headers({'content-type':'application/json'}),body:JSON.stringify(d)}).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'fail'); return j; }); })
      .then(function(j){ Object.assign(o,j.order); renderOrders(); var d2=document.querySelector('[data-okey="'+o.key+'"]'); if(d2) d2.open=true; toast(okMsg); })
      .catch(function(e){ btn.disabled=false; toast(({'set price and method first':'اكتب السعر واختر طريقة الدفع أولاً','no private details for this method':'اكتب حساب الاستلام بالخطوة 3'})[e.message]||'تعذّر، جرّب مرة ثانية',true); });
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-pask],[data-pgot]'); if(!b) return;
    var o=orderOf(b.dataset.pask||b.dataset.pgot), box=b.closest('.order'), d=readOrderForm(box);
    if(b.dataset.pask){
      if(!pnum(d.price)){ toast('اكتب السعر النهائي بالخطوة 1',true); box.querySelector('[data-of="price"]').focus(); return; }
      if(!d.method){ toast('اختر طريقة الدفع بالخطوة 3',true); box.querySelector('[data-pmethod]').focus(); return; }
      var ta=box.querySelector('[data-pacct]'), save=Promise.resolve();
      if(ta){ var v=ta.value.trim(); if(!v){ toast('اكتب حساب الاستلام بالخطوة 3',true); ta.focus(); return; }
        P=P||{}; P.payments=P.payments||{}; P.payments[ta.dataset.pacct]=v;
        save= LIVE? fetch(API+'/private',{method:'PUT',headers:headers({'content-type':'application/json'}),body:JSON.stringify(P)}).then(function(r){ if(!r.ok) throw 0; PSAVED=JSON.stringify(P); }) : Promise.resolve(savePrivDraft()); }
      save.then(function(){ return orderReq(o,{sendPayment:true},b,'وصل طلب الدفع لحساب العميل وإيميله'); }).catch(function(){ toast('لم يُحفظ حساب الاستلام، حاول مرة أخرى',true); });
    } else {
      var S=payState(Object.assign({},o,d)), extra= S.stage==='deposit'? {depositPaid:true} : {paid:true};
      orderReq(o,extra,b,'تمّ! أُنشئت الفاتورة وأُرسلت إلى العميل');
    }
  });
  document.addEventListener('change',function(e){ var el=e.target; if(!el.matches('[data-pmethod],[data-pplan]')) return;
    var o=orderOf(el.dataset.pmethod||el.dataset.pplan), box=el.closest('.order'), d=readOrderForm(box); Object.assign(o,{method:d.method,plan:d.plan,price:d.price,depositPct:d.depositPct});
    var fl=box.querySelector('.pflow'); if(fl){ var tmp=document.createElement('div'); tmp.innerHTML=payFlow(o,esc(o.key),((C.payments&&C.payments.methods)||[])); fl.replaceWith(tmp.firstChild); } });

  /* ---------- CRM: opportunities from outside the site, follow-ups, contact log, loss reasons, the funnel ---------- */
  var SRC={website:'الموقع',instagram:'إنستغرام',whatsapp:'واتساب',referral:'توصية',email:'إيميل',meeting:'لقاء',other:'غيره'};
  var LOST_DEF=['السعر','التوقيت','ما عاد ردّ','اختار غيرنا','مش مناسب لنا','غيره'];
  var OPEN_ST=['new','discussing','confirmed','awaiting-payment'], WON_ST=['paid','in-progress','review','delivered'], NEWOPP=false;
  function lostReasons(){ var l=P&&P.crm&&P.crm.lostReasons; return l&&l.length?l:LOST_DEF; }
  function todayISO(){ var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function hiddenOpp(o){ return !!o.manual && !o.clientVisible && ['new','discussing','cancelled'].indexOf(o.status)>=0; }
  function srcOf(o){ return o.source||'website'; }
  function dueFollow(o){ return !!o.followUp && o.followUp<=todayISO() && o.status!=='cancelled' && o.status!=='delivered'; }
  function srcSel(attr,val){ return '<select '+attr+'>'+Object.keys(SRC).map(function(s){ return '<option value="'+s+'"'+(s===val?' selected':'')+'>'+SRC[s]+'</option>'; }).join('')+'</select>'; }
  function fdate(s){ return s? new Date(s+'T12:00:00').toLocaleDateString('ar-u-nu-latn',{day:'numeric',month:'short'}) : ''; }
  function topOf(arr){ var m={}; arr.forEach(function(x){ if(x) m[x]=(m[x]||0)+1; }); return Object.keys(m).sort(function(a,b){ return m[b]-m[a]; }).map(function(k){ return [k,m[k]]; }); }
  function funnel(){
    var open=ORDERS.filter(function(o){ return OPEN_ST.indexOf(o.status)>=0; }), val=open.reduce(function(a,o){ return a+pnum(o.price||o.total); },0);
    var since=Date.now()-30*864e5, recent=ORDERS.filter(function(o){ return Date.parse(o.createdAt)>=since; }), won=recent.filter(function(o){ return o.paid||WON_ST.indexOf(o.status)>=0; });
    var paidSum=ORDERS.filter(function(o){return o.paid}).reduce(function(a,o){ return a+(parseFloat(o.paidAmount||o.price)||0); },0);
    var srcs=topOf(ORDERS.map(srcOf)), lost=topOf(ORDERS.filter(function(o){ return o.status==='cancelled'; }).map(function(o){ return o.lostReason; }));
    return '<div class="kpis"><div><b>'+open.length+'</b><span>فرص مفتوحة'+(val?' · <span dir="ltr">'+esc(pfmt(val,(C.packages&&C.packages.currency)||'$'))+'</span>':'')+'</span></div>'+
      '<div><b>'+ORDERS.filter(dueFollow).length+'</b><span>بحاجة متابعة اليوم</span></div>'+
      '<div><b>'+(recent.length?Math.round(won.length*100/recent.length)+'%':'—')+'</b><span>تحوّلت لشغل (آخر 30 يوم'+(recent.length?' · '+won.length+' من '+recent.length:'')+')</span></div>'+
      '<div><b dir="ltr">'+paidSum+'</b><span>مجموع المدفوع</span></div></div>'+
      (srcs.length||lost.length?'<p class="small muted crm-line">'+(srcs.length?'من وين بيجوا: '+srcs.slice(0,4).map(function(x){ return esc(SRC[x[0]]||x[0])+' <b>'+x[1]+'</b>'; }).join(' · '):'')+(lost.length?(srcs.length?'<span class="sep">|</span>':'')+'أكتر سبب خسارة: '+esc(lost[0][0])+' <b>'+lost[0][1]+'</b>':'')+'</p>':'');
  }
  function oppForm(){
    return '<form class="opp" id="oppForm"><div class="ph"><b>فرصة جديدة</b><span class="small muted">حدا كتبلك برّا الموقع؟ سجّله هون، وبيمشي بنفس المراحل ومسار الدفع</span></div>'+
      '<div class="row"><div class="field"><label>الاسم *</label><input name="name" dir="auto" required></div><div class="field"><label>التواصل (رقم أو حساب)</label><input name="contact" dir="ltr"></div></div>'+
      '<div class="row"><div class="field"><label>الإيميل (اختياري)</label><input name="email" type="email" dir="ltr"></div><div class="field"><label>المصدر</label>'+srcSel('name="source"','instagram')+'</div></div>'+
      '<div class="row"><div class="field"><label>شو بدو باختصار</label><input name="title" dir="auto" placeholder="مثال: فيديو إطلاق مطعم"></div><div class="field"><label>القيمة التقديرية</label><input name="value" dir="ltr" placeholder="300 $"></div></div>'+
      '<div class="field"><label>التفاصيل</label><textarea name="details" dir="auto"></textarea></div>'+
      '<div class="row"><div class="field"><label>الخطوة الجاية</label><input name="nextStep" dir="auto" placeholder="مثال: ابعتله عرض السعر"></div><div class="field"><label>موعد المتابعة</label><input name="followUp" type="date" value="'+todayISO()+'"></div></div>'+
      '<div class="actions"><button class="btn primary sm" type="submit">إضافة الفرصة</button><button class="btn sm" type="button" data-oppx>إلغاء</button></div></form>';
  }
  function crmFields(o,k){
    var cancelled=o.status==='cancelled', canConv=o.email && WON_ST.concat(['confirmed','awaiting-payment']).indexOf(o.status)>=0;
    return '<div class="crm">'+(hiddenOpp(o)?'<p class="small hid">🔒 مخفية عن العميل: ما بتطلع بحسابه وما بيوصله أي إيميل، لحد ما تصير «مؤكَّد»</p>':'')+
      '<div class="row"><div class="field"><label>المصدر</label>'+srcSel('data-of="source"',srcOf(o))+'</div><div class="field"><label>موعد المتابعة</label><input type="date" data-of="followUp" value="'+esc(o.followUp||'')+'"></div></div>'+
      '<div class="field"><label>الخطوة الجاية</label><input data-of="nextStep" dir="auto" value="'+esc(o.nextStep||'')+'" placeholder="شو لازم يصير بعدين؟"></div>'+
      '<div class="field lostf"'+(cancelled?'':' hidden')+'><label>ليش ما مشي؟</label><select data-of="lostReason"><option value="">اختر السبب…</option>'+lostReasons().map(function(r){ return '<option'+(r===o.lostReason?' selected':'')+'>'+esc(r)+'</option>'; }).join('')+(o.lostReason&&lostReasons().indexOf(o.lostReason)<0?'<option selected>'+esc(o.lostReason)+'</option>':'')+'</select></div>'+
      (o.email?'':'<div class="field"><label>إيميل العميل (لحسابه ومسار الدفع)</label><input data-of="email" type="email" dir="ltr" placeholder="name@example.com"></div>')+
      '<div class="touch"><div class="small muted">سجل التواصل</div><div class="trow">'+srcSel('data-tch','whatsapp')+'<input data-tnote dir="auto" placeholder="شو صار؟ مثال: بعتتله الأسعار، رح يرد بكرا"><button class="btn sm" type="button" data-otouch="'+k+'">سجّل</button></div>'+
        ((o.touches||[]).length?'<ul class="tlist">'+o.touches.slice(0,6).map(function(t){ return '<li><b>'+esc(SRC[t.channel]||t.channel)+'</b> '+esc(t.note)+'<span class="small muted"> · '+esc(new Date(t.at).toLocaleDateString('ar-u-nu-latn',{day:'numeric',month:'short'}))+'</span></li>'; }).join('')+'</ul>':'')+'</div>'+
      (canConv?'<button class="btn sm conv" type="button" data-oconv="'+k+'">حوّله لعميل متعاقد ←</button>':'')+
    '</div>';
  }
  function api(path,method,body){ return fetch(API+path,{method:method,headers:headers({'content-type':'application/json'}),body:JSON.stringify(body)}).then(function(r){ return r.json().then(function(j){ j.status=r.status; return j; },function(){ return {status:r.status}; }); }); }
  // a won order becomes a contracted client: the client record, the account (or the existing one upgraded), then the profile with the login details
  function convertClient(o,b){
    if(!LIVE||o.demo){ toast('يعمل على الموقع المنشور',true); return; }
    var em=o.email, phone=/^\+?[0-9 ()-]{8,}$/.test(o.contact||'')?o.contact.trim():''; b.disabled=true;
    fetch(API+'/work?admin=1&profile='+encodeURIComponent(em),{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).catch(function(){ return {}; })
      .then(function(p){ return p&&p.ok&&p.client? null : api('/work','POST',{action:'clientSave',email:em,name:o.name,phone:phone}); })
      .then(function(){ return api('/access','POST',{action:'createAccount',email:em,name:o.name,lang:o.lang==='en'?'en':'ar'}); })
      .then(function(r){
        if(r.ok){ PKG={email:em,name:o.name,password:r.password,link:r.link,lang:r.lang,phone:phone,sent:r.sent}; return 'جاهز: هاي بيانات دخول العميل، ابعتله ياها'; }
        if(r.error==='exists') return api('/access','POST',{action:'setRole',email:em,role:'client'}).then(function(){ return 'عنده حساب أصلاً، فتفعّلت له مساحة العمل'; });
        throw new Error(r.error||'fail'); })
      .then(function(msg){ return api('/orders','PATCH',{key:o.key,link:true}).then(function(){ return msg; },function(){ return msg; }); })
      .then(function(msg){ toast(msg); TAB='clients'; CL=null; render(); loadUsers(); loadClients(); loadProfile(em,'overview'); scrollTo(0,0); })
      .catch(function(){ b.disabled=false; toast('ما زبط التحويل، جرّب مرة تانية',true); });
  }
  document.addEventListener('change',function(e){ var el=e.target; if(TAB!=='orders') return;
    if(el.matches('.order [data-of="status"]')){ var lf=el.closest('.order').querySelector('.lostf'); if(lf) lf.hidden=el.value!=='cancelled'; } });
  document.addEventListener('submit',function(e){ var f=e.target; if(f.id!=='oppForm') return; e.preventDefault();
    var d={action:'manual'}; [].forEach.call(f.elements,function(el){ if(el.name) d[el.name]=el.value.trim(); });
    if(!d.name){ toast('اكتب الاسم',true); f.elements.name.focus(); return; }
    if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)){ toast('الإيميل مش صحيح',true); f.elements.email.focus(); return; }
    var add=function(o){ ORDERS.unshift(o); NEWOPP=false; OFILTER='all'; renderOrders(); var dd=document.querySelector('[data-okey="'+o.key+'"]'); if(dd){ dd.open=true; dd.scrollIntoView({block:'center'}); } toast('انضافت الفرصة '+o.code); };
    if(!LIVE){ var now=new Date().toISOString(); add({key:'order:demo-'+Date.now(),code:'EB-DEMO'+(ORDERS.length+1),status:'new',createdAt:now,name:d.name,contact:d.contact,email:d.email,details:d.details||'—',packageName:d.title||'فرصة',total:d.value,source:d.source,manual:true,nextStep:d.nextStep,followUp:d.followUp,touches:[],messages:[],history:[{at:now,status:'new'}],demo:true}); return; }
    var b=f.querySelector('[type=submit]'); b.disabled=true;
    api('/orders','POST',d).then(function(j){ if(!j.ok) throw new Error(j.error); add(j.order); }).catch(function(err){ b.disabled=false; toast(err.message==='email'?'الإيميل مش صحيح':'ما انحفظت، جرّب مرة تانية',true); }); });
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-oppnew],[data-oppx],[data-otouch],[data-oconv],[data-lostsave]'); if(!b) return;
    if(b.hasAttribute('data-oppnew')){ NEWOPP=!NEWOPP; renderOrders(); var f=$('#oppForm'); if(f) f.elements.name.focus(); return; }
    if(b.hasAttribute('data-oppx')){ NEWOPP=false; renderOrders(); return; }
    if(b.dataset.oconv){ convertClient(orderOf(b.dataset.oconv),b); return; }
    if(b.hasAttribute('data-lostsave')){ var l=$('#lostList').value.split('\n').map(function(s){ return s.trim(); }).filter(Boolean).slice(0,20);
      P=P||{}; P.crm=Object.assign({},P.crm,{lostReasons:l});
      if(!LIVE){ savePrivDraft(); renderOrders(); toast('انحفظت الأسباب'); return; }
      b.disabled=true; fetch(API+'/private',{method:'PUT',headers:headers({'content-type':'application/json'}),body:JSON.stringify(P)}).then(function(r){ if(!r.ok) throw 0; PSAVED=JSON.stringify(P); renderOrders(); toast('انحفظت الأسباب'); }).catch(function(){ b.disabled=false; toast('ما انحفظت',true); }); return; }
    var o=orderOf(b.dataset.otouch), box=b.closest('.touch'), note=box.querySelector('[data-tnote]').value.trim(), ch=box.querySelector('[data-tch]').value;
    if(!note){ toast('اكتب شو صار',true); box.querySelector('[data-tnote]').focus(); return; }
    var addT=function(t){ o.touches=t||[{at:new Date().toISOString(),channel:ch,note:note}].concat(o.touches||[]); renderOrders(); var dd=document.querySelector('[data-okey="'+o.key+'"]'); if(dd) dd.open=true; toast('انسجّل التواصل'); };
    if(!LIVE||o.demo){ addT(); return; }
    b.disabled=true; api('/orders','PATCH',{key:o.key,touch:{channel:ch,note:note}}).then(function(j){ if(!j.ok) throw 0; addT(j.order.touches); }).catch(function(){ b.disabled=false; toast('ما انسجّل',true); });
  });

  /* ---------- documents: a quote and an agreement per order, each a private link the client opens, saves as PDF and accepts / signs ---------- */
  var DTYPE={quote:'عرض سعر',agreement:'اتفاقية'}, DOCS={}, DED=null;
  var DDEF={
    ar:{includes:['مساحة عمل خاصة على الموقع لمتابعة المشروع ومراجعة النسخ واعتمادها','الموسيقى والمؤثرات الصوتية المرخّصة لاستخدامها ضمن المشروع','نسخ بالمقاسات المتفق عليها لكل منصة','الملف النهائي بجودة عالية (MP4)'],
        excludes:['التصوير الميداني ومعداته، ما لم يُذكر في البنود','الملفات المفتوحة للمشروع (Premiere Pro / After Effects)','تكاليف الإعلانات الممولة','تراخيص لقطات أو موسيقى يطلبها العميل من خارج مكتباتنا']},
    en:{includes:['A private workspace on our site to follow the project and review and approve each version','Licensed music and sound effects for use within this project','Versions in the agreed sizes for each platform','Final high-quality file (MP4)'],
        excludes:['On-location filming and equipment, unless listed above','Open project files (Premiere Pro / After Effects)','Paid advertising costs','Licences for footage or music the client requests from outside our libraries']}};
  // shortcut: fixed pegs (KWD is a basket, ~0.307) and a hand-set SYP rate; no live rates service, update the SYP rate when it moves
  var FXC=[['$','دولار أمريكي',1],['AED','درهم إماراتي',3.6725],['SAR','ريال سعودي',3.75],['QAR','ريال قطري',3.64],['KWD','دينار كويتي',0.307],['BHD','دينار بحريني',0.376],['OMR','ريال عُماني',0.3845],['SYP','ليرة سورية',13000]];
  // the pound follows the daily market price (sp-today, via /api/fx) unless the studio typed a rate after that update
  var FXLIVE=null;
  function loadFx(){ if(!LIVE) return; fetch(API+'/fx',{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ FXLIVE=j; if(TAB==='today') renderTabs(); }).catch(function(){ FXLIVE={ok:false}; }); }
  function fxRate(c){ var o=(P&&P.fx)||{}, at=(P&&P.fxAt)||{}; if(c==='SYP'&&FXLIVE&&+FXLIVE.SYP&&(!at.SYP||Date.parse(FXLIVE.at)>Date.parse(at.SYP))) return +FXLIVE.SYP; if(+o[c]) return +o[c]; var x=FXC.filter(function(k){ return k[0]===c; })[0]; return x?x[2]:1; }
  function fxConv(v,from,to){ var n=pnum(v)/fxRate(from)*fxRate(to); return to==='SYP'?Math.round(n):Math.round(n*100)/100; }
  function curSel(attr,val){ var known=FXC.some(function(k){ return k[0]===val; }); return '<select '+attr+'>'+FXC.map(function(k){ return '<option value="'+k[0]+'"'+(k[0]===val?' selected':'')+'>'+k[1]+' · '+k[0]+'</option>'; }).join('')+(val&&!known?'<option selected value="'+esc(val)+'">'+esc(val)+'</option>':'')+'</select>'; }
  function fxBox(c){ return c&&c!=='$'&&FXC.some(function(k){ return k[0]===c; })?'<span class="fx small muted">1$ = <input data-dfx="'+c+'" dir="ltr" value="'+fxRate(c)+'"> '+c+(c==='SYP'&&FXLIVE&&FXLIVE.at?' · <span title="سعر المبيع بدمشق">تلقائي من «الليرة اليوم» · '+esc(new Date(FXLIVE.at).toLocaleDateString('ar-u-nu-latn',{day:'numeric',month:'short'}))+'</span>':'')+'</span>':''; }
  function saveFx(c,v){ P=P||{}; P.fx=Object.assign({},P.fx); P.fx[c]=+v; P.fxAt=Object.assign({},P.fxAt); P.fxAt[c]=new Date().toISOString(); if(!LIVE){ savePrivDraft(); return; } fetch(API+'/private',{method:'PUT',headers:headers({'content-type':'application/json'}),body:JSON.stringify(P)}).then(function(r){ if(!r.ok) throw 0; PSAVED=JSON.stringify(P); toast('انحفظ سعر الصرف'); }).catch(function(){ toast('ما انحفظ سعر الصرف',true); }); }
  document.addEventListener('change',function(e){ var el=e.target;
    if(el.dataset.dfx){ if(+el.value>0) saveFx(el.dataset.dfx,el.value); return; }
    // documents: switching currency converts every price and the discount from the old currency to the new one
    if(el.hasAttribute('data-dcur')&&DED){ var b=DED.b, from=b.cur||'$', to=el.value; b.items.forEach(function(x){ x.unit=fxConv(x.unit,from,to); }); if(pnum(b.discount)) b.discount=fxConv(b.discount,from,to); b.cur=to; drawDoc(); return; }
    // team task: the fee follows the currency
    if(el.hasAttribute('data-tcur')){ var fee=el.form&&el.form.elements.fee, from2=el.dataset.prev||'$'; if(fee&&pnum(fee.value)) fee.value=fxConv(fee.value,from2,el.value); el.dataset.prev=el.value; } });
  function dset(){ var d=(P&&P.docs)||{}, s=(C.settings||{});
    return {studioName:d.studioName||'Eyeblink Studio', studioPlace:d.studioPlace||'', studioContact:d.studioContact||[s.whatsapp,s.email].filter(Boolean).join('\n'),
      payMethods:d.payMethods||'Binance Pay (USDT) · Western Union', payIds:d.payIds||['binance','westernunion'], payOther:d.payOther||'', days:d.days||10, revisions:d.revisions!=null?d.revisions:2, valid:d.valid||14, plan:d.plan||'split', pct:d.pct||50,
      approvalDays:d.approvalDays||7, silenceDays:d.silenceDays||14, archiveDays:d.archiveDays||60, jurisdiction:d.jurisdiction||'', lists:d.lists||{}}; }
  function dlists(lang){ var L=dset().lists[lang]||{}; return {includes:L.includes||DDEF[lang].includes, excludes:L.excludes||DDEF[lang].excludes}; }
  function revAr(n){ return n==0?'لا يشمل جولات تعديل':'يشمل '+(n==1?'جولة واحدة':n==2?'جولتين':n+' جولات')+' من التعديلات'; }
  // the agreement's terms, written from the deal's numbers; the studio can still rewrite any of them for one client
  function clausesFor(lang,v){
    var en=lang==='en', total=v.total, pay;
    if(!en){
      pay= v.plan==='full' ? 'قيمة المشروع الإجمالية '+total+'، يدفعها الطرف الثاني كاملة قبل بدء التنفيذ. ويبدأ العمل بعد وصول المبلغ، وتصدر فاتورة بالدفعة'
        : 'قيمة المشروع الإجمالية '+total+'. يدفع الطرف الثاني '+v.pct+'% منها عربوناً قبل بدء التنفيذ، ويدفع الباقي قبل استلام النسخ النهائية. ويبدأ العمل بعد وصول العربون، وتصدر فاتورة بكل دفعة';
      return [
        {h:'موضوع الاتفاقية', p:'يتفق الطرف الأول ('+v.studio+') مع الطرف الثاني ('+v.client+') على تنفيذ مشروع «'+v.title+'» وفق نطاق العمل والمخرجات المبيّنة أعلاه، ووفق البريف المعتمد من الطرفين'},
        {h:'القيمة وطريقة الدفع', p:pay+(v.payMethods?'. طرق الدفع المعتمدة: '+v.payMethods+'، وأي رسوم تحويل يتحملها الطرف الثاني':'')},
        {h:'مدة التنفيذ', p:'مدة التنفيذ المتوقعة '+(v.days?v.days+' يوم عمل':'يُتفق عليها عند البدء')+'، تبدأ من تاريخ استلام العربون والمواد اللازمة كاملة. ولا تُحتسب ضمنها أي فترة تأخير سببها تأخر الطرف الثاني في إرسال المواد أو المحتوى، أو في الرد والملاحظات، أو طلب تعديلات خارج نطاق العمل'},
        {h:'المواد والمحتوى', p:'يلتزم الطرف الثاني بتزويد الطرف الأول بكل ما يلزم للتنفيذ قبل البدء، مثل اللقطات والصور والشعارات والنصوص والهوية البصرية والموافقات اللازمة. ويقرّ بأنه يملك حق استخدام كل ما يرسله، ويتحمل وحده أي مطالبة تتعلق به'},
        {h:'مساحة العمل', p:'يحصل الطرف الثاني طوال مدة المشروع على حساب في مساحة عمل Eyeblink على الموقع، يتابع منه مراحل التنفيذ، ويستلم النسخ ويراجعها ويعتمدها، ويرسل ملاحظاته وملفاته، ويجد فواتيره. وتُعدّ الموافقات والملاحظات المرسلة عبرها موافقات كتابية بموجب هذه الاتفاقية'},
        {h:'التعديلات', p:'المشروع '+revAr(v.revisions)+'. جولة التعديل هي قائمة ملاحظات واحدة مجمّعة على نسخة واحدة. ولا يُعد تعديلاً تغيير الفكرة أو السكريبت بعد اعتماده، أو إضافة مطالب جديدة، أو إعادة تنفيذ عمل معتمد، وتُحتسب هذه أعمالاً إضافية'},
        {h:'الأعمال الإضافية', p:'أي طلب خارج نطاق العمل أو زيادة في حجمه يُسعَّر ويُتفق عليه كتابياً قبل تنفيذه، وقد يغيّر موعد التسليم'},
        {h:'اعتماد المخرجات', p:'تُعدّ النسخة معتمدة عند موافقة الطرف الثاني عليها كتابياً بأي وسيلة تواصل معتمدة بين الطرفين، أو إذا مضى '+v.silenceDays+' يوماً على تسليمها دون ملاحظات. وإذا تأخر الرد أكثر من '+v.approvalDays+' أيام، يُعدَّل موعد التسليم بقدر التأخير'},
        {h:'الموسيقى والعناصر المرخّصة', p:'تُستخدم الموسيقى والمؤثرات واللقطات والخطوط المرخّصة وفق شروط مزوّديها، ولاستخدامها ضمن هذا المشروع فقط. ولا تشمل القيمة شراء تراخيص إضافية أو عناصر مدفوعة يطلبها الطرف الثاني، وتُحتسب تكلفتها منفصلة'},
        {h:'الملفات المفتوحة', p: v.sourceFiles ? 'تشمل قيمة المشروع تسليم الملفات المفتوحة للمشروع بعد سداد كامل القيمة، دون العناصر المرخّصة التي لا تسمح شروطها بنقلها'
          : 'لا تشمل قيمة المشروع تسليم الملفات المفتوحة أو المصدرية (مثل ملفات Premiere Pro وAfter Effects)، وتُسلَّم المخرجات النهائية بالصيغ المتفق عليها فقط، ما لم يُتفق كتابياً على غير ذلك'},
        {h:'الملكية وحقوق الاستخدام', p:'تنتقل حقوق استخدام المخرجات النهائية إلى الطرف الثاني بعد سداد كامل قيمة المشروع، ولا يحق له نشرها أو استخدامها قبل ذلك. وتُرسل نسخ المراجعة بجودة مخفّضة أو بعلامة مائية'},
        {h:'حق عرض الأعمال', p: v.portfolio ? 'يحتفظ الطرف الأول بحقه في عرض المشروع أو مقاطع منه ضمن أعماله وملف أعماله ومنصاته بعد نشره من الطرف الثاني، ما لم يُتفق كتابياً على خلاف ذلك'
          : 'لا يعرض الطرف الأول المشروع ضمن أعماله أو على منصاته إلا بموافقة كتابية من الطرف الثاني'},
        {h:'إلغاء المشروع', p:'إذا ألغى الطرف الثاني المشروع بعد بدء التنفيذ فلا يُسترد العربون، ويلتزم بسداد قيمة ما أُنجز حتى تاريخ الإلغاء إن تجاوزت العربون'},
        {h:'التأخر في الدفع', p:'إذا تأخر الطرف الثاني عن سداد أي دفعة مستحقة، يحق للطرف الأول إيقاف العمل أو تأجيل التسليم حتى استلامها، دون أن يُعد ذلك إخلالاً بالتزاماته'},
        {h:'السرية', p:'يلتزم الطرفان بعدم مشاركة أي ملفات أو معلومات خاصة بالمشروع مع أي طرف ثالث دون موافقة الطرف الآخر'},
        {h:'حفظ الملفات', p:'يحتفظ الطرف الأول بنسخة من ملفات المشروع مدة '+v.archiveDays+' يوماً من تاريخ التسليم النهائي، ولا يلتزم بعدها بحفظها أو توفير نسخ منها'},
        {h:'أحكام عامة', p:'تُعدّ المراسلات والموافقات عبر البريد الإلكتروني وتطبيقات المراسلة المعتمدة بين الطرفين جزءاً مكمّلاً لهذه الاتفاقية. ولا يُعتدّ بأي تعديل عليها ما لم يكن موثّقاً وموافَقاً عليه من الطرفين، وعند التعارض مع أي اتفاق سابق تُعدّ هذه الاتفاقية المرجع المعتمد. ويسعى الطرفان لحل أي خلاف ودياً، وإن تعذّر ذلك '+(v.jurisdiction?'فالمرجع: '+v.jurisdiction:'فالاختصاص للمحاكم المختصة في بلد الطرف الأول')} ];
    }
    pay= v.plan==='full' ? 'The total project value is '+total+', paid in full by the Client before work begins. Work starts once payment is received, and an invoice is issued for it'
      : 'The total project value is '+total+'. The Client pays '+v.pct+'% as a deposit before work begins and the balance before receiving the final versions. Work starts once the deposit is received, and an invoice is issued for each payment';
    var rev= v.revisions==0?'includes no revision rounds':'includes '+(v.revisions==1?'one revision round':v.revisions==2?'two revision rounds':v.revisions+' revision rounds');
    return [
      {h:'Purpose', p:'The First Party ('+v.studio+') agrees with the Second Party ('+v.client+') to produce the project “'+v.title+'” according to the scope and deliverables set out above and the brief approved by both parties'},
      {h:'Value and payment', p:pay+(v.payMethods?'. Accepted payment methods: '+v.payMethods+'; any transfer fees are borne by the Client':'')},
      {h:'Timeline', p:'The expected timeline is '+(v.days?v.days+' working days':'agreed at kick-off')+', starting from receipt of the deposit and all required materials. It excludes any delay caused by the Client sending materials late, replying or giving feedback late, or requesting changes outside the scope'},
      {h:'Materials and content', p:'The Client provides everything needed before work begins — footage, images, logos, copy, brand assets and approvals — and confirms it holds the right to use everything it sends, bearing sole responsibility for any related claim'},
      {h:'Workspace', p:'For the length of the project the Client has an account in the Eyeblink workspace on our site to follow each stage, receive, review and approve versions, send feedback and files, and find its invoices. Approvals and feedback sent there count as written approvals under this agreement'},
      {h:'Revisions', p:'The project '+rev+'. A revision round is one consolidated list of feedback on one version. Changing the idea or script after approval, adding new requirements, or redoing approved work are not revisions and are charged as additional work'},
      {h:'Additional work', p:'Any request outside the scope, or an increase in its volume, is priced and agreed in writing before it is done, and may change the delivery date'},
      {h:'Approval of deliverables', p:'A version is approved once the Client confirms it in writing through any agreed channel, or if '+v.silenceDays+' days pass after delivery without feedback. If a reply takes longer than '+v.approvalDays+' days, the delivery date moves by the length of the delay'},
      {h:'Music and licensed elements', p:'Licensed music, sound effects, footage and fonts are used under their providers’ terms and for this project only. The value does not include buying extra licences or paid elements the Client requests; those are charged separately'},
      {h:'Project files', p: v.sourceFiles ? 'The value includes the open project files, handed over after full payment, excluding licensed elements whose terms do not allow transfer'
        : 'The value does not include open or source files (such as Premiere Pro and After Effects projects); final deliverables are provided in the agreed formats only, unless agreed otherwise in writing'},
      {h:'Ownership and usage rights', p:'Usage rights to the final deliverables pass to the Client once the project is paid in full; before that the Client may not publish or use them. Review versions are sent at reduced quality or watermarked'},
      {h:'Portfolio', p: v.portfolio ? 'The First Party may show the project, or parts of it, in its portfolio and on its platforms after the Client has published it, unless agreed otherwise in writing'
        : 'The First Party will not show the project in its portfolio or on its platforms without the Client’s written consent'},
      {h:'Cancellation', p:'If the Client cancels after work has begun, the deposit is non-refundable, and the Client pays for the work completed up to the cancellation date where it exceeds the deposit'},
      {h:'Late payment', p:'If any payment is late, the First Party may pause work or postpone delivery until it is received, without this being a breach of its obligations'},
      {h:'Confidentiality', p:'Neither party shares files or private information about the project with any third party without the other’s consent'},
      {h:'File retention', p:'The First Party keeps a copy of the project files for '+v.archiveDays+' days after final delivery, after which it is not obliged to keep them or provide copies'},
      {h:'General', p:'Emails and messages exchanged through the parties’ agreed channels form part of this agreement. No amendment is valid unless documented and accepted by both parties, and this agreement prevails over any earlier arrangement. The parties will try to settle any dispute amicably; failing that, it falls under '+(v.jurisdiction||'the competent courts in the First Party’s country')} ];
  }
  function docUrl(t,type){ return location.origin+'/'+(type==='agreement'?'agreement':type==='quote'?'quote':'d')+'/'+t; }
  function payList(){ return ((C.payments&&C.payments.methods)||[]).filter(function(m){ return m&&m.id&&m.name; }); }
  // the methods line the client reads: the ticked methods in the site's order, then anything written by hand
  function payText(b){ var ids=b.payIds||[]; return payList().filter(function(m){ return ids.indexOf(m.id)>=0; }).map(function(m){ return m.name; }).concat(String(b.payOther||'').trim()?[String(b.payOther).trim()]:[]).join(' · '); }
  function docShareText(o,s,lang,url){ var en=lang==='en', n=(o.name||'').trim();
    return en ? 'Hello '+n+', here is the '+(s.type==='quote'?'quote':'service agreement')+' for “'+(s.title||'')+'”:\n'+url+'\nYou can download it as a PDF and '+(s.type==='quote'?'accept it':'sign it')+' from the same link'
      : 'مرحباً '+n+'، هذا '+(s.type==='quote'?'عرض السعر':'اتفاق العمل')+' لمشروع «'+(s.title||'')+'»:\n'+url+'\nيمكنك تحميله PDF و'+(s.type==='quote'?'الموافقة عليه':'توقيعه')+' من الرابط نفسه'; }
  function waLink(contact,text){ var dg=String(contact||'').replace(/[^0-9]/g,''); return 'https://wa.me/'+(/^\+?[0-9 ()-]{8,}$/.test(String(contact||'').trim())?dg:'')+'?text='+encodeURIComponent(text); }
  function docState(s){ return s.status==='accepted'? (s.type==='quote'?'✓ وافق':'✓ وقّع')+(s.acceptedBy?' · '+s.acceptedBy:'') : s.viewedAt? 'شافه العميل' : 'مُرسل، ما انفتح لسا'; }
  function docsBox(o,k){
    var list=o.docs||[];
    return '<div class="docs"><div class="dh"><b>عرض السعر والاتفاقية</b><span class="small muted">برابط خاص: العميل بيفتحه، بيحمّله PDF، وبيوافق أو بيوقّع</span></div>'+
      (list.length?'<ul class="dlist">'+list.map(function(s){ return '<li><div class="dl1"><b>'+esc(DTYPE[s.type])+'</b> <span dir="ltr" class="muted">'+esc(s.no)+(s.ver>1?' · v'+s.ver:'')+'</span><span class="pill '+(s.status==='accepted'?'ok':s.viewedAt?'seen':'')+'">'+esc(docState(s))+'</span></div>'+
        '<div class="dl2"><a class="btn sm" href="'+esc(docUrl(s.token,s.type))+'" target="_blank" rel="noopener">فتح</a><a class="btn sm" href="'+esc(docUrl(s.token,s.type))+'?print=1" target="_blank" rel="noopener">PDF</a>'+
        '<button class="btn sm" type="button" data-dshare="'+k+'" data-t="'+esc(s.token)+'">إرسال</button>'+(s.status!=='accepted'?'<button class="btn sm" type="button" data-dedit="'+k+'" data-t="'+esc(s.token)+'" data-type="'+s.type+'">تعديل</button>':'')+
        (s.type==='quote'&&s.status==='accepted'&&!list.some(function(x){return x.type==='agreement'})?'<button class="btn sm primary" type="button" data-dnew="'+k+'" data-type="agreement" data-from="'+esc(s.token)+'">اتفاقية من هالعرض</button>':'')+'</div></li>'; }).join('')+'</ul>':'')+
      onboardBox(o,k)+
      '<div class="actions"><button class="btn sm" type="button" data-dnew="'+k+'" data-type="quote">+ عرض سعر</button><button class="btn sm" type="button" data-dnew="'+k+'" data-type="agreement">+ اتفاقية</button></div></div>';
  }
  // after the agreement is signed: the client's way in, their project in the workspace, then the deposit — one short checklist
  function onboardBox(o,k){
    var ag=(o.docs||[]).filter(function(s){ return s.type==='agreement'&&s.status==='accepted'; })[0]; if(!ag) return '';
    var ob=o.onboard||{}, inv=ob.invite?location.origin+(o.lang==='en'?'/en':'')+'/account.html?invite='+ob.invite:'', dep=o.paid||(o.deposit&&o.deposit.paid);
    var row=function(done,title,body){ return '<li class="'+(done?'ok':'')+'"><i>'+(done?'✓':'')+'</i><div><b>'+title+'</b>'+(body?'<div class="small">'+body+'</div>':'')+'</div></li>'; };
    var waTxt=(o.lang==='en'?'Your workspace for the project is ready. Activate it with your email '+(ob.email||o.email||'')+':\n':'مساحة العمل الخاصة بمشروعك جاهزة. فعّلها ببريدك '+(ob.email||o.email||'')+':\n')+inv;
    return '<div class="onb"><div class="small muted">بعد التوقيع</div><ol>'+
      row(true,'وقّع الاتفاقية '+esc(ag.no),esc(ag.acceptedBy||'')+(ag.acceptedAt?' · '+esc(new Date(ag.acceptedAt).toLocaleDateString('ar-u-nu-latn',{day:'numeric',month:'short'})):''))+
      row(!!ob.client,'مساحة العمل', ob.client?'عنده حساب متعاقد أصلاً':
        (inv?'الدعوة جاهزة وظاهرة للعميل بصفحة الاتفاقية نفسها. لما يفعّلها بيوصلك تيليغرام<div class="dl2"><a class="btn sm" target="_blank" rel="noopener" href="'+esc(waLink(o.contact,waTxt))+'">ابعتله الدعوة واتساب</a><button class="btn sm" type="button" data-copytxt="'+esc(inv)+'">نسخ رابط الدعوة</button>'+(o.email?'<button class="btn sm" type="button" data-oconv="'+k+'">أو جهّز حسابه بكلمة سر مؤقتة</button>':'')+'</div>':'ما في إيميل للعميل'))+
      row(!!o.projectId,'مشروعه بمساحة العمل', o.projectId?'مربوط بـ «'+esc(o.projectName||'')+'»':'<div class="dl2"><button class="btn sm primary" type="button" data-oproj="'+k+'">افتح مشروعه من الاتفاقية</button></div>')+
      row(!!dep,'العربون', dep?'وصل':'من «مسار الدفع» تحت: السعر وخطة الدفع جاهزين من العرض')+
    '</ol></div>';
  }
  // the agreement becomes a project in the workspace: client record (if new), project with dates from the timeline, linked to this order
  function openProject(o,b){
    if(!LIVE||o.demo){ toast('يعمل على الموقع المنشور',true); return; }
    var em=o.email; if(!em){ toast('ما في إيميل للعميل',true); return; } b.disabled=true;
    loadDocs(o).then(function(list){ var ag=list.filter(function(d){ return d.type==='agreement'&&d.accepted; })[0]; if(!ag) throw new Error('no agreement');
      var B=ag.body, start=new Date(), end=new Date(Date.now()+Math.ceil((+B.days||10)*7/5)*864e5), iso=function(d){ return d.toISOString().slice(0,10); };
      return fetch(API+'/work?admin=1&profile='+encodeURIComponent(em),{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).catch(function(){ return {}; })
        .then(function(p){ return p&&p.ok&&p.client? null : api('/work','POST',{action:'clientSave',email:em,name:B.client.name||o.name,company:B.client.company||'',phone:/^\+?[0-9 ()-]{8,}$/.test(o.contact||'')?o.contact.trim():''}); })
        .then(function(){ return api('/work','POST',{action:'project',client_email:em,name:B.title,type:'once',start_date:iso(start),end_date:iso(end),description:(B.summary?B.summary+'\n\n':'')+B.items.map(function(x){ return '• '+x.name+(x.qty>1?' ×'+x.qty:''); }).join('\n')+'\n\n'+ag.no,services:B.items.map(function(x){ return x.name; }).slice(0,12)}); })
        .then(function(j){ if(!j.ok) throw new Error(j.error||'fail'); return api('/orders','PATCH',{key:o.key,project:j.id}); })
        .then(function(j){ if(!j.ok) throw new Error(j.error||'fail'); Object.assign(o,j.order); WORK=null; renderOrders(); var dd=document.querySelector('[data-okey="'+o.key+'"]'); if(dd) dd.open=true; toast('انفتح مشروعه بمساحة العمل وانربط بالطلب'); }); })
      .catch(function(err){ b.disabled=false; toast(({'not client':'عنده حساب عادي لسا: استنى يفعّل الدعوة، أو رقّيه من «العملاء»','no account':'ما في حساب ولا سجل عميل بهالإيميل','no agreement':'ما في اتفاقية موقّعة'})[err.message]||'ما زبط، جرّب مرة تانية',true); });
  }
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-oproj],[data-copytxt]'); if(!b) return;
    if(b.dataset.oproj){ openProject(orderOf(b.dataset.oproj),b); return; }
    try{ navigator.clipboard.writeText(b.dataset.copytxt).then(function(){ toast('انتسخ الرابط'); }); }catch(_){ toast('ما انتسخ',true); } });
  function loadDocs(o){ if(!LIVE||o.demo) return Promise.resolve([]);
    return fetch(API+'/docs?key='+encodeURIComponent(o.key),{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ DOCS[o.key]=j.docs||[]; return DOCS[o.key]; }); }
  // a fresh document starts from the order (and, for an agreement, from its quote when there is one)
  function docSeed(o,type,from){
    var S=dset(), lang=o.lang==='en'?'en':'ar', items;
    if(from) { var b=JSON.parse(JSON.stringify(from.body)); b.quoteNo=from.no; return b; }
    if((o.items||[]).length) items=o.items.filter(function(x){return x&&x.name}).map(function(x){ return {name:x.name,desc:'',qty:+x.qty||1,unit:pnum(x.unit)}; });
    else { var q=+o.qty||1, t=pnum(o.price||o.total); items=[{name:o.packageName||o.package||'',desc:[o.addons&&o.addons.length?(lang==='en'?'Add-ons: ':'الإضافات: ')+o.addons.join(lang==='en'?', ':'، '):'',(o.platforms||[]).length?(lang==='en'?'Platforms: ':'المنصات: ')+o.platforms.join(', '):''].filter(Boolean).join('\n'),qty:q,unit:t?Math.round(t/q*100)/100:0}]; }
    var L=dlists(lang), digits=String(o.contact||'');
    // the client picked a currency on the site: start the quote in it
    if(o.ccy&&o.ccy!=='$'&&o.ccy!==pcur(o)&&FXC.some(function(k){ return k[0]===o.ccy; })){ items.forEach(function(x){ x.unit=fxConv(x.unit,pcur(o)==='$'?'$':pcur(o),o.ccy); }); var CCY=o.ccy; }
    return {lang:lang,title:o.packageName&&o.packageName!=='فرصة'?o.packageName:'',summary:'',client:{name:o.name||'',company:'',place:'',contact:o.contact||'',email:o.email||''},
      studio:{name:S.studioName,place:S.studioPlace,contact:S.studioContact},items:items,cur:CCY||pcur(o),discount:0,days:S.days,revisions:S.revisions,valid:S.valid,
      plan:o.plan||S.plan,pct:+(o.depositPct||S.pct),includes:L.includes.slice(),excludes:L.excludes.slice(),payIds:S.payIds.slice(),payOther:S.payOther,payMethods:'',notes:'',quoteNo:'',
      clauses:null,v:{approvalDays:S.approvalDays,silenceDays:S.silenceDays,archiveDays:S.archiveDays,sourceFiles:false,portfolio:true,jurisdiction:S.jurisdiction}};
  }
  function openDoc(o,type,token,fromToken){
    var go=function(list){
      var ex=token&&list.filter(function(d){return d.token===token})[0], from=fromToken&&list.filter(function(d){return d.token===fromToken})[0];
      if(!from&&type==='agreement'&&!ex){ from=list.filter(function(d){return d.type==='quote'&&d.status==='accepted'})[0]||null; }
      var b= ex? JSON.parse(JSON.stringify(ex.body)) : docSeed(o,type,from);
      if(!b.payIds){ var pm=String(b.payMethods||''); b.payIds=payList().filter(function(m){ return pm.indexOf(m.name)>=0; }).map(function(m){ return m.id; }); if(!b.payIds.length) b.payOther=pm; }   // documents made before the picker
      var S=dset(); b.v=b.v||{approvalDays:S.approvalDays,silenceDays:S.silenceDays,archiveDays:S.archiveDays,sourceFiles:false,portfolio:true,jurisdiction:S.jurisdiction};
      if(type==='agreement'&&!b.clauses) b.clauses=clausesFor(b.lang,docVars(b));
      DED={o:o,type:type,token:ex?ex.token:null,no:ex?ex.no:'',b:b,quotes:list.filter(function(d){return d.type==='quote'}),result:null};
      drawDoc(); };
    if(!LIVE||o.demo){ go([]); return; }
    loadDocs(o).then(go).catch(function(){ toast('تعذّر تحميل المستندات',true); });
  }
  function docVars(b){ var v=b.v||{}, t=0; (b.items||[]).forEach(function(x){ t+=(+x.qty||1)*pnum(x.unit); }); t=Math.max(0,t-pnum(b.discount));
    return {studio:(b.studio&&b.studio.name)||'Eyeblink Studio',client:(b.client&&(b.client.company||b.client.name))||'—',title:b.title||'—',total:pfmt(t,b.cur||'$'),plan:b.plan,pct:b.pct,days:+b.days||0,revisions:+b.revisions,
      payMethods:payText(b)||b.payMethods,approvalDays:v.approvalDays||7,silenceDays:v.silenceDays||14,archiveDays:v.archiveDays||60,sourceFiles:!!v.sourceFiles,portfolio:v.portfolio!==false,jurisdiction:v.jurisdiction||''}; }
  function dField(lbl,html,cls){ return '<div class="field'+(cls?' '+cls:'')+'"><label>'+lbl+'</label>'+html+'</div>'; }
  function dIn(path,val,attrs){ return '<input data-dp="'+path+'" value="'+esc(val==null?'':val)+'" '+(attrs||'dir="auto"')+'>'; }
  function drawDoc(){
    var D=DED, b=D.b, q=D.type==='quote', en=b.lang==='en', pk=((C.packages&&C.packages.items)||[]);
    var sub=0; b.items.forEach(function(x){ sub+=(+x.qty||1)*pnum(x.unit); }); var total=Math.max(0,sub-pnum(b.discount));
    var el=$('#dsheet'); if(!el){ el=document.createElement('div'); el.id='dsheet'; document.body.appendChild(el); }
    document.documentElement.classList.add('dlock');
    var head='<div class="dtop"><div><b>'+(D.token?'تعديل ':'')+DTYPE[D.type]+'</b><span class="muted small"> · '+esc(D.o.name)+' · <span dir="ltr">'+esc(D.o.code)+'</span>'+(D.no?' · <span dir="ltr">'+esc(D.no)+'</span>':'')+'</span></div><button class="btn sm" type="button" data-dclose>إغلاق</button></div>';
    if(D.result){ var r=D.result, txt=docShareText(D.o,r.s,b.lang,r.url);
      el.innerHTML='<div class="dbox">'+head+'<div class="dres"><div class="dok">✓ '+(r.updated?'تحدّث المستند على نفس الرابط':'جاهز. هاد رابط '+(q?'عرض السعر':'الاتفاقية')+' الخاص بالعميل')+'</div><div class="dlink" dir="ltr">'+esc(r.url)+'</div>'+
        '<div class="field"><label>الرسالة</label><textarea id="dmsg" dir="auto" rows="4">'+esc(txt)+'</textarea></div>'+
        '<div class="actions"><a class="btn primary" id="dwa" href="'+esc(waLink(D.o.contact,txt))+'" target="_blank" rel="noopener">إرسال على واتساب</a><button class="btn" type="button" data-dcopy>نسخ الرسالة</button>'+
        (D.o.email&&!hiddenOpp(D.o)?'<button class="btn" type="button" data-dchat>إرسال بمحادثة الموقع</button>':'')+'<a class="btn" href="'+esc(r.url)+'" target="_blank" rel="noopener">فتح</a><a class="btn" href="'+esc(r.url)+'?print=1" target="_blank" rel="noopener">تحميل PDF</a></div>'+
        '<p class="small muted">لإنستغرام أو أي مكان تاني: انسخ الرسالة وابعتها. أول ما يفتح العميل الرابط أو يوافق، بيوصلك إشعار على تيليغرام وبيتسجّل بالطلب</p></div></div>';
      return; }
    var items='<div class="ditems"><div class="dih"><span>البند</span><span>الوصف</span><span>الكمية</span><span>سعر الوحدة</span><span></span></div>'+b.items.map(function(x,i){
      return '<div class="dirow"><input data-dp="items.'+i+'.name" value="'+esc(x.name)+'" dir="auto" placeholder="مثال: فيلم إطلاق 60 ثانية"><textarea data-dp="items.'+i+'.desc" dir="auto" rows="2" placeholder="شو بيشمل بالضبط">'+esc(x.desc)+'</textarea><input data-dp="items.'+i+'.qty" type="number" min="1" value="'+esc(x.qty)+'"><input data-dp="items.'+i+'.unit" dir="ltr" value="'+esc(x.unit)+'"><button class="btn sm" type="button" data-ditemx="'+i+'" title="حذف">×</button></div>'; }).join('')+
      '<div class="actions"><button class="btn sm" type="button" data-ditemadd>+ بند</button>'+(pk.length?'<select data-dpkg><option value="">أضف من الباقات…</option>'+pk.map(function(p,i){ return '<option value="'+i+'">'+esc((p.name&&(p.name[b.lang]||p.name.ar))||p.id)+' · '+esc(p.price)+'</option>'; }).join('')+'</select>':'')+'</div></div>';
    var money='<div class="row">'+dField('العملة',curSel('data-dcur',b.cur||'$')+fxBox(b.cur))+dField('خصم (مبلغ)',dIn('discount',b.discount||'','dir="ltr" placeholder="0"'))+'<div class="field dtotal"><label>الإجمالي</label><b dir="ltr">'+esc(pfmt(total,b.cur||'$'))+'</b></div></div>';
    var terms='<div class="row">'+dField('مدة التنفيذ (أيام عمل)',dIn('days',b.days,'type="number" min="0"'))+dField('جولات التعديل',dIn('revisions',b.revisions,'type="number" min="0" max="10"'))+(q?dField('العرض صالح لمدة (يوم)',dIn('valid',b.valid,'type="number" min="1"')):'')+'</div>'+
      '<div class="row">'+dField('خطة الدفع','<select data-dp="plan"><option value="split"'+(b.plan!=='full'?' selected':'')+'>عربون والباقي قبل التسليم</option><option value="full"'+(b.plan==='full'?' selected':'')+'>كامل المبلغ قبل البدء</option></select>')+(b.plan!=='full'?dField('نسبة العربون %',dIn('pct',b.pct,'type="number" min="10" max="90"')):'')+'</div>'+
      dField('طرق الدفع المقبولة بهالمستند','<div class="dpay">'+payList().map(function(m){ var on=(b.payIds||[]).indexOf(m.id)>=0; return '<label class="dchip'+(on?' on':'')+'"><input type="checkbox" data-dpay="'+esc(m.id)+'"'+(on?' checked':'')+'>'+(m.logo?'<img src="'+esc(abs(String(m.logo).replace(/^\//,'')))+'" alt="">':'')+esc(m.name)+'</label>'; }).join('')+'</div>'+dIn('payOther',b.payOther,'dir="auto" placeholder="غيرها (اختياري): مثال تحويل بنكي"'))+
      '<div class="small muted dpayline">بيظهر للعميل: <b>'+esc(payText(b)||'—')+'</b></div>';
    var lists='<div class="row">'+dField('يشمل (كل سطر بند)','<textarea data-dp="includes" data-lines dir="auto" rows="4">'+esc((b.includes||[]).join('\n'))+'</textarea>')+dField('لا يشمل','<textarea data-dp="excludes" data-lines dir="auto" rows="4">'+esc((b.excludes||[]).join('\n'))+'</textarea>')+'</div>';
    var v=b.v||{};
    var agr= q?'':'<section class="dsec"><h4>البنود</h4><p class="small muted">بتتولّد من الأرقام فوق. عدّل أي بند لهالعميل بس، أو اضغط «توليد من جديد» بعد ما تغيّر الأرقام</p>'+
      '<div class="row">'+dField('مهلة الرد قبل تأجيل الموعد (أيام)',dIn('v.approvalDays',v.approvalDays,'type="number" min="1"'))+dField('تُعتمد النسخة تلقائياً بعد (أيام بلا رد)',dIn('v.silenceDays',v.silenceDays,'type="number" min="3"'))+dField('حفظ الملفات بعد التسليم (أيام)',dIn('v.archiveDays',v.archiveDays,'type="number" min="7"'))+'</div>'+
      '<div class="row"><label class="check"><input type="checkbox" data-dp="v.sourceFiles"'+(v.sourceFiles?' checked':'')+'> تشمل الملفات المفتوحة</label><label class="check"><input type="checkbox" data-dp="v.portfolio"'+(v.portfolio!==false?' checked':'')+'> حقّنا نعرضه بأعمالنا</label></div>'+
      dField('جهة الاختصاص عند الخلاف',dIn('v.jurisdiction',v.jurisdiction,'dir="auto" placeholder="المحاكم المختصة في بلد الطرف الأول"'))+
      '<div class="actions"><button class="btn sm" type="button" data-dregen>توليد البنود من جديد</button></div>'+
      '<div class="dclauses">'+b.clauses.map(function(c,i){ return '<div class="dcl"><span class="dn" dir="ltr">'+('0'+(i+1)).slice(-2)+'</span><div><input data-dp="clauses.'+i+'.h" value="'+esc(c.h)+'" dir="auto"><textarea data-dp="clauses.'+i+'.p" dir="auto" rows="3">'+esc(c.p)+'</textarea></div><button class="btn sm" type="button" data-dclx="'+i+'" title="حذف البند">×</button></div>'; }).join('')+'</div>'+
      '<div class="actions"><button class="btn sm" type="button" data-dcladd>+ بند</button></div></section>';
    var fromQ= !q&&D.quotes.length? dField('مبني على عرض سعر','<select data-dfromq><option value="">—</option>'+D.quotes.map(function(x){ return '<option value="'+esc(x.token)+'"'+(b.quoteNo===x.no?' selected':'')+'>'+esc(x.no)+' · '+esc(x.body.title)+(x.status==='accepted'?' ✓':'')+'</option>'; }).join('')+'</select>') : '';
    el.innerHTML='<div class="dbox">'+head+
      '<section class="dsec"><h4>الأساس</h4><div class="row">'+dField('لغة المستند','<select data-dp="lang"><option value="ar"'+(!en?' selected':'')+'>عربي</option><option value="en"'+(en?' selected':'')+'>English</option></select>')+fromQ+'</div>'+
        dField('عنوان المشروع *',dIn('title',b.title,'dir="auto" placeholder="مثال: حملة إطلاق مطعم بيت الشام"'))+dField('ملخص قصير (يظهر تحت العنوان)','<textarea data-dp="summary" dir="auto" rows="2" placeholder="سطرين عن الفكرة والهدف">'+esc(b.summary)+'</textarea>')+'</section>'+
      '<section class="dsec"><h4>العميل</h4><div class="row">'+dField('الاسم',dIn('client.name',b.client.name))+dField('الشركة / النشاط',dIn('client.company',b.client.company))+dField('المدينة والدولة',dIn('client.place',b.client.place))+'</div><div class="row">'+dField('التواصل',dIn('client.contact',b.client.contact,'dir="ltr"'))+dField('الإيميل',dIn('client.email',b.client.email,'dir="ltr" type="email"'))+'</div></section>'+
      '<section class="dsec"><h4>'+(q?'البنود والسعر':'نطاق العمل والقيمة')+'</h4>'+items+money+'</section>'+
      '<section class="dsec"><h4>الشروط</h4>'+terms+lists+dField('ملاحظات (اختياري)','<textarea data-dp="notes" dir="auto" rows="2">'+esc(b.notes)+'</textarea>')+'</section>'+agr+
      '<details class="dsec dstudio"><summary>بياناتنا بالمستند (الطرف الأول)</summary><div class="row">'+dField('الاسم',dIn('studio.name',b.studio.name))+dField('المدينة والدولة',dIn('studio.place',b.studio.place))+'</div>'+dField('التواصل (كل سطر لحاله)','<textarea data-dp="studio.contact" dir="ltr" rows="2">'+esc(b.studio.contact)+'</textarea>')+'</details>'+
      '<div class="dfoot"><button class="btn" type="button" data-ddefault title="يصير هيك كل مستند جديد">احفظ الشروط كافتراضية</button><span class="sp"></span><button class="btn" type="button" data-dclose>إلغاء</button><button class="btn primary" type="button" data-dissue>'+(D.token?'تحديث المستند':'إصدار الرابط')+'</button></div></div>';
  }
  function dpath(obj,path,val){ var p=path.split('.'), o=obj; for(var i=0;i<p.length-1;i++){ o=o[p[i]]=o[p[i]]||{}; } o[p[p.length-1]]=val; }
  function closeDoc(){ var el=$('#dsheet'); if(el) el.remove(); document.documentElement.classList.remove('dlock'); var o=DED&&DED.o; DED=null; if(o&&TAB==='orders'){ renderOrders(); var dd=document.querySelector('[data-okey="'+o.key+'"]'); if(dd) dd.open=true; } }
  document.addEventListener('input',function(e){ var el=e.target; if(!DED||!el.closest('#dsheet')||!el.dataset.dp) return;
    var v= el.type==='checkbox'? el.checked : el.hasAttribute('data-lines')? el.value.split('\n') : el.value; dpath(DED.b,el.dataset.dp,v);
    if(/^items\.|^discount|^cur/.test(el.dataset.dp)){ var b=DED.b, s=0; b.items.forEach(function(x){ s+=(+x.qty||1)*pnum(x.unit); }); var t=$('#dsheet .dtotal b'); if(t) t.textContent=pfmt(Math.max(0,s-pnum(b.discount)),b.cur||'$'); } });
  document.addEventListener('change',function(e){ var el=e.target; if(!DED||!el.closest('#dsheet')) return;
    if(el.dataset.dpay){ var ids=(DED.b.payIds||[]).filter(function(x){ return x!==el.dataset.dpay; }); if(el.checked) ids.push(el.dataset.dpay); DED.b.payIds=ids; DED.b.payMethods=payText(DED.b); drawDoc(); return; }
    if(el.dataset.dp==='plan'||el.dataset.dp==='lang'||el.type==='checkbox'){ if(el.dataset.dp==='lang'){ var L=dlists(el.value), b=DED.b; b.includes=L.includes.slice(); b.excludes=L.excludes.slice(); if(DED.type==='agreement') b.clauses=clausesFor(el.value,docVars(b)); } drawDoc(); return; }
    if(el.hasAttribute('data-dpkg')&&el.value!==''){ var p=C.packages.items[+el.value], lg=DED.b.lang, f=(p.features&&(p.features[lg]||p.features.ar))||[];
      DED.b.items.push({name:(p.name&&(p.name[lg]||p.name.ar))||'',desc:f.join(lg==='en'?' · ':' · '),qty:1,unit:+p.price||0}); drawDoc(); return; }
    if(el.hasAttribute('data-dfromq')){ var qd=DED.quotes.filter(function(x){return x.token===el.value})[0]; if(!qd) return; var keep=DED.b.v, nb=JSON.parse(JSON.stringify(qd.body)); nb.quoteNo=qd.no; nb.v=keep; nb.clauses=clausesFor(nb.lang,docVars(nb)); DED.b=nb; drawDoc(); toast('انعبّت الاتفاقية من العرض '+qd.no); } });
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-dnew],[data-dedit],[data-dshare],[data-dclose],[data-ditemadd],[data-ditemx],[data-dcladd],[data-dclx],[data-dregen],[data-dissue],[data-ddefault],[data-dcopy],[data-dchat]'); if(!b) return;
    if(b.dataset.dnew||b.dataset.dedit){ var o=orderOf(b.dataset.dnew||b.dataset.dedit); if(!LIVE||o.demo){ toast('يعمل على الموقع المنشور',true); return; } openDoc(o,b.dataset.type,b.dataset.t||null,b.dataset.from||null); return; }
    if(b.dataset.dshare){ var o2=orderOf(b.dataset.dshare), s=(o2.docs||[]).filter(function(x){return x.token===b.dataset.t})[0]; if(!s) return;
      DED={o:o2,type:s.type,token:s.token,no:s.no,b:{lang:o2.lang==='en'?'en':'ar'},quotes:[],result:{url:docUrl(s.token,s.type),s:s,updated:false,share:true}}; drawDoc(); $('#dsheet .dok').textContent='رابط '+(s.type==='quote'?'عرض السعر':'الاتفاقية')+' '+s.no; return; }
    if(!DED) return; var B=DED.b;
    if(b.hasAttribute('data-dclose')){ closeDoc(); return; }
    if(b.hasAttribute('data-ditemadd')){ B.items.push({name:'',desc:'',qty:1,unit:0}); drawDoc(); return; }
    if(b.dataset.ditemx){ B.items.splice(+b.dataset.ditemx,1); drawDoc(); return; }
    if(b.hasAttribute('data-dcladd')){ B.clauses.push({h:'',p:''}); drawDoc(); return; }
    if(b.dataset.dclx){ B.clauses.splice(+b.dataset.dclx,1); drawDoc(); return; }
    if(b.hasAttribute('data-dregen')){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='أكيد؟ رح تنمسح تعديلاتك على البنود'; return; } B.clauses=clausesFor(B.lang,docVars(B)); drawDoc(); toast('اتولّدت البنود من الأرقام الحالية'); return; }
    if(b.hasAttribute('data-dcopy')){ var t=$('#dmsg'); try{ navigator.clipboard.writeText(t.value).then(function(){ toast('انتسخت الرسالة'); },function(){ t.select(); }); }catch(_){ t.select(); } return; }
    if(b.hasAttribute('data-dchat')){ sendMsg(DED.o.key,$('#dmsg').value,b); return; }
    if(b.hasAttribute('data-ddefault')){ P=P||{}; var d=P.docs=Object.assign({},P.docs);
      Object.assign(d,{studioName:B.studio.name,studioPlace:B.studio.place,studioContact:B.studio.contact,payIds:(B.payIds||[]).slice(),payOther:B.payOther||'',payMethods:payText(B),days:+B.days,revisions:+B.revisions,valid:+B.valid||14,plan:B.plan,pct:+B.pct});
      if(B.v) Object.assign(d,{approvalDays:+B.v.approvalDays,silenceDays:+B.v.silenceDays,archiveDays:+B.v.archiveDays,jurisdiction:B.v.jurisdiction||''});
      d.lists=Object.assign({},d.lists); d.lists[B.lang]={includes:(B.includes||[]).filter(Boolean),excludes:(B.excludes||[]).filter(Boolean)};
      b.disabled=true; fetch(API+'/private',{method:'PUT',headers:headers({'content-type':'application/json'}),body:JSON.stringify(P)}).then(function(r){ if(!r.ok) throw 0; PSAVED=JSON.stringify(P); toast('انحفظت كإعدادات افتراضية لكل مستند جديد'); }).catch(function(){ toast('ما انحفظت',true); }).then(function(){ b.disabled=false; }); return; }
    if(b.hasAttribute('data-dissue')){
      if(!String(B.title||'').trim()){ toast('اكتب عنوان المشروع',true); var ti=$('#dsheet [data-dp="title"]'); if(ti) ti.focus(); return; }
      B.items=B.items.filter(function(x){ return String(x.name||'').trim(); }); if(!B.items.length){ toast('ضيف بند واحد عالأقل',true); drawDoc(); return; }
      if(DED.type==='agreement') B.clauses=(B.clauses||[]).filter(function(c){ return String(c.h||'').trim()||String(c.p||'').trim(); });
      B.payMethods=payText(B); b.disabled=true; var wasToken=DED.token;
      api('/docs','POST',{action:'issue',key:DED.o.key,type:DED.type,token:DED.token,doc:B}).then(function(j){
        if(!j.ok) throw new Error(j.error||'fail');
        DED.o.docs=j.docs; DED.token=j.doc.token; DED.no=j.doc.no; DED.result={url:docUrl(j.doc.token,j.doc.type),s:j.docs.filter(function(x){return x.token===j.doc.token})[0],updated:!!wasToken}; drawDoc();
      }).catch(function(err){ b.disabled=false; toast(({title:'اكتب عنوان المشروع',items:'ضيف بند واحد عالأقل',clauses:'ضيف بند واحد عالأقل',locked:'العميل وافق عليه، ما بينعدّل. اعمل نسخة جديدة'})[err.message]||'ما انحفظ، جرّب مرة تانية',true); }); return; }
  });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&DED) closeDoc(); });

  /* ================= the studio shell: four sections, «Today», search, and the team ================= */
  // every tab belongs to one of four sections; the sidebar draws them in this order
  var TOP_TABS=['notify','settings'];
  var SECT=[['today',''],['work','الشغل'],['site','الموقع'],['studio','الاستوديو']];
  var SECT_OF={today:'today',orders:'work',tasks:'work',clients:'work',billing:'work',team:'work',notify:'studio',reports:'studio',stats:'studio',settings:'studio',backup:'studio'};
  function secOf(id){ return SECT_OF[id]||'site'; }
  var ICO={today:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',orders:'<path d="M4 13l2-8h12l2 8v6H4zM4 13h5a3 3 0 0 0 6 0h5"/>',tasks:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M15 4v16"/>',
    clients:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6 6 0 0 1 3.5 5.5"/>',billing:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>',
    team:'<circle cx="12" cy="7" r="3"/><circle cx="5" cy="10" r="2.2"/><circle cx="19" cy="10" r="2.2"/><path d="M6.5 20a5.5 5.5 0 0 1 11 0M1.5 19a3.5 3.5 0 0 1 4.5-3.3M22.5 19a3.5 3.5 0 0 0-4.5-3.3"/>',
    home:'<path d="M3 11l9-7 9 7v9H3z"/>',services:'<path d="M7 3h7l5 5v13H7zM14 3v5h5"/>',packages:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    work:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>',about:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    contact:'<path d="M4 5h16v11H8l-4 4z"/>',payments:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>',
    layout:'<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
    settings:'<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',notify:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
    reports:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',stats:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',backup:'<path d="M4 7h16v13H4zM2 3h20v4H2zM10 12h4"/>'};
  function ico(id){ return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">'+(ICO[id]||ICO.services)+'</svg>'; }
  function tabCount(id){
    if(id==='orders') return [ORDERS.filter(function(o){return o.status==='new'||o.unread}).length,'hot'];
    if(id==='tasks'&&WORK&&WORK.tasks) return [WORK.tasks.filter(function(x){return x.status==='new'||(x.change_request&&x.change_request.status==='pending')}).length,'hot'];
    if(id==='billing'&&BILL&&BILL.invoices) return [BILL.invoices.filter(function(x){return x.state==='overdue'}).length,'crit'];
    if(id==='notify') return [NOTI&&!NOTI.err?NOTI.unread:(WORK&&WORK.inboxUnread)||0,'hot'];
    if(id==='clients'&&ACC) return [ACC.requests.filter(function(r){return r.status==='pending'}).length,'hot'];
    if(id==='team'&&TEAM&&TEAM.apps) return [TEAM.apps.filter(function(a){return a.status==='new'}).length+TEAM.tasks.filter(function(t){return t.status==='qc'}).length,'hot'];
    if(id==='today'){ var al=alerts(); return [al.filter(function(a){return a.lvl!=='info'}).length, al.some(function(a){return a.lvl==='crit'})?'crit':'warn']; }
    return [0];
  }
  function renderTabs(){
    $('#tabs').innerHTML=SECT.map(function(s){
      var list=TABS.filter(function(t){ return secOf(t.id)===s[0]&&TOP_TABS.indexOf(t.id)<0; }); if(!list.length) return '';
      return '<div class="navsec">'+(s[1]?'<div class="tabgrp">'+esc(s[1])+'</div>':'')+list.map(function(t){ var c=tabCount(t.id);
        return '<button type="button" data-tab="'+t.id+'"'+(t.id===TAB?' aria-current="true"':'')+'>'+ico(t.id)+'<span>'+esc(t.title)+'</span>'+(c[0]?'<span class="count '+(c[1]||'')+'">'+c[0]+'</span>':'')+'</button>'; }).join('')+'</div>';
    }).join('');
    var top=$('.top'); if(top) top.classList.toggle('nopub', secOf(TAB)!=='site'&&TAB!=='settings');
    var ti=$('#topIcons'); if(ti) ti.innerHTML=TOP_TABS.map(function(id){ var t=TABS.filter(function(x){return x.id===id})[0], c=tabCount(id); return '<button type="button" class="tico" data-tab="'+id+'" title="'+esc(t.title)+'" aria-label="'+esc(t.title)+'"'+(TAB===id?' aria-current="true"':'')+'>'+ico(id)+(c[0]?'<span class="dot">'+c[0]+'</span>':'')+'</button>'; }).join('');
    var cur=$('#tabs [aria-current="true"]'); if(cur&&cur.scrollIntoView){ var nav=$('#tabs'), r=cur.getBoundingClientRect(), n=nav.getBoundingClientRect(); if(r.top<n.top||r.bottom>n.bottom) cur.scrollIntoView({block:'nearest'}); }
    if(TAB==='today'&&!TODAY_LOCK&&$('#panel .tdy')) renderToday(true);
  }
  // one open at a time: opening a card closes its open siblings (works, packages, orders, tasks, applications…)
  document.addEventListener('click',function(e){ var s=e.target.closest('summary'); if(!s||e.target.closest('button,a,input,select,label')) return; var d=s.parentElement; if(!d||d.tagName!=='DETAILS'||d.open||!d.parentElement) return;
    [].forEach.call(d.parentElement.children,function(x){ if(x!==d&&x.tagName==='DETAILS'&&x.open) x.open=false; }); });
  function go(tab){ TAB=tab; render(); if(tab==='orders') loadOrders(); if(tab==='clients') loadUsers(); if(tab==='tasks') loadWork(); if(tab==='notify') loadNotify(); if(tab==='billing') loadBilling(); if(tab==='reports') loadReports(); if(tab==='team') loadTeam(); if(tab==='today'){ loadOrders(); loadTeam(); } scrollTo(0,0); }
  function goOrder(key){ TAB='orders'; OFILTER='all'; render(); var d=document.querySelector('[data-okey="'+key+'"]'); if(d){ d.open=true; setTimeout(function(){ d.scrollIntoView({block:'start',behavior:'smooth'}); },40); d.classList.add('flash'); setTimeout(function(){ d.classList.remove('flash'); },1600); } }

  /* ---------- «Today»: what needs you, ranked; the week ahead; where the pipeline stands ---------- */
  var TODAY_LOCK=false, ORD_READY=false;
  function hrs(iso){ return (Date.now()-Date.parse(iso))/36e5; }
  function ago(iso){ var h=hrs(iso); return h<1?'من شوي':h<24?'من '+Math.round(h)+' ساعة':'من '+Math.round(h/24)+' يوم'; }
  function alerts(){
    var A=[], t0=todayISO(), add=function(lvl,title,sub,goTo,at){ A.push({lvl:lvl,title:title,sub:sub,go:goTo,at:at||''}); };
    ORDERS.forEach(function(o){ if(o.demo) return; var nm=esc(o.name)+' · <span dir="ltr">'+esc(o.code)+'</span>', closed=o.status==='cancelled'||o.status==='delivered', g={tab:'orders',key:o.key};
      var rec=o.payInfo&&(o.messages||[]).some(function(m){ return m.kind==='receipt'&&m.at>o.payInfo.at; }), stagePaid=o.payInfo&&(o.payInfo.stage==='deposit'?(o.deposit&&o.deposit.paid):o.paid);
      if(rec&&!stagePaid) add('crit','إيصال دفع بانتظار تأكيدك',nm+' · '+esc(o.payInfo.amount||''),g,o.payInfo.at);
      if(o.followUp&&!closed){ if(o.followUp<t0) add('crit','متابعة متأخرة',nm+(o.nextStep?' · '+esc(o.nextStep):''),g,o.followUp); else if(o.followUp===t0) add('warn','متابعة اليوم',nm+(o.nextStep?' · '+esc(o.nextStep):''),g,o.followUp); }
      if(o.status==='new'&&!o.manual) add(hrs(o.createdAt)>24?'warn':'info',hrs(o.createdAt)>24?'طلب جديد ما انرد عليه':'طلب جديد',nm+' · '+ago(o.createdAt),g,o.createdAt);
      if(o.unread) add('warn',o.unread+(o.unread>1?' رسائل':' رسالة')+' من العميل',nm,g,o.updatedAt||o.createdAt);
      if(o.payInfo&&!stagePaid&&!rec&&hrs(o.payInfo.at)>48) add('warn','الدفع متأخر',nm+' · طلبته '+ago(o.payInfo.at),g,o.payInfo.at);
      (o.docs||[]).forEach(function(s){ var ty=s.type==='quote'?'عرض السعر':'الاتفاقية';
        if(s.status==='accepted') return;
        if(s.viewedAt&&hrs(s.viewedAt)>72) add('warn','شاف '+ty+' وما ردّ',nm+' · فتحه '+ago(s.viewedAt),g,s.viewedAt);
        else if(!s.viewedAt&&hrs(s.at)>48) add('info',ty+' ما انفتح لسا',nm+' · انبعت '+ago(s.at),g,s.at); });
      var signed=(o.docs||[]).some(function(s){ return s.type==='agreement'&&s.status==='accepted'; });
      if(signed&&!o.projectId&&!closed) add('info','الاتفاقية موقّعة: افتح مشروعه',nm,g);
      if(signed&&!o.paid&&!(o.deposit&&o.deposit.paid)&&!o.payInfo&&!closed) add('warn','اطلب العربون',nm+' · وقّع الاتفاقية',g);
    });
    ((WORK&&WORK.tasks)||[]).forEach(function(t){ if(/completed|rejected|cancelled/.test(t.status)) return; var g={tab:'tasks',ref:t.ref};
      if(t.confirmed_date&&t.confirmed_date<t0&&t.status!=='final') add('crit','مهمة عميل متأخرة',esc(t.title)+' · '+esc(t.project_name||''),g,t.confirmed_date);
      else if(t.status==='new') add('warn','مهمة جديدة من عميل',esc(t.title)+' · '+esc(t.project_name||''),g);
      if(t.change_request&&t.change_request.status==='pending') add('warn','طلب تغيير موعد',esc(t.title),g); });
    ((BILL&&BILL.invoices)||[]).forEach(function(x){ if(x.state==='overdue') add('crit','فاتورة متأخرة','<span dir="ltr">'+esc(x.no)+'</span>'+(x.balance?' · '+esc(x.balance)+' '+esc(x.currency||''):''),{tab:'billing'},x.due_date); });
    if(TEAM&&TEAM.apps){ var na=TEAM.apps.filter(function(a){return a.status==='new'}).length; if(na) add('info',na+(na>1?' طلبات انضمام جديدة':' طلب انضمام جديد'),'من صفحة «انضم للفريق»',{tab:'team',sub:'apps'});
      var mn=function(e){ var m=TEAM.members.filter(function(x){return x.email===e})[0]; return m?m.name:e; }, due=0, cur='$';
      TEAM.tasks.forEach(function(t){ var g={tab:'team',task:t.id};
        if(t.status==='qc') add('warn','نسخة من الفريق بانتظار مراجعتك',esc(t.title)+' · '+esc(mn(t.member)),g,t.updatedAt);
        else if(t.due&&t.due<t0&&t.status!=='approved') add('crit','مهمة فريق متأخرة',esc(t.title)+' · '+esc(mn(t.member)),g,t.due);
        if(t.status==='approved'&&!(t.payout&&t.payout.paid)){ due+=+t.fee||0; cur=t.cur||cur; } });
      if(due) add('info','أجور فريق مستحقة','<span dir="ltr">'+esc(pfmt(due,cur))+'</span>',{tab:'team',sub:'members'}); }
    if(FXLIVE&&(FXLIVE.ok===false||(FXLIVE.at&&hrs(FXLIVE.at)>72))) add('info','سعر الليرة ما تحدّث',FXLIVE.at?'آخر سعر '+ago(FXLIVE.at)+' · بتقدر تكتبه بإيدك من خانة العملة':'ما قدرنا نجيب السعر من «الليرة اليوم»',{tab:'orders'});
    var rank={crit:0,warn:1,info:2}; return A.sort(function(a,b){ return rank[a.lvl]-rank[b.lvl]||(a.at<b.at?-1:1); });
  }
  function renderToday(soft){
    TODAY_LOCK=true; if(!soft) renderTabs(); TODAY_LOCK=false;
    var t0=todayISO(), now=new Date(), h=now.getHours(), al=alerts(), crit=al.filter(function(a){return a.lvl==='crit'}).length, warn=al.filter(function(a){return a.lvl==='warn'}).length;
    var open=ORDERS.filter(function(o){ return OPEN_ST.indexOf(o.status)>=0&&!o.demo; }), pv=open.reduce(function(a,o){ return a+pnum(o.price||o.total); },0), cur=(C.packages&&C.packages.currency)||'$';
    var mk=t0.slice(0,7), month=0; ORDERS.forEach(function(o){ [o.deposit&&o.deposit.invoice,o.invoice].forEach(function(v){ if(v&&String(v.at||'').slice(0,7)===mk) month+=+v.amount||0; }); });
    var since=Date.now()-30*864e5, rec=ORDERS.filter(function(o){ return Date.parse(o.createdAt)>=since&&!o.demo; }), won=rec.filter(function(o){ return o.paid||WON_ST.indexOf(o.status)>=0; });
    var active=ORDERS.filter(function(o){ return ['paid','in-progress','review'].indexOf(o.status)>=0; }).length;
    // the next seven days
    var ag=[], end=new Date(Date.now()+7*864e5).toISOString().slice(0,10);
    ORDERS.forEach(function(o){ if(o.followUp&&o.followUp>=t0&&o.followUp<=end&&o.status!=='cancelled'&&o.status!=='delivered') ag.push({d:o.followUp,k:'follow',t:'متابعة · '+esc(o.name),go:{tab:'orders',key:o.key}}); });
    ((WORK&&WORK.tasks)||[]).forEach(function(t){ if(t.confirmed_date&&t.confirmed_date>=t0&&t.confirmed_date<=end&&!/completed|rejected|cancelled/.test(t.status)) ag.push({d:t.confirmed_date,k:'client',t:'تسليم · '+esc(t.title),go:{tab:'tasks',ref:t.ref}}); });
    ((TEAM&&TEAM.tasks)||[]).forEach(function(t){ if(t.due&&t.due>=t0&&t.due<=end&&t.status!=='approved') ag.push({d:t.due,k:'team',t:'الفريق · '+esc(t.title),go:{tab:'team',task:t.id}}); });
    ag.sort(function(a,b){ return a.d<b.d?-1:1; });
    var days={}; ag.forEach(function(x){ (days[x.d]=days[x.d]||[]).push(x); });
    var dname=function(d){ return d===t0?'اليوم':new Date(d+'T12:00:00').toLocaleDateString('ar-u-nu-latn',{weekday:'long',day:'numeric',month:'short'}); };
    // the pipeline as one bar, one colour per stage
    var stages=['new','discussing','confirmed','awaiting-payment','paid','in-progress','review','delivered'], cnt=stages.map(function(s){ return ORDERS.filter(function(o){ return o.status===s&&!o.demo; }).length; }), tot=cnt.reduce(function(a,b){return a+b},0)||1;
    var LV={crit:'عاجل',warn:'انتباه',info:'للعلم'};
    $('#panel').innerHTML='<div class="tdy">'+
      '<section class="tdy-head"><div><span class="eyebrow" dir="ltr">'+esc(now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}))+'</span><h1>'+(h<12?'صباح الخير':'مساء الخير')+'</h1>'+
        '<p>'+(crit?'<b class="lv crit">'+crit+' '+(crit>1?'أمور عاجلة':'أمر عاجل')+'</b> ':'')+(warn?'<b class="lv warn">'+warn+' بحاجة انتباه</b> ':'')+(!crit&&!warn&&(ORD_READY||!LIVE)?'<b class="lv good">كل شي تحت السيطرة</b>':'')+'</p></div>'+
        '<div class="tdy-act"><button class="btn primary" type="button" data-gonew>+ فرصة جديدة</button></div></section>'+
      '<section class="kpi4">'+
        '<div><span>فرص مفتوحة</span><b dir="ltr">'+esc(pfmt(pv,cur))+'</b><small>'+open.length+' فرصة</small></div>'+
        '<div><span>دخل هالشهر</span><b dir="ltr">'+esc(pfmt(month,cur))+'</b><small>من الفواتير الصادرة</small></div>'+
        '<div><span>شغل قيد التنفيذ</span><b>'+active+'</b><small>'+(((TEAM&&TEAM.tasks)||[]).filter(function(t){return t.status!=='approved'}).length)+' مهام عند الفريق</small></div>'+
        '<div><span>نسبة التحويل</span><b>'+(rec.length?Math.round(won.length*100/rec.length)+'%':'—')+'</b><small>آخر 30 يوم'+(rec.length?' · '+won.length+'/'+rec.length:'')+'</small></div>'+
      '</section>'+
      '<div class="tdy-grid"><section class="panelx"><div class="px-h"><h3>بحاجة إلك</h3><span class="muted small">'+al.length+'</span></div>'+
        (LIVE&&!ORD_READY?'<div class="calm"><span>عم يحمّل…</span></div>':al.length?'<ul class="alerts">'+al.map(function(a){ return '<li class="lv-'+a.lvl+'"><button type="button" data-go=\''+esc(JSON.stringify(a.go))+'\'><i></i><div><b>'+esc(a.title)+'</b><span>'+a.sub+'</span></div><em>'+LV[a.lvl]+'</em></button></li>'; }).join('')+'</ul>'
          :'<div class="calm"><svg viewBox="0 0 24 24" class="ico"><path d="M5 12l5 5 9-10"/></svg><b>ما في شي معلّق</b><span>كل الطلبات والمتابعات والفواتير تمام</span></div>')+'</section>'+
        '<aside class="tdy-side"><section class="panelx"><div class="px-h"><h3>الأيام الجاية</h3><span class="muted small">7 أيام</span></div>'+
          (ag.length?Object.keys(days).map(function(d){ return '<div class="agday"><span>'+esc(dname(d))+'</span>'+days[d].map(function(x){ return '<button type="button" class="ag-'+x.k+'" data-go=\''+esc(JSON.stringify(x.go))+'\'><i></i>'+x.t+'</button>'; }).join('')+'</div>'; }).join(''):'<p class="muted small" style="margin:0">ما في مواعيد هالأسبوع</p>')+'</section>'+
          '<section class="panelx"><div class="px-h"><h3>مسار الطلبات</h3><span class="muted small">'+cnt.reduce(function(a,b){return a+b},0)+'</span></div><div class="pipe">'+stages.map(function(s,i){ return cnt[i]?'<span class="s-'+s+'" style="flex:'+cnt[i]+'" title="'+esc(ST[s])+' '+cnt[i]+'"></span>':''; }).join('')+'</div>'+
            '<ul class="legend">'+stages.map(function(s,i){ return '<li class="s-'+s+'"><button type="button" data-gostage="'+s+'"><i></i>'+esc(ST[s])+'<b>'+cnt[i]+'</b></button></li>'; }).join('')+'</ul></section></aside></div>'+
    '</div>';
  }
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-go],[data-gonew],[data-gostage]'); if(!b) return;
    if(b.hasAttribute('data-gonew')){ NEWOPP=true; go('orders'); var f=$('#oppForm'); if(f) f.elements.name.focus(); return; }
    if(b.dataset.gostage){ OFILTER=b.dataset.gostage; TAB='orders'; render(); scrollTo(0,0); return; }
    var g={}; try{ g=JSON.parse(b.dataset.go); }catch(_){ return; }
    if(g.tab==='orders'&&g.key) return goOrder(g.key);
    if(g.tab==='tasks'){ WOPEN=g.ref||null; go('tasks'); return; }
    if(g.tab==='team'){ TSUB=g.task?'tasks':(g.sub||TSUB); go('team'); if(g.task) setTimeout(function(){ openTTask(g.task); },60); return; }
    go(g.tab);
  });

  /* ---------- search everything (Ctrl+K): pages of the panel, orders, clients, team, quick actions ---------- */
  function cmdItems(){
    var L=[];
    TABS.forEach(function(t){ L.push({k:'صفحة',t:t.title,run:function(){ go(t.id); }}); });
    L.push({k:'إجراء',t:'+ فرصة جديدة',run:function(){ NEWOPP=true; go('orders'); }});
    L.push({k:'إجراء',t:'+ مهمة للفريق',run:function(){ TSUB='tasks'; go('team'); setTimeout(function(){ openTTask(null); },80); }});
    ORDERS.forEach(function(o){ L.push({k:'طلب',t:o.name+' · '+(o.packageName||'')+' · '+o.code,s:ST[o.status],run:function(){ goOrder(o.key); }}); });
    if(TEAM) TEAM.members.forEach(function(m){ L.push({k:'الفريق',t:m.name+' · '+(TROLE[m.role]||m.role),run:function(){ TSUB='members'; go('team'); }}); });
    return L;
  }
  function openCmd(){ var el=$('#cmdk'); if(el){ el.remove(); return; }
    el=document.createElement('div'); el.id='cmdk'; el.innerHTML='<div class="cmd"><input placeholder="ابحث عن طلب، عميل، صفحة، أو إجراء…" dir="auto"><ul></ul><div class="cmd-f"><span><kbd>↑</kbd><kbd>↓</kbd> تنقّل</span><span><kbd>Enter</kbd> فتح</span><span><kbd>Esc</kbd> إغلاق</span></div></div>';
    document.body.appendChild(el); var inp=el.querySelector('input'), ul=el.querySelector('ul'), items=cmdItems(), sel=0, shown=[];
    var draw=function(){ var q=inp.value.trim().toLowerCase(); shown=(q?items.filter(function(x){ return (x.t+' '+(x.s||'')+' '+x.k).toLowerCase().indexOf(q)>=0; }):items.filter(function(x){ return x.k!=='طلب'; })).slice(0,12); sel=Math.min(sel,Math.max(0,shown.length-1));
      ul.innerHTML=shown.length?shown.map(function(x,i){ return '<li'+(i===sel?' class="on"':'')+' data-i="'+i+'"><em>'+esc(x.k)+'</em><b>'+esc(x.t)+'</b>'+(x.s?'<span>'+esc(x.s)+'</span>':'')+'</li>'; }).join(''):'<li class="none">ما في نتائج</li>'; };
    var run=function(i){ var x=shown[i]; if(!x) return; el.remove(); x.run(); };
    inp.oninput=function(){ sel=0; draw(); };
    inp.onkeydown=function(e){ if(e.key==='ArrowDown'){ sel=Math.min(sel+1,shown.length-1); draw(); e.preventDefault(); } else if(e.key==='ArrowUp'){ sel=Math.max(sel-1,0); draw(); e.preventDefault(); } else if(e.key==='Enter'){ run(sel); } else if(e.key==='Escape'){ el.remove(); } };
    ul.onclick=function(e){ var li=e.target.closest('[data-i]'); if(li) run(+li.dataset.i); };
    el.onclick=function(e){ if(e.target===el) el.remove(); };
    draw(); inp.focus();
  }
  document.addEventListener('keydown',function(e){ if((e.ctrlKey||e.metaKey)&&(e.key==='k'||e.key==='K'||e.key==='ك')&&!$('#app').hidden){ e.preventDefault(); openCmd(); } });
  document.addEventListener('click',function(e){ if(e.target.closest('[data-cmdk]')) openCmd(); });

  /* ================= the team: applications → trial → account → collaboration agreement → tasks → review → pay ================= */
  var TEAM=null, TSUB='tasks', TOPEN=null;
  var TROLE={editor:'مونتير',motion:'موشن ديزاينر',color:'كولوريست',sound:'مهندس صوت',writer:'كاتب محتوى',shooter:'مصوّر',designer:'مصمم',producer:'منسّق إنتاج'};
  var TAPP={new:'جديد',trial:'مهمة تجريبية',interview:'مقابلة',accepted:'مقبول',rejected:'مرفوض'};
  var TTST={assigned:'جديدة',progress:'قيد العمل',changes:'تعديلات مطلوبة',qc:'بانتظار مراجعتك',approved:'معتمدة'};
  function loadTeam(){ if(!LIVE){ TEAM={err:'live',apps:[],members:[],tasks:[],settings:{}}; if(TAB==='team') renderTeam(); return; }
    fetch(API+'/team?admin=1',{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ TEAM=j.ok?j:{err:j.error||'fail',apps:[],members:[],tasks:[],settings:{}}; renderTabs(); if(TAB==='team') renderTeam(); if(TOPEN) openTTask(TOPEN); })
      .catch(function(){ TEAM={err:'net',apps:[],members:[],tasks:[],settings:{}}; if(TAB==='team') renderTeam(); }); }
  function treq(body,btn,ok){ if(btn) btn.disabled=true; return api('/team','POST',body).then(function(j){ if(!j.ok) throw new Error(j.error||'fail'); if(ok) toast(ok); return j; })
    .catch(function(err){ if(btn) btn.disabled=false; toast(({exists:'هالإيميل إله حساب بالفريق أصلاً',email:'الإيميل مش صحيح',title:'اكتب عنوان المهمة',member:'اختار المتعاون'})[err.message]||'ما زبط، جرّب مرة تانية',true); throw err; }); }
  function memName(e){ var m=TEAM&&TEAM.members.filter(function(x){return x.email===e})[0]; return m?m.name:e; }
  function renderTeam(){
    renderTabs(); if(!TEAM){ $('#panel').innerHTML='<div class="sec"><div class="empty">عم يحمّل…</div></div>'; loadTeam(); return; }
    if(TEAM.err==='live'){ $('#panel').innerHTML='<div class="sec"><div class="empty">الفريق بيشتغل على الموقع المنشور</div></div>'; return; }
    var na=TEAM.apps.filter(function(a){return a.status==='new'}).length, qc=TEAM.tasks.filter(function(t){return t.status==='qc'}).length;
    var subs=[['tasks','المهام',qc],['members','المتعاونين',0],['apps','طلبات الانضمام',na],['settings','التوظيف',0]];
    var head='<div class="subtabs">'+subs.map(function(s){ return '<button type="button" data-tsub="'+s[0]+'"'+(TSUB===s[0]?' aria-current="true"':'')+'>'+s[1]+(s[2]?'<span class="count hot">'+s[2]+'</span>':'')+'</button>'; }).join('')+'</div>';
    $('#panel').innerHTML=head+({tasks:teamTasks,members:teamMembers,apps:teamApps,settings:teamSettings})[TSUB]();
  }
  function teamTasks(){
    var cols=[['assigned','جديدة',['assigned']],['progress','قيد العمل',['progress','changes']],['qc','بانتظار مراجعتك',['qc']],['approved','معتمدة',['approved']]], t0=todayISO();
    var due=TEAM.tasks.filter(function(t){ return t.status==='approved'&&!(t.payout&&t.payout.paid); }).reduce(function(a,t){ return a+(+t.fee||0); },0);
    return '<div class="kpi4 sm3"><div><span>مهام مفتوحة</span><b>'+TEAM.tasks.filter(function(t){return t.status!=='approved'}).length+'</b></div><div><span>بانتظار مراجعتك</span><b class="'+(TEAM.tasks.some(function(t){return t.status==='qc'})?'c-warn':'')+'">'+TEAM.tasks.filter(function(t){return t.status==='qc'}).length+'</b></div><div><span>أجور مستحقة</span><b dir="ltr">'+esc(pfmt(due,'$'))+'</b></div></div>'+
      '<div class="board-h"><span class="muted small">المتعاون بيشوف مهمته وأجره بس. اسم العميل وأسعاره ما بيوصلوله</span><button class="btn primary sm" type="button" data-tnew>+ مهمة</button></div>'+
      '<div class="board">'+cols.map(function(c){ var l=TEAM.tasks.filter(function(t){ return c[2].indexOf(t.status)>=0; });
        return '<div class="bcol st-'+c[0]+'"><h4><i></i>'+c[1]+'<small>'+l.length+'</small></h4>'+(l.length?l.map(function(t){ var late=t.due&&t.due<t0&&t.status!=='approved'&&t.status!=='qc';
          return '<button type="button" class="bcard st-'+t.status+'" data-ttask="'+esc(t.id)+'"><b>'+esc(t.title)+'</b><span class="muted small">'+esc(memName(t.member))+(t.alias?' · '+esc(t.alias):'')+'</span><div class="bmeta"><span class="'+(late?'c-crit':'')+'">'+(t.due?esc(fdate(t.due)):'بلا موعد')+'</span><span dir="ltr">'+esc(pfmt(+t.fee||0,t.cur||'$'))+'</span></div>'+
            (t.status==='changes'?'<em class="tag c-warn">تعديلات</em>':'')+(t.status==='approved'?'<em class="tag '+(t.payout&&t.payout.paid?'c-good':'c-warn')+'">'+(t.payout&&t.payout.paid?'انصرف':'مستحق')+'</em>':'')+'</button>'; }).join(''):'<div class="bempty">—</div>')+'</div>'; }).join('')+'</div>';
  }
  function teamMembers(){
    if(!TEAM.members.length) return '<div class="sec"><div class="empty">لسا ما في متعاونين. اقبل طلب انضمام، أو ضيف حدا مباشرة</div><div class="actions" style="justify-content:center"><button class="btn primary" type="button" data-tmadd>+ متعاون</button></div></div>'+tAddForm();
    return '<div class="board-h"><span class="muted small">'+TEAM.members.length+' متعاون</span><button class="btn sm" type="button" data-tmadd>+ متعاون</button></div>'+tAddForm()+'<div class="mgrid">'+TEAM.members.filter(function(m){return m.status!=='removed'}).map(function(m){
      var ts=TEAM.tasks.filter(function(t){ return t.member===m.email; }), open=ts.filter(function(t){ return t.status!=='approved'; }).length, due=ts.filter(function(t){ return t.status==='approved'&&!(t.payout&&t.payout.paid); }).reduce(function(a,t){ return a+(+t.fee||0); },0);
      var ct=m.contract, cs=!ct?'<em class="tag c-warn">بلا اتفاقية</em>':ct.signedAt?'<em class="tag c-good">الاتفاقية موقّعة</em>':'<em class="tag c-info">الاتفاقية مرسلة</em>';
      return '<div class="mcard"><div class="mh"><span class="av">'+esc(String(m.name).trim().charAt(0))+'</span><div><b>'+esc(m.name)+'</b><span class="muted small">'+esc(TROLE[m.role]||m.role)+(m.status==='paused'?' · موقوف':'')+'</span></div>'+cs+'</div>'+
        '<div class="mstats"><div><b>'+open+'</b><span>مهام مفتوحة</span></div><div><b dir="ltr">'+esc(pfmt(due,'$'))+'</b><span>مستحق</span></div><div><b>'+ts.filter(function(t){return t.status==='approved'}).length+'</b><span>منجزة</span></div></div>'+
        '<div class="small muted" dir="ltr" style="text-align:end">'+esc(m.email)+(m.phone?' · '+esc(m.phone):'')+'</div>'+
        '<div class="dl2"><button class="btn sm primary" type="button" data-tnew data-for="'+esc(m.email)+'">+ مهمة</button>'+
          (!ct||!ct.signedAt?'<button class="btn sm" type="button" data-tcontract="'+esc(m.email)+'">'+(ct?'أعد إرسال الاتفاقية':'جهّز الاتفاقية')+'</button>':'<a class="btn sm" target="_blank" rel="noopener" href="/team-agreement/'+esc(ct.token)+'">الاتفاقية</a>')+
          (due?'<button class="btn sm" type="button" data-tpayall="'+esc(m.email)+'">انصرف المستحق</button>':'')+
          '<button class="btn sm" type="button" data-treset="'+esc(m.email)+'">كلمة سر مؤقتة</button><button class="btn sm" type="button" data-tpause="'+esc(m.email)+'">'+(m.status==='paused'?'تفعيل':'إيقاف')+'</button></div></div>'; }).join('')+'</div>';
  }
  function tAddForm(prefill){ prefill=prefill||{}; return '<form class="sec tadd" id="tAdd" hidden><h3>متعاون جديد</h3><div class="row"><div class="field"><label>الاسم</label><input name="name" value="'+esc(prefill.name||'')+'"></div><div class="field"><label>الإيميل</label><input name="email" type="email" dir="ltr" value="'+esc(prefill.email||'')+'"></div><div class="field"><label>الدور</label><select name="role">'+Object.keys(TROLE).map(function(r){ return '<option value="'+r+'"'+(prefill.role===r?' selected':'')+'>'+TROLE[r]+'</option>'; }).join('')+'</select></div></div><div class="row"><div class="field"><label>واتساب</label><input name="phone" dir="ltr" value="'+esc(prefill.phone||'')+'"></div><div class="field"><label>الأجر المتفق (ملاحظة)</label><input name="rate" value="'+esc(prefill.rate||'')+'"></div></div><input type="hidden" name="app" value="'+esc(prefill.app||'')+'"><div class="actions"><button class="btn primary" type="submit">إنشاء الحساب</button></div></form>'; }
  function teamApps(){
    if(!TEAM.apps.length) return '<div class="sec"><div class="empty">ما في طلبات انضمام. فعّل التوظيف من «التوظيف»، وصفحة التقديم هي <a href="/join" target="_blank" dir="ltr">/join</a></div></div>';
    return '<div class="apps">'+TEAM.apps.map(function(a){ var tr=a.trial||{};
      return '<details class="item app st-a'+a.status+'"'+(a.status==='new'?' open':'')+'><summary><span class="chev">‹</span><span class="pill a-'+a.status+'">'+esc(TAPP[a.status])+'</span><b>'+esc(a.name)+'</b><span class="muted small">'+esc(TROLE[a.role]||a.role)+(a.city?' · '+esc(a.city):'')+' · '+esc(new Date(a.at).toLocaleDateString('ar-u-nu-latn',{day:'numeric',month:'short'}))+'</span></summary><div class="body"><div class="grid2"><div>'+
        '<div class="small muted">الأعمال</div><div class="links">'+(a.reel?'<a href="'+esc(a.reel)+'" target="_blank" rel="noopener" dir="ltr">'+esc(a.reel)+'</a>':'')+(a.links||[]).map(function(l){ return '<a href="'+esc(l)+'" target="_blank" rel="noopener" dir="ltr">'+esc(l)+'</a>'; }).join('')+'</div>'+
        '<div class="small muted" style="margin-top:10px">التفاصيل</div><div class="small">'+[a.tools&&'الأدوات: '+esc(a.tools),a.hours&&'ساعات أسبوعياً: '+a.hours,a.rate&&'الأجر المتوقع: '+esc(a.rate),a.langs&&'اللغات: '+esc(a.langs),'<span dir="ltr">'+esc(a.email)+'</span>'+(a.phone?' · <span dir="ltr">'+esc(a.phone)+'</span>':'')].filter(Boolean).join('<br>')+'</div>'+
        (a.about?'<div class="small muted" style="margin-top:10px">عنه</div><pre>'+esc(a.about)+'</pre>':'')+'</div>'+
        '<div class="ofields" data-app="'+esc(a.id)+'"><div class="field"><label>المرحلة</label><select data-af="status">'+Object.keys(TAPP).map(function(s){ return '<option value="'+s+'"'+(s===a.status?' selected':'')+'>'+TAPP[s]+'</option>'; }).join('')+'</select></div>'+
          '<div class="crm"><b class="small">المهمة التجريبية</b><textarea data-af="trial.brief" placeholder="البريف: شو المطلوب بالزبط">'+esc(tr.brief||'')+'</textarea><div class="row"><div class="field"><label>رابط المواد</label><input data-af="trial.link" dir="ltr" value="'+esc(tr.link||'')+'"></div><div class="field"><label>الموعد</label><input data-af="trial.due" type="date" value="'+esc(tr.due||'')+'"></div></div><div class="field"><label>النتيجة / رابط تسليمه</label><input data-af="trial.result" dir="auto" value="'+esc(tr.result||'')+'"></div>'+
            (tr.brief&&a.phone?'<a class="btn sm" target="_blank" rel="noopener" href="'+esc(waLink(a.phone,'مرحباً '+a.name+'، شكراً لاهتمامك بالانضمام لـ Eyeblink Studio. هذه مهمة تجريبية قصيرة:\n\n'+tr.brief+(tr.link?'\n\nالمواد: '+tr.link:'')+(tr.due?'\nالتسليم: '+tr.due:'')))+'">ابعت المهمة التجريبية واتساب</a>':'')+'</div>'+
          '<div class="field"><label>ملاحظاتك</label><textarea data-af="notes">'+esc(a.notes||'')+'</textarea></div>'+
          '<div class="actions"><button class="btn sm primary" type="button" data-asave="'+esc(a.id)+'">حفظ</button>'+(a.member?'<span class="tag c-good">صار بالفريق</span>':'<button class="btn sm" type="button" data-aaccept="'+esc(a.id)+'">اقبله وجهّز حسابه</button>')+'<button class="btn sm danger" type="button" data-adel="'+esc(a.id)+'">حذف</button></div></div></div></div></details>'; }).join('')+'</div>';
  }
  function teamSettings(){ var s=TEAM.settings||{}, roles=s.roles||[];
    return '<form class="sec" id="tSet"><h3>التوظيف</h3><p class="hint">لما يكون مفعّل، صفحة <a href="/join" target="_blank" dir="ltr">eyeblinkstudio.com/join</a> بتستقبل طلبات. لما يكون مطفي، بتقول «لا نستقبل طلبات حالياً»</p>'+
      '<label class="check"><input type="checkbox" name="open"'+(s.open?' checked':'')+'> نستقبل طلبات انضمام</label>'+
      '<div class="field"><label>الأدوار المطلوبة</label><div class="dpay">'+Object.keys(TROLE).map(function(r){ var on=roles.indexOf(r)>=0; return '<label class="dchip'+(on?' on':'')+'"><input type="checkbox" name="roles" value="'+r+'"'+(on?' checked':'')+'>'+TROLE[r]+'</label>'; }).join('')+'</div></div>'+
      '<div class="field"><label>سطرين بأول الصفحة (اختياري)</label><textarea name="intro" dir="auto">'+esc(s.intro||'')+'</textarea></div><div class="actions"><button class="btn primary" type="submit">حفظ</button><a class="btn" href="/join" target="_blank">افتح الصفحة</a></div></form>';
  }
  // the collaboration agreement: written from the member's role; studio can edit it before sending like any agreement
  function teamClauses(lang,v){
    if(lang==='en') return [
      {h:'Purpose',p:'The Second Party ('+v.member+') collaborates with the First Party ('+v.studio+') as an independent '+v.role+', on tasks the First Party assigns one by one through the team portal'},
      {h:'Nature of the relationship',p:'The Second Party is independent, not an employee; this agreement creates no employment or partnership. Each task may be accepted or declined before it starts'},
      {h:'Tasks and fees',p:'Each task states its brief, due date and fee before it starts. The fee is earned once the First Party approves the task and is paid within '+v.payDays+' days of approval via '+v.payMethods},
      {h:'Deadlines',p:'The Second Party meets each due date and tells the First Party at once of any expected delay. Repeated unannounced delays may end the collaboration'},
      {h:'Quality and internal review',p:'Every version is reviewed by the First Party before it reaches a client. Review notes within the brief are carried out at no extra fee; changes beyond the brief are priced first'},
      {h:'Confidentiality',p:'The Second Party keeps everything it sees confidential — client identities, files, footage, prices and methods — during the collaboration and after it, and shares no file with any third party'},
      {h:'No direct contact with clients',p:'The Second Party does not contact the First Party’s clients about any work, nor offer them its services independently, during the collaboration and for '+v.months+' months after it, without the First Party’s written consent'},
      {h:'Intellectual property',p:'All rights in work produced within tasks pass to the First Party when its fee is paid. The Second Party may show it only with the First Party’s written permission, after the client has published it, and without naming the client unless allowed'},
      {h:'Licensed material and tools',p:'The Second Party uses only licensed software and material, or what the First Party provides, and adds no music, footage or fonts without confirming their licence'},
      {h:'Files',p:'The Second Party hands over final and open project files on request, and deletes client files from its devices 30 days after a task is approved unless asked otherwise'},
      {h:'Ending the collaboration',p:'Either party may end the collaboration in writing, finishing or handing over open tasks; approved work is paid. Confidentiality, ownership and no-contact terms survive the end'},
      {h:'General',p:'Messages through the team portal, email and agreed messaging apps form part of this agreement; no amendment is valid unless agreed in writing by both parties'}];
    return [
      {h:'موضوع الاتفاقية',p:'يتعاون الطرف الثاني ('+v.member+') مع الطرف الأول ('+v.studio+') بصفته متعاوناً مستقلاً في مجال '+v.role+'، على أساس مهام يكلّفه بها الطرف الأول تباعاً عبر بوابة الفريق'},
      {h:'طبيعة العلاقة',p:'الطرف الثاني مستقل وليس موظفاً، ولا تنشئ هذه الاتفاقية علاقة عمل أو شراكة. وله قبول المهمة أو الاعتذار عنها قبل البدء بها'},
      {h:'المهام والأجور',p:'يُحدَّد لكل مهمة قبل بدئها وصفها وموعد تسليمها وأجرها. ويستحق الطرف الثاني الأجر بعد اعتماد المهمة من الطرف الأول، ويُصرف خلال '+v.payDays+' أيام من الاعتماد عبر '+v.payMethods},
      {h:'المواعيد',p:'يلتزم الطرف الثاني بموعد تسليم كل مهمة، ويُبلغ الطرف الأول فوراً بأي تأخير متوقع. والتأخير المتكرر دون إبلاغ سبب لإنهاء التعاون'},
      {h:'الجودة والمراجعة الداخلية',p:'تمر كل نسخة بمراجعة الطرف الأول قبل وصولها إلى أي عميل. وتُنفَّذ ملاحظات المراجعة ضمن البريف دون أجر إضافي، أما التعديلات خارج البريف فيُتفق على أجرها أولاً'},
      {h:'السرية',p:'يلتزم الطرف الثاني بسرية كل ما يطّلع عليه، من هوية العملاء والملفات واللقطات والأسعار وأساليب العمل، أثناء التعاون وبعده، ولا يشارك أي ملف مع طرف ثالث'},
      {h:'عدم التواصل المباشر مع العملاء',p:'لا يتواصل الطرف الثاني مع عملاء الطرف الأول بشأن أي عمل، ولا يقدّم لهم خدماته بشكل مستقل، أثناء التعاون ولمدة '+v.months+' شهراً بعد انتهائه، إلا بموافقة كتابية من الطرف الأول'},
      {h:'الملكية الفكرية',p:'تنتقل جميع حقوق ما يُنفَّذ ضمن المهام إلى الطرف الأول عند صرف أجره. ولا يعرضه الطرف الثاني في أعماله إلا بإذن كتابي من الطرف الأول وبعد نشره من العميل، ودون ذكر اسم العميل ما لم يُسمح بذلك'},
      {h:'المواد المرخّصة والأدوات',p:'يستخدم الطرف الثاني برامج ومواد مرخّصة فقط، أو ما يوفّره له الطرف الأول، ولا يضيف موسيقى أو لقطات أو خطوطاً دون التأكد من ترخيصها'},
      {h:'الملفات',p:'يسلّم الطرف الثاني الملفات النهائية وملفات المشروع المفتوحة عند الطلب، ويحذف ملفات العملاء من أجهزته بعد 30 يوماً من اعتماد المهمة ما لم يُطلب منه غير ذلك'},
      {h:'إنهاء التعاون',p:'لكل طرف إنهاء التعاون بإشعار كتابي، مع إتمام المهام القائمة أو تسليم ما أُنجز منها، ويُصرف أجر ما اعتُمد. وتبقى بنود السرية والملكية وعدم التواصل سارية بعد الإنهاء'},
      {h:'أحكام عامة',p:'تُعدّ المراسلات عبر بوابة الفريق والبريد الإلكتروني وتطبيقات المراسلة المعتمدة جزءاً مكمّلاً لهذه الاتفاقية، ولا يُعتدّ بأي تعديل عليها إلا كتابياً من الطرفين'}];
  }
  function issueContract(m,b){ var S=dset(), lang=m.lang==='en'?'en':'ar', role=lang==='en'?m.role:(TROLE[m.role]||m.role);
    var body={lang:lang,title:(lang==='en'?'Independent collaboration · ':'تعاون مستقل · ')+role,summary:'',client:{name:m.name,company:'',place:'',contact:m.phone||'',email:m.email},studio:{name:S.studioName,place:S.studioPlace,contact:S.studioContact},items:[],cur:'$',
      includes:[],excludes:[],payMethods:'',notes:'',clauses:teamClauses(lang,{member:m.name,studio:S.studioName,role:role,payDays:7,months:12,payMethods:S.payMethods})};
    b.disabled=true; return api('/docs','POST',{action:'issue',type:'team',key:'member:'+m.email,doc:body}).then(function(j){ if(!j.ok) throw new Error(j.error);
      m.contract={token:j.doc.token,no:j.doc.no,signedAt:null}; var url=location.origin+'/team-agreement/'+j.doc.token;
      showCreds({title:'اتفاقية التعاون جاهزة',lines:[['الرابط',url]],msg:'مرحباً '+m.name+'، هذه اتفاقية التعاون مع Eyeblink Studio. اقرأها ووقّعها من الرابط، وبعدها تنفتح لك مهامك في بوابة الفريق:\n'+url,phone:m.phone,open:url}); renderTeam(); })
      .catch(function(){ b.disabled=false; toast('ما انعملت الاتفاقية',true); }); }
  // a small sheet with what to send (login details, agreement link): copy, WhatsApp
  function showCreds(o){ var el=document.createElement('div'); el.id='tsheet';
    el.innerHTML='<div class="dbox"><div class="dtop"><b>'+esc(o.title)+'</b><button class="btn sm" type="button" data-tclose>إغلاق</button></div><div class="dres">'+o.lines.map(function(l){ return '<div class="field"><label>'+esc(l[0])+'</label><div class="dlink" dir="ltr">'+esc(l[1])+'</div></div>'; }).join('')+
      (o.note?'<p class="small muted">'+esc(o.note)+'</p>':'')+'<div class="field"><label>الرسالة</label><textarea id="tmsg" dir="auto" rows="5">'+esc(o.msg)+'</textarea></div><div class="actions"><a class="btn primary" target="_blank" rel="noopener" href="'+esc(waLink(o.phone,o.msg))+'">إرسال على واتساب</a><button class="btn" type="button" data-tcopy>نسخ الرسالة</button>'+(o.open?'<a class="btn" target="_blank" rel="noopener" href="'+esc(o.open)+'">فتح</a>':'')+'</div></div></div>';
    document.body.appendChild(el); document.documentElement.classList.add('dlock'); }
  function openTTask(id){
    TOPEN=id; var t=id?TEAM.tasks.filter(function(x){return x.id===id})[0]:null; if(id&&!t) return;
    var act=TEAM.members.filter(function(m){ return m.status==='active'; }), x=t||{member:TNEWFOR||(act[0]&&act[0].email)||'',cur:'$',links:[]}; TNEWFOR=null;
    var old=$('#tsheet'); if(old) old.remove(); var el=document.createElement('div'); el.id='tsheet';
    var ords=ORDERS.filter(function(o){ return !o.demo&&o.status!=='cancelled'; });
    el.innerHTML='<div class="dbox"><div class="dtop"><div><b>'+(t?esc(t.title):'مهمة جديدة للفريق')+'</b>'+(t?' <span class="pill tt-'+t.status+'">'+TTST[t.status]+'</span>':'')+'</div><button class="btn sm" type="button" data-tclose>إغلاق</button></div>'+
      '<form id="tTask" class="dsec"><div class="row"><div class="field"><label>المتعاون</label><select name="member">'+act.concat(t&&!act.some(function(m){return m.email===t.member})?[{email:t.member,name:memName(t.member)}]:[]).map(function(m){ return '<option value="'+esc(m.email)+'"'+(m.email===x.member?' selected':'')+'>'+esc(m.name)+'</option>'; }).join('')+'</select></div>'+
        '<div class="field"><label>عنوان المهمة</label><input name="title" dir="auto" value="'+esc(x.title||'')+'" placeholder="مثال: مونتاج ريل 30 ثانية"></div></div>'+
        '<div class="row"><div class="field"><label>اسم رمزي للمشروع (هاد يلي بيشوفه)</label><input name="alias" dir="auto" value="'+esc(x.alias||'')+'" placeholder="مثال: Project Amber"></div><div class="field"><label>التسليم</label><input name="due" type="date" value="'+esc(x.due||'')+'"></div><div class="field"><label>أجره</label><input name="fee" dir="ltr" value="'+esc(x.fee==null?'':x.fee)+'" placeholder="40"></div><div class="field" style="max-width:200px"><label>العملة</label>'+curSel('name="cur" data-tcur data-prev="'+esc(x.cur||'$')+'"',x.cur||'$')+'</div></div>'+
        '<div class="field"><label>البريف</label><textarea name="brief" dir="auto" rows="5" placeholder="شو المطلوب، المدة، الإحساس، المقاسات، المراجع">'+esc(x.brief||'')+'</textarea></div>'+
        '<div class="field"><label>روابط الملفات والمراجع (كل رابط بسطر)</label><textarea name="links" dir="ltr" rows="3">'+esc((x.links||[]).join('\n'))+'</textarea></div>'+
        '<details class="dstudio"><summary>لإلك بس (ما بيشوفها المتعاون)</summary><div class="row"><div class="field"><label>مربوطة بطلب</label><select name="orderKey"><option value="">—</option>'+ords.map(function(o){ return '<option value="'+esc(o.key)+'"'+(o.key===x.orderKey?' selected':'')+'>'+esc(o.code+' · '+o.name)+'</option>'; }).join('')+'</select></div></div><div class="field"><label>ملاحظة داخلية</label><textarea name="internal" dir="auto" rows="2">'+esc(x.internal||'')+'</textarea></div></details>'+
        '<div class="actions"><button class="btn primary" type="submit">'+(t?'حفظ':'إرسال المهمة')+'</button>'+(t?'<button class="btn danger sm" type="button" data-tdel="'+esc(t.id)+'">حذف</button>':'')+'</div></form>'+
      (t?'<section class="dsec"><h4>النسخ</h4>'+((t.versions||[]).length?'<div class="vlist">'+t.versions.slice().reverse().map(function(v){ return '<div><b dir="ltr">v'+v.n+'</b><a href="'+esc(v.url)+'" target="_blank" rel="noopener">افتح</a><span class="muted small">'+esc(new Date(v.at).toLocaleString('ar-u-nu-latn',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+'</span>'+(v.note?'<p>'+esc(v.note)+'</p>':'')+'</div>'; }).join('')+'</div>':'<p class="muted small">ما سلّم نسخة لسا</p>')+
        (t.status==='qc'?'<div class="qc"><textarea id="qcNote" dir="auto" rows="2" placeholder="ملاحظاتك (بتوصله)"></textarea><div class="actions"><button class="btn primary" type="button" data-treview="approve">اعتماد</button><button class="btn" type="button" data-treview="changes">اطلب تعديلات</button></div></div>':'')+
        (t.status==='approved'?'<div class="actions"><button class="btn'+(t.payout&&t.payout.paid?'':' primary')+'" type="button" data-tpaid="'+(t.payout&&t.payout.paid?'0':'1')+'">'+(t.payout&&t.payout.paid?'إلغاء «انصرف»':'انصرف الأجر · '+esc(pfmt(+t.fee||0,t.cur||'$')))+'</button></div>':'')+'</section>'+
        '<section class="dsec"><h4>المحادثة معه</h4><div class="athread">'+((t.comments||[]).length?t.comments.map(function(c){ return '<div class="amsg '+(c.from==='studio'?'s':'c')+'"><div>'+esc(c.text)+'</div><small>'+(c.from==='studio'?'أنت':esc(memName(t.member)))+' · '+esc(new Date(c.at).toLocaleString('ar-u-nu-latn',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+'</small></div>'; }).join(''):'<div class="muted small">ما في رسائل</div>')+'</div>'+
        '<div class="asend"><textarea id="tcm" dir="auto" placeholder="اكتب له…"></textarea><button class="btn primary sm" type="button" data-tcomment>إرسال</button></div></section>':'')+
    '</div>';
    document.body.appendChild(el); document.documentElement.classList.add('dlock');
  }
  var TNEWFOR=null;
  function closeT(){ var el=$('#tsheet'); if(el) el.remove(); TOPEN=null; document.documentElement.classList.remove('dlock'); }
  document.addEventListener('submit',function(e){ var f=e.target;
    if(f.id==='tTask'){ e.preventDefault(); var E=f.elements, t=TOPEN; var task={id:t||'',member:E.member.value,title:E.title.value.trim(),alias:E.alias.value.trim(),due:E.due.value,fee:E.fee.value,cur:E.cur.value.trim()||'$',brief:E.brief.value,links:E.links.value.split('\n'),orderKey:E.orderKey.value,internal:E.internal.value};
      if(!task.member){ toast('ضيف متعاون أول',true); return; } if(!task.title){ toast('اكتب عنوان المهمة',true); E.title.focus(); return; }
      treq({action:'taskSave',task:task},f.querySelector('[type=submit]'),t?'انحفظت المهمة':'وصلت المهمة للمتعاون').then(function(j){ TOPEN=j.task.id; loadTeam(); }); return; }
    if(f.id==='tAdd'){ e.preventDefault(); var E2=f.elements;
      treq({action:'memberCreate',name:E2.name.value.trim(),email:E2.email.value.trim(),role:E2.role.value,phone:E2.phone.value.trim(),rate:E2.rate.value.trim(),app:E2.app.value},f.querySelector('[type=submit]')).then(function(j){
        showCreds({title:'حساب '+j.member.name+' جاهز',lines:[['الرابط',j.link],['الإيميل',j.member.email],['كلمة السر المؤقتة',j.password]],note:'كلمة السر بتظهر هون مرة وحدة بس. أول ما يدخل بيختار كلمة سر خاصة فيه. الخطوة الجاية: «جهّز الاتفاقية»',
          msg:'أهلاً '+j.member.name+'، صار عندك حساب ببوابة فريق Eyeblink:\n'+j.link+'\nالإيميل: '+j.member.email+'\nكلمة السر المؤقتة: '+j.password+'\nأول دخول بتختار كلمة سرك، وبتلاقي اتفاقية التعاون لتوقّعها',phone:E2.phone.value.trim()});
        TSUB='members'; loadTeam(); }).catch(function(){}); return; }
    if(f.id==='tSet'){ e.preventDefault(); var roles=[].map.call(f.querySelectorAll('[name=roles]:checked'),function(i){ return i.value; });
      treq({action:'settings',open:f.elements.open.checked,roles:roles,intro:f.elements.intro.value},f.querySelector('[type=submit]'),f.elements.open.checked?'صفحة التقديم مفتوحة':'صفحة التقديم مسكّرة').then(function(j){ TEAM.settings=j.settings; renderTeam(); }).catch(function(){}); }
  });
  document.addEventListener('change',function(e){ var el=e.target; if(el.closest('#tSet')&&el.name==='roles') el.closest('.dchip').classList.toggle('on',el.checked); });
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-tsub],[data-tnew],[data-ttask],[data-tclose],[data-tcopy],[data-treview],[data-tpaid],[data-tcomment],[data-tdel],[data-tmadd],[data-tcontract],[data-treset],[data-tpause],[data-tpayall],[data-asave],[data-aaccept],[data-adel]'); if(!b) return;
    var D=b.dataset;
    if(D.tsub){ TSUB=D.tsub; renderTeam(); return; }
    if(b.hasAttribute('data-tclose')){ closeT(); return; }
    if(b.hasAttribute('data-tcopy')){ var tm=$('#tmsg'); try{ navigator.clipboard.writeText(tm.value).then(function(){ toast('انتسخت'); }); }catch(_){ tm.select(); } return; }
    if(b.hasAttribute('data-tnew')){ if(!TEAM.members.some(function(m){return m.status==='active'})){ toast('ضيف متعاون أول',true); TSUB='members'; renderTeam(); return; } TNEWFOR=D.for||null; openTTask(null); return; }
    if(D.ttask){ openTTask(D.ttask); return; }
    if(b.hasAttribute('data-tmadd')){ var f=$('#tAdd'); if(f){ f.hidden=!f.hidden; if(!f.hidden) f.elements.name.focus(); } return; }
    if(D.treview){ treq({action:'taskReview',id:TOPEN,decision:D.treview,note:($('#qcNote')||{}).value||''},b,D.treview==='approve'?'اعتمدتها':'انبعتت ملاحظاتك').then(loadTeam).catch(function(){}); return; }
    if(D.tpaid){ treq({action:'taskPaid',id:TOPEN,paid:D.tpaid==='1'},b,D.tpaid==='1'?'انسجّل الصرف':'انشال').then(loadTeam).catch(function(){}); return; }
    if(b.hasAttribute('data-tcomment')){ var tx=$('#tcm').value.trim(); if(!tx) return; treq({action:'taskComment',id:TOPEN,text:tx},b).then(loadTeam).catch(function(){}); return; }
    if(D.tdel){ if(D.armed!=='1'){ b.dataset.armed='1'; b.textContent='أكيد؟'; return; } treq({action:'taskDelete',id:D.tdel},b,'انحذفت').then(function(){ closeT(); loadTeam(); }).catch(function(){}); return; }
    var m=TEAM.members.filter(function(x){ return x.email===(D.tcontract||D.treset||D.tpause||D.tpayall); })[0];
    if(D.tcontract&&m){ issueContract(m,b); return; }
    if(D.treset&&m){ treq({action:'memberReset',email:m.email},b).then(function(j){ b.disabled=false; showCreds({title:'كلمة سر مؤقتة لـ '+m.name,lines:[['الرابط',j.link],['الإيميل',m.email],['كلمة السر المؤقتة',j.password]],note:'بتظهر مرة وحدة',msg:'كلمة سر مؤقتة لبوابة فريق Eyeblink:\n'+j.link+'\n'+m.email+'\n'+j.password,phone:m.phone}); }).catch(function(){}); return; }
    if(D.tpause&&m){ treq({action:'memberUpdate',email:m.email,status:m.status==='paused'?'active':'paused'},b,'تمام').then(loadTeam).catch(function(){}); return; }
    if(D.tpayall&&m){ if(D.armed!=='1'){ b.dataset.armed='1'; b.textContent='أكيد انصرف كله؟'; return; } var l=TEAM.tasks.filter(function(t){ return t.member===m.email&&t.status==='approved'&&!(t.payout&&t.payout.paid); });
      b.disabled=true; Promise.all(l.map(function(t){ return api('/team','POST',{action:'taskPaid',id:t.id,paid:true}); })).then(function(){ toast('انسجّل صرف '+l.length+' مهام'); loadTeam(); }); return; }
    var box=b.closest('[data-app]'), aid=D.asave||D.aaccept||D.adel, a=TEAM.apps.filter(function(x){ return x.id===aid; })[0]; if(!a) return;
    if(D.adel){ if(D.armed!=='1'){ b.dataset.armed='1'; b.textContent='أكيد؟'; return; } treq({action:'appDelete',id:a.id},b,'انحذف').then(loadTeam).catch(function(){}); return; }
    if(D.asave){ var v=function(k){ var el=box.querySelector('[data-af="'+k+'"]'); return el?el.value:''; };
      treq({action:'app',id:a.id,status:v('status'),notes:v('notes'),trial:{brief:v('trial.brief'),link:v('trial.link'),due:v('trial.due'),result:v('trial.result')}},b,'انحفظ').then(loadTeam).catch(function(){}); return; }
    if(D.aaccept){ TSUB='members'; renderTeam(); var host=$('#tAdd'); if(host){ host.outerHTML=tAddForm({name:a.name,email:a.email,role:a.role,phone:a.phone,rate:a.rate,app:a.id}); var nf=$('#tAdd'); nf.hidden=false; nf.scrollIntoView({block:'center'}); } }
  });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&$('#tsheet')) closeT(); });

  function renderOrders(){
    renderTabs();
    var list=ORDERS.filter(function(o){ return OFILTER==='all'||(OFILTER==='follow'?dueFollow(o):o.status===OFILTER); });
    var count=function(st){ return ORDERS.filter(function(o){return o.status===st}).length; }, due=ORDERS.filter(dueFollow).length;
    var methods=((C.payments&&C.payments.methods)||[]);
    var head='<section class="sec"><div class="crm-top"><h3>الطلبات والفرص</h3><button class="btn sm'+(NEWOPP?'':' primary')+'" type="button" data-oppnew>'+(NEWOPP?'إغلاق':'+ فرصة جديدة')+'</button></div>'+(NEWOPP?oppForm():'')+funnel()+
      '<div class="chips">'+[['all','الكل',ORDERS.length]].concat(due?[['follow','بحاجة متابعة',due]]:[]).concat(Object.keys(ST).map(function(k){return [k,ST[k],count(k)]})).map(function(x){return '<button type="button" class="btn sm'+(OFILTER===x[0]?' primary':'')+(x[0]==='follow'?' due':'')+'" data-ofilter="'+x[0]+'">'+x[1]+(x[2]?' <small>'+x[2]+'</small>':'')+'</button>'}).join('')+'</div>'+
      '<details class="crmset"><summary class="small muted">أسباب الخسارة (لما يتلغى طلب)</summary><textarea id="lostList" dir="auto" rows="6">'+esc(lostReasons().join('\n'))+'</textarea><div class="actions"><span class="small muted">كل سبب بسطر</span><button class="btn sm" type="button" data-lostsave>حفظ</button></div></details>'+
      (!LIVE?'<p class="hint">هذا طلب تجريبي ليظهر لك طريقة العمل. الطلبات الحقيقية تصل هنا بعد نشر الموقع على Cloudflare.</p>':'')+'</section>';
    if(!list.length){ $('#panel').innerHTML=head+'<div class="sec"><div class="empty">لا توجد طلبات هنا.</div></div>'; return; }
    $('#panel').innerHTML=head+'<div class="orders">'+list.map(function(o){
      var k=esc(o.key);
      return '<details class="order item" data-okey="'+k+'"'+(o.status==='new'||o.unread?' open':'')+'><summary><span class="chev">‹</span><span class="code">'+esc(o.code)+'</span><span class="pill '+esc(o.status)+'">'+esc(ST[o.status]||o.status)+(o.status==='cancelled'&&o.lostReason?' · '+esc(o.lostReason):'')+'</span>'+(o.manual?'<span class="pill src">'+esc(SRC[srcOf(o)]||'')+'</span>':'')+(dueFollow(o)?'<span class="pill due">متابعة'+(o.followUp<todayISO()?' متأخرة':' اليوم')+'</span>':o.followUp&&o.status!=='cancelled'&&o.status!=='delivered'?'<span class="pill">متابعة '+esc(fdate(o.followUp))+'</span>':'')+(o.paid?'<span class="pill paid">مدفوع</span>':'')+(o.unread?'<span class="pill unread">'+o.unread+' رسالة جديدة</span>':'')+
        '<b>'+esc(o.name)+' · '+esc(o.packageName||o.package)+'</b><span class="muted small">'+esc(new Date(o.createdAt).toLocaleDateString('ar'))+'</span></summary><div class="body">'+
        '<div class="grid2"><div>'+
          '<div class="small muted">الطلب</div><div><b>'+esc(o.packageName||o.package)+'</b>'+(o.total?' · التقدير: <span dir="ltr">'+esc(o.total)+'</span>':'')+(o.qty>1?' · <b>×'+o.qty+'</b>':'')+(o.addons&&o.addons.length?'<br>إضافات: '+esc(o.addons.join('، ')):'')+((o.platforms||[]).length?'<br>المنصات: <span dir="ltr">'+esc(o.platforms.join(', '))+'</span>':'')+(o.payPref?'<br>الدفع المفضّل: '+esc(o.payPref):'')+'</div>'+
          '<div class="small muted" style="margin-top:8px">العميل</div><div>'+esc(o.name)+(o.email?' — <span dir="ltr" style="user-select:all">'+esc(o.email)+'</span>':'')+(o.contact?'<br><span class="muted small">تواصل خارجي:</span> <span dir="ltr" style="user-select:all">'+esc(o.contact)+'</span>':'')+'</div>'+
          (o.visit&&!o.visit.manual?'<div class="small muted" style="margin-top:8px">مصدر الزيارة</div><div class="small visit">'+[o.visit.source&&('المصدر: <b dir="ltr">'+esc(o.visit.source)+'</b>'),o.visit.utm&&('حملة: <span dir="ltr">'+esc(o.visit.utm)+'</span>'),o.visit.landing&&('أول صفحة: <span dir="ltr">'+esc(o.visit.landing)+'</span>'),o.visit.visits&&('عدد الزيارات قبل الطلب: '+esc(o.visit.visits)),o.visit.first&&('أول زيارة: '+esc(new Date(o.visit.first).toLocaleDateString('ar'))),(o.visit.country||o.visit.city)&&('الموقع: '+esc([o.visit.city,o.visit.country].filter(Boolean).join('، '))),o.visit.device&&('الجهاز: '+esc(DEV[o.visit.device]||o.visit.device)+' · '+esc(o.visit.os||''))].filter(Boolean).join(' · ')+'</div>':'')+
          '<div class="small muted" style="margin-top:8px">التفاصيل</div><pre>'+esc(o.details)+'</pre>'+
          (o.link?'<div dir="ltr" class="small"><a href="'+esc(o.link)+'" target="_blank" rel="noopener">'+esc(o.link)+'</a></div>':'')+(o.deadline?'<div class="small muted">الموعد: '+esc(o.deadline)+'</div>':'')+
          (o.email&&!hiddenOpp(o)?'<div class="small muted" style="margin-top:12px">المحادثة مع العميل (تظهر له في حسابه)</div><div class="athread">'+thread(o)+'</div>'+
            (o.review?'<div class="areview"><b>تقييم العميل: '+'★★★★★'.slice(0,o.review.stars)+'<span style="opacity:.3">'+'★★★★★'.slice(o.review.stars)+'</span></b>'+(o.review.text?'<p>'+esc(o.review.text)+'</p>':'')+
              (o.review.publish?'<label class="check"><input type="checkbox" data-rapprove="'+k+'"'+(o.review.approved?' checked':'')+'> اعرضه على الموقع</label>':'<span class="muted small">العميل لم يوافق على النشر.</span>')+'</div>':'')+
            '<div class="apend" hidden></div><div class="asend"><label class="btn sm" title="إرفاق ملف (حتى 20MB)">📎<input type="file" multiple hidden data-oup="'+k+'"></label><textarea data-msg dir="auto" placeholder="'+(o.status==='delivered'||o.status==='cancelled'?'المحادثة مغلقة عند العميل بعد التسليم، لكن رسالتك ستظهر له':'اكتب رداً للعميل…')+'"></textarea><button class="btn primary sm" type="button" data-osend="'+k+'">إرسال</button></div>':'')+
          '<div class="small muted" style="margin-top:8px">السجل</div><div class="small">'+(o.history||[]).map(function(h){return esc(ST[h.status]||h.status)+' · '+esc(new Date(h.at).toLocaleString('ar'))}).join('<br>')+'</div>'+
        '</div><div class="ofields">'+
          '<div class="row"><div class="field"><label>الحالة</label><select data-of="status">'+Object.keys(ST).map(function(s2){return '<option value="'+s2+'"'+(s2===o.status?' selected':'')+'>'+ST[s2]+'</option>'}).join('')+'</select></div>'+
          '</div>'+
          crmFields(o,k)+
          docsBox(o,k)+
          payFlow(o,k,methods)+
          '<div class="field"><label>ملاحظات داخلية</label><textarea data-of="notes">'+esc(o.notes)+'</textarea></div>'+
          '<div class="actions"><button class="btn primary sm" type="button" data-osave="'+k+'">حفظ الطلب</button><button class="btn sm danger" type="button" data-odel="'+k+'">حذف</button></div>'+
          '<div class="small muted" style="margin-top:6px">رسالة جاهزة</div><div class="actions"><button class="btn sm" type="button" data-reply="delivered" data-ok="'+k+'">رسالة التسليم</button></div>'+
          '<div class="replybox" hidden><textarea class="replytext" dir="auto"></textarea><div class="actions">'+(o.email?'<button class="btn sm primary" type="button" data-sendreply="'+k+'">أرسل في محادثة الموقع</button>':'')+'<button class="btn sm" type="button" data-copyreply>نسخ الرسالة</button><a class="btn sm" data-openreply target="_blank" rel="noopener">افتح المحادثة الخارجية</a></div></div>'+
        '</div></div></div></details>';
    }).join('')+'</div>';
  }
  function thread(o){
    var m=o.messages||[]; if(!m.length) return '<div class="muted small">لا رسائل بعد. العميل يرى رسالة ترحيب تلقائية بأنكم سترسلون السعر خلال 24 ساعة.</div>';
    return m.map(function(x){ return '<div class="amsg '+(x.from==='client'?'c':'s')+(x.kind?' k-'+x.kind:'')+'">'+(x.text?'<div>'+esc(x.text).replace(/\n/g,'<br>').replace(/\[(\d{1,2}:\d{2})\]/g,'<b class="tcode">⏱ $1</b>')+'</div>':'')+
      (x.files||[]).map(function(f){ var u=esc(abs(f.url.replace(/^\//,''))); return /^image\//.test(f.type)?'<a href="'+u+'" target="_blank"><img class="afile" src="'+u+'" alt=""></a>'
        : /^video\//.test(f.type)?'<video class="afile" src="'+u+'" controls preload="metadata"></video>' : '<a class="adoc" href="'+u+'" target="_blank">📎 '+esc(f.name)+'</a>'; }).join('')+
      '<small>'+(x.from==='client'?'العميل':'أنت')+' · '+esc(new Date(x.at).toLocaleString('ar'))+'</small></div>'; }).join('');
  }
  var PEND={};   // files uploaded and waiting to be sent, per order
  function drawPend(key){ var d=document.querySelector('[data-okey="'+key+'"] .apend'); if(!d) return; var l=PEND[key]||[]; d.hidden=!l.length; d.innerHTML=l.map(function(f){ return '<span class="pill">📎 '+esc(f.name)+'</span>'; }).join(''); }
  document.addEventListener('change',function(e){ var inp=e.target; if(!inp.dataset||!inp.dataset.oup) return; var key=inp.dataset.oup, o=orderOf(key), list=[].slice.call(inp.files); inp.value='';
    if(!LIVE||o.demo){ toast('رفع الملفات يعمل على الموقع المنشور.',true); return; }
    list.forEach(function(file){ if(file.size>20*1024*1024){ toast('الحد 20MB للملف. للأكبر أرسل رابط Drive أو WeTransfer.',true); return; }
      toast('جارٍ رفع '+file.name+'…');
      fetch(API+'/files',{method:'POST',headers:headers({'content-type':file.type||'application/octet-stream','x-code':o.code,'x-filename':encodeURIComponent(file.name)}),body:file})
        .then(function(r){ return r.json(); }).then(function(j){ if(!j.ok) throw new Error(j.error||'fail'); (PEND[key]=PEND[key]||[]).push(j.file); drawPend(key); toast('جاهز للإرسال: '+file.name); })
        .catch(function(err){ toast('تعذّر رفع '+file.name+(err.message==='type'?' (نوع غير مدعوم)':''),true); }); }); });
  document.addEventListener('change',function(e){ var c=e.target; if(!c.dataset||!c.dataset.rapprove) return; var o=orderOf(c.dataset.rapprove);
    if(!LIVE||o.demo){ o.review.approved=c.checked; return; }
    fetch(API+'/orders',{method:'PATCH',headers:headers({'content-type':'application/json'}),body:JSON.stringify({key:o.key,reviewApproved:c.checked})}).then(function(r){ if(!r.ok) throw 0; o.review.approved=c.checked; toast(c.checked?'التقييم ظاهر على الموقع':'أُخفي التقييم'); }).catch(function(){ c.checked=!c.checked; toast('تعذّر الحفظ',true); }); });
  function sendMsg(key,text,btn,files){
    var o=orderOf(key); text=String(text||'').trim(); files=files||[]; if(!o||(!text&&!files.length)) return;
    var add=function(){ (o.messages=o.messages||[]).push({from:'studio',text:text,at:new Date().toISOString(),files:files.length?files:undefined}); delete PEND[key]; o.unread=0; renderOrders(); var d=document.querySelector('[data-okey="'+key+'"]'); if(d){ d.open=true; var th=d.querySelector('.athread'); if(th) th.scrollTop=th.scrollHeight; } toast('وصلت الرسالة إلى حساب العميل'); };
    if(!LIVE||o.demo){ add(); return; }
    if(btn) btn.disabled=true;
    fetch(API+'/orders',{method:'PATCH',headers:headers({'content-type':'application/json'}),body:JSON.stringify({key:key,message:text,files:files})}).then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(j){ if(j.order){ j.order.messages=(j.order.messages||[]).slice(0,-1); Object.assign(o,j.order); } add(); }).catch(function(){ if(btn) btn.disabled=false; toast('تعذّر الإرسال',true); });
  }
  document.addEventListener('toggle',function(e){ var d=e.target; if(!d.dataset||!d.dataset.okey||!d.open) return; var o=orderOf(d.dataset.okey);
    var th=d.querySelector('.athread'); if(th) th.scrollTop=th.scrollHeight;
    if(o&&o.unread&&LIVE&&!o.demo){ fetch(API+'/orders',{method:'PATCH',headers:headers({'content-type':'application/json'}),body:JSON.stringify({key:o.key,seen:true})}).then(function(){ o.unread=0; renderTabs(); var pl=d.querySelector('.pill.unread'); if(pl) pl.remove(); }).catch(function(){}); }
  },true);
  function orderOf(key){ return ORDERS.filter(function(o){return o.key===key})[0]; }
  function readOrderForm(box){ var d={}; [].forEach.call(box.querySelectorAll('[data-of]'),function(el){ d[el.dataset.of]= el.type==='checkbox'? el.checked : el.value; }); return d; }
  document.addEventListener('click',function(e){
    var b=e.target.closest('button,a'); if(!b) return;
    if(b.dataset.ofilter){ OFILTER=b.dataset.ofilter; renderOrders(); return; }
    if(b.dataset.oinv){ var oi=orderOf(b.dataset.oinv); if(!LIVE||oi.demo){ toast('يعمل على الموقع المنشور',true); return; } b.disabled=true;
      fetch(API+'/orders',{method:'PATCH',headers:headers({'content-type':'application/json'}),body:JSON.stringify({key:oi.key,resendInvoice:b.dataset.kind||'final'})}).then(function(r){ if(!r.ok) throw 0; toast('أُرسلت الفاتورة إلى بريد العميل'); }).catch(function(){ toast('تعذّر الإرسال',true); }).then(function(){ b.disabled=false; }); return; }
    if(b.dataset.osend){ sendMsg(b.dataset.osend, b.closest('.asend').querySelector('textarea').value, b, PEND[b.dataset.osend]); return; }
    if(b.dataset.sendreply){ sendMsg(b.dataset.sendreply, b.closest('.replybox').querySelector('textarea').value, b); return; }
    if(b.dataset.osave){ var box=b.closest('.order'), d=readOrderForm(box), o=orderOf(b.dataset.osave);
      var apply=function(){ if(d.status!==o.status){ (o.history=o.history||[]).push({at:new Date().toISOString(),status:d.status}); } Object.assign(o,d); renderOrders(); toast('حُفظ الطلب'); };
      if(!LIVE||o.demo){ apply(); return; }
      d.key=o.key;
      fetch(API+'/orders',{method:'PATCH',headers:headers({'content-type':'application/json'}),body:JSON.stringify(d)}).then(function(r){ if(!r.ok) throw 0; return r.json(); })
        .then(function(j){ Object.assign(o,j.order||d); renderOrders(); toast('حُفظ الطلب'); }).catch(function(){ toast('تعذّر الحفظ',true); });
      return; }
    if(b.dataset.reply){ var o2=orderOf(b.dataset.ok), box2=b.closest('.order'), d2=readOrderForm(box2), oo=Object.assign({},o2,d2);
      var lang=o2.lang==='en'?'en':'ar', T=(P&&P.templates&&P.templates[lang])||DEFAULT_TPL[lang];
      var text=fill(T[b.dataset.reply]||'',oo), rb=box2.querySelector('.replybox');
      rb.hidden=false; rb.querySelector('textarea').value=text;
      var a=rb.querySelector('[data-openreply]'), link=contactLink(o2.contact,text); a.hidden=!link; if(link) a.href=link; return; }
    if(b.hasAttribute('data-copyreply')){ var t=b.closest('.replybox').querySelector('textarea'); try{ navigator.clipboard.writeText(t.value).then(function(){toast('نُسخت الرسالة')},function(){t.select()}); }catch(_){ t.select(); } return; }
    if(b.dataset.odel){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد الحذف؟'; return; }
      var key=b.dataset.odel, o3=orderOf(key);
      var rm=function(){ ORDERS=ORDERS.filter(function(x){return x.key!==key}); renderOrders(); };
      if(!LIVE||o3.demo){ rm(); return; }
      fetch(API+'/orders?key='+encodeURIComponent(key),{method:'DELETE',headers:headers({})}).then(function(r){ if(!r.ok) throw 0; rm(); }).catch(function(){ toast('تعذّر الحذف',true); }); }
  });

  // new requests and client messages arrive without reloading (skipped while you are typing in an order)
  setInterval(function(){ if(!LIVE||document.hidden) return; var a=document.activeElement; if(TAB==='orders'&&a&&a.closest&&a.closest('.order')) return; loadOrders(); },30000);

  /* ---------------- layout + look ---------------- */
  var SECN={stats:'خانة الأرقام',services:'الخدمات',work:'الأعمال',packages:'الباقات',reviews:'آراء العملاء',cta:'دعوة التواصل'};
  var NAVN={services:'الخدمات',work:'أعمالنا',pricing:'الباقات',about:'من نحن',contact:'تواصل'};
  var ACCENTS=[['cyan','سماوي (الأساسي)','#3FE0E8','#8B5CFF'],['violet','بنفسجي','#A78BFA','#5B7CFF'],['gold','ذهبي','#F5C66B','#E0833F'],['rose','وردي','#FF7AB6','#8B5CFF'],['mint','نعناعي','#5EF0B0','#2E9BFF']];
  function LY(){ var d=(window.EB_SEED&&EB_SEED.layout)||{home:[],nav:[]}; C.layout=C.layout||JSON.parse(JSON.stringify(d)); C.layout.home=C.layout.home||[]; C.layout.nav=C.layout.nav||[];
    if((C.layout.v||0)<2){ C.layout.home.forEach(function(s){ if(/^(services|work|packages|reviews)$/.test(s.id)) s.show=false; }); C.layout.v=2; }
    d.home.forEach(function(s){ if(!C.layout.home.some(function(x){return x.id===s.id})) C.layout.home.push({id:s.id,show:true}); });
    d.nav.forEach(function(s){ if(!C.layout.nav.some(function(x){return x.id===s.id})) C.layout.nav.push({id:s.id,show:true,label:{ar:'',en:''}}); }); return C.layout; }
  function renderLayout(){
    var L=LY();
    var row=function(list,i,name,extra){ var it=L[list][i]; return '<div class="lrow"><label class="check"><input type="checkbox" data-lshow="'+list+':'+i+'"'+(it.show!==false?' checked':'')+'> <b>'+esc(name)+'</b></label>'+(extra||'')+
      '<span class="lmove"><button class="btn sm" type="button" data-lmove="'+list+':'+i+':-1" aria-label="أعلى">↑</button><button class="btn sm" type="button" data-lmove="'+list+':'+i+':1" aria-label="أسفل">↓</button></span></div>'; };
    $('#panel').innerHTML=
      '<section class="sec"><h3>ترتيب أقسام الصفحة الرئيسية</h3><p class="hint">من الأعلى للأسفل تحت الواجهة. أزل العلامة لإخفاء القسم. «آراء العملاء» يظهر فقط حين يوجد تقييم معتمد.</p><div class="lgrid">'+
        L.home.map(function(s,i){ return row('home',i,SECN[s.id]||s.id); }).join('')+'</div></section>'+
      '<section class="sec"><h3>القائمة العلوية وأسفل الصفحة</h3><p class="hint">الترتيب والأسماء. اترك الاسم فارغاً ليبقى الافتراضي. الرئيسية وزر «ابدأ مشروعك» ثابتان.</p><div class="lgrid">'+
        L.nav.map(function(n,i){ var lb=n.label||{}; return row('nav',i,NAVN[n.id]||n.id,'<span class="lnames"><input data-p="layout.nav.'+i+'.label.ar" data-t="text" placeholder="'+esc(NAVN[n.id]||'')+'" value="'+esc(lb.ar||'')+'"><input data-p="layout.nav.'+i+'.label.en" data-t="text" dir="ltr" placeholder="English" value="'+esc(lb.en||'')+'"></span>'); }).join('')+'</div></section>'+
      '<section class="sec"><h3>اللون المميّز</h3><p class="hint">يغيّر لون الروابط والإضاءات والأزرار الثانوية في كل الموقع.</p><div class="accents">'+
        ACCENTS.map(function(a){ return '<label class="acc'+((L.accent||'cyan')===a[0]?' on':'')+'"><input type="radio" name="acc" value="'+a[0]+'"'+((L.accent||'cyan')===a[0]?' checked':'')+' data-lacc hidden><i style="background:linear-gradient(135deg,'+a[2]+','+a[3]+')"></i>'+a[1]+'</label>'; }).join('')+'</div></section>'+
      '<section class="sec"><h3>عناصر بصرية</h3>'+
        '<label class="check"><input type="checkbox" data-ltog="intro"'+(L.intro!==false?' checked':'')+'> مقدّمة فتح العين عند أول زيارة</label>'+
        '<label class="check"><input type="checkbox" data-ltog="particles"'+(L.particles!==false?' checked':'')+'> خلفية الجزيئات المتحركة</label>'+
        '<label class="check"><input type="checkbox" data-ltog="countUp"'+(L.countUp!==false?' checked':'')+'> عدّاد الأرقام (يعدّ من الصفر عند ظهور الخانات)</label>'+
        ''+
        '<div class="field"><label>خانة التواصل أسفل الصفحات</label><select data-lsel="cta">'+[['aurora','بلون خاص (أورورا)'],['glass','زجاجية مثل باقي الخانات']].map(function(o){return '<option value="'+o[0]+'"'+((L.cta||'aurora')===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select></div>'+
        '<p class="hint" style="margin-top:8px">التغييرات تظهر بعد «نشر التعديلات». استخدم «معاينة» لتراها قبل النشر.</p></section>';
  }
  document.addEventListener('change',function(e){ var el=e.target; if(TAB!=='layout'||!C) return; var L=LY();
    if(el.dataset.lshow){ var q=el.dataset.lshow.split(':'); L[q[0]][+q[1]].show=el.checked; dirty(); saveDraft(); }
    else if(el.hasAttribute('data-lacc')){ L.accent=el.value; dirty(); saveDraft(); renderLayout(); }
    else if(el.dataset.ltog){ L[el.dataset.ltog]=el.checked; dirty(); saveDraft(); }
    else if(el.dataset.lsel){ L[el.dataset.lsel]=el.value; dirty(); saveDraft(); } });
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-lmove]'); if(!b) return; var q=b.dataset.lmove.split(':'), arr=LY()[q[0]], i=+q[1], j=i+(+q[2]);
    if(j<0||j>=arr.length) return; var x=arr[i]; arr[i]=arr[j]; arr[j]=x; dirty(); saveDraft(); renderLayout(); });

  /* ---------------- projects & tasks (client workspace) ---------------- */
  var WORK=null, WOPEN=null, WF={status:'',client:'',project:''}, WPEDIT=null;
  var WST={new:'طلب جديد',review:'قيد المراجعة',info:'بانتظار معلومات العميل',accepted:'تم القبول',progress:'قيد التنفيذ',feedback:'بانتظار الملاحظات',revision:'تعديلات مطلوبة',final:'التسليم النهائي',completed:'مكتملة',rejected:'مرفوضة',cancelled:'ملغاة'};
  var WOPENST=['new','review','info','accepted','progress','feedback','revision','final'];
  var WPT={once:'مشروع لمرة واحدة',monthly:'تعاون شهري',campaign:'حملة إعلانية',content:'إدارة محتوى',editing:'مونتاج فيديوهات',motion:'موشن غرافيك',commercial:'إنتاج تجاري',custom:'مشروع مخصص'};
  var WPS={active:'نشط',paused:'متوقف مؤقتاً',completed:'منتهٍ',archived:'مؤرشف'};
  var WPR={normal:'عادية',high:'عالية',urgent:'عاجلة'};
  var WDS={sent:'بانتظار رد العميل',approved:'وافق العميل',changes:'طلب تعديلات',superseded:'نسخة أقدم'};
  var WFC={brand:'الهوية البصرية',raw:'مواد خام',reference:'مراجع',document:'مستندات',other:'أخرى'};
  var WSPACE=null;
  function loadSpace(id){ id=id||(WSPACE&&WSPACE.id); if(!id) return; WSPACE={id:id,loading:1}; renderWork();
    fetch(API+'/work?admin=1&space='+encodeURIComponent(id),{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ WSPACE=j.ok?{id:id,d:j}:{id:id,err:1}; renderWork(); var el=document.getElementById('wspace'); if(el) el.scrollIntoView({block:'start',behavior:'smooth'}); }).catch(function(){ WSPACE={id:id,err:1}; renderWork(); }); }
  function wcomments(list,composer){ return '<div class="wcl">'+((list||[]).length?list.map(function(c){ var st=c.author==='studio';
      return '<div class="wcm'+(st?' st':'')+'"><div class="small"><b>'+esc(st?'أنت (الاستوديو)':c.author_name||c.author)+'</b> <span class="muted">· '+esc(new Date(c.created_at).toLocaleString('ar'))+'</span> <button class="linkbtn small" type="button" data-wcmd="'+esc(c.id)+'">حذف</button></div>'+
        '<pre>'+esc(c.body)+'</pre>'+((c.links||[]).length?'<div>'+wlinks(c.links)+'</div>':'')+'</div>'; }).join(''):'<div class="small muted">لا توجد تعليقات بعد.</div>')+'</div>'+composer; }
  function wcomposer(attr){ return '<div class="wcmp"><textarea data-wcm dir="auto" placeholder="اكتب رداً أو تعليقاً — يصل إلى العميل بالبريد الإلكتروني"></textarea><div class="row"><div class="field"><input data-wcml dir="ltr" placeholder="رابط (اختياري)"></div><div class="field"><button class="btn sm primary" type="button" '+attr+'>إرسال التعليق</button></div></div></div>'; }
  function wdelivs(t){ var L=WORK.deliverables||[], can=['accepted','progress','revision','feedback','final'].indexOf(t.status)>=0, next=(L.length?L[0].version:0)+1;
    var rounds=L.filter(function(d){return d.status==='changes'}).length;
    return '<div class="wdv"><div class="ph"><b>التسليمات'+(rounds?' · جولة التعديل '+rounds:'')+'</b></div>'+
      (L.length?L.map(function(d,i){ return '<div class="wdi'+(i===0?' latest':'')+'"><div class="small"><span class="wver'+(d.is_final?' fin':'')+'">'+esc(d.is_final?'Final':d.label)+'</span> <b>'+esc(d.title||t.title)+'</b> · <span class="wpill s-'+(d.status==='sent'?'feedback':d.status==='approved'?'completed':d.status==='changes'?'revision':'cancelled')+'">'+esc(WDS[d.status]||d.status)+'</span> <span class="muted">'+esc(new Date(d.created_at).toLocaleString('ar'))+'</span></div>'+
        '<div>'+wlinks([{url:d.url,label:'افتح الملف'}].concat(d.links||[]))+'</div>'+(d.note?'<div class="small muted">ملاحظتك مع التسليم: '+esc(d.note)+'</div>':'')+
        ((d.points||[]).length?'<div class="small muted" style="margin-top:6px">تعديلات العميل — علّم ما أنجزته منها:</div><ol class="wpts-a">'+d.points.map(function(p,k){ return '<li><label class="check"><input type="checkbox" data-wpd="'+esc(d.id)+'" data-wpi="'+k+'"'+(p.done?' checked':'')+'> '+(p.t?'<span class="tc">'+esc(p.t)+'</span> ':'')+esc(p.text)+'</label></li>'; }).join('')+'</ol>':'')+
        (d.decision_note?'<div class="small">ملاحظة العميل: '+esc(d.decision_note)+'</div>':'')+'</div>'; }).join(''):'<div class="small muted">لا توجد تسليمات بعد.</div>')+
      (can?'<div class="wsend"><div class="small muted">تسليم جديد — سيُحفظ بوصفه <b>V'+next+'</b> (أو Final إن علّمته نهائياً)</div>'+
        '<div class="row"><div class="field"><label>رابط الملف (Google Drive / YouTube / Vimeo…)</label><input data-wdu dir="ltr" placeholder="https://drive.google.com/file/d/…"></div><div class="field"><label>عنوان (اختياري)</label><input data-wdt2 dir="auto" placeholder="'+esc(t.title)+'"></div></div>'+
        '<div class="field"><label>ملاحظة للعميل (اختياري)</label><textarea data-wdn dir="auto" placeholder="مثلاً: هذه النسخة الأولى، والموسيقى مؤقتة."></textarea></div>'+
        '<div class="actions"><label class="check"><input type="checkbox" data-wdf> هذا هو التسليم النهائي (Final)</label><button class="btn sm primary" type="button" data-wdl="'+esc(t.ref)+'">أرسل التسليم للعميل</button></div></div>':'')+'</div>'; }
  function wspacePanel(){ var S=WSPACE; if(!S) return '';
    if(S.loading) return '<section class="sec" id="wspace"><div class="empty">…</div></section>'; if(S.err) return '<section class="sec" id="wspace"><div class="empty">تعذّر التحميل.</div></section>';
    var D=S.d, p=D.project;
    var EV={week:'أسبوعياً',month:'شهرياً'}, DOW=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'], ms=[], dd=new Date(); dd.setUTCDate(1); for(var i=0;i<6;i++){ ms.push(dd.toISOString().slice(0,7)); dd.setUTCMonth(dd.getUTCMonth()-1); }
    var sent={}; (D.sentReports||[]).forEach(function(r){ sent[r.month]=r.at; });
    var recur='<div class="wrecbox"><div class="small muted">المهام الدورية — تُنشأ تلقائياً بحالة «تم القبول» وموعد مؤكد، ويصل العميلَ إشعار بكل واحدة</div>'+
      ((D.recurring||[]).length?D.recurring.map(function(r){ return '<div class="wfi"><b>'+esc(r.title)+'</b> <span class="rpill'+(r.active?' on':'')+'">'+(r.active?'نشطة':'متوقفة')+'</span> <span class="small muted">'+EV[r.every]+' · '+(r.every==='week'?DOW[r.dow||0]:'يوم '+(r.dom||1))+' · التسليم بعد '+r.due_days+' أيام · القادمة '+esc(r.next_run)+(r.runs?' · نُفّذت '+r.runs+' مرة'+(r.last_ref?' (آخرها '+esc(r.last_ref)+')':''):'')+'</span> '+
        '<button class="linkbtn small" type="button" data-rrun="'+esc(r.id)+'">شغّلها الآن</button> <button class="linkbtn small" type="button" data-rtog="'+esc(r.id)+'">'+(r.active?'إيقاف':'تفعيل')+'</button> <button class="linkbtn small" type="button" data-rdel="'+esc(r.id)+'">حذف</button></div>'; }).join(''):'<div class="small muted">لا توجد مهام دورية.</div>')+
      '<div class="row"><div class="field"><label>عنوان المهمة</label><input data-rt dir="auto" placeholder="مثلاً: ريلز الأسبوع"></div><div class="field"><label>النوع (اختياري)</label><input data-rty dir="auto"></div></div>'+
      '<div class="row"><div class="field"><label>التكرار</label><select data-rev><option value="week">أسبوعياً</option><option value="month">شهرياً</option></select></div><div class="field"><label>اليوم (للأسبوعي)</label><select data-rdow>'+DOW.map(function(x,i){ return '<option value="'+i+'">'+x+'</option>'; }).join('')+'</select></div>'+
        '<div class="field"><label>يوم الشهر (للشهري)</label><input data-rdom type="number" min="1" max="28" value="1"></div><div class="field"><label>التسليم بعد (أيام)</label><input data-rdue type="number" min="0" max="90" value="5"></div><div class="field"><label>تبدأ من</label><input data-rstart type="date" value="'+esc(WORK.today||'')+'"></div></div>'+
      '<div class="field"><label>الوصف (اختياري)</label><textarea data-rdesc dir="auto"></textarea></div><div class="actions"><button class="btn sm primary" type="button" data-radd="'+esc(p.id)+'">أضف المهمة الدورية</button></div></div>';
    var rep='<div class="wrecbox"><div class="small muted">التقرير الشهري'+(p.auto_report?' — يُرسل تلقائياً أول كل شهر':'')+'</div><div class="row"><div class="field"><select data-rmonth>'+ms.map(function(m){ return '<option value="'+m+'">'+m+(sent[m]?' — أُرسل':'')+'</option>'; }).join('')+'</select></div>'+
      '<div class="field"><div class="actions"><button class="btn sm" type="button" data-rprev="'+esc(p.id)+'">معاينة</button><button class="btn sm primary" type="button" data-rsend="'+esc(p.id)+'">أرسله للعميل</button></div></div></div>'+
      (D.quota_used!==undefined&&p.quota?'<div class="small">الحصة هذا الشهر: <b>'+D.quota_used+' من '+p.quota+'</b></div>':'')+(S.prev?'<iframe class="bprev" title="معاينة التقرير" srcdoc="'+esc(S.prev)+'"></iframe>':'')+'</div>';
    return '<section class="sec" id="wspace"><div class="ph"><h3>'+esc(p.name)+' — النقاش والملفات والجدول</h3><button class="btn sm" type="button" data-wspx>إغلاق</button></div>'+
      '<div class="wsp2">'+recur+rep+'</div>'+
      '<div class="wsp2"><div><div class="small muted">نقاش المشروع</div>'+wcomments(D.comments,wcomposer('data-wpcm="'+esc(p.id)+'"'))+'</div>'+
      '<div><div class="small muted">مركز الملفات</div><div class="wfl2">'+((D.files||[]).length?D.files.map(function(f){ return '<div class="wfi"><span class="tag">'+esc(WFC[f.category]||f.category)+'</span> '+wlinks([{url:f.url,label:f.title}])+' <span class="small muted">'+esc(f.added_by==='studio'?'أنت':f.added_name)+' · '+esc(new Date(f.created_at).toLocaleDateString('ar'))+'</span> <button class="linkbtn small" type="button" data-wfd="'+esc(f.id)+'">حذف</button>'+(f.note?'<div class="small muted">'+esc(f.note)+'</div>':'')+'</div>'; }).join(''):'<div class="small muted">لا توجد ملفات مضافة.</div>')+
        ((D.delivered||[]).length?'<div class="small muted" style="margin-top:8px">التسليمات ('+D.delivered.length+')</div>'+D.delivered.map(function(d){ return '<div class="wfi"><span class="wver'+(d.is_final?' fin':'')+'">'+esc(d.is_final?'Final':d.label)+'</span> '+wlinks([{url:d.url,label:(d.title||d.task_title)}])+' <span class="small muted">'+esc(d.ref)+'</span></div>'; }).join(''):'')+'</div>'+
        '<div class="row"><div class="field"><label>التصنيف</label><select data-wfc>'+Object.keys(WFC).map(function(k){ return '<option value="'+k+'">'+WFC[k]+'</option>'; }).join('')+'</select></div><div class="field"><label>الاسم</label><input data-wft dir="auto"></div></div>'+
        '<div class="field"><label>الرابط</label><input data-wfu dir="ltr" placeholder="https://"></div><div class="actions"><button class="btn sm primary" type="button" data-wfa="'+esc(p.id)+'">أضف الملف للعميل</button></div></div></div></section>'; }
  function loadWork(){
    if(!LIVE){ WORK={err:'live'}; if(TAB==='tasks') renderWork(); return; }
    var q='?admin=1'+(WOPEN?'&task='+encodeURIComponent(WOPEN):'');
    fetch(API+'/work'+q,{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json().then(function(j){ j._s=r.status; return j; }); })
      .then(function(j){ WORK= j.ok? j : {err:j.error||'fail'}; renderTabs(); if(TAB==='tasks') renderWork(); }).catch(function(){ WORK={err:'net'}; if(TAB==='tasks') renderWork(); });
  }
  function wreq(body,btn,ok){
    if(btn) btn.disabled=true;
    return fetch(API+'/work',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify(body)}).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'fail'); return j; }); })
      .then(function(j){ if(ok) toast(ok); loadWork(); return j; })
      .catch(function(e){ if(btn) btn.disabled=false; toast(({date:'اختر تاريخاً صحيحاً',note:'اكتب المعلومات المطلوبة','not client':'هذا العميل ليس متعاقداً بعد — رقِّه أولاً من تبويب العملاء','no account':'لا يوجد حساب بهذا البريد',name:'اكتب اسم المشروع','date first':'حدّد الموعد المؤكد أولاً','no request':'لم يعد الطلب موجوداً'})[e.message]||'تعذّر التنفيذ',true); throw e; });
  }
  function wd(s){ if(!s) return '—'; try{ return new Date(s.length===10?s+'T12:00:00Z':s).toLocaleDateString('ar-u-nu-latn',{day:'numeric',month:'short',year:'numeric'}); }catch(_){ return s; } }
  function wlinks(ls){ return (ls||[]).map(function(l){ return '<a class="adoc" href="'+esc(l.url)+'" target="_blank" rel="noopener noreferrer">↗ '+esc(l.label||l.url.replace(/^https?:\/\//,'').slice(0,50))+'</a>'; }).join(' '); }
  function wpill(s){ return '<span class="wpill s-'+esc(s)+'">'+esc(WST[s]||s)+'</span>'; }
  function wtaskBody(t){
    var cr=t.change_request, cn=(WORK.clients||[]).filter(function(c){return c.email===t.client_email})[0];
    return '<div class="wtb"><div class="small muted">'+esc(cn?cn.name:t.client_email)+' · '+esc(t.project_name)+(t.type?' · '+esc(t.type):'')+(t.priority!=='normal'?' · <b class="pr-'+esc(t.priority)+'">أولوية '+esc(WPR[t.priority])+'</b>':'')+'</div>'+
      '<div class="wdd"><div><span>الموعد المطلوب (من العميل)</span><b>'+esc(wd(t.requested_date))+'</b></div><div class="'+(t.confirmed_date?'ok':'')+'"><span>الموعد المؤكد (منك)</span><b>'+esc(wd(t.confirmed_date))+'</b></div></div>'+
      (t.recurring||t.over_quota?'<div>'+(t.recurring?'<span class="tag">مهمة دورية</span> ':'')+(t.over_quota?'<span class="tag pr-urgent">خارج الحصة الشهرية</span>':'')+'</div>':'')+
      (t.brief?'<div class="small muted">الموجز الإبداعي</div><div class="wbr">'+Object.keys(t.brief).map(function(k){ return '<div><span class="small muted">'+esc({goal:'الهدف',audience:'الجمهور',format:'المقاس',duration:'المدة',tone:'الأسلوب',message:'الرسالة',cta:'الدعوة لإجراء',music:'الموسيقى'}[k]||k)+'</span><b>'+esc(t.brief[k])+'</b></div>'; }).join('')+'</div>':'')+
      (t.description?'<div class="small muted">الوصف</div><pre>'+esc(t.description)+'</pre>':'')+(t.details?'<div class="small muted">التفاصيل</div><pre>'+esc(t.details)+'</pre>':'')+
      (t.notes?'<div class="small muted">تعليمات إضافية</div><pre>'+esc(t.notes)+'</pre>':'')+((t.links||[]).length?'<div class="small muted">الروابط</div><div>'+wlinks(t.links)+'</div>':'')+
      (t.studio_note?'<div class="small muted">آخر ملاحظة منك للعميل</div><pre>'+esc(t.studio_note)+'</pre>':'')+
      (cr&&cr.status==='pending'?'<div class="wcr"><b>⏳ العميل طلب تغيير الموعد إلى '+esc(wd(cr.date))+'</b>'+(cr.reason?'<div class="small">'+esc(cr.reason)+'</div>':'')+
        '<div class="actions"><button class="btn sm primary" type="button" data-wdd="'+esc(t.ref)+'" data-ok="1">موافقة على '+esc(wd(cr.date))+'</button><button class="btn sm" type="button" data-wdd="'+esc(t.ref)+'" data-ok="0">إبقاء الموعد الحالي</button></div></div>':'')+
      (t.status==='new'||t.status==='review'||t.status==='info'?
        '<div class="wrev"><div class="ph"><b>مراجعة الطلب</b>'+(t.status==='new'?'<button class="btn sm" type="button" data-wrv="'+esc(t.ref)+'">علّمها «قيد المراجعة»</button>':'')+'</div>'+
        '<div class="row"><div class="field"><label>الموعد المؤكد للتسليم</label><input type="date" data-wcd value="'+esc(t.confirmed_date||t.requested_date||'')+'"></div><div class="field"><label>ملاحظة للعميل (اختياري)</label><input data-wnote dir="auto"></div></div>'+
        '<div class="actions"><button class="btn sm primary" type="button" data-wacc="'+esc(t.ref)+'">قبول وتأكيد الموعد</button></div>'+
        '<div class="field"><label>أو اطلب معلومات / ملفات ناقصة</label><textarea data-winfo dir="auto" placeholder="مثلاً: أرسل إلينا الشعار بجودة عالية ورابط الفيديوهات الخام."></textarea></div><div class="actions"><button class="btn sm" type="button" data-winq="'+esc(t.ref)+'">أرسل طلب المعلومات</button></div>'+
        '<div class="field"><label>أو ارفض مع سبب</label><textarea data-wrej dir="auto"></textarea></div><div class="actions"><button class="btn sm danger" type="button" data-wrjt="'+esc(t.ref)+'">رفض المهمة</button></div></div>'
      : (t.status!=='rejected'&&t.status!=='cancelled'?
        '<div class="row"><div class="field"><label>الحالة</label><select data-wst>'+['accepted','progress','feedback','revision','final','completed','cancelled'].map(function(s){ return '<option value="'+s+'"'+(s===t.status?' selected':'')+'>'+WST[s]+'</option>'; }).join('')+'</select></div>'+
        '<div class="field"><label>ملاحظة للعميل مع التحديث (اختياري)</label><input data-wnote2 dir="auto"></div></div><div class="actions"><button class="btn sm primary" type="button" data-wsts="'+esc(t.ref)+'">حفظ الحالة</button></div>'+
        '<div class="row"><div class="field"><label>تغيير الموعد المؤكد</label><input type="date" data-wcd2 value="'+esc(t.confirmed_date||'')+'"></div><div class="field"><label>&nbsp;</label><button class="btn sm" type="button" data-wdt="'+esc(t.ref)+'">حفظ الموعد وإبلاغ العميل</button></div></div>' : ''))+
      (WOPEN===t.ref&&['new','review','info','rejected','cancelled'].indexOf(t.status)<0?wdelivs(t):'')+
      (WOPEN===t.ref?'<div class="small muted" style="margin-top:8px">التعليقات ('+(WORK.comments||[]).length+')</div>'+wcomments(WORK.comments,wcomposer('data-wtcm="'+esc(t.ref)+'"')):'')+
      (WOPEN===t.ref&&(WORK.activity||[]).length?'<div class="small muted" style="margin-top:8px">سجل المهمة</div><div class="wlog small">'+WORK.activity.map(function(a){ var d=a.data||{};
        var w=a.kind==='status'?'الحالة ← '+(WST[d.to]||d.to)+(d.confirmed_date?' · الموعد '+wd(d.confirmed_date):''):a.kind==='task_created'?'أرسل المهمة':a.kind==='date_changed'?'الموعد ← '+wd(d.to):a.kind==='info_provided'?'أرسل المعلومات: '+(d.text||''):a.kind==='date_change_requested'?'طلب تغيير الموعد إلى '+wd(d.date):a.kind==='date_change_decided'?(d.approved?'وافقت على الموعد '+wd(d.to):'أبقيت الموعد'):
          a.kind==='delivered'?'سلّم '+(d.final?'Final':d.label):a.kind==='approved'?'وافق على '+(d.final?'التسليم النهائي':d.label):a.kind==='changes_requested'?'طلب تعديلات على '+d.label+' ('+(d.points||0)+' نقاط)':
          a.kind==='comment'?'علّق: '+(d.text||''):a.kind==='file_added'?'أضاف ملف «'+(d.title||'')+'»':a.kind;
        return '<div>'+esc(new Date(a.at).toLocaleString('ar'))+' · <b>'+esc(a.actor==='studio'?'أنت':a.actor_name)+'</b> · '+esc(w)+(d.note?' — '+esc(d.note):'')+'</div>'; }).join('')+'</div>':'')+'</div>';
  }
  function wtaskCard(t){ return '<details class="order item wt" data-wref="'+esc(t.ref)+'"'+(WOPEN===t.ref?' open':'')+'><summary><span class="chev">‹</span><span class="code">'+esc(t.ref)+'</span>'+wpill(t.status)+'<b>'+esc(t.title)+'</b><span class="muted small">'+esc(t.project_name)+' · المطلوب '+esc(wd(t.requested_date))+(t.confirmed_date?' · المؤكد '+esc(wd(t.confirmed_date)):'')+'</span></summary><div class="body">'+wtaskBody(t)+'</div></details>'; }
  function projForm(p){ p=p||{}; var svc=C.services||[], cl=WORK.clients||[];
    return '<form class="wpf" data-wpid="'+esc(p.id||'')+'"><div class="row"><div class="field"><label>العميل المتعاقد</label><select name="client_email">'+(cl.length?'':'<option value="">لا يوجد عملاء متعاقدون بعد</option>')+cl.map(function(c){ return '<option value="'+esc(c.email)+'"'+(c.email===p.client_email?' selected':'')+'>'+esc(c.name)+' — '+esc(c.email)+'</option>'; }).join('')+'</select></div>'+
      '<div class="field"><label>اسم المشروع</label><input name="name" value="'+esc(p.name||'')+'" required></div></div>'+
      '<div class="row"><div class="field"><label>النوع</label><select name="type">'+Object.keys(WPT).map(function(k){ return '<option value="'+k+'"'+(k===(p.type||'monthly')?' selected':'')+'>'+WPT[k]+'</option>'; }).join('')+'</select></div>'+
      '<div class="field"><label>الحالة</label><select name="status">'+Object.keys(WPS).map(function(k){ return '<option value="'+k+'"'+(k===(p.status||'active')?' selected':'')+'>'+WPS[k]+'</option>'; }).join('')+'</select></div>'+
      '<div class="field"><label>البداية</label><input type="date" name="start_date" value="'+esc(p.start_date||'')+'"></div><div class="field"><label>النهاية (اختياري)</label><input type="date" name="end_date" value="'+esc(p.end_date||'')+'"></div></div>'+
      '<div class="field"><label>الخدمات المتفق عليها</label><div class="wsvc">'+svc.map(function(s){ return '<label class="check"><input type="checkbox" name="svc" value="'+esc(s.id)+'"'+((p.services||[]).indexOf(s.id)>=0?' checked':'')+'> '+esc((s.name&&s.name.ar)||s.id)+'</label>'; }).join('')+'</div></div>'+
      '<div class="row"><div class="field"><label>الوصف (يظهر للعميل)</label><textarea name="description" dir="auto">'+esc(p.description||'')+'</textarea></div><div class="field"><label>المخرجات المتفق عليها شهرياً (اختياري)</label><input type="number" min="0" name="quota" value="'+esc(p.quota||'')+'"><p class="hint">عدد المهام المتفق عليه شهرياً. يراه العميل، وتُعلَّم المهام الزائدة بـ«خارج الحصة» دون منعها.</p></div></div>'+
      '<div class="row"><div class="field"><label>رابط مجلد المشروع على Google Drive (اختياري)</label><input name="drive_url" dir="ltr" placeholder="https://drive.google.com/drive/folders/…" value="'+esc(p.drive_url||'')+'"></div>'+
        '<div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" name="auto_report"'+(p.auto_report?' checked':'')+'> أرسل التقرير الشهري للعميل تلقائياً أول كل شهر</label></div></div>'+
      '<div class="actions"><button class="btn primary sm" type="submit">'+(p.id?'حفظ المشروع':'إنشاء المشروع')+'</button>'+(p.id?'<button class="btn sm" type="button" data-wpx>إلغاء</button>':'')+'</div></form>'; }
  function renderWork(){
    var W=WORK;
    if(!W){ $('#panel').innerHTML='<section class="sec"><div class="empty">…</div></section>'; if(LIVE) loadWork(); return; }
    if(W.err){ $('#panel').innerHTML='<section class="sec"><h3>المشاريع والمهام</h3><div class="empty">'+(W.err==='db'?'قاعدة البيانات (D1) غير مربوطة بالموقع بعد. اربطها باسم DB من Cloudflare ← Workers & Pages ← المشروع ← Settings ← Bindings.':W.err==='live'?'يعمل هذا القسم على الموقع المنشور.':'تعذّر التحميل.')+'</div></section>'; return; }
    var T=W.tasks||[], td=W.today, cnt=function(f){ return T.filter(f).length; };
    var fresh=T.filter(function(t){ return t.status==='new'||t.status==='review'; }), dates=T.filter(function(t){ return t.change_request&&t.change_request.status==='pending'; });
    var queued=fresh.concat(dates.filter(function(x){return fresh.indexOf(x)<0}));
    var list=T.filter(function(t){ return queued.indexOf(t)<0&&(!WF.status||(WF.status==='open'?WOPENST.indexOf(t.status)>=0:t.status===WF.status))&&(!WF.client||t.client_email===WF.client)&&(!WF.project||t.project_id===WF.project); });
    $('#panel').innerHTML=
      '<section class="sec"><div class="kpis"><div><b>'+cnt(function(t){return t.status==='new'||t.status==='review'})+'</b><span>طلبات جديدة</span></div><div><b>'+cnt(function(t){return ['accepted','progress','revision'].indexOf(t.status)>=0})+'</b><span>قيد التنفيذ</span></div>'+
        '<div><b>'+cnt(function(t){return ['info','feedback','final'].indexOf(t.status)>=0})+'</b><span>بانتظار العميل</span></div><div><b>'+cnt(function(t){return t.confirmed_date&&t.confirmed_date<td&&WOPENST.indexOf(t.status)>=0})+'</b><span>متأخرة</span></div>'+
        '<div><b>'+cnt(function(t){return t.status==='completed'&&(t.completed_at||'').slice(0,7)===td.slice(0,7)})+'</b><span>مكتملة هذا الشهر</span></div><div><b>'+(W.projects||[]).filter(function(p){return p.status==='active'}).length+'</b><span>مشاريع نشطة</span></div></div></section>'+
      (queued.length?'<section class="sec wq"><h3>بانتظار قرارك ('+queued.length+')</h3><p class="hint">حدّد العميل موعداً يرغب فيه، ولا يُعتمد الموعد إلا بعد أن تقبل المهمة وتحدّد «الموعد المؤكد».</p><div class="orders">'+queued.map(wtaskCard).join('')+'</div></section>':'')+
      '<section class="sec"><h3>كل المهام</h3><div class="wfl"><select data-wf="status"><option value="">كل الحالات</option><option value="open"'+(WF.status==='open'?' selected':'')+'>المفتوحة</option>'+Object.keys(WST).map(function(s){ return '<option value="'+s+'"'+(WF.status===s?' selected':'')+'>'+WST[s]+'</option>'; }).join('')+'</select>'+
        '<select data-wf="client"><option value="">كل العملاء</option>'+(W.clients||[]).map(function(c){ return '<option value="'+esc(c.email)+'"'+(WF.client===c.email?' selected':'')+'>'+esc(c.name)+'</option>'; }).join('')+'</select>'+
        '<select data-wf="project"><option value="">كل المشاريع</option>'+(W.projects||[]).map(function(p){ return '<option value="'+esc(p.id)+'"'+(WF.project===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select></div>'+
        (list.length?'<div class="orders">'+list.map(wtaskCard).join('')+'</div>':'<div class="empty">'+(queued.length?'المهام الباقية فوق، بـ«بانتظار قرارك».':'لا مهام هنا.')+'</div>')+'</section>'+
      '<section class="sec"><h3>المشاريع ('+(W.projects||[]).length+')</h3><p class="hint">يربط المشروع عميلاً متعاقداً بمساحة عمله. يرى العميل مشاريعه فقط، ويرسل المهام من داخلها.</p>'+
        ((W.projects||[]).length?'<div class="clients">'+W.projects.map(function(p){ var cn=(W.clients||[]).filter(function(c){return c.email===p.client_email})[0];
          return '<div class="client"'+(WPEDIT===p.id?' data-editing':'')+'>'+(WPEDIT===p.id?projForm(p):'<div><b>'+esc(p.name)+'</b> <span class="rpill'+(p.status==='active'?' on':'')+'">'+esc(WPS[p.status]||p.status)+'</span> <span class="muted small">'+esc(WPT[p.type]||p.type)+' · '+esc(cn?cn.name:p.client_email)+'</span></div>'+
            '<span class="muted small">'+(p.quota?'الحصة: '+(p.month_tasks||0)+' من '+p.quota+' هذا الشهر · ':'')+p.open_tasks+' مفتوحة من '+p.all_tasks+(p.start_date?' · من '+esc(wd(p.start_date)):'')+(p.end_date?' إلى '+esc(wd(p.end_date)):'')+'</span><div class="actions"><button class="btn sm" type="button" data-wpe="'+esc(p.id)+'">تعديل</button><button class="btn sm" type="button" data-wpt="'+esc(p.id)+'">مهامه</button><button class="btn sm" type="button" data-wsp="'+esc(p.id)+'">النقاش والملفات والجدول</button></div>')+'</div>'; }).join('')+'</div>':'')+
        '<div class="small muted" style="margin-top:14px">مشروع جديد</div>'+projForm(null)+'</section>'+wspacePanel()+
      '<section class="sec"><h3>إعدادات نموذج المهمة</h3><p class="hint">تظهر أنواع المهام للعميل على شكل اقتراحات، وأسماء الأولويات قابلة للتعديل. تُحفظ مع «نشر التعديلات».</p>'+
        field(C,{p:'workspace.taskTypes',t:'bilist',l:'أنواع المهام',hint:'كل نوع بسطر'})+'<div class="row">'+['normal','high','urgent'].map(function(k){ return field(C,{p:'workspace.priorities.'+k,t:'bi',l:'اسم الأولوية: '+WPR[k]}); }).join('')+'</div></section>';
    if(WOPEN){ var op=document.querySelector('[data-wref="'+WOPEN+'"]'); if(op){ op.open=true; setTimeout(function(){ op.scrollIntoView({block:'start',behavior:'smooth'}); },80); } }
  }
  document.addEventListener('toggle',function(e){ var d=e.target; if(!d.dataset||!d.dataset.wref||!d.open) return; if(WOPEN!==d.dataset.wref){ WOPEN=d.dataset.wref; try{ history.replaceState(null,'','#tasks/'+WOPEN); }catch(_){} loadWork(); } },true);
  document.addEventListener('change',function(e){ var s=e.target; if(TAB!=='tasks') return;
    if(s.dataset.wpd){ fetch(API+'/work',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({action:'point',deliverable:s.dataset.wpd,index:+s.dataset.wpi,done:s.checked})}).then(function(r){ if(!r.ok) throw 0; toast(s.checked?'تم ✓':'رجعت مفتوحة'); }).catch(function(){ s.checked=!s.checked; toast('تعذّر الحفظ',true); }); return; }
    if(!s.dataset.wf) return; WF[s.dataset.wf]=s.value; renderWork(); });
  document.addEventListener('submit',function(e){ var f=e.target; if(!f.classList.contains('wpf')) return; e.preventDefault(); var E=f.elements;
    var body={action:'project',id:f.dataset.wpid||undefined,client_email:E.client_email.value,name:E.name.value.trim(),type:E.type.value,status:E.status.value,start_date:E.start_date.value,end_date:E.end_date.value,
      description:E.description.value.trim(),quota:E.quota.value,drive_url:E.drive_url.value.trim(),auto_report:E.auto_report.checked,services:[].map.call(f.querySelectorAll('input[name=svc]:checked'),function(i){return i.value})};
    wreq(body,f.querySelector('button[type=submit]'),f.dataset.wpid?'حُفظ المشروع':'أُنشئ المشروع وأُرسل بريد إلى العميل').then(function(){ WPEDIT=null; }).catch(function(){}); });
  document.addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b||TAB!=='tasks') return; var box=b.closest('.wtb');
    if(b.dataset.wpe){ WPEDIT=b.dataset.wpe; renderWork(); return; }
    if(b.hasAttribute('data-wpx')){ WPEDIT=null; renderWork(); return; }
    if(b.dataset.wpt){ WF={status:'',client:'',project:b.dataset.wpt}; renderWork(); return; }
    if(b.dataset.wsp){ loadSpace(b.dataset.wsp); return; }
    if(b.dataset.radd){ var sp=b.closest('#wspace'), g=function(k){ return sp.querySelector('[data-'+k+']'); }; if(!g('rt').value.trim()){ toast('اكتب عنوان المهمة',true); return; }
      wreq({action:'recurring',project_id:b.dataset.radd,title:g('rt').value.trim(),type:g('rty').value.trim(),description:g('rdesc').value.trim(),every:g('rev').value,dow:g('rdow').value,dom:g('rdom').value,due_days:g('rdue').value,start:g('rstart').value},b,'أُضيفت المهمة الدورية').then(function(){ loadSpace(); }).catch(function(){}); return; }
    if(b.dataset.rrun){ wreq({action:'recurringRun',id:b.dataset.rrun},b,'أُنشئت المهمة وأُبلغ العميل').then(function(){ loadSpace(); }).catch(function(){}); return; }
    if(b.dataset.rtog){ var r=(WSPACE.d.recurring||[]).filter(function(x){return x.id===b.dataset.rtog})[0]; if(!r) return;
      wreq({action:'recurring',id:r.id,project_id:r.project_id,title:r.title,type:r.type,description:r.description,every:r.every,dow:r.dow,dom:r.dom,due_days:r.due_days,active:!r.active},b,r.active?'أُوقفت':'فُعّلت').then(function(){ loadSpace(); }).catch(function(){}); return; }
    if(b.dataset.rdel){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='متأكد؟'; return; } wreq({action:'recurringDelete',id:b.dataset.rdel},b,'حُذفت').then(function(){ loadSpace(); }).catch(function(){}); return; }
    if(b.dataset.rprev){ var mo=b.closest('#wspace').querySelector('[data-rmonth]').value;
      fetch(API+'/work?admin=1&reportDoc='+encodeURIComponent(b.dataset.rprev)+'&month='+mo,{headers:headers({}),cache:'no-store'}).then(function(r){ return r.text(); }).then(function(t){ WSPACE.prev=t; renderWork(); }); return; }
    if(b.dataset.rsend){ var mo2=b.closest('#wspace').querySelector('[data-rmonth]').value; wreq({action:'sendReport',project:b.dataset.rsend,month:mo2},b,'أُرسل التقرير إلى العميل').then(function(){ loadSpace(); }).catch(function(){}); return; }
    if(b.hasAttribute('data-wspx')){ WSPACE=null; renderWork(); return; }
    if(b.dataset.wdl){ var u=box.querySelector('[data-wdu]').value.trim(); if(!/^https?:\/\//i.test(u)){ toast('أدخل رابط الملف (يبدأ بـ https://)',true); return; }
      var fin=box.querySelector('[data-wdf]').checked;
      wreq({action:'deliver',task:b.dataset.wdl,url:u,title:box.querySelector('[data-wdt2]').value.trim(),note:box.querySelector('[data-wdn]').value.trim(),final:fin},b,fin?'أُرسل التسليم النهائي إلى العميل':'أُرسلت النسخة إلى العميل').catch(function(){}); return; }
    if(b.dataset.wtcm||b.dataset.wpcm){ var cb=b.closest('.wcmp'), txt=cb.querySelector('[data-wcm]').value.trim(), lu=cb.querySelector('[data-wcml]').value.trim();
      if(!txt&&!/^https?:\/\//i.test(lu)){ toast('اكتب التعليق',true); return; }
      var body={action:'studioComment',scope:b.dataset.wtcm?'task':'project',body:txt,links:/^https?:\/\//i.test(lu)?[{url:lu}]:[]}; if(b.dataset.wtcm) body.task=b.dataset.wtcm; else body.project=b.dataset.wpcm;
      wreq(body,b,'أُرسل التعليق').then(function(){ if(b.dataset.wpcm) loadSpace(); }).catch(function(){}); return; }
    if(b.dataset.wcmd||b.dataset.wfd){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='متأكد؟'; return; }
      wreq({action:b.dataset.wcmd?'removeComment':'removeFile',id:b.dataset.wcmd||b.dataset.wfd},b,'حُذف').then(function(){ if(WSPACE) loadSpace(); }).catch(function(){}); return; }
    if(b.dataset.wfa){ var sp=b.closest('#wspace'), fu=sp.querySelector('[data-wfu]').value.trim(); if(!/^https?:\/\//i.test(fu)){ toast('أدخل رابطاً يبدأ بـ https://',true); return; }
      wreq({action:'studioFile',project:b.dataset.wfa,category:sp.querySelector('[data-wfc]').value,title:sp.querySelector('[data-wft]').value.trim(),url:fu},b,'أُضيف الملف').then(function(){ loadSpace(); }).catch(function(){}); return; }
    if(b.dataset.wrv){ wreq({action:'review',task:b.dataset.wrv,decision:'review'},b,'أصبحت «قيد المراجعة»').catch(function(){}); return; }
    if(b.dataset.wacc){ var cd=box.querySelector('[data-wcd]').value; if(!cd){ toast('حدّد الموعد المؤكد',true); return; }
      wreq({action:'review',task:b.dataset.wacc,decision:'accept',confirmed_date:cd,note:box.querySelector('[data-wnote]').value.trim()},b,'قُبلت المهمة وأُبلغ العميل بالموعد المؤكد').catch(function(){}); return; }
    if(b.dataset.winq){ wreq({action:'review',task:b.dataset.winq,decision:'info',note:box.querySelector('[data-winfo]').value.trim()},b,'وصل للعميل طلب المعلومات').catch(function(){}); return; }
    if(b.dataset.wrjt){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='هل أنت متأكد؟ اضغط مرة أخرى'; return; }
      wreq({action:'review',task:b.dataset.wrjt,decision:'reject',note:box.querySelector('[data-wrej]').value.trim()},b,'رُفضت المهمة وأُبلغ العميل بالسبب').catch(function(){}); return; }
    if(b.dataset.wsts){ wreq({action:'status',task:b.dataset.wsts,status:box.querySelector('[data-wst]').value,note:box.querySelector('[data-wnote2]').value.trim()},b,'حُفظت الحالة').catch(function(){}); return; }
    if(b.dataset.wdt){ wreq({action:'date',task:b.dataset.wdt,confirmed_date:box.querySelector('[data-wcd2]').value},b,'تغيّر الموعد ووصل للعميل').catch(function(){}); return; }
    if(b.dataset.wdd){ wreq({action:'dateDecision',task:b.dataset.wdd,approve:b.dataset.ok==='1'},b,b.dataset.ok==='1'?'تأكد الموعد الجديد':'بقي الموعد كما هو').catch(function(){}); return; }
  });

  /* ---------------- notifications: studio inbox, send log, WhatsApp setup ---------------- */
  var NOTI=null, NF={channel:'',status:''}, WATEST='';
  var NKIND={accept:'قبول مهمة',info:'طلب معلومات',reject:'رفض',progress:'بدء التنفيذ',status:'تغيير حالة',date:'تغيير موعد',dateNo:'إبقاء الموعد',completed:'اكتمال',deliver:'تسليم',comment:'تعليق',project:'مشروع جديد',file:'ملف جديد',test:'رسالة تجريبية',opt_out:'العميل أوقف واتساب'};
  var NST={sent:'أُرسل',failed:'فشل',retry:'ستُعاد المحاولة',skipped:'لم يُرسل (غير مفعّل)',received:'وصل'};
  function loadNotify(){ if(!LIVE){ NOTI={err:'live'}; if(TAB==='notify') renderNotify(); return; }
    var q='?admin=1&view=notify'+(NF.channel?'&channel='+NF.channel:'')+(NF.status?'&status='+NF.status:'');
    fetch(API+'/work'+q,{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ NOTI=j.ok?j:{err:j.error||'fail'}; renderTabs(); if(TAB==='notify') renderNotify(); }).catch(function(){ NOTI={err:'net'}; if(TAB==='notify') renderNotify(); }); }
  function npost(body,btn,ok){ if(btn) btn.disabled=true;
    return fetch(API+'/work',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify(body)}).then(function(r){ return r.json(); }).then(function(j){ if(btn) btn.disabled=false; if(ok&&j.ok) toast(ok); return j; }).catch(function(){ if(btn) btn.disabled=false; toast('تعذّر التنفيذ',true); return {ok:false}; }); }
  // notifications that reach the client outside the site: their device (needs no setup) and the studio's Telegram bot (one switch here)
  function chHTML(N){ var G=N.tg||{}, P=N.push||{}, c=G.clients;
    return '<section class="sec nch"><h3>إشعارات خارج الموقع</h3><p class="hint">قناتان مجانيتان تصلان إلى هاتف العميل تلقائياً، ويختار العميل تفعيلهما من «الإعدادات» في مساحة العمل.</p>'+
      '<div class="nch-g"><div class="nch-c"><b>إشعارات الجهاز</b><p class="small muted">تعمل دون أي إعداد. على أندرويد والحاسوب مباشرة، وعلى آيفون بعد إضافة الموقع إلى الشاشة الرئيسية.</p><div class="kpis sm"><div><b>'+(P.clients||0)+'</b><span>عملاء فعّلوها</span></div><div><b>'+(P.devices||0)+'</b><span>أجهزة</span></div></div></div>'+
      '<div class="nch-c"><b>تيليغرام</b><p class="small muted">يستخدم البوت الموجود (TELEGRAM_TOKEN). بعد التفعيل يربط العميل محادثته بضغطة، ويوقفها بإرسال /stop. تبقى إشعاراتك أنت كما هي.</p>'+
        (!G.token?'<p class="small"><b class="noc">✗</b> لم يُضف TELEGRAM_TOKEN في إعدادات الاستضافة.</p>':c?'<p class="small"><b class="okc">✓</b> مفعّل للعملاء عبر <b dir="ltr">@'+esc(c.bot)+'</b> · '+(G.linked||0)+' عميل ربط محادثته</p><div class="actions"><button class="btn sm" type="button" data-tgset>إعادة الربط</button><button class="btn sm danger" type="button" data-tgoff>إيقاف للعملاء</button></div>'
          :'<div class="actions"><button class="btn sm primary" type="button" data-tgset>تفعيل تيليغرام للعملاء</button></div>')+'<div class="small muted" id="tgOut"></div></div></div></section>'; }
  function renderNotify(){ var N=NOTI;
    if(!N){ $('#panel').innerHTML='<section class="sec"><div class="empty">…</div></section>'; loadNotify(); return; }
    if(N.err){ $('#panel').innerHTML='<section class="sec"><h3>الإشعارات</h3><div class="empty">'+(N.err==='db'?'قاعدة البيانات غير مربوطة.':N.err==='live'?'يعمل هذا القسم على الموقع المنشور.':'تعذّر التحميل.')+'</div></section>'; return; }
    var st=function(ch,s2){ return (N.stats||[]).filter(function(x){ return x.channel===ch&&(!s2||x.status===s2); }).reduce(function(a,x){ return a+x.n; },0); };
    var W=N.wa||{}, S=W.secrets||{}, C2=W.config||{}, ok=function(b){ return b?'<b class="okc">✓</b>':'<b class="noc">✗</b>'; };
    $('#panel').innerHTML=
      '<section class="sec"><div class="kpis"><div><b>'+N.unread+'</b><span>غير مقروءة عندك</span></div><div><b>'+st('email','sent')+'</b><span>رسائل بريد أُرسلت (30 يوماً)</span></div><div><b>'+(st('email','failed')+st('email','retry'))+'</b><span>إيميلات فشلت</span></div>'+
        '<div><b>'+st('whatsapp','sent')+'</b><span>رسائل واتساب أُرسلت</span></div><div><b>'+(st('whatsapp','failed')+st('whatsapp','retry'))+'</b><span>واتساب فشلت</span></div><div><b>'+N.consents+'</b><span>عملاء وافقوا على واتساب</span></div></div></section>'+
      '<section class="sec"><div class="ph"><h3>صندوق الإشعارات</h3>'+(N.unread?'<button class="btn sm" type="button" data-nall>تعليم الكل كمقروء</button>':'')+'</div><p class="hint">كل ما يفعله العملاء في مساحة العمل: مهام جديدة، وردود، وموافقات، وتعديلات، وتعليقات، وملفات. ويصلك الأمر نفسه عبر البريد الإلكتروني وتيليغرام.</p>'+
        ((N.inbox||[]).length?'<div class="ninbox">'+N.inbox.map(function(n){ var d=n.data||{}; return '<a class="ni'+(n.read_at?'':' new')+'" href="'+esc(n.link||'#tasks')+'" data-ni="'+n.id+'"><b>'+esc(d.subject||'')+'</b><span class="small muted">'+esc(d.text||'')+'</span><small class="muted">'+esc(new Date(n.created_at).toLocaleString('ar'))+'</small></a>'; }).join('')+'</div>':'<div class="empty">لا توجد إشعارات بعد.</div>')+'</section>'+
      '<section class="sec"><h3>سجل الإرسال للعملاء</h3><p class="hint">كل رسالة بريد أو واتساب أُرسلت إلى عميل. تُعاد الرسائل الفاشلة تلقائياً (بعد 5 دقائق، ثم 30 دقيقة، ثم ساعتين)، ويمكنك إعادتها يدوياً.</p>'+
        '<div class="wfl"><select data-nf="channel"><option value="">كل القنوات</option><option value="email"'+(NF.channel==='email'?' selected':'')+'>الإيميل</option><option value="push"'+(NF.channel==='push'?' selected':'')+'>إشعارات الجهاز</option><option value="telegram"'+(NF.channel==='telegram'?' selected':'')+'>تيليغرام</option><option value="whatsapp"'+(NF.channel==='whatsapp'?' selected':'')+'>واتساب</option></select>'+
        '<select data-nf="status"><option value="">كل الحالات</option>'+['sent','failed','retry','skipped'].map(function(k){ return '<option value="'+k+'"'+(NF.status===k?' selected':'')+'>'+NST[k]+'</option>'; }).join('')+'</select></div>'+
        ((N.log||[]).length?'<div class="nlog"><table><thead><tr><th>الوقت</th><th>القناة</th><th>إلى</th><th>الحدث</th><th>الحالة</th><th></th></tr></thead><tbody>'+N.log.map(function(r){
          return '<tr><td class="small">'+esc(new Date(r.at).toLocaleString('ar'))+'</td><td>'+({whatsapp:'واتساب',push:'الجهاز',telegram:'تيليغرام'}[r.channel]||'إيميل')+'</td><td class="small" dir="ltr">'+esc(r.channel==='whatsapp'&&r.target?'+'+String(r.target).replace(/\d(?=\d{4})/g,'•'):r.recipient)+'</td><td class="small">'+esc(NKIND[r.kind]||r.kind)+'</td>'+
            '<td><span class="npill s-'+esc(r.status)+'">'+esc(NST[r.status]||r.status)+'</span>'+(r.attempts>1?' <span class="small muted">× '+r.attempts+'</span>':'')+(r.delivery?' <span class="small muted">· '+esc(r.delivery)+'</span>':'')+(r.error?'<div class="small muted nerr" dir="auto">'+esc(r.error)+'</div>':'')+'</td>'+
            '<td>'+(r.status==='failed'||r.status==='retry'?'<button class="btn sm" type="button" data-nretry="'+r.id+'">أعد الإرسال</button>':'')+'</td></tr>'; }).join('')+'</tbody></table></div>':'<div class="empty">لا يوجد إرسال مسجّل بعد.</div>')+'</section>'+
      chHTML(N)+
      '<section class="sec nwa"><h3>واتساب (WhatsApp Cloud API الرسمي من Meta)</h3><p class="hint">تُرسل الرسائل فقط إلى العملاء الذين وافقوا وأدخلوا أرقامهم في إعدادات الإشعارات. وإن فشل الإرسال فلا يتوقف شيء: تستمر المهمة والتسليم، وتُعاد الرسالة تلقائياً.</p>'+
        '<div class="nchk"><div>'+ok(N.email&&N.email.ready)+' RESEND_API_KEY <span class="small muted">(الإيميل)</span></div><div>'+ok(S.token)+' WHATSAPP_TOKEN</div><div>'+ok(S.phoneId)+' WHATSAPP_PHONE_ID</div><div>'+ok(S.appSecret)+' WHATSAPP_APP_SECRET</div><div>'+ok(S.verifyToken)+' WHATSAPP_VERIFY_TOKEN</div>'+
          '<div>'+ok(C2.enabled)+' مفعّل من هنا</div></div><p class="hint">'+(W.ready?'✓ واتساب يعمل ويرسل إلى العملاء الموافقين.':'واتساب لا يعمل بعد. تُضاف المفاتيح بوصفها Secrets في Cloudflare ← المشروع ← Settings ← Variables and Secrets، ثم فعّله من هنا.')+'</p>'+
        '<div class="row"><div class="field"><label>اسم القالب المعتمد بـ Meta</label><input data-wa="template" dir="ltr" value="'+esc(C2.template||'eyeblink_update')+'"></div><div class="field"><label>لغة القالب العربي</label><input data-wa="langAr" dir="ltr" value="'+esc(C2.langAr||'ar')+'"></div>'+
          '<div class="field"><label>لغة القالب الإنجليزي</label><input data-wa="langEn" dir="ltr" value="'+esc(C2.langEn||'en')+'"></div><div class="field"><label>نسخة Graph API</label><input data-wa="version" dir="ltr" value="'+esc(C2.version||'v25.0')+'"></div></div>'+
        '<div class="actions"><label class="check"><input type="checkbox" data-wa="button"'+(C2.button!==false?' checked':'')+'> القالب فيه زر رابط (Visit website)</label><label class="check"><input type="checkbox" data-wa="enabled"'+(C2.enabled?' checked':'')+'> فعّل الإرسال على واتساب</label><button class="btn sm primary" type="button" data-wasave>حفظ</button></div>'+
        '<details class="nhow"><summary>نص القالب لتقدّمه بـ Meta (فئة Utility)</summary><div class="small"><p><b>الاسم:</b> <code>'+esc(C2.template||'eyeblink_update')+'</code> — نفس الاسم بلغتين: العربية <code>ar</code> والإنجليزية <code>en</code>.</p>'+
          '<p><b>النص بالعربي:</b></p><pre>مرحباً {{1}}، عندك تحديث جديد من Eyeblink Studio:\n{{2}}\nالتفاصيل كاملة في مساحة العمل الخاصة بك.</pre><p><b>النص بالإنجليزي:</b></p><pre>Hi {{1}}, you have a new update from Eyeblink Studio:\n{{2}}\nFull details are in your workspace.</pre>'+
          '<p><b>الزر:</b> Visit website ← Dynamic ← <code dir="ltr">'+esc(N.goBase||'https://eyeblinkstudio.com/go/')+'{{1}}</code> — مثال للقيمة: <code dir="ltr">t/T-ABC12</code></p>'+
          '<p><b>Webhook:</b> <code dir="ltr">'+esc(N.webhook||'')+'</code> — Verify token = قيمة <code>WHATSAPP_VERIFY_TOKEN</code> نفسها، واشترك في حقل <code>messages</code>. من خلاله تصل حالة كل رسالة (وصلت/قُرئت/فشلت)، وإن ردّ العميل بـ«إيقاف» أو STOP تتوقف رسائله فوراً.</p></div></details>'+
        '<div class="row"><div class="field"><label>رسالة تجريبية لرقم (مع رمز الدولة)</label><input data-watp dir="ltr" placeholder="+9665xxxxxxxx"></div><div class="field"><label>لغة القالب</label><select data-watl><option value="ar">العربية</option><option value="en">English</option></select></div>'+
          '<div class="field"><label>&nbsp;</label><button class="btn sm" type="button" data-watest>أرسل تجربة</button></div></div><div class="small muted" id="waOut">'+esc(WATEST)+'</div></section>';
  }
  document.addEventListener('change',function(e){ var s=e.target; if(TAB!=='notify'||!s.dataset.nf) return; NF[s.dataset.nf]=s.value; loadNotify(); });
  document.addEventListener('click',function(e){ if(TAB!=='notify') return;
    var a=e.target.closest('a[data-ni]'); if(a){ e.preventDefault(); npost({action:'studioRead',ids:[+a.dataset.ni]}).then(function(){ loadNotify(); });
      var m=/^#tasks\/(T-[A-Z0-9]+)/.exec(a.getAttribute('href')||''); TAB='tasks'; WOPEN=m?m[1]:null; try{ history.replaceState(null,'',a.getAttribute('href')); }catch(_){} render(); loadWork(); scrollTo(0,0); return; }
    var b=e.target.closest('button'); if(!b) return;
    if(b.hasAttribute('data-nall')){ npost({action:'studioRead',all:true},b).then(function(){ loadNotify(); }); return; }
    if(b.hasAttribute('data-tgset')||b.hasAttribute('data-tgoff')){ var off=b.hasAttribute('data-tgoff'); if(off&&b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد؟ تتوقف رسائل العملاء'; return; }
      npost({action:'tgSetup',off:off},b).then(function(j){ if(j.ok){ toast(off?'أُوقف تيليغرام للعملاء':'تفعّل تيليغرام للعملاء عبر @'+j.bot); loadNotify(); } else { var o=$('#tgOut'); if(o) o.textContent='تعذّر: '+(j.error||'خطأ'); } }); return; }
    if(b.dataset.nretry){ npost({action:'retryNotif',id:+b.dataset.nretry},b).then(function(j){ toast(j.ok?'أُرسلت ✓':'ما زالت تفشل: '+(j.error||''),!j.ok); loadNotify(); }); return; }
    if(b.hasAttribute('data-wasave')){ var g=function(k){ return document.querySelector('[data-wa="'+k+'"]'); };
      npost({action:'waConfig',enabled:g('enabled').checked,button:g('button').checked,template:g('template').value.trim(),langAr:g('langAr').value.trim(),langEn:g('langEn').value.trim(),version:g('version').value.trim()},b,'حُفظت إعدادات واتساب').then(function(){ loadNotify(); }); return; }
    if(b.hasAttribute('data-watest')){ var out=$('#waOut'); out.textContent='جارٍ الإرسال…';
      npost({action:'waTest',phone:document.querySelector('[data-watp]').value.trim(),lang:document.querySelector('[data-watl]').value},b).then(function(j){ WATEST=j.ok?'✓ أُرسلت. المعرّف: '+(j.id||''):'✗ '+(j.error==='phone'?'الرقم غير صحيح — اكتبه مع رمز الدولة':(j.error||'فشل')); out.textContent=WATEST; loadNotify(); }); return; }
  });

  /* ---------------- billing: workspace invoices (six statuses) + order payments, one list ---------------- */
  var BILL=null, BF={status:'',source:'',client:''}, BOPEN=null, BFORM=null, BPREV={};
  var BST={pending:'بانتظار الدفع',partial:'مدفوعة جزئياً',paid:'مدفوعة',overdue:'متأخرة',cancelled:'ملغاة',refunded:'مستردة',draft:'مسودة'};
  var CURS=['$','€','£','SAR','AED','OMR','QAR','KWD','BHD','JOD','EGP','TRY','SYP'];
  function nn(v){ var n=parseFloat(String(v==null?'':v).replace(/,/g,'').replace(/[^0-9.\-]/g,'')); return isFinite(n)?n:0; }
  function mny(n,c){ var a=Math.abs(+n||0), v=(Math.round(a*100)/100).toFixed(a%1?2:0); return ((+n||0)<0?'−':'')+(c==='$'||c==='€'||c==='£'?c+v:v+' '+c); }
  function loadBilling(){ if(!LIVE){ BILL={err:'live'}; if(TAB==='billing') renderBilling(); return; }
    fetch(API+'/work?admin=1&view=billing',{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ BILL=j.ok?j:{err:j.error||'fail'}; renderTabs(); if(TAB==='billing') renderBilling(); })
      .catch(function(){ BILL={err:'net'}; if(TAB==='billing') renderBilling(); }); }
  function bpost(body,btn,ok){ if(btn) btn.disabled=true;
    return fetch(API+'/work',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify(body)}).then(function(r){ return r.json().then(function(j){ j._s=r.status; return j; }); })
      .then(function(j){ if(btn) btn.disabled=false; if(j.ok){ if(ok) toast(ok); BPREV={}; loadBilling(); } else toast(({items:'أضف بنداً واحداً على الأقل','no account':'لا يوجد حساب بهذا البريد',project:'المشروع لا يخص هذا العميل',due:'تاريخ الاستحقاق قبل تاريخ الإصدار','too much':'المبلغ أكبر من المتبقي',amount:'اكتب مبلغاً صحيحاً',paid:'لا يمكن إلغاء فاتورة عليها دفعات — استخدم الاسترداد',state:'لا يمكن تنفيذ ذلك في حالتها الحالية','below paid':'الإجمالي أقل من المدفوع',sent:'لا يمكن حذف فاتورة أُرسلت أو عليها دفعات'})[j.error]||'تعذّر التنفيذ',true); return j; })
      .catch(function(){ if(btn) btn.disabled=false; toast('تعذّر التنفيذ',true); return {ok:false}; }); }
  // the order flow keeps its own invoices; here we only read where each order stands
  function orderTotal(o){ return nn(o.price)||(o.items||[]).reduce(function(a,x){ return a+nn(x.unit)*(nn(x.qty)||1); },0)||nn(o.total); }
  function orderBills(){ return ORDERS.filter(function(o){ return !o.demo; }).map(function(o){
      var c=o.cur||(String(o.price||o.total||'').match(/[^\d\s.,]+/)||['$'])[0], t=orderTotal(o), dep=o.deposit&&o.deposit.paid?nn(o.deposit.amount):0, fin=o.invoice?nn(o.invoice.amount):0, paid=o.paid?Math.max(t,dep+fin):dep+fin;
      var st=o.status==='cancelled'?'cancelled':o.paid?'paid':dep>0?'partial':(o.payInfo||o.status==='awaiting-payment')?'pending':null; if(!st||(st==='cancelled'&&!paid&&!o.payInfo)) return null;
      var pays=[]; if(dep) pays.push({amount:dep,date:o.deposit.at}); if(fin) pays.push({amount:fin,date:o.invoice.at}); else if(o.paid&&!dep) pays.push({amount:t,date:o.updatedAt||o.createdAt});
      return {src:'order',id:o.code,code:o.code,no:[o.deposit&&o.deposit.invoice&&o.deposit.invoice.no,o.invoice&&o.invoice.no].filter(Boolean).join(' · ')||'—',name:o.name,email:o.email,title:o.packageName||o.package||'',
        issue:((o.payInfo&&o.payInfo.at)||o.createdAt||'').slice(0,10),due:null,total:t,paid:paid,balance:st==='cancelled'?0:Math.max(0,t-paid),currency:c,state:st,payments:pays}; }).filter(Boolean); }
  function billRows(){ var B=BILL||{}, names={}; (B.clients||[]).forEach(function(c){ names[c.email]=c.name; }); (USERS||[]).forEach(function(u){ names[u.email]=names[u.email]||u.name; });
    var ws=(B.invoices||[]).map(function(x){ return {src:'ws',id:x.id,no:x.no,name:names[x.client_email]||x.client_email,email:x.client_email,title:[x.title,x.period].filter(Boolean).join(' · '),project:x.project_name,issue:x.issue_date,due:x.due_date,total:x.total,paid:x.paid,balance:x.balance,currency:x.currency,state:x.sent_at?x.state:'draft',x:x,payments:x.payments}; });
    return ws.concat(orderBills()).sort(function(a,b){ return (b.issue||'')<(a.issue||'')?-1:1; }); }
  function bform(x){ var B=BILL, cl=B.clients||[], f=BFORM||{}, it=(x&&x.items)||f.items||[{desc:'',qty:1,unit:''}], em=(x&&x.client_email)||f.email||'';
    var td=B.today, due=(x&&x.due_date)||new Date(Date.now()+7*864e5).toISOString().slice(0,10);
    return '<form class="bform" data-bid="'+esc(x?x.id:'')+'" novalidate><div class="row"><div class="field"><label>العميل</label><select name="email">'+(cl.length?'':'<option value="">لا يوجد عملاء متعاقدون</option>')+cl.map(function(c){ return '<option value="'+esc(c.email)+'"'+(c.email===em?' selected':'')+'>'+esc(c.name)+' — '+esc(c.email)+'</option>'; }).join('')+(em&&!cl.some(function(c){return c.email===em})?'<option value="'+esc(em)+'" selected>'+esc(em)+'</option>':'')+'</select></div>'+
      '<div class="field"><label>المشروع (اختياري)</label><select name="project"></select></div></div>'+
      '<div class="row"><div class="field"><label>العنوان</label><input name="title" dir="auto" value="'+esc(x?x.title:'')+'" placeholder="مثلاً: باقة المحتوى الشهرية"></div><div class="field"><label>الفترة (اختياري)</label><input name="period" dir="auto" value="'+esc(x?x.period:'')+'" placeholder="نوفمبر 2026"></div>'+
        '<div class="field"><label>العملة</label><input name="currency" dir="ltr" list="bcurs" value="'+esc(x?x.currency:'$')+'"><datalist id="bcurs">'+CURS.map(function(c){ return '<option value="'+c+'">'; }).join('')+'</datalist></div></div>'+
      '<div class="small muted">البنود</div><div class="bitems">'+it.map(function(i){ return '<div class="bitem"><input name="desc" dir="auto" placeholder="البيان" value="'+esc(i.desc||'')+'"><input name="qty" type="number" min="0" step="any" placeholder="الكمية" value="'+esc(i.qty||1)+'"><input name="unit" type="number" min="0" step="any" placeholder="سعر الوحدة" value="'+esc(i.unit===''?'':i.unit)+'"><button type="button" class="linkbtn" data-brm>×</button></div>'; }).join('')+'</div>'+
      '<button type="button" class="btn sm" data-badd>+ بند</button>'+
      '<div class="row"><div class="field"><label>خصم</label><input name="discount" type="number" min="0" step="any" value="'+esc(x&&x.discount?x.discount:'')+'"></div><div class="field"><label>تاريخ الإصدار</label><input name="issue" type="date" value="'+esc(x?x.issue_date:td)+'"></div><div class="field"><label>تاريخ الاستحقاق</label><input name="due" type="date" value="'+esc(due)+'"></div></div>'+
      '<div class="field"><label>ملاحظة على الفاتورة (اختياري)</label><textarea name="note" dir="auto">'+esc(x?x.note:'')+'</textarea></div>'+
      '<div class="actions"><b class="btot">—</b><label class="check"><input type="checkbox" name="send"'+(x&&x.sent_at?'':' checked')+'> '+(x&&x.sent_at?'أعد إرسالها للعميل بعد الحفظ':'أرسلها للعميل الآن (بريد + إشعار)')+'</label><button class="btn primary sm" type="submit">'+(x?'حفظ الفاتورة':'إنشاء الفاتورة')+'</button><button class="btn sm" type="button" data-bx>إلغاء</button></div></form>'; }
  function bformSync(f){ var B=BILL, em=f.elements.email.value, sel=f.elements.project, cur=sel.value||sel.dataset.v||'';
    sel.innerHTML='<option value="">— بدون مشروع —</option>'+(B.projects||[]).filter(function(p){return p.client_email===em}).map(function(p){ return '<option value="'+esc(p.id)+'"'+(p.id===cur?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('');
    var c=f.elements.currency.value.trim()||'$', sub=[].reduce.call(f.querySelectorAll('.bitem'),function(a,r){ return a+nn(r.children[1].value)*nn(r.children[2].value); },0), tot=Math.max(0,sub-nn(f.elements.discount.value));
    f.querySelector('.btot').textContent='الإجمالي: '+mny(tot,c); }
  function bdetail(r){ var x=r.x, c=r.currency;
    if(r.src==='order') return '<div class="bdet"><div class="small muted">طلب من الموقع — تُدار دفعاته وفواتيره من تبويب الطلبات (مسار الدفع الحالي كما هو).</div><div class="actions"><button class="btn sm" type="button" data-bord="'+esc(r.code)+'">افتح الطلب</button></div></div>';
    var closed=x.status==='cancelled'||x.status==='refunded';
    return '<div class="bdet"><div class="bgrid"><div>'+
        '<div class="small muted">البنود</div><table class="btab">'+x.items.map(function(i){ return '<tr><td>'+esc(i.desc)+'</td><td dir="ltr">'+i.qty+' × '+esc(mny(i.unit,c))+'</td><td dir="ltr">'+esc(mny(i.qty*i.unit,c))+'</td></tr>'; }).join('')+(x.discount?'<tr><td>خصم</td><td></td><td dir="ltr">−'+esc(mny(x.discount,c))+'</td></tr>':'')+'<tr class="t"><td>الإجمالي</td><td></td><td dir="ltr">'+esc(mny(x.total,c))+'</td></tr></table>'+
        '<div class="small muted" style="margin-top:10px">الدفعات</div>'+(x.payments.length?'<div class="bpays">'+x.payments.map(function(p,i){ return '<div><b dir="ltr">'+esc(mny(p.amount,c))+'</b> · '+esc(p.date)+(p.method?' · '+esc(p.method):'')+(p.note?' · <span class="muted">'+esc(p.note)+'</span>':'')+(x.status!=='refunded'?' <button class="linkbtn small" type="button" data-bunpay="'+esc(x.id)+'" data-i="'+i+'">حذف</button>':'')+'</div>'; }).join('')+'</div>':'<div class="small muted">لا توجد دفعات بعد.</div>')+
        (x.refunded?'<div class="small">المسترد: <b dir="ltr">'+esc(mny(x.refunded,c))+'</b></div>':'')+
        (!closed&&x.balance>0?'<div class="bpay"><div class="small muted">تسجيل دفعة وصلت</div><div class="row"><div class="field"><input data-pamt type="number" min="0" step="any" value="'+x.balance+'"></div><div class="field"><input data-pmeth dir="auto" placeholder="الطريقة (تحويل، PayPal…)"></div><div class="field"><input data-pdate type="date" value="'+esc(BILL.today)+'"></div></div>'+
          '<div class="row"><div class="field"><input data-pnote dir="auto" placeholder="ملاحظة (اختياري)"></div><div class="field"><button class="btn sm primary" type="button" data-bpay="'+esc(x.id)+'">سجّل الدفعة</button></div></div></div>':'')+
      '</div><div><div class="actions bacts">'+
        '<button class="btn sm" type="button" data-bprev="'+esc(x.id)+'">معاينة الفاتورة</button>'+
        (x.status!=='cancelled'?'<button class="btn sm" type="button" data-bsend="'+esc(x.id)+'">'+(x.sent_at?'أعد الإرسال':'أرسل للعميل')+'</button>':'')+
        (!closed?'<button class="btn sm" type="button" data-bedit="'+esc(x.id)+'">تعديل</button>':'')+
        (!closed&&!x.paid?'<button class="btn sm danger" type="button" data-bst="cancelled" data-id="'+esc(x.id)+'">إلغاء الفاتورة</button>':'')+
        (x.paid>0&&x.status!=='refunded'?'<span class="brf"><input data-ramt type="number" min="0" step="any" value="'+x.paid+'" hidden aria-label="المبلغ المسترد"><button class="btn sm" type="button" data-bst="refunded" data-id="'+esc(x.id)+'">تسجيل استرداد</button></span>':'')+
        (closed?'<button class="btn sm" type="button" data-bst="reopen" data-id="'+esc(x.id)+'">إعادة فتح</button>':'')+
        (!x.sent_at&&!x.paid?'<button class="btn sm danger" type="button" data-bdel="'+esc(x.id)+'">حذف المسودة</button>':'')+
      '</div><div class="small muted">'+(x.sent_at?'أُرسلت '+esc(new Date(x.sent_at).toLocaleString('ar')):'مسودة — لم تُرسل للعميل ولا تظهر له')+(x.reminded_at?' · أُرسل تذكير الاستحقاق':'')+'</div>'+
      (BPREV[x.id]?'<iframe class="bprev" title="معاينة" srcdoc="'+esc(BPREV[x.id])+'"></iframe>':'')+'</div></div></div>'; }
  function renderBilling(){ var B=BILL;
    if(!B){ $('#panel').innerHTML='<section class="sec"><div class="empty">…</div></section>'; loadBilling(); return; }
    if(B.err){ $('#panel').innerHTML='<section class="sec"><h3>الفوترة</h3><div class="empty">'+(B.err==='db'?'قاعدة البيانات غير مربوطة.':B.err==='live'?'يعمل هذا القسم على الموقع المنشور.':'تعذّر التحميل.')+'</div></section>'; return; }
    var rows=billRows(), m=B.today.slice(0,7), out={}, paidM={}, nOver=0, nDraft=0;
    rows.forEach(function(r){ var c=r.currency; if(r.state==='overdue') nOver++; if(r.state==='draft') nDraft++;
      if(['pending','partial','overdue'].indexOf(r.state)>=0) out[c]=(out[c]||0)+r.balance;
      (r.payments||[]).forEach(function(p){ if(String(p.date||'').slice(0,7)===m) paidM[c]=(paidM[c]||0)+nn(p.amount); }); });
    var fmtMap=function(o){ var k=Object.keys(o); return k.length?k.map(function(c){ return '<span dir="ltr">'+esc(mny(o[c],c))+'</span>'; }).join(' · '):'0'; };
    var list=rows.filter(function(r){ return (!BF.status||r.state===BF.status)&&(!BF.source||r.src===BF.source)&&(!BF.client||r.email===BF.client); });
    var emails={}; rows.forEach(function(r){ emails[r.email]=r.name; });
    $('#panel').innerHTML=
      '<section class="sec"><div class="kpis"><div><b>'+fmtMap(out)+'</b><span>مستحق غير مدفوع</span></div><div><b>'+fmtMap(paidM)+'</b><span>دفعات هذا الشهر</span></div><div><b>'+nOver+'</b><span>فواتير متأخرة</span></div>'+
        '<div><b>'+rows.filter(function(r){return r.state==='paid'}).length+'</b><span>مدفوعة</span></div><div><b>'+nDraft+'</b><span>مسودات</span></div></div>'+
        '<p class="hint">الفوترة يدوية: لا بوابة دفع. تُصدر فاتورة للعميل المتعاقد، وتسجّل كل دفعة عند وصولها، فتتغيّر الحالة تلقائياً: بانتظار الدفع ← مدفوعة جزئياً ← مدفوعة، وتصبح «متأخرة» بعد تاريخ الاستحقاق ويصل العميلَ تذكير واحد. طلبات الموقع تظهر هنا للاطلاع فقط، ودفعاتها من تبويب الطلبات كما هي.</p></section>'+
      '<section class="sec"><div class="ph"><h3>الفواتير ('+list.length+')</h3><button class="btn sm primary" type="button" data-bnew>+ فاتورة جديدة</button></div>'+
        (BFORM&&!BFORM.id?'<div class="bnew">'+bform(null)+'</div>':'')+
        '<div class="wfl"><select data-bf="status"><option value="">كل الحالات</option>'+['pending','partial','paid','overdue','cancelled','refunded','draft'].map(function(k){ return '<option value="'+k+'"'+(BF.status===k?' selected':'')+'>'+BST[k]+'</option>'; }).join('')+'</select>'+
        '<select data-bf="source"><option value="">كل المصادر</option><option value="ws"'+(BF.source==='ws'?' selected':'')+'>فواتير العملاء المتعاقدين</option><option value="order"'+(BF.source==='order'?' selected':'')+'>طلبات الموقع</option></select>'+
        '<select data-bf="client"><option value="">كل العملاء</option>'+Object.keys(emails).map(function(e){ return '<option value="'+esc(e)+'"'+(BF.client===e?' selected':'')+'>'+esc(emails[e]||e)+'</option>'; }).join('')+'</select></div>'+
        (list.length?'<div class="blist">'+list.map(function(r){ var open=BOPEN===r.src+':'+r.id;
          return '<div class="brow'+(open?' open':'')+'"><button type="button" class="bsum" data-bopen="'+esc(r.src+':'+r.id)+'"><span class="bno" dir="ltr">'+esc(r.no)+'</span><span class="bnm"><b>'+esc(r.name||r.email)+'</b><small class="muted">'+esc(r.title||'')+(r.project?' · '+esc(r.project):'')+(r.src==='order'?' · طلب '+esc(r.code):'')+'</small></span>'+
            '<span class="bdt small muted">'+esc(r.issue||'')+(r.due?'<br>يستحق '+esc(r.due):'')+'</span><span class="bam" dir="ltr">'+esc(mny(r.total,r.currency))+(r.balance&&r.balance!==r.total?'<small>متبقٍ '+esc(mny(r.balance,r.currency))+'</small>':'')+'</span><span class="npill bs-'+esc(r.state)+'">'+esc(BST[r.state]||r.state)+'</span></button>'+
            (open?(BFORM&&BFORM.id===r.id?'<div class="bdet">'+bform(r.x)+'</div>':bdetail(r)):'')+'</div>'; }).join('')+'</div>':'<div class="empty">لا توجد فواتير هنا.</div>')+'</section>';
    var f=$('#panel').querySelector('.bform'); if(f){ var sel=f.elements.project; sel.dataset.v=(BFORM&&BFORM.id&&(BILL.invoices.filter(function(x){return x.id===BFORM.id})[0]||{}).project_id)||(BFORM&&BFORM.project)||''; bformSync(f); }
  }
  document.addEventListener('input',function(e){ if(TAB!=='billing') return; var f=e.target.closest&&e.target.closest('.bform'); if(f) bformSync(f); });
  document.addEventListener('change',function(e){ if(TAB!=='billing') return; var s=e.target; if(s.dataset.bf){ BF[s.dataset.bf]=s.value; renderBilling(); return; } var f=s.closest&&s.closest('.bform'); if(f) bformSync(f); });
  document.addEventListener('submit',function(e){ var f=e.target; if(!f.classList||!f.classList.contains('bform')) return; e.preventDefault(); var E=f.elements;
    var items=[].map.call(f.querySelectorAll('.bitem'),function(r){ return {desc:r.children[0].value.trim(),qty:nn(r.children[1].value)||1,unit:nn(r.children[2].value)}; }).filter(function(i){ return i.desc; });
    bpost({action:'invoice',id:f.dataset.bid||undefined,client_email:E.email.value,project_id:E.project.value||null,title:E.title.value.trim(),period:E.period.value.trim(),currency:E.currency.value.trim()||'$',items:items,discount:E.discount.value,issue_date:E.issue.value,due_date:E.due.value,note:E.note.value.trim(),send:E.send.checked},
      f.querySelector('button[type=submit]'),E.send.checked?'حُفظت الفاتورة وأُرسلت إلى العميل':'حُفظت الفاتورة').then(function(j){ if(j.ok){ BFORM=null; BOPEN='ws:'+j.id; } }); });
  document.addEventListener('click',function(e){ if(TAB!=='billing') return; var b=e.target.closest('button'); if(!b) return;
    if(b.hasAttribute('data-bnew')){ BFORM=BFORM&&!BFORM.id?null:{}; renderBilling(); return; }
    if(b.hasAttribute('data-bx')){ BFORM=null; renderBilling(); return; }
    if(b.hasAttribute('data-badd')){ var w=b.closest('.bform').querySelector('.bitems'), d=document.createElement('div'); d.className='bitem'; d.innerHTML='<input name="desc" dir="auto" placeholder="البيان"><input name="qty" type="number" min="0" step="any" value="1"><input name="unit" type="number" min="0" step="any" placeholder="سعر الوحدة"><button type="button" class="linkbtn" data-brm>×</button>'; w.appendChild(d); d.firstChild.focus(); return; }
    if(b.hasAttribute('data-brm')){ var f=b.closest('.bform'); if(f.querySelectorAll('.bitem').length>1) b.closest('.bitem').remove(); bformSync(f); return; }
    if(b.dataset.bopen){ BOPEN=BOPEN===b.dataset.bopen?null:b.dataset.bopen; if(BFORM&&BFORM.id) BFORM=null; renderBilling(); return; }
    if(b.dataset.bord){ TAB='orders'; render(); setTimeout(function(){ [].some.call(document.querySelectorAll('details.order'),function(d){ var c=d.querySelector('.code'); if(c&&c.textContent.trim()===b.dataset.bord){ d.open=true; d.scrollIntoView({block:'start',behavior:'smooth'}); return true; } }); },60); return; }
    if(b.dataset.bedit){ BFORM={id:b.dataset.bedit}; renderBilling(); return; }
    if(b.dataset.bprev){ var id=b.dataset.bprev; if(BPREV[id]){ delete BPREV[id]; renderBilling(); return; }
      fetch(API+'/work?admin=1&invoiceDoc='+encodeURIComponent(id),{headers:headers({}),cache:'no-store'}).then(function(r){ return r.text(); }).then(function(t){ BPREV[id]=t.replace(/src="\/assets\//g,'src="../assets/'); renderBilling(); }); return; }
    if(b.dataset.bsend){ bpost({action:'invoiceSend',id:b.dataset.bsend},b,'أُرسلت الفاتورة إلى العميل'); return; }
    if(b.dataset.bpay){ var bx=b.closest('.bpay'); bpost({action:'invoicePay',id:b.dataset.bpay,amount:bx.querySelector('[data-pamt]').value,method:bx.querySelector('[data-pmeth]').value.trim(),date:bx.querySelector('[data-pdate]').value,note:bx.querySelector('[data-pnote]').value.trim()},b,'سُجّلت الدفعة وأُبلغ العميل'); return; }
    if(b.dataset.bunpay){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='متأكد؟'; return; } bpost({action:'invoiceUnpay',id:b.dataset.bunpay,index:+b.dataset.i},b,'حُذفت الدفعة'); return; }
    if(b.dataset.bst){ var st=b.dataset.bst, body={action:'invoiceStatus',id:b.dataset.id,status:st};
      if(st==='refunded'){ var ri=b.parentNode.querySelector('[data-ramt]'); if(ri.hidden){ ri.hidden=false; ri.focus(); b.textContent='أكّد الاسترداد'; return; } body.amount=ri.value; }
      else if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='متأكد؟ اضغط مرة أخرى'; return; }
      bpost(body,b,{cancelled:'أُلغيت الفاتورة',refunded:'سُجّل الاسترداد',reopen:'أُعيد فتح الفاتورة'}[st]); return; }
    if(b.dataset.bdel){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='متأكد؟'; return; } bpost({action:'invoiceDelete',id:b.dataset.bdel},b,'حُذفت المسودة').then(function(j){ if(j.ok) BOPEN=null; }); return; }
  });

  /* ---------------- reports: money, delivery performance, clients ---------------- */
  var REP=null, RMON=6;
  function loadReports(){ if(!LIVE){ REP={err:'live'}; if(TAB==='reports') renderReports(); return; }
    fetch(API+'/work?admin=1&view=reports',{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ REP=j.ok?j:{err:j.error||'fail'}; if(TAB==='reports') renderReports(); }).catch(function(){ REP={err:'net'}; if(TAB==='reports') renderReports(); }); }
  function months(n,today){ var out=[], d=new Date(today+'T12:00:00Z'); d.setUTCDate(1); for(var i=0;i<n;i++){ out.unshift(d.toISOString().slice(0,7)); d.setUTCMonth(d.getUTCMonth()-1); } return out; }
  function mname(m){ try{ return new Date(m+'-15T12:00:00Z').toLocaleDateString('ar-u-nu-latn',{month:'short',year:'2-digit'}); }catch(_){ return m; } }
  function renderReports(){ var R=REP;
    if(!R){ $('#panel').innerHTML='<section class="sec"><div class="empty">…</div></section>'; loadReports(); return; }
    if(R.err){ $('#panel').innerHTML='<section class="sec"><h3>التقارير</h3><div class="empty">'+(R.err==='db'?'قاعدة البيانات غير مربوطة.':R.err==='live'?'يعمل هذا القسم على الموقع المنشور.':'تعذّر التحميل.')+'</div></section>'; return; }
    var M=months(RMON,R.today), first=M[0], inR=function(d){ return d&&String(d).slice(0,7)>=first; }, names={}; (R.clients||[]).forEach(function(c){ names[c.email]=c.name; }); (USERS||[]).forEach(function(u){ names[u.email]=names[u.email]||u.name; });
    // money: workspace invoice payments + order payments, by month and currency
    var pays=[]; (R.invoices||[]).forEach(function(x){ if(x.status==='cancelled') return; (x.payments||[]).forEach(function(p){ pays.push({m:String(p.date||p.at).slice(0,7),c:x.currency,a:nn(p.amount),email:x.client_email}); }); if(x.refunded) pays.push({m:String(x.updated_at||R.today).slice(0,7),c:x.currency,a:-nn(x.refunded),email:x.client_email}); });
    orderBills().forEach(function(o){ (o.payments||[]).forEach(function(p){ pays.push({m:String(p.date||'').slice(0,7),c:o.currency,a:nn(p.amount),email:o.email,order:1}); }); });
    var curs={}; pays.forEach(function(p){ if(inR(p.m+'-01')) curs[p.c]=(curs[p.c]||0)+p.a; }); var main=Object.keys(curs).sort(function(a,b){ return curs[b]-curs[a]; })[0]||'$';
    var byM=M.map(function(m){ return pays.filter(function(p){ return p.m===m&&p.c===main; }).reduce(function(a,p){ return a+p.a; },0); }), mx=Math.max.apply(null,byM.concat([1]));
    var outC={}; (R.invoices||[]).forEach(function(x){ if(x.sent_at&&['pending','partial','overdue'].indexOf(x.state)>=0) outC[x.currency]=(outC[x.currency]||0)+x.balance; }); orderBills().forEach(function(o){ if(['pending','partial'].indexOf(o.state)>=0) outC[o.currency]=(outC[o.currency]||0)+o.balance; });
    // delivery performance
    var T=R.tasks||[], done=T.filter(function(t){ return t.status==='completed'&&inR(t.completed_at); }), created=T.filter(function(t){ return inR(t.created_at); });
    var onT=done.filter(function(t){ return t.confirmed_date; }), onTime=onT.filter(function(t){ return String(t.completed_at).slice(0,10)<=t.confirmed_date; }).length;
    var turn=done.map(function(t){ return (new Date(t.completed_at)-new Date(t.created_at))/864e5; }), avgTurn=turn.length?turn.reduce(function(a,b){return a+b},0)/turn.length:0;
    var DL=R.deliverables||[], rounds={}; DL.forEach(function(d){ if(d.status==='changes') rounds[d.task_id]=(rounds[d.task_id]||0)+1; });
    var avgRounds=done.length?done.reduce(function(a,t){ return a+(rounds[t.id]||0); },0)/done.length:0;
    var openT=T.filter(function(t){ return ['new','review','info','accepted','progress','feedback','revision','final'].indexOf(t.status)>=0; }), late=openT.filter(function(t){ return t.confirmed_date&&t.confirmed_date<R.today; });
    var pct=function(a,b){ return b?Math.round(a*100/b)+'%':'—'; };
    var col=function(vals,max,lab){ return '<div class="schart rchart" role="img" aria-label="'+esc(lab)+'">'+vals.map(function(v,i){ return '<div class="col" title="'+esc(mname(M[i]))+' · '+esc(typeof v==='number'?String(Math.round(v*100)/100):v)+'"><i style="height:'+(Math.max(0,v)*100/max)+'%"></i>'+(v?'<em>'+(Math.round(v*10)/10)+'</em>':'')+'</div>'; }).join('')+'</div><div class="saxis rax">'+M.map(function(m){ return '<span>'+esc(mname(m))+'</span>'; }).join('')+'</div>'; };
    var tc=M.map(function(m){ return T.filter(function(t){ return String(t.created_at).slice(0,7)===m; }).length; }), td=M.map(function(m){ return T.filter(function(t){ return t.status==='completed'&&String(t.completed_at).slice(0,7)===m; }).length; });
    var dv=M.map(function(m){ return DL.filter(function(d){ return String(d.created_at).slice(0,7)===m; }).length; });
    // per client
    var cl={}; T.forEach(function(t){ var c=cl[t.client_email]=cl[t.client_email]||{tasks:0,open:0,done:0,onT:0,onTimeN:0,rounds:0,paid:{},due:{},projects:{}}; c.tasks++; c.projects[t.project_id]=1;
      if(t.status==='completed'){ c.done++; c.rounds+=rounds[t.id]||0; if(t.confirmed_date){ c.onT++; if(String(t.completed_at).slice(0,10)<=t.confirmed_date) c.onTimeN++; } } else if(openT.indexOf(t)>=0) c.open++; });
    (R.invoices||[]).forEach(function(x){ var c=cl[x.client_email]=cl[x.client_email]||{tasks:0,open:0,done:0,onT:0,onTimeN:0,rounds:0,paid:{},due:{},projects:{}}; if(x.status!=='cancelled') c.paid[x.currency]=(c.paid[x.currency]||0)+x.paid-(x.refunded||0); if(x.sent_at&&['pending','partial','overdue'].indexOf(x.state)>=0) c.due[x.currency]=(c.due[x.currency]||0)+x.balance; });
    var mm=function(o){ var k=Object.keys(o).filter(function(c){return Math.abs(o[c])>0.009}); return k.length?k.map(function(c){ return '<span dir="ltr">'+esc(mny(o[c],c))+'</span>'; }).join(' · '):'—'; };
    var ord=ORDERS.filter(function(o){ return !o.demo&&inR(o.createdAt); }), ordPaid=ord.filter(function(o){ return o.paid||(o.deposit&&o.deposit.paid); });
    $('#panel').innerHTML=
      '<section class="sec"><div class="srange">'+[[3,'آخر 3 أشهر'],[6,'آخر 6 أشهر'],[12,'آخر 12 شهراً']].map(function(x){ return '<button type="button" class="btn sm'+(RMON===x[0]?' primary':'')+'" data-rmon="'+x[0]+'">'+x[1]+'</button>'; }).join('')+'<button type="button" class="btn sm" data-rreload>تحديث</button></div>'+
        '<div class="kpis"><div><b>'+mm(curs)+'</b><span>المحصَّل في الفترة</span></div><div><b>'+mm(outC)+'</b><span>المستحق الآن</span></div><div><b>'+done.length+'</b><span>مهام مكتملة</span></div><div><b>'+pct(onTime,onT.length)+'</b><span>التسليم في الموعد المؤكد</span></div>'+
        '<div><b>'+(turn.length?avgTurn.toFixed(1)+' يوم':'—')+'</b><span>متوسط مدة المهمة</span></div><div><b>'+(done.length?avgRounds.toFixed(1):'—')+'</b><span>متوسط جولات التعديل</span></div></div>'+
        '<p class="hint">المحصَّل يجمع دفعات فواتير العملاء المتعاقدين ودفعات طلبات الموقع (ناقص المسترد). «في الموعد» = اكتملت المهمة في الموعد المؤكد أو قبله.</p></section>'+
      '<div class="sgrid">'+
        '<section class="sec"><h3>المحصَّل شهرياً ('+esc(main)+')</h3>'+col(byM,mx,'المحصَّل شهرياً')+'</section>'+
        '<section class="sec"><h3>المهام شهرياً</h3>'+col(td,Math.max.apply(null,td.concat(tc,[1])),'المهام المكتملة')+'<p class="small muted">الأعمدة = المكتملة · جديدة في الفترة: '+created.length+' · تسليمات (نسخ): '+dv.reduce(function(a,b){return a+b},0)+'</p></section>'+
        '<section class="sec"><h3>الوضع الآن</h3><div class="sbars"><div class="sbar"><span class="n">مهام مفتوحة</span><span class="v">'+openT.length+'</span></div><div class="sbar"><span class="n">مهام تجاوزت موعدها المؤكد</span><span class="v">'+late.length+'</span></div>'+
          '<div class="sbar"><span class="n">فواتير متأخرة</span><span class="v">'+(R.invoices||[]).filter(function(x){return x.sent_at&&x.state==='overdue'}).length+'</span></div><div class="sbar"><span class="n">طلبات الموقع في الفترة</span><span class="v">'+ord.length+'<small>مدفوعة '+ordPaid.length+'</small></span></div></div></section>'+
        '<section class="sec"><h3>المهام المتأخرة</h3>'+(late.length?'<div class="sbars">'+late.slice(0,12).map(function(t){ return '<div class="sbar"><span class="n">'+esc(t.ref)+' · '+esc(t.title)+'</span><span class="v small">'+esc(t.confirmed_date)+'</span></div>'; }).join('')+'</div>':'<div class="empty small">لا توجد مهام متأخرة.</div>')+'</section>'+
      '</div>'+
      '<section class="sec"><h3>العملاء المتعاقدون</h3>'+(Object.keys(cl).length?'<div class="nlog"><table><thead><tr><th>العميل</th><th>المشاريع</th><th>مكتملة / مفتوحة</th><th>في الموعد</th><th>جولات التعديل</th><th>المدفوع</th><th>المستحق</th></tr></thead><tbody>'+
        Object.keys(cl).map(function(e){ var c=cl[e]; return '<tr><td><b>'+esc(names[e]||e)+'</b><div class="small muted" dir="ltr">'+esc(e)+'</div></td><td>'+Object.keys(c.projects).length+'</td><td>'+c.done+' / '+c.open+'</td><td>'+pct(c.onTimeN,c.onT)+'</td><td>'+(c.done?(c.rounds/c.done).toFixed(1):'—')+'</td><td>'+mm(c.paid)+'</td><td>'+mm(c.due)+'</td></tr>'; }).join('')+'</tbody></table></div>':'<div class="empty">لا توجد بيانات بعد.</div>')+'</section>';
  }
  document.addEventListener('click',function(e){ if(TAB!=='reports') return; var b=e.target.closest('button'); if(!b) return;
    if(b.dataset.rmon){ RMON=+b.dataset.rmon; renderReports(); return; } if(b.hasAttribute('data-rreload')){ REP=null; renderReports(); return; } });

  /* ---------------- stats ---------------- */
  var DEV={mobile:'موبايل',desktop:'كمبيوتر',tablet:'تابلت'}, SDAYS=30, STATS=null;
  var SRCN={direct:'مباشر / رابط محفوظ',instagram:'Instagram',google:'Google',facebook:'Facebook',whatsapp:'WhatsApp',telegram:'Telegram',tiktok:'TikTok',youtube:'YouTube',x:'X',linkedin:'LinkedIn',behance:'Behance',snapchat:'Snapchat',bing:'Bing'};
  var CN={SY:'سوريا',SA:'السعودية',AE:'الإمارات',OM:'عُمان',QA:'قطر',KW:'الكويت',BH:'البحرين',JO:'الأردن',LB:'لبنان',IQ:'العراق',EG:'مصر',TR:'تركيا',RO:'رومانيا',DE:'ألمانيا',US:'أمريكا',GB:'بريطانيا',FR:'فرنسا',NL:'هولندا',SE:'السويد',PS:'فلسطين',MA:'المغرب',DZ:'الجزائر',TN:'تونس',LY:'ليبيا',YE:'اليمن',SD:'السودان'};
  function loadStats(){ STATS='loading'; if(!LIVE){ STATS=demoStats(); renderStats(); return; }
    fetch(API+'/track?days='+SDAYS,{headers:headers({})}).then(function(r){return r.json()}).then(function(j){ STATS=j.days||[]; if(TAB==='stats') renderStats(); }).catch(function(){ STATS=[]; if(TAB==='stats') renderStats(); }); }
  function demoStats(){ var out=[]; for(var i=SDAYS-1;i>=0;i--){ var v=Math.round(20+Math.random()*60); out.push({day:new Date(Date.now()-i*864e5).toISOString().slice(0,10),views:v,visits:Math.round(v*.6),visitors:Math.round(v*.4),pages:{'/':v,'/pricing':Math.round(v/3)},sources:{instagram:Math.round(v*.3),direct:Math.round(v*.2),google:3},countries:{SA:9,AE:5,SY:4},devices:{mobile:20,desktop:8},browsers:{'Instagram app':10,Chrome:9,Safari:6},os:{iOS:12,Android:8,Windows:5},langs:{ar:20,en:5},recent:i?[]:[{at:new Date().toISOString(),page:'/pricing',src:'instagram',country:'SA',city:'Riyadh',device:'mobile',os:'iOS',browser:'Instagram app',nv:true}]}); } return out; }
  function sum(list,k){ var o={}; list.forEach(function(d){ var x=d[k]||{}; for(var n in x) o[n]=(o[n]||0)+x[n]; }); return Object.keys(o).map(function(n){return [n,o[n]]}).sort(function(a,b){return b[1]-a[1]}); }
  function bars(rows,name){ var max=rows.length?rows[0][1]:1, tot=rows.reduce(function(a,r){return a+r[1]},0)||1;
    return rows.length? '<div class="sbars">'+rows.slice(0,8).map(function(r){ return '<div class="sbar"><span class="n">'+esc(name?name(r[0]):r[0])+'</span><span class="v">'+r[1]+' <small>'+Math.round(r[1]*100/tot)+'%</small></span><i style="width:'+Math.max(3,r[1]*100/max)+'%"></i></div>'; }).join('')+'</div>' : '<div class="empty small">لا بيانات بعد</div>'; }
  function renderStats(){
    if(STATS===null||STATS==='loading'){ $('#panel').innerHTML='<section class="sec"><div class="empty">…</div></section>'; if(STATS===null) loadStats(); return; }
    var D=STATS, T=function(k){ return D.reduce(function(a,d){return a+(d[k]||0)},0); };
    var from=D.length?D[0].day:'', ord=ORDERS.filter(function(o){ return !o.demo&&o.createdAt&&o.createdAt.slice(0,10)>=from; });
    var paid=ord.filter(function(o){return o.paid||(o.deposit&&o.deposit.paid)});
    var visits=T('visits'), conv=visits? (ord.length*100/visits).toFixed(1)+'%' : '—';
    var max=Math.max.apply(null,D.map(function(d){return d.views||0}).concat([1]));
    var chart='<div class="schart" role="img" aria-label="المشاهدات اليومية">'+D.map(function(d){ var o=ORDERS.filter(function(x){return x.createdAt&&x.createdAt.slice(0,10)===d.day}).length;
      return '<div class="col" title="'+esc(d.day)+' · '+(d.views||0)+' مشاهدة · '+(d.visits||0)+' زيارة'+(o?' · '+o+' طلب':'')+'"><i style="height:'+((d.views||0)*100/max)+'%"></i><b style="height:'+((d.visits||0)*100/max)+'%"></b>'+(o?'<em>'+o+'</em>':'')+'</div>'; }).join('')+'</div>'+
      '<div class="saxis"><span>'+esc(from)+'</span><span>اليوم</span></div><div class="slegend"><span><i class="a"></i>مشاهدات صفحات</span><span><i class="b"></i>زيارات</span><span><em>●</em> طلب</span></div>';
    var recent=[].concat.apply([],D.slice().reverse().map(function(d){return d.recent||[]})).slice(0,60);
    var osrc=sum(ord.map(function(o){ var x={}; x[(o.visit&&o.visit.source)||'غير معروف']=1; return {s:x}; }),'s');
    $('#panel').innerHTML=
      '<section class="sec"><div class="srange">'+[7,30,90].map(function(n){ return '<button type="button" class="btn sm'+(SDAYS===n?' primary':'')+'" data-sdays="'+n+'">آخر '+n+' يوم</button>'; }).join('')+'<button type="button" class="btn sm" data-sreload>تحديث</button></div>'+
        '<div class="kpis"><div><b>'+T('views')+'</b><span>مشاهدة صفحة</span></div><div><b>'+visits+'</b><span>زيارة</span></div><div><b>'+T('visitors')+'</b><span>زائر جديد</span></div><div><b>'+ord.length+'</b><span>طلب</span></div><div><b>'+conv+'</b><span>نسبة الطلب من الزيارات</span></div><div><b>'+paid.length+'</b><span>طلب مدفوع</span></div></div>'+chart+
        (!LIVE?'<p class="hint">أرقام تجريبية. الأرقام الحقيقية تبدأ بعد النشر.</p>':'<p class="hint">إحصائيات مجهولة الهوية: لا نخزّن عنوان IP ولا أي بيانات شخصية. الزيارة = جلسة تصفّح واحدة، والزائر الجديد = أول مرة يُفتح فيها الموقع من هذا الجهاز.</p>')+'</section>'+
      '<div class="sgrid">'+
        '<section class="sec"><h3>مصادر الزيارات</h3>'+bars(sum(D,'sources'),function(n){return SRCN[n]||n})+'</section>'+
        '<section class="sec"><h3>مصادر الطلبات</h3>'+bars(osrc,function(n){return SRCN[n]||n})+'</section>'+
        '<section class="sec"><h3>أكثر الصفحات</h3>'+bars(sum(D,'pages'))+'</section>'+
        '<section class="sec"><h3>الدول</h3>'+bars(sum(D,'countries'),function(n){return CN[n]||n})+'</section>'+
        '<section class="sec"><h3>الأجهزة</h3>'+bars(sum(D,'devices'),function(n){return DEV[n]||n})+'<h3 style="margin-top:16px">أنظمة التشغيل</h3>'+bars(sum(D,'os'))+'</section>'+
        '<section class="sec"><h3>المتصفّح / التطبيق</h3>'+bars(sum(D,'browsers'))+'<h3 style="margin-top:16px">لغة الصفحة</h3>'+bars(sum(D,'langs'),function(n){return n==='en'?'English':'العربية'})+'</section>'+
      '</div>'+
      '<section class="sec"><h3>آخر الزيارات</h3>'+(recent.length?'<div class="stable"><table><thead><tr><th>الوقت</th><th>الصفحة</th><th>المصدر</th><th>الموقع</th><th>الجهاز</th></tr></thead><tbody>'+recent.map(function(r){
        return '<tr><td>'+esc(new Date(r.at).toLocaleString('ar',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+(r.nv?' <span class="tag">جديد</span>':'')+'</td><td dir="ltr">'+esc(r.page)+'</td><td>'+esc(SRCN[r.src]||r.src)+(r.utm?'<br><small dir="ltr">'+esc(r.utm)+'</small>':'')+(r.ref&&r.src!=='direct'?'<br><small dir="ltr" class="muted">'+esc(r.ref.replace(/^https?:\/\//,'').slice(0,40))+'</small>':'')+'</td><td>'+esc([r.city,CN[r.country]||r.country].filter(Boolean).join('، '))+'</td><td>'+esc(DEV[r.device]||r.device)+' · '+esc(r.os)+'<br><small class="muted">'+esc(r.browser)+'</small></td></tr>'; }).join('')+'</tbody></table></div>':'<div class="empty">لا زيارات بعد.</div>')+'</section>';
  }
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-sdays],[data-sreload]'); if(!b) return; if(b.dataset.sdays) SDAYS=+b.dataset.sdays; STATS=null; renderStats(); });

  /* ---------------- clients ---------------- */
  var ACC=null, UFILTER='all';     // workspace access: pending requests + open invitations
  function loadUsers(){
    if(!LIVE){ USERS=[{email:'client@example.com',name:'عميل تجريبي',provider:'password',hasPassword:true,createdAt:new Date().toISOString(),orders:1,role:'customer'}]; ACC={requests:[],invites:[]}; renderClients(); return; }
    Promise.all([fetch(API+'/users',{headers:headers({})}).then(function(r){return r.json()}),fetch(API+'/access?admin=1',{headers:headers({}),cache:'no-store'}).then(function(r){return r.json()})])
      .then(function(j){ USERS=j[0].users||[]; ACC={requests:j[1].requests||[],invites:j[1].invites||[]}; renderTabs(); if(TAB==='clients') renderClients(); }).catch(function(){});
    loadClients();
  }
  function accReq(body,btn,ok){
    if(!LIVE){ toast('يعمل على الموقع المنشور',true); return Promise.reject(); }
    if(btn) btn.disabled=true;
    return fetch(API+'/access',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify(body)}).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'fail'); return j; }); })
      .then(function(j){ if(ok) toast(ok); loadUsers(); if(PROF) loadProfile(PROF.email); return j; })
      .catch(function(e){ if(btn) btn.disabled=false; toast(({exists:'لهذا البريد حساب أصلاً',name:'اكتب اسم العميل',already:'هذا العميل متعاقد أصلاً',email:'اكتب بريداً صحيحاً','no account':'لا يوجد حساب بهذا البريد','no request':'لم يعد الطلب موجوداً'})[e.message]||'تعذّر التنفيذ',true); throw e; });
  }
  var ROLE={client:'عميل متعاقد',customer:'عميل عادي'}, VIA={invite:'بدعوة',request:'بطلب وصول',upgrade:'ترقية من الإدارة'};
  /* ---------------- clients: a list of every client, and one management profile per client ---------------- */
  // the list comes from the server (D1 client records + accounts), joined here with the site orders already loaded
  var CL=null, CQ='', CF='all', CS='activity', CADD=false, PROF=null, PSEC='overview', PTF='open', PFC='all', PEDIT=false;
  function loadClients(){ if(!LIVE){ CL={err:'live'}; if(TAB==='clients') renderClients(); return; }
    fetch(API+'/work?admin=1&view=clients',{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); })
      .then(function(j){ CL=j.ok?j:{err:j.error||'fail'}; if(TAB==='clients') renderClients(); }).catch(function(){ CL={err:'net'}; if(TAB==='clients') renderClients(); }); }
  function loadProfile(email,sec){ if(sec) PSEC=sec; PROF={email:email,loading:1,d:PROF&&PROF.email===email?PROF.d:null}; PEDIT=false; renderClients();
    try{ history.replaceState(null,'','#clients/'+encodeURIComponent(email)); }catch(_){}
    fetch(API+'/work?admin=1&profile='+encodeURIComponent(email),{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); })
      .then(function(j){ PROF=j.ok?{email:email,d:j}:{email:email,err:j.error||(LIVE?'fail':'live')}; renderClients(); })
      .catch(function(){ PROF={email:email,err:'net'}; renderClients(); }); }
  function closeProfile(){ PROF=null; try{ history.replaceState(null,'','#clients'); }catch(_){} renderClients(); scrollTo(0,0); }
  // every change made from a profile goes through here, then the profile and the list reload
  function creq(body,btn,ok){ if(!LIVE){ toast('يعمل على الموقع المنشور',true); return Promise.reject(); } if(btn) btn.disabled=true;
    return fetch(API+'/work',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify(body)}).then(function(r){ return r.json().then(function(j){ if(!r.ok||!j.ok) throw new Error(j.error||'fail'); return j; }); })
      .then(function(j){ if(ok) toast(ok); if(PROF) loadProfile(PROF.email); loadClients(); WORK=null; BILL=null; return j; })
      .catch(function(e){ if(btn) btn.disabled=false; toast(({email:'اكتب بريداً صحيحاً',name:'اكتب اسم العميل',title:'اكتب العنوان',date:'اختر تاريخاً صحيحاً','date first':'حدّد الموعد المؤكد أولاً',project:'اختر المشروع','no account':'لا يوجد حساب أو سجل لهذا العميل','not client':'هذا الحساب ليس عميلاً متعاقداً بعد',amount:'اكتب مبلغاً صحيحاً','too much':'المبلغ أكبر من المتبقي',state:'لا يمكن ذلك في حالتها الحالية'})[e.message]||'تعذّر التنفيذ',true); throw e; }); }
  function oreq(body,btn,ok){ if(!LIVE){ toast('يعمل على الموقع المنشور',true); return Promise.reject(); } if(btn) btn.disabled=true;
    return fetch(API+'/orders',{method:'PATCH',headers:headers({'content-type':'application/json'}),body:JSON.stringify(body)}).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'fail'); return j; }); })
      .then(function(j){ ORDERS=ORDERS.map(function(o){ return o.key===j.order.key?Object.assign(o,j.order):o; }); if(ok) toast(ok); renderClients(); renderTabs(); return j; })
      .catch(function(e){ if(btn) btn.disabled=false; toast(e.message==='project'?'هذا المشروع لا يخص العميل':'تعذّر الحفظ',true); throw e; }); }
  var CST={active:'نشط',paused:'متوقف مؤقتاً',archived:'مؤرشف'};
  function hue(s){ var h=0; for(var i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))%360; return h; }
  function avatar(c,big){ var n=String(c.name||c.email||'?').trim(), ini=n.split(/\s+/).slice(0,2).map(function(w){ return w.charAt(0); }).join('').toUpperCase();
    return '<span class="cl-av'+(big?' big':'')+'" style="--h:'+hue(c.email||n)+'">'+(c.logo_url?'<img src="'+esc(c.logo_url)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':esc(ini))+'</span>'; }
  function ago2(s){ if(!s) return '—'; var m=(Date.now()-new Date(s))/6e4; if(m<2) return 'الآن'; if(m<60) return 'قبل '+Math.round(m)+' دقيقة'; if(m<1440) return 'قبل '+Math.round(m/60)+' ساعة'; if(m<2880) return 'أمس';
    return new Date(s).toLocaleDateString('ar-u-nu-latn',{day:'numeric',month:'short',year:'numeric'}); }
  function mmap(o){ var k=Object.keys(o||{}).filter(function(c){ return Math.abs(o[c])>0.009; }); return k.length?k.map(function(c){ return '<span dir="ltr">'+esc(mny(o[c],c))+'</span>'; }).join(' · '):'0'; }
  function ordersOf(email){ return ORDERS.filter(function(o){ return !o.demo&&o.email===email; }); }
  function acctChip(c){ var a=c.account; return a?(a.role==='client'?'<span class="rpill on">عميل متعاقد</span>':'<span class="rpill">عميل عادي</span>'):'<span class="rpill warn">لم ينشئ حساباً بعد</span>'; }
  function enrich(c){ var o=ordersOf(c.email); c._orders=o.length; c._newOrders=o.filter(function(x){ return x.status==='new'; }).length;
    var la=o.map(function(x){ return x.updatedAt||x.createdAt; }).filter(Boolean).sort().pop(); if(la&&(!c.last_activity||la>c.last_activity)) c.last_activity=la;
    c._new=c._newOrders+(c.new_tasks||0); c._late=(c.late_tasks||0)+(c.late_projects||0); return c; }
  var CFL=[['all','الكل'],['client','متعاقدون'],['customer','عاديون'],['new','طلبات جديدة'],['late','متأخرة'],['due','فواتير مستحقة'],['archived','مؤرشفون']];
  function cmatch(c,f){ var arch=c.status==='archived'; if(f==='archived') return arch; if(arch) return false;
    return f==='all'||(f==='client'?c.account&&c.account.role==='client':f==='customer'?!(c.account&&c.account.role==='client'):f==='new'?c._new>0:f==='late'?c._late>0:f==='due'?c.due_invoices>0:true); }
  function renderClients(){
    if(PROF) return renderProfile();
    var A=ACC||{requests:[],invites:[]};
    if(!CL||(!CL.clients&&!CL.err)){ $('#panel').innerHTML='<section class="sec"><div class="skel"><i></i><i></i><i></i></div></section>'; if(!CL) loadClients(); return; }
    if(CL.err) { $('#panel').innerHTML='<section class="sec"><div class="empty">'+(CL.err==='live'?'إدارة العملاء تعمل على الموقع المنشور.':CL.err==='db'?'قاعدة البيانات غير مربوطة.':'تعذّر تحميل العملاء. <button class="btn sm" type="button" data-creload>إعادة المحاولة</button>')+'</div></section>'; return; }
    var all=CL.clients.map(enrich), q=CQ.trim().toLowerCase();
    var list=all.filter(function(c){ return cmatch(c,CF)&&(!q||(c.name+' '+c.email+' '+c.company+' '+c.phone).toLowerCase().indexOf(q)>=0); });
    list.sort(CS==='name'?function(a,b){ return (a.name||a.email).localeCompare(b.name||b.email,'ar'); }:CS==='added'?function(a,b){ return (b.added||'')<(a.added||'')?-1:1; }:function(a,b){ return (b.last_activity||'')<(a.last_activity||'')?-1:(b.last_activity||'')>(a.last_activity||'')?1:0; });
    var pend=A.requests.filter(function(r){return r.status==='pending'});
    $('#panel').innerHTML=
      (pend.length?'<section class="sec acc-req"><h3>طلبات الوصول لمساحة العمل ('+pend.length+')</h3><p class="hint">عملاء حاليون طلبوا الوصول إلى مساحة العمل. لا يحصلون على أي صلاحية قبل موافقتك.</p>'+
        pend.map(function(r){ return '<div class="client"><div><b>'+esc(r.name)+'</b> <span dir="ltr" class="muted small">'+esc(r.email)+'</span>'+(r.company?' · '+esc(r.company):'')+'</div>'+
          (r.note?'<div class="small">'+esc(r.note).replace(/\n/g,'<br>')+'</div>':'')+'<span class="muted small">'+esc(new Date(r.at).toLocaleString('ar'))+'</span>'+
          '<div class="actions"><button class="btn sm primary" type="button" data-aapprove="'+esc(r.email)+'">قبول — تفعيل مساحة العمل</button><button class="btn sm" type="button" data-areject="'+esc(r.email)+'">رفض</button></div>'+
          '<div class="arej" hidden><textarea placeholder="سبب مختصر يوصل للعميل (اختياري)" dir="auto"></textarea><div class="actions"><button class="btn sm danger" type="button" data-arejgo="'+esc(r.email)+'">أرسل الرفض</button></div></div></div>'; }).join('')+'</section>':'')+
      '<section class="sec"><div class="ph"><h3>العملاء ('+all.filter(function(c){ return c.status!=='archived'; }).length+')</h3><button class="btn sm primary" type="button" data-cadd>'+(CADD?'إغلاق':'+ عميل جديد')+'</button></div>'+
      (CADD?'<form class="cl-add" id="clAdd" novalidate><div class="row"><div class="field"><label>الاسم *</label><input name="name" required dir="auto"></div><div class="field"><label>البريد الإلكتروني *</label><input name="email" type="email" dir="ltr" required></div></div>'+
        '<div class="row"><div class="field"><label>الهاتف أو واتساب</label><input name="phone" dir="ltr"></div><div class="field"><label>الشركة أو العلامة</label><input name="company" dir="auto"></div></div>'+
        '<fieldset class="cl-mode"><legend>كيف يدخل العميل؟</legend>'+
          '<label class="check"><input type="radio" name="mode" value="ready" checked> <span><b>أجهّز حسابه الآن</b> وأرسل له الرابط وكلمة سر مؤقتة (يغيّرها عند أول دخول)</span></label>'+
          '<label class="check"><input type="radio" name="mode" value="invite"> <span><b>أرسل له دعوة</b> لينشئ حسابه بنفسه</span></label>'+
          '<label class="check"><input type="radio" name="mode" value="none"> <span><b>سجلّ فقط</b> دون مساحة عمل الآن</span></label></fieldset>'+
        '<div class="row"><div class="field"><label>لغة الحساب والرسالة</label><select name="lang"><option value="ar">العربية</option><option value="en">English</option></select></div>'+
          '<div class="field"><label>مشروع أول (اختياري)</label><input name="pname" dir="auto" placeholder="مثلاً: المحتوى الشهري"></div><div class="field"><label>نوع المشروع</label><select name="ptype">'+Object.keys(WPT).map(function(k){ return '<option value="'+k+'"'+(k==='monthly'?' selected':'')+'>'+WPT[k]+'</option>'; }).join('')+'</select></div></div>'+
        '<label class="check"><input type="checkbox" name="mail"> أرسل بيانات الدخول إلى بريده أيضاً</label>'+
        '<div class="actions"><button class="btn primary sm" type="submit">إضافة العميل وتجهيزه</button></div></form>':'')+
      '<div class="cl-tools"><input type="search" class="cl-q" placeholder="ابحث بالاسم أو البريد أو الهاتف…" value="'+esc(CQ)+'" aria-label="بحث"><select class="cl-sort" aria-label="الترتيب"><option value="activity"'+(CS==='activity'?' selected':'')+'>الأحدث نشاطاً</option><option value="name"'+(CS==='name'?' selected':'')+'>الاسم</option><option value="added"'+(CS==='added'?' selected':'')+'>الأحدث إضافة</option></select></div>'+
      '<div class="chips cl-chips">'+CFL.map(function(x){ var n=all.filter(function(c){ return cmatch(c,x[0]); }).length; return '<button type="button" class="btn sm f-'+x[0]+(CF===x[0]?' primary':'')+'" data-cf="'+x[0]+'">'+x[1]+' <small>'+n+'</small></button>'; }).join('')+'</div>'+
      (list.length?'<div class="cl-list">'+list.map(function(c){
        return '<button type="button" class="cl-row'+(c.status==='archived'?' arch':'')+'" data-copen="'+esc(c.email)+'">'+avatar(c)+
          '<span class="cl-id"><b>'+esc(c.name||c.email)+'</b>'+(c.company?'<small>'+esc(c.company)+'</small>':'')+'<span class="small muted" dir="ltr">'+esc(c.email)+(c.phone?' · '+esc(c.phone):'')+'</span></span>'+
          '<span class="cl-st">'+acctChip(c)+(c.status!=='active'?'<span class="rpill st-'+esc(c.status)+'">'+esc(CST[c.status])+'</span>':'')+'</span>'+
          '<span class="cl-n"><span><b>'+(c.projects||0)+'</b>مشاريع</span><span><b>'+c._orders+'</b>طلبات</span><span><b>'+(c.open_tasks||0)+'</b>مهام مفتوحة</span></span>'+
          '<span class="cl-f">'+(c._new?'<i class="fl new">'+c._new+' جديد</i>':'')+(c._late?'<i class="fl late">متأخر '+c._late+'</i>':'')+(c.due_invoices?'<i class="fl due">'+c.due_invoices+' فاتورة مستحقة</i>':'')+'</span>'+
          '<span class="cl-t small muted">'+esc(ago2(c.last_activity))+'</span></button>'; }).join('')+'</div>'
        :'<div class="empty">'+(all.length?'لا يوجد عملاء يطابقون هذا البحث.':'لا يوجد عملاء بعد. أضف أول عميل من زر «عميل جديد».')+'</div>')+'</section>'+
      (A.invites.length?'<section class="sec"><details><summary class="small">دعوات مفتوحة ('+A.invites.length+')</summary><div class="clients" style="margin-top:10px">'+A.invites.map(function(i){ return '<div class="client inv"><div><b dir="ltr">'+esc(i.email)+'</b>'+(i.name?' · '+esc(i.name):'')+' <span class="muted small">تنتهي '+esc(new Date(i.expires).toLocaleDateString('ar'))+'</span></div><div class="actions"><button class="btn sm" type="button" data-icopy="'+esc(i.token)+'" data-ilang="'+esc(i.lang||'ar')+'">نسخ الرابط</button><button class="btn sm danger" type="button" data-irevoke="'+esc(i.token)+'">إلغاء الدعوة</button></div></div>'; }).join('')+'</div></details></section>':'');
  }
  var PKG=null;
  function pkgMsg(k){ var first=String(k.name||'').split(/\s+/)[0], en=k.lang==='en';
    return en?('Hi '+first+',\nYour Eyeblink Studio workspace is ready'+(k.project?' with the project "'+k.project+'"':'')+'. From there you send your tasks and follow the work, deliveries and invoices.\n\nLink: '+k.link+'\nE-mail: '+k.email+'\nTemporary password: '+k.password+'\n\nYou will choose your own password the first time you sign in.')
      :('أهلاً '+first+'،\nجهّزنا لك مساحة العمل الخاصة بك في Eyeblink Studio'+(k.project?' وفيها مشروع «'+k.project+'»':'')+'، ومنها ترسل مهامك وتتابع التنفيذ والتسليمات والفواتير.\n\nالرابط: '+k.link+'\nالبريد: '+k.email+'\nكلمة السر المؤقتة: '+k.password+'\n\nعند أول دخول ستختار كلمة سر خاصة بك.'); }
  function pkgCard(){ var k=PKG; if(!k||!PROF||k.email!==PROF.email) return ''; var digits=String(k.phone||'').replace(/[^0-9]/g,'');
    return '<section class="sec cl-pkg"><div class="ph"><h3>بيانات دخول العميل</h3><button class="btn sm" type="button" data-pkgx>إغلاق</button></div>'+
      '<p class="hint">تظهر كلمة السر المؤقتة هنا مرة واحدة فقط، ولا تُحفظ إلا مشفّرة. عند أول دخول يختار العميل كلمة سر خاصة به، ولا تُفتح مساحة العمل قبل ذلك.'+(k.sent?' وصلت هذه البيانات إلى بريده أيضاً.':'')+'</p>'+
      '<dl class="pkg-dl"><div><dt>الرابط</dt><dd dir="ltr">'+esc(k.link)+'</dd></div><div><dt>البريد</dt><dd dir="ltr">'+esc(k.email)+'</dd></div><div><dt>كلمة السر المؤقتة</dt><dd dir="ltr" class="pkg-pw">'+esc(k.password)+'</dd></div></dl>'+
      '<pre class="pkg-msg" dir="auto">'+esc(pkgMsg(k))+'</pre>'+
      '<div class="actions"><button class="btn sm primary" type="button" data-pkgcopy>نسخ الرسالة</button><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/'+digits+'?text='+encodeURIComponent(pkgMsg(k))+'">إرسال عبر واتساب'+(digits?'':' (اختر جهة الاتصال)')+'</a><button class="btn sm" type="button" data-pkgpw>نسخ كلمة السر</button></div></section>'; }
  var PSECS=[['overview','نظرة عامة'],['projects','المشاريع'],['orders','الطلبات'],['tasks','المهام'],['billing','الفواتير والمدفوعات'],['files','الملفات'],['log','سجل النشاط']];
  function renderProfile(){ var P=PROF;
    if(P.err) { $('#panel').innerHTML='<section class="sec"><button class="btn sm" type="button" data-pclose>← كل العملاء</button><div class="empty">'+(P.err==='live'?'يعمل هذا القسم على الموقع المنشور.':P.err==='db'?'قاعدة البيانات غير مربوطة.':'تعذّر تحميل ملف العميل.')+'</div></section>'; return; }
    if(!P.d){ $('#panel').innerHTML='<section class="sec"><button class="btn sm" type="button" data-pclose>← كل العملاء</button><div class="skel"><i></i><i></i><i></i></div></section>'; return; }
    var D=P.d, c=D.client||{}, u=D.user, email=P.email, isCl=u.role==='client', ords=ordersOf(email), listC=(CL&&CL.clients||[]).filter(function(x){ return x.email===email; })[0]||{};
    var cnt={projects:D.projects.length,orders:ords.length,tasks:D.tasks.length,billing:D.invoices.length,files:D.files.length+D.delivered.length,log:D.activity.length};
    var head='<section class="sec cp-head"><div class="cp-top"><button class="btn sm" type="button" data-pclose>← كل العملاء</button>'+(P.loading?'<span class="small muted">يُحدَّث…</span>':'')+'</div>'+
      '<div class="cph2">'+avatar({name:c.name||u.name,email:email,logo_url:c.logo_url},true)+'<div class="cp-id"><h2>'+esc(c.name||u.name||email)+'</h2>'+(c.company?'<div>'+esc(c.company)+'</div>':'')+
        '<div class="small muted"><span dir="ltr" style="user-select:all">'+esc(email)+'</span>'+(c.phone?' · <span dir="ltr">'+esc(c.phone)+'</span>':'')+(c.id?' · <span class="code">'+esc(c.id)+'</span>':'')+'</div>'+
        '<div class="cp-chips">'+acctChip({account:D.account?{role:u.role}:null})+'<span class="rpill st-'+esc(c.status||'active')+'">'+esc(CST[c.status||'active'])+'</span>'+(isCl&&u.clientSince?'<span class="small muted">متعاقد منذ '+esc(new Date(u.clientSince).toLocaleDateString('ar'))+'</span>':'')+'</div></div>'+
        '<div class="actions client cp-acts">'+'<button class="btn sm" type="button" data-cedit>'+(PEDIT?'إغلاق التعديل':'تعديل البيانات')+'</button>'+
          (c.status==='archived'?'<button class="btn sm" type="button" data-carch="0">استعادة العميل</button>':'<button class="btn sm" type="button" data-carch="1">أرشفة</button>')+
          (D.account?(isCl?'<button class="btn sm" type="button" data-urole="'+esc(email)+'" data-to="customer">إلغاء مساحة العمل</button>':'<button class="btn sm primary" type="button" data-urole="'+esc(email)+'" data-to="client">ترقية إلى عميل متعاقد</button>')+
            '<button class="btn sm" type="button" data-ctemp>بيانات دخول جديدة</button><button class="btn sm danger" type="button" data-udel="'+esc(email)+'">حذف الحساب</button>':'<button class="btn sm primary" type="button" data-cready>تجهيز حسابه وإصدار بيانات الدخول</button><button class="btn sm" type="button" data-cinvite>إرسال دعوة بدلاً من ذلك</button>')+
          '<div class="newpw small" hidden></div></div></div>'+
      (PEDIT?'<form class="cl-edit" id="clEdit" novalidate><div class="row"><div class="field"><label>الاسم</label><input name="name" dir="auto" value="'+esc(c.name||u.name||'')+'"></div><div class="field"><label>الشركة أو العلامة</label><input name="company" dir="auto" value="'+esc(c.company||'')+'"></div></div>'+
        '<div class="row"><div class="field"><label>الهاتف أو واتساب</label><input name="phone" dir="ltr" value="'+esc(c.phone||'')+'"></div><div class="field"><label>رابط الشعار أو الصورة</label><input name="logo_url" dir="ltr" placeholder="https://" value="'+esc(c.logo_url||'')+'"></div>'+
        '<div class="field"><label>حالة التعامل</label><select name="status">'+Object.keys(CST).map(function(k){ return '<option value="'+k+'"'+((c.status||'active')===k?' selected':'')+'>'+CST[k]+'</option>'; }).join('')+'</select></div></div>'+
        '<div class="field"><label>ملاحظات داخلية (لا يراها العميل)</label><textarea name="notes" dir="auto" rows="3">'+esc(c.notes||'')+'</textarea></div><div class="actions"><button class="btn primary sm" type="submit">حفظ البيانات</button></div></form>'
        :(c.notes?'<div class="cp-notes"><span class="small muted">ملاحظات داخلية</span><p>'+esc(c.notes).replace(/\n/g,'<br>')+'</p></div>':''))+
      '<nav class="cp-tabs" role="tablist">'+PSECS.map(function(x){ return '<button type="button" role="tab" class="t-'+x[0]+'" aria-selected="'+(PSEC===x[0])+'" data-psec="'+x[0]+'">'+x[1]+(cnt[x[0]]?' <small>'+cnt[x[0]]+'</small>':'')+'</button>'; }).join('')+'</nav></section>';
    $('#panel').innerHTML=head+pkgCard()+'<div class="cp-body">'+({overview:pOverview,projects:pProjects,orders:pOrders,tasks:pTasks,billing:pBilling,files:pFiles,log:pLog}[PSEC]||pOverview)(D,ords,listC)+'</div>';
  }
  function kpi(n,l,k){ return '<div class="ck" style="--k:'+k+'"><b>'+n+'</b><span>'+l+'</span></div>'; }
  function due2(D){ var due={},paid={}; D.invoices.forEach(function(x){ if(x.status!=='cancelled') paid[x.currency]=(paid[x.currency]||0)+x.paid-(x.refunded||0); if(x.sent_at&&['pending','partial','overdue'].indexOf(x.state)>=0) due[x.currency]=(due[x.currency]||0)+x.balance; });
    orderBills().filter(function(o){ return o.email===PROF.email; }).forEach(function(o){ paid[o.currency]=(paid[o.currency]||0)+o.paid; if(['pending','partial'].indexOf(o.state)>=0) due[o.currency]=(due[o.currency]||0)+o.balance; }); return {due:due,paid:paid}; }
  var OPENS=['new','review','info','accepted','progress','feedback','revision','final'];
  function pOverview(D,ords){ var td=D.today, m=due2(D), openT=D.tasks.filter(function(t){ return OPENS.indexOf(t.status)>=0; });
    var late=openT.filter(function(t){ return t.confirmed_date&&t.confirmed_date<td&&['feedback','final'].indexOf(t.status)<0; }), newT=D.tasks.filter(function(t){ return t.status==='new'; }), newO=ords.filter(function(o){ return o.status==='new'; });
    var overdue=D.invoices.filter(function(x){ return x.state==='overdue'; });
    return '<section class="sec"><div class="ckpis">'+kpi(D.projects.filter(function(p){ return p.status==='active'; }).length,'مشاريع نشطة','#A78BFA')+kpi(newT.length+newO.length,'طلبات جديدة','#6E8BFF')+kpi(openT.length,'مهام مفتوحة','#3FE0E8')+
        kpi(D.tasks.filter(function(t){ return t.status==='completed'; }).length,'مهام مكتملة','#5EF0B0')+kpi(mmap(m.due),'مستحق الآن','#F5C66B')+kpi(mmap(m.paid),'إجمالي المدفوع','#7DD3FC')+'</div>'+
      '<div class="actions cp-quick"><button class="btn sm primary" type="button" data-pgo="projects" data-pnew="1">+ مشروع جديد</button><button class="btn sm" type="button" data-pgo="tasks" data-pnew="1"'+(D.projects.length?'':' disabled title="أنشئ مشروعاً أولاً"')+'>+ مهمة جديدة</button><button class="btn sm" type="button" data-pinv="'+esc(PROF.email)+'">+ فاتورة جديدة</button></div></section>'+
      ((newT.length||newO.length||late.length||overdue.length)?'<section class="sec"><h3>يحتاج انتباهك</h3><div class="cp-att">'+
        newO.map(function(o){ return '<button type="button" class="cp-a new" data-pgo="orders">طلب جديد <span class="code">'+esc(o.code)+'</span> '+esc(o.packageName||'')+'</button>'; }).join('')+
        newT.map(function(t){ return '<button type="button" class="cp-a new" data-pgo="tasks">مهمة جديدة <span class="code">'+esc(t.ref)+'</span> '+esc(t.title)+'</button>'; }).join('')+
        late.map(function(t){ return '<button type="button" class="cp-a late" data-pgo="tasks">متأخرة منذ '+esc(wd(t.confirmed_date))+' · <span class="code">'+esc(t.ref)+'</span> '+esc(t.title)+'</button>'; }).join('')+
        overdue.map(function(x){ return '<button type="button" class="cp-a due" data-pgo="billing">فاتورة متأخرة <span dir="ltr">'+esc(x.no)+'</span> · المتبقي <span dir="ltr">'+esc(mny(x.balance,x.currency))+'</span></button>'; }).join('')+'</div></section>':'')+
      '<section class="sec"><div class="ph"><h3>آخر النشاطات</h3><button class="btn sm" type="button" data-pgo="log">السجل كاملاً</button></div>'+(D.activity.length?timeline(D,ords).slice(0,8).map(tlRow).join(''):'<div class="empty small">لا يوجد نشاط بعد.</div>')+'</section>';
  }
  function pProjects(D,ords){ var em=PROF.email, canP=D.account?D.user.role==='client':(D.client&&D.client.status!=='archived');
    var val=function(pid){ var o={}; D.invoices.filter(function(x){ return x.project_id===pid&&x.status!=='cancelled'; }).forEach(function(x){ o[x.currency]=(o[x.currency]||0)+x.total; }); return o; };
    return '<section class="sec"><div class="ph"><h3>المشاريع ('+D.projects.length+')</h3>'+(canP?'<button class="btn sm primary" type="button" data-pnewp>+ مشروع جديد</button>':'')+'</div>'+
      (!canP?'<p class="hint">رقِّ الحساب إلى عميل متعاقد أو أرسل له دعوة لتتمكن من فتح مشروع له.</p>':'')+
      '<form class="cl-proj" id="clProj" hidden novalidate><div class="row"><div class="field"><label>اسم المشروع *</label><input name="name" dir="auto" required></div><div class="field"><label>النوع</label><select name="type">'+Object.keys(WPT).map(function(k){ return '<option value="'+k+'">'+WPT[k]+'</option>'; }).join('')+'</select></div></div>'+
        '<div class="row"><div class="field"><label>تاريخ البدء</label><input name="start_date" type="date"></div><div class="field"><label>تاريخ التسليم</label><input name="end_date" type="date"></div><div class="field"><label>الحصة الشهرية (مهام)</label><input name="quota" type="number" min="0" dir="ltr"></div></div>'+
        '<div class="field"><label>وصف مختصر</label><textarea name="description" dir="auto" rows="2"></textarea></div><div class="actions"><button class="btn primary sm" type="submit">إنشاء المشروع</button></div></form>'+
      (D.projects.length?'<div class="cp-projs">'+D.projects.map(function(p){ var lo=ords.filter(function(o){ return o.projectId===p.id; }).length, fl=D.files.filter(function(f){ return f.project_id===p.id; }).length+D.delivered.filter(function(x){ return x.project_id===p.id; }).length, late=p.status==='active'&&p.end_date&&p.end_date<D.today;
        return '<article class="cp-proj'+(late?' late':'')+'"><div class="ph"><div><b>'+esc(p.name)+'</b> <span class="small muted">'+esc(WPT[p.type]||p.type)+'</span></div><select data-pstat="'+esc(p.id)+'" aria-label="حالة المشروع">'+Object.keys(WPS).map(function(k){ return '<option value="'+k+'"'+(p.status===k?' selected':'')+'>'+WPS[k]+'</option>'; }).join('')+'</select></div>'+
          (p.description?'<p class="small cp-desc">'+esc(p.description)+'</p>':'')+
          '<div class="cp-meta small"><span>البدء: <b>'+esc(wd(p.start_date))+'</b></span><span>التسليم: <b class="'+(late?'late':'')+'">'+esc(wd(p.end_date))+'</b></span><span>المهام: <b>'+p.open_tasks+'</b> مفتوحة · <b>'+p.done_tasks+'</b> مكتملة</span><span>الطلبات المرتبطة: <b>'+lo+'</b></span><span>الملفات: <b>'+fl+'</b></span><span>القيمة: <b>'+mmap(val(p.id))+'</b></span></div>'+
          '<div class="actions"><button class="btn sm" type="button" data-pgo="tasks" data-pproj="'+esc(p.id)+'">مهامه</button><button class="btn sm" type="button" data-pgo="files" data-pproj="'+esc(p.id)+'">ملفاته</button><button class="btn sm" type="button" data-pspace="'+esc(p.id)+'">مساحة المشروع (النقاش والجدول والتقارير)</button></div></article>'; }).join('')+'</div>'
        :'<div class="empty small">لا توجد مشاريع لهذا العميل بعد.</div>')+'</section>';
  }
  var OBY={client:'العميل',admin:'الإدارة'};
  function hline(h){ var by=h.by||(h.status==='new'?'client':''); return '<div>'+esc(new Date(h.at).toLocaleString('ar-u-nu-latn',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}))+' · '+(by?esc(OBY[by]||by)+' · ':'')+
    (h.note==='edited'?'عدّل تفاصيل الطلب':h.note==='linked'?'رُبط بمشروع «'+esc(h.project||'')+'»':h.note==='unlinked'?'أُلغي ربطه بالمشروع':esc(ST[h.status]||h.status)+(h.note?' — '+esc(h.note):''))+'</div>'; }
  function pOrders(D,ords){ var act=D.projects.filter(function(p){ return p.status!=='archived'; });
    return '<section class="sec"><h3>الطلبات من الموقع ('+ords.length+')</h3>'+(ords.length?ords.slice().sort(function(a,b){ return a.createdAt<b.createdAt?1:-1; }).map(function(o){
      return '<article class="cp-ord" data-okey="'+esc(o.key)+'"><div class="ph"><div><span class="code">'+esc(o.code)+'</span> <b>'+esc(o.packageName||o.package||'طلب')+'</b> <span class="small muted">'+esc(new Date(o.createdAt).toLocaleDateString('ar-u-nu-latn'))+'</span></div><span class="ostat s-'+esc(o.status)+'">'+esc(ST[o.status]||o.status)+'</span></div>'+
        '<pre class="small">'+esc(o.details||'')+'</pre>'+(o.link?'<div class="small">'+wlinks([{url:o.link}])+'</div>':'')+
        '<div class="cp-meta small"><span>السعر: <b dir="ltr">'+esc(o.price||o.total||'—')+'</b>'+(o.paid?' ✓ مدفوع':'')+'</span>'+(o.deadline?'<span>الموعد: <b>'+esc(o.deadline)+'</b></span>':'')+(o.editedAt?'<span>عدّله العميل '+esc(ago2(o.editedAt))+'</span>':'')+'</div>'+
        '<div class="row cp-orow"><div class="field"><label>الحالة</label><select data-ostat>'+Object.keys(ST).map(function(k){ return '<option value="'+k+'"'+(o.status===k?' selected':'')+'>'+esc(ST[k])+'</option>'; }).join('')+'</select></div>'+
          '<div class="field"><label>مرتبط بمشروع</label><select data-oproj><option value="">— دون مشروع —</option>'+act.map(function(p){ return '<option value="'+esc(p.id)+'"'+(o.projectId===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select></div></div>'+
        '<div class="field"><label>ملاحظات داخلية (لا يراها العميل)</label><textarea data-onote dir="auto" rows="2">'+esc(o.notes||'')+'</textarea></div>'+
        '<div class="actions">'+(o.status==='new'?'<button class="btn sm primary" type="button" data-oset="confirmed">قبول الطلب</button><button class="btn sm danger" type="button" data-oset="cancelled">رفض</button>':'')+'<button class="btn sm" type="button" data-osave>حفظ</button><button class="btn sm" type="button" data-ogo="'+esc(o.key)+'">المحادثة والدفع</button></div>'+
        '<details class="small"><summary>سجل التغييرات ('+(o.history||[]).length+')</summary><div class="wlog">'+(o.history||[]).slice().reverse().map(hline).join('')+'</div></details></article>'; }).join('')
      :'<div class="empty small">لا توجد طلبات من الموقع لهذا العميل.</div>')+'</section>';
  }
  var TGRP={open:OPENS,done:['completed'],closed:['rejected','cancelled'],all:null};
  function pTasks(D){ var list=D.tasks.filter(function(t){ return (!TGRP[PTF]||TGRP[PTF].indexOf(t.status)>=0)&&(!PROF.proj||t.project_id===PROF.proj); }), act=D.projects.filter(function(p){ return p.status==='active'||p.status==='paused'; }), td=D.today;
    return '<section class="sec"><div class="ph"><h3>المهام</h3>'+(act.length?'<button class="btn sm primary" type="button" data-pnewt>+ مهمة جديدة</button>':'')+'</div>'+
      '<form class="cl-task" id="clTask" hidden novalidate><div class="row"><div class="field"><label>المشروع *</label><select name="project">'+act.map(function(p){ return '<option value="'+esc(p.id)+'"'+(PROF.proj===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select></div><div class="field"><label>العنوان *</label><input name="title" dir="auto" required></div></div>'+
        '<div class="row"><div class="field"><label>الأولوية</label><select name="priority">'+Object.keys(WPR).map(function(k){ return '<option value="'+k+'">'+WPR[k]+'</option>'; }).join('')+'</select></div><div class="field"><label>تاريخ الاستحقاق</label><input name="confirmed_date" type="date"></div><div class="field"><label>المسؤول عن التنفيذ</label><input name="assignee" dir="auto" placeholder="اختياري"></div></div>'+
        '<div class="field"><label>الوصف</label><textarea name="description" dir="auto" rows="2"></textarea></div><p class="hint">مع تاريخ الاستحقاق تُنشأ المهمة مقبولة، ودونه تكون قيد المراجعة. يصل إشعار إلى العميل.</p><div class="actions"><button class="btn primary sm" type="submit">إنشاء المهمة</button></div></form>'+
      '<div class="chips">'+[['open','المفتوحة'],['done','المكتملة'],['closed','الملغاة والمرفوضة'],['all','الكل']].map(function(x){ var n=D.tasks.filter(function(t){ return (!TGRP[x[0]]||TGRP[x[0]].indexOf(t.status)>=0)&&(!PROF.proj||t.project_id===PROF.proj); }).length; return '<button type="button" class="btn sm'+(PTF===x[0]?' primary':'')+'" data-ptf="'+x[0]+'">'+x[1]+' <small>'+n+'</small></button>'; }).join('')+
        (D.projects.length>1?'<select class="cp-pf" data-pfilter aria-label="المشروع"><option value="">كل المشاريع</option>'+D.projects.map(function(p){ return '<option value="'+esc(p.id)+'"'+(PROF.proj===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select>':'')+'</div>'+
      (list.length?'<div class="cp-tasks">'+list.map(function(t){ var late=t.confirmed_date&&t.confirmed_date<td&&OPENS.indexOf(t.status)>=0&&['feedback','final'].indexOf(t.status)<0;
        return '<article class="cp-task s-'+esc(t.status)+'" data-tref="'+esc(t.ref)+'"><div class="ph"><div><span class="code">'+esc(t.ref)+'</span> <b>'+esc(t.title)+'</b> <span class="small muted">'+esc(t.project_name)+(t.created_by==='studio'?' · أضافها الاستوديو':'')+'</span></div>'+wpill(t.status)+'</div>'+
          (t.description?'<p class="small cp-desc">'+esc(t.description)+'</p>':'')+
          '<div class="row cp-trow"><div class="field"><label>الحالة</label><select data-tstat>'+Object.keys(WST).map(function(k){ return '<option value="'+k+'"'+(t.status===k?' selected':'')+'>'+esc(WST[k])+'</option>'; }).join('')+'</select></div>'+
            '<div class="field"><label>الأولوية</label><select data-tprio>'+Object.keys(WPR).map(function(k){ return '<option value="'+k+'"'+(t.priority===k?' selected':'')+'>'+WPR[k]+'</option>'; }).join('')+'</select></div>'+
            '<div class="field"><label>تاريخ الاستحقاق'+(late?' <b class="late">متأخرة</b>':'')+'</label><input type="date" data-tdate value="'+esc(t.confirmed_date||'')+'"></div>'+
            '<div class="field"><label>المسؤول</label><input data-tasg dir="auto" value="'+esc(t.assignee||'')+'" placeholder="—"></div></div>'+
          '<div class="actions"><button class="btn sm" type="button" data-tsave>حفظ</button><button class="btn sm" type="button" data-topen="'+esc(t.ref)+'">التفاصيل والتسليمات</button><button class="btn sm danger" type="button" data-tdel>حذف</button>'+
            (t.requested_date?'<span class="small muted">طلب العميل: '+esc(wd(t.requested_date))+'</span>':'')+'</div></article>'; }).join('')+'</div>'
        :'<div class="empty small">'+(D.tasks.length?'لا توجد مهام في هذا الاختيار.':'لا توجد مهام بعد.')+'</div>')+'</section>';
  }
  function pBilling(D){ var m=due2(D), ob=orderBills().filter(function(o){ return o.email===PROF.email; });
    return '<section class="sec"><div class="ph"><h3>الفواتير ('+D.invoices.length+')</h3><button class="btn sm primary" type="button" data-pinv="'+esc(PROF.email)+'">+ فاتورة جديدة</button></div>'+
      '<div class="ckpis">'+kpi(mmap(m.due),'المتبقي المستحق','#F5C66B')+kpi(mmap(m.paid),'إجمالي المدفوع','#5EF0B0')+kpi(D.invoices.filter(function(x){ return x.state==='overdue'; }).length,'فواتير متأخرة','#ff8c9c')+'</div>'+
      (D.invoices.length?'<div class="cp-invs">'+D.invoices.map(function(x){ var st=x.sent_at?x.state:'draft', canPay=x.sent_at&&['pending','partial','overdue'].indexOf(x.state)>=0;
        return '<article class="cp-inv" data-iid="'+esc(x.id)+'"><div class="ph"><div><b dir="ltr">'+esc(x.no)+'</b> '+esc(x.title||'')+' <span class="small muted">'+esc(x.project_name||'')+'</span></div><span class="npill bs-'+esc(st)+'">'+esc(BST[st])+'</span></div>'+
          '<div class="cp-meta small"><span>الإصدار: <b>'+esc(wd(x.issue_date))+'</b></span><span>الاستحقاق: <b class="'+(x.state==='overdue'?'late':'')+'">'+esc(wd(x.due_date))+'</b></span><span>الإجمالي: <b dir="ltr">'+esc(mny(x.total,x.currency))+'</b></span><span>المدفوع: <b dir="ltr">'+esc(mny(x.paid,x.currency))+'</b></span><span>المتبقي: <b dir="ltr">'+esc(mny(x.balance,x.currency))+'</b></span></div>'+
          ((x.payments||[]).length?'<details class="small"><summary>سجل المدفوعات ('+x.payments.length+')</summary><div class="wlog">'+x.payments.map(function(p){ return '<div>'+esc(wd(p.date))+' · <b dir="ltr">'+esc(mny(p.amount,x.currency))+'</b>'+(p.method?' · '+esc(p.method):'')+(p.note?' — '+esc(p.note):'')+'</div>'; }).join('')+'</div></details>':'')+
          '<div class="actions">'+(canPay?'<button class="btn sm primary" type="button" data-ipay>تسجيل دفعة</button>':'')+'<a class="btn sm" href="'+esc(API+'/work?admin=1&invoiceDoc='+encodeURIComponent(x.id))+'" data-idoc>عرض الفاتورة</a><button class="btn sm" type="button" data-iedit>تعديل في تبويب الفوترة</button></div>'+
          (canPay?'<form class="cl-pay" hidden novalidate><div class="row"><div class="field"><label>المبلغ ('+esc(x.currency)+')</label><input name="amount" type="number" min="0" step="0.01" dir="ltr" value="'+esc(x.balance)+'"></div><div class="field"><label>الطريقة</label><input name="method" dir="auto"></div><div class="field"><label>التاريخ</label><input name="date" type="date" value="'+esc(D.today)+'"></div></div>'+
            '<div class="field"><label>ملاحظة</label><input name="note" dir="auto"></div><p class="hint">تُسجَّل الدفعة فقط عند الضغط على «تأكيد الدفعة»، ويصل إلى العميل إيصال بالفاتورة المحدّثة.</p><div class="actions"><button class="btn primary sm" type="submit">تأكيد الدفعة</button></div></form>':'')+'</article>'; }).join('')+'</div>'
        :'<div class="empty small">لا توجد فواتير لهذا العميل.</div>')+
      (ob.length?'<h3 style="margin-top:18px">مدفوعات طلبات الموقع</h3><div class="wlog small">'+ob.map(function(o){ return '<div><span class="code">'+esc(o.code)+'</span> · المدفوع <b dir="ltr">'+esc(mny(o.paid,o.currency))+'</b> · المتبقي <b dir="ltr">'+esc(mny(o.balance,o.currency))+'</b></div>'; }).join('')+'</div>':'')+'</section>';
  }
  var FCAT=Object.assign({},WFC,{delivered:'التسليمات النهائية والنسخ'});
  function pFiles(D){ var items=D.files.map(function(f){ return {id:f.id,cat:f.category,title:f.title,url:f.url,note:f.note,at:f.created_at,pid:f.project_id,pn:f.project_name,by:f.added_by==='studio'?'الاستوديو':f.added_name,studio:f.added_by==='studio'}; })
      .concat(D.delivered.map(function(x){ return {cat:'delivered',title:(x.title||x.task_title)+' — '+(x.is_final?'Final':x.label),url:x.url,at:x.created_at,pid:x.project_id,pn:x.project_name,by:'الاستوديو',ref:x.ref}; }));
    var list=items.filter(function(f){ return (PFC==='all'||f.cat===PFC)&&(!PROF.proj||f.pid===PROF.proj); }), groups={};
    list.forEach(function(f){ (groups[f.pid]=groups[f.pid]||{name:f.pn,items:[]}).items.push(f); });
    return '<section class="sec"><div class="ph"><h3>الملفات ('+items.length+')</h3>'+(D.projects.length?'<button class="btn sm primary" type="button" data-pnewf>+ إضافة ملف</button>':'')+'</div>'+
      '<p class="hint">الملفات محفوظة كروابط (Google Drive وغيره) ومرتبطة بمشروع العميل، فلا يراها إلا هو.</p>'+
      '<form class="cl-file" id="clFile" hidden novalidate><div class="row"><div class="field"><label>المشروع *</label><select name="project">'+D.projects.map(function(p){ return '<option value="'+esc(p.id)+'"'+(PROF.proj===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select></div><div class="field"><label>النوع</label><select name="category">'+Object.keys(WFC).map(function(k){ return '<option value="'+k+'">'+WFC[k]+'</option>'; }).join('')+'</select></div></div>'+
        '<div class="row"><div class="field"><label>الاسم *</label><input name="title" dir="auto"></div><div class="field"><label>الرابط *</label><input name="url" dir="ltr" placeholder="https://"></div></div><div class="actions"><button class="btn primary sm" type="submit">إضافة الملف</button></div></form>'+
      '<div class="chips">'+[['all','الكل']].concat(Object.keys(FCAT).map(function(k){ return [k,FCAT[k]]; })).map(function(x){ var n=items.filter(function(f){ return (x[0]==='all'||f.cat===x[0])&&(!PROF.proj||f.pid===PROF.proj); }).length; return (x[0]==='all'||n)?'<button type="button" class="btn sm'+(PFC===x[0]?' primary':'')+'" data-pfc="'+x[0]+'">'+esc(x[1])+' <small>'+n+'</small></button>':''; }).join('')+
        (D.projects.length>1?'<select class="cp-pf" data-pfilter aria-label="المشروع"><option value="">كل المشاريع</option>'+D.projects.map(function(p){ return '<option value="'+esc(p.id)+'"'+(PROF.proj===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select>':'')+'</div>'+
      (list.length?Object.keys(groups).map(function(k){ var g=groups[k]; return '<div class="cp-fg"><div class="small muted">'+esc(g.name)+'</div>'+g.items.map(function(f){ return '<div class="wfi"><span class="tag">'+esc(FCAT[f.cat]||f.cat)+'</span> '+wlinks([{url:f.url,label:f.title}])+' <span class="small muted">'+esc(f.by||'')+' · '+esc(wd(f.at))+(f.ref?' · '+esc(f.ref):'')+'</span>'+(f.id&&f.studio?' <button class="btn sm danger" type="button" data-fdel="'+esc(f.id)+'">حذف</button>':'')+'</div>'; }).join('')+'</div>'; }).join('')
        :'<div class="empty small">لا توجد ملفات هنا.</div>')+'</section>';
  }
  // one timeline: workspace activity + order history + account log, newest first
  function timeline(D,ords){ var out=[];
    D.activity.forEach(function(a){ var dd=a.data||{}; out.push({at:a.at,who:a.actor==='studio'?'الاستوديو':(a.actor_name||a.actor),studio:a.actor==='studio',what:(AKIND[a.kind]||a.kind)+(a.kind==='status'&&dd.to?' إلى «'+(WST[dd.to]||dd.to)+'»':'')+(dd.no?' '+dd.no:'')+(dd.amount?' ('+mny(dd.amount,dd.cur||'')+')':''),ctx:[a.task_ref||dd.ref,dd.title||dd.name,a.project_name].filter(Boolean).join(' · ')}); });
    ords.forEach(function(o){ (o.history||[]).forEach(function(h,i){ var cli=h.by==='client'||(!h.by&&i===0&&h.status==='new'); out.push({at:h.at,who:cli?'العميل':'الإدارة',studio:!cli,what:h.note==='edited'?'عدّل الطلب':h.note==='linked'?'ربط الطلب بمشروع':h.note==='unlinked'?'ألغى ربط الطلب':h.status==='new'?'أنشأ طلباً':'حالة الطلب: '+(ST[h.status]||h.status),ctx:o.code+(o.packageName?' · '+o.packageName:'')}); }); });
    (D.user.log||[]).forEach(function(l){ out.push({at:l.at,who:{admin:'الإدارة',client:'العميل',system:'النظام'}[l.by]||l.by,studio:l.by!=='client',what:LOGN[l.what]||l.what,ctx:'الحساب'}); });
    return out.filter(function(x){ return x.at; }).sort(function(a,b){ return a.at<b.at?1:-1; }); }
  function tlRow(x){ return '<div class="tl'+(x.studio?' st':'')+'"><i></i><div><b>'+esc(x.who)+'</b> '+esc(x.what)+(x.ctx?'<span class="small muted"> · '+esc(x.ctx)+'</span>':'')+'<div class="small muted">'+esc(new Date(x.at).toLocaleString('ar-u-nu-latn',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}))+'</div></div></div>'; }
  function pLog(D,ords){ var tl=timeline(D,ords); return '<section class="sec"><h3>سجل النشاط ('+tl.length+')</h3>'+(tl.length?'<div class="cp-tl">'+tl.map(tlRow).join('')+'</div>':'<div class="empty small">لا يوجد نشاط بعد.</div>')+'</section>'; }
  var AKIND={task_created:'أنشأ مهمة',status:'غيّر الحالة',date_changed:'غيّر الموعد',info_provided:'أرسل معلومات',date_change_requested:'طلب تغيير موعد',date_change_decided:'قرّر تغيير الموعد',project_created:'فتح مشروعاً',project_updated:'حدّث مشروعاً',
    delivered:'سلّم نسخة',approved:'وافق على نسخة',changes_requested:'طلب تعديلات',comment:'علّق',file_added:'أضاف ملفاً',file_removed:'حذف ملفاً',wa_consent:'وافق على واتساب',wa_withdrawn:'أوقف واتساب',
    invoice_issued:'أصدر فاتورة',invoice_updated:'عدّل فاتورة',invoice_paid:'سجّل دفعة',invoice_payment_removed:'حذف دفعة',invoice_status:'غيّر حالة فاتورة',invoice_sent:'أرسل فاتورة',
    task_edited:'عدّل مهمة',task_deleted:'حذف مهمة',client_added:'أضاف العميل',client_updated:'حدّث بيانات العميل',client_archived:'أرشف العميل',client_restored:'استعاد العميل',comment_project:'كتب في نقاش المشروع'};
  var WPT={once:'مشروع لمرة واحدة',monthly:'تعاون شهري',campaign:'حملة إعلانية',content:'إدارة محتوى',editing:'مونتاج فيديوهات',motion:'موشن غرافيك',commercial:'إنتاج تجاري',custom:'مشروع مخصص'};
  // ---- events (clients tab only) ----
  document.addEventListener('input',function(e){ if(TAB!=='clients') return; var el=e.target; if(el.classList.contains('cl-q')){ CQ=el.value; var pos=el.selectionStart; renderClients(); var n=$('.cl-q'); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(_){} } } });
  document.addEventListener('change',function(e){ if(TAB!=='clients') return; var el=e.target;
    if(el.classList.contains('cl-sort')){ CS=el.value; renderClients(); return; }
    if(el.hasAttribute('data-pfilter')){ PROF.proj=el.value||null; renderClients(); return; }
    if(el.dataset.pstat){ var p=PROF.d.projects.filter(function(x){ return x.id===el.dataset.pstat; })[0]; if(!p) return;
      creq({action:'project',id:p.id,client_email:PROF.email,name:p.name,description:p.description,type:p.type,status:el.value,services:p.services,start_date:p.start_date,end_date:p.end_date,quota:p.quota,drive_url:p.drive_url,auto_report:!!p.auto_report},null,'تحدّثت حالة المشروع').catch(function(){}); } });
  document.addEventListener('submit',function(e){ var f=e.target; if(TAB!=='clients'||!/^cl(Add|Edit|Proj|Task|File)$/.test(f.id)&&!f.classList.contains('cl-pay')) return; e.preventDefault(); var E=f.elements, b=f.querySelector('[type=submit]');
    if(f.id==='clAdd'){ var em=E.email.value.trim().toLowerCase(), nm=E.name.value.trim(), mode=(f.querySelector('[name=mode]:checked')||{}).value||'ready', lang=E.lang.value, pn=E.pname.value.trim(), ph=E.phone.value.trim();
      if(!nm){ toast('اكتب اسم العميل',true); E.name.focus(); return; } if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){ toast('اكتب بريداً صحيحاً',true); E.email.focus(); return; }
      b.disabled=true;
      var proj=function(){ return pn?creq({action:'project',client_email:em,name:pn,type:E.ptype.value},null).catch(function(){}):Promise.resolve(); };
      creq({action:'clientSave',email:em,name:nm,phone:ph,company:E.company.value.trim()},null).then(function(j){
        var done=function(msg){ CADD=false; if(msg) toast(msg); loadProfile(em,'overview'); };
        if(mode==='none') return proj().then(function(){ done('أُضيف العميل'); });
        if(j.account){ var up=j.role==='client'?Promise.resolve():accReq({action:'setRole',email:em,role:'client'},null);
          return up.then(proj).then(function(){ done('لدى العميل حساب أصلاً، فتفعّلت له مساحة العمل. يمكنك إصدار كلمة سر مؤقتة من ملفه إن احتاج.'); },function(){ done(); }); }
        if(mode==='invite') return accReq({action:'invite',email:em,name:nm,lang:lang},null).then(function(r){ return proj().then(function(){ done(r.sent?'أُضيف العميل ووصلته دعوة على بريده':'أُضيف العميل. انسخ رابط الدعوة من «دعوات مفتوحة»'); }); },function(){ done(); });
        return accReq({action:'createAccount',email:em,name:nm,lang:lang,mail:E.mail.checked},null).then(function(r){
          return proj().then(function(){ PKG={email:em,name:nm,password:r.password,link:r.link,lang:r.lang,phone:ph,project:pn,sent:r.sent}; done('جاهز: أرسل للعميل بيانات الدخول'); }); },function(){ done(); });
      }).catch(function(){ b.disabled=false; }); return; }
    if(f.id==='clEdit'){ creq({action:'clientSave',email:PROF.email,name:E.name.value.trim(),company:E.company.value.trim(),phone:E.phone.value.trim(),logo_url:E.logo_url.value.trim(),status:E.status.value,notes:E.notes.value},b,'حُفظت بيانات العميل').catch(function(){}); return; }
    if(f.id==='clProj'){ if(!E.name.value.trim()){ toast('اكتب اسم المشروع',true); return; }
      creq({action:'project',client_email:PROF.email,name:E.name.value.trim(),type:E.type.value,start_date:E.start_date.value,end_date:E.end_date.value,quota:E.quota.value,description:E.description.value.trim()},b,'أُنشئ المشروع').catch(function(){}); return; }
    if(f.id==='clTask'){ if(!E.title.value.trim()){ toast('اكتب عنوان المهمة',true); return; }
      creq({action:'studioTask',project:E.project.value,title:E.title.value.trim(),priority:E.priority.value,confirmed_date:E.confirmed_date.value,assignee:E.assignee.value.trim(),description:E.description.value.trim()},b,'أُنشئت المهمة ووصل إشعار إلى العميل').catch(function(){}); return; }
    if(f.id==='clFile'){ var u=E.url.value.trim(); if(!E.title.value.trim()||!/^https?:\/\/\S+$/i.test(u)){ toast('اكتب الاسم ورابطاً يبدأ بـ https://',true); return; }
      creq({action:'studioFile',project:E.project.value,category:E.category.value,title:E.title.value.trim(),url:u},b,'أُضيف الملف').catch(function(){}); return; }
    if(f.classList.contains('cl-pay')){ var id=f.closest('[data-iid]').dataset.iid, amt=+E.amount.value; if(!(amt>0)){ toast('اكتب مبلغاً صحيحاً',true); return; }
      creq({action:'invoicePay',id:id,amount:amt,method:E.method.value.trim(),date:E.date.value,note:E.note.value.trim()},b,'سُجّلت الدفعة').catch(function(){}); return; }
  });
  document.addEventListener('click',function(e){ if(TAB!=='clients') return; var b=e.target.closest('button,a[data-idoc]'); if(!b) return;
    if(b.hasAttribute('data-idoc')){ e.preventDefault(); docOpen(b.getAttribute('href')); return; }
    if(b.hasAttribute('data-creload')){ CL=null; renderClients(); return; }
    if(b.hasAttribute('data-cadd')){ CADD=!CADD; renderClients(); if(CADD){ var n=$('#clAdd [name=name]'); if(n) n.focus(); } return; }
    if(b.dataset.cf){ CF=b.dataset.cf; renderClients(); return; }
    if(b.dataset.copen){ PSEC='overview'; PTF='open'; PFC='all'; loadProfile(b.dataset.copen); scrollTo(0,0); return; }
    if(b.hasAttribute('data-pclose')){ closeProfile(); return; }
    if(!PROF||!PROF.d) return; var D=PROF.d;
    if(b.dataset.psec){ PSEC=b.dataset.psec; PROF.proj=null; renderClients(); return; }
    if(b.dataset.pgo){ PSEC=b.dataset.pgo; PROF.proj=b.dataset.pproj||null; renderClients(); if(b.dataset.pnew){ var fm=$(PSEC==='projects'?'#clProj':'#clTask'); if(fm){ fm.hidden=false; var i=fm.querySelector('input'); if(i) i.focus(); } } return; }
    if(b.hasAttribute('data-cedit')){ PEDIT=!PEDIT; renderClients(); return; }
    if(b.dataset.carch){ if(b.dataset.carch==='1'&&b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد الأرشفة؟'; return; } creq({action:'clientArchive',email:PROF.email,archive:b.dataset.carch==='1'},b,b.dataset.carch==='1'?'أُرشف العميل':'استُعيد العميل').catch(function(){}); return; }
    if(b.hasAttribute('data-pkgx')){ PKG=null; renderClients(); return; }
    if(b.hasAttribute('data-pkgcopy')||b.hasAttribute('data-pkgpw')){ var tx=b.hasAttribute('data-pkgpw')?PKG.password:pkgMsg(PKG); try{ navigator.clipboard.writeText(tx).then(function(){ toast('نُسخ'); }); }catch(_){ toast(tx); } return; }
    if(b.hasAttribute('data-ctemp')){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد؟ تتوقف كلمة السر الحالية'; return; }
      accReq({action:'tempPassword',email:PROF.email},b).then(function(r){ PKG={email:r.email,name:r.name,password:r.password,link:r.link,lang:r.lang,phone:(D.client&&D.client.phone)||''}; renderClients(); scrollTo(0,0); }).catch(function(){}); return; }
    if(b.hasAttribute('data-cready')){ var cc=D.client||{}; accReq({action:'createAccount',email:PROF.email,name:cc.name||PROF.email.split('@')[0],lang:'ar'},b).then(function(r){ PKG={email:r.email,name:r.name,password:r.password,link:r.link,lang:r.lang,phone:cc.phone||'',project:(D.projects[0]||{}).name}; loadProfile(PROF.email); }).catch(function(){}); return; }
    if(b.hasAttribute('data-cinvite')){ accReq({action:'invite',email:PROF.email,name:(D.client&&D.client.name)||'',lang:'ar'},b).then(function(r){ toast(r.sent?'وصلت الدعوة على بريده':'البريد غير مفعّل: انسخ الرابط من «دعوات مفتوحة»'); }).catch(function(){}); return; }
    if(b.hasAttribute('data-pnewp')){ var fp=$('#clProj'); fp.hidden=!fp.hidden; if(!fp.hidden) fp.querySelector('input').focus(); return; }
    if(b.hasAttribute('data-pnewt')){ var ft=$('#clTask'); ft.hidden=!ft.hidden; if(!ft.hidden) ft.querySelector('[name=title]').focus(); return; }
    if(b.hasAttribute('data-pnewf')){ var ff=$('#clFile'); ff.hidden=!ff.hidden; if(!ff.hidden) ff.querySelector('[name=title]').focus(); return; }
    if(b.dataset.ptf){ PTF=b.dataset.ptf; renderClients(); return; }
    if(b.dataset.pfc){ PFC=b.dataset.pfc; renderClients(); return; }
    if(b.dataset.pspace){ TAB='tasks'; WF={status:'',client:PROF.email,project:''}; render(); loadWork(); loadSpace(b.dataset.pspace); scrollTo(0,0); return; }
    if(b.dataset.topen){ TAB='tasks'; WOPEN=b.dataset.topen; try{ history.replaceState(null,'','#tasks/'+WOPEN); }catch(_){} render(); loadWork(); scrollTo(0,0); return; }
    if(b.dataset.pinv){ TAB='billing'; BFORM={email:b.dataset.pinv}; render(); if(!BILL) loadBilling(); scrollTo(0,0); return; }
    if(b.hasAttribute('data-iedit')){ TAB='billing'; render(); if(!BILL) loadBilling(); scrollTo(0,0); return; }
    if(b.hasAttribute('data-ipay')){ var fpay=b.closest('[data-iid]').querySelector('.cl-pay'); fpay.hidden=!fpay.hidden; if(!fpay.hidden) fpay.querySelector('input').focus(); return; }
    if(b.dataset.fdel){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد الحذف؟'; return; } creq({action:'removeFile',id:b.dataset.fdel},b,'حُذف الملف').catch(function(){}); return; }
    var tc=b.closest('[data-tref]');
    if(tc&&b.hasAttribute('data-tsave')){ var ref=tc.dataset.tref, t=D.tasks.filter(function(x){ return x.ref===ref; })[0]; if(!t) return;
      var st=tc.querySelector('[data-tstat]').value, pr=tc.querySelector('[data-tprio]').value, dt=tc.querySelector('[data-tdate]').value, as=tc.querySelector('[data-tasg]').value.trim(), jobs=[];
      b.disabled=true;
      var post=function(body){ return fetch(API+'/work',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify(body)}).then(function(r){ return r.json().then(function(j){ if(!r.ok||!j.ok) throw new Error(j.error||'fail'); return j; }); }); };
      var chain=Promise.resolve();
      if(pr!==t.priority||as!==(t.assignee||'')) chain=chain.then(function(){ return post({action:'taskEdit',task:ref,priority:pr,assignee:as}); });
      if(dt&&dt!==t.confirmed_date) chain=chain.then(function(){ return post({action:'date',task:ref,confirmed_date:dt}); });
      if(st!==t.status) chain=chain.then(function(){ return post({action:'status',task:ref,status:st}); });
      chain.then(function(){ toast('حُفظت المهمة'); loadProfile(PROF.email); loadClients(); WORK=null; })
        .catch(function(er){ b.disabled=false; toast(er.message==='date first'?'حدّد تاريخ الاستحقاق قبل قبول المهمة':er.message==='date'?'اختر تاريخاً صحيحاً':'تعذّر الحفظ',true); loadProfile(PROF.email); }); return; }
    if(tc&&b.hasAttribute('data-tdel')){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد الحذف؟ لا يمكن التراجع'; return; } creq({action:'taskDelete',task:tc.dataset.tref},b,'حُذفت المهمة').catch(function(){}); return; }
    var oc=b.closest('[data-okey]');
    if(oc){ var key=oc.dataset.okey, o=ORDERS.filter(function(x){ return x.key===key; })[0]; if(!o) return;
      if(b.dataset.oset){ if(b.dataset.oset==='cancelled'&&b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد الرفض؟'; return; } oreq({key:key,status:b.dataset.oset},b,b.dataset.oset==='confirmed'?'قُبل الطلب ووصل للعميل إشعار':'رُفض الطلب').then(function(){ loadProfile(PROF.email); }).catch(function(){}); return; }
      if(b.hasAttribute('data-osave')){ var body={key:key}, s2=oc.querySelector('[data-ostat]').value, pj=oc.querySelector('[data-oproj]').value, nt=oc.querySelector('[data-onote]').value;
        if(s2!==o.status) body.status=s2; if(pj!==(o.projectId||'')) body.project=pj; if(nt!==(o.notes||'')) body.notes=nt;
        if(Object.keys(body).length<2){ toast('لا تغييرات'); return; } oreq(body,b,'حُفظ الطلب').then(function(){ loadProfile(PROF.email); }).catch(function(){}); return; }
      if(b.dataset.ogo){ TAB='orders'; render(); var x=document.querySelector('.order[data-key="'+key+'"]')||document.querySelector('[data-k="'+key+'"]'); if(x&&x.scrollIntoView) x.scrollIntoView({block:'start'}); return; }
    }
  });
  function docOpen(src){ var w=window.open('about:blank','_blank'); fetch(src,{headers:headers({})}).then(function(r){ return r.text(); }).then(function(h){ if(w){ w.document.open(); w.document.write(h); w.document.close(); } }).catch(function(){ if(w) w.close(); toast('تعذّر فتح الفاتورة',true); }); }

  var LOGN={'account prepared by the studio':'جهّز الاستوديو حسابه','temporary password issued':'أُصدرت له بيانات دخول جديدة','chose a new password':'اختار كلمة سر جديدة','requested workspace access':'طلب الوصول لمساحة العمل','accepted the invitation':'قبل الدعوة','invited to the workspace':'أُرسلت إليه دعوة','access request approved':'قُبل طلب الوصول','access request declined':'رُفض طلب الوصول','upgraded to Active Client':'ترقية إلى عميل متعاقد','workspace access removed':'أُلغيت مساحة العمل'};
  document.addEventListener('submit',function(e){ var f=e.target; if(f.id!=='invForm') return; e.preventDefault();
    var E=f.elements, b=f.querySelector('button[type=submit]');
    accReq({action:'invite',email:E.email.value.trim(),name:E.name.value.trim(),lang:E.lang.value,note:E.note.value.trim()},b).then(function(j){
      var out=f.querySelector('.inv-out'); out.hidden=false;
      out.innerHTML=(j.sent?'✓ وصلت الدعوة على بريده.':'⚠️ لم يُرسل البريد (البريد الإلكتروني غير مفعّل). انسخ الرابط وأرسله إلى العميل:')+'<div class="lnk" dir="ltr">'+esc(j.link)+'</div><button class="btn sm" type="button" data-copylink="'+esc(j.link)+'">نسخ الرابط</button>';
    }).catch(function(){});
  });
  document.addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b||TAB!=='clients') return;
    if(b.dataset.ufilter){ UFILTER=b.dataset.ufilter; renderClients(); return; }
    if(b.dataset.aapprove){ accReq({action:'approve',email:b.dataset.aapprove},b,'تفعّلت مساحة العمل ووصل للعميل إيميل').catch(function(){}); return; }
    if(b.dataset.areject){ var bx=b.closest('.client').querySelector('.arej'); bx.hidden=!bx.hidden; return; }
    if(b.dataset.arejgo){ var r=b.closest('.arej').querySelector('textarea').value.trim(); accReq({action:'reject',email:b.dataset.arejgo,reason:r},b,'رُفض الطلب وأُرسل بريد إلى العميل').catch(function(){}); return; }
    if(b.dataset.urole){ if(b.dataset.to==='customer'&&b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='هل أنت متأكد؟ اضغط مرة أخرى'; return; }
      accReq({action:'setRole',email:b.dataset.urole,role:b.dataset.to},b,b.dataset.to==='client'?'أصبح عميلاً متعاقداً، ووصله بريد إلكتروني':'أُلغيت مساحة العمل').catch(function(){}); return; }
    if(b.dataset.irevoke){ accReq({action:'revoke',token:b.dataset.irevoke},b,'أُلغيت الدعوة').catch(function(){}); return; }
    if(b.dataset.icopy||b.dataset.copylink){ var l=b.dataset.copylink||('https://eyeblinkstudio.com'+(b.dataset.ilang==='en'?'/en':'')+'/account.html?invite='+b.dataset.icopy);
      try{ navigator.clipboard.writeText(l).then(function(){ toast('نُسخ الرابط'); }); }catch(_){ toast(l); } return; }
    if(b.hasAttribute('data-ulog')){ var lg=b.closest('.client').querySelector('.ulog'); if(lg) lg.hidden=!lg.hidden; return; }
  });
  document.addEventListener('click',function(e){
    var b=e.target.closest('button'); if(!b) return;
    if(b.dataset.upw){ var email=b.dataset.upw, pw=Math.random().toString(36).slice(2,7)+'-'+Math.random().toString(36).slice(2,7), box=b.closest('.client').querySelector('.newpw');
      var show=function(){ box.hidden=false; box.innerHTML='كلمة السر الجديدة: <b dir="ltr" style="user-select:all">'+pw+'</b> — انسخها وأرسلها للعميل.'; };
      if(!LIVE){ show(); return; }
      fetch(API+'/users',{method:'PATCH',headers:headers({'content-type':'application/json'}),body:JSON.stringify({email:email,password:pw})}).then(function(r){ if(!r.ok) throw 0; show(); }).catch(function(){ toast('تعذّر التغيير',true); }); return; }
    if(b.dataset.udel){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد الحذف؟'; return; }
      var em=b.dataset.udel, rm=function(){ USERS=USERS.filter(function(u){return u.email!==em}); renderClients(); };
      if(!LIVE){ rm(); return; }
      fetch(API+'/users?email='+encodeURIComponent(em),{method:'DELETE',headers:headers({})}).then(function(r){ if(!r.ok) throw 0; rm(); }).catch(function(){ toast('تعذّر الحذف',true); }); }
  });

  /* ---------------- settings ---------------- */
  function renderSettings(){
    var S=C.settings=C.settings||{}; var T=(P&&P.templates)||DEFAULT_TPL;
    var tog=function(k,l){ return '<label class="check"><input type="checkbox" data-p="settings.'+k+'" data-t="check"'+(S[k]!==false?' checked':'')+'> '+l+'</label>'; };
    $('#panel').innerHTML=
      '<section class="sec"><h3>ما يظهر على الموقع</h3>'+tog('showStats','خانة الأرقام في الرئيسية')+tog('showWorkTeaser','الأعمال في الرئيسية')+tog('showPackagesTeaser','الباقات في الرئيسية')+tog('showPayments','طرق الدفع (صفحة الباقات وأسفل الموقع)')+tog('ordersOpen','استقبال الطلبات من صفحة الباقات')+'</section>'+
      '<section class="sec"><h3>التنبيهات</h3><p class="hint">يرسل رسالة تجريبية عبر تيليغرام ورسالة بريد تجريبية، ويعرض ردّ كل منهما. (بعد أي تغيير في متغيرات Cloudflare يلزم إجراء Retry deployment.)</p><div><button class="btn" type="button" id="notifyTest">أرسل تنبيهاً تجريبياً</button></div><pre id="notifyOut" class="small" hidden style="white-space:pre-wrap;margin-top:10px"></pre></section>'+
      '<section class="sec"><h3>تسجيل العملاء عبر Google</h3><p class="hint">العملاء يسجّلون بالإيميل وكلمة السر دائماً. لإضافة زر «المتابعة عبر Google» الصق هنا الـ Client ID من Google Cloud (ينتهي بـ apps.googleusercontent.com) ثم انشر.</p>'+
        '<div class="field"><label>Google Client ID</label><input data-p="settings.googleClientId" data-t="text" dir="ltr" value="'+esc(S.googleClientId||'')+'" placeholder="1234567890-xxxx.apps.googleusercontent.com"></div></section>'+
      '<section class="sec"><h3>عنوان علامة التبويب لكل صفحة</h3><p class="hint">النص الذي يظهر في تبويب المتصفح. اتركه فارغاً ليبقى العنوان الافتراضي (الظاهر باهتاً).</p>'+
        PAGES.map(function(pg){ var v=(C.titles&&C.titles[pg[0]])||{};
          return '<div class="field"><label>'+esc(pg[1])+'</label><div class="bi"><div><small>عربي</small><input data-p="titles.'+pg[0]+'.ar" data-t="text" value="'+esc(v.ar||'')+'" placeholder="'+esc(pg[2])+'"></div><div><small>ENGLISH</small><input data-p="titles.'+pg[0]+'.en" data-t="text" dir="ltr" value="'+esc(v.en||'')+'" placeholder="'+esc(pg[3])+'"></div></div></div>'; }).join('')+'</section>'+
      '<section class="sec"><h3>وسائل تواصل إضافية</h3><p class="hint">تظهر في صفحة التواصل، وكأزرار «تواصل خارجي» داخل حساب العميل.</p><div class="row">'+
        '<div class="field"><label>رقم واتساب (مع رمز الدولة)</label><input data-p="settings.whatsapp" data-t="text" dir="ltr" value="'+esc(S.whatsapp||'')+'" placeholder="+9715XXXXXXXX"></div>'+
        '<div class="field"><label>البريد الإلكتروني</label><input data-p="settings.email" data-t="text" dir="ltr" value="'+esc(S.email||'')+'"></div></div></section>'+
      '<section class="sec"><h3>رسائل الرد الجاهزة</h3><p class="hint">تُستخدم في صندوق الطلبات. المتغيرات: {name} {code} {package} {price} {method} {details} — و{details} تُملأ من «تفاصيل الدفع الخاصة».</p>'+
        ['confirm','paid','delivered'].map(function(k){ var lab={confirm:'تأكيد + تفاصيل الدفع',paid:'وصل الدفع',delivered:'تم التسليم'}[k];
          return '<div class="field"><label>'+lab+'</label><div class="bi"><div><small>عربي</small><textarea data-tpl="ar.'+k+'">'+esc((T.ar||{})[k]||'')+'</textarea></div><div><small>ENGLISH</small><textarea data-tpl="en.'+k+'" dir="ltr">'+esc((T.en||{})[k]||'')+'</textarea></div></div></div>'; }).join('')+'</section>'+
      '<section class="sec"><h3>كلمة سر اللوحة</h3>'+(LIVE?'<p class="hint">10 أحرف على الأقل. ستُطلب منك عند الدخول القادم.</p><div class="row"><div class="field"><label>كلمة السر الجديدة</label><input type="password" id="np1" autocomplete="new-password"></div><div class="field"><label>أعد كتابتها</label><input type="password" id="np2" autocomplete="new-password"></div></div><div><button class="btn primary" type="button" id="pwChange">تغيير كلمة السر</button></div>'
        :'<p class="hint">تغيير كلمة السر يعمل بعد نشر الموقع على Cloudflare. الدخول الأول يكون بكلمة السر التي تضعها في إعدادات Cloudflare (ADMIN_PASSWORD).</p>')+'</section>';
    var nt=$('#notifyTest'); if(nt) nt.onclick=function(){ var out=$('#notifyOut'); out.hidden=false;
      if(!LIVE){ out.textContent='يعمل على الموقع المنشور فقط.'; return; } out.textContent='…';
      fetch(API+'/notify-test',{method:'POST',headers:headers({})}).then(function(r){ return r.json(); }).then(function(j){
        var tr=function(d){ d=String(d||''); if(/chat not found/i.test(d)) return 'رقم TELEGRAM_CHAT غير صحيح، أو لم ترسل رسالة إلى البوت بعد.'; if(/Unauthorized|Not Found/i.test(d)) return 'TELEGRAM_TOKEN غير صحيح أو أُلغي. انسخه من جديد من BotFather.'; if(/not set/i.test(d)) return 'المتغيّر غير موجود (أو لم تُجرِ Retry deployment بعد).'; return d; };
        out.textContent='تيليغرام: '+(j.telegram&&j.telegram.ok?'✅ وصلت':'❌ '+tr(j.telegram&&j.telegram.description))+'\nالإيميل: '+(j.email&&j.email.ok?'✅ '+j.email.description:'❌ '+tr(j.email&&j.email.description)); })
        .catch(function(){ out.textContent='تعذّر الاتصال.'; }); };
    var pc=$('#pwChange'); if(pc) pc.onclick=function(){
      var a=$('#np1').value, b2=$('#np2').value;
      if(a.length<10){ toast('10 أحرف على الأقل',true); return; } if(a!==b2){ toast('الكلمتان غير متطابقتين',true); return; }
      fetch(API+'/auth',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({newPassword:a})})
        .then(function(r){ if(!r.ok) throw 0; PW=a; try{ sessionStorage.setItem('eb-pw',a); }catch(_){} $('#np1').value=$('#np2').value=''; toast('تغيّرت كلمة السر'); })
        .catch(function(){ toast('تعذّر التغيير',true); });
    };
  }
  document.addEventListener('input',function(e){
    var k=e.target.dataset.tpl; if(!k) return; P=P||{}; P.templates=P.templates||JSON.parse(JSON.stringify(DEFAULT_TPL));
    var q=k.split('.'); P.templates[q[0]][q[1]]=e.target.value; dirty(); savePrivDraft();
  });

  /* ---------------- backup ---------------- */
  function renderBackup(){
    $('#panel').innerHTML='<section class="sec"><h3>تصدير نسخة</h3><p class="hint">انسخ المحتوى الكامل واحفظه في ملف نصي باسم content.json.</p>'+
      '<textarea id="exportBox" dir="ltr" style="min-height:220px;font-family:monospace;font-size:12px" readonly>'+esc(JSON.stringify(C,null,1))+'</textarea>'+
      '<div><button class="btn" type="button" id="copyExport">نسخ</button></div></section>'+
      '<section class="sec"><h3>استيراد نسخة</h3><p class="hint">اختر ملف content.json محفوظاً سابقاً. سيحل محل المحتوى الحالي في اللوحة (لن يُنشر حتى تضغط «نشر التعديلات»).</p>'+
      '<input type="file" id="importFile" accept="application/json,.json"></section>'+
      '<section class="sec"><h3>تجاهل المسودة</h3><p class="hint">يعيد اللوحة إلى آخر نسخة منشورة.</p><div><button class="btn danger" type="button" id="resetDraft">تجاهل المسودة</button></div></section>';
    $('#copyExport').onclick=function(){ var t=$('#exportBox'); try{ navigator.clipboard.writeText(t.value).then(function(){toast('تم النسخ')},function(){t.select()}); }catch(_){ t.select(); } };
    $('#importFile').onchange=function(){ var f=this.files[0]; if(!f) return; f.text().then(function(txt){ var j=JSON.parse(txt); if(!j.services) throw 0; C=j; saveDraft(); dirty(); toast('تم الاستيراد'); }).catch(function(){ toast('الملف غير صالح',true); }); };
    $('#resetDraft').onclick=function(){ try{ localStorage.removeItem('eb-draft'); localStorage.removeItem('eb-preview'); }catch(_){} C=JSON.parse(SAVED); dirty(); toast('عادت اللوحة للنسخة المنشورة'); };
  }

  var MIG=/*MIG*/{"نراجع طلبك ونرد عليك بحسابك خلال 24 ساعة": "نراجع طلبك ونرد عليك في حسابك خلال 24 ساعة", "نتفق على التفاصيل والموعد، وبعدها توصلك تفاصيل الدفع": "نتفق على التفاصيل والموعد، ثم تصلك تفاصيل الدفع", "نبدأ التنفيذ، وتتابع كل مرحلة وتحكي معنا لحد التسليم": "نبدأ التنفيذ، وتتابع كل مرحلة وتتواصل معنا حتى التسليم", "شو بيصير بعد الإرسال؟": "ماذا يحدث بعد الإرسال؟", "بعد الضغط على «أرسل الطلب» تسجّل دخولك بالإيميل أو Google، لتتابع طلبك وتتحدث معنا من حسابك.": "بعد الضغط على «أرسل الطلب» تسجّل دخولك بالبريد الإلكتروني أو Google، لتتابع طلبك وتتواصل معنا من حسابك.", "حسب البريف": "حسب المتطلبات"}/*/MIG*/;
  function reword(x){ if(typeof x==='string') return MIG.hasOwnProperty(x)?MIG[x]:x; if(Array.isArray(x)) return x.map(reword); if(x&&typeof x==='object'){ for(var k in x) x[k]=reword(x[k]); } return x; }
  /* ---------------- boot ---------------- */
  function loadContent(){
    var fromFile=function(){
      if(!onHttp && window.EB_SEED) return Promise.resolve(JSON.parse(JSON.stringify(window.EB_SEED)));
      return fetch('../content.json',{cache:'no-store'}).then(function(r){ if(!r.ok) throw 0; return r.json(); })
        .catch(function(){ if(window.EB_SEED) return JSON.parse(JSON.stringify(window.EB_SEED)); throw new Error('no content'); });
    };
    var p= LIVE? fetch(API+'/content',{cache:'no-store'}).then(function(r){ return r.ok? r.json() : fromFile(); }).catch(fromFile) : fromFile();
    return p.then(function(j){
      if(window.EB_SEED) for(var sk in EB_SEED) if(!(sk in j)) j[sk]=JSON.parse(JSON.stringify(EB_SEED[sk]));   // sections added since the last publish
      j=reword(j);   // retired default wording → current
      SAVED=JSON.stringify(j);
      var draft=null; try{ draft=JSON.parse(localStorage.getItem('eb-draft')||'null'); }catch(_){}
      C= (draft && JSON.stringify(draft)!==SAVED && !LIVE)? draft : j;
      if(!LIVE && draft) SAVED=JSON.stringify(draft);
      $('#login').hidden=true; $('#app').hidden=false;
      $('#mode').innerHTML= LIVE? '<b>متصل بالموقع</b><br>«نشر التعديلات» يحدّث الموقع فوراً.' : '<b>وضع المعاينة</b><br>لا يوجد خادم هنا، فالتعديلات تُحفظ في هذا المتصفح. اضغط «معاينة» لرؤيتها على الموقع.';
      var loadPriv= LIVE? fetch(API+'/private',{headers:headers({})}).then(function(r){return r.ok?r.json():{data:null}}).then(function(j){ return j.data; }).catch(function(){return null;})
                         : Promise.resolve((function(){ try{ return JSON.parse(localStorage.getItem('eb-private')||'null'); }catch(_){ return null; } })());
      return loadPriv.then(function(pd){ P=pd||{payments:{},templates:JSON.parse(JSON.stringify(DEFAULT_TPL))}; PSAVED=JSON.stringify(P);
        var wm=/^#(?:work|tasks)\/(T-[A-Z0-9]+)$|^#tasks$/.exec(location.hash); if(wm){ TAB='tasks'; WOPEN=wm[1]||null; }
        var cm=/^#clients(?:\/(.+))?$/.exec(location.hash); if(cm) TAB='clients'; if(location.hash==='#team') TAB='team';
        render(); dirty(); loadOrders(); loadUsers(); loadWork(); loadNotify(); loadBilling(); loadTeam(); loadFx(); if(cm&&cm[1]) loadProfile(decodeURIComponent(cm[1])); });
    }).catch(function(){ $('#loginMsg').textContent='تعذّر تحميل محتوى الموقع. افتح اللوحة من نفس مجلد الموقع.'; });
  }
  $('#loginForm').addEventListener('submit',function(e){
    e.preventDefault(); var pw=$('#pw').value; var msg=$('#loginMsg'); msg.textContent='…';
    if(!onHttp){ LIVE=false; loadContent(); return; }
    fetch(API+'/auth',{headers:{'authorization':'Bearer '+pw},cache:'no-store'}).then(function(r){
      // only trust replies that come from our own function (JSON with an "ok" field); anything else = no server here
      return r.text().then(function(t){ var j=null; try{ j=JSON.parse(t); }catch(_){}
        if(!j || typeof j.ok!=='boolean'){ LIVE=false; return loadContent(); }
        if(r.status===200 && j.ok){ PW=pw; LIVE=true; try{ sessionStorage.setItem('eb-pw',pw); }catch(_){} return loadContent(); }
        if(r.status===500){ msg.textContent='لم تُضبط كلمة السر على Cloudflare بعد (ADMIN_PASSWORD).'; return; }
        msg.textContent='كلمة السر غير صحيحة.';
      });
    }).catch(function(){ LIVE=false; loadContent(); });
  });
  try{ var saved=sessionStorage.getItem('eb-pw'); if(saved){ $('#pw').value=saved; $('#loginForm').requestSubmit(); } }catch(_){}
})();
