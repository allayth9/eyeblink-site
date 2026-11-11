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
  // the rest of the world, after the region above
  window.EB_WORLD='AF93 AL355 DZ213 AD376 AO244 AG1 AR54 AM374 AU61 AT43 AZ994 BS1 BD880 BB1 BY375 BE32 BZ501 BJ229 BT975 BO591 BA387 BW267 BR55 BN673 BG359 BF226 BI257 KH855 CM237 CA1 CV238 CF236 TD235 CL56 CN86 CO57 KM269 CG242 CD243 CR506 CI225 HR385 CU53 CY357 CZ420 DK45 DJ253 DM1 DO1 EC593 SV503 GQ240 ER291 EE372 SZ268 ET251 FJ679 FI358 FR33 GA241 GM220 GE995 DE49 GH233 GR30 GD1 GT502 GN224 GW245 GY592 HT509 HN504 HK852 HU36 IS354 IN91 ID62 IR98 IE353 IT39 JM1 JP81 KZ7 KE254 KI686 KG996 LA856 LV371 LS266 LR231 LY218 LI423 LT370 LU352 MO853 MG261 MW265 MY60 MV960 ML223 MT356 MH692 MR222 MU230 MX52 FM691 MD373 MC377 MN976 ME382 MA212 MZ258 MM95 NA264 NR674 NP977 NL31 NZ64 NI505 NE227 NG234 KP850 MK389 NO47 PK92 PW680 PS970 PA507 PG675 PY595 PE51 PH63 PL48 PT351 PR1 RO40 RU7 RW250 KN1 LC1 VC1 WS685 SM378 ST239 SN221 RS381 SC248 SL232 SG65 SK421 SI386 SB677 SO252 ZA27 KR82 SS211 ES34 LK94 SD249 SR597 SE46 CH41 TW886 TJ992 TZ255 TH66 TL670 TG228 TO676 TT1 TN216 TM993 TV688 UG256 UA380 GB44 UY598 UZ998 VU678 VA39 VE58 VN84 YE967 ZM260 ZW263 XK383'.split(' ').map(function(x){ return [x.slice(0,2),'+'+x.slice(2)]; });
  // countries without a drawn flag: the emoji flag where the system draws one, the letters otherwise (Windows)
  var emo=null; function emojiOk(){ if(emo!==null) return emo; try{ var c=document.createElement('canvas'); c.width=c.height=16; var x=c.getContext('2d'); x.font='14px sans-serif'; x.fillText('\uD83C\uDDFA\uD83C\uDDF8',0,14); var d=x.getImageData(0,0,16,16).data, col=0; for(var i=0;i<d.length;i+=4) if(d[i+3]&&(Math.abs(d[i]-d[i+1])>30||Math.abs(d[i+1]-d[i+2])>30)) col++; emo=col>8; }catch(_){ emo=false; } return emo; }
  window.EB_FLAG2=function(k){ var f=EB_FLAG(k); if(f) return f; return emojiOk()? '<span class="flag femo" aria-hidden="true">'+String.fromCodePoint.apply(null,k.split('').map(function(c){ return 127397+c.charCodeAt(0); }))+'</span>' : '<span class="flag fcode" aria-hidden="true">'+k+'</span>'; };
  window.EB_DIAL=[['AE','+971'],['SA','+966'],['QA','+974'],['KW','+965'],['BH','+973'],['OM','+968'],['SY','+963'],['JO','+962'],['LB','+961'],['EG','+20'],['IQ','+964'],['TR','+90'],['US','+1']];
})();
