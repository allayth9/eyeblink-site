/* Eyeblink admin · settings — loaded after the files before it; all of admin/js shares one scope */
  /* ---------------- settings ---------------- */
  function renderSettings(){
    var S=C.settings=C.settings||{}; var T=(P&&P.templates)||DEFAULT_TPL;
    var tog=function(k,l){ return '<label class="check"><input type="checkbox" data-p="settings.'+k+'" data-t="check"'+(S[k]!==false?' checked':'')+'> '+l+'</label>'; };
    $('#panel').innerHTML=
      '<section class="sec"><h3>ما يظهر على الموقع</h3>'+tog('showStats','خانة الأرقام في الرئيسية')+tog('showWorkTeaser','الأعمال في الرئيسية')+tog('showPackagesTeaser','الباقات في الرئيسية')+tog('showPayments','طرق الدفع (صفحة الباقات وأسفل الموقع)')+tog('ordersOpen','استقبال الطلبات من صفحة الباقات')+'</section>'+
      '<section class="sec"><h3>التنبيهات</h3><p class="hint">يرسل رسالة تجريبية عبر تيليغرام ورسالة بريد تجريبية، ويعرض ردّ كل منهما. (بعد أي تغيير في متغيرات Cloudflare يلزم إجراء Retry deployment.)</p><div><button class="btn" type="button" id="notifyTest">أرسل تنبيهاً تجريبياً</button></div><pre id="notifyOut" class="small" hidden style="white-space:pre-wrap;margin-top:10px"></pre></section>'+
      '<section class="sec"><h3>تسجيل العملاء عبر Google</h3><p class="hint">العملاء يسجّلون بالإيميل وكلمة السر دائماً. لإضافة زر «المتابعة عبر Google» الصق هنا الـ Client ID من Google Cloud (ينتهي بـ apps.googleusercontent.com) ثم انشر.</p>'+
        '<div class="field"><label>Google Client ID</label><input data-p="settings.googleClientId" data-t="text" dir="ltr" value="'+esc(S.googleClientId||'')+'" placeholder="1234567890-xxxx.apps.googleusercontent.com"></div></section>'+
      '<section class="sec"><h3>عنوان علامة التبويب لكل صفحة</h3><p class="hint">النص الذي يظهر في تبويب المتصفح. اتركه فارغاً ليبقى العنوان الافتراضي (الظاهر باهتاً).</p>'+
        PAGES.map(function(pg){ var v=(C.titles&&C.titles[pg[0]])||{};
          return '<div class="field"><label>'+esc(pg[1])+'</label><div class="bi"><div><small>عربي</small><input data-p="titles.'+pg[0]+'.ar" data-t="text" value="'+esc(v.ar||'')+'" placeholder="'+esc(pg[2])+'"></div><div><small>ENGLISH</small><input data-p="titles.'+pg[0]+'.en" data-t="text" dir="ltr" value="'+esc(v.en||'')+'" placeholder="'+esc(pg[3])+'"></div></div></div>'; }).join('')+'</section>'+
      '<section class="sec"><h3>وسائل تواصل إضافية</h3><p class="hint">تظهر في صفحة التواصل، وكأزرار «تواصل خارجي» داخل حساب العميل.</p><div class="row">'+
        '<div class="field"><label>رقم واتساب (مع رمز الدولة)</label><input data-p="settings.whatsapp" data-t="text" dir="ltr" value="'+esc(S.whatsapp||'')+'" placeholder="+9715XXXXXXXX"></div>'+
        '<div class="field"><label>البريد الإلكتروني</label><input data-p="settings.email" data-t="text" dir="ltr" value="'+esc(S.email||'')+'"></div></div></section>'+
      '<section class="sec"><h3>رسائل الرد الجاهزة</h3><p class="hint">تُستخدم في صندوق الطلبات. المتغيرات: {name} {code} {package} {price} {method} {details} — و{details} تُملأ من «تفاصيل الدفع الخاصة».</p>'+
        ['confirm','paid','delivered'].map(function(k){ var lab={confirm:'تأكيد + تفاصيل الدفع',paid:'وصل الدفع',delivered:'تم التسليم'}[k];
          return '<div class="field"><label>'+lab+'</label><div class="bi"><div><small>عربي</small><textarea data-tpl="ar.'+k+'">'+esc((T.ar||{})[k]||'')+'</textarea></div><div><small>ENGLISH</small><textarea data-tpl="en.'+k+'" dir="ltr">'+esc((T.en||{})[k]||'')+'</textarea></div></div></div>'; }).join('')+'</section>'+
      '<section class="sec"><h3>كلمة سر اللوحة</h3>'+(LIVE?'<p class="hint">10 أحرف على الأقل. ستُطلب منك عند الدخول القادم.</p><div class="field"><label>كلمة السر الحالية</label><input type="password" id="np0" autocomplete="current-password"></div><div class="row"><div class="field"><label>كلمة السر الجديدة</label><input type="password" id="np1" autocomplete="new-password"></div><div class="field"><label>أعد كتابتها</label><input type="password" id="np2" autocomplete="new-password"></div></div><div><button class="btn primary" type="button" id="pwChange">تغيير كلمة السر</button></div>'
        :'<p class="hint">تغيير كلمة السر يعمل بعد نشر الموقع على Cloudflare. الدخول الأول يكون بكلمة السر التي تضعها في إعدادات Cloudflare (ADMIN_PASSWORD).</p>')+'</section>';
    var nt=$('#notifyTest'); if(nt) nt.onclick=function(){ var out=$('#notifyOut'); out.hidden=false;
      if(!LIVE){ out.textContent='يعمل على الموقع المنشور فقط.'; return; } out.textContent='…';
      fetch(API+'/notify-test',{method:'POST',headers:headers({})}).then(function(r){ return r.json(); }).then(function(j){
        var tr=function(d){ d=String(d||''); if(/chat not found/i.test(d)) return 'رقم TELEGRAM_CHAT غير صحيح، أو لم ترسل رسالة إلى البوت بعد.'; if(/Unauthorized|Not Found/i.test(d)) return 'TELEGRAM_TOKEN غير صحيح أو أُلغي. انسخه من جديد من BotFather.'; if(/not set/i.test(d)) return 'المتغيّر غير موجود (أو لم تُجرِ Retry deployment بعد).'; return d; };
        out.textContent='تيليغرام: '+(j.telegram&&j.telegram.ok?'✅ وصلت':'❌ '+tr(j.telegram&&j.telegram.description))+'\nالإيميل: '+(j.email&&j.email.ok?'✅ '+j.email.description:'❌ '+tr(j.email&&j.email.description)); })
        .catch(function(){ out.textContent='تعذّر الاتصال.'; }); };
    var pc=$('#pwChange'); if(pc) pc.onclick=function(){
      var a=$('#np1').value, b2=$('#np2').value;
      if(a.length<10){ toast('10 أحرف على الأقل',true); return; } if(a!==b2){ toast('الكلمتان غير متطابقتين',true); return; }
      fetch(API+'/auth',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({current:$('#np0').value,newPassword:a})})
        .then(function(r){ if(r.status===403){ toast('كلمة السر الحالية غير صحيحة',true); return; } if(!r.ok) throw 0; $('#np0').value=$('#np1').value=$('#np2').value=''; toast('تغيّرت كلمة السر'); })
        .catch(function(){ toast('تعذّر التغيير',true); });
    };
  }
  document.addEventListener('input',function(e){
    var k=e.target.dataset.tpl; if(!k) return; P=P||{}; P.templates=P.templates||JSON.parse(JSON.stringify(DEFAULT_TPL));
    var q=k.split('.'); P.templates[q[0]][q[1]]=e.target.value; dirty(); savePrivDraft();
  });

  /* ---------------- backup ---------------- */
  function renderBackup(){
    $('#panel').innerHTML='<section class="sec"><h3>تصدير نسخة</h3><p class="hint">انسخ المحتوى الكامل واحفظه في ملف نصي باسم content.json.</p>'+
      '<textarea id="exportBox" dir="ltr" style="min-height:220px;font-family:monospace;font-size:12px" readonly>'+esc(JSON.stringify(C,null,1))+'</textarea>'+
      '<div><button class="btn" type="button" id="copyExport">نسخ</button></div></section>'+
      '<section class="sec"><h3>استيراد نسخة</h3><p class="hint">اختر ملف content.json محفوظاً سابقاً. سيحل محل المحتوى الحالي في اللوحة (لن يُنشر حتى تضغط «نشر التعديلات»).</p>'+
      '<input type="file" id="importFile" accept="application/json,.json"></section>'+
      '<section class="sec"><h3>تجاهل المسودة</h3><p class="hint">يعيد اللوحة إلى آخر نسخة منشورة.</p><div><button class="btn danger" type="button" id="resetDraft">تجاهل المسودة</button></div></section>';
    $('#copyExport').onclick=function(){ var t=$('#exportBox'); try{ navigator.clipboard.writeText(t.value).then(function(){toast('تم النسخ')},function(){t.select()}); }catch(_){ t.select(); } };
    $('#importFile').onchange=function(){ var f=this.files[0]; if(!f) return; f.text().then(function(txt){ var j=JSON.parse(txt); if(!j.services) throw 0; C=j; saveDraft(); dirty(); toast('تم الاستيراد'); }).catch(function(){ toast('الملف غير صالح',true); }); };
    $('#resetDraft').onclick=function(){ try{ localStorage.removeItem('eb-draft'); localStorage.removeItem('eb-preview'); }catch(_){} C=JSON.parse(SAVED); dirty(); toast('عادت اللوحة للنسخة المنشورة'); };
  }
