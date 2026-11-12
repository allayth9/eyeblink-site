/* Eyeblink admin · reports — loaded after the files before it; all of admin/js shares one scope */
  /* ---------------- reports: money, delivery performance, clients ---------------- */
  var REP=null, RMON=6;
  function loadReports(){ if(!LIVE){ REP={err:'live'}; if(TAB==='reports') renderReports(); return; }
    fetch(API+'/work?admin=1&view=reports',{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ REP=j.ok?j:{err:j.error||'fail'}; if(TAB==='reports') renderReports(); }).catch(function(){ REP={err:'net'}; if(TAB==='reports') renderReports(); }); }
  function months(n,today){ var out=[], d=new Date(today+'T12:00:00Z'); d.setUTCDate(1); for(var i=0;i<n;i++){ out.unshift(d.toISOString().slice(0,7)); d.setUTCMonth(d.getUTCMonth()-1); } return out; }
  function mname(m){ try{ return new Date(m+'-15T12:00:00Z').toLocaleDateString('ar-u-nu-latn',{month:'short',year:'2-digit'}); }catch(_){ return m; } }
  function renderReports(){ var R=REP;
    if(!R){ $('#panel').innerHTML='<section class="sec"><div class="empty">…</div></section>'; loadReports(); return; }
    if(R.err){ $('#panel').innerHTML='<section class="sec"><h3>التقارير</h3><div class="empty">'+(R.err==='db'?'قاعدة البيانات غير مربوطة.':R.err==='live'?'يعمل هذا القسم على الموقع المنشور.':'تعذّر التحميل.')+'</div></section>'; return; }
    var M=months(RMON,R.today), first=M[0], inR=function(d){ return d&&String(d).slice(0,7)>=first; }, names={}; (R.clients||[]).forEach(function(c){ names[c.email]=c.name; }); (USERS||[]).forEach(function(u){ names[u.email]=names[u.email]||u.name; });
    // money: workspace invoice payments + order payments, by month and currency
    var pays=[]; (R.invoices||[]).forEach(function(x){ if(x.status==='cancelled') return; (x.payments||[]).forEach(function(p){ pays.push({m:String(p.date||p.at).slice(0,7),c:x.currency,a:nn(p.amount),email:x.client_email}); }); if(x.refunded) pays.push({m:String(x.updated_at||R.today).slice(0,7),c:x.currency,a:-nn(x.refunded),email:x.client_email}); });
    orderBills().forEach(function(o){ (o.payments||[]).forEach(function(p){ pays.push({m:String(p.date||'').slice(0,7),c:o.currency,a:nn(p.amount),email:o.email,order:1}); }); });
    var curs={}; pays.forEach(function(p){ if(inR(p.m+'-01')) curs[p.c]=(curs[p.c]||0)+p.a; }); var main=Object.keys(curs).sort(function(a,b){ return curs[b]-curs[a]; })[0]||'$';
    var byM=M.map(function(m){ return pays.filter(function(p){ return p.m===m&&p.c===main; }).reduce(function(a,p){ return a+p.a; },0); }), mx=Math.max.apply(null,byM.concat([1]));
    var outC={}; (R.invoices||[]).forEach(function(x){ if(x.sent_at&&['pending','partial','overdue'].indexOf(x.state)>=0) outC[x.currency]=(outC[x.currency]||0)+x.balance; }); orderBills().forEach(function(o){ if(['pending','partial'].indexOf(o.state)>=0) outC[o.currency]=(outC[o.currency]||0)+o.balance; });
    // delivery performance
    var T=R.tasks||[], done=T.filter(function(t){ return t.status==='completed'&&inR(t.completed_at); }), created=T.filter(function(t){ return inR(t.created_at); });
    var onT=done.filter(function(t){ return t.confirmed_date; }), onTime=onT.filter(function(t){ return String(t.completed_at).slice(0,10)<=t.confirmed_date; }).length;
    var turn=done.map(function(t){ return (new Date(t.completed_at)-new Date(t.created_at))/864e5; }), avgTurn=turn.length?turn.reduce(function(a,b){return a+b},0)/turn.length:0;
    var DL=R.deliverables||[], rounds={}; DL.forEach(function(d){ if(d.status==='changes') rounds[d.task_id]=(rounds[d.task_id]||0)+1; });
    var avgRounds=done.length?done.reduce(function(a,t){ return a+(rounds[t.id]||0); },0)/done.length:0;
    var openT=T.filter(function(t){ return ['new','review','info','accepted','progress','feedback','revision','final'].indexOf(t.status)>=0; }), late=openT.filter(function(t){ return t.confirmed_date&&t.confirmed_date<R.today; });
    var pct=function(a,b){ return b?Math.round(a*100/b)+'%':'—'; };
    var col=function(vals,max,lab){ return '<div class="schart rchart" role="img" aria-label="'+esc(lab)+'">'+vals.map(function(v,i){ return '<div class="col" title="'+esc(mname(M[i]))+' · '+esc(typeof v==='number'?String(Math.round(v*100)/100):v)+'"><i style="height:'+(Math.max(0,v)*100/max)+'%"></i>'+(v?'<em>'+(Math.round(v*10)/10)+'</em>':'')+'</div>'; }).join('')+'</div><div class="saxis rax">'+M.map(function(m){ return '<span>'+esc(mname(m))+'</span>'; }).join('')+'</div>'; };
    var tc=M.map(function(m){ return T.filter(function(t){ return String(t.created_at).slice(0,7)===m; }).length; }), td=M.map(function(m){ return T.filter(function(t){ return t.status==='completed'&&String(t.completed_at).slice(0,7)===m; }).length; });
    var dv=M.map(function(m){ return DL.filter(function(d){ return String(d.created_at).slice(0,7)===m; }).length; });
    // per client
    var cl={}; T.forEach(function(t){ var c=cl[t.client_email]=cl[t.client_email]||{tasks:0,open:0,done:0,onT:0,onTimeN:0,rounds:0,paid:{},due:{},projects:{}}; c.tasks++; c.projects[t.project_id]=1;
      if(t.status==='completed'){ c.done++; c.rounds+=rounds[t.id]||0; if(t.confirmed_date){ c.onT++; if(String(t.completed_at).slice(0,10)<=t.confirmed_date) c.onTimeN++; } } else if(openT.indexOf(t)>=0) c.open++; });
    (R.invoices||[]).forEach(function(x){ var c=cl[x.client_email]=cl[x.client_email]||{tasks:0,open:0,done:0,onT:0,onTimeN:0,rounds:0,paid:{},due:{},projects:{}}; if(x.status!=='cancelled') c.paid[x.currency]=(c.paid[x.currency]||0)+x.paid-(x.refunded||0); if(x.sent_at&&['pending','partial','overdue'].indexOf(x.state)>=0) c.due[x.currency]=(c.due[x.currency]||0)+x.balance; });
    var mm=function(o){ var k=Object.keys(o).filter(function(c){return Math.abs(o[c])>0.009}); return k.length?k.map(function(c){ return '<span dir="ltr">'+esc(mny(o[c],c))+'</span>'; }).join(' · '):'—'; };
    var ord=ORDERS.filter(function(o){ return !o.demo&&inR(o.createdAt); }), ordPaid=ord.filter(function(o){ return o.paid||(o.deposit&&o.deposit.paid); });
    $('#panel').innerHTML=
      '<section class="sec"><div class="srange">'+[[3,'آخر 3 أشهر'],[6,'آخر 6 أشهر'],[12,'آخر 12 شهراً']].map(function(x){ return '<button type="button" class="btn sm'+(RMON===x[0]?' primary':'')+'" data-rmon="'+x[0]+'">'+x[1]+'</button>'; }).join('')+'<button type="button" class="btn sm" data-rreload>تحديث</button></div>'+
        '<div class="kpis"><div><b>'+mm(curs)+'</b><span>المحصَّل في الفترة</span></div><div><b>'+mm(outC)+'</b><span>المستحق الآن</span></div><div><b>'+done.length+'</b><span>مهام مكتملة</span></div><div><b>'+pct(onTime,onT.length)+'</b><span>التسليم في الموعد المؤكد</span></div>'+
        '<div><b>'+(turn.length?avgTurn.toFixed(1)+' يوم':'—')+'</b><span>متوسط مدة المهمة</span></div><div><b>'+(done.length?avgRounds.toFixed(1):'—')+'</b><span>متوسط جولات التعديل</span></div></div>'+
        '<p class="hint">المحصَّل يجمع دفعات فواتير العملاء المتعاقدين ودفعات طلبات الموقع (ناقص المسترد). «في الموعد» = اكتملت المهمة في الموعد المؤكد أو قبله.</p></section>'+
      '<div class="sgrid">'+
        '<section class="sec"><h3>المحصَّل شهرياً ('+esc(main)+')</h3>'+col(byM,mx,'المحصَّل شهرياً')+'</section>'+
        '<section class="sec"><h3>المهام شهرياً</h3>'+col(td,Math.max.apply(null,td.concat(tc,[1])),'المهام المكتملة')+'<p class="small muted">الأعمدة = المكتملة · جديدة في الفترة: '+created.length+' · تسليمات (نسخ): '+dv.reduce(function(a,b){return a+b},0)+'</p></section>'+
        '<section class="sec"><h3>الوضع الآن</h3><div class="sbars"><div class="sbar"><span class="n">مهام مفتوحة</span><span class="v">'+openT.length+'</span></div><div class="sbar"><span class="n">مهام تجاوزت موعدها المؤكد</span><span class="v">'+late.length+'</span></div>'+
          '<div class="sbar"><span class="n">فواتير متأخرة</span><span class="v">'+(R.invoices||[]).filter(function(x){return x.sent_at&&x.state==='overdue'}).length+'</span></div><div class="sbar"><span class="n">طلبات الموقع في الفترة</span><span class="v">'+ord.length+'<small>مدفوعة '+ordPaid.length+'</small></span></div></div></section>'+
        '<section class="sec"><h3>المهام المتأخرة</h3>'+(late.length?'<div class="sbars">'+late.slice(0,12).map(function(t){ return '<div class="sbar"><span class="n">'+esc(t.ref)+' · '+esc(t.title)+'</span><span class="v small">'+esc(t.confirmed_date)+'</span></div>'; }).join('')+'</div>':'<div class="empty small">لا توجد مهام متأخرة.</div>')+'</section>'+
      '</div>'+
      '<section class="sec"><h3>العملاء المتعاقدون</h3>'+(Object.keys(cl).length?'<div class="nlog"><table><thead><tr><th>العميل</th><th>المشاريع</th><th>مكتملة / مفتوحة</th><th>في الموعد</th><th>جولات التعديل</th><th>المدفوع</th><th>المستحق</th></tr></thead><tbody>'+
        Object.keys(cl).map(function(e){ var c=cl[e]; return '<tr><td><b>'+esc(names[e]||e)+'</b><div class="small muted" dir="ltr">'+esc(e)+'</div></td><td>'+Object.keys(c.projects).length+'</td><td>'+c.done+' / '+c.open+'</td><td>'+pct(c.onTimeN,c.onT)+'</td><td>'+(c.done?(c.rounds/c.done).toFixed(1):'—')+'</td><td>'+mm(c.paid)+'</td><td>'+mm(c.due)+'</td></tr>'; }).join('')+'</tbody></table></div>':'<div class="empty">لا توجد بيانات بعد.</div>')+'</section>';
  }
  document.addEventListener('click',function(e){ if(TAB!=='reports') return; var b=e.target.closest('button'); if(!b) return;
    if(b.dataset.rmon){ RMON=+b.dataset.rmon; renderReports(); return; } if(b.hasAttribute('data-rreload')){ REP=null; renderReports(); return; } });

  /* ---------------- stats ---------------- */
  var DEV={mobile:'موبايل',desktop:'كمبيوتر',tablet:'تابلت'}, SDAYS=30, STATS=null;
  var SRCN={direct:'مباشر / رابط محفوظ',instagram:'Instagram',google:'Google',facebook:'Facebook',whatsapp:'WhatsApp',telegram:'Telegram',tiktok:'TikTok',youtube:'YouTube',x:'X',linkedin:'LinkedIn',behance:'Behance',snapchat:'Snapchat',bing:'Bing'};
  var CN={SY:'سوريا',SA:'السعودية',AE:'الإمارات',OM:'عُمان',QA:'قطر',KW:'الكويت',BH:'البحرين',JO:'الأردن',LB:'لبنان',IQ:'العراق',EG:'مصر',TR:'تركيا',RO:'رومانيا',DE:'ألمانيا',US:'أمريكا',GB:'بريطانيا',FR:'فرنسا',NL:'هولندا',SE:'السويد',PS:'فلسطين',MA:'المغرب',DZ:'الجزائر',TN:'تونس',LY:'ليبيا',YE:'اليمن',SD:'السودان'};
  function loadStats(){ STATS='loading'; if(!LIVE){ STATS=demoStats(); renderStats(); return; }
    fetch(API+'/track?days='+SDAYS,{headers:headers({})}).then(function(r){return r.json()}).then(function(j){ STATS=j.days||[]; if(TAB==='stats') renderStats(); }).catch(function(){ STATS=[]; if(TAB==='stats') renderStats(); }); }
  function demoStats(){ var out=[]; for(var i=SDAYS-1;i>=0;i--){ var v=Math.round(20+Math.random()*60); out.push({day:new Date(Date.now()-i*864e5).toISOString().slice(0,10),views:v,visits:Math.round(v*.6),visitors:Math.round(v*.4),pages:{'/':v,'/pricing':Math.round(v/3)},sources:{instagram:Math.round(v*.3),direct:Math.round(v*.2),google:3},countries:{SA:9,AE:5,SY:4},devices:{mobile:20,desktop:8},browsers:{'Instagram app':10,Chrome:9,Safari:6},os:{iOS:12,Android:8,Windows:5},langs:{ar:20,en:5},recent:i?[]:[{at:new Date().toISOString(),page:'/pricing',src:'instagram',country:'SA',city:'Riyadh',device:'mobile',os:'iOS',browser:'Instagram app',nv:true}]}); } return out; }
  function sum(list,k){ var o={}; list.forEach(function(d){ var x=d[k]||{}; for(var n in x) o[n]=(o[n]||0)+x[n]; }); return Object.keys(o).map(function(n){return [n,o[n]]}).sort(function(a,b){return b[1]-a[1]}); }
  function bars(rows,name){ var max=rows.length?rows[0][1]:1, tot=rows.reduce(function(a,r){return a+r[1]},0)||1;
    return rows.length? '<div class="sbars">'+rows.slice(0,8).map(function(r){ return '<div class="sbar"><span class="n">'+esc(name?name(r[0]):r[0])+'</span><span class="v">'+r[1]+' <small>'+Math.round(r[1]*100/tot)+'%</small></span><i style="width:'+Math.max(3,r[1]*100/max)+'%"></i></div>'; }).join('')+'</div>' : '<div class="empty small">لا بيانات بعد</div>'; }
  function renderStats(){
    if(STATS===null||STATS==='loading'){ $('#panel').innerHTML='<section class="sec"><div class="empty">…</div></section>'; if(STATS===null) loadStats(); return; }
    var D=STATS, T=function(k){ return D.reduce(function(a,d){return a+(d[k]||0)},0); };
    var from=D.length?D[0].day:'', ord=ORDERS.filter(function(o){ return !o.demo&&o.createdAt&&o.createdAt.slice(0,10)>=from; });
    var paid=ord.filter(function(o){return o.paid||(o.deposit&&o.deposit.paid)});
    var visits=T('visits'), conv=visits? (ord.length*100/visits).toFixed(1)+'%' : '—';
    var max=Math.max.apply(null,D.map(function(d){return d.views||0}).concat([1]));
    var chart='<div class="schart" role="img" aria-label="المشاهدات اليومية">'+D.map(function(d){ var o=ORDERS.filter(function(x){return x.createdAt&&x.createdAt.slice(0,10)===d.day}).length;
      return '<div class="col" title="'+esc(d.day)+' · '+(d.views||0)+' مشاهدة · '+(d.visits||0)+' زيارة'+(o?' · '+o+' طلب':'')+'"><i style="height:'+((d.views||0)*100/max)+'%"></i><b style="height:'+((d.visits||0)*100/max)+'%"></b>'+(o?'<em>'+o+'</em>':'')+'</div>'; }).join('')+'</div>'+
      '<div class="saxis"><span>'+esc(from)+'</span><span>اليوم</span></div><div class="slegend"><span><i class="a"></i>مشاهدات صفحات</span><span><i class="b"></i>زيارات</span><span><em>●</em> طلب</span></div>';
    var recent=[].concat.apply([],D.slice().reverse().map(function(d){return d.recent||[]})).slice(0,60);
    var osrc=sum(ord.map(function(o){ var x={}; x[(o.visit&&o.visit.source)||'غير معروف']=1; return {s:x}; }),'s');
    $('#panel').innerHTML=
      '<section class="sec"><div class="srange">'+[7,30,90].map(function(n){ return '<button type="button" class="btn sm'+(SDAYS===n?' primary':'')+'" data-sdays="'+n+'">آخر '+n+' يوم</button>'; }).join('')+'<button type="button" class="btn sm" data-sreload>تحديث</button></div>'+
        '<div class="kpis"><div><b>'+T('views')+'</b><span>مشاهدة صفحة</span></div><div><b>'+visits+'</b><span>زيارة</span></div><div><b>'+T('visitors')+'</b><span>زائر جديد</span></div><div><b>'+ord.length+'</b><span>طلب</span></div><div><b>'+conv+'</b><span>نسبة الطلب من الزيارات</span></div><div><b>'+paid.length+'</b><span>طلب مدفوع</span></div></div>'+chart+
        (!LIVE?'<p class="hint">أرقام تجريبية. الأرقام الحقيقية تبدأ بعد النشر.</p>':'<p class="hint">إحصائيات مجهولة الهوية: لا نخزّن عنوان IP ولا أي بيانات شخصية. الزيارة = جلسة تصفّح واحدة، والزائر الجديد = أول مرة يُفتح فيها الموقع من هذا الجهاز.</p>')+'</section>'+
      '<div class="sgrid">'+
        '<section class="sec"><h3>مصادر الزيارات</h3>'+bars(sum(D,'sources'),function(n){return SRCN[n]||n})+'</section>'+
        '<section class="sec"><h3>مصادر الطلبات</h3>'+bars(osrc,function(n){return SRCN[n]||n})+'</section>'+
        '<section class="sec"><h3>أكثر الصفحات</h3>'+bars(sum(D,'pages'))+'</section>'+
        '<section class="sec"><h3>الدول</h3>'+bars(sum(D,'countries'),function(n){return CN[n]||n})+'</section>'+
        '<section class="sec"><h3>الأجهزة</h3>'+bars(sum(D,'devices'),function(n){return DEV[n]||n})+'<h3 style="margin-top:16px">أنظمة التشغيل</h3>'+bars(sum(D,'os'))+'</section>'+
        '<section class="sec"><h3>المتصفّح / التطبيق</h3>'+bars(sum(D,'browsers'))+'<h3 style="margin-top:16px">لغة الصفحة</h3>'+bars(sum(D,'langs'),function(n){return n==='en'?'English':'العربية'})+'</section>'+
      '</div>'+
      '<section class="sec"><h3>آخر الزيارات</h3>'+(recent.length?'<div class="stable"><table><thead><tr><th>الوقت</th><th>الصفحة</th><th>المصدر</th><th>الموقع</th><th>الجهاز</th></tr></thead><tbody>'+recent.map(function(r){
        return '<tr><td>'+esc(new Date(r.at).toLocaleString('ar',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+(r.nv?' <span class="tag">جديد</span>':'')+'</td><td dir="ltr">'+esc(r.page)+'</td><td>'+esc(SRCN[r.src]||r.src)+(r.utm?'<br><small dir="ltr">'+esc(r.utm)+'</small>':'')+(r.ref&&r.src!=='direct'?'<br><small dir="ltr" class="muted">'+esc(r.ref.replace(/^https?:\/\//,'').slice(0,40))+'</small>':'')+'</td><td>'+esc([r.city,CN[r.country]||r.country].filter(Boolean).join('، '))+'</td><td>'+esc(DEV[r.device]||r.device)+' · '+esc(r.os)+'<br><small class="muted">'+esc(r.browser)+'</small></td></tr>'; }).join('')+'</tbody></table></div>':'<div class="empty">لا زيارات بعد.</div>')+'</section>';
  }
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-sdays],[data-sreload]'); if(!b) return; if(b.dataset.sdays) SDAYS=+b.dataset.sdays; STATS=null; renderStats(); });
