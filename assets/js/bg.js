/* Eyeblink — the field of light.
   A sphere of points, folded by slow 3D noise, coloured like the sky at blue hour
   (cyan at the top, blue in the body, the violet-pink "belt of Venus" at the bottom).
   The pointer turns it and presses into it. Anchors to [data-field-anchor] when present. */
(function(){
  var canvas=document.getElementById('field'), root2=document.documentElement;
  if(!canvas||!window.THREE) return;
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var renderer;
  try{ renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:false,alpha:true,powerPreference:'high-performance'}); }catch(e){ return; }
  // phones: fewer points, a lighter pixel ratio and ~30 fps, so scrolling stays smooth
  var SMALL=Math.min(innerWidth,innerHeight)<700, COARSE=matchMedia('(pointer: coarse)').matches;
  var DPR=Math.min(window.devicePixelRatio||1,SMALL||COARSE?1:1.75);
  renderer.setPixelRatio(DPR);
  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(35,1,0.1,100); camera.position.z=7;

  // lat-long grid of points -> visible rows, like a woven light
  var ROWS=SMALL?64:110, COLS=SMALL?110:170, n=ROWS*COLS, pos=new Float32Array(n*3), seed=new Float32Array(n), k=0;
  for(var i=0;i<ROWS;i++){
    var v=(i+0.5)/ROWS, phi=Math.acos(1-2*v);
    for(var j=0;j<COLS;j++){
      var th=(j/COLS)*Math.PI*2 + (i%2)*Math.PI/COLS;
      pos[k*3]=Math.sin(phi)*Math.cos(th); pos[k*3+1]=Math.cos(phi); pos[k*3+2]=Math.sin(phi)*Math.sin(th);
      seed[k]=Math.random(); k++;
    }
  }
  var geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  geo.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));

  var uniforms={
    uTime:{value:0}, uMouse:{value:new THREE.Vector2(9,9)}, uPress:{value:0}, uAspect:{value:1},
    uSize:{value:2.7*DPR}, uAlpha:{value:1}, uWarp:{value:1}
  };
  var noise=[
    'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
    'float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);',
    'vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;',
    'vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;',
    'i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));',
    'float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);',
    'vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);',
    'vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    'vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);',
    'vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;',
    'vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;',
    'return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}'
  ].join('\n');

  var vert=[
    'uniform float uTime,uPress,uAspect,uSize,uWarp;uniform vec2 uMouse;attribute float aSeed;',
    'varying vec3 vColor;varying float vAlpha;', noise,
    'void main(){',
    ' vec3 p=position;',
    ' float t=uTime*0.11;',
    ' float n=snoise(p*1.25+vec3(t,t*0.7,-t*0.5));',
    ' float n2=snoise(p*2.6-vec3(t*0.8))*0.4;',
    ' float d=(n*0.3+n2*0.14)*uWarp;',
    ' p*=1.0+d;',
    ' vec4 mv=modelViewMatrix*vec4(p,1.0);',
    ' vec4 c=modelViewMatrix*vec4(0.0,0.0,0.0,1.0);',
    ' vec4 clip=projectionMatrix*mv; vec2 ndc=clip.xy/clip.w;',
    ' float md=distance(ndc*vec2(uAspect,1.0),uMouse*vec2(uAspect,1.0));',
    ' float push=smoothstep(0.55,0.0,md)*uPress;',
    ' vec3 dir=normalize(mv.xyz-c.xyz);',
    ' mv.xyz+=dir*push*0.55;',
    ' gl_Position=projectionMatrix*mv;',
    ' float facing=clamp((mv.z-c.z)*0.9+0.55,0.0,1.0);',
    ' gl_PointSize=uSize*(7.0/-mv.z)*(0.75+d*1.4+push*0.9)*(0.55+0.45*facing);',
    // colour by original height: pink/violet at the bottom -> blue body -> cyan top
    ' float h=position.y*0.5+0.5;',
    ' vec3 venus=vec3(0.88,0.48,0.88), dusk=vec3(0.55,0.36,1.0), hour=vec3(0.18,0.42,1.0), horizon=vec3(0.25,0.88,0.93);',
    ' vec3 col=mix(venus,dusk,smoothstep(0.0,0.22,h));',
    ' col=mix(col,hour,smoothstep(0.18,0.45,h));',
    ' col=mix(col,horizon,smoothstep(0.55,0.95,h+n*0.15));',
    ' col+=vec3(0.25,0.3,0.35)*push;',
    ' vColor=col;',
    ' vAlpha=(0.36+0.64*facing)*(0.8+0.2*aSeed);',
    '}'
  ].join('\n');
  var frag=[
    'uniform float uAlpha;varying vec3 vColor;varying float vAlpha;',
    'void main(){ vec2 q=gl_PointCoord-0.5; float r=length(q); if(r>0.5) discard;',
    ' float a=smoothstep(0.5,0.18,r)*vAlpha*uAlpha; gl_FragColor=vec4(vColor*a,a); }'
  ].join('\n');

  var mat=new THREE.ShaderMaterial({uniforms:uniforms,vertexShader:vert,fragmentShader:frag,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  var pts=new THREE.Points(geo,mat); scene.add(pts);
  var mat2=mat.clone(); mat2.uniforms=THREE.UniformsUtils.clone(uniforms); mat2.uniforms.uMouse.value=uniforms.uMouse.value;
  var pts2=new THREE.Points(geo,mat2); scene.add(pts2); pts2.visible=false;
  var endAnchor=document.querySelector('[data-field-end]');

  // where the sphere lives on this page
  var anchor=document.querySelector('[data-field-anchor]');
  var mode=document.body.getAttribute('data-field')||'side';
  var W=0,H=0,halfH=Math.tan(THREE.MathUtils.degToRad(35/2))*camera.position.z;
  function size(){
    W=innerWidth; H=innerHeight; renderer.setSize(W,H,false);
    camera.aspect=W/H; camera.updateProjectionMatrix(); uniforms.uAspect.value=W/H;
  }
  size(); addEventListener('resize',size);
  function screenToWorld(x,y){ return {x:((x/W)*2-1)*halfH*(W/H), y:-((y/H)*2-1)*halfH}; }

  var mouse={x:9,y:9,tx:9,ty:9}, rot={x:0,y:0,tx:0,ty:0}, press=0, tpress=0, last=0;
  if(!COARSE){   // touch screens: the field does not bulge under a tap or a scrolling finger
  addEventListener('pointermove',function(e){
    mouse.tx=(e.clientX/W)*2-1; mouse.ty=-((e.clientY/H)*2-1);
    rot.ty=mouse.tx*0.6; rot.tx=-mouse.ty*0.35; tpress=1; last=performance.now();
  },{passive:true});
  addEventListener('pointerdown',function(){ tpress=1.8; },{passive:true});
  addEventListener('pointerup',function(){ tpress=1; },{passive:true});
  document.addEventListener('pointerleave',function(){ tpress=0; });
  }

  var t0=performance.now(), cx=0, cy=0, cs=1, visible=true;
  document.addEventListener('visibilitychange',function(){ visible=!document.hidden; if(visible) requestAnimationFrame(frame); });

  function place(){
    var y=scrollY;
    if(anchor){
      var r=anchor.getBoundingClientRect();
      var w=screenToWorld(r.left+r.width/2, r.top+r.height/2);
      var rad=(r.width/2)/(H/2)*halfH*1.42;
      return {x:w.x,y:w.y,s:rad,a:1,sx:r.left+r.width/2,sy:r.top+r.height/2};
    }
    // inner pages: a large field on the far side, drifting slowly with scroll
    var side=document.documentElement.dir==='rtl'?-1:1;
    var px=W<760? W*0.5 : (side>0? W*0.78 : W*0.22);
    var py=H*(W<760?0.32:0.42) - Math.min(y*0.12,H*0.25);
    var w2=screenToWorld(px,py);
    return {x:w2.x,y:w2.y,s:halfH*(W<760?0.62:0.78),a:0.85,sx:px,sy:py};
  }

  var lastF=0, MINF=COARSE?32:0;
  function frame(now){
    if(!visible) return;
    // nothing to draw while a full-screen window (player, order) covers the page
    if(root2.classList.contains('modal-open')){ if(!reduce) requestAnimationFrame(frame); return; }
    if(MINF && now-lastF<MINF){ if(!reduce) requestAnimationFrame(frame); return; } lastF=now;
    var t=(now-t0)/1000;
    if(now-last>2500) tpress=0;
    mouse.x+=(mouse.tx-mouse.x)*0.08; mouse.y+=(mouse.ty-mouse.y)*0.08;
    press+=(tpress-press)*0.06;
    rot.x+=(rot.tx-rot.x)*0.04; rot.y+=(rot.ty-rot.y)*0.04;
    var p=place(); cx+=(p.x-cx)*0.12; cy+=(p.y-cy)*0.12; cs+=(p.s-cs)*0.08;
    pts.position.set(cx,cy,0); pts.scale.setScalar(cs);
    pts.rotation.y=t*0.06+rot.y; pts.rotation.x=0.25+rot.x+Math.sin(t*0.2)*0.05;
    uniforms.uTime.value=reduce?8:t; uniforms.uMouse.value.set(mouse.x,mouse.y);
    uniforms.uPress.value=reduce?0:press; uniforms.uAlpha.value=p.a;
    if(endAnchor){
      var er=endAnchor.getBoundingClientRect(), vis=er.top<H && er.bottom>0;
      pts2.visible=vis;
      if(vis){
        // the second field sits on the opposite side of the first, and fades while they would meet (short pages)
        var ex=W<760? W*0.5 : W-p.sx, ey=er.top+er.height*0.56;
        var w3=screenToWorld(ex, ey), gap=Math.hypot((ex-p.sx)/W, (ey-p.sy)/H);
        pts2.position.set(w3.x,w3.y,0); pts2.scale.setScalar(halfH*(W<760?0.62:0.86));
        pts2.rotation.y=-t*0.05-rot.y; pts2.rotation.x=-0.35+rot.x*0.6;
        var u2=mat2.uniforms; u2.uTime.value=(reduce?8:t)+40; u2.uMouse.value.set(mouse.x,mouse.y); u2.uPress.value=reduce?0:press;
        u2.uAlpha.value=Math.min(1,Math.max(0,(H-er.top)/(H*0.6)))*Math.min(1,Math.max(0,(gap-0.28)/0.32));
      }
    }
    renderer.render(scene,camera);
    if(!reduce) requestAnimationFrame(frame);
  }
  requestAnimationFrame(function(n){ frame(n); canvas.classList.add('on'); });
  if(reduce){ addEventListener('scroll',function(){ requestAnimationFrame(frame); },{passive:true}); addEventListener('resize',function(){ requestAnimationFrame(frame); }); }
})();
