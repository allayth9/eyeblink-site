/* Eyeblink admin — edits content.json through /api (Cloudflare) or, without a server, as a local draft. */
(function(){
  var API='../api', PW='', LIVE=false, C=null, SAVED='', TAB='home', ORDERS=[], P=null, PSAVED='', OFILTER='all', USERS=null;
  var $=function(s,r){return (r||document).querySelector(s)};
  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function toast(t,bad){ var d=$('#toast'); d.textContent=t; d.className='toast'+(bad?' bad':''); d.hidden=false; clearTimeout(d._t); d._t=setTimeout(function(){d.hidden=true},2600); }
  function get(o,p){ return p.split('.').reduce(function(a,k){return a==null?a:a[k]},o); }
  function set(o,p,v){ var ks=p.split('.'), last=ks.pop(); var t=ks.reduce(function(a,k){ if(a[k]==null) a[k]=/^\d+$/.test(k)?[]:{}; return a[k]; },o); t[last]=v; }
  function bi(a,e){ return {ar:a||'',en:e||''}; }
  function headers(extra){ var h={'authorization':'Bearer '+PW}; for(var k in extra) h[k]=extra[k]; return h; }
  var onHttp=/^https?:/.test(location.protocol);

  /* ---------------- schema: what can be edited, and how ---------------- */
  var SVC=function(){ return (C.services||[]).map(function(s){return [s.id, (s.name&&s.name.ar)||s.id]}); };
  var TABS=[
    {id:'home', title:'الرئيسية', secs:[
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
      {h:'نصوص القسم', fields:[{p:'work.h', t:'bi', l:'العنوان قبل إضافة أعمال'},{p:'work.p', t:'bita', l:'الوصف قبل إضافة أعمال'},{p:'work.filledH', t:'bi', l:'العنوان بعد إضافة أعمال'},{p:'work.filledP', t:'bita', l:'الوصف بعد إضافة أعمال'}]},
      {h:'المشاريع', hint:'أول 3 مشاريع تظهر في الرئيسية. المعاينة: 6–8 ثوانٍ بدون صوت، حتى 5MB. الفيديو الكامل الأفضل على Vimeo أو YouTube.', rep:{p:'projects',
        name:function(x){return (x.title&&x.title.ar)||'مشروع'}, add:function(){return {title:bi('مشروع جديد',''),service:'editing',summary:bi(),client:'',year:String(new Date().getFullYear()),ratio:'16:9',preview:'',poster:'',full:{type:'vimeo',id:''}}},
        fields:[{p:'title', t:'bi', l:'اسم المشروع'},
          {row:[{p:'service', t:'select', l:'الخدمة', opts:SVC},{p:'ratio', t:'select', l:'المقاس', opts:function(){return [['16:9','أفقي 16:9'],['9:16','عمودي 9:16'],['1:1','مربع 1:1'],['4:5','4:5']]}},{p:'year', t:'text', l:'السنة', ltr:1}]},
          {p:'summary', t:'bi', l:'سطر عن المشروع'},{p:'client', t:'text', l:'العميل (اختياري)'},
          {p:'challenge', t:'bita', l:'دراسة الحالة — التحدي (اختياري)'},{p:'idea', t:'bita', l:'الفكرة (اختياري)'},{p:'result', t:'bita', l:'النتيجة، بالأرقام إن أمكن (اختياري)', hint:'تظهر الثلاثة تحت الفيديو عند فتحه. اتركها فارغة لعرض الفيديو فقط.'},
          {p:'preview', t:'media', l:'معاينة قصيرة (فيديو)', accept:'video/mp4,video/webm'},
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
    {id:'stats', title:'الإحصائيات', stats:1},
    {id:'settings', title:'الإعدادات', settings:1},
    {id:'orders', title:'الطلبات', orders:1},
    {id:'tasks', title:'المشاريع والمهام', tasks:1},
    {id:'notify', title:'الإشعارات', notify:1},
    {id:'clients', title:'العملاء', clients:1},
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
      case 'num': return '<div class="field">'+lab+'<input id="'+id+'"'+d+' type="number" min="0" step="1" dir="ltr" value="'+esc(v==null?'':v)+'">'+hint+'</div>';
      case 'check': return '<div class="field"><label class="check" style="margin-top:26px"><input type="checkbox"'+d+(v?' checked':'')+'> '+esc(f.l)+'</label></div>';
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
        return '<div class="field">'+lab+'<div class="media">'+prev+'<input id="'+id+'"'+d+' dir="ltr" placeholder="رابط أو ارفع ملفاً" value="'+esc(v)+'"><label class="btn sm">رفع<input type="file" accept="'+esc(f.accept||'*/*')+'" data-upload="'+esc(f.p)+'" hidden></label></div>'+hint+'</div>';
    }
    return '';
  }
  function abs(u){ return /^(https?:|data:|blob:|\/)/.test(u)? u : '../'+u; }

  /* ---------------- render ---------------- */
  function renderTabs(){
    var newCount=ORDERS.filter(function(o){return o.status==='new'||o.unread}).length;
    $('#tabs').innerHTML=TABS.map(function(t){ return '<button type="button" data-tab="'+t.id+'"'+(t.id===TAB?' aria-current="true"':'')+'>'+esc(t.title)+(t.id==='orders'&&newCount?'<span class="count">'+newCount+'</span>':'')+(t.id==='tasks'&&WORK&&WORK.tasks?(function(){ var n=WORK.tasks.filter(function(x){return x.status==='new'||(x.change_request&&x.change_request.status==='pending')}).length; return n?'<span class="count">'+n+'</span>':''; })():'')+(t.id==='notify'?(function(){ var n=NOTI&&!NOTI.err?NOTI.unread:(WORK&&WORK.inboxUnread)||0; return n?'<span class="count">'+n+'</span>':''; })():'')+(t.id==='clients'&&ACC&&ACC.requests.filter(function(r){return r.status==='pending'}).length?'<span class="count">'+ACC.requests.filter(function(r){return r.status==='pending'}).length+'</span>':'')+'</button>'; }).join('');
  }
  function render(){
    renderTabs();
    var tab=TABS.filter(function(t){return t.id===TAB})[0];
    $('#tabTitle').textContent=tab.title;
    if(tab.orders) return renderOrders();
    if(tab.stats) return renderStats();
    if(tab.tasks) return renderWork();
    if(tab.notify) return renderNotify();
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
            '</summary><div class="body">'+s.rep.fields.map(function(f){ return field(it, f).replace(/data-p="/g,'data-p="'+s.rep.p+'.'+i+'.').replace(/data-upload="/g,'data-upload="'+s.rep.p+'.'+i+'.'); }).join('')+'</div></details>';
        }).join('')+'</div>'+(s.rep.fixed?'':'<div><button class="btn" type="button" data-add="'+si+'">+ إضافة</button></div>');
      }
      return html+'</section>';
    }).join('');
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
  });
  document.addEventListener('click',function(e){
    var b=e.target.closest('button'); if(!b) return;
    if(b.dataset.tab){ TAB=b.dataset.tab; render(); if(TAB==='orders') loadOrders(); if(TAB==='clients') loadUsers(); if(TAB==='tasks') loadWork(); if(TAB==='notify') loadNotify(); scrollTo(0,0); return; }
    var tab=TABS.filter(function(t){return t.id===TAB})[0];
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
    btn.disabled=true; btn.textContent='جارٍ النشر…';
    fetch(API+'/content',{method:'PUT',headers:headers({'content-type':'application/json'}),body:JSON.stringify(C)})
      .then(function(r){ if(r.status===401) throw new Error('auth'); if(!r.ok) throw new Error('fail'); return r.json(); })
      .then(function(){ SAVED=JSON.stringify(C);
        if(JSON.stringify(P)!==PSAVED) return fetch(API+'/private',{method:'PUT',headers:headers({'content-type':'application/json'}),body:JSON.stringify(P)}).then(function(r){ if(!r.ok) throw new Error('fail'); PSAVED=JSON.stringify(P); }); })
      .then(function(){ dirty(); try{ localStorage.removeItem('eb-preview'); }catch(_){} toast('نُشرت التعديلات على الموقع'); })
      .catch(function(err){ toast(err.message==='auth'?'انتهت الجلسة، سجّل الدخول من جديد':'تعذّر النشر، حاول مرة أخرى',true); })
      .then(function(){ btn.disabled=false; btn.textContent='نشر التعديلات'; });
  }
  function upload(input){
    var file=input.files[0], path=input.dataset.upload; if(!file) return;
    if(!LIVE){ toast('رفع الملفات يعمل بعد نشر الموقع على Cloudflare. ضع رابطاً مباشراً الآن.',true); input.value=''; return; }
    if(file.size>24*1024*1024){ toast('الحد الأقصى 24MB. اضغط الفيديو أولاً.',true); input.value=''; return; }
    toast('جارٍ رفع '+file.name+'…');
    fetch(API+'/media',{method:'POST',headers:headers({'content-type':file.type||'application/octet-stream','x-filename':file.name}),body:file})
      .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'fail'); return j; }); })
      .then(function(j){ set(C,path,j.url); dirty(); saveDraft(); render(); toast('تم الرفع. اضغط «نشر التعديلات» ليظهر على الموقع.'); })
      .catch(function(e){ toast('تعذّر الرفع: '+e.message,true); });
  }

  /* ---------------- orders ---------------- */
  var ST={'new':'جديد','confirmed':'مؤكَّد','awaiting-payment':'بانتظار الدفع','paid':'مدفوع','in-progress':'قيد التنفيذ','review':'بانتظار المراجعة','delivered':'مُسلَّم','cancelled':'ملغى'};
  function sampleOrders(){ return [{key:'order:demo',code:'EB-DEMO1',status:'new',createdAt:new Date().toISOString(),name:'طلب تجريبي',contact:'@client.account',details:'فيديو موشن 45 ثانية لإطلاق منتج. (هذا طلب تجريبي ليظهر لك شكل الصندوق)',package:'motion',packageName:'فيديو موشن غرافيك',addons:['كتابة السكريبت'],total:'85 $',lang:'ar',price:'',method:'',paid:false,paidAmount:'',notes:'',history:[{at:new Date().toISOString(),status:'new'}],email:'client@example.com',unread:1,messages:[{from:'client',text:'مرحباً، هل يمكن التسليم قبل نهاية الأسبوع؟',at:new Date().toISOString()}],demo:true}]; }
  function loadOrders(){
    if(!LIVE){ if(!ORDERS.length) ORDERS=sampleOrders(); if(TAB==='orders') renderOrders(); else renderTabs(); return; }
    fetch(API+'/orders',{headers:headers({})}).then(function(r){return r.json()}).then(function(j){ ORDERS=j.orders||[]; if(TAB==='orders') renderOrders(); else renderTabs(); }).catch(function(){});
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

  function renderOrders(){
    renderTabs();
    var list=ORDERS.filter(function(o){ return OFILTER==='all'||o.status===OFILTER; });
    var count=function(st){ return ORDERS.filter(function(o){return o.status===st}).length; };
    var paidSum=ORDERS.filter(function(o){return o.paid}).reduce(function(a,o){ return a+(parseFloat(o.paidAmount||o.price)||0); },0);
    var methods=((C.payments&&C.payments.methods)||[]);
    var head='<section class="sec"><div class="kpis"><div><b>'+ORDERS.length+'</b><span>كل الطلبات</span></div><div><b>'+count('new')+'</b><span>جديدة</span></div><div><b>'+count('awaiting-payment')+'</b><span>بانتظار الدفع</span></div><div><b>'+count('in-progress')+'</b><span>قيد التنفيذ</span></div><div><b dir="ltr">'+paidSum+'</b><span>مجموع المدفوع</span></div></div>'+
      '<div class="chips">'+[['all','الكل']].concat(Object.keys(ST).map(function(k){return [k,ST[k]]})).map(function(x){return '<button type="button" class="btn sm'+(OFILTER===x[0]?' primary':'')+'" data-ofilter="'+x[0]+'">'+x[1]+'</button>'}).join('')+'</div>'+
      (!LIVE?'<p class="hint">هذا طلب تجريبي ليظهر لك طريقة العمل. الطلبات الحقيقية تصل هنا بعد نشر الموقع على Cloudflare.</p>':'')+'</section>';
    if(!list.length){ $('#panel').innerHTML=head+'<div class="sec"><div class="empty">لا توجد طلبات هنا.</div></div>'; return; }
    $('#panel').innerHTML=head+'<div class="orders">'+list.map(function(o){
      var k=esc(o.key);
      return '<details class="order item" data-okey="'+k+'"'+(o.status==='new'||o.unread?' open':'')+'><summary><span class="chev">‹</span><span class="code">'+esc(o.code)+'</span><span class="pill '+esc(o.status)+'">'+esc(ST[o.status]||o.status)+'</span>'+(o.paid?'<span class="pill paid">مدفوع</span>':'')+(o.unread?'<span class="pill unread">'+o.unread+' رسالة جديدة</span>':'')+
        '<b>'+esc(o.name)+' · '+esc(o.packageName||o.package)+'</b><span class="muted small">'+esc(new Date(o.createdAt).toLocaleDateString('ar'))+'</span></summary><div class="body">'+
        '<div class="grid2"><div>'+
          '<div class="small muted">الطلب</div><div><b>'+esc(o.packageName||o.package)+'</b> · التقدير: <span dir="ltr">'+esc(o.total)+'</span>'+(o.qty>1?' · <b>×'+o.qty+'</b>':'')+(o.addons&&o.addons.length?'<br>إضافات: '+esc(o.addons.join('، ')):'')+((o.platforms||[]).length?'<br>المنصات: <span dir="ltr">'+esc(o.platforms.join(', '))+'</span>':'')+(o.payPref?'<br>الدفع المفضّل: '+esc(o.payPref):'')+'</div>'+
          '<div class="small muted" style="margin-top:8px">العميل</div><div>'+esc(o.name)+(o.email?' — <span dir="ltr" style="user-select:all">'+esc(o.email)+'</span>':'')+(o.contact?'<br><span class="muted small">تواصل خارجي:</span> <span dir="ltr" style="user-select:all">'+esc(o.contact)+'</span>':'')+'</div>'+
          (o.visit?'<div class="small muted" style="margin-top:8px">مصدر الزيارة</div><div class="small visit">'+[o.visit.source&&('المصدر: <b dir="ltr">'+esc(o.visit.source)+'</b>'),o.visit.utm&&('حملة: <span dir="ltr">'+esc(o.visit.utm)+'</span>'),o.visit.landing&&('أول صفحة: <span dir="ltr">'+esc(o.visit.landing)+'</span>'),o.visit.visits&&('عدد الزيارات قبل الطلب: '+esc(o.visit.visits)),o.visit.first&&('أول زيارة: '+esc(new Date(o.visit.first).toLocaleDateString('ar'))),(o.visit.country||o.visit.city)&&('الموقع: '+esc([o.visit.city,o.visit.country].filter(Boolean).join('، '))),o.visit.device&&('الجهاز: '+esc(DEV[o.visit.device]||o.visit.device)+' · '+esc(o.visit.os||''))].filter(Boolean).join(' · ')+'</div>':'')+
          '<div class="small muted" style="margin-top:8px">التفاصيل</div><pre>'+esc(o.details)+'</pre>'+
          (o.link?'<div dir="ltr" class="small"><a href="'+esc(o.link)+'" target="_blank" rel="noopener">'+esc(o.link)+'</a></div>':'')+(o.deadline?'<div class="small muted">الموعد: '+esc(o.deadline)+'</div>':'')+
          (o.email?'<div class="small muted" style="margin-top:12px">المحادثة مع العميل (تظهر له في حسابه)</div><div class="athread">'+thread(o)+'</div>'+
            (o.review?'<div class="areview"><b>تقييم العميل: '+'★★★★★'.slice(0,o.review.stars)+'<span style="opacity:.3">'+'★★★★★'.slice(o.review.stars)+'</span></b>'+(o.review.text?'<p>'+esc(o.review.text)+'</p>':'')+
              (o.review.publish?'<label class="check"><input type="checkbox" data-rapprove="'+k+'"'+(o.review.approved?' checked':'')+'> اعرضه على الموقع</label>':'<span class="muted small">العميل لم يوافق على النشر.</span>')+'</div>':'')+
            '<div class="apend" hidden></div><div class="asend"><label class="btn sm" title="إرفاق ملف (حتى 20MB)">📎<input type="file" multiple hidden data-oup="'+k+'"></label><textarea data-msg dir="auto" placeholder="'+(o.status==='delivered'||o.status==='cancelled'?'المحادثة مغلقة عند العميل بعد التسليم، لكن رسالتك ستظهر له':'اكتب رداً للعميل…')+'"></textarea><button class="btn primary sm" type="button" data-osend="'+k+'">إرسال</button></div>':'')+
          '<div class="small muted" style="margin-top:8px">السجل</div><div class="small">'+(o.history||[]).map(function(h){return esc(ST[h.status]||h.status)+' · '+esc(new Date(h.at).toLocaleString('ar'))}).join('<br>')+'</div>'+
        '</div><div class="ofields">'+
          '<div class="row"><div class="field"><label>الحالة</label><select data-of="status">'+Object.keys(ST).map(function(s2){return '<option value="'+s2+'"'+(s2===o.status?' selected':'')+'>'+ST[s2]+'</option>'}).join('')+'</select></div>'+
          '</div>'+
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
  var ACC=[['cyan','سماوي (الأساسي)','#3FE0E8','#8B5CFF'],['violet','بنفسجي','#A78BFA','#5B7CFF'],['gold','ذهبي','#F5C66B','#E0833F'],['rose','وردي','#FF7AB6','#8B5CFF'],['mint','نعناعي','#5EF0B0','#2E9BFF']];
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
        ACC.map(function(a){ return '<label class="acc'+((L.accent||'cyan')===a[0]?' on':'')+'"><input type="radio" name="acc" value="'+a[0]+'"'+((L.accent||'cyan')===a[0]?' checked':'')+' data-lacc hidden><i style="background:linear-gradient(135deg,'+a[2]+','+a[3]+')"></i>'+a[1]+'</label>'; }).join('')+'</div></section>'+
      '<section class="sec"><h3>عناصر بصرية</h3>'+
        '<label class="check"><input type="checkbox" data-ltog="intro"'+(L.intro!==false?' checked':'')+'> مقدّمة فتح العين عند أول زيارة</label>'+
        '<label class="check"><input type="checkbox" data-ltog="particles"'+(L.particles!==false?' checked':'')+'> خلفية الجزيئات المتحركة</label>'+
        '<label class="check"><input type="checkbox" data-ltog="countUp"'+(L.countUp!==false?' checked':'')+'> عدّاد الأرقام (يعدّ من الصفر عند ظهور الخانات)</label>'+
        '<div class="field"><label>مؤشر الماوس</label><select data-lsel="cursor">'+[['glass','السهم الزجاجي (Eyeblink)'],['soft','المؤشر الناعم السابق'],['system','مؤشر النظام الافتراضي']].map(function(o){return '<option value="'+o[0]+'"'+((L.cursor||'glass')===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select></div>'+
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
    return '<section class="sec" id="wspace"><div class="ph"><h3>'+esc(p.name)+' — النقاش والملفات</h3><button class="btn sm" type="button" data-wspx>إغلاق</button></div>'+
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
      '<div class="row"><div class="field"><label>الوصف (يظهر للعميل)</label><textarea name="description" dir="auto">'+esc(p.description||'')+'</textarea></div><div class="field"><label>المخرجات المتفق عليها شهرياً (اختياري)</label><input type="number" min="0" name="quota" value="'+esc(p.quota||'')+'"><p class="hint">للتقارير الشهرية لاحقاً. اتركها فارغة إن لم يكن هناك عدد ثابت.</p></div></div>'+
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
            '<span class="muted small">'+p.open_tasks+' مفتوحة من '+p.all_tasks+(p.start_date?' · من '+esc(wd(p.start_date)):'')+(p.end_date?' إلى '+esc(wd(p.end_date)):'')+'</span><div class="actions"><button class="btn sm" type="button" data-wpe="'+esc(p.id)+'">تعديل</button><button class="btn sm" type="button" data-wpt="'+esc(p.id)+'">مهامه</button><button class="btn sm" type="button" data-wsp="'+esc(p.id)+'">النقاش والملفات</button></div>')+'</div>'; }).join('')+'</div>':'')+
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
      description:E.description.value.trim(),quota:E.quota.value,services:[].map.call(f.querySelectorAll('input[name=svc]:checked'),function(i){return i.value})};
    wreq(body,f.querySelector('button[type=submit]'),f.dataset.wpid?'حُفظ المشروع':'أُنشئ المشروع وأُرسل بريد إلى العميل').then(function(){ WPEDIT=null; }).catch(function(){}); });
  document.addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b||TAB!=='tasks') return; var box=b.closest('.wtb');
    if(b.dataset.wpe){ WPEDIT=b.dataset.wpe; renderWork(); return; }
    if(b.hasAttribute('data-wpx')){ WPEDIT=null; renderWork(); return; }
    if(b.dataset.wpt){ WF={status:'',client:'',project:b.dataset.wpt}; renderWork(); return; }
    if(b.dataset.wsp){ loadSpace(b.dataset.wsp); return; }
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
        '<div class="wfl"><select data-nf="channel"><option value="">كل القنوات</option><option value="email"'+(NF.channel==='email'?' selected':'')+'>الإيميل</option><option value="whatsapp"'+(NF.channel==='whatsapp'?' selected':'')+'>واتساب</option></select>'+
        '<select data-nf="status"><option value="">كل الحالات</option>'+['sent','failed','retry','skipped'].map(function(k){ return '<option value="'+k+'"'+(NF.status===k?' selected':'')+'>'+NST[k]+'</option>'; }).join('')+'</select></div>'+
        ((N.log||[]).length?'<div class="nlog"><table><thead><tr><th>الوقت</th><th>القناة</th><th>إلى</th><th>الحدث</th><th>الحالة</th><th></th></tr></thead><tbody>'+N.log.map(function(r){
          return '<tr><td class="small">'+esc(new Date(r.at).toLocaleString('ar'))+'</td><td>'+(r.channel==='whatsapp'?'واتساب':'إيميل')+'</td><td class="small" dir="ltr">'+esc(r.channel==='whatsapp'&&r.target?'+'+String(r.target).replace(/\d(?=\d{4})/g,'•'):r.recipient)+'</td><td class="small">'+esc(NKIND[r.kind]||r.kind)+'</td>'+
            '<td><span class="npill s-'+esc(r.status)+'">'+esc(NST[r.status]||r.status)+'</span>'+(r.attempts>1?' <span class="small muted">× '+r.attempts+'</span>':'')+(r.delivery?' <span class="small muted">· '+esc(r.delivery)+'</span>':'')+(r.error?'<div class="small muted nerr" dir="auto">'+esc(r.error)+'</div>':'')+'</td>'+
            '<td>'+(r.status==='failed'||r.status==='retry'?'<button class="btn sm" type="button" data-nretry="'+r.id+'">أعد الإرسال</button>':'')+'</td></tr>'; }).join('')+'</tbody></table></div>':'<div class="empty">لا يوجد إرسال مسجّل بعد.</div>')+'</section>'+
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
    if(b.dataset.nretry){ npost({action:'retryNotif',id:+b.dataset.nretry},b).then(function(j){ toast(j.ok?'أُرسلت ✓':'ما زالت تفشل: '+(j.error||''),!j.ok); loadNotify(); }); return; }
    if(b.hasAttribute('data-wasave')){ var g=function(k){ return document.querySelector('[data-wa="'+k+'"]'); };
      npost({action:'waConfig',enabled:g('enabled').checked,button:g('button').checked,template:g('template').value.trim(),langAr:g('langAr').value.trim(),langEn:g('langEn').value.trim(),version:g('version').value.trim()},b,'حُفظت إعدادات واتساب').then(function(){ loadNotify(); }); return; }
    if(b.hasAttribute('data-watest')){ var out=$('#waOut'); out.textContent='جارٍ الإرسال…';
      npost({action:'waTest',phone:document.querySelector('[data-watp]').value.trim(),lang:document.querySelector('[data-watl]').value},b).then(function(j){ WATEST=j.ok?'✓ أُرسلت. المعرّف: '+(j.id||''):'✗ '+(j.error==='phone'?'الرقم غير صحيح — اكتبه مع رمز الدولة':(j.error||'فشل')); out.textContent=WATEST; loadNotify(); }); return; }
  });

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
  }
  function accReq(body,btn,ok){
    if(!LIVE){ toast('يعمل على الموقع المنشور',true); return Promise.reject(); }
    if(btn) btn.disabled=true;
    return fetch(API+'/access',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify(body)}).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'fail'); return j; }); })
      .then(function(j){ if(ok) toast(ok); loadUsers(); return j; })
      .catch(function(e){ if(btn) btn.disabled=false; toast(({already:'هذا العميل متعاقد أصلاً',email:'اكتب بريداً صحيحاً','no account':'لا يوجد حساب بهذا البريد','no request':'لم يعد الطلب موجوداً'})[e.message]||'تعذّر التنفيذ',true); throw e; });
  }
  var ROLE={client:'عميل متعاقد',customer:'عميل عادي'}, VIA={invite:'بدعوة',request:'بطلب وصول',upgrade:'ترقية من الإدارة'};
  function renderClients(){
    var U=USERS, A=ACC||{requests:[],invites:[]};
    if(!U){ $('#panel').innerHTML='<section class="sec"><div class="empty">…</div></section>'; return; }
    var pend=A.requests.filter(function(r){return r.status==='pending'});
    var nC=U.filter(function(u){return u.role==='client'}).length;
    var list=U.filter(function(u){ return UFILTER==='all'||(UFILTER==='client'?u.role==='client':u.role!=='client'); });
    $('#panel').innerHTML=
      (pend.length?'<section class="sec acc-req"><h3>طلبات الوصول لمساحة العمل ('+pend.length+')</h3><p class="hint">عملاء حاليون طلبوا الوصول إلى مساحة العمل. لا يحصلون على أي صلاحية قبل موافقتك.</p>'+
        pend.map(function(r){ return '<div class="client"><div><b>'+esc(r.name)+'</b> <span dir="ltr" class="muted small">'+esc(r.email)+'</span>'+(r.company?' · '+esc(r.company):'')+'</div>'+
          (r.note?'<div class="small">'+esc(r.note).replace(/\n/g,'<br>')+'</div>':'')+'<span class="muted small">'+esc(new Date(r.at).toLocaleString('ar'))+'</span>'+
          '<div class="actions"><button class="btn sm primary" type="button" data-aapprove="'+esc(r.email)+'">قبول — تفعيل مساحة العمل</button><button class="btn sm" type="button" data-areject="'+esc(r.email)+'">رفض</button></div>'+
          '<div class="arej" hidden><textarea placeholder="سبب مختصر يوصل للعميل (اختياري)" dir="auto"></textarea><div class="actions"><button class="btn sm danger" type="button" data-arejgo="'+esc(r.email)+'">أرسل الرفض</button></div></div></div>'; }).join('')+'</section>':'')+
      '<section class="sec"><h3>دعوة عميل متعاقد</h3><p class="hint">يصله بريد إلكتروني فيه رابط آمن (يُستخدم مرة واحدة، صالح 14 يوماً). يسجّل دخوله أو ينشئ حساباً بالبريد نفسه، فيُفعَّل حسابه بصفة عميل متعاقد. وإن لم يكن البريد مفعّلاً، فانسخ الرابط وأرسله عبر واتساب.</p>'+
        '<form class="inv-form" id="invForm"><div class="row"><div class="field"><label>البريد</label><input name="email" type="email" dir="ltr" required></div><div class="field"><label>الاسم</label><input name="name"></div>'+
        '<div class="field"><label>لغة الدعوة</label><select name="lang"><option value="ar">العربية</option><option value="en">English</option></select></div></div>'+
        '<div class="field"><label>رسالة قصيرة (اختياري)</label><textarea name="note" dir="auto" placeholder="مثلاً: وفق اتفاقنا الشهري، سترسل إلينا المهام من هنا."></textarea></div>'+
        '<div class="actions"><button class="btn primary sm" type="submit">أرسل الدعوة</button></div><div class="inv-out" hidden></div></form>'+
        (A.invites.length?'<div class="small muted" style="margin-top:12px">دعوات مفتوحة</div><div class="clients">'+A.invites.map(function(i){ return '<div class="client inv"><div><b dir="ltr">'+esc(i.email)+'</b>'+(i.name?' · '+esc(i.name):'')+' <span class="muted small">تنتهي '+esc(new Date(i.expires).toLocaleDateString('ar'))+'</span></div><div class="actions"><button class="btn sm" type="button" data-icopy="'+esc(i.token)+'" data-ilang="'+esc(i.lang||'ar')+'">نسخ الرابط</button><button class="btn sm danger" type="button" data-irevoke="'+esc(i.token)+'">إلغاء الدعوة</button></div></div>'; }).join('')+'</div>':'')+'</section>'+
      '<section class="sec"><h3>حسابات العملاء ('+U.length+')</h3><p class="hint">العميل العادي يشتري ويتابع طلباته، والعميل المتعاقد يحصل أيضاً على مساحة العمل. تحتفظ الترقية بجميع طلباته وفواتيره.</p>'+
        '<div class="chips">'+[['all','الكل ('+U.length+')'],['client','متعاقدون ('+nC+')'],['customer','عاديون ('+(U.length-nC)+')']].map(function(x){ return '<button type="button" class="btn sm'+(UFILTER===x[0]?' primary':'')+'" data-ufilter="'+x[0]+'">'+x[1]+'</button>'; }).join('')+'</div>'+
      (list.length? '<div class="clients">'+list.map(function(u){ var cl=u.role==='client';
        return '<div class="client'+(cl?' is-client':'')+'"><div><b>'+esc(u.name)+'</b> <span class="rpill'+(cl?' on':'')+'">'+ROLE[cl?'client':'customer']+'</span> <span dir="ltr" class="muted small" style="user-select:all">'+esc(u.email)+'</span></div>'+
        '<span class="muted small">'+(u.google?'Google':'')+(u.google&&u.hasPassword?' + ':'')+(u.hasPassword?'كلمة سر':'')+' · '+u.orders+' طلب · '+esc(new Date(u.createdAt).toLocaleDateString('ar'))+(cl&&u.clientSince?' · متعاقد منذ '+esc(new Date(u.clientSince).toLocaleDateString('ar'))+(u.clientVia?' ('+VIA[u.clientVia]+')':''):'')+'</span>'+
        '<div class="actions">'+(cl?'<button class="btn sm" type="button" data-urole="'+esc(u.email)+'" data-to="customer">إلغاء مساحة العمل</button>':'<button class="btn sm primary" type="button" data-urole="'+esc(u.email)+'" data-to="client">ترقية إلى عميل متعاقد</button>')+
        '<button class="btn sm" type="button" data-upw="'+esc(u.email)+'">كلمة سر جديدة</button><button class="btn sm danger" type="button" data-udel="'+esc(u.email)+'">حذف الحساب</button>'+((u.log||[]).length?'<button class="btn sm" type="button" data-ulog>السجل</button>':'')+'</div>'+
        ((u.log||[]).length?'<div class="ulog small muted" hidden>'+u.log.map(function(l){ return '<div>'+esc(new Date(l.at).toLocaleString('ar'))+' · '+esc({admin:'الإدارة',client:'العميل',system:'النظام'}[l.by]||l.by)+' · '+esc(LOGN[l.what]||l.what)+'</div>'; }).join('')+'</div>':'')+
        '<div class="newpw small" hidden></div></div>'; }).join('')+'</div>'
        : '<div class="empty">لا يوجد عملاء هنا.</div>')+'</section>';
  }
  var LOGN={'requested workspace access':'طلب الوصول لمساحة العمل','accepted the invitation':'قبل الدعوة','invited to the workspace':'أُرسلت إليه دعوة','access request approved':'قُبل طلب الوصول','access request declined':'رُفض طلب الوصول','upgraded to Active Client':'ترقية إلى عميل متعاقد','workspace access removed':'أُلغيت مساحة العمل'};
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
        render(); dirty(); loadOrders(); loadUsers(); loadWork(); loadNotify(); });
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
