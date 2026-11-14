/* The phone's back button closes what is open on top (a window, a sheet, a menu, a lightbox) instead of leaving the page.
   When something opens, one step is added to the browser's history; «back» takes that step and closes it. When it is
   closed another way (×, Esc, a tap outside), the step is taken back quietly, so the history stays as it was.
   Loaded before the site's and the panel's own scripts, so it hears «back» first. */
(function(){
  if(!window.history||!history.pushState) return;
  var W=window, phone=function(){ return matchMedia('(max-width:1000px)').matches; };
  var click=function(sel){ return function(el){ var b=el.querySelector(sel)||document.querySelector(sel); if(b) b.click(); }; };
  var esc=function(){ document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); };
  // topmost first: [is it open?, how to close it]
  var OV=[
    // the panel
    [function(){ return document.querySelector('.cfm-ov'); }, click('[data-cfno]')],
    [function(){ return document.getElementById('cmdk'); }, function(el){ el.remove(); }],
    [function(){ return document.getElementById('dsheet'); }, function(){ if(W.closeDoc){ W.DED=null; W.closeDoc(); } }],
    [function(){ return document.getElementById('tsheet'); }, function(){ if(W.closeT) W.closeT(); }],
    [function(){ return document.querySelector('details.cp-more[open]'); }, function(el){ el.removeAttribute('open'); }],
    [function(){ return W.NAVO&&document.getElementById('app'); }, function(){ if(W.navOpen) W.navOpen(false); }],
    // a list's item opened full screen on a phone (lists without their own address: requests, the site's content)
    [function(){ return phone()&&(document.querySelector('.rsplit.has-open')||(W.TAB==='orders'&&document.querySelector('#panel .osplit.has-open'))); }, click('.oback')],
    // the site and the client's workspace
    [function(){ return document.querySelector('.lb-view.on'); }, click('.close')],
    [function(){ var l=document.getElementById('lb'); return l&&!l.hidden&&l; }, click('#lbClose')],
    [function(){ var o=document.getElementById('olb'); return o&&!o.hidden&&o; }, click('#olbClose')],
    [function(){ var m=document.querySelectorAll('.acct-modal.show'); return m[m.length-1]; }, click('.x')],
    [function(){ return document.querySelector('.sup:not([hidden])'); }, click('.sup-x')],
    [function(){ return document.querySelector('.wsheet-ov.show'); }, click('.wsheet-x')],
    [function(){ return document.querySelector('.hmenu.show,.hpanel.show,.wnav-x.open'); }, esc],
    [function(){ return document.querySelector('header.nav.open'); }, click('#menuBtn')]
  ];
  function top(){ for(var i=0;i<OV.length;i++){ var el=OV[i][0](); if(el) return [el,OV[i][1]]; } return null; }
  var pushed=null, skip=0, tick=0, leaving=0;
  // a link to another page, tapped from inside a menu: its closing must not step back over the navigation
  document.addEventListener('click',function(e){ var a=e.target.closest&&e.target.closest('a[href]'); if(!a||a.target==='_blank') return;
    try{ var u=new URL(a.href,location.href); if(u.origin!==location.origin||u.pathname!==location.pathname||u.search!==location.search) leaving=Date.now(); }catch(_){} },true);
  addEventListener('pagehide',function(){ leaving=Date.now(); });
  function check(){ tick=0; var t=top();
    if(t&&!pushed){ pushed='ov'+Date.now(); history.pushState({ebov:pushed},'',location.href); }
    else if(!t&&pushed){ var mine=history.state&&history.state.ebov===pushed; pushed=null; if(mine&&Date.now()-leaving>1500){ skip++; history.back(); } } }
  new MutationObserver(function(){ if(!tick) tick=requestAnimationFrame(check); })
    .observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','open']});
  addEventListener('popstate',function(e){
    if(skip>0){ skip--; e.stopImmediatePropagation(); return; }   // our own quiet step back
    if(!pushed) return;                                            // nothing open: the page's own «back»
    pushed=null; e.stopImmediatePropagation(); var t=top(); if(t) t[1](t[0]);
  },true);
})();
