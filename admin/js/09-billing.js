/* Eyeblink admin · billing — loaded after the files before it; all of admin/js shares one scope */
  /* ---------------- billing: workspace invoices (six statuses) + order payments, one list ---------------- */
  var BILL=null, BF={status:'',source:'',client:''}, BOPEN=null, BFORM=null, BPREV={};
  var BST={pending:'بانتظار الدفع',partial:'مدفوعة جزئياً',paid:'مدفوعة',overdue:'متأخرة',cancelled:'ملغاة',refunded:'مستردة',draft:'مسودة'};
  var CURS=['$','€','£','SAR','AED','OMR','QAR','KWD','BHD','JOD','EGP','TRY','SYP'];
  function nn(v){ var n=parseFloat(String(v==null?'':v).replace(/,/g,'').replace(/[^0-9.\-]/g,'')); return isFinite(n)?n:0; }
  function mny(n,c){ var a=Math.abs(+n||0), v=(Math.round(a*100)/100).toFixed(a%1?2:0); return ((+n||0)<0?'−':'')+(c==='$'||c==='€'||c==='£'?c+v:v+' '+c); }
  function loadBilling(){ if(!LIVE){ BILL={err:'live'}; if(TAB==='billing') renderBilling(); return; }
    fetch(API+'/work?admin=1&view=billing',{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ BILL=j.ok?j:{err:j.error||'fail'}; renderTabs(); if(TAB==='billing') renderBilling(); })
      .catch(function(){ BILL={err:'net'}; if(TAB==='billing') renderBilling(); }); }
  function bpost(body,btn,ok){ if(btn) btn.disabled=true; if(NEXT_NOTIFY){ body.notify=NEXT_NOTIFY; ok=sndSay(NEXT_NOTIFY,ok); }   // the send sheet's choice
    return fetch(API+'/work',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify(body)}).then(function(r){ return r.json().then(function(j){ j._s=r.status; return j; }); })
      .then(function(j){ if(btn) btn.disabled=false; if(j.ok){ if(ok) toast(ok); BPREV={}; loadBilling(); } else toast(({items:'أضف بنداً واحداً على الأقل','no account':'لا يوجد حساب بهذا البريد',project:'المشروع لا يخص هذا العميل',due:'تاريخ الاستحقاق قبل تاريخ الإصدار','too much':'المبلغ أكبر من المتبقي',amount:'اكتب مبلغاً صحيحاً',paid:'لا يمكن إلغاء فاتورة عليها دفعات — استخدم الاسترداد',state:'لا يمكن تنفيذ ذلك في حالتها الحالية','below paid':'الإجمالي أقل من المدفوع',sent:'لا يمكن حذف فاتورة أُرسلت أو عليها دفعات'})[j.error]||'تعذّر التنفيذ',true); return j; })
      .catch(function(){ if(btn) btn.disabled=false; toast('تعذّر التنفيذ',true); return {ok:false}; }); }
  // the order flow keeps its own invoices; here we only read where each order stands
  function orderTotal(o){ return nn(o.price)||(o.items||[]).reduce(function(a,x){ return a+nn(x.unit)*(nn(x.qty)||1); },0)||nn(o.total); }
  function orderBills(){ return ORDERS.filter(function(o){ return !o.demo; }).map(function(o){
      var c=o.cur||(String(o.price||o.total||'').match(/[^\d\s.,]+/)||['$'])[0], t=orderTotal(o), dep=o.deposit&&o.deposit.paid?nn(o.deposit.amount):0, fin=o.invoice?nn(o.invoice.amount):0, paid=o.paid?Math.max(t,dep+fin):dep+fin;
      var st=o.status==='cancelled'?'cancelled':o.paid?'paid':dep>0?'partial':(o.payInfo||o.status==='awaiting-payment')?'pending':null; if(!st||(st==='cancelled'&&!paid&&!o.payInfo)) return null;
      var pays=[]; if(dep) pays.push({amount:dep,date:o.deposit.at}); if(fin) pays.push({amount:fin,date:o.invoice.at}); else if(o.paid&&!dep) pays.push({amount:t,date:o.updatedAt||o.createdAt});
      return {src:'order',id:o.code,code:o.code,no:[o.deposit&&o.deposit.invoice&&o.deposit.invoice.no,o.invoice&&o.invoice.no].filter(Boolean).join(' · ')||'—',name:o.name,email:o.email,title:o.packageName||o.package||'',
        issue:((o.payInfo&&o.payInfo.at)||o.createdAt||'').slice(0,10),due:null,total:t,paid:paid,balance:st==='cancelled'?0:Math.max(0,t-paid),currency:c,state:st,payments:pays}; }).filter(Boolean); }
  function billRows(){ var B=BILL||{}, names={}; (B.clients||[]).forEach(function(c){ names[c.email]=c.name; }); (USERS||[]).forEach(function(u){ names[u.email]=names[u.email]||u.name; });
    var ws=(B.invoices||[]).map(function(x){ return {src:'ws',id:x.id,no:x.no,name:names[x.client_email]||x.client_email,email:x.client_email,title:[x.title,x.period].filter(Boolean).join(' · '),project:x.project_name,issue:x.issue_date,due:x.due_date,total:x.total,paid:x.paid,balance:x.balance,currency:x.currency,state:x.sent_at?x.state:'draft',x:x,payments:x.payments}; });
    return ws.concat(orderBills()).sort(function(a,b){ return (b.issue||'')<(a.issue||'')?-1:1; }); }
  function bform(x){ var B=BILL, cl=B.clients||[], f=BFORM||{}, it=(x&&x.items)||f.items||[{desc:'',qty:1,unit:''}], em=(x&&x.client_email)||f.email||'';
    var td=B.today, due=(x&&x.due_date)||new Date(Date.now()+7*864e5).toISOString().slice(0,10);
    return '<form class="bform" data-bid="'+esc(x?x.id:'')+'" novalidate><div class="row"><div class="field"><label>العميل</label><select name="email">'+(cl.length?'':'<option value="">لا يوجد عملاء متعاقدون</option>')+cl.map(function(c){ return '<option value="'+esc(c.email)+'"'+(c.email===em?' selected':'')+'>'+esc(clLabel(c,cl))+'</option>'; }).join('')+(em&&!cl.some(function(c){return c.email===em})?'<option value="'+esc(em)+'" selected>'+esc(em)+'</option>':'')+'</select></div>'+
      '<div class="field bscope-f"><label>ما تشمله الفاتورة</label><div class="bscope" role="group" aria-label="ما تشمله الفاتورة"></div></div></div><div class="bagree"></div>'+
      '<div class="row"><div class="field"><label>العنوان</label><input name="title" dir="auto" value="'+esc(x?x.title:(f.title||''))+'" placeholder="مثلاً: باقة المحتوى الشهرية"></div><div class="field"><label>الفترة (اختياري)</label><input name="period" dir="auto" value="'+esc(x?x.period:'')+'" placeholder="نوفمبر 2026"></div>'+
        '<div class="field"><label>العملة</label><input name="currency" dir="ltr" list="bcurs" value="'+esc(x?x.currency:(f.currency||'$'))+'"><datalist id="bcurs">'+CURS.map(function(c){ return '<option value="'+c+'">'; }).join('')+'</datalist></div></div>'+
      '<div class="small muted">البنود</div><div class="bgroups"></div>'+
      (!x&&f.credit>0?'<div class="field bcred"><label>يُخصم من الرصيد المقدّم</label><input name="credit" type="number" min="0" step="any" dir="ltr" value="'+esc(f.credit)+'"><p class="hint">يُسجَّل دفعةً على الفاتورة، ويقلّ رصيد العميل بقدره.</p></div>':'')+
      '<div class="row"><div class="field"><label>خصم</label><input name="discount" type="number" min="0" step="any" value="'+esc(x&&x.discount?x.discount:'')+'"></div><div class="field"><label>تاريخ الإصدار</label><input name="issue" type="date" value="'+esc(x?x.issue_date:td)+'"></div><div class="field"><label>تاريخ الاستحقاق</label><input name="due" type="date" value="'+esc(due)+'"></div></div>'+
      '<div class="field"><label>ملاحظة على الفاتورة (اختياري)</label><textarea name="note" dir="auto">'+esc(x?x.note:'')+'</textarea></div>'+
      '<div class="actions"><b class="btot">—</b><label class="check"><input type="checkbox" name="send"'+(x&&x.sent_at?'':' checked')+'> '+(x&&x.sent_at?'أعد إرسالها للعميل بعد الحفظ':'أرسلها للعميل الآن (بريد + إشعار)')+'</label><button class="btn primary sm" type="submit">'+(x?'حفظ الفاتورة':'إنشاء الفاتورة')+'</button><button class="btn sm" type="button" data-bx>إلغاء</button></div></form>'; }
  /* what the invoice covers: one project, several, all of them, or general lines; each group holds its own lines */
  function bPN(f){ var em=f.elements.email.value; return (BILL.projects||[]).filter(function(p){ return p.client_email===em&&p.status!=='archived'; }); }
  function bRow(i){ var d=document.createElement('div'); d.className='bitem'; i=i||{};
    d.innerHTML='<input name="desc" dir="auto" placeholder="البيان" value="'+esc(i.desc||'')+'"><input name="qty" type="number" min="0" step="any" placeholder="الكمية" value="'+esc(i.qty||1)+'"><input name="unit" type="number" min="0" step="any" placeholder="سعر الوحدة" value="'+esc(i.unit===''||i.unit==null?'':i.unit)+'"><button type="button" class="linkbtn" data-brm aria-label="حذف البند">×</button>'; return d; }
  function bInit(f,x){ var P=bPN(f), ids={}, s=null; P.forEach(function(p){ ids[p.id]=1; }); try{ s=x&&x.scope?JSON.parse(x.scope):null; }catch(_){}
    var it=((x&&x.items)||(!x&&BFORM&&BFORM.items)||[]).map(function(i){ var k=i.project||(x&&x.project_id&&!(x.items||[]).some(function(y){ return y.project; })?x.project_id:''); return {desc:i.desc,qty:i.qty,unit:i.unit,project:ids[k]?k:''}; });
    f._sc={all:s==='all',keys:{}}; it.forEach(function(i){ f._sc.keys[i.project]=1; });
    if(!it.length){ var pj=(BFORM&&BFORM.project&&ids[BFORM.project])?BFORM.project:(P.length===1?P[0].id:''); f._sc.keys[pj]=1; }
    f._init=it; f.querySelector('.bgroups').innerHTML=''; bGroups(f,true); bAgree(f,x); }
  // what this client agreed to, per project: a monthly package or a price per unit; one click fills this month's invoice from it
  /* ---- billing from the work itself: everything this client owes that no invoice covers yet (package months, what went past them,
     extras they approved, work outside the package), what is still in progress, and their prepaid credit. Tick, then put it on the invoice:
     the tasks and months it covers can never be billed twice. ---- */
  var OWE={};
  var MN=function(m){ return new Date(m+'-15T12:00:00Z').toLocaleDateString('ar-u-nu-latn',{month:'long',year:'numeric'}); };
  function bAgree(f,x){ var box=f.querySelector('.bagree'); if(!box) return; var em=f.elements.email.value; if(x||!em){ box.innerHTML=''; return; }
    if(BFORM&&BFORM.built&&BFORM.email===em){ box.innerHTML='<div class="bag"><div><b>عُبّئت من الشغل غير المفوتر</b><div class="small muted">'+esc(BFORM.built)+'</div></div><button class="btn sm" type="button" data-bowe-redo>اختر من جديد</button></div>'; return; }
    var o=OWE[em]; if(!o){ box.innerHTML='<p class="hint">جارٍ جمع الشغل غير المفوتر…</p>'; wpost({action:'unbilled',email:em}).then(function(j){ if(!j.ok) return; OWE[em]=j; if(f.isConnected&&f.elements.email.value===em) bAgree(f,null); }); return; }
    var c=o.cur||'$', $=function(v){ return pfmt(v,c); }, ck=function(k,on,lab,side){ return '<label class="bow"><input type="checkbox" data-ow="'+esc(k)+'"'+(on?' checked':'')+'><span>'+lab+'</span>'+(side||'')+'</label>'; };
    var any=o.months.length||o.extras.length||o.units.length||o.others.length;
    box.innerHTML='<div class="bowe"><div class="ph"><b>غير مفوتر حتى الآن</b>'+(o.credit>0?'<span class="tag ok">رصيد مقدّم '+esc($(o.credit))+'</span>':'')+'</div>'+
      (o.months.length?'<div class="bow-g"><span class="small muted">الباقة الشهرية</span>'+o.months.map(function(m,i){ return ck('m'+i,true,'الباقة · '+esc(MN(m.month))+(m.current?' <small class="muted">(الشهر الجاري)</small>':'')+' <small class="muted">'+esc(m.units.map(function(u){ return u.name+' '+u.used+'/'+u.have; }).join('، '))+'</small>','<b dir="ltr">'+esc($(m.price))+'</b>')+
          m.over.map(function(v,k){ return ck('m'+i+'o'+k,true,'&nbsp;&nbsp;'+esc(v.name)+' إضافي · '+esc(MN(m.month))+' <small class="muted">('+v.qty+')</small>','<b dir="ltr">'+esc($(v.qty*v.price))+'</b>'); }).join(''); }).join('')+'</div>':'')+
      (o.extras.length?'<div class="bow-g"><span class="small muted">إضافات وافق عليها العميل</span>'+o.extras.map(function(e,i){ var sum=e.items.reduce(function(a,x){ return a+x.amount; },0);
          return ck('x'+i,true,esc(e.title)+' <small class="muted">· '+esc(e.pname)+' · '+esc(e.items.map(function(x){ return x.name; }).join('، '))+'</small>','<b dir="ltr">'+esc($(sum))+'</b>'); }).join('')+'</div>':'')+
      (o.units.length?'<div class="bow-g"><span class="small muted">وحدات منجزة بسعرها</span>'+o.units.map(function(u,i){ return ck('u'+i,true,esc(u.title)+' <small class="muted">· '+esc(u.pname)+' · '+esc(u.unit)+'</small>','<b dir="ltr">'+esc($(u.price))+'</b>'); }).join('')+'</div>':'')+
      (o.others.length?'<div class="bow-g"><span class="small muted">أعمال منفردة وخارج الباقة (اكتب السعر)</span>'+o.others.map(function(x,i){ return ck('r'+i,false,esc(x.title)+' <small class="muted">· '+esc(x.pname)+'</small>','<input type="number" min="0" step="any" class="bow-p" data-owp="'+i+'" placeholder="السعر" dir="ltr">'); }).join('')+'</div>':'')+
      (o.open.length?'<div class="bow-g"><span class="small muted">قيد التنفيذ (لا تُفوتر الآن، وتظهر في الفاتورة التالية)</span><div class="small">'+esc(o.open.slice(0,12).map(function(x){ return x.title+(x.pname?' · '+x.pname:''); }).join('، '))+(o.open.length>12?'…':'')+'</div></div>':'')+
      (any?'<div class="actions"><button class="btn sm primary" type="button" data-bowe>ضع المحدد في الفاتورة</button></div>':'<p class="hint">لا يوجد شغل غير مفوتر لهذا العميل. يمكنك كتابة بنود حرة كالمعتاد.</p>')+'</div>'; }
  function bOweApply(f){ var em=f.elements.email.value, o=OWE[em]; if(!o) return; var on=function(k){ var i=f.querySelector('[data-ow="'+k+'"]'); return i&&i.checked; };
    var items=[], tasks=[], months=[], annex={}, miss=false, parts=[];
    o.months.forEach(function(m,i){ if(!on('m'+i)) return; items.push({desc:'الباقة الشهرية · '+MN(m.month),qty:1,unit:m.price,project:''}); months.push(m.month);
      m.annex.forEach(function(a){ tasks.push(a.id); (annex[a.pname]=annex[a.pname]||[]).push(a.title); });
      m.over.forEach(function(v,k){ if(on('m'+i+'o'+k)) items.push({desc:v.name+' إضافي · '+MN(m.month),qty:v.qty,unit:v.price,project:''}); }); });
    if(months.length) parts.push(months.length===1?'شهر من الباقة':months.length===2?'شهران من الباقة':months.length+' أشهر من الباقة');
    o.extras.forEach(function(e,i){ if(!on('x'+i)) return; tasks.push(e.id); e.items.forEach(function(x){ items.push({desc:e.title+' · '+x.name+(x.detail?' ('+x.detail+')':''),qty:1,unit:x.amount,project:e.pid||''}); }); });
    o.units.forEach(function(u,i){ if(!on('u'+i)) return; tasks.push(u.id); items.push({desc:u.title+' · '+u.unit,qty:1,unit:u.price,project:u.pid||''}); });
    o.others.forEach(function(x,i){ if(!on('r'+i)) return; var pr=f.querySelector('[data-owp="'+i+'"]'); if(!pr||pr.value===''){ miss=true; if(pr) pr.focus(); return; } tasks.push(x.id); items.push({desc:x.title,qty:1,unit:+pr.value,project:x.pid||''}); });
    if(miss) return toast('اكتب سعر كل عمل محدد خارج الباقة',true);
    if(!items.length) return toast('لم تحدد شيئاً',true);
    var n=tasks.length; if(n) parts.push(n===1?'مهمة واحدة':n===2?'مهمتان':n+' مهام');
    var tot=items.reduce(function(a,i){ return a+i.qty*i.unit; },0);
    BFORM={email:em,items:items,title:'',currency:o.cur||'$',links:{tasks:tasks,months:months},annex:Object.keys(annex).map(function(k){ return {k:k,items:annex[k]}; }),credit:Math.min(o.credit||0,tot),built:parts.join(' · ')};
    renderBilling(); }
  function bGroups(f,first){ var P=bPN(f), sc=f._sc, nm={}; P.forEach(function(p){ nm[p.id]=p.name; });
    var keys=P.filter(function(p){ return sc.all||sc.keys[p.id]; }).map(function(p){ return p.id; }).concat(sc.keys['']?['']:[]); if(!keys.length){ sc.keys['']=1; keys=['']; }
    var chip=function(k,l,on){ return '<button type="button" class="bsc" data-bsc="'+esc(k)+'" aria-pressed="'+!!on+'">'+esc(l)+'</button>'; };
    f.querySelector('.bscope').innerHTML=(P.length>1?chip('*','كل المشاريع',sc.all):'')+P.map(function(p){ return chip(p.id,p.name,sc.all||sc.keys[p.id]); }).join('')+chip('','بنود عامة',!!sc.keys['']);
    var box=f.querySelector('.bgroups'), old={}; box.querySelectorAll('.bgrp').forEach(function(g){ old[g.dataset.proj]=g; });
    keys.forEach(function(k){ var g=old[k]; delete old[k];
      if(!g){ g=document.createElement('div'); g.className='bgrp'; g.dataset.proj=k; g.innerHTML='<div class="bgh"><b>'+esc(k?nm[k]:'بنود عامة')+'</b><small class="bgs"></small></div><div class="bitems"></div><div class="bsug"></div><button type="button" class="btn sm" data-badd>+ بند</button>';
        var rows=first?f._init.filter(function(i){ return i.project===k; }):[]; (rows.length?rows:[{}]).forEach(function(i){ g.querySelector('.bitems').appendChild(bRow(i)); }); }
      box.appendChild(g); });
    Object.keys(old).forEach(function(k){ old[k].remove(); });
    bSug(f); bformSync(f); }
  // one tap from the work done: the project's tasks completed in the last two months
  function bSug(f){ if(!WORK){ if(LIVE&&!f._wl){ f._wl=1; loadWork(); setTimeout(function(){ if(f.isConnected) bSug(f); },1500); } return; }
    var since=new Date(Date.now()-62*864e5).toISOString();
    f.querySelectorAll('.bgrp').forEach(function(g){ var k=g.dataset.proj; if(!k){ g.querySelector('.bsug').innerHTML=''; return; }
      var have={}; g.querySelectorAll('.bitem input[name=desc]').forEach(function(i){ have[i.value.trim()]=1; });
      var L=((WORK&&WORK.tasks)||[]).filter(function(t){ return t.project_id===k&&t.status==='completed'&&String(t.completed_at||t.updated_at||'')>=since; }).slice(0,8);
      g.querySelector('.bsug').innerHTML=L.length?'<span class="small muted">من المهام المكتملة:</span>'+L.map(function(t){ return '<button type="button" class="bsg" data-bsug="'+esc(t.title)+'"'+(have[t.title]?' disabled':'')+'>'+esc(t.title)+'</button>'; }).join(''):''; }); }
  function bformSync(f){ if(!f._sc) return; var c=f.elements.currency.value.trim()||'$', P=bPN(f), nm={}; P.forEach(function(p){ nm[p.id]=p.name; });
    var G=[].map.call(f.querySelectorAll('.bgrp'),function(g){ var rows=[].map.call(g.querySelectorAll('.bitem'),function(r){ return {d:r.children[0].value.trim(),q:nn(r.children[1].value)||1,u:nn(r.children[2].value)}; }).filter(function(r){ return r.d; });
      var sub=rows.reduce(function(a,r){ return a+r.q*r.u; },0); g.querySelector('.bgs').textContent=rows.length?mny(sub,c):''; return {k:g.dataset.proj,rows:rows,sub:sub}; });
    var sub=G.reduce(function(a,g){ return a+g.sub; },0), disc=nn(f.elements.discount.value), tot=Math.max(0,sub-disc), multi=G.filter(function(g){ return g.rows.length; }).length>1;
    var names=G.filter(function(g){ return g.k; }).map(function(g){ return nm[g.k]; }), covers=f._sc.all&&P.length>1?'كل المشاريع':names.join('، ');
    f.querySelector('.btot').textContent='الإجمالي: '+mny(tot,c);
    f.querySelector('.btk').innerHTML='<div class="btk-s"><span class="btk-lab">INVOICE</span><b>'+esc(mny(tot,c))+'</b>'+(covers?'<small>تشمل: '+esc(covers)+'</small>':'')+'</div><div class="btk-b">'+
      (G.some(function(g){ return g.rows.length; })?G.map(function(g){ return g.rows.length?(multi?'<div class="btk-h">'+esc(g.k?nm[g.k]:'بنود عامة')+'</div>':'')+g.rows.map(function(r){ return '<div class="btk-l"><span>'+esc(r.d)+(r.q!==1?' × '+r.q:'')+'</span><span dir="ltr">'+esc(mny(r.q*r.u,c))+'</span></div>'; }).join(''):''; }).join(''):'<div class="small muted">لا بنود بعد</div>')+
      (disc?'<div class="btk-l"><span>خصم</span><span dir="ltr">−'+esc(mny(disc,c))+'</span></div>':'')+'<div class="btk-t"><span>الإجمالي</span><span dir="ltr">'+esc(mny(tot,c))+'</span></div></div>'; }
  function bdetail(r){ var x=r.x, c=r.currency;
    if(r.src==='order') return '<div class="bdet"><div class="small muted">طلب من الموقع — تُدار دفعاته وفواتيره من تبويب الطلبات (مسار الدفع الحالي كما هو).</div><div class="actions"><button class="btn sm" type="button" data-bord="'+esc(r.code)+'">افتح الطلب</button></div></div>';
    var closed=x.status==='cancelled'||x.status==='refunded';
    return '<div class="bdet"><div class="bgrid"><div>'+
        '<div class="small muted">البنود</div><table class="btab">'+x.items.map(function(i){ return '<tr><td>'+esc(i.desc)+'</td><td dir="ltr">'+i.qty+' × '+esc(mny(i.unit,c))+'</td><td dir="ltr">'+esc(mny(i.qty*i.unit,c))+'</td></tr>'; }).join('')+(x.discount?'<tr><td>خصم</td><td></td><td dir="ltr">−'+esc(mny(x.discount,c))+'</td></tr>':'')+'<tr class="t"><td>الإجمالي</td><td></td><td dir="ltr">'+esc(mny(x.total,c))+'</td></tr></table>'+
        '<div class="small muted" style="margin-top:10px">الدفعات</div>'+(x.payments.length?'<div class="bpays">'+x.payments.map(function(p,i){ return '<div><b dir="ltr">'+esc(mny(p.amount,c))+'</b> · '+esc(p.date)+(p.method?' · '+esc(p.method):'')+(p.note?' · <span class="muted">'+esc(p.note)+'</span>':'')+(x.status!=='refunded'?' <button class="linkbtn small" type="button" data-bunpay="'+esc(x.id)+'" data-i="'+i+'">حذف</button>':'')+'</div>'; }).join('')+'</div>':'<div class="small muted">لا توجد دفعات بعد.</div>')+
        (x.refunded?'<div class="small">المسترد: <b dir="ltr">'+esc(mny(x.refunded,c))+'</b></div>':'')+
        (!closed&&x.balance>0?'<div class="bpay"><div class="small muted">تسجيل دفعة وصلت</div><div class="row"><div class="field"><input data-pamt type="number" min="0" step="any" value="'+x.balance+'"></div><div class="field"><input data-pmeth dir="auto" placeholder="الطريقة (تحويل، PayPal…)"></div><div class="field"><input data-pdate type="date" value="'+esc(BILL.today)+'"></div></div>'+
          '<div class="row"><div class="field"><input data-pnote dir="auto" placeholder="ملاحظة (اختياري)"></div><div class="field"><button class="btn sm primary" type="button" data-bpay="'+esc(x.id)+'">سجّل الدفعة</button></div></div></div>':'')+
      '</div><div><div class="actions bacts">'+
        '<button class="btn sm" type="button" data-bprev="'+esc(x.id)+'">معاينة الفاتورة</button>'+
        (x.status!=='cancelled'?'<button class="btn sm" type="button" data-bsend="'+esc(x.id)+'">'+(x.sent_at?'أعد الإرسال':'أرسل للعميل')+'</button>':'')+
        (x.sent_at&&(x.status==='pending'||x.status==='partial')&&x.balance>0?'<button class="btn sm" type="button" data-bremind="'+esc(x.id)+'"'+(x.reminded_at?' title="آخر تذكير: '+esc(wd(x.reminded_at))+'"':'')+'>تذكير لطيف</button>':'')+
        (!closed?'<button class="btn sm" type="button" data-bedit="'+esc(x.id)+'">تعديل</button>':'')+
        (!closed&&!x.paid?'<button class="btn sm danger" type="button" data-bst="cancelled" data-id="'+esc(x.id)+'">إلغاء الفاتورة</button>':'')+
        (x.paid>0&&x.status!=='refunded'?'<span class="brf"><input data-ramt type="number" min="0" step="any" value="'+x.paid+'" hidden aria-label="المبلغ المسترد"><button class="btn sm" type="button" data-bst="refunded" data-id="'+esc(x.id)+'">تسجيل استرداد</button></span>':'')+
        (closed?'<button class="btn sm" type="button" data-bst="reopen" data-id="'+esc(x.id)+'">إعادة فتح</button>':'')+
        (!x.sent_at&&!x.paid?'<button class="btn sm danger" type="button" data-bdel="'+esc(x.id)+'">حذف المسودة</button>':'')+
      '</div><div class="small muted">'+(x.sent_at?'أُرسلت '+esc(new Date(x.sent_at).toLocaleString('ar')):'مسودة — لم تُرسل للعميل ولا تظهر له')+(x.reminded_at?' · أُرسل تذكير الاستحقاق':'')+'</div>'+
      (BPREV[x.id]?'<iframe class="bprev" title="معاينة" srcdoc="'+esc(BPREV[x.id])+'"></iframe>':'')+'</div></div></div>'; }
  // a billing state → its colour family (the panel's colour language)
  var BFAM={pending:'wait',partial:'fix',paid:'ok',overdue:'bad',cancelled:'off',refunded:'off',draft:'off'};
  function billRow(r,td){ var fam=BFAM[r.state]||'off', open=['pending','partial'].indexOf(r.state)>=0, soon=open&&r.due&&r.due>=td&&(new Date(r.due)-new Date(td))/864e5<=3;
    return '<li><button type="button" class="orow st tf-'+fam+(BOPEN===r.src+':'+r.id?' on':'')+'" data-bopen="'+esc(r.src+':'+r.id)+'">'+
      '<span class="orow-m"><b>'+esc(r.name||r.email)+'</b><small dir="ltr">'+esc(r.no)+'</small></span>'+
      '<span class="orow-v" dir="ltr">'+esc(mny(r.total,r.currency))+'</span>'+
      '<span class="orow-p">'+esc(r.title||'')+(r.project?' · '+esc(r.project):'')+(r.src==='order'?' · طلب '+esc(r.code):'')+'</span>'+
      '<span class="tag">'+esc(BST[r.state]||r.state)+'</span>'+
      '<span class="orow-x">'+(r.due&&open?'<span class="'+(soon?'c-soon':'')+'">يستحق '+esc(wd(r.due))+'</span>':r.state==='overdue'&&r.due?'<em class="lt">استحقت '+esc(wd(r.due))+'</em>':'')+(r.balance&&r.balance!==r.total?'<span>متبقٍ <span dir="ltr">'+esc(mny(r.balance,r.currency))+'</span></span>':'')+'</span></button></li>'; }
  function renderBilling(){ var B=BILL;
    if(!B){ $('#panel').innerHTML='<section class="sec"><div class="empty">…</div></section>'; loadBilling(); return; }
    if(B.err){ $('#panel').innerHTML='<section class="sec"><h3>الفوترة</h3><div class="empty">'+(B.err==='db'?'قاعدة البيانات غير مربوطة.':B.err==='live'?'يعمل هذا القسم على الموقع المنشور.':'تعذّر التحميل.')+'</div></section>'; return; }
    var rows=billRows(), m=B.today.slice(0,7), out={}, paidM={}, nOver=0, nDraft=0;
    rows.forEach(function(r){ var c=r.currency; if(r.state==='overdue') nOver++; if(r.state==='draft') nDraft++;
      if(['pending','partial','overdue'].indexOf(r.state)>=0) out[c]=(out[c]||0)+r.balance;
      (r.payments||[]).forEach(function(p){ if(String(p.date||'').slice(0,7)===m) paidM[c]=(paidM[c]||0)+nn(p.amount); }); });
    var fmtMap=function(o){ var k=Object.keys(o); return k.length?k.map(function(c){ return '<span dir="ltr">'+esc(mny(o[c],c))+'</span>'; }).join(' · '):'0'; };
    var list=rows.filter(function(r){ return (!BF.status||r.state===BF.status)&&(!BF.source||r.src===BF.source)&&(!BF.client||r.email===BF.client); });
    var emails={}; rows.forEach(function(r){ emails[r.email]=r.name; });
    var sum=function(o){ return Object.keys(o).reduce(function(s,k){ return s+o[k]; },0); };
    var sel=BOPEN&&rows.filter(function(r){ return r.src+':'+r.id===BOPEN; })[0], isNew=BFORM&&!BFORM.id, td=B.today;
    var panel=isNew?'<div class="order item odetail"><div class="odh"><button class="btn sm oback" type="button" data-bx>‹ كل الفواتير</button><b>فاتورة جديدة</b></div><div class="body">'+bform(null)+'</div></div>'
      :sel?(function(r){ var fam=BFAM[r.state]||'off';
        return '<div class="order item odetail tf-'+fam+'"><div class="odh"><button class="btn sm oback" type="button" data-bback>‹ كل الفواتير</button><span class="code" dir="ltr">'+esc(r.no)+'</span><span class="tag">'+esc(BST[r.state]||r.state)+'</span><b>'+esc(r.name||r.email)+'</b>'+
          '<span class="muted small">'+esc(r.title||'')+(r.project?' · '+esc(r.project):'')+(r.src==='order'?' · طلب '+esc(r.code):'')+' · <span dir="ltr">'+esc(mny(r.total,r.currency))+'</span>'+(r.balance&&r.balance!==r.total?' · متبقٍ <span dir="ltr">'+esc(mny(r.balance,r.currency))+'</span>':'')+'</span></div>'+
          '<div class="body">'+(BFORM&&BFORM.id===r.id?bform(r.x):bdetail(r))+'</div></div>'; })(sel)
      :'<div class="odetail empty-sel">اختر فاتورة من القائمة</div>';
    $('#panel').innerHTML='<section class="sec kcsec"><div class="kcs">'+
        kc(fmtMap(out),'مستحق غير مدفوع','wait','k_wait',sum(out)>0)+kc(fmtMap(paidM),'دفعات هذا الشهر','ok','payments',sum(paidM)>0)+kc(nOver,'فواتير متأخرة','bad','k_late')+
        kc(rows.filter(function(r){return r.state==='paid'}).length,'مدفوعة','ok','k_done')+kc(nDraft,'مسودات','off','services')+'</div></section>'+
      '<div class="wbar"><div class="wfl"><select data-bf="status"><option value="">كل الحالات</option>'+['pending','partial','paid','overdue','cancelled','refunded','draft'].map(function(k){ return '<option value="'+k+'"'+(BF.status===k?' selected':'')+'>'+BST[k]+'</option>'; }).join('')+'</select>'+
        '<select data-bf="source"><option value="">كل المصادر</option><option value="ws"'+(BF.source==='ws'?' selected':'')+'>فواتير العملاء المتعاقدين</option><option value="order"'+(BF.source==='order'?' selected':'')+'>طلبات الموقع</option></select>'+
        '<select data-bf="client"><option value="">كل العملاء</option>'+Object.keys(emails).map(function(e){ return '<option value="'+esc(e)+'"'+(BF.client===e?' selected':'')+'>'+esc(emails[e]||e)+'</option>'; }).join('')+'</select></div>'+
        '<button class="btn sm primary" type="button" data-bnew>+ فاتورة جديدة</button><button class="btn sm danger" type="button" data-bpurge>حذف كل الفواتير…</button></div>'+
      '<div class="osplit'+(sel||isNew?' has-open':'')+'"><ul class="olist">'+(list.length?'<li class="olh">الفواتير · '+list.length+'</li>'+list.map(function(r){ return billRow(r,td); }).join(''):'<li class="olh">لا توجد فواتير هنا</li>')+'</ul>'+panel+'</div>'+
      '<p class="hint bhint">الفوترة يدوية: لا بوابة دفع. تُصدر فاتورة للعميل المتعاقد، وتسجّل كل دفعة عند وصولها، فتتغيّر الحالة تلقائياً: بانتظار الدفع ← مدفوعة جزئياً ← مدفوعة، وتصبح «متأخرة» بعد تاريخ الاستحقاق ويصل العميلَ تذكير واحد. طلبات الموقع تظهر هنا للاطلاع فقط، ودفعاتها من تبويب الطلبات كما هي.</p>';
    var f=$('#panel').querySelector('.bform'); if(f){ if(!f.querySelector('.btk')){ var tk=document.createElement('aside'); tk.className='btk'; tk.setAttribute('aria-live','polite'); f.appendChild(tk); } bInit(f,BFORM&&BFORM.id?BILL.invoices.filter(function(x){return x.id===BFORM.id})[0]:null); }
  }
  document.addEventListener('input',function(e){ if(TAB!=='billing') return; var f=e.target.closest&&e.target.closest('.bform'); if(f) bformSync(f); });
  document.addEventListener('change',function(e){ if(TAB!=='billing') return; var s=e.target; if(s.dataset.bf){ BF[s.dataset.bf]=s.value; renderBilling(); return; } var f=s.closest&&s.closest('.bform'); if(f){ if(s.name==='email'){ if(BFORM) BFORM.items=null; f._sc={all:false,keys:{}}; f._init=[]; f.querySelector('.bgroups').innerHTML=''; bInit(f,null); return; } bformSync(f); } });
  document.addEventListener('submit',function(e){ var f=e.target; if(!f.classList||!f.classList.contains('bform')) return; e.preventDefault(); var E=f.elements;
    var items=[].map.call(f.querySelectorAll('.bitem'),function(r){ return {desc:r.children[0].value.trim(),qty:nn(r.children[1].value)||1,unit:nn(r.children[2].value),project:r.closest('.bgrp').dataset.proj||''}; }).filter(function(i){ return i.desc; });
    bpost({action:'invoice',id:f.dataset.bid||undefined,client_email:E.email.value,scope:f._sc&&f._sc.all&&bPN(f).length>1?'all':undefined,title:E.title.value.trim(),period:E.period.value.trim(),currency:E.currency.value.trim()||'$',items:items,discount:E.discount.value,issue_date:E.issue.value,due_date:E.due.value,note:E.note.value.trim(),send:E.send.checked,
      links:!f.dataset.bid&&BFORM&&BFORM.links||undefined,annex:!f.dataset.bid&&BFORM&&BFORM.annex||undefined,credit:E.credit?E.credit.value:undefined},
      f.querySelector('button[type=submit]'),E.send.checked?'حُفظت الفاتورة وأُرسلت إلى العميل':'حُفظت الفاتورة').then(function(j){ if(j.ok){ delete OWE[E.email.value]; BFORM=null; BOPEN='ws:'+j.id; route(true); } }); });
  document.addEventListener('click',function(e){ if(TAB!=='billing') return; var b=e.target.closest('button'); if(!b) return;
    if(b.hasAttribute('data-bowe')){ bOweApply(b.closest('.bform')); return; }
    if(b.hasAttribute('data-bowe-redo')){ var em2=BFORM&&BFORM.email; BFORM={email:em2}; if(em2) delete OWE[em2]; renderBilling(); return; }
    if(b.dataset.bmb){ wpost({action:'monthBill',email:b.dataset.bmb}).then(function(j){ if(!j.ok) return toast('تعذّر التحميل',true); if(!j.items.length) return toast('لا بنود لهذا الشهر بعد',true);
        BFORM={email:j.email,project:j.project,items:j.items,title:j.title,currency:j.cur}; renderBilling(); toast('عُبّئت فاتورة الشهر من الاتفاق، راجعها قبل الإرسال'); }); return; }
    if(b.hasAttribute('data-bpurge')){ wpost({action:'invoicesPurge'}).then(function(j){ if(!j.ok) return toast('تعذّر التحميل',true);
        purgeWin({title:'حذف كل الفواتير',sub:'لبداية نظيفة بعد الفواتير التجريبية. الطلبات والعملاء والمشاريع تبقى كما هي.',counts:[[j.invoices,' فاتورة للعملاء'],[j.orders,' فاتورة على الطلبات'],['0001',' رقم الفاتورة القادمة (يبدأ الترقيم من جديد)',1]],
          typeLabel:'اكتب «احذف» للتأكيد',typeWord:'احذف',backup:true,run:function(){ return wpost({action:'invoicesPurge',confirm:true}); }}).then(function(m){ if(m!=='d') return;
          toast('حُذفت الفواتير، وعاد الترقيم إلى البداية'); BILL=null; BOPEN=null; loadBilling(); if(typeof loadOrders==='function') loadOrders(); }); }); return; }
    if(b.hasAttribute('data-bnew')){ BFORM={}; BOPEN=null; route(); renderBilling(); if(!matchMedia('(min-width:1001px)').matches) scrollTo(0,0); return; }
    if(b.hasAttribute('data-bx')){ BFORM=null; renderBilling(); return; }
    if(b.hasAttribute('data-bback')){ BOPEN=null; BFORM=null; route(); renderBilling(); return; }
    if(b.hasAttribute('data-badd')){ var d=bRow({}); b.closest('.bgrp').querySelector('.bitems').appendChild(d); d.firstChild.focus(); return; }
    if(b.hasAttribute('data-brm')){ var f=b.closest('.bform'), g=b.closest('.bgrp'); if(g.querySelectorAll('.bitem').length>1) b.closest('.bitem').remove(); else g.querySelectorAll('.bitem input').forEach(function(i){ i.value=i.name==='qty'?1:''; }); bSug(f); bformSync(f); return; }
    if(b.dataset.bsc!==undefined){ var f2=b.closest('.bform'), sc=f2._sc, k=b.dataset.bsc, P=bPN(f2);
      if(k==='*'){ sc.all=!sc.all; if(!sc.all){ sc.keys={'':sc.keys['']}; } }
      else if(sc.all&&k){ sc.all=false; P.forEach(function(p){ sc.keys[p.id]=p.id!==k; }); }
      else sc.keys[k]=!sc.keys[k];
      bGroups(f2); return; }
    if(b.dataset.bsug){ var g2=b.closest('.bgrp'), empty=[].filter.call(g2.querySelectorAll('.bitem'),function(r){ return !r.children[0].value.trim(); })[0], r2=empty||bRow({}); if(!empty) g2.querySelector('.bitems').appendChild(r2);
      r2.children[0].value=b.dataset.bsug; r2.children[2].focus(); bSug(b.closest('.bform')); bformSync(b.closest('.bform')); return; }
    if(b.dataset.bopen){ BOPEN=b.dataset.bopen; BFORM=null; route(); renderBilling(); if(!matchMedia('(min-width:1001px)').matches) scrollTo(0,0); return; }
    if(b.dataset.bord){ var ob=ORDERS.filter(function(o){ return o.code===b.dataset.bord; })[0]; if(ob){ OOPEN=ob.key; OPICK=true; } OFILTER='all'; TAB='orders'; render(); scrollTo(0,0); return; }
    if(b.dataset.bedit){ BFORM={id:b.dataset.bedit}; renderBilling(); return; }
    if(b.dataset.bprev){ var id=b.dataset.bprev; if(BPREV[id]){ delete BPREV[id]; renderBilling(); return; }
      fetch(API+'/work?admin=1&invoiceDoc='+encodeURIComponent(id),{headers:headers({}),cache:'no-store'}).then(function(r){ return r.text(); }).then(function(t){ BPREV[id]=t.replace(/src="\/assets\//g,'src="../assets/'); renderBilling(); }); return; }
    if(b.dataset.bsend){ bpost({action:'invoiceSend',id:b.dataset.bsend},b,'أُرسلت الفاتورة إلى العميل'); return; }
    if(b.dataset.bremind){ bpost({action:'invoiceRemind',id:b.dataset.bremind},b,'أُرسل التذكير إلى العميل'); return; }
    if(b.dataset.bpay){ var bx=b.closest('.bpay'); bpost({action:'invoicePay',id:b.dataset.bpay,amount:bx.querySelector('[data-pamt]').value,method:bx.querySelector('[data-pmeth]').value.trim(),date:bx.querySelector('[data-pdate]').value,note:bx.querySelector('[data-pnote]').value.trim()},b,'سُجّلت الدفعة وأُبلغ العميل'); return; }
    if(b.dataset.bunpay){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='متأكد؟'; return; } bpost({action:'invoiceUnpay',id:b.dataset.bunpay,index:+b.dataset.i},b,'حُذفت الدفعة'); return; }
    if(b.dataset.bst){ var st=b.dataset.bst, body={action:'invoiceStatus',id:b.dataset.id,status:st};
      if(st==='refunded'){ var ri=b.parentNode.querySelector('[data-ramt]'); if(ri.hidden){ ri.hidden=false; ri.focus(); b.textContent='أكّد الاسترداد'; return; } body.amount=ri.value; }
      else if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='متأكد؟ اضغط مرة أخرى'; return; }
      bpost(body,b,{cancelled:'أُلغيت الفاتورة',refunded:'سُجّل الاسترداد',reopen:'أُعيد فتح الفاتورة'}[st]); return; }
    if(b.dataset.bdel){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='متأكد؟'; return; } bpost({action:'invoiceDelete',id:b.dataset.bdel},b,'حُذفت المسودة').then(function(j){ if(j.ok) BOPEN=null; }); return; }
  });
