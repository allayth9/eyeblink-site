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
  function bpost(body,btn,ok){ if(btn) btn.disabled=true;
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
    return '<form class="bform" data-bid="'+esc(x?x.id:'')+'" novalidate><div class="row"><div class="field"><label>العميل</label><select name="email">'+(cl.length?'':'<option value="">لا يوجد عملاء متعاقدون</option>')+cl.map(function(c){ return '<option value="'+esc(c.email)+'"'+(c.email===em?' selected':'')+'>'+esc(c.name)+' — '+esc(c.email)+'</option>'; }).join('')+(em&&!cl.some(function(c){return c.email===em})?'<option value="'+esc(em)+'" selected>'+esc(em)+'</option>':'')+'</select></div>'+
      '<div class="field"><label>المشروع (اختياري)</label><select name="project"></select></div></div>'+
      '<div class="row"><div class="field"><label>العنوان</label><input name="title" dir="auto" value="'+esc(x?x.title:'')+'" placeholder="مثلاً: باقة المحتوى الشهرية"></div><div class="field"><label>الفترة (اختياري)</label><input name="period" dir="auto" value="'+esc(x?x.period:'')+'" placeholder="نوفمبر 2026"></div>'+
        '<div class="field"><label>العملة</label><input name="currency" dir="ltr" list="bcurs" value="'+esc(x?x.currency:'$')+'"><datalist id="bcurs">'+CURS.map(function(c){ return '<option value="'+c+'">'; }).join('')+'</datalist></div></div>'+
      '<div class="small muted">البنود</div><div class="bitems">'+it.map(function(i){ return '<div class="bitem"><input name="desc" dir="auto" placeholder="البيان" value="'+esc(i.desc||'')+'"><input name="qty" type="number" min="0" step="any" placeholder="الكمية" value="'+esc(i.qty||1)+'"><input name="unit" type="number" min="0" step="any" placeholder="سعر الوحدة" value="'+esc(i.unit===''?'':i.unit)+'"><button type="button" class="linkbtn" data-brm>×</button></div>'; }).join('')+'</div>'+
      '<button type="button" class="btn sm" data-badd>+ بند</button>'+
      '<div class="row"><div class="field"><label>خصم</label><input name="discount" type="number" min="0" step="any" value="'+esc(x&&x.discount?x.discount:'')+'"></div><div class="field"><label>تاريخ الإصدار</label><input name="issue" type="date" value="'+esc(x?x.issue_date:td)+'"></div><div class="field"><label>تاريخ الاستحقاق</label><input name="due" type="date" value="'+esc(due)+'"></div></div>'+
      '<div class="field"><label>ملاحظة على الفاتورة (اختياري)</label><textarea name="note" dir="auto">'+esc(x?x.note:'')+'</textarea></div>'+
      '<div class="actions"><b class="btot">—</b><label class="check"><input type="checkbox" name="send"'+(x&&x.sent_at?'':' checked')+'> '+(x&&x.sent_at?'أعد إرسالها للعميل بعد الحفظ':'أرسلها للعميل الآن (بريد + إشعار)')+'</label><button class="btn primary sm" type="submit">'+(x?'حفظ الفاتورة':'إنشاء الفاتورة')+'</button><button class="btn sm" type="button" data-bx>إلغاء</button></div></form>'; }
  function bformSync(f){ var B=BILL, em=f.elements.email.value, sel=f.elements.project, cur=sel.value||sel.dataset.v||'';
    sel.innerHTML='<option value="">— بدون مشروع —</option>'+(B.projects||[]).filter(function(p){return p.client_email===em}).map(function(p){ return '<option value="'+esc(p.id)+'"'+(p.id===cur?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('');
    var c=f.elements.currency.value.trim()||'$', sub=[].reduce.call(f.querySelectorAll('.bitem'),function(a,r){ return a+nn(r.children[1].value)*nn(r.children[2].value); },0), tot=Math.max(0,sub-nn(f.elements.discount.value));
    f.querySelector('.btot').textContent='الإجمالي: '+mny(tot,c); }
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
        (!closed?'<button class="btn sm" type="button" data-bedit="'+esc(x.id)+'">تعديل</button>':'')+
        (!closed&&!x.paid?'<button class="btn sm danger" type="button" data-bst="cancelled" data-id="'+esc(x.id)+'">إلغاء الفاتورة</button>':'')+
        (x.paid>0&&x.status!=='refunded'?'<span class="brf"><input data-ramt type="number" min="0" step="any" value="'+x.paid+'" hidden aria-label="المبلغ المسترد"><button class="btn sm" type="button" data-bst="refunded" data-id="'+esc(x.id)+'">تسجيل استرداد</button></span>':'')+
        (closed?'<button class="btn sm" type="button" data-bst="reopen" data-id="'+esc(x.id)+'">إعادة فتح</button>':'')+
        (!x.sent_at&&!x.paid?'<button class="btn sm danger" type="button" data-bdel="'+esc(x.id)+'">حذف المسودة</button>':'')+
      '</div><div class="small muted">'+(x.sent_at?'أُرسلت '+esc(new Date(x.sent_at).toLocaleString('ar')):'مسودة — لم تُرسل للعميل ولا تظهر له')+(x.reminded_at?' · أُرسل تذكير الاستحقاق':'')+'</div>'+
      (BPREV[x.id]?'<iframe class="bprev" title="معاينة" srcdoc="'+esc(BPREV[x.id])+'"></iframe>':'')+'</div></div></div>'; }
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
    $('#panel').innerHTML=
      '<section class="sec"><div class="kpis"><div><b>'+fmtMap(out)+'</b><span>مستحق غير مدفوع</span></div><div><b>'+fmtMap(paidM)+'</b><span>دفعات هذا الشهر</span></div><div><b>'+nOver+'</b><span>فواتير متأخرة</span></div>'+
        '<div><b>'+rows.filter(function(r){return r.state==='paid'}).length+'</b><span>مدفوعة</span></div><div><b>'+nDraft+'</b><span>مسودات</span></div></div>'+
        '<p class="hint">الفوترة يدوية: لا بوابة دفع. تُصدر فاتورة للعميل المتعاقد، وتسجّل كل دفعة عند وصولها، فتتغيّر الحالة تلقائياً: بانتظار الدفع ← مدفوعة جزئياً ← مدفوعة، وتصبح «متأخرة» بعد تاريخ الاستحقاق ويصل العميلَ تذكير واحد. طلبات الموقع تظهر هنا للاطلاع فقط، ودفعاتها من تبويب الطلبات كما هي.</p></section>'+
      '<section class="sec"><div class="ph"><h3>الفواتير ('+list.length+')</h3><button class="btn sm primary" type="button" data-bnew>+ فاتورة جديدة</button></div>'+
        (BFORM&&!BFORM.id?'<div class="bnew">'+bform(null)+'</div>':'')+
        '<div class="wfl"><select data-bf="status"><option value="">كل الحالات</option>'+['pending','partial','paid','overdue','cancelled','refunded','draft'].map(function(k){ return '<option value="'+k+'"'+(BF.status===k?' selected':'')+'>'+BST[k]+'</option>'; }).join('')+'</select>'+
        '<select data-bf="source"><option value="">كل المصادر</option><option value="ws"'+(BF.source==='ws'?' selected':'')+'>فواتير العملاء المتعاقدين</option><option value="order"'+(BF.source==='order'?' selected':'')+'>طلبات الموقع</option></select>'+
        '<select data-bf="client"><option value="">كل العملاء</option>'+Object.keys(emails).map(function(e){ return '<option value="'+esc(e)+'"'+(BF.client===e?' selected':'')+'>'+esc(emails[e]||e)+'</option>'; }).join('')+'</select></div>'+
        (list.length?'<div class="blist">'+list.map(function(r){ var open=BOPEN===r.src+':'+r.id;
          return '<div class="brow'+(open?' open':'')+'"><button type="button" class="bsum" data-bopen="'+esc(r.src+':'+r.id)+'"><span class="bno" dir="ltr">'+esc(r.no)+'</span><span class="bnm"><b>'+esc(r.name||r.email)+'</b><small class="muted">'+esc(r.title||'')+(r.project?' · '+esc(r.project):'')+(r.src==='order'?' · طلب '+esc(r.code):'')+'</small></span>'+
            '<span class="bdt small muted">'+esc(r.issue||'')+(r.due?'<br>يستحق '+esc(r.due):'')+'</span><span class="bam" dir="ltr">'+esc(mny(r.total,r.currency))+(r.balance&&r.balance!==r.total?'<small>متبقٍ '+esc(mny(r.balance,r.currency))+'</small>':'')+'</span><span class="npill bs-'+esc(r.state)+'">'+esc(BST[r.state]||r.state)+'</span></button>'+
            (open?(BFORM&&BFORM.id===r.id?'<div class="bdet">'+bform(r.x)+'</div>':bdetail(r)):'')+'</div>'; }).join('')+'</div>':'<div class="empty">لا توجد فواتير هنا.</div>')+'</section>';
    var f=$('#panel').querySelector('.bform'); if(f){ var sel=f.elements.project; sel.dataset.v=(BFORM&&BFORM.id&&(BILL.invoices.filter(function(x){return x.id===BFORM.id})[0]||{}).project_id)||(BFORM&&BFORM.project)||''; bformSync(f); }
  }
  document.addEventListener('input',function(e){ if(TAB!=='billing') return; var f=e.target.closest&&e.target.closest('.bform'); if(f) bformSync(f); });
  document.addEventListener('change',function(e){ if(TAB!=='billing') return; var s=e.target; if(s.dataset.bf){ BF[s.dataset.bf]=s.value; renderBilling(); return; } var f=s.closest&&s.closest('.bform'); if(f) bformSync(f); });
  document.addEventListener('submit',function(e){ var f=e.target; if(!f.classList||!f.classList.contains('bform')) return; e.preventDefault(); var E=f.elements;
    var items=[].map.call(f.querySelectorAll('.bitem'),function(r){ return {desc:r.children[0].value.trim(),qty:nn(r.children[1].value)||1,unit:nn(r.children[2].value)}; }).filter(function(i){ return i.desc; });
    bpost({action:'invoice',id:f.dataset.bid||undefined,client_email:E.email.value,project_id:E.project.value||null,title:E.title.value.trim(),period:E.period.value.trim(),currency:E.currency.value.trim()||'$',items:items,discount:E.discount.value,issue_date:E.issue.value,due_date:E.due.value,note:E.note.value.trim(),send:E.send.checked},
      f.querySelector('button[type=submit]'),E.send.checked?'حُفظت الفاتورة وأُرسلت إلى العميل':'حُفظت الفاتورة').then(function(j){ if(j.ok){ BFORM=null; BOPEN='ws:'+j.id; } }); });
  document.addEventListener('click',function(e){ if(TAB!=='billing') return; var b=e.target.closest('button'); if(!b) return;
    if(b.hasAttribute('data-bnew')){ BFORM=BFORM&&!BFORM.id?null:{}; renderBilling(); return; }
    if(b.hasAttribute('data-bx')){ BFORM=null; renderBilling(); return; }
    if(b.hasAttribute('data-badd')){ var w=b.closest('.bform').querySelector('.bitems'), d=document.createElement('div'); d.className='bitem'; d.innerHTML='<input name="desc" dir="auto" placeholder="البيان"><input name="qty" type="number" min="0" step="any" value="1"><input name="unit" type="number" min="0" step="any" placeholder="سعر الوحدة"><button type="button" class="linkbtn" data-brm>×</button>'; w.appendChild(d); d.firstChild.focus(); return; }
    if(b.hasAttribute('data-brm')){ var f=b.closest('.bform'); if(f.querySelectorAll('.bitem').length>1) b.closest('.bitem').remove(); bformSync(f); return; }
    if(b.dataset.bopen){ BOPEN=BOPEN===b.dataset.bopen?null:b.dataset.bopen; if(BFORM&&BFORM.id) BFORM=null; renderBilling(); return; }
    if(b.dataset.bord){ var ob=ORDERS.filter(function(o){ return o.code===b.dataset.bord; })[0]; if(ob){ OOPEN=ob.key; OPICK=true; } OFILTER='all'; TAB='orders'; render(); scrollTo(0,0); return; }
    if(b.dataset.bedit){ BFORM={id:b.dataset.bedit}; renderBilling(); return; }
    if(b.dataset.bprev){ var id=b.dataset.bprev; if(BPREV[id]){ delete BPREV[id]; renderBilling(); return; }
      fetch(API+'/work?admin=1&invoiceDoc='+encodeURIComponent(id),{headers:headers({}),cache:'no-store'}).then(function(r){ return r.text(); }).then(function(t){ BPREV[id]=t.replace(/src="\/assets\//g,'src="../assets/'); renderBilling(); }); return; }
    if(b.dataset.bsend){ bpost({action:'invoiceSend',id:b.dataset.bsend},b,'أُرسلت الفاتورة إلى العميل'); return; }
    if(b.dataset.bpay){ var bx=b.closest('.bpay'); bpost({action:'invoicePay',id:b.dataset.bpay,amount:bx.querySelector('[data-pamt]').value,method:bx.querySelector('[data-pmeth]').value.trim(),date:bx.querySelector('[data-pdate]').value,note:bx.querySelector('[data-pnote]').value.trim()},b,'سُجّلت الدفعة وأُبلغ العميل'); return; }
    if(b.dataset.bunpay){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='متأكد؟'; return; } bpost({action:'invoiceUnpay',id:b.dataset.bunpay,index:+b.dataset.i},b,'حُذفت الدفعة'); return; }
    if(b.dataset.bst){ var st=b.dataset.bst, body={action:'invoiceStatus',id:b.dataset.id,status:st};
      if(st==='refunded'){ var ri=b.parentNode.querySelector('[data-ramt]'); if(ri.hidden){ ri.hidden=false; ri.focus(); b.textContent='أكّد الاسترداد'; return; } body.amount=ri.value; }
      else if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='متأكد؟ اضغط مرة أخرى'; return; }
      bpost(body,b,{cancelled:'أُلغيت الفاتورة',refunded:'سُجّل الاسترداد',reopen:'أُعيد فتح الفاتورة'}[st]); return; }
    if(b.dataset.bdel){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='متأكد؟'; return; } bpost({action:'invoiceDelete',id:b.dataset.bdel},b,'حُذفت المسودة').then(function(j){ if(j.ok) BOPEN=null; }); return; }
  });
