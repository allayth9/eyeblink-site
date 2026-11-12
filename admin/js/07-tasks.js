/* Eyeblink admin · tasks — loaded after the files before it; all of admin/js shares one scope */
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
  var PKIND={edit:'تعديل',ask:'سؤال',note:'ملاحظة',love:'أعجبني'}, PST={open:'مفتوحة',progress:'قيد العمل',resolved:'تمت',na:'لا تنطبق'};
  function isVault(u){ return /\/api\/vault\/v\//.test(u||''); }
  // private upload to R2 in 50 MB parts (Cloudflare takes up to 100 MB a request), so large videos go through
  function vaultUpload(file,onp){ var CH=50*1024*1024, n=Math.max(1,Math.ceil(file.size/CH)), parts=[], key, up;
    var post=function(op,body){ return fetch(API+'/vault?op='+op,{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify(body)}).then(function(r){ return r.json().then(function(j){ if(!j.ok) throw j.error||'fail'; return j; }); }); };
    return post('create',{name:file.name,type:file.type,size:file.size}).then(function(j){ key=j.key; up=j.uploadId;
      var chain=Promise.resolve(); for(var i=1;i<=n;i++)(function(i){ chain=chain.then(function(){ var blob=file.slice((i-1)*CH,Math.min(file.size,i*CH));
        return fetch(API+'/vault?op=part&key='+encodeURIComponent(key)+'&uploadId='+encodeURIComponent(up)+'&n='+i,{method:'PUT',headers:headers({'content-type':'application/octet-stream'}),body:blob}).then(function(r){ return r.json(); }).then(function(p){ if(!p.ok) throw p.error||'part'; parts.push({partNumber:p.partNumber,etag:p.etag}); onp(i/n); }); }); })(i);
      return chain; }).then(function(){ return post('complete',{key:key,uploadId:up,parts:parts}); }).catch(function(e){ if(key) post('abort',{key:key,uploadId:up}).catch(function(){}); throw e; }); }
  function wdelivs(t){ var L=WORK.deliverables||[], can=['accepted','progress','revision','feedback','final'].indexOf(t.status)>=0, next=(L.length?L[0].version:0)+1;
    var rounds=L.filter(function(d){return d.status==='changes'}).length;
    return '<div class="wdv"><div class="ph"><b>التسليمات'+(rounds?' · جولة التعديل '+rounds:'')+'</b></div>'+
      (L.length?L.map(function(d,i){ return '<div class="wdi'+(i===0?' latest':'')+'"><div class="small"><span class="wver'+(d.is_final?' fin':'')+'">'+esc(d.is_final?'Final':d.label)+'</span> <b>'+esc(d.title||t.title)+'</b> · <span class="wpill tf-'+(d.status==='sent'?'wait':d.status==='approved'?'ok':d.status==='changes'?'fix':'off')+'">'+esc(WDS[d.status]||d.status)+'</span> <span class="muted">'+esc(new Date(d.created_at).toLocaleString('ar'))+'</span></div>'+
        '<div>'+wlinks([{url:d.url,label:'افتح الملف'}].concat(d.links||[]))+'</div>'+(d.note?'<div class="small muted">ملاحظتك مع التسليم: '+esc(d.note)+'</div>':'')+
        (isVault(d.url)?'<video class="wrv-a" src="'+esc(d.url.replace(/^https?:\/\/[^\/]+/,''))+'" controls preload="metadata" playsinline></video>':'')+
        ((d.points||[]).length?'<div class="small muted" style="margin-top:6px">الملاحظات على هالنسخة:</div><ol class="wpts-a">'+d.points.map(function(p,k){ var st=p.status||(p.done?'resolved':'open');
          return '<li class="pk-'+esc(p.kind||'edit')+(p.internal?' pint':'')+'"><span class="pkk">'+esc(PKIND[p.kind||'edit'])+(p.internal?' · داخلية':p.by==='studio'?' · منّا':'')+'</span>'+(p.t?'<button type="button" class="tc" data-wseek="'+esc(p.t)+'">'+esc(p.t)+'</button> ':'')+'<span class="ptx">'+esc(p.text)+'</span>'+
            '<select data-wpd="'+esc(d.id)+'" data-wpi="'+k+'" aria-label="حالة الملاحظة">'+Object.keys(PST).map(function(s){ return '<option value="'+s+'"'+(s===st?' selected':'')+'>'+PST[s]+'</option>'; }).join('')+'</select></li>'; }).join('')+'</ol>':'')+
        '<details class="wpadd"><summary class="small">+ ملاحظة منّا على هالنسخة</summary><div class="row"><div class="field" style="max-width:110px"><label>الوقت</label><input data-pat dir="ltr" placeholder="00:12"></div><div class="field" style="max-width:140px"><label>النوع</label><select data-pak>'+Object.keys(PKIND).map(function(k){ return '<option value="'+k+'">'+PKIND[k]+'</option>'; }).join('')+'</select></div><div class="field"><label>الملاحظة</label><input data-pax dir="auto"></div></div><div class="actions"><label class="check"><input type="checkbox" data-pai checked> داخلية (للفريق بس، العميل ما بيشوفها)</label><button class="btn sm" type="button" data-padd="'+esc(d.id)+'">أضف</button></div></details>'+
        (d.decision_note?'<div class="small">ملاحظة العميل: '+esc(d.decision_note)+'</div>':'')+'</div>'; }).join(''):'<div class="small muted">لا توجد تسليمات بعد.</div>')+
      (can?'<div class="wsend"><div class="small muted">تسليم جديد — سيُحفظ بوصفه <b>V'+next+'</b> (أو Final إن علّمته نهائياً)</div>'+
        '<div class="field"><label>ارفع الفيديو للمراجعة (خاص، بيشتغل جوّا مساحة العمل، والعميل بيحط ملاحظاته على الثانية)</label><input type="file" data-wdfile accept="video/mp4,video/quicktime,video/webm,audio/*,image/jpeg,image/png,image/webp,application/pdf,application/zip"><div class="wup" hidden><i></i><span></span></div></div>'+
        '<div class="row"><div class="field"><label>أو رابط (Google Drive لملفات الشغل، YouTube، Vimeo…)</label><input data-wdu dir="ltr" placeholder="https://drive.google.com/file/d/…"></div><div class="field"><label>عنوان (اختياري)</label><input data-wdt2 dir="auto" placeholder="'+esc(t.title)+'"></div></div>'+
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
  function wpill(s){ return '<span class="wpill tf-'+(TFAM[s]||'new')+'">'+esc(WST[s]||s)+'</span>'; }
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
          a.kind==='delivered'?'سلّم '+(d.final?'Final':d.label):a.kind==='approved'?'وافق على '+(d.final?'التسليم النهائي':d.label):a.kind==='point_status'?'غيّر حالة ملاحظة'+(d.t?' ['+d.t+']':'')+' على '+d.label+' إلى «'+(PST[d.to]||d.to)+'»'+(d.internal?' (داخلية)':''):a.kind==='point_added'?'أضاف ملاحظة'+(d.internal?' داخلية':'')+' على '+d.label+(d.t?' ['+d.t+']':''):a.kind==='changes_requested'?'طلب تعديلات على '+d.label+' ('+(d.points||0)+' نقاط)':
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
    if(WOPEN) WSUB='tasks';
    var rows=queued.concat(list), sel=WOPEN&&T.filter(function(x){ return x.ref===WOPEN; })[0];
    var subs='<div class="subtabs wsubs">'+[['tasks','المهام',T.filter(function(x){ return WOPENST.indexOf(x.status)>=0; }).length],['projects','المشاريع',(W.projects||[]).length],['settings','إعدادات نموذج المهمة',0]].map(function(x){ return '<button type="button" data-wsub="'+x[0]+'"'+(WSUB===x[0]?' aria-current="true"':'')+'>'+x[1]+(x[2]?' <small>'+x[2]+'</small>':'')+'</button>'; }).join('')+'</div>';
    var wfl='<div class="wfl"><select data-wf="status"><option value="">كل الحالات</option><option value="open"'+(WF.status==='open'?' selected':'')+'>المفتوحة</option>'+Object.keys(WST).map(function(s){ return '<option value="'+s+'"'+(WF.status===s?' selected':'')+'>'+WST[s]+'</option>'; }).join('')+'</select>'+
        '<select data-wf="client"><option value="">كل العملاء</option>'+(W.clients||[]).map(function(c){ return '<option value="'+esc(c.email)+'"'+(WF.client===c.email?' selected':'')+'>'+esc(c.name)+'</option>'; }).join('')+'</select>'+
        '<select data-wf="project"><option value="">كل المشاريع</option>'+(W.projects||[]).map(function(p){ return '<option value="'+esc(p.id)+'"'+(WF.project===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select></div>';
    var tasksView='<div class="osplit'+(sel?' has-open':'')+'"><ul class="olist">'+
        (queued.length?'<li class="olh">بانتظار قرارك · '+queued.length+'</li>'+queued.map(wtaskRow).join('')+(list.length?'<li class="olh">كل المهام · '+list.length+'</li>':''):'')+list.map(wtaskRow).join('')+
        (rows.length?'':'<li class="olh">لا مهام هنا</li>')+'</ul>'+
        (sel?'<div class="order item odetail wt tf-'+(TFAM[sel.status]||'new')+'" data-wref="'+esc(sel.ref)+'"><div class="odh"><button class="btn sm oback" type="button" data-wback>‹ كل المهام</button><span class="code">'+esc(sel.ref)+'</span><span class="tag">'+esc(WST[sel.status]||sel.status)+'</span><b>'+esc(sel.title)+'</b><span class="muted small">'+esc(sel.project_name||'')+' · المطلوب '+esc(wd(sel.requested_date))+(sel.confirmed_date?' · المؤكد '+esc(wd(sel.confirmed_date)):'')+'</span></div><div class="body">'+wtaskBody(sel)+'</div></div>'
          :'<div class="odetail empty-sel">اختار مهمة من القائمة</div>')+'</div>';
    $('#panel').innerHTML='<section class="sec kcsec"><div class="kcs">'+
        kc(cnt(function(t){return t.status==='new'||t.status==='review'}),'طلبات جديدة','new','orders')+kc(cnt(function(t){return ['accepted','progress','revision'].indexOf(t.status)>=0}),'قيد التنفيذ','prod','k_play')+
        kc(cnt(function(t){return ['info','feedback','final'].indexOf(t.status)>=0}),'بانتظار العميل','wait','k_wait')+kc(cnt(function(t){return t.confirmed_date&&t.confirmed_date<td&&WOPENST.indexOf(t.status)>=0}),'متأخرة','bad','k_late')+
        kc(cnt(function(t){return t.status==='completed'&&(t.completed_at||'').slice(0,7)===td.slice(0,7)}),'مكتملة هذا الشهر','ok','k_done')+kc((W.projects||[]).filter(function(p){return p.status==='active'}).length,'مشاريع نشطة','info','k_folder')+'</div></section>'+'<div class="wbar">'+subs+(WSUB==='tasks'?wfl:'')+'</div>'+
      (WSUB==='projects'?'<section class="sec"><h3>المشاريع ('+(W.projects||[]).length+')</h3><p class="hint">يربط المشروع عميلاً متعاقداً بمساحة عمله. يرى العميل مشاريعه فقط، ويرسل المهام من داخلها.</p>'+
        ((W.projects||[]).length?'<div class="clients">'+W.projects.map(function(p){ var cn=(W.clients||[]).filter(function(c){return c.email===p.client_email})[0];
          return '<div class="client"'+(WPEDIT===p.id?' data-editing':'')+'>'+(WPEDIT===p.id?projForm(p):(p.quota?wring(p.month_tasks||0,p.quota):'')+'<div><b>'+esc(p.name)+'</b> <span class="rpill'+(p.status==='active'?' on':'')+'">'+esc(WPS[p.status]||p.status)+'</span> <span class="muted small">'+esc(WPT[p.type]||p.type)+' · '+esc(cn?cn.name:p.client_email)+'</span></div>'+
            '<span class="muted small">'+(p.quota?'الحصة: '+(p.month_tasks||0)+' من '+p.quota+' هذا الشهر · ':'')+p.open_tasks+' مفتوحة من '+p.all_tasks+(p.start_date?' · من '+esc(wd(p.start_date)):'')+(p.end_date?' إلى '+esc(wd(p.end_date)):'')+'</span><div class="actions"><button class="btn sm" type="button" data-wpe="'+esc(p.id)+'">تعديل</button><button class="btn sm" type="button" data-wpt="'+esc(p.id)+'">مهامه</button><button class="btn sm" type="button" data-wsp="'+esc(p.id)+'">النقاش والملفات والجدول</button></div>')+'</div>'; }).join('')+'</div>':'')+
        '<div class="small muted" style="margin-top:14px">مشروع جديد</div>'+projForm(null)+'</section>'+wspacePanel():WSUB==='settings'?'<section class="sec"><h3>إعدادات نموذج المهمة</h3><p class="hint">تظهر أنواع المهام للعميل على شكل اقتراحات، وأسماء الأولويات قابلة للتعديل. تُحفظ مع «نشر التعديلات».</p>'+
        field(C,{p:'workspace.taskTypes',t:'bilist',l:'أنواع المهام',hint:'كل نوع بسطر'})+'<div class="row">'+['normal','high','urgent'].map(function(k){ return field(C,{p:'workspace.priorities.'+k,t:'bi',l:'اسم الأولوية: '+WPR[k]}); }).join('')+'</div></section>':tasksView);
  }
  // one line per task: what, which project and client, the stage, the confirmed date, and what needs you
  function wtaskRow(t){ var W=WORK, cn=(W.clients||[]).filter(function(c){ return c.email===t.client_email; })[0], late=t.confirmed_date&&t.confirmed_date<W.today&&WOPENST.indexOf(t.status)>=0, soon=!late&&t.confirmed_date&&WOPENST.indexOf(t.status)>=0&&(new Date(t.confirmed_date)-new Date(W.today))/864e5<=3, cr=t.change_request&&t.change_request.status==='pending';
    return '<li><button type="button" class="orow st tf-'+(TFAM[t.status]||'new')+(t.ref===WOPEN?' on':'')+'" data-wsel="'+esc(t.ref)+'">'+
      '<span class="orow-m"><b>'+esc(t.title)+'</b><small dir="ltr">'+esc(t.ref)+'</small></span>'+
      '<span class="orow-v small'+(late?' c-bad':soon?' c-soon':'')+'">'+(t.confirmed_date?esc(wd(t.confirmed_date)):'')+'</span>'+
      '<span class="orow-p">'+esc(t.project_name||'')+(cn?' · '+esc(cn.name):'')+'</span>'+
      '<span class="tag">'+esc(WST[t.status]||t.status)+'</span>'+
      '<span class="orow-x">'+(late?'<em class="lt">متأخرة</em>':'')+(cr?'<em class="c-warn">طلب تغيير موعد</em>':'')+(t.priority&&t.priority!=='normal'?'<em class="c-warn">'+esc(WPR[t.priority]||t.priority)+'</em>':'')+'</span></button></li>'; }
  var WSUB='tasks';
  function wring(n,q){ var c=2*Math.PI*19, f=Math.min(n/q,1); return '<svg class="wring'+(n>=q?' full':'')+'" viewBox="0 0 46 46" role="img" aria-label="'+n+' من '+q+' هذا الشهر"><circle cx="23" cy="23" r="19"/><circle class="v" cx="23" cy="23" r="19" stroke-dasharray="'+(c*f).toFixed(1)+' '+c.toFixed(1)+'" transform="rotate(-90 23 23)"/><text x="23" y="27" text-anchor="middle">'+n+'/'+q+'</text></svg>'; }
  document.addEventListener('click',function(e){ if(TAB!=='tasks') return; var b=e.target.closest('[data-wsel],[data-wback],[data-wsub]'); if(!b) return;
    if(b.dataset.wsub){ WSUB=b.dataset.wsub; WOPEN=null; route(); renderWork(); return; }
    WOPEN=b.dataset.wsel||null; route(); renderWork(); if(WOPEN) loadWork(); if(!matchMedia('(min-width:1001px)').matches) scrollTo(0,0); });
  document.addEventListener('change',function(e){ var s=e.target; if(TAB!=='tasks') return;
    if(s.hasAttribute('data-wdfile')&&s.files[0]){ var fb=s.closest('.wsend'), bar=fb.querySelector('.wup'), f0=s.files[0]; bar.hidden=false; bar.querySelector('span').textContent='عم يرفع… 0%'; s.disabled=true;
      vaultUpload(f0,function(p){ bar.querySelector('i').style.width=Math.round(p*100)+'%'; bar.querySelector('span').textContent='عم يرفع… '+Math.round(p*100)+'%'; }).then(function(j){ fb.querySelector('[data-wdu]').value=j.url; bar.querySelector('span').textContent='انرفع ✓ '+f0.name+' — هلق اكبس «أرسل التسليم للعميل»'; s.disabled=false; })
        .catch(function(e){ s.disabled=false; bar.querySelector('span').textContent=e==='r2'?'التخزين (R2) لسا مو مفعّل على Cloudflare':e==='type'?'نوع الملف مو مدعوم':'ما زبط الرفع، جرّب مرة تانية'; }); return; }
    if(s.dataset.wpd){ fetch(API+'/work',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({action:'point',deliverable:s.dataset.wpd,index:+s.dataset.wpi,status:s.value})}).then(function(r){ if(!r.ok) throw 0; toast(s.checked?'تم ✓':'رجعت مفتوحة'); }).catch(function(){ s.checked=!s.checked; toast('تعذّر الحفظ',true); }); return; }
    if(!s.dataset.wf) return; WF[s.dataset.wf]=s.value; renderWork(); });
  document.addEventListener('submit',function(e){ var f=e.target; if(!f.classList.contains('wpf')) return; e.preventDefault(); var E=f.elements;
    var body={action:'project',id:f.dataset.wpid||undefined,client_email:E.client_email.value,name:E.name.value.trim(),type:E.type.value,status:E.status.value,start_date:E.start_date.value,end_date:E.end_date.value,
      description:E.description.value.trim(),quota:E.quota.value,drive_url:E.drive_url.value.trim(),auto_report:E.auto_report.checked,services:[].map.call(f.querySelectorAll('input[name=svc]:checked'),function(i){return i.value})};
    wreq(body,f.querySelector('button[type=submit]'),f.dataset.wpid?'حُفظ المشروع':'أُنشئ المشروع وأُرسل بريد إلى العميل').then(function(){ WPEDIT=null; }).catch(function(){}); });
  document.addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b||TAB!=='tasks') return; var box=b.closest('.wtb');
    if(b.dataset.wpe){ WPEDIT=b.dataset.wpe; renderWork(); return; }
    if(b.hasAttribute('data-wpx')){ WPEDIT=null; renderWork(); return; }
    if(b.dataset.wpt){ WF={status:'',client:'',project:b.dataset.wpt}; WSUB='tasks'; WOPEN=null; route(); renderWork(); return; }
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
    if(b.dataset.wseek!==undefined){ var vv=b.closest('.wdi').querySelector('video'); if(vv){ var ps=b.dataset.wseek.split(':').map(Number), sec=ps.reduce(function(a,x){ return a*60+x; },0); vv.currentTime=sec; vv.play().catch(function(){}); } return; }
    if(b.dataset.padd){ var pb=b.closest('.wpadd'), tx=pb.querySelector('[data-pax]').value.trim(), tc=pb.querySelector('[data-pat]').value.trim(); if(!tx){ toast('اكتب الملاحظة',true); return; }
      wreq({action:'pointAdd',deliverable:b.dataset.padd,t:tc,kind:pb.querySelector('[data-pak]').value,text:tx,internal:pb.querySelector('[data-pai]').checked},b,'انضافت الملاحظة').catch(function(){}); return; }
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
