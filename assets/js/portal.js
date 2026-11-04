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
      a:{task_created:'أرسل مهمة جديدة',status:'غيّر الحالة إلى',date_changed:'غيّر الموعد المؤكد إلى',info_provided:'أرسل المعلومات المطلوبة',date_change_requested:'طلب تغيير الموعد إلى',date_change_decided_ok:'وافق على الموعد الجديد',date_change_decided_no:'أبقى الموعد كما هو',project_created:'فتح المشروع',project_updated:'حدّث المشروع'},
      err:'صار خطأ، جرّب مرة ثانية.',saved:'تم.'},
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
      a:{task_created:'sent a new task',status:'changed the status to',date_changed:'changed the confirmed date to',info_provided:'sent the requested information',date_change_requested:'asked to move the date to',date_change_decided_ok:'approved the new date',date_change_decided_no:'kept the date',project_created:'opened the project',project_updated:'updated the project'},
      err:'Something went wrong. Try again.',saved:'Done.'}
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
    else w=T.a[k]||k;
    return '<li><i class="'+(a.actor==='studio'?'s':'c')+'"></i><div><b>'+esc(who)+'</b> '+esc(w)+(a.task_ref?' · <a href="#w/t/'+esc(a.task_ref)+'">'+esc(a.task_ref)+'</a>':'')+
      (d.note?'<p class="muted small">'+para(d.note)+'</p>':'')+(k==='info_provided'&&d.text?'<p class="muted small">'+para(d.text)+'</p>':'')+'<small>'+esc(ago(a.at))+'</small></div></li>'; }
  function toast(t){ var d=document.createElement('div'); d.className='toast'; d.textContent=t; document.body.appendChild(d); setTimeout(function(){ d.remove(); },2600); }

  var host=null, DASH=null;
  function mount(el){ host=el; route(); }
  function route(){ if(!host||host.hidden) return; var h=(location.hash||'').slice(1), m;
    if((m=/^w\/t\/(T-[A-Z0-9]+)$/.exec(h))) return task(m[1]);
    if((m=/^w\/p\/(p_[a-f0-9]+)$/.exec(h))) return project(m[1]);
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

  /* ---- project ---- */
  function project(id){
    loading();
    api('?project='+encodeURIComponent(id)).then(function(j){ if(!j.ok) return fail(j); var p=j.project, F='all';
      var draw=function(){ var list=j.tasks.filter(function(t){ return F==='all'||(F==='open'?OPEN.indexOf(t.status)>=0:t.status===F); });
        host.querySelector('.wtasks').innerHTML=taskTable(list,false); };
      host.innerHTML='<a class="wback" href="#w">← '+T.back+'</a>'+
        '<div class="wcard glass wphead"><div><span class="k">'+esc(T.types[p.type]||p.type)+' · '+esc(T.pst[p.status]||p.status)+'</span><h2>'+esc(p.name)+'</h2>'+(p.description?'<p class="muted">'+para(p.description)+'</p>':'')+
          '<dl class="wmeta">'+(p.start_date?'<div><dt>'+T.start+'</dt><dd>'+esc(d8(p.start_date))+'</dd></div>':'')+(p.end_date?'<div><dt>'+T.end+'</dt><dd>'+esc(d8(p.end_date))+'</dd></div>':'')+
          ((p.services||[]).length?'<div><dt>'+T.services+'</dt><dd>'+p.services.map(function(s){ var sv=(C().services||[]).filter(function(x){return x.id===s})[0]; return '<span class="tag">'+esc(sv?L(sv.name):s)+'</span>'; }).join(' ')+'</dd></div>':'')+'</dl></div>'+
          (p.status==='active'?'<a class="btn btn-primary" href="#w/new/'+esc(p.id)+'">+ '+T.newTask+'</a>':'')+'</div>'+
        '<div class="wcols"><section class="wsec"><div class="wfilt">'+[['all',T.all],['open',AR?'المفتوحة':'Open'],['completed',T.st.completed]].map(function(x,i){ return '<button type="button" class="chipb'+(i===0?' on':'')+'" data-f="'+x[0]+'">'+x[1]+'</button>'; }).join('')+'</div><div class="wtasks"></div></section>'+
        '<aside class="wside"><section class="wsec"><h3>'+T.activity+'</h3>'+(j.activity.length?'<ul class="wact">'+j.activity.map(function(a){ var t=j.tasks.filter(function(x){return x.id===a.task_id})[0]; a.task_ref=t&&t.ref; return actText(a); }).join('')+'</ul>':'<p class="muted small">'+T.noAct+'</p>')+'</section></aside></div>';
      host.querySelector('.wfilt').onclick=function(e){ var b=e.target.closest('button'); if(!b) return; F=b.dataset.f; [].forEach.call(this.children,function(x){ x.classList.toggle('on',x===b); }); draw(); };
      draw();
    });
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
        '</div><section class="wsec"><h3>'+T.log+'</h3><ul class="wact">'+j.activity.map(actText).join('')+'</ul></section>';
      var w=host.querySelector('.wreply'); if(w) w.onsubmit=function(e){ e.preventDefault(); var b=w.querySelector('button'); b.disabled=true; var u=w.elements.lu.value.trim();
        api('',{action:'reply',task:t.ref,text:w.elements.text.value.trim(),links:/^https?:\/\//i.test(u)?[{label:w.elements.ll.value.trim(),url:u}]:[]}).then(function(r){ if(r.ok){ toast(T.saved); task(ref); } else { b.disabled=false; toast(T.err); } }); };
      var cb=host.querySelector('[data-cancel]'); if(cb) cb.onclick=function(){ if(cb.dataset.armed!=='1'){ cb.dataset.armed='1'; cb.textContent=T.cancelSure; return; } cb.disabled=true;
        api('',{action:'cancel',task:t.ref}).then(function(r){ if(r.ok) task(ref); else { cb.disabled=false; toast(T.err); } }); };
      var ch=host.querySelector('[data-chg]'), cf=host.querySelector('.wchange'); if(ch) ch.onclick=function(){ cf.hidden=!cf.hidden; if(!cf.hidden) cf.elements.date.focus(); };
      cf.onsubmit=function(e){ e.preventDefault(); var b=cf.querySelector('button'); b.disabled=true;
        api('',{action:'dateChange',task:t.ref,date:cf.elements.date.value,reason:cf.elements.reason.value.trim()}).then(function(r){ if(r.ok){ toast(T.saved); task(ref); } else { b.disabled=false; toast(r.error==='date'?T.f.bad:T.err); } }); };
    });
  }
  window.EBPortal={mount:mount, route:route, T:T};
})();
