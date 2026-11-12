/* Eyeblink admin · the sky behind the glass: the logo's two eyelid strokes, lit with the brand gradient,
   breathing slowly, with meteors of light running along them now and then. No pointer, no library: one inline SVG,
   animated by CSS (theme.css, «#sky»), still for «reduce motion». The glass above blurs it. */
(function(){
  var U='M-80 470C300 210 900 140 1520 270', L='M-80 570C420 690 1000 660 1520 430', F='M200 -20C600 210 1050 230 1520 90';
  // a meteor: a short bright dash travelling along a curve, a wide soft one under it for the glow
  function met(d,cls){ return '<path class="mg '+cls+'" d="'+d+'" pathLength="1000"/><path class="mc '+cls+'" d="'+d+'" pathLength="1000"/>'; }
  var s='<svg id="sky" aria-hidden="true" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">'+
    '<defs><linearGradient id="skyg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0E1A5C" stop-opacity="0"/><stop offset=".35" stop-color="#1C45E6"/><stop offset=".72" stop-color="#2FC4D8"/><stop offset="1" stop-color="#2FC4D8" stop-opacity="0"/></linearGradient>'+
    '<filter id="skyb" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="14"/></filter></defs>'+
    '<g class="lids" fill="none" stroke="url(#skyg)" stroke-linecap="round">'+
      '<path d="'+U+'" stroke-width="26" stroke-opacity=".28" filter="url(#skyb)"/><path class="l1" d="'+U+'" stroke-width="2.4"/>'+
      '<path d="'+L+'" stroke-width="20" stroke-opacity=".24" filter="url(#skyb)"/><path class="l2" d="'+L+'" stroke-width="1.7"/>'+
      '<path class="l3" d="'+F+'" stroke-width="1.1" stroke-opacity=".4"/>'+
    '</g>'+
    '<g class="mets" fill="none" stroke-linecap="round">'+met(U,'m1')+met(L,'m2')+met(F,'m3')+met(U,'m4')+'</g></svg>';
  document.body.insertAdjacentHTML('afterbegin',s);
})();
