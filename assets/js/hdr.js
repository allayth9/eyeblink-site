/* Eyeblink — the header for signed-in people, on every page:
   · the account icon opens a menu (account, workspace, invoices, notification settings, sign out)
   · Active Clients also get the «Workspace» link in the top bar and the dock, and the notifications bell
   The server decides who is a client; this only draws what it is told (cached for two minutes per tab). */
(function(){
  var root=document.documentElement, AR=root.lang!=='en', body=document.body;
  var BASE=body.getAttribute('data-base')||'', API=BASE+'api/', PAGE=body.getAttribute('data-page'), WS=BASE+'workspace';
  var bar=document.querySelector('.nav .bar'), acct=bar&&bar.querySelector('.acct-link');
  if(!bar||!acct||!/^https?:/.test(location.protocol)) return;
  var T=AR?{ws:'مساحة العمل',acct:'حسابي وطلباتي',inv:'الفواتير',set:'إعدادات الإشعارات',tasks:'كل المهام',newTask:'مهمة جديدة',out:'تسجيل الخروج',client:'عميل متعاقد',customer:'حساب عميل',
      nt:'الإشعارات',all:'تعليم الكل كمقروء',none:'لا توجد إشعارات بعد.',seeAll:'كل الإشعارات',err:'تعذّر التحميل.'}
    :{ws:'Workspace',acct:'My account & requests',inv:'Invoices',set:'Notification settings',tasks:'All tasks',newTask:'New task',out:'Sign out',client:'Active client',customer:'Client account',
      nt:'Notifications',all:'Mark all as read',none:'No notifications yet.',seeAll:'All notifications',err:'Could not load.'};
  var ICON={ws:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="7" height="7" rx="2"/><rect x="13.5" y="4" width="7" height="7" rx="2"/><rect x="3.5" y="14" width="7" height="6" rx="2"/><rect x="13.5" y="14" width="7" height="6" rx="2"/></svg>',
    bell:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>',
    user:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 19.5c1.3-3.4 4-5 7.2-5s5.9 1.6 7.2 5"/></svg>',
    inv:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9l3 3v14l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2z"/><path d="M9 9h6M9 12.5h6M9 16h3.5"/></svg>',
    set:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
    tasks:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="m3.8 6.5 1.3 1.3 2.2-2.6M3.8 12l1.3 1.3 2.2-2.6M3.8 17.5l1.3 1.3 2.2-2.6"/></svg>',
    plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    out:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4.5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7"/><path d="M11 12h9M17 8.5 20.5 12 17 15.5"/></svg>'};
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]}); }
  function get(p){ return fetch(API+p,{credentials:'same-origin',cache:'no-store'}).then(function(r){ return r.json(); }).catch(function(){ return null; }); }
  function post(p,b){ return fetch(API+p,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(function(r){ return r.json(); }).catch(function(){ return {ok:false}; }); }
  var KEY='eb-who', S=null;
  var links=document.getElementById('links'), dock=document.querySelector('.dock'), bell=null, panel=null, menu=null;
  function save(){ try{ sessionStorage.setItem(KEY,JSON.stringify({u:S.u,unread:S.unread,at:Date.now()})); }catch(_){} }
  function refresh(){
    return get('account?lite=1').then(function(j){
      if(!j||!j.ok){ S={u:null,unread:0}; save(); apply(); return; }
      S={u:j.user,unread:(S&&S.u&&S.u.email===j.user.email)?S.unread:0};
      if(j.user.role!=='client'){ S.unread=0; save(); apply(); return; }
      return get('work?view=unread').then(function(w){ if(w&&w.ok) S.unread=w.unread; save(); apply(); });
    });
  }
  try{ var c=JSON.parse(sessionStorage.getItem(KEY)||'null'); if(c&&Date.now()-c.at<120000){ S=c; apply(); } }catch(_){}   // cached: draw at once, then confirm
  refresh();
  setInterval(function(){ if(!document.hidden&&S&&S.u&&S.u.role==='client') get('work?view=unread').then(function(w){ if(w&&w.ok){ S.unread=w.unread; save(); badge(); } }); },90000);

  /* ---- draw ---- */
  // workspace page on phones: the site pages and the language live in the ☰ menu (the bottom of the screen belongs to the workspace)
  if(PAGE==='workspace'&&links&&!links.querySelector('.lang-li')){ var lg=bar.querySelector('.lang'); if(lg){ var ll=document.createElement('li'); ll.className='lang-li'; ll.innerHTML='<a href="'+lg.getAttribute('href')+'" hreflang="'+(AR?'en':'ar')+'">'+(AR?'English':'العربية')+'</a>'; links.appendChild(ll); }
    var hm=document.createElement('li'); hm.className='lang-li home-li'; hm.innerHTML='<a href="'+BASE+'index.html">'+(AR?'الرئيسية':'Home')+'</a>'; links.insertBefore(hm,links.firstChild); }
  function apply(){
    var u=S&&S.u, cl=u&&u.role==='client';
    acct.classList.toggle('in',!!u); bar.classList.toggle('is-client',!!cl); try{ window.dispatchEvent(new CustomEvent('eb:who',{detail:u||null})); }catch(_){} if(u){ acct.title=u.name; acct.setAttribute('aria-haspopup','menu'); acct.setAttribute('aria-expanded','false'); } else { acct.removeAttribute('aria-haspopup'); acct.removeAttribute('aria-expanded'); }
    // the workspace link: top bar (first item) + mobile dock
    var li=links&&links.querySelector('.ws-li');
    if(cl&&links&&!li){ li=document.createElement('li'); li.className='ws-li'; li.innerHTML='<a class="ws-link" href="'+WS+'"'+(PAGE==='workspace'?' aria-current="page"':'')+'><i aria-hidden="true"></i><span>'+T.ws+'</span></a>'; links.insertBefore(li,links.firstChild); }
    if(!cl&&li) li.remove();
    // phones: the workspace is a floating button above the bottom bar (not a bottom-bar item); hidden on the workspace page itself
    var fab=document.querySelector('.ws-fab');
    if(cl&&PAGE!=='workspace'&&!fab){ fab=document.createElement('a'); fab.className='ws-fab'; fab.href=WS; fab.innerHTML=ICON.ws+'<span>'+T.ws+'</span><b class="wsf-n" hidden></b>'; body.appendChild(fab); body.classList.add('has-wsfab'); }
    if(!cl&&fab){ fab.remove(); body.classList.remove('has-wsfab'); }
    // the bell
    if(cl&&!bell){ bell=document.createElement('button'); bell.type='button'; bell.className='hbell'; bell.setAttribute('aria-label',T.nt); bell.setAttribute('aria-expanded','false'); bell.innerHTML=ICON.bell+'<span class="hbadge" hidden></span>'; acct.parentNode.insertBefore(bell,acct); bell.addEventListener('click',togglePanel); }
    if(!cl&&bell){ bell.remove(); bell=null; }
    badge();
  }
  function badge(){ if(!bell) return; var n=S.unread||0, b=bell.querySelector('.hbadge'), fb=document.querySelector('.ws-fab .wsf-n'); if(fb){ fb.hidden=!n; fb.textContent=n>9?'9+':n; } b.hidden=!n; b.textContent=n>9?'9+':n; bell.classList.toggle('has',!!n);
    bell.setAttribute('aria-label',T.nt+(n?' ('+n+')':'')); try{ window.dispatchEvent(new CustomEvent('eb:unread',{detail:n})); }catch(_){} }

  /* ---- account menu ---- */
  acct.addEventListener('click',function(e){ if(!S||!S.u) return; e.preventDefault(); if(menu) return closeAll(); closeAll(); openMenu(); });
  function item(href,icon,label,cls){ return '<a role="menuitem" class="'+(cls||'')+'" href="'+href+'">'+ICON[icon]+'<span>'+esc(label)+'</span></a>'; }
  function openMenu(){
    var u=S.u, cl=u.role==='client';
    menu=document.createElement('div'); menu.className='hmenu'; menu.setAttribute('role','menu');
    menu.innerHTML='<div class="hm-h"><b>'+esc(u.name)+'</b><small dir="ltr">'+esc(u.email)+'</small><span class="hm-role'+(cl?' on':'')+'">'+(cl?T.client:T.customer)+'</span></div>'+
      (cl?item(WS,'ws',T.ws,'c-ws')+item(WS+'#w/new','plus',T.newTask,'c-new')+item(WS+'#w/tasks','tasks',T.tasks,'c-tasks')+item(WS+'#w/invoices','inv',T.inv,'c-inv')+item(WS+'#w/settings','set',T.set,'c-set')+'<i class="hm-sep"></i>':'')+
      item(BASE+'account','user',T.acct,'c-acct')+'<button type="button" role="menuitem" class="hm-out">'+ICON.out+'<span>'+T.out+'</span></button>';
    bar.appendChild(menu); acct.setAttribute('aria-expanded','true'); requestAnimationFrame(function(){ menu.classList.add('show'); });
    menu.querySelector('.hm-out').onclick=function(){ post('account',{action:'logout'}).then(function(){ try{ sessionStorage.removeItem(KEY); }catch(_){} location.href=(BASE||'./'); }); };
    menu.addEventListener('click',function(e){ var a=e.target.closest('a'); if(a) sameHash(e,a); });
    var f=menu.querySelector('a,button'); if(f) f.focus({preventScroll:true});
  }
  // a link to the workspace while on it only changes the hash
  function sameHash(e,a){ var h=a.getAttribute('href'); if(PAGE==='workspace'&&h.indexOf(WS)===0){ e.preventDefault(); var x=h.slice(WS.length)||'#w'; if(location.hash!==x) location.hash=x; else window.dispatchEvent(new HashChangeEvent('hashchange')); closeAll(); } else closeAll(); }

  /* ---- notifications panel ---- */
  var NT=AR?{accept:'قُبلت مهمة «%t»',info:'يحتاج الاستوديو إلى معلومات لمهمة «%t»',reject:'بخصوص مهمة «%t»',progress:'بدأ تنفيذ «%t»',status:'تحديث على «%t»',date:'موعد جديد لـ«%t»',dateNo:'بقي موعد «%t» كما هو',completed:'اكتملت مهمة «%t»',
      deliver:'نسخة جديدة من «%t» جاهزة للمراجعة',comment:'تعليق جديد من الاستوديو على «%t»',project:'مشروع جديد: «%n»',file:'ملف جديد في «%n»',invoice:'فاتورة جديدة %no',invoicePaid:'وصلت دفعتك للفاتورة %no',invoiceDue:'الفاتورة %no متأخرة',recurring:'مهمة دورية جديدة «%t»',added:'أضاف الاستوديو مهمة «%t»',report:'التقرير الشهري لـ«%n» جاهز'}
    :{accept:'“%t” was accepted',info:'The studio needs information for “%t”',reject:'About “%t”',progress:'Work started on “%t”',status:'Update on “%t”',date:'New date for “%t”',dateNo:'The date of “%t” stays',completed:'“%t” is complete',
      deliver:'A new version of “%t” is ready',comment:'New studio comment on “%t”',project:'New project: “%n”',file:'New file in “%n”',invoice:'New invoice %no',invoicePaid:'Payment received for %no',invoiceDue:'Invoice %no is overdue',recurring:'New recurring task “%t”',added:'The studio added “%t”',report:'Monthly report for “%n” is ready'};
  function ntext(n){ var d=n.data||{}, t=NT[n.kind]||n.kind; return t.replace('%t',d.title||'').replace('%n',d.name||d.title||'').replace('%no',d.no||''); }
  function ago(s){ try{ var m=(Date.now()-new Date(s))/6e4; if(m<1) return AR?'الآن':'now'; if(m<60) return AR?'قبل '+Math.round(m)+' د':Math.round(m)+'m'; if(m<1440) return AR?'قبل '+Math.round(m/60)+' س':Math.round(m/60)+'h';
    return new Date(s).toLocaleDateString(AR?'ar-u-nu-latn':'en-GB',{day:'numeric',month:'short'}); }catch(_){ return ''; } }
  function togglePanel(e){ e.stopPropagation(); if(panel) return closeAll(); closeAll(); openPanel(); }
  function openPanel(){
    panel=document.createElement('div'); panel.className='hpanel'; panel.setAttribute('role','dialog'); panel.setAttribute('aria-label',T.nt);
    panel.innerHTML='<div class="hp-h"><b>'+T.nt+'</b><button type="button" class="hp-all">'+T.all+'</button></div><div class="hp-l"><div class="hp-load"><i></i><i></i><i></i></div></div><a class="hp-f" href="'+WS+'#w/notifications">'+T.seeAll+'</a>';
    bar.appendChild(panel); bell.setAttribute('aria-expanded','true'); requestAnimationFrame(function(){ panel.classList.add('show'); });
    var list=panel.querySelector('.hp-l');
    get('work?view=notifications').then(function(j){ if(!panel) return; if(!j||!j.ok){ list.innerHTML='<p class="hp-e">'+T.err+'</p>'; return; } S.unread=j.unread; save(); badge();
      list.innerHTML=j.items.length?j.items.slice(0,12).map(function(n){ return '<a class="hp-i c-'+esc(n.cat)+(n.read_at?'':' new')+'" href="'+WS+esc(n.link||'#w')+'" data-id="'+n.id+'"><i></i><span><b>'+esc(ntext(n))+'</b>'+(n.data&&n.data.note?'<em>'+esc(n.data.note)+'</em>':'')+'<small>'+esc(ago(n.created_at))+'</small></span></a>'; }).join(''):'<p class="hp-e">'+T.none+'</p>'; });
    list.addEventListener('click',function(e){ var a=e.target.closest('a[data-id]'); if(!a) return; if(a.classList.contains('new')){ post('work',{action:'read',ids:[+a.dataset.id]}); S.unread=Math.max(0,(S.unread||0)-1); save(); badge(); } sameHash(e,a); });
    panel.querySelector('.hp-all').onclick=function(){ post('work',{action:'read',all:true}).then(function(r){ if(r&&r.ok){ S.unread=0; save(); badge(); [].forEach.call(panel.querySelectorAll('.hp-i.new'),function(x){ x.classList.remove('new'); }); if(window.EBPortal&&EBPortal.notified) EBPortal.notified(); } }); };
    panel.querySelector('.hp-f').addEventListener('click',function(e){ sameHash(e,this); });
  }
  function closeAll(){
    if(menu){ var m=menu; menu=null; m.classList.remove('show'); acct.setAttribute('aria-expanded','false'); setTimeout(function(){ m.remove(); },180); }
    if(panel){ var p=panel; panel=null; p.classList.remove('show'); if(bell) bell.setAttribute('aria-expanded','false'); setTimeout(function(){ p.remove(); },180); }
  }
  document.addEventListener('click',function(e){ if((menu||panel)&&!e.target.closest('.hmenu,.hpanel,.hbell,.acct-link')) closeAll(); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&(menu||panel)){ var w=panel?bell:acct; closeAll(); if(w) w.focus(); } });
  window.EBHdr={ refresh:refresh, setUnread:function(n){ if(!S) return; S.unread=+n||0; save(); badge(); }, user:function(){ return S&&S.u; } };
})();
