/* Eyeblink — content renderer.
   Content comes from (in order): the seed baked into the page → a draft saved from /admin in this browser
   (preview only) → the live content from /api/content when the site runs on Cloudflare. */
(function(){
  var root=document.documentElement, lang=root.lang==='en'?'en':'ar', AR=lang==='ar';
  var BASE=document.body.getAttribute('data-base')||'';
  var SVC_ID=document.body.getAttribute('data-service')||'';
  var UI={
    ar:{details:'التفاصيل',choose:'اختر هذه الباقة',chosen:'تم الاختيار',ask:'عرض سعر',from:'يبدأ من',featured:'الأكثر طلباً',watch:'شاهد: ',all:'الكل',
        svc:{editing:'مونتاج',motion:'موشن غرافيك',social:'سوشال ميديا',films:'أفلام'},total:'المجموع التقديري',quote:'حسب البريف',
        sending:'جارٍ الإرسال…',sent:'وصل طلبك',sentP:'رقم طلبك أدناه. سنراجع التفاصيل ونرد عليك خلال 24 ساعة بخطة واضحة.',
        offline:'جهّزنا طلبك',offlineP:'نسخنا تفاصيل الطلب. أرسلها لنا على إنستغرام وسنرد عليك بخطة واضحة.',copy:'نسخ التفاصيل',copied:'تم النسخ',openIG:'افتح إنستغرام',
        pickFirst:'اختر باقة أولاً',draft:'أنت تشاهد مسودة من لوحة التحكم.',exit:'إلغاء المعاينة',pkg:'الباقة',addons:'الإضافات',none:'بدون'},
    en:{details:'Details',choose:'Choose this package',chosen:'Selected',ask:'Quote',from:'From',featured:'Most requested',watch:'Watch: ',all:'All',
        svc:{editing:'Editing',motion:'Motion',social:'Social',films:'Films'},total:'Estimated total',quote:'Based on brief',
        sending:'Sending…',sent:'Request received',sentP:'Your request number is below. We will review the details and reply within 24 hours with a clear plan.',
        offline:'Your request is ready',offlineP:'We copied your request details. Send them to us on Instagram and we will reply with a clear plan.',copy:'Copy details',copied:'Copied',openIG:'Open Instagram',
        pickFirst:'Choose a package first',draft:'You are viewing a draft from the admin panel.',exit:'Exit preview',pkg:'Package',addons:'Add-ons',none:'None'}
  }[lang];
  var ICON={
    editing:'<svg viewBox="0 0 24 24"><rect x="3" y="6" width="7.5" height="4.5" rx="1.2"/><rect x="12.5" y="6" width="8.5" height="4.5" rx="1.2"/><rect x="3" y="13.5" width="11" height="4.5" rx="1.2"/><rect x="16" y="13.5" width="5" height="4.5" rx="1.2"/><path d="M11.5 4.2v16.3"/><path class="fill" d="M9.9 2.8h3.2l-1.6 1.9z"/></svg>',
    motion:'<svg viewBox="0 0 24 24"><path d="M4.5 18.5C7 9 12 7.5 13 12s5.5 3.5 6.5-6.5"/><path d="M4.5 18.5 6.6 11.9M19.5 5.5 16.9 10.6" stroke-dasharray="1.6 1.8"/><rect x="3" y="17" width="3" height="3" rx=".6"/><rect x="18" y="4" width="3" height="3" rx=".6"/><circle class="fill" cx="13" cy="12" r="1.5"/></svg>',
    social:'<svg viewBox="0 0 24 24"><rect x="6.5" y="2.5" width="11" height="19" rx="2.8"/><path d="M9.2 5.2h5.6" stroke-width="1.2"/><path class="fill" d="M10.6 9.6v5l4.1-2.5z"/><path d="M9.5 18.4h5" stroke-width="1.2"/></svg>',
    films:'<svg viewBox="0 0 24 24"><rect x="3.5" y="10.5" width="17" height="10" rx="1.6"/><path d="M3.7 10.2 4.9 5.4 20.3 8.9 19.9 10.5"/><path d="M8.6 6.3 7.8 10.2M13.2 7.3l-.8 3.2M17.6 8.3l-.5 2.2"/><path d="M7 14.5h6M7 17.2h4" stroke-width="1.2"/></svg>'};
  var ARW=AR?'←':'→';

  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]}); }
  function L(v){ return v==null? '' : (typeof v==='object'&&!Array.isArray(v)&&('ar' in v||'en' in v))? (v[lang]!=null&&v[lang]!==''? v[lang] : (v.ar||v.en||'')) : v; }
  function get(o,path){ return path.split('.').reduce(function(a,k){return a==null?a:a[k]},o); }
  function url(p){ return !p? '' : /^(https?:|data:|blob:|\/)/.test(p)? p : BASE+p; }
  function money(c,n){ return AR? n+' '+c : c+n; }
  function ratio(r){ var m=/^(\d+(?:\.\d+)?)[:\/](\d+(?:\.\d+)?)$/.exec(r||''); return m?m[1]+'/'+m[2]:'16/10'; }

  var C=null;
  try{ C=JSON.parse(document.getElementById('eb-seed').textContent); }catch(e){ C={}; }
  var isDraft=false;
  try{ if(localStorage.getItem('eb-preview')==='1'){ var d=JSON.parse(localStorage.getItem('eb-draft')||'null'); if(d){ C=d; isDraft=true; } } }catch(e){}

  /* ---------------- renderers ---------------- */
  var R={
    stats:function(el){ var s=C.stats||[]; el.style.setProperty('--n',Math.min(s.length,4)||1);
      el.innerHTML=s.map(function(x){return '<div class="stat glass rv"><b>'+esc(x.value)+'</b><span>'+esc(L(x.label))+'</span></div>'}).join(''); el.hidden=!s.length; },
    'services-cards':function(el){ var mode=el.dataset.mode||'teaser';
      el.innerHTML=(C.services||[]).map(function(s){
        return '<a class="card glass rv" href="service-'+esc(s.id)+'.html"><div class="icon glass">'+(ICON[s.id]||ICON.editing)+'</div><span class="k">'+esc(s.label)+'</span><h3>'+esc(L(s.name))+'</h3><p>'+esc(L(mode==='full'?s.body:s.short))+'</p>'+
          (mode==='full'?'<ul class="tags">'+(L(s.tags)||[]).map(function(t){return '<li>'+esc(t)+'</li>'}).join('')+'</ul>':'')+
          '<span class="more">'+UI.details+' <span class="arr">'+ARW+'</span></span></a>'; }).join('');
      el.style.gridTemplateColumns=(C.services||[]).length===4&&innerWidth>980?'repeat(4,1fr)':''; },
    process:function(el){ var st=(C.process&&C.process.steps)||[], n=st.length;
      el.innerHTML=st.map(function(s,i){return '<li class="step glass rv"><span class="n">'+String(i+1).padStart(2,'0')+' / '+String(n).padStart(2,'0')+'</span><h3>'+esc(L(s.h))+'</h3><div class="cut"></div><p>'+esc(L(s.p))+'</p></li>'}).join(''); },
    principles:function(el){ el.innerHTML=((C.about&&C.about.principles)||[]).map(function(p){return '<article class="principle glass rv"><span class="k">'+esc(p.k)+'</span><h3>'+esc(L(p.h))+'</h3><p>'+esc(L(p.p))+'</p></article>'}).join(''); },
    values:function(el){ el.innerHTML=(L(C.about&&C.about.values)||[]).map(function(v){return '<li class="glass">'+esc(v)+'</li>'}).join(''); },
    bio:function(el){ el.innerHTML=(L(C.about&&C.about.bio)||[]).map(function(p){return '<p>'+esc(p)+'</p>'}).join(''); },
    payments:function(el){ var m=((C.payments&&C.payments.methods)||[]).filter(function(x){return x.enabled!==false});
      el.innerHTML=m.map(function(x){ return '<li class="paym" title="'+esc(x.name)+'"><span class="pic">'+payIcon(x)+'</span><span class="pname">'+esc(x.name)+'</span></li>'; }).join(''); },
    'pay-strip':function(el){ var m=((C.payments&&C.payments.methods)||[]).filter(function(x){return x.enabled!==false});
      el.innerHTML=m.map(function(x){ return '<li title="'+esc(x.name)+'" aria-label="'+esc(x.name)+'">'+payIcon(x)+'</li>'; }).join(''); },
    markP:function(el){ el.innerHTML=(L(C.about&&C.about.markP)||[]).map(function(p){return '<p>'+esc(p)+'</p>'}).join(''); },
    brief:function(el){ el.innerHTML=((C.contact&&C.contact.brief)||[]).map(function(b){return '<li class="glass rv"><span class="k">'+esc(b.k)+'</span><h3>'+esc(L(b.h))+'</h3><p>'+esc(L(b.p))+'</p></li>'}).join(''); },
    'svc-tags':function(el,s){ el.innerHTML=(L(s.tags)||[]).map(function(t){return '<li>'+esc(t)+'</li>'}).join(''); },
    'svc-deliver':function(el,s){ el.innerHTML=(L(s.deliverables)||[]).map(function(t){return '<li class="glass rv">'+esc(t)+'</li>'}).join(''); },
    'svc-tools':function(el,s){ el.innerHTML=(s.tools||[]).map(function(t){ var ab=t.replace(/[^A-Za-z ]/g,'').split(' ').map(function(w){return w[0]||''}).join('').slice(0,2)||t.slice(0,2);
      return '<li class="glass"><i>'+esc(ab)+'</i>'+esc(t)+'</li>'}).join(''); },
    'svc-packages':function(el,s){ var items=((C.packages&&C.packages.items)||[]).filter(function(p){return p.service===s.id});
      el.innerHTML=items.map(function(p){return pkgCard(p,true)}).join(''); el.closest('section').hidden=!items.length; },
    'svc-nav':function(el,s){ el.innerHTML=(C.services||[]).map(function(x){return '<a class="glass" href="service-'+esc(x.id)+'.html"'+(x.id===s.id?' aria-current="page"':'')+'>'+esc(L(x.name))+'</a>'}).join(''); },
    packages:function(el){ el.innerHTML=((C.packages&&C.packages.items)||[]).map(function(p){return pkgCard(p,false)}).join(''); },
    'packages-teaser':function(el){ var it=((C.packages&&C.packages.items)||[]).slice(0,3); el.innerHTML=it.map(function(p){return pkgCard(p,true)}).join(''); }
  };
  // generic method icons; an uploaded logo (admin → payment methods) replaces them
  var PAYI={
    paypal:'<svg viewBox="0 0 24 24"><path d="M4 7.5h16v11H4z"/><path d="M4 11h16"/><path d="M7.5 15h3"/></svg>',
    binance:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5 16.5 12 12 16.5 7.5 12z"/></svg>',
    westernunion:'<svg viewBox="0 0 24 24"><path d="M4 9.5 12 5l8 4.5"/><path d="M5.5 10v7M9.5 10v7M14.5 10v7M18.5 10v7"/><path d="M4 19h16"/></svg>',
    visa:'<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12.5" rx="2.5"/><path d="M3 10h18"/><path d="M6.5 15h4"/></svg>',
    mastercard:'<svg viewBox="0 0 24 24"><circle cx="9.5" cy="12" r="5"/><circle cx="14.5" cy="12" r="5"/></svg>',
    _:'<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12.5" rx="2.5"/><path d="M3 10h18"/></svg>'};
  function payIcon(x){ return x.logo? '<img alt="'+esc(x.name)+'" src="'+esc(url(x.logo))+'">' : (PAYI[x.id]||PAYI._); }
  function pkgCard(p,link){
    var cur=(C.packages&&C.packages.currency)||'$';
    var price=p.price==null||p.price===''? '<b class="ask">'+UI.ask+'</b>' : '<b>'+esc(money(cur,p.price))+'</b><small>'+esc(L(p.unit))+'</small>';
    var tag=link?'a':'button', attr=link?' href="pricing.html#'+esc(p.id)+'"':' type="button" aria-pressed="false"';
    return '<'+tag+' class="pkg glass rv'+(p.featured?' featured':'')+'" data-id="'+esc(p.id)+'"'+attr+'>'+
      '<span class="pkg-top"><span class="k">'+esc(((C.services||[]).filter(function(s){return s.id===p.service})[0]||{}).label||'PACKAGE')+'</span>'+(p.featured?'<span class="badge">'+UI.featured+'</span>':'')+'</span><h3>'+esc(L(p.name))+'</h3>'+
      '<div class="price">'+(p.price!=null&&p.price!==''?'<small>'+UI.from+'</small>':'')+price+'</div><p>'+esc(L(p.desc))+'</p>'+
      '<ul>'+(L(p.features)||[]).map(function(f){return '<li>'+esc(f)+'</li>'}).join('')+'</ul>'+
      '<span class="btn '+(p.featured?'btn-primary':'btn-glass glass')+' pick">'+(link?UI.details+' <span class="arr">'+ARW+'</span>':UI.choose)+'</span></'+tag+'>';
  }

  function renderAll(){
    [].forEach.call(document.querySelectorAll('[data-t]'),function(el){ var v=L(get(C,el.dataset.t)); if(v!==undefined&&v!==null) el.innerHTML=v; });
    var svc=SVC_ID? (C.services||[]).filter(function(s){return s.id===SVC_ID})[0] : null;
    if(svc){ [].forEach.call(document.querySelectorAll('[data-s]'),function(el){ el.innerHTML=esc(L(svc[el.dataset.s])); }); document.title=L(svc.name)+' — Eyeblink Studio'; }
    [].forEach.call(document.querySelectorAll('[data-list]'),function(el){ var f=R[el.dataset.list]; if(f) f(el,svc||{}); });
    [].forEach.call(document.querySelectorAll('[data-ig]'),function(el){ var h=(C.site&&C.site.instagram)||'eyeblnk'; if(el.tagName==='A') el.href='https://instagram.com/'+h; else el.textContent='@'+h; });
    var S=C.settings||{};
    [].forEach.call(document.querySelectorAll('[data-show]'),function(el){ el.hidden = S[el.dataset.show]===false; });
    [].forEach.call(document.querySelectorAll('[data-contact-extra]'),function(el){
      var h=''; if(S.whatsapp){ var n=String(S.whatsapp).replace(/[^0-9]/g,''); h+='<a class="btn btn-glass glass" href="https://wa.me/'+n+'" target="_blank" rel="noopener"><span class="dot"></span>WhatsApp <span class="latin" style="user-select:all">+'+esc(n)+'</span></a>'; }
      if(S.email){ h+='<span class="btn btn-glass glass latin" style="user-select:all">'+esc(S.email)+'</span>'; }
      el.innerHTML=h; el.hidden=!h; });
    var of=document.getElementById('order'), oc=document.getElementById('orderClosed');
    if(of&&oc){ var open=S.ordersOpen!==false; of.hidden=!open; oc.hidden=open; }
    renderWork(); setupOrder();
    if(window.EB&&EB.refresh) EB.refresh();
  }

  /* ---------------- work ---------------- */
  var lbBound=false;
  // a Vimeo / YouTube link or a bare id → {type,id,hash}
  function vid(f){
    f=f||{}; var raw=String(f.id||f.src||'').trim(), m, t=f.type;
    if(!raw) return null;
    if((m=/vimeo\.com\/(?:.*?\/)?(?:video\/)?(\d{5,})(?:\/([0-9a-f]{6,}))?/i.exec(raw))){ var h=(/[?&]h=([0-9a-f]+)/i.exec(raw)||[])[1]||m[2]||''; return {type:'vimeo',id:m[1],hash:h}; }
    if((m=/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/i.exec(raw))) return {type:'youtube',id:m[1]};
    if(t==='vimeo' && /^\d{5,}$/.test(raw)) return {type:'vimeo',id:raw,hash:''};
    if(t==='youtube' && /^[\w-]{11}$/.test(raw)) return {type:'youtube',id:raw};
    return null;
  }
  function thumbFor(p,img){
    var v=vid(p.full); if(!v) return;
    if(v.type==='youtube'){ img.src='https://i.ytimg.com/vi/'+v.id+'/hqdefault.jpg'; return; }
    var u='https://vimeo.com/'+v.id+(v.hash?'/'+v.hash:'');
    fetch('https://vimeo.com/api/oembed.json?width=1280&url='+encodeURIComponent(u)).then(function(r){return r.ok?r.json():null})
      .then(function(j){ if(j&&j.thumbnail_url) img.src=j.thumbnail_url.replace(/_\d+x\d+/,'_1280'); }).catch(function(){});
  }
  function shape(r){ var a=ratio(r).split('/'), k=(+a[0])/(+a[1]); return k<.95?'tall':k>1.05?'wide':'sq'; }
  /* desk props beside the printed photo, one per service */
  var PROPS={
    films:'<svg class="prop clap" viewBox="0 0 120 100" aria-hidden="true"><g class="arm"><rect x="8" y="20" width="104" height="15" rx="2" fill="#141831"/><path d="M22 20h14l-9 15H13zM50 20h14l-9 15H41zM78 20h14l-9 15H69zM106 20h6v5l-6 10H97z" fill="#EEF2F6"/></g>'+
      '<rect x="8" y="38" width="104" height="58" rx="3" fill="#141831"/><path d="M8 38h104v13H8z" fill="#1d2244"/><path d="M22 38h14l-9 13H13zM50 38h14l-9 13H41zM78 38h14l-9 13H69zM106 38h6v4l-6 9H97z" fill="#EEF2F6"/>'+
      '<path d="M14 66h92M60 58v32" stroke="#EEF2F6" stroke-opacity=".35"/><text x="18" y="64" font-size="6" fill="#AEBBD2" font-family="Oswald,sans-serif" letter-spacing="1">SCENE</text><text x="66" y="64" font-size="6" fill="#AEBBD2" font-family="Oswald,sans-serif" letter-spacing="1">TAKE</text>'+
      '<text x="18" y="84" font-size="15" fill="#EEF2F6" font-family="Oswald,sans-serif">01</text><text x="66" y="84" font-size="15" fill="#3FE0E8" font-family="Oswald,sans-serif">03</text><circle cx="16" cy="44" r="0"/></svg>',
    editing:'<svg class="prop tline" viewBox="0 0 150 76" aria-hidden="true"><rect x="1" y="1" width="148" height="74" rx="7" fill="#0b0f26" stroke="#2a3366"/>'+
      '<path d="M10 14h130" stroke="#2a3366"/><path d="M10 10v4M30 11v3M50 10v4M70 11v3M90 10v4M110 11v3M130 10v4" stroke="#6F7FA0"/>'+
      '<rect x="10" y="22" width="38" height="16" rx="3" fill="#2E62FF"/><rect x="50" y="22" width="26" height="16" rx="3" fill="#8B5CFF"/><rect x="78" y="22" width="52" height="16" rx="3" fill="#2E62FF" fill-opacity=".8"/>'+
      '<rect x="22" y="42" width="44" height="12" rx="3" fill="#3FE0E8" fill-opacity=".75"/><rect x="96" y="42" width="34" height="12" rx="3" fill="#E07BE0" fill-opacity=".7"/>'+
      '<path d="M12 64q4-6 8 0t8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0" fill="none" stroke="#3FE0E8" stroke-opacity=".45" stroke-width="1.4"/>'+
      '<g class="head"><path d="M40 6h8l-4 6z" fill="#E07BE0"/><path d="M44 12v58" stroke="#E07BE0" stroke-width="1.6"/></g>'+
      '<g class="razor"><path d="M118 44l18-12 6 8-18 12z" fill="#EEF2F6"/><path d="M124 48l6-4" stroke="#0b0f26" stroke-width="2"/></g></svg>',
    motion:'<svg class="prop graph" viewBox="0 0 130 92" aria-hidden="true"><rect x="1" y="1" width="128" height="90" rx="7" fill="#0b0f26" stroke="#2a3366"/>'+
      '<path d="M12 24h106M12 46h106M12 68h106M38 10v72M64 10v72M90 10v72" stroke="#1d2550"/>'+
      '<path d="M16 76C56 76 64 16 112 16" fill="none" stroke="#2E62FF" stroke-width="2.2"/>'+
      '<path class="trace" pathLength="1" d="M16 76C56 76 64 16 112 16" fill="none" stroke="#3FE0E8" stroke-width="2.4" stroke-linecap="round"/>'+
      '<path d="M16 76H52M112 16H74" stroke="#AEBBD2" stroke-opacity=".6"/><circle cx="52" cy="76" r="2.6" fill="#AEBBD2"/><circle cx="74" cy="16" r="2.6" fill="#AEBBD2"/>'+
      '<rect class="kf" x="11" y="71" width="10" height="10" fill="#E07BE0" transform="rotate(45 16 76)"/><rect class="kf k2" x="107" y="11" width="10" height="10" fill="#E07BE0" transform="rotate(45 112 16)"/></svg>',
    social:'<svg class="prop phone" viewBox="0 0 70 124" aria-hidden="true"><defs><linearGradient id="ebph" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E62FF"/><stop offset="1" stop-color="#8B5CFF"/></linearGradient></defs>'+
      '<rect x="2" y="2" width="66" height="120" rx="12" fill="#0b0f26" stroke="#3a4278" stroke-width="2"/><rect x="7" y="8" width="56" height="108" rx="8" fill="url(#ebph)"/><rect x="26" y="11" width="18" height="4" rx="2" fill="#0b0f26"/>'+
      '<path d="M14 98h26M14 104h18" stroke="#EEF2F6" stroke-opacity=".7" stroke-width="2.4" stroke-linecap="round"/><path d="M28 50l14 9-14 9z" fill="#EEF2F6" fill-opacity=".85"/>'+
      '<g class="heart"><path d="M52 92c-6-4-8-7-8-10a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 3-2 6-8 10z" fill="#E07BE0"/></g>'+
      '<g class="hearts"><path d="M50 70c-3-2-4-3.5-4-5a2 2 0 0 1 4-.5 2 2 0 0 1 4 .5c0 1.5-1 3-4 5z" fill="#EEF2F6"/><path d="M56 58c-2.4-1.6-3.2-2.8-3.2-4a1.6 1.6 0 0 1 3.2-.4 1.6 1.6 0 0 1 3.2.4c0 1.2-.8 2.4-3.2 4z" fill="#E07BE0"/></g></svg>'
  };
  function renderWork(){
    var grid=document.getElementById('workGrid'); if(!grid) return;
    var list=(C.projects||[]).filter(function(p){return p&&L(p.title)&&(p.preview||p.poster||vid(p.full))});
    var limit=+grid.dataset.limit||0, head=document.getElementById('workHead'), filters=document.getElementById('filters');
    if(!list.length) return;
    if(limit) list=list.slice(0,limit);
    if(head){ var e=head.querySelector('.eyebrow'); if(e) e.textContent='SELECTED WORK'; var h=head.querySelector('h1,h2'); if(h) h.textContent=L(C.work.filledH); var p=head.querySelector('p'); if(p) p.textContent=L(C.work.filledP); }
    grid.classList.add('has-projects');
    grid.innerHTML=list.map(function(p,i){
      var lab=((C.services||[]).filter(function(x){return x.id===p.service})[0]||{}).label||'WORK';
      var media=p.preview?'<video muted loop playsinline preload="none" '+(p.poster?'poster="'+esc(url(p.poster))+'"':'')+' src="'+esc(url(p.preview))+'"></video>'
                         :'<img alt="" loading="lazy"'+(p.poster?' src="'+esc(url(p.poster))+'"':' data-auto="1"')+'>';
      var sub=[L(p.summary),p.client?L(p.client):'',p.year||''].filter(Boolean).join(' · ');
      return '<button type="button" class="proj slot glass" data-i="'+i+'" data-service="'+esc(p.service||'')+'" aria-label="'+esc(UI.watch+L(p.title))+'">'+
        '<div class="rec"><span>'+esc(lab)+'</span><b>● PLAY</b></div>'+
        '<div class="desk '+shape(p.ratio)+'"><span class="sheet"></span>'+
          '<div class="pol"><i class="tape"></i><div class="ph">'+media+'<span class="play glass"><svg viewBox="0 0 16 16"><path d="M3 1.5v13l11-6.5z"/></svg></span></div>'+
          '<span class="cap">'+esc(lab+(p.year?' · '+p.year:''))+'</span></div>'+PROPS[PROPS[p.service]?p.service:'films']+'</div>'+
        '<div><h3>'+esc(L(p.title))+'</h3>'+(sub?'<span class="soon">'+esc(sub)+'</span>':'')+'</div></button>';
    }).join('');
    [].forEach.call(grid.querySelectorAll('.proj'),function(b){ b.addEventListener('click',function(){ openLB(list[+b.dataset.i]); }); var im=b.querySelector('img[data-auto]'); if(im) thumbFor(list[+b.dataset.i],im); });
    if('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches){
      var vio=new IntersectionObserver(function(es){es.forEach(function(en){var v=en.target; if(en.isIntersecting){v.preload='auto'; var pr=v.play(); if(pr&&pr.catch)pr.catch(function(){});} else v.pause();});},{threshold:.35});
      [].forEach.call(grid.querySelectorAll('video'),function(v){vio.observe(v)});
    }
    var used=(C.services||[]).map(function(s){return s.id}).filter(function(k){return list.some(function(p){return p.service===k})});
    if(filters && !limit && list.length>=4 && used.length>1){
      filters.hidden=false;
      filters.innerHTML=[['all',UI.all]].concat(used.map(function(k){return [k,UI.svc[k]||k]})).map(function(o,i){return '<button type="button" data-f="'+o[0]+'" aria-pressed="'+(i===0)+'">'+o[1]+'</button>'}).join('');
      filters.onclick=function(e){var bt=e.target.closest('button'); if(!bt)return;
        [].forEach.call(filters.children,function(x){x.setAttribute('aria-pressed',x===bt)});
        [].forEach.call(grid.children,function(c){c.hidden=!(bt.dataset.f==='all'||c.dataset.service===bt.dataset.f)});};
    }
    if('IntersectionObserver' in window){   /* touch screens: the photo straightens when the card is in view */
      var cio=new IntersectionObserver(function(es){es.forEach(function(en){en.target.classList.toggle('in',en.isIntersecting)})},{threshold:.6});
      [].forEach.call(grid.querySelectorAll('.proj'),function(c){cio.observe(c)});
    }
    bindLB();
  }
  var lb,lbFrame,lbTitle,lastFocus;
  function bindLB(){
    if(lbBound) return; lb=document.getElementById('lb'); if(!lb) return; lbBound=true;
    lbFrame=document.getElementById('lbFrame'); lbTitle=document.getElementById('lbTitle');
    document.getElementById('lbClose').addEventListener('click',closeLB);
    lb.addEventListener('click',function(e){ if(e.target===lb) closeLB(); });
    addEventListener('keydown',function(e){ if(e.key==='Escape'&&!lb.hidden) closeLB(); });
  }
  function openLB(p){
    var f=p.full||{}, src='', html='', title=L(p.title);
    var v=vid(f);
    if(v&&v.type==='vimeo') src='https://player.vimeo.com/video/'+v.id+'?'+(v.hash?'h='+v.hash+'&':'')+'autoplay=1&title=0&byline=0&portrait=0&dnt=1&transparent=0&api=1';
    else if(v&&v.type==='youtube') src='https://www.youtube-nocookie.com/embed/'+v.id+'?autoplay=1&rel=0&enablejsapi=1&playsinline=1';
    html= src? '<iframe src="'+src+'" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="'+esc(title)+'"></iframe>'
             : '<video controls autoplay playsinline '+(p.poster?'poster="'+esc(url(p.poster))+'"':'')+' src="'+esc(url(f.src||p.preview))+'"></video>';
    var a=ratio(p.ratio).split('/'); setAR(+a[0],+a[1]);
    if(v&&v.type==='youtube' && /\/shorts\//i.test(String(f.id||f.src||''))) setAR(9,16);
    if(v&&v.type==='vimeo'){ fetch('https://vimeo.com/api/oembed.json?url='+encodeURIComponent('https://vimeo.com/'+v.id+(v.hash?'/'+v.hash:''))).then(function(r){return r.ok?r.json():null}).then(function(j){ if(j&&j.width&&j.height) setAR(j.width,j.height); }).catch(function(){}); }
    lbTitle.textContent=title; lbFrame.innerHTML=html; lastFocus=document.activeElement; lb.hidden=false; lb._closing=0; void lb.offsetWidth; requestAnimationFrame(function(){ lb.classList.add('show'); });
    var ve=lbFrame.querySelector('video'); if(ve) ve.addEventListener('loadedmetadata',function(){ if(ve.videoWidth) setAR(ve.videoWidth,ve.videoHeight); });
    vimeoAsk(lbFrame.querySelector('iframe')); waves(true); fadeAudio(0,1,1400,0);
    document.getElementById('lbClose').focus(); document.body.style.overflow='hidden';
  }
  // ask the Vimeo player itself for the video size (works for private/unlisted videos too)
  var vw=0, vh=0;
  addEventListener('message',function(e){
    if(!/vimeo\.com$/.test((e.origin||'').replace(/^https?:\/\//,'').split(':')[0])) return;
    var d; try{ d=typeof e.data==='string'?JSON.parse(e.data):e.data; }catch(_){ return; }
    if(!d) return;
    var f=lbFrame&&lbFrame.querySelector('iframe'); if(!f) return;
    if(d.event==='ready'){ ['getVideoWidth','getVideoHeight'].forEach(function(m){ f.contentWindow.postMessage(JSON.stringify({method:m}),'*'); }); setVol(fa.cur); }
    if(d.method==='getVideoWidth'){ vw=+d.value; } if(d.method==='getVideoHeight'){ vh=+d.value; }
    if(vw&&vh){ setAR(vw,vh); vw=vh=0; }
  });
  function vimeoAsk(f){ if(!f||!/vimeo/.test(f.src)) return; vw=vh=0; f.addEventListener('load',function(){ ['getVideoWidth','getVideoHeight'].forEach(function(m){ try{ f.contentWindow.postMessage(JSON.stringify({method:m}),'*'); }catch(_){} }); }); }
  // faint radio waves rising from the centre of the player, behind it
  var wv={raf:0};
  function waves(on){
    var c=lb&&lb.querySelector('.lb-waves'); if(!c) return;
    cancelAnimationFrame(wv.raf); if(!on||matchMedia('(prefers-reduced-motion: reduce)').matches){ var x0=c.getContext('2d'); x0&&x0.clearRect(0,0,c.width,c.height); return; }
    var x=c.getContext('2d'), dpr=Math.min(devicePixelRatio||1,2), t0=performance.now();
    function frame(now){
      var W=c.clientWidth, H=c.clientHeight; if(c.width!==Math.round(W*dpr)){ c.width=Math.round(W*dpr); c.height=Math.round(H*dpr); }
      x.setTransform(dpr,0,0,dpr,0,0); x.clearRect(0,0,W,H);
      var fr=lbFrame.getBoundingClientRect(), lr=c.getBoundingClientRect();
      var cx=fr.left+fr.width/2-lr.left, cy=fr.top+fr.height/2-lr.top, r0=Math.min(fr.width,fr.height)*.45, R=Math.hypot(W,H)*.62;
      var t=(now-t0)/1000, beat=3.2, life=7.5;            // a heartbeat every 3.2s, each wave lives 7.5s
      for(var n=Math.floor((t-life)/beat);n<=Math.floor(t/beat);n++){
        [0,.34].forEach(function(off,j){                   // lub … dub
          var age=t-(n*beat+off); if(age<0||age>life) return;
          var k=age/life, e=1-Math.pow(1-k,2.2), r=r0+(R-r0)*e, band=18+60*k;
          var a=(j?0.10:0.15)*Math.pow(1-k,1.5);
          var g=x.createRadialGradient(cx,cy,Math.max(0,r-band),cx,cy,r+band*.35);
          g.addColorStop(0,'rgba(46,98,255,0)');
          g.addColorStop(.62,'rgba(63,224,232,'+(a*.55).toFixed(3)+')');
          g.addColorStop(.86,'rgba(110,140,255,'+a.toFixed(3)+')');
          g.addColorStop(1,'rgba(139,92,255,0)');
          x.fillStyle=g; x.beginPath(); x.arc(cx,cy,r+band*.35,0,Math.PI*2); x.fill();
        });
      }
      wv.raf=requestAnimationFrame(frame);
    }
    wv.raf=requestAnimationFrame(frame);
  }
  // sound fades in when a film opens and out when it closes
  var fa={raf:0,cur:1};
  function setVol(v){
    var f=lbFrame&&lbFrame.querySelector('iframe'), el=lbFrame&&lbFrame.querySelector('video');
    if(el){ el.volume=Math.max(0,Math.min(1,v)); }
    if(f){ try{
      if(/vimeo/.test(f.src)) f.contentWindow.postMessage(JSON.stringify({method:'setVolume',value:v}),'*');
      else if(/youtube/.test(f.src)) f.contentWindow.postMessage(JSON.stringify({event:'command',func:'setVolume',args:[Math.round(v*100)]}),'*');
    }catch(_){} }
    fa.cur=v;
  }
  function fadeAudio(from,to,ms){
    cancelAnimationFrame(fa.raf); var a=from==null?fa.cur:from, t0=performance.now();
    setVol(a);
    (function step(now){ var k=Math.min(1,(now-t0)/ms), e=k*k*(3-2*k); setVol(a+(to-a)*e); if(k<1) fa.raf=requestAnimationFrame(step); })(t0);
    if(to>0){ // players load a moment later: keep the ramp honest for the first second
      var tries=0, iv=setInterval(function(){ if(++tries>8||lb.hidden){ clearInterval(iv); return; } if(fa.cur<to) setVol(fa.cur); },150);
    }
  }
  function setAR(w,h){ if(!w||!h) return; lb.style.setProperty('--ar',w+'/'+h); lb.style.setProperty('--arn',(w/h).toFixed(4)); lb.classList.toggle('tall',h>w); }
  function closeLB(){ if(lb.hidden||lb._closing) return; lb._closing=1; fadeAudio(null,0,650,0); lb.classList.remove('show');
    setTimeout(function(){ waves(false); lb.hidden=true; lb._closing=0; lbFrame.innerHTML=''; document.body.style.overflow=''; if(lastFocus) lastFocus.focus(); },760); }

  /* ---------------- order ---------------- */
  var selected=null;
  function setupOrder(){
    var box=document.getElementById('order'); if(!box) return;
    var P=C.packages||{}, cur=P.currency||'$';
    var addonsEl=document.getElementById('addons');
    addonsEl.innerHTML=(P.addons||[]).map(function(a){ var pr=a.type==='percent'? '+'+a.price+'%' : '+'+money(cur,a.price);
      return '<li><label><input type="checkbox" value="'+esc(a.id)+'"> <span>'+esc(L(a.name))+'</span><b>'+esc(pr)+'</b></label></li>'}).join('');
    document.getElementById('payNote').textContent=L(P.payment)||'';
    document.getElementById('priceNote').textContent=L(P.note)||'';
    [].forEach.call(document.querySelectorAll('.pkgs .pkg'),function(b){ b.addEventListener('click',function(){ pick(b.dataset.id,true); }); });
    addonsEl.onchange=calc;
    var want=(location.hash||'').slice(1) || selected;
    if(want && (P.items||[]).some(function(p){return p.id===want})) pick(want,false); else calc();
  }
  function pick(id,scroll){
    selected=id;
    [].forEach.call(document.querySelectorAll('.pkgs .pkg'),function(b){ var on=b.dataset.id===id; b.setAttribute('aria-pressed',on); var pk=b.querySelector('.pick'); if(pk&&!b.classList.contains('featured')) pk.textContent=on?UI.chosen:UI.choose; else if(pk) pk.textContent=on?UI.chosen:UI.choose; });
    calc();
    if(scroll){ var o=document.getElementById('order'); if(o) o.scrollIntoView({behavior:'smooth',block:'start'}); }
  }
  function calc(){
    var P=C.packages||{}, cur=P.currency||'$', p=(P.items||[]).filter(function(x){return x.id===selected})[0];
    document.getElementById('selName').textContent=p? L(p.name) : UI.pickFirst;
    var t=document.getElementById('total');
    if(!p){ t.textContent='—'; return; }
    if(p.price==null||p.price===''){ t.textContent=UI.quote; return; }
    var base=+p.price, fixed=0, pct=0;
    [].forEach.call(document.querySelectorAll('#addons input:checked'),function(i){ var a=(P.addons||[]).filter(function(x){return x.id===i.value})[0]; if(!a)return; if(a.type==='percent') pct+=+a.price; else fixed+=+a.price; });
    var sum=Math.round((base+fixed)*(1+pct/100));
    t.textContent=money(cur,sum);
  }
  document.addEventListener('submit',function(e){
    var f=e.target; if(f.id!=='orderForm') return; e.preventDefault();
    if(f.reportValidity && !f.reportValidity()) return;
    var P=C.packages||{}, p=(P.items||[]).filter(function(x){return x.id===selected})[0];
    if(!p){ toast(UI.pickFirst); document.querySelector('.pkgs').scrollIntoView({behavior:'smooth'}); return; }
    var adds=[].map.call(document.querySelectorAll('#addons input:checked'),function(i){ var a=(P.addons||[]).filter(function(x){return x.id===i.value})[0]; return a? L(a.name):i.value; });
    var data={package:p.id, packageName:L(p.name), addons:adds, total:document.getElementById('total').textContent,
      name:f.name.value.trim(), contact:f.contact.value.trim(), details:f.details.value.trim(), link:f.link.value.trim(), deadline:f.deadline.value, lang:lang, website:f.website?f.website.value:''};
    var btn=f.querySelector('button[type=submit]'), old=btn.textContent; btn.disabled=true; btn.textContent=UI.sending;
    var summary=[UI.pkg+': '+data.packageName, UI.addons+': '+(adds.join('، ')||UI.none), UI.total+': '+data.total, '—', data.name, data.contact, data.details, data.link, data.deadline].filter(Boolean).join('\n');
    var done=function(ok,code){
      btn.disabled=false; btn.textContent=old;
      var box=document.getElementById('orderDone'); f.closest('.order').hidden=true; box.hidden=false;
      box.querySelector('h2').textContent=ok?UI.sent:UI.offline;
      box.querySelector('p').textContent=ok?UI.sentP:UI.offlineP;
      box.querySelector('.code').textContent=code;
      var ta=box.querySelector('textarea'); ta.value=code+'\n'+summary; ta.hidden=ok; box.querySelector('.copy').hidden=ok;
      box.querySelector('.pay').textContent=L(P.payment)||'';
      if(!ok){ try{ navigator.clipboard.writeText(ta.value).catch(function(){}); }catch(_){} }
      box.scrollIntoView({behavior:'smooth',block:'center'});
    };
    if(/^https?:/.test(location.protocol) ){
      fetch(BASE+'api/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)})
        .then(function(r){ if(!r.ok) throw 0; return r.json(); }).then(function(j){ done(true,j.code); })
        .catch(function(){ done(false,'EB-'+Math.random().toString(36).slice(2,7).toUpperCase()); });
    } else done(false,'EB-'+Math.random().toString(36).slice(2,7).toUpperCase());
  });
  document.addEventListener('click',function(e){
    var c=e.target.closest('#orderDone .copy'); if(!c) return;
    var ta=document.querySelector('#orderDone textarea');
    var ok=function(){ toast(UI.copied); };
    try{ navigator.clipboard.writeText(ta.value).then(ok,function(){ ta.select(); }); }catch(_){ ta.select(); }
  });
  function toast(t){ var d=document.createElement('div'); d.className='toast'; d.textContent=t; document.body.appendChild(d); setTimeout(function(){d.remove()},2200); }

  /* ---------------- boot ---------------- */
  renderAll();
  if(isDraft){ var bar=document.createElement('div'); bar.className='draft-bar'; bar.innerHTML=UI.draft+' <a href="#" id="exitDraft">'+UI.exit+'</a>'; document.body.appendChild(bar);
    bar.querySelector('a').addEventListener('click',function(e){ e.preventDefault(); try{ localStorage.removeItem('eb-preview'); }catch(_){} location.reload(); }); }
  else if(/^https?:/.test(location.protocol)){
    fetch(BASE+'api/content',{cache:'no-store'}).then(function(r){ return r.ok? r.json():null; }).then(function(j){
      if(j && j.services && JSON.stringify(j)!==JSON.stringify(C)){ C=j; renderAll(); }
    }).catch(function(){});
  }
})();
