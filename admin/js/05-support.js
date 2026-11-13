/* Eyeblink admin · support — loaded after the files before it; all of admin/js shares one scope */
  /* ---------- support: tickets from the site's «هل يوجد مشكلة؟» window; replies also go out by e-mail ---------- */
  var SUPA=null, SOPEN=null, SFILT='open';
  function loadSupport(){ if(!LIVE){ SUPA=[]; if(TAB==='support') renderSupport(); return; }
    fetch(API+'/support?admin=1',{headers:headers({}),cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ SUPA=j.ok?j.tickets:[]; renderTabs(); if(TAB==='support') renderSupport(); }).catch(function(){ SUPA=SUPA||[]; }); }
  function supAct(body,btn,ok){ if(btn) btn.disabled=true; return api('/support','POST',body).then(function(j){ if(!j.ok) throw 0; SUPA=SUPA.map(function(s){ return s.id===j.ticket.id?j.ticket:s; }); if(ok) toast(ok); renderTabs(); renderSupport(); }).catch(function(){ if(btn) btn.disabled=false; toast('تعذّر ذلك، حاول مرة أخرى',true); }); }
  var SST={open:'مفتوحة',answered:'انرد عليها',closed:'مسكّرة'}, SFAM={open:'new',answered:'wait',closed:'off'}, SPICK=false;
  function renderSupport(){
    renderTabs(); if(!SUPA){ $('#panel').innerHTML='<div class="sec"><div class="empty">جارٍ التحميل…</div></div>'; loadSupport(); return; }
    var list=SUPA.filter(function(s){ return SFILT==='all'||(SFILT==='open'?s.status!=='closed':s.status===SFILT); });
    var wide=matchMedia('(min-width:1001px)').matches;
    if(!list.some(function(s){ return s.id===SOPEN; })&&!SPICK){ SOPEN=wide&&list[0]?list[0].id:null; }
    var cur=SUPA.filter(function(s){ return s.id===SOPEN; })[0];
    if(cur&&cur.unread&&LIVE) api('/support','POST',{action:'seen',id:cur.id}).then(function(){ cur.unread=0; renderTabs(); });
    var fmtT=function(a){ return new Date(a).toLocaleString('ar-u-nu-latn',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}); };
    var cnt=function(st){ return SUPA.filter(function(s){ return s.status===st; }).length; };
    $('#panel').innerHTML='<section class="sec kcsec"><div class="kcs">'+kc(cnt('open'),'بانتظار ردك','new','support')+kc(cnt('answered'),'بانتظار العميل','wait','k_wait')+kc(SUPA.filter(function(s){ return s.unread; }).length,'رسائل غير مقروءة','fix','notify')+kc(cnt('closed'),'مسكّرة','off','k_done')+'</div></section>'+
      '<div class="subtabs">'+[['open','المفتوحة'],['closed','المغلقة'],['all','الكل']].map(function(x){ return '<button type="button" data-sfilt="'+x[0]+'"'+(SFILT===x[0]?' aria-current="true"':'')+'>'+x[1]+'</button>'; }).join('')+'</div>'+
      (!SUPA.length?'<div class="sec"><div class="empty">لا توجد تذاكر دعم. حين يضغط أحد الزوار «هل يوجد مشكلة؟» في الموقع، تظهر التذكرة هنا</div></div>':
      '<div class="osplit'+(cur?' has-open':'')+'"><ul class="olist">'+(list.length?list.map(function(s){ var last=s.messages[s.messages.length-1];
        return '<li><button type="button" class="orow st tf-'+(SFAM[s.status]||'new')+(s.id===SOPEN?' on':'')+(s.unread?' unread':'')+'" data-sopen="'+esc(s.id)+'"><span class="orow-m"><b>'+esc(s.name)+'</b><small dir="ltr">'+esc(s.id)+'</small></span><span class="orow-v small">'+esc(fmtT(s.updatedAt||s.at))+'</span>'+
          '<span class="orow-p">'+esc(String(last.text).slice(0,90))+'</span><span class="tag">'+esc(SST[s.status])+'</span><span class="orow-x">'+(s.unread?'<i class="ounr">'+s.unread+'</i><span>'+(s.unread>1?'رسائل جديدة':'رسالة جديدة')+'</span>':'')+'</span></button></li>'; }).join(''):'<li class="muted small" style="padding:12px">لا شيء هنا</li>')+'</ul>'+
      (cur?'<section class="order item odetail supth tf-'+(SFAM[cur.status]||'new')+'"><div class="odh"><button class="btn sm oback" type="button" data-sback>‹ كل التذاكر</button><span class="code" dir="ltr">'+esc(cur.id)+'</span><span class="tag">'+esc(SST[cur.status])+'</span><b>'+esc(cur.name)+'</b><span class="muted small">'+esc(fmtT(cur.at))+'</span></div><div class="body"><div class="supth-h"><div><span class="muted small" dir="ltr">'+esc(cur.email)+'</span>'+(cur.acct?' <span class="muted small">· عميل بحساب</span>':cur.src==='team'?' <span class="muted small">· من الفريق</span>':' <span class="muted small">· زائر</span>')+'<div class="muted small">'+(cur.page?'من: <bdi dir="ltr">'+esc(cur.page.replace(/^https?:\/\/[^/]+/,''))+'</bdi>':'')+'</div></div>'+
          '<div class="actions">'+(cur.status==='closed'?'<button class="btn sm" type="button" data-sreopen="'+esc(cur.id)+'">إعادة فتح</button>':'<button class="btn sm" type="button" data-sclose="'+esc(cur.id)+'">إغلاق التذكرة</button>')+'<a class="btn sm" href="mailto:'+esc(cur.email)+'?subject='+encodeURIComponent('Eyeblink · '+cur.id)+'">إيميل</a></div></div>'+
        '<div class="athread">'+cur.messages.map(function(m){ return '<div class="amsg '+(m.from==='client'?'c':'s')+(m.from==='bot'?' k-bot':'')+'"><div>'+esc(m.text).replace(/\n/g,'<br>')+'</div><small>'+(m.from==='client'?esc(cur.name):m.from==='bot'?'رد تلقائي':'أنت')+' · '+esc(fmtT(m.at))+'</small></div>'; }).join('')+'</div>'+
        '<div class="asend"><textarea id="sreply" dir="auto" placeholder="اكتب ردك… (يصله في الموقع وعلى بريده الإلكتروني)"></textarea><button class="btn primary sm" type="button" data-sreply="'+esc(cur.id)+'">إرسال</button></div></div></section>':'<div class="odetail empty-sel">اختر تذكرة من القائمة</div>')+'</div>');
    var th=$('#panel .athread'); if(th) th.scrollTop=th.scrollHeight;
  }
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-sfilt],[data-sopen],[data-sback],[data-sreply],[data-sclose],[data-sreopen]'); if(!b) return; var D=b.dataset;
    if(D.sfilt){ SFILT=D.sfilt; SOPEN=null; SPICK=false; route(); renderSupport(); return; }
    if(D.sopen){ SOPEN=D.sopen; SPICK=true; route(); renderSupport(); if(!matchMedia('(min-width:1001px)').matches) scrollTo(0,0); return; }
    if(b.hasAttribute('data-sback')){ SOPEN=null; SPICK=false; route(); renderSupport(); return; }
    if(D.sreply){ var tx=($('#sreply')||{}).value||''; if(!tx.trim()){ toast('اكتب الرد',true); return; } supAct({action:'reply',id:D.sreply,text:tx.trim()},b,'وصل الرد للعميل'); return; }
    if(D.sclose){ supAct({action:'close',id:D.sclose},b,'أُغلقت التذكرة'); return; }
    if(D.sreopen){ supAct({action:'reopen',id:D.sreopen},b,'فُتحت التذكرة'); }
  });
  function renderOrders(){
    renderTabs();
    var list=ORDERS.filter(function(o){ return OFILTER==='all'||(OFILTER==='follow'?dueFollow(o):o.status===OFILTER); });
    var count=function(st){ return ORDERS.filter(function(o){return o.status===st}).length; }, due=ORDERS.filter(dueFollow).length;
    var methods=((C.payments&&C.payments.methods)||[]);
    var head='<section class="sec"><div class="crm-top"><h3>الطلبات والفرص</h3><button class="btn sm'+(NEWOPP?'':' primary')+'" type="button" data-oppnew>'+(NEWOPP?'إغلاق':'+ فرصة جديدة')+'</button></div>'+(NEWOPP?oppForm():'')+funnel()+
      '<div class="chips">'+[['all','الكل',ORDERS.length]].concat(due?[['follow','بحاجة إلى متابعة',due]]:[]).concat(Object.keys(ST).map(function(k){return [k,ST[k],count(k)]})).map(function(x){return '<button type="button" class="btn sm'+(OFILTER===x[0]?' primary':'')+(x[0]==='follow'?' due':'')+'" data-ofilter="'+x[0]+'">'+x[1]+(x[2]?' <small>'+x[2]+'</small>':'')+'</button>'}).join('')+'</div>'+
      '<details class="crmset"><summary class="small muted">أسباب الخسارة (عند إلغاء طلب)</summary><textarea id="lostList" dir="auto" rows="6">'+esc(lostReasons().join('\n'))+'</textarea><div class="actions"><span class="small muted">كل سبب بسطر</span><button class="btn sm" type="button" data-lostsave>حفظ</button></div></details>'+
      (!LIVE?'<p class="hint">هذا طلب تجريبي ليظهر لك طريقة العمل. الطلبات الحقيقية تصل هنا بعد نشر الموقع على Cloudflare.</p>':'')+'</section>';
    if(!list.length){ $('#panel').innerHTML=head+'<div class="sec"><div class="empty">لا توجد طلبات هنا.</div></div>'; return; }
    if(OPENCODE){ var oc=ORDERS.filter(function(o){ return o.code===OPENCODE; })[0]; if(oc){ OOPEN=oc.key; OPICK=true; } OPENCODE=null; }
    var wide=matchMedia('(min-width:1001px)').matches;
    if(!list.some(function(o){ return o.key===OOPEN; })){ OOPEN=wide&&list[0]?list[0].key:null; OPICK=false; }
    var sel=list.filter(function(o){ return o.key===OOPEN; })[0];
    $('#panel').innerHTML=head+'<div class="osplit'+(sel?' has-open':'')+'"><ul class="olist">'+list.map(orderRow).join('')+'</ul>'+(sel?[sel].map(function(o){
      var k=esc(o.key);
      return '<div class="order item odetail" data-okey="'+k+'"><div class="odh"><button class="btn sm oback" type="button" data-oback>‹ كل الطلبات</button><span class="chev">‹</span><span class="code">'+esc(o.code)+'</span><span class="pill '+esc(o.status)+'">'+esc(ST[o.status]||o.status)+(o.status==='cancelled'&&o.lostReason?' · '+esc(o.lostReason):'')+'</span>'+(o.manual?'<span class="pill src">'+esc(SRC[srcOf(o)]||'')+'</span>':'')+(dueFollow(o)?'<span class="pill due">متابعة'+(o.followUp<todayISO()?' متأخرة':' اليوم')+'</span>':o.followUp&&o.status!=='cancelled'&&o.status!=='delivered'?'<span class="pill">متابعة '+esc(fdate(o.followUp))+'</span>':'')+(o.paid?'<span class="pill paid">مدفوع</span>':'')+(o.unread?'<span class="pill unread">'+o.unread+' رسالة جديدة</span>':'')+
        '<b>'+esc(o.name)+' · '+esc(o.packageName||o.package)+'</b><span class="muted small">'+esc(new Date(o.createdAt).toLocaleDateString('ar'))+'</span></div><div class="body">'+
        '<div class="grid2"><div>'+
          '<div class="small muted">الطلب</div><div><b>'+esc(o.packageName||o.package)+'</b>'+(o.total?' · التقدير: <span dir="ltr">'+esc(o.total)+'</span>':'')+(o.qty>1?' · <b>×'+o.qty+'</b>':'')+(o.addons&&o.addons.length?'<br>إضافات: '+esc(o.addons.join('، ')):'')+((o.platforms||[]).length?'<br>المنصات: <span dir="ltr">'+esc(o.platforms.join(', '))+'</span>':'')+(o.payPref?'<br>الدفع المفضّل: '+esc(o.payPref):'')+'</div>'+
          '<div class="small muted" style="margin-top:8px">العميل</div><div>'+esc(o.name)+(o.email?' — <span dir="ltr" style="user-select:all">'+esc(o.email)+'</span>':'')+(o.contact?'<br><span class="muted small">تواصل خارجي:</span> <span dir="ltr" style="user-select:all">'+esc(o.contact)+'</span>':'')+'</div>'+
          (o.visit&&!o.visit.manual?'<div class="small muted" style="margin-top:8px">مصدر الزيارة</div><div class="small visit">'+[o.visit.source&&('المصدر: <b dir="ltr">'+esc(o.visit.source)+'</b>'),o.visit.utm&&('حملة: <span dir="ltr">'+esc(o.visit.utm)+'</span>'),o.visit.landing&&('أول صفحة: <span dir="ltr">'+esc(o.visit.landing)+'</span>'),o.visit.visits&&('عدد الزيارات قبل الطلب: '+esc(o.visit.visits)),o.visit.first&&('أول زيارة: '+esc(new Date(o.visit.first).toLocaleDateString('ar'))),(o.visit.country||o.visit.city)&&('الموقع: '+esc([o.visit.city,o.visit.country].filter(Boolean).join('، '))),o.visit.device&&('الجهاز: '+esc(DEV[o.visit.device]||o.visit.device)+' · '+esc(o.visit.os||''))].filter(Boolean).join(' · ')+'</div>':'')+
          '<div class="small muted" style="margin-top:8px">التفاصيل</div><pre>'+esc(o.details)+'</pre>'+
          (o.link?'<div dir="ltr" class="small"><a href="'+esc(o.link)+'" target="_blank" rel="noopener">'+esc(o.link)+'</a></div>':'')+(o.deadline?'<div class="small muted">الموعد: '+esc(o.deadline)+'</div>':'')+
          (o.email&&!hiddenOpp(o)?'<div class="small muted" style="margin-top:12px">المحادثة مع العميل (تظهر له في حسابه)</div><div class="athread">'+thread(o)+'</div>'+
            (o.review?'<div class="areview"><b>تقييم العميل: '+'★★★★★'.slice(0,o.review.stars)+'<span style="opacity:.3">'+'★★★★★'.slice(o.review.stars)+'</span></b>'+(o.review.text?'<p>'+esc(o.review.text)+'</p>':'')+
              (o.review.publish?'<label class="check"><input type="checkbox" data-rapprove="'+k+'"'+(o.review.approved?' checked':'')+'> اعرضه على الموقع</label>':'<span class="muted small">العميل لم يوافق على النشر.</span>')+'</div>':'')+
            '<div class="apend" hidden></div><div class="asend"><label class="btn sm" title="إرفاق ملف (حتى 20MB)">📎<input type="file" multiple hidden data-oup="'+k+'"></label><textarea data-msg dir="auto" placeholder="'+(o.status==='delivered'||o.status==='cancelled'?'المحادثة مغلقة عند العميل بعد التسليم، لكن رسالتك ستظهر له':'اكتب رداً للعميل…')+'"></textarea><button class="btn primary sm" type="button" data-osend="'+k+'">إرسال</button></div>':'')+
          '<div class="small muted" style="margin-top:8px">السجل</div><div class="small">'+(o.history||[]).map(function(h){return esc(ST[h.status]||h.status)+' · '+esc(new Date(h.at).toLocaleString('ar'))}).join('<br>')+'</div>'+
        '</div><div class="ofields">'+
          '<div class="row"><div class="field"><label>الحالة</label><select data-of="status">'+Object.keys(ST).map(function(s2){return '<option value="'+s2+'"'+(s2===o.status?' selected':'')+'>'+ST[s2]+'</option>'}).join('')+'</select></div>'+
          '</div>'+
          crmFields(o,k)+
          docsBox(o,k)+
          payFlow(o,k,methods)+
          '<div class="field"><label>ملاحظات داخلية</label><textarea data-of="notes">'+esc(o.notes)+'</textarea></div>'+
          '<div class="actions"><button class="btn primary sm" type="button" data-osave="'+k+'">حفظ الطلب</button><button class="btn sm danger" type="button" data-odel="'+k+'">حذف</button></div>'+
          '<div class="small muted" style="margin-top:6px">رسالة جاهزة</div><div class="actions"><button class="btn sm" type="button" data-reply="delivered" data-ok="'+k+'">رسالة التسليم</button></div>'+
          '<div class="replybox" hidden><textarea class="replytext" dir="auto"></textarea><div class="actions">'+(o.email?'<button class="btn sm primary" type="button" data-sendreply="'+k+'">أرسل في محادثة الموقع</button>':'')+'<button class="btn sm" type="button" data-copyreply>نسخ الرسالة</button><a class="btn sm" data-openreply target="_blank" rel="noopener">افتح المحادثة الخارجية</a></div></div>'+
        '</div></div></div></div>';
    }).join(''):'<div class="odetail empty-sel">اختر طلباً من القائمة</div>')+'</div>';
  }
  // one line per request: who, which package, the stage, the value, and what is waiting (unread messages, a follow-up due)
  function orderRow(o){ var k=esc(o.key), v=pnum(o.price||o.total), due=dueFollow(o);
    return '<li><button type="button" class="orow st s-'+esc(o.status)+(o.key===OOPEN?' on':'')+(o.unread?' unread':'')+'" data-oselect="'+k+'">'+
      '<span class="orow-m"><b>'+esc(o.name)+'</b><small dir="ltr">'+esc(o.code)+'</small></span>'+
      '<span class="orow-v" dir="ltr">'+(v?esc(pfmt(v,(C.packages&&C.packages.currency)||'$')):'')+'</span>'+
      '<span class="orow-p">'+esc(o.packageName||o.package||'')+(o.manual?' · '+esc(SRC[srcOf(o)]||''):'')+'</span>'+
      '<span class="tag s-'+esc(o.status)+'">'+esc(ST[o.status]||o.status)+'</span>'+
      '<span class="orow-x">'+(o.unread?'<i class="ounr">'+o.unread+'</i><span>'+(o.unread>1?'رسائل جديدة':'رسالة جديدة')+'</span>':'')+(due?'<em class="c-warn">متابعة'+(o.followUp<todayISO()?' متأخرة':' اليوم')+'</em>':'')+'</span></button></li>'; }
  // the chosen request (OPICK: chosen by you or by its address, not the first one shown by default)
  var OOPEN=null, OPICK=false, OPENCODE=null;
  function pickOrder(key){ OOPEN=key; OPICK=!!key; route(); renderOrders(); var d=$('#panel .odetail'); if(d&&!matchMedia('(min-width:1001px)').matches) scrollTo(0,0); else if(d) d.scrollTop=0; }
  document.addEventListener('click',function(e){ if(TAB!=='orders') return; var b=e.target.closest('[data-oselect],[data-oback]'); if(!b) return;
    pickOrder(b.dataset.oselect||null); });
  // ↑ ↓ walk the list, like a mail app (not while typing)
  document.addEventListener('keydown',function(e){ if(TAB!=='orders'||(e.key!=='ArrowDown'&&e.key!=='ArrowUp')||e.target.closest('input,textarea,select,[contenteditable]')||$('#cmdk')) return;
    var rows=[].slice.call(document.querySelectorAll('#panel .orow')); if(!rows.length) return; var i=rows.findIndex(function(r){ return r.classList.contains('on'); });
    var n=rows[Math.max(0,Math.min(rows.length-1,i+(e.key==='ArrowDown'?1:-1)))]; if(n&&n.dataset.oselect!==OOPEN){ e.preventDefault(); pickOrder(n.dataset.oselect); var r2=document.querySelector('#panel .orow.on'); if(r2) r2.scrollIntoView({block:'nearest'}); } });
  function thread(o){
    var m=o.messages||[]; if(!m.length) return '<div class="muted small">لا رسائل بعد. العميل يرى رسالة ترحيب تلقائية بأنكم سترسلون السعر خلال 24 ساعة.</div>';
    return m.map(function(x){ return '<div class="amsg '+(x.from==='client'?'c':'s')+(x.kind?' k-'+x.kind:'')+'">'+(x.text?'<div>'+esc(x.text).replace(/\n/g,'<br>').replace(/\[(\d{1,2}:\d{2})\]/g,'<b class="tcode">⏱ $1</b>')+'</div>':'')+
      (x.files||[]).map(function(f){ var u=esc(abs(f.url.replace(/^\//,''))); return /^image\//.test(f.type)?'<a href="'+u+'" target="_blank"><img class="afile" src="'+u+'" alt=""></a>'
        : /^video\//.test(f.type)?'<video class="afile" src="'+u+'" controls preload="metadata"></video>' : '<a class="adoc" href="'+u+'" target="_blank">📎 '+esc(f.name)+'</a>'; }).join('')+
      '<small>'+(x.from==='client'?'العميل':'أنت')+' · '+esc(new Date(x.at).toLocaleString('ar'))+'</small></div>'; }).join('');
  }
  var PEND={};   // files uploaded and waiting to be sent, per order
  function drawPend(key){ var d=document.querySelector('[data-okey="'+key+'"] .apend'); if(!d) return; var l=PEND[key]||[]; d.hidden=!l.length; d.innerHTML=l.map(function(f){ return '<span class="pill">📎 '+esc(f.name)+'</span>'; }).join(''); }
  document.addEventListener('change',function(e){ var inp=e.target; if(!inp.dataset||!inp.dataset.oup) return; var key=inp.dataset.oup, o=orderOf(key), list=[].slice.call(inp.files); inp.value='';
    if(!LIVE||o.demo){ toast('رفع الملفات يعمل على الموقع المنشور.',true); return; }
    list.forEach(function(file){ if(file.size>20*1024*1024){ toast('الحد 20MB للملف. للأكبر أرسل رابط Drive أو WeTransfer.',true); return; }
      toast('جارٍ رفع '+file.name+'…');
      fetch(API+'/files',{method:'POST',headers:headers({'content-type':file.type||'application/octet-stream','x-code':o.code,'x-filename':encodeURIComponent(file.name)}),body:file})
        .then(function(r){ return r.json(); }).then(function(j){ if(!j.ok) throw new Error(j.error||'fail'); (PEND[key]=PEND[key]||[]).push(j.file); drawPend(key); toast('جاهز للإرسال: '+file.name); })
        .catch(function(err){ toast('تعذّر رفع '+file.name+(err.message==='type'?' (نوع غير مدعوم)':''),true); }); }); });
  document.addEventListener('change',function(e){ var c=e.target; if(!c.dataset||!c.dataset.rapprove) return; var o=orderOf(c.dataset.rapprove);
    if(!LIVE||o.demo){ o.review.approved=c.checked; return; }
    fetch(API+'/orders',{method:'PATCH',headers:headers({'content-type':'application/json'}),body:JSON.stringify({key:o.key,reviewApproved:c.checked})}).then(function(r){ if(!r.ok) throw 0; o.review.approved=c.checked; toast(c.checked?'التقييم ظاهر على الموقع':'أُخفي التقييم'); }).catch(function(){ c.checked=!c.checked; toast('تعذّر الحفظ',true); }); });
  function sendMsg(key,text,btn,files){
    var o=orderOf(key); text=String(text||'').trim(); files=files||[]; if(!o||(!text&&!files.length)) return;
    var add=function(){ (o.messages=o.messages||[]).push({from:'studio',text:text,at:new Date().toISOString(),files:files.length?files:undefined}); delete PEND[key]; o.unread=0; renderOrders(); var d=document.querySelector('[data-okey="'+key+'"]'); if(d){ d.open=true; var th=d.querySelector('.athread'); if(th) th.scrollTop=th.scrollHeight; } toast('وصلت الرسالة إلى حساب العميل'); };
    if(!LIVE||o.demo){ add(); return; }
    if(btn) btn.disabled=true;
    fetch(API+'/orders',{method:'PATCH',headers:headers({'content-type':'application/json'}),body:JSON.stringify({key:key,message:text,files:files})}).then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(j){ if(j.order){ j.order.messages=(j.order.messages||[]).slice(0,-1); Object.assign(o,j.order); } add(); }).catch(function(){ if(btn) btn.disabled=false; toast('تعذّر الإرسال',true); });
  }
  document.addEventListener('toggle',function(e){ var d=e.target; if(!d.dataset||!d.dataset.okey||!d.open) return; var o=orderOf(d.dataset.okey);
    var th=d.querySelector('.athread'); if(th) th.scrollTop=th.scrollHeight;
    if(o&&o.unread&&LIVE&&!o.demo){ fetch(API+'/orders',{method:'PATCH',headers:headers({'content-type':'application/json'}),body:JSON.stringify({key:o.key,seen:true})}).then(function(){ o.unread=0; renderTabs(); var pl=d.querySelector('.pill.unread'); if(pl) pl.remove(); }).catch(function(){}); }
  },true);
  function orderOf(key){ return ORDERS.filter(function(o){return o.key===key})[0]; }
  function readOrderForm(box){ var d={}; [].forEach.call(box.querySelectorAll('[data-of]'),function(el){ d[el.dataset.of]= el.type==='checkbox'? el.checked : el.value; }); return d; }
  document.addEventListener('click',function(e){
    var b=e.target.closest('button,a'); if(!b) return;
    if(b.dataset.ofilter){ OFILTER=b.dataset.ofilter; renderOrders(); return; }
    if(b.dataset.oinv){ var oi=orderOf(b.dataset.oinv); if(!LIVE||oi.demo){ toast('يعمل على الموقع المنشور',true); return; } b.disabled=true;
      fetch(API+'/orders',{method:'PATCH',headers:headers({'content-type':'application/json'}),body:JSON.stringify({key:oi.key,resendInvoice:b.dataset.kind||'final'})}).then(function(r){ if(!r.ok) throw 0; toast('أُرسلت الفاتورة إلى بريد العميل'); }).catch(function(){ toast('تعذّر الإرسال',true); }).then(function(){ b.disabled=false; }); return; }
    if(b.dataset.osend){ sendMsg(b.dataset.osend, b.closest('.asend').querySelector('textarea').value, b, PEND[b.dataset.osend]); return; }
    if(b.dataset.sendreply){ sendMsg(b.dataset.sendreply, b.closest('.replybox').querySelector('textarea').value, b); return; }
    if(b.dataset.osave){ var box=b.closest('.order'), d=readOrderForm(box), o=orderOf(b.dataset.osave);
      var apply=function(){ if(d.status!==o.status){ (o.history=o.history||[]).push({at:new Date().toISOString(),status:d.status}); } Object.assign(o,d); renderOrders(); toast('حُفظ الطلب'); };
      if(!LIVE||o.demo){ apply(); return; }
      d.key=o.key;
      fetch(API+'/orders',{method:'PATCH',headers:headers({'content-type':'application/json'}),body:JSON.stringify(d)}).then(function(r){ if(!r.ok) throw 0; return r.json(); })
        .then(function(j){ Object.assign(o,j.order||d); renderOrders(); toast('حُفظ الطلب'); }).catch(function(){ toast('تعذّر الحفظ',true); });
      return; }
    if(b.dataset.reply){ var o2=orderOf(b.dataset.ok), box2=b.closest('.order'), d2=readOrderForm(box2), oo=Object.assign({},o2,d2);
      var lang=o2.lang==='en'?'en':'ar', T=(P&&P.templates&&P.templates[lang])||DEFAULT_TPL[lang];
      var text=fill(T[b.dataset.reply]||'',oo), rb=box2.querySelector('.replybox');
      rb.hidden=false; rb.querySelector('textarea').value=text;
      var a=rb.querySelector('[data-openreply]'), link=contactLink(o2.contact,text); a.hidden=!link; if(link) a.href=link; return; }
    if(b.hasAttribute('data-copyreply')){ var t=b.closest('.replybox').querySelector('textarea'); try{ navigator.clipboard.writeText(t.value).then(function(){toast('نُسخت الرسالة')},function(){t.select()}); }catch(_){ t.select(); } return; }
    if(b.dataset.odel){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='تأكيد الحذف؟'; return; }
      var key=b.dataset.odel, o3=orderOf(key);
      var rm=function(){ ORDERS=ORDERS.filter(function(x){return x.key!==key}); renderOrders(); };
      if(!LIVE||o3.demo){ rm(); return; }
      fetch(API+'/orders?key='+encodeURIComponent(key),{method:'DELETE',headers:headers({})}).then(function(r){ if(!r.ok) throw 0; rm(); }).catch(function(){ toast('تعذّر الحذف',true); }); }
  });

  // new requests and client messages arrive without reloading (skipped while you are typing in an order)
  setInterval(function(){ if(!LIVE||document.hidden) return; var a=document.activeElement; if(TAB==='orders'&&a&&a.closest&&a.closest('.order')) return; loadOrders(); },30000);
