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
  var CL=null, CQ='', CF='all', CS='activity', CADD=false, PROF=null, PSEC='overview', PTF='open', PFC='all', PEDIT=false;
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
    if(b.dataset.topen){ TAB='tasks'; WOPEN=b.dataset.topen; route(); render(); loadWork(); scrollTo(0,0); return; }
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
      if(b.dataset.ogo){ OOPEN=key; OPICK=true; OFILTER='all'; TAB='orders'; render(); scrollTo(0,0); return; }
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
