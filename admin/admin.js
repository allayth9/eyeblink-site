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
      {h:'نافذة الطلب', hint:'تنفتح فوق الصفحة لما العميل يضغط «اطلب». حدّد شو يسأل وشو يشوف.', fields:[
        {row:[{p:'order.askQty', t:'check', l:'عدّاد عدد الفيديوهات (للخدمات)'},{p:'order.askPlatform', t:'check', l:'سؤال المنصة'},{p:'order.askPay', t:'check', l:'طريقة الدفع المفضّلة'}]},
        {row:[{p:'order.ask_link', t:'check', l:'خانة رابط المواد'},{p:'order.ask_deadline', t:'check', l:'خانة الموعد'},{p:'order.ask_contact', t:'check', l:'خانة التواصل الخارجي'}]},
        {p:'order.platforms', t:'list', l:'المنصات المعروضة', hint:'كل منصة بسطر (Instagram، TikTok…)', ltr:1},
        {p:'order.next', t:'bilist', l:'«شو بيصير بعد الإرسال؟»', hint:'كل خطوة بسطر'}]},
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
      {h:'الدفع التلقائي والتذكير', hint:'«عربون» = يدفع العميل نسبة قبل البدء والباقي قبل التسليم، وكل دفعة إلها فاتورة. التذكير يوصل للعميل مرة وحدة إذا ما رفع الإيصال.', fields:[
        {row:[{p:'payments.defaultPlan', t:'select', l:'خطة الدفع الافتراضية للطلبات', opts:function(){return [['full','كامل المبلغ دفعة وحدة'],['split','عربون + الباقي قبل التسليم']]}},{p:'payments.depositPct', t:'num', l:'نسبة العربون %'}]},
        {row:[{p:'payments.reminders', t:'check', l:'تذكير تلقائي بالدفع'},{p:'payments.reminderHours', t:'num', l:'بعد كم ساعة من إرسال التفاصيل'}]}]},
      {h:'تفاصيل الدفع الخاصة', hint:'لا تظهر على الموقع أبداً. تُستخدم فقط في رسائل الرد على الطلبات (رقم المحفظة، البريد، بيانات الاستلام…).', priv:'payments'} ]},
    {id:'layout', title:'التصميم والترتيب', layout:1},
    {id:'stats', title:'الإحصائيات', stats:1},
    {id:'settings', title:'الإعدادات', settings:1},
    {id:'orders', title:'الطلبات', orders:1},
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
    $('#tabs').innerHTML=TABS.map(function(t){ return '<button type="button" data-tab="'+t.id+'"'+(t.id===TAB?' aria-current="true"':'')+'>'+esc(t.title)+(t.id==='orders'&&newCount?'<span class="count">'+newCount+'</span>':'')+'</button>'; }).join('');
  }
  function render(){
    renderTabs();
    var tab=TABS.filter(function(t){return t.id===TAB})[0];
    $('#tabTitle').textContent=tab.title;
    if(tab.orders) return renderOrders();
    if(tab.stats) return renderStats();
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
    if(b.dataset.tab){ TAB=b.dataset.tab; render(); if(TAB==='orders') loadOrders(); if(TAB==='clients') loadUsers(); scrollTo(0,0); return; }
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
          (o.visit?'<div class="small muted" style="margin-top:8px">من وين إجا</div><div class="small visit">'+[o.visit.source&&('المصدر: <b dir="ltr">'+esc(o.visit.source)+'</b>'),o.visit.utm&&('حملة: <span dir="ltr">'+esc(o.visit.utm)+'</span>'),o.visit.landing&&('أول صفحة: <span dir="ltr">'+esc(o.visit.landing)+'</span>'),o.visit.visits&&('عدد الزيارات قبل الطلب: '+esc(o.visit.visits)),o.visit.first&&('أول زيارة: '+esc(new Date(o.visit.first).toLocaleDateString('ar'))),(o.visit.country||o.visit.city)&&('الموقع: '+esc([o.visit.city,o.visit.country].filter(Boolean).join('، '))),o.visit.device&&('الجهاز: '+esc(DEV[o.visit.device]||o.visit.device)+' · '+esc(o.visit.os||''))].filter(Boolean).join(' · ')+'</div>':'')+
          '<div class="small muted" style="margin-top:8px">التفاصيل</div><pre>'+esc(o.details)+'</pre>'+
          (o.link?'<div dir="ltr" class="small"><a href="'+esc(o.link)+'" target="_blank" rel="noopener">'+esc(o.link)+'</a></div>':'')+(o.deadline?'<div class="small muted">الموعد: '+esc(o.deadline)+'</div>':'')+
          (o.email?'<div class="small muted" style="margin-top:12px">المحادثة مع العميل (تظهر له في حسابه)</div><div class="athread">'+thread(o)+'</div>'+
            (o.review?'<div class="areview"><b>تقييم العميل: '+'★★★★★'.slice(0,o.review.stars)+'<span style="opacity:.3">'+'★★★★★'.slice(o.review.stars)+'</span></b>'+(o.review.text?'<p>'+esc(o.review.text)+'</p>':'')+
              (o.review.publish?'<label class="check"><input type="checkbox" data-rapprove="'+k+'"'+(o.review.approved?' checked':'')+'> اعرضه على الموقع</label>':'<span class="muted small">العميل لم يوافق على النشر.</span>')+'</div>':'')+
            '<div class="apend" hidden></div><div class="asend"><label class="btn sm" title="إرفاق ملف (حتى 20MB)">📎<input type="file" multiple hidden data-oup="'+k+'"></label><textarea data-msg dir="auto" placeholder="'+(o.status==='delivered'||o.status==='cancelled'?'المحادثة مغلقة عند العميل بعد التسليم، لكن رسالتك ستظهر له':'اكتب رداً للعميل…')+'"></textarea><button class="btn primary sm" type="button" data-osend="'+k+'">إرسال</button></div>':'')+
          '<div class="small muted" style="margin-top:8px">السجل</div><div class="small">'+(o.history||[]).map(function(h){return esc(ST[h.status]||h.status)+' · '+esc(new Date(h.at).toLocaleString('ar'))}).join('<br>')+'</div>'+
        '</div><div class="ofields">'+
          '<div class="row"><div class="field"><label>الحالة</label><select data-of="status">'+Object.keys(ST).map(function(s2){return '<option value="'+s2+'"'+(s2===o.status?' selected':'')+'>'+ST[s2]+'</option>'}).join('')+'</select></div>'+
          '<div class="field"><label>السعر النهائي</label><input data-of="price" dir="ltr" value="'+esc(o.price)+'" placeholder="'+esc(o.total)+'"></div></div>'+
          '<div class="row"><div class="field"><label>طريقة الدفع</label><select data-of="method"><option value="">—</option>'+methods.map(function(m){return '<option value="'+esc(m.id)+'"'+(m.id===o.method?' selected':'')+'>'+esc(m.name)+'</option>'}).join('')+'</select></div>'+
          '<div class="field"><label>المبلغ المستلم</label><input data-of="paidAmount" dir="ltr" value="'+esc(o.paidAmount)+'"></div></div>'+
          '<div class="paysend"><div class="small muted">الدفع</div><div class="row"><div class="field"><label>المبلغ المطلوب الآن (فارغ = السعر كامل، أو اكتب عربوناً)</label><input data-payamt dir="ltr" placeholder="'+esc(o.price||o.total||'')+'" value="'+esc((o.payInfo&&o.payInfo.amount!==o.price&&o.payInfo.amount)||'')+'"></div></div>'+
            (o.email?'<button class="btn sm primary" type="button" data-opay="'+k+'">'+(o.payInfo?'أعد إرسال تفاصيل الدفع':'أرسل تفاصيل الدفع للعميل')+'</button>':'')+
            '<div class="small muted" style="margin-top:4px">يرسل تفاصيل «طريقة الدفع» المختارة من «تفاصيل الدفع الخاصة» ككرت دفع في حساب العميل، ويحوّل الحالة إلى «بانتظار الدفع».</div></div>'+
          (function(){ var Pm=C.payments||{}, plan=o.plan||Pm.defaultPlan||'full', pct=o.depositPct||Pm.depositPct||50, dp=o.deposit&&o.deposit.paid;
            return '<div class="row"><div class="field"><label>خطة الدفع</label><select data-of="plan"><option value="full"'+(plan==='full'?' selected':'')+'>كامل المبلغ</option><option value="split"'+(plan==='split'?' selected':'')+'>عربون + الباقي قبل التسليم</option></select></div>'+
              '<div class="field"><label>نسبة العربون %</label><input data-of="depositPct" type="number" min="10" max="90" value="'+esc(pct)+'"></div></div>'+
              (plan==='split'?'<label class="check"><input type="checkbox" data-of="depositPaid"'+(dp?' checked':'')+'> وصل العربون <span class="small muted">— فاتورة عربون تُرسل تلقائياً، وبعدها «أرسل تفاصيل الدفع» يرسل الباقي</span></label>'+
                (o.deposit&&o.deposit.invoice?'<div class="small" style="margin:4px 0 8px">🧾 فاتورة العربون <b dir="ltr">'+esc(o.deposit.invoice.no)+'</b> · <span dir="ltr">'+esc(o.deposit.amount)+'</span> <button class="btn sm" type="button" data-oinv="'+k+'" data-kind="deposit">أعد إرسالها</button></div>':''):'');
          })()+
          '<label class="check"><input type="checkbox" data-of="paid"'+(o.paid?' checked':'')+'> '+((o.plan||(C.payments||{}).defaultPlan)==='split'?'وصلت الدفعة النهائية':'تم استلام الدفع')+' <span class="small muted">— عند الحفظ تُصدر فاتورة برقم تسلسلي وتُرسل للعميل بالإيميل</span></label>'+
          (o.invoice?'<div class="small" style="margin:4px 0 8px">🧾 الفاتورة <b dir="ltr">'+esc(o.invoice.no)+'</b> · '+esc(new Date(o.invoice.at).toLocaleDateString('ar'))+' <button class="btn sm" type="button" data-oinv="'+k+'" data-kind="final">أعد إرسال الفاتورة</button></div>':'')+
          (o.payInfo&&o.payInfo.reminded?'<div class="small muted">⏰ وصل للعميل تذكير تلقائي بالدفع · '+esc(new Date(o.payInfo.reminded).toLocaleString('ar'))+'</div>':'')+
          '<div class="field"><label>ملاحظات داخلية</label><textarea data-of="notes">'+esc(o.notes)+'</textarea></div>'+
          '<div class="actions"><button class="btn primary sm" type="button" data-osave="'+k+'">حفظ الطلب</button><button class="btn sm danger" type="button" data-odel="'+k+'">حذف</button></div>'+
          '<div class="small muted" style="margin-top:6px">رد سريع</div><div class="actions"><button class="btn sm" type="button" data-reply="confirm" data-ok="'+k+'">تأكيد + تفاصيل الدفع</button><button class="btn sm" type="button" data-reply="paid" data-ok="'+k+'">وصل الدفع</button><button class="btn sm" type="button" data-reply="delivered" data-ok="'+k+'">تم التسليم</button></div>'+
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
    if(b.dataset.opay){ var bx=b.closest('.order'), dd=readOrderForm(bx), oo=orderOf(b.dataset.opay);
      if(!dd.price&&!oo.price){ toast('اكتب السعر النهائي أولاً',true); return; } if(!dd.method){ toast('اختر طريقة الدفع أولاً',true); return; }
      if(!((P&&P.payments)||{})[dd.method]){ toast('أضف تفاصيل هذه الطريقة في «طرق الدفع ← تفاصيل الدفع الخاصة» وانشر',true); return; }
      if(!LIVE||oo.demo){ toast('يعمل على الموقع المنشور',true); return; }
      dd.key=oo.key; dd.sendPayment=true; dd.payAmount=bx.querySelector('[data-payamt]').value.trim(); b.disabled=true;
      fetch(API+'/orders',{method:'PATCH',headers:headers({'content-type':'application/json'}),body:JSON.stringify(dd)}).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'fail'); return j; }); })
        .then(function(j){ Object.assign(oo,j.order); renderOrders(); var d2=document.querySelector('[data-okey="'+oo.key+'"]'); if(d2) d2.open=true; toast('وصلت تفاصيل الدفع إلى حساب العميل'); })
        .catch(function(err){ b.disabled=false; toast(/private/.test(err.message)?'لا توجد تفاصيل دفع خاصة لهذه الطريقة':'تعذّر الإرسال',true); }); return; }
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
        '<label class="check"><input type="checkbox" data-ltog="intro"'+(L.intro!==false?' checked':'')+'> انترو فتح العين عند أول زيارة</label>'+
        '<label class="check"><input type="checkbox" data-ltog="particles"'+(L.particles!==false?' checked':'')+'> خلفية الجزيئات المتحركة</label>'+
        '<label class="check"><input type="checkbox" data-ltog="countUp"'+(L.countUp!==false?' checked':'')+'> عدّاد الأرقام (يعدّ من الصفر لما تظهر الخانات)</label>'+
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
        (!LIVE?'<p class="hint">أرقام تجريبية. الأرقام الحقيقية تبدأ بعد النشر.</p>':'<p class="hint">إحصائيات مجهولة الهوية: ما منخزّن IP ولا أي بيانات شخصية. الزيارة = جلسة تصفّح وحدة، والزائر الجديد = أول مرة بيفتح الموقع من هالجهاز.</p>')+'</section>'+
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
  function loadUsers(){
    if(!LIVE){ USERS=[{email:'client@example.com',name:'عميل تجريبي',provider:'password',hasPassword:true,createdAt:new Date().toISOString(),orders:1}]; renderClients(); return; }
    fetch(API+'/users',{headers:headers({})}).then(function(r){return r.json()}).then(function(j){ USERS=j.users||[]; if(TAB==='clients') renderClients(); }).catch(function(){});
  }
  function renderClients(){
    var U=USERS;
    if(!U){ $('#panel').innerHTML='<section class="sec"><div class="empty">…</div></section>'; return; }
    $('#panel').innerHTML='<section class="sec"><h3>حسابات العملاء ('+U.length+')</h3><p class="hint">كل من يرسل طلباً يسجّل بالإيميل أو Google. إن نسي أحدهم كلمة السر: اضغط «كلمة سر جديدة» وأرسلها له عبر التواصل الخارجي، ويقدر يدخل فيها فوراً.</p>'+
      (U.length? '<div class="clients">'+U.map(function(u){ return '<div class="client"><div><b>'+esc(u.name)+'</b> <span dir="ltr" class="muted small" style="user-select:all">'+esc(u.email)+'</span></div>'+
        '<span class="muted small">'+(u.google?'Google':'')+(u.google&&u.hasPassword?' + ':'')+(u.hasPassword?'كلمة سر':'')+' · '+u.orders+' طلب · '+esc(new Date(u.createdAt).toLocaleDateString('ar'))+'</span>'+
        '<div class="actions"><button class="btn sm" type="button" data-upw="'+esc(u.email)+'">كلمة سر جديدة</button><button class="btn sm danger" type="button" data-udel="'+esc(u.email)+'">حذف الحساب</button></div><div class="newpw" hidden></div></div>'; }).join('')+'</div>'
        : '<div class="empty">لا يوجد عملاء بعد.</div>')+'</section>';
  }
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
      '<section class="sec"><h3>التنبيهات</h3><p class="hint">يبعت رسالة تجريبية على تيليغرام وإيميل تجريبي، ويقلّك شو ردّ كل واحد. (بعد أي تغيير بمتغيرات Cloudflare لازم Retry deployment.)</p><div><button class="btn" type="button" id="notifyTest">أرسل تنبيهاً تجريبياً</button></div><pre id="notifyOut" class="small" hidden style="white-space:pre-wrap;margin-top:10px"></pre></section>'+
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
        var tr=function(d){ d=String(d||''); if(/chat not found/i.test(d)) return 'رقم TELEGRAM_CHAT غلط، أو ما بعتت رسالة للبوت بعد.'; if(/Unauthorized|Not Found/i.test(d)) return 'TELEGRAM_TOKEN غلط أو انلغى. انسخه من جديد من BotFather.'; if(/not set/i.test(d)) return 'المتغيّر غير موجود (أو لسا ما عملت Retry deployment).'; return d; };
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
      SAVED=JSON.stringify(j);
      var draft=null; try{ draft=JSON.parse(localStorage.getItem('eb-draft')||'null'); }catch(_){}
      C= (draft && JSON.stringify(draft)!==SAVED && !LIVE)? draft : j;
      if(!LIVE && draft) SAVED=JSON.stringify(draft);
      $('#login').hidden=true; $('#app').hidden=false;
      $('#mode').innerHTML= LIVE? '<b>متصل بالموقع</b><br>«نشر التعديلات» يحدّث الموقع فوراً.' : '<b>وضع المعاينة</b><br>لا يوجد خادم هنا، فالتعديلات تُحفظ في هذا المتصفح. اضغط «معاينة» لرؤيتها على الموقع.';
      var loadPriv= LIVE? fetch(API+'/private',{headers:headers({})}).then(function(r){return r.ok?r.json():{data:null}}).then(function(j){ return j.data; }).catch(function(){return null;})
                         : Promise.resolve((function(){ try{ return JSON.parse(localStorage.getItem('eb-private')||'null'); }catch(_){ return null; } })());
      return loadPriv.then(function(pd){ P=pd||{payments:{},templates:JSON.parse(JSON.stringify(DEFAULT_TPL))}; PSAVED=JSON.stringify(P);
        render(); dirty(); loadOrders(); });
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
