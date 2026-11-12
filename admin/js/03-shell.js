/* Eyeblink admin · shell — loaded after the files before it; all of admin/js shares one scope */
  /* ================= the studio shell: four sections, «Today», search, and the team ================= */
  // every tab belongs to one of four sections; the sidebar draws them in this order
  var TOP_TABS=['notify','settings'];
  var SECT=[['today',''],['work','الشغل'],['site','الموقع'],['studio','الاستوديو']];
  var SECT_OF={today:'today',orders:'work',tasks:'work',clients:'work',billing:'work',team:'work',support:'work',notify:'studio',reports:'studio',stats:'studio',settings:'studio',backup:'studio'};
  function secOf(id){ return SECT_OF[id]||'site'; }
  var ICO={today:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',orders:'<path d="M4 13l2-8h12l2 8v6H4zM4 13h5a3 3 0 0 0 6 0h5"/>',tasks:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M15 4v16"/>',
    clients:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6 6 0 0 1 3.5 5.5"/>',billing:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>',
    team:'<circle cx="12" cy="7" r="3"/><circle cx="5" cy="10" r="2.2"/><circle cx="19" cy="10" r="2.2"/><path d="M6.5 20a5.5 5.5 0 0 1 11 0M1.5 19a3.5 3.5 0 0 1 4.5-3.3M22.5 19a3.5 3.5 0 0 0-4.5-3.3"/>',
    support:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>',
    home:'<path d="M3 11l9-7 9 7v9H3z"/>',services:'<path d="M7 3h7l5 5v13H7zM14 3v5h5"/>',packages:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    work:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>',about:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    contact:'<path d="M4 5h16v11H8l-4 4z"/>',payments:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>',
    layout:'<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
    settings:'<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',notify:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
    reports:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',stats:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',backup:'<path d="M4 7h16v13H4zM2 3h20v4H2zM10 12h4"/>'};
  function ico(id){ return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">'+(ICO[id]||ICO.services)+'</svg>'; }
  function tabCount(id){
    if(id==='orders') return [ORDERS.filter(function(o){return o.status==='new'||o.unread}).length,'hot'];
    if(id==='tasks'&&WORK&&WORK.tasks) return [WORK.tasks.filter(function(x){return x.status==='new'||(x.change_request&&x.change_request.status==='pending')}).length,'hot'];
    if(id==='billing'&&BILL&&BILL.invoices) return [BILL.invoices.filter(function(x){return x.state==='overdue'}).length,'crit'];
    if(id==='notify') return [NOTI&&!NOTI.err?NOTI.unread:(WORK&&WORK.inboxUnread)||0,'hot'];
    if(id==='clients'&&ACC) return [ACC.requests.filter(function(r){return r.status==='pending'}).length,'hot'];
    if(id==='team'&&TEAM&&TEAM.apps) return [TEAM.apps.filter(function(a){return a.status==='new'}).length+TEAM.tasks.filter(function(t){return t.status==='qc'}).length,'hot'];
    if(id==='support'&&SUPA) return [SUPA.filter(function(s){ return s.status!=='closed'&&s.unread; }).length,'hot'];
    if(id==='today'){ var al=alerts(); return [al.filter(function(a){return a.lvl!=='info'}).length, al.some(function(a){return a.lvl==='crit'})?'crit':'warn']; }
    return [0];
  }
  var NAVO=false;
  function navOpen(on){ var app=$('#app'), sc=$('#scrim'), b=$('#mnavBtn'); if(!app||NAVO===on) return; NAVO=on; b&&b.setAttribute('aria-expanded',on);
    if(on){ sc.hidden=false; requestAnimationFrame(function(){ if(NAVO) app.classList.add('nav-open'); }); document.body.style.overflow='hidden'; var c=$('#tabs [aria-current="true"]'); if(c) setTimeout(function(){ c.focus({preventScroll:true}); c.scrollIntoView({block:'nearest'}); },60); }
    else { app.classList.remove('nav-open'); document.body.style.overflow=''; setTimeout(function(){ if(!NAVO) sc.hidden=true; },260); } }
  document.addEventListener('click',function(e){ if(e.target.closest('#mnavBtn')) return navOpen(!NAVO); if(e.target.closest('#scrim')) return navOpen(false); });
  // capture: the tab's own handler redraws the menu, so look before it does
  document.addEventListener('click',function(e){ if(NAVO&&e.target.closest('#tabs [data-tab]')) navOpen(false); },true);
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&NAVO) navOpen(false); });
  function renderTabs(){
    $('#tabs').innerHTML=SECT.map(function(s){
      var list=TABS.filter(function(t){ return secOf(t.id)===s[0]&&TOP_TABS.indexOf(t.id)<0; }); if(!list.length) return '';
      return '<div class="navsec">'+(s[1]?'<div class="tabgrp">'+esc(s[1])+'</div>':'')+list.map(function(t){ var c=tabCount(t.id);
        return '<button type="button" data-tab="'+t.id+'"'+(t.id===TAB?' aria-current="true"':'')+'>'+ico(t.id)+'<span>'+esc(t.title)+'</span>'+(c[0]?'<span class="count '+(c[1]||'')+'">'+c[0]+'</span>':'')+'</button>'; }).join('')+'</div>';
    }).join('');
    var top=$('.top'); if(top) top.classList.toggle('nopub', secOf(TAB)!=='site'&&TAB!=='settings');
    var ti=$('#topIcons'); if(ti) ti.innerHTML=TOP_TABS.map(function(id){ var t=TABS.filter(function(x){return x.id===id})[0], c=tabCount(id); return '<button type="button" class="tico" data-tab="'+id+'" title="'+esc(t.title)+'" aria-label="'+esc(t.title)+'"'+(TAB===id?' aria-current="true"':'')+'>'+ico(id)+(c[0]?'<span class="dot">'+c[0]+'</span>':'')+'</button>'; }).join('');
    var cur=$('#tabs [aria-current="true"]'); if(cur&&cur.scrollIntoView){ var nav=$('#tabs'), r=cur.getBoundingClientRect(), n=nav.getBoundingClientRect(); if(r.top<n.top||r.bottom>n.bottom) cur.scrollIntoView({block:'nearest'}); }
    if(TAB==='today'&&!TODAY_LOCK&&$('#panel .tdy')) renderToday(true);
  }
  // one open at a time: opening a card closes its open siblings (works, packages, orders, tasks, applications…)
  document.addEventListener('click',function(e){ var s=e.target.closest('summary'); if(!s||e.target.closest('button,a,input,select,label')) return; var d=s.parentElement; if(!d||d.tagName!=='DETAILS'||d.open||!d.parentElement) return;
    [].forEach.call(d.parentElement.children,function(x){ if(x!==d&&x.tagName==='DETAILS'&&x.open) x.open=false; }); });
  /* ---------- addresses: every section has its own (History API); back, forward and reload keep you where you were ---------- */
  // night / light: remembered on this device (night is the default)
  document.addEventListener('click',function(e){ if(!e.target.closest('#themeBtn')) return; var r=document.documentElement, t=r.dataset.theme==='light'?'dark':'light';
    if(t==='light') r.dataset.theme='light'; else delete r.dataset.theme; try{ localStorage.setItem('eb-admin-theme',t); }catch(_){} });
  var ROUTING=false;
  function route(replace){ if(ROUTING) return; try{
    var p='/admin'+(TAB==='today'?'':'/'+TAB)+(TAB==='tasks'?(WOPEN?'/'+WOPEN:WSUB&&WSUB!=='tasks'?'/'+WSUB:''):'')+(TAB==='clients'&&PROF&&PROF.email?'/'+encodeURIComponent(PROF.email):'')+(TAB==='orders'&&OPENCODE?'/'+OPENCODE:TAB==='orders'&&OPICK&&OOPEN?(function(){ var o=ORDERS.filter(function(x){ return x.key===OOPEN; })[0]; return o?'/'+o.code:''; })():'');
    if(location.pathname!==p||location.hash) history[replace?'replaceState':'pushState'](null,'',p);
  }catch(_){} }
  // the address → {tab, sub}; old links (#tasks/T-…, #clients/…, #support) still open the right place
  function readRoute(){
    var h=location.hash, tab='today', sub=null, m;
    if((m=/^#(?:work|tasks)\/(T-[A-Z0-9]+)$/.exec(h))){ tab='tasks'; sub=m[1]; }
    else if((m=/^#([a-z]+)(?:\/(.+))?$/.exec(h))){ tab=m[1]; sub=m[2]||null; }
    else if((m=/^\/admin(?:\/([a-z]+)(?:\/(.+?))?)?\/?$/.exec(location.pathname))&&m[1]){ tab=m[1]; sub=m[2]||null; }
    var known=TABS.some(function(t){ return t.id===tab; });
    if(!known){ tab='today'; sub=null; }
    try{ sub=sub&&decodeURIComponent(sub); }catch(_){ sub=null; }
    return {tab:tab, sub:sub, unknown:!known};
  }
  addEventListener('popstate',function(){ if(!LIVE&&!C) return; var r=readRoute(); ROUTING=true;
    if(r.tab==='tasks'){ var ts=!!r.sub&&/^T-/.test(r.sub); WOPEN=ts?r.sub:null; WSUB=ts||!r.sub?'tasks':r.sub; } if(r.tab==='clients'&&!r.sub) PROF=null; if(r.tab==='orders'){ OPENCODE=r.sub; if(!r.sub){ OOPEN=null; OPICK=false; } }
    go(r.tab); if(r.tab==='clients'&&r.sub) loadProfile(r.sub); ROUTING=false; });
  function go(tab){ TAB=tab; route(); render(); if(tab==='orders') loadOrders(); if(tab==='clients') loadUsers(); if(tab==='tasks') loadWork(); if(tab==='notify') loadNotify(); if(tab==='billing') loadBilling(); if(tab==='reports') loadReports(); if(tab==='team') loadTeam(); if(tab==='support') loadSupport(); if(tab==='today'){ loadOrders(); loadTeam(); } scrollTo(0,0); }
  function goOrder(key){ TAB='orders'; OFILTER='all'; OOPEN=key; OPICK=true; render(); var d=document.querySelector('[data-okey="'+key+'"]'); if(d){ d.open=true; setTimeout(function(){ d.scrollIntoView({block:'start',behavior:'smooth'}); },40); d.classList.add('flash'); setTimeout(function(){ d.classList.remove('flash'); },1600); } }

  /* ---------- «Today»: what needs you, ranked; the week ahead; where the pipeline stands ---------- */
  var TODAY_LOCK=false, ORD_READY=false;
  function hrs(iso){ return (Date.now()-Date.parse(iso))/36e5; }
  function ago(iso){ var h=hrs(iso); return h<1?'من شوي':h<24?'من '+Math.round(h)+' ساعة':'من '+Math.round(h/24)+' يوم'; }
  function alerts(){
    var A=[], t0=todayISO(), add=function(lvl,title,sub,goTo,at){ A.push({lvl:lvl,title:title,sub:sub,go:goTo,at:at||''}); };
    ORDERS.forEach(function(o){ if(o.demo) return; var nm=esc(o.name)+' · <span dir="ltr">'+esc(o.code)+'</span>', closed=o.status==='cancelled'||o.status==='delivered', g={tab:'orders',key:o.key};
      var rec=o.payInfo&&(o.messages||[]).some(function(m){ return m.kind==='receipt'&&m.at>o.payInfo.at; }), stagePaid=o.payInfo&&(o.payInfo.stage==='deposit'?(o.deposit&&o.deposit.paid):o.paid);
      if(rec&&!stagePaid) add('crit','إيصال دفع بانتظار تأكيدك',nm+' · '+esc(o.payInfo.amount||''),g,o.payInfo.at);
      if(o.followUp&&!closed){ if(o.followUp<t0) add('crit','متابعة متأخرة',nm+(o.nextStep?' · '+esc(o.nextStep):''),g,o.followUp); else if(o.followUp===t0) add('warn','متابعة اليوم',nm+(o.nextStep?' · '+esc(o.nextStep):''),g,o.followUp); }
      if(o.status==='new'&&!o.manual) add(hrs(o.createdAt)>24?'warn':'info',hrs(o.createdAt)>24?'طلب جديد ما انرد عليه':'طلب جديد',nm+' · '+ago(o.createdAt),g,o.createdAt);
      if(o.unread) add('warn',o.unread+(o.unread>1?' رسائل':' رسالة')+' من العميل',nm,g,o.updatedAt||o.createdAt);
      if(o.payInfo&&!stagePaid&&!rec&&hrs(o.payInfo.at)>48) add('warn','الدفع متأخر',nm+' · طلبته '+ago(o.payInfo.at),g,o.payInfo.at);
      (o.docs||[]).forEach(function(s){ var ty=s.type==='quote'?'عرض السعر':'الاتفاقية';
        if(s.status==='accepted') return;
        if(s.viewedAt&&hrs(s.viewedAt)>72) add('warn','شاف '+ty+' وما ردّ',nm+' · فتحه '+ago(s.viewedAt),g,s.viewedAt);
        else if(!s.viewedAt&&hrs(s.at)>48) add('info',ty+' ما انفتح لسا',nm+' · انبعت '+ago(s.at),g,s.at); });
      var signed=(o.docs||[]).some(function(s){ return s.type==='agreement'&&s.status==='accepted'; });
      if(signed&&!o.projectId&&!closed) add('info','الاتفاقية موقّعة: افتح مشروعه',nm,g);
      if(signed&&!o.paid&&!(o.deposit&&o.deposit.paid)&&!o.payInfo&&!closed) add('warn','اطلب العربون',nm+' · وقّع الاتفاقية',g);
    });
    ((WORK&&WORK.tasks)||[]).forEach(function(t){ if(/completed|rejected|cancelled/.test(t.status)) return; var g={tab:'tasks',ref:t.ref};
      if(t.confirmed_date&&t.confirmed_date<t0&&t.status!=='final') add('crit','مهمة عميل متأخرة',esc(t.title)+' · '+esc(t.project_name||''),g,t.confirmed_date);
      else if(t.status==='new') add('warn','مهمة جديدة من عميل',esc(t.title)+' · '+esc(t.project_name||''),g);
      if(t.change_request&&t.change_request.status==='pending') add('warn','طلب تغيير موعد',esc(t.title),g); });
    ((BILL&&BILL.invoices)||[]).forEach(function(x){ if(x.state==='overdue') add('crit','فاتورة متأخرة','<span dir="ltr">'+esc(x.no)+'</span>'+(x.balance?' · '+esc(x.balance)+' '+esc(x.currency||''):''),{tab:'billing'},x.due_date); });
    if(TEAM&&TEAM.apps){ var na=TEAM.apps.filter(function(a){return a.status==='new'}).length; if(na) add('info',na+(na>1?' طلبات انضمام جديدة':' طلب انضمام جديد'),'من صفحة «انضم للفريق»',{tab:'team',sub:'apps'});
      var mn=function(e){ var m=TEAM.members.filter(function(x){return x.email===e})[0]; return m?m.name:e; }, due=0, cur='$';
      TEAM.tasks.forEach(function(t){ var g={tab:'team',task:t.id};
        if(t.status==='qc') add('warn','نسخة من الفريق بانتظار مراجعتك',esc(t.title)+' · '+esc(mn(t.member)),g,t.updatedAt);
        else if(t.due&&t.due<t0&&t.status!=='approved') add('crit','مهمة فريق متأخرة',esc(t.title)+' · '+esc(mn(t.member)),g,t.due);
        if(t.status==='approved'&&!(t.payout&&t.payout.paid)){ due+=+t.fee||0; cur=t.cur||cur; } });
      if(due) add('info','أجور فريق مستحقة','<span dir="ltr">'+esc(pfmt(due,cur))+'</span>',{tab:'team',sub:'members'}); }
    if(FXLIVE&&(FXLIVE.ok===false||(FXLIVE.at&&hrs(FXLIVE.at)>72))) add('info','سعر الليرة ما تحدّث',FXLIVE.at?'آخر سعر '+ago(FXLIVE.at)+' · بتقدر تكتبه بإيدك من خانة العملة':'ما قدرنا نجيب السعر من «الليرة اليوم»',{tab:'orders'});
    (SUPA||[]).forEach(function(s){ if(s.status!=='closed'&&s.unread) add(hrs(s.updatedAt||s.at)>12?'crit':'warn','تذكرة دعم بانتظار ردك',esc(s.name)+' · <span dir="ltr">'+esc(s.id)+'</span>',{tab:'support',id:s.id},s.updatedAt||s.at); });
    var rank={crit:0,warn:1,info:2}; return A.sort(function(a,b){ return rank[a.lvl]-rank[b.lvl]||(a.at<b.at?-1:1); });
  }
  function renderToday(soft){
    TODAY_LOCK=true; if(!soft) renderTabs(); TODAY_LOCK=false;
    var t0=todayISO(), now=new Date(), h=now.getHours(), al=alerts(), crit=al.filter(function(a){return a.lvl==='crit'}).length, warn=al.filter(function(a){return a.lvl==='warn'}).length;
    var live=ORDERS.filter(function(o){ return !o.demo; }), cur=(C.packages&&C.packages.currency)||'$';
    var open=live.filter(function(o){ return OPEN_ST.indexOf(o.status)>=0; }), pv=open.reduce(function(a,o){ return a+pnum(o.price||o.total); },0);
    // money that came in, by month (the invoices of site requests: deposit and final), the last six months
    var paidIn=function(mk){ var s=0; live.forEach(function(o){ [o.deposit&&o.deposit.invoice,o.invoice].forEach(function(v){ if(v&&String(v.at||'').slice(0,7)===mk) s+=+v.amount||0; }); }); return s; };
    var months=[]; for(var i=5;i>=0;i--){ var d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push({k:d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2),l:d.toLocaleDateString('ar-u-nu-latn',{month:'short'})}); }
    months.forEach(function(m){ m.v=paidIn(m.k); }); var month=months[5].v, prev=months[4].v, mmax=Math.max.apply(null,months.map(function(m){return m.v}))||1;
    var delta=prev?Math.round((month-prev)*100/prev):null;
    // what clients still owe (workspace invoices)
    var invs=(BILL&&BILL.invoices)||[], ic=(invs[0]&&invs[0].currency)||cur, due=0, over=0, overN=0;
    invs.forEach(function(x){ var b=pnum(x.balance); if(x.state==='overdue'){ over+=b; overN++; } else if(x.state==='pending'||x.state==='partial') due+=b; });
    // the pipeline: open requests per stage (each bar filters the requests page)
    var FUN=['new','discussing','confirmed','awaiting-payment'], fc=FUN.map(function(s){ return live.filter(function(o){ return o.status===s; }).length; }), fmax=Math.max.apply(null,fc)||1;
    var since=Date.now()-30*864e5, rec=live.filter(function(o){ return Date.parse(o.createdAt)>=since; }), won=rec.filter(function(o){ return o.paid||WON_ST.indexOf(o.status)>=0; });
    // production: client tasks this month
    var wt=((WORK&&WORK.tasks)||[]), mk=t0.slice(0,7);
    var done=wt.filter(function(t){ return t.status==='completed'&&String(t.updated_at||'').slice(0,7)===mk; }).length;
    var live2=wt.filter(function(t){ return !/completed|rejected|cancelled/.test(t.status); });
    var prod=live2.filter(function(t){ return /accepted|progress|revision/.test(t.status); }).length, wait=live2.filter(function(t){ return /new|review|info|feedback|final/.test(t.status); }).length;
    var late=live2.filter(function(t){ return t.confirmed_date&&t.confirmed_date<t0&&t.status!=='final'; }).length;
    var tot=done+live2.length, pct=tot?Math.round(done*100/tot):0, teamOpen=((TEAM&&TEAM.tasks)||[]).filter(function(t){return t.status!=='approved'&&t.status!=='declined'}).length;
    // the next seven days
    var ag=[], end=new Date(Date.now()+7*864e5).toISOString().slice(0,10);
    live.forEach(function(o){ if(o.followUp&&o.followUp>=t0&&o.followUp<=end&&o.status!=='cancelled'&&o.status!=='delivered') ag.push({d:o.followUp,k:'follow',t:'متابعة · '+esc(o.name),go:{tab:'orders',key:o.key}}); });
    wt.forEach(function(t){ if(t.confirmed_date&&t.confirmed_date>=t0&&t.confirmed_date<=end&&!/completed|rejected|cancelled/.test(t.status)) ag.push({d:t.confirmed_date,k:'client',t:'تسليم · '+esc(t.title),s:esc(t.project_name||''),st:t.status,go:{tab:'tasks',ref:t.ref}}); });
    ((TEAM&&TEAM.tasks)||[]).forEach(function(t){ if(t.due&&t.due>=t0&&t.due<=end&&t.status!=='approved'&&t.status!=='declined') ag.push({d:t.due,k:'team',t:'الفريق · '+esc(t.title),go:{tab:'team',task:t.id}}); });
    ag.sort(function(a,b){ return a.d<b.d?-1:1; });
    var next=ag.filter(function(x){ return x.k==='client'; })[0]||ag.filter(function(x){ return x.k==='team'; })[0];
    var dlabel=function(d){ return d===t0?'اليوم':new Date(d+'T12:00:00').toLocaleDateString('ar-u-nu-latn',{weekday:'long'}); };
    // new requests per week, the last eight weeks
    var wk=[]; for(var w=7;w>=0;w--){ var a=Date.now()-(w+1)*7*864e5, b=Date.now()-w*7*864e5; wk.push(live.filter(function(o){ var c=Date.parse(o.createdAt); return c>=a&&c<b; }).length); }
    var wmax=Math.max.apply(null,wk)||1, pts=wk.map(function(v,i){ return (i*100)+' '+Math.round(140-v/wmax*110); }), line='M'+pts.join(' L'), area=line+' L700 160 L0 160 Z';
    // the latest movements: request status changes and client tasks
    var feed=[];
    live.forEach(function(o){ (o.history||[]).forEach(function(x){ if(x.at&&ST[x.status]) feed.push({at:x.at,t:(x.status==='new'?'طلب جديد':ST[x.status])+' · '+esc(o.name),s:x.status}); }); });
    wt.forEach(function(t){ if(t.updated_at) feed.push({at:t.updated_at,t:esc(t.title)+' · '+esc(t.project_name||''),s:'w-'+t.status,l:(WST&&WST[t.status])||t.status}); });
    feed.sort(function(a,b){ return a.at<b.at?1:-1; }); feed=feed.slice(0,6);
    var WFAM={new:'new',review:'awaiting-payment',info:'awaiting-payment',accepted:'confirmed',progress:'in-progress',feedback:'review',revision:'review',final:'review',completed:'delivered',rejected:'cancelled',cancelled:'cancelled'};
    var ACT={orders:'افتح',tasks:'افتح المهمة',billing:'الفوترة',team:'راجع',support:'رد',clients:'افتح'};
    var LV={crit:'عاجل',warn:'انتباه',info:'للعلم'};
    var card=function(cls,body){ return '<section class="td2-c '+cls+'">'+body+'</section>'; };
    $('#panel').innerHTML='<div class="tdy td2">'+
      '<section class="tdy-head"><div><span class="eyebrow" dir="ltr">'+esc(now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}))+'</span><h1>'+(h<12?'صباح الخير':'مساء الخير')+'</h1>'+
        '<p>'+(crit?'<b class="lv crit">'+crit+' '+(crit>1?'أمور عاجلة':'أمر عاجل')+'</b> ':'')+(warn?'<b class="lv warn">'+warn+' بحاجة انتباه</b> ':'')+(!crit&&!warn&&(ORD_READY||!LIVE)?'<b class="lv good">كل شي تحت السيطرة</b>':'')+'</p></div>'+
        '<div class="tdy-act"><button class="btn primary" type="button" data-gonew>+ فرصة جديدة</button></div></section>'+
      '<div class="td2-kpis">'+
        card('', '<div class="td2-ch"><h3>انقبض هالشهر</h3>'+(delta!==null?'<span class="tag '+(delta>=0?'c-good':'c-crit')+'">'+(delta>=0?'+':'')+delta+'% عن الماضي</span>':'')+'</div><b class="td2-big" dir="ltr">'+esc(pfmt(month,cur))+'</b>'+
          '<div class="td2-bars">'+months.map(function(m,i){ return '<div><i style="height:'+Math.max(4,Math.round(m.v/mmax*58))+'px"'+(i===5?' class="on"':'')+'></i><span>'+esc(m.l)+'</span></div>'; }).join('')+'</div>')+
        card('', '<div class="td2-ch"><h3>مستحق ومتأخر</h3><button type="button" class="td2-lnk" data-go=\'{"tab":"billing"}\'>الفوترة</button></div><b class="td2-big c-warn" dir="ltr">'+(BILL?esc(pfmt(due,ic)):'—')+'</b><small class="muted">مستحق من فواتير العملاء</small>'+
          (over?'<button type="button" class="td2-over" data-go=\'{"tab":"billing"}\'><i></i><b dir="ltr">'+esc(pfmt(over,ic))+'</b><span>متأخر · '+overN+(overN>1?' فواتير':' فاتورة')+'</span></button>':'<span class="td2-ok"><i></i>ما في شي متأخر</span>'))+
        card('', '<div class="td2-ch"><h3>الفرص المفتوحة</h3><span class="muted small">'+open.length+' فرص</span></div><b class="td2-big" dir="ltr">'+esc(pfmt(pv,cur))+'</b>'+
          '<div class="td2-fun">'+FUN.map(function(s,i){ return '<button type="button" class="s-'+s+'" data-gostage="'+s+'"><span>'+esc(ST[s])+'</span><em><i style="width:'+Math.round(fc[i]/fmax*100)+'%"></i></em><b>'+fc[i]+'</b></button>'; }).join('')+'</div>'+
          '<small class="muted">التحويل آخر 30 يوم: '+(rec.length?won.length+' من '+rec.length:'—')+'</small>')+
        card('td2-prodc', '<div class="td2-prod"><div><h3>الإنتاج هالشهر</h3><b class="td2-big">'+done+'<small> / '+tot+'</small></b><small class="muted">مهمة عميل خلصت</small>'+
          '<div class="td2-chips">'+(prod?'<span class="tag s-in-progress">'+prod+' بالإنتاج</span>':'')+(wait?'<span class="tag s-review">'+wait+' بانتظار</span>':'')+(late?'<span class="tag c-crit">'+late+' متأخرة</span>':'')+(teamOpen?'<span class="tag s-confirmed">'+teamOpen+' عند الفريق</span>':'')+'</div></div>'+
          '<svg class="td2-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40"/><circle class="on" cx="50" cy="50" r="40" stroke-dasharray="'+Math.round(pct*2.513)+' 252"/><text x="50" y="57">'+pct+'%</text></svg></div>')+
      '</div>'+
      '<div class="tdy-grid">'+
        '<section class="panelx td2-todo"><div class="px-h"><h3>بحاجة لقرارك</h3><span class="muted small">'+(al.length?'مرتّبة حسب الأهمية':'')+'</span></div>'+
          (LIVE&&!ORD_READY?'<div class="calm"><span>عم يحمّل…</span></div>':al.length?'<ul class="td2-list">'+al.map(function(a){ return '<li class="lv-'+a.lvl+'"><button type="button" data-go=\''+esc(JSON.stringify(a.go))+'\'><i></i><div><b>'+esc(a.title)+'</b><span>'+a.sub+'</span></div><em>'+esc(a.lvl==='info'?LV.info:(ACT[a.go&&a.go.tab]||'افتح'))+'</em></button></li>'; }).join('')+'</ul>'
            :'<div class="calm"><svg viewBox="0 0 24 24" class="ico"><path d="M5 12l5 5 9-10"/></svg><b>ما في شي معلّق</b><span>كل الطلبات والمتابعات والفواتير تمام</span></div>')+'</section>'+
        '<aside class="tdy-side">'+
          (next?'<section class="td2-next"><span class="eyebrow" dir="ltr">NEXT DELIVERY</span><b>'+next.t.replace(/^(تسليم|الفريق) · /,'')+'</b><span>'+(next.s?next.s+' · ':'')+esc(dlabel(next.d))+'</span><button class="btn" type="button" data-go=\''+esc(JSON.stringify(next.go))+'\'>افتح</button></section>':'')+
          '<section class="panelx"><div class="px-h"><h3>الأيام الجاية</h3><span class="muted small">7 أيام</span></div>'+
          (ag.length?'<div class="td2-days">'+ag.slice(0,6).map(function(x){ var dd=new Date(x.d+'T12:00:00'); return '<button type="button" class="ag-'+x.k+'" data-go=\''+esc(JSON.stringify(x.go))+'\'><span class="td2-date"><b dir="ltr">'+dd.getDate()+'</b><small>'+esc(dlabel(x.d))+'</small></span><span>'+x.t+'</span></button>'; }).join('')+'</div>':'<p class="muted small" style="margin:0">ما في مواعيد هالأسبوع</p>')+'</section>'+
        '</aside></div>'+
      '<div class="tdy-grid">'+
        '<section class="panelx"><div class="px-h"><h3>الطلبات الجديدة · آخر 8 أسابيع</h3><span class="muted small">هالأسبوع: '+wk[7]+'</span></div>'+
          '<svg class="td2-line" viewBox="0 0 700 160" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="tdlf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2FC4D8" stop-opacity=".32"/><stop offset="1" stop-color="#2FC4D8" stop-opacity="0"/></linearGradient><linearGradient id="tdls" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1C45E6"/><stop offset="1" stop-color="#2FC4D8"/></linearGradient></defs><path class="grid" d="M0 30H700M0 85H700M0 140H700"/><path d="'+area+'" fill="url(#tdlf)"/><path d="'+line+'" fill="none" stroke="url(#tdls)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg></section>'+
        '<section class="panelx"><div class="px-h"><h3>آخر الحركة</h3></div>'+
          (feed.length?'<ul class="td2-feed">'+feed.map(function(x){ var fam=x.s.indexOf('w-')===0?WFAM[x.s.slice(2)]:x.s; return '<li><span class="muted small">'+esc(ago(x.at))+'</span><span>'+x.t+'</span><em class="tag s-'+esc(fam||'new')+'">'+esc(x.l||ST[x.s]||'')+'</em></li>'; }).join('')+'</ul>':'<p class="muted small" style="margin:0">ما في حركة لسا</p>')+'</section>'+
      '</div>'+
    '</div>';
  }
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-go],[data-gonew],[data-gostage]'); if(!b) return;
    if(b.hasAttribute('data-gonew')){ NEWOPP=true; go('orders'); var f=$('#oppForm'); if(f) f.elements.name.focus(); return; }
    if(b.dataset.gostage){ OFILTER=b.dataset.gostage; TAB='orders'; render(); scrollTo(0,0); return; }
    var g={}; try{ g=JSON.parse(b.dataset.go); }catch(_){ return; }
    if(g.tab==='orders'&&g.key) return goOrder(g.key);
    if(g.tab==='tasks'){ WOPEN=g.ref||null; go('tasks'); return; }
    if(g.tab==='support'){ SOPEN=g.id||null; go('support'); return; }
    if(g.tab==='team'){ TSUB=g.task?'tasks':(g.sub||TSUB); go('team'); if(g.task) setTimeout(function(){ openTTask(g.task); },60); return; }
    go(g.tab);
  });

  /* ---------- search everything (Ctrl+K): pages of the panel, orders, clients, team, quick actions ---------- */
  function cmdItems(){
    var L=[];
    TABS.forEach(function(t){ L.push({k:'صفحة',t:t.title,run:function(){ go(t.id); }}); });
    L.push({k:'إجراء',t:'+ فرصة جديدة',run:function(){ NEWOPP=true; go('orders'); }});
    L.push({k:'إجراء',t:'+ مهمة للفريق',run:function(){ TSUB='tasks'; go('team'); setTimeout(function(){ openTTask(null); },80); }});
    ORDERS.forEach(function(o){ L.push({k:'طلب',t:o.name+' · '+(o.packageName||'')+' · '+o.code,s:ST[o.status],run:function(){ goOrder(o.key); }}); });
    if(TEAM) TEAM.members.forEach(function(m){ L.push({k:'الفريق',t:m.name+' · '+(TROLE[m.role]||m.role),run:function(){ TSUB='members'; go('team'); }}); });
    return L;
  }
  function openCmd(){ var el=$('#cmdk'); if(el){ el.remove(); return; }
    el=document.createElement('div'); el.id='cmdk'; el.innerHTML='<div class="cmd"><input placeholder="ابحث عن طلب، عميل، صفحة، أو إجراء…" dir="auto"><ul></ul><div class="cmd-f"><span><kbd>↑</kbd><kbd>↓</kbd> تنقّل</span><span><kbd>Enter</kbd> فتح</span><span><kbd>Esc</kbd> إغلاق</span></div></div>';
    document.body.appendChild(el); var inp=el.querySelector('input'), ul=el.querySelector('ul'), items=cmdItems(), sel=0, shown=[];
    var draw=function(){ var q=inp.value.trim().toLowerCase(); shown=(q?items.filter(function(x){ return (x.t+' '+(x.s||'')+' '+x.k).toLowerCase().indexOf(q)>=0; }):items.filter(function(x){ return x.k!=='طلب'; })).slice(0,12); sel=Math.min(sel,Math.max(0,shown.length-1));
      ul.innerHTML=shown.length?shown.map(function(x,i){ return '<li'+(i===sel?' class="on"':'')+' data-i="'+i+'"><em>'+esc(x.k)+'</em><b>'+esc(x.t)+'</b>'+(x.s?'<span>'+esc(x.s)+'</span>':'')+'</li>'; }).join(''):'<li class="none">ما في نتائج</li>'; };
    var run=function(i){ var x=shown[i]; if(!x) return; el.remove(); x.run(); };
    inp.oninput=function(){ sel=0; draw(); };
    inp.onkeydown=function(e){ if(e.key==='ArrowDown'){ sel=Math.min(sel+1,shown.length-1); draw(); e.preventDefault(); } else if(e.key==='ArrowUp'){ sel=Math.max(sel-1,0); draw(); e.preventDefault(); } else if(e.key==='Enter'){ run(sel); } else if(e.key==='Escape'){ el.remove(); } };
    ul.onclick=function(e){ var li=e.target.closest('[data-i]'); if(li) run(+li.dataset.i); };
    el.onclick=function(e){ if(e.target===el) el.remove(); };
    draw(); inp.focus();
  }
  document.addEventListener('keydown',function(e){ if((e.ctrlKey||e.metaKey)&&(e.key==='k'||e.key==='K'||e.key==='ك')&&!$('#app').hidden){ e.preventDefault(); openCmd(); } });
  document.addEventListener('click',function(e){ if(e.target.closest('[data-cmdk]')) openCmd(); });
