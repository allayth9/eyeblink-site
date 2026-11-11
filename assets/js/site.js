/* Eyeblink — interaction layer.
   - Only the large hero eye is alive (gentle magnet + blinks). Every other mark is still.
   - Liquid glass reacts as the pointer approaches (Apple / Siri-like light), with one water-drop ripple on entry.
   - Elements appear and disappear with the scroll, scrubbed to its position.
   - Every move between pages is a blink. */
(function(){
  var root=document.documentElement;
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine=matchMedia('(pointer: fine)').matches;
  var lids=document.querySelector('.cut-lids');
  var px=-9999, py=-9999, lastMove=0;
  addEventListener('pointermove',function(e){ px=e.clientX; py=e.clientY; lastMove=performance.now(); },{passive:true});

  /* ---------- arriving through a cut ---------- */
  if(root.classList.contains('arriving')){
    lids.classList.add('opening'); requestAnimationFrame(function(){ root.classList.remove('arriving'); });
    setTimeout(function(){ lids.classList.remove('opening'); },700);
  }
  addEventListener('pageshow',function(e){ if(e.persisted){ lids.classList.remove('shut'); root.classList.remove('arriving'); } });

  /* ---------- the hero eye (the only living mark) ---------- */
  var hero=document.querySelector('.orb .eb-mark');
  var orb=document.querySelector('.orb.opening');
  if(orb) setTimeout(function(){ orb.classList.remove('opening'); },2000);
  function blink(){ if(reduce||!hero) return; hero.classList.remove('blink'); void hero.getBoundingClientRect(); hero.classList.add('blink'); clearTimeout(hero._bt); hero._bt=setTimeout(function(){hero.classList.remove('blink')},460); }
  if(hero){
    (function idle(){ setTimeout(function(){ if(!document.hidden){ blink(); if(Math.random()<.22) setTimeout(blink,520); } idle(); },3200+Math.random()*3800); })();
    hero.closest('.orb').addEventListener('mouseenter',blink);
    var look=hero.querySelector('.look'), top=hero.querySelector('.lid-top'), bot=hero.querySelector('.lid-bot');
    var e={x:0,y:0,vx:0,vy:0,o:0}, K=0.5;                         // K: magnet strength (half of the earlier version)
    var eyeLoop=function(t){
      var r=hero.getBoundingClientRect();
      if(r.bottom>-50 && r.top<innerHeight+50){
        var cx=r.left+r.width/2, cy=r.top+r.height/2, tx, ty, near=0;
        if(!fine || performance.now()-lastMove>3000){ tx=Math.sin(t/2100)*28; ty=Math.cos(t/2900)*9; }
        else{
          var dx=px-cx, dy=py-cy, dist=Math.hypot(dx,dy)||1, pull=Math.min(1,dist/Math.max(r.width*1.6,520));
          tx=Math.max(-55,Math.min(55,dx/dist*pull*120*K));
          ty=Math.max(-17,Math.min(17,dy/dist*pull*60*K));
          near=Math.max(0,1-dist/(r.width*0.7));
        }
        e.vx=(e.vx+(tx-e.x)*0.07)*0.82; e.vy=(e.vy+(ty-e.y)*0.07)*0.82;       // soft spring, little overshoot
        e.x+=e.vx; e.y+=e.vy; e.o+=(near-e.o)*0.08;
        look.style.transform='translate('+e.x.toFixed(2)+'px,'+e.y.toFixed(2)+'px)';
        top.style.transform='translate('+(e.x*0.08).toFixed(2)+'px,'+(e.y*0.2-e.o*14).toFixed(2)+'px)';
        bot.style.transform='translate('+(e.x*0.08).toFixed(2)+'px,'+(e.y*0.2+e.o*14).toFixed(2)+'px)';
      }
      requestAnimationFrame(eyeLoop);
    };
    if(!reduce) requestAnimationFrame(eyeLoop);
  }

  /* ---------- the cut between pages ---------- */
  document.addEventListener('click',function(ev){
    if(ev.defaultPrevented||ev.button!==0||ev.metaKey||ev.ctrlKey||ev.shiftKey||ev.altKey) return;
    var a=ev.target.closest('a[href]'); if(!a||a.target==='_blank') return;
    var href=a.getAttribute('href');
    if(href.charAt(0)==='#'){
      var t=href.length>1?document.getElementById(href.slice(1)):null; if(!t) return;
      ev.preventDefault(); closeMenu();
      if(reduce){ t.scrollIntoView(); return; }
      lids.classList.add('shut'); blink();
      setTimeout(function(){ t.scrollIntoView({block:'start'}); setTimeout(function(){ lids.classList.add('opening'); lids.classList.remove('shut'); setTimeout(function(){lids.classList.remove('opening')},600); },60); },260);
      return;
    }
    var u; try{ u=new URL(a.href,location.href); }catch(_){ return; }
    if(u.origin!==location.origin || /\/admin\//.test(u.pathname)) return;
    ev.preventDefault(); closeMenu();
    if(reduce){ location.href=u.href; return; }
    try{ sessionStorage.setItem('eb-cut','1'); }catch(_){}
    lids.classList.add('shut'); blink();
    setTimeout(function(){ location.href=u.href; },300);
  });

  /* ---------- menu ---------- */
  var nav=document.querySelector('header.nav'), mb=document.getElementById('menuBtn');
  function closeMenu(){ if(nav){ nav.classList.remove('open'); mb&&mb.setAttribute('aria-expanded','false'); } }
  mb&&mb.addEventListener('click',function(){ var o=nav.classList.toggle('open'); mb.setAttribute('aria-expanded',o?'true':'false'); });

  /* ---------- liquid glass: light that leans toward you, a drop on entry ---------- */
  var glasses=[];
  function ripple(g,x,y){
    if(reduce||!fine) return;   // touch screens: no drop ripple (a plain pressed state is enough)
    var wrap=g.querySelector(':scope > .ripple-wrap');
    if(!wrap){ wrap=document.createElement('span'); wrap.className='ripple-wrap'; wrap.setAttribute('aria-hidden','true'); g.appendChild(wrap); }
    var r=g.getBoundingClientRect(), d=document.createElement('i');
    var size=Math.max(r.width,r.height)*1.15;
    d.style.cssText='left:'+(x-r.left)+'px;top:'+(y-r.top)+'px;width:'+size+'px;height:'+size+'px;margin:'+(-size/2)+'px 0 0 '+(-size/2)+'px';
    wrap.appendChild(d); setTimeout(function(){ d.remove(); },1300);
  }
  function bindGlass(g){
    if(g._g) return; g._g=1; glasses.push(g);
    g.addEventListener('pointerenter',function(ev){ ripple(g,ev.clientX,ev.clientY); });
  }
  if(fine && !reduce){
    (function prox(){
      var moving=performance.now()-lastMove<1200;
      if(moving){
        for(var i=0;i<glasses.length;i++){
          var g=glasses[i], r=g.getBoundingClientRect();
          if(r.bottom<0||r.top>innerHeight){ continue; }
          var dx=Math.max(r.left-px,0,px-r.right), dy=Math.max(r.top-py,0,py-r.bottom), d=Math.hypot(dx,dy);
          var near=Math.max(0,1-d/160);
          if(near>0||g._near>0){
            g.style.setProperty('--near',near.toFixed(3));
            g.style.setProperty('--mx',(px-r.left).toFixed(0)+'px'); g.style.setProperty('--my',(py-r.top).toFixed(0)+'px');
            g.style.setProperty('--ang',(Math.atan2(py-(r.top+r.height/2),px-(r.left+r.width/2))*180/Math.PI+90).toFixed(1)+'deg');
            g._near=near;
          }
        }
      }
      requestAnimationFrame(prox);
    })();
  }

  /* ---------- tilt (cards) ---------- */
  function tilt(c){
    if(!fine||reduce||c._tilt) return; c._tilt=1;
    c.addEventListener('pointermove',function(ev){ var r=c.getBoundingClientRect(),nx=(ev.clientX-r.left)/r.width-.5,ny=(ev.clientY-r.top)/r.height-.5;
      c.style.setProperty('--tx',(-ny*4).toFixed(2)+'deg'); c.style.setProperty('--ty',(nx*5).toFixed(2)+'deg'); c.classList.add('tilting'); });
    c.addEventListener('pointerleave',function(){ c.classList.remove('tilting'); c.style.removeProperty('--tx'); c.style.removeProperty('--ty'); });
  }

  /* ---------- scroll: progress, header, timeline, and eased appear / disappear ---------- */
  var prog=document.querySelector('.progress'), tl=document.getElementById('tl'), stage=document.querySelector('.stage');
  var items=[];
  function collect(){
    items=[].slice.call(document.querySelectorAll('.rv')).map(function(el){
      var sib=[].slice.call(el.parentNode.children).filter(function(c){return c.classList.contains('rv')});
      var old=el._rv; return el._rv={el:el, i:innerWidth<=860?0:Math.min(sib.indexOf(el),5), v:old?old.v:-1, t:0};
    });
  }
  function clamp(v){ return v<0?0:v>1?1:v; }
  var STILL=!fine;          // phones and tablets: things are simply there — no scroll-scrubbed motion, no lag
  function targets(){
    var H=innerHeight;
    if(STILL){ for(var q=0;q<items.length;q++){ var s=items[q]; s.enter=s.exit=s.t=1; } return; }
    for(var k=0;k<items.length;k++){
      var it=items[k], r=it.el.getBoundingClientRect();
      // near the end of the page there is not enough scroll left to lift an element 42% up the screen: it finishes by the last pixel instead
      var left=Math.max(0,document.documentElement.scrollHeight-H-(window.pageYOffset||0)), span=Math.max(40,Math.min(H*0.42,(H-(r.top-left))/(1+it.i*0.1)));
      var enter=clamp((H - r.top)/span - it.i*0.1);           // rises in over the lower 40% of the screen, staggered in a row
      var exit=clamp(r.bottom/(H*0.32));                          // fades back out as it leaves at the top
      it.enter=enter; it.exit=exit; it.t=Math.min(enter,exit);
    }
  }
  var animating=false;
  function paint(){
    animating=false; var busy=false;
    for(var k=0;k<items.length;k++){
      var it=items[k];
      if(it.v<0) it.v=it.t;                                       // first frame: no jump
      var d=it.t-it.v; if(Math.abs(d)>0.0015){ it.v+=d*0.12; busy=true; } else it.v=it.t;   // ease toward the scroll position
      var v=it.v, e=1-Math.pow(1-v,3), enterSide=it.enter<=it.exit;
      var ty= enterSide? (1-e)*120 : -(1-e)*60;
      var el=it.el.style;
      // fully in view: drop the transform so text is painted crisp at native resolution
      var done=e>0.997; if(done!==it.done){ it.done=done; it.el.classList.toggle('settled',done); }
      if(done) continue;
      el.setProperty('--rv-o',(e).toFixed(3));
      el.setProperty('--rv-y',ty.toFixed(1)+'px');
      el.setProperty('--rv-r',(enterSide?(1-e)*16:-(1-e)*8).toFixed(2)+'deg');
      el.setProperty('--rv-s',(0.86+0.14*e).toFixed(4));
      el.setProperty('--rv-c',((1-e)*100).toFixed(1)+'%');
    }
    if(busy) kick();
  }
  function kick(){ if(!animating){ animating=true; requestAnimationFrame(paint); } }

  var nav2=document.querySelector('header.nav'), ticking=false, lastY=scrollY, rail=document.querySelector('.rail');
  if(nav2 && scrollY>70) nav2.classList.add('compact');
  function onScroll(){
    ticking=false;
    var y=scrollY, H=innerHeight, h=root.scrollHeight-H;
    // header: compacts after 70px going down; starts growing back from 180px going up
    if(nav2){ var dir=y-lastY; if(dir>0 && y>70) nav2.classList.add('compact'); else if(dir<0 && y<180) nav2.classList.remove('compact'); else if(y<8) nav2.classList.remove('compact'); }
    lastY=y;
    // quiet position marker beside the browser scrollbar, visible only while scrolling
    if(rail){ rail.style.setProperty('--p',(h>0?y/h:0).toFixed(4)); if(!rail.classList.contains('on')){ rail.classList.remove('pulse'); void rail.offsetWidth; rail.classList.add('pulse'); } rail.classList.add('on'); clearTimeout(rail._t); rail._t=setTimeout(function(){rail.classList.remove('on')},700); }
    if(stage&&!reduce) stage.style.transform='translateY('+(y*0.08).toFixed(1)+'px)';
    if(tl){ var pr=tl.parentNode.getBoundingClientRect(), p=clamp((H*0.75-pr.top)/(pr.height*0.75));
      tl.style.setProperty('--p',p.toFixed(3));
      [].forEach.call(document.querySelectorAll('.step'),function(st,i,all){ st.classList.toggle('lit',p>=(i+0.5)/all.length); }); }
    if(reduce) return;
    targets(); kick();
  }
  addEventListener('scroll',function(){ if(!ticking){ticking=true;requestAnimationFrame(onScroll);} },{passive:true});
  addEventListener('resize',function(){ requestAnimationFrame(onScroll); });

  /* ---------- hooks for render.js ---------- */
  window.EB=window.EB||{};
  EB.refresh=function(){
    [].forEach.call(document.querySelectorAll('.glass'),bindGlass);
    [].forEach.call(document.querySelectorAll('.card,.slot,.step,.principle,.brief li,.proj,.pkg,.stat,.deliver li'),tilt);
    collect(); onScroll(); if(!reduce){ targets(); kick(); }
  };
  EB.blink=blink;
  EB.refresh();
})();
