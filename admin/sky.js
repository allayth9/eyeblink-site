/* Eyeblink admin · the sky behind the glass: a ribbon of light drifting across the middle of the screen, woven from fine
   threads that bend between two brighter edges, in the brand gradient (navy → royal blue → cyan at its heart).
   The edges cross now and then, so the ribbon turns over on itself like cloth; a soft glow (drawn small, then scaled
   up, which blurs it for free) gives it body. One canvas, ~30 frames a second, paused when the tab is hidden,
   a single still frame for «reduce motion». The glass above blurs it. */
(function(){
  var cv=document.createElement('canvas'); cv.id='sky'; cv.setAttribute('aria-hidden','true');
  document.body.insertBefore(cv,document.body.firstChild);
  var cx=cv.getContext('2d'), gl=document.createElement('canvas'), gx=gl.getContext('2d'), GS=8;   // the glow layer: 1/8 size
  var W=0, H=0, R=1, T=Math.random()*1000, last=0, still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var N=64, STEP=12;   // threads in the ribbon, horizontal step in css px
  function size(){ R=Math.min(window.devicePixelRatio||1,1.5); W=innerWidth; H=innerHeight; cv.width=Math.round(W*R); cv.height=Math.round(H*R); cx.setTransform(R,0,0,R,0,0);
    gl.width=Math.ceil(W/GS); gl.height=Math.ceil(H/GS); gx.setTransform(1/GS,0,0,1/GS,0,0); }
  // the two edges of the ribbon: slow sums of sines, so the shape never quite repeats
  function edge(x,t,s){ var u=x/W;
    return Math.sin(u*4.6+t*0.55+s*2.1)*0.55+Math.sin(u*2.1-t*0.37+s*4.7)*0.33+Math.sin(u*8.9+t*0.83+s)*0.12; }
  var DARK=['14,26,92','28,69,230','47,196,216','28,69,230','14,26,92'], LIGHT=['28,69,230','28,69,230','42,134,230','28,69,230','28,69,230'];
  function grad(c,ctx,a){ var g=ctx.createLinearGradient(0,0,W,0);
    [0,.26,.5,.74,1].forEach(function(p,i){ g.addColorStop(p,'rgba('+c[i]+','+(i===0||i===4?0:a)+')'); }); return g; }
  function path(ctx,f){ ctx.beginPath(); for(var x=-STEP;x<=W+STEP;x+=STEP){ var y=f(x); if(x<0) ctx.moveTo(x,y); else ctx.lineTo(x,y); } }
  function draw(t){
    var light=document.documentElement.dataset.theme==='light', C=light?LIGHT:DARK, mid=H*0.55, amp=Math.max(70,H*0.13), gap=amp*0.55;
    var A=function(x){ return mid+amp*edge(x,t,0)-gap; }, B=function(x){ return mid+amp*edge(x,t*0.83,1.7)+gap; };
    // the body of light: the area between the edges, filled on the small layer and stretched back up
    gx.clearRect(0,0,W,H); gx.globalCompositeOperation='source-over';
    gx.beginPath(); for(var x=-STEP;x<=W+STEP;x+=STEP) gx.lineTo(x,A(x)); for(x=W+STEP;x>=-STEP;x-=STEP) gx.lineTo(x,B(x)); gx.closePath();
    gx.fillStyle=grad(C,gx,light?.16:.42); gx.fill();
    gx.lineWidth=amp*0.5; gx.strokeStyle=grad(C,gx,light?.08:.24); path(gx,A); gx.stroke(); path(gx,B); gx.stroke();
    cx.clearRect(0,0,W,H); cx.globalCompositeOperation=light?'source-over':'lighter'; cx.lineCap='round';
    cx.imageSmoothingEnabled=true; cx.drawImage(gl,0,0,gl.width,gl.height,0,0,gl.width*GS,gl.height*GS);
    // the threads: each one a blend between the two edges, with a little drift of its own
    cx.strokeStyle=grad(C,cx,light?.2:.3); cx.lineWidth=0.75;
    for(var k=0;k<=N;k++){ var m=k/N, w=Math.sin(m*Math.PI);
      path(cx,function(x){ return A(x)*(1-m)+B(x)*m+Math.sin(x/W*7+t*0.7+k*0.31)*amp*0.06*w; }); cx.stroke(); }
    // the two bright edges, each with a soft halo
    [A,B].forEach(function(f,i){ [[10,light?.1:.16],[3,light?.35:.5],[1.3,light?.7:1]].forEach(function(s){
      cx.strokeStyle=grad(C,cx,s[1]*(i?0.85:1)); cx.lineWidth=s[0]; path(cx,f); cx.stroke(); }); });
  }
  function frame(now){ if(!document.hidden&&now-last>33){ T+=Math.min(now-last,100)/1000*0.2; last=now; draw(T); } requestAnimationFrame(frame); }
  size(); draw(T);
  addEventListener('resize',function(){ size(); draw(T); });
  new MutationObserver(function(){ draw(T); }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  if(!still) requestAnimationFrame(function(n){ last=n; requestAnimationFrame(frame); });
})();
