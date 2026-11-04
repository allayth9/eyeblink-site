/* Eyeblink — client accounts: sign in (Google or email + password), the account page with order tracking and the
   chat thread with the studio. Talks to /api/account and /api/thread. Exposes window.EBAcct for the order form. */
(function(){
  var root=document.documentElement, lang=root.lang==='en'?'en':'ar', AR=lang==='ar';
  var BASE=document.body.getAttribute('data-base')||'', API=BASE+'api/';
  var T={
    ar:{mg:{h:'إدارة الطلب',p:'يمكنك تعديل طلبك ما دام الاستوديو يراجع تفاصيله، وإلغاؤه قبل الدفع أو بدء التنفيذ.',pc:'لم يعد تعديل الطلب متاحاً بعد تأكيد السعر، ويمكنك إلغاؤه قبل الدفع.',locked:'بدأ العمل على هذا الطلب، لذا لم يعد تعديله أو إلغاؤه متاحاً من هنا. اكتب لنا في المحادثة لأي تغيير.',edit:'تعديل الطلب',cancel:'إلغاء الطلب',sure:'تأكيد الإلغاء',why:'سبب الإلغاء (اختياري)',save:'حفظ التعديلات',back:'تراجع',det:'تفاصيل الطلب',link:'رابط مرجعي (اختياري)',dl:'الموعد المطلوب (اختياري)',ct:'وسيلة التواصل (اختياري)',saved:'حُفظت التعديلات، وأُرسل إليك تأكيد.',gone:'أُلغي الطلب، وأُرسل إليك تأكيد.',need:'اكتب تفاصيل الطلب.',badLink:'يجب أن يبدأ الرابط بـ https://',err:'تعذّر التنفيذ. ربما تغيّرت حالة الطلب، فحدّث الصفحة.',edited:'عدّلتَ الطلب في '},inH:'سجّل دخولك لمتابعة طلبك',inP:'حساب واحد تتابع منه حالة الطلب، وتتحدث معنا مباشرة حتى لحظة التسليم.',
        login:'دخول',register:'حساب جديد',name:'الاسم أو اسم الجهة',email:'البريد الإلكتروني',pw:'كلمة السر',pwHint:'8 أحرف على الأقل',
        doLogin:'دخول',doRegister:'إنشاء الحساب',or:'أو',wait:'لحظة…',close:'إغلاق',
        e:{exists:'هذا البريد مسجّل مسبقاً، سجّل الدخول بدلاً من ذلك.',wrong:'البريد أو كلمة السر غير صحيحة.',google:'هذا الحساب مسجّل عبر Google، استخدم زر Google.',
           email:'اكتب بريداً إلكترونياً صحيحاً.',code:'الرمز غير صحيح أو انتهت صلاحيته.',password:'كلمة السر 8 أحرف على الأقل.',name:'اكتب اسمك.','too many attempts':'محاولات كثيرة، جرّب بعد قليل.',net:'تعذّر الاتصال، حاول مرة أخرى.'},
        W:{chip:'عميل متعاقد',since:'منذ ',on:'حسابك مفعّل بصفة عميل متعاقد، وستظهر مشاريعك ومهامك هنا فور أن يفتح لك الاستوديو مشروعاً.',askH:'هل لديك تعاون مستمر مع Eyeblink؟',askP:'إذا كنت عميلاً حالياً لدى الاستوديو، اطلب الوصول إلى مساحة العمل لترسل مهامك وتتابع التنفيذ والتسليمات من مكان واحد.',ask:'أنا عميل حالي وأريد الوصول إلى مساحة العمل',company:'اسم الجهة أو المشروع (اختياري)',note:'ما طبيعة الاتفاق بينك وبين الاستوديو؟ (اختياري)',send:'أرسل الطلب',cancel:'إلغاء',pending:'وصل طلبك إلى الاستوديو، وسنرد عليك بعد المراجعة. لن تُفعَّل مساحة العمل قبل موافقتنا.',rejected:'لم تُفعَّل مساحة العمل بناءً على طلبك السابق.',again:'أرسل طلباً جديداً',invH:'دعوة إلى مساحة عمل Eyeblink',invP:'سجّل دخولك أو أنشئ حسابك بالبريد نفسه الذي وصلته الدعوة:',invOk:'تمّ! أصبح حسابك حساب عميل متعاقد.',invUsed:'هذه الدعوة استُخدمت من قبل.',invBad:'رابط الدعوة غير صالح أو انتهت صلاحيته. اطلب من الاستوديو دعوة جديدة.',invOther:'هذه الدعوة مرسلة إلى بريد آخر: ',invSwitch:'سجّل الخروج وادخل بذلك البريد'},
        hi:'أهلاً، ',logout:'خروج',newOrder:'طلب جديد',orders:'طلباتك',none:'لا توجد طلبات بعد.',noneP:'اختر خدمة من صفحة الأسعار وأرسل طلبك، وستتابعه من هنا.',seePricing:'تصفّح الخدمات',
        st:{'new':'استلمنا الطلب','confirmed':'تأكيد التفاصيل','awaiting-payment':'بانتظار الدفع','paid':'تم الدفع','in-progress':'قيد التنفيذ','review':'بانتظار مراجعتك','delivered':'تم التسليم','cancelled':'ملغى'},
        steps:['استلام الطلب','تأكيد التفاصيل','الدفع','التنفيذ','مراجعتك','التسليم'],
        sum:'ملخص الطلب',est:'التقدير',final:'السعر النهائي',adds:'الإضافات',deadline:'الموعد',details:'التفاصيل',
        chat:'المحادثة',write:'اكتب رسالتك…',send:'إرسال',you:'أنت',studio:'Eyeblink',
        hello:'استلمنا طلبك. سنراجع التفاصيل ونرد عليك هنا خلال 24 ساعة بالسعر النهائي وخطوات العمل.',
        closed:'أُغلقت المحادثة بعد التسليم. للتواصل استخدم الوسائل الخارجية.',cancelled:'أُلغي هذا الطلب.',
        payH:'الدفع',payAmt:'المبلغ المطلوب',payVia:'الطريقة',copyD:'نسخ التفاصيل',copied:'نُسخت',receipt:'أرفق إيصال الدفع',receiptSent:'وصلنا الإيصال، وسنؤكد الدفع قريباً.',receiptText:'🧾 إيصال الدفع',paidOk:'وصل الدفع، شكراً لك. بدأنا العمل.',attach:'إرفاق ملف',uploading:'جارٍ رفع ',tooBig:'الحد 20MB للملف. للملفات الأكبر أرسل رابط Google Drive أو WeTransfer.',badType:'نوع الملف غير مدعوم. أرسل صوراً، فيديو، صوتاً، PDF أو ZIP.',
        tc:'علّق على هذه اللحظة',tcHint:'شغّل الفيديو، أوقفه عند اللحظة، ثم اكتب ملاحظتك',invoice:'الفاتورة',
        rate:'كيف كانت تجربتك؟',rateP:'رأيك يهمنا، ويساعد عملاء جدد على الثقة بنا.',publish:'أوافق على عرض تقييمي على الموقع باسمي الأول فقط',sendRate:'أرسل التقييم',thanks:'شكراً لتقييمك',
        forgot:'نسيت كلمة السر؟',forgotH:'استعادة كلمة السر',forgotP:'اكتب بريدك، وسنرسل لك رمزاً من 6 أرقام.',sendCode:'أرسل الرمز',codeSent:'إن كان البريد مسجلاً لدينا، وصلك رمز الآن. تحقق من البريد غير المرغوب أيضاً.',
        code:'الرمز',newPw:'كلمة السر الجديدة',saveIn:'حفظ والدخول',backIn:'رجوع لتسجيل الدخول',mailOff:'الاستعادة التلقائية غير مفعّلة بعد. راسلنا على إنستغرام ونعيد تعيينها لك فوراً.',
        inv:{t:'فاتورة',no:'رقم',date:'التاريخ',to:'إلى',item:'البند',amount:'المبلغ',total:'الإجمالي',paid:'مدفوعة',unpaid:'غير مدفوعة بعد',method:'طريقة الدفع',thanks:'شكراً لثقتك بنا.'},
        ext:'تواصل خارجي',extP:'تفضّل محادثة أسرع؟ راسلنا وأرفق رقم طلبك.',ig:'إنستغرام',wa:'واتساب',mail:'البريد الإلكتروني',back:'كل الطلبات',paid:'مدفوع',unread:'رسائل جديدة'},
    en:{mg:{h:'Manage request',p:'You can edit your request while the studio is reviewing it, and cancel it before payment or before work starts.',pc:'Editing closes once the price is confirmed; you can still cancel before paying.',locked:'Work has started on this request, so it can no longer be edited or cancelled here. Write to us in the chat for any change.',edit:'Edit request',cancel:'Cancel request',sure:'Confirm cancellation',why:'Reason (optional)',save:'Save changes',back:'Back',det:'Request details',link:'Reference link (optional)',dl:'Requested date (optional)',ct:'Contact (optional)',saved:'Changes saved — we sent you a confirmation.',gone:'Request cancelled — we sent you a confirmation.',need:'Write the request details.',badLink:'The link must start with https://',err:'Could not do that. The request may have changed; refresh the page.',edited:'You edited this request on '},inH:'Sign in to follow your request',inP:'One account to track your order and talk to us directly until delivery.',
        login:'Sign in',register:'New account',name:'Your name or company',email:'Email',pw:'Password',pwHint:'At least 8 characters',
        doLogin:'Sign in',doRegister:'Create account',or:'or',wait:'One moment…',close:'Close',
        e:{exists:'This email already has an account. Sign in instead.',wrong:'Wrong email or password.',google:'This account uses Google. Use the Google button.',
           email:'Enter a valid email.',code:'Wrong or expired code.',password:'Password needs at least 8 characters.',name:'Enter your name.','too many attempts':'Too many attempts. Try again shortly.',net:'Could not connect. Try again.'},
        W:{chip:'Active Client',since:'since ',on:'Your account is an Active Client account. Your projects and tasks appear here as soon as the studio opens one for you.',askH:'Working with Eyeblink on an ongoing basis?',askP:'If you are already a client of the studio, ask for the workspace to send your tasks and follow the work and deliveries in one place.',ask:'I am a current client and want workspace access',company:'Company or project name (optional)',note:'What is your arrangement with the studio? (optional)',send:'Send request',cancel:'Cancel',pending:'Your request reached the studio and will be reviewed. The workspace opens only after we approve it.',rejected:'Your previous request did not open the workspace.',again:'Send a new request',invH:'Invitation to the Eyeblink workspace',invP:'Sign in or create your account with the email the invitation was sent to:',invOk:'Done! Your account is now an Active Client account.',invUsed:'This invitation has already been used.',invBad:'This invitation link is not valid or has expired. Ask the studio for a new one.',invOther:'This invitation was sent to another email: ',invSwitch:'Sign out and use that email'},
        hi:'Hi, ',logout:'Sign out',newOrder:'New request',orders:'Your requests',none:'No requests yet.',noneP:'Pick a service on the pricing page and send your request. You will follow it here.',seePricing:'Browse services',
        st:{'new':'Request received','confirmed':'Details confirmed','awaiting-payment':'Awaiting payment','paid':'Paid','in-progress':'In production','review':'Awaiting your review','delivered':'Delivered','cancelled':'Cancelled'},
        steps:['Received','Confirmed','Payment','Production','Your review','Delivered'],
        sum:'Summary',est:'Estimate',final:'Final price',adds:'Add-ons',deadline:'Target date',details:'Details',
        chat:'Conversation',write:'Write a message…',send:'Send',you:'You',studio:'Eyeblink',
        hello:'We received your request. We will review it and reply here within 24 hours with the final price and next steps.',
        closed:'This conversation closed after delivery. Use the links below to reach us.',cancelled:'This request was cancelled.',
        payH:'Payment',payAmt:'Amount due',payVia:'Method',copyD:'Copy details',copied:'Copied',receipt:'Attach payment receipt',receiptSent:'We got your receipt and will confirm the payment shortly.',receiptText:'🧾 Payment receipt',paidOk:'Payment received, thank you. Work has started.',attach:'Attach a file',uploading:'Uploading ',tooBig:'20 MB per file. For bigger files send a Google Drive or WeTransfer link.',badType:'File type not supported. Send images, video, audio, PDF or ZIP.',
        tc:'Comment on this moment',tcHint:'Play the video, pause on the moment, then write your note',invoice:'Invoice',
        rate:'How was your experience?',rateP:'Your opinion matters, and it helps new clients trust us.',publish:'Show my review on the site with my first name only',sendRate:'Send review',thanks:'Thank you for your review',
        forgot:'Forgot your password?',forgotH:'Reset your password',forgotP:'Enter your email and we will send you a 6-digit code.',sendCode:'Send code',codeSent:'If this email has an account, a code is on its way. Check spam too.',
        code:'Code',newPw:'New password',saveIn:'Save and sign in',backIn:'Back to sign in',mailOff:'Automatic reset is not on yet. Message us on Instagram and we will reset it right away.',
        inv:{t:'Invoice',no:'No.',date:'Date',to:'Bill to',item:'Item',amount:'Amount',total:'Total',paid:'Paid',unpaid:'Not paid yet',method:'Payment method',thanks:'Thank you for working with us.'},
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
    var gid=((C().settings||{}).googleClientId||'').trim(), mode=(new URLSearchParams(location.search).get('next')==='workspace'||/^#w/.test(location.hash))?'login':'register';   // clients coming to the workspace already have an account
    // the live settings (with the Google Client ID) can arrive a moment after this box is drawn: redraw once they do
    if(!gid && !window.EBLive) document.addEventListener('eb:content',function again(){ document.removeEventListener('eb:content',again);
      var g=((C().settings||{}).googleClientId||'').trim(); if(g && host.isConnected && host.querySelector('.auth') && !host.querySelector('.gbtn')) authBox(host,done,compact); });
    host.innerHTML='<div class="auth">'+(compact?'':'<span class="eyebrow">ACCOUNT</span>')+'<h2>'+T.inH+'</h2><p class="muted">'+T.inP+'</p>'+
      (gid?'<div class="gwrap"><span class="gface" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.5 5.5 0 0 1-2.39 3.62v3h3.86c2.26-2.09 3.58-5.16 3.58-8.81z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.92l-3.86-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.28v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.28a12 12 0 0 0 0 10.76z"/><path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.43-3.43A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.28 6.62l3.99 3.1C6.22 6.88 8.87 4.77 12 4.77z"/></svg><b>'+(AR?'المتابعة عبر Google':'Continue with Google')+'</b></span><div class="gbtn" aria-live="polite"></div></div><div class="or"><span>'+T.or+'</span></div>':'')+
      '<div class="seg" role="tablist"><button type="button" data-m="register" aria-selected="true">'+T.register+'</button><button type="button" data-m="login" aria-selected="false">'+T.login+'</button></div>'+
      '<form class="form" novalidate><label class="nm">'+T.name+'<input name="name" autocomplete="name" required></label>'+
      '<label>'+T.email+'<input name="email" type="email" dir="ltr" autocomplete="email" required></label>'+
      '<label>'+T.pw+' <small class="muted">'+T.pwHint+'</small><input name="password" type="password" dir="ltr" autocomplete="new-password" minlength="8" required></label>'+
      '<button class="btn btn-primary" type="submit" style="justify-content:center">'+T.doRegister+'</button><p class="msg" role="alert"></p>'+
      '<button type="button" class="linkbtn forgot" hidden>'+T.forgot+'</button></form></div>';
    var f=host.querySelector('form'), msg=host.querySelector('.msg');
    function setMode(m){ mode=m; [].forEach.call(host.querySelectorAll('.seg button'),function(b){ b.setAttribute('aria-selected',b.dataset.m===m); });
      f.querySelector('.nm').hidden=m!=='register'; f.elements.name.required=m==='register'; f.elements.password.autocomplete=m==='register'?'new-password':'current-password';
      f.querySelector('button[type=submit]').textContent=m==='register'?T.doRegister:T.doLogin; msg.textContent=''; f.querySelector('.forgot').hidden=m!=='login'; }
    f.querySelector('.forgot').onclick=function(){ forgotBox(host,done,compact,f.elements.email.value.trim()); };
    host.querySelector('.seg').onclick=function(e){ var b=e.target.closest('button'); if(b) setMode(b.dataset.m); };
    if(mode!=='register') setMode(mode);
    function finish(j,btn,old){
      if(btn){ btn.disabled=false; btn.textContent=old; }
      if(j.ok){ me().then(function(){ done(ME); }); return; }
      if(j._none){ ME=false; done(false); return; }
      if(j.error==='exists') setMode('login');
      msg.textContent=T.e[j.error]||T.e[j._net?'net':'wrong'];
    }
    f.onsubmit=function(e){ e.preventDefault();
      var E=f.elements, d={action:mode,name:E.name.value.trim(),email:E.email.value.trim(),password:E.password.value,lang:lang};
      if(mode==='register'&&!d.name){ msg.textContent=T.e.name; return; }
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)){ msg.textContent=T.e.email; return; }
      if(d.password.length<8){ msg.textContent=T.e.password; return; }
      var btn=f.querySelector('button[type=submit]'), old=btn.textContent; btn.disabled=true; btn.textContent=T.wait;
      api('account',d).then(function(j){ finish(j,btn,old); });
    };
    if(gid){ loadGoogle().then(function(){
      var el=host.querySelector('.gbtn'); if(!el||!window.google) return;
      google.accounts.id.initialize({client_id:gid, callback:function(r){ msg.textContent=T.wait; api('account',{action:'google',credential:r.credential,lang:lang}).then(function(j){ finish(j); }); }});
      google.accounts.id.renderButton(el,{theme:'filled_black',size:'large',shape:'pill',text:'continue_with',locale:lang,width:Math.min(380,el.clientWidth||320)});
    }).catch(function(){ var el=host.querySelector('.gbtn'); if(el){ (el.closest('.gwrap')||el).remove(); var o=host.querySelector('.or'); if(o) o.remove(); } }); }
  }
  // forgot password: e-mail → 6-digit code → new password (signs in)
  function forgotBox(host,done,compact,email){
    host.innerHTML='<div class="auth"><h2>'+T.forgotH+'</h2><p class="muted">'+T.forgotP+'</p>'+
      '<form class="form s1" novalidate><label>'+T.email+'<input name="email" type="email" dir="ltr" autocomplete="email" value="'+esc(email||'')+'"></label>'+
      '<button class="btn btn-primary" type="submit" style="justify-content:center">'+T.sendCode+'</button></form>'+
      '<form class="form s2" novalidate hidden><p class="note">'+T.codeSent+'</p><label>'+T.code+'<input name="code" inputmode="numeric" autocomplete="one-time-code" dir="ltr" maxlength="6" class="otp"></label>'+
      '<label>'+T.newPw+' <small class="muted">'+T.pwHint+'</small><input name="password" type="password" dir="ltr" autocomplete="new-password" minlength="8"></label>'+
      '<button class="btn btn-primary" type="submit" style="justify-content:center">'+T.saveIn+'</button></form>'+
      '<p class="msg" role="alert"></p><button type="button" class="linkbtn back">'+T.backIn+'</button></div>';
    var s1=host.querySelector('.s1'), s2=host.querySelector('.s2'), msg=host.querySelector('.msg'), em='';
    host.querySelector('.back').onclick=function(){ authBox(host,done,compact); };
    s1.onsubmit=function(e){ e.preventDefault(); em=s1.elements.email.value.trim();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)){ msg.textContent=T.e.email; return; }
      var b=s1.querySelector('button'); b.disabled=true; msg.textContent='';
      api('account',{action:'forgot',email:em,lang:lang}).then(function(j){ b.disabled=false;
        if(j.ok){ s1.hidden=true; s2.hidden=false; s2.elements.code.focus(); }
        else msg.textContent= j.error==='mail off'? T.mailOff : (T.e[j.error]||T.e.net); }); };
    s2.onsubmit=function(e){ e.preventDefault(); var c=s2.elements.code.value.trim(), pw=s2.elements.password.value;
      if(pw.length<8){ msg.textContent=T.e.password; return; }
      var b=s2.querySelector('button'); b.disabled=true;
      api('account',{action:'reset',email:em,code:c,password:pw}).then(function(j){ b.disabled=false;
        if(j.ok) me().then(function(){ done(ME); }); else msg.textContent=T.e[j.error]||T.e.net; }); };
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
    var nextWs=/^#w(\/|$)/.test(location.hash)||new URLSearchParams(location.search).get('next')==='workspace';
    box.innerHTML='<div class="acct-load glass"><span></span></div>';
    me().then(function(m){
      if(m===false){ box.innerHTML='<div class="acct-card glass"><p class="muted">'+(AR?'الحساب يعمل على الموقع المنشور فقط.':'Accounts work on the published site only.')+'</p></div>'; return; }
      var inv=INVITE();
      if(inv){ return invitePage(inv,m); }
      if(!m){ box.innerHTML='<div class="acct-card glass"></div>'; authBox(box.firstChild,function(){ try{ sessionStorage.removeItem('eb-who'); }catch(_){} if(window.EBHdr) EBHdr.refresh(); page(); }); return; }
      if(m.user.mustChange){ return newPassword(m,nextWs); }
      if(nextWs&&m.user.role==='client'){ location.replace('workspace.html'+(/^#w/.test(location.hash)?location.hash:'')); return; }   // the workspace has its own page now
      dash();
    });
  }
  // first sign-in with a temporary password from the studio: choose your own before anything else
  function newPassword(m,nextWs){ var P=AR?{h:'اختر كلمة سر خاصة بك',p:'سجّلت الدخول بكلمة سر مؤقتة أرسلها إليك الاستوديو. اختر الآن كلمة سر خاصة بك لتفتح مساحة العمل.',a:'كلمة السر الجديدة (8 أحرف على الأقل)',b:'أعد كتابتها',go:'حفظ وفتح مساحة العمل',short:'يجب ألا تقل كلمة السر عن 8 أحرف.',diff:'كلمتا السر غير متطابقتين.',same:'اختر كلمة سر مختلفة عن المؤقتة.',err:'تعذّر الحفظ، يُرجى المحاولة مرة أخرى.',ok:'حُفظت كلمة السر.'}
      :{h:'Choose your own password',p:'You signed in with a temporary password from the studio. Choose your own password now to open your workspace.',a:'New password (at least 8 characters)',b:'Type it again',go:'Save and open my workspace',short:'The password must be at least 8 characters.',diff:'The passwords do not match.',same:'Choose a password different from the temporary one.',err:'Could not save. Try again.',ok:'Password saved.'};
    box.innerHTML='<div class="acct-card glass newpw-card"><span class="eyebrow">WELCOME</span><h2>'+esc(P.h)+'</h2><p class="muted">'+esc(P.p)+'</p><form class="form" novalidate><label>'+P.a+'<input name="a" type="password" autocomplete="new-password" dir="ltr" minlength="8" required></label><label>'+P.b+'<input name="b" type="password" autocomplete="new-password" dir="ltr" required></label><p class="msg" role="alert"></p><div class="actions"><button class="btn btn-primary" type="submit">'+P.go+'</button></div></form></div>';
    var f=box.querySelector('form'), msg=f.querySelector('.msg'); f.elements.a.focus();
    f.onsubmit=function(e){ e.preventDefault(); var a=f.elements.a.value, b2=f.elements.b.value;
      if(a.length<8){ msg.textContent=P.short; return; } if(a!==b2){ msg.textContent=P.diff; return; }
      var btn=f.querySelector('button'); btn.disabled=true;
      api('account',{action:'setPassword',password:a}).then(function(j){ if(j&&j.ok){ toast(P.ok); try{ sessionStorage.removeItem('eb-who'); }catch(_){}
          if(m.user.role==='client') location.replace('workspace.html'+(/^#w/.test(location.hash)?location.hash:'')); else page(); return; }
        btn.disabled=false; msg.textContent=j&&j.error==='same'?P.same:j&&j.error==='password'?P.short:P.err; }); };
  }
  // invitation links: account.html?invite=TOKEN
  function INVITE(){ var t=new URLSearchParams(location.search).get('invite'); return /^[a-f0-9]{48}$/.test(t||'')? t : ''; }
  function dropInvite(){ try{ history.replaceState(null,'',location.pathname+location.hash); }catch(_){} }
  function invitePage(tok,m){
    api('access?invite='+tok).then(function(j){
      var W=T.W;
      if(!j.ok||!j.valid){ dropInvite(); box.innerHTML='<div class="acct-card glass"><span class="eyebrow">INVITATION</span><h2>'+W.invH+'</h2><p class="muted">'+(j.used?W.invUsed:W.invBad)+'</p></div>'; if(m) setTimeout(dash,2600); return; }
      if(m){ return accept(tok,j); }
      box.innerHTML='<div class="acct-card glass inv-card"><div class="inv-intro"><span class="eyebrow">INVITATION</span><h2>'+W.invH+'</h2><p class="muted">'+W.invP+' <b dir="ltr">'+esc(j.email)+'</b></p></div><div class="slot3"></div></div>';
      authBox(box.querySelector('.slot3'),function(u){ if(u) accept(tok,j); },true);
      var em=box.querySelector('input[name=email]'); if(em) em.value=j.email;
    });
  }
  function accept(tok,info){
    var W=T.W;
    api('access',{action:'accept',token:tok}).then(function(j){
      if(j.ok){ dropInvite(); me().then(function(){ dash(); flash(W.invOk); }); return; }
      if(j.error==='other email'){ box.innerHTML='<div class="acct-card glass"><span class="eyebrow">INVITATION</span><h2>'+W.invH+'</h2><p class="muted">'+W.invOther+'<b dir="ltr">'+esc(j.email||info.email)+'</b></p><button class="btn btn-primary" type="button" id="invSw">'+W.invSwitch+'</button></div>';
        document.getElementById('invSw').onclick=function(){ api('account',{action:'logout'}).then(function(){ ME=null; mark(); page(); }); }; return; }
      dropInvite(); box.innerHTML='<div class="acct-card glass"><span class="eyebrow">INVITATION</span><h2>'+W.invH+'</h2><p class="muted">'+(j.error==='used'?W.invUsed:W.invBad)+'</p></div>'; setTimeout(dash,2600);
    });
  }
  function flash(t){ var h=box.querySelector('.acct-head'); if(!h) return; var d=document.createElement('p'); d.className='ok-flash'; d.textContent='✓ '+t; h.querySelector('div').appendChild(d); }
  // the workspace line under the name: Active Client status, or the way to ask for it
  function roleBlock(){
    var W=T.W, u=ME.user, a=ME.access;
    if(u.role==='client') return '<p class="role-on"><span class="role-chip">'+W.chip+'</span>'+(u.clientSince?'<small class="muted">'+W.since+esc(day(u.clientSince))+'</small>':'')+'</p><p class="muted small">'+W.on+'</p>';
    if(a&&a.status==='pending') return '<p class="role-wait">⏳ '+W.pending+'</p>';
    return '<div class="role-ask">'+(a&&a.status==='rejected'?'<p class="muted small">'+W.rejected+(a.reason?' — '+esc(a.reason):'')+'</p>':'')+
      '<button type="button" class="linkbtn" id="askOpen">'+(a&&a.status==='rejected'?W.again:W.ask)+'</button>'+
      '<form class="form role-form" id="askForm" hidden><b>'+W.askH+'</b><p class="muted small">'+W.askP+'</p><label>'+W.company+'<input name="company" maxlength="120" dir="auto"></label><label>'+W.note+'<textarea name="note" maxlength="1500" dir="auto"></textarea></label>'+
      '<div class="actions"><button class="btn btn-primary" type="submit">'+W.send+'</button><button class="btn btn-glass glass" type="button" id="askX">'+W.cancel+'</button></div><p class="msg" role="alert"></p></form></div>';
  }
  function bindRole(){
    var o=document.getElementById('askOpen'), f=document.getElementById('askForm'); if(!o||!f) return;
    o.onclick=function(){ f.hidden=false; o.hidden=true; f.elements.company.focus(); };
    document.getElementById('askX').onclick=function(){ f.hidden=true; o.hidden=false; };
    f.onsubmit=function(e){ e.preventDefault(); var b=f.querySelector('button[type=submit]'); b.disabled=true;
      api('access',{action:'request',company:f.elements.company.value,note:f.elements.note.value,lang:lang}).then(function(j){ b.disabled=false;
        if(j.ok){ ME.access=j.request; var rb=box.querySelector('.role'); if(rb){ rb.innerHTML=roleBlock(); bindRole(); } return; }
        f.querySelector('.msg').textContent=T.e[j.error]||T.e[j._net?'net':'wrong']; }); };
  }
  function dash(){
    var u=ME.user; LIST=ME.orders||[];
    box.innerHTML='<div class="acct-head glass rv"><div><span class="eyebrow">ACCOUNT</span><h1>'+esc(T.hi+u.name)+'</h1><p class="muted" dir="ltr" style="text-align:start">'+esc(u.email)+'</p><div class="role">'+roleBlock()+'</div></div>'+
      '<div class="actions"><a class="btn btn-primary" href="pricing.html">'+T.newOrder+'</a><button class="btn btn-glass glass" type="button" id="acctOut">'+T.logout+'</button></div></div>'+
      (u.role==='client'?'<a class="ws-entry glass rv" href="workspace.html"><span class="we-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="7" height="7" rx="2"/><rect x="13.5" y="4" width="7" height="7" rx="2"/><rect x="3.5" y="14" width="7" height="6" rx="2"/><rect x="13.5" y="14" width="7" height="6" rx="2"/></svg></span>'+
        '<span class="we-t"><b>'+(AR?'مساحة العمل':'Your workspace')+'</b><small>'+(AR?'مشاريعك ومهامك وتسليماتك وفواتيرك في صفحة مستقلة.':'Your projects, tasks, deliveries and invoices on their own page.')+'</small></span><span class="we-go">'+(AR?'افتح مساحة العمل':'Open workspace')+' <i>←</i></span></a>':'')+
      '<div class="acct-grid"><aside class="olist"><h3>'+T.orders+'</h3><div class="items"></div></aside><section class="odetail"></section></div>';
    bindRole();
    document.getElementById('acctOut').onclick=function(){ api('account',{action:'logout'}).then(function(){ ME=null; mark(); try{ sessionStorage.removeItem('eb-who'); }catch(_){} if(window.EBHdr) EBHdr.refresh(); page(); }); };
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
  function size(n){ return n>1048576? (n/1048576).toFixed(1)+' MB' : Math.max(1,Math.round(n/1024))+' KB'; }
  function fileHTML(f){
    var u=esc(f.url), n=esc(f.name);
    if(/^image\//.test(f.type)) return '<a class="att img" href="'+u+'" target="_blank" rel="noopener"><img src="'+u+'" alt="'+n+'" loading="lazy"></a>';
    if(/^video\//.test(f.type)) return '<div class="att vid"><video src="'+u+'" controls playsinline preload="metadata"></video><small>'+n+'</small></div>';
    if(/^audio\//.test(f.type)) return '<div class="att aud"><audio src="'+u+'" controls preload="none"></audio><small>'+n+'</small></div>';
    return '<a class="att doc" href="'+u+'" target="_blank" rel="noopener"><i>'+esc((f.name.split('.').pop()||'FILE').slice(0,4).toUpperCase())+'</i><span>'+n+'<small>'+size(f.size||0)+'</small></span></a>';
  }
  // [1:23] in a message becomes a button that jumps the latest video to that moment
  function tcText(t){ return linkify(t||'').replace(/\[(\d{1,2}):([0-5]\d)\]/g,function(_,m,s){ return '<button type="button" class="tstamp" data-t="'+(+m*60+ +s)+'">▶ '+m+':'+s+'</button>'; }); }
  function msgHTML(m){ return '<div class="msg '+(m.from==='client'?'me':'them')+(m.kind?' k-'+m.kind:'')+'">'+(m.text?'<div class="b">'+tcText(m.text)+'</div>':'')+
    ((m.files||[]).length?'<div class="atts">'+m.files.map(fileHTML).join('')+'</div>':'')+'<small>'+(m.from==='client'?T.you:T.studio)+' · '+esc(time(m.at))+'</small></div>'; }
  /* ---- the client's own control over a request: edit while it is being reviewed, cancel before payment or work ---- */
  function manageHTML(o){ var M=T.mg; if(o.status==='cancelled'||o.status==='delivered') return '';
    if(!o.canEdit&&!o.canCancel) return '<div class="omg locked"><b>'+M.h+'</b><p class="muted small">'+M.locked+'</p></div>';
    return '<div class="omg"><b>'+M.h+'</b><p class="muted small">'+(o.canEdit?M.p:M.pc)+'</p>'+(o.editedAt?'<p class="muted small">'+M.edited+esc(new Date(o.editedAt).toLocaleString(AR?'ar-u-nu-latn':'en-GB',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}))+'</p>':'')+
      '<div class="actions">'+(o.canEdit?'<button type="button" class="btn btn-glass glass" data-oedit>'+M.edit+'</button>':'')+(o.canCancel?'<button type="button" class="btn btn-glass glass danger" data-ocancel>'+M.cancel+'</button>':'')+'</div>'+
      (o.canEdit?'<form class="form oedit" hidden novalidate><label>'+M.det+'<textarea name="details" rows="5" dir="auto" maxlength="4000">'+esc(o.details||'')+'</textarea></label><label>'+M.link+'<input name="link" type="url" dir="ltr" value="'+esc(o.link||'')+'"></label>'+
        '<label>'+M.dl+'<input name="deadline" type="date" value="'+esc(/^\d{4}-\d{2}-\d{2}$/.test(o.deadline||'')?o.deadline:'')+'"></label><label>'+M.ct+'<input name="contact" dir="auto" maxlength="200" value="'+esc(o.contact||'')+'"></label>'+
        '<p class="msg" role="alert"></p><div class="actions"><button class="btn btn-primary" type="submit">'+M.save+'</button><button class="btn btn-glass glass" type="button" data-oback>'+M.back+'</button></div></form>':'')+
      (o.canCancel?'<form class="form ocancel" hidden novalidate><label>'+M.why+'<textarea name="reason" rows="2" dir="auto" maxlength="600"></textarea></label><p class="msg" role="alert"></p><div class="actions"><button class="btn btn-primary danger" type="submit">'+M.sure+'</button><button class="btn btn-glass glass" type="button" data-oback>'+M.back+'</button></div></form>':'')+'</div>'; }
  function bindManage(host,o){ var M=T.mg, box=host.querySelector('.omg'); if(!box) return;
    var fe=box.querySelector('.oedit'), fc=box.querySelector('.ocancel'), acts=box.querySelector('.actions');
    var show=function(f){ [fe,fc].forEach(function(x){ if(x) x.hidden=x!==f; }); acts.hidden=!!f; if(f){ var i=f.querySelector('textarea'); if(i) i.focus(); } };
    box.addEventListener('click',function(e){ if(e.target.closest('[data-oedit]')) show(fe); else if(e.target.closest('[data-ocancel]')) show(fc); else if(e.target.closest('[data-oback]')) show(null); });
    if(fe) fe.onsubmit=function(e){ e.preventDefault(); var E=fe.elements, msg=fe.querySelector('.msg'), d={details:E.details.value.trim(),link:E.link.value.trim(),deadline:E.deadline.value,contact:E.contact.value.trim()};
      if(!d.details){ msg.textContent=M.need; E.details.focus(); return; } if(d.link&&!/^https?:\/\/\S+$/i.test(d.link)){ msg.textContent=M.badLink; E.link.focus(); return; }
      var b=fe.querySelector('[type=submit]'); b.disabled=true;
      api('thread',{code:o.code,edit:d}).then(function(j){ if(j.ok){ toast(M.saved); detail(j.order,true); } else { b.disabled=false; msg.textContent=M.err; } }); };
    if(fc) fc.onsubmit=function(e){ e.preventDefault(); var b=fc.querySelector('[type=submit]'); b.disabled=true;
      api('thread',{code:o.code,cancel:true,reason:fc.elements.reason.value.trim()}).then(function(j){ if(j.ok){ toast(M.gone); detail(j.order,true); if(typeof refreshList==='function') refreshList(); } else { b.disabled=false; fc.querySelector('.msg').textContent=M.err; } }); };
  }
  function sig(o){ var m=o.messages||[]; return (o.canEdit?'e':'')+(o.canCancel?'c':'')+(o.editedAt||'')+m.length+'|'+((m[m.length-1]||{}).at||'')+'|'+o.status+'|'+(o.review?1:0)+'|'+o.price+'|'+o.paid+'|'+((o.payInfo||{}).at||''); }
  // the client sees where the payment stands, in plain steps
  function paySteps(o){
    if(o.status==='cancelled') return '';
    var dep=o.deposit&&o.deposit.paid, split=o.plan==='split'||!!o.deposit, L=[];
    L.push([!!o.price, AR?'السعر النهائي'+(o.price?': <b dir="ltr">'+esc(o.price)+'</b>':' — نؤكّده معك في المحادثة'):'Final price'+(o.price?': <b dir="ltr">'+esc(o.price)+'</b>':' — we confirm it with you in the chat')]);
    if(split){ L.push([dep, AR?'العربون'+(dep?' <b dir="ltr">'+esc(String(o.deposit.amount))+'</b>':'')+' — قبل بدء العمل':'Deposit'+(dep?' <b dir="ltr">'+esc(String(o.deposit.amount))+'</b>':'')+' — before we start']);
      L.push([!!o.paid, AR?'الباقي — قبل التسليم النهائي':'The rest — before final delivery']); }
    else L.push([!!o.paid, AR?'الدفع — بعد تأكيد التفاصيل':'Payment — once the details are agreed']);
    L.push([!!(o.invoice||(o.deposit&&o.deposit.invoice)), AR?'تصلك الفاتورة على بريدك الإلكتروني بعد كل دفعة':'An invoice reaches your email after each payment']);
    var cur=L.findIndex(function(x){return !x[0]});
    return '<div class="psteps"><h3>'+(AR?'مراحل الدفع':'Payment steps')+'</h3><ol>'+L.map(function(x,i){ return '<li class="'+(x[0]?'ok':i===cur?'now':'')+'"><i>'+(x[0]?'✓':i+1)+'</i><span>'+x[1]+'</span></li>'; }).join('')+'</ol></div>';
  }
  function payCard(o){
    var p=o.payInfo; if(!p||o.status==='cancelled') return '';
    var stg=p.stage||'full', done=stg==='deposit'? !!(o.deposit&&o.deposit.paid) : o.paid;
    if(done) return '<div class="paycard ok">✓ '+(stg==='deposit'?(AR?'وصل العربون، وبدأنا التنفيذ. المتبقي قبل التسليم.':'Deposit received — production has started. The rest is due before delivery.'):T.paidOk)+'</div>';
    var SL=AR?{deposit:'العربون',final:'الدفعة النهائية',full:''}:{deposit:'Deposit',final:'Final payment',full:''};
    var sent=(o.messages||[]).some(function(m){ return m.kind==='receipt'&&m.at>p.at; });
    return '<div class="paycard"><div class="ph"><b>'+T.payH+(SL[stg]?' · '+SL[stg]:'')+'</b><span>'+T.payVia+': '+esc(p.methodName||p.method)+'</span></div>'+
      '<div class="amt"><small>'+T.payAmt+'</small><b dir="ltr">'+esc(p.amount)+'</b></div><pre dir="auto">'+esc(p.details)+'</pre>'+
      '<div class="actions"><button type="button" class="btn btn-glass glass cp">'+T.copyD+'</button>'+
      '<label class="btn btn-primary rc">'+T.receipt+'<input type="file" accept="image/*,application/pdf" hidden></label></div>'+
      (sent?'<p class="muted" style="margin:8px 0 0;font-size:13.5px">'+T.receiptSent+'</p>':'')+'</div>';
  }
  var lastVid=null;
  function detail(o,full){
    var host=box.querySelector('.odetail'), closed=o.status==='delivered'||o.status==='cancelled';
    var msgs=[{from:'studio',text:T.hello,at:o.createdAt}].concat(o.messages||[]);
    if(!full && host.querySelector('.thread')){   // poll: touch nothing unless something changed (keeps videos playing and the draft typed)
      if(host.dataset.sig===sig(o)) return;
      var wasClosed=!host.querySelector('form.send'), prev=(host.dataset.sig||'').split('|');
      if(wasClosed!==closed || prev[2]!==o.status || prev[3]!==(o.review?'1':'0') || prev[4]!==String(o.price) || prev[5]!==String(o.paid) || prev[6]!==((o.payInfo||{}).at||'')) return detail(o,true);
      var th=host.querySelector('.thread'), atEnd=th.scrollHeight-th.scrollTop-th.clientHeight<40;
      th.innerHTML=msgs.map(msgHTML).join(''); if(atEnd) th.scrollTop=th.scrollHeight; host.dataset.sig=sig(o); toggleTc(); return;
    }
    var S=C().settings||{}, ig=(C().site||{}).instagram||'eyeblnk', note=encodeURIComponent((AR?'طلب ':'Request ')+o.code);
    var wa=String(S.whatsapp||'').replace(/[^0-9]/g,''), mail=S.email||'';
    var review= o.status!=='delivered'? '' : o.review? '<div class="rate done"><b>'+T.thanks+'</b><div class="stars">'+'★★★★★'.slice(0,o.review.stars)+'<span>'+'★★★★★'.slice(o.review.stars)+'</span></div></div>'
      : '<form class="rate"><b>'+T.rate+'</b><p class="muted">'+T.rateP+'</p><div class="pick" role="radiogroup">'+[1,2,3,4,5].map(function(n){ return '<button type="button" data-s="'+n+'" aria-label="'+n+'">★</button>'; }).join('')+'</div>'+
        '<textarea name="r" rows="3" dir="auto"></textarea><label class="chk"><input type="checkbox" name="pub" checked> '+T.publish+'</label><button class="btn btn-primary" type="submit" disabled>'+T.sendRate+'</button></form>';
    host.innerHTML='<div class="od glass">'+
      '<div class="od-head"><div><span class="c">'+esc(o.code)+'</span><h2>'+esc(o.packageName||'')+'</h2></div>'+pill(o)+'</div>'+
      track(o)+
      '<div class="od-body"><div class="chat">'+payCard(o)+'<h3>'+T.chat+'</h3><div class="thread" aria-live="polite">'+msgs.map(msgHTML).join('')+'</div>'+
        (closed? '<p class="closed">'+(o.status==='cancelled'?T.cancelled:T.closed)+'</p>'+review
               : '<div class="pending" hidden></div><form class="send"><label class="clip" title="'+T.attach+'" aria-label="'+T.attach+'"><input type="file" multiple hidden accept="image/*,video/*,audio/*,.pdf,.zip,.txt"><svg viewBox="0 0 24 24"><path d="M20.5 11.5 12 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.7a1.7 1.7 0 0 1-2.4-2.4L15 7.6"/></svg></label>'+
                 '<textarea name="t" rows="1" placeholder="'+T.write+'" dir="auto"></textarea><button class="btn btn-primary" type="submit">'+T.send+'</button></form>'+
                 '<button type="button" class="tcbtn" hidden title="'+T.tcHint+'">⏱ '+T.tc+'</button>')+
      '</div><aside class="side"><h3>'+T.sum+'</h3><dl>'+
        (o.price?'<dt>'+T.final+'</dt><dd dir="ltr">'+esc(o.price)+(o.paid?' <span class="pill paid">'+T.paid+'</span>':'')+'</dd>':(o.total?'<dt>'+T.est+'</dt><dd dir="ltr">'+esc(o.total)+'</dd>':''))+
        (o.addons&&o.addons.length?'<dt>'+T.adds+'</dt><dd>'+esc(o.addons.join('، '))+'</dd>':'')+
        (o.deadline?'<dt>'+T.deadline+'</dt><dd>'+esc(o.deadline)+'</dd>':'')+
        '<dt>'+T.details+'</dt><dd class="pre">'+linkify(o.details||'')+(o.link?'<br><a href="'+esc(o.link)+'" target="_blank" rel="noopener" dir="ltr">'+esc(o.link)+'</a>':'')+'</dd></dl>'+
        manageHTML(o)+
        paySteps(o)+
        ((o.deposit&&o.deposit.invoice)||o.invoice?'<div class="invs">'+(o.deposit&&o.deposit.invoice?'<button type="button" class="btn btn-glass glass inv" data-inv="deposit">🧾 '+(AR?'فاتورة العربون':'Deposit invoice')+'</button>':'')+(o.invoice?'<button type="button" class="btn btn-glass glass inv" data-inv="final">🧾 '+T.invoice+'</button>':'')+'</div>':'')+
        '<div class="ext"><h3>'+T.ext+'</h3><p class="muted">'+T.extP+'</p><div class="actions">'+
          '<a class="btn btn-glass glass" href="https://ig.me/m/'+esc(ig)+'" target="_blank" rel="noopener">'+T.ig+'</a>'+
          (wa?'<a class="btn btn-glass glass" href="https://wa.me/'+wa+'?text='+note+'" target="_blank" rel="noopener">'+T.wa+'</a>':'')+
          (mail?'<a class="btn btn-glass glass" href="mailto:'+esc(mail)+'?subject='+note+'">'+T.mail+'</a>':'')+
        '</div></div></aside></div></div>';
    host.dataset.sig=sig(o);
    var th=host.querySelector('.thread'); th.scrollTop=th.scrollHeight;
    bindManage(host,o);
    [].forEach.call(host.querySelectorAll('.inv'),function(ib){ ib.onclick=function(){ invoice(o,ib.dataset.inv); }; });
    var pc=host.querySelector('.paycard');
    if(pc&&!pc.classList.contains('ok')){
      pc.querySelector('.cp').onclick=function(){ var b=this; try{ navigator.clipboard.writeText(o.payInfo.details).then(function(){ b.textContent=T.copied; setTimeout(function(){ b.textContent=T.copyD; },1600); }); }catch(_){} };
      pc.querySelector('.rc input').onchange=function(){ var file=this.files[0]; this.value=''; if(!file) return;
        if(file.size>20*1024*1024){ toast(T.tooBig); return; }
        var lab=pc.querySelector('.rc'); lab.classList.add('busy');
        fetch(API+'files',{method:'POST',credentials:'same-origin',headers:{'content-type':file.type||'application/octet-stream','x-code':o.code,'x-filename':encodeURIComponent(file.name)},body:file})
          .then(function(r){ return r.json(); }).then(function(j){ if(!j.ok) throw 0; return api('thread',{code:o.code,text:T.receiptText,files:[j.file],receipt:true}); })
          .then(function(j){ lab.classList.remove('busy'); if(j&&j.ok) detail(j.order,true); })
          .catch(function(){ lab.classList.remove('busy'); toast(T.e.net); }); };
    }
    var rf=host.querySelector('form.rate');
    if(rf){ var stars=0, pk=rf.querySelector('.pick');
      pk.onclick=function(e){ var b=e.target.closest('button'); if(!b) return; stars=+b.dataset.s; [].forEach.call(pk.children,function(x){ x.classList.toggle('on',+x.dataset.s<=stars); }); rf.querySelector('[type=submit]').disabled=false; };
      rf.onsubmit=function(e){ e.preventDefault(); if(!stars) return; var b=rf.querySelector('[type=submit]'); b.disabled=true;
        api('thread',{code:o.code,review:{stars:stars,text:rf.r.value,publish:rf.pub.checked}}).then(function(j){ if(j.ok) detail(j.order,true); else b.disabled=false; }); }; }
    var f=host.querySelector('form.send'); if(!f) return;
    var ta=f.t, pend=host.querySelector('.pending'), files=[], busy=0, tcb=host.querySelector('.tcbtn');
    ta.addEventListener('input',function(){ ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,160)+'px'; });
    ta.addEventListener('keydown',function(e){ if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&innerWidth>860){ e.preventDefault(); f.requestSubmit(); } });
    function drawPend(){ pend.hidden=!files.length&&!busy; pend.innerHTML=files.map(function(x,i){ return '<span class="chip">'+esc(x.name)+'<button type="button" data-i="'+i+'" aria-label="×">×</button></span>'; }).join('')+(busy?'<span class="chip busy">'+T.uploading+'…</span>':''); }
    pend.onclick=function(e){ var b=e.target.closest('button[data-i]'); if(b){ files.splice(+b.dataset.i,1); drawPend(); } };
    f.querySelector('input[type=file]').onchange=function(){ var list=[].slice.call(this.files); this.value='';
      list.forEach(function(file){
        if(file.size>20*1024*1024){ toast(T.tooBig); return; }
        busy++; drawPend();
        fetch(API+'files',{method:'POST',credentials:'same-origin',headers:{'content-type':file.type||'application/octet-stream','x-code':o.code,'x-filename':encodeURIComponent(file.name)},body:file})
          .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ j._s=r.status; return j; }); })
          .then(function(j){ busy--; if(j.ok) files.push(j.file); else toast(j._s===415?T.badType:j._s===413?T.tooBig:T.e.net); drawPend(); })
          .catch(function(){ busy--; toast(T.e.net); drawPend(); }); }); };
    f.onsubmit=function(e){ e.preventDefault(); var t=ta.value.trim(); if((!t&&!files.length)||busy) return; var b=f.querySelector('button[type=submit]'); b.disabled=true;
      api('thread',{code:o.code,text:t,files:files}).then(function(j){ b.disabled=false; if(j.ok){ ta.value=''; ta.style.height=''; files=[]; drawPend(); detail(j.order,false); var th2=host.querySelector('.thread'); th2.scrollTop=th2.scrollHeight; } else if(j.error==='closed') open(o.code); }); };
    tcb.onclick=function(){ var v=lastVid&&lastVid.isConnected? lastVid : [].slice.call(host.querySelectorAll('.thread video')).pop(); if(!v) return;
      v.pause(); var s=Math.floor(v.currentTime||0), stamp='['+Math.floor(s/60)+':'+String(s%60).padStart(2,'0')+'] ';
      ta.value=stamp+ta.value.replace(/^\[\d{1,2}:\d{2}\]\s*/,''); ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length); ta.dispatchEvent(new Event('input')); };
    toggleTc();
  }
  function toggleTc(){ var tcb=box.querySelector('.tcbtn'); if(tcb) tcb.hidden=!box.querySelector('.thread video'); }
  // remember which review video the client last touched; [m:ss] buttons jump it
  document.addEventListener('play',function(e){ if(e.target.closest&&e.target.closest('.thread')) lastVid=e.target; },true);
  document.addEventListener('click',function(e){ var b=e.target.closest('.thread .tstamp'); if(!b) return;
    var v=lastVid&&lastVid.isConnected? lastVid : [].slice.call(document.querySelectorAll('.thread video')).pop(); if(!v) return;
    v.currentTime=+b.dataset.t; v.scrollIntoView({behavior:'smooth',block:'center'}); var pr=v.play(); if(pr&&pr.catch) pr.catch(function(){}); });
  function toast(t){ var d=document.createElement('div'); d.className='toast'; d.textContent=t; document.body.appendChild(d); setTimeout(function(){ d.remove(); },3200); }
  // the invoice: the same compact design as the e-mail, in a window over the page (Save PDF prints it)
  function invoice(o,kind){
    var m=document.createElement('div'); m.className='acct-modal inv-modal'; m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true'); m.setAttribute('aria-label',T.invoice);
    m.innerHTML='<div class="inv-box"><div class="inv-bar"><b>'+T.invoice+'</b><span class="sp"></span><button type="button" class="btn btn-primary sv">'+(AR?'حفظ PDF':'Save PDF')+'</button><button type="button" class="btn btn-glass glass x" aria-label="'+(AR?'إغلاق':'Close')+'">×</button></div><div class="inv-scroll"><iframe title="'+T.invoice+'" src="'+BASE+'api/thread?code='+encodeURIComponent(o.code)+'&invoice='+kind+'"></iframe></div></div>';
    document.body.appendChild(m); document.body.style.overflow='hidden'; requestAnimationFrame(function(){ m.classList.add('show'); });
    var f=m.querySelector('iframe'); f.onload=function(){ try{ var d=f.contentDocument; f.style.height=(d.body.scrollHeight+2)+'px'; [].forEach.call(d.images,function(im){ im.onload=function(){ f.style.height=(d.body.scrollHeight+2)+'px'; }; }); }catch(_){} };
    var close=function(){ m.classList.remove('show'); document.body.style.overflow=''; setTimeout(function(){ m.remove(); },350); };
    m.querySelector('.x').onclick=close; m.onclick=function(e){ if(e.target===m) close(); };
    m.addEventListener('keydown',function(e){ if(e.key==='Escape') close(); }); setTimeout(function(){ m.querySelector('.x').focus(); },50);
    m.querySelector('.sv').onclick=function(){ try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(_){ window.open(f.src,'_blank'); } };
  }
  function pill(o){ return '<span class="pill '+esc(o.status)+'">'+esc(T.st[o.status]||o.status)+'</span>'; }
  function track(o){
    if(o.status==='cancelled') return '<div class="track off"><p>'+T.cancelled+'</p></div>';
    var at=STEP[o.status]||0, when={};
    (o.history||[]).forEach(function(h){ var i=STEP[h.status]; if(i!=null&&!when[i]) when[i]=h.at; });
    return '<ol class="track" style="--p:'+(at/5)+'">'+T.steps.map(function(s,i){ return '<li class="'+(i<at||o.status==='delivered'?'done':i===at?'now':'')+'"><i></i><b>'+s+'</b><small>'+(when[i]&&i<=at?esc(day(when[i])):'')+'</small></li>'; }).join('')+'</ol>';
  }
  addEventListener('hashchange',function(){ var c=(location.hash||'').slice(1).toUpperCase(); if(box&&ME&&c&&c!==CUR&&LIST.some(function(o){return o.code===c})) open(c,true); });
  if(box) page(); else if(document.querySelector('.acct-link')) me();
})();
