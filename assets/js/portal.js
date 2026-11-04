/* Eyeblink — the client workspace (Active Clients only; the server checks every request).
   Its own page, workspace.html:  #w overview · #w/projects · #w/tasks[/filter] · #w/invoices · #w/notifications · #w/settings
   #w/p/ID[/talk|files|report]  project · #w/t/REF  task · #w/new[/ID]  new tasks (one or several at once) */
(function(){
  var root=document.documentElement, lang=root.lang==='en'?'en':'ar', AR=lang==='ar';
  var BASE=document.body.getAttribute('data-base')||'', API=BASE+'api/';
  var T={
    ar:{ws:'مساحة العمل',wsP:'مشاريعك ومهامك ومواعيدها في مكان واحد.',projects:'المشاريع',recent:'آخر المهام',activity:'آخر النشاطات',upcoming:'المواعيد القادمة',
      k:{active:'مشاريع نشطة',progress:'قيد التنفيذ',review:'بانتظار مراجعتك',fresh:'طلبات جديدة',done:'مكتملة',dates:'مواعيد قادمة'},
      empty:'لم يفتح الاستوديو مشروعاً لك بعد. سيصلك بريد إلكتروني فور فتح المشروع، وستتمكن من إرسال مهامك إليه من هنا.',noTasks:'لا توجد مهام بعد.',noAct:'لا يوجد نشاط بعد.',noDates:'لا توجد مواعيد مؤكدة قادمة.',
      newTask:'مهمة جديدة',open:'فتح',back:'رجوع',all:'الكل',task:'المهمة',project:'المشروع',status:'الحالة',req:'الموعد المطلوب',conf:'الموعد المؤكد',upd:'آخر تحديث',
      confNone:'يحدّده الاستوديو بعد المراجعة',reqNone:'دون موعد محدد',start:'البداية',end:'النهاية',services:'الخدمات المتفق عليها',openTasks:'مهام مفتوحة',doneTasks:'مكتملة',
      f:{h:'مهمة جديدة',title:'عنوان المهمة',type:'نوع المهمة',desc:'وصف المهمة',details:'تفاصيل المطلوب تنفيذه',date:'الموعد الذي ترغب في الاستلام فيه (Requested Delivery Date)',dateHint:'يراجع الاستوديو الطلب ثم يؤكّد الموعد النهائي.',
        prio:'الأولوية',links:'الملفات والمراجع (روابط)',linkLabel:'وصف الرابط',linkUrl:'الرابط (Google Drive، فيديو، مرجع…)',addLink:'+ رابط آخر',notes:'تعليمات إضافية: ملاحظات، تفاصيل إبداعية، توجيهات، أمثلة',
        preview:'معاينة الطلب',edit:'تعديل',send:'أرسل المهمة',sending:'جارٍ الإرسال…',need:'اكتب عنوان المهمة.',bad:'تحقّق من الموعد (اليوم أو ما بعده).',sent:'وصلت المهمة إلى الاستوديو.'},
      p:{normal:'عادية',high:'عالية',urgent:'عاجلة'},
      types:{once:'مشروع لمرة واحدة',monthly:'تعاون شهري',campaign:'حملة إعلانية',content:'إدارة محتوى',editing:'مونتاج فيديوهات',motion:'موشن غرافيك',commercial:'إنتاج تجاري',custom:'مشروع مخصص'},
      pst:{active:'نشط',paused:'متوقف مؤقتاً',completed:'منتهٍ',archived:'مؤرشف'},
      st:{new:'طلب جديد',review:'قيد المراجعة',info:'بانتظار معلوماتك',accepted:'تم القبول',progress:'قيد التنفيذ',feedback:'بانتظار ملاحظاتك',revision:'تعديلات مطلوبة',final:'التسليم النهائي',completed:'مكتملة',rejected:'مرفوضة',cancelled:'ملغاة'},
      infoH:'يحتاج الاستوديو إلى معلومات منك',reply:'ردّك',replyBtn:'أرسل الرد',rejH:'سبب الرفض',noteH:'ملاحظة الاستوديو',
      change:'اطلب تغيير الموعد',changeH:'تغيير موعد التسليم',newDate:'الموعد الجديد الذي تطلبه',why:'السبب',changeSend:'أرسل الطلب',changePend:'طلبتَ تغيير الموعد إلى ',changeWait:' — بانتظار قرار الاستوديو.',
      cancel:'إلغاء المهمة',cancelSure:'هل أنت متأكد؟ اضغط مرة أخرى للإلغاء',desc:'الوصف',details:'التفاصيل',notes:'تعليمات إضافية',links:'الروابط',log:'سجل المهمة',by:{studio:'الاستوديو'},
      a:{task_created:'أرسل مهمة جديدة',status:'غيّر الحالة إلى',date_changed:'غيّر الموعد المؤكد إلى',info_provided:'أرسل المعلومات المطلوبة',date_change_requested:'طلب تغيير الموعد إلى',date_change_decided_ok:'وافق على الموعد الجديد',date_change_decided_no:'أبقى الموعد كما هو',project_created:'فتح المشروع',project_updated:'حدّث المشروع',delivered:'سلّم',approved:'وافق على',changes_requested:'طلب تعديلات على',comment:'علّق',commentP:'كتب في نقاش المشروع',file_added:'أضاف ملفاً',file_removed:'حذف ملفاً',points:'نقاط'},
      err:'حدث خطأ، يُرجى المحاولة مرة أخرى.',saved:'تم.',
      dl:{h:'التسليمات',none:'لا يوجد تسليم بعد. ستظهر النسخة الأولى هنا، وسيصلك بها بريد إلكتروني.',open:'افتح الملف',preview:'شغّل المعاينة',history:'النسخ السابقة',fin:'النهائية',
        st:{sent:'بانتظار ردّك',approved:'تمت الموافقة',changes:'طُلبت تعديلات',superseded:'نسخة أقدم'},approve:'أوافق على هذه النسخة',approveFinal:'أوافق على التسليم النهائي',sure:'هل أنت متأكد؟ اضغط مرة أخرى',
        changes:'أطلب تعديلات',chH:'ما التعديلات المطلوبة؟',chHint:'اكتب كل تعديل في سطر مستقل. وإن كان التعديل على لحظة معيّنة في الفيديو، فأضف التوقيت (مثلاً 00:12).',point:'ما الذي تريد تعديله؟',addPoint:'+ تعديل آخر',
        general:'ملاحظة عامة (اختياري)',send:'أرسل التعديلات',need:'اكتب تعديلاً واحداً على الأقل.',badTc:'اكتب التوقيت بهذا الشكل: 00:12 أو 1:02:30',round:'جولة التعديل',yours:'ملاحظاتك',studio:'من الاستوديو',
        okMsg:'وصلت موافقتك إلى الاستوديو.',chMsg:'وصلت التعديلات إلى الاستوديو.',done:'تم',finalNote:'الموافقة على التسليم النهائي تُغلق المهمة بوصفها مكتملة.',working:'يعمل الاستوديو على النسخة التالية.'},
      cm:{h:'التعليقات',talk:'نقاش المشروع',talkP:'لأي سؤال أو فكرة تخص المشروع ككل. أما التعليقات الخاصة بمهمة معيّنة فمكانها صفحة المهمة.',none:'لا توجد تعليقات بعد.',ph:'اكتب تعليقك…',send:'إرسال',del:'حذف',link:'رابط (اختياري)',you:'أنت'},
      fl:{cats:{all:'الكل',brand:'الهوية البصرية',raw:'مواد خام',reference:'مراجع',document:'مستندات',delivered:'التسليمات',other:'أخرى'},add:'+ أضف ملفاً',title:'اسم الملف',url:'الرابط (Google Drive، Dropbox، WeTransfer…)',
        note:'ملاحظة (اختياري)',cat:'التصنيف',save:'أضف الملف',none:'لا توجد ملفات هنا بعد.',hint:'تُحفظ الملفات على شكل روابط: ارفعها على Google Drive (أو غيره) وألصق رابط المشاركة.',badUrl:'يجب أن يبدأ الرابط بـ https://',del:'حذف',studio:'الاستوديو'},
      tabs:{tasks:'المهام',talk:'النقاشات',files:'الملفات'},waiting:'بانتظار ردّك',waitingP:'تحتاج هذه المهام إلى موافقتك أو ملاحظاتك أو معلومات منك.',
      nt:{h:'الإشعارات',all:'تعليم الكل كمقروء',none:'لا توجد إشعارات بعد.',set:'إعدادات الإشعارات',bell:'الإشعارات'},
      pf:{h:'إعدادات الإشعارات',p:'إشعارات الموقع (الجرس) مفعّلة دائماً. اختر ما تريد أن يصلك أيضاً عبر البريد الإلكتروني وواتساب.',inapp:'في الموقع',email:'البريد',wa:'واتساب',save:'حفظ الإعدادات',saved:'حُفظت الإعدادات.',
        cats:{billing:['الفواتير والمدفوعات','فاتورة جديدة، وتأكيد الدفع، وتذكير الاستحقاق'],tasks:['تحديثات المهام','القبول، والمواعيد، وبدء التنفيذ، والإنجاز'],requests:['طلبات المعلومات','عندما يحتاج الاستوديو إلى شيء منك لإكمال المهمة'],deliveries:['التسليمات','نسخة جديدة أو تسليم نهائي جاهز للمراجعة'],comments:['التعليقات','ردود الاستوديو على المهام والنقاشات'],projects:['المشاريع والملفات','مشروع جديد أو ملف أضافه الاستوديو']},
        waH:'إشعارات واتساب',waOff:'لم يُفعّل الاستوديو واتساب بعد. يمكنك إعداد رقمك وموافقتك الآن، وستبدأ الإشعارات التي اخترتها بالوصول فور تفعيله.',
        phone:'رقم واتساب مع رمز الدولة',consent:'أوافق على تلقّي إشعارات عن مشاريعي ومهامي من Eyeblink Studio عبر واتساب على هذا الرقم، ويمكنني إيقافها في أي وقت.',
        on:'فعّل إشعارات واتساب',stop:'أوقف إشعارات واتساب',active:'مفعّلة على الرقم ',since:' منذ ',stopHint:'يمكنك إيقافها من هنا في أي وقت، أو بالرد على أي رسالة منا بكلمة «إيقاف».',
        needPhone:'اكتب الرقم مع رمز الدولة، مثلاً ‎+9665xxxxxxxx',needConsent:'يجب أن توافق أولاً لكي نراسلك عبر واتساب.',onMsg:'فُعّلت إشعارات واتساب.',offMsg:'أُوقفت إشعارات واتساب.',stopped:'أوقفتَها بتاريخ '},
      bl:{h:'الفواتير',p:'فواتير تعاونك مع الاستوديو وحالة كل منها. يمكنك فتح أي فاتورة وحفظها بصيغة PDF.',none:'لا توجد فواتير بعد.',no:'رقم الفاتورة',issued:'تاريخ الإصدار',due:'الاستحقاق',total:'الإجمالي',bal:'المتبقي',view:'عرض',
        open:'مستحقة',overdue:'متأخرة',paidAll:'المدفوع',strip:'لديك فواتير مستحقة',stripP:'افتح صفحة الفواتير لمراجعتها.',save:'حفظ PDF',close:'إغلاق',
        st:{pending:'بانتظار الدفع',partial:'مدفوعة جزئياً',paid:'مدفوعة',overdue:'متأخرة',cancelled:'ملغاة',refunded:'مستردة'}},
      x:{quota:'الحصة الشهرية',quotaOf:' من ',thisMonth:' هذا الشهر',over:'خارج الحصة',overNote:'وصلت مهام هذا الشهر إلى الحصة المتفق عليها. يمكنك إرسال المهمة، وسيتواصل معك الاستوديو بشأن احتسابها.',
        drive:'مجلد المشروع على Google Drive',rec:'الجدول الدوري',recP:'مهام يضيفها الاستوديو تلقائياً وفق الاتفاق.',every:{week:'أسبوعياً',month:'شهرياً'},next:'المرة القادمة',recBadge:'دورية',
        dows:['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'],dom:'يوم ',report:'التقرير الشهري',repP:'ملخّص ما أُنجز في المشروع خلال الشهر.',
        k:{created:'مهام جديدة',completed:'مكتملة',versions:'نسخ مُسلّمة',rounds:'جولات تعديل',ontime:'في الموعد',open:'مفتوحة الآن'},doneList:'المهام المكتملة',none:'لا شيء خلال هذا الشهر.',inv:'الفواتير الصادرة',paid:'المدفوع خلال الشهر',pdf:'حفظ PDF',
        brief:'الموجز الإبداعي',briefHint:'اختياري، لكنه يختصر وقت المراجعة كثيراً.',
        b:{goal:'الهدف من الفيديو',audience:'الجمهور المستهدف',format:'المقاس',duration:'المدة التقريبية',tone:'الأسلوب والإحساس',message:'الرسالة الأساسية',cta:'الدعوة إلى اتخاذ إجراء',music:'الموسيقى والصوت'},
        fmts:['9:16 عمودي (ريلز وستوري)','16:9 أفقي (يوتيوب)','1:1 مربع','4:5 منشور']}},
    en:{ws:'Workspace',wsP:'Your projects, tasks and their dates in one place.',projects:'Projects',recent:'Recent tasks',activity:'Latest activity',upcoming:'Upcoming dates',
      k:{active:'Active projects',progress:'In progress',review:'Awaiting your review',fresh:'New requests',done:'Completed',dates:'Upcoming dates'},
      empty:'The studio has not opened a project for you yet. You will get an e-mail when it does, and you can send tasks to it from here.',noTasks:'No tasks yet.',noAct:'No activity yet.',noDates:'No confirmed dates coming up.',
      newTask:'New task',open:'Open',back:'Back',all:'All',task:'Task',project:'Project',status:'Status',req:'Requested date',conf:'Confirmed date',upd:'Last update',
      confNone:'Set by the studio after review',reqNone:'No specific date',start:'Start',end:'End',services:'Agreed services',openTasks:'Open tasks',doneTasks:'Completed',
      f:{h:'New task',title:'Task title',type:'Task type',desc:'Task description',details:'What needs to be done',date:'When you would like to receive it (Requested Delivery Date)',dateHint:'The studio reviews the request and confirms the final date.',
        prio:'Priority',links:'Files and references (links)',linkLabel:'Link label',linkUrl:'Link (Google Drive, video, reference…)',addLink:'+ Another link',notes:'Extra instructions: notes, creative direction, guidance, examples',
        preview:'Preview request',edit:'Edit',send:'Send task',sending:'Sending…',need:'Write a task title.',bad:'Check the date (today or later).',sent:'Your task reached the studio.'},
      p:{normal:'Normal',high:'High',urgent:'Urgent'},
      types:{once:'One-off project',monthly:'Monthly collaboration',campaign:'Ad campaign',content:'Content management',editing:'Video editing',motion:'Motion graphics',commercial:'Commercial production',custom:'Custom project'},
      pst:{active:'Active',paused:'Paused',completed:'Finished',archived:'Archived'},
      st:{new:'New request',review:'Under review',info:'Awaiting your information',accepted:'Accepted',progress:'In progress',feedback:'Awaiting your feedback',revision:'Revision requested',final:'Final delivery',completed:'Completed',rejected:'Rejected',cancelled:'Cancelled'},
      infoH:'The studio needs some information',reply:'Your reply',replyBtn:'Send reply',rejH:'Reason',noteH:'Note from the studio',
      change:'Ask to change the date',changeH:'Change the delivery date',newDate:'The date you are asking for',why:'Reason',changeSend:'Send request',changePend:'You asked to move the date to ',changeWait:' — waiting for the studio.',
      cancel:'Cancel task',cancelSure:'Sure? Click again to cancel',desc:'Description',details:'Details',notes:'Extra instructions',links:'Links',log:'Task history',by:{studio:'Studio'},
      a:{task_created:'sent a new task',status:'changed the status to',date_changed:'changed the confirmed date to',info_provided:'sent the requested information',date_change_requested:'asked to move the date to',date_change_decided_ok:'approved the new date',date_change_decided_no:'kept the date',project_created:'opened the project',project_updated:'updated the project',delivered:'delivered',approved:'approved',changes_requested:'asked for changes on',comment:'commented',commentP:'wrote in the project discussion',file_added:'added a file',file_removed:'removed a file',points:'points'},
      err:'Something went wrong. Try again.',saved:'Done.',
      dl:{h:'Deliveries',none:'Nothing delivered yet. The first version will appear here and you will get an e-mail.',open:'Open file',preview:'Play preview',history:'Earlier versions',fin:'Final',
        st:{sent:'Awaiting your reply',approved:'Approved',changes:'Changes requested',superseded:'Older version'},approve:'Approve this version',approveFinal:'Approve the final delivery',sure:'Sure? Click again',
        changes:'Request changes',chH:'What should change?',chHint:'One change per line. If it is about a moment in the video, add the timecode (e.g. 00:12).',point:'What should change?',addPoint:'+ Another change',
        general:'General note (optional)',send:'Send changes',need:'Write at least one change.',badTc:'Write the timecode like 00:12 or 1:02:30',round:'Revision round',yours:'Your notes',studio:'From the studio',
        okMsg:'Your approval reached the studio.',chMsg:'Your changes reached the studio.',done:'Done',finalNote:'Approving the final delivery closes the task as completed.',working:'The studio is working on the next version.'},
      cm:{h:'Comments',talk:'Project discussion',talkP:'For questions and ideas about the project as a whole. Comments about one task go on that task.',none:'No comments yet.',ph:'Write a comment…',send:'Send',del:'Delete',link:'Link (optional)',you:'You'},
      fl:{cats:{all:'All',brand:'Brand identity',raw:'Raw footage',reference:'References',document:'Documents',delivered:'Deliveries',other:'Other'},add:'+ Add a file',title:'File name',url:'Link (Google Drive, Dropbox, WeTransfer…)',
        note:'Note (optional)',cat:'Category',save:'Add file',none:'No files here yet.',hint:'Files are kept as links: upload to Google Drive (or similar) and paste the share link.',badUrl:'The link must start with https://',del:'Delete',studio:'Studio'},
      tabs:{tasks:'Tasks',talk:'Discussion',files:'Files'},waiting:'Waiting for you',waitingP:'These tasks need your approval, notes or information.',
      nt:{h:'Notifications',all:'Mark all as read',none:'No notifications yet.',set:'Notification settings',bell:'Notifications'},
      pf:{h:'Notification settings',p:'Site notifications (the bell) are always on. Choose what should also reach you by e-mail and WhatsApp.',inapp:'On site',email:'E-mail',wa:'WhatsApp',save:'Save settings',saved:'Settings saved.',
        cats:{billing:['Invoices & payments','A new invoice, payment confirmations, due-date reminders'],tasks:['Task updates','Acceptance, dates, work started, completion'],requests:['Information requests','When the studio needs something from you'],deliveries:['Deliveries','A new version or the final delivery is ready'],comments:['Comments','Studio replies on tasks and discussions'],projects:['Projects & files','A new project or a file the studio added']},
        waH:'WhatsApp notifications',waOff:'The studio has not switched WhatsApp on yet. You can set up your number and consent now; notifications you choose start as soon as it is on.',
        phone:'WhatsApp number with country code',consent:'I agree to receive notifications about my projects and tasks from Eyeblink Studio on WhatsApp at this number. I can stop them at any time.',
        on:'Turn on WhatsApp notifications',stop:'Stop WhatsApp notifications',active:'On for ',since:' since ',stopHint:'Stop them here at any time, or reply STOP to any of our messages.',
        needPhone:'Write the number with its country code, e.g. +44 7xxx xxxxxx',needConsent:'Please agree first so we can message you on WhatsApp.',onMsg:'WhatsApp notifications are on.',offMsg:'WhatsApp notifications are off.',stopped:'Stopped on '},
      bl:{h:'Invoices',p:'Invoices for your work with the studio and where each one stands. Open any invoice and save it as PDF.',none:'No invoices yet.',no:'Invoice no.',issued:'Issued',due:'Due',total:'Total',bal:'Balance',view:'View',
        open:'Due',overdue:'Overdue',paidAll:'Paid',strip:'You have invoices due',stripP:'Open the invoices page to review them.',save:'Save PDF',close:'Close',
        st:{pending:'Awaiting payment',partial:'Partially paid',paid:'Paid',overdue:'Overdue',cancelled:'Cancelled',refunded:'Refunded'}},
      x:{quota:'Monthly quota',quotaOf:' of ',thisMonth:' this month',over:'Over quota',overNote:'This month’s tasks have reached the agreed quota. You can still send it; the studio will talk to you about how it is counted.',
        drive:'Project folder on Google Drive',rec:'Recurring schedule',recP:'Tasks the studio adds automatically, as agreed.',every:{week:'Weekly',month:'Monthly'},next:'Next',recBadge:'Recurring',
        dows:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],dom:'Day ',report:'Monthly report',repP:'A summary of what was done in the project during the month.',
        k:{created:'New tasks',completed:'Completed',versions:'Versions delivered',rounds:'Revision rounds',ontime:'On time',open:'Open now'},doneList:'Completed tasks',none:'Nothing this month.',inv:'Invoices issued',paid:'Paid this month',pdf:'Save PDF',
        brief:'Creative brief',briefHint:'Optional, but it saves a lot of review time.',
        b:{goal:'Goal of the video',audience:'Target audience',format:'Format',duration:'Approximate length',tone:'Style and feel',message:'Key message',cta:'Call to action',music:'Music and sound'},
        fmts:['9:16 vertical (Reels, Stories)','16:9 horizontal (YouTube)','1:1 square','4:5 feed post']}}
  }[lang];
  var OPEN=['new','review','info','accepted','progress','feedback','revision','final'];
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]}); }
  function L(v){ return v==null?'':(typeof v==='object'&&!Array.isArray(v))?(v[lang]||v.ar||v.en||''):v; }
  function C(){ return window.EBC||{}; }
  function api(q,body){ var o={credentials:'same-origin',cache:'no-store',headers:{}}; if(body){ o.method='POST'; o.headers['content-type']='application/json'; o.body=JSON.stringify(body); }
    return fetch(API+'work'+(q||''),o).then(function(r){ return r.json().catch(function(){return {ok:false};}).then(function(j){ j._s=r.status; return j; }); }).catch(function(){ return {ok:false,_net:true}; }); }
  function d8(s){ if(!s) return ''; try{ return new Date(s.length===10?s+'T12:00:00Z':s).toLocaleDateString(AR?'ar-u-nu-latn':'en-GB',{day:'numeric',month:'short',year:'numeric'}); }catch(_){ return s; } }
  function ago(s){ try{ return new Date(s).toLocaleString(AR?'ar-u-nu-latn':'en-GB',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}); }catch(_){ return s; } }
  function pill(st){ return '<span class="tpill s-'+esc(st)+'">'+esc(T.st[st]||st)+'</span>'; }
  function prio(p){ var lab=L(((C().workspace||{}).priorities||{})[p])||T.p[p]||p; return p&&p!=='normal'?'<span class="tprio p-'+esc(p)+'">'+esc(lab)+'</span>':''; }
  function linksHTML(ls){ return (ls||[]).map(function(l){ return '<a class="wlink" href="'+esc(l.url)+'" target="_blank" rel="noopener noreferrer"><span>'+esc(l.label||l.url.replace(/^https?:\/\//,'').slice(0,48))+'</span></a>'; }).join(''); }
  function para(t){ return esc(t).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g,'<br>'); }
  function paraTc(t){ return para(t).replace(/(^|[\s(>])((?:\d{1,2}:)?\d{1,2}:\d{2})(?=$|[\s.,،)<])/g,'$1<span class="wtc">$2</span>'); }   // timecodes in comments
  function actText(a){ var d=a.data||{}, who=a.actor==='studio'?T.by.studio:(a.actor_name||a.actor), k=a.kind, w='';
    if(k==='status') w=T.a.status+' «'+(T.st[d.to]||d.to)+'»'+(d.confirmed_date?' · '+T.conf+': '+d8(d.confirmed_date):'');
    else if(k==='date_changed') w=T.a.date_changed+' '+d8(d.to);
    else if(k==='date_change_requested') w=T.a.date_change_requested+' '+d8(d.date);
    else if(k==='date_change_decided') w=d.approved?T.a.date_change_decided_ok+' ('+d8(d.to)+')':T.a.date_change_decided_no;
    else if(k==='task_created') w=T.a.task_created+(d.title?' «'+d.title+'»':'');
    else if(k==='project_created'||k==='project_updated') w=T.a[k]+(d.name?' «'+d.name+'»':'');
    else if(k==='delivered'||k==='approved') w=T.a[k]+' '+(d.final?T.dl.fin:d.label);
    else if(k==='changes_requested') w=T.a[k]+' '+d.label+(d.points?' ('+d.points+' '+T.a.points+')':'');
    else if(k==='comment') w=(d.scope==='project'?T.a.commentP:T.a.comment)+(d.text?': '+d.text:'');
    else if(k==='file_added'||k==='file_removed') w=T.a[k]+(d.title?' «'+d.title+'»':'');
    else w=T.a[k]||k;
    return '<li><i class="'+(a.actor==='studio'?'s':'c')+'"></i><div><b>'+esc(who)+'</b> '+esc(w)+(a.task_ref?' · <a href="#w/t/'+esc(a.task_ref)+'"><bdi dir="ltr">'+esc(a.task_ref)+'</bdi></a>':'')+
      (d.note?'<p class="muted small">'+para(d.note)+'</p>':'')+(k==='info_provided'&&d.text?'<p class="muted small">'+para(d.text)+'</p>':'')+'<small>'+esc(ago(a.at))+'</small></div></li>'; }
  var NT={ar:{accept:function(d,t){return 'قُبلت مهمة '+t+(d.date?' · موعد التسليم المؤكد '+d8(d.date):'');},info:function(d,t){return 'يحتاج الاستوديو إلى معلومات منك لمهمة '+t;},reject:function(d,t){return 'بخصوص مهمة '+t+': تعذّر تنفيذها كما طُلبت';},
      progress:function(d,t){return 'بدأ تنفيذ '+t;},status:function(d,t){return 'أصبحت حالة '+t+' «'+(T.st[d.status]||d.status)+'»';},date:function(d,t){return 'أصبح موعد تسليم '+t+' '+d8(d.date);},dateNo:function(d,t){return 'بقي موعد تسليم '+t+' '+d8(d.date);},
      completed:function(d,t){return 'اكتملت مهمة '+t;},deliver:function(d,t){return d.final?'التسليم النهائي لـ'+t+' جاهز للمراجعة':'النسخة '+d.label+' من '+t+' جاهزة للمراجعة';},comment:function(d,t){return 'تعليق جديد من الاستوديو على '+t;},
      project:function(d){return 'فتح الاستوديو لك مشروع «'+d.name+'»';},file:function(d){return 'أضاف الاستوديو ملف «'+d.file+'» إلى مشروع «'+d.name+'»';},
      invoice:function(d){return 'فاتورة جديدة '+d.no+' بقيمة '+d.amount;},invoicePaid:function(d){return 'وصلت دفعتك للفاتورة '+d.no;},invoiceDue:function(d){return 'الفاتورة '+d.no+' متأخرة — المتبقي '+d.balance;},
      recurring:function(d,t){return 'مهمة دورية جديدة '+t+(d.date?' · التسليم '+d8(d.date):'');},report:function(d){return 'التقرير الشهري لمشروع «'+d.name+'» جاهز';}},
    en:{accept:function(d,t){return 'Task '+t+' accepted'+(d.date?' · confirmed for '+d8(d.date):'');},info:function(d,t){return 'The studio needs information for '+t;},reject:function(d,t){return 'About '+t+': we can\'t take it as requested';},
      progress:function(d,t){return 'Work started on '+t;},status:function(d,t){return t+' is now “'+(T.st[d.status]||d.status)+'”';},date:function(d,t){return 'Delivery date of '+t+' is now '+d8(d.date);},dateNo:function(d,t){return 'Delivery date of '+t+' stays '+d8(d.date);},
      completed:function(d,t){return t+' is complete';},deliver:function(d,t){return d.final?'Final delivery of '+t+' is ready for review':'Version '+d.label+' of '+t+' is ready for review';},comment:function(d,t){return 'New comment from the studio on '+t;},
      project:function(d){return 'The studio opened the project “'+d.name+'”';},file:function(d){return 'The studio added “'+d.file+'” to “'+d.name+'”';},
      invoice:function(d){return 'New invoice '+d.no+' for '+d.amount;},invoicePaid:function(d){return 'Payment received for invoice '+d.no;},invoiceDue:function(d){return 'Invoice '+d.no+' is overdue — '+d.balance+' due';},
      recurring:function(d,t){return 'Recurring task '+t+' added'+(d.date?' · due '+d8(d.date):'');},report:function(d){return 'The monthly report for “'+d.name+'” is ready';}}}[lang];
  function nText(n){ var d=n.data||{}, f=NT[n.kind]; return f?f(d,AR?'«'+(d.title||'')+'»':'“'+(d.title||'')+'”'):n.kind; }
  function toast(t){ var d=document.createElement('div'); d.className='toast'; d.textContent=t; document.body.appendChild(d); setTimeout(function(){ d.remove(); },2600); }

  /* ======== the workspace page (workspace.html): its own bar, colour per section ======== */
  var host=null, shell=null, DASH=null, CUR='overview';
  var U2=AR?{nav:{overview:'نظرة عامة',projects:'المشاريع',tasks:'المهام',invoices:'الفواتير',notifications:'الإشعارات',settings:'الإعدادات'},hi:'أهلاً',hiP:'هذه مساحة عملك مع Eyeblink Studio: مشاريعك ومهامك ومواعيدها وتسليماتها في مكان واحد.',
      g:{login:'سجّل دخولك لفتح مساحة العمل.',client:'مساحة العمل متاحة للعملاء المتعاقدين مع الاستوديو. إن كان لديك تعاون مستمر معنا، فاطلب الوصول من صفحة حسابك.',in:'تسجيل الدخول',acct:'صفحة حسابي'},
      allTasks:'كل المهام',allTasksP:'جميع مهامك في كل المشاريع، مع حالتها ومواعيدها.',search:'ابحث في المهام…',allProj:'كل المشاريع',
      f:{all:'الكل',fresh:'جديدة',progress:'قيد التنفيذ',waiting:'بانتظار ردّك',done:'مكتملة',closed:'ملغاة ومرفوضة',upcoming:'مواعيد قادمة'},none:'لا توجد مهام تطابق هذا الاختيار.',
      projectsP:'كل مشاريعك مع الاستوديو، وحصة كل منها هذا الشهر.',showAll:'عرض المنتهية أيضاً',
      ntP:'كل ما وصلك من الاستوديو، مرتّباً حسب الوقت.',today:'اليوم',yesterday:'أمس',earlier:'أقدم',ntAll:'الكل',
      nt:{tasks:'المهام',requests:'طلبات المعلومات',deliveries:'التسليمات',comments:'التعليقات',projects:'المشاريع',billing:'الفواتير'},
      nw:{h:'مهام جديدة',p:'أضف مهمة واحدة أو عدة مهام دفعة واحدة، وكلها تصل إلى الاستوديو معاً.',card:'المهمة',add:'+ أضف مهمة أخرى',copy:'تبدأ المهمة الجديدة بنوع المهمة السابقة وموعدها وأولويتها.',
        rm:'إزالة',more:'تفاصيل وروابط وموجز إبداعي',review:'معاينة وإرسال',count:function(n){ return n===1?'مهمة واحدة':n===2?'مهمتان':n+' مهام'; },max:'الحد الأقصى 10 مهام في الإرسال الواحد.',
        sendAll:function(n){ return n===1?'أرسل المهمة':'أرسل '+(n===2?'المهمتين':n+' مهام'); },sentAll:function(n){ return n===1?'وصلت المهمة إلى الاستوديو.':'وصلت '+(n===2?'المهمتان':n+' مهام')+' إلى الاستوديو.'; },noProj:'لا يوجد مشروع نشط بعد لإرسال المهام إليه.'}}
    :{nav:{overview:'Overview',projects:'Projects',tasks:'Tasks',invoices:'Invoices',notifications:'Notifications',settings:'Settings'},hi:'Hi',hiP:'Your workspace with Eyeblink Studio: projects, tasks, dates and deliveries in one place.',
      g:{login:'Sign in to open your workspace.',client:'The workspace is for clients with an ongoing agreement with the studio. If that is you, request access from your account page.',in:'Sign in',acct:'My account'},
      allTasks:'All tasks',allTasksP:'Every task across your projects, with status and dates.',search:'Search tasks…',allProj:'All projects',
      f:{all:'All',fresh:'New',progress:'In progress',waiting:'Waiting for you',done:'Completed',closed:'Cancelled & rejected',upcoming:'Upcoming dates'},none:'No tasks match this view.',
      projectsP:'All your projects with the studio, and this month’s quota for each.',showAll:'Show finished too',
      ntP:'Everything the studio sent you, newest first.',today:'Today',yesterday:'Yesterday',earlier:'Earlier',ntAll:'All',
      nt:{tasks:'Tasks',requests:'Information requests',deliveries:'Deliveries',comments:'Comments',projects:'Projects',billing:'Invoices'},
      nw:{h:'New tasks',p:'Add one task or several at once — they all reach the studio together.',card:'Task',add:'+ Add another task',copy:'A new task starts with the previous task’s type, date and priority.',
        rm:'Remove',more:'Details, links and creative brief',review:'Review and send',count:function(n){ return n===1?'1 task':n+' tasks'; },max:'Up to 10 tasks in one go.',
        sendAll:function(n){ return n===1?'Send task':'Send '+n+' tasks'; },sentAll:function(n){ return n===1?'Your task reached the studio.':n+' tasks reached the studio.'; },noProj:'There is no active project to send tasks to yet.'}};
  var SVG=function(d){ return '<svg viewBox="0 0 24 24" aria-hidden="true">'+d+'</svg>'; };
  var ICO={overview:SVG('<path d="M4 13.5 12 5l8 8.5"/><path d="M6.5 11.5V19h11v-7.5"/>'),projects:SVG('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>'),
    tasks:SVG('<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="m3.8 6.5 1.3 1.3 2.2-2.6M3.8 12l1.3 1.3 2.2-2.6M3.8 17.5l1.3 1.3 2.2-2.6"/>'),invoices:SVG('<path d="M6 3.5h9l3 3v14l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2z"/><path d="M9 9h6M9 12.5h6M9 16h3.5"/>'),
    notifications:SVG('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>'),settings:SVG('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
    plus:SVG('<path d="M12 5v14M5 12h14"/>'),fresh:SVG('<path d="M12 4.5v15M4.5 12h15"/>'),progress:SVG('<path d="M12 4a8 8 0 1 0 8 8"/><path d="M12 8v4l2.5 2.5"/>'),waiting:SVG('<path d="M5 12.5 9.5 17 19 7.5"/>'),
    done:SVG('<circle cx="12" cy="12" r="8"/><path d="m8.5 12.3 2.4 2.4 4.6-5"/>'),dates:SVG('<rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/>'),arrow:SVG('<path d="M15 6l-6 6 6 6"/>')};
  var TYPEC={monthly:'#A78BFA',campaign:'#F5C66B',content:'#5EF0B0',editing:'#6E8BFF',motion:'#E07BE0',commercial:'#FFC56B',once:'#3FE0E8',custom:'#7DD3FC'};
  var PAL=['#6E8BFF','#E07BE0','#3FE0E8','#F5C66B','#5EF0B0','#A78BFA','#FF7AB6','#7DD3FC','#FFC56B','#8FA2FF'];
  var NAV=[['overview','#w'],['projects','#w/projects'],['tasks','#w/tasks'],['invoices','#w/invoices'],['notifications','#w/notifications'],['settings','#w/settings']];
  function mount(el){ shell=el;
    el.innerHTML='<nav class="wnav glass" aria-label="'+T.ws+'"><div class="wnav-in">'+NAV.map(function(n){ return '<a class="c-'+n[0]+'" data-s="'+n[0]+'" href="'+n[1]+'">'+ICO[n[0]]+'<span>'+U2.nav[n[0]]+'</span>'+(n[0]==='notifications'?'<b class="wn-n" hidden></b>':'')+'</a>'; }).join('')+'</div>'+
      '<a class="wnav-new" href="#w/new">'+ICO.plus+'<span>'+T.newTask+'</span></a></nav><div class="wview" aria-live="polite"></div>';
    host=el.querySelector('.wview'); route(); }
  function setSec(sec){ if(sec!=='tasks') TC=null; CUR=sec; shell.dataset.sec=sec;
    [].forEach.call(shell.querySelectorAll('.wnav a[data-s]'),function(a){ var on=a.dataset.s===sec; a.classList.toggle('on',on); if(on) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); if(on&&a.scrollIntoView&&innerWidth<860) a.scrollIntoView({inline:'center',block:'nearest'}); });
    shell.querySelector('.wnav-new').classList.toggle('on',sec==='new'); }
  function paintN(n){ var b=shell&&shell.querySelector('.wnav .wn-n'); if(b){ b.hidden=!n; b.textContent=n>9?'9+':n; } }
  function setUnread(n){ n=+n||0; paintN(n); if(window.EBHdr) EBHdr.setUnread(n); }
  addEventListener('eb:unread',function(e){ paintN(+e.detail||0); });
  function route(){ if(!shell) return; var h=(location.hash||'').slice(1), m;
    if(h==='w/settings'){ setSec('settings'); return settings(); }
    if(h==='w/notifications'){ setSec('notifications'); return notifications(); }
    if((m=/^w\/invoices(?:\/(i_[a-f0-9]+))?$/.exec(h))){ setSec('invoices'); return invoices(m[1]); }
    if((m=/^w\/tasks(?:\/(all|fresh|progress|waiting|done|closed|upcoming))?$/.exec(h))){ setSec('tasks'); return allTasks(m[1]||'all'); }
    if(h==='w/projects'){ setSec('projects'); return projectsView(); }
    if((m=/^w\/t\/(T-[A-Z0-9]+)$/.exec(h))){ setSec('tasks'); return task(m[1]); }
    if((m=/^w\/p\/(p_[a-f0-9]+)(?:\/(talk|files|report)(?:\/(\d{4}-\d{2}))?)?$/.exec(h))){ setSec('projects'); return project(m[1],m[2]||'tasks',false,m[3]); }
    if((m=/^w\/new(?:\/(p_[a-f0-9]+))?$/.exec(h))){ setSec('new'); return newTasks(m[1]); }
    setSec('overview'); return dash(); }
  var lastRoute='';
  addEventListener('hashchange',function(){ if(!shell) return; if(!/^#w/.test(location.hash)&&location.hash) return; var k=location.hash.split('/').slice(0,2).join('/');
    route(); if(k!==lastRoute){ var top=shell.getBoundingClientRect().top+scrollY-110; if(scrollY>top) scrollTo(0,Math.max(0,top)); } lastRoute=k; });
  function loading(){ host.innerHTML='<div class="wskel"><i></i><i></i><i></i><i></i></div>'; }
  function fail(j){ host.innerHTML='<div class="wcard glass"><p class="muted">'+(j&&j.error==='db'?(AR?'مساحة العمل قيد التجهيز. يُرجى المحاولة بعد قليل.':'The workspace is being set up. Try again shortly.'):T.err)+'</p></div>'; }
  // a short rise for each block of a view (respects reduced motion in CSS)
  var RK='';
  function rise(){ var k=(location.hash||'#w').replace(/^(#w\/p\/p_[a-f0-9]+).*$/,'$1').replace(/^#w\/tasks.*$/,'#w/tasks'); if(k===RK) return; RK=k;
    [].forEach.call(host.children,function(c,i){ c.style.setProperty('--i',Math.min(i,8)); c.classList.add('wrise'); }); }
  function head(sec,eyebrow,title,p,actions){ return '<header class="whd"><div><span class="eyebrow">'+eyebrow+'</span><h2>'+title+'</h2>'+(p?'<p class="muted">'+p+'</p>':'')+'</div>'+(actions||'')+'</header>'; }
  function wh(text,k,extra){ return '<h3 class="wh" style="--k:'+k+'">'+text+(extra||'')+'</h3>'; }
  // boot on the workspace page: signed in + Active Client → mount; otherwise a clear gate
  (function(){ var el=document.getElementById('ws'); if(!el) return;
    api('?view=dash').then(function(j){
      if(j._s===401||j._s===403){ var lg=j._s===401; el.innerHTML='<div class="wgate glass"><span class="wg-ic">'+ICO.overview+'</span><span class="eyebrow">WORKSPACE</span><h1>'+T.ws+'</h1><p class="muted">'+(lg?U2.g.login:U2.g.client)+'</p>'+
        '<div class="actions"><a class="btn btn-primary" href="account.html'+(lg?'?next=workspace'+esc(location.hash):'')+'">'+(lg?U2.g.in:U2.g.acct)+'</a></div></div>'; return; }
      if(!j.ok){ el.innerHTML='<div class="wcard glass"><p class="muted">'+(j.error==='db'?(AR?'مساحة العمل قيد التجهيز. يُرجى المحاولة بعد قليل.':'The workspace is being set up. Try again shortly.'):T.err)+'</p></div>'; return; }
      j._at=Date.now(); DASH=j; mount(el); setUnread(j.unread);
    }); })();

  /* ---- overview ---- */
  function firstName(u){ return u&&u.name?String(u.name).trim().split(/\s+/)[0]:''; }
  function greet(first){ return U2.hi+(first?(AR?'، ':', ')+first:''); }
  addEventListener('eb:who',function(e){ var g=host&&host.querySelector('.wgreet'); if(g) g.textContent=greet(firstName(e.detail)); });
  function dash(){
    if(DASH&&DASH._at&&Date.now()-DASH._at<5000) return drawDash(DASH);
    loading(); api('?view=dash').then(function(j){ if(!j.ok) return fail(j); j._at=Date.now(); DASH=j; if('unread' in j) setUnread(j.unread); drawDash(j); });
  }
  function drawDash(j){
    var c=j.counts||{}, n=function(a){ return a.reduce(function(s,k){ return s+(c[k]||0); },0); }, act=j.projects.filter(function(p){return p.status==='active'});
    var first=firstName(window.EBHdr&&EBHdr.user());
    var tiles=[['projects',T.k.active,act.length,'#A78BFA','#w/projects'],['fresh',T.k.fresh,n(['new','review']),'#6E8BFF','#w/tasks/fresh'],['progress',T.k.progress,n(['accepted','progress','revision']),'#3FE0E8','#w/tasks/progress'],
      ['waiting',U2.f.waiting,n(['info','feedback','final']),'#E07BE0','#w/tasks/waiting'],['done',T.k.done,c.completed||0,'#5EF0B0','#w/tasks/done'],['dates',T.k.dates,(j.upcoming||[]).length,'#F5C66B','#w/tasks/upcoming']];
    host.innerHTML=head('overview','WORKSPACE','<span class="wgreet">'+esc(greet(first))+'</span>',U2.hiP)+
      '<div class="wkpis">'+tiles.map(function(t){ return '<a class="wkpi glass" href="'+t[4]+'" style="--k:'+t[3]+'"><span class="wk-ic">'+(ICO[t[0]]||'')+'</span><b>'+t[2]+'</b><span>'+esc(t[1])+'</span><i class="wk-go">'+ICO.arrow+'</i></a>'; }).join('')+'</div>'+
      (j.bills&&j.bills.open?'<a class="wcard glass wbillstrip'+(j.bills.overdue?' late':'')+'" href="#w/invoices"><span class="ws-ic">'+ICO.invoices+'</span><b>'+T.bl.strip+' ('+j.bills.open+')</b><small class="muted">'+(j.bills.overdue?j.bills.overdue+' '+T.bl.overdue+' · ':'')+T.bl.stripP+'</small><span class="go">←</span></a>':'')+
      ((j.waiting||[]).length?'<section class="wcard glass wwait"><div class="wwait-h"><span class="ws-ic">'+ICO.waiting+'</span><div><h3>'+T.waiting+' ('+j.waiting.length+')</h3><p class="muted small">'+T.waitingP+'</p></div></div><ul>'+j.waiting.map(function(w){ return '<li><a href="#w/t/'+esc(w.ref)+'">'+pill(w.status)+'<b><bdi>'+esc(w.title)+'</bdi></b><small class="muted"><bdi>'+esc(w.project_name)+'</bdi> · <bdi dir="ltr">'+esc(w.ref)+'</bdi></small><span class="go">←</span></a></li>'; }).join('')+'</ul></section>':'')+
      (j.projects.length?'<section class="wsec">'+wh(T.projects,'#A78BFA','<a class="wh-more" href="#w/projects">'+U2.nav.projects+' '+(AR?'←':'→')+'</a>')+'<div class="wprojects">'+j.projects.filter(function(p){ return p.status==='active'||p.status==='paused'; }).slice(0,6).map(projCard).join('')+'</div></section>':'<div class="wcard glass wempty"><p>'+T.empty+'</p></div>')+
      (j.projects.length?'<div class="wcols"><section class="wsec">'+wh(T.recent,'#6E8BFF','<a class="wh-more" href="#w/tasks">'+U2.allTasks+' '+(AR?'←':'→')+'</a>')+taskTable((j.tasks||[]).slice(0,8),true)+'</section>'+
        '<aside class="wside"><section class="wsec">'+wh(T.upcoming,'#F5C66B')+((j.upcoming||[]).length?'<ul class="wdates">'+j.upcoming.map(function(u){ return '<li><a href="#w/t/'+esc(u.ref)+'"><b>'+esc(d8(u.confirmed_date))+'</b><span>'+esc(u.title)+'</span><small class="muted">'+esc(u.project_name)+'</small></a></li>'; }).join('')+'</ul>':'<p class="muted small">'+T.noDates+'</p>')+'</section>'+
        '<section class="wsec">'+wh(T.activity,'#3FE0E8')+((j.activity||[]).length?'<ul class="wact">'+j.activity.slice(0,10).map(actText).join('')+'</ul>':'<p class="muted small">'+T.noAct+'</p>')+'</section></aside></div>':'');
    rise();
  }
  function projCard(p){ var open=p.status==='active', k=TYPEC[p.type]||'#3FE0E8';
    return '<article class="wproj glass" style="--k:'+k+'"><a class="wproj-main" href="#w/p/'+esc(p.id)+'"><span class="k">'+esc(T.types[p.type]||p.type)+(p.status!=='active'?' · '+esc(T.pst[p.status]||p.status):'')+'</span><h4>'+esc(p.name)+'</h4>'+
      '<p class="muted small">'+(p.open_tasks||0)+' '+T.openTasks+' · '+(p.done_tasks||0)+' '+T.doneTasks+'</p>'+(p.quota?quotaBar(p.month_tasks||0,p.quota):'')+'</a>'+
      (open?'<a class="wnew" href="#w/new/'+esc(p.id)+'">'+ICO.plus+'<span>'+T.newTask+'</span></a>':'')+'</article>'; }
  function quotaBar(used,q){ var pc=Math.min(100,Math.round(used*100/q)); return '<div class="wq'+(used>=q?' full':'')+'"><span>'+T.x.quota+': <b>'+used+T.x.quotaOf+q+'</b>'+T.x.thisMonth+'</span><i><b style="width:'+pc+'%"></b></i></div>'; }
  function taskTable(list,withProject){
    if(!list||!list.length) return '<p class="muted small">'+T.noTasks+'</p>';
    return '<div class="wtable"><table><thead><tr><th>'+T.task+'</th>'+(withProject?'<th>'+T.project+'</th>':'')+'<th>'+T.status+'</th><th>'+T.req+'</th><th>'+T.conf+'</th><th>'+T.upd+'</th></tr></thead><tbody>'+
      list.map(function(t){ return '<tr class="r-'+esc(t.status)+'" data-go="#w/t/'+esc(t.ref)+'"><td><a href="#w/t/'+esc(t.ref)+'"><b>'+esc(t.title)+'</b></a><small class="muted ref">'+esc(t.ref)+'</small>'+prio(t.priority)+(t.recurring?'<span class="tprio p-rec">'+T.x.recBadge+'</span>':'')+(t.over_quota?'<span class="tprio p-over">'+T.x.over+'</span>':'')+'</td>'+(withProject?'<td class="tp" data-l="'+esc(T.project)+'">'+esc(t.project_name||'')+'</td>':'')+
        '<td class="ts">'+pill(t.status)+'</td><td data-l="'+esc(T.req)+'">'+esc(t.requested_date?d8(t.requested_date):'—')+'</td><td data-l="'+esc(T.conf)+'" class="'+(t.confirmed_date?'cf':'muted')+'">'+esc(t.confirmed_date?d8(t.confirmed_date):'—')+'</td><td class="muted small tu">'+esc(ago(t.updated_at))+'</td></tr>'; }).join('')+'</tbody></table></div>'; }
  document.addEventListener('click',function(e){ var tr=e.target.closest('tr[data-go]'); if(tr&&!e.target.closest('a')) location.hash=tr.dataset.go; });

  /* ---- all projects ---- */
  function projectsView(){ loading();
    api('?view=dash').then(function(j){ if(!j.ok) return fail(j); j._at=Date.now(); DASH=j; var all=false;
      var draw=function(){ var L2=j.projects.filter(function(p){ return all||p.status==='active'||p.status==='paused'; });
        host.querySelector('.wprojects').innerHTML=L2.length?L2.map(projCard).join(''):'<div class="wcard glass wempty"><p>'+T.empty+'</p></div>'; };
      host.innerHTML=head('projects','PROJECTS',U2.nav.projects,U2.projectsP,j.projects.some(function(p){ return p.status==='completed'||p.status==='archived'; })?'<label class="wtoggle"><input type="checkbox"> '+U2.showAll+'</label>':'')+'<div class="wprojects wprojects-lg"></div>';
      var tg=host.querySelector('.wtoggle input'); if(tg) tg.onchange=function(){ all=tg.checked; draw(); };
      draw(); rise(); }); }

  /* ---- all tasks, filtered ---- */
  var TF={fresh:['new','review'],progress:['accepted','progress','revision'],waiting:['info','feedback','final'],done:['completed'],closed:['rejected','cancelled']};
  var FC={all:'#AEBBD2',fresh:'#6E8BFF',progress:'#3FE0E8',waiting:'#E07BE0',done:'#5EF0B0',closed:'#ff8c9c',upcoming:'#F5C66B'};
  var TC=null;
  function allTasks(f){ if(TC&&Date.now()-TC.at<20000) return drawTasks(TC.j,f); loading();
    api('?view=tasks').then(function(j){ if(!j.ok) return fail(j); TC={j:j,at:Date.now()}; drawTasks(j,f); }); }
  var TQ={p:'',q:''};
  function drawTasks(j,f){ var td=new Date().toISOString().slice(0,10);
    if(TQ.p&&!j.projects.some(function(p){ return p.id===TQ.p; })) TQ.p='';
    var match=function(t,k){ if(k==='all') return true; if(k==='upcoming') return t.confirmed_date&&t.confirmed_date>=td&&OPEN.indexOf(t.status)>=0; return TF[k].indexOf(t.status)>=0; };
    var scope=function(t){ return !TQ.p||t.project_id===TQ.p; };
    var draw=function(){ var q=TQ.q.toLowerCase(), L2=j.tasks.filter(function(t){ return match(t,f)&&scope(t)&&(!q||(t.title+' '+t.ref+' '+(t.type||'')+' '+(t.project_name||'')).toLowerCase().indexOf(q)>=0); });
      if(f==='upcoming') L2.sort(function(a,b){ return a.confirmed_date<b.confirmed_date?-1:1; });
      host.querySelector('.wtasks').innerHTML=L2.length?taskTable(L2,!TQ.p):'<div class="wcard glass wempty"><p>'+U2.none+'</p></div>';
      [].forEach.call(host.querySelectorAll('.wtf a'),function(a){ var k=a.dataset.f, on=k===f; a.classList.toggle('on',on); a.setAttribute('aria-current',on?'true':'false');
        a.querySelector('small').textContent=j.tasks.filter(function(t){ return match(t,k)&&scope(t); }).length; }); };
    host.innerHTML=head('tasks','TASKS',U2.allTasks,U2.allTasksP,'<div class="whd-a"><a class="btn btn-primary" href="#w/new'+(TQ.p?'/'+esc(TQ.p):'')+'">+ '+T.newTask+'</a></div>')+
      '<div class="wtools glass"><div class="wtf" role="toolbar">'+['all','fresh','progress','waiting','upcoming','done','closed'].map(function(k){
        return '<a class="chipc" data-f="'+k+'" href="#w/tasks'+(k==='all'?'':'/'+k)+'" style="--k:'+FC[k]+'"><i></i>'+U2.f[k]+' <small></small></a>'; }).join('')+'</div>'+
      '<div class="wtq"><label class="wsearch"><input type="search" dir="auto" placeholder="'+U2.search+'" aria-label="'+U2.search+'" value="'+esc(TQ.q)+'"></label>'+(j.projects.length>1?'<select aria-label="'+T.project+'"><option value="">'+U2.allProj+'</option>'+j.projects.map(function(p){ return '<option value="'+esc(p.id)+'"'+(p.id===TQ.p?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select>':'')+'</div></div><div class="wtasks"></div>';
    host.querySelector('.wtq input').oninput=function(){ TQ.q=this.value.trim(); draw(); };
    var ps=host.querySelector('.wtq select'); if(ps) ps.onchange=function(){ TQ.p=ps.value; draw(); };
    draw(); rise(); }

  /* ---- notifications, full page ---- */
  var NCAT={tasks:'#6E8BFF',requests:'#FFC56B',deliveries:'#E07BE0',comments:'#8FA2FF',projects:'#A78BFA',billing:'#F5C66B'};
  function notifications(){ loading();
    api('?view=notifications').then(function(j){ if(!j.ok) return fail(j); setUnread(j.unread); var cat='';
      var day=function(s){ var d=new Date(s), t=new Date(), y=new Date(Date.now()-864e5); return d.toDateString()===t.toDateString()?U2.today:d.toDateString()===y.toDateString()?U2.yesterday:U2.earlier; };
      var draw=function(){ var L2=j.items.filter(function(n){ return !cat||n.cat===cat; }), out='', g='';
        L2.forEach(function(n){ var dd=day(n.created_at); if(dd!==g){ g=dd; out+='<div class="wng">'+esc(dd)+'</div>'; }
          out+='<a class="wni'+(n.read_at?'':' new')+'" href="'+esc(n.link||'#w')+'" data-id="'+n.id+'" style="--k:'+(NCAT[n.cat]||'#6E8BFF')+'"><i aria-hidden="true"></i><span><b>'+esc(nText(n))+'</b>'+(n.data&&n.data.note?'<em>'+esc(n.data.note)+'</em>':'')+'<small><span class="wni-c">'+esc(U2.nt[n.cat]||'')+'</span> · '+esc(ago(n.created_at))+'</small></span></a>'; });
        host.querySelector('.wnl').innerHTML=out||'<div class="wcard glass wempty"><p>'+T.nt.none+'</p></div>';
        [].forEach.call(host.querySelectorAll('.wncf button'),function(b){ b.classList.toggle('on',b.dataset.c===cat); }); };
      var cats=Object.keys(NCAT).filter(function(k){ return j.items.some(function(n){ return n.cat===k; }); });
      host.innerHTML=head('notifications','NOTIFICATIONS',T.nt.h,U2.ntP,'<div class="whd-a">'+(j.unread?'<button type="button" class="btn btn-glass glass" data-nall>'+T.nt.all+'</button>':'')+'<a class="btn btn-glass glass" href="#w/settings">'+T.nt.set+'</a></div>')+
        (cats.length>1?'<div class="wncf">'+['' ].concat(cats).map(function(k){ return '<button type="button" class="chipc" data-c="'+k+'" style="--k:'+(k?NCAT[k]:'#AEBBD2')+'"><i></i>'+(k?U2.nt[k]:U2.ntAll)+'</button>'; }).join('')+'</div>':'')+'<div class="wnl"></div>';
      var cf=host.querySelector('.wncf'); if(cf) cf.onclick=function(e){ var b=e.target.closest('button'); if(!b) return; cat=b.dataset.c; draw(); };
      host.querySelector('.wnl').onclick=function(e){ var a=e.target.closest('a[data-id]'); if(!a||!a.classList.contains('new')) return; a.classList.remove('new'); var it=j.items.filter(function(x){ return x.id===+a.dataset.id; })[0]; if(it) it.read_at=new Date().toISOString(); j.unread=Math.max(0,j.unread-1); setUnread(j.unread); api('',{action:'read',ids:[+a.dataset.id]}); };
      var na=host.querySelector('[data-nall]'); if(na) na.onclick=function(){ na.disabled=true; api('',{action:'read',all:true}).then(function(r){ if(r.ok){ setUnread(0); notifications(); } }); };
      draw(); rise(); }); }

  /* ---- new tasks: one or several, sent together ---- */
  function newTasks(pid){
    var W=C().workspace||{}, types=L(W.taskTypes)||[];
    var go=function(projects){ var act=projects.filter(function(p){return p.status==='active'});
      if(!act.length){ host.innerHTML=head('new','NEW TASKS',U2.nw.h,'')+'<div class="wcard glass wempty"><p>'+U2.nw.noProj+'</p></div>'; return; }
      if(!act.some(function(p){return p.id===pid})) pid=act[0].id;
      var minD=new Date().toISOString().slice(0,10);
      host.innerHTML=head('new','NEW TASKS',U2.nw.h,U2.nw.p)+
        '<form class="wmulti form" id="wNew" novalidate><div class="wm-top wcard glass"><label>'+T.project+'<select name="project">'+act.map(function(p){ return '<option value="'+esc(p.id)+'"'+(p.id===pid?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select></label>'+
          '<p class="wnote warn wqn" hidden>'+T.x.overNote+'</p></div><datalist id="wTypes">'+types.map(function(x){ return '<option value="'+esc(x)+'">'; }).join('')+'</datalist><datalist id="wFmts">'+T.x.fmts.map(function(x){ return '<option value="'+esc(x)+'">'; }).join('')+'</datalist>'+
          '<div class="wm-list"></div><div class="wm-add"><button type="button" class="wm-addb">'+ICO.plus+'<span>'+U2.nw.add+'</span></button><small class="muted">'+U2.nw.copy+'</small></div>'+
          '<div class="wm-bar glass"><span class="wm-count"></span><p class="msg" role="alert"></p><button class="btn btn-primary" type="submit">'+U2.nw.review+'</button></div></form>';
      var f=document.getElementById('wNew'), list=f.querySelector('.wm-list'), N=0;
      var card=function(prev){ var i=N++, k=PAL[i%PAL.length], d=document.createElement('section'); d.className='wm-card glass'; d.style.setProperty('--k',k);
        d.innerHTML='<div class="wm-h"><span class="wm-n">'+(list.children.length+1)+'</span><b>'+U2.nw.card+'</b><button type="button" class="wm-rm" aria-label="'+U2.nw.rm+'">×</button></div>'+
          '<div class="wgrid"><label>'+T.f.title+'<input name="title" maxlength="140" dir="auto" required></label><label>'+T.f.type+'<input name="type" list="wTypes" maxlength="60" dir="auto" value="'+esc(prev?prev.type:'')+'"></label>'+
          '<label>'+T.f.date+'<input name="requested_date" type="date" min="'+minD+'" value="'+esc(prev?prev.date:'')+'"></label>'+
          '<fieldset class="wprio"><legend>'+T.f.prio+'</legend>'+['normal','high','urgent'].map(function(p){ var on=(prev?prev.prio:'normal')===p; return '<label class="chipb'+(on?' on':'')+'"><input type="radio" name="priority_'+i+'" value="'+p+'"'+(on?' checked':'')+'>'+esc(L((W.priorities||{})[p])||T.p[p])+'</label>'; }).join('')+'</fieldset></div>'+
          '<label>'+T.f.desc+'<textarea name="description" maxlength="4000" dir="auto" rows="2"></textarea></label>'+
          '<details class="wm-more"><summary>'+U2.nw.more+'</summary><label>'+T.f.details+'<textarea name="details" maxlength="6000" dir="auto"></textarea></label>'+
            '<div class="wlinks"><span class="olab">'+T.f.links+'</span><div class="rows"></div><button type="button" class="linkbtn addl">'+T.f.addLink+'</button></div>'+
            '<label>'+T.f.notes+'<textarea name="notes" maxlength="3000" dir="auto"></textarea></label>'+
            '<div class="wbrief-in"><b>'+T.x.brief+'</b> <small class="muted">'+T.x.briefHint+'</small><div class="wgrid">'+['goal','audience','format','duration','tone','message','cta','music'].map(function(b){ return '<label>'+T.x.b[b]+'<input name="b_'+b+'" maxlength="'+(b==='format'?120:600)+'" dir="auto"'+(b==='format'?' list="wFmts"':'')+'></label>'; }).join('')+'</div></div></details>';
        d.addEventListener('input',function(){ if(d.classList.contains('err')){ d.classList.remove('err'); f.querySelector('.msg').textContent=''; } });
        list.appendChild(d); var rows=d.querySelector('.rows'), addRow=function(){ if(rows.children.length>=10) return; var r=document.createElement('div'); r.className='lrow2'; r.innerHTML='<input name="ll" placeholder="'+T.f.linkLabel+'" maxlength="80" dir="auto"><input name="lu" type="url" dir="ltr" placeholder="'+T.f.linkUrl+'">'; rows.appendChild(r); };
        addRow(); d.querySelector('.addl').onclick=addRow;
        d.querySelector('.wprio').onchange=function(){ [].forEach.call(this.querySelectorAll('label'),function(l){ l.classList.toggle('on',l.querySelector('input').checked); }); };
        d.querySelector('.wm-rm').onclick=function(){ if(list.children.length<2) return; d.classList.add('out'); setTimeout(function(){ d.remove(); sync(); },180); };
        sync(); return d; };
      var read=function(d){ var q=function(n){ return d.querySelector('[name='+n+']'); };
        return {title:q('title').value.trim(),type:q('type').value.trim(),requested_date:q('requested_date').value,priority:(d.querySelector('.wprio input:checked')||{}).value||'normal',
          description:q('description').value.trim(),details:q('details').value.trim(),notes:q('notes').value.trim(),
          links:[].map.call(d.querySelectorAll('.lrow2'),function(r){ return {label:r.children[0].value.trim(),url:r.children[1].value.trim()}; }).filter(function(l){ return /^https?:\/\//i.test(l.url); }),
          brief:['goal','audience','format','duration','tone','message','cta','music'].reduce(function(o,b){ var v=q('b_'+b).value.trim(); if(v) o[b]=v; return o; },{})}; };
      var sync=function(){ var n=list.children.length; [].forEach.call(list.children,function(c,i){ c.querySelector('.wm-n').textContent=i+1; c.querySelector('.wm-rm').hidden=n<2; });
        f.querySelector('.wm-count').textContent=U2.nw.count(n); f.querySelector('.wm-addb').disabled=n>=10; f.querySelector('.wm-addb').title=n>=10?U2.nw.max:'';
        var pp=act.filter(function(x){return x.id===f.elements.project.value})[0]; f.querySelector('.wqn').hidden=!(pp&&pp.quota&&(pp.month_tasks||0)+n>pp.quota); };
      f.elements.project.onchange=sync;
      f.querySelector('.wm-addb').onclick=function(){ var last=list.lastElementChild, x=last?read(last):null; var d=card(x?{type:x.type,date:x.requested_date,prio:x.priority}:null); d.querySelector('[name=title]').focus(); d.scrollIntoView({block:'center',behavior:'smooth'}); };
      card(null); setTimeout(function(){ var t=list.querySelector('[name=title]'); if(t) t.focus({preventScroll:true}); },60);
      f.onsubmit=function(e){ e.preventDefault(); var msg=f.querySelector('.msg'), items=[], bad=null; msg.textContent='';
        [].forEach.call(list.children,function(d){ d.classList.remove('err'); var x=read(d); if(!bad&&!x.title){ bad=d; msg.textContent=T.f.need; } else if(!bad&&x.requested_date&&x.requested_date<minD){ bad=d; msg.textContent=T.f.bad; } items.push(x); });
        if(bad){ bad.classList.add('err'); bad.scrollIntoView({block:'center',behavior:'smooth'}); var fi=bad.querySelector(msg.textContent===T.f.need?'[name=title]':'[name=requested_date]'); if(fi) fi.focus({preventScroll:true}); return; }
        previewAll(f.elements.project.value,items,f,act); };
    };
    if(DASH&&DASH.projects) go(DASH.projects); else { loading(); api('?view=dash').then(function(j){ if(!j.ok) return fail(j); j._at=Date.now(); DASH=j; go(j.projects); }); }
  }
  function briefHTML(b){ if(!b) return ''; var k=Object.keys(b).filter(function(x){ return b[x]; }); if(!k.length) return '';
    return '<h4>'+T.x.brief+'</h4><dl class="wbriefl">'+k.map(function(x){ return '<div><dt>'+esc(T.x.b[x]||x)+'</dt><dd>'+esc(b[x])+'</dd></div>'; }).join('')+'</dl>'; }
  function previewAll(pid,items,form,act){
    var p=act.filter(function(x){return x.id===pid})[0]||{}, box=document.createElement('div'); box.className='wprev-all';
    box.innerHTML='<div class="wcard glass wpv-h"><span class="eyebrow">PREVIEW</span><h2>'+esc(p.name||'')+'</h2><p class="muted">'+U2.nw.count(items.length)+' · '+T.f.dateHint+'</p></div>'+
      items.map(function(d,i){ return '<article class="wcard glass wpreview" style="--k:'+PAL[i%PAL.length]+'"><div class="wm-h"><span class="wm-n">'+(i+1)+'</span><h3>'+esc(d.title)+'</h3></div><dl class="wmeta">'+
        (d.type?'<div><dt>'+T.f.type+'</dt><dd>'+esc(d.type)+'</dd></div>':'')+'<div><dt>'+T.req+'</dt><dd>'+esc(d.requested_date?d8(d.requested_date):T.reqNone)+'</dd></div><div><dt>'+T.f.prio+'</dt><dd>'+esc(T.p[d.priority])+'</dd></div></dl>'+
        (d.description?'<h4>'+T.desc+'</h4><p>'+para(d.description)+'</p>':'')+(d.details?'<h4>'+T.details+'</h4><p>'+para(d.details)+'</p>':'')+
        (d.links.length?'<h4>'+T.links+'</h4><div class="wlinkset">'+linksHTML(d.links)+'</div>':'')+(d.notes?'<h4>'+T.notes+'</h4><p>'+para(d.notes)+'</p>':'')+briefHTML(d.brief)+'</article>'; }).join('')+
      '<div class="wm-bar glass"><span class="wm-count">'+U2.nw.count(items.length)+'</span><p class="msg" role="alert"></p><button class="btn btn-glass glass" type="button" data-edit>'+T.f.edit+'</button><button class="btn btn-primary" type="button" data-send>'+U2.nw.sendAll(items.length)+'</button></div>';
    form.hidden=true; form.parentNode.insertBefore(box,form.nextSibling); var top=host.getBoundingClientRect().top+scrollY-120; scrollTo({top:top,behavior:'smooth'});
    box.querySelector('[data-edit]').onclick=function(){ box.remove(); form.hidden=false; };
    box.querySelector('[data-send]').onclick=function(){ var b=this; b.disabled=true; b.textContent=T.f.sending;
      api('',{action:'tasks',project:pid,items:items}).then(function(j){ if(j.ok){ DASH=null; PC=null; TC=null; toast(U2.nw.sentAll(j.refs.length)); location.hash=j.refs.length===1?'#w/t/'+j.refs[0]:'#w/p/'+pid; return; }
        b.disabled=false; b.textContent=U2.nw.sendAll(items.length); box.querySelector('.msg').textContent=j.error==='date'?T.f.bad:j.error==='too many attempts'?(AR?'وصلت إلى الحد اليومي للمهام.':'Daily task limit reached.'):T.err; }); };
  }

  /* ---- project: tasks · discussion · files ---- */
  var PC=null;
  function project(id,tab,force,month){
    if(!force&&PC&&PC.id===id&&Date.now()-PC.at<30000) return drawProject(PC.j,tab,month);
    loading();
    api('?project='+encodeURIComponent(id)).then(function(j){ if(!j.ok) return fail(j); PC={id:id,j:j,at:Date.now()}; drawProject(j,tab,month); });
  }
  function drawProject(j,tab,month){ var p=j.project, F='all';
    var nf=(j.files||[]).length+(j.delivered||[]).length, nc=(j.comments||[]).length;
    host.innerHTML='<a class="wback" href="#w/projects">← '+U2.nav.projects+'</a>'+
      '<div class="wcard glass wphead" style="--k:'+(TYPEC[p.type]||'#3FE0E8')+'"><div><span class="k">'+esc(T.types[p.type]||p.type)+' · '+esc(T.pst[p.status]||p.status)+'</span><h2>'+esc(p.name)+'</h2>'+(p.description?'<p class="muted">'+para(p.description)+'</p>':'')+
        '<dl class="wmeta">'+(p.start_date?'<div><dt>'+T.start+'</dt><dd>'+esc(d8(p.start_date))+'</dd></div>':'')+(p.end_date?'<div><dt>'+T.end+'</dt><dd>'+esc(d8(p.end_date))+'</dd></div>':'')+
        ((p.services||[]).length?'<div><dt>'+T.services+'</dt><dd>'+p.services.map(function(s){ var sv=(C().services||[]).filter(function(x){return x.id===s})[0]; return '<span class="tag">'+esc(sv?L(sv.name):s)+'</span>'; }).join(' ')+'</dd></div>':'')+'</dl></div>'+
        '<div class="wphx">'+(p.quota?quotaBar(j.quota_used||0,p.quota):'')+(p.drive_url?'<a class="wdrive" href="'+esc(p.drive_url)+'" target="_blank" rel="noopener noreferrer">📁 '+T.x.drive+'</a>':'')+
        (p.status==='active'?'<a class="btn btn-primary" href="#w/new/'+esc(p.id)+'">+ '+T.newTask+'</a>':'')+'</div></div>'+
      '<div class="acct-tabs wptabs" role="tablist">'+[['tasks',T.tabs.tasks,j.tasks.length,'#6E8BFF'],['talk',T.tabs.talk,nc,'#8FA2FF'],['files',T.tabs.files,nf,'#5EF0B0'],['report',T.x.report,0,'#7DD3FC']].map(function(x){
        return '<a role="tab" style="--k:'+x[3]+'" href="#w/p/'+esc(p.id)+(x[0]==='tasks'?'':'/'+x[0])+'" aria-selected="'+(tab===x[0])+'">'+x[1]+(x[2]?' <small>'+x[2]+'</small>':'')+'</a>'; }).join('')+'</div><div class="wpbody"></div>';
    var body=host.querySelector('.wpbody'); rise();
    if(tab==='talk'){ body.innerHTML='<p class="muted small wtalkp">'+T.cm.talkP+'</p>'+thread(j.comments,j.me); bindThread(body,{scope:'project',project:p.id},function(){ project(p.id,'talk',true); }); return; }
    if(tab==='files'){ filesView(body,j); return; }
    if(tab==='report'){ reportView(body,p,month); return; }
    var draw=function(){ var list=j.tasks.filter(function(t){ return F==='all'||(F==='open'?OPEN.indexOf(t.status)>=0:t.status===F); });
      body.querySelector('.wtasks').innerHTML=taskTable(list,false); };
    body.innerHTML='<div class="wcols"><section class="wsec"><div class="wfilt">'+[['all',T.all],['open',AR?'المفتوحة':'Open'],['completed',T.st.completed]].map(function(x,i){ return '<button type="button" class="chipb'+(i===0?' on':'')+'" data-f="'+x[0]+'">'+x[1]+'</button>'; }).join('')+'</div><div class="wtasks"></div></section>'+
      '<aside class="wside">'+((j.recurring||[]).length?'<section class="wsec">'+wh(T.x.rec,'#FFC56B')+'<p class="muted small" style="margin:0">'+T.x.recP+'</p><div class="wrecs">'+j.recurring.map(function(r){ return '<div class="wrec glass"><b>'+esc(r.title)+'</b><small class="muted">'+esc(T.x.every[r.every])+' · '+esc(r.every==='week'?T.x.dows[r.dow||0]:T.x.dom+(r.dom||1))+' · '+T.x.next+': '+esc(d8(r.next_run))+'</small></div>'; }).join('')+'</div></section>':'')+
        '<section class="wsec">'+wh(T.activity,'#3FE0E8')+(j.activity.length?'<ul class="wact">'+j.activity.map(function(a){ var t=j.tasks.filter(function(x){return x.id===a.task_id})[0]; a.task_ref=t&&t.ref; return actText(a); }).join('')+'</ul>':'<p class="muted small">'+T.noAct+'</p>')+'</section></aside></div>';
    body.querySelector('.wfilt').onclick=function(e){ var b=e.target.closest('button'); if(!b) return; F=b.dataset.f; [].forEach.call(this.children,function(x){ x.classList.toggle('on',x===b); }); draw(); };
    draw();
  }

  /* ---- comments (task comments + project discussion share one thread) ---- */
  function thread(list,me){
    return '<section class="wsec wthread"><div class="wcmts">'+((list||[]).length?list.map(function(c){ return cmt(c,me); }).join(''):'<p class="muted small">'+T.cm.none+'</p>')+'</div>'+
      '<form class="wcompose form" novalidate><textarea name="body" dir="auto" maxlength="4000" placeholder="'+T.cm.ph+'" rows="3"></textarea>'+
      '<div class="wcrow"><input name="lu" type="url" dir="ltr" placeholder="'+T.cm.link+'"><button class="btn btn-primary" type="submit">'+T.cm.send+'</button></div></form></section>'; }
  function cmt(c,me){ var st=c.author==='studio', mine=me&&c.author===me;
    return '<div class="wcmt'+(st?' st':mine?' me':'')+'"><div class="wcmt-h"><b>'+esc(st?'Eyeblink Studio':mine?T.cm.you:c.author_name)+'</b><small>'+esc(ago(c.created_at))+'</small>'+
      (mine?'<button type="button" class="linkbtn" data-delc="'+esc(c.id)+'">'+T.cm.del+'</button>':'')+'</div><p>'+paraTc(c.body)+'</p>'+((c.links||[]).length?'<div class="wlinkset">'+linksHTML(c.links)+'</div>':'')+'</div>'; }
  function bindThread(box,where,reload){
    var f=box.querySelector('.wcompose'); if(!f) return;
    f.onsubmit=function(e){ e.preventDefault(); var b=f.querySelector('button'), body=f.elements.body.value.trim(), u=f.elements.lu.value.trim();
      if(!body&&!/^https?:\/\//i.test(u)){ f.elements.body.focus(); return; } b.disabled=true;
      var data={action:'comment',scope:where.scope,body:body,links:/^https?:\/\//i.test(u)?[{url:u}]:[]}; data[where.scope]=where[where.scope];
      api('',data).then(function(r){ if(r.ok) reload(); else { b.disabled=false; toast(T.err); } }); };
    box.querySelectorAll('[data-delc]').forEach(function(x){ x.onclick=function(){ if(x.dataset.armed!=='1'){ x.dataset.armed='1'; x.textContent=T.dl.sure; return; }
      api('',{action:'deleteComment',id:x.dataset.delc}).then(function(r){ if(r.ok) reload(); else toast(T.err); }); }; });
  }

  /* ---- file center: links by category + everything the studio delivered ---- */
  var FCATS=['all','brand','raw','reference','document','delivered','other'];
  function hostOf(u){ var m=/^https?:\/\/([^\/?#]+)/i.exec(u||''), h=m?m[1].replace(/^www\./,''):'';
    return /drive\.google|docs\.google/.test(h)?'Google Drive':/dropbox/.test(h)?'Dropbox':/wetransfer|we\.tl/.test(h)?'WeTransfer':/youtu/.test(h)?'YouTube':/vimeo/.test(h)?'Vimeo':/figma/.test(h)?'Figma':/canva/.test(h)?'Canva':/frame\.io/.test(h)?'Frame.io':h; }
  function filesView(body,j){ var cat='all', p=j.project;
    var items=(j.files||[]).map(function(f){ return {id:f.id,cat:f.category,title:f.title,url:f.url,note:f.note,at:f.created_at,who:f.added_by==='studio'?T.fl.studio:f.added_by===j.me?T.cm.you:f.added_name,mine:f.added_by===j.me}; })
      .concat((j.delivered||[]).map(function(d){ return {id:d.id,cat:'delivered',title:(d.title||d.task_title)+' — '+(d.is_final?T.dl.fin:d.label),url:d.url,at:d.created_at,ref:d.ref,who:T.fl.studio}; }));
    var cnt=function(c){ return c==='all'?items.length:items.filter(function(x){return x.cat===c}).length; };
    body.innerHTML='<div class="wfhead"><div class="wfilt">'+FCATS.map(function(c){ var n=cnt(c); return (c==='all'||n)?'<button type="button" class="chipb'+(c===cat?' on':'')+'" data-c="'+c+'">'+T.fl.cats[c]+(n?' <small>'+n+'</small>':'')+'</button>':''; }).join('')+'</div>'+
      '<button type="button" class="btn btn-glass glass" data-addf>'+T.fl.add+'</button></div>'+
      '<form class="wcard glass wfadd form" hidden novalidate><p class="muted small">'+T.fl.hint+'</p><div class="wgrid"><label>'+T.fl.title+'<input name="title" maxlength="140" dir="auto"></label>'+
        '<label>'+T.fl.cat+'<select name="category">'+FCATS.filter(function(c){return c!=='all'&&c!=='delivered'}).map(function(c){ return '<option value="'+c+'">'+T.fl.cats[c]+'</option>'; }).join('')+'</select></label></div>'+
        '<label>'+T.fl.url+'<input name="url" type="url" dir="ltr" required></label><label>'+T.fl.note+'<input name="note" maxlength="1000" dir="auto"></label>'+
        '<p class="msg" role="alert"></p><div class="actions"><button class="btn btn-primary" type="submit">'+T.fl.save+'</button></div></form><div class="wfiles"></div>';
    var grid=body.querySelector('.wfiles'), form=body.querySelector('.wfadd');
    var draw=function(){ var list=items.filter(function(x){ return cat==='all'||x.cat===cat; });
      grid.innerHTML=list.length?list.map(function(f){ return '<div class="wfile glass"><a class="wf-main" href="'+esc(f.url)+'" target="_blank" rel="noopener noreferrer"><span class="wf-host">'+esc(hostOf(f.url))+'</span><b><bdi>'+esc(f.title)+'</bdi></b></a>'+
        '<small class="muted">'+esc(T.fl.cats[f.cat]||f.cat)+' · '+esc(f.who||'')+' · '+esc(d8(f.at))+(f.ref?' · <a href="#w/t/'+esc(f.ref)+'"><bdi dir="ltr">'+esc(f.ref)+'</bdi></a>':'')+'</small>'+(f.note?'<p class="muted small">'+para(f.note)+'</p>':'')+
        (f.mine?'<button type="button" class="linkbtn wf-del" data-delf="'+esc(f.id)+'">'+T.fl.del+'</button>':'')+'</div>'; }).join(''):'<p class="muted small">'+T.fl.none+'</p>';
      grid.querySelectorAll('[data-delf]').forEach(function(x){ x.onclick=function(){ if(x.dataset.armed!=='1'){ x.dataset.armed='1'; x.textContent=T.dl.sure; return; }
        api('',{action:'deleteFile',id:x.dataset.delf}).then(function(r){ if(r.ok) project(p.id,'files',true); else toast(T.err); }); }; }); };
    body.querySelector('.wfilt').onclick=function(e){ var b=e.target.closest('button'); if(!b) return; cat=b.dataset.c; [].forEach.call(this.children,function(x){ x.classList.toggle('on',x===b); }); draw(); };
    body.querySelector('[data-addf]').onclick=function(){ form.hidden=!form.hidden; if(!form.hidden) form.elements.url.focus(); };
    form.onsubmit=function(e){ e.preventDefault(); var E=form.elements, msg=form.querySelector('.msg'), u=E.url.value.trim();
      if(!/^https?:\/\/\S+$/i.test(u)){ msg.textContent=T.fl.badUrl; E.url.focus(); return; }
      var b=form.querySelector('button[type=submit]'); b.disabled=true;
      api('',{action:'file',project:p.id,category:E.category.value,title:E.title.value.trim(),url:u,note:E.note.value.trim()}).then(function(r){ if(r.ok){ toast(T.saved); project(p.id,'files',true); } else { b.disabled=false; msg.textContent=r.error==='url'?T.fl.badUrl:T.err; } }); };
    draw();
  }

  /* ---- task ---- */
  var PATH=['new','review','accepted','progress','feedback','final','completed'];
  function task(ref){
    loading(); TC=null;
    api('?task='+encodeURIComponent(ref)).then(function(j){ if(!j.ok) return fail(j); var t=j.task, cr=t.change_request;
      var at=PATH.indexOf(t.status==='info'?'review':t.status==='revision'?'feedback':t.status), off=t.status==='rejected'||t.status==='cancelled';
      var canChange=['accepted','progress','feedback','revision'].indexOf(t.status)>=0&&t.confirmed_date&&!(cr&&cr.status==='pending');
      host.innerHTML='<a class="wback" href="#w/p/'+esc(t.project_id)+'">← '+esc(t.project_name||T.back)+'</a>'+
        '<div class="wcard glass wtask r-'+esc(t.status)+'"><div class="wthead"><div><span class="k">'+esc(t.ref)+(t.type?' · '+esc(t.type):'')+'</span><h2>'+esc(t.title)+'</h2></div><div>'+pill(t.status)+prio(t.priority)+(t.recurring?'<span class="tprio p-rec">'+T.x.recBadge+'</span>':'')+(t.over_quota?'<span class="tprio p-over">'+T.x.over+'</span>':'')+'</div></div>'+
        (off?'':'<ol class="track wtrack" style="--p:'+(Math.max(0,at)/(PATH.length-1))+'">'+PATH.map(function(s,i){ return '<li class="'+(i<at||t.status==='completed'?'done':i===at?'now':'')+'"><i></i><b>'+esc(T.st[s])+'</b></li>'; }).join('')+'</ol>')+
        '<div class="wdates2"><div><span>'+T.req+'</span><b>'+esc(t.requested_date?d8(t.requested_date):T.reqNone)+'</b><small class="muted">'+(AR?'من طرفك':'from you')+'</small></div>'+
          '<div class="'+(t.confirmed_date?'ok':'')+'"><span>'+T.conf+'</span><b>'+esc(t.confirmed_date?d8(t.confirmed_date):'—')+'</b><small class="muted">'+(t.confirmed_date?(AR?'معتمد من Eyeblink':'confirmed by Eyeblink'):T.confNone)+'</small></div></div>'+
        (cr&&cr.status==='pending'?'<p class="wnote">⏳ '+T.changePend+esc(d8(cr.date))+T.changeWait+'</p>':'')+
        (t.status==='info'?'<div class="wnote warn"><b>'+T.infoH+'</b><p>'+para(t.studio_note||'')+'</p><form class="form wreply"><label>'+T.reply+'<textarea name="text" dir="auto" maxlength="4000"></textarea></label>'+
          '<div class="lrow2"><input name="ll" placeholder="'+T.f.linkLabel+'" dir="auto"><input name="lu" type="url" dir="ltr" placeholder="'+T.f.linkUrl+'"></div><button class="btn btn-primary" type="submit">'+T.replyBtn+'</button></form></div>':'')+
        (t.status==='rejected'&&t.studio_note?'<div class="wnote bad"><b>'+T.rejH+'</b><p>'+para(t.studio_note)+'</p></div>':'')+
        (t.status!=='info'&&t.status!=='rejected'&&t.studio_note?'<div class="wnote"><b>'+T.noteH+'</b><p>'+para(t.studio_note)+'</p></div>':'')+
        '<div class="wbody">'+(t.description?'<h4>'+T.desc+'</h4><p>'+para(t.description)+'</p>':'')+(t.details?'<h4>'+T.details+'</h4><p>'+para(t.details)+'</p>':'')+
          ((t.links||[]).length?'<h4>'+T.links+'</h4><div class="wlinkset">'+linksHTML(t.links)+'</div>':'')+(t.notes?'<h4>'+T.notes+'</h4><p>'+para(t.notes)+'</p>':'')+briefHTML(t.brief)+'</div>'+
        '<div class="actions wtact">'+(canChange?'<button type="button" class="btn btn-glass glass" data-chg>'+T.change+'</button>':'')+(['new','review','info'].indexOf(t.status)>=0?'<button type="button" class="btn btn-glass glass danger" data-cancel>'+T.cancel+'</button>':'')+'</div>'+
        '<form class="form wchange" hidden><b>'+T.changeH+'</b><label>'+T.newDate+'<input name="date" type="date" min="'+new Date().toISOString().slice(0,10)+'" required></label><label>'+T.why+'<textarea name="reason" dir="auto" maxlength="1500"></textarea></label><button class="btn btn-primary" type="submit">'+T.changeSend+'</button></form>'+
        '</div>'+deliveries(j)+'<section class="wsec">'+wh(T.cm.h+((j.comments||[]).length?' ('+j.comments.length+')':''),'#8FA2FF')+thread(j.comments,j.me)+'</section>'+
        '<section class="wsec">'+wh(T.log,'#AEBBD2')+'<ul class="wact">'+j.activity.map(actText).join('')+'</ul></section>';
      bindDeliveries(host,j,function(){ task(ref); }); rise();
      bindThread(host.querySelector('.wthread').parentNode,{scope:'task',task:t.ref},function(){ task(ref); });
      var w=host.querySelector('.wreply'); if(w) w.onsubmit=function(e){ e.preventDefault(); var b=w.querySelector('button'); b.disabled=true; var u=w.elements.lu.value.trim();
        api('',{action:'reply',task:t.ref,text:w.elements.text.value.trim(),links:/^https?:\/\//i.test(u)?[{label:w.elements.ll.value.trim(),url:u}]:[]}).then(function(r){ if(r.ok){ toast(T.saved); task(ref); } else { b.disabled=false; toast(T.err); } }); };
      var cb=host.querySelector('[data-cancel]'); if(cb) cb.onclick=function(){ if(cb.dataset.armed!=='1'){ cb.dataset.armed='1'; cb.textContent=T.cancelSure; return; } cb.disabled=true;
        api('',{action:'cancel',task:t.ref}).then(function(r){ if(r.ok) task(ref); else { cb.disabled=false; toast(T.err); } }); };
      var ch=host.querySelector('[data-chg]'), cf=host.querySelector('.wchange'); if(ch) ch.onclick=function(){ cf.hidden=!cf.hidden; if(!cf.hidden) cf.elements.date.focus(); };
      cf.onsubmit=function(e){ e.preventDefault(); var b=cf.querySelector('button'); b.disabled=true;
        api('',{action:'dateChange',task:t.ref,date:cf.elements.date.value,reason:cf.elements.reason.value.trim()}).then(function(r){ if(r.ok){ toast(T.saved); task(ref); } else { b.disabled=false; toast(r.error==='date'?T.f.bad:T.err); } }); };
    });
  }
  /* ---- invoices: the client's own, with a printable copy ---- */
  function money(n,c){ var a=Math.abs(+n||0), v=(Math.round(a*100)/100).toFixed(a%1?2:0); return ((+n||0)<0?'−':'')+(c==='$'||c==='€'||c==='£'?c+v:v+' '+c); }
  function invoices(openId){
    loading();
    api('?view=invoices').then(function(j){ if(!j.ok) return fail(j); var L2=j.invoices||[], by={};
      L2.forEach(function(x){ if(x.state==='cancelled'||x.state==='refunded') return; var c=x.currency; by[c]=by[c]||{due:0,paid:0}; by[c].due+=x.balance; by[c].paid+=x.paid; });
      var cur=Object.keys(by);
      host.innerHTML=head('invoices','INVOICES',T.bl.h,T.bl.p)+
        (cur.length?'<div class="wkpis wkpis3">'+cur.map(function(c){ return '<div class="wkpi glass" style="--k:#F5C66B"><b dir="ltr">'+esc(money(by[c].due,c))+'</b><span>'+T.bl.open+'</span></div><div class="wkpi glass" style="--k:#5EF0B0"><b dir="ltr">'+esc(money(by[c].paid,c))+'</b><span>'+T.bl.paidAll+'</span></div>'; }).join('')+
          '<div class="wkpi glass" style="--k:#ff8c9c"><b>'+L2.filter(function(x){return x.state==='overdue'}).length+'</b><span>'+T.bl.overdue+'</span></div></div>':'')+
        (L2.length?'<div class="wtable"><table><thead><tr><th>'+T.bl.no+'</th><th>'+T.status+'</th><th>'+T.bl.issued+'</th><th>'+T.bl.due+'</th><th>'+T.bl.total+'</th><th>'+T.bl.bal+'</th><th></th></tr></thead><tbody>'+L2.map(function(x){
          return '<tr><td><b><bdi dir="ltr">'+esc(x.no)+'</bdi></b>'+((x.title||x.period)?'<small class="muted ref">'+esc([x.title,x.period].filter(Boolean).join(' · '))+'</small>':'')+(x.project_name?'<small class="muted">'+esc(x.project_name)+'</small>':'')+'</td>'+
            '<td class="ts"><span class="bpill s-'+esc(x.state)+'">'+esc(T.bl.st[x.state]||x.state)+'</span></td><td data-l="'+esc(T.bl.issued)+'">'+esc(d8(x.issue_date))+'</td><td data-l="'+esc(T.bl.due)+'" class="'+(x.state==='overdue'?'late':'')+'">'+esc(x.due_date?d8(x.due_date):'—')+'</td>'+
            '<td data-l="'+esc(T.bl.total)+'"><bdi dir="ltr">'+esc(money(x.total,x.currency))+'</bdi></td><td data-l="'+esc(T.bl.bal)+'"><bdi dir="ltr">'+esc(money(x.balance,x.currency))+'</bdi></td><td class="tu"><button type="button" class="btn btn-glass glass wbv" data-inv="'+esc(x.id)+'">'+T.bl.view+'</button></td></tr>'; }).join('')+'</tbody></table></div>'
          :'<div class="wcard glass wempty"><p>'+T.bl.none+'</p></div>');
      host.querySelectorAll('[data-inv]').forEach(function(b){ b.onclick=function(){ invDoc(b.dataset.inv); }; });
      rise(); if(openId&&L2.some(function(x){return x.id===openId})) invDoc(openId);
    });
  }
  function reportView(body,p,month){ var ms=[], d=new Date(); d.setUTCDate(1); for(var i=0;i<6;i++){ ms.push(d.toISOString().slice(0,7)); d.setUTCMonth(d.getUTCMonth()-1); } month=month||ms[0];
    var mn=function(m){ try{ return new Date(m+'-15T12:00:00Z').toLocaleDateString(AR?'ar-u-nu-latn':'en-GB',{month:'long',year:'numeric'}); }catch(_){ return m; } };
    body.innerHTML='<p class="muted small wtalkp">'+T.x.repP+'</p><div class="wfhead"><div class="wfilt">'+ms.map(function(m){ return '<a class="chipb'+(m===month?' on':'')+'" href="#w/p/'+esc(p.id)+'/report/'+m+'">'+esc(mn(m))+'</a>'; }).join('')+'</div><button type="button" class="btn btn-glass glass" data-rpdf>'+T.x.pdf+'</button></div><div class="wrep"><div class="acct-load"><span></span></div></div>';
    body.querySelector('[data-rpdf]').onclick=function(){ docModal(API+'work?reportDoc='+encodeURIComponent(p.id)+'&month='+month,T.x.report); };
    api('?report='+encodeURIComponent(p.id)+'&month='+month).then(function(j){ var box=body.querySelector('.wrep'); if(!j.ok){ box.innerHTML='<p class="muted">'+T.err+'</p>'; return; } var R=j.report;
      var cards=[[T.x.k.created,p.quota?R.created+T.x.quotaOf+p.quota:R.created,'#6E8BFF'],[T.x.k.completed,R.completed.length,'#5EF0B0'],[T.x.k.versions,R.versions,'#E07BE0'],[T.x.k.rounds,R.rounds,'#FFC56B'],[T.x.k.ontime,R.on_time===null?'—':R.on_time+'%','#3FE0E8'],[T.x.k.open,R.open,'#A78BFA']];
      var paid=Object.keys(R.paid||{}).map(function(c){ return money(R.paid[c],c); }).join(' · ');
      box.innerHTML='<div class="wkpis">'+cards.map(function(c){ return '<div class="wkpi glass" style="--k:'+c[2]+'"><b>'+esc(c[1])+'</b><span>'+esc(c[0])+'</span></div>'; }).join('')+'</div>'+
        '<section class="wsec">'+wh(T.x.doneList,'#5EF0B0')+(R.completed.length?'<ul class="wdates">'+R.completed.map(function(t){ return '<li><a href="#w/t/'+esc(t.ref)+'"><b class="'+(t.on_time?'':'late')+'">'+esc(d8(t.completed_at))+(t.confirmed_date?' / '+esc(d8(t.confirmed_date)):'')+'</b><span>'+esc(t.title)+'</span><small class="muted"><bdi dir="ltr">'+esc(t.ref)+'</bdi></small></a></li>'; }).join('')+'</ul>':'<p class="muted small">'+T.x.none+'</p>')+'</section>'+
        ((R.invoices||[]).length||paid?'<section class="wsec">'+wh(T.x.inv,'#F5C66B')+'<div class="wrecs">'+(R.invoices||[]).map(function(x){ return '<div class="wrec glass"><b><bdi dir="ltr">'+esc(x.no)+'</bdi> · '+esc(x.title||'')+'</b><small class="muted"><bdi dir="ltr">'+esc(money(x.total,x.currency))+'</bdi> · '+esc(T.bl.st[x.state]||x.state)+'</small></div>'; }).join('')+'</div>'+(paid?'<p class="small">'+T.x.paid+': <b><bdi dir="ltr">'+esc(paid)+'</bdi></b></p>':'')+'</section>':''); });
  }
  function invDoc(id){ docModal(API+'work?invoiceDoc='+encodeURIComponent(id),T.bl.h); }
  function docModal(src,title){
    var m=document.createElement('div'); m.className='acct-modal inv-modal'; m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true'); m.setAttribute('aria-label',title);
    m.innerHTML='<div class="inv-box"><div class="inv-bar"><b>'+esc(title)+'</b><span class="sp"></span><button type="button" class="btn btn-primary sv">'+T.bl.save+'</button><button type="button" class="btn btn-glass glass x" aria-label="'+T.bl.close+'">×</button></div><div class="inv-scroll"><iframe title="'+esc(title)+'" src="'+esc(src)+'"></iframe></div></div>';
    document.body.appendChild(m); document.body.style.overflow='hidden'; requestAnimationFrame(function(){ m.classList.add('show'); });
    var f=m.querySelector('iframe'); f.onload=function(){ try{ var d=f.contentDocument; f.style.height=(d.body.scrollHeight+2)+'px'; [].forEach.call(d.images,function(im){ im.onload=function(){ f.style.height=(d.body.scrollHeight+2)+'px'; }; }); }catch(_){} };
    var close=function(){ m.classList.remove('show'); document.body.style.overflow=''; setTimeout(function(){ m.remove(); },350); };
    m.querySelector('.x').onclick=close; m.onclick=function(e){ if(e.target===m) close(); }; m.addEventListener('keydown',function(e){ if(e.key==='Escape') close(); }); setTimeout(function(){ m.querySelector('.x').focus(); },50);
    m.querySelector('.sv').onclick=function(){ try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(_){ window.open(f.src,'_blank'); } };
  }

  /* ---- notification settings: e-mail and WhatsApp per category; WhatsApp only with explicit consent ---- */
  function settings(){
    loading();
    api('?view=prefs').then(function(j){ if(!j.ok) return fail(j); var P=j.prefs, wa=j.wa||{}, cats=j.cats||['tasks','requests','deliveries','comments','projects'];
      var sw=function(name,on,dis){ return '<label class="wsw"><input type="checkbox" name="'+name+'"'+(on?' checked':'')+(dis?' disabled':'')+'><i></i></label>'; };
      var masked=P.wa_phone?('+'+P.wa_phone).replace(/\d(?=\d{4})/g,'•'):'';
      host.innerHTML=head('settings','SETTINGS',T.pf.h,T.pf.p,'<div class="whd-a"><a class="btn btn-glass glass" href="account.html">'+(AR?'بيانات الحساب':'Account details')+'</a></div>')+'<form class="wcard glass wset form" novalidate>'+
        '<div class="wprefs"><div class="wpr wpr-h"><span></span><span>'+T.pf.inapp+'</span><span>'+T.pf.email+'</span><span>'+T.pf.wa+'</span></div>'+cats.map(function(c){ var L2=T.pf.cats[c]||[c,''];
          return '<div class="wpr"><span class="wpr-l"><b>'+esc(L2[0])+'</b><small class="muted">'+esc(L2[1])+'</small></span><span data-l="'+T.pf.inapp+'">'+sw('in_'+c,true,true)+'</span><span data-l="'+T.pf.email+'">'+sw('em_'+c,P.email_cats[c])+'</span><span data-l="'+T.pf.wa+'">'+sw('wa_'+c,P.wa_cats[c],!P.consent)+'</span></div>'; }).join('')+'</div>'+
        '<div class="actions"><button class="btn btn-primary" type="submit">'+T.pf.save+'</button></div>'+
        '<section class="wwa">'+wh(T.pf.waH,'#5EF0B0')+(wa.available?'':'<p class="wnote">'+T.pf.waOff+'</p>')+
          (P.consent?'<p class="wwa-on"><b>✓ '+T.pf.active+'<bdi dir="ltr">'+esc(masked)+'</bdi></b><small class="muted">'+T.pf.since+esc(d8(P.wa_consent_at))+'</small></p><p class="muted small">'+T.pf.stopHint+'</p><div class="actions"><button type="button" class="btn btn-glass glass danger" data-wastop>'+T.pf.stop+'</button></div>'
            :(P.wa_withdrawn_at?'<p class="muted small">'+T.pf.stopped+esc(d8(P.wa_withdrawn_at))+'</p>':'')+'<label>'+T.pf.phone+'<input name="phone" type="tel" dir="ltr" inputmode="tel" autocomplete="tel" placeholder="+966 5x xxx xxxx" value="'+esc(P.wa_phone?'+'+P.wa_phone:'')+'"></label>'+
            '<label class="wconsent"><input type="checkbox" name="consent"><span>'+T.pf.consent+'</span></label><p class="msg" role="alert"></p><div class="actions"><button type="button" class="btn btn-primary" data-waon>'+T.pf.on+'</button></div>')+'</section></form>';
      rise(); var f=host.querySelector('.wset'), E=f.elements, collect=function(){ var ec={}, wc={}; cats.forEach(function(c){ ec[c]=E['em_'+c].checked; wc[c]=E['wa_'+c].checked; }); return {email_cats:ec,wa_cats:wc}; };
      f.onsubmit=function(e){ e.preventDefault(); var b=f.querySelector('button[type=submit]'); b.disabled=true; var d=collect(); d.action='prefs';
        api('',d).then(function(r){ b.disabled=false; toast(r.ok?T.pf.saved:T.err); }); };
      var on=f.querySelector('[data-waon]'); if(on) on.onclick=function(){ var msg=f.querySelector('.msg'), ph=E.phone.value.trim();
        if(!/^\+?[0-9\s\-().]{8,20}$/.test(ph)){ msg.textContent=T.pf.needPhone; E.phone.focus(); return; }
        if(!E.consent.checked){ msg.textContent=T.pf.needConsent; E.consent.focus(); return; }
        on.disabled=true; var d=collect(); d.action='prefs'; d.wa_consent=true; d.wa_phone=ph;
        api('',d).then(function(r){ if(r.ok){ toast(T.pf.onMsg); settings(); } else { on.disabled=false; msg.textContent=r.error==='phone'?T.pf.needPhone:T.err; } }); };
      var st=f.querySelector('[data-wastop]'); if(st) st.onclick=function(){ if(st.dataset.armed!=='1'){ st.dataset.armed='1'; st.textContent=T.dl.sure; return; } st.disabled=true;
        api('',{action:'prefs',wa_consent:false}).then(function(r){ if(r.ok){ toast(T.pf.offMsg); settings(); } else { st.disabled=false; toast(T.err); } }); };
    });
  }

  /* ---- deliveries: V1, V2… Final, with approval or timestamped change requests ---- */
  function embedOf(u){ var m;
    if((m=/drive\.google\.com\/file\/d\/([\w-]{10,})/.exec(u))||(m=/drive\.google\.com\/open\?id=([\w-]{10,})/.exec(u))) return 'https://drive.google.com/file/d/'+m[1]+'/preview';
    if((m=/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(u))) return 'https://www.youtube-nocookie.com/embed/'+m[1];
    if((m=/vimeo\.com\/(?:video\/)?(\d{6,})/.exec(u))) return 'https://player.vimeo.com/video/'+m[1];
    return ''; }
  function vname(dl){ return dl.is_final?T.dl.fin:dl.label; }
  function points(list){ return '<ol class="wpl">'+list.map(function(p){ return '<li class="'+(p.done?'done':'')+'">'+(p.t?'<span class="wtc">'+esc(p.t)+'</span>':'')+'<span>'+esc(p.text)+'</span>'+(p.done?'<em>✓ '+T.dl.done+'</em>':'')+'</li>'; }).join('')+'</ol>'; }
  function dlCard(dl,t,latest){ var emb=embedOf(dl.url), canDecide=latest&&dl.status==='sent'&&(t.status==='feedback'||t.status==='final');
    return '<article class="wdl glass'+(latest?' latest':'')+'" data-dl="'+esc(dl.id)+'"><div class="wdl-h"><span class="wver'+(dl.is_final?' fin':'')+'">'+esc(vname(dl))+'</span>'+
      '<div class="wdl-t"><b>'+esc(dl.title||t.title)+'</b><small class="muted">'+esc(ago(dl.created_at))+'</small></div><span class="dst s-'+esc(dl.status)+'">'+esc(T.dl.st[dl.status]||dl.status)+'</span></div>'+
      (dl.note?'<div class="wdl-note"><small class="muted">'+T.dl.studio+'</small><p>'+para(dl.note)+'</p></div>':'')+
      '<div class="wdl-a"><a class="btn btn-glass glass" href="'+esc(dl.url)+'" target="_blank" rel="noopener noreferrer">↗ '+T.dl.open+'</a>'+(emb?'<button type="button" class="btn btn-glass glass" data-emb="'+esc(emb)+'">▶ '+T.dl.preview+'</button>':'')+
        ((dl.links||[]).length?linksHTML(dl.links):'')+'</div><div class="wembed" hidden></div>'+
      (dl.status==='changes'?'<div class="wdl-fb"><small class="muted">'+T.dl.yours+'</small>'+((dl.points||[]).length?points(dl.points):'')+(dl.decision_note?'<p>'+para(dl.decision_note)+'</p>':'')+(latest&&t.status==='revision'?'<p class="muted small">⏳ '+T.dl.working+'</p>':'')+'</div>':'')+
      (dl.status==='approved'&&dl.decision_note?'<div class="wdl-fb"><small class="muted">'+T.dl.yours+'</small><p>'+para(dl.decision_note)+'</p></div>':'')+
      (canDecide?'<div class="wdec"><div class="actions"><button type="button" class="btn btn-primary" data-ok>✓ '+(dl.is_final?T.dl.approveFinal:T.dl.approve)+'</button><button type="button" class="btn btn-glass glass" data-chg2>'+T.dl.changes+'</button></div>'+
        (dl.is_final?'<p class="muted small">'+T.dl.finalNote+'</p>':'')+
        '<form class="form wpts" hidden novalidate><b>'+T.dl.chH+'</b><p class="muted small">'+T.dl.chHint+'</p><div class="rows"></div><button type="button" class="linkbtn addp">'+T.dl.addPoint+'</button>'+
        '<label>'+T.dl.general+'<textarea name="note" dir="auto" maxlength="3000" rows="2"></textarea></label><p class="msg" role="alert"></p><div class="actions"><button class="btn btn-primary" type="submit">'+T.dl.send+'</button></div></form></div>':'')+
      '</article>'; }
  function deliveries(j){ var t=j.task, list=j.deliverables||[], rounds=list.filter(function(d){return d.status==='changes'}).length;
    if(!list.length&&['accepted','progress','revision'].indexOf(t.status)<0) return '';
    return '<section class="wsec wdls">'+wh(T.dl.h+(rounds?' · '+T.dl.round+' '+rounds:''),'#E07BE0')+(list.length?dlCard(list[0],t,true)+
      (list.length>1?'<details class="wvh"><summary>'+T.dl.history+' ('+(list.length-1)+')</summary><div class="wvh-l">'+list.slice(1).map(function(d){ return dlCard(d,t,false); }).join('')+'</div></details>':'')
      :'<div class="wcard glass"><p class="muted" style="margin:0">'+T.dl.none+'</p></div>')+'</section>'; }
  var TCRE=/^(\d{1,2}:)?\d{1,2}:\d{2}$/;
  function bindDeliveries(box,j,reload){
    box.querySelectorAll('[data-emb]').forEach(function(b){ b.onclick=function(){ var w=b.closest('.wdl').querySelector('.wembed');
      if(!w.hidden){ w.hidden=true; w.innerHTML=''; return; } w.hidden=false;
      w.innerHTML='<iframe src="'+esc(b.dataset.emb)+'" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin" title="preview"></iframe>'; }; });
    var card=box.querySelector('.wdl.latest'); if(!card) return; var id=card.dataset.dl, t=j.task;
    var ok=card.querySelector('[data-ok]'), ch=card.querySelector('[data-chg2]'), f=card.querySelector('.wpts'); if(!ok) return;
    ok.onclick=function(){ if(ok.dataset.armed!=='1'){ ok.dataset.armed='1'; ok.textContent=T.dl.sure; return; } ok.disabled=true;
      api('',{action:'decide',task:t.ref,deliverable:id,decision:'approve'}).then(function(r){ if(r.ok){ toast(T.dl.okMsg); reload(); } else { ok.disabled=false; toast(T.err); } }); };
    var rows=f.querySelector('.rows');
    var add=function(){ if(rows.children.length>=30) return; var d=document.createElement('div'); d.className='wpt';
      d.innerHTML='<input name="t" inputmode="numeric" dir="ltr" maxlength="8" placeholder="00:12" aria-label="timecode"><input name="x" dir="auto" maxlength="600" placeholder="'+T.dl.point+'">'; rows.appendChild(d); return d; };
    add(); add(); f.querySelector('.addp').onclick=function(){ var d=add(); if(d) d.children[1].focus(); };
    ch.onclick=function(){ f.hidden=!f.hidden; if(!f.hidden) rows.querySelector('input[name=x]').focus(); };
    f.onsubmit=function(e){ e.preventDefault(); var msg=f.querySelector('.msg'), bad=null;
      var pts=[].map.call(rows.children,function(r){ var tc=r.children[0].value.trim(), x=r.children[1].value.trim(); if(tc&&!TCRE.test(tc)) bad=r.children[0]; return {t:tc,text:x}; }).filter(function(p){ return p.text; });
      if(bad){ msg.textContent=T.dl.badTc; bad.focus(); return; }
      var note=f.elements.note.value.trim(); if(!pts.length&&!note){ msg.textContent=T.dl.need; rows.querySelector('input[name=x]').focus(); return; }
      var b=f.querySelector('button[type=submit]'); b.disabled=true;
      api('',{action:'decide',task:t.ref,deliverable:id,decision:'changes',points:pts,note:note}).then(function(r){ if(r.ok){ toast(T.dl.chMsg); reload(); } else { b.disabled=false; msg.textContent=T.err; } }); };
  }
  window.EBPortal={mount:mount, route:route, T:T, notified:function(){ setUnread(0); if(CUR==='notifications') notifications(); }};
})();
