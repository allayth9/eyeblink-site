/* Eyeblink admin · orders — loaded after the files before it; all of admin/js shares one scope */
  /* ---------------- orders ---------------- */
  var ST={'new':'جديد','discussing':'قيد النقاش','confirmed':'مؤكَّد','awaiting-payment':'بانتظار الدفع','paid':'مدفوع','in-progress':'قيد التنفيذ','review':'بانتظار المراجعة','delivered':'مُسلَّم','cancelled':'ملغى'};
  function sampleOrders(){ return [{key:'order:demo',code:'EB-DEMO1',status:'new',createdAt:new Date().toISOString(),name:'طلب تجريبي',contact:'@client.account',details:'فيديو موشن 45 ثانية لإطلاق منتج. (هذا طلب تجريبي ليظهر لك شكل الصندوق)',package:'motion',packageName:'فيديو موشن غرافيك',addons:['كتابة السكريبت'],total:'85 $',lang:'ar',price:'',method:'',paid:false,paidAmount:'',notes:'',history:[{at:new Date().toISOString(),status:'new'}],email:'client@example.com',unread:1,messages:[{from:'client',text:'مرحباً، هل يمكن التسليم قبل نهاية الأسبوع؟',at:new Date().toISOString()}],demo:true}]; }
  function loadOrders(){
    if(!LIVE){ if(!ORDERS.length) ORDERS=sampleOrders(); if(TAB==='orders') renderOrders(); else renderTabs(); return; }
    fetch(API+'/orders',{headers:headers({})}).then(function(r){return r.json()}).then(function(j){ ORDERS=j.orders||[]; ORD_READY=true; if(TAB==='orders') renderOrders(); else renderTabs(); }).catch(function(){});
  }
  function contactLink(c,text){
    c=String(c||'').trim(); var digits=c.replace(/[^0-9]/g,'');
    if(/@/.test(c) && /\./.test(c.split('@')[1]||'')) return 'mailto:'+c+'?body='+encodeURIComponent(text);
    if(/^\+?[0-9 ()-]{8,}$/.test(c)) return 'https://wa.me/'+digits+'?text='+encodeURIComponent(text);
    var h=c.replace(/^@/,'').replace(/^https?:\/\/(www\.)?instagram\.com\//,'').split(/[/?]/)[0];
    return h? 'https://ig.me/m/'+h : '';
  }
  function fill(tpl,o){
    var pm=(P&&P.payments)||{}, m=((C.payments&&C.payments.methods)||[]).filter(function(x){return x.id===o.method})[0];
    return tpl.replace(/\{(\w+)\}/g,function(_,k){ return ({name:o.name,code:o.code,package:o.packageName||o.package,price:o.price||o.total,method:m?m.name:'—',details:o.method?(pm[o.method]||''):''})[k]||''; });
  }
  /* ---------- the payment path of one order: four clear steps, one button at a time ---------- */
  function pnum(v){ var n=parseFloat(String(v==null?'':v).replace(/,/g,'').replace(/[^0-9.]/g,'')); return isFinite(n)?n:0; }
  function pcur(o){ return (String(o.price||o.total||'').match(/[^\d\s.,]+/)||[(C.packages&&C.packages.currency)||'$'])[0]; }
  function pfmt(n,c){ var v=(Math.round(n*100)/100).toFixed(n%1?2:0); return c==='$'||c==='€'?c+v:v+' '+c; }
  function payState(o){ var Pm=C.payments||{}, plan=o.plan||Pm.defaultPlan||'full', pct=+(o.depositPct||Pm.depositPct||50), total=pnum(o.price), dep=o.deposit&&o.deposit.paid;
    var stage= plan==='split'? (dep?'final':'deposit') : 'full', amt= stage==='deposit'? Math.round(total*pct)/100 : stage==='final'? Math.max(0,total-pnum(o.deposit&&o.deposit.amount)) : total;
    var asked=o.payInfo&&(o.payInfo.stage||'full')===stage, receipt=asked&&(o.messages||[]).some(function(m){return m.kind==='receipt'&&m.at>o.payInfo.at});
    var done= o.paid || (stage==='full'&&o.paid);
    return {plan:plan,pct:pct,total:total,stage:stage,amt:amt,asked:asked,receipt:receipt,done:done}; }
  var STG={full:'المبلغ كامل',deposit:'العربون',final:'الباقي'};
  function payFlow(o,k,methods){
    var S=payState(o), c=pcur(o), pm=(P&&P.payments)||{}, m=methods.filter(function(x){return x.id===o.method})[0], has=!!(o.method&&pm[o.method]);
    var step=function(n,ok,title,body){ return '<li class="pstep'+(ok?' ok':'')+'"><i>'+(ok?'✓':n)+'</i><div><b>'+title+'</b>'+body+'</div></li>'; };
    var methodSel='<select data-of="method" data-pmethod="'+k+'"><option value="">اختر…</option>'+methods.map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===o.method?' selected':'')+'>'+esc(x.name)+'</option>'}).join('')+'</select>';
    var acct= !o.method? '' : has? '<div class="pnote ok">✓ حساب الاستلام جاهز: <span dir="auto">'+esc(String(pm[o.method]).split('\n')[0].slice(0,60))+'</span></div>'
      : '<div class="pnote warn">لم تكتب بعد الحساب الذي يدفع إليه العميل عبر '+esc(m?m.name:o.method)+'. اكتبه هنا مرة واحدة ويُحفظ لجميع الطلبات:<textarea data-pacct="'+esc(o.method)+'" dir="auto" placeholder="مثال: إيميل PayPal أو Binance ID أو اسم المستلم والمدينة"></textarea></div>';
    var ask='', got='';
    if(S.done) got='<div class="pnote ok">✓ مدفوع بالكامل'+(o.invoice?' · فاتورة <b dir="ltr">'+esc(o.invoice.no)+'</b> <button class="btn sm" type="button" data-oinv="'+k+'" data-kind="final">أعد إرسالها</button>':'')+'</div>';
    else {
      ask='<button class="btn sm primary" type="button" data-pask="'+k+'"'+(o.email?'':' disabled')+'>'+(S.asked?'أعد إرسال طلب الدفع':'اطلب الدفع من العميل')+' · <span dir="ltr">'+esc(pfmt(S.amt,c))+'</span>'+(S.stage!=='full'?' ('+STG[S.stage]+')':'')+'</button>'+
        (S.asked?'<div class="pnote">'+(S.receipt?'📎 رفع العميل إيصال الدفع. تأكّد من وصول المبلغ، ثم اضغط «وصل الدفع»':'⏳ وصل العميلَ طلبُ دفع '+esc(o.payInfo.amount)+' · '+esc(new Date(o.payInfo.at).toLocaleString('ar',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+(o.payInfo.reminded?' · ⏰ وصله تذكير':'')+'</div>'):'');
      got='<button class="btn sm'+(S.asked?' primary':'')+'" type="button" data-pgot="'+k+'">✓ وصل '+STG[S.stage]+' · <span dir="ltr">'+esc(pfmt(S.amt,c))+'</span></button><div class="pnote">تُنشأ فاتورة برقم تسلسلي وتُرسل إلى العميل بالبريد الإلكتروني تلقائياً.</div>';
    }
    var depLine= o.deposit&&o.deposit.paid? '<div class="pnote ok">✓ العربون مدفوع <span dir="ltr">'+esc(pfmt(pnum(o.deposit.amount),c))+'</span>'+(o.deposit.invoice?' · فاتورة <b dir="ltr">'+esc(o.deposit.invoice.no)+'</b> <button class="btn sm" type="button" data-oinv="'+k+'" data-kind="deposit">أعد إرسالها</button>':'')+'</div>':'';
    return '<div class="pflow"><div class="ph"><b>مسار الدفع</b><span class="small muted">'+(S.done?'مكتمل':S.stage==='final'?'باقي الدفعة النهائية':'خطوة بخطوة')+'</span></div><ol>'+
      step(1,S.total>0,'السعر النهائي','<input data-of="price" dir="ltr" value="'+esc(o.price)+'" placeholder="'+esc(o.total)+'">')+
      step(2,true,'خطة الدفع','<div class="prow"><select data-of="plan" data-pplan="'+k+'"><option value="full"'+(S.plan==='full'?' selected':'')+'>المبلغ كاملاً دفعة واحدة</option><option value="split"'+(S.plan==='split'?' selected':'')+'>عربون والباقي قبل التسليم</option></select>'+
        (S.plan==='split'?'<label class="pct">العربون <input data-of="depositPct" type="number" min="10" max="90" value="'+esc(S.pct)+'">%</label>':'')+'</div>')+
      step(3,has,'طريقة الدفع وحساب الاستلام',methodSel+acct)+
      step(4,S.done,'الدفع',depLine+ask+got)+
    '</ol></div>';
  }
  function orderReq(o,extra,btn,okMsg){
    var box=btn.closest('.order'), d=readOrderForm(box); Object.assign(d,extra||{}); d.key=o.key;
    if(!LIVE||o.demo){ toast('يعمل على الموقع المنشور',true); return Promise.resolve(); }
    btn.disabled=true;
    return fetch(API+'/orders',{method:'PATCH',headers:headers({'content-type':'application/json'}),body:JSON.stringify(d)}).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'fail'); return j; }); })
      .then(function(j){ Object.assign(o,j.order); renderOrders(); var d2=document.querySelector('[data-okey="'+o.key+'"]'); if(d2) d2.open=true; toast(okMsg); })
      .catch(function(e){ btn.disabled=false; toast(({'set price and method first':'اكتب السعر واختر طريقة الدفع أولاً','no private details for this method':'اكتب حساب الاستلام بالخطوة 3'})[e.message]||'تعذّر ذلك، حاول مرة أخرى',true); });
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-pask],[data-pgot]'); if(!b) return;
    var o=orderOf(b.dataset.pask||b.dataset.pgot), box=b.closest('.order'), d=readOrderForm(box);
    if(b.dataset.pask){
      if(!pnum(d.price)){ toast('اكتب السعر النهائي بالخطوة 1',true); box.querySelector('[data-of="price"]').focus(); return; }
      if(!d.method){ toast('اختر طريقة الدفع بالخطوة 3',true); box.querySelector('[data-pmethod]').focus(); return; }
      var ta=box.querySelector('[data-pacct]'), save=Promise.resolve();
      if(ta){ var v=ta.value.trim(); if(!v){ toast('اكتب حساب الاستلام بالخطوة 3',true); ta.focus(); return; }
        P=P||{}; P.payments=P.payments||{}; P.payments[ta.dataset.pacct]=v;
        save= LIVE? fetch(API+'/private',{method:'PUT',headers:headers({'content-type':'application/json'}),body:JSON.stringify(P)}).then(function(r){ if(!r.ok) throw 0; PSAVED=JSON.stringify(P); }) : Promise.resolve(savePrivDraft()); }
      save.then(function(){ return orderReq(o,{sendPayment:true},b,'وصل طلب الدفع لحساب العميل وإيميله'); }).catch(function(){ toast('لم يُحفظ حساب الاستلام، حاول مرة أخرى',true); });
    } else {
      var S=payState(Object.assign({},o,d)), extra= S.stage==='deposit'? {depositPaid:true} : {paid:true};
      orderReq(o,extra,b,'تمّ! أُنشئت الفاتورة وأُرسلت إلى العميل');
    }
  });
  document.addEventListener('change',function(e){ var el=e.target; if(!el.matches('[data-pmethod],[data-pplan]')) return;
    var o=orderOf(el.dataset.pmethod||el.dataset.pplan), box=el.closest('.order'), d=readOrderForm(box); Object.assign(o,{method:d.method,plan:d.plan,price:d.price,depositPct:d.depositPct});
    var fl=box.querySelector('.pflow'); if(fl){ var tmp=document.createElement('div'); tmp.innerHTML=payFlow(o,esc(o.key),((C.payments&&C.payments.methods)||[])); fl.replaceWith(tmp.firstChild); } });

  /* ---------- CRM: opportunities from outside the site, follow-ups, contact log, loss reasons, the funnel ---------- */
  var SRC={website:'الموقع',instagram:'إنستغرام',whatsapp:'واتساب',referral:'توصية',email:'إيميل',meeting:'لقاء',other:'غيره'};
  var LOST_DEF=['السعر','التوقيت','توقّف عن الرد','اختار جهة أخرى','غير مناسب لنا','غيره'];
  var OPEN_ST=['new','discussing','confirmed','awaiting-payment'], WON_ST=['paid','in-progress','review','delivered'], NEWOPP=false;
  function lostReasons(){ var l=P&&P.crm&&P.crm.lostReasons; return l&&l.length?l:LOST_DEF; }
  function todayISO(){ var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function hiddenOpp(o){ return !!o.manual && !o.clientVisible && ['new','discussing','cancelled'].indexOf(o.status)>=0; }
  function srcOf(o){ return o.source||'website'; }
  function dueFollow(o){ return !!o.followUp && o.followUp<=todayISO() && o.status!=='cancelled' && o.status!=='delivered'; }
  function srcSel(attr,val){ return '<select '+attr+'>'+Object.keys(SRC).map(function(s){ return '<option value="'+s+'"'+(s===val?' selected':'')+'>'+SRC[s]+'</option>'; }).join('')+'</select>'; }
  function fdate(s){ return s? new Date(s+'T12:00:00').toLocaleDateString('ar-u-nu-latn',{day:'numeric',month:'short'}) : ''; }
  function topOf(arr){ var m={}; arr.forEach(function(x){ if(x) m[x]=(m[x]||0)+1; }); return Object.keys(m).sort(function(a,b){ return m[b]-m[a]; }).map(function(k){ return [k,m[k]]; }); }
  function funnel(){
    var open=ORDERS.filter(function(o){ return OPEN_ST.indexOf(o.status)>=0; }), val=open.reduce(function(a,o){ return a+pnum(o.price||o.total); },0);
    var since=Date.now()-30*864e5, recent=ORDERS.filter(function(o){ return Date.parse(o.createdAt)>=since; }), won=recent.filter(function(o){ return o.paid||WON_ST.indexOf(o.status)>=0; });
    var paidSum=ORDERS.filter(function(o){return o.paid}).reduce(function(a,o){ return a+(parseFloat(o.paidAmount||o.price)||0); },0);
    var srcs=topOf(ORDERS.map(srcOf)), lost=topOf(ORDERS.filter(function(o){ return o.status==='cancelled'; }).map(function(o){ return o.lostReason; }));
    var due=ORDERS.filter(dueFollow).length;
    return '<div class="kcs">'+kc(open.length,'فرص مفتوحة'+(val?' · <span dir="ltr">'+esc(pfmt(val,(C.packages&&C.packages.currency)||'$'))+'</span>':''),'new','orders')+
      kc(due,'بحاجة إلى متابعة اليوم','fix','k_wait')+
      kc(recent.length?Math.round(won.length*100/recent.length)+'%':'—','تحوّلت إلى مشاريع (آخر 30 يوماً'+(recent.length?' · '+won.length+' من '+recent.length:'')+')','info','reports',won.length)+
      kc('<span dir="ltr">'+paidSum+'</span>','مجموع المدفوع','ok','payments',paidSum>0)+'</div>'+
      (srcs.length||lost.length?'<p class="small muted crm-line">'+(srcs.length?'مصادر الفرص: '+srcs.slice(0,4).map(function(x){ return esc(SRC[x[0]]||x[0])+' <b>'+x[1]+'</b>'; }).join(' · '):'')+(lost.length?(srcs.length?'<span class="sep">|</span>':'')+'أكثر أسباب الخسارة: '+esc(lost[0][0])+' <b>'+lost[0][1]+'</b>':'')+'</p>':'');
  }
  function oppForm(){
    return '<form class="opp" id="oppForm"><div class="ph"><b>فرصة جديدة</b><span class="small muted">تواصل معك أحد من خارج الموقع؟ سجّله هنا، ويمرّ بالمراحل ومسار الدفع نفسها</span></div>'+
      '<div class="row"><div class="field"><label>الاسم *</label><input name="name" dir="auto" required></div><div class="field"><label>التواصل (رقم أو حساب)</label><input name="contact" dir="ltr"></div></div>'+
      '<div class="row"><div class="field"><label>البريد الإلكتروني (اختياري)</label><input name="email" type="email" dir="ltr"></div><div class="field"><label>المصدر</label>'+srcSel('name="source"','instagram')+'</div></div>'+
      '<div class="row"><div class="field"><label>المطلوب باختصار</label><input name="title" dir="auto" placeholder="مثال: فيديو إطلاق مطعم"></div><div class="field"><label>القيمة التقديرية</label><input name="value" dir="ltr" placeholder="300 $"></div></div>'+
      '<div class="field"><label>التفاصيل</label><textarea name="details" dir="auto"></textarea></div>'+
      '<div class="row"><div class="field"><label>الخطوة التالية</label><input name="nextStep" dir="auto" placeholder="مثال: إرسال عرض السعر"></div><div class="field"><label>موعد المتابعة</label><input name="followUp" type="date" value="'+todayISO()+'"></div></div>'+
      '<div class="actions"><button class="btn primary sm" type="submit">إضافة الفرصة</button><button class="btn sm" type="button" data-oppx>إلغاء</button></div></form>';
  }
  function crmFields(o,k){
    var cancelled=o.status==='cancelled', canConv=o.email && WON_ST.concat(['confirmed','awaiting-payment']).indexOf(o.status)>=0;
    return '<div class="crm">'+(hiddenOpp(o)?'<p class="small hid">🔒 مخفية عن العميل: لا تظهر في حسابه ولا يصله أي بريد حتى تصبح «مؤكَّد»</p>':'')+
      '<div class="row"><div class="field"><label>المصدر</label>'+srcSel('data-of="source"',srcOf(o))+'</div><div class="field"><label>موعد المتابعة</label><input type="date" data-of="followUp" value="'+esc(o.followUp||'')+'"></div></div>'+
      '<div class="field"><label>الخطوة التالية</label><input data-of="nextStep" dir="auto" value="'+esc(o.nextStep||'')+'" placeholder="ما الذي يجب أن يحدث بعد ذلك؟"></div>'+
      '<div class="field lostf"'+(cancelled?'':' hidden')+'><label>لماذا لم يكتمل؟</label><select data-of="lostReason"><option value="">اختر السبب…</option>'+lostReasons().map(function(r){ return '<option'+(r===o.lostReason?' selected':'')+'>'+esc(r)+'</option>'; }).join('')+(o.lostReason&&lostReasons().indexOf(o.lostReason)<0?'<option selected>'+esc(o.lostReason)+'</option>':'')+'</select></div>'+
      (o.email?'':'<div class="field"><label>بريد العميل الإلكتروني (لحسابه ومسار الدفع)</label><input data-of="email" type="email" dir="ltr" placeholder="name@example.com"></div>')+
      '<div class="touch"><div class="small muted">سجل التواصل</div><div class="trow">'+srcSel('data-tch','whatsapp')+'<input data-tnote dir="auto" placeholder="ماذا حدث؟ مثال: أرسلتُ له الأسعار، وسيردّ غداً"><button class="btn sm" type="button" data-otouch="'+k+'">سجّل</button></div>'+
        ((o.touches||[]).length?'<ul class="tlist">'+o.touches.slice(0,6).map(function(t){ return '<li><b>'+esc(SRC[t.channel]||t.channel)+'</b> '+esc(t.note)+'<span class="small muted"> · '+esc(new Date(t.at).toLocaleDateString('ar-u-nu-latn',{day:'numeric',month:'short'}))+'</span></li>'; }).join('')+'</ul>':'')+'</div>'+
      (canConv?'<button class="btn sm conv" type="button" data-oconv="'+k+'">حوّله لعميل متعاقد ←</button>':'')+
    '</div>';
  }
  function api(path,method,body){ return fetch(API+path,{method:method,headers:headers({'content-type':'application/json'}),body:JSON.stringify(body)}).then(function(r){ return r.json().then(function(j){ j.status=r.status; return j; },function(){ return {status:r.status}; }); }); }
  // a won order becomes a contracted client: the client record, the account (or the existing one upgraded), then the profile with the login details
  function convertClient(o,b){
    if(!LIVE||o.demo){ toast('يعمل على الموقع المنشور',true); return; }
    var em=o.email, phone=/^\+?[0-9 ()-]{8,}$/.test(o.contact||'')?o.contact.trim():''; b.disabled=true;
    fetch(API+'/work?admin=1&profile='+encodeURIComponent(em),{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).catch(function(){ return {}; })
      .then(function(p){ return p&&p.ok&&p.client? null : api('/work','POST',{action:'clientSave',email:em,name:o.name,phone:phone}); })
      .then(function(){ return api('/access','POST',{action:'createAccount',email:em,name:o.name,lang:o.lang==='en'?'en':'ar'}); })
      .then(function(r){
        if(r.ok){ PKG={email:em,name:o.name,password:r.password,link:r.link,lang:r.lang,phone:phone,sent:r.sent}; return 'جاهز: هذه بيانات دخول العميل، أرسلها إليه'; }
        if(r.error==='exists') return api('/access','POST',{action:'setRole',email:em,role:'client'}).then(function(){ return 'لديه حساب مسبقاً، ففُعّلت له مساحة العمل'; });
        throw new Error(r.error||'fail'); })
      .then(function(msg){ return api('/orders','PATCH',{key:o.key,link:true}).then(function(){ return msg; },function(){ return msg; }); })
      .then(function(msg){ toast(msg); TAB='clients'; CL=null; render(); loadUsers(); loadClients(); loadProfile(em,'overview'); scrollTo(0,0); })
      .catch(function(){ b.disabled=false; toast('تعذّر التحويل، حاول مرة أخرى',true); });
  }
  document.addEventListener('change',function(e){ var el=e.target; if(TAB!=='orders') return;
    if(el.matches('.order [data-of="status"]')){ var lf=el.closest('.order').querySelector('.lostf'); if(lf) lf.hidden=el.value!=='cancelled'; } });
  document.addEventListener('submit',function(e){ var f=e.target; if(f.id!=='oppForm') return; e.preventDefault();
    var d={action:'manual'}; [].forEach.call(f.elements,function(el){ if(el.name) d[el.name]=el.value.trim(); });
    if(!d.name){ toast('اكتب الاسم',true); f.elements.name.focus(); return; }
    if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)){ toast('البريد الإلكتروني غير صحيح',true); f.elements.email.focus(); return; }
    var add=function(o){ ORDERS.unshift(o); NEWOPP=false; OFILTER='all'; OOPEN=o.key; OPICK=true; renderOrders(); var dd=document.querySelector('[data-okey="'+o.key+'"]'); if(dd){ dd.open=true; dd.scrollIntoView({block:'center'}); } toast('أُضيفت الفرصة '+o.code); };
    if(!LIVE){ var now=new Date().toISOString(); add({key:'order:demo-'+Date.now(),code:'EB-DEMO'+(ORDERS.length+1),status:'new',createdAt:now,name:d.name,contact:d.contact,email:d.email,details:d.details||'—',packageName:d.title||'فرصة',total:d.value,source:d.source,manual:true,nextStep:d.nextStep,followUp:d.followUp,touches:[],messages:[],history:[{at:now,status:'new'}],demo:true}); return; }
    var b=f.querySelector('[type=submit]'); b.disabled=true;
    api('/orders','POST',d).then(function(j){ if(!j.ok) throw new Error(j.error); add(j.order); }).catch(function(err){ b.disabled=false; toast(err.message==='email'?'البريد الإلكتروني غير صحيح':'لم تُحفظ، حاول مرة أخرى',true); }); });
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-oppnew],[data-oppx],[data-otouch],[data-oconv],[data-lostsave]'); if(!b) return;
    if(b.hasAttribute('data-oppnew')){ NEWOPP=!NEWOPP; renderOrders(); var f=$('#oppForm'); if(f) f.elements.name.focus(); return; }
    if(b.hasAttribute('data-oppx')){ NEWOPP=false; renderOrders(); return; }
    if(b.dataset.oconv){ convertClient(orderOf(b.dataset.oconv),b); return; }
    if(b.hasAttribute('data-lostsave')){ var l=$('#lostList').value.split('\n').map(function(s){ return s.trim(); }).filter(Boolean).slice(0,20);
      P=P||{}; P.crm=Object.assign({},P.crm,{lostReasons:l});
      if(!LIVE){ savePrivDraft(); renderOrders(); toast('حُفظت الأسباب'); return; }
      b.disabled=true; fetch(API+'/private',{method:'PUT',headers:headers({'content-type':'application/json'}),body:JSON.stringify(P)}).then(function(r){ if(!r.ok) throw 0; PSAVED=JSON.stringify(P); renderOrders(); toast('حُفظت الأسباب'); }).catch(function(){ b.disabled=false; toast('لم تُحفظ',true); }); return; }
    var o=orderOf(b.dataset.otouch), box=b.closest('.touch'), note=box.querySelector('[data-tnote]').value.trim(), ch=box.querySelector('[data-tch]').value;
    if(!note){ toast('اكتب ما حدث',true); box.querySelector('[data-tnote]').focus(); return; }
    var addT=function(t){ o.touches=t||[{at:new Date().toISOString(),channel:ch,note:note}].concat(o.touches||[]); renderOrders(); var dd=document.querySelector('[data-okey="'+o.key+'"]'); if(dd) dd.open=true; toast('سُجّل التواصل'); };
    if(!LIVE||o.demo){ addT(); return; }
    b.disabled=true; api('/orders','PATCH',{key:o.key,touch:{channel:ch,note:note}}).then(function(j){ if(!j.ok) throw 0; addT(j.order.touches); }).catch(function(){ b.disabled=false; toast('لم يُسجَّل',true); });
  });

  /* ---------- documents: a quote and an agreement per order, each a private link the client opens, saves as PDF and accepts / signs ---------- */
  var DTYPE={quote:'عرض سعر',agreement:'اتفاقية'}, DOCS={}, DED=null;
  var DDEF={
    ar:{includes:['مساحة عمل خاصة على الموقع لمتابعة المشروع ومراجعة النسخ واعتمادها','الموسيقى والمؤثرات الصوتية المرخّصة لاستخدامها ضمن المشروع','نسخ بالمقاسات المتفق عليها لكل منصة','الملف النهائي بجودة عالية (MP4)'],
        excludes:['التصوير الميداني ومعداته، ما لم يُذكر في البنود','الملفات المفتوحة للمشروع (Premiere Pro / After Effects)','تكاليف الإعلانات الممولة','تراخيص لقطات أو موسيقى يطلبها العميل من خارج مكتباتنا']},
    en:{includes:['A private workspace on our site to follow the project and review and approve each version','Licensed music and sound effects for use within this project','Versions in the agreed sizes for each platform','Final high-quality file (MP4)'],
        excludes:['On-location filming and equipment, unless listed above','Open project files (Premiere Pro / After Effects)','Paid advertising costs','Licences for footage or music the client requests from outside our libraries']}};
  // shortcut: fixed pegs (KWD is a basket, ~0.307) and a hand-set SYP rate; no live rates service, update the SYP rate when it moves
  var FXC=[['$','دولار أمريكي',1],['AED','درهم إماراتي',3.6725],['SAR','ريال سعودي',3.75],['QAR','ريال قطري',3.64],['KWD','دينار كويتي',0.307],['BHD','دينار بحريني',0.376],['OMR','ريال عُماني',0.3845],['SYP','ليرة سورية',13000]];
  // the pound follows the daily market price (sp-today, via /api/fx) unless the studio typed a rate after that update
  var FXLIVE=null;
  function loadFx(){ if(!LIVE) return; fetch(API+'/fx',{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ FXLIVE=j; if(TAB==='today') renderTabs(); }).catch(function(){ FXLIVE={ok:false}; }); }
  function fxRate(c){ var o=(P&&P.fx)||{}, at=(P&&P.fxAt)||{}; if(c==='SYP'&&FXLIVE&&+FXLIVE.SYP&&(!at.SYP||Date.parse(FXLIVE.at)>Date.parse(at.SYP))) return +FXLIVE.SYP; if(+o[c]) return +o[c]; var x=FXC.filter(function(k){ return k[0]===c; })[0]; return x?x[2]:1; }
  function fxConv(v,from,to){ var n=pnum(v)/fxRate(from)*fxRate(to); return to==='SYP'?Math.round(n):Math.round(n*100)/100; }
  function curSel(attr,val){ var known=FXC.some(function(k){ return k[0]===val; }); return '<select '+attr+'>'+FXC.map(function(k){ return '<option value="'+k[0]+'"'+(k[0]===val?' selected':'')+'>'+k[1]+' · '+k[0]+'</option>'; }).join('')+(val&&!known?'<option selected value="'+esc(val)+'">'+esc(val)+'</option>':'')+'</select>'; }
  function fxBox(c){ return c&&c!=='$'&&FXC.some(function(k){ return k[0]===c; })?'<span class="fx small muted">1$ = <input data-dfx="'+c+'" dir="ltr" value="'+fxRate(c)+'"> '+c+(c==='SYP'&&FXLIVE&&FXLIVE.at?' · <span title="سعر المبيع بدمشق">تلقائي من «الليرة اليوم» · '+esc(new Date(FXLIVE.at).toLocaleDateString('ar-u-nu-latn',{day:'numeric',month:'short'}))+'</span>':'')+'</span>':''; }
  function saveFx(c,v){ P=P||{}; P.fx=Object.assign({},P.fx); P.fx[c]=+v; P.fxAt=Object.assign({},P.fxAt); P.fxAt[c]=new Date().toISOString(); if(!LIVE){ savePrivDraft(); return; } fetch(API+'/private',{method:'PUT',headers:headers({'content-type':'application/json'}),body:JSON.stringify(P)}).then(function(r){ if(!r.ok) throw 0; PSAVED=JSON.stringify(P); toast('حُفظ سعر الصرف'); }).catch(function(){ toast('لم يُحفظ سعر الصرف',true); }); }
  document.addEventListener('change',function(e){ var el=e.target;
    if(el.dataset.dfx){ if(+el.value>0) saveFx(el.dataset.dfx,el.value); return; }
    // documents: switching currency converts every price and the discount from the old currency to the new one
    if(el.hasAttribute('data-dcur')&&DED){ var b=DED.b, from=b.cur||'$', to=el.value; b.items.forEach(function(x){ x.unit=fxConv(x.unit,from,to); }); if(pnum(b.discount)) b.discount=fxConv(b.discount,from,to); b.cur=to; drawDoc(); return; }
    // team task: the fee follows the currency
    if(el.hasAttribute('data-tcur')){ var fee=el.form&&el.form.elements.fee, from2=el.dataset.prev||'$'; if(fee&&pnum(fee.value)) fee.value=fxConv(fee.value,from2,el.value); el.dataset.prev=el.value; } });
  function dset(){ var d=(P&&P.docs)||{}, s=(C.settings||{});
    return {studioName:d.studioName||'Eyeblink Studio', studioPlace:d.studioPlace||'', studioContact:d.studioContact||[s.whatsapp,s.email].filter(Boolean).join('\n'),
      payMethods:d.payMethods||'Binance Pay (USDT) · Western Union', payIds:d.payIds||['binance','westernunion'], payOther:d.payOther||'', days:d.days||10, revisions:d.revisions!=null?d.revisions:2, valid:d.valid||14, plan:d.plan||'split', pct:d.pct||50,
      approvalDays:d.approvalDays||7, silenceDays:d.silenceDays||14, archiveDays:d.archiveDays||60, jurisdiction:d.jurisdiction||'', lists:d.lists||{}}; }
  function dlists(lang){ var L=dset().lists[lang]||{}; return {includes:L.includes||DDEF[lang].includes, excludes:L.excludes||DDEF[lang].excludes}; }
  function revAr(n){ return n==0?'لا يشمل جولات تعديل':'يشمل '+(n==1?'جولة واحدة':n==2?'جولتان':n+' جولات')+' من التعديلات'; }
  // the agreement's terms, written from the deal's numbers; the studio can still rewrite any of them for one client
  function clausesFor(lang,v){
    var en=lang==='en', total=v.total, pay;
    if(!en){
      pay= v.plan==='full' ? 'قيمة المشروع الإجمالية '+total+'، يدفعها الطرف الثاني كاملة قبل بدء التنفيذ. ويبدأ العمل بعد وصول المبلغ، وتصدر فاتورة بالدفعة'
        : 'قيمة المشروع الإجمالية '+total+'. يدفع الطرف الثاني '+v.pct+'% منها عربوناً قبل بدء التنفيذ، ويدفع الباقي قبل استلام النسخ النهائية. ويبدأ العمل بعد وصول العربون، وتصدر فاتورة بكل دفعة';
      return [
        {h:'موضوع الاتفاقية', p:'يتفق الطرف الأول ('+v.studio+') مع الطرف الثاني ('+v.client+') على تنفيذ مشروع «'+v.title+'» وفق نطاق العمل والمخرجات المبيّنة أعلاه، ووفق البريف المعتمد من الطرفين'},
        {h:'القيمة وطريقة الدفع', p:pay+(v.payMethods?'. طرق الدفع المعتمدة: '+v.payMethods+'، وأي رسوم تحويل يتحملها الطرف الثاني':'')},
        {h:'مدة التنفيذ', p:'مدة التنفيذ المتوقعة '+(v.days?v.days+' يوم عمل':'يُتفق عليها عند البدء')+'، تبدأ من تاريخ استلام العربون والمواد اللازمة كاملة. ولا تُحتسب ضمنها أي فترة تأخير سببها تأخر الطرف الثاني في إرسال المواد أو المحتوى، أو في الرد والملاحظات، أو طلب تعديلات خارج نطاق العمل'},
        {h:'المواد والمحتوى', p:'يلتزم الطرف الثاني بتزويد الطرف الأول بكل ما يلزم للتنفيذ قبل البدء، مثل اللقطات والصور والشعارات والنصوص والهوية البصرية والموافقات اللازمة. ويقرّ بأنه يملك حق استخدام كل ما يرسله، ويتحمل وحده أي مطالبة تتعلق به'},
        {h:'مساحة العمل', p:'يحصل الطرف الثاني طوال مدة المشروع على حساب في مساحة عمل Eyeblink على الموقع، يتابع منه مراحل التنفيذ، ويستلم النسخ ويراجعها ويعتمدها، ويرسل ملاحظاته وملفاته، ويجد فواتيره. وتُعدّ الموافقات والملاحظات المرسلة عبرها موافقات كتابية بموجب هذه الاتفاقية'},
        {h:'التعديلات', p:'المشروع '+revAr(v.revisions)+'. جولة التعديل هي قائمة ملاحظات واحدة مجمّعة على نسخة واحدة. ولا يُعد تعديلاً تغيير الفكرة أو السكريبت بعد اعتماده، أو إضافة مطالب جديدة، أو إعادة تنفيذ عمل معتمد، وتُحتسب هذه أعمالاً إضافية'},
        {h:'الأعمال الإضافية', p:'أي طلب خارج نطاق العمل أو زيادة في حجمه يُسعَّر ويُتفق عليه كتابياً قبل تنفيذه، وقد يغيّر موعد التسليم'},
        {h:'اعتماد المخرجات', p:'تُعدّ النسخة معتمدة عند موافقة الطرف الثاني عليها كتابياً بأي وسيلة تواصل معتمدة بين الطرفين، أو إذا مضى '+v.silenceDays+' يوماً على تسليمها دون ملاحظات. وإذا تأخر الرد أكثر من '+v.approvalDays+' أيام، يُعدَّل موعد التسليم بقدر التأخير'},
        {h:'الموسيقى والعناصر المرخّصة', p:'تُستخدم الموسيقى والمؤثرات واللقطات والخطوط المرخّصة وفق شروط مزوّديها، ولاستخدامها ضمن هذا المشروع فقط. ولا تشمل القيمة شراء تراخيص إضافية أو عناصر مدفوعة يطلبها الطرف الثاني، وتُحتسب تكلفتها منفصلة'},
        {h:'الملفات المفتوحة', p: v.sourceFiles ? 'تشمل قيمة المشروع تسليم الملفات المفتوحة للمشروع بعد سداد كامل القيمة، دون العناصر المرخّصة التي لا تسمح شروطها بنقلها'
          : 'لا تشمل قيمة المشروع تسليم الملفات المفتوحة أو المصدرية (مثل ملفات Premiere Pro وAfter Effects)، وتُسلَّم المخرجات النهائية بالصيغ المتفق عليها فقط، ما لم يُتفق كتابياً على غير ذلك'},
        {h:'الملكية وحقوق الاستخدام', p:'تنتقل حقوق استخدام المخرجات النهائية إلى الطرف الثاني بعد سداد كامل قيمة المشروع، ولا يحق له نشرها أو استخدامها قبل ذلك. وتُرسل نسخ المراجعة بجودة مخفّضة أو بعلامة مائية'},
        {h:'حق عرض الأعمال', p: v.portfolio ? 'يحتفظ الطرف الأول بحقه في عرض المشروع أو مقاطع منه ضمن أعماله وملف أعماله ومنصاته بعد نشره من الطرف الثاني، ما لم يُتفق كتابياً على خلاف ذلك'
          : 'لا يعرض الطرف الأول المشروع ضمن أعماله أو على منصاته إلا بموافقة كتابية من الطرف الثاني'},
        {h:'إلغاء المشروع', p:'إذا ألغى الطرف الثاني المشروع بعد بدء التنفيذ فلا يُسترد العربون، ويلتزم بسداد قيمة ما أُنجز حتى تاريخ الإلغاء إن تجاوزت العربون'},
        {h:'التأخر في الدفع', p:'إذا تأخر الطرف الثاني عن سداد أي دفعة مستحقة، يحق للطرف الأول إيقاف العمل أو تأجيل التسليم حتى استلامها، دون أن يُعد ذلك إخلالاً بالتزاماته'},
        {h:'السرية', p:'يلتزم الطرفان بعدم مشاركة أي ملفات أو معلومات خاصة بالمشروع مع أي طرف ثالث دون موافقة الطرف الآخر'},
        {h:'حفظ الملفات', p:'يحتفظ الطرف الأول بنسخة من ملفات المشروع مدة '+v.archiveDays+' يوماً من تاريخ التسليم النهائي، ولا يلتزم بعدها بحفظها أو توفير نسخ منها'},
        {h:'أحكام عامة', p:'تُعدّ المراسلات والموافقات عبر البريد الإلكتروني وتطبيقات المراسلة المعتمدة بين الطرفين جزءاً مكمّلاً لهذه الاتفاقية. ولا يُعتدّ بأي تعديل عليها ما لم يكن موثّقاً وموافَقاً عليه من الطرفين، وعند التعارض مع أي اتفاق سابق تُعدّ هذه الاتفاقية المرجع المعتمد. ويسعى الطرفان لحل أي خلاف ودياً، وإن تعذّر ذلك '+(v.jurisdiction?'فالمرجع: '+v.jurisdiction:'فالاختصاص للمحاكم المختصة في بلد الطرف الأول')} ];
    }
    pay= v.plan==='full' ? 'The total project value is '+total+', paid in full by the Client before work begins. Work starts once payment is received, and an invoice is issued for it'
      : 'The total project value is '+total+'. The Client pays '+v.pct+'% as a deposit before work begins and the balance before receiving the final versions. Work starts once the deposit is received, and an invoice is issued for each payment';
    var rev= v.revisions==0?'includes no revision rounds':'includes '+(v.revisions==1?'one revision round':v.revisions==2?'two revision rounds':v.revisions+' revision rounds');
    return [
      {h:'Purpose', p:'The First Party ('+v.studio+') agrees with the Second Party ('+v.client+') to produce the project “'+v.title+'” according to the scope and deliverables set out above and the brief approved by both parties'},
      {h:'Value and payment', p:pay+(v.payMethods?'. Accepted payment methods: '+v.payMethods+'; any transfer fees are borne by the Client':'')},
      {h:'Timeline', p:'The expected timeline is '+(v.days?v.days+' working days':'agreed at kick-off')+', starting from receipt of the deposit and all required materials. It excludes any delay caused by the Client sending materials late, replying or giving feedback late, or requesting changes outside the scope'},
      {h:'Materials and content', p:'The Client provides everything needed before work begins — footage, images, logos, copy, brand assets and approvals — and confirms it holds the right to use everything it sends, bearing sole responsibility for any related claim'},
      {h:'Workspace', p:'For the length of the project the Client has an account in the Eyeblink workspace on our site to follow each stage, receive, review and approve versions, send feedback and files, and find its invoices. Approvals and feedback sent there count as written approvals under this agreement'},
      {h:'Revisions', p:'The project '+rev+'. A revision round is one consolidated list of feedback on one version. Changing the idea or script after approval, adding new requirements, or redoing approved work are not revisions and are charged as additional work'},
      {h:'Additional work', p:'Any request outside the scope, or an increase in its volume, is priced and agreed in writing before it is done, and may change the delivery date'},
      {h:'Approval of deliverables', p:'A version is approved once the Client confirms it in writing through any agreed channel, or if '+v.silenceDays+' days pass after delivery without feedback. If a reply takes longer than '+v.approvalDays+' days, the delivery date moves by the length of the delay'},
      {h:'Music and licensed elements', p:'Licensed music, sound effects, footage and fonts are used under their providers’ terms and for this project only. The value does not include buying extra licences or paid elements the Client requests; those are charged separately'},
      {h:'Project files', p: v.sourceFiles ? 'The value includes the open project files, handed over after full payment, excluding licensed elements whose terms do not allow transfer'
        : 'The value does not include open or source files (such as Premiere Pro and After Effects projects); final deliverables are provided in the agreed formats only, unless agreed otherwise in writing'},
      {h:'Ownership and usage rights', p:'Usage rights to the final deliverables pass to the Client once the project is paid in full; before that the Client may not publish or use them. Review versions are sent at reduced quality or watermarked'},
      {h:'Portfolio', p: v.portfolio ? 'The First Party may show the project, or parts of it, in its portfolio and on its platforms after the Client has published it, unless agreed otherwise in writing'
        : 'The First Party will not show the project in its portfolio or on its platforms without the Client’s written consent'},
      {h:'Cancellation', p:'If the Client cancels after work has begun, the deposit is non-refundable, and the Client pays for the work completed up to the cancellation date where it exceeds the deposit'},
      {h:'Late payment', p:'If any payment is late, the First Party may pause work or postpone delivery until it is received, without this being a breach of its obligations'},
      {h:'Confidentiality', p:'Neither party shares files or private information about the project with any third party without the other’s consent'},
      {h:'File retention', p:'The First Party keeps a copy of the project files for '+v.archiveDays+' days after final delivery, after which it is not obliged to keep them or provide copies'},
      {h:'General', p:'Emails and messages exchanged through the parties’ agreed channels form part of this agreement. No amendment is valid unless documented and accepted by both parties, and this agreement prevails over any earlier arrangement. The parties will try to settle any dispute amicably; failing that, it falls under '+(v.jurisdiction||'the competent courts in the First Party’s country')} ];
  }
  function docUrl(t,type){ return location.origin+'/'+(type==='agreement'?'agreement':type==='quote'?'quote':'d')+'/'+t; }
  function payList(){ return ((C.payments&&C.payments.methods)||[]).filter(function(m){ return m&&m.id&&m.name; }); }
  // the methods line the client reads: the ticked methods in the site's order, then anything written by hand
  function payText(b){ var ids=b.payIds||[]; return payList().filter(function(m){ return ids.indexOf(m.id)>=0; }).map(function(m){ return m.name; }).concat(String(b.payOther||'').trim()?[String(b.payOther).trim()]:[]).join(' · '); }
  function docShareText(o,s,lang,url){ var en=lang==='en', n=(o.name||'').trim();
    return en ? 'Hello '+n+', here is the '+(s.type==='quote'?'quote':'service agreement')+' for “'+(s.title||'')+'”:\n'+url+'\nYou can download it as a PDF and '+(s.type==='quote'?'accept it':'sign it')+' from the same link'
      : 'مرحباً '+n+'، هذا '+(s.type==='quote'?'عرض السعر':'اتفاق العمل')+' لمشروع «'+(s.title||'')+'»:\n'+url+'\nيمكنك تحميله PDF و'+(s.type==='quote'?'الموافقة عليه':'توقيعه')+' من الرابط نفسه'; }
  function waLink(contact,text){ var dg=String(contact||'').replace(/[^0-9]/g,''); return 'https://wa.me/'+(/^\+?[0-9 ()-]{8,}$/.test(String(contact||'').trim())?dg:'')+'?text='+encodeURIComponent(text); }
  function docState(s){ return s.status==='accepted'? (s.type==='quote'?'✓ وافق':'✓ وقّع')+(s.acceptedBy?' · '+s.acceptedBy:'') : s.viewedAt? 'اطّلع عليه العميل' : 'مُرسل، لم يُفتح بعد'; }
  function docsBox(o,k){
    var list=o.docs||[];
    return '<div class="docs"><div class="dh"><b>عرض السعر والاتفاقية</b><span class="small muted">برابط خاص: يفتحه العميل، ويحمّله PDF، ثم يوافق أو يوقّع</span></div>'+
      (list.length?'<ul class="dlist">'+list.map(function(s){ return '<li><div class="dl1"><b>'+esc(DTYPE[s.type])+'</b> <span dir="ltr" class="muted">'+esc(s.no)+(s.ver>1?' · v'+s.ver:'')+'</span><span class="pill '+(s.status==='accepted'?'ok':s.viewedAt?'seen':'')+'">'+esc(docState(s))+'</span></div>'+
        '<div class="dl2"><a class="btn sm" href="'+esc(docUrl(s.token,s.type))+'" target="_blank" rel="noopener">فتح</a><a class="btn sm" href="'+esc(docUrl(s.token,s.type))+'?print=1" target="_blank" rel="noopener">PDF</a>'+
        '<button class="btn sm" type="button" data-dshare="'+k+'" data-t="'+esc(s.token)+'">إرسال</button>'+(s.status!=='accepted'?'<button class="btn sm" type="button" data-dedit="'+k+'" data-t="'+esc(s.token)+'" data-type="'+s.type+'">تعديل</button>':'')+
        (s.type==='quote'&&s.status==='accepted'&&!list.some(function(x){return x.type==='agreement'})?'<button class="btn sm primary" type="button" data-dnew="'+k+'" data-type="agreement" data-from="'+esc(s.token)+'">اتفاقية من هذا العرض</button>':'')+'</div></li>'; }).join('')+'</ul>':'')+
      onboardBox(o,k)+
      '<div class="actions"><button class="btn sm" type="button" data-dnew="'+k+'" data-type="quote">+ عرض سعر</button><button class="btn sm" type="button" data-dnew="'+k+'" data-type="agreement">+ اتفاقية</button></div></div>';
  }
  // after the agreement is signed: the client's way in, their project in the workspace, then the deposit — one short checklist
  function onboardBox(o,k){
    var ag=(o.docs||[]).filter(function(s){ return s.type==='agreement'&&s.status==='accepted'; })[0]; if(!ag) return '';
    var ob=o.onboard||{}, inv=ob.invite?location.origin+(o.lang==='en'?'/en':'')+'/account?invite='+ob.invite:'', dep=o.paid||(o.deposit&&o.deposit.paid);
    var row=function(done,title,body){ return '<li class="'+(done?'ok':'')+'"><i>'+(done?'✓':'')+'</i><div><b>'+title+'</b>'+(body?'<div class="small">'+body+'</div>':'')+'</div></li>'; };
    var waTxt=(o.lang==='en'?'Your workspace for the project is ready. Activate it with your email '+(ob.email||o.email||'')+':\n':'مساحة العمل الخاصة بمشروعك جاهزة. فعّلها ببريدك '+(ob.email||o.email||'')+':\n')+inv;
    return '<div class="onb"><div class="small muted">بعد التوقيع</div><ol>'+
      row(true,'وقّع الاتفاقية '+esc(ag.no),esc(ag.acceptedBy||'')+(ag.acceptedAt?' · '+esc(new Date(ag.acceptedAt).toLocaleDateString('ar-u-nu-latn',{day:'numeric',month:'short'})):''))+
      row(!!ob.client,'مساحة العمل', ob.client?'لديه حساب متعاقد مسبقاً':
        (inv?'الدعوة جاهزة وظاهرة للعميل في صفحة الاتفاقية نفسها، وحين يفعّلها يصلك إشعار على تيليغرام<div class="dl2"><a class="btn sm" target="_blank" rel="noopener" href="'+esc(waLink(o.contact,waTxt))+'">أرسل الدعوة عبر واتساب</a><button class="btn sm" type="button" data-copytxt="'+esc(inv)+'">نسخ رابط الدعوة</button>'+(o.email?'<button class="btn sm" type="button" data-oconv="'+k+'">أو أعدّ حسابه بكلمة سر مؤقتة</button>':'')+'</div>':'لا يوجد بريد إلكتروني للعميل'))+
      row(!!o.projectId,'مشروعه بمساحة العمل', o.projectId?'مربوط بـ «'+esc(o.projectName||'')+'»':'<div class="dl2"><button class="btn sm primary" type="button" data-oproj="'+k+'">افتح مشروعه من الاتفاقية</button></div>')+
      row(!!dep,'العربون', dep?'وصل':'من «مسار الدفع» في الأسفل: السعر وخطة الدفع جاهزان من العرض')+
    '</ol></div>';
  }
  // the agreement becomes a project in the workspace: client record (if new), project with dates from the timeline, linked to this order
  function openProject(o,b){
    if(!LIVE||o.demo){ toast('يعمل على الموقع المنشور',true); return; }
    var em=o.email; if(!em){ toast('لا يوجد بريد إلكتروني للعميل',true); return; } b.disabled=true;
    loadDocs(o).then(function(list){ var ag=list.filter(function(d){ return d.type==='agreement'&&d.accepted; })[0]; if(!ag) throw new Error('no agreement');
      var B=ag.body, start=new Date(), end=new Date(Date.now()+Math.ceil((+B.days||10)*7/5)*864e5), iso=function(d){ return d.toISOString().slice(0,10); };
      return fetch(API+'/work?admin=1&profile='+encodeURIComponent(em),{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).catch(function(){ return {}; })
        .then(function(p){ return p&&p.ok&&p.client? null : api('/work','POST',{action:'clientSave',email:em,name:B.client.name||o.name,company:B.client.company||'',phone:/^\+?[0-9 ()-]{8,}$/.test(o.contact||'')?o.contact.trim():''}); })
        .then(function(){ return api('/work','POST',{action:'project',client_email:em,name:B.title,type:'once',start_date:iso(start),end_date:iso(end),description:(B.summary?B.summary+'\n\n':'')+B.items.map(function(x){ return '• '+x.name+(x.qty>1?' ×'+x.qty:''); }).join('\n')+'\n\n'+ag.no,services:B.items.map(function(x){ return x.name; }).slice(0,12)}); })
        .then(function(j){ if(!j.ok) throw new Error(j.error||'fail'); return api('/orders','PATCH',{key:o.key,project:j.id}); })
        .then(function(j){ if(!j.ok) throw new Error(j.error||'fail'); Object.assign(o,j.order); WORK=null; renderOrders(); var dd=document.querySelector('[data-okey="'+o.key+'"]'); if(dd) dd.open=true; toast('فُتح مشروعه في مساحة العمل ورُبط بالطلب'); }); })
      .catch(function(err){ b.disabled=false; toast(({'not client':'لديه حساب عادي حتى الآن: انتظر حتى يفعّل الدعوة، أو رقِّه من «العملاء»','no account':'لا يوجد حساب ولا سجل عميل بهذا البريد','no agreement':'لا توجد اتفاقية موقّعة'})[err.message]||'تعذّر ذلك، حاول مرة أخرى',true); });
  }
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-oproj],[data-copytxt]'); if(!b) return;
    if(b.dataset.oproj){ openProject(orderOf(b.dataset.oproj),b); return; }
    try{ navigator.clipboard.writeText(b.dataset.copytxt).then(function(){ toast('نُسخ الرابط'); }); }catch(_){ toast('تعذّر النسخ',true); } });
  function loadDocs(o){ if(!LIVE||o.demo) return Promise.resolve([]);
    return fetch(API+'/docs?key='+encodeURIComponent(o.key),{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ DOCS[o.key]=j.docs||[]; return DOCS[o.key]; }); }
  // a fresh document starts from the order (and, for an agreement, from its quote when there is one)
  function docSeed(o,type,from){
    var S=dset(), lang=o.lang==='en'?'en':'ar', items;
    if(from) { var b=JSON.parse(JSON.stringify(from.body)); b.quoteNo=from.no; return b; }
    if((o.items||[]).length) items=o.items.filter(function(x){return x&&x.name}).map(function(x){ return {name:x.name,desc:'',qty:+x.qty||1,unit:pnum(x.unit)}; });
    else { var q=+o.qty||1, t=pnum(o.price||o.total); items=[{name:o.packageName||o.package||'',desc:[o.addons&&o.addons.length?(lang==='en'?'Add-ons: ':'الإضافات: ')+o.addons.join(lang==='en'?', ':'، '):'',(o.platforms||[]).length?(lang==='en'?'Platforms: ':'المنصات: ')+o.platforms.join(', '):''].filter(Boolean).join('\n'),qty:q,unit:t?Math.round(t/q*100)/100:0}]; }
    var L=dlists(lang), digits=String(o.contact||'');
    // the client picked a currency on the site: start the quote in it
    if(o.ccy&&o.ccy!=='$'&&o.ccy!==pcur(o)&&FXC.some(function(k){ return k[0]===o.ccy; })){ items.forEach(function(x){ x.unit=fxConv(x.unit,pcur(o)==='$'?'$':pcur(o),o.ccy); }); var CCY=o.ccy; }
    return {lang:lang,title:o.packageName&&o.packageName!=='فرصة'?o.packageName:'',summary:'',client:{name:o.name||'',company:'',place:'',contact:o.contact||'',email:o.email||''},
      studio:{name:S.studioName,place:S.studioPlace,contact:S.studioContact},items:items,cur:CCY||pcur(o),discount:0,days:S.days,revisions:S.revisions,valid:S.valid,
      plan:o.plan||S.plan,pct:+(o.depositPct||S.pct),includes:L.includes.slice(),excludes:L.excludes.slice(),payIds:S.payIds.slice(),payOther:S.payOther,payMethods:'',notes:'',quoteNo:'',
      clauses:null,v:{approvalDays:S.approvalDays,silenceDays:S.silenceDays,archiveDays:S.archiveDays,sourceFiles:false,portfolio:true,jurisdiction:S.jurisdiction}};
  }
  function openDoc(o,type,token,fromToken){
    var go=function(list){
      var ex=token&&list.filter(function(d){return d.token===token})[0], from=fromToken&&list.filter(function(d){return d.token===fromToken})[0];
      if(!from&&type==='agreement'&&!ex){ from=list.filter(function(d){return d.type==='quote'&&d.status==='accepted'})[0]||null; }
      var b= ex? JSON.parse(JSON.stringify(ex.body)) : docSeed(o,type,from);
      if(!b.payIds){ var pm=String(b.payMethods||''); b.payIds=payList().filter(function(m){ return pm.indexOf(m.name)>=0; }).map(function(m){ return m.id; }); if(!b.payIds.length) b.payOther=pm; }   // documents made before the picker
      var S=dset(); b.v=b.v||{approvalDays:S.approvalDays,silenceDays:S.silenceDays,archiveDays:S.archiveDays,sourceFiles:false,portfolio:true,jurisdiction:S.jurisdiction};
      if(type==='agreement'&&!b.clauses) b.clauses=clausesFor(b.lang,docVars(b));
      DED={o:o,type:type,token:ex?ex.token:null,no:ex?ex.no:'',b:b,quotes:list.filter(function(d){return d.type==='quote'}),result:null};
      drawDoc(); };
    if(!LIVE||o.demo){ go([]); return; }
    loadDocs(o).then(go).catch(function(){ toast('تعذّر تحميل المستندات',true); });
  }
  function docVars(b){ var v=b.v||{}, t=0; (b.items||[]).forEach(function(x){ t+=(+x.qty||1)*pnum(x.unit); }); t=Math.max(0,t-pnum(b.discount));
    return {studio:(b.studio&&b.studio.name)||'Eyeblink Studio',client:(b.client&&(b.client.company||b.client.name))||'—',title:b.title||'—',total:pfmt(t,b.cur||'$'),plan:b.plan,pct:b.pct,days:+b.days||0,revisions:+b.revisions,
      payMethods:payText(b)||b.payMethods,approvalDays:v.approvalDays||7,silenceDays:v.silenceDays||14,archiveDays:v.archiveDays||60,sourceFiles:!!v.sourceFiles,portfolio:v.portfolio!==false,jurisdiction:v.jurisdiction||''}; }
  function dField(lbl,html,cls){ return '<div class="field'+(cls?' '+cls:'')+'"><label>'+lbl+'</label>'+html+'</div>'; }
  function dIn(path,val,attrs){ return '<input data-dp="'+path+'" value="'+esc(val==null?'':val)+'" '+(attrs||'dir="auto"')+'>'; }
  function drawDoc(){
    var D=DED, b=D.b, q=D.type==='quote', en=b.lang==='en', pk=((C.packages&&C.packages.items)||[]);
    var sub=0; b.items.forEach(function(x){ sub+=(+x.qty||1)*pnum(x.unit); }); var total=Math.max(0,sub-pnum(b.discount));
    var el=$('#dsheet'); if(!el){ el=document.createElement('div'); el.id='dsheet'; document.body.appendChild(el); }
    document.documentElement.classList.add('dlock');
    var head='<div class="dtop"><div><b>'+(D.token?'تعديل ':'')+DTYPE[D.type]+'</b><span class="muted small"> · '+esc(D.o.name)+' · <span dir="ltr">'+esc(D.o.code)+'</span>'+(D.no?' · <span dir="ltr">'+esc(D.no)+'</span>':'')+'</span></div><button class="btn sm" type="button" data-dclose>إغلاق</button></div>';
    if(D.result){ var r=D.result, txt=docShareText(D.o,r.s,b.lang,r.url);
      el.innerHTML='<div class="dbox">'+head+'<div class="dres"><div class="dok">✓ '+(r.updated?'حُدّث المستند على الرابط نفسه':'جاهز. هذا رابط '+(q?'عرض السعر':'الاتفاقية')+' الخاص بالعميل')+'</div><div class="dlink" dir="ltr">'+esc(r.url)+'</div>'+
        '<div class="field"><label>الرسالة</label><textarea id="dmsg" dir="auto" rows="4">'+esc(txt)+'</textarea></div>'+
        '<div class="actions"><a class="btn primary" id="dwa" href="'+esc(waLink(D.o.contact,txt))+'" target="_blank" rel="noopener">إرسال على واتساب</a><button class="btn" type="button" data-dcopy>نسخ الرسالة</button>'+
        (D.o.email&&!hiddenOpp(D.o)?'<button class="btn" type="button" data-dchat>إرسال بمحادثة الموقع</button>':'')+'<a class="btn" href="'+esc(r.url)+'" target="_blank" rel="noopener">فتح</a><a class="btn" href="'+esc(r.url)+'?print=1" target="_blank" rel="noopener">تحميل PDF</a></div>'+
        '<p class="small muted">لإنستغرام أو أي مكان آخر: انسخ الرسالة وأرسلها. حين يفتح العميل الرابط أو يوافق، يصلك إشعار على تيليغرام ويُسجَّل في الطلب</p></div></div>';
      return; }
    var items='<div class="ditems"><div class="dih"><span>البند</span><span>الوصف</span><span>الكمية</span><span>سعر الوحدة</span><span></span></div>'+b.items.map(function(x,i){
      return '<div class="dirow"><input data-dp="items.'+i+'.name" value="'+esc(x.name)+'" dir="auto" placeholder="مثال: فيلم إطلاق 60 ثانية"><textarea data-dp="items.'+i+'.desc" dir="auto" rows="2" placeholder="ماذا يشمل بالتحديد">'+esc(x.desc)+'</textarea><input data-dp="items.'+i+'.qty" type="number" min="1" value="'+esc(x.qty)+'"><input data-dp="items.'+i+'.unit" dir="ltr" value="'+esc(x.unit)+'"><button class="btn sm" type="button" data-ditemx="'+i+'" title="حذف">×</button></div>'; }).join('')+
      '<div class="actions"><button class="btn sm" type="button" data-ditemadd>+ بند</button>'+(pk.length?'<select data-dpkg><option value="">أضف من الباقات…</option>'+pk.map(function(p,i){ return '<option value="'+i+'">'+esc((p.name&&(p.name[b.lang]||p.name.ar))||p.id)+' · '+esc(p.price)+'</option>'; }).join('')+'</select>':'')+'</div></div>';
    var money='<div class="row">'+dField('العملة',curSel('data-dcur',b.cur||'$')+fxBox(b.cur))+dField('خصم (مبلغ)',dIn('discount',b.discount||'','dir="ltr" placeholder="0"'))+'<div class="field dtotal"><label>الإجمالي</label><b dir="ltr">'+esc(pfmt(total,b.cur||'$'))+'</b></div></div>';
    var terms='<div class="row">'+dField('مدة التنفيذ (أيام عمل)',dIn('days',b.days,'type="number" min="0"'))+dField('جولات التعديل',dIn('revisions',b.revisions,'type="number" min="0" max="10"'))+(q?dField('العرض صالح لمدة (يوم)',dIn('valid',b.valid,'type="number" min="1"')):'')+'</div>'+
      '<div class="row">'+dField('خطة الدفع','<select data-dp="plan"><option value="split"'+(b.plan!=='full'?' selected':'')+'>عربون والباقي قبل التسليم</option><option value="full"'+(b.plan==='full'?' selected':'')+'>كامل المبلغ قبل البدء</option></select>')+(b.plan!=='full'?dField('نسبة العربون %',dIn('pct',b.pct,'type="number" min="10" max="90"')):'')+'</div>'+
      dField('طرق الدفع المقبولة في هذا المستند','<div class="dpay">'+payList().map(function(m){ var on=(b.payIds||[]).indexOf(m.id)>=0; return '<label class="dchip'+(on?' on':'')+'"><input type="checkbox" data-dpay="'+esc(m.id)+'"'+(on?' checked':'')+'>'+(m.logo?'<img src="'+esc(abs(String(m.logo).replace(/^\//,'')))+'" alt="">':'')+esc(m.name)+'</label>'; }).join('')+'</div>'+dIn('payOther',b.payOther,'dir="auto" placeholder="غيرها (اختياري): مثال تحويل بنكي"'))+
      '<div class="small muted dpayline">يظهر للعميل: <b>'+esc(payText(b)||'—')+'</b></div>';
    var lists='<div class="row">'+dField('يشمل (كل سطر بند)','<textarea data-dp="includes" data-lines dir="auto" rows="4">'+esc((b.includes||[]).join('\n'))+'</textarea>')+dField('لا يشمل','<textarea data-dp="excludes" data-lines dir="auto" rows="4">'+esc((b.excludes||[]).join('\n'))+'</textarea>')+'</div>';
    var v=b.v||{};
    var agr= q?'':'<section class="dsec"><h4>البنود</h4><p class="small muted">تُولَّد من الأرقام أعلاه. عدّل أي بند لهذا العميل وحده، أو اضغط «توليد البنود من جديد» بعد تغيير الأرقام</p>'+
      '<div class="row">'+dField('مهلة الرد قبل تأجيل الموعد (أيام)',dIn('v.approvalDays',v.approvalDays,'type="number" min="1"'))+dField('تُعتمد النسخة تلقائياً بعد (أيام بلا رد)',dIn('v.silenceDays',v.silenceDays,'type="number" min="3"'))+dField('حفظ الملفات بعد التسليم (أيام)',dIn('v.archiveDays',v.archiveDays,'type="number" min="7"'))+'</div>'+
      '<div class="row"><label class="check"><input type="checkbox" data-dp="v.sourceFiles"'+(v.sourceFiles?' checked':'')+'> تشمل الملفات المفتوحة</label><label class="check"><input type="checkbox" data-dp="v.portfolio"'+(v.portfolio!==false?' checked':'')+'> يحق لنا عرضه ضمن أعمالنا</label></div>'+
      dField('جهة الاختصاص عند الخلاف',dIn('v.jurisdiction',v.jurisdiction,'dir="auto" placeholder="المحاكم المختصة في بلد الطرف الأول"'))+
      '<div class="actions"><button class="btn sm" type="button" data-dregen>توليد البنود من جديد</button></div>'+
      '<div class="dclauses">'+b.clauses.map(function(c,i){ return '<div class="dcl"><span class="dn" dir="ltr">'+('0'+(i+1)).slice(-2)+'</span><div><input data-dp="clauses.'+i+'.h" value="'+esc(c.h)+'" dir="auto"><textarea data-dp="clauses.'+i+'.p" dir="auto" rows="3">'+esc(c.p)+'</textarea></div><button class="btn sm" type="button" data-dclx="'+i+'" title="حذف البند">×</button></div>'; }).join('')+'</div>'+
      '<div class="actions"><button class="btn sm" type="button" data-dcladd>+ بند</button></div></section>';
    var fromQ= !q&&D.quotes.length? dField('مبني على عرض سعر','<select data-dfromq><option value="">—</option>'+D.quotes.map(function(x){ return '<option value="'+esc(x.token)+'"'+(b.quoteNo===x.no?' selected':'')+'>'+esc(x.no)+' · '+esc(x.body.title)+(x.status==='accepted'?' ✓':'')+'</option>'; }).join('')+'</select>') : '';
    el.innerHTML='<div class="dbox">'+head+
      '<section class="dsec"><h4>الأساس</h4><div class="row">'+dField('لغة المستند','<select data-dp="lang"><option value="ar"'+(!en?' selected':'')+'>عربي</option><option value="en"'+(en?' selected':'')+'>English</option></select>')+fromQ+'</div>'+
        dField('عنوان المشروع *',dIn('title',b.title,'dir="auto" placeholder="مثال: حملة إطلاق مطعم بيت الشام"'))+dField('ملخص قصير (يظهر تحت العنوان)','<textarea data-dp="summary" dir="auto" rows="2" placeholder="سطرين عن الفكرة والهدف">'+esc(b.summary)+'</textarea>')+'</section>'+
      '<section class="dsec"><h4>العميل</h4><div class="row">'+dField('الاسم',dIn('client.name',b.client.name))+dField('الشركة / النشاط',dIn('client.company',b.client.company))+dField('المدينة والدولة',dIn('client.place',b.client.place))+'</div><div class="row">'+dField('التواصل',dIn('client.contact',b.client.contact,'dir="ltr"'))+dField('الإيميل',dIn('client.email',b.client.email,'dir="ltr" type="email"'))+'</div></section>'+
      '<section class="dsec"><h4>'+(q?'البنود والسعر':'نطاق العمل والقيمة')+'</h4>'+items+money+'</section>'+
      '<section class="dsec"><h4>الشروط</h4>'+terms+lists+dField('ملاحظات (اختياري)','<textarea data-dp="notes" dir="auto" rows="2">'+esc(b.notes)+'</textarea>')+'</section>'+agr+
      '<details class="dsec dstudio"><summary>بياناتنا بالمستند (الطرف الأول)</summary><div class="row">'+dField('الاسم',dIn('studio.name',b.studio.name))+dField('المدينة والدولة',dIn('studio.place',b.studio.place))+'</div>'+dField('التواصل (كل وسيلة في سطر)','<textarea data-dp="studio.contact" dir="ltr" rows="2">'+esc(b.studio.contact)+'</textarea>')+'</details>'+
      '<div class="dfoot"><button class="btn" type="button" data-ddefault title="يصبح هذا الإعداد لكل مستند جديد">احفظ الشروط كافتراضية</button><span class="sp"></span><button class="btn" type="button" data-dclose>إلغاء</button><button class="btn primary" type="button" data-dissue>'+(D.token?'تحديث المستند':'إصدار الرابط')+'</button></div></div>';
  }
  function dpath(obj,path,val){ var p=path.split('.'), o=obj; for(var i=0;i<p.length-1;i++){ o=o[p[i]]=o[p[i]]||{}; } o[p[p.length-1]]=val; }
  function closeDoc(){ var el=$('#dsheet'); if(el) el.remove(); document.documentElement.classList.remove('dlock'); var o=DED&&DED.o; DED=null; if(o&&TAB==='orders'){ renderOrders(); var dd=document.querySelector('[data-okey="'+o.key+'"]'); if(dd) dd.open=true; } }
  document.addEventListener('input',function(e){ var el=e.target; if(!DED||!el.closest('#dsheet')||!el.dataset.dp) return;
    var v= el.type==='checkbox'? el.checked : el.hasAttribute('data-lines')? el.value.split('\n') : el.value; dpath(DED.b,el.dataset.dp,v);
    if(/^items\.|^discount|^cur/.test(el.dataset.dp)){ var b=DED.b, s=0; b.items.forEach(function(x){ s+=(+x.qty||1)*pnum(x.unit); }); var t=$('#dsheet .dtotal b'); if(t) t.textContent=pfmt(Math.max(0,s-pnum(b.discount)),b.cur||'$'); } });
  document.addEventListener('change',function(e){ var el=e.target; if(!DED||!el.closest('#dsheet')) return;
    if(el.dataset.dpay){ var ids=(DED.b.payIds||[]).filter(function(x){ return x!==el.dataset.dpay; }); if(el.checked) ids.push(el.dataset.dpay); DED.b.payIds=ids; DED.b.payMethods=payText(DED.b); drawDoc(); return; }
    if(el.dataset.dp==='plan'||el.dataset.dp==='lang'||el.type==='checkbox'){ if(el.dataset.dp==='lang'){ var L=dlists(el.value), b=DED.b; b.includes=L.includes.slice(); b.excludes=L.excludes.slice(); if(DED.type==='agreement') b.clauses=clausesFor(el.value,docVars(b)); } drawDoc(); return; }
    if(el.hasAttribute('data-dpkg')&&el.value!==''){ var p=C.packages.items[+el.value], lg=DED.b.lang, f=(p.features&&(p.features[lg]||p.features.ar))||[];
      DED.b.items.push({name:(p.name&&(p.name[lg]||p.name.ar))||'',desc:f.join(lg==='en'?' · ':' · '),qty:1,unit:+p.price||0}); drawDoc(); return; }
    if(el.hasAttribute('data-dfromq')){ var qd=DED.quotes.filter(function(x){return x.token===el.value})[0]; if(!qd) return; var keep=DED.b.v, nb=JSON.parse(JSON.stringify(qd.body)); nb.quoteNo=qd.no; nb.v=keep; nb.clauses=clausesFor(nb.lang,docVars(nb)); DED.b=nb; drawDoc(); toast('مُلئت الاتفاقية من العرض '+qd.no); } });
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-dnew],[data-dedit],[data-dshare],[data-dclose],[data-ditemadd],[data-ditemx],[data-dcladd],[data-dclx],[data-dregen],[data-dissue],[data-ddefault],[data-dcopy],[data-dchat]'); if(!b) return;
    if(b.dataset.dnew||b.dataset.dedit){ var o=orderOf(b.dataset.dnew||b.dataset.dedit); if(!LIVE||o.demo){ toast('يعمل على الموقع المنشور',true); return; } openDoc(o,b.dataset.type,b.dataset.t||null,b.dataset.from||null); return; }
    if(b.dataset.dshare){ var o2=orderOf(b.dataset.dshare), s=(o2.docs||[]).filter(function(x){return x.token===b.dataset.t})[0]; if(!s) return;
      DED={o:o2,type:s.type,token:s.token,no:s.no,b:{lang:o2.lang==='en'?'en':'ar'},quotes:[],result:{url:docUrl(s.token,s.type),s:s,updated:false,share:true}}; drawDoc(); $('#dsheet .dok').textContent='رابط '+(s.type==='quote'?'عرض السعر':'الاتفاقية')+' '+s.no; return; }
    if(!DED) return; var B=DED.b;
    if(b.hasAttribute('data-dclose')){ closeDoc(); return; }
    if(b.hasAttribute('data-ditemadd')){ B.items.push({name:'',desc:'',qty:1,unit:0}); drawDoc(); return; }
    if(b.dataset.ditemx){ B.items.splice(+b.dataset.ditemx,1); drawDoc(); return; }
    if(b.hasAttribute('data-dcladd')){ B.clauses.push({h:'',p:''}); drawDoc(); return; }
    if(b.dataset.dclx){ B.clauses.splice(+b.dataset.dclx,1); drawDoc(); return; }
    if(b.hasAttribute('data-dregen')){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='هل أنت متأكد؟ ستُحذف تعديلاتك على البنود'; return; } B.clauses=clausesFor(B.lang,docVars(B)); drawDoc(); toast('وُلّدت البنود من الأرقام الحالية'); return; }
    if(b.hasAttribute('data-dcopy')){ var t=$('#dmsg'); try{ navigator.clipboard.writeText(t.value).then(function(){ toast('نُسخت الرسالة'); },function(){ t.select(); }); }catch(_){ t.select(); } return; }
    if(b.hasAttribute('data-dchat')){ sendMsg(DED.o.key,$('#dmsg').value,b); return; }
    if(b.hasAttribute('data-ddefault')){ P=P||{}; var d=P.docs=Object.assign({},P.docs);
      Object.assign(d,{studioName:B.studio.name,studioPlace:B.studio.place,studioContact:B.studio.contact,payIds:(B.payIds||[]).slice(),payOther:B.payOther||'',payMethods:payText(B),days:+B.days,revisions:+B.revisions,valid:+B.valid||14,plan:B.plan,pct:+B.pct});
      if(B.v) Object.assign(d,{approvalDays:+B.v.approvalDays,silenceDays:+B.v.silenceDays,archiveDays:+B.v.archiveDays,jurisdiction:B.v.jurisdiction||''});
      d.lists=Object.assign({},d.lists); d.lists[B.lang]={includes:(B.includes||[]).filter(Boolean),excludes:(B.excludes||[]).filter(Boolean)};
      b.disabled=true; fetch(API+'/private',{method:'PUT',headers:headers({'content-type':'application/json'}),body:JSON.stringify(P)}).then(function(r){ if(!r.ok) throw 0; PSAVED=JSON.stringify(P); toast('حُفظت إعدادات افتراضية لكل مستند جديد'); }).catch(function(){ toast('لم تُحفظ',true); }).then(function(){ b.disabled=false; }); return; }
    if(b.hasAttribute('data-dissue')){
      if(!String(B.title||'').trim()){ toast('اكتب عنوان المشروع',true); var ti=$('#dsheet [data-dp="title"]'); if(ti) ti.focus(); return; }
      B.items=B.items.filter(function(x){ return String(x.name||'').trim(); }); if(!B.items.length){ toast('أضف بنداً واحداً على الأقل',true); drawDoc(); return; }
      if(DED.type==='agreement') B.clauses=(B.clauses||[]).filter(function(c){ return String(c.h||'').trim()||String(c.p||'').trim(); });
      B.payMethods=payText(B); b.disabled=true; var wasToken=DED.token;
      api('/docs','POST',{action:'issue',key:DED.o.key,type:DED.type,token:DED.token,doc:B}).then(function(j){
        if(!j.ok) throw new Error(j.error||'fail');
        DED.o.docs=j.docs; DED.token=j.doc.token; DED.no=j.doc.no; DED.result={url:docUrl(j.doc.token,j.doc.type),s:j.docs.filter(function(x){return x.token===j.doc.token})[0],updated:!!wasToken}; drawDoc();
      }).catch(function(err){ b.disabled=false; toast(({title:'اكتب عنوان المشروع',items:'أضف بنداً واحداً على الأقل',clauses:'أضف بنداً واحداً على الأقل',locked:'وافق عليه العميل، فلا يمكن تعديله. أنشئ نسخة جديدة'})[err.message]||'لم يُحفظ، حاول مرة أخرى',true); }); return; }
  });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&DED) closeDoc(); });
