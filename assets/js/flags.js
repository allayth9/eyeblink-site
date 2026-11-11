/* Small simplified flags (30×20) for the currency and dial-code pickers. Drawn here because Windows shows no flag emoji. */
(function(){
  var s=function(a,b,c){ return '<rect width="30" height="6.67" fill="'+a+'"/><rect y="6.67" width="30" height="6.67" fill="'+b+'"/><rect y="13.33" width="30" height="6.67" fill="'+c+'"/>'; };
  var zig=function(c){ var p='M0 0H9', n=9, h=20/n; for(var i=0;i<n;i++) p+='L13 '+(i*h+h/2).toFixed(2)+'L9 '+((i+1)*h).toFixed(2); return '<path d="'+p+'L0 20Z" fill="'+c+'"/>'; };
  var F={
    US:'<rect width="30" height="20" fill="#fff"/><path d="M0 1.5h30M0 4.6h30M0 7.7h30M0 10.8h30M0 13.9h30M0 17h30" stroke="#B22234" stroke-width="1.55"/><rect width="13" height="10.8" fill="#3C3B6E"/>',
    AE:s('#00843D','#fff','#111')+'<rect width="8" height="20" fill="#E4002B"/>',
    SA:'<rect width="30" height="20" fill="#006C35"/><path d="M8 13.5h14" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/><path d="M9 8.5h12" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="2.2 1.1"/>',
    QA:'<rect width="30" height="20" fill="#8A1538"/>'+zig('#fff'),
    KW:s('#007A3D','#fff','#CE1126')+'<path d="M0 0l8 6.67v6.66L0 20z" fill="#111"/>',
    BH:'<rect width="30" height="20" fill="#DA291C"/>'+zig('#fff'),
    OM:s('#fff','#DB161B','#008000')+'<rect width="8" height="20" fill="#DB161B"/>',
    SY:s('#007A3D','#fff','#111')+'<circle cx="9" cy="10" r="1.5" fill="#CE1126"/><circle cx="15" cy="10" r="1.5" fill="#CE1126"/><circle cx="21" cy="10" r="1.5" fill="#CE1126"/>',
    JO:s('#111','#fff','#007A3D')+'<path d="M0 0l13 10L0 20z" fill="#CE1126"/>',
    LB:'<rect width="30" height="20" fill="#fff"/><rect width="30" height="5" fill="#ED1C24"/><rect y="15" width="30" height="5" fill="#ED1C24"/><path d="M15 6l4 7.5h-8z" fill="#00A651"/>',
    EG:s('#CE1126','#fff','#111')+'<circle cx="15" cy="10" r="1.8" fill="#C09300"/>',
    IQ:s('#CE1126','#fff','#111')+'<path d="M11.5 10h7" stroke="#007A3D" stroke-width="1.8" stroke-linecap="round"/>',
    TR:'<rect width="30" height="20" fill="#E30A17"/><circle cx="12" cy="10" r="5" fill="#fff"/><circle cx="13.4" cy="10" r="4" fill="#E30A17"/><circle cx="18.6" cy="10" r="1.4" fill="#fff"/>'
  };
  window.EB_FLAG=function(k){ return F[k]? '<svg class="flag" viewBox="0 0 30 20" aria-hidden="true">'+F[k]+'</svg>' : ''; };
  // currency → its country, and the dial codes offered next to a phone number
  window.EB_CUR_FLAG={'$':'US',AED:'AE',SAR:'SA',QAR:'QA',KWD:'KW',BHD:'BH',OMR:'OM',SYP:'SY'};
  window.EB_DIAL=[['AE','+971'],['SA','+966'],['QA','+974'],['KW','+965'],['BH','+973'],['OM','+968'],['SY','+963'],['JO','+962'],['LB','+961'],['EG','+20'],['IQ','+964'],['TR','+90'],['US','+1']];
})();
