/* Majnuntol: oddiy kesh, ilova tez ochilishi uchun. Har doim avval internetdan yangisini oladi. */
const C='mj-v10';
const CORE=['app.css','app.js','config.js','icon-192.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(CORE).catch(()=>{})));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  // brauzer keshini chetlab o'tib, serverdan tekshiradi (yangilanish darhol yetib boradi)
  const net=e.request.mode==='navigate'?fetch(e.request):fetch(e.request,{cache:'no-cache'});
  e.respondWith(net.then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request)));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||self.registration.scope;
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{for(const w of ws){if('focus' in w)return w.focus()}return clients.openWindow(url)}));
});
