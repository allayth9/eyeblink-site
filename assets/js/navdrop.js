/* Eyeblink — the menus' moving indicator (top bar on a computer, bottom dock on a phone).
   The current page sits on a quiet glass pill with a 1px metal edge (the same family as the top bar and the metal
   buttons). Pick another page and the pill stretches toward it and settles there (spring physics); then the usual
   blink takes you there. With «reduce motion» it stays still and pages open as before.
   14 Nov: the WebGL water drop was removed (its look read as a bubble, and its shader slowed the first paint);
   the motion is the same, drawn with one CSS element. */
(function(){
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches, DPR=Math.min(window.devicePixelRatio||1,2), PAD=14;
  var nav=document.querySelector('header.nav');

  function Drop(list,items,host,isOn){
    var css=document.createElement('span'); css.className='nav-drop'; css.setAttribute('aria-hidden','true');
    host.insertBefore(css,host.firstChild);
    host.classList.add('has-drop','drop-css');

    var S={a:{x:0,v:0},b:{x:0,v:0},sy:{s:1,v:0},lead:0,lagFrom:0,sats:[],rips:[],t:{x:0,cy:0,q:0,r:20},q:0,
      moving:false,split:false,ready:false,w:0,h:0,ox:0,oy:0,lo:0,hi:0,vis:true,raf:0,last:0,time:0,alpha:0,alphaT:0,cur:-1};

    // the drop sits on the item's name: centred on the text, a little wider than it, as tall as the item
    function box(el){ var er=el.getBoundingClientRect(), r=document.createRange(); r.selectNodeContents(el);
      var tr=r.getBoundingClientRect(); if(!tr.width) tr=er;
      var cx=(tr.left+tr.right)/2, w=Math.min(er.width,Math.max(tr.width+30,er.height));
      return {cx:cx,cy:(er.top+er.bottom)/2,w:w,h:er.height-4}; }
    function measure(target,jump){
      if(!isOn()){ css.style.display='none'; S.ready=false; return false; }
      css.style.display='';
      var lr=list.getBoundingClientRect(), hr=host.getBoundingClientRect();
      S.w=lr.width; S.h=lr.height; S.ox=lr.left-hr.left; S.oy=lr.top-hr.top;
      var el=items[target]; if(!el) return true;
      var B=box(el), T=S.t;
      T.r=B.h/2; T.q=Math.max(0,B.w/2-T.r); T.cy=PAD+B.cy-lr.top;
      var nx=PAD+B.cx-lr.left;
      S.lo=PAD+2; S.hi=PAD+S.w-2;
      if(!S.ready||!jump){ S.a.x=S.b.x=nx; S.a.v=S.b.v=0; S.q=T.q; S.ready=true; }
      else if(Math.abs(nx-T.x)>.5){ S.lead=Math.abs(nx-S.a.x)<=Math.abs(nx-S.b.x)?0:1; S.lagFrom=performance.now()+70; S.moving=true; S.split=false; }
      T.x=nx; css.style.height=B.h+'px'; css.style.top=(S.oy+B.cy-lr.top-B.h/2)+'px';
      return true;
    }
    function step(dt,now){
      var T=S.t; S.time+=dt; S.q+=(T.q-S.q)*Math.min(1,dt*12); S.alpha+=(S.alphaT-S.alpha)*Math.min(1,dt*9);
      var bodies=[S.a,S.b], still=true;
      bodies.forEach(function(B,i){ var lead=i===S.lead, k=lead?210:72, c=lead?25:13, f=!lead&&now<S.lagFrom?.08:1;
        B.v+=(k*(T.x-B.x)-c*B.v)*dt*f; B.x+=B.v*dt;
        var lo=S.lo+S.q+T.r-3, hi=S.hi-S.q-T.r+3;
        if(B.x<lo||B.x>hi){ S.sy.v-=Math.min(Math.abs(B.v),900)*.0016; B.x=Math.max(lo,Math.min(hi,B.x)); B.v*=-.25; }
        if(Math.abs(T.x-B.x)>.3||Math.abs(B.v)>3) still=false; });
      var Ld=bodies[S.lead], syT=1-.2*Math.min(Math.abs(Ld.v)/1500,1);
      S.sy.v+=(280*(syT-S.sy.s)-9*S.sy.v)*dt; S.sy.s+=S.sy.v*dt;
      if(Math.abs(S.sy.s-1)>.002||Math.abs(S.sy.v)>.02) still=false;
      var sep=Math.abs(S.a.x-S.b.x), r=T.r*(1-.3*Math.min(sep/(2*(T.q+T.r)||1),1));
      if(!S.split&&S.moving&&sep-2*T.q-2*r>-6){ S.split=true; var lo2=bodies[1-S.lead], hi2=bodies[S.lead];
        [.3,.5,.72].forEach(function(t,j){ S.sats.push({x:lo2.x+(hi2.x-lo2.x)*t+(Math.random()-.5)*6,y:T.cy+(Math.random()-.5)*10,vx:(lo2.v+hi2.v)*.45,vy:(Math.random()-.5)*60,r:5+Math.random()*3-j*.5,k:70+Math.random()*90}); }); }
      S.sats=S.sats.filter(function(d){ d.vx+=(d.k*(T.x-d.x)-9*d.vx)*dt; d.vy+=(90*(T.cy-d.y)-7*d.vy)*dt; d.x+=d.vx*dt; d.y+=d.vy*dt;
        d.x=Math.max(S.lo+6+d.r,Math.min(S.hi-6-d.r,d.x)); d.y=Math.max(T.cy-T.r+d.r,Math.min(T.cy+T.r-d.r,d.y));
        if(Math.abs(T.x-d.x)<T.q+T.r*.5) d.r-=dt*26; return d.r>.6; });
      if(S.sats.length) still=false;
      if(S.moving&&still){ S.moving=false; S.rips.push({x:T.x,y:T.cy,age:0,amp:S.split?1.2:.7}); }
      S.rips.forEach(function(p){ p.age+=dt; }); S.rips=S.rips.filter(function(p){ return p.age<2.4; });
      return still&&!S.rips.length&&Math.abs(S.alpha-S.alphaT)<.01;
    }
    function draw(){
      var T=S.t, sep=Math.abs(S.a.x-S.b.x), thin=Math.min(sep/(2*(S.q+T.r)||1),1), r=T.r*(1-.3*thin);
      var left=Math.min(S.a.x,S.b.x)-S.q-r-PAD+S.ox, width=sep+2*(S.q+r);
      css.style.width=width+'px'; css.style.opacity=S.alpha; css.style.transform='translateX('+left+'px) scaleY('+S.sy.s+')';
    }
    function loop(){ if(S.raf||!S.ready) return; S.last=performance.now();
      var tick=function(now){ var dt=Math.min((now-S.last)/1000,1/30); S.last=now; var rest=reduce?true:step(dt,now); if(reduce) S.alpha=S.alphaT; draw();
        if(S.vis&&!rest) S.raf=requestAnimationFrame(tick); else S.raf=0; };
      S.raf=requestAnimationFrame(tick); }

    S.cur=items.findIndex(function(a){ return a.getAttribute('aria-current')==='page'; });
    function place(){ if(measure(S.cur<0?0:S.cur,false)){ S.alphaT=S.alpha=S.cur<0?0:1; S.moving=false; S.sats=[]; S.rips=[]; S.sy={s:1,v:0}; draw(); } }
    if(document.fonts&&document.fonts.ready) document.fonts.ready.then(place); place();
    addEventListener('resize',function(){ S.ready=false; place(); });
    if('ResizeObserver' in window){ var lw=-1; new ResizeObserver(function(){ var w=list.offsetWidth; if(w!==lw){ lw=w; S.ready=false; place(); } }).observe(list); }
    new IntersectionObserver(function(e){ S.vis=e[0].isIntersecting; if(S.vis) loop(); }).observe(host);
    document.addEventListener('visibilitychange',function(){ S.vis=!document.hidden; if(S.vis) loop(); });

    // the move: the drop travels to the picked page, then the usual blink (site.js) takes you there
    items.forEach(function(a,i){
      a.addEventListener('click',function(ev){
        if(a._go||ev.defaultPrevented||ev.button!==0||ev.metaKey||ev.ctrlKey||ev.shiftKey||ev.altKey) return;
        if(reduce||!isOn()||i===S.cur) return;
        ev.preventDefault(); ev.stopPropagation();
        var lr=list.getBoundingClientRect(); S.rips.push({x:ev.clientX-lr.left+PAD,y:ev.clientY-lr.top+PAD,age:0,amp:.8});
        if(S.cur<0){ measure(i,false); S.alphaT=1; S.alpha=0; } else measure(i,true);
        S.cur=i; items.forEach(function(x){ x.removeAttribute('aria-current'); }); a.setAttribute('aria-current','page');
        loop(); setTimeout(function(){ a._go=true; a.click(); a._go=false; },460);
      });
    });
  }

  // the top bar: computer only (on a phone its links become a list)
  var links=document.getElementById('links'), bar=links&&links.closest('.bar');
  if(links&&bar) Drop(links,[].slice.call(links.querySelectorAll(':scope>li>a')),bar,function(){
    return links.offsetParent!==null&&!(nav&&nav.classList.contains('open'))&&getComputedStyle(links).flexDirection.indexOf('row')===0; });
  // the bottom dock: phone only
  var dock=document.querySelector('nav.dock');
  if(dock) Drop(dock,[].slice.call(dock.querySelectorAll(':scope>a')),dock,function(){ return getComputedStyle(dock).display!=='none'; });
})();
