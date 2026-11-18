/* Eyeblink admin · the sky behind the glass (19 Nov): liquid-metal ribbons twisting through a studio light rig
   (after the «shader-metal» reference), cast in the brand gradient instead of chrome: cyan → blue → royal → navy,
   one tone per ribbon; the strip lights are horizon cyan and hour blue, and the thin-film sheen moves between them
   (no rainbow). The key light follows the pointer and the ribbons lean toward it. One WebGL canvas, transparent,
   ~30 frames a second, paused in a hidden tab, a still frame for «reduce motion». Without WebGL the aurora alone stays. */
(function(){
  var cv=document.createElement('canvas'); cv.id='sky'; cv.setAttribute('aria-hidden','true');
  document.body.insertBefore(cv,document.body.firstChild);
  // only on a real graphics card: drawn in software (no GPU, or a test machine) this shader would freeze the panel, so the aurora stays alone
  var gl=cv.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,failIfMajorPerformanceCaveat:true});
  var dbg=gl&&gl.getExtension('WEBGL_debug_renderer_info'), rn=dbg?String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)):'';
  if(!gl||/swiftshader|llvmpipe|softpipe|software|basic render/i.test(rn)){ cv.remove(); return; }
  // the brand gradient (#2FC4D8 → #2A86E6 → #1C45E6 → #1638C4 → #0E1A5C), read from the palette so a change there reaches here
  function hex(n,f){ var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim()||f, h=v.replace('#',''); if(h.length===3) h=h.replace(/./g,'$&$&');
    var i=parseInt(h,16); return [(i>>16&255)/255,(i>>8&255)/255,(i&255)/255].map(function(c){ return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4); }); }
  var VERT='attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  var FRAG=[
