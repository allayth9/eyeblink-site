/* Eyeblink admin · the sky behind the glass (after Laith's reference): a soft band of light across the middle of the
   screen, made of three wavy ribbons laid over each other inside a haze, the middle one textured with fine dotted
   threads; bright where they overlap, fading into the dark at both ends. Colours: the brand gradient (navy at the
   edges → royal blue → cyan at the heart). The soft body is drawn small and stretched back up, which blurs it for free.
   One canvas, ~30 frames a second, paused when the tab is hidden, a still frame for «reduce motion». */
(function(){
  var cv=document.createElement('canvas'); cv.id='sky'; cv.setAttribute('aria-hidden','true');
  document.body.insertBefore(cv,document.body.firstChild);
  var cx=cv.getContext('2d'), gl=document.createElement('canvas'), gx=gl.getContext('2d'), GS=8;
  // the soft body is enlarged in steps (1/8 → 1/4 → 1/2 → full): smooth light instead of blocks
  var g4=document.createElement('canvas'), x4=g4.getContext('2d'), g2=document.createElement('canvas'), x2=g2.getContext('2d');
  var W=0, H=0, R=1, T=Math.random()*1000, last=0, still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STEP=12, TAU=Math.PI*2;
  function size(){ R=Math.min(window.devicePixelRatio||1,2); W=innerWidth; H=innerHeight; cv.width=Math.round(W*R); cv.height=Math.round(H*R); cx.setTransform(R,0,0,R,0,0);
    gl.width=Math.ceil(W/GS); gl.height=Math.ceil(H/GS); gx.setTransform(1/GS,0,0,1/GS,0,0);
    g4.width=gl.width*2; g4.height=gl.height*2; g2.width=gl.width*4; g2.height=gl.height*4;
    [x4,x2,cx].forEach(function(c){ c.imageSmoothingEnabled=true; c.imageSmoothingQuality='high'; }); }
  var DARK=['14,26,92','28,69,230','47,196,216','28,69,230','14,26,92'], LIGHT=['28,69,230','28,69,230','42,134,230','28,69,230','28,69,230'];
  function grad(c,ctx,a){ var g=ctx.createLinearGradient(0,0,W,0);
    [0,.24,.5,.76,1].forEach(function(p,i){ g.addColorStop(p,'rgba('+c[i]+','+(i===0||i===4?0:a)+')'); }); return g; }
  function path(ctx,f){ ctx.beginPath(); for(var x=-STEP;x<=W+STEP;x+=STEP){ var y=f(x); if(x<0) ctx.moveTo(x,y); else ctx.lineTo(x,y); } }
  // three ribbons: a centre line and a thickness each; the band swells in the middle and thins toward both ends
  function env(u){ return 0.42+0.58*Math.sin(Math.PI*Math.min(1,Math.max(0,u))); }
  var SHEETS=[
    {off:-0.28, c:function(u,t){ return 0.36*Math.sin(TAU*u*1.05+t*0.5)+0.14*Math.sin(TAU*u*2.3-t*0.33); }, th:0.30, ph:0},
    {off:0.02,  c:function(u,t){ return 0.44*Math.sin(TAU*u*0.82+2+t*0.4)+0.12*Math.sin(TAU*u*2.7+t*0.6); }, th:0.42, ph:1.3},
    {off:0.3,   c:function(u,t){ return 0.30*Math.sin(TAU*u*1.3+4-t*0.45)+0.12*Math.sin(TAU*u*3.1+1-t*0.5); }, th:0.26, ph:2.6}];
  function draw(t){
    var light=document.documentElement.dataset.theme==='light', C=light?LIGHT:DARK, mid=H*0.52, amp=Math.max(80,H*0.2);
    var edges=SHEETS.map(function(s){
      var c=function(x){ var u=x/W; return mid+env(u)*amp*(s.off+s.c(u,t)); }, th=function(x){ var u=x/W; return env(u)*amp*s.th*(0.62+0.38*Math.sin(TAU*u*1.6+s.ph+t*0.3)); };
      return [function(x){ return c(x)-th(x); }, function(x){ return c(x)+th(x); }]; });
    // the haze and the soft body of each ribbon, on the small layer
    gx.clearRect(0,0,W,H); gx.globalCompositeOperation=light?'source-over':'lighter';
    gx.save(); gx.translate(W/2,mid); gx.scale(1,0.42); var r=gx.createRadialGradient(0,0,0,0,0,W*0.48);
    r.addColorStop(0,light?'rgba(42,134,230,.16)':'rgba(28,69,230,.42)'); r.addColorStop(1,'rgba(14,26,92,0)'); gx.fillStyle=r; gx.fillRect(-W,-H*2,W*2,H*4); gx.restore();
    edges.forEach(function(e,i){ gx.beginPath(); for(var x=-STEP;x<=W+STEP;x+=STEP) gx.lineTo(x,e[0](x)); for(x=W+STEP;x>=-STEP;x-=STEP) gx.lineTo(x,e[1](x)); gx.closePath();
      gx.fillStyle=grad(C,gx,light?.1:(i===1?.34:.24)); gx.fill();
      gx.lineWidth=amp*0.22; gx.strokeStyle=grad(C,gx,light?.08:.2); path(gx,e[0]); gx.stroke(); });
    cx.clearRect(0,0,W,H); cx.globalCompositeOperation=light?'source-over':'lighter'; cx.lineCap='round';
    x4.clearRect(0,0,g4.width,g4.height); x4.drawImage(gl,0,0,g4.width,g4.height);
    x2.clearRect(0,0,g2.width,g2.height); x2.drawImage(g4,0,0,g2.width,g2.height);
    cx.imageSmoothingEnabled=true; cx.imageSmoothingQuality='high'; cx.drawImage(g2,0,0,g2.width,g2.height,0,0,gl.width*GS,gl.height*GS);
    // the fine dotted texture across the middle ribbon
    var m=edges[1]; cx.setLineDash([1.2,3.2]); cx.lineWidth=1; cx.strokeStyle=grad(C,cx,light?.22:.34);
    for(var k=1;k<36;k++){ var q=k/36; path(cx,function(x){ return m[0](x)*(1-q)+m[1](x)*q; }); cx.stroke(); }
    cx.setLineDash([]);
    // the ribbon edges: soft, a little brighter on top, never a hard line
    edges.forEach(function(e,i){ [[18,light?.05:.07],[6,light?.14:.2],[2,light?.34:.5]].forEach(function(s){
      cx.lineWidth=s[0]; cx.strokeStyle=grad(C,cx,s[1]); path(cx,e[0]); cx.stroke(); cx.strokeStyle=grad(C,cx,s[1]*0.6); path(cx,e[1]); cx.stroke(); }); });
  }
  function frame(now){ if(!document.hidden&&now-last>33){ T+=Math.min(now-last,100)/1000*0.2; last=now; draw(T); } requestAnimationFrame(frame); }
  size(); draw(T);
  addEventListener('resize',function(){ size(); draw(T); });
  new MutationObserver(function(){ draw(T); }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  if(!still) requestAnimationFrame(function(n){ last=n; requestAnimationFrame(frame); });
})();
