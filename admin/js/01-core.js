/* Eyeblink admin — edits content.json through /api (Cloudflare) or, without a server, as a local draft. */
  var API='/api', PW='', LIVE=false, C=null, SAVED='', TAB='today', ORDERS=[], P=null, PSAVED='', OFILTER='all', USERS=null;
  var $=function(s,r){return (r||document).querySelector(s)};
  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function toast(t,bad){ var d=$('#toast'); d.textContent=t; d.className='toast'+(bad?' bad':''); d.hidden=false; clearTimeout(d._t); d._t=setTimeout(function(){d.hidden=true},2600); }
  function get(o,p){ return p.split('.').reduce(function(a,k){return a==null?a:a[k]},o); }
  function set(o,p,v){ var ks=p.split('.'), last=ks.pop(); var t=ks.reduce(function(a,k){ if(a[k]==null) a[k]=/^\d+$/.test(k)?[]:{}; return a[k]; },o); t[last]=v; }
  function bi(a,e){ return {ar:a||'',en:e||''}; }
  function headers(extra){ var h={}; for(var k in extra) h[k]=extra[k]; return h; }   // the session cookie (HttpOnly, /api/ only) carries the sign-in
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
    [].forEach.call(document.querySelectorAll('[data-p$=".en"]'),function(el){ var x=pairAt(el.dataset.p.slice(0,-3)); var isA=!!(x&&!enEmpty(x.o)&&auto[pk(x.o)]); el.parentNode.classList.toggle('is-auto',isA);
      var fl=el.closest('.field'), sp=fl&&fl.querySelector('.enl>span'); if(sp){ sp.textContent=enPrev(el.value); if(el.value) sp.dir='ltr'; else sp.removeAttribute('dir'); fl.querySelector('.enauto').hidden=!isA; } }); }
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
  // work projects as a list + panel: the cover as a thumbnail, the service and year under the name, four tabs
  var WSPLIT={all:'كل المشاريع', addL:'+ مشروع',
    thumb:function(x){ return x.poster||''; },
    sub:function(x){ var s=(C.services||[]).filter(function(v){ return v.id===x.service; })[0], cs=['brief','challenge','idea','execution','result'].some(function(k){ return x[k]&&x[k].ar; });
      return [(s&&s.name&&s.name.ar)||'',x.year||''].filter(Boolean).join(' · ')+(cs?' · دراسة حالة':''); },
    tag:function(x,i){ var shown=(C.projects||[]).slice(0,i+1).filter(function(y){ return !y.private; }).length;
      return x.private?['خاص · بالرابط','off']:!x.preview&&!x.poster?['بلا معاينة','fix']:shown<=3?['بالرئيسية']:null; },
    share:true,
    tabs:[['الأساسي',[0,1,2,3]],['الفيديو',[11,12,13,14]],['دراسة الحالة',[4,5,6,7,8,9]],['الكواليس',[10]]]};
  var SVC=function(){ return (C.services||[]).map(function(s){return [s.id, (s.name&&s.name.ar)||s.id]}); };
  var TABS=[
    {id:'today', title:'اليوم', today:1},
    {id:'home', title:'الرئيسية', grp:'محتوى الموقع', secs:[
      {h:'شريط الإطلاق (Early Access)', hint:'سطر رفيع تحت القائمة العلوية بكل صفحات الموقع. الزائر يقدر يسكّره. يختفي وحده بعد تاريخ الانتهاء أو لما يكتمل العدد. اكتب أرقاماً حقيقية فقط.', fields:[
        {p:'launch.show', t:'check', l:'إظهار شريط الإطلاق'},
        {p:'launch.text', t:'bi', l:'النص', hint:'مثال: إطلاق Eyeblink Studio · نستقبل عدداً محدوداً من المشاريع بشروط الإطلاق'},
        {row:[{p:'launch.cta', t:'bi', l:'نص الرابط'},{p:'launch.link', t:'text', l:'الرابط', ltr:1, hint:'مثال: pricing أو contact'}]},
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
      {h:'المشاريع', hint:'أول 3 مشاريع تظهر في الرئيسية. المعاينة: 6–8 ثوانٍ بدون صوت، حتى 5MB. الفيديو الكامل الأفضل على Vimeo أو YouTube.', rep:{p:'projects', split:WSPLIT,
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
      {h:'نبذة عنّا', fields:[{p:'about.bioH', t:'bi', l:'العنوان'},{p:'about.bio', t:'bilist', l:'الفقرات', hint:'كل فقرة بسطر'},{p:'about.values', t:'bilist', l:'القيم', hint:'كل قيمة بسطر'}]} ]},
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
    {id:'support', title:'الدعم', support:1},
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
        return '<div class="field"><label>'+esc(f.l)+'</label><div class="bi1">'+inp('ar',a)+'</div>'+
          '<div class="enl"><span'+(e?' dir="ltr"':'')+'>'+esc(enPrev(e))+'</span><em class="enauto" hidden>تلقائي</em><button type="button" class="linkbtn small" data-enx>تعديل الإنجليزي</button></div><div class="enw" hidden>'+inp('en',e)+'</div>'+hint+'</div>';
      case 'media':
        var isV=/video/.test(f.accept||''), prev=v? (isV?'<video class="thumb" src="'+esc(abs(v))+'" muted></video>':'<img class="thumb" alt="" src="'+esc(abs(v))+'">') : '';
        return '<div class="field">'+lab+'<div class="media">'+prev+'<input id="'+id+'"'+d+' dir="ltr" placeholder="رابط أو ارفع ملفاً" value="'+esc(v)+'"><label class="btn sm">رفع<input type="file" accept="'+esc(f.accept||'*/*')+'" data-upload="'+esc(f.p)+'" hidden></label>'+
          (f.make?'<label class="btn sm primary">صنع من الفيديو<input type="file" accept="video/*" data-make="'+esc(f.p)+'" hidden></label>':'')+'</div><p class="mkstate small" data-mkstate="'+esc(f.p)+'" hidden></p>'+hint+'</div>';
    }
    return '';
  }
  // the folded English: one quiet line under the Arabic
  function enPrev(e){ e=String(e||'').replace(/\n/g,' · '); return e?'EN · '+(e.length>120?e.slice(0,120)+'…':e):'الإنجليزي بيتولّد لحاله'; }
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-enx]'); if(!b) return; var w=b.closest('.field').querySelector('.enw'); w.hidden=!w.hidden;
    b.textContent=w.hidden?'تعديل الإنجليزي':'إخفاء الإنجليزي'; if(w.hidden) decorate(); else { var i=w.querySelector('input,textarea'); if(i) i.focus(); } });
  function abs(u){ return /^(https?:|data:|blob:|\/)/.test(u)? u : '../'+u; }

  /* ---------------- render ---------------- */
  function render(){
    route();   // every way into a section (shortcuts from «Today», profiles, billing links) keeps the address in step
    renderTabs();
    var tab=TABS.filter(function(t){return t.id===TAB})[0];
    $('#tabTitle').textContent=tab.title; $('#previewBtn').href=SITEPG[tab.id]||'/';
    if(tab.today) return renderToday();
    if(tab.team) return renderTeam();
    if(tab.support) return renderSupport();
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
    var cur=Math.min(SECT[tab.id]||0,tab.secs.length-1);
    $('#panel').innerHTML=secNav(tab)+tab.secs.map(function(s,si){ if(si!==cur) return '';   // one section on screen; the tabs above switch
      var html='<section class="sec" id="sec-'+si+'"><h3>'+esc(s.h)+'</h3>'+(s.hint?'<p class="hint">'+esc(s.hint)+'</p>':'');
      if(s.fields) html+=s.fields.map(function(f){return field(C,f)}).join('');
      if(s.priv==='payments'){ var pm=(P&&P.payments)||{};
        html+=((C.payments&&C.payments.methods)||[]).map(function(m){ return '<div class="field"><label>'+esc(m.name||m.id)+'</label><textarea data-priv="payments.'+esc(m.id)+'" dir="auto" placeholder="مثال: Binance ID / رقم المحفظة / بريد PayPal">'+esc(pm[m.id]||'')+'</textarea></div>'; }).join('');
      }
      if(s.rep&&s.rep.split) html+=repSplit(s,si);
      else if(s.rep){ var arr=get(C,s.rep.p)||[];
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
  var SECT={};
  // a list as rows + the chosen item in a side panel (like requests and tasks); ↑ ↓ and delete live in the «⋯» menu
  var ROPEN={}, RTAB={};
  function repSplit(s,si){ var r=s.rep, p=r.p, arr=get(C,p)||[], sp=r.split, wide=matchMedia('(min-width:1001px)').matches;
    var sel=ROPEN[p]; if(sel==null||sel>=arr.length) sel=ROPEN[p]=wide&&arr.length?0:-1;
    var it=arr[sel], tabs=sp.tabs||[['',r.fields.map(function(_,k){ return k; })]], ti=Math.min(RTAB[p]||0,tabs.length-1);
    var rows=arr.map(function(x,i){ var tg=sp.tag&&sp.tag(x,i), th=sp.thumb&&sp.thumb(x);
      return '<li><button type="button" class="orow rrow'+(i===sel?' on':'')+'" data-ropen="'+esc(p)+':'+i+'"><span class="rth">'+(th?'<img alt="" loading="lazy" src="'+esc(abs(th))+'">':'')+'</span>'+
        '<span class="orow-m"><b>'+esc(r.name(x,i))+'</b></span><span class="orow-p">'+esc(sp.sub?sp.sub(x,i):'')+'</span>'+(tg?'<span class="tag'+(tg[1]?' tf-'+tg[1]:' rtag')+'">'+esc(tg[0])+'</span>':'')+'</button></li>'; }).join('');
    var pre=function(h){ return h.replace(/data-p="/g,'data-p="'+p+'.'+sel+'.').replace(/data-upload="/g,'data-upload="'+p+'.'+sel+'.').replace(/data-(make|mkstate|fr)="/g,'data-$1="'+p+'.'+sel+'.'); };
    var panel=it?'<div class="order item odetail rpanel"><div class="odh"><button class="btn sm oback" type="button" data-rback="'+esc(p)+'">‹ '+esc(sp.all||'كل العناصر')+'</button><b>'+esc(r.name(it,sel))+'</b>'+
        (sp.share?shareBox(it,sel,p):'')+(r.fixed?'':'<details class="cp-more rmore"><summary class="btn sm" aria-label="المزيد">⋯</summary><div class="cp-menu">'+
          '<button class="btn sm danger" type="button" data-del="'+si+':'+sel+'">حذف</button></div></details>')+'</div>'+
        (tabs.length>1?'<div class="subtabs rtabs">'+tabs.map(function(t,k){ return '<button type="button" data-rtab="'+esc(p)+':'+k+'"'+(k===ti?' aria-current="true"':'')+'>'+esc(t[0])+'</button>'; }).join('')+'</div>':'')+
        '<div class="body">'+tabs[ti][1].map(function(k){ return pre(field(it,r.fields[k])); }).join('')+'</div></div>'
      :'<div class="odetail empty-sel">اختار من القائمة</div>';
    var hint=!r.fixed&&arr.length>1?'<li class="olh rhint">'+arr.length+' · اضغط مطوّلاً واسحب لتغيير الترتيب</li>':'';
    return '<div class="osplit rsplit'+(it?' has-open':'')+'" data-rep="'+esc(p)+'"'+(r.fixed?' data-fixed="1"':'')+'><ul class="olist">'+hint+rows+'</ul>'+panel+'</div>'+
      (r.fixed?'':'<div class="radd"><button class="btn" type="button" data-add="'+si+'">'+esc(sp.addL||'+ إضافة')+'</button>'+
        (function(n){ return sp.share&&n?'<button class="btn" type="button" data-rslugall="'+esc(p)+'">جهّز روابط مشاركة لكل الأعمال ('+n+')</button>':''; })(arr.filter(function(x){ return !x.slug; }).length)+'</div>'); }
  /* share a work: its short link (made once from the English name), copy / WhatsApp / e-mail / open, «private» (opens
     from the link only), and how often the link was opened. A new link works once it is published. */
  var SHARES=null, SHOPEN=false;
  function slugOf(it,arr){ var b=String((it.title&&(it.title.en||''))||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||('work-'+Math.random().toString(36).slice(2,7)), s=b, n=2;
    while(arr.some(function(x){ return x!==it&&x.slug===s; })) s=b+'-'+(n++); return s; }
  function shareBox(it,sel,p){ var u=it.slug?'https://eyeblinkstudio.com/w/'+it.slug:'', t=(it.title&&it.title.ar)||'', live=it.slug&&SAVED.indexOf('"slug":"'+it.slug+'"')>=0, o=SHARES&&it.slug&&SHARES[it.slug];
    if(SHARES===null&&LIVE){ SHARES={}; fetch(API+'/views?shares=1',{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ if(j.ok){ SHARES=j.shares; if(TAB==='work') render(); } }).catch(function(){}); }
    return '<details class="cp-more rshare"'+(SHOPEN?' open':'')+'><summary class="btn sm primary">مشاركة</summary><div class="cp-menu rshare-m">'+
      (!u?'<p class="small muted">ما إله رابط لسا</p><button class="btn sm primary" type="button" data-rslug="'+esc(p)+':'+sel+'">جهّز رابط</button>':
        '<div class="rlink"><input readonly dir="ltr" value="'+esc(u)+'" aria-label="رابط العمل"><button class="btn sm" type="button" data-rcopy="'+esc(u)+'">نسخ</button></div>'+
        '<div class="rshare-b"><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text='+encodeURIComponent(t+' · '+u)+'">واتساب</a><a class="btn sm" href="mailto:?subject='+encodeURIComponent(t+' · Eyeblink Studio')+'&body='+encodeURIComponent(u)+'">إيميل</a><a class="btn sm" target="_blank" rel="noopener" href="'+esc(u)+'">فتح ↗</a></div>'+
        (live?'':'<p class="small rwarn">انشر التعديلات حتى يشتغل الرابط</p>'))+
      '<label class="check rpriv"><input type="checkbox" data-p="'+esc(p)+'.'+sel+'.private" data-t="check"'+(it.private?' checked':'')+'> عمل خاص: بيفتح بالرابط بس، وما بيبين بقائمة الأعمال</label>'+
      (u?'<p class="small muted">'+(o&&o.n?'الرابط انفتح '+o.n+(o.n===1?' مرة':' مرات')+' · آخر مرة '+esc(new Date(o.last).toLocaleDateString('ar-u-nu-latn',{day:'numeric',month:'short'})):'الرابط لسا ما انفتح')+'</p>':'')+'</div></details>'; }
  document.addEventListener('toggle',function(e){ if(e.target.classList&&e.target.classList.contains('rshare')) SHOPEN=e.target.open; },true);
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-rslugall]'); if(!b) return; var arr=get(C,b.dataset.rslugall)||[], n=0;
    arr.forEach(function(it){ if(!it.slug){ it.slug=slugOf(it,arr); n++; } }); if(!n) return;
    render(); dirty(); saveDraft(); toast((n===1?'تجهّز رابط واحد':n===2?'تجهّز رابطين':'تجهّز '+n+(n<=10?' روابط':' رابط'))+' · انشر التعديلات حتى '+(n===1?'يشتغل':'يشتغلوا')); });
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-rslug],[data-rcopy]'); if(!b) return;
    if(b.dataset.rcopy){ var u=b.dataset.rcopy; (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(function(){ toast('انتسخ الرابط'); },function(){ b.previousSibling.select(); }); return; }
    var q=b.dataset.rslug.split(':'), arr=get(C,q[0]), it=arr[+q[1]]; it.slug=slugOf(it,arr); SHOPEN=true; render(); dirty(); saveDraft(); });
  // a ticked «private» moves the work's tag right away
  document.addEventListener('change',function(e){ if(/\.private$/.test(e.target.dataset&&e.target.dataset.p||'')) setTimeout(render,0); });
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-ropen],[data-rback],[data-rtab]'); if(!b) return;
    if(b.dataset.ropen){ var q=b.dataset.ropen.split(':'); ROPEN[q[0]]=+q[1]; SHOPEN=false; render();
      if(!matchMedia('(min-width:1001px)').matches){ var pn=document.querySelector('.rsplit[data-rep="'+q[0]+'"]'); if(pn) pn.scrollIntoView({block:'start'}); } return; }
    if(b.dataset.rback){ ROPEN[b.dataset.rback]=-1; render(); return; }
    var t=b.dataset.rtab.split(':'); RTAB[t[0]]=+t[1]; render(); });
  /* reorder by long-press and drag: hold a row (~0.35 s) until it lifts, then drag it; the others slide out of the way
     and it settles into its new place. A move before it lifts is a scroll or a click, as usual. */
  var PRESS=null, DRAG=null, SWALLOW=false, RM=matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener('pointerdown',function(e){ var row=e.target.closest('.rsplit .rrow'); if(!row||e.button>0) return; var sp=row.closest('.rsplit'); if(sp.dataset.fixed) return;
    var st={x:e.clientX,y:e.clientY,li:row.parentNode,ul:row.parentNode.parentNode,p:sp.dataset.rep,id:e.pointerId,row:row};
    row.classList.add('pressing'); st.timer=setTimeout(function(){ lift(st); },350); PRESS=st; });
  function lift(st){ PRESS=null; st.row.classList.remove('pressing');
    var lis=[].filter.call(st.ul.children,function(l){ return l.querySelector('.rrow'); }), from=lis.indexOf(st.li);
    DRAG={st:st,lis:lis,from:from,to:from,rects:lis.map(function(l){ return l.getBoundingClientRect(); }),s0:st.ul.scrollTop,w0:scrollY};
    st.ul.classList.add('sorting'); st.li.classList.add('lifted'); st.li.style.transform='scale(1.03)'; try{ st.row.setPointerCapture(st.id); }catch(_){} if(navigator.vibrate) navigator.vibrate(10); }
  document.addEventListener('pointermove',function(e){
    if(PRESS&&!DRAG){ if(Math.abs(e.clientX-PRESS.x)+Math.abs(e.clientY-PRESS.y)>8){ clearTimeout(PRESS.timer); PRESS.row.classList.remove('pressing'); PRESS=null; } return; }
    if(!DRAG) return; var D=DRAG, ul=D.st.ul, inList=ul.scrollHeight>ul.clientHeight+2, ur=ul.getBoundingClientRect();
    // near an edge: keep scrolling (the list when it scrolls, the page otherwise)
    var top=inList?ur.top:90, bot=inList?ur.bottom:innerHeight; if(e.clientY<top+48){ if(inList) ul.scrollTop-=10; else scrollBy(0,-10); } else if(e.clientY>bot-48){ if(inList) ul.scrollTop+=10; else scrollBy(0,10); }
    var ds=(ul.scrollTop-D.s0)+(scrollY-D.w0), dy=e.clientY-D.st.y+ds, f=D.rects[D.from], cy=f.top+f.height/2+dy, to=D.from;
    D.rects.forEach(function(r,i){ var mid=r.top+r.height/2; if(i<D.from&&cy<mid&&i<to) to=i; if(i>D.from&&cy>mid&&i>to) to=i; });
    D.to=to; D.st.li.style.transform='translateY('+dy+'px) scale(1.03)'; var gap=f.height+3;
    D.lis.forEach(function(l,i){ if(i===D.from) return; var t=D.from<to&&i>D.from&&i<=to?-gap:D.from>to&&i>=to&&i<D.from?gap:0; l.style.transform=t?'translateY('+t+'px)':''; }); });
  function dragEnd(){ if(PRESS){ clearTimeout(PRESS.timer); PRESS.row.classList.remove('pressing'); PRESS=null; } if(!DRAG) return;
    var D=DRAG; DRAG=null; SWALLOW=true; setTimeout(function(){ SWALLOW=false; },60);
    var f=D.rects[D.from], t=D.rects[D.to], ty=D.to>D.from?t.bottom-f.bottom:t.top-f.top;
    D.st.li.classList.add('settle'); D.st.li.style.transform='translateY('+ty+'px)';
    setTimeout(function(){ D.st.ul.classList.remove('sorting');
      if(D.to===D.from){ render(); return; }
      var arr=get(C,D.st.p), it=arr.splice(D.from,1)[0]; arr.splice(D.to,0,it); var o=ROPEN[D.st.p];
      if(o===D.from) ROPEN[D.st.p]=D.to; else if(D.from<o&&o<=D.to) ROPEN[D.st.p]=o-1; else if(D.to<=o&&o<D.from) ROPEN[D.st.p]=o+1;
      render(); dirty(); saveDraft(); },RM.matches?0:200); }
  document.addEventListener('pointerup',dragEnd); document.addEventListener('pointercancel',dragEnd);
  document.addEventListener('click',function(e){ if(SWALLOW&&e.target.closest('.rsplit .rrow')){ e.stopPropagation(); e.preventDefault(); } },true);   // the drop is not a click
  document.addEventListener('touchmove',function(e){ if(DRAG) e.preventDefault(); },{passive:false});   // no page scroll while carrying a row
  document.addEventListener('contextmenu',function(e){ if(e.target.closest('.rsplit .rrow')) e.preventDefault(); });
  // where each content section lives on the site
  var SITEPG={home:'/',services:'/services.html',packages:'/pricing.html',work:'/work.html',about:'/about.html',contact:'/contact.html',payments:'/pricing.html'};
  function secNav(tab){ var pg=SITEPG[tab.id];
    return '<nav class="secnav" aria-label="أقسام الصفحة">'+(tab.secs.length>1?tab.secs.map(function(s,i){ var n=s.rep?(get(C,s.rep.p)||[]).length:0;
      return '<button type="button" data-secgo="'+i+'"'+(i===Math.min(SECT[tab.id]||0,tab.secs.length-1)?' class="on" aria-current="true"':'')+'>'+esc(s.h)+(n?' <small>'+n+'</small>':'')+'</button>'; }).join(''):'')+
      (pg?'<a class="secsite" href="'+pg+'" target="_blank" rel="noopener" data-pvw>الصفحة بالموقع ↗</a>':'')+'</nav>'; }
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-secgo]'); if(!b) return; SECT[TAB]=+b.dataset.secgo; render(); if(scrollY>200) scrollTo(0,0); });
  // any preview link shows the unpublished draft on the site
  document.addEventListener('click',function(e){ if(!e.target.closest('[data-pvw]')) return; saveDraft(); try{ localStorage.setItem('eb-preview','1'); }catch(_){} });
  function dirty(){ var d=JSON.stringify(C)!==SAVED || JSON.stringify(P)!==PSAVED; $('#state').textContent=d?'تعديلات غير منشورة':'محفوظ'; $('#state').classList.toggle('dirty',d); pubBar(d); }
  // the number of texts and settings that differ from what is published (translator marks don't count)
  function changes(){ var n=0;
    try{ (function walk(x,y,k){ if(k==='_auto'||k==='_ok') return;
      // a list counts whole items (added, removed or changed), so deleting or moving one is one change, not every item after it
      if(Array.isArray(x)&&Array.isArray(y)){ var sx=x.map(function(v){ return JSON.stringify(v); }), sy=y.map(function(v){ return JSON.stringify(v); });
        var add=sy.filter(function(v){ return sx.indexOf(v)<0; }).length, rm=sx.filter(function(v){ return sy.indexOf(v)<0; }).length; n+=Math.max(add,rm)||(sx.join()!==sy.join()?1:0); }
      else if(x&&y&&typeof x==='object'&&typeof y==='object'&&!Array.isArray(x)&&!Array.isArray(y)){ var ks={}; Object.keys(x).concat(Object.keys(y)).forEach(function(q){ ks[q]=1; }); Object.keys(ks).forEach(function(q){ walk(x[q],y[q],q); }); }
      else if(JSON.stringify(x)!==JSON.stringify(y)) n++; })(JSON.parse(SAVED||'{}'),C,''); }catch(_){}
    return n+(JSON.stringify(P)!==PSAVED?1:0); }
  function pubBar(d){ var b=$('#pubbar');
    if(!b){ if(!d) return; document.querySelector('.main').insertAdjacentHTML('beforeend','<div id="pubbar" class="pubbar" role="status"><i></i><span data-pbn></span><span class="pbacts"><button class="btn sm" type="button" data-pbundo>تراجع</button><a class="btn sm" data-pvw target="_blank" rel="noopener" href="/">معاينة</a><button class="btn sm primary" type="button" data-pbpub>نشر</button></span></div>'); b=$('#pubbar'); }
    b.hidden=!d; if(!d) return; var n=changes(), u=b.querySelector('[data-pbundo]');
    b.querySelector('[data-pbn]').textContent=n<=1?'تعديل واحد ما انتشر':n===2?'تعديلين ما انتشروا':n+' تعديلات ما انتشرت';
    b.querySelector('[data-pvw]').href=SITEPG[TAB]||'/'; b.querySelector('[data-pbpub]').disabled=false; u.dataset.armed=''; u.textContent='تراجع'; }
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-pbundo],[data-pbpub]'); if(!b) return;
    if(b.hasAttribute('data-pbpub')){ b.disabled=true; $('#publishBtn').click(); return; }
    if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='متأكد؟ رجوع لآخر نسخة منشورة'; return; }
    C=JSON.parse(SAVED); if(PSAVED) P=JSON.parse(PSAVED); saveDraft(); savePrivDraft(); try{ localStorage.removeItem('eb-preview'); }catch(_){}
    render(); dirty(); toast('رجعت لآخر نسخة منشورة'); });

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
    if(b.dataset.add!=null){ var s=tab.secs[+b.dataset.add]; var arr=get(C,s.rep.p)||[]; arr.push(s.rep.add()); set(C,s.rep.p,arr);
      if(s.rep.split){ ROPEN[s.rep.p]=arr.length-1; RTAB[s.rep.p]=0; render(); dirty(); saveDraft(); var np=document.querySelector('.rsplit[data-rep="'+s.rep.p+'"] .rpanel'); if(np) np.scrollIntoView({block:'nearest'}); return; }
      render(); dirty(); saveDraft();
      var items=document.querySelectorAll('[data-rep="'+s.rep.p+'"] .item'); var last=items[items.length-1]; if(last){ last.open=true; last.scrollIntoView({block:'center'}); } return; }
    if(b.dataset.del){ e.preventDefault(); var q=b.dataset.del.split(':'), s2=tab.secs[+q[0]], a2=get(C,s2.rep.p);
      if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد الحذف؟'; setTimeout(function(){ if(b.isConnected){ b.dataset.armed=''; b.textContent='حذف'; } },3000); return; }
      a2.splice(+q[1],1); if(s2.rep.split) ROPEN[s2.rep.p]=a2.length?Math.min(+q[1],a2.length-1):-1; render(); dirty(); saveDraft(); return; }
    if(b.dataset.move){ e.preventDefault(); var m=b.dataset.move.split(':'), s3=tab.secs[+m[0]], a3=get(C,s3.rep.p), i=+m[1], j=i+(+m[2]);
      if(j<0||j>=a3.length) return; var tmp=a3[i]; a3[i]=a3[j]; a3[j]=tmp; if(s3.rep.split) ROPEN[s3.rep.p]=j; render(); dirty(); saveDraft(); return; }
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
