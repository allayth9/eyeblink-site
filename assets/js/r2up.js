/* Eyeblink · direct uploads to R2 (presigned links from /api/up), shared by the client workspace and the studio panel.
   EBUp.upload(file, meta, onProgress) → Promise<file record>.  meta: {scope:'project', project, category} | {scope:'brand', kind[, client_email]} */
(function(){
  var U='/api/up';
  function upPost(b){ return fetch(U,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(b)})
    .then(function(r){ return r.json().catch(function(){ return {ok:false}; }).then(function(j){ j._s=r.status; return j; }); }).catch(function(){ return {ok:false,_net:true}; }); }
  function xput(url,blob,type,onp){ return new Promise(function(res,rej){ var x=new XMLHttpRequest(); x.open('PUT',url); if(type) x.setRequestHeader('content-type',type);
    x.upload.onprogress=function(e){ if(e.lengthComputable) onp(e.loaded); }; x.onload=function(){ if(x.status>=200&&x.status<300) res(x); else rej(x); }; x.onerror=x.onabort=function(){ rej(x); }; x.send(blob); }); }
  // one file → R2. Under 100 MB: one signed PUT. Larger: parts (≥ 5 MiB), three at a time, each part signed just before it is sent,
  // so a link never outlives its 15 minutes; a failed part is signed again and retried (3 times)
  function upload(file,meta,onp){ var size=file.size;
    var sign=function(){ return upPost(Object.assign({op:'sign',name:file.name,type:file.type,size:size},meta)).then(function(s){ if(!s.ok) throw s; return s; }); };
    return sign().then(function(s){
      if(s.mode==='put') return xput(s.url,file,s.type,function(l){ onp(l/size); })
        .catch(function(x){ if(x&&x.status===403) return sign().then(function(s2){ s=s2; return xput(s2.url,file,s2.type,function(l){ onp(l/size); }); }); throw x; })
        .then(function(){ return upPost({op:'done',key:s.key,name:file.name,client_email:meta.client_email,task:meta.task}); });
      var P=s.part, n=Math.ceil(size/P), got=[], parts=[], next=1;
      var urlOf=function(i){ return s.mode==='proxy'?Promise.resolve(U+'?key='+encodeURIComponent(s.key)+'&uploadId='+encodeURIComponent(s.uploadId)+'&n='+i)
        :upPost({op:'parts',key:s.key,uploadId:s.uploadId,numbers:[i]}).then(function(r){ if(!r.ok) throw r; return r.urls[i]; }); };
      var one=function(i,tries){ var blob=file.slice((i-1)*P,Math.min(i*P,size));
        return urlOf(i).then(function(u){ return xput(u,blob,'',function(l){ got[i]=l; onp(got.reduce(function(a,b){ return a+(b||0); },0)/size); }); })
          .then(function(x){ var et=s.mode==='proxy'?JSON.parse(x.responseText).etag:x.getResponseHeader('ETag'); if(!et) throw x; parts.push({partNumber:i,etag:et}); })
          .catch(function(e){ got[i]=0; if(tries<3) return one(i,tries+1); throw e; }); };
      var lane=function(){ if(next>n) return Promise.resolve(); var i=next++; return one(i,0).then(lane); };
      return Promise.all([lane(),lane(),lane()]).then(function(){ return upPost({op:'done',key:s.key,uploadId:s.uploadId,parts:parts,name:file.name,client_email:meta.client_email,task:meta.task}); })
        .catch(function(e){ upPost({op:'abort',key:s.key,uploadId:s.uploadId}); throw e; });
    }).then(function(r){ if(!r.ok) throw r; onp(1); return r.file; });
  }
  window.EBUp={upload:upload};
  // does this picture really have see-through pixels? true / false, or null when the browser cannot tell (SVG, HEIC…)
  window.EBAlpha=function(f){ if(/^image\/jpe?g$/.test(f.type)) return Promise.resolve(false); if(!/^image\/(png|webp|gif)$/.test(f.type)||!window.createImageBitmap) return Promise.resolve(null);
    return createImageBitmap(f).then(function(bm){ var k=Math.min(1,256/Math.max(bm.width,bm.height)), w=Math.max(1,Math.round(bm.width*k)), h=Math.max(1,Math.round(bm.height*k)), c=document.createElement('canvas'); c.width=w; c.height=h;
      var x=c.getContext('2d'); x.drawImage(bm,0,0,w,h); var d=x.getImageData(0,0,w,h).data; for(var i=3;i<d.length;i+=4) if(d[i]<250) return true; return false; }).catch(function(){ return null; }); };
})();
