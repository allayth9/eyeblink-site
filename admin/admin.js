/* Eyeblink admin — edits content.json through /api (Cloudflare) or, without a server, as a local draft. */
(function(){
  var API='../api', PW='', LIVE=false, C=null, SAVED='', TAB='home', ORDERS=[], P=null, PSAVED='', OFILTER='all';
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
      {h:'مقدمة الخدمات', fields:[{p:'servicesIntro.h', t:'bi', l:'العنوان'},{p:'servicesIntro.p', t:'bita', l:'الوصف'}]} ]},
    {id:'services', title:'الخدمات', secs:[
      {h:'الخدمات الأربع', hint:'لكل خدمة صفحة خاصة بعالمها البصري. إضافة نوع خدمة جديد بالكامل يحتاج تصميم صفحته.', rep:{p:'services', fixed:1, name:function(x){return (x.name&&x.name.ar)||x.id}, fields:[
        {p:'label', t:'text', l:'التسمية اللاتينية الصغيرة', ltr:1},
        {p:'name', t:'bi', l:'الاسم'},
        {p:'short', t:'bita', l:'وصف مختصر (البطاقة في الرئيسية)'},
        {p:'body', t:'bita', l:'الوصف الكامل (صفحة الخدمة)'},
        {p:'tags', t:'bilist', l:'الوسوم', hint:'كل وسم بسطر'},
        {p:'deliverables', t:'bilist', l:'ماذا يستلم العميل', hint:'كل بند بسطر'},
        {p:'tools', t:'list', l:'الأدوات والبرامج', hint:'كل أداة بسطر', ltr:1} ]}} ]},
    {id:'packages', title:'الباقات والأسعار', secs:[
      {h:'نصوص الصفحة', fields:[{p:'packages.h', t:'bi', l:'العنوان'},{p:'packages.p', t:'bita', l:'الوصف'},
        {p:'packages.currency', t:'text', l:'رمز العملة', ltr:1},{p:'packages.note', t:'bita', l:'ملاحظة الأسعار'},{p:'packages.payment', t:'bita', l:'طرق الدفع (تظهر بعد الطلب)'}]},
      {h:'الباقات', rep:{p:'packages.items', name:function(x){return ((x.name&&x.name.ar)||'باقة')+(x.price!=null&&x.price!==''?' · '+x.price:' · عرض سعر')},
        add:function(){return {id:'pkg-'+Date.now().toString(36),service:'editing',featured:false,price:null,unit:bi('للفيديو','per video'),name:bi('باقة جديدة','New package'),desc:bi(),features:bi([],[])}},
        fields:[{p:'name', t:'bi', l:'اسم الباقة'},
          {row:[{p:'price', t:'num', l:'السعر (اتركه فارغاً = عرض سعر)'},{p:'service', t:'select', l:'الخدمة', opts:SVC},{p:'featured', t:'check', l:'الأكثر طلباً'}]},
          {p:'unit', t:'bi', l:'الوحدة (للفيديو، شهرياً…)'},{p:'desc', t:'bita', l:'وصف قصير'},{p:'features', t:'bilist', l:'المميزات', hint:'كل ميزة بسطر'},
          {p:'id', t:'text', l:'المعرّف (يظهر في الرابط)', ltr:1} ]}},
      {h:'الإضافات', rep:{p:'packages.addons', name:function(x){return ((x.name&&x.name.ar)||'إضافة')+' · '+(x.type==='percent'?x.price+'%':x.price)},
        add:function(){return {id:'add-'+Date.now().toString(36),name:bi('إضافة','Add-on'),price:10,type:'fixed'}},
        fields:[{p:'name', t:'bi', l:'الاسم'},{row:[{p:'price', t:'num', l:'القيمة'},{p:'type', t:'select', l:'النوع', opts:function(){return [['fixed','مبلغ ثابت'],['percent','نسبة %']]}},{p:'id', t:'text', l:'المعرّف', ltr:1}]} ]}} ]},
    {id:'work', title:'الأعمال', secs:[
      {h:'نصوص القسم', fields:[{p:'work.h', t:'bi', l:'العنوان قبل إضافة أعمال'},{p:'work.p', t:'bita', l:'الوصف قبل إضافة أعمال'},{p:'work.filledH', t:'bi', l:'العنوان بعد إضافة أعمال'},{p:'work.filledP', t:'bita', l:'الوصف بعد إضافة أعمال'}]},
      {h:'المشاريع', hint:'أول 3 مشاريع تظهر في الرئيسية. المعاينة: 6–8 ثوانٍ بدون صوت، حتى 5MB. الفيديو الكامل الأفضل على Vimeo أو YouTube.', rep:{p:'projects',
        name:function(x){return (x.title&&x.title.ar)||'مشروع'}, add:function(){return {title:bi('مشروع جديد',''),service:'editing',summary:bi(),client:'',year:String(new Date().getFullYear()),ratio:'16:9',preview:'',poster:'',full:{type:'vimeo',id:''}}},
        fields:[{p:'title', t:'bi', l:'اسم المشروع'},
          {row:[{p:'service', t:'select', l:'الخدمة', opts:SVC},{p:'ratio', t:'select', l:'المقاس', opts:function(){return [['16:9','أفقي 16:9'],['9:16','عمودي 9:16'],['1:1','مربع 1:1'],['4:5','4:5']]}},{p:'year', t:'text', l:'السنة', ltr:1}]},
          {p:'summary', t:'bi', l:'سطر عن المشروع'},{p:'client', t:'text', l:'العميل (اختياري)'},
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
      {h:'تفاصيل الدفع الخاصة', hint:'لا تظهر على الموقع أبداً. تُستخدم فقط في رسائل الرد على الطلبات (رقم المحفظة، البريد، بيانات الاستلام…).', priv:'payments'} ]},
    {id:'settings', title:'الإعدادات', settings:1},
    {id:'orders', title:'الطلبات', orders:1},
    {id:'backup', title:'نسخ احتياطي', backup:1}
  ];

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
    var newCount=ORDERS.filter(function(o){return o.status==='new'}).length;
    $('#tabs').innerHTML=TABS.map(function(t){ return '<button type="button" data-tab="'+t.id+'"'+(t.id===TAB?' aria-current="true"':'')+'>'+esc(t.title)+(t.id==='orders'&&newCount?'<span class="count">'+newCount+'</span>':'')+'</button>'; }).join('');
  }
  function render(){
    renderTabs();
    var tab=TABS.filter(function(t){return t.id===TAB})[0];
    $('#tabTitle').textContent=tab.title;
    if(tab.orders) return renderOrders();
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
    if(b.dataset.tab){ TAB=b.dataset.tab; render(); if(TAB==='orders') loadOrders(); scrollTo(0,0); return; }
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
  function sampleOrders(){ return [{key:'order:demo',code:'EB-DEMO1',status:'new',createdAt:new Date().toISOString(),name:'طلب تجريبي',contact:'@client.account',details:'فيديو موشن 45 ثانية لإطلاق منتج. (هذا طلب تجريبي ليظهر لك شكل الصندوق)',package:'motion',packageName:'فيديو موشن غرافيك',addons:['كتابة السكريبت'],total:'85 $',lang:'ar',price:'',method:'',paid:false,paidAmount:'',notes:'',history:[{at:new Date().toISOString(),status:'new'}],demo:true}]; }
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
      return '<details class="order item"'+(o.status==='new'?' open':'')+'><summary><span class="chev">‹</span><span class="code">'+esc(o.code)+'</span><span class="pill '+esc(o.status)+'">'+esc(ST[o.status]||o.status)+'</span>'+(o.paid?'<span class="pill paid">مدفوع</span>':'')+
        '<b>'+esc(o.name)+' · '+esc(o.packageName||o.package)+'</b><span class="muted small">'+esc(new Date(o.createdAt).toLocaleDateString('ar'))+'</span></summary><div class="body">'+
        '<div class="grid2"><div>'+
          '<div class="small muted">الطلب</div><div><b>'+esc(o.packageName||o.package)+'</b> · التقدير: <span dir="ltr">'+esc(o.total)+'</span>'+(o.addons&&o.addons.length?'<br>إضافات: '+esc(o.addons.join('، ')):'')+'</div>'+
          '<div class="small muted" style="margin-top:8px">العميل</div><div>'+esc(o.name)+' — <span dir="ltr" style="user-select:all">'+esc(o.contact)+'</span></div>'+
          '<div class="small muted" style="margin-top:8px">التفاصيل</div><pre>'+esc(o.details)+'</pre>'+
          (o.link?'<div dir="ltr" class="small"><a href="'+esc(o.link)+'" target="_blank" rel="noopener">'+esc(o.link)+'</a></div>':'')+(o.deadline?'<div class="small muted">الموعد: '+esc(o.deadline)+'</div>':'')+
          '<div class="small muted" style="margin-top:8px">السجل</div><div class="small">'+(o.history||[]).map(function(h){return esc(ST[h.status]||h.status)+' · '+esc(new Date(h.at).toLocaleString('ar'))}).join('<br>')+'</div>'+
        '</div><div class="ofields">'+
          '<div class="row"><div class="field"><label>الحالة</label><select data-of="status">'+Object.keys(ST).map(function(s2){return '<option value="'+s2+'"'+(s2===o.status?' selected':'')+'>'+ST[s2]+'</option>'}).join('')+'</select></div>'+
          '<div class="field"><label>السعر النهائي</label><input data-of="price" dir="ltr" value="'+esc(o.price)+'" placeholder="'+esc(o.total)+'"></div></div>'+
          '<div class="row"><div class="field"><label>طريقة الدفع</label><select data-of="method"><option value="">—</option>'+methods.map(function(m){return '<option value="'+esc(m.id)+'"'+(m.id===o.method?' selected':'')+'>'+esc(m.name)+'</option>'}).join('')+'</select></div>'+
          '<div class="field"><label>المبلغ المستلم</label><input data-of="paidAmount" dir="ltr" value="'+esc(o.paidAmount)+'"></div></div>'+
          '<label class="check"><input type="checkbox" data-of="paid"'+(o.paid?' checked':'')+'> تم استلام الدفع</label>'+
          '<div class="field"><label>ملاحظات داخلية</label><textarea data-of="notes">'+esc(o.notes)+'</textarea></div>'+
          '<div class="actions"><button class="btn primary sm" type="button" data-osave="'+k+'">حفظ الطلب</button><button class="btn sm danger" type="button" data-odel="'+k+'">حذف</button></div>'+
          '<div class="small muted" style="margin-top:6px">رد سريع</div><div class="actions"><button class="btn sm" type="button" data-reply="confirm" data-ok="'+k+'">تأكيد + تفاصيل الدفع</button><button class="btn sm" type="button" data-reply="paid" data-ok="'+k+'">وصل الدفع</button><button class="btn sm" type="button" data-reply="delivered" data-ok="'+k+'">تم التسليم</button></div>'+
          '<div class="replybox" hidden><textarea class="replytext" dir="auto"></textarea><div class="actions"><button class="btn sm primary" type="button" data-copyreply>نسخ الرسالة</button><a class="btn sm" data-openreply target="_blank" rel="noopener">افتح المحادثة</a></div></div>'+
        '</div></div></div></details>';
    }).join('')+'</div>';
  }
  function orderOf(key){ return ORDERS.filter(function(o){return o.key===key})[0]; }
  function readOrderForm(box){ var d={}; [].forEach.call(box.querySelectorAll('[data-of]'),function(el){ d[el.dataset.of]= el.type==='checkbox'? el.checked : el.value; }); return d; }
  document.addEventListener('click',function(e){
    var b=e.target.closest('button,a'); if(!b) return;
    if(b.dataset.ofilter){ OFILTER=b.dataset.ofilter; renderOrders(); return; }
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

  /* ---------------- settings ---------------- */
  function renderSettings(){
    var S=C.settings=C.settings||{}; var T=(P&&P.templates)||DEFAULT_TPL;
    var tog=function(k,l){ return '<label class="check"><input type="checkbox" data-p="settings.'+k+'" data-t="check"'+(S[k]!==false?' checked':'')+'> '+l+'</label>'; };
    $('#panel').innerHTML=
      '<section class="sec"><h3>ما يظهر على الموقع</h3>'+tog('showStats','خانة الأرقام في الرئيسية')+tog('showWorkTeaser','الأعمال في الرئيسية')+tog('showPackagesTeaser','الباقات في الرئيسية')+tog('showPayments','طرق الدفع (صفحة الباقات وأسفل الموقع)')+tog('ordersOpen','استقبال الطلبات من صفحة الباقات')+'</section>'+
      '<section class="sec"><h3>وسائل تواصل إضافية</h3><p class="hint">تظهر في صفحة التواصل إن كتبتها.</p><div class="row">'+
        '<div class="field"><label>رقم واتساب (مع رمز الدولة)</label><input data-p="settings.whatsapp" data-t="text" dir="ltr" value="'+esc(S.whatsapp||'')+'" placeholder="+9715XXXXXXXX"></div>'+
        '<div class="field"><label>البريد الإلكتروني</label><input data-p="settings.email" data-t="text" dir="ltr" value="'+esc(S.email||'')+'"></div></div></section>'+
      '<section class="sec"><h3>رسائل الرد الجاهزة</h3><p class="hint">تُستخدم في صندوق الطلبات. المتغيرات: {name} {code} {package} {price} {method} {details} — و{details} تُملأ من «تفاصيل الدفع الخاصة».</p>'+
        ['confirm','paid','delivered'].map(function(k){ var lab={confirm:'تأكيد + تفاصيل الدفع',paid:'وصل الدفع',delivered:'تم التسليم'}[k];
          return '<div class="field"><label>'+lab+'</label><div class="bi"><div><small>عربي</small><textarea data-tpl="ar.'+k+'">'+esc((T.ar||{})[k]||'')+'</textarea></div><div><small>ENGLISH</small><textarea data-tpl="en.'+k+'" dir="ltr">'+esc((T.en||{})[k]||'')+'</textarea></div></div></div>'; }).join('')+'</section>'+
      '<section class="sec"><h3>كلمة سر اللوحة</h3>'+(LIVE?'<p class="hint">10 أحرف على الأقل. ستُطلب منك عند الدخول القادم.</p><div class="row"><div class="field"><label>كلمة السر الجديدة</label><input type="password" id="np1" autocomplete="new-password"></div><div class="field"><label>أعد كتابتها</label><input type="password" id="np2" autocomplete="new-password"></div></div><div><button class="btn primary" type="button" id="pwChange">تغيير كلمة السر</button></div>'
        :'<p class="hint">تغيير كلمة السر يعمل بعد نشر الموقع على Cloudflare. الدخول الأول يكون بكلمة السر التي تضعها في إعدادات Cloudflare (ADMIN_PASSWORD).</p>')+'</section>';
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
