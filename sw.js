/* Eyeblink Studio — notifications on this device (Web Push). Shows what the studio sends and opens the workspace on tap.
   Nothing is cached here: the site keeps working exactly as before. */
self.addEventListener('install',function(){ self.skipWaiting(); });
self.addEventListener('activate',function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('push',function(e){
  var d={}; try{ d=e.data?e.data.json():{}; }catch(_){ d={body:e.data&&e.data.text()}; }
  var url=d.url||'/workspace.html';
  e.waitUntil(self.registration.showNotification(d.title||'Eyeblink Studio',{ body:d.body||'', tag:d.tag||'eb', renotify:true, lang:d.lang||'ar', dir:d.dir||'rtl',
    icon:'/assets/img/icon-192.png', badge:'/assets/img/badge-72.png', data:{url:url} }));
});
self.addEventListener('notificationclick',function(e){
  e.notification.close(); var url=(e.notification.data&&e.notification.data.url)||'/workspace.html';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++){ var c=list[i]; if(/\/workspace\.html/.test(c.url)&&'focus' in c){ return c.navigate(url).then(function(w){ return (w||c).focus(); }).catch(function(){ return c.focus(); }); } }
    return self.clients.openWindow(url);
  }));
});
