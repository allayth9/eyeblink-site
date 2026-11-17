/* Eyeblink admin · notify — loaded after the files before it; all of admin/js shares one scope */
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
      '<section class="sec"><div class="kpis"><div><b>'+N.unread+'</b><span>غير مقروءة لديك</span></div><div><b>'+st('email','sent')+'</b><span>رسائل بريد أُرسلت (30 يوماً)</span></div><div><b>'+(st('email','failed')+st('email','retry'))+'</b><span>إيميلات فشلت</span></div>'+
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
          '<p><b>النص بالعربي:</b></p><pre>مرحباً {{1}}، لديك تحديث جديد من Eyeblink Studio:\n{{2}}\nالتفاصيل كاملة في مساحة العمل الخاصة بك.</pre><p><b>النص بالإنجليزي:</b></p><pre>Hi {{1}}, you have a new update from Eyeblink Studio:\n{{2}}\nFull details are in your workspace.</pre>'+
          '<p><b>الزر:</b> Visit website ← Dynamic ← <code dir="ltr">'+esc(N.goBase||'https://eyeblinkstudio.com/go/')+'{{1}}</code> — مثال للقيمة: <code dir="ltr">t/T-ABC12</code></p>'+
          '<p><b>Webhook:</b> <code dir="ltr">'+esc(N.webhook||'')+'</code> — Verify token = قيمة <code>WHATSAPP_VERIFY_TOKEN</code> نفسها، واشترك في حقل <code>messages</code>. من خلاله تصل حالة كل رسالة (وصلت/قُرئت/فشلت)، وإن ردّ العميل بـ«إيقاف» أو STOP تتوقف رسائله فوراً.</p></div></details>'+
        '<div class="row"><div class="field"><label>رسالة تجريبية لرقم (مع رمز الدولة)</label><input data-watp dir="ltr" placeholder="+9665xxxxxxxx"></div><div class="field"><label>لغة القالب</label><select data-watl><option value="ar">العربية</option><option value="en">English</option></select></div>'+
          '<div class="field"><label>&nbsp;</label><button class="btn sm" type="button" data-watest>أرسل تجربة</button></div></div><div class="small muted" id="waOut">'+esc(WATEST)+'</div></section>';
  }
  document.addEventListener('change',function(e){ var s=e.target; if(TAB!=='notify'||!s.dataset.nf) return; NF[s.dataset.nf]=s.value; loadNotify(); });
  document.addEventListener('click',function(e){ if(TAB!=='notify') return;
    var a=e.target.closest('a[data-ni]'); if(a){ e.preventDefault(); npost({action:'studioRead',ids:[+a.dataset.ni]}).then(function(){ loadNotify(); });
      var m=/^#tasks\/(T-[A-Z0-9]+)/.exec(a.getAttribute('href')||''); TAB='tasks'; WOPEN=m?m[1]:null; route(); render(); loadWork(); scrollTo(0,0); return; }
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

  /* ---------------- the send sheet: before anything reaches a client, choose how and when ----------------
     It sits in front of the action buttons (a capture listener, like the confirm window), shows the exact e-mail and the
     WhatsApp text, then clicks the button again; wreq/bpost pick the choice up from NEXT_NOTIFY. In-app is always kept. */
  var NEXT_NOTIFY=null, SNDWHY={off:'أوقف العميل هذا النوع من الرسائل',none:'لم يفعّل الإشعارات على أجهزته',meta:'غير متاح بعد: بانتظار توثيق Meta',consent:'لم يفعّله العميل في مساحة عمله'};
  function sndBox(b,k){ return (b.closest('.wtb,.wcmp,#wspace,.bpay')||document).querySelector(k); }
  function sndVal(b,k){ var e=sndBox(b,k); return e?e.value.trim():''; }
  var SND=[
    ['[data-wacc]',function(b){ var k=cfTask(b.dataset.wacc), d=sndVal(b,'[data-wcd]'); if(!d) return null;
      return {title:'قبول المهمة',rows:(k?k.rows:[]).concat([['الموعد المؤكد',wd(d)]]),pv:{kind:'accept',ref:b.dataset.wacc,over:{status:'accepted',confirmed_date:d},note:sndVal(b,'[data-wnote]')}}; }],
    ['[data-winq]',function(b){ var k=cfTask(b.dataset.winq), n=sndVal(b,'[data-winfo]'); if(!n) return null;
      return {title:'طلب معلومات من العميل',rows:k?k.rows:[],pv:{kind:'info',ref:b.dataset.winq,over:{status:'info'},note:n}}; }],
    ['[data-wrjt]',function(b){ var k=cfTask(b.dataset.wrjt);
      return {tone:'bad',title:'الاعتذار عن المهمة',rows:k?k.rows:[],pv:{kind:'reject',ref:b.dataset.wrjt,over:{status:'rejected'},note:sndVal(b,'[data-wrej]')}}; }],
    ['[data-wsts]',function(b){ var k=cfTask(b.dataset.wsts), st=sndVal(b,'[data-wst]'); if(!st||(k&&k.t.status===st)) return null;
      return {title:'تحديث حالة المهمة',rows:(k?k.rows:[]).concat([['الحالة الجديدة',WST[st]||st]]),pv:{kind:st==='progress'?'progress':st==='completed'?'completed':'status',ref:b.dataset.wsts,over:{status:st},note:sndVal(b,'[data-wnote2]')}}; }],
    ['[data-wdt]',function(b){ var k=cfTask(b.dataset.wdt), d=sndVal(b,'[data-wcd2]'); if(!d||!k||!k.t.confirmed_date) return null;
      return {title:'تغيير موعد التسليم',rows:k.rows.concat([['الموعد الجديد',wd(d)]]),pv:{kind:'date',ref:b.dataset.wdt,over:{confirmed_date:d}}}; }],
    ['[data-wdd]',function(b){ var k=cfTask(b.dataset.wdd), ok=b.dataset.ok==='1';
      return {title:ok?'اعتماد الموعد الجديد':'الإبقاء على الموعد',rows:k?k.rows:[],pv:{kind:ok?'date':'dateNo',ref:b.dataset.wdd}}; }],
    ['[data-wdl]',function(b){ var k=cfTask(b.dataset.wdl), f=sndBox(b,'[data-wdf]'); if(!/^https?:\/\//i.test(sndVal(b,'[data-wdu]'))) return null;
      return {title:f&&f.checked?'إرسال التسليم النهائي':'إرسال نسخة للمراجعة',rows:k?k.rows:[],pv:{kind:'deliver',ref:b.dataset.wdl,final:!!(f&&f.checked),note:sndVal(b,'[data-wdn]')}}; }],
    ['[data-wtcm],[data-wpcm]',function(b){ var t=sndVal(b,'[data-wcm]'), l=sndVal(b,'[data-wcml]'); if(!t&&!/^https?:\/\//i.test(l)) return null;
      var k=b.dataset.wtcm?cfTask(b.dataset.wtcm):null;
      return {title:'تعليق إلى العميل',rows:k?k.rows:[],pv:b.dataset.wtcm?{kind:'comment',ref:b.dataset.wtcm,note:t}:{kind:'comment',project:b.dataset.wpcm,note:t}}; }],
    ['[data-wfa]',function(b){ if(!/^https?:\/\//i.test(sndVal(b,'[data-wfu]'))) return null; var t=sndVal(b,'[data-wft]');
      return {title:'مشاركة ملف مع العميل',rows:[['الملف',t]],pv:{kind:'file',project:b.dataset.wfa,file:t||'ملف'}}; }],
    ['[data-rsend]',function(b){ var m=sndVal(b,'[data-rmonth]');
      return {title:'إرسال التقرير الشهري',rows:[['الشهر',m]],pv:{kind:'report',project:b.dataset.rsend,month:m}}; }],
    ['[data-bsend]',function(b){ var i=cfInv(b.dataset.bsend); if(!i) return null;
      return {title:i.x.sent_at?'إعادة إرسال الفاتورة':'إرسال الفاتورة',rows:i.rows,pv:{kind:i.x.status==='paid'?'invoicePaid':'invoice',invoice:i.x.id}}; }],
    ['[data-bpay]',function(b){ var i=cfInv(b.dataset.bpay); if(!i||!i.x.sent_at) return null; var a=sndVal(b,'[data-pamt]');
      return {title:'تسجيل دفعة وإشعار العميل',rows:[['الفاتورة',i.x.no],['المبلغ',mny(nn(a),i.x.currency)],['الطريقة',sndVal(b,'[data-pmeth]')]],pv:{kind:'invoicePaid',invoice:i.x.id},nopv:true}; }],
    ['[data-bremind]',function(b){ var i=cfInv(b.dataset.bremind); if(!i) return null;
      return {title:'تذكير لطيف بالفاتورة',rows:i.rows.concat([['المتبقي',mny(i.x.balance,i.x.currency)]]),pv:{kind:'invoiceDue',invoice:i.x.id}}; }] ];
  function sndWa(t){ return esc(t).replace(/\*([^*\n]+)\*/g,'<b>$1</b>').replace(/\n/g,'<br>'); }
  var SNDIC={email:'<path d="M3 6.5h18v11H3z"/><path d="M3.5 7l8.5 6.5L20.5 7"/>',push:'<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',wa:'<path d="M4 20l1.2-3.6A8 8 0 1 1 8 19z"/><path d="M9.5 9.5c.3 2 1.9 3.8 4 4.4"/>',app:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18"/>'};
  function sendSheet(o){ return new Promise(function(res){ var last=document.activeElement, ov=document.createElement('div'), PV=null, WHEN='now'; ov.className='snd-ov';
    var rows=(o.rows||[]).filter(function(r){ return r[1]!=null&&r[1]!==''; });
    var ch=function(k,t){ return '<label class="snd-c" data-c="'+k+'"><input type="checkbox" data-ch="'+k+'" checked><span class="snd-i"><svg viewBox="0 0 24 24" aria-hidden="true">'+SNDIC[k]+'</svg></span><span class="snd-tx"><b>'+t+'</b><small data-why></small></span><i class="snd-tg" aria-hidden="true"></i></label>'; };
    ov.innerHTML='<div class="snd'+(o.nopv?' nopv':'')+(o.tone==='bad'?' bad':'')+'" role="dialog" aria-modal="true" aria-labelledby="sndT">'+
      '<div class="snd-hd"><span class="snd-k">إلى العميل</span><h4 id="sndT">'+esc(o.title)+'</h4><p class="snd-to" data-to>جارٍ تجهيز الرسالة…</p></div>'+
      '<div class="snd-bd"><div class="snd-sd">'+
        (rows.length?'<div class="cfm-rows">'+rows.map(function(r){ return '<div><span>'+esc(r[0])+'</span><b>'+esc(r[1])+'</b></div>'; }).join('')+'</div>':'')+
        '<div class="snd-l">القنوات</div><div class="snd-chs">'+ch('email','البريد الإلكتروني')+ch('push','إشعار على أجهزته')+ch('wa','واتساب')+
          '<div class="snd-c on fixed"><span class="snd-i"><svg viewBox="0 0 24 24" aria-hidden="true">'+SNDIC.app+'</svg></span><span class="snd-tx"><b>مساحة العمل</b><small>تُسجَّل دائماً في إشعاراته</small></span></div></div>'+
        '<div class="snd-l">التوقيت</div><div class="snd-seg" role="radiogroup"><button type="button" role="radio" aria-checked="true" data-when="now" class="on">الآن</button><button type="button" role="radio" aria-checked="false" data-when="later">لاحقاً</button><button type="button" role="radio" aria-checked="false" data-when="none">دون إشعار</button></div>'+
        '<input type="datetime-local" class="snd-at" data-at hidden aria-label="موعد الإرسال">'+
      '</div>'+
      (o.nopv?'':'<div class="snd-pv"><div class="snd-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-pv="mail" class="on">البريد</button><button type="button" role="tab" aria-selected="false" data-pv="wa">واتساب</button></div>'+
        '<div class="snd-fr" data-pvmail><div class="snd-load">جارٍ تجهيز المعاينة…</div></div>'+
        '<div class="snd-wa" data-pvwa hidden><div class="snd-bub" data-wtxt></div><p class="snd-nt">للإرسال اليدوي ريثما يُفعَّل واتساب تلقائياً: انسخها وأرسلها من رقم الاستوديو</p><div class="snd-wact"><button type="button" class="btn sm" data-wcopy>انسخ الرسالة</button><a class="btn sm" data-wopen target="_blank" rel="noopener" hidden>افتح المحادثة</a></div></div></div>')+
      '</div><div class="snd-ft"><button type="button" class="btn primary" data-sok>أرسل الآن</button><button type="button" class="btn" data-sno>إلغاء</button></div></div>';
    document.body.appendChild(ov); requestAnimationFrame(function(){ ov.classList.add('on'); });
    var Q=function(s){ return ov.querySelector(s); }, ok=Q('[data-sok]'), at=Q('[data-at]');
    function sync(){ var any=[].some.call(ov.querySelectorAll('[data-ch]'),function(c){ return c.checked&&!c.disabled; });
      ov.querySelectorAll('.snd-c[data-c]').forEach(function(l){ var c=l.querySelector('input'); l.classList.toggle('on',c.checked&&!c.disabled); l.classList.toggle('dis',c.disabled); });
      Q('.snd-chs').classList.toggle('mute',WHEN==='none');
      ok.textContent=WHEN==='none'||!any?'نفّذ دون إشعار':WHEN==='later'?'جدوِل الإرسال':'أرسل الآن'; }
    fetch(API+'/work',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify(Object.assign({action:'notifyPreview'},o.pv))}).then(function(r){ return r.json(); }).then(function(j){ PV=j;
      if(!j.ok||!j.account){ Q('[data-to]').textContent=j.ok?'لا يملك العميل حساباً بعد، فيُنفَّذ الإجراء دون رسائل':'تعذّر تجهيز المعاينة، ويمكنك الإرسال كالمعتاد'; if(j.ok) ov.querySelectorAll('[data-ch]').forEach(function(c){ c.checked=false; c.disabled=true; }); sync(); return; }
      Q('[data-to]').innerHTML=esc(j.name||'العميل')+' <span>·</span> '+esc(j.subject);
      ['email','push','wa'].forEach(function(k){ var c=Q('[data-ch="'+k+'"]'); if(!j.channels[k]){ c.checked=false; c.disabled=true; c.closest('label').querySelector('[data-why]').textContent=SNDWHY[j.why[k]]||''; } });
      if(!o.nopv){ var fr=document.createElement('iframe'); fr.title='معاينة البريد'; fr.setAttribute('sandbox','allow-same-origin allow-popups'); fr.srcdoc=j.html.replace('<head>','<head><base target="_blank"><style>body{margin:0!important}</style>');
        fr.onload=function(){ try{ fr.style.height=fr.contentDocument.documentElement.scrollHeight+'px'; }catch(_){} }; var box=Q('[data-pvmail]'); box.innerHTML=''; box.appendChild(fr);
        Q('[data-wtxt]').innerHTML=sndWa(j.wa); var ph=String(j.phone||'').replace(/\D/g,''); if(ph){ var a=Q('[data-wopen]'); a.href='https://wa.me/'+ph+'?text='+encodeURIComponent(j.wa); a.hidden=false; } }
      sync(); }).catch(function(){ Q('[data-to]').textContent='تعذّر تجهيز المعاينة، ويمكنك الإرسال كالمعتاد'; });
    function done(v){ removeEventListener('keydown',key,true); ov.classList.remove('on'); setTimeout(function(){ ov.remove(); },220); if(last&&last.focus) last.focus(); res(v); }
    function go(){ var c={}; ov.querySelectorAll('[data-ch]').forEach(function(x){ c[x.dataset.ch]=x.checked&&!x.disabled; });
      if(WHEN==='none') c={email:false,push:false,wa:false};
      var n={ch:c}; if(WHEN==='later'){ var t=at.value?new Date(at.value):null; if(!t||isNaN(t)||t<Date.now()+60000){ toast('اختر موعداً لاحقاً للإرسال',true); at.focus(); return; } n.at=t.toISOString(); }
      done(n); }
    function key(e){ if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); done(false); } }
    ov.addEventListener('change',sync);
    ov.addEventListener('click',function(e){ var t=e.target;
      if(t===ov||t.closest('[data-sno]')){ done(false); return; }
      if(t.closest('[data-sok]')){ go(); return; }
      var w=t.closest('[data-when]'); if(w){ WHEN=w.dataset.when; ov.querySelectorAll('[data-when]').forEach(function(x){ x.classList.toggle('on',x===w); x.setAttribute('aria-checked',x===w); });
        at.hidden=WHEN!=='later'; if(WHEN==='later'){ if(!at.value){ var d=new Date(Date.now()+864e5); d.setHours(10,0,0,0); at.value=new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,16); } at.focus(); } sync(); return; }
      var p=t.closest('[data-pv]'); if(p){ ov.querySelectorAll('[data-pv]').forEach(function(x){ x.classList.toggle('on',x===p); x.setAttribute('aria-selected',x===p); }); Q('[data-pvmail]').hidden=p.dataset.pv!=='mail'; Q('[data-pvwa]').hidden=p.dataset.pv!=='wa'; return; }
      if(t.closest('[data-wcopy]')&&PV&&PV.wa){ (navigator.clipboard?navigator.clipboard.writeText(PV.wa):Promise.reject()).then(function(){ toast('نُسخت الرسالة، وهي جاهزة للّصق في واتساب'); },function(){ toast('تعذّر النسخ',true); }); } });
    addEventListener('keydown',key,true); ok.focus(); sync(); }); }
  // what the action's own toast says once the choice is known
  function sndSay(n,okText){ if(!n||!okText) return okText; var c=n.ch||{};
    if(!(c.email||c.push||c.wa)) return 'تم، دون إشعار العميل خارج مساحة عمله';
    if(n.at) return 'تم، وتُرسل الرسالة '+new Date(n.at).toLocaleString('ar-u-nu-latn',{weekday:'long',day:'numeric',month:'long',hour:'numeric',minute:'2-digit'});
    return okText; }
  document.addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b||b._sndOk||b.disabled) return;
    for(var i=0;i<SND.length;i++){ if(!b.matches(SND[i][0])) continue; var o=SND[i][1](b); if(!o) return;
      e.preventDefault(); e.stopImmediatePropagation();
      sendSheet(o).then(function(n){ if(!n||!b.isConnected) return; NEXT_NOTIFY=n; b.dataset.armed='1'; b._sndOk=b._cfOk=true; b.click(); b._sndOk=b._cfOk=false; NEXT_NOTIFY=null; }); return; } },true);