'precision highp float;',
'uniform vec2 R;uniform float T,DK,PULL;uniform vec2 M,LI;uniform vec3 F0[5];uniform vec3 CY,BL;',
'const float TAU=6.28318530718;const float TILT=-0.32;const float N=4.;',
'float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}',
'float lines(float x,float s){float i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(hash(vec2(i,s)),hash(vec2(i+1.,s)),f);}',
'vec2 rot(vec2 p,float a){float c=cos(a),s=sin(a);return vec2(c*p.x-s*p.y,s*p.x+c*p.y);}',
'float spine(float x,float k,float lane,float t,vec2 m){float y=lane+.13*sin(1.15*x+.55*t+2.1*k)+.06*sin(2.6*x-.8*t+1.3*k+.7)+.025*sin(5.3*x+1.3*t+4.*k);',
'  float nr=exp(-(x-m.x)*(x-m.x)*5.);return y+(m.y-y)*.22*PULL*nr;}',
// the studio: a dark stage; the strip lights are the brand cyan (left) and blue (right); the softbox overhead is cool white
'vec3 studio(vec3 r,float t){r.xz=rot(r.xz,.28*sin(t*.11));float y=r.y;',
'  vec3 top=mix(vec3(.80,.84,.92),vec3(.012,.016,.045),DK),hz=mix(vec3(1.),vec3(.10,.13,.26),DK),gr=mix(vec3(.05,.06,.10),vec3(.003,.004,.012),DK);',
'  vec3 sky=mix(hz,top,smoothstep(0.,.85,y)),fl=mix(gr*2.4,gr,smoothstep(0.,-.5,y));vec3 c=mix(fl,sky,smoothstep(-.025,.025,y));',
'  c+=smoothstep(.6,.45,abs(r.x))*smoothstep(.42,.55,y)*smoothstep(1.,.85,y)*mix(1.5,2.0,DK)*vec3(.92,.97,1.);',
'  c+=smoothstep(.1,.03,abs(r.x+.78))*smoothstep(-.35,-.1,y)*smoothstep(.8,.5,y)*CY*mix(1.2,2.2,DK);',
'  c+=smoothstep(.08,.02,abs(r.x-.72))*smoothstep(-.3,-.05,y)*smoothstep(.75,.45,y)*BL*mix(1.0,2.0,DK);',
'  c+=smoothstep(.7,.2,abs(r.x))*smoothstep(-.95,-.7,y)*smoothstep(-.4,-.65,y)*mix(.35,.16,DK)*BL;return c;}',
'vec3 tm(vec3 x){x=max(x,0.);return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}',
'vec3 srgb(vec3 c){c=clamp(c,0.,1.);return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));}',
'void main(){vec2 fr=gl_FragCoord.xy;float px=1./R.y;vec2 p=rot((fr-.5*R)*px,TILT);vec2 m=rot((M-.5)*R*px,TILT);float t=T;',
'  vec3 L=normalize(vec3(LI,.85));float spread=mix(0.,.3,(N-1.)/4.)+.08,bw=mix(.13,.075,(N-1.)/4.);vec3 col=vec3(0.);float al=0.;',
'  for(int i=0;i<4;i++){float k=float(i),f=k/(N-1.),lane=(f-.5)*spread,tk=t*mix(.82,1.,f);',
'    vec3 f0=F0[0];if(i==1)f0=F0[1];if(i==2)f0=F0[2];if(i==3)f0=F0[3];',
'    float x=p.x,e=.004,c=spine(x,k,lane,tk,m),sl=(spine(x+e,k,lane,tk,m)-spine(x-e,k,lane,tk,m))/(2.*e),d=(p.y-c)*inversesqrt(1.+sl*sl);',
'    float th=1.5*x+.45*tk+1.7*k+.55*sin(.7*x-.3*tk+k),ct=cos(th),st=sin(th),hw=bw*(.82+.22*sin(.9*x+.35*tk+2.3*k)),pj=hw*max(abs(ct),.035);',
'    float sd=d+.045,sh=(1.-smoothstep(.35,1.,abs(sd)/(pj+.05)))*mix(.2,.32,DK);col*=1.-sh;al=al+sh*(1.-al);',
'    float v=d/(ct>=0.?pj:-pj),aa=1.2*px/pj,cv=1.-smoothstep(1.-aa,1.+aa,abs(v));if(cv<=0.)continue;',
'    vec3 Tg=normalize(vec3(1.,sl,0.)),N2=normalize(vec3(-sl,1.,0.)),B=ct*N2+st*vec3(0.,0.,1.),n=-st*N2+ct*vec3(0.,0.,1.);',
'    float rl0=v*.45+v*v*v*.5,rp=sin(x*13.-tk*2.2+k*3.1)*.06+sin(x*31.+tk*1.3+k)*.015,gn=lines(v*34.+k*17.,k)-.5;',
'    n=normalize(n+B*(rl0+gn*.015)+Tg*rp);float ed=smoothstep(.14,.03,abs(ct));vec3 rim=B*(st>=0.?1.:-1.)+vec3(0.,.2,0.);n=normalize(mix(n,normalize(rim),ed));',
'    float bk=step(n.z,0.);n*=1.-2.*bk;vec3 r=reflect(vec3(0.,0.,-1.),n);vec3 env=studio(r,t);float fc=clamp(n.z,0.,1.);',
'    vec3 F=f0+(1.-f0)*pow(1.-fc,5.);',
// the sheen: cyan ↔ blue across the turns, never a rainbow
'    float film=.5+.5*sin(x*1.6+v*.9+tk*.35+k*1.9);vec3 tint=mix(CY,BL,film);tint/=max(dot(tint,vec3(.2126,.7152,.0722)),.2);',
'    F*=mix(vec3(1.),tint,.28*(.45+.55*(1.-fc)));float rl=max(dot(r,L),0.);float sp=pow(rl,90.)*5.+pow(rl,14.)*.55;',
'    vec3 lit=(env*F+sp*F)*mix(1.,.72,bk)*(.94+gn*.12)*mix(.86,1.,f);vec3 rgb=srgb(tm(lit*1.05));col=col*(1.-cv)+rgb*cv;al=al*(1.-cv)+cv;}',
'  float di=(hash(fr+fract(t)*91.)-.5)/255.;col+=di*al;al=clamp(al+di*step(.0005,al)*1.5,0.,1.);gl_FragColor=vec4(clamp(col,0.,1.),al);}'].join('\n');
  function sh(type,src){ var s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); return gl.getShaderParameter(s,gl.COMPILE_STATUS)?s:null; }
  var vs=sh(gl.VERTEX_SHADER,VERT), fs=sh(gl.FRAGMENT_SHADER,FRAG); if(!vs||!fs){ cv.remove(); return; }
  var pg=gl.createProgram(); gl.attachShader(pg,vs); gl.attachShader(pg,fs); gl.linkProgram(pg); if(!gl.getProgramParameter(pg,gl.LINK_STATUS)){ cv.remove(); return; }
  gl.useProgram(pg); gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  var loc=gl.getAttribLocation(pg,'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  var U={}; ['R','T','DK','PULL','M','LI','F0','CY','BL'].forEach(function(n){ U[n]=gl.getUniformLocation(pg,n); });
  function colours(){ var f=[].concat(hex('--k-g1','#2FC4D8'),hex('--k-g2','#2A86E6'),hex('--k-g3','#1C45E6'),hex('--k-g4','#1638C4'),hex('--k-deep','#0E1A5C'));
    gl.uniform3fv(U.F0,new Float32Array(f)); gl.uniform3fv(U.CY,hex('--k-horizon','#3FE0E8')); gl.uniform3fv(U.BL,hex('--k-hour','#2E62FF')); }
  // the backing store: device resolution up to 2x, capped so a big screen stays light on the GPU
  function size(){ var w=innerWidth, h=innerHeight, r=Math.min(devicePixelRatio||1,2,Math.sqrt(1600000/(w*h))); cv.width=Math.max(1,Math.floor(w*r)); cv.height=Math.max(1,Math.floor(h*r)); gl.viewport(0,0,cv.width,cv.height); }
  var still=matchMedia('(prefers-reduced-motion: reduce)').matches, mouse={x:.5,y:.5}, tgt={x:.5,y:.5}, li={x:-.45,y:.55}, lt={x:-.45,y:.55}, pull=0, pt=0, clock=11, last=0;
  var dark=function(){ return document.documentElement.dataset.theme==='light'?0:1; }, dk=dark();
  addEventListener('pointermove',function(e){ var x=e.clientX/innerWidth, y=1-e.clientY/innerHeight; tgt.x=x; tgt.y=y; lt.x=(x*2-1)*.9; lt.y=(y*2-1)*.9; pt=1; },{passive:true});
  document.addEventListener('pointerleave',function(){ pt=0; lt.x=-.45; lt.y=.55; });
  function draw(dt){ var ea=function(r){ return 1-Math.exp(-dt*r); };
    mouse.x+=(tgt.x-mouse.x)*ea(3); mouse.y+=(tgt.y-mouse.y)*ea(3); li.x+=(lt.x-li.x)*ea(5); li.y+=(lt.y-li.y)*ea(5); pull+=(pt-pull)*ea(2.5); dk+=(dark()-dk)*ea(6);
    gl.uniform2f(U.R,cv.width,cv.height); gl.uniform1f(U.T,clock); gl.uniform1f(U.DK,dk); gl.uniform1f(U.PULL,pull);
    gl.uniform2f(U.M,mouse.x,mouse.y); gl.uniform2f(U.LI,li.x,li.y); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES,0,6); }
  function frame(now){ requestAnimationFrame(frame); if(document.hidden||now-last<33) return; var dt=Math.min(.1,(now-last)/1000); last=now; if(!still) clock+=dt*.3*3; draw(dt); }
  colours(); size(); draw(1);
  addEventListener('resize',function(){ size(); draw(.05); });
  new MutationObserver(function(){ colours(); draw(.05); }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  cv.addEventListener('webglcontextlost',function(e){ e.preventDefault(); });
  requestAnimationFrame(function(n){ last=n; requestAnimationFrame(frame); });
})();
