/* Eyeblink — the client workspace (Active Clients only; the server checks every request).
   Lives inside the account page:  #w  dashboard · #w/p/ID  project · #w/t/REF  task · #w/new/ID  new task */
(function(){
  var root=document.documentElement, lang=root.lang==='en'?'en':'ar', AR=lang==='ar';
  var BASE=document.body.getAttribute('data-base')||'', API=BASE+'api/';
  var T={
    ar:{ws:'مساحة العمل',wsP:'مشاريعك ومهامك ومواعيدها بمكان واحد.',projects:'المشاريع',recent:'آخر المهام',activity:'آخر النشاطات',upcoming:'المواعيد القادمة',
      k:{active:'مشاريع نشطة',progress:'قيد التنفيذ',review:'بانتظار مراجعتك',fresh:'طلبات جديدة',done:'مكتملة',dates:'مواعيد قادمة'},
      empty:'الاستوديو ما فتحلك مشروع لسا. أول ما ينفتح مشروع بيوصلك إيميل، وبتقدر تبعت مهامك عليه من هون.',noTasks:'ما في مهام بعد.',noAct:'ما في نشاط بعد.',noDates:'ما في مواعيد مؤكدة قادمة.',
      newTask:'مهمة جديدة',open:'فتح',back:'رجوع',all:'الكل',task:'المهمة',project:'المشروع',status:'الحالة',req:'الموعد المطلوب',conf:'الموعد المؤكد',upd:'آخر تحديث',
      confNone:'بيحدّده الاستوديو بعد المراجعة',reqNone:'بدون موعد محدد',start:'البداية',end:'النهاية',services:'الخدمات المتفق عليها',openTasks:'مهام مفتوحة',doneTasks:'مكتملة',
      f:{h:'مهمة جديدة',title:'عنوان المهمة',type:'نوع المهمة',desc:'وصف المهمة',details:'تفاصيل المطلوب تنفيذه',date:'الموعد اللي بتتمنى تستلم فيه (Requested Delivery Date)',dateHint:'الاستوديو بيراجع الطلب وبيأكّد الموعد النهائي.',
        prio:'الأولوية',links:'الملفات والمراجع (روابط)',linkLabel:'وصف الرابط',linkUrl:'الرابط (Google Drive، فيديو، مرجع…)',addLink:'+ رابط تاني',notes:'تعليمات إضافية: ملاحظات، تفاصيل إبداعية، توجيهات، أمثلة',
        preview:'معاينة الطلب',edit:'تعديل',send:'أرسل المهمة',sending:'جارٍ الإرسال…',need:'اكتب عنوان المهمة.',bad:'تأكد من الموعد (اليوم أو بعده).',sent:'وصلت المهمة للاستوديو.'},
      p:{normal:'عادية',high:'عالية',urgent:'عاجلة'},
      types:{once:'مشروع لمرة واحدة',monthly:'تعاون شهري',campaign:'حملة إعلانية',content:'إدارة محتوى',editing:'مونتاج فيديوهات',motion:'موشن غرافيك',commercial:'إنتاج تجاري',custom:'مشروع مخصص'},
      pst:{active:'نشط',paused:'متوقف مؤقتاً',completed:'منتهي',archived:'مؤرشف'},
      st:{new:'طلب جديد',review:'قيد المراجعة',info:'بانتظار معلوماتك',accepted:'تم القبول',progress:'قيد التنفيذ',feedback:'بانتظار ملاحظاتك',revision:'تعديلات مطلوبة',final:'التسليم النهائي',completed:'مكتملة',rejected:'مرفوضة',cancelled:'ملغاة'},
      infoH:'الاستوديو محتاج منك معلومات',reply:'ردّك',replyBtn:'أرسل الرد',rejH:'سبب الرفض',noteH:'ملاحظة الاستوديو',
      change:'اطلب تغيير الموعد',changeH:'تغيير موعد التسليم',newDate:'الموعد الجديد اللي بتطلبه',why:'السبب',changeSend:'أرسل الطلب',changePend:'طلبت تغيير الموعد إلى ',changeWait:' — بانتظار قرار الاستوديو.',
      cancel:'إلغاء المهمة',cancelSure:'متأكد؟ اكبس مرة ثانية للإلغاء',desc:'الوصف',details:'التفاصيل',notes:'تعليمات إضافية',links:'الروابط',log:'سجل المهمة',by:{studio:'الاستوديو'},
      a:{task_created:'أرسل مهمة جديدة',status:'غيّر الحالة إلى',date_changed:'غيّر الموعد المؤكد إلى',info_provided:'أرسل المعلومات المطلوبة',date_change_requested:'طلب تغيير الموعد إلى',date_change_decided_ok:'وافق على الموعد الجديد',date_change_decided_no:'أبقى الموعد كما هو',project_created:'فتح المشروع',project_updated:'حدّث المشروع',delivered:'سلّم',approved:'وافق على',changes_requested:'طلب تعديلات على',comment:'علّق',commentP:'كتب بنقاش المشروع',file_added:'أضاف ملف',file_removed:'حذف ملف',points:'نقاط'},
      err:'صار خطأ، جرّب مرة ثانية.',saved:'تم.',
      dl:{h:'التسليمات',none:'لسا ما في تسليم. أول نسخة بتنزل هون، وبيوصلك إيميل فيها.',open:'افتح الملف',preview:'شغّل المعاينة',history:'النسخ السابقة',fin:'النهائية',
        st:{sent:'بانتظار ردّك',approved:'تمت الموافقة',changes:'طُلبت تعديلات',superseded:'نسخة أقدم'},approve:'موافق على هالنسخة',approveFinal:'موافق على التسليم النهائي',sure:'متأكد؟ اكبس مرة ثانية',
        changes:'بدي تعديلات',chH:'شو التعديلات المطلوبة؟',chHint:'كل تعديل بسطر لحاله. إذا التعديل على لحظة معيّنة بالفيديو، حط التوقيت (مثلاً 00:12).',point:'شو بدك يتعدّل؟',addPoint:'+ تعديل تاني',
        general:'ملاحظة عامة (اختياري)',send:'أرسل التعديلات',need:'اكتب تعديل واحد على الأقل.',badTc:'اكتب التوقيت بهالشكل: 00:12 أو 1:02:30',round:'جولة التعديل',yours:'ملاحظاتك',studio:'من الاستوديو',
        okMsg:'وصلت موافقتك للاستوديو.',chMsg:'وصلت التعديلات للاستوديو.',done:'تم',finalNote:'الموافقة على التسليم النهائي بتسكّر المهمة كمكتملة.',working:'الاستوديو عم يشتغل على النسخة الجاية.'},
      cm:{h:'التعليقات',talk:'نقاش المشروع',talkP:'لأي سؤال أو فكرة عن المشروع ككل. التعليقات الخاصة بمهمة معيّنة حطها بصفحة المهمة.',none:'ما في تعليقات بعد.',ph:'اكتب تعليقك…',send:'إرسال',del:'حذف',link:'رابط (اختياري)',you:'أنت'},
      fl:{cats:{all:'الكل',brand:'الهوية البصرية',raw:'مواد خام',reference:'مراجع',document:'مستندات',delivered:'التسليمات',other:'أخرى'},add:'+ أضف ملف',title:'اسم الملف',url:'الرابط (Google Drive، Dropbox، WeTransfer…)',
        note:'ملاحظة (اختياري)',cat:'التصنيف',save:'أضف الملف',none:'ما في ملفات هون بعد.',hint:'الملفات بتنحفظ كروابط: ارفعها على Google Drive (أو غيره) وحط رابط المشاركة.',badUrl:'الرابط لازم يبلّش بـ https://',del:'حذف',studio:'الاستوديو'},
      tabs:{tasks:'المهام',talk:'النقاشات',files:'الملفات'},waiting:'بانتظار ردّك',waitingP:'هالمهام محتاجة منك موافقة أو ملاحظات أو معلومات.'},
    en:{ws:'Workspace',wsP:'Your projects, tasks and their dates in one place.',projects:'Projects',recent:'Recent tasks',activity:'Latest activity',upcoming:'Upcoming dates',
      k:{active:'Active projects',progress:'In progress',review:'Awaiting your review',fresh:'New requests',done:'Completed',dates:'Upcoming dates'},
      empty:'The studio has not opened a project for you yet. You will get an e-mail when it does, and you can send tasks to it from here.',noTasks:'No tasks yet.',noAct:'No activity yet.',noDates:'No confirmed dates coming up.',
      newTask:'New task',open:'Open',back:'Back',all:'All',task:'Task',project:'Project',status:'Status',req:'Requested date',conf:'Confirmed date',upd:'Last update',
      confNone:'Set by the studio after review',reqNone:'No specific date',start:'Start',end:'End',services:'Agreed services',openTasks:'Open tasks',doneTasks:'Completed',
      f:{h:'New task',title:'Task title',type:'Task type',desc:'Task description',details:'What needs to be done',date:'When you would like to receive it (Requested Delivery Date)',dateHint:'The studio reviews the request and confirms the final date.',
        prio:'Priority',links:'Files and references (links)',linkLabel:'Link label',linkUrl:'Link (Google Drive, video, reference…)',addLink:'+ Another link',notes:'Extra instructions: notes, creative direction, guidance, examples',
        preview:'Preview request',edit:'Edit',send:'Send task',sending:'Sending…',need:'Write a task title.',bad:'Check the date (today or later).',sent:'Your task reached the studio.'},
      p:{normal:'Normal',high:'High',urgent:'Urgent'},
      types:{once:'One-off project',monthly:'Monthly collaboration',campaign:'Ad campaign',content:'Content management',editing:'Video editing',motion:'Motion graphics',commercial:'Commercial production',custom:'Custom project'},
      pst:{active:'Active',paused:'Paused',completed:'Finished',archived:'Archived'},
      st:{new:'New request',review:'Under review',info:'Awaiting your information',accepted:'Accepted',progress:'In progress',feedback:'Awaiting your feedback',revision:'Revision requested',final:'Final delivery',completed:'Completed',rejected:'Rejected',cancelled:'Cancelled'},
      infoH:'The studio needs some information',reply:'Your reply',replyBtn:'Send reply',rejH:'Reason',noteH:'Note from the studio',
      change:'Ask to change the date',changeH:'Change the delivery date',newDate:'The date you are asking for',why:'Reason',changeSend:'Send request',changePend:'You asked to move the date to ',changeWait:' — waiting for the studio.',
      cancel:'Cancel task',cancelSure:'Sure? Click again to cancel',desc:'Description',details:'Details',notes:'Extra instructions',links:'Links',log:'Task history',by:{studio:'Studio'},
      a:{task_created:'sent a new task',status:'changed the status to',date_changed:'changed the confirmed date to',info_provided:'sent the requested information',date_change_requested:'asked to move the date to',date_change_decided_ok:'approved the new date',date_change_decided_no:'kept the date',project_created:'opened the project',project_updated:'updated the project',delivered:'delivered',approved:'approved',changes_requested:'asked for changes on',comment:'commented',commentP:'wrote in the project discussion',file_added:'added a file',file_removed:'removed a file',points:'points'},
      err:'Something went wrong. Try again.',saved:'Done.',
      dl:{h:'Deliveries',none:'Nothing delivered yet. The first version will appear here and you will get an e-mail.',open:'Open file',preview:'Play preview',history:'Earlier versions',fin:'Final',
        st:{sent:'Awaiting your reply',approved:'Approved',changes:'Changes requested',superseded:'Older version'},approve:'Approve this version',approveFinal:'Approve the final delivery',sure:'Sure? Click again',
        changes:'Request changes',chH:'What should change?',chHint:'One change per line. If it is about a moment in the video, add the timecode (e.g. 00:12).',point:'What should change?',addPoint:'+ Another change',
        general:'General note (optional)',send:'Send changes',need:'Write at least one change.',badTc:'Write the timecode like 00:12 or 1:02:30',round:'Revision round',yours:'Your notes',studio:'From the studio',
        okMsg:'Your approval reached the studio.',chMsg:'Your changes reached the studio.',done:'Done',finalNote:'Approving the final delivery closes the task as completed.',working:'The studio is working on the next version.'},
      cm:{h:'Comments',talk:'Project discussion',talkP:'For questions and ideas about the project as a whole. Comments about one task go on that task.',none:'No comments yet.',ph:'Write a comment…',send:'Send',del:'Delete',link:'Link (optional)',you:'You'},
      fl:{cats:{all:'All',brand:'Brand identity',raw:'Raw footage',reference:'References',document:'Documents',delivered:'Deliveries',other:'Other'},add:'+ Add a file',title:'File name',url:'Link (Google Drive, Dropbox, WeTransfer…)',
        note:'Note (optional)',cat:'Category',save:'Add file',none:'No files here yet.',hint:'Files are kept as links: upload to Google Drive (or similar) and paste the share link.',badUrl:'The link must start with https://',del:'Delete',studio:'Studio'},
      tabs:{tasks:'Tasks',talk:'Discussion',files:'Files'},waiting:'Waiting for you',waitingP:'These tasks need your approval, notes or information.'}
  }[lang];
  var OPEN=['new','review','info','accepted','progress','feedback','revision','final'];
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]}); }
  function L(v){ return v==null?'':(typeof v==='object'&&!Array.isArray(v))?(v[lang]||v.ar||v.en||''):v; }
  function C(){ return window.EBC||{}; }
  function api(q,body){ var o={credentials:'same-origin',cache:'no-store',headers:{}}; if(body){ o.method='POST'; o.headers['content-type']='application/json'; o.body=JSON.stringify(body); }
    return fetch(API+'work'+(q||''),o).then(function(r){ return r.json().catch(function(){return {ok:false};}).then(function(j){ j._s=r.status; return j; }); }).catch(function(){ return {ok:false,_net:true}; }); }
  function d8(s){ if(!s) return ''; try{ return new Date(s.length===10?s+'T12:00:00Z':s).toLocaleDateString(AR?'ar-u-nu-latn':'en-GB',{day:'numeric',month:'short',year:'numeric'}); }catch(_){ return s; } }
  function ago(s){ try{ return new Date(s).toLocaleString(AR?'ar-u-nu-latn':'en-GB',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}); }catch(_){ return s; } }
  function pill(st){ return '<span class="tpill s-'+esc(st)+'">'+esc(T.st[st]||st)+'</span>'; }
  function prio(p){ var lab=L(((C().workspace||{}).priorities||{})[p])||T.p[p]||p; return p&&p!=='normal'?'<span class="tprio p-'+esc(p)+'">'+esc(lab)+'</span>':''; }
  function linksHTML(ls){ return (ls||[]).map(function(l){ return '<a class="wlink" href="'+esc(l.url)+'" target="_blank" rel="noopener noreferrer"><span>'+esc(l.label||l.url.replace(/^https?:\/\//,'').slice(0,48))+'</span></a>'; }).join(''); }
  function para(t){ return esc(t).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g,'<br>'); }
  function actText(a){ var d=a.data||{}, who=a.actor==='studio'?T.by.studio:(a.actor_name||a.actor), k=a.kind, w='';
    if(k==='status') w=T.a.status+' «'+(T.st[d.to]||d.to)+'»'+(d.confirmed_date?' · '+T.conf+': '+d8(d.confirmed_date):'');
    else if(k==='date_changed') w=T.a.date_changed+' '+d8(d.to);
    else if(k==='date_change_requested') w=T.a.date_change_requested+' '+d8(d.date);
    else if(k==='date_change_decided') w=d.approved?T.a.date_change_decided_ok+' ('+d8(d.to)+')':T.a.date_change_decided_no;
    else if(k==='task_created') w=T.a.task_created+(d.title?' «'+d.title+'»':'');
    else if(k==='project_created'||k==='project_updated') w=T.a[k]+(d.name?' «'+d.name+'»':'');
    else if(k==='delivered'||k==='approved') w=T.a[k]+' '+(d.final?T.dl.fin:d.label);
    else if(k==='changes_requested') w=T.a[k]+' '+d.label+(d.points?' ('+d.points+' '+T.a.points+')':'');
    else if(k==='comment') w=(d.scope==='project'?T.a.commentP:T.a.comment)+(d.text?': '+d.text:'');
    else if(k==='file_added'||k==='file_removed') w=T.a[k]+(d.title?' «'+d.title+'»':'');
    else w=T.a[k]||k;
    return '<li><i class="'+(a.actor==='studio'?'s':'c')+'"></i><div><b>'+esc(who)+'</b> '+esc(w)+(a.task_ref?' · <a href="#w/t/'+esc(a.task_ref)+'"><bdi dir="ltr">'+esc(a.task_ref)+'</bdi></a>':'')+
      (d.note?'<p class="muted small">'+para(d.note)+'</p>':'')+(k==='info_provided'&&d.text?'<p class="muted small">'+para(d.text)+'</p>':'')+'<small>'+esc(ago(a.at))+'</small></div></li>'; }
  function toast(t){ var d=document.createElement('div'); d.className='toast'; d.textContent=t; document.body.appendChild(d); setTimeout(function(){ d.remove(); },2600); }

  var host=null, DASH=null;
  function mount(el){ host=el; route(); }
  function route(){ if(!host||host.hidden) return; var h=(location.hash||'').slice(1), m;
    if((m=/^w\/t\/(T-[A-Z0-9]+)$/.exec(h))) return task(m[1]);
    if((m=/^w\/p\/(p_[a-f0-9]+)(?:\/(talk|files))?$/.exec(h))) return project(m[1],m[2]||'tasks');
    if((m=/^w\/new\/(p_[a-f0-9]+)$/.exec(h))) return newTask(m[1]);
    return dash(); }
  addEventListener('hashchange',function(){ if(/^#w/.test(location.hash)) route(); });
  function loading(){ host.innerHTML='<div class="acct-load glass"><span></span></div>'; }
  function fail(j){ host.innerHTML='<div class="wcard glass"><p class="muted">'+(j&&j.error==='db'?(AR?'مساحة العمل قيد التجهيز. جرّب بعد قليل.':'The workspace is being set up. Try again shortly.'):T.err)+'</p></div>'; }

  /* ---- dashboard ---- */
  function dash(){
    loading();
    api('?view=dash').then(function(j){ if(!j.ok) return fail(j); DASH=j;
      var c=j.counts||{}, n=function(a){ return a.reduce(function(s,k){ return s+(c[k]||0); },0); };
      var act=j.projects.filter(function(p){return p.status==='active'});
      var tiles=[[T.k.active,act.length],[T.k.fresh,n(['new','review','info'])],[T.k.progress,n(['accepted','progress','revision'])],[T.k.review,n(['feedback','final'])],[T.k.done,c.completed||0],[T.k.dates,(j.upcoming||[]).length]];
      host.innerHTML='<div class="wsp-head"><div><span class="eyebrow">WORKSPACE</span><h2>'+T.ws+'</h2><p class="muted">'+T.wsP+'</p></div></div>'+
        '<div class="wkpis">'+tiles.map(function(t){ return '<div class="wkpi glass"><b>'+t[1]+'</b><span>'+esc(t[0])+'</span></div>'; }).join('')+'</div>'+
        ((j.waiting||[]).length?'<section class="wcard glass wwait"><h3>'+T.waiting+' ('+j.waiting.length+')</h3><p class="muted small">'+T.waitingP+'</p><ul>'+j.waiting.map(function(w){ return '<li><a href="#w/t/'+esc(w.ref)+'">'+pill(w.status)+'<b><bdi>'+esc(w.title)+'</bdi></b><small class="muted"><bdi>'+esc(w.project_name)+'</bdi> · <bdi dir="ltr">'+esc(w.ref)+'</bdi></small><span class="go">←</span></a></li>'; }).join('')+'</ul></section>':'')+
        (j.projects.length? '<section class="wsec"><h3>'+T.projects+'</h3><div class="wprojects">'+j.projects.map(projCard).join('')+'</div></section>' : '<div class="wcard glass wempty"><p>'+T.empty+'</p></div>')+
        (j.projects.length? '<div class="wcols"><section class="wsec"><h3>'+T.recent+'</h3>'+taskTable(j.tasks,true)+'</section>'+
          '<aside class="wside"><section class="wsec"><h3>'+T.upcoming+'</h3>'+((j.upcoming||[]).length?'<ul class="wdates">'+j.upcoming.map(function(u){ return '<li><a href="#w/t/'+esc(u.ref)+'"><b>'+esc(d8(u.confirmed_date))+'</b><span>'+esc(u.title)+'</span><small class="muted">'+esc(u.project_name)+'</small></a></li>'; }).join('')+'</ul>':'<p class="muted small">'+T.noDates+'</p>')+'</section>'+
          '<section class="wsec"><h3>'+T.activity+'</h3>'+((j.activity||[]).length?'<ul class="wact">'+j.activity.map(actText).join('')+'</ul>':'<p class="muted small">'+T.noAct+'</p>')+'</section></aside></div>' : '');
    });
  }
  function projCard(p){ var open=p.status==='active';
    return '<article class="wproj glass"><a class="wproj-main" href="#w/p/'+esc(p.id)+'"><span class="k">'+esc(T.types[p.type]||p.type)+'</span><h4>'+esc(p.name)+'</h4>'+
      '<p class="muted small">'+(p.open_tasks||0)+' '+T.openTasks+' · '+(p.done_tasks||0)+' '+T.doneTasks+(p.status!=='active'?' · '+esc(T.pst[p.status]||p.status):'')+'</p></a>'+
      (open?'<a class="btn btn-primary wnew" href="#w/new/'+esc(p.id)+'">+ '+T.newTask+'</a>':'')+'</article>'; }
  function taskTable(list,withProject){
    if(!list||!list.length) return '<p class="muted small">'+T.noTasks+'</p>';
    return '<div class="wtable"><table><thead><tr><th>'+T.task+'</th>'+(withProject?'<th>'+T.project+'</th>':'')+'<th>'+T.status+'</th><th>'+T.req+'</th><th>'+T.conf+'</th><th>'+T.upd+'</th></tr></thead><tbody>'+
      list.map(function(t){ return '<tr data-go="#w/t/'+esc(t.ref)+'"><td><a href="#w/t/'+esc(t.ref)+'"><b>'+esc(t.title)+'</b></a><small class="muted ref">'+esc(t.ref)+'</small>'+prio(t.priority)+'</td>'+(withProject?'<td class="tp" data-l="'+esc(T.project)+'">'+esc(t.project_name||'')+'</td>':'')+
        '<td class="ts">'+pill(t.status)+'</td><td data-l="'+esc(T.req)+'">'+esc(t.requested_date?d8(t.requested_date):'—')+'</td><td data-l="'+esc(T.conf)+'" class="'+(t.confirmed_date?'cf':'muted')+'">'+esc(t.confirmed_date?d8(t.confirmed_date):'—')+'</td><td class="muted small tu">'+esc(ago(t.updated_at))+'</td></tr>'; }).join('')+'</tbody></table></div>'; }
  document.addEventListener('click',function(e){ var tr=e.target.closest('tr[data-go]'); if(tr&&!e.target.closest('a')) location.hash=tr.dataset.go; });

  /* ---- project: tasks · discussion · files ---- */
  var PC=null;
  function project(id,tab,force){
    if(!force&&PC&&PC.id===id&&Date.now()-PC.at<30000) return drawProject(PC.j,tab);
    loading();
    api('?project='+encodeURIComponent(id)).then(function(j){ if(!j.ok) return fail(j); PC={id:id,j:j,at:Date.now()}; drawProject(j,tab); });
  }
  function drawProject(j,tab){ var p=j.project, F='all';
    var nf=(j.files||[]).length+(j.delivered||[]).length, nc=(j.comments||[]).length;
    host.innerHTML='<a class="wback" href="#w">← '+T.back+'</a>'+
      '<div class="wcard glass wphead"><div><span class="k">'+esc(T.types[p.type]||p.type)+' · '+esc(T.pst[p.status]||p.status)+'</span><h2>'+esc(p.name)+'</h2>'+(p.description?'<p class="muted">'+para(p.description)+'</p>':'')+
        '<dl class="wmeta">'+(p.start_date?'<div><dt>'+T.start+'</dt><dd>'+esc(d8(p.start_date))+'</dd></div>':'')+(p.end_date?'<div><dt>'+T.end+'</dt><dd>'+esc(d8(p.end_date))+'</dd></div>':'')+
        ((p.services||[]).length?'<div><dt>'+T.services+'</dt><dd>'+p.services.map(function(s){ var sv=(C().services||[]).filter(function(x){return x.id===s})[0]; return '<span class="tag">'+esc(sv?L(sv.name):s)+'</span>'; }).join(' ')+'</dd></div>':'')+'</dl></div>'+
        (p.status==='active'?'<a class="btn btn-primary" href="#w/new/'+esc(p.id)+'">+ '+T.newTask+'</a>':'')+'</div>'+
      '<div class="acct-tabs wptabs" role="tablist">'+[['tasks',T.tabs.tasks,j.tasks.length],['talk',T.tabs.talk,nc],['files',T.tabs.files,nf]].map(function(x){
        return '<a role="tab" href="#w/p/'+esc(p.id)+(x[0]==='tasks'?'':'/'+x[0])+'" aria-selected="'+(tab===x[0])+'">'+x[1]+(x[2]?' <small>'+x[2]+'</small>':'')+'</a>'; }).join('')+'</div><div class="wpbody"></div>';
    var body=host.querySelector('.wpbody');
    if(tab==='talk'){ body.innerHTML='<p class="muted small wtalkp">'+T.cm.talkP+'</p>'+thread(j.comments,j.me); bindThread(body,{scope:'project',project:p.id},function(){ project(p.id,'talk',true); }); return; }
    if(tab==='files'){ filesView(body,j); return; }
    var draw=function(){ var list=j.tasks.filter(function(t){ return F==='all'||(F==='open'?OPEN.indexOf(t.status)>=0:t.status===F); });
      body.querySelector('.wtasks').innerHTML=taskTable(list,false); };
    body.innerHTML='<div class="wcols"><section class="wsec"><div class="wfilt">'+[['all',T.all],['open',AR?'المفتوحة':'Open'],['completed',T.st.completed]].map(function(x,i){ return '<button type="button" class="chipb'+(i===0?' on':'')+'" data-f="'+x[0]+'">'+x[1]+'</button>'; }).join('')+'</div><div class="wtasks"></div></section>'+
      '<aside class="wside"><section class="wsec"><h3>'+T.activity+'</h3>'+(j.activity.length?'<ul class="wact">'+j.activity.map(function(a){ var t=j.tasks.filter(function(x){return x.id===a.task_id})[0]; a.task_ref=t&&t.ref; return actText(a); }).join('')+'</ul>':'<p class="muted small">'+T.noAct+'</p>')+'</section></aside></div>';
    body.querySelector('.wfilt').onclick=function(e){ var b=e.target.closest('button'); if(!b) return; F=b.dataset.f; [].forEach.call(this.children,function(x){ x.classList.toggle('on',x===b); }); draw(); };
    draw();
  }

  /* ---- comments (task comments + project discussion share one thread) ---- */
  function thread(list,me){
    return '<section class="wsec wthread"><div class="wcmts">'+((list||[]).length?list.map(function(c){ return cmt(c,me); }).join(''):'<p class="muted small">'+T.cm.none+'</p>')+'</div>'+
      '<form class="wcompose form" novalidate><textarea name="body" dir="auto" maxlength="4000" placeholder="'+T.cm.ph+'" rows="3"></textarea>'+
      '<div class="wcrow"><input name="lu" type="url" dir="ltr" placeholder="'+T.cm.link+'"><button class="btn btn-primary" type="submit">'+T.cm.send+'</button></div></form></section>'; }
  function cmt(c,me){ var st=c.author==='studio', mine=me&&c.author===me;
    return '<div class="wcmt'+(st?' st':mine?' me':'')+'"><div class="wcmt-h"><b>'+esc(st?'Eyeblink Studio':mine?T.cm.you:c.author_name)+'</b><small>'+esc(ago(c.created_at))+'</small>'+
      (mine?'<button type="button" class="linkbtn" data-delc="'+esc(c.id)+'">'+T.cm.del+'</button>':'')+'</div><p>'+para(c.body)+'</p>'+((c.links||[]).length?'<div class="wlinkset">'+linksHTML(c.links)+'</div>':'')+'</div>'; }
  function bindThread(box,where,reload){
    var f=box.querySelector('.wcompose'); if(!f) return;
    f.onsubmit=function(e){ e.preventDefault(); var b=f.querySelector('button'), body=f.elements.body.value.trim(), u=f.elements.lu.value.trim();
      if(!body&&!/^https?:\/\//i.test(u)){ f.elements.body.focus(); return; } b.disabled=true;
      var data={action:'comment',scope:where.scope,body:body,links:/^https?:\/\//i.test(u)?[{url:u}]:[]}; data[where.scope]=where[where.scope];
      api('',data).then(function(r){ if(r.ok) reload(); else { b.disabled=false; toast(T.err); } }); };
    box.querySelectorAll('[data-delc]').forEach(function(x){ x.onclick=function(){ if(x.dataset.armed!=='1'){ x.dataset.armed='1'; x.textContent=T.dl.sure; return; }
      api('',{action:'deleteComment',id:x.dataset.delc}).then(function(r){ if(r.ok) reload(); else toast(T.err); }); }; });
  }

  /* ---- file center: links by category + everything the studio delivered ---- */
  var FCATS=['all','brand','raw','reference','document','delivered','other'];
  function hostOf(u){ var m=/^https?:\/\/([^\/?#]+)/i.exec(u||''), h=m?m[1].replace(/^www\./,''):'';
    return /drive\.google|docs\.google/.test(h)?'Google Drive':/dropbox/.test(h)?'Dropbox':/wetransfer|we\.tl/.test(h)?'WeTransfer':/youtu/.test(h)?'YouTube':/vimeo/.test(h)?'Vimeo':/figma/.test(h)?'Figma':/canva/.test(h)?'Canva':/frame\.io/.test(h)?'Frame.io':h; }
  function filesView(body,j){ var cat='all', p=j.project;
    var items=(j.files||[]).map(function(f){ return {id:f.id,cat:f.category,title:f.title,url:f.url,note:f.note,at:f.created_at,who:f.added_by==='studio'?T.fl.studio:f.added_by===j.me?T.cm.you:f.added_name,mine:f.added_by===j.me}; })
      .concat((j.delivered||[]).map(function(d){ return {id:d.id,cat:'delivered',title:(d.title||d.task_title)+' — '+(d.is_final?T.dl.fin:d.label),url:d.url,at:d.created_at,ref:d.ref,who:T.fl.studio}; }));
    var cnt=function(c){ return c==='all'?items.length:items.filter(function(x){return x.cat===c}).length; };
    body.innerHTML='<div class="wfhead"><div class="wfilt">'+FCATS.map(function(c){ var n=cnt(c); return (c==='all'||n)?'<button type="button" class="chipb'+(c===cat?' on':'')+'" data-c="'+c+'">'+T.fl.cats[c]+(n?' <small>'+n+'</small>':'')+'</button>':''; }).join('')+'</div>'+
      '<button type="button" class="btn btn-glass glass" data-addf>'+T.fl.add+'</button></div>'+
      '<form class="wcard glass wfadd form" hidden novalidate><p class="muted small">'+T.fl.hint+'</p><div class="wgrid"><label>'+T.fl.title+'<input name="title" maxlength="140" dir="auto"></label>'+
        '<label>'+T.fl.cat+'<select name="category">'+FCATS.filter(function(c){return c!=='all'&&c!=='delivered'}).map(function(c){ return '<option value="'+c+'">'+T.fl.cats[c]+'</option>'; }).join('')+'</select></label></div>'+
        '<label>'+T.fl.url+'<input name="url" type="url" dir="ltr" required></label><label>'+T.fl.note+'<input name="note" maxlength="1000" dir="auto"></label>'+
        '<p class="msg" role="alert"></p><div class="actions"><button class="btn btn-primary" type="submit">'+T.fl.save+'</button></div></form><div class="wfiles"></div>';
    var grid=body.querySelector('.wfiles'), form=body.querySelector('.wfadd');
    var draw=function(){ var list=items.filter(function(x){ return cat==='all'||x.cat===cat; });
      grid.innerHTML=list.length?list.map(function(f){ return '<div class="wfile glass"><a class="wf-main" href="'+esc(f.url)+'" target="_blank" rel="noopener noreferrer"><span class="wf-host">'+esc(hostOf(f.url))+'</span><b><bdi>'+esc(f.title)+'</bdi></b></a>'+
        '<small class="muted">'+esc(T.fl.cats[f.cat]||f.cat)+' · '+esc(f.who||'')+' · '+esc(d8(f.at))+(f.ref?' · <a href="#w/t/'+esc(f.ref)+'"><bdi dir="ltr">'+esc(f.ref)+'</bdi></a>':'')+'</small>'+(f.note?'<p class="muted small">'+para(f.note)+'</p>':'')+
        (f.mine?'<button type="button" class="linkbtn wf-del" data-delf="'+esc(f.id)+'">'+T.fl.del+'</button>':'')+'</div>'; }).join(''):'<p class="muted small">'+T.fl.none+'</p>';
      grid.querySelectorAll('[data-delf]').forEach(function(x){ x.onclick=function(){ if(x.dataset.armed!=='1'){ x.dataset.armed='1'; x.textContent=T.dl.sure; return; }
        api('',{action:'deleteFile',id:x.dataset.delf}).then(function(r){ if(r.ok) project(p.id,'files',true); else toast(T.err); }); }; }); };
    body.querySelector('.wfilt').onclick=function(e){ var b=e.target.closest('button'); if(!b) return; cat=b.dataset.c; [].forEach.call(this.children,function(x){ x.classList.toggle('on',x===b); }); draw(); };
    body.querySelector('[data-addf]').onclick=function(){ form.hidden=!form.hidden; if(!form.hidden) form.elements.url.focus(); };
    form.onsubmit=function(e){ e.preventDefault(); var E=form.elements, msg=form.querySelector('.msg'), u=E.url.value.trim();
      if(!/^https?:\/\/\S+$/i.test(u)){ msg.textContent=T.fl.badUrl; E.url.focus(); return; }
      var b=form.querySelector('button[type=submit]'); b.disabled=true;
      api('',{action:'file',project:p.id,category:E.category.value,title:E.title.value.trim(),url:u,note:E.note.value.trim()}).then(function(r){ if(r.ok){ toast(T.saved); project(p.id,'files',true); } else { b.disabled=false; msg.textContent=r.error==='url'?T.fl.badUrl:T.err; } }); };
    draw();
  }

  /* ---- new task: form → preview → send ---- */
  function newTask(pid){
    var W=C().workspace||{}, types=L(W.taskTypes)||[], projects=(DASH&&DASH.projects)||null;
    var go=function(){ var act=projects.filter(function(p){return p.status==='active'}); if(!act.some(function(p){return p.id===pid})&&act[0]) pid=act[0].id;
      var minD=new Date().toISOString().slice(0,10);
      host.innerHTML='<a class="wback" href="#w/p/'+esc(pid)+'">← '+T.back+'</a><form class="wcard glass wform form" id="wNew" novalidate><span class="eyebrow">NEW TASK</span><h2>'+T.f.h+'</h2>'+
        '<div class="wgrid"><label>'+T.f.title+'<input name="title" maxlength="140" required dir="auto"></label>'+
        '<label>'+T.project+'<select name="project">'+act.map(function(p){ return '<option value="'+esc(p.id)+'"'+(p.id===pid?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select></label>'+
        '<label>'+T.f.type+'<input name="type" list="wTypes" maxlength="60" dir="auto"><datalist id="wTypes">'+types.map(function(x){ return '<option value="'+esc(x)+'">'; }).join('')+'</datalist></label>'+
        '<label>'+T.f.date+'<input name="requested_date" type="date" min="'+minD+'"><small class="muted">'+T.f.dateHint+'</small></label></div>'+
        '<fieldset class="wprio"><legend>'+T.f.prio+'</legend>'+['normal','high','urgent'].map(function(p,i){ return '<label class="chipb'+(i===0?' on':'')+'"><input type="radio" name="priority" value="'+p+'"'+(i===0?' checked':'')+'>'+esc(L((W.priorities||{})[p])||T.p[p])+'</label>'; }).join('')+'</fieldset>'+
        '<label>'+T.f.desc+'<textarea name="description" maxlength="4000" dir="auto"></textarea></label>'+
        '<label>'+T.f.details+'<textarea name="details" maxlength="6000" dir="auto"></textarea></label>'+
        '<div class="wlinks"><span class="olab">'+T.f.links+'</span><div class="rows"></div><button type="button" class="linkbtn addl">'+T.f.addLink+'</button></div>'+
        '<label>'+T.f.notes+'<textarea name="notes" maxlength="3000" dir="auto"></textarea></label>'+
        '<p class="msg" role="alert"></p><div class="actions"><button class="btn btn-primary" type="submit">'+T.f.preview+'</button></div></form>';
      var f=document.getElementById('wNew'), rows=f.querySelector('.wlinks .rows');
      var addRow=function(){ if(rows.children.length>=10) return; var d=document.createElement('div'); d.className='lrow2'; d.innerHTML='<input name="ll" placeholder="'+T.f.linkLabel+'" maxlength="80" dir="auto"><input name="lu" type="url" dir="ltr" placeholder="'+T.f.linkUrl+'">'; rows.appendChild(d); };
      addRow(); f.querySelector('.addl').onclick=addRow;
      f.querySelector('.wprio').onchange=function(){ [].forEach.call(this.querySelectorAll('label'),function(l){ l.classList.toggle('on',l.querySelector('input').checked); }); };
      f.onsubmit=function(e){ e.preventDefault(); var E=f.elements, msg=f.querySelector('.msg');
        var data={action:'task',project:E.project.value,title:E.title.value.trim(),type:E.type.value.trim(),requested_date:E.requested_date.value,priority:(f.querySelector('input[name=priority]:checked')||{}).value||'normal',
          description:E.description.value.trim(),details:E.details.value.trim(),notes:E.notes.value.trim(),
          links:[].map.call(rows.children,function(r){ return {label:r.children[0].value.trim(),url:r.children[1].value.trim()}; }).filter(function(l){ return /^https?:\/\//i.test(l.url); })};
        if(!data.title){ msg.textContent=T.f.need; E.title.focus(); return; }
        if(data.requested_date&&data.requested_date<minD){ msg.textContent=T.f.bad; return; }
        preview(data,f); };
    };
    if(projects) go(); else { loading(); api('?view=dash').then(function(j){ if(!j.ok) return fail(j); DASH=j; projects=j.projects; go(); }); }
  }
  function preview(data,form){
    var p=(DASH.projects||[]).filter(function(x){return x.id===data.project})[0]||{};
    var box=document.createElement('div'); box.className='wcard glass wpreview';
    box.innerHTML='<span class="eyebrow">PREVIEW</span><h2>'+esc(data.title)+'</h2><dl class="wmeta">'+
      '<div><dt>'+T.project+'</dt><dd>'+esc(p.name||'')+'</dd></div>'+(data.type?'<div><dt>'+T.f.type+'</dt><dd>'+esc(data.type)+'</dd></div>':'')+
      '<div><dt>'+T.req+'</dt><dd>'+esc(data.requested_date?d8(data.requested_date):T.reqNone)+'</dd></div><div><dt>'+T.f.prio+'</dt><dd>'+esc(T.p[data.priority])+'</dd></div></dl>'+
      (data.description?'<h4>'+T.desc+'</h4><p>'+para(data.description)+'</p>':'')+(data.details?'<h4>'+T.details+'</h4><p>'+para(data.details)+'</p>':'')+
      (data.links.length?'<h4>'+T.links+'</h4><div class="wlinkset">'+linksHTML(data.links)+'</div>':'')+(data.notes?'<h4>'+T.notes+'</h4><p>'+para(data.notes)+'</p>':'')+
      '<p class="muted small">'+T.f.dateHint+'</p><p class="msg" role="alert"></p><div class="actions"><button class="btn btn-primary" type="button" data-send>'+T.f.send+'</button><button class="btn btn-glass glass" type="button" data-edit>'+T.f.edit+'</button></div>';
    form.hidden=true; form.parentNode.insertBefore(box,form.nextSibling); scrollTo({top:host.offsetTop-90,behavior:'smooth'});
    box.querySelector('[data-edit]').onclick=function(){ box.remove(); form.hidden=false; };
    box.querySelector('[data-send]').onclick=function(){ var b=this; b.disabled=true; b.textContent=T.f.sending;
      api('',data).then(function(j){ if(j.ok){ DASH=null; toast(T.f.sent); location.hash='#w/t/'+j.ref; return; }
        b.disabled=false; b.textContent=T.f.send; box.querySelector('.msg').textContent=j.error==='date'?T.f.bad:T.err; }); };
  }

  /* ---- task ---- */
  var PATH=['new','review','accepted','progress','feedback','final','completed'];
  function task(ref){
    loading();
    api('?task='+encodeURIComponent(ref)).then(function(j){ if(!j.ok) return fail(j); var t=j.task, cr=t.change_request;
      var at=PATH.indexOf(t.status==='info'?'review':t.status==='revision'?'feedback':t.status), off=t.status==='rejected'||t.status==='cancelled';
      var canChange=['accepted','progress','feedback','revision'].indexOf(t.status)>=0&&t.confirmed_date&&!(cr&&cr.status==='pending');
      host.innerHTML='<a class="wback" href="#w/p/'+esc(t.project_id)+'">← '+esc(t.project_name||T.back)+'</a>'+
        '<div class="wcard glass wtask"><div class="wthead"><div><span class="k">'+esc(t.ref)+(t.type?' · '+esc(t.type):'')+'</span><h2>'+esc(t.title)+'</h2></div><div>'+pill(t.status)+prio(t.priority)+'</div></div>'+
        (off?'':'<ol class="track wtrack" style="--p:'+(Math.max(0,at)/(PATH.length-1))+'">'+PATH.map(function(s,i){ return '<li class="'+(i<at||t.status==='completed'?'done':i===at?'now':'')+'"><i></i><b>'+esc(T.st[s])+'</b></li>'; }).join('')+'</ol>')+
        '<div class="wdates2"><div><span>'+T.req+'</span><b>'+esc(t.requested_date?d8(t.requested_date):T.reqNone)+'</b><small class="muted">'+(AR?'من طرفك':'from you')+'</small></div>'+
          '<div class="'+(t.confirmed_date?'ok':'')+'"><span>'+T.conf+'</span><b>'+esc(t.confirmed_date?d8(t.confirmed_date):'—')+'</b><small class="muted">'+(t.confirmed_date?(AR?'معتمد من Eyeblink':'confirmed by Eyeblink'):T.confNone)+'</small></div></div>'+
        (cr&&cr.status==='pending'?'<p class="wnote">⏳ '+T.changePend+esc(d8(cr.date))+T.changeWait+'</p>':'')+
        (t.status==='info'?'<div class="wnote warn"><b>'+T.infoH+'</b><p>'+para(t.studio_note||'')+'</p><form class="form wreply"><label>'+T.reply+'<textarea name="text" dir="auto" maxlength="4000"></textarea></label>'+
          '<div class="lrow2"><input name="ll" placeholder="'+T.f.linkLabel+'" dir="auto"><input name="lu" type="url" dir="ltr" placeholder="'+T.f.linkUrl+'"></div><button class="btn btn-primary" type="submit">'+T.replyBtn+'</button></form></div>':'')+
        (t.status==='rejected'&&t.studio_note?'<div class="wnote bad"><b>'+T.rejH+'</b><p>'+para(t.studio_note)+'</p></div>':'')+
        (t.status!=='info'&&t.status!=='rejected'&&t.studio_note?'<div class="wnote"><b>'+T.noteH+'</b><p>'+para(t.studio_note)+'</p></div>':'')+
        '<div class="wbody">'+(t.description?'<h4>'+T.desc+'</h4><p>'+para(t.description)+'</p>':'')+(t.details?'<h4>'+T.details+'</h4><p>'+para(t.details)+'</p>':'')+
          ((t.links||[]).length?'<h4>'+T.links+'</h4><div class="wlinkset">'+linksHTML(t.links)+'</div>':'')+(t.notes?'<h4>'+T.notes+'</h4><p>'+para(t.notes)+'</p>':'')+'</div>'+
        '<div class="actions wtact">'+(canChange?'<button type="button" class="btn btn-glass glass" data-chg>'+T.change+'</button>':'')+(['new','review','info'].indexOf(t.status)>=0?'<button type="button" class="btn btn-glass glass danger" data-cancel>'+T.cancel+'</button>':'')+'</div>'+
        '<form class="form wchange" hidden><b>'+T.changeH+'</b><label>'+T.newDate+'<input name="date" type="date" min="'+new Date().toISOString().slice(0,10)+'" required></label><label>'+T.why+'<textarea name="reason" dir="auto" maxlength="1500"></textarea></label><button class="btn btn-primary" type="submit">'+T.changeSend+'</button></form>'+
        '</div>'+deliveries(j)+'<section class="wsec"><h3>'+T.cm.h+((j.comments||[]).length?' ('+j.comments.length+')':'')+'</h3>'+thread(j.comments,j.me)+'</section>'+
        '<section class="wsec"><h3>'+T.log+'</h3><ul class="wact">'+j.activity.map(actText).join('')+'</ul></section>';
      bindDeliveries(host,j,function(){ task(ref); });
      bindThread(host.querySelector('.wthread').parentNode,{scope:'task',task:t.ref},function(){ task(ref); });
      var w=host.querySelector('.wreply'); if(w) w.onsubmit=function(e){ e.preventDefault(); var b=w.querySelector('button'); b.disabled=true; var u=w.elements.lu.value.trim();
        api('',{action:'reply',task:t.ref,text:w.elements.text.value.trim(),links:/^https?:\/\//i.test(u)?[{label:w.elements.ll.value.trim(),url:u}]:[]}).then(function(r){ if(r.ok){ toast(T.saved); task(ref); } else { b.disabled=false; toast(T.err); } }); };
      var cb=host.querySelector('[data-cancel]'); if(cb) cb.onclick=function(){ if(cb.dataset.armed!=='1'){ cb.dataset.armed='1'; cb.textContent=T.cancelSure; return; } cb.disabled=true;
        api('',{action:'cancel',task:t.ref}).then(function(r){ if(r.ok) task(ref); else { cb.disabled=false; toast(T.err); } }); };
      var ch=host.querySelector('[data-chg]'), cf=host.querySelector('.wchange'); if(ch) ch.onclick=function(){ cf.hidden=!cf.hidden; if(!cf.hidden) cf.elements.date.focus(); };
      cf.onsubmit=function(e){ e.preventDefault(); var b=cf.querySelector('button'); b.disabled=true;
        api('',{action:'dateChange',task:t.ref,date:cf.elements.date.value,reason:cf.elements.reason.value.trim()}).then(function(r){ if(r.ok){ toast(T.saved); task(ref); } else { b.disabled=false; toast(r.error==='date'?T.f.bad:T.err); } }); };
    });
  }
  /* ---- deliveries: V1, V2… Final, with approval or timestamped change requests ---- */
  function embedOf(u){ var m;
    if((m=/drive\.google\.com\/file\/d\/([\w-]{10,})/.exec(u))||(m=/drive\.google\.com\/open\?id=([\w-]{10,})/.exec(u))) return 'https://drive.google.com/file/d/'+m[1]+'/preview';
    if((m=/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(u))) return 'https://www.youtube-nocookie.com/embed/'+m[1];
    if((m=/vimeo\.com\/(?:video\/)?(\d{6,})/.exec(u))) return 'https://player.vimeo.com/video/'+m[1];
    return ''; }
  function vname(dl){ return dl.is_final?T.dl.fin:dl.label; }
  function points(list){ return '<ol class="wpl">'+list.map(function(p){ return '<li class="'+(p.done?'done':'')+'">'+(p.t?'<span class="wtc">'+esc(p.t)+'</span>':'')+'<span>'+esc(p.text)+'</span>'+(p.done?'<em>✓ '+T.dl.done+'</em>':'')+'</li>'; }).join('')+'</ol>'; }
  function dlCard(dl,t,latest){ var emb=embedOf(dl.url), canDecide=latest&&dl.status==='sent'&&(t.status==='feedback'||t.status==='final');
    return '<article class="wdl glass'+(latest?' latest':'')+'" data-dl="'+esc(dl.id)+'"><div class="wdl-h"><span class="wver'+(dl.is_final?' fin':'')+'">'+esc(vname(dl))+'</span>'+
      '<div class="wdl-t"><b>'+esc(dl.title||t.title)+'</b><small class="muted">'+esc(ago(dl.created_at))+'</small></div><span class="dst s-'+esc(dl.status)+'">'+esc(T.dl.st[dl.status]||dl.status)+'</span></div>'+
      (dl.note?'<div class="wdl-note"><small class="muted">'+T.dl.studio+'</small><p>'+para(dl.note)+'</p></div>':'')+
      '<div class="wdl-a"><a class="btn btn-glass glass" href="'+esc(dl.url)+'" target="_blank" rel="noopener noreferrer">↗ '+T.dl.open+'</a>'+(emb?'<button type="button" class="btn btn-glass glass" data-emb="'+esc(emb)+'">▶ '+T.dl.preview+'</button>':'')+
        ((dl.links||[]).length?linksHTML(dl.links):'')+'</div><div class="wembed" hidden></div>'+
      (dl.status==='changes'?'<div class="wdl-fb"><small class="muted">'+T.dl.yours+'</small>'+((dl.points||[]).length?points(dl.points):'')+(dl.decision_note?'<p>'+para(dl.decision_note)+'</p>':'')+(latest&&t.status==='revision'?'<p class="muted small">⏳ '+T.dl.working+'</p>':'')+'</div>':'')+
      (dl.status==='approved'&&dl.decision_note?'<div class="wdl-fb"><small class="muted">'+T.dl.yours+'</small><p>'+para(dl.decision_note)+'</p></div>':'')+
      (canDecide?'<div class="wdec"><div class="actions"><button type="button" class="btn btn-primary" data-ok>✓ '+(dl.is_final?T.dl.approveFinal:T.dl.approve)+'</button><button type="button" class="btn btn-glass glass" data-chg2>'+T.dl.changes+'</button></div>'+
        (dl.is_final?'<p class="muted small">'+T.dl.finalNote+'</p>':'')+
        '<form class="form wpts" hidden novalidate><b>'+T.dl.chH+'</b><p class="muted small">'+T.dl.chHint+'</p><div class="rows"></div><button type="button" class="linkbtn addp">'+T.dl.addPoint+'</button>'+
        '<label>'+T.dl.general+'<textarea name="note" dir="auto" maxlength="3000" rows="2"></textarea></label><p class="msg" role="alert"></p><div class="actions"><button class="btn btn-primary" type="submit">'+T.dl.send+'</button></div></form></div>':'')+
      '</article>'; }
  function deliveries(j){ var t=j.task, list=j.deliverables||[], rounds=list.filter(function(d){return d.status==='changes'}).length;
    if(!list.length&&['accepted','progress','revision'].indexOf(t.status)<0) return '';
    return '<section class="wsec wdls"><h3>'+T.dl.h+(rounds?' · '+T.dl.round+' '+rounds:'')+'</h3>'+(list.length?dlCard(list[0],t,true)+
      (list.length>1?'<details class="wvh"><summary>'+T.dl.history+' ('+(list.length-1)+')</summary><div class="wvh-l">'+list.slice(1).map(function(d){ return dlCard(d,t,false); }).join('')+'</div></details>':'')
      :'<div class="wcard glass"><p class="muted" style="margin:0">'+T.dl.none+'</p></div>')+'</section>'; }
  var TCRE=/^(\d{1,2}:)?\d{1,2}:\d{2}$/;
  function bindDeliveries(box,j,reload){
    box.querySelectorAll('[data-emb]').forEach(function(b){ b.onclick=function(){ var w=b.closest('.wdl').querySelector('.wembed');
      if(!w.hidden){ w.hidden=true; w.innerHTML=''; return; } w.hidden=false;
      w.innerHTML='<iframe src="'+esc(b.dataset.emb)+'" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin" title="preview"></iframe>'; }; });
    var card=box.querySelector('.wdl.latest'); if(!card) return; var id=card.dataset.dl, t=j.task;
    var ok=card.querySelector('[data-ok]'), ch=card.querySelector('[data-chg2]'), f=card.querySelector('.wpts'); if(!ok) return;
    ok.onclick=function(){ if(ok.dataset.armed!=='1'){ ok.dataset.armed='1'; ok.textContent=T.dl.sure; return; } ok.disabled=true;
      api('',{action:'decide',task:t.ref,deliverable:id,decision:'approve'}).then(function(r){ if(r.ok){ toast(T.dl.okMsg); reload(); } else { ok.disabled=false; toast(T.err); } }); };
    var rows=f.querySelector('.rows');
    var add=function(){ if(rows.children.length>=30) return; var d=document.createElement('div'); d.className='wpt';
      d.innerHTML='<input name="t" inputmode="numeric" dir="ltr" maxlength="8" placeholder="00:12" aria-label="timecode"><input name="x" dir="auto" maxlength="600" placeholder="'+T.dl.point+'">'; rows.appendChild(d); return d; };
    add(); add(); f.querySelector('.addp').onclick=function(){ var d=add(); if(d) d.children[1].focus(); };
    ch.onclick=function(){ f.hidden=!f.hidden; if(!f.hidden) rows.querySelector('input[name=x]').focus(); };
    f.onsubmit=function(e){ e.preventDefault(); var msg=f.querySelector('.msg'), bad=null;
      var pts=[].map.call(rows.children,function(r){ var tc=r.children[0].value.trim(), x=r.children[1].value.trim(); if(tc&&!TCRE.test(tc)) bad=r.children[0]; return {t:tc,text:x}; }).filter(function(p){ return p.text; });
      if(bad){ msg.textContent=T.dl.badTc; bad.focus(); return; }
      var note=f.elements.note.value.trim(); if(!pts.length&&!note){ msg.textContent=T.dl.need; rows.querySelector('input[name=x]').focus(); return; }
      var b=f.querySelector('button[type=submit]'); b.disabled=true;
      api('',{action:'decide',task:t.ref,deliverable:id,decision:'changes',points:pts,note:note}).then(function(r){ if(r.ok){ toast(T.dl.chMsg); reload(); } else { b.disabled=false; msg.textContent=T.err; } }); };
  }
  window.EBPortal={mount:mount, route:route, T:T};
})();
