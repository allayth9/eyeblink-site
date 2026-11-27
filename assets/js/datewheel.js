/* Eyeblink date wheel (28 Nov): every <input type="date"> and <input type="datetime-local"> on the site and in the panel opens
   wheels for day and month (and time), the year works itself out and can be stepped under the wheels.
   The input itself stays in the form with the same value format, so nothing that reads it changes.
   A date input with data-time also gets a time wheel: its value stays the client's local date (YYYY-MM-DD) and the exact
   moment goes to data-at (UTC ISO) with data-tz (the client's time zone). Moments show in the viewer's own time;
   the panel always shows Damascus time. Opt out with data-nowheel. */
(function(){
  'use strict';
  var D=document, W=window, EN=/^en/i.test(D.documentElement.lang||''), IH=42,
      reduce=W.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches,
      ADMIN=/^\/admin/.test(location.pathname);
  var MON=EN?['January','February','March','April','May','June','July','August','September','October','November','December']
            :['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  var WD=new Intl.DateTimeFormat(EN?'en-GB':'ar',{weekday:'long'});
  var L=EN?{pick:'Choose a date',ok:'Done',today:'Today',clear:'Clear',prev:'Previous year',next:'Next year',day:'Day',month:'Month',time:'Time',am:'AM',pm:'PM'}
          :{pick:'اختر التاريخ',ok:'تم',today:'اليوم',clear:'مسح',prev:'السنة السابقة',next:'السنة التالية',day:'اليوم',month:'الشهر',time:'الوقت',am:'ص',pm:'م'};

  /* ---------- time zones ---------- */
  // the zone is never named on screen (28 Nov): each person simply sees their own time, the panel Damascus time.
  // If a name ever comes back: every zone of Palestine (Jerusalem, Hebron, Gaza) is «فلسطين / Palestine», never anything else.
  function myTz(){ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone||''; }catch(e){ return ''; } }
  // a moment shown for whoever is looking: the panel in Damascus time, everyone else in their own
  function viewTz(){ return ADMIN?'Asia/Damascus':myTz(); }
  function fmtMoment(iso,opt){ opt=opt||{}; var at=new Date(iso); if(isNaN(at)) return ''; var tz=opt.tz||viewTz(), en=opt.en==null?EN:opt.en;
    try{ var d=at.toLocaleDateString(en?'en-GB':'ar-u-nu-latn',{timeZone:tz,day:'numeric',month:'long',year:opt.year===false?undefined:'numeric'}),
           t=at.toLocaleTimeString(en?'en-US':'ar-u-nu-latn',{timeZone:tz,hour:'numeric',minute:'2-digit'});
      return d+(en?', ':' · ')+t; }catch(e){ return at.toISOString().slice(0,16).replace('T',' '); } }
  W.EBTime={ myTz:myTz, fmt:fmtMoment };

  /* ---------- small date helpers ---------- */
  function pad(n){ return (n<10?'0':'')+n; }
  function ymd(y,m,d){ return y+'-'+pad(m+1)+'-'+pad(d); }
  function dim(y,m){ return new Date(y,m+1,0).getDate(); }
  function parse(s){ var m=/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s||''); return m? {y:+m[1],m:+m[2]-1,d:+m[3],h:m[4]==null?null:+m[4],mi:m[5]==null?null:+m[5]} : null; }
  function todayLocal(){ var n=new Date(); return {y:n.getFullYear(),m:n.getMonth(),d:n.getDate()}; }
  var TIMES=[]; for(var h=0;h<24;h++) for(var q=0;q<60;q+=30) TIMES.push(h*60+q);
  function timeHtml(min){ var h=Math.floor(min/60), mi=min%60; return ((h%12)||12)+':'+pad(mi)+'<i>'+(h<12?L.am:L.pm)+'</i>'; }

  /* ---------- styles (shared by the site and the panel; colours from the --k- palette) ---------- */
  var css=
  '.dw-native{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;margin:0!important;padding:0!important;border:0!important;clip-path:inset(50%)}'+
  '.dw{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;width:auto;max-width:100%;justify-self:start;align-self:start;min-height:50px;border-radius:16px;padding:7px 14px;align-items:center;gap:10px;position:relative;color:var(--k-light,#EEF2F6);font-family:inherit;'+
    'background:linear-gradient(160deg,rgba(var(--k-white-rgb,255,255,255),.07),rgba(var(--k-white-rgb,255,255,255),.02) 50%,rgba(var(--k-hour-rgb,46,98,255),.05));'+
    'box-shadow:inset 0 1px 0 rgba(var(--k-white-rgb,255,255,255),.13),inset 0 0 0 1px rgba(var(--k-white-rgb,255,255,255),.1);transition:box-shadow .5s cubic-bezier(.22,.9,.24,1)}'+
  '.dw::before{content:"";position:absolute;top:0;inset-inline:26%;height:1px;background:linear-gradient(90deg,transparent,rgba(var(--k-horizon-rgb,63,224,232),.6),transparent);opacity:.45;transition:opacity .5s,inset .6s cubic-bezier(.22,.9,.24,1)}'+
  '.dw:hover,.dw[aria-expanded="true"]{box-shadow:inset 0 1px 0 rgba(var(--k-white-rgb,255,255,255),.18),inset 0 0 0 1px rgba(var(--k-horizon-rgb,63,224,232),.42)}'+
  '.dw:hover::before,.dw[aria-expanded="true"]::before{opacity:1;inset-inline:14%}'+
  '.dw:focus-visible{outline:1px solid var(--k-horizon,#3FE0E8);outline-offset:4px}'+
  '.dw[disabled]{opacity:.5;cursor:default}'+
  '.dw-face{display:flex;align-items:center;gap:10px;flex:none;min-width:0;transform-origin:center;transition:transform .17s cubic-bezier(.5,0,.75,0),opacity .17s}'+
  '.dw.blink .dw-face{transform:scaleY(.04);opacity:.15}'+
  '.dw-day{font:300 26px/1 Oswald,var(--latin,sans-serif);min-width:1.25em;text-align:center;font-variant-numeric:tabular-nums}'+
  '.dw-vr{width:1px;align-self:stretch;margin-block:3px;flex:none;background:linear-gradient(180deg,transparent,rgba(var(--k-horizon-rgb,63,224,232),.42),transparent)}'+
  '.dw-mid{display:grid;gap:2px;min-width:0;text-align:start}.dw-mon{font-weight:500;font-size:15px;line-height:1.2}'+
  '.dw-sub{font-size:12px;line-height:1.2;color:var(--k-dim,#6F7FA0);white-space:nowrap}.dw-sub b{font:300 12px Oswald,sans-serif;color:var(--k-mist,#AEBBD2);margin-inline-start:2px}'+
  '.dw-tm{display:flex;align-items:center;gap:10px}.dw-tm::before{content:"";width:1px;align-self:stretch;margin-block:2px;background:linear-gradient(180deg,transparent,rgba(var(--k-horizon-rgb,63,224,232),.42),transparent)}.dw-tm b{font:300 18px/1 Oswald,sans-serif;font-variant-numeric:tabular-nums}'+
  '.dw-tm i,.dw-col li i{font-size:12px;font-style:normal;font-family:inherit;color:var(--k-mist,#AEBBD2);margin-inline-start:4px}.dw-tm small{font-size:11px;line-height:1;color:var(--k-dim,#6F7FA0);white-space:nowrap}.dw-tm b{white-space:nowrap}'+
  '.dw-ph{flex:none;text-align:start;color:var(--k-mist,#AEBBD2);font-size:15px}'+
  '.dw-cal{width:18px;height:18px;flex:none;stroke:var(--k-horizon,#3FE0E8);fill:none;stroke-width:1.4}'+
  '.dw-chev{width:12px;height:12px;flex:none;stroke:var(--k-mist,#AEBBD2);fill:none;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;transition:rotate .55s cubic-bezier(.22,.9,.24,1)}'+
  '.dw[aria-expanded="true"] .dw-chev{rotate:180deg}'+
  /* the window */
  '.dw-ov{position:fixed;inset:0;z-index:2147483000;pointer-events:none}.dw-ov.on{pointer-events:auto}'+
  '.dw-scrim{position:absolute;inset:0;background:rgba(var(--k-night-rgb,4,6,26),.6);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);opacity:0;transition:opacity .45s ease}'+
  '.dw-ov.sheet.on .dw-scrim{opacity:1}'+
  '.dw-pan{position:absolute;width:min(360px,calc(100vw - 24px));border-radius:24px;padding:18px 14px 14px;color:var(--k-light,#EEF2F6);direction:'+(EN?'ltr':'rtl')+';font-family:'+(EN?'Manrope,sans-serif':'Hayyakum,sans-serif')+';'+
    'background:linear-gradient(160deg,rgba(var(--k-white-rgb,255,255,255),.09),rgba(var(--k-white-rgb,255,255,255),.025) 45%,rgba(var(--k-hour-rgb,46,98,255),.06)),rgba(var(--k-card-rgb,11,18,54),.95);'+
    '-webkit-backdrop-filter:blur(24px) saturate(1.6);backdrop-filter:blur(24px) saturate(1.6);'+
    'box-shadow:inset 0 1px 0 rgba(var(--k-white-rgb,255,255,255),.18),inset 0 0 0 1px rgba(var(--k-white-rgb,255,255,255),.1),0 40px 90px -36px rgba(0,0,0,.95);'+
    'opacity:0;transform:translateY(-10px) scale(.965);filter:blur(10px);transform-origin:top center;transition:opacity .38s ease,transform .38s cubic-bezier(.22,.9,.24,1),filter .32s ease}'+
  '.dw-pan.up{transform-origin:bottom center;transform:translateY(10px) scale(.965)}'+
  '.dw-ov.on .dw-pan{opacity:1;transform:none;filter:none;transition:opacity .5s ease,transform .7s cubic-bezier(.22,.9,.24,1),filter .55s ease}'+
  '.dw-pan::before{content:"";position:absolute;top:0;inset-inline:22%;height:1px;background:linear-gradient(90deg,transparent,rgba(var(--k-horizon-rgb,63,224,232),.7),transparent)}'+
  '.dw-ov.sheet .dw-pan{inset-inline:0;bottom:0;width:auto;border-radius:30px 30px 0 0;padding:10px 16px calc(22px + env(safe-area-inset-bottom,0px));filter:none;transform:translateY(104%);opacity:1;transition:transform .45s cubic-bezier(.4,0,.2,1)}'+
  '.dw-ov.sheet.on .dw-pan{transform:none;transition:transform .7s cubic-bezier(.22,.9,.24,1)}'+
  '.dw-grip{display:none;width:38px;height:4px;border-radius:9px;background:rgba(var(--k-white-rgb,255,255,255),.22);margin:0 auto 14px}.dw-ov.sheet .dw-grip{display:block}'+
  '.dw-wh{position:relative;display:grid;grid-template-columns:62px 1px minmax(0,1fr);gap:8px;height:'+(IH*5)+'px}'+
  '.dw-wh.t3{grid-template-columns:52px 1px minmax(0,1fr) 1px 104px}'+
  '.dw-band{position:absolute;inset-inline:0;top:'+(IH*2)+'px;height:'+IH+'px;border-radius:13px;pointer-events:none;background:rgba(var(--k-white-rgb,255,255,255),.05);box-shadow:inset 0 0 0 1px rgba(var(--k-white-rgb,255,255,255),.09)}'+
  '.dw-band::before,.dw-band::after{content:"";position:absolute;inset-inline:18%;height:1px;background:linear-gradient(90deg,transparent,rgba(var(--k-horizon-rgb,63,224,232),.55),transparent)}.dw-band::before{top:0}.dw-band::after{bottom:0;opacity:.45}'+
  '.dw-sep{width:1px;position:relative;z-index:1;background:linear-gradient(180deg,transparent,rgba(var(--k-white-rgb,255,255,255),.12) 30%,rgba(var(--k-horizon-rgb,63,224,232),.45) 50%,rgba(var(--k-white-rgb,255,255,255),.12) 70%,transparent)}'+
  '.dw-col{position:relative;height:100%;overflow:hidden;touch-action:none;cursor:grab;outline:none;user-select:none;-webkit-user-select:none;'+
    '-webkit-mask:linear-gradient(180deg,transparent,#000 30%,#000 70%,transparent);mask:linear-gradient(180deg,transparent,#000 30%,#000 70%,transparent);opacity:0;transform:translateY(6px);transition:opacity .4s ease,transform .5s cubic-bezier(.22,.9,.24,1)}'+
  '.dw-ov.on .dw-col{opacity:1;transform:none;transition:opacity .6s ease calc(var(--i) * 80ms + 140ms),transform .8s cubic-bezier(.22,.9,.24,1) calc(var(--i) * 80ms + 140ms)}'+
  '.dw-col:active{cursor:grabbing}.dw-col:focus-visible{background:rgba(var(--k-horizon-rgb,63,224,232),.045);border-radius:12px}'+
  '.dw-col ul{list-style:none;margin:0;padding:'+(IH*2)+'px 0;will-change:transform}'+
  '.dw-col li{height:'+IH+'px;display:flex;align-items:center;justify-content:center;color:var(--k-mist,#AEBBD2);perspective:500px;margin:0}'+
  '.dw-col li span{display:block;transform-origin:center center -42px}.dw-col li.sel{color:var(--k-light,#EEF2F6)}'+
  '.dw-col.n li{font:300 21px Oswald,sans-serif;font-variant-numeric:tabular-nums}.dw-col.mo li{font-size:16px}.dw-col.tt li{font:300 18px Oswald,sans-serif}'+
  '.dw-acts{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(var(--k-white-rgb,255,255,255),.1)}'+
  '.dw-ok{all:unset;cursor:pointer;height:38px;padding:0 24px;border-radius:999px;background:var(--k-light,#EEF2F6);color:var(--k-night,#04061A);font-weight:500;font-size:14.5px;display:inline-flex;align-items:center;justify-content:center;transition:transform .2s}.dw-ok:active{transform:scale(.97)}'+
  '.dw-ov.sheet .dw-ok{order:3;flex-basis:100%;height:48px;margin-top:6px}'+
  '.dw-lnk{all:unset;cursor:pointer;font-size:14px;color:var(--k-horizon,#3FE0E8);padding:6px 4px}.dw-lnk.mute{color:var(--k-dim,#6F7FA0)}'+
  '.dw-when{margin-inline-start:auto;display:flex;align-items:center;gap:8px;font-size:13px;color:var(--k-dim,#6F7FA0)}'+
  '.dw-yr{display:inline-flex;align-items:center;gap:2px;border-radius:999px;padding:2px;box-shadow:inset 0 0 0 1px rgba(var(--k-white-rgb,255,255,255),.1);direction:ltr}'+
  '.dw-yr b{font:300 13.5px Oswald,sans-serif;color:var(--k-light,#EEF2F6);min-width:38px;text-align:center}'+
  '.dw-yr button{all:unset;cursor:pointer;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:var(--k-mist,#AEBBD2)}.dw-yr button:hover{background:rgba(var(--k-white-rgb,255,255,255),.07);color:var(--k-light,#EEF2F6)}'+
  '.dw-yr button:disabled{opacity:.25;cursor:default}.dw-yr svg{width:9px;height:9px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round}.dw-yr.set{box-shadow:inset 0 0 0 1px rgba(var(--k-horizon-rgb,63,224,232),.45)}'+
  '.dw-pan button:focus-visible{outline:1px solid var(--k-horizon,#3FE0E8);outline-offset:3px}'+
  '@media (prefers-reduced-motion:reduce){.dw,.dw *,.dw-ov,.dw-ov *{transition-duration:.01ms!important}}';
  var st=D.createElement('style'); st.textContent=css; (D.head||D.documentElement).appendChild(st);

  var ICAL='<svg class="dw-cal" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
      ICHEV='<svg class="dw-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5l3.5 3.5 3.5-3.5"/></svg>',
      IPREV='<svg viewBox="0 0 10 10"><path d="M6.5 2L3.5 5l3 3"/></svg>', INEXT='<svg viewBox="0 0 10 10"><path d="M3.5 2l3 3-3 3"/></svg>';
  var ease=function(t){ return 1-Math.pow(1-t,4); };

  /* ---------- one wheel: its own motion, so one notch is one step and every stop lands on an item ---------- */
  function Wheel(el,onSettle){
    var ul=el.querySelector('ul'), pos=0, n=0, raf=0, target=0, acc=0, lastStep=0, lastWheel=0, self=this;
    function render(){ ul.style.transform='translateY('+(-pos*IH).toFixed(2)+'px)';
      for(var k=0;k<ul.children.length;k++){ var li=ul.children[k], off=k-pos, a=Math.min(Math.abs(off),3), s=li.firstChild;
        s.style.transform=reduce?'':'rotateX('+(-off*17).toFixed(1)+'deg) scale('+(1-a*.055).toFixed(3)+')'; s.style.opacity=(1-a*.27).toFixed(3); li.classList.toggle('sel',Math.round(pos)===k); } }
    function go(t,dur,quiet){ t=Math.max(0,Math.min(n-1,Math.round(t))); target=t; cancelAnimationFrame(raf);
      if(reduce||!dur){ pos=t; render(); if(!quiet) onSettle(t); return; }
      var from=pos, t0=performance.now(); (function f(now){ var k=Math.min(1,(now-t0)/dur); pos=from+(t-from)*ease(k); render(); if(k<1) raf=requestAnimationFrame(f); else onSettle(t); })(t0); }
    self.set=function(items,i){ ul.innerHTML=items.map(function(x){ return '<li><span>'+x+'</span></li>'; }).join(''); n=items.length; go(i==null?Math.round(pos):i,0,true); };
    self.to=function(i,smooth){ go(i,smooth?520:0); };
    // a mouse notch is one item; a trackpad has to travel a little and wait a beat between items
    el.addEventListener('wheel',function(e){ e.preventDefault(); var now=performance.now(), big=Math.abs(e.deltaY)>=60||e.deltaMode; if(now-lastWheel>220) acc=0; lastWheel=now;
      acc+=e.deltaY*(e.deltaMode===1?33:e.deltaMode===2?400:1);
      if(Math.abs(acc)>=(big?1:44)&&now-lastStep>=(big?120:240)){ var dd=acc>0?1:-1; acc=0; lastStep=now; go(target+dd,460); } },{passive:false});
    // drag: follows 1:1, then glides at most two items and settles exactly
    var drag=null;
    el.addEventListener('pointerdown',function(e){ cancelAnimationFrame(raf); drag={y:e.clientY,p:pos,pts:[[e.clientY,e.timeStamp]],moved:false}; try{ el.setPointerCapture(e.pointerId); }catch(_){} });
    el.addEventListener('pointermove',function(e){ if(!drag) return; var dy=e.clientY-drag.y; if(Math.abs(dy)>3) drag.moved=true;
      var p=drag.p-dy/IH; if(p<0) p=p*.3; if(p>n-1) p=n-1+(p-(n-1))*.3; pos=p; render(); drag.pts.push([e.clientY,e.timeStamp]); if(drag.pts.length>6) drag.pts.shift(); });
    function end(e){ if(!drag) return; var d=drag; drag=null;
      if(!d.moved){ var li=e.target.closest&&e.target.closest('li'); go(li?[].indexOf.call(ul.children,li):Math.round(pos),520); return; }
      var a=d.pts[0], b=d.pts[d.pts.length-1], v=(b[1]-a[1])>0? -((b[0]-a[0])/(b[1]-a[1]))/IH : 0, t=Math.round(pos+Math.max(-2,Math.min(2,v*90)));
      go(t,Math.min(900,480+Math.abs(t-pos)*90)); }
    el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
    el.addEventListener('keydown',function(e){ var dd={ArrowDown:1,ArrowUp:-1,PageDown:5,PageUp:-5}[e.key]; if(dd){ e.preventDefault(); go(target+dd,420); } });
  }

  /* ---------- the window, one for the page ---------- */
  var ov, pan, cur=null, wheels=[], S=null, saved=null;
  function sheetMode(){ return W.matchMedia('(max-width:640px)').matches; }
  function build(){
    ov=D.createElement('div'); ov.className='dw-ov'; ov.innerHTML='<div class="dw-scrim"></div><div class="dw-pan" role="dialog" aria-modal="true"><div class="dw-grip"></div>'+
      '<div class="dw-wh"><div class="dw-band"></div><div class="dw-col n" style="--i:0" tabindex="0" aria-label="'+L.day+'"><ul></ul></div><i class="dw-sep"></i><div class="dw-col mo" style="--i:1" tabindex="0" aria-label="'+L.month+'"><ul></ul></div>'+
      '<i class="dw-sep dw-ts"></i><div class="dw-col tt dw-ts" style="--i:2" tabindex="0" aria-label="'+L.time+'"><ul></ul></div></div>'+
      '<div class="dw-acts"><button type="button" class="dw-ok">'+L.ok+'</button><button type="button" class="dw-lnk dw-today">'+L.today+'</button><button type="button" class="dw-lnk mute dw-clear">'+L.clear+'</button>'+
      '<span class="dw-when"><span class="dw-wd"></span><span class="dw-yr"><button type="button" class="dw-yp" aria-label="'+L.prev+'">'+IPREV+'</button><b></b><button type="button" class="dw-yn" aria-label="'+L.next+'">'+INEXT+'</button></span></span></div></div>';
    D.body.appendChild(ov); pan=ov.querySelector('.dw-pan');
    var cols=ov.querySelectorAll('.dw-col');
    wheels=[ new Wheel(cols[0],function(i){ S.d=i+1; live(); }),
             new Wheel(cols[1],function(i){ S.m=i; var k=dim(year(),S.m); if(S.d>k) S.d=k; wheels[0].set(days(),S.d-1); live(); }),
             new Wheel(cols[2],function(i){ S.t=TIMES[i]; live(); }) ];
    ov.querySelector('.dw-scrim').addEventListener('click',function(){ close(false); });
    ov.addEventListener('pointerdown',function(e){ if(e.target===ov) close(false); });
    ov.querySelector('.dw-ok').addEventListener('click',function(){ close(true); });
    ov.querySelector('.dw-today').addEventListener('click',function(){ var t=todayLocal(); S.y=null; S.m=t.m; S.d=t.d; wheels[1].to(S.m,true); wheels[0].set(days()); wheels[0].to(S.d-1,true); live(); });
    ov.querySelector('.dw-clear').addEventListener('click',function(){ S.clear=true; close(true); });
    ov.querySelector('.dw-yp').addEventListener('click',function(){ S.y=year()-1; wheels[0].set(days(),Math.min(S.d,dim(S.y,S.m))-1); live(); });
    ov.querySelector('.dw-yn').addEventListener('click',function(){ S.y=year()+1; wheels[0].set(days(),Math.min(S.d,dim(S.y,S.m))-1); live(); });
    pan.addEventListener('keydown',function(e){ if(e.key==='Escape'){ e.preventDefault(); close(false); } if(e.key==='Enter'&&e.target.classList.contains('dw-col')){ e.preventDefault(); close(true); } });
    W.addEventListener('resize',function(){ if(cur) place(); });
    W.addEventListener('scroll',function(){ if(cur&&!ov.classList.contains('sheet')) place(); },true);
  }
  // the year nobody picks: a future-only field takes the next time this day comes, otherwise the nearest one to today
  function year(){ if(S.y!=null) return S.y; var t=todayLocal(), today=new Date(t.y,t.m,t.d), best=t.y, bd=1e15;
    for(var y=t.y-1;y<=t.y+1;y++){ var x=new Date(y,S.m,Math.min(S.d,dim(y,S.m))); if(S.future&&x<today) continue; var dd=Math.abs(x-today); if(dd<bd){ bd=dd; best=y; } } return best; }
  function days(){ var a=[], k=dim(year(),S.m); for(var i=1;i<=k;i++) a.push(i); return a; }
  function live(){ var y=year(), yr=ov.querySelector('.dw-yr'); ov.querySelector('.dw-wd').textContent=WD.format(new Date(y,S.m,S.d)); yr.querySelector('b').textContent=y;
    yr.classList.toggle('set',S.y!=null); ov.querySelector('.dw-yp').disabled=y<=S.y0; ov.querySelector('.dw-yn').disabled=y>=S.y1; }
  function place(){ if(ov.classList.contains('sheet')) return; var r=cur.btn.getBoundingClientRect(), w=pan.offsetWidth, h=pan.offsetHeight, vw=innerWidth, vh=innerHeight,
      up=r.bottom+12+h>vh&&r.top-12-h>0, left=EN? r.left : r.right-w; left=Math.max(12,Math.min(vw-w-12,left));
    pan.classList.toggle('up',up); pan.style.left=left+'px'; pan.style.top=(up? r.top-12-h : r.bottom+12)+'px'; }
  function open(f){
    if(!ov) build(); if(cur) close(false); cur=f;
    var inp=f.inp, v=parse(inp.value), t=todayLocal(), withTime=f.time, min=parse(inp.min), max=parse(inp.max);
    var at=f.at&&inp.dataset.at? new Date(inp.dataset.at) : null;
    S={ y:v?v.y:null, m:v?v.m:t.m, d:v?v.d:t.d, t:30*Math.round(((v&&v.h!=null)?v.h*60+v.mi : at&&!isNaN(at)? at.getHours()*60+at.getMinutes() : 17*60)/30)%1440,
        future:!!(min&&new Date(min.y,min.m,min.d)>=new Date(t.y,t.m,t.d-1)), y0:min?min.y:t.y-6, y1:max?max.y:t.y+6, clear:false };
    if(S.y0>S.y1) S.y1=S.y0;
    saved=null; ov.querySelector('.dw-wh').classList.toggle('t3',withTime);
    [].forEach.call(ov.querySelectorAll('.dw-ts'),function(x){ x.hidden=!withTime; });
    ov.querySelector('.dw-clear').hidden=inp.required||!inp.value;
    wheels[1].set(MON,S.m); wheels[0].set(days(),S.d-1); if(withTime) wheels[2].set(TIMES.map(timeHtml),TIMES.indexOf(S.t)); live();
    var sh=sheetMode(); ov.classList.toggle('sheet',sh); pan.setAttribute('aria-label',(f.label||L.pick));
    place(); requestAnimationFrame(function(){ ov.classList.add('on'); });
    f.btn.setAttribute('aria-expanded','true'); setTimeout(function(){ var c=ov.querySelector('.dw-col'); if(c&&cur===f) c.focus({preventScroll:true}); },320);
  }
  function close(keep){
    if(!cur) return; var f=cur; cur=null; ov.classList.remove('on'); f.btn.setAttribute('aria-expanded','false');
    if(keep){ var inp=f.inp, val='', at='';
      if(!S.clear){ var y=year(), d=Math.min(S.d,dim(y,S.m)), date=ymd(y,S.m,d), min=inp.min, max=inp.max;
        if(min&&date<min.slice(0,10)) date=min.slice(0,10); if(max&&date>max.slice(0,10)) date=max.slice(0,10);
        var p=parse(date), hh=Math.floor(S.t/60), mm=S.t%60;
        if(inp.type==='datetime-local') val=date+'T'+pad(hh)+':'+pad(mm); else { val=date; if(f.at) at=new Date(p.y,p.m,p.d,hh,mm).toISOString(); } }
      setTimeout(function(){ f.btn.classList.add('blink'); setTimeout(function(){
        setVal(inp,val); if(f.at){ if(at){ inp.dataset.at=at; inp.dataset.tz=myTz(); } else { delete inp.dataset.at; delete inp.dataset.tz; } }
        face(f); f.btn.classList.remove('blink');
        inp.dispatchEvent(new Event('input',{bubbles:true})); inp.dispatchEvent(new Event('change',{bubbles:true})); },190); },reduce?0:280);
    }
    try{ f.btn.focus({preventScroll:true}); }catch(_){}
  }
  W.dwClose=function(){ close(false); };

  /* ---------- the field ---------- */
  var PROTO=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
  function setVal(inp,v){ PROTO.set.call(inp,v); }
  function face(f){ var inp=f.inp, v=parse(PROTO.get.call(inp)), html;
    if(!v){ html=ICAL+'<span class="dw-ph">'+(inp.getAttribute('placeholder')||L.pick)+'</span>'; }
    else { var dt=new Date(v.y,v.m,v.d), tm='';
      if(f.time){ var mins=null, lab='';
        if(inp.type==='datetime-local'&&v.h!=null){ mins=v.h*60+v.mi; }
        else if(f.at&&inp.dataset.at){ var a=new Date(inp.dataset.at); if(!isNaN(a)) mins=a.getHours()*60+a.getMinutes(); }
        if(mins!=null) tm='<span class="dw-tm"><b>'+timeHtml(mins)+'</b>'+(lab?'<small>'+lab+'</small>':'')+'</span>'; }
      html='<span class="dw-face"><span class="dw-day">'+v.d+'</span><i class="dw-vr"></i><span class="dw-mid"><span class="dw-mon">'+MON[v.m]+'</span><span class="dw-sub">'+WD.format(dt)+' <b>'+v.y+'</b></span></span>'+tm+'</span>'; }
    f.btn.innerHTML=(v?'':'')+html+ICHEV; f.btn.hidden=inp.hidden; f.btn.disabled=inp.disabled; }
  function enhance(inp){
    if(inp.dwDone||inp.hasAttribute('data-nowheel')) return; inp.dwDone=true;
    var f={ inp:inp, time:inp.type==='datetime-local'||inp.hasAttribute('data-time'), at:inp.type==='date'&&inp.hasAttribute('data-time') };
    var lab=inp.closest('label'); f.label=(inp.getAttribute('aria-label')||(lab?lab.textContent:'')||'').trim().slice(0,60);
    f.btn=D.createElement('button'); f.btn.type='button'; f.btn.className='dw'; f.btn.setAttribute('aria-haspopup','dialog'); f.btn.setAttribute('aria-expanded','false');
    if(f.label) f.btn.setAttribute('aria-label',f.label);
    inp.classList.add('dw-native'); inp.tabIndex=-1; inp.insertAdjacentElement('afterend',f.btn);
    // the code around keeps writing .value as before: the field follows it
    Object.defineProperty(inp,'value',{configurable:true,get:function(){ return PROTO.get.call(inp); },set:function(v){ PROTO.set.call(inp,v); face(f); }});
    new MutationObserver(function(){ face(f); }).observe(inp,{attributes:true,attributeFilter:['hidden','disabled','min','max','data-at']});
    inp.addEventListener('invalid',function(){ f.btn.style.boxShadow='inset 0 0 0 1px rgba(255,120,120,.7)'; setTimeout(function(){ f.btn.style.boxShadow=''; },2400); });
    f.btn.addEventListener('click',function(){ if(cur&&cur.inp===inp) close(false); else open(f); });
    face(f);
  }
  function scan(root){ if(!root.querySelectorAll) return; if(root.matches&&root.matches('input[type=date],input[type=datetime-local]')) enhance(root);
    [].forEach.call(root.querySelectorAll('input[type=date],input[type=datetime-local]'),enhance); }
  function boot(){ scan(D); new MutationObserver(function(ms){ ms.forEach(function(m){ [].forEach.call(m.addedNodes,function(n){ if(n.nodeType===1) scan(n); }); }); }).observe(D.body,{childList:true,subtree:true}); }
  if(D.readyState==='loading') D.addEventListener('DOMContentLoaded',boot); else boot();
})();
