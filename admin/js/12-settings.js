/* Eyeblink admin · settings — loaded after the files before it; all of admin/js shares one scope */
  /* ---------------- settings ---------------- */
  function renderSettings(){ skyOp();
    var S=C.settings=C.settings||{}; var T=(P&&P.templates)||DEFAULT_TPL;
    var tog=function(k,l){ return '<label class="check"><input type="checkbox" data-p="settings.'+k+'" data-t="check"'+(S[k]!==false?' checked':'')+'> '+l+'</label>'; };
    $('#panel').innerHTML=
      '<section class="sec"><h3>ما يظهر على الموقع</h3>'+tog('showStats','خانة الأرقام في الرئيسية')+tog('showWorkTeaser','الأعمال في الرئيسية')+tog('showPackagesTeaser','الباقات في الرئيسية')+tog('showPayments','طرق الدفع (صفحة الباقات وأسفل الموقع)')+tog('ordersOpen','استقبال الطلبات من صفحة الباقات')+'</section>'+
      '<section class="sec"><h3>الخلفية الحيوية</h3><p class="hint">كرة النقاط المتحركة خلف صفحات الموقع. 100 = كما هي الآن، و0 = مخفية (تبقى السماء المتدرجة وحدها). على الموبايل تظهر أخف قليلاً من القيمة نفسها.</p>'+
        '<div class="field"><label for="bgOp">الشفافية: <b data-bgv>'+(S.bgOpacity==null?100:S.bgOpacity)+'%</b></label><input id="bgOp" type="range" min="0" max="100" step="5" data-p="settings.bgOpacity" data-t="num" value="'+(S.bgOpacity==null?100:S.bgOpacity)+'"></div></section>'+
      '<section class="sec"><h3>خلفية لوحة التحكم</h3><p class="hint">شرائط المعدن خلف اللوحة. 100 = كما هي الآن، و0 = مخفية (يبقى الضوء الهادئ وحده). يتغيّر أمامك مباشرة، ويُحفظ مع «نشر التعديلات».</p>'+
        '<div class="field"><label for="skyOp">الشفافية: <b data-skyv>'+(S.adminBgOpacity==null?100:S.adminBgOpacity)+'%</b></label><input id="skyOp" type="range" min="0" max="100" step="5" data-p="settings.adminBgOpacity" data-t="num" value="'+(S.adminBgOpacity==null?100:S.adminBgOpacity)+'"></div></section>'+
      '<section class="sec"><h3>التنبيهات</h3><p class="hint">يرسل رسالة تجريبية عبر تيليغرام ورسالة بريد تجريبية، ويعرض ردّ كل منهما. (بعد أي تغيير في متغيرات Cloudflare يلزم إجراء Retry deployment.)</p><div><button class="btn" type="button" id="notifyTest">أرسل تنبيهاً تجريبياً</button></div><pre id="notifyOut" class="small" hidden style="white-space:pre-wrap;margin-top:10px"></pre></section>'+
      '<section class="sec"><h3>الرسائل التلقائية</h3><p class="hint">انتقلت القواعد والملخص اليومي إلى «الإشعارات».</p><div><button class="btn sm" type="button" data-gorules>افتح القواعد</button></div></section>'+'<section class="sec"><h3>تسجيل العملاء عبر Google</h3><p class="hint">العملاء يسجّلون بالإيميل وكلمة السر دائماً. لإضافة زر «المتابعة عبر Google» الصق هنا الـ Client ID من Google Cloud (ينتهي بـ apps.googleusercontent.com) ثم انشر.</p>'+
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
      (LIVE?'<section class="sec" id="tfaSec"><h3>التحقق بخطوتين</h3><div class="tfa" id="tfaBox"><p class="hint">…</p></div></section>':'')+
      '<section class="sec"><h3>كلمة سر اللوحة</h3>'+(LIVE?'<p class="hint">10 أحرف على الأقل. ستُطلب منك عند الدخول القادم.</p><div class="field"><label>كلمة السر الحالية</label><input type="password" id="np0" autocomplete="current-password"></div><div class="row"><div class="field"><label>كلمة السر الجديدة</label><input type="password" id="np1" autocomplete="new-password"></div><div class="field"><label>أعد كتابتها</label><input type="password" id="np2" autocomplete="new-password"></div></div><div><button class="btn primary" type="button" id="pwChange">تغيير كلمة السر</button></div>'
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
      fetch(API+'/auth',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({current:$('#np0').value,newPassword:a})})
        .then(function(r){ if(r.status===403){ toast('كلمة السر الحالية غير صحيحة',true); return; } if(!r.ok) throw 0; $('#np0').value=$('#np1').value=$('#np2').value=''; toast('تغيّرت كلمة السر'); })
        .catch(function(){ toast('تعذّر التغيير',true); });
    };
    if($('#tfaBox')) loadTfa();
  }

  /* ---------------- two-step sign-in (settings → security) ---------------- */
  var TFS=null, TFX={};   // the status from the server, and what the section is in the middle of (setup, codes, a check)
  function tfaPost(body){ return fetch(API+'/auth',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify(body),cache:'no-store'})
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok||!j.ok){ var e=new Error(j.error||'fail'); e.status=r.status; throw e; } return j; }); }); }
  function loadTfa(){ fetch(API+'/auth?status=1',{cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ TFS=j; drawTfa(); })
    .catch(function(){ var b=$('#tfaBox'); if(b) b.innerHTML='<p class="hint">تعذّر تحميل الحالة.</p>'; }); }
  function tfaDate(s){ try{ return new Date(s).toLocaleDateString('ar-u-nu-latn',{day:'numeric',month:'long',year:'numeric'}); }catch(_){ return ''; } }
  function drawTfa(){
    var b=$('#tfaBox'); if(!b||!TFS) return; var S=TFS, h='';
    h+='<div class="row"><span class="pill '+(S.enabled?'ok':'cancelled')+'">'+(S.enabled?'مفعّل':'غير مفعّل')+'</span>'+(S.enabled&&S.since?'<span class="hint">منذ '+esc(tfaDate(S.since))+'</span>':'')+'</div>';
    if(TFX.codes){
      h+='<div class="tfa-blk"><h4>احفظ رموزك الاحتياطية</h4><p class="hint">يمكنك الدخول بأي رمز منها إن فقدت هاتفك. يُستخدم كل رمز مرة واحدة، ولن تظهر هذه القائمة مجدداً.</p>'+
        '<div class="tfa-codes">'+TFX.codes.map(function(c){ return '<span>'+esc(c)+'</span>'; }).join('')+'</div>'+
        '<div class="row"><button class="btn sm" type="button" data-tfa="copy">نسخ الرموز</button><button class="btn sm" type="button" data-tfa="file">تنزيل كملف نصي</button></div>'+
        '<p class="hint">احفظها خارج هذا الجهاز، في مدير كلمات السر أو على ورقة.</p><div><button class="btn primary" type="button" data-tfa="saved">حفظتُها</button></div></div>';
      b.innerHTML=h; return;
    }
    if(TFX.qr){
      h+='<div class="tfa-blk"><h4>ربط Google Authenticator</h4><ol class="hint" style="margin:0;padding-inline-start:18px"><li>افتح التطبيق على هاتفك واختر إضافة حساب.</li><li>امسح الرمز بالكاميرا، أو أدخل المفتاح يدوياً.</li><li>أدخل الرمز الظاهر في التطبيق للتأكيد.</li></ol>'+
        '<div class="tfa-qr"><canvas id="tfaQr" width="164" height="164" aria-label="رمز QR لربط التطبيق"></canvas><div class="tfa">'+
        '<div class="field"><label>المفتاح</label><div class="tfa-secret">'+esc(TFX.qr.secret.replace(/(.{4})/g,'$1 ').trim())+'</div></div>'+
        '<div class="field"><label for="tfaNew">الرمز من التطبيق</label><input id="tfaNew" inputmode="numeric" autocomplete="one-time-code" dir="ltr" maxlength="7" placeholder="123456"></div></div></div>'+
        '<div class="row"><button class="btn primary" type="button" data-tfa="totpOk">تأكيد وتفعيل</button><button class="btn" type="button" data-tfa="cancel">إلغاء</button></div></div>';
      b.innerHTML=h; tfaQr(TFX.qr.uri); return;
    }
    if(TFX.step){
      var pk=WA.ok&&S.passkeys.length;
      h+='<div class="tfa-blk"><h4>'+esc(TFX.step.label)+'</h4><p class="hint">للتأكيد: كلمة السر، ثم البصمة أو رمز من التطبيق أو رمز احتياطي.</p>'+
        '<div class="field"><label for="tfaPw">كلمة السر</label><input id="tfaPw" type="password" autocomplete="current-password"></div>'+
        '<div class="field"><label for="tfaStepCode">الرمز</label><input id="tfaStepCode" dir="ltr" autocomplete="one-time-code" maxlength="9" placeholder="123456"></div>'+
        '<div class="row"><button class="btn primary" type="button" data-tfa="stepCode">تأكيد بالرمز</button>'+(pk?'<button class="btn" type="button" data-tfa="stepKey">تأكيد بالبصمة</button>':'')+'<button class="btn" type="button" data-tfa="cancel">إلغاء</button></div></div>';
      b.innerHTML=h; return;
    }
    if(!S.enabled) h+='<p class="hint">بعد كلمة السر، تطلب اللوحة تأكيداً ثانياً: بصمتك أو Face ID من هاتفك، أو رمزاً من Google Authenticator. مع «تذكّرني» يكفي ذلك مرة واحدة كل 30 يوماً على كل جهاز.</p>';
    h+='<div class="tfa-blk"><h4>البصمة أو Face ID</h4>';
    if(S.passkeys.length) h+='<ul class="tfa-list">'+S.passkeys.map(function(p){ return '<li><span>'+esc(p.name)+' <span class="hint">· أُضيفت '+esc(tfaDate(p.at))+'</span></span><button class="linkbtn" type="button" data-tfa="rmKey" data-id="'+esc(p.id)+'" data-name="'+esc(p.name)+'">إزالة</button></li>'; }).join('')+'</ul>';
    h+=WA.ok?'<p class="hint">على الكمبيوتر يظهر رمز QR، امسحه بهاتفك وأكّد ببصمتك. وعلى الهاتف تؤكّد مباشرة.</p><div class="row"><input id="tfaKeyName" placeholder="اسم الجهاز (اختياري)، مثل: iPhone" maxlength="40" style="flex:1;min-width:180px"><button class="btn'+(S.passkeys.length?'':' primary')+'" type="button" data-tfa="addKey">'+(S.passkeys.length?'إضافة بصمة أخرى':'إضافة البصمة من هاتفي')+'</button></div>'
      :'<p class="hint">هذا المتصفح لا يدعم البصمة. استخدم متصفحاً حديثاً، أو اعتمد على Google Authenticator.</p>';
    h+='</div><div class="tfa-blk"><h4>Google Authenticator</h4>'+(S.totp
      ?'<ul class="tfa-list"><li><span>مربوط</span><button class="linkbtn" type="button" data-tfa="rmTotp">إزالة</button></li></ul>'
      :'<p class="hint">رمز من ستة أرقام يتغيّر كل 30 ثانية، ويعمل دون إنترنت. مفيد حين لا تتوفر البصمة.</p><div><button class="btn" type="button" data-tfa="totp">ربط Google Authenticator</button></div>')+'</div>';
    if(S.enabled) h+='<div class="tfa-blk"><ul class="tfa-list"><li><span>الرموز الاحتياطية: '+S.backupLeft+' من 10 متبقية</span><button class="btn sm" type="button" data-tfa="newCodes">إنشاء رموز احتياطية جديدة</button></li>'+
      '<li><span>الأجهزة المسجّل دخولها الآن: '+S.sessions+'</span><button class="btn sm" type="button" data-tfa="logoutAll">تسجيل الخروج من كل الأجهزة</button></li></ul></div>';
    b.innerHTML=h;
  }
  function tfaQr(uri){
    var draw=function(){ var c=$('#tfaQr'); if(!c||!window.qrcode) return; var q=qrcode(0,'M'); q.addData(uri); q.make();
      var n=q.getModuleCount(), x=c.getContext('2d'), s=Math.floor(148/n), o=Math.floor((164-s*n)/2); x.fillStyle='#fff'; x.fillRect(0,0,164,164); x.fillStyle='#04061A';
      for(var r=0;r<n;r++) for(var k=0;k<n;k++) if(q.isDark(r,k)) x.fillRect(o+k*s,o+r*s,s,s); };
    if(window.qrcode) return draw();
    var sc=document.createElement('script'); sc.src='/admin/vendor/qrcode.js?v=1.4.4'; sc.onload=draw; document.head.appendChild(sc);
  }
  var TFERR={code:'الرمز غير صحيح.',password:'كلمة السر غير صحيحة.',expired:'انتهت المهلة، ابدأ من جديد.',passkey:'تعذّر التحقق من البصمة.',exists:'هذه البصمة مضافة مسبقاً.'};
  function tfaFail(e){ toast(TFERR[e&&e.message]||'تعذّر ذلك، حاول مرة أخرى.',true); }
  function tfaDone(j,msg){ TFX={}; if(j&&j.codes) TFX.codes=j.codes; if(msg) toast(msg); loadTfa(); }
  function tfaStep(extra){ var d=TFX.step.body; d.password=$('#tfaPw').value;
    for(var k in extra) d[k]=extra[k];
    return tfaPost(d).then(function(j){ var m=TFX.step.done; if(d.action==='remove'&&!j.enabled) m='أُوقف التحقق بخطوتين'; tfaDone(j,m); }).catch(tfaFail); }
  document.addEventListener('click',function(e){
    var t=e.target.closest('[data-tfa]'); if(!t||!$('#tfaBox')||!$('#tfaBox').contains(t)) return; var a=t.dataset.tfa;
    if(a==='cancel'){ TFX={}; drawTfa(); }
    else if(a==='saved'){ TFX={}; drawTfa(); }
    else if(a==='copy'){ var txt=TFX.codes.join('\n'); (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(function(){ toast('نُسخت الرموز'); },function(){ toast('تعذّر النسخ، انسخها يدوياً',true); }); }
    else if(a==='file'){ var bl=new Blob(['Eyeblink Studio · رموز الدخول الاحتياطية\n\n'+TFX.codes.join('\n')+'\n'],{type:'text/plain'}), u=URL.createObjectURL(bl), l=document.createElement('a');
      l.href=u; l.download='eyeblink-backup-codes.txt'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(function(){ URL.revokeObjectURL(u); },1000); }
    else if(a==='totp'){ tfaPost({action:'totpStart'}).then(function(j){ TFX={qr:j}; drawTfa(); $('#tfaNew').focus(); }).catch(tfaFail); }
    else if(a==='totpOk'){ tfaPost({action:'totpConfirm',code:$('#tfaNew').value}).then(function(j){ tfaDone(j,'رُبط Google Authenticator'); }).catch(tfaFail); }
    else if(a==='addKey'){ var nm=($('#tfaKeyName')||{}).value||'';
      tfaPost({action:'passkeyStart'}).then(function(j){ return WA.create(j.options).then(function(c){ return tfaPost({action:'passkeyAdd',challenge:j.options.challenge,credential:c,name:nm}); }); })
        .then(function(j){ tfaDone(j,'أُضيفت البصمة'); }).catch(function(err){ if(err&&err.name==='NotAllowedError') toast('أُلغيت إضافة البصمة',true); else if(err&&err.message==='old') toast('هذا المتصفح قديم ولا يدعم البصمة',true); else tfaFail(err); }); }
    else if(a==='rmKey'){ TFX={step:{label:'إزالة البصمة: '+t.dataset.name,done:'أُزيلت البصمة',body:{action:'remove',what:t.dataset.id}}}; drawTfa(); $('#tfaPw').focus(); }
    else if(a==='rmTotp'){ TFX={step:{label:'إزالة Google Authenticator',done:'أُزيل Google Authenticator',body:{action:'remove',what:'totp'}}}; drawTfa(); $('#tfaPw').focus(); }
    else if(a==='newCodes'){ TFX={step:{label:'إنشاء رموز احتياطية جديدة',done:'أُنشئت رموز جديدة، والقديمة لم تعد تعمل',body:{action:'backupNew'}}}; drawTfa(); $('#tfaPw').focus(); }
    else if(a==='stepCode'){ tfaStep({code:$('#tfaStepCode').value}); }
    else if(a==='stepKey'){ tfaPost({action:'stepStart'}).then(function(j){ return WA.get(j.passkey).then(function(p){ return tfaStep({challenge:j.challenge,passkey:p}); }); })
      .catch(function(err){ if(err&&err.name==='NotAllowedError') toast('أُلغي التحقق بالبصمة',true); else tfaFail(err); }); }
    else if(a==='logoutAll'){ tfaPost({action:'logoutAll'}).then(function(){ location.reload(); }).catch(tfaFail); }
  });
  // the background slider shows its value as it moves
  // the panel's own background: its strength follows the setting, live while the slider moves
  function skyOp(v){ if(v==null) v=C&&C.settings&&C.settings.adminBgOpacity; v=v==null||v===''?100:Math.max(0,Math.min(100,+v)); document.documentElement.style.setProperty('--sky-op',v/100); }
  document.addEventListener('input',function(e){ if(e.target.id==='skyOp'){ var o=document.querySelector('[data-skyv]'); if(o) o.textContent=e.target.value+'%'; skyOp(e.target.value); } });
  document.addEventListener('input',function(e){ if(e.target.id==='bgOp'){ var o=document.querySelector('[data-bgv]'); if(o) o.textContent=e.target.value+'%'; } });
  document.addEventListener('input',function(e){
    var k=e.target.dataset.tpl; if(!k) return; P=P||{}; P.templates=P.templates||JSON.parse(JSON.stringify(DEFAULT_TPL));
    var q=k.split('.'); P.templates[q[0]][q[1]]=e.target.value; dirty(); savePrivDraft();
  });

  /* ---------------- backup ---------------- */
  var BK=null, BKALL=false;
  function bkAgo(iso){ var d=Math.floor((Date.now()-new Date(iso))/864e5); return d<1?'اليوم':d===1?'أمس':d===2?'قبل يومين':d<=10?'قبل '+d+' أيام':'قبل '+d+' يوماً'; }
  function bkDate(iso){ try{ return new Date(iso).toLocaleString('ar-u-nu-latn',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}); }catch(_){ return iso; } }
  function bkSize(n){ return n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB'; }
  // the snapshots and content versions; a snapshot is stored by itself when the last one is a week old
  function loadBackup(auto){ if(!LIVE) return; fetch(API+'/backup?list=1',{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ if(!j.ok) return; BK=j;
      var last=j.snaps[0]&&new Date(j.snaps[0].at); BK.stale=!last||(Date.now()-last)>14*864e5;
      if(auto&&j.r2&&(!last||(Date.now()-last)>7*864e5)) bkSnap(true); else if(TAB==='backup') renderBackup(); }).catch(function(){}); }
  function bkSnap(quiet){ return fetch(API+'/backup',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({snapshot:1})}).then(function(r){ return r.json(); })
    .then(function(j){ if(!j.ok) throw 0; if(!quiet) toast('حُفظت نسخة كاملة على التخزين'); loadBackup(); }).catch(function(){ if(!quiet) toast('تعذّر حفظ النسخة، حاول مرة أخرى',true); }); }
  function renderBackup(){
    if(LIVE&&!BK){ $('#panel').innerHTML='<section class="sec"><div class="empty">جارٍ التحميل…</div></section>'; loadBackup(); return; }
    var S=(BK&&BK.snaps)||[], V=(BK&&BK.versions)||[], last=S[0];
    var inc=['محتوى الموقع','الطلبات والفرص','العملاء ومساحات العمل','المهام والتسليمات','الفواتير والعروض والاتفاقيات','الفريق وأجوره','الإعدادات الخاصة'];
    $('#panel').innerHTML=
      '<section class="sec"><h3>النسخة الكاملة</h3>'+
        '<div class="bk-head"><div><b>'+(!LIVE?'يعمل هذا القسم على الموقع المنشور':last?'آخر نسخة كاملة: '+bkAgo(last.at):'لم تُحفظ نسخة كاملة بعد')+'</b>'+
          '<span class="small muted">'+(BK&&!BK.r2?'التخزين (R2) غير مفعّل، فالنسخ التلقائية متوقفة':'تُحفظ نسخة تلقائياً كل أسبوع على تخزيننا الخاص، ونحتفظ بآخر 8 نسخ')+'</span></div>'+
          '<div class="bk-act"><a class="btn primary" href="'+API+'/backup" download'+(LIVE?'':' aria-disabled="true"')+'>نزّل نسخة كاملة الآن</a>'+(BK&&BK.r2?'<button class="btn" type="button" id="bkSnap">احفظ نسخة على التخزين</button>':'')+'</div></div>'+
        '<p class="small muted bk-lbl">تشمل</p><div class="bk-chips">'+inc.map(function(x){ return '<span class="tag tf-info">'+x+'</span>'; }).join('')+'<span class="tag tf-off">دون كلمات السر والجلسات</span></div>'+
        '<p class="hint">ملفات الفيديو والصور لا تدخل في النسخة لكبر حجمها، وتُدرج أسماؤها فقط، والملفات نفسها محفوظة على التخزين. وتُستعاد بيانات العمل من النسخة عند الحاجة يدوياً، حمايةً من محوها بضغطة خاطئة.</p></section>'+
      (S.length?'<section class="sec"><h3>النسخ المحفوظة على التخزين</h3><div class="bk-list">'+S.map(function(s){ return '<div class="bk-row"><span><b>'+esc(bkDate(s.at))+'</b><small>'+bkSize(s.size)+'</small></span><a class="btn sm" href="'+API+'/backup?snap='+encodeURIComponent(s.key)+'" download>تنزيل</a></div>'; }).join('')+'</div></section>':'')+
      '<section class="sec"><h3>نسخ محتوى الموقع</h3><p class="hint">تُحفظ نسخة من المحتوى قبل كل نشر، وتبقى 30 يوماً. استعادة نسخة تعيد نصوص الموقع وأعماله وأسعاره كما كانت، وتُحفظ النسخة الحالية قبلها.</p>'+
        (V.length?'<div class="bk-list">'+V.slice(0,BKALL?30:6).map(function(v){ return '<div class="bk-row"><span><b>'+esc(bkDate(v.at))+'</b><small>'+esc(bkAgo(v.at))+'</small></span><button class="btn sm" type="button" data-bkrestore="'+esc(v.key)+'" data-bkat="'+esc(bkDate(v.at))+'">استعادة</button></div>'; }).join('')+'</div>'+
          (V.length>6?'<button class="btn sm bk-more" type="button" id="bkAll">'+(BKALL?'عرض أقل':'عرض كل النسخ ('+Math.min(V.length,30)+')')+'</button>':'')
          :'<div class="empty small">'+(LIVE?'لا توجد نسخ محتوى بعد.':'يعمل هذا القسم على الموقع المنشور.')+'</div>')+'</section>'+
      '<section class="sec"><h3>المحتوى وحده</h3><p class="hint">ملف content.json لنصوص الموقع فقط. الاستيراد يضع الملف في اللوحة ولا يُنشر حتى تضغط «نشر التعديلات».</p>'+
        '<div class="bk-act"><button class="btn" type="button" id="copyExport">نزّل content.json</button><label class="btn">استيراد ملف<input type="file" id="importFile" accept="application/json,.json" hidden></label><button class="btn danger" type="button" id="resetDraft">تجاهل المسودة</button></div></section>';
    var ba=$('#bkAll'); if(ba) ba.onclick=function(){ BKALL=!BKALL; renderBackup(); };
    var sb=$('#bkSnap'); if(sb) sb.onclick=function(){ sb.disabled=true; sb.textContent='جارٍ الحفظ…'; bkSnap(false); };
    [].forEach.call(document.querySelectorAll('[data-bkrestore]'),function(b){ b.onclick=function(){
      ask({tone:'warn',title:'استعادة نسخة المحتوى',text:'تعود نصوص الموقع وأعماله وأسعاره إلى هذه النسخة فوراً، وتُحفظ النسخة الحالية قبلها',rows:[['النسخة',b.dataset.bkat]],ok:'استعِدها'}).then(function(y){ if(!y) return;
        fetch(API+'/backup',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({restore:b.dataset.bkrestore})}).then(function(r){ return r.json(); }).then(function(j){ if(!j.ok) throw 0;
          return fetch(API+'/content',{cache:'no-store'}).then(function(r){ return r.json(); }).then(function(c){ C=c; SAVED=JSON.stringify(c); try{ localStorage.removeItem('eb-draft'); }catch(_){} dirty(); BK=null; toast('استُعيدت النسخة وظهرت على الموقع'); renderBackup(); }); })
          .catch(function(){ toast('تعذّرت الاستعادة، حاول مرة أخرى',true); }); }); }; });
    $('#copyExport').onclick=function(){ var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(C,null,1)],{type:'application/json'})); a.download='content.json'; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500); };
    $('#importFile').onchange=function(){ var f=this.files[0]; if(!f) return; f.text().then(function(txt){ var j=JSON.parse(txt); if(!j.services) throw 0; C=j; saveDraft(); dirty(); toast('استُورد الملف إلى اللوحة'); }).catch(function(){ toast('الملف غير صالح',true); }); };
    $('#resetDraft').onclick=function(){ try{ localStorage.removeItem('eb-draft'); localStorage.removeItem('eb-preview'); }catch(_){} C=JSON.parse(SAVED); dirty(); toast('عادت اللوحة للنسخة المنشورة'); };
  }
  document.addEventListener('click',function(e){ if(e.target.closest('[data-gorules]')){ NTAB='rules'; TAB='notify'; route(); render(); loadNotify(); scrollTo(0,0); } });
