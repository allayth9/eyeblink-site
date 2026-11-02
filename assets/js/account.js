/* Eyeblink — client accounts: sign in (Google or email + password), the account page with order tracking and the
   chat thread with the studio. Talks to /api/account and /api/thread. Exposes window.EBAcct for the order form. */
(function(){
  var root=document.documentElement, lang=root.lang==='en'?'en':'ar', AR=lang==='ar';
  var BASE=document.body.getAttribute('data-base')||'', API=BASE+'api/';
  var T={
    ar:{inH:'سجّل دخولك لمتابعة طلبك',inP:'حساب واحد تتابع منه حالة الطلب، وتتحدث معنا مباشرة حتى لحظة التسليم.',
        login:'دخول',register:'حساب جديد',name:'الاسم أو اسم الجهة',email:'البريد الإلكتروني',pw:'كلمة السر',pwHint:'8 أحرف على الأقل',
        doLogin:'دخول',doRegister:'إنشاء الحساب',or:'أو',wait:'لحظة…',close:'إغلاق',
        e:{exists:'هذا البريد مسجّل مسبقاً، سجّل الدخول بدلاً من ذلك.',wrong:'البريد أو كلمة السر غير صحيحة.',google:'هذا الحساب مسجّل عبر Google، استخدم زر Google.',
           email:'اكتب بريداً إلكترونياً صحيحاً.',password:'كلمة السر 8 أحرف على الأقل.',name:'اكتب اسمك.','too many attempts':'محاولات كثيرة، جرّب بعد قليل.',net:'تعذّر الاتصال، حاول مرة أخرى.'},
        hi:'أهلاً، ',logout:'خروج',newOrder:'طلب جديد',orders:'طلباتك',none:'لا توجد طلبات بعد.',noneP:'اختر خدمة من صفحة الأسعار وأرسل طلبك، وستتابعه من هنا.',seePricing:'تصفّح الخدمات',
        st:{'new':'استلمنا الطلب','confirmed':'تأكيد التفاصيل','awaiting-payment':'بانتظار الدفع','paid':'تم الدفع','in-progress':'قيد التنفيذ','review':'بانتظار مراجعتك','delivered':'تم التسليم','cancelled':'ملغى'},
        steps:['استلام الطلب','تأكيد التفاصيل','الدفع','التنفيذ','مراجعتك','التسليم'],
        sum:'ملخص الطلب',est:'التقدير',final:'السعر النهائي',adds:'الإضافات',deadline:'الموعد',details:'التفاصيل',
        chat:'المحادثة',write:'اكتب رسالتك…',send:'إرسال',you:'أنت',studio:'Eyeblink',
        hello:'استلمنا طلبك. سنراجع التفاصيل ونرد عليك هنا خلال 24 ساعة بالسعر النهائي وخطوات العمل.',
        closed:'أُغلقت المحادثة بعد التسليم. للتواصل استخدم الوسائل الخارجية.',cancelled:'أُلغي هذا الطلب.',
        ext:'تواصل خارجي',extP:'تفضّل محادثة أسرع؟ راسلنا وأرفق رقم طلبك.',ig:'إنستغرام',wa:'واتساب',mail:'إيميل',back:'كل الطلبات',paid:'مدفوع',unread:'رسائل جديدة'},
    en:{inH:'Sign in to follow your request',inP:'One account to track your order and talk to us directly until delivery.',
        login:'Sign in',register:'New account',name:'Your name or company',email:'Email',pw:'Password',pwHint:'At least 8 characters',
        doLogin:'Sign in',doRegister:'Create account',or:'or',wait:'One moment…',close:'Close',
        e:{exists:'This email already has an account. Sign in instead.',wrong:'Wrong email or password.',google:'This account uses Google. Use the Google button.',
           email:'Enter a valid email.',password:'Password needs at least 8 characters.',name:'Enter your name.','too many attempts':'Too many attempts. Try again shortly.',net:'Could not connect. Try again.'},
        hi:'Hi, ',logout:'Sign out',newOrder:'New request',orders:'Your requests',none:'No requests yet.',noneP:'Pick a service on the pricing page and send your request. You will follow it here.',seePricing:'Browse services',
        st:{'new':'Request received','confirmed':'Details confirmed','awaiting-payment':'Awaiting payment','paid':'Paid','in-progress':'In production','review':'Awaiting your review','delivered':'Delivered','cancelled':'Cancelled'},
        steps:['Received','Confirmed','Payment','Production','Your review','Delivered'],
        sum:'Summary',est:'Estimate',final:'Final price',adds:'Add-ons',deadline:'Target date',details:'Details',
        chat:'Conversation',write:'Write a message…',send:'Send',you:'You',studio:'Eyeblink',
        hello:'We received your request. We will review it and reply here within 24 hours with the final price and next steps.',
        closed:'This conversation closed after delivery. Use the links below to reach us.',cancelled:'This request was cancelled.',
        ext:'Reach us elsewhere',extP:'Prefer a faster chat? Message us and include your request number.',ig:'Instagram',wa:'WhatsApp',mail:'Email',back:'All requests',paid:'Paid',unread:'new messages'}
  }[lang];
  var STEP={'new':0,'confirmed':1,'awaiting-payment':2,'paid':3,'in-progress':3,'review':4,'delivered':5};
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]}); }
  function linkify(t){ return esc(t).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g,'<br>'); }
  function C(){ return window.EBC||{}; }
  function day(s){ try{ return new Date(s).toLocaleDateString(AR?'ar':'en',{day:'numeric',month:'short'}); }catch(_){ return ''; } }
  function time(s){ try{ return new Date(s).toLocaleString(AR?'ar':'en',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}); }catch(_){ return ''; } }

  /* server calls; "no server" (local preview) resolves to {ok:false,_none:true} */
  function api(path,body,method){
    var o={credentials:'same-origin',cache:'no-store',headers:{}};
    if(body){ o.method=method||'POST'; o.headers['content-type']='application/json'; o.body=JSON.stringify(body); }
    if(!/^https?:/.test(location.protocol)) return Promise.resolve({ok:false,_none:true});
    return fetch(API+path,o).then(function(r){ return r.text().then(function(t){ var j=null; try{ j=JSON.parse(t); }catch(_){}
      if(!j||typeof j.ok!=='boolean') return {ok:false,_none:true}; j._s=r.status; return j; }); }).catch(function(){ return {ok:false,_net:true}; });
  }
  var ME;   // undefined = not asked yet, null = signed out, false = no server, object = signed in
  function me(){ return api('account').then(function(j){ ME= j._none? false : j.ok? j : null; mark(); return ME; }); }
  function mark(){ [].forEach.call(document.querySelectorAll('.acct-link'),function(a){ a.classList.toggle('in',!!ME); if(ME) a.title=ME.user.name; }); if(window.EBWho) EBWho(); }

  /* ---------- sign-in box (used inline on the account page and in the order modal) ---------- */
  var gsi=null;
  function loadGoogle(){ if(gsi) return gsi; gsi=new Promise(function(res,rej){ var s=document.createElement('script'); s.src='https://accounts.google.com/gsi/client'; s.async=true; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); return gsi; }
  function authBox(host,done,compact){
    var gid=((C().settings||{}).googleClientId||'').trim(), mode='register';
    host.innerHTML='<div class="auth">'+(compact?'':'<span class="eyebrow">ACCOUNT</span>')+'<h2>'+T.inH+'</h2><p class="muted">'+T.inP+'</p>'+
      (gid?'<div class="gbtn" aria-live="polite"></div><div class="or"><span>'+T.or+'</span></div>':'')+
      '<div class="seg" role="tablist"><button type="button" data-m="register" aria-selected="true">'+T.register+'</button><button type="button" data-m="login" aria-selected="false">'+T.login+'</button></div>'+
      '<form class="form" novalidate><label class="nm">'+T.name+'<input name="name" autocomplete="name" required></label>'+
      '<label>'+T.email+'<input name="email" type="email" dir="ltr" autocomplete="email" required></label>'+
      '<label>'+T.pw+' <small class="muted">'+T.pwHint+'</small><input name="password" type="password" dir="ltr" autocomplete="new-password" minlength="8" required></label>'+
      '<button class="btn btn-primary" type="submit" style="justify-content:center">'+T.doRegister+'</button><p class="msg" role="alert"></p></form></div>';
    var f=host.querySelector('form'), msg=host.querySelector('.msg');
    function setMode(m){ mode=m; [].forEach.call(host.querySelectorAll('.seg button'),function(b){ b.setAttribute('aria-selected',b.dataset.m===m); });
      f.querySelector('.nm').hidden=m!=='register'; f.elements.name.required=m==='register'; f.elements.password.autocomplete=m==='register'?'new-password':'current-password';
      f.querySelector('button[type=submit]').textContent=m==='register'?T.doRegister:T.doLogin; msg.textContent=''; }
    host.querySelector('.seg').onclick=function(e){ var b=e.target.closest('button'); if(b) setMode(b.dataset.m); };
    function finish(j,btn,old){
      if(btn){ btn.disabled=false; btn.textContent=old; }
      if(j.ok){ me().then(function(){ done(ME); }); return; }
      if(j._none){ ME=false; done(false); return; }
      if(j.error==='exists') setMode('login');
      msg.textContent=T.e[j.error]||T.e[j._net?'net':'wrong'];
    }
    f.onsubmit=function(e){ e.preventDefault();
      var E=f.elements, d={action:mode,name:E.name.value.trim(),email:E.email.value.trim(),password:E.password.value};
      if(mode==='register'&&!d.name){ msg.textContent=T.e.name; return; }
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)){ msg.textContent=T.e.email; return; }
      if(d.password.length<8){ msg.textContent=T.e.password; return; }
      var btn=f.querySelector('button[type=submit]'), old=btn.textContent; btn.disabled=true; btn.textContent=T.wait;
      api('account',d).then(function(j){ finish(j,btn,old); });
    };
    if(gid){ loadGoogle().then(function(){
      var el=host.querySelector('.gbtn'); if(!el||!window.google) return;
      google.accounts.id.initialize({client_id:gid, callback:function(r){ msg.textContent=T.wait; api('account',{action:'google',credential:r.credential}).then(function(j){ finish(j); }); }});
      google.accounts.id.renderButton(el,{theme:'filled_black',size:'large',shape:'pill',text:'continue_with',locale:lang,width:Math.min(380,el.clientWidth||320)});
    }).catch(function(){ var el=host.querySelector('.gbtn'); if(el){ el.remove(); var o=host.querySelector('.or'); if(o) o.remove(); } }); }
  }
  function modal(done){
    var m=document.createElement('div'); m.className='acct-modal'; m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true');
    m.innerHTML='<div class="sheet glass"><button class="x" type="button" aria-label="'+T.close+'">×</button><div class="slot2"></div></div>';
    document.body.appendChild(m); document.body.style.overflow='hidden';
    requestAnimationFrame(function(){ m.classList.add('show'); });
    var ended=false, close=function(u){ if(ended) return; ended=true; m.classList.remove('show'); document.body.style.overflow=''; setTimeout(function(){ m.remove(); },420); done(u); };
    m.querySelector('.x').onclick=function(){ close(null); }; m.addEventListener('click',function(e){ if(e.target===m) close(null); });
    addEventListener('keydown',function k(e){ if(e.key==='Escape'){ removeEventListener('keydown',k); close(null); } });
    authBox(m.querySelector('.slot2'),function(u){ close(u); },true);
    setTimeout(function(){ var i=m.querySelector('input[name=name]'); if(i) i.focus(); },300);
  }
  /* the order form calls this: runs cb(user) when signed in, cb(false) when there is no server (local preview) */
  function require(cb){
    var go=function(){ if(ME||ME===false) cb(ME); else modal(cb); };
    if(ME===undefined) me().then(go); else go();
  }
  window.EBAcct={me:me, require:require, get user(){ return ME; }, T:T};

  /* ---------- account page ---------- */
  var box=document.getElementById('acct'), CUR=null, poll=0, LIST=[];
  function page(){
    if(!box) return;
    box.innerHTML='<div class="acct-load glass"><span></span></div>';
    me().then(function(m){
      if(m===false){ box.innerHTML='<div class="acct-card glass"><p class="muted">'+(AR?'الحساب يعمل على الموقع المنشور فقط.':'Accounts work on the published site only.')+'</p></div>'; return; }
      if(!m){ box.innerHTML='<div class="acct-card glass"></div>'; authBox(box.firstChild,function(){ page(); }); return; }
      dash();
    });
  }
  function dash(){
    var u=ME.user; LIST=ME.orders||[];
    box.innerHTML='<div class="acct-head glass rv"><div><span class="eyebrow">ACCOUNT</span><h1>'+esc(T.hi+u.name)+'</h1><p class="muted" dir="ltr" style="text-align:start">'+esc(u.email)+'</p></div>'+
      '<div class="actions"><a class="btn btn-primary" href="pricing.html">'+T.newOrder+'</a><button class="btn btn-glass glass" type="button" id="acctOut">'+T.logout+'</button></div></div>'+
      '<div class="acct-grid"><aside class="olist"><h3>'+T.orders+'</h3><div class="items"></div></aside><section class="odetail"></section></div>';
    document.getElementById('acctOut').onclick=function(){ api('account',{action:'logout'}).then(function(){ ME=null; mark(); page(); }); };
    var items=box.querySelector('.olist .items');
    if(!LIST.length){ items.innerHTML='<div class="empty"><b>'+T.none+'</b><p class="muted">'+T.noneP+'</p><a class="btn btn-glass glass" href="pricing.html"><span class="dot"></span>'+T.seePricing+'</a></div>';
      box.querySelector('.odetail').hidden=true; box.querySelector('.acct-grid').classList.add('solo'); return; }
    items.innerHTML=LIST.map(function(o){ return '<button type="button" class="oitem" data-code="'+esc(o.code)+'"><span class="c">'+esc(o.code)+'</span><b>'+esc(o.packageName||'')+'</b>'+
      '<span class="pill '+esc(o.status)+'">'+esc(T.st[o.status]||o.status)+'</span>'+(o.unread?'<i class="dot" title="'+T.unread+'">'+o.unread+'</i>':'')+'<small class="muted">'+esc(day(o.createdAt))+'</small></button>'; }).join('');
    items.onclick=function(e){ var b=e.target.closest('.oitem'); if(b){ history.replaceState(null,'','#'+b.dataset.code); open(b.dataset.code,true); } };
    var want=(location.hash||'').slice(1).toUpperCase();
    open(LIST.some(function(o){return o.code===want})? want : LIST[0].code, !!want && innerWidth<860);
  }
  function open(code,scroll){
    CUR=code; [].forEach.call(box.querySelectorAll('.oitem'),function(b){ b.setAttribute('aria-current',b.dataset.code===code); });
    var host=box.querySelector('.odetail'); host.innerHTML='<div class="acct-load glass"><span></span></div>';
    api('thread?code='+encodeURIComponent(code)).then(function(j){ if(CUR!==code) return; if(!j.ok){ host.innerHTML=''; return; } detail(j.order,true);
      if(scroll) host.scrollIntoView({behavior:'smooth',block:'start'});
      var it=box.querySelector('.oitem[data-code="'+code+'"] .dot'); if(it) it.remove(); });
    clearInterval(poll); poll=setInterval(refresh,15000);
  }
  function refresh(){ if(!CUR||document.hidden) return; var code=CUR;
    api('thread?code='+encodeURIComponent(code)).then(function(j){ if(j.ok&&CUR===code) detail(j.order,false); }); }
  function detail(o,full){
    var host=box.querySelector('.odetail'), closed=o.status==='delivered'||o.status==='cancelled';
    var msgs=[{from:'studio',text:T.hello,at:o.createdAt}].concat(o.messages||[]);
    var chat=msgs.map(function(m){ return '<div class="msg '+(m.from==='client'?'me':'them')+'"><div class="b">'+linkify(m.text)+'</div><small>'+(m.from==='client'?T.you:T.studio)+' · '+esc(time(m.at))+'</small></div>'; }).join('');
    if(!full && host.querySelector('.thread')){   // just new messages / status: keep what the client is typing
      var th=host.querySelector('.thread'), atEnd=th.scrollHeight-th.scrollTop-th.clientHeight<40;
      th.innerHTML=chat; if(atEnd) th.scrollTop=th.scrollHeight;
      host.querySelector('.track').outerHTML=track(o); host.querySelector('.od-head .pill').outerHTML=pill(o); return;
    }
    var S=C().settings||{}, ig=(C().site||{}).instagram||'eyeblnk', note=encodeURIComponent((AR?'طلب ':'Request ')+o.code);
    var wa=String(S.whatsapp||'').replace(/[^0-9]/g,''), mail=S.email||'';
    host.innerHTML='<div class="od glass">'+
      '<div class="od-head"><div><span class="c">'+esc(o.code)+'</span><h2>'+esc(o.packageName||'')+'</h2></div>'+pill(o)+'</div>'+
      track(o)+
      '<div class="od-body"><div class="chat"><h3>'+T.chat+'</h3><div class="thread" aria-live="polite">'+chat+'</div>'+
        (closed? '<p class="closed">'+(o.status==='cancelled'?T.cancelled:T.closed)+'</p>'
               : '<form class="send"><textarea name="t" rows="1" placeholder="'+T.write+'" dir="auto" required></textarea><button class="btn btn-primary" type="submit">'+T.send+'</button></form>')+
      '</div><aside class="side"><h3>'+T.sum+'</h3><dl>'+
        (o.price?'<dt>'+T.final+'</dt><dd dir="ltr">'+esc(o.price)+(o.paid?' <span class="pill paid">'+T.paid+'</span>':'')+'</dd>':(o.total?'<dt>'+T.est+'</dt><dd dir="ltr">'+esc(o.total)+'</dd>':''))+
        (o.addons&&o.addons.length?'<dt>'+T.adds+'</dt><dd>'+esc(o.addons.join('، '))+'</dd>':'')+
        (o.deadline?'<dt>'+T.deadline+'</dt><dd>'+esc(o.deadline)+'</dd>':'')+
        '<dt>'+T.details+'</dt><dd class="pre">'+linkify(o.details||'')+(o.link?'<br><a href="'+esc(o.link)+'" target="_blank" rel="noopener" dir="ltr">'+esc(o.link)+'</a>':'')+'</dd></dl>'+
        '<div class="ext"><h3>'+T.ext+'</h3><p class="muted">'+T.extP+'</p><div class="actions">'+
          '<a class="btn btn-glass glass" href="https://ig.me/m/'+esc(ig)+'" target="_blank" rel="noopener">'+T.ig+'</a>'+
          (wa?'<a class="btn btn-glass glass" href="https://wa.me/'+wa+'?text='+note+'" target="_blank" rel="noopener">'+T.wa+'</a>':'')+
          (mail?'<a class="btn btn-glass glass" href="mailto:'+esc(mail)+'?subject='+note+'">'+T.mail+'</a>':'')+
        '</div></div></aside></div></div>';
    var th=host.querySelector('.thread'); th.scrollTop=th.scrollHeight;
    var f=host.querySelector('form.send'); if(!f) return;
    var ta=f.t; ta.addEventListener('input',function(){ ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,160)+'px'; });
    ta.addEventListener('keydown',function(e){ if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&innerWidth>860){ e.preventDefault(); f.requestSubmit(); } });
    f.onsubmit=function(e){ e.preventDefault(); var t=ta.value.trim(); if(!t) return; var b=f.querySelector('button'); b.disabled=true;
      api('thread',{code:o.code,text:t}).then(function(j){ b.disabled=false; if(j.ok){ ta.value=''; ta.style.height=''; detail(j.order,false); th.scrollTop=th.scrollHeight; } else if(j.error==='closed') open(o.code); }); };
  }
  function pill(o){ return '<span class="pill '+esc(o.status)+'">'+esc(T.st[o.status]||o.status)+'</span>'; }
  function track(o){
    if(o.status==='cancelled') return '<div class="track off"><p>'+T.cancelled+'</p></div>';
    var at=STEP[o.status]||0, when={};
    (o.history||[]).forEach(function(h){ var i=STEP[h.status]; if(i!=null&&!when[i]) when[i]=h.at; });
    return '<ol class="track" style="--p:'+(at/5)+'">'+T.steps.map(function(s,i){ return '<li class="'+(i<at?'done':i===at?'now':'')+'"><i></i><b>'+s+'</b><small>'+(when[i]&&i<=at?esc(day(when[i])):'')+'</small></li>'; }).join('')+'</ol>';
  }
  addEventListener('hashchange',function(){ var c=(location.hash||'').slice(1).toUpperCase(); if(box&&ME&&c&&c!==CUR&&LIST.some(function(o){return o.code===c})) open(c,true); });
  if(box) page(); else if(document.querySelector('.acct-link')) me();
})();
