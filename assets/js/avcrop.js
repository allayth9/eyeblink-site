/* The photo window: one circle to place and zoom a picture in, then a 512 px square (WebP, else JPEG) as a data URL.
   EBCrop(src, labels) → Promise<string|null>; src is a File/Blob or a same-origin image URL. Used by the account page and the panel. */
(function(){
  var CSS='.avc{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:16px;background:rgba(4,6,26,.72);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}'+
    '.avc-b{width:min(360px,100%);background:var(--k-card,#0B1236);color:var(--k-light,#EEF2F6);border-radius:24px;padding:18px;box-shadow:0 30px 80px rgba(0,0,0,.5),inset 0 0 0 1px rgba(238,242,246,.1);display:grid;gap:14px}'+
    '.avc-b h3{margin:0;font-size:17px;font-weight:600}'+
    '.avc-st{position:relative;width:100%;aspect-ratio:1;border-radius:16px;overflow:hidden;background:#000;touch-action:none;cursor:grab}'+
    '.avc-st.drag{cursor:grabbing}.avc-st canvas{width:100%;height:100%;display:block}'+
    '.avc-st i{position:absolute;inset:7%;border-radius:50%;box-shadow:0 0 0 999px rgba(4,6,26,.66);outline:2px solid var(--k-horizon,#3FE0E8);pointer-events:none}'+
    '.avc-z{display:flex;align-items:center;gap:10px;font-size:18px;color:var(--k-mist,#AEBBD2)}.avc-z input{flex:1;accent-color:var(--k-horizon,#3FE0E8)}'+
    '.avc-a{display:flex;gap:8px;flex-wrap:wrap}.avc-a button{flex:1;min-width:110px;border:0;border-radius:999px;padding:11px 16px;font:inherit;font-size:14px;cursor:pointer;color:var(--k-light,#EEF2F6);background:rgba(238,242,246,.08)}'+
    '.avc-a .go{background:var(--k-hour,#2E62FF)}.avc-a button:disabled{opacity:.6}.avc-a button:focus-visible{outline:2px solid var(--k-horizon,#3FE0E8);outline-offset:2px}';
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function load(src){ return new Promise(function(res,rej){ var url=typeof src==='string'?src:URL.createObjectURL(src), im=new Image();
    im.onload=function(){ res(im); }; im.onerror=rej; im.src=url; }); }
  window.EBCrop=function(src,L){ L=L||{};
    if(!document.getElementById('avc-css')){ var st=document.createElement('style'); st.id='avc-css'; st.textContent=CSS; document.head.appendChild(st); }
    return load(src).then(function(im){ return new Promise(function(done){
      var ov=document.createElement('div'); ov.className='avc'; ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true'); ov.setAttribute('aria-label',L.title||'');
      ov.innerHTML='<div class="avc-b"><h3>'+esc(L.title)+'</h3><div class="avc-st"><canvas width="560" height="560"></canvas><i></i></div>'+
        '<label class="avc-z"><span aria-hidden="true">−</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="'+esc(L.zoom)+'"><span aria-hidden="true">+</span></label>'+
        '<div class="avc-a"><button type="button" class="go">'+esc(L.save)+'</button><button type="button" class="no" data-avno>'+esc(L.cancel)+'</button></div></div>';
      document.body.appendChild(ov);
      var cv=ov.querySelector('canvas'), cx=cv.getContext('2d'), stg=ov.querySelector('.avc-st'), zr=ov.querySelector('input'), S=560, R=S*0.86;   // R: the circle's diameter on the canvas
      var base=Math.max(R/im.width,R/im.height), z=1, x=0, y=0;   // x, y: the picture's centre offset from the canvas centre
      var clamp=function(){ var w=im.width*base*z/2, h=im.height*base*z/2, m=R/2; x=Math.max(m-w,Math.min(w-m,x)); y=Math.max(m-h,Math.min(h-m,y)); };
      var paint=function(c,size){ var k=size/S, s=base*z*k; c.fillStyle='#fff'; c.fillRect(0,0,size,size); c.drawImage(im,size/2+x*k-im.width*s/2,size/2+y*k-im.height*s/2,im.width*s,im.height*s); };
      var draw=function(){ clamp(); cx.clearRect(0,0,S,S); paint(cx,S); }; draw();
      zr.oninput=function(){ z=+zr.value; draw(); };
      stg.addEventListener('wheel',function(e){ e.preventDefault(); z=Math.max(1,Math.min(4,z-e.deltaY*0.002)); zr.value=z; draw(); },{passive:false});
      var P={}, d0=0, z0=1;
      stg.onpointerdown=function(e){ stg.setPointerCapture(e.pointerId); P[e.pointerId]={x:e.clientX,y:e.clientY}; stg.classList.add('drag');
        var k=Object.keys(P); if(k.length===2){ d0=Math.hypot(P[k[0]].x-P[k[1]].x,P[k[0]].y-P[k[1]].y); z0=z; } };
      stg.onpointermove=function(e){ var p=P[e.pointerId]; if(!p) return; var k=Object.keys(P), sc=S/stg.clientWidth;
        if(k.length===2){ P[e.pointerId]={x:e.clientX,y:e.clientY}; var d=Math.hypot(P[k[0]].x-P[k[1]].x,P[k[0]].y-P[k[1]].y); if(d0){ z=Math.max(1,Math.min(4,z0*d/d0)); zr.value=z; draw(); } return; }
        x+=(e.clientX-p.x)*sc; y+=(e.clientY-p.y)*sc; P[e.pointerId]={x:e.clientX,y:e.clientY}; draw(); };
      stg.onpointerup=stg.onpointercancel=function(e){ delete P[e.pointerId]; if(!Object.keys(P).length) stg.classList.remove('drag'); d0=0; };
      var end=function(v){ ov.remove(); document.removeEventListener('keydown',key); done(v); };
      var key=function(e){ if(e.key==='Escape') end(null); }; document.addEventListener('keydown',key);
      ov.querySelector('[data-avno]').onclick=function(){ end(null); };
      ov.onclick=function(e){ if(e.target===ov) end(null); };
      ov.querySelector('.go').onclick=function(){
        // the circle on the canvas becomes the whole 512 px square
        var o=document.createElement('canvas'), N=512, f=N/R; o.width=o.height=N; var c=o.getContext('2d'); c.fillStyle='#fff'; c.fillRect(0,0,N,N);
        var s=base*z*f; c.drawImage(im,N/2+x*f-im.width*s/2,N/2+y*f-im.height*s/2,im.width*s,im.height*s);
        var u=o.toDataURL('image/webp',0.86); if(u.indexOf('data:image/webp')!==0) u=o.toDataURL('image/jpeg',0.88);
        end(u); };
      ov.querySelector('.go').focus();
    }); });
  };
})();
