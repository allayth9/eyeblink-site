/* Eyeblink admin · boot — loaded after the files before it; all of admin/js shares one scope */
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
        var rt=readRoute(); TAB=rt.tab; if(rt.tab==='tasks'){ var ts=!!rt.sub&&/^T-/.test(rt.sub); WOPEN=ts?rt.sub:null; WSUB=ts||!rt.sub?'tasks':rt.sub; } if(rt.tab==='orders') OPENCODE=rt.sub; if(rt.tab==='billing') BOPEN=rt.sub; if(rt.tab==='support'&&rt.sub){ SOPEN=rt.sub; SPICK=true; } if(rt.tab==='team') teamRoute(rt.sub);
        ROUTING=true; skyOp(); render(); dirty(); loadOrders(); loadUsers(); loadWork(); loadNotify(); loadBilling(); loadTeam(); loadFx(); loadSupport(); loadBackup(true); if(rt.tab==='clients'&&rt.sub) loadProfile(rt.sub);
        ROUTING=false; route(true); if(rt.unknown) toast('هذه الصفحة غير موجودة، فأعدناك إلى «اليوم»',true); });
    }).catch(function(){ $('#loginMsg').textContent='تعذّر تحميل محتوى الموقع. افتح اللوحة من نفس مجلد الموقع.'; });
  }
  $('#loginForm').addEventListener('submit',function(e){
    e.preventDefault(); var pw=$('#pw').value; var msg=$('#loginMsg'); msg.textContent='…';
    if(!onHttp){ LIVE=false; loadContent(); return; }
    fetch(API+'/auth'+(($('#remember')||{}).checked?'?remember=1':''),{headers:{'authorization':'Bearer '+pw},cache:'no-store'}).then(function(r){
      // only trust replies that come from our own function (JSON with an "ok" field); anything else = no server here
      return r.text().then(function(t){ var j=null; try{ j=JSON.parse(t); }catch(_){}
        if(!j || typeof j.ok!=='boolean'){ LIVE=false; return loadContent(); }
        if(r.status===200 && j.ok){ $('#pw').value=''; LIVE=true; return loadContent(); }
        if(r.status===200 && j.need2fa){ $('#pw').value=''; msg.textContent=''; return showTfa(j); }
        if(r.status===500){ msg.textContent='لم تُضبط كلمة السر على Cloudflare بعد (ADMIN_PASSWORD).'; return; }
        msg.textContent='كلمة السر غير صحيحة.';
      });
    }).catch(function(){ LIVE=false; loadContent(); });
  });
  // sign-in, step two: a passkey, a code from the app, or a backup code (the ticket from step one lasts five minutes)
  var TFA=null;
  function showTfa(j){
    TFA={ticket:j.ticket,passkey:j.passkey,totp:j.totp,backup:false};
    $('#loginForm').hidden=true; $('#tfaForm').hidden=false; $('#tfaMsg').textContent='';
    $('#tfaRemember').hidden=!($('#remember')||{}).checked;
    tfaMode();
    if(!TFA.passkey||!WA.ok) $('#tfaCode').focus();
  }
  function tfaMode(){
    var pk=!!(TFA.passkey&&WA.ok)&&!TFA.backup, code=TFA.totp||TFA.backup||!pk;
    $('#tfaKey').hidden=!pk; $('#tfaLead').hidden=!pk;
    $('#tfaLabel').textContent=TFA.backup?'رمز احتياطي':(pk?'أو أدخل الرمز من Google Authenticator':'أدخل الرمز من Google Authenticator');
    $('#tfaLabel').hidden=$('#tfaCode').hidden=$('#tfaGo').hidden=!code;
    $('#tfaCode').placeholder=TFA.backup?'XXXX-XXXX':'123456'; $('#tfaCode').inputMode=TFA.backup?'text':'numeric';
    $('#tfaGo').className='btn'+(pk?'':' primary');
    $('#tfaBackup').textContent=TFA.backup?'استخدم البصمة أو التطبيق':'استخدم رمزاً احتياطياً';
  }
  function tfaSend(body){
    var msg=$('#tfaMsg'); msg.textContent='…'; body.action='verify'; body.ticket=TFA.ticket;
    return fetch(API+'/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'})
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){
        if(r.ok&&j.ok){ $('#tfaForm').hidden=true; LIVE=true; return loadContent(); }
        if(j.error==='expired'){ tfaReset('انتهت مهلة التحقق. أدخل كلمة السر مرة أخرى.'); return; }
        msg.textContent=body.passkey?'تعذّر التحقق بالبصمة، حاول مرة أخرى.':'الرمز غير صحيح.'; $('#tfaCode').select();
      }); }).catch(function(){ msg.textContent='تعذّر الاتصال، حاول مرة أخرى.'; });
  }
  function tfaReset(note){ TFA=null; $('#tfaForm').hidden=true; $('#tfaCode').value=''; $('#loginForm').hidden=false; $('#loginMsg').textContent=note||''; $('#pw').focus(); }
  $('#tfaForm').addEventListener('submit',function(e){ e.preventDefault(); var c=$('#tfaCode').value.trim(); if(!c) return; tfaSend({code:c}); });
  $('#tfaKey').addEventListener('click',function(){ $('#tfaMsg').textContent='…';
    WA.get(TFA.passkey).then(function(a){ return tfaSend({passkey:a}); }).catch(function(){ $('#tfaMsg').textContent='أُلغي التحقق بالبصمة. يمكنك المحاولة مجدداً أو إدخال الرمز.'; }); });
  $('#tfaBackup').addEventListener('click',function(){ TFA.backup=!TFA.backup; $('#tfaCode').value=''; $('#tfaMsg').textContent=''; tfaMode(); if(!$('#tfaCode').hidden) $('#tfaCode').focus(); });
  $('#tfaBack').addEventListener('click',function(){ tfaReset(); });
  try{ sessionStorage.removeItem('eb-pw'); }catch(_){}   // older panels kept the password here
  if(onHttp){ fetch(API+'/auth',{cache:'no-store'}).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(r.status===200&&j.ok&&j.session){ PW=''; LIVE=true; loadContent(); } }); }).catch(function(){}); }
  $('#logoutBtn').addEventListener('click',function(){ fetch(API+'/auth',{method:'DELETE'}).catch(function(){}).then(function(){ location.reload(); }); });
