/* Eyeblink admin · clients — loaded after the files before it; all of admin/js shares one scope */
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
  var CL=null, CQ='', CF='all', CS='activity', CADD=false, PROF=null, PSEC='overview', PTF='open', PFC='all', PEDIT=false, CSELM=false, CSEL={};
  function loadClients(){ if(!LIVE){ CL={err:'live'}; if(TAB==='clients') renderClients(); return; }
    fetch(API+'/work?admin=1&view=clients',{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); })
      .then(function(j){ CL=j.ok?j:{err:j.error||'fail'}; if(TAB==='clients') renderClients(); }).catch(function(){ CL={err:'net'}; if(TAB==='clients') renderClients(); }); }
  function loadProfile(email,sec){ if(sec) PSEC=sec; PROF={email:email,loading:1,d:PROF&&PROF.email===email?PROF.d:null}; PEDIT=false; renderClients();
    route();
    fetch(API+'/work?admin=1&profile='+encodeURIComponent(email),{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); })
      .then(function(j){ PROF=j.ok?{email:email,d:j}:{email:email,err:j.error||(LIVE?'fail':'live')}; renderClients(); })
      .catch(function(){ PROF={email:email,err:'net'}; renderClients(); }); }
  function closeProfile(){ PROF=null; route(); renderClients(); scrollTo(0,0); }
  // every change made from a profile goes through here, then the profile and the list reload
  function creq(body,btn,ok){ if(!LIVE){ toast('يعمل على الموقع المنشور',true); return Promise.reject(); } if(btn) btn.disabled=true; if(NEXT_NOTIFY){ body.notify=NEXT_NOTIFY; ok=sndSay(NEXT_NOTIFY,ok); }   // the send sheet's choice
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
      '<div class="cl-sel">'+(CSELM?'<span class="small muted">'+(Object.keys(CSEL).length?'حُدّد '+Object.keys(CSEL).length:'اضغط على العملاء لتحديدهم')+'</span>'+(Object.keys(CSEL).length?'<button class="btn sm danger" type="button" data-cpurgesel>حذف المحدد…</button>':''):'')+'<button class="btn sm" type="button" data-csel>'+(CSELM?'إنهاء التحديد':'تحديد عدة عملاء')+'</button></div>'+
      '<div class="cl-tools"><input type="search" class="cl-q" placeholder="ابحث بالاسم أو البريد أو الهاتف…" value="'+esc(CQ)+'" aria-label="بحث"><select class="cl-sort" aria-label="الترتيب"><option value="activity"'+(CS==='activity'?' selected':'')+'>الأحدث نشاطاً</option><option value="name"'+(CS==='name'?' selected':'')+'>الاسم</option><option value="added"'+(CS==='added'?' selected':'')+'>الأحدث إضافة</option></select></div>'+
      '<div class="chips cl-chips">'+CFL.map(function(x){ var n=all.filter(function(c){ return cmatch(c,x[0]); }).length; return '<button type="button" class="btn sm f-'+x[0]+(CF===x[0]?' primary':'')+'" data-cf="'+x[0]+'">'+x[1]+' <small>'+n+'</small></button>'; }).join('')+'</div>'+
      (list.length?'<div class="cl-list">'+list.map(function(c){
        return '<button type="button" class="cl-row'+(c.status==='archived'?' arch':'')+(CSELM&&CSEL[c.email]?' sel':'')+'" data-copen="'+esc(c.email)+'"'+(CSELM?' aria-pressed="'+!!CSEL[c.email]+'"':'')+'>'+(CSELM?'<i class="cl-ck" aria-hidden="true"></i>':'')+avatar(c)+
          '<span class="cl-id"><b>'+esc(c.name||c.email)+'</b>'+(c.company?'<small>'+esc(c.company)+'</small>':'')+'<span class="small muted" dir="ltr">'+esc(c.email)+(c.phone?' · '+esc(c.phone):'')+'</span></span>'+
          '<span class="cl-st">'+acctChip(c)+(c.status!=='active'?'<span class="rpill st-'+esc(c.status)+'">'+esc(CST[c.status])+'</span>':'')+'</span>'+
          '<span class="cl-n">'+(c.projects?'<span><b>'+c.projects+'</b> '+(c.projects>1?'مشاريع':'مشروع')+'</span>':'')+(c._orders?'<span><b>'+c._orders+'</b> '+(c._orders>1?'طلبات':'طلب')+'</span>':'')+(c.open_tasks?'<span><b>'+c.open_tasks+'</b> '+(c.open_tasks>1?'مهام مفتوحة':'مهمة مفتوحة')+'</span>':'')+'</span>'+
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
  var PSECS=[['overview','نظرة عامة'],['projects','المشاريع'],['orders','الطلبات'],['tasks','المهام'],['billing','الفواتير والمدفوعات'],['files','الملفات'],['brand','مكتبة الهوية'],['reports','التقارير'],['support','الدعم'],['log','سجل النشاط']];
  function renderProfile(){ var P=PROF;
    if(P.err) { $('#panel').innerHTML='<section class="sec"><button class="btn sm" type="button" data-pclose>← كل العملاء</button><div class="empty">'+(P.err==='live'?'يعمل هذا القسم على الموقع المنشور.':P.err==='db'?'قاعدة البيانات غير مربوطة.':'تعذّر تحميل ملف العميل.')+'</div></section>'; return; }
    if(!P.d){ $('#panel').innerHTML='<section class="sec"><button class="btn sm" type="button" data-pclose>← كل العملاء</button><div class="skel"><i></i><i></i><i></i></div></section>'; return; }
    var D=P.d, c=D.client||{}, u=D.user, email=P.email, isCl=u.role==='client', ords=ordersOf(email), listC=(CL&&CL.clients||[]).filter(function(x){ return x.email===email; })[0]||{};
    var cnt={projects:D.projects.length,orders:ords.length,tasks:D.tasks.length,billing:D.invoices.length,files:D.files.length+D.delivered.length,brand:D.brand?D.brand.assets.length+D.brand.colors.length+D.brand.fonts.length:0,support:supOf(email).length,log:D.activity.length};
    var head='<section class="sec cp-head"><div class="cp-top"><button class="btn sm" type="button" data-pclose>‹ كل العملاء</button>'+(P.loading?'<span class="small muted">يُحدَّث…</span>':'')+'</div>'+
      '<div class="cph2"><div class="cp-av"><button type="button" class="cp-av-b" data-avset aria-label="'+(c.logo_url?'غيّر الصورة':'ارفع صورة')+'">'+avatar({name:c.name||u.name,email:email,logo_url:c.logo_url},true)+
        '<i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg></i></button><input type="file" hidden data-avfile accept="image/png,image/jpeg,image/webp"></div><div class="cp-id"><h2>'+esc(c.name||u.name||email)+'</h2>'+(c.company?'<div>'+esc(c.company)+'</div>':'')+
        '<div class="small muted"><span dir="ltr" style="user-select:all">'+esc(email)+'</span>'+(c.phone?' · <span dir="ltr">'+esc(c.phone)+'</span>':'')+(c.id?' · <span class="code">'+esc(c.id)+'</span>':'')+'</div>'+
        '<div class="cp-avact"><button class="btn sm" type="button" data-avset>'+(c.logo_url?'غيّر الصورة':'ارفع صورة')+'</button>'+(brandPic(D)?'<button class="btn sm" type="button" data-avbrand>خذها من مكتبة الهوية</button>':'')+(c.logo_url?'<button class="btn sm danger" type="button" data-avdel>احذف الصورة</button>':'')+'</div>'+
        '<div class="cp-chips">'+acctChip({account:D.account?{role:u.role}:null})+'<span class="rpill st-'+esc(c.status||'active')+'">'+esc(CST[c.status||'active'])+'</span>'+(isCl&&u.clientSince?'<span class="small muted">متعاقد منذ '+esc(new Date(u.clientSince).toLocaleDateString('ar'))+'</span>':'')+'</div></div>'+
        '<div class="actions client cp-acts">'+'<button class="btn sm" type="button" data-cedit>'+(PEDIT?'إغلاق التعديل':'تعديل البيانات')+'</button>'+
          (D.account?(isCl?'':'<button class="btn sm primary" type="button" data-urole="'+esc(email)+'" data-to="client">ترقية إلى عميل متعاقد</button>'):'<button class="btn sm primary" type="button" data-cready>تجهيز حسابه وإصدار بيانات الدخول</button>')+
          '<details class="cp-more"><summary class="btn sm" aria-label="المزيد">⋯</summary><div class="cp-menu">'+
            (D.account?'<button class="btn sm" type="button" data-ctemp>بيانات دخول جديدة</button>':'<button class="btn sm" type="button" data-cinvite>إرسال دعوة بدلاً من التجهيز</button>')+
            (D.account&&isCl?'<button class="btn sm" type="button" data-urole="'+esc(email)+'" data-to="customer">إلغاء مساحة العمل</button>':'')+
            (c.status==='archived'?'<button class="btn sm" type="button" data-carch="0">استعادة العميل</button>':'<button class="btn sm" type="button" data-carch="1">أرشفة</button>')+
            '<button class="btn sm danger" type="button" data-cpurge="'+esc(email)+'">حذف العميل…</button>'+
          '</div></details>'+
          '<div class="newpw small" hidden></div></div></div>'+
      (PEDIT?'<form class="cl-edit" id="clEdit" novalidate><div class="row"><div class="field"><label>الاسم</label><input name="name" dir="auto" value="'+esc(c.name||u.name||'')+'"></div><div class="field"><label>الشركة أو العلامة</label><input name="company" dir="auto" value="'+esc(c.company||'')+'"></div></div>'+
        '<div class="row"><div class="field"><label>الهاتف أو واتساب</label><input name="phone" dir="ltr" value="'+esc(c.phone||'')+'"></div>'+
        '<div class="field"><label>حالة التعامل</label><select name="status">'+Object.keys(CST).map(function(k){ return '<option value="'+k+'"'+((c.status||'active')===k?' selected':'')+'>'+CST[k]+'</option>'; }).join('')+'</select></div></div>'+
        '<div class="field"><label>ملاحظات داخلية (لا يراها العميل)</label><textarea name="notes" dir="auto" rows="3">'+esc(c.notes||'')+'</textarea></div><div class="actions"><button class="btn primary sm" type="submit">حفظ البيانات</button></div></form>'
        :(c.notes?'<div class="cp-notes"><span class="small muted">ملاحظات داخلية</span><p>'+esc(c.notes).replace(/\n/g,'<br>')+'</p></div>':''))+
      '<nav class="cp-tabs" role="tablist">'+PSECS.map(function(x){ return '<button type="button" role="tab" class="t-'+x[0]+'" aria-selected="'+(PSEC===x[0])+'" data-psec="'+x[0]+'">'+x[1]+(cnt[x[0]]?' <small>'+cnt[x[0]]+'</small>':'')+'</button>'; }).join('')+'</nav></section>';
    $('#panel').innerHTML=head+pkgCard()+'<div class="cp-body">'+({overview:pOverview,projects:pProjects,orders:pOrders,tasks:pTasks,billing:pBilling,files:pFiles,brand:pBrand,reports:pReports,support:pSupport,log:pLog}[PSEC]||pOverview)(D,ords,listC)+'</div>';
  }
  function kpi(n,l,k){ var fam={'#F5C66B':' ck-wait','#7DD3FC':' ck-ok'}[k]||''; return '<div class="ck'+fam+'"><b>'+n+'</b><span>'+l+'</span></div>'; }
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
    return clientPkg(D)+'<section class="sec"><div class="ph"><h3>المشاريع ('+D.projects.length+')</h3>'+(canP?'<button class="btn sm primary" type="button" data-pnewp>+ مشروع جديد</button>':'')+'</div>'+
      (!canP?'<p class="hint">رقِّ الحساب إلى عميل متعاقد أو أرسل له دعوة لتتمكن من فتح مشروع له.</p>':'')+
      '<form class="cl-proj" id="clProj" hidden novalidate><div class="row"><div class="field"><label>اسم المشروع *</label><input name="name" dir="auto" required></div><div class="field"><label>النوع</label><select name="type">'+Object.keys(WPT).map(function(k){ return '<option value="'+k+'">'+WPT[k]+'</option>'; }).join('')+'</select></div></div>'+
        '<div class="row"><div class="field"><label>تاريخ البدء</label><input name="start_date" type="date"></div><div class="field"><label>تاريخ التسليم</label><input name="end_date" type="date"></div><div class="field"><label>الحصة الشهرية (مهام)</label><input name="quota" type="number" min="0" dir="ltr"></div></div>'+
        '<div class="field"><label>وصف مختصر</label><textarea name="description" dir="auto" rows="2"></textarea></div><div class="actions"><button class="btn primary sm" type="submit">إنشاء المشروع</button></div></form>'+
      (D.projects.length?'<div class="cp-projs">'+D.projects.map(function(p){ var lo=ords.filter(function(o){ return o.projectId===p.id; }).length, fl=D.files.filter(function(f){ return f.project_id===p.id; }).length+D.delivered.filter(function(x){ return x.project_id===p.id; }).length, late=p.status==='active'&&p.end_date&&p.end_date<D.today;
        return '<article class="cp-proj'+(late?' late':'')+'"><div class="ph"><div><b>'+esc(p.name)+'</b> <span class="small muted">'+esc((WPT[p.type]||p.type)+(typeof cadTxt==='function'?cadTxt(p):''))+'</span></div><div class="cp-pa"><button class="btn sm" type="button" data-pedit="'+esc(p.id)+'">تعديل</button>'+(D.agreement?'<span class="tag'+(p.in_pkg===0?'':' ok')+'">'+(p.in_pkg===0?'خارج الباقة':'ضمن الباقة')+'</span>':'')+'<select data-pstat="'+esc(p.id)+'" aria-label="حالة المشروع">'+Object.keys(WPS).map(function(k){ return '<option value="'+k+'"'+(p.status===k?' selected':'')+'>'+WPS[k]+'</option>'; }).join('')+'</select></div></div>'+
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
    return '<section class="sec"><div class="ph"><h3>المهام</h3>'+(act.length||(D.account&&D.user.role==='client')?'<button class="btn sm primary" type="button" data-pnewt>+ مهمة جديدة</button>':'')+'</div>'+
      '<form class="cl-task" id="clTask" hidden novalidate><div class="row"><div class="field"><label>المشروع *</label><select name="project"><optgroup label="المشاريع">'+act.filter(function(p){ return !p.single; }).map(function(p){ return '<option value="'+esc(p.id)+'"'+(PROF.proj===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</optgroup>'+
          '<optgroup label="خارج المشاريع"><option value="__single">أعمال منفردة · حلقة لوحدها، لوجو، شغلة لمرة واحدة</option></optgroup></select></div><div class="field"><label>العنوان *</label><input name="title" dir="auto" required placeholder="مثلاً: بوستر، أو حلقة"></div></div>'+
        '<div class="row"><div class="field cl-cnt"><label>العدد</label><div class="cl-step"><button type="button" class="btn sm" data-cstep="-1" aria-label="أقل">−</button><input name="count" type="number" min="1" max="30" value="1" dir="ltr"><button type="button" class="btn sm" data-cstep="1" aria-label="أكثر">+</button></div></div>'+
          (D.agreement?'<div class="field"><label>الوحدة من باقة العميل</label><select name="unit"><option value="">—</option>'+D.agreement.units.map(function(u){ return '<option value="'+esc(u.id)+'">'+esc(u.name)+'</option>'; }).join('')+'</select></div>':'')+'</div>'+
        '<div class="cl-names" hidden><label class="check"><input type="checkbox" name="named" data-cnamed> سمِّ كل واحدة باسمها <span class="small muted">(وإلا تُرقَّم بعد العنوان: بوستر 1، بوستر 2…)</span></label><div class="cl-nl" hidden></div></div>'+
        '<div class="row"><div class="field"><label>الأولوية</label><select name="priority">'+Object.keys(WPR).map(function(k){ return '<option value="'+k+'">'+WPR[k]+'</option>'; }).join('')+'</select></div><div class="field"><label>تاريخ الاستحقاق</label><input name="confirmed_date" type="date"></div><div class="field"><label>المسؤول عن التنفيذ</label><input name="assignee" dir="auto" placeholder="اختياري"></div></div>'+
        '<div class="field"><label>الوصف</label><textarea name="description" dir="auto" rows="2"></textarea></div>'+
        '<div class="row cl-done"><label class="check"><input type="checkbox" name="done" data-tdone> مهمة منجزة سابقاً</label><div class="field" data-tdd hidden><label>تاريخ الإنجاز</label><input name="done_date" type="date" max="'+new Date().toISOString().slice(0,10)+'" value="'+new Date().toISOString().slice(0,10)+'"></div></div>'+
        '<p class="hint" data-th="0">مع تاريخ الاستحقاق تُنشأ المهمة مقبولة، ودونه تكون قيد المراجعة. يصل إشعار إلى العميل.</p><p class="hint" data-th="1" hidden>تُسجَّل مكتملة بتاريخ إنجازها، وتدخل في تقرير تلك الفترة، ولا يصل إلى العميل أي إشعار.</p>'+
        '<div class="actions"><button class="btn primary sm" type="submit">إنشاء المهمة</button></div></form>'+
      '<div class="chips">'+[['open','المفتوحة'],['done','المكتملة'],['closed','الملغاة والمرفوضة'],['all','الكل']].map(function(x){ var n=D.tasks.filter(function(t){ return (!TGRP[x[0]]||TGRP[x[0]].indexOf(t.status)>=0)&&(!PROF.proj||t.project_id===PROF.proj); }).length; return '<button type="button" class="btn sm'+(PTF===x[0]?' primary':'')+'" data-ptf="'+x[0]+'">'+x[1]+' <small>'+n+'</small></button>'; }).join('')+
        (D.projects.length>1?'<select class="cp-pf" data-pfilter aria-label="المشروع"><option value="">كل المشاريع</option>'+D.projects.map(function(p){ return '<option value="'+esc(p.id)+'"'+(PROF.proj===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select>':'')+'</div>'+
      (list.length?'<div class="cp-tasks">'+list.map(function(t){ var late=t.confirmed_date&&t.confirmed_date<td&&OPENS.indexOf(t.status)>=0&&['feedback','final'].indexOf(t.status)<0;
        return '<article class="cp-task s-'+esc(t.status)+' tf-'+(TFAM[t.status]||'new')+'" data-tref="'+esc(t.ref)+'"><div class="ph"><div><span class="code">'+esc(t.ref)+'</span> <b>'+esc(t.title)+'</b> <span class="small muted">'+esc(t.project_name)+(t.created_by==='studio'?' · أضافها الاستوديو':'')+'</span></div>'+wpill(t.status)+'</div>'+
          (t.description?'<p class="small cp-desc">'+esc(t.description)+'</p>':'')+
          '<div class="row cp-trow"><div class="field"><label>الحالة</label><select data-tstat>'+Object.keys(WST).map(function(k){ return '<option value="'+k+'"'+(t.status===k?' selected':'')+'>'+esc(WST[k])+'</option>'; }).join('')+'</select></div>'+
            '<div class="field"><label>الأولوية</label><select data-tprio>'+Object.keys(WPR).map(function(k){ return '<option value="'+k+'"'+(t.priority===k?' selected':'')+'>'+WPR[k]+'</option>'; }).join('')+'</select></div>'+
            '<div class="field"><label>تاريخ الاستحقاق'+(late?' <b class="late">متأخرة</b>':'')+'</label><input type="date" data-tdate value="'+esc(t.confirmed_date||'')+'"></div>'+
            '<div class="field"><label>المسؤول</label><input data-tasg dir="auto" value="'+esc(t.assignee||'')+'" placeholder="—"></div></div>'+
          '<div class="actions"><button class="btn sm" type="button" data-tsave>حفظ</button><button class="btn sm" type="button" data-topen="'+esc(t.ref)+'">التفاصيل والتسليمات</button><button class="btn sm danger" type="button" data-tdel>حذف</button>'+
            (t.requested_date?'<span class="small muted">طلب العميل: '+esc(wd(t.requested_date))+'</span>':'')+'</div></article>'; }).join('')+'</div>'
        :'<div class="empty small">'+(D.tasks.length?'لا توجد مهام في هذا الاختيار.':'لا توجد مهام بعد.')+'</div>')+'</section>';
  }
  // money the client sent ahead of the work: added here, taken off the next invoice built for them
  function credCard(D){ var L=D.credits||[], cur=(L[0]&&L[0].currency)||'$', pm=(typeof payList==='function'?payList():[]);
    return '<section class="sec cp-cred"><div class="ph"><h3>الرصيد المقدّم (السُّلف)</h3><b class="num" dir="ltr">'+esc(pfmt(D.credit||0,cur))+'</b></div>'+
      '<p class="hint">دفعات وصلت قبل انتهاء الشغل. تُخصم تلقائياً من أول فاتورة تُبنى لهذا العميل من الشغل غير المفوتر.</p>'+
      (L.length?'<div class="cp-crl">'+L.map(function(c){ var use=c.invoice_id; return '<div class="cp-cr'+(use?' used':'')+'"><span dir="ltr" class="num">'+(c.amount>0?'+':'')+esc(pfmt(c.amount,c.currency))+'</span><span>'+esc(use?'خُصمت في الفاتورة '+(c.note||''):(c.method||'دفعة مقدّمة')+(c.note?' · '+c.note:''))+'</span><small class="muted">'+esc(wd(c.date))+'</small>'+
        (use?'':'<button class="btn sm danger" type="button" data-crdel="'+esc(c.id)+'">حذف</button>')+'</div>'; }).join('')+'</div>':'')+
      '<form id="clCred" class="row" novalidate><div class="field"><label>المبلغ</label><input name="amount" type="number" min="0" step="any" dir="ltr" required></div><div class="field"><label>العملة</label><input name="currency" dir="ltr" value="'+esc(cur)+'"></div>'+
        '<div class="field"><label>الطريقة</label><select name="method">'+payOpts()+'</select></div><div class="field"><label>التاريخ</label><input name="date" type="date" value="'+esc(D.today)+'"></div>'+
        '<div class="field"><label>ملاحظة</label><input name="note" dir="auto" placeholder="مثلاً: سلفة عن حلقات ديسمبر"></div><div class="field"><label>&nbsp;</label><button class="btn sm primary" type="submit">+ تسجيل دفعة مقدّمة</button></div></form></section>'; }
  function pBilling(D){ var m=due2(D), ob=orderBills().filter(function(o){ return o.email===PROF.email; });
    return credCard(D)+'<section class="sec"><div class="ph"><h3>الفواتير ('+D.invoices.length+')</h3><button class="btn sm primary" type="button" data-pinv="'+esc(PROF.email)+'">+ فاتورة جديدة</button></div>'+
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
  var WPT={program:'برنامج',design:'تصاميم',once:'مشروع لمرة واحدة',monthly:'تعاون شهري',campaign:'حملة إعلانية',content:'إدارة محتوى',editing:'مونتاج فيديوهات',motion:'موشن غرافيك',commercial:'إنتاج تجاري',custom:'مشروع مخصص'};
  // ---- events (clients tab only) ----
  document.addEventListener('input',function(e){ if(TAB!=='clients') return; var el=e.target; if(el.classList.contains('cl-q')){ CQ=el.value; var pos=el.selectionStart; renderClients(); var n=$('.cl-q'); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(_){} } } });
  document.addEventListener('change',function(e){ if(TAB!=='clients') return; var el=e.target;
    if(el.classList.contains('cl-sort')){ CS=el.value; renderClients(); return; }
    if(el.hasAttribute('data-pfilter')){ PROF.proj=el.value||null; renderClients(); return; }
    if(el.dataset.pstat){ var p=PROF.d.projects.filter(function(x){ return x.id===el.dataset.pstat; })[0]; if(!p) return;
      creq({action:'project',id:p.id,client_email:PROF.email,name:p.name,description:p.description,type:p.type,status:el.value,services:p.services,start_date:p.start_date,end_date:p.end_date,quota:p.quota,drive_url:p.drive_url,auto_report:!!p.auto_report},null,'تحدّثت حالة المشروع').catch(function(){}); } });
  document.addEventListener('submit',function(e){ var f=e.target; if(TAB!=='clients'||!/^cl(Add|Edit|Proj|Task|File|Terms|Cred)$/.test(f.id)&&!f.classList.contains('cl-pay')) return; e.preventDefault(); var E=f.elements, b=f.querySelector('[type=submit]');
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
    if(f.id==='clCred'){ if(!(+E.amount.value>0)){ toast('اكتب المبلغ',true); return; }
      creq({action:'creditAdd',email:PROF.email,amount:E.amount.value,currency:E.currency.value.trim()||'$',method:E.method.value,date:E.date.value,note:E.note.value.trim()},b,'سُجّلت الدفعة المقدّمة').catch(function(){}); return; }
    if(f.id==='clTerms'){ creq({action:'clientTerms',email:PROF.email,terms:termsOf(f)},b,'حُفظت باقة العميل').catch(function(){}); return; }
    if(f.id==='clEdit'){ creq({action:'clientSave',email:PROF.email,name:E.name.value.trim(),company:E.company.value.trim(),phone:E.phone.value.trim(),status:E.status.value,notes:E.notes.value},b,'حُفظت بيانات العميل').catch(function(){}); return; }
    if(f.id==='clProj'){ if(!E.name.value.trim()){ toast('اكتب اسم المشروع',true); return; }
      creq({action:'project',client_email:PROF.email,name:E.name.value.trim(),type:E.type.value,start_date:E.start_date.value,end_date:E.end_date.value,quota:E.quota.value,description:E.description.value.trim()},b,'أُنشئ المشروع').catch(function(){}); return; }
    if(f.id==='clTask'){ if(!E.title.value.trim()){ toast('اكتب عنوان المهمة',true); return; }
      var dn=E.done.checked; if(dn&&!E.done_date.value){ toast('اختر تاريخ الإنجاز',true); return; }
      var cnt=Math.max(1,Math.min(30,+E.count.value||1)), nm=E.named&&E.named.checked?[].map.call(f.querySelectorAll('.cl-nl input'),function(i){ return i.value.trim(); }):[];
      creq({action:'studioTask',project:E.project.value,client_email:PROF.email,title:E.title.value.trim(),priority:E.priority.value,confirmed_date:E.confirmed_date.value,assignee:E.assignee.value.trim(),description:E.description.value.trim(),done:dn,done_date:dn?E.done_date.value:'',
        count:cnt,names:nm,unit:E.unit?E.unit.value:''},b,dn?(cnt>1?'سُجّلت '+cnt+' مهام مكتملة':'سُجّلت المهمة مكتملة'):(cnt>1?'أُنشئت '+cnt+' مهام ووصل إشعار واحد إلى العميل':'أُنشئت المهمة ووصل إشعار إلى العميل')).catch(function(){}); return; }
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
    if(b.dataset.topen){ TAB='tasks'; WOPEN=b.dataset.topen; route(); render(); loadWork(); scrollTo(0,0); return; }
    if(b.hasAttribute('data-pcarry')){ if(CARRY){ CARRY=null; renderClients(); return; }
      creq({action:'carryInfo',email:PROF.email},b,null).then(function(j){ CARRY={j:j}; renderClients(); }).catch(function(){}); return; }
    if(b.dataset.pcsave){ var fm=b.closest('.cp-carry'), u={}; fm.querySelectorAll('[data-cu]').forEach(function(i){ u[i.dataset.cu]=i.value; });
      creq({action:'carrySave',email:PROF.email,month:CARRY.j.month,units:u},b,'حُفظ الرصيد المرحّل').then(function(){ CARRY=null; }).catch(function(){}); return; }
    if(b.hasAttribute('data-cmb')){ TAB='billing'; BFORM={email:PROF.email}; BOPEN=null; route(); render(); if(!BILL) loadBilling(); scrollTo(0,0); return; }
    if(b.hasAttribute('data-crdel')){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='متأكد؟'; return; } creq({action:'creditDel',id:b.dataset.crdel},b,'حُذفت الدفعة المقدّمة').catch(function(){}); return; }
    if(b.dataset.pinv){ TAB='billing'; BFORM={email:b.dataset.pinv}; render(); if(!BILL) loadBilling(); scrollTo(0,0); return; }
    if(b.hasAttribute('data-iedit')){ TAB='billing'; render(); if(!BILL) loadBilling(); scrollTo(0,0); return; }
    if(b.hasAttribute('data-ipay')){ var fpay=b.closest('[data-iid]').querySelector('.cl-pay'); fpay.hidden=!fpay.hidden; if(!fpay.hidden) fpay.querySelector('input').focus(); return; }
    if(b.dataset.fdel){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد الحذف؟'; return; } creq({action:'removeFile',id:b.dataset.fdel},b,'حُذف الملف').catch(function(){}); return; }
    var tc=b.closest('[data-tref]');
    if(tc&&b.hasAttribute('data-tsave')){ var ref=tc.dataset.tref, t=D.tasks.filter(function(x){ return x.ref===ref; })[0]; if(!t) return;
      var st=tc.querySelector('[data-tstat]').value, pr=tc.querySelector('[data-tprio]').value, dt=tc.querySelector('[data-tdate]').value, as=tc.querySelector('[data-tasg]').value.trim(), jobs=[];
      b.disabled=true; var N=NEXT_NOTIFY;   // the send sheet's choice, for the date and status messages below
      var post=function(body){ if(N&&(body.action==='date'||body.action==='status')) body.notify=N; return fetch(API+'/work',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify(body)}).then(function(r){ return r.json().then(function(j){ if(!r.ok||!j.ok) throw new Error(j.error||'fail'); return j; }); }); };
      var chain=Promise.resolve();
      if(pr!==t.priority||as!==(t.assignee||'')) chain=chain.then(function(){ return post({action:'taskEdit',task:ref,priority:pr,assignee:as}); });
      if(dt&&dt!==t.confirmed_date) chain=chain.then(function(){ return post({action:'date',task:ref,confirmed_date:dt}); });
      if(st!==t.status) chain=chain.then(function(){ return post({action:'status',task:ref,status:st}); });
      chain.then(function(){ toast(sndSay(N,'حُفظت المهمة')); loadProfile(PROF.email); loadClients(); WORK=null; })
        .catch(function(er){ b.disabled=false; toast(er.message==='date first'?'حدّد تاريخ الاستحقاق قبل قبول المهمة':er.message==='date'?'اختر تاريخاً صحيحاً':'تعذّر الحفظ',true); loadProfile(PROF.email); }); return; }
    if(tc&&b.hasAttribute('data-tdel')){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد الحذف؟ لا يمكن التراجع'; return; } creq({action:'taskDelete',task:tc.dataset.tref},b,'حُذفت المهمة').catch(function(){}); return; }
    var oc=b.closest('[data-okey]');
    if(oc){ var key=oc.dataset.okey, o=ORDERS.filter(function(x){ return x.key===key; })[0]; if(!o) return;
      if(b.dataset.oset){ if(b.dataset.oset==='cancelled'&&b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد الرفض؟'; return; } oreq({key:key,status:b.dataset.oset},b,b.dataset.oset==='confirmed'?'قُبل الطلب ووصل للعميل إشعار':'رُفض الطلب').then(function(){ loadProfile(PROF.email); }).catch(function(){}); return; }
      if(b.hasAttribute('data-osave')){ var body={key:key}, s2=oc.querySelector('[data-ostat]').value, pj=oc.querySelector('[data-oproj]').value, nt=oc.querySelector('[data-onote]').value;
        if(s2!==o.status) body.status=s2; if(pj!==(o.projectId||'')) body.project=pj; if(nt!==(o.notes||'')) body.notes=nt;
        if(Object.keys(body).length<2){ toast('لا تغييرات'); return; } oreq(body,b,'حُفظ الطلب').then(function(){ loadProfile(PROF.email); }).catch(function(){}); return; }
      if(b.dataset.ogo){ OOPEN=key; OPICK=true; OFILTER='all'; TAB='orders'; render(); scrollTo(0,0); return; }
    }
  });
  function docOpen(src){ var w=window.open('about:blank','_blank'); fetch(src,{headers:headers({})}).then(function(r){ return r.text(); }).then(function(h){ if(w){ w.document.open(); w.document.write(h); w.document.close(); } }).catch(function(){ if(w) w.close(); toast('تعذّر فتح الفاتورة',true); }); }

  var LOGN={'account prepared by the studio':'أعدّ الاستوديو حسابه','temporary password issued':'أُصدرت له بيانات دخول جديدة','chose a new password':'اختر كلمة سر جديدة','requested workspace access':'طلب الوصول لمساحة العمل','accepted the invitation':'قبل الدعوة','invited to the workspace':'أُرسلت إليه دعوة','access request approved':'قُبل طلب الوصول','access request declined':'رُفض طلب الوصول','upgraded to Active Client':'ترقية إلى عميل متعاقد','workspace access removed':'أُلغيت مساحة العمل'};
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
    if(b.dataset.icopy||b.dataset.copylink){ var l=b.dataset.copylink||('https://eyeblinkstudio.com'+(b.dataset.ilang==='en'?'/en':'')+'/account?invite='+b.dataset.icopy);
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
  // the «⋯» menu on a profile closes when you click anywhere else
  document.addEventListener('click',function(e){ if(!e.target.isConnected) return;   // a click that redrew the page is not a click outside
    [].forEach.call(document.querySelectorAll('.cp-more[open]'),function(d){ if(!d.contains(e.target)) d.open=false; }); });

  // ---- the client's brand library: the studio can fill it in or correct it (the client sees the same library in the workspace) ----
  // carried units: what was left last month is offered, the studio decides what moves into this month
  var CARRY=null;
  // the client's package: one agreement for all their projects in it; what was used this month, the month's invoice and the carried units
  function clientPkg(D){ var A=D.agreement, use=A&&A.use||{used:{},by:{}}, PN={}; D.projects.forEach(function(p){ PN[p.id]=p.name; });
    var m=new Date().toISOString().slice(0,7), cy=(A&&A.carry&&A.carry[m])||{};
    return '<section class="sec cp-pkg"><div class="ph"><h3>باقة العميل</h3>'+(A?'<div class="cp-pa"><button class="btn sm primary" type="button" data-cmb>فاتورة من الشغل غير المفوتر</button>'+(A.mode==='package'?'<button class="btn sm" type="button" data-pcarry>الرصيد المرحّل</button>':'')+'</div>':'')+'</div>'+
      (A&&A.mode==='package'&&A.billed?'<p class="cp-billed"><b>'+esc(new Date(m+'-15T12:00:00Z').toLocaleDateString('ar-u-nu-latn',{month:'long'}))+':</b> فُوتر <span class="num" dir="ltr">'+esc(pfmt(A.billed.amount,A.cur||'$'))+'</span> من <span class="num" dir="ltr">'+esc(pfmt(A.price,A.cur||'$'))+'</span>'+(A.billed.count?' · '+(A.billed.count===1?'دفعة واحدة':A.billed.count===2?'دفعتان':A.billed.count+' دفعات'):'')+'</p>':'')+
      (A&&A.mode==='package'?'<div class="cp-use">'+A.units.map(function(u){ var n=use.used[u.id]||0, have=u.inc+(+cy[u.id]||0), by=use.by[u.id]||{};
        return '<div class="cp-u'+(n>=have?' full':'')+'"><b>'+esc(u.name)+'</b><span class="num">'+n+' / '+have+(cy[u.id]?' <small class="muted">(+'+cy[u.id]+' مرحّلة)</small>':'')+'</span><small class="muted">'+esc(Object.keys(by).map(function(k){ return (PN[k]||'مشروع')+' '+by[k]; }).join('، '))+'</small></div>'; }).join('')+'</div>':'')+
      carryForm()+'<form id="clTerms" novalidate>'+termsForm(A)+'<div class="actions"><button class="btn sm primary" type="submit">حفظ باقة العميل</button></div></form></section>'; }
  function carryForm(){ if(!CARRY) return ''; var j=CARRY.j, MN=function(m){ return new Date(m+'-15T12:00:00Z').toLocaleDateString('ar-u-nu-latn',{month:'long'}); };
    return '<div class="cp-carry"><b>الرصيد المرحّل إلى '+esc(MN(j.month))+'</b><p class="small muted">يُضاف إلى باقة هذا الشهر. بجانب كل وحدة ما بقي من '+esc(MN(j.prev))+'.</p>'+
      j.units.map(function(u){ var cur=j.current[u.id]; return '<label class="cp-cu"><span>'+esc(u.name)+' <small class="muted">بقي '+u.left+'</small></span><input type="number" min="0" data-cu="'+esc(u.id)+'" value="'+(cur!=null?cur:u.left)+'"></label>'; }).join('')+
      '<div class="actions"><button class="btn sm primary" type="button" data-pcsave="1">حفظ الرصيد المرحّل</button></div></div>'; }
  var BKIND={logo_bg:'الشعار على خلفية',logo_clear:'الشعار شفاف',vector:'ملفات فيكتور',font:'ملفات الخطوط',other:'أخرى'};
  var AVL={title:'صورة العميل',save:'احفظ الصورة',cancel:'إلغاء',zoom:'التكبير'};
  // the picture «take it from the brand library» uses: the transparent logo first, then the logo on its background (images only)
  function brandPic(D){ var a=((D.brand||{}).assets||[]).filter(function(x){ return /^image\/(png|jpeg|webp)$/.test(x.type||''); });
    return a.filter(function(x){ return x.kind==='logo_clear'; })[0]||a.filter(function(x){ return x.kind==='logo_bg'; })[0]||null; }
  function avSave(data,btn,msg){ return creq({action:'clientAvatar',email:PROF.email,data:data},btn,msg).catch(function(){}); }
  function avFrom(src,btn){ if(!window.EBCrop) return; EBCrop(src,AVL).then(function(u){ if(u) avSave(u,btn,'حُفظت الصورة'); },function(){ toast('تعذّر فتح الصورة',true); }); }
  document.addEventListener('click',function(e){ if(TAB!=='clients'||!PROF) return; var b;
    if((b=e.target.closest('[data-avset]'))){ var inp=document.querySelector('[data-avfile]'); if(inp) inp.click(); return; }
    if((b=e.target.closest('[data-avbrand]'))){ var a=brandPic(PROF.d||{}); if(a) avFrom(String(a.url).replace(/^https?:\/\/[^\/]+/,''),b); return; }
    if((b=e.target.closest('[data-avdel]'))){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد الحذف'; return; } avSave(null,b,'حُذفت الصورة'); } });
  // several at once: the count, then (optional) a name for each one; the names follow the title as you type it
  function clNames(f){ var n=Math.max(1,Math.min(30,+f.elements.count.value||1)), box=f.querySelector('.cl-names'), nl=f.querySelector('.cl-nl'), on=f.elements.named.checked, t=f.elements.title.value.trim();
    box.hidden=n<2; nl.hidden=!on||n<2; if(!on||n<2) return; var old=[].map.call(nl.querySelectorAll('input'),function(i){ return i.dataset.typed?i.value:null; });
    nl.innerHTML=''; for(var i=0;i<n;i++){ var r=document.createElement('div'); r.className='cl-n'; r.innerHTML='<span class="num">'+(i+1)+'</span><input dir="auto" maxlength="140" aria-label="اسم رقم '+(i+1)+'">'; var inp=r.querySelector('input');
      if(old[i]!=null){ inp.value=old[i]; inp.dataset.typed='1'; } else inp.value=t?t+' '+(i+1):''; inp.oninput=function(){ this.dataset.typed='1'; }; nl.appendChild(r); } }
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-cstep]'); if(!b) return; var f=b.closest('form'), i=f.elements.count; i.value=Math.max(1,Math.min(30,(+i.value||1)+(+b.dataset.cstep))); clNames(f); });
  document.addEventListener('input',function(e){ var i=e.target; if(TAB!=='clients'||!i.form||i.form.id!=='clTask') return; if(i.name==='count'||i.name==='title') clNames(i.form); });
  document.addEventListener('change',function(e){ if(e.target.hasAttribute&&e.target.hasAttribute('data-cnamed')) clNames(e.target.form); });
  // «done before»: the completion date shows, and the note under the form says what will (and will not) happen
  document.addEventListener('change',function(e){ var c=e.target; if(TAB!=='clients'||!c.hasAttribute('data-tdone')) return; var f=c.form;
    f.querySelector('[data-tdd]').hidden=!c.checked; f.querySelectorAll('[data-th]').forEach(function(p){ p.hidden=(p.dataset.th==='1')!==c.checked; }); });
  document.addEventListener('change',function(e){ var inp=e.target; if(TAB!=='clients'||!inp.hasAttribute('data-avfile')||!inp.files.length) return; var f=inp.files[0]; inp.value=''; avFrom(f,null); });
  function fsize(n){ return n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB'; }
  function pBrand(D){ var B=D.brand||{colors:[],fonts:[],style:'',music:'',assets:[]}, rel=function(u){ return String(u||'').replace(/^https?:\/\/[^\/]+/,''); };
    return '<section class="sec cp-brand"><div class="ph"><h3>مكتبة الهوية</h3>'+(B.updated_at?'<span class="small muted">آخر تعديل '+esc(ago2(B.updated_at))+'</span>':'')+'</div>'+
      '<p class="hint">ما تكتبه هنا يظهر للعميل في صفحة «مكتبة الهوية»، ويدخل تلقائياً في موجز كل مهمة جديدة.</p>'+
      '<form id="clBrand" novalidate><div class="field"><label>الألوان (سطر لكل لون: الرمز ثم الاسم)</label><textarea name="colors" dir="ltr" rows="4" placeholder="#3FE0E8 سماوي">'+esc(B.colors.map(function(c){ return c.hex+(c.name?' '+c.name:''); }).join('\n'))+'</textarea>'+
        '<div class="cp-sw">'+B.colors.map(function(c){ return '<span title="'+esc(c.hex)+'" style="background:'+esc(c.hex)+'"></span>'; }).join('')+'</div></div>'+
        '<div class="field"><label>الخطوط (سطر لكل خط: الاسم - الاستخدام)</label><textarea name="fonts" dir="auto" rows="3" placeholder="Tajawal - العناوين">'+esc(B.fonts.map(function(f){ return f.name+(f.use?' - '+f.use:''); }).join('\n'))+'</textarea></div>'+
        '<div class="row"><div class="field"><label>الأسلوب البصري</label><textarea name="style" dir="auto" rows="3">'+esc(B.style)+'</textarea></div><div class="field"><label>الموسيقى</label><textarea name="music" dir="auto" rows="3">'+esc(B.music)+'</textarea></div></div>'+
        '<div class="actions"><button class="btn primary sm" type="submit">حفظ مكتبة الهوية</button></div></form>'+
      '<h4>الملفات</h4><div class="cp-bup"><select data-bkind aria-label="نوع الملف">'+Object.keys(BKIND).map(function(k){ return '<option value="'+k+'">'+BKIND[k]+'</option>'; }).join('')+'</select>'+
        '<button class="btn sm" type="button" data-bpick>+ رفع ملفات</button><input type="file" multiple hidden data-bfile><span class="small muted" data-bprog></span></div>'+
      (B.assets.length?'<div class="cp-bfiles">'+B.assets.map(function(a){ var img=/^image\/(png|jpeg|webp|gif)$/.test(a.type||'');
          return '<div class="wfi bfi'+(a.kind==='logo_clear'?' clear':'')+'">'+(img?'<span class="bth"><img src="'+esc(rel(a.url))+'" alt="" loading="lazy" onload="var m=this.closest(\'.bfi\').querySelector(\'[data-dim]\');if(m)m.textContent=this.naturalWidth+\'×\'+this.naturalHeight"></span>':'')+
            '<span class="tag">'+esc(BKIND[a.kind]||a.kind)+'</span> <a href="'+esc(rel(a.url))+'?dl=1">'+esc(a.title)+'</a> <span class="small muted bmeta" dir="ltr">'+esc((a.title.split('.').pop()||'').toUpperCase().slice(0,5))+(img?' · <span data-dim></span>':'')+(a.size?' · '+fsize(a.size):'')+'</span> <button class="btn sm danger" type="button" data-bdel="'+esc(a.id)+'">حذف</button></div>'; }).join('')+'</div>'+
          '<p><a class="btn sm" href="'+API+'/work?admin=1&brandZip='+encodeURIComponent(PROF.email)+'">تحميل المكتبة كاملة (ZIP)</a></p>'
        :'<div class="empty small">لا توجد ملفات بعد.</div>')+'</section>'; }
  document.addEventListener('submit',function(e){ var f=e.target; if(TAB!=='clients'||f.id!=='clBrand') return; e.preventDefault(); var E=f.elements, bad=[];
    var colors=E.colors.value.split('\n').map(function(l){ return l.trim(); }).filter(Boolean).map(function(l){ var m=/^(#?[0-9a-f]{6})\s*(.*)$/i.exec(l); if(!m){ bad.push(l); return null; } return {hex:(m[1][0]==='#'?'':'#')+m[1].toUpperCase(),name:m[2].trim()}; }).filter(Boolean);
    if(bad.length){ toast('رمز لون غير صحيح: '+bad[0],true); E.colors.focus(); return; }
    var fonts=E.fonts.value.split('\n').map(function(l){ return l.trim(); }).filter(Boolean).map(function(l){ var x=l.split(/\s+-\s+/); return {name:x[0].trim(),use:(x[1]||'').trim()}; });
    creq({action:'brandSave',email:PROF.email,colors:colors,fonts:fonts,style:E.style.value.trim(),music:E.music.value.trim()},f.querySelector('[type=submit]'),'حُفظت مكتبة الهوية').catch(function(){}); });
  document.addEventListener('click',function(e){ if(TAB!=='clients') return; var b;
    if((b=e.target.closest('[data-bpick]'))){ b.parentNode.querySelector('[data-bfile]').click(); return; }
    if((b=e.target.closest('[data-bdel]'))){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='متأكد؟'; return; } creq({action:'brandAssetDel',id:b.dataset.bdel},b,'حُذف الملف').catch(function(){}); } });
  document.addEventListener('change',function(e){ var inp=e.target; if(TAB!=='clients'||!inp.hasAttribute('data-bfile')||!inp.files.length) return;
    var box=inp.parentNode, kind=box.querySelector('[data-bkind]').value, prog=box.querySelector('[data-bprog]'), q=[].slice.call(inp.files), n=q.length, ok=0, kindOf={};
    if(kind==='logo_clear'&&window.EBAlpha){ var files=q.slice(); inp.value='';
      Promise.all(files.map(EBAlpha)).then(function(r){ var opaque=files.filter(function(f,i){ return r[i]===false; });
        if(!opaque.length) return go();
        ask({tone:'warn',title:opaque.length>1?'هذه الصور لها خلفية':'هذه الصورة لها خلفية',text:opaque.map(function(f){ return f.name; }).join('، ')+': ليست شفافة. الأنسب وضعها في «الشعار على خلفية»، و«إلغاء» يُبقيها في «الشعار شفاف».',ok:'ضعها في «على خلفية»'})
          .then(function(y){ if(y) opaque.forEach(function(f){ kindOf[f.name]='logo_bg'; }); go(); }); });
      return; }
    go(); function go(){
    var step=function(){ var f=q.shift(); if(!f){ prog.textContent=ok+' / '+n; toast(ok===n?'رُفعت الملفات':'رُفع '+ok+' من '+n,ok!==n); loadProfile(PROF.email); return; }
      window.EBUp.upload(f,{scope:'brand',kind:kindOf[f.name]||kind,client_email:PROF.email},function(x){ prog.textContent=f.name+' · '+Math.round(x*100)+'%'; }).then(function(){ ok++; step(); },function(){ step(); }); };
    inp.value=''; step(); } });

  /* ---------------- clean-up (19 Nov): the delete window, for a client, several clients, a project or a team member ----------------
     Archive (or pause) where it exists, or delete for good: the real counts first, the e-mail (or the word «احذف») typed back. */
  function purgeWin(o){ return new Promise(function(res){ var ov=document.createElement('div'), mode=o.archive?'d':'d', last=document.activeElement; ov.className='cfm-ov';
    var cs=(o.counts||[]).filter(function(c){ return c[0]; });
    ov.innerHTML='<div class="cfm cf-bad pg" role="alertdialog" aria-modal="true" aria-labelledby="pgT"><span class="cfm-ic"><svg viewBox="0 0 24 24" aria-hidden="true">'+CFICO.bad+'</svg></span><h4 id="pgT">'+esc(o.title)+'</h4>'+(o.sub?'<p class="pg-sub" dir="auto">'+esc(o.sub)+'</p>':'')+
      (o.archive?'<div class="pg-opt" role="radiogroup"><label><input type="radio" name="pgm" value="a"><span><b>'+esc(o.archive[0])+'</b><small>'+esc(o.archive[1])+'</small></span></label><label class="del"><input type="radio" name="pgm" value="d" checked><span><b>حذف نهائي</b><small>'+esc(o.delHint)+'</small></span></label></div>':'<p class="pg-sub">'+esc(o.delHint)+'</p>')+
      '<div class="pg-what">'+(cs.length?cs.map(function(c){ return '<div'+(c[2]?' class="warn"':'')+'><b>'+c[0]+'</b>'+esc(c[1])+'</div>'; }).join(''):'<div class="none">لا توجد بيانات مرتبطة غير '+esc(o.only||'الحساب')+'</div>')+'</div>'+
      '<label class="pg-typ"><span>'+esc(o.typeLabel)+'</span><input dir="'+(o.typeWord==='احذف'?'rtl':'ltr')+'" autocomplete="off" spellcheck="false" data-pgt></label>'+
      (o.backup?'<p class="pg-note"><i></i>تُحفظ نسخة احتياطية تلقائياً قبل الحذف</p>':'')+
      '<div class="cfm-act"><button type="button" class="btn primary" data-pgok disabled>احذف نهائياً</button><button type="button" class="btn" data-cfno>إلغاء</button></div></div>';
    document.body.appendChild(ov); requestAnimationFrame(function(){ ov.classList.add('on'); });
    var ok=ov.querySelector('[data-pgok]'), inp=ov.querySelector('[data-pgt]'), typ=ov.querySelector('.pg-typ'), what=ov.querySelector('.pg-what');
    function sync(){ var del=mode==='d'; typ.hidden=!del; what.style.opacity=del?1:.4; ok.textContent=del?'احذف نهائياً':o.archive[2];
      ok.disabled=del&&inp.value.trim().toLowerCase()!==String(o.typeWord).toLowerCase(); ok.parentNode.parentNode.classList.toggle('cf-bad',del); ok.parentNode.parentNode.classList.toggle('cf-go',!del); }
    function done(v){ removeEventListener('keydown',key,true); ov.classList.remove('on'); setTimeout(function(){ ov.remove(); },220); if(last&&last.focus) last.focus(); res(v); }
    function key(e){ if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); done(false); } else if(e.key==='Enter'&&!ok.disabled){ e.preventDefault(); ok.click(); } }
    ov.addEventListener('change',function(e){ if(e.target.name==='pgm'){ mode=e.target.value; sync(); if(mode==='d') inp.focus(); } });
    inp.addEventListener('input',sync);
    ov.addEventListener('click',function(e){ if(e.target===ov||e.target.closest('[data-cfno]')) return done(false);
      if(e.target.closest('[data-pgok]')&&!ok.disabled){ ok.disabled=true; ok.textContent='جارٍ التنفيذ…'; o.run(mode).then(function(j){ if(j&&j.ok) done(mode); else { toast('تعذّر التنفيذ',true); sync(); } },function(){ toast('تعذّر التنفيذ',true); sync(); }); } });
    addEventListener('keydown',key,true); sync(); setTimeout(function(){ (o.archive?ov.querySelector('input[value="d"]'):inp).focus(); },60); }); }
  function wpost(body){ return fetch(API+'/work',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify(body)}).then(function(r){ return r.json(); }); }
  function afterPurge(){ CL=null; USERS=null; WORK=null; BILL=null; NOTI=null; CSEL={}; CSELM=false; if(typeof loadUsers==='function') loadUsers(); loadClients(); renderTabs(); }
  function clientPurge(emails){ var one=emails.length===1;
    wpost({action:'purgePreview',emails:emails}).then(function(j){ if(!j.ok) return toast('تعذّر التحميل',true);
      var T={projects:0,tasks:0,deliverables:0,invoices:0,paid:0,files:0,notifications:0,orders:0,tickets:0}; Object.keys(j.counts).forEach(function(e){ var c=j.counts[e]; Object.keys(T).forEach(function(k){ T[k]+=c[k]||0; }); });
      var c=one&&((CL&&CL.clients)||[]).filter(function(x){ return x.email===emails[0]; })[0];
      purgeWin({ title: one?'حذف «'+((c&&c.name)||emails[0])+'»':'حذف '+emails.length+' عملاء', sub: one?emails[0]:'',
        archive: one&&c&&c.status!=='archived'?['أرشفة','يختفي من القوائم، ويبقى كل شيء محفوظاً. يمكنك إعادته متى شئت','أرشف العميل']:null,
        delHint: one?'يُحذف هو وكل ما يخصّه من كل الأقسام، ولا يمكن التراجع':'يُحذفون مع كل ما يخصّهم من كل الأقسام، ولا يمكن التراجع',
        counts:[[T.projects,'مشاريع'],[T.tasks,'مهام'],[T.deliverables,'تسليمات'],[T.invoices,'فواتير'+(T.paid?' · '+T.paid+' مدفوعة':''),!!T.paid],[T.files,'ملفات'],[T.notifications,'إشعارات'],[T.orders,'طلبات من الموقع'],[T.tickets,'تذاكر دعم']],
        typeLabel: one?'اكتب بريد العميل للتأكيد':'اكتب «احذف» للتأكيد', typeWord: one?emails[0]:'احذف', backup:true,
        run:function(m){ return m==='a'?wpost({action:'clientArchive',email:emails[0],archive:true}):wpost({action:'clientPurge',emails:emails,confirm:true}); } })
      .then(function(m){ if(!m) return; toast(m==='a'?'أُرشف العميل':one?'حُذف العميل وكل ما يخصّه':'حُذف '+emails.length+' عملاء وكل ما يخصّهم'); if(m==='d'&&PROF) PROF=null; afterPurge(); route(); }); }); }
  document.addEventListener('click',function(e){ if(TAB!=='clients') return; var b=e.target.closest('button'); if(!b) return;
    if(b.dataset.cpurge){ e.stopImmediatePropagation(); clientPurge([b.dataset.cpurge]); return; }
    if(b.hasAttribute('data-cpurgesel')){ clientPurge(Object.keys(CSEL)); return; }
    if(b.hasAttribute('data-csel')){ CSELM=!CSELM; CSEL={}; renderClients(); return; }
    if(CSELM&&b.dataset.copen){ e.stopImmediatePropagation(); if(CSEL[b.dataset.copen]) delete CSEL[b.dataset.copen]; else CSEL[b.dataset.copen]=1; renderClients(); } },true);

  // the client's support tickets, from the support section's own list (loaded once when a profile opens)
  function supOf(email){ if(SUPA===null){ SUPA=[]; loadSupport(); setTimeout(function(){ if(PROF&&TAB==='clients') renderClients(); },900); } return (SUPA||[]).filter(function(s){ return String(s.email||'').toLowerCase()===email; }); }
  function pSupport(){ var L=supOf(PROF.email);
    return '<section class="sec"><h3>تذاكر الدعم</h3>'+(L.length?'<div class="cp-list">'+L.map(function(s){ var m=(s.messages||[])[0]||{}, last=(s.messages||[]).slice(-1)[0]||m;
      return '<button type="button" class="cl-row cp-sup" data-psup="'+esc(s.id)+'"><span class="cl-id"><b>'+esc(String(m.text||'').slice(0,90))+'</b><span class="small muted">'+esc(s.id)+' · '+esc(ago2(last.at||s.updatedAt))+'</span></span><span class="cl-st"><span class="rpill tf-'+(SFAM[s.status]||'new')+'">'+esc(SST[s.status]||s.status)+'</span></span></button>'; }).join('')+'</div>'
      :'<div class="empty">لا توجد تذاكر دعم لهذا العميل.</div>')+'</section>'; }
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-psup]'); if(!b||TAB!=='clients') return; SOPEN=b.dataset.psup; SPICK=true; TAB='support'; route(); render(); scrollTo(0,0); });
  // edit a project (also one the client opened): the same form as in Projects, opened on it
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-pedit]'); if(!b||TAB!=='clients') return; var id=b.dataset.pedit;
    TAB='tasks'; WSUB='projects'; WPEDIT=id; WOPEN=null; route(); render(); loadWork();
    setTimeout(function(){ var f=document.querySelector('.wpf[data-wpid="'+id+'"]'); if(f){ f.scrollIntoView({block:'center'}); var n=f.elements.name; if(n) n.focus(); } },900); });

  /* ---------------- periodic reports (19 Nov): the client's rhythm, what goes in, and the reports already made ---------------- */
  var RPC=null, RPT=0, RPF=[[7,'كل أسبوع'],[14,'كل أسبوعين'],[30,'كل شهر'],[45,'كل شهر ونصف'],[60,'كل شهرين'],[0,'يدوياً فقط']], RPD=[[6,'السبت'],[0,'الأحد'],[1,'الاثنين'],[2,'الثلاثاء'],[3,'الأربعاء'],[4,'الخميس']];
  var RPI=[['done','ما أنجزناه (المهام المكتملة والنسخ المسلّمة)'],['nums','الأرقام: المكتمل، والنسخ، والالتزام بالمواعيد'],['waiting','ما ينتظر رأي العميل'],['next','القادم في الفترة المقبلة'],['money','الفواتير والمدفوعات']];
  function rfd(d,wk){ return new Date(d+'T12:00:00Z').toLocaleDateString('ar-u-nu-latn',wk?{weekday:'long',day:'numeric',month:'long'}:{day:'numeric',month:'long'}); }
  var today2=function(){ var d=new Date(Date.now()+4*36e5); return d.toISOString().slice(0,10); }, rAdd=function(d,n){ var x=new Date(d+'T12:00:00Z'); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().slice(0,10); };   // Gulf time, as the server counts
  function pReports(){ if(!RPC||RPC.email!==PROF.email){ RPC={email:PROF.email}; wpost({action:'reportCfgGet',email:PROF.email}).then(function(j){ if(j.ok){ RPC=Object.assign({email:PROF.email},j); if(PSEC==='reports') renderClients(); } }); return '<section class="sec"><div class="skel"><i></i><i></i></div></section>'; }
    if(!RPC.cfg) return '<section class="sec"><div class="skel"><i></i><i></i></div></section>';
    var c=RPC.cfg, P=RPC.projects||[], all=c.projects==='all', on=function(id){ return all||(c.projects||[]).indexOf(id)>=0; }, n=RPC.next;
    return '<section class="sec rp"><h3>التقارير الدورية</h3><p class="hint">تقرير يقول للعميل ما أنجزناه منذ آخر تقرير، بالتكرار الذي يناسبه.</p>'+
      '<div><div class="rp-l">التكرار</div><div class="rp-seg" role="group" aria-label="التكرار">'+RPF.map(function(f){ return '<button type="button" data-rpe="'+f[0]+'" aria-pressed="'+(c.every===f[0])+'">'+f[1]+'</button>'; }).join('')+'</div></div>'+
      '<div class="rp-2"><div><div class="rp-l">يوم الإرسال</div><select data-rpd aria-label="يوم الإرسال">'+RPD.map(function(d){ return '<option value="'+d[0]+'"'+(c.dow===d[0]?' selected':'')+'>'+d[1]+'</option>'; }).join('')+'</select></div>'+
        '<div><div class="rp-l">قبل الإرسال</div><div class="rp-seg" role="group" aria-label="قبل الإرسال"><button type="button" data-rpm="ask" aria-pressed="'+(c.mode==='ask')+'">أراجعه أولاً</button><button type="button" data-rpm="auto" aria-pressed="'+(c.mode==='auto')+'">يُرسل تلقائياً</button></div></div></div>'+
      '<div><div class="rp-l">يشمل</div><div class="rp-chips" role="group" aria-label="المشاريع"><button type="button" data-rpp="*" aria-pressed="'+all+'">كل المشاريع</button>'+P.map(function(p){ return '<button type="button" data-rpp="'+esc(p.id)+'" aria-pressed="'+(!all&&on(p.id))+'">'+esc(p.name)+'</button>'; }).join('')+'</div></div>'+
      '<div><div class="rp-l">في التقرير</div><div class="rp-inc">'+RPI.map(function(i){ return '<label>'+i[1]+'<input class="nc-tog" type="checkbox" data-rpi="'+i[0]+'"'+(c.inc[i[0]]?' checked':'')+'></label>'; }).join('')+'</div></div>'+
      '<div class="rp-next"><i></i><span>'+(c.every&&n?'التقرير القادم: <b>'+esc(rfd(n.date,1))+'</b> · يغطي من '+esc(rfd(n.from))+' إلى '+esc(rfd(n.to)):c.every?'يبدأ العدّ من اليوم':'يدوياً فقط: أرسل تقريراً متى شئت، ويغطي ما بعد آخر تقرير')+'</span></div><div class="rp-range"><span>فترة التقرير: من</span><input type="date" data-rpf value="'+esc(c.last_to?rAdd(c.last_to,1):rAdd(today2(),-30))+'"><span>إلى</span><input type="date" data-rpt value="'+esc(today2())+'"><button class="btn sm primary" type="button" data-rpnow>أرسل تقريراً الآن…</button><small class="muted">غيّرها لتقرير يغطي فترة محددة بالضبط، ولو قبل آخر تقرير.</small></div></section>'+
      '<section class="sec"><h3>التقارير السابقة</h3>'+((RPC.reports||[]).length?'<div class="rp-list">'+RPC.reports.map(function(r){ return '<div class="rp-row"><div><b>من '+esc(rfd(r.from))+' إلى '+esc(rfd(r.to))+'</b><small>'+(r.nums&&r.nums.done!=null?r.nums.done+' مهام · '+(r.nums.versions||0)+' نسخ':'')+'</small></div><span class="rpill'+(r.sent_at?' on':'')+'">'+(r.sent_at?'أُرسل':'لم يُرسل')+'</span><button class="btn sm" type="button" data-rpv="'+esc(r.id)+'">عرض</button></div>'; }).join('')+'</div>':'<div class="empty">لم يُرسل أي تقرير بعد.</div>')+'</section>'; }
  function rpSave(){ clearTimeout(RPT); RPT=setTimeout(function(){ var c=RPC.cfg;
    wpost({action:'reportCfgSave',email:RPC.email,every:c.every,dow:c.dow,mode:c.mode,projects:c.projects,inc:c.inc}).then(function(j){ if(j.ok){ RPC=Object.assign({email:RPC.email},j); toast('حُفظ'); if(PSEC==='reports') renderClients(); } else toast('تعذّر الحفظ',true); }); },350); }
  document.addEventListener('click',function(e){ if(TAB!=='clients'||PSEC!=='reports'||!RPC||!RPC.cfg) return; var b=e.target.closest('button'); if(!b) return; var c=RPC.cfg;
    if(b.dataset.rpe!==undefined){ c.every=+b.dataset.rpe; renderClients(); rpSave(); return; }
    if(b.dataset.rpm){ c.mode=b.dataset.rpm; renderClients(); rpSave(); return; }
    if(b.dataset.rpp){ var k=b.dataset.rpp, ids=(RPC.projects||[]).map(function(p){ return p.id; });
      if(k==='*') c.projects='all'; else { var cur=c.projects==='all'?[]:(c.projects||[]).slice(), i=cur.indexOf(k); if(i>=0) cur.splice(i,1); else cur.push(k); c.projects=cur.length&&cur.length<ids.length?cur:'all'; }
      renderClients(); rpSave(); return; }
    if(b.dataset.rpv){ docOpen(API+'/work?admin=1&creportDoc='+encodeURIComponent(b.dataset.rpv)); return; }
    if(b.hasAttribute('data-rpnow')){ var rf=document.querySelector('[data-rpf]'), rt=document.querySelector('[data-rpt]'); if(rf&&rt&&rf.value&&rt.value&&rf.value>rt.value) return toast('بداية الفترة بعد نهايتها',true); b.disabled=true; var em=RPC.email; wpost({action:'reportBuild',email:em,from:rf&&rf.value||undefined,to:rt&&rt.value||undefined}).then(function(j){ b.disabled=false; if(!j.ok) return toast(j.error==='range'?'لا فترة جديدة منذ آخر تقرير':'تعذّر التجهيز',true);
      sendSheet({title:'تقرير دوري · '+((PROF.d&&PROF.d.client&&PROF.d.client.name)||em),rows:[],pv:{kind:'periodReport',creport:j.id},noteField:true}).then(function(n){ if(!n){ RPC=null; renderClients(); return; }
        wpost({action:'reportSend',id:j.id,notify:n}).then(function(r){ toast(r.ok?sndSay(n,'أُرسل التقرير'):'تعذّر الإرسال',!r.ok); RPC=null; renderClients(); }); }); }); return; } });
  document.addEventListener('change',function(e){ if(TAB!=='clients'||PSEC!=='reports'||!RPC||!RPC.cfg) return; var el=e.target;
    if(el.hasAttribute('data-rpd')){ RPC.cfg.dow=+el.value; rpSave(); }
    if(el.dataset.rpi){ RPC.cfg.inc[el.dataset.rpi]=el.checked?1:0; rpSave(); } });
