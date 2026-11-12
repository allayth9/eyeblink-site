/* Eyeblink admin · the sky behind the glass: the site's sphere of points, folded by slow waves, turning on its own.
   No library, no pointer: a plain 2D canvas at ~30 fps that sleeps while the tab is hidden and stands still for
   «reduce motion». Brand colours, cyan at the top → blue → deep blue at the bottom. Its strength is --skyOp in theme.css. */
(function(){
  var cv=document.createElement('canvas'); cv.id='sky'; cv.setAttribute('aria-hidden','true');
  document.body.insertBefore(cv,document.body.firstChild);
  var cx=cv.getContext('2d'); if(!cx) return;
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small=Math.min(innerWidth,innerHeight)<700;
  var ROWS=small?44:64, COLS=small?78:116, N=ROWS*COLS;
  var P=new Float32Array(N*3), ROW=new Uint8Array(N), k=0;
  // a latitude / longitude grid, so the folds read as woven rows of light
  for(var i=0;i<ROWS;i++){ var v=(i+.5)/ROWS, ph=Math.acos(1-2*v);
    for(var j=0;j<COLS;j++){ var th=j/COLS*Math.PI*2+(i%2)*Math.PI/COLS;
      P[k*3]=Math.sin(ph)*Math.cos(th); P[k*3+1]=Math.cos(ph); P[k*3+2]=Math.sin(ph)*Math.sin(th); ROW[k]=i; k++; } }
  // colour per row (top → bottom) and per depth (8 steps, the far side dimmer)
  var STOPS=[[95,230,236],[47,196,216],[42,134,230],[28,69,230],[22,56,196]];
  function mix(a,b,t){ return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]; }
  var COL=[]; for(var r=0;r<ROWS;r++){ var u=r/(ROWS-1)*(STOPS.length-1), s=Math.min(STOPS.length-2,Math.floor(u)), c=mix(STOPS[s],STOPS[s+1],u-s), row=[];
    for(var d=0;d<8;d++) row.push('rgba('+(c[0]|0)+','+(c[1]|0)+','+(c[2]|0)+','+(.18+d*.11).toFixed(2)+')'); COL.push(row); }
  var W=0,H=0,DPR=1;
  function size(){ DPR=Math.min(window.devicePixelRatio||1,small?1:1.5); W=innerWidth; H=innerHeight; cv.width=W*DPR; cv.height=H*DPR; cx.setTransform(DPR,0,0,DPR,0,0); }
  size(); addEventListener('resize',size);
  function frame(t){
    cx.clearRect(0,0,W,H);
    var R=Math.min(W,H)*.36, ox=W*.5, oy=H*.54, ry=t*.05, rx=.28+Math.sin(t*.07)*.05, cy=Math.cos(ry), sy=Math.sin(ry), cX=Math.cos(rx), sX=Math.sin(rx), dot=small?1.4:1.6;
    for(var n=0;n<N;n++){
      var x=P[n*3], y=P[n*3+1], z=P[n*3+2];
      // the folds: a few slow travelling waves, the sum keeps it organic without a noise library
      var f=1+.16*Math.sin(2.1*x+t*.5)*Math.sin(1.7*y+t*.56)+.11*Math.sin(3.1*z-t*.4+1.3*y)+.07*Math.sin(4.3*(x+z)+t*.7);
      x*=f; y*=f; z*=f;
      var x1=x*cy+z*sy, z1=-x*sy+z*cy, y1=y*cX-z1*sX, z2=y*sX+z1*cX;
      var p=3.2/(3.2+z2), px=ox+x1*R*p, py=oy-y1*R*p, dd=Math.max(0,Math.min(7,((1-z2)*3.6)|0));
      cx.fillStyle=COL[ROW[n]][dd]; cx.fillRect(px,py,dot*p,dot*p);
    }
  }
  if(reduce){ frame(8); return; }
  var last=0, t0=performance.now();
  function loop(now){ requestAnimationFrame(loop); if(document.hidden||now-last<33) return; last=now; frame((now-t0)/1000+8); }
  requestAnimationFrame(loop);
})();
