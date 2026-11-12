/* Eyeblink admin · layout — loaded after the files before it; all of admin/js shares one scope */
  /* ---------------- layout + look ---------------- */
  var SECN={stats:'خانة الأرقام',services:'الخدمات',work:'الأعمال',packages:'الباقات',reviews:'آراء العملاء',cta:'دعوة التواصل'};
  var NAVN={services:'الخدمات',work:'أعمالنا',pricing:'الباقات',about:'من نحن',contact:'تواصل'};
  var ACCENTS=[['cyan','سماوي (الأساسي)','#3FE0E8','#8B5CFF'],['violet','بنفسجي','#A78BFA','#5B7CFF'],['gold','ذهبي','#F5C66B','#E0833F'],['rose','وردي','#FF7AB6','#8B5CFF'],['mint','نعناعي','#5EF0B0','#2E9BFF']];
  function LY(){ var d=(window.EB_SEED&&EB_SEED.layout)||{home:[],nav:[]}; C.layout=C.layout||JSON.parse(JSON.stringify(d)); C.layout.home=C.layout.home||[]; C.layout.nav=C.layout.nav||[];
    d.home.forEach(function(s){ if(!C.layout.home.some(function(x){return x.id===s.id})) C.layout.home.push({id:s.id,show:true}); });
    d.nav.forEach(function(s){ if(!C.layout.nav.some(function(x){return x.id===s.id})) C.layout.nav.push({id:s.id,show:true,label:{ar:'',en:''}}); }); return C.layout; }
  function renderLayout(){
    var L=LY();
    var row=function(list,i,name,extra){ var it=L[list][i]; return '<div class="lrow"><label class="check"><input type="checkbox" data-lshow="'+list+':'+i+'"'+(it.show!==false?' checked':'')+'> <b>'+esc(name)+'</b></label>'+(extra||'')+
      '<span class="lmove"><button class="btn sm" type="button" data-lmove="'+list+':'+i+':-1" aria-label="أعلى">↑</button><button class="btn sm" type="button" data-lmove="'+list+':'+i+':1" aria-label="أسفل">↓</button></span></div>'; };
    $('#panel').innerHTML=
      '<section class="sec"><h3>ترتيب أقسام الصفحة الرئيسية</h3><p class="hint">من الأعلى للأسفل تحت الواجهة. أزل العلامة لإخفاء القسم. «آراء العملاء» يظهر فقط حين يوجد تقييم معتمد.</p><div class="lgrid">'+
        L.home.map(function(s,i){ return row('home',i,SECN[s.id]||s.id); }).join('')+'</div></section>'+
      '<section class="sec"><h3>القائمة العلوية وأسفل الصفحة</h3><p class="hint">الترتيب والأسماء. اترك الاسم فارغاً ليبقى الافتراضي. الرئيسية وزر «ابدأ مشروعك» ثابتان.</p><div class="lgrid">'+
        L.nav.map(function(n,i){ var lb=n.label||{}; return row('nav',i,NAVN[n.id]||n.id,'<span class="lnames"><input data-p="layout.nav.'+i+'.label.ar" data-t="text" placeholder="'+esc(NAVN[n.id]||'')+'" value="'+esc(lb.ar||'')+'"><input data-p="layout.nav.'+i+'.label.en" data-t="text" dir="ltr" placeholder="English" value="'+esc(lb.en||'')+'"></span>'); }).join('')+'</div></section>'+
      '<section class="sec"><h3>اللون المميّز</h3><p class="hint">يغيّر لون الروابط والإضاءات والأزرار الثانوية في كل الموقع.</p><div class="accents">'+
        ACCENTS.map(function(a){ return '<label class="acc'+((L.accent||'cyan')===a[0]?' on':'')+'"><input type="radio" name="acc" value="'+a[0]+'"'+((L.accent||'cyan')===a[0]?' checked':'')+' data-lacc hidden><i style="background:linear-gradient(135deg,'+a[2]+','+a[3]+')"></i>'+a[1]+'</label>'; }).join('')+'</div></section>'+
      '<section class="sec"><h3>عناصر بصرية</h3>'+
        '<label class="check"><input type="checkbox" data-ltog="intro"'+(L.intro!==false?' checked':'')+'> مقدّمة فتح العين عند أول زيارة</label>'+
        '<label class="check"><input type="checkbox" data-ltog="particles"'+(L.particles!==false?' checked':'')+'> خلفية الجزيئات المتحركة</label>'+
        '<label class="check"><input type="checkbox" data-ltog="countUp"'+(L.countUp!==false?' checked':'')+'> عدّاد الأرقام (يعدّ من الصفر عند ظهور الخانات)</label>'+
        ''+
        '<div class="field"><label>خانة التواصل أسفل الصفحات</label><select data-lsel="cta">'+[['aurora','بلون خاص (أورورا)'],['glass','زجاجية مثل باقي الخانات']].map(function(o){return '<option value="'+o[0]+'"'+((L.cta||'aurora')===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select></div>'+
        '<p class="hint" style="margin-top:8px">التغييرات تظهر بعد «نشر التعديلات». استخدم «معاينة» لتراها قبل النشر.</p></section>';
  }
  document.addEventListener('change',function(e){ var el=e.target; if(TAB!=='layout'||!C) return; var L=LY();
    if(el.dataset.lshow){ var q=el.dataset.lshow.split(':'); L[q[0]][+q[1]].show=el.checked; dirty(); saveDraft(); }
    else if(el.hasAttribute('data-lacc')){ L.accent=el.value; dirty(); saveDraft(); renderLayout(); }
    else if(el.dataset.ltog){ L[el.dataset.ltog]=el.checked; dirty(); saveDraft(); }
    else if(el.dataset.lsel){ L[el.dataset.lsel]=el.value; dirty(); saveDraft(); } });
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-lmove]'); if(!b) return; var q=b.dataset.lmove.split(':'), arr=LY()[q[0]], i=+q[1], j=i+(+q[2]);
    if(j<0||j>=arr.length) return; var x=arr[i]; arr[i]=arr[j]; arr[j]=x; dirty(); saveDraft(); renderLayout(); });
