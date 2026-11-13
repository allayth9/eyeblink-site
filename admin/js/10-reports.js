/* Eyeblink admin · reports — loaded after the files before it; all of admin/js shares one scope */
  /* ---------------- reports: money, delivery performance, clients ---------------- */
  var REP=null, RMON=6;
  // the reports read three things at once: the workspace data, the team (its fees) and how the works do on the site
  function loadReports(){ if(!LIVE){ REP={err:'live'}; if(TAB==='reports') renderReports(); return; }
    var get=function(u){ return fetch(API+u,{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).catch(function(){ return {}; }); };
    Promise.all([get('/work?admin=1&view=reports'),get('/team?admin=1'),get('/views?shares=1')]).then(function(r){ var j=r[0]||{};
      REP=j.ok?Object.assign(j,{team:r[1]&&r[1].ok?r[1]:null,site:r[2]&&r[2].ok?r[2]:null}):{err:j.error||'fail'}; if(TAB==='reports') renderReports(); }); }
  function months(n,today){ var out=[], d=new Date(today+'T12:00:00Z'); d.setUTCDate(1); for(var i=0;i<n;i++){ out.unshift(d.toISOString().slice(0,7)); d.setUTCMonth(d.getUTCMonth()-1); } return out; }
  function mname(m){ try{ return new Date(m+'-15T12:00:00Z').toLocaleDateString('ar-u-nu-latn',{month:'short',year:'2-digit'}); }catch(_){ return m; } }
  // the key a work's views and likes are stored under (the same as on the site)
  function wkey(p){ var s=String(p.poster||p.preview||(p.full&&(p.full.id||p.full.src))||(p.title&&p.title.ar)||''), h=5381; for(var i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return p.id||('w'+(h>>>0).toString(36)); }
  // where a request came from: the source written on a manual opportunity, else the visit that led to the order
  function leadSrc(o){ if(o.source&&o.source!=='website') return SRC[o.source]||o.source; var v=o.visit||{}, s=String(v.source||'').toLowerCase();
    if(/^\/(en\/)?w\//.test(v.landing||'')||/[?&]w=/.test(v.landing||'')) return 'رابط عمل مشارَك';
    if(/instagram|ig\b/.test(s)) return 'إنستغرام'; if(/google/.test(s)) return 'جوجل'; if(/facebook|fb/.test(s)) return 'فيسبوك'; if(/whatsapp|wa\.me/.test(s)) return 'واتساب';
    if(/t\.co|twitter|x\.com/.test(s)) return 'X'; if(/linkedin/.test(s)) return 'لينكدإن'; if(/tiktok/.test(s)) return 'تيك توك'; if(!s||s==='direct') return 'مباشر'; return s; }
  function renderReports(){ var R=REP;
    if(!R){ $('#panel').innerHTML='<section class="sec"><div class="empty">جارٍ التحميل…</div></section>'; loadReports(); return; }
    if(R.err){ $('#panel').innerHTML='<section class="sec"><h3>التقارير</h3><div class="empty">'+(R.err==='db'?'قاعدة البيانات غير مربوطة.':R.err==='live'?'يعمل هذا القسم على الموقع المنشور.':'تعذّر التحميل.')+'</div></section>'; return; }
    var M=months(RMON,R.today), first=M[0], inR=function(d){ return d&&String(d).slice(0,7)>=first; }, names={}; (R.clients||[]).forEach(function(c){ names[c.email]=c.name; }); (USERS||[]).forEach(function(u){ names[u.email]=names[u.email]||u.name; });
    // money: workspace invoice payments + order payments, by month and currency
    var pays=[]; (R.invoices||[]).forEach(function(x){ if(x.status==='cancelled') return; (x.payments||[]).forEach(function(p){ pays.push({m:String(p.date||p.at).slice(0,7),c:x.currency,a:nn(p.amount),email:x.client_email,svc:'عملاء متعاقدون (فواتير)'}); }); if(x.refunded) pays.push({m:String(x.updated_at||R.today).slice(0,7),c:x.currency,a:-nn(x.refunded),email:x.client_email,svc:'عملاء متعاقدون (فواتير)'}); });
    var byCode={}; ORDERS.forEach(function(o){ byCode[o.code]=o; });
    var svcOf=function(o){ var it=((C.packages&&C.packages.items)||[]).filter(function(x){ return x.id===o.package; })[0], s=it&&(C.services||[]).filter(function(v){ return v.id===it.service; })[0];
      return it&&(it.kind==='package'||/month/i.test((it.unit&&it.unit.en)||''))?(it.name&&it.name.ar)||'باقة':(s&&s.name&&s.name.ar)||o.packageName||'طلبات أخرى'; };
    orderBills().forEach(function(o){ (o.payments||[]).forEach(function(p){ pays.push({m:String(p.date||'').slice(0,7),c:o.currency,a:nn(p.amount),email:o.email,order:1,svc:svcOf(byCode[o.code]||{})}); }); });
    var curs={}; pays.forEach(function(p){ if(inR(p.m+'-01')) curs[p.c]=(curs[p.c]||0)+p.a; }); var main=Object.keys(curs).sort(function(a,b){ return curs[b]-curs[a]; })[0]||'$';
    var byM=M.map(function(m){ return pays.filter(function(p){ return p.m===m&&p.c===main; }).reduce(function(a,p){ return a+p.a; },0); }), mx=Math.max.apply(null,byM.concat([1]));
    var outC={}; (R.invoices||[]).forEach(function(x){ if(x.sent_at&&['pending','partial','overdue'].indexOf(x.state)>=0) outC[x.currency]=(outC[x.currency]||0)+x.balance; }); orderBills().forEach(function(o){ if(['pending','partial'].indexOf(o.state)>=0) outC[o.currency]=(outC[o.currency]||0)+o.balance; });
    // the team's fees paid in the period (a salaried member's pay is outside the tasks, so it is not counted here)
    var feeC={}; ((R.team&&R.team.tasks)||[]).forEach(function(x){ if(x.payout&&x.payout.paid&&inR(x.payout.at)&&nn(x.fee)) { var c=x.cur||'$'; feeC[c]=(feeC[c]||0)+nn(x.fee); } });
    var net=(curs[main]||0)-(feeC[main]||0);
    // income by service (main currency)
    var svc={}; pays.forEach(function(p){ if(inR(p.m+'-01')&&p.c===main) svc[p.svc]=(svc[p.svc]||0)+p.a; }); var svcL=Object.keys(svc).filter(function(k){ return svc[k]>0.009; }).sort(function(a,b){ return svc[b]-svc[a]; }), svcMax=Math.max.apply(null,svcL.map(function(k){ return svc[k]; }).concat([1]));
    // from request to payment: requests made in the period, and how far each one got
    var ord=ORDERS.filter(function(o){ return !o.demo&&inR(o.createdAt); }), paidish=function(o){ return o.paid||(o.deposit&&o.deposit.paid); };
    var AGREED=['confirmed','awaiting-payment','paid','in-progress','review','delivered'];
    var fun=[['الطلبات',ord.length,'new'],['تمّ التواصل',ord.filter(function(o){ return o.status!=='new'; }).length,'info'],['اتُّفق عليها',ord.filter(function(o){ return AGREED.indexOf(o.status)>=0||paidish(o); }).length,'prod'],['دُفعت',ord.filter(paidish).length,'ok'],['سُلّمت',ord.filter(function(o){ return o.status==='delivered'; }).length,'ok']];
    var lost=topOf(ord.filter(function(o){ return o.status==='cancelled'; }).map(function(o){ return o.lostReason; }));
    var srcs={}; ord.forEach(function(o){ var k=leadSrc(o), s=srcs[k]=srcs[k]||{n:0,paid:0}; s.n++; if(paidish(o)) s.paid++; }); var srcL=Object.keys(srcs).sort(function(a,b){ return srcs[b].n-srcs[a].n||srcs[b].paid-srcs[a].paid; });
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
    var sum=function(o){ return Object.keys(o).reduce(function(a,k){ return a+Math.abs(o[k]); },0); };
    // the works on the site: views (they include each work's starting number), real likes, and how often its link was opened
    var S=R.site||{}, wk=(C.projects||[]).map(function(p){ var k=wkey(p); return {t:(p.title&&p.title.ar)||'عمل',v:(S.views||{})[k]||0,l:(S.likes||{})[k]||0,o:p.slug&&S.shares&&S.shares[p.slug]?S.shares[p.slug].n:0}; })
      .sort(function(a,b){ return b.o-a.o||b.l-a.l||b.v-a.v; }).slice(0,8);
    var bar=function(label,val,w,fam,sub){ return '<div class="rbar"><span class="n">'+label+'</span><span class="rtrack"><i style="width:'+Math.max(w,val?3:0)+'%;background:var(--f-'+fam+')"></i></span><span class="v">'+val+(sub?'<small>'+sub+'</small>':'')+'</span></div>'; };
    $('#panel').innerHTML=
      '<section class="sec kcsec"><div class="srange">'+[[3,'آخر 3 أشهر'],[6,'آخر 6 أشهر'],[12,'آخر 12 شهراً']].map(function(x){ return '<button type="button" class="btn sm'+(RMON===x[0]?' primary':'')+'" data-rmon="'+x[0]+'">'+x[1]+'</button>'; }).join('')+'<button type="button" class="btn sm" data-rreload>تحديث</button></div>'+
        '<div class="kcs">'+kc(mm(curs),'المحصَّل في الفترة','ok','payments',sum(curs)>0)+kc(mm(outC),'مستحق على العملاء','wait','k_wait',sum(outC)>0)+kc(mm(feeC),'أجور الفريق المصروفة','prod','team',sum(feeC)>0)+
          kc('<span dir="ltr">'+esc(mny(net,main))+'</span>','الصافي للاستوديو ('+esc(main)+')','info','reports',sum(curs)>0)+'</div>'+
        '<div class="kcs rkcs">'+kc(done.length,'مهام مكتملة','ok','k_done')+kc(pct(onTime,onT.length),'التسليم في الموعد المؤكد','info','k_play',onT.length)+kc(turn.length?avgTurn.toFixed(1)+' يوم':'—','متوسط مدة المهمة','new','stats',turn.length)+kc(done.length?avgRounds.toFixed(1):'—','متوسط جولات التعديل','fix','work',done.length)+'</div>'+
        '<p class="hint">المحصَّل: دفعات فواتير العملاء المتعاقدين ودفعات طلبات الموقع، مطروحاً منها المسترد. أجور الفريق: أجور المهام المصروفة في الفترة (رواتب الموظفين خارجها). الصافي: المحصَّل ناقص أجور الفريق، بالعملة الأكثر استخداماً.</p></section>'+
      '<div class="sgrid">'+
        '<section class="sec"><h3>من الطلب إلى الدفع</h3>'+(ord.length?'<div class="rbars">'+fun.map(function(f){ return bar(f[0],f[1],f[1]*100/fun[0][1],f[2]); }).join('')+'</div>'+
          '<p class="small muted">نسبة التحويل إلى دفع: <b>'+pct(fun[3][1],fun[0][1])+'</b>'+(lost.length?' · أكثر أسباب الخسارة: <b>'+esc(lost[0][0])+'</b> ('+lost[0][1]+')':'')+'</p>':'<div class="empty small">لا توجد طلبات في هذه الفترة.</div>')+'</section>'+
        '<section class="sec"><h3>مصادر العملاء</h3>'+(srcL.length?'<div class="rbars">'+srcL.slice(0,7).map(function(k){ return bar(esc(k),srcs[k].n,srcs[k].n*100/srcs[srcL[0]].n,'new',srcs[k].paid?'دفع '+srcs[k].paid:''); }).join('')+'</div><p class="small muted">عدد الطلبات من كل مصدر، ومن دفع منها.</p>':'<div class="empty small">لا توجد طلبات في هذه الفترة.</div>')+'</section>'+
        '<section class="sec"><h3>الدخل حسب الخدمة ('+esc(main)+')</h3>'+(svcL.length?'<div class="rbars">'+svcL.map(function(k){ return bar(esc(k),'<span dir="ltr">'+esc(mny(svc[k],main))+'</span>',svc[k]*100/svcMax,'ok'); }).join('')+'</div>':'<div class="empty small">لا يوجد دخل في هذه الفترة.</div>')+'</section>'+
        '<section class="sec"><h3>الأعمال على الموقع</h3>'+(wk.length?'<div class="nlog"><table class="rworks"><thead><tr><th>العمل</th><th>فتح الرابط</th><th>إعجابات</th><th>مشاهدات</th></tr></thead><tbody>'+
          wk.map(function(w){ return '<tr><td>'+esc(w.t)+'</td><td>'+w.o+'</td><td>'+w.l+'</td><td>'+w.v+'</td></tr>'; }).join('')+'</tbody></table></div><p class="small muted">فتح الرابط والإعجابات أرقام حقيقية. المشاهدات تشمل الرقم الابتدائي لكل عمل.</p>':'<div class="empty small">لا توجد أعمال بعد.</div>')+'</section>'+
        '<section class="sec"><h3>المحصَّل شهرياً ('+esc(main)+')</h3>'+col(byM,mx,'المحصَّل شهرياً')+'</section>'+
        '<section class="sec"><h3>المهام شهرياً</h3>'+col(td,Math.max.apply(null,td.concat(tc,[1])),'المهام المكتملة')+'<p class="small muted">الأعمدة: المهام المكتملة · جديدة في الفترة: '+created.length+' · نسخ مُسلَّمة: '+dv.reduce(function(a,b){return a+b},0)+'</p></section>'+
        '<section class="sec"><h3>الوضع الآن</h3><div class="sbars"><div class="sbar"><span class="n">مهام مفتوحة</span><span class="v">'+openT.length+'</span></div><div class="sbar"><span class="n">مهام تجاوزت موعدها المؤكد</span><span class="v">'+late.length+'</span></div>'+
          '<div class="sbar"><span class="n">فواتير متأخرة</span><span class="v">'+(R.invoices||[]).filter(function(x){return x.sent_at&&x.state==='overdue'}).length+'</span></div><div class="sbar"><span class="n">طلبات الموقع في الفترة</span><span class="v">'+ord.length+'<small>مدفوعة '+fun[3][1]+'</small></span></div></div></section>'+
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
