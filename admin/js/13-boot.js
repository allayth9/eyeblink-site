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
        ROUTING=true; render(); dirty(); loadOrders(); loadUsers(); loadWork(); loadNotify(); loadBilling(); loadTeam(); loadFx(); loadSupport(); if(rt.tab==='clients'&&rt.sub) loadProfile(rt.sub);
        ROUTING=false; route(true); if(rt.unknown) toast('هالصفحة مش موجودة، رجّعناك لليوم',true); });
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
        if(r.status===500){ msg.textContent='لم تُضبط كلمة السر على Cloudflare بعد (ADMIN_PASSWORD).'; return; }
        msg.textContent='كلمة السر غير صحيحة.';
      });
    }).catch(function(){ LIVE=false; loadContent(); });
  });
  try{ sessionStorage.removeItem('eb-pw'); }catch(_){}   // older panels kept the password here
  if(onHttp){ fetch(API+'/auth',{cache:'no-store'}).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(r.status===200&&j.ok&&j.session){ PW=''; LIVE=true; loadContent(); } }); }).catch(function(){}); }
  $('#logoutBtn').addEventListener('click',function(){ fetch(API+'/auth',{method:'DELETE'}).catch(function(){}).then(function(){ location.reload(); }); });
