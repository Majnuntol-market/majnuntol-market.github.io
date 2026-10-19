/* Majnuntol Market — xodim sahifasi va rahbar paneli (Firebase Firestore) */
(function(){
'use strict';
const CFG=window.MJ_CONFIG||{},PAGE=window.MJ||{};
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
// Majnuntol: UTC+5 (Asia/Tashkent)
const tk=()=>new Date(Date.now()+5*3600e3);
const dstr=d=>pad(d.getUTCDate())+'.'+pad(d.getUTCMonth()+1)+'.'+d.getUTCFullYear();
const stamp=()=>{const d=tk();return dstr(d)+' '+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())};
const hm=sec=>pad(Math.floor(sec/3600))+':'+pad(Math.floor(sec%3600/60));
const hms=s=>pad(Math.floor(s/3600))+':'+pad(Math.floor(s%3600/60))+':'+pad(s%60);
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
const lsDel=k=>{try{localStorage.removeItem(k)}catch(e){}};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MONTHS=['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
const fmtS=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,' ')+" so'm";
const standalone=()=>{try{return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}catch(e){return false}};
function level(p){
  if(p==null)return{c:'var(--muted)',t:'Baholanmagan'};
  if(p>=85)return{c:'var(--top)',t:"A'lo"};
  if(p>=65)return{c:'var(--good)',t:'Yaxshi'};
  if(p>=40)return{c:'var(--mid)',t:"O'rtacha"};
  return{c:'var(--low)',t:'Past'};
}
// Shijoat: shu kungi vazifalarga qo'yilgan baholar yig'indisi / (vazifalar soni × 10). Har kuni 0% dan boshlanadi.
const ymdTk=(o)=>{const d=new Date(tk().getTime()+(o||0)*864e5);return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())};
/* Baho: 👍 +5, 🤏 0, 👎 -5 ochko. Ochko cheklanmagan, manfiy ham bo'ladi. */
const GV={up:5,mid:0,down:-5},GE={up:'👍',mid:'🤏',down:'👎'},GT={up:"Zo'r",mid:"O'rtacha",down:'Yoqmadi'};
const gOf=v=>v&&typeof v==='object'&&GV[v.g]!==undefined?v.g:null;
function ptsOf(st){let tot=0,today=0,yest=0,c={up:0,mid:0,down:0};const td=ymdTk(0),yd=ymdTk(-1);
  Object.values(st.grades||{}).forEach(v=>{const g=gOf(v);if(!g)return;tot+=GV[g];c[g]++;const d=ymdTk2(v.at);if(d===td)today+=GV[g];else if(d===yd)yest+=GV[g]});
  return{tot,today,yest,c}}
const ymdTk2=ms=>{const d=new Date((ms||0)+5*3600e3);return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())};
const sgn=n=>n>0?'+'+n:n<0?'−'+Math.abs(n):'0';
const pcol=n=>n>0?'var(--good)':n<0?'var(--low)':'var(--muted)';
// baho qo'yish: bahoni saqlaydi, so'ng rasmni ikkala tomonda ham o'chiradi
async function gradeTask(sid,tid,g,meta){
  await db.collection('staff').doc(sid).set({grades:{[tid]:{g,at:Date.now(),text:(meta&&meta.text)||'',date:(meta&&meta.date)||''}},updated:stamp()},{merge:true});
  const pc=db.collection('staff').doc(sid).collection('photos');
  for(const k of [tid,tid+'_a',tid+'_b']){try{await pc.doc(k).delete()}catch(e){}}
}
/* ---------- Mustaqil vazifa: xodim taklif qiladi -> rahbar "Boshlang" -> xodim natijani yuboradi -> rahbar baholaydi ---------- */
const isSelf=k=>/^self_/.test(k);
function selfGroups(list,grades){const G={};
  list.forEach(p=>{const m=/^(self_[a-z0-9]+)_(a|b)$/.exec(p.id);if(m){(G[m[1]]=G[m[1]]||{id:m[1]})[m[2]]=p}});
  return Object.values(G).filter(g=>!gOf((grades||{})[g.id])).sort((x,y)=>((y.a||y.b).at||0)-((x.a||x.b).at||0))}
function selfThumb(ph,label){const w=document.createElement('div');w.className='sth';
  const im=document.createElement('img');im.alt=label;im.src=ph.img;im.onclick=()=>zoom(ph.img);
  const l=document.createElement('small');l.textContent=label+' · '+atStr(ph.at).slice(11);w.append(im,l);return w}
function selfPhotos(g){const r=document.createElement('div');r.className='sphotos';
  if(g.a)r.appendChild(selfThumb(g.a,'Oldin'));if(g.b)r.appendChild(selfThumb(g.b,'Keyin'));return r}
function selfBossBox(sid,g,stt,name){
  const ph=g.a||g.b,text=ph.text||'',box=document.createElement('div');box.className='pbox selfb';
  const l=document.createElement('span');l.className='plabel';l.textContent='🙋 '+name+' · '+text;box.appendChild(l);
  box.appendChild(selfPhotos(g));
  const ref=db.collection('staff').doc(sid);
  if(g.b){const h=document.createElement('small');h.className='glbl';h.textContent='Ish tugadi. Baho qo\'ying (rasmlar keyin o\'chadi):';box.appendChild(h);
    box.appendChild(gradeButtons(null,async k=>{try{await gradeTask(sid,g.id,k,{text,date:ph.date});toast(name+': '+GE[k]+' '+sgn(GV[k])+' ochko')}catch(e){toast("Saqlab bo'lmadi, internetni tekshiring")}}))}
  else if(!stt){const h=document.createElement('small');h.className='glbl';h.textContent='Xodim shu ishni qilmoqchi. Ruxsat berasizmi?';box.appendChild(h);
    const two=document.createElement('div');two.className='two';
    const go=document.createElement('button');go.className='btn yes';go.textContent='▶️ Boshlang';
    const no=document.createElement('button');no.className='btn no';no.textContent='✋ Kerak emas';
    go.onclick=async()=>{go.disabled=no.disabled=true;try{await ref.set({selfTasks:{[g.id]:{s:'go',at:Date.now(),text}},updated:stamp()},{merge:true});toast(name+'ga «Boshlang» yuborildi')}catch(e){go.disabled=no.disabled=false;toast("Saqlab bo'lmadi")}};
    no.onclick=async()=>{go.disabled=no.disabled=true;try{await ref.set({selfTasks:{[g.id]:{s:'no',at:Date.now(),text}},updated:stamp()},{merge:true});
      for(const k of [g.id+'_a',g.id+'_b']){try{await ref.collection('photos').doc(k).delete()}catch(e){}}toast(name+'ga «Kerak emas» yuborildi')}catch(e){go.disabled=no.disabled=false;toast("Saqlab bo'lmadi")}};
    two.append(go,no);box.appendChild(two)}
  else{const h=document.createElement('span');h.className='gchip g-mid';h.textContent='▶️ Ruxsat berildi · xodim bajarmoqda…';box.appendChild(h)}
  return box;
}
function gradeButtons(cur,onPick){
  const gr=document.createElement('div');gr.className='emo';
  ['up','mid','down'].forEach(k=>{const b=document.createElement('button');b.className='e-'+k+(cur===k?' on':'');
    b.innerHTML='<span>'+GE[k]+'</span><small>'+GT[k]+' · '+(GV[k]>0?'+5':GV[k]<0?'−5':'0')+'</small>';
    b.setAttribute('aria-label',GT[k]);b.onclick=()=>{gr.querySelectorAll('button').forEach(x=>x.disabled=true);onPick(k)};gr.appendChild(b)});
  return gr;
}
function gradeChip(v){const g=gOf(v);const s=document.createElement('span');s.className='gchip g-'+g;
  s.textContent=GE[g]+' '+GT[g]+' · '+(GV[g]>0?'+5 ochko':GV[g]<0?'−5 ochko':'ochko o\'zgarmadi');return s}
function dayZeal(st,date){
  const ts=(st.tasks||[]).filter(x=>x.date===date),g=st.grades||{};
  const graded=ts.filter(x=>typeof g[x.id]==='number');
  const sum=graded.reduce((a,x)=>a+g[x.id],0);
  return{pct:ts.length?Math.round(sum/(ts.length*10)*100):0,tasks:ts.length,graded:graded.length,sum};
}
function toast(t){const el=$('toast');if(!el)return;el.textContent=t;el.hidden=false;clearTimeout(el._t);el._t=setTimeout(()=>el.hidden=true,2600)}

/* ---------- Firebase ---------- */
let db=null,auth=null;
function initFirebase(){
  if(!CFG.firebase||!CFG.firebase.apiKey||String(CFG.firebase.apiKey).indexOf('PASTE')===0)return false;
  try{firebase.initializeApp(CFG.firebase);db=firebase.firestore();if(firebase.auth)auth=firebase.auth();return true}catch(e){console.error(e);return false}
}
const staffRef=id=>db.collection('staff').doc(id);
const atStr=ms=>{const d=new Date((ms||0)+5*3600e3);return dstr(d)+' '+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())};
const isMobile=()=>/iPhone|iPad|iPod|Android/.test(navigator.userAgent||'');
const buzz=()=>{try{navigator.vibrate&&navigator.vibrate(80)}catch(e){}};

/* ---------- Rasm: siqish va kattalashtirib ko'rish ---------- */
function shrink(file){
  return new Promise((res,rej)=>{
    const u=URL.createObjectURL(file),im=new Image();
    im.onload=()=>{try{
      const w=im.naturalWidth,h=im.naturalHeight;let s=Math.min(1,1100/Math.max(w,h)),q=.72,out='';
      const c=document.createElement('canvas');
      for(let i=0;i<6;i++){c.width=Math.max(1,Math.round(w*s));c.height=Math.max(1,Math.round(h*s));
        c.getContext('2d').drawImage(im,0,0,c.width,c.height);out=c.toDataURL('image/jpeg',q);
        if(out.length<700000)break;s*=.8;q=Math.max(.4,q-.08)}
      URL.revokeObjectURL(u);res(out)}catch(e){URL.revokeObjectURL(u);rej(e)}};
    im.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('img'))};
    im.src=u;
  });
}
function pickImage(cb){
  const inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.hidden=true;
  document.body.appendChild(inp);
  inp.onchange=()=>{const f=inp.files&&inp.files[0];inp.remove();if(f)cb(f)};
  inp.click();
}
function zoom(src){
  const z=document.createElement('div');z.className='zoom';z.setAttribute('role','dialog');z.setAttribute('aria-label','Rasm');
  z.innerHTML='<img alt="Vazifa rasmi"><button class="zx" aria-label="Yopish">✕</button>';
  z.querySelector('img').src=src;z.onclick=()=>z.remove();document.body.appendChild(z);
}

/* ---------- Jamoa chati ---------- */
const chatMarkup=()=>'<section class="card" id="chatCard"><h2>Jamoa chati</h2><div class="chat" id="chatList"><p class="hint">Yuklanmoqda…</p></div>'
  +'<div class="chatin"><textarea id="chatTx" rows="1" maxlength="1000" placeholder="Xabar yozing…" aria-label="Xabar"></textarea><button class="btn" id="chatSend" aria-label="Yuborish">➤</button></div></section>';
let unsubChat=null;
function stopChat(){if(unsubChat){unsubChat();unsubChat=null}}
function wireChat(me){
  stopChat();
  const L=$('chatList'),tx=$('chatTx'),bt=$('chatSend');if(!L)return;
  let first=true;
  const send=async()=>{const v=tx.value.trim();if(!v)return;bt.disabled=true;
    try{await db.collection('chat').add({uid:me.uid,name:me.name,text:v.slice(0,1000),at:Date.now()});tx.value='';tx.style.height=''}
    catch(e){toast(e&&e.code==='permission-denied'?"Chat hali yoqilmagan: Firestore qoidalarini yangilang":"Yuborilmadi, internetni tekshiring")}
    bt.disabled=false};
  bt.onclick=send;
  tx.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!isMobile()){e.preventDefault();send()}};
  tx.oninput=()=>{tx.style.height='auto';tx.style.height=Math.min(tx.scrollHeight,120)+'px'};
  unsubChat=db.collection('chat').orderBy('at','desc').limit(80).onSnapshot(q=>{
    if(!$('chatList'))return;
    const msgs=[];q.forEach(d=>msgs.push(d.data()));msgs.reverse();
    const atBottom=L.scrollHeight-L.scrollTop-L.clientHeight<80;
    L.innerHTML='';
    if(!msgs.length)L.innerHTML='<p class="hint">Hali xabar yo\'q. Birinchi bo\'lib yozing!</p>';
    let lastDay='';const today=dstr(tk());
    msgs.forEach(m=>{
      const d=new Date((m.at||0)+5*3600e3),day=dstr(d);
      if(day!==lastDay){lastDay=day;const s=document.createElement('div');s.className='cday';s.textContent=day===today?'Bugun':day;L.appendChild(s)}
      const mine=m.uid===me.uid,boss=m.uid==='admin',b=document.createElement('div');
      b.className='msg'+(mine?' me':'')+(boss?' boss':'');
      b.innerHTML='<span class="mn"></span><span class="mt"></span><span class="mh"></span>';
      b.querySelector('.mn').textContent=boss?'Rahbar':(m.name||'Xodim');
      b.querySelector('.mt').textContent=m.text||'';
      b.querySelector('.mh').textContent=pad(d.getUTCHours())+':'+pad(d.getUTCMinutes());
      L.appendChild(b)});
    if(first||atBottom)L.scrollTop=L.scrollHeight;
    if(!first){const nw=q.docChanges().filter(c=>c.type==='added'&&c.doc.data().uid!==me.uid);
      if(nw.length){const m=nw[nw.length-1].doc.data();toast('💬 '+(m.uid==='admin'?'Rahbar':m.name)+': '+String(m.text||'').slice(0,60));buzz();if(document.hidden)notify('💬 '+(m.uid==='admin'?'Rahbar':m.name),String(m.text||'').slice(0,140),'chat')}}
    first=false;
  },()=>{if($('chatList'))$('chatList').innerHTML='<p class="err">Chat yuklanmadi. Firestore qoidalarini yangilash kerak.</p>'});
}

/* ---------- Telefon bildirishnomasi (ilova ichida, bot kerak emas) ---------- */
const canNotify=()=>{try{return 'Notification' in window&&'serviceWorker' in navigator}catch(e){return false}};
async function notify(title,body,tag){
  try{if(!canNotify()||Notification.permission!=='granted')return;
    const reg=await navigator.serviceWorker.ready;
    await reg.showNotification(title,{body,tag:tag||'mj',renotify:true,icon:PAGE.root+'icon-192.png',badge:PAGE.root+'icon-192.png',data:{url:location.href}})}catch(e){}
}

/* ---------- Yangilanish ---------- */
// MUHIM: har safar ilova o'zgartirilganda APP_V va version.json dagi "v" bittaga oshiriladi.
const APP_V=10;
let updShown=false;
async function checkUpdate(){
  try{const r=await fetch(PAGE.root+'version.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)return;const j=await r.json();
    if(j&&j.v>APP_V&&!updShown)showUpdate(j)}catch(e){}
}
function showUpdate(j){
  updShown=true;
  const b=document.createElement('div');b.className='upd';b.setAttribute('role','alert');
  b.innerHTML='<span class="ut"><b>'+(PAGE.mode==='admin'?'Panelning yangi versiyasi tayyor':'Rahbar ilovani yangiladi')+'</b><small></small></span><button class="btn">Yangilash</button>';
  b.querySelector('small').textContent=j.note||"Yangi imkoniyatlar qo'shildi";
  b.querySelector('button').onclick=e=>{e.target.disabled=true;e.target.textContent='Yangilanmoqda…';doUpdate()};
  document.body.appendChild(b);buzz();
  notify('🔄 Majnuntol yangilandi',(j.note||"Yangi imkoniyatlar qo'shildi")+'. Ilovani oching va "Yangilash" ni bosing.','update');
}
async function doUpdate(){
  try{const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration();if(reg)await reg.update()}catch(e){}
  try{const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)))}catch(e){}
  location.reload();
}
if(PAGE.mode==='admin'){document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkUpdate()});setInterval(checkUpdate,60000)}

/* ---------- PWA ---------- */
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;const b=$('instBtn');if(b)b.hidden=false;const s=$('instSteps');if(s)s.hidden=true});
window.addEventListener('appinstalled',()=>{lsSet('mj_inst','1');toast("Ilova o'rnatildi. Belgini ilovalar ro'yxatidan toping")});
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register(PAGE.root+'sw.js').catch(()=>{})})}

function installCard(){
  if(standalone()||lsGet('mj_inst')==='1')return '';
  const ios=PAGE.os==='ios'||(PAGE.os==='auto'&&/iPhone|iPad|iPod/.test(navigator.userAgent||''));
  const steps=ios
    ?['Bu sahifani <b>Safari</b>da oching. Telegramda ochilgan bo\'lsa, pastdagi kompas belgisini bosing.','Pastdagi <b>Ulashish</b> tugmasini bosing (kvadrat va yuqoriga strelka).','<b>"На экран «Домой»"</b> (Add to Home Screen) ni tanlang.','O\'ng tepadagi <b>"Добавить"</b> (Add) ni bosing.']
    :['Bu sahifani <b>Chrome</b>da oching. Telegramda ochilgan bo\'lsa, <b>⋮</b> → <b>"Brauzerda ochish"</b>.','Yuqori o\'ngdagi <b>⋮</b> menyusini bosing.','<b>"Ilovani o\'rnatish"</b> yoki <b>"Bosh ekranga qo\'shish"</b> ni tanlang.','<b>"O\'rnatish"</b> ni bosing.'];
  return '<section class="inst" id="instCard"><div class="ih"><span class="ico"></span><span class="it"><b>Ilovani telefonga o\'rnating</b><small>Sizning telefoningiz: <b>'+(ios?'iPhone':'Android')+'</b>. O\'rnatgach, Majnuntol belgisi ekranda boshqa ilovalar qatorida turadi.</small></span></div>'
   +'<button class="btn" id="instBtn" hidden>Telefonga o\'rnatish</button>'
   +'<ol id="instSteps">'+steps.map(s=>'<li>'+s+'</li>').join('')+'</ol>'
   +'<button class="done" id="instDone">O\'rnatdim, yashirish</button></section>';
}
function wireInstall(){
  const b=$('instBtn'),d=$('instDone');
  if(b){if(deferredPrompt){b.hidden=false;$('instSteps').hidden=true}
    b.onclick=async()=>{
      const steps=$('instSteps');
      if(!deferredPrompt){b.hidden=true;steps.hidden=false;return}
      let ok=false;
      try{await deferredPrompt.prompt();const r=await deferredPrompt.userChoice;ok=!!(r&&r.outcome==='accepted')}catch(e){}
      deferredPrompt=null;b.hidden=true;
      if(ok){lsSet('mj_inst','1');steps.innerHTML='<li><b>O\'rnatildi!</b> Majnuntol belgisi bir necha soniyada paydo bo\'ladi.</li><li>Bosh ekranda ko\'rinmasa, ekranni pastdan yuqoriga suring: belgi ilovalar ro\'yxatida turadi. Uni bosib turib, bosh ekranga sudrab qo\'ying.</li>'}
      steps.hidden=false}}
  if(d)d.onclick=()=>{lsSet('mj_inst','1');$('instCard').hidden=true};
}

/* ---------- Xodim sahifasi ---------- */
function staffMarkup(withInstall,topbar){
  return '<div class="wrap">'+(topbar||'')
  +'<header><span class="shop">Majnuntol Market</span><h1 id="hello">Salom!</h1><span class="role" id="role" hidden>Rahbar rejimi</span></header>'
  +'<section class="card att" id="attCard"><div class="clock"><h2>Davomat</h2><span class="now" id="attDate"></span></div><div class="arow"><div><small>Keldim</small><b id="attIn">—</b></div><div><small>Ketdim</small><b id="attOut">—</b></div></div><div class="anote" id="attNote" role="status" hidden></div>'+(withInstall?'<button class="btn big" id="attBtn">✅ Ishga keldim</button>':'')+'<div class="alog" id="attLog" hidden></div></section>'
  +(withInstall?installCard():'')
  +(withInstall?'<section class="card tgc" id="ntCard" hidden><div class="ih"><span class="bell">🔔</span><span class="it"><b>Bildirishnomalarni yoqing</b><small>Rahbar vazifa berganda yoki chatga yozganda telefoningizda xabar chiqadi.</small></span></div><button class="btn" id="ntBtn">Bildirishnomalarni yoqish</button><p class="hint" id="ntHint">Telefon ruxsat so\'raganda <b>"Ruxsat berish"</b> ni bosing.</p></section>':'')
  +'<section class="card" id="clockCard"><div class="clock"><h2 id="hours">Ish vaqti</h2><span class="now" id="now">--:--</span></div><span class="state" id="state">…</span><div><div class="count" id="count">--:--:--</div><span class="countlbl" id="countlbl"></span></div><div class="bar"><i id="bar" style="width:0%"></i></div><div class="ticks"><span id="tk1"></span><span id="tk2"></span><span id="tk3"></span></div>'
  +'<div class="offer" id="offer" hidden><p><b>Ish vaqti tugadi. Qo\'shimcha ishga marhamat!</b><br>Qolib ishlashni xohlaysizmi? Javobingiz rahbarga yuboriladi.</p><div class="two" id="offerBtns"><button class="btn yes" id="yes">Ha, xohlayman</button><button class="btn no" id="no">Yo\'q, xohlamayman</button></div><div class="sent" id="sent" hidden></div></div></section>'
  +'<section class="card" id="taskCard"><h2>'+(withInstall?'Vazifalarim':'Vazifalar')+'</h2><div id="pend"></div><div class="gavg" id="gavg" hidden></div><div class="tabs2"><button id="dToday" class="on">Bugun</button><button id="dTom">Ertaga</button></div><div class="prog" id="prog" hidden><span id="progTxt"></span><div class="bar"><i id="progBar" style="width:0%"></i></div></div><div class="tasks" id="tasks"></div><p class="hint" id="thint">Vazifani bajargach, doirachani yoki <b>📷 Rasmga olib yuborish</b> tugmasini bosing — rasm to\'g\'ridan-to\'g\'ri rahbar paneliga tushadi va u baho qo\'yadi.</p><div id="tedit"></div></section>'
  +(withInstall?'<section class="card selfc" id="selfCard"><h2>🙋 Mustaqil vazifa</h2><p class="hint">O\'zingiz biror ish qilmoqchi bo\'lsangiz: qisqacha yozing va hozirgi holatni rasmga oling. Rahbar <b>«Boshlang»</b> desa, ishni bajaring va natijani yana rasmga oling. Rahbar 👍 🤏 👎 bilan baholaydi.</p><div id="selfList"></div><textarea id="selfTx" maxlength="300" placeholder="Masalan: Ichimliklar javonini tartiblab chiqaman" aria-label="Qanday ish qilmoqchisiz"></textarea><button class="btn" id="selfStart">📷 Rasmga olib, ruxsat so\'rash</button></section>'
   :'<section class="card selfc" id="selfCard" hidden><h2>🙋 Mustaqil vazifalar</h2><div id="selfList"></div></section>')
  +(withInstall?chatMarkup():'')
  +(withInstall?'<section class="card fb" id="fbCard"><h2>💬 Fikr va takliflar</h2><p class="hint">Fikr, taklif yoki shikoyatingizni yozing. Uni faqat rahbar ko\'radi, boshqa xodimlar ko\'rmaydi.</p><textarea id="fbTx" maxlength="1000" placeholder="Masalan: Mevalar rastasini kirish tomonga ko\'chirsak, xaridorlar ko\'proq ko\'radi…" aria-label="Fikr yoki taklif"></textarea><button class="btn" id="fbSend">Rahbarga yuborish</button><div class="fbmine" id="fbMine"></div></section>':'')
  +'<section class="card pts"><h2>'+(withInstall?'Mening ochkolarim':'Ochkolar')+'</h2><div class="ptop"><b class="pbig" id="pct">0</b><div class="who"><span class="pill" id="lvl">Bugun: 0</span><span class="meta" id="last"></span><span class="meta" id="zinfo">👍 +5 ochko · 🤏 o\'zgarmaydi · 👎 −5 ochko. Ochko cheklanmagan.</span></div></div><div class="gcount" id="gcnt"></div><p class="note" id="note" hidden></p><div id="histWrap" hidden><h2 style="margin-bottom:6px">Oxirgi baholar</h2><div class="glog" id="hist"></div></div><div id="editor"></div></section>'
  +'<section class="card"><h2>Ish va dam olish kunlari</h2><div class="wnav"><button id="wprev" aria-label="Oldingi oy">‹</button><b id="wname">Bu oy</b><button id="wnext" aria-label="Keyingi oy">›</button></div><span class="legend"><span><i class="wk"></i>Ishlagan</span><span><i class="rt"></i>Dam olgan</span></span><div class="wcal" id="wcal"></div><div class="wsum"><div class="ws"><small>Ishlagan kunlar</small><b id="wN">0</b></div><div class="rs"><small>Dam olgan kunlar</small><b id="rN">0</b></div></div><p class="hint" id="whint">Dam olish kunlarini rahbar belgilaydi.</p><div id="wedit"></div></section>'
  +'<section class="card"><h2>Qo\'shimcha ish daromadi</h2><div class="money"><div><small>1 kun qo\'shimcha ish</small><b>33 333 so\'m</b></div><div><small>Oyiga ko\'pi bilan (30 kun)</small><b>1 000 000 so\'m</b></div></div><div class="mhead"><span id="mname">Bu oy</span><span class="legend"><span><i class="y"></i>Ha</span><span><i class="n"></i>Yo\'q</span></span></div><div class="cal" id="cal"></div><div class="msum"><div><small>"Ha" degan kunlar</small><b class="gy" id="yesN">0 kun</b></div><div><small>"Yo\'q" degan kunlar</small><b class="gn" id="noN">0 kun</b></div></div><div class="earn"><small>Bu oy qo\'shimcha ishdan daromad</small><b id="earn">0 so\'m</b><span class="meta" id="earnCalc">Har bir "Ha" degan kun uchun 33 333 so\'m qo\'shiladi.</span></div></section>'
  +'<p class="foot" id="foot"></p></div><div class="toast" id="toast" hidden></div>';
}

let unsubStaff=null,unsubPhotos=null,tickTimer=null;
function staffView(id,canEdit,opts){
  opts=opts||{};
  const app=$('app');
  app.innerHTML=staffMarkup(!canEdit,opts.topbar);
  if(opts.onBack&&$('backBtn'))$('backBtn').onclick=opts.onBack;
  wireInstall();
  let st={id,name:PAGE.name||'Xodim',pct:null,note:'',history:[],updated:'',rest:[],tasks:[]};
  let loaded=false,editing=false,busy=false,restEdit=false,restDraft=[],viewY=tk().getUTCFullYear(),viewM=tk().getUTCMonth(),tDay=0,tEdit=false,tDraft=[];
  const START=()=>(st.start??390)*60,END=()=>(st.end??1140)*60;

  let lastDay=ymdTk(0);
  function tick(){
    if(!$('now'))return;
    if(ymdTk(0)!==lastDay){lastDay=ymdTk(0);render()}
    const d=tk(),s=d.getUTCHours()*3600+d.getUTCMinutes()*60+d.getUTCSeconds(),S=START(),E=END();
    $('now').textContent=pad(d.getUTCHours())+':'+pad(d.getUTCMinutes());
    const card=$('clockCard');
    if(s<S){card.classList.remove('night');$('state').textContent='Ish hali boshlanmadi';$('count').textContent=hms(S-s);$('countlbl').textContent='ish boshlanishiga qoldi';$('bar').style.width='0%';$('offer').hidden=true}
    else if(s<E){card.classList.remove('night');const left=E-s;$('state').textContent=left<=1800?'Ish vaqti tugashiga oz qoldi':'Ish vaqti davom etmoqda';$('count').textContent=hms(left);$('countlbl').textContent='ish vaqti tugashiga qoldi';$('bar').style.width=((s-S)/(E-S)*100).toFixed(1)+'%';$('offer').hidden=true}
    else{card.classList.add('night');$('state').textContent='Ish vaqti tugadi';$('count').textContent=hms(s-E);$('countlbl').textContent='ish vaqti tugaganidan beri';$('bar').style.width='100%';$('offer').hidden=canEdit}
  }
  function hours(){const S=START(),E=END();$('hours').textContent='Ish vaqti · '+hm(S)+' – '+hm(E);$('tk1').textContent=hm(S);$('tk2').textContent=hm(Math.round((S+E)/2/60)*60);$('tk3').textContent=hm(E)}
  function renderMonth(){
    const d=tk(),y=d.getUTCFullYear(),m=d.getUTCMonth(),today=d.getUTCDate();
    const days=new Date(Date.UTC(y,m+1,0)).getUTCDate(),first=(new Date(Date.UTC(y,m,1)).getUTCDay()+6)%7;
    $('mname').textContent=MONTHS[m]+' '+y;
    const C=$('cal');C.innerHTML='';let yes=0,no=0;
    ['Du','Se','Ch','Pa','Ju','Sh','Ya'].forEach(w=>{const h=document.createElement('div');h.className='pad';h.textContent=w;C.appendChild(h)});
    for(let i=0;i<first;i++){const p=document.createElement('div');p.className='pad';C.appendChild(p)}
    const ans=st.answers||{};
    for(let k=1;k<=days;k++){
      const key=pad(k)+'.'+pad(m+1)+'.'+y,a=canEdit?ans[key]:(lsGet('ot_'+id+'_'+key)||ans[key]);
      const c=document.createElement('div');c.textContent=k;
      if(a==='yes'){c.className='y';yes++}else if(a==='no'){c.className='n';no++}
      if(k===today)c.classList.add('today');C.appendChild(c);
    }
    const paid=Math.min(yes,30);
    $('yesN').textContent=yes+' kun';$('noN').textContent=no+' kun';$('earn').textContent=fmtS(paid*33333);
    $('earnCalc').textContent=yes?paid+" kun × 33 333 so'm":'Har bir "Ha" degan kun uchun 33 333 so\'m qo\'shiladi.';
  }
  function renderAnswer(){
    const key='ot_'+id+'_'+dstr(tk()),a=lsGet(key);
    $('offerBtns').hidden=!!a;$('sent').hidden=!a;
    if(a){$('sent').innerHTML='';
      const t=document.createElement('span');t.textContent='Bugungi javobingiz: '+(a==='yes'?'Ha, xohlayman':"Yo'q, xohlamayman")+'. Rahbar ilovada ko\'radi.';
      const re=document.createElement('button');re.className='ghost';re.style.cssText='margin-top:8px;display:block';re.textContent="Javobni o'zgartirish";
      re.onclick=()=>{lsDel(key);renderAnswer();renderMonth()};$('sent').append(t,re)}
  }
  async function answer(yes){
    const day=dstr(tk());lsSet('ot_'+id+'_'+day,yes?'yes':'no');renderAnswer();renderMonth();
    try{await staffRef(id).collection('answers').doc(day.split('.').reverse().join('-')).set({a:yes?'yes':'no',at:Date.now()});toast('Javobingiz rahbarga yuborildi')}
    catch(e){toast('Javob saqlanmadi, internetni tekshiring')}
  }
  $('yes').onclick=()=>answer(true);$('no').onclick=()=>answer(false);

  function render(){
    if(!$('hello'))return;
    $('hello').textContent='Salom, '+st.name+'!';$('role').hidden=!canEdit;
    if(canEdit)$('hello').textContent=st.name;
    const P=ptsOf(st),today=ymdTk(0),ts=(st.tasks||[]).filter(x=>x.date===today),gd=ts.filter(x=>gOf((st.grades||{})[x.id])).length;
    const pe=$('pct');pe.textContent=sgn(P.tot);pe.style.color=pcol(P.tot);
    const lv=$('lvl');lv.textContent='Bugun: '+sgn(P.today)+' ochko';lv.style.background=pcol(P.today);
    $('last').textContent=ts.length?'Bugun: '+gd+' / '+ts.length+' vazifa baholandi':'Bugunga hali vazifa berilmagan';
    $('gcnt').innerHTML='<span>👍 '+P.c.up+'</span><span>🤏 '+P.c.mid+'</span><span>👎 '+P.c.down+'</span>';
    const LG=Object.entries(st.grades||{}).filter(([k,v])=>gOf(v)).sort((x,y)=>(y[1].at||0)-(x[1].at||0)).slice(0,8);
    $('histWrap').hidden=!LG.length;$('hist').innerHTML='';
    LG.forEach(([k,v])=>{const r=document.createElement('div');r.className='gl';r.innerHTML='<span class="ge"></span><span class="gt"></span><span class="gp"></span>';
      r.querySelector('.ge').textContent=GE[v.g];r.querySelector('.gt').textContent=(v.text||'Vazifa')+' · '+atStr(v.at).slice(0,5);
      const gp=r.querySelector('.gp');gp.textContent=sgn(GV[v.g]);gp.style.color=pcol(GV[v.g]);$('hist').appendChild(r)});
    $('note').hidden=!st.note;$('note').textContent=st.note?'Rahbar izohi: '+st.note:'';
    const E=$('editor');E.innerHTML='';
    if(canEdit){
      if(!editing){const b=document.createElement('button');b.className='ghost';b.textContent=st.note?'Izohni o\'zgartirish':'Izoh yozish';b.onclick=()=>{editing=true;render()};E.appendChild(b)}
      else{E.innerHTML='<div class="edit"><label for="t">Izoh (xodim ko\'radi)<textarea id="t" placeholder="Masalan: Bugun mijozlar bilan juda yaxshi ishladi"></textarea></label><div class="rowin"><button class="btn" style="flex:1" id="sv">Saqlash</button><button class="ghost" id="cn">Bekor qilish</button></div></div>';
        const t=$('t');t.value=st.note||'';
        $('cn').onclick=()=>{editing=false;render()};
        $('sv').onclick=ev=>commit({note:t.value.trim(),updated:stamp()},ev.target,'Izoh saqlandi',()=>{editing=false})}
    }
    renderWork();renderTasks();renderSelf();hours();renderMonth();
    $('foot').textContent=st.updated?'Yangilangan: '+st.updated:(loaded?'':'Yuklanmoqda…');
  }
  function renderWork(){
    const d=tk(),ty=d.getUTCFullYear(),tm=d.getUTCMonth(),td=d.getUTCDate(),y=viewY,m=viewM;
    const days=new Date(Date.UTC(y,m+1,0)).getUTCDate(),first=(new Date(Date.UTC(y,m,1)).getUTCDay()+6)%7;
    const cmp=(y-ty)*12+(m-tm),limit=cmp<0?days:cmp>0?0:td;
    $('wname').textContent=MONTHS[m]+' '+y;
    {const h=$('wcal').closest('.card').querySelector('h2');if(h)h.textContent='Ish va dam olish kunlari · '+MONTHS[m];}
    const set=new Set(restEdit?restDraft:(st.rest||[]));
    const C=$('wcal');C.innerHTML='';C.classList.toggle('editing',restEdit);
    ['Du','Se','Ch','Pa','Ju','Sh','Ya'].forEach(w=>{const h=document.createElement('div');h.className='pad';h.textContent=w;C.appendChild(h)});
    for(let i=0;i<first;i++){const p=document.createElement('div');p.className='pad';C.appendChild(p)}
    let restPast=0,restPlan=0;
    for(let k=1;k<=days;k++){
      const key=y+'-'+pad(m+1)+'-'+pad(k),c=document.createElement('div');c.textContent=k;
      const isRest=set.has(key),past=k<=limit;
      if(isRest){c.className='r';if(past)restPast++;else restPlan++}else if(past)c.className='w';
      if(cmp===0&&k===td)c.classList.add('today');
      if(restEdit){c.setAttribute('role','button');c.tabIndex=0;
        const tog=()=>{const i=restDraft.indexOf(key);if(i>=0)restDraft.splice(i,1);else restDraft.push(key);renderWork()};
        c.onclick=tog;c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tog()}}}
      C.appendChild(c);
    }
    $('wN').textContent=(limit-restPast)+' kun';$('rN').textContent=restPast+' kun';
    $('whint').textContent=(restPlan?'Rejadagi dam olish: '+restPlan+' kun. ':'')+(restEdit?"Dam olgan kunlarni bosib belgilang, qayta bossangiz bekor bo'ladi.":(cmp===0?'Bugungacha hisoblangan. ':'')+'Dam olish kunlarini rahbar belgilaydi.');
    const E=$('wedit');E.innerHTML='';
    if(canEdit){
      if(!restEdit){const b=document.createElement('button');b.className='ghost';b.textContent='Dam olish kunlarini belgilash';b.onclick=()=>{restDraft=(st.rest||[]).slice();restEdit=true;renderWork()};E.appendChild(b)}
      else{E.innerHTML='<div class="rowin"><button class="btn" style="flex:1" id="rsv">Saqlash</button><button class="ghost" id="rcn">Bekor qilish</button></div>';
        $('rcn').onclick=()=>{restEdit=false;renderWork()};
        $('rsv').onclick=ev=>commit({rest:restDraft.slice().sort(),updated:stamp()},ev.target,'Dam olish kunlari saqlandi',()=>{restEdit=false})}
    }
  }
  $('wprev').onclick=()=>{viewM--;if(viewM<0){viewM=11;viewY--}renderWork()};
  $('wnext').onclick=()=>{viewM++;if(viewM>11){viewM=0;viewY++}renderWork()};
  const ymdOff=o=>{const d=new Date(tk().getTime()+o*864e5);return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())};
  const dmy=s=>{const[a,b,c]=s.split('-');return c+'.'+b+'.'+a};
  let photos={},upBusy=false,fresh=null;
  function sendPhoto(task){
    if(upBusy)return;
    pickImage(async f=>{
      upBusy=true;toast('Rasm yuborilmoqda…');
      try{const img=await shrink(f);
        await staffRef(id).collection('photos').doc(task.id).set({img,at:Date.now(),task:task.id,text:task.text,date:task.date});
        lsSet('td_'+id+'_'+task.id,'1');
        staffRef(id).collection('answers').doc('task_'+task.id).set({a:'done',at:Date.now(),task:task.id}).catch(()=>{});
        photos[task.id]=photos[task.id]||{img,at:Date.now(),date:task.date,text:task.text};
        renderTasks();toast('Rasm rahbarga yuborildi ✓')}
      catch(e){toast(e&&e.code==='permission-denied'?"Rasm yuborish hali yoqilmagan: Firestore qoidalarini yangilang":"Rasm yuborilmadi, qayta urinib ko'ring")}
      upBusy=false});
  }
  let selfBusy=false;
  function sendSelf(S,stage,text){
    if(selfBusy)return;
    pickImage(async f=>{selfBusy=true;toast('Rasm yuborilmoqda…');
      try{const img=await shrink(f);
        await staffRef(id).collection('photos').doc(S+'_'+stage).set({img,at:Date.now(),task:S,text:text.slice(0,300),date:ymdOff(0)});
        if(stage==='a'&&$('selfTx'))$('selfTx').value='';
        toast(stage==='a'?'Rahbarga yuborildi. «Boshlang» deyishini kuting':'Natija rahbarga yuborildi ✓');buzz()}
      catch(e){toast("Rasm yuborilmadi, qayta urinib ko'ring")}
      selfBusy=false});
  }
  function renderSelf(){
    const C=$('selfCard'),L=$('selfList');if(!C||!L)return;L.innerHTML='';
    const arr=Object.entries(photos).map(([k,v])=>Object.assign({id:k},v)),gr=st.grades||{},SM=st.selfTasks||{},today=ymdTk(0);
    const groups=selfGroups(arr,gr);
    if(canEdit){C.hidden=!groups.length;groups.forEach(g=>L.appendChild(selfBossBox(id,g,SM[g.id],st.name)));return}
    groups.forEach(g=>{const ph=g.a||g.b,stt=SM[g.id],it=document.createElement('div');it.className='selfi';
      const t=document.createElement('b');t.textContent=ph.text||'Mustaqil vazifa';it.appendChild(t);it.appendChild(selfPhotos(g));
      const s=document.createElement('span');
      if(g.b){s.className='gchip g-mid';s.textContent='⏳ Natija yuborildi · rahbar baholashi kutilmoqda'}
      else if(stt&&stt.s==='go'){s.className='gchip g-up';s.textContent='✅ Rahbar: «Boshlang!»'}
      else{s.className='gchip g-mid';s.textContent='⏳ Rahbar ruxsatini kutmoqda'}
      it.appendChild(s);
      if(!g.b&&stt&&stt.s==='go'){const b=document.createElement('button');b.className='btn';b.textContent='📷 Tugatdim — natijani rasmga olish';b.onclick=()=>sendSelf(g.id,'b',ph.text||'');it.appendChild(b)}
      L.appendChild(it)});
    // bugun yakunlanganlar
    Object.entries(SM).filter(([k,v])=>v.s==='no'&&ymdTk2(v.at)===today&&!arr.some(p=>p.id.startsWith(k))).forEach(([k,v])=>{
      const it=document.createElement('div');it.className='selfi';const t=document.createElement('b');t.textContent=v.text||'Mustaqil vazifa';
      const s=document.createElement('span');s.className='gchip g-down';s.textContent='✋ Rahbar: hozir kerak emas';it.append(t,s);L.appendChild(it)});
    Object.entries(gr).filter(([k,v])=>isSelf(k)&&gOf(v)&&ymdTk2(v.at)===today).forEach(([k,v])=>{
      const it=document.createElement('div');it.className='selfi';const t=document.createElement('b');t.textContent=v.text||'Mustaqil vazifa';it.append(t,gradeChip(v));L.appendChild(it)});
  }
  if($('selfStart'))$('selfStart').onclick=()=>{const v=($('selfTx').value||'').trim();if(!v){toast('Avval qanday ish qilmoqchi ekaningizni yozing');$('selfTx').focus();return}
    sendSelf('self_'+Date.now().toString(36),'a',v)};
  async function setGrade(tid,g,meta){
    try{await gradeTask(id,tid,g,meta);toast(GE[g]+' '+GT[g]+' · '+sgn(GV[g])+' ochko')}
    catch(e){toast(e&&e.code==='permission-denied'?"Sizda o'zgartirish huquqi yo'q":"Saqlab bo'lmadi, internetni tekshiring");render()}
  }
  function photoBox(tid,ph,label){
    const g=(st.grades||{})[tid],box=document.createElement('div');box.className='pbox';
    if(label){const l=document.createElement('span');l.className='plabel';l.textContent=label;box.appendChild(l)}
    const row=document.createElement('div');row.className='prow';
    const im=document.createElement('img');im.className='thumb';im.alt='Vazifa rasmi';im.src=ph.img;im.onclick=()=>zoom(ph.img);row.appendChild(im);
    const side=document.createElement('div');side.className='pside';
    const t=document.createElement('small');t.textContent='Yuborildi: '+atStr(ph.at);side.appendChild(t);
    if(canEdit){
      const gl=document.createElement('span');gl.className='glbl';gl.textContent='Baho qo\'ying (rasm keyin o\'chadi):';side.appendChild(gl);
      box._btns=gradeButtons(gOf(g),k=>setGrade(tid,k,{text:ph.text,date:ph.date}));
    }else{
      const s=document.createElement('b');s.className='grade';s.textContent='Rahbar baholashi kutilmoqda';side.appendChild(s);
      if(!gOf(g)){const re=document.createElement('button');re.className='ghost sm';re.textContent='Qayta suratga olish';re.onclick=()=>sendPhoto({id:tid,text:ph.text,date:ph.date});side.appendChild(re)}
    }
    row.appendChild(side);box.appendChild(row);if(box._btns)box.appendChild(box._btns);
    return box;
  }
  function renderPending(){
    const P=$('pend');if(!P)return;P.innerHTML='';
    const gr=st.grades||{},Q=ptsOf(st);
    const A=$('gavg');A.hidden=!(Q.c.up+Q.c.mid+Q.c.down);
    A.innerHTML='Jami ochko: <b style="color:'+pcol(Q.tot)+'">'+sgn(Q.tot)+'</b> <small>👍 '+Q.c.up+' · 🤏 '+Q.c.mid+' · 👎 '+Q.c.down+'</small>';
    if(!canEdit)return;
    const shown=ymdOff(tDay);
    const list=Object.entries(photos).filter(([k,p])=>!isSelf(k)&&!gOf(gr[k])&&p.date!==shown).sort((a,b)=>b[1].at-a[1].at);
    if(!list.length)return;
    const w=document.createElement('div');w.className='pend';
    const h=document.createElement('b');h.textContent='Baholash kutilmoqda: '+list.length+' ta rasm';w.appendChild(h);
    list.forEach(([k,p])=>w.appendChild(photoBox(k,p,dmy(p.date||ymdOff(0))+' · '+(p.text||''))));
    P.appendChild(w);
  }
  async function notifyTasks(added){
    if(!added.length)return;
    const today=ymdOff(0);
    const text='📋 '+st.name+', sizga yangi vazifa:\n'+added.map(x=>'• '+x.text+(x.date===today?' (bugun)':' (ertaga)')).join('\n');
    try{await db.collection('chat').add({uid:'admin',name:'Rahbar',text:text.slice(0,1000),at:Date.now()});toast('🔔 '+st.name+'ga yangi vazifa xabari yuborildi')}catch(e){}
  }

  function renderTasks(){
    const date=ymdOff(tDay);
    $('dToday').classList.toggle('on',tDay===0);$('dTom').classList.toggle('on',tDay===1);
    const list=(tEdit?tDraft:(st.tasks||[])).filter(x=>x.date===date);
    const T=$('tasks');T.innerHTML='';
    if(tEdit){
      list.forEach(x=>{const r=document.createElement('div');r.className='trow';r.style.padding='6px 0';
        r.innerHTML='<textarea aria-label="Vazifa matni"></textarea><button class="tdel">O\'chirish</button>';
        const ta=r.querySelector('textarea');ta.value=x.text;ta.id='ta-'+x.id;ta.oninput=()=>{x.text=ta.value};
        r.querySelector('.tdel').onclick=()=>{tDraft=tDraft.filter(y=>y.id!==x.id);renderTasks()};T.appendChild(r)});
      const add=document.createElement('div');add.className='addrow';add.style.marginTop='8px';
      add.innerHTML='<input id="newTask" placeholder="Yangi vazifa, masalan: Mevalarni terib qo\'yish"><button class="btn" id="addTask" style="padding:10px 14px">Qo\'shish</button>';
      T.appendChild(add);
      const doAdd=()=>{const v=$('newTask').value.trim();if(!v)return;tDraft.push({id:Date.now().toString(36),date,text:v});renderTasks();setTimeout(()=>$('newTask')&&$('newTask').focus(),0)};
      $('addTask').onclick=doAdd;$('newTask').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();doAdd()}};
      $('prog').hidden=true;
    }else{
      let done=0;const doneMap=st.done||{};
      if(!canEdit&&loaded){const all=(st.tasks||[]).map(x=>x.id),raw=lsGet('seen_'+id);let seen=[];try{seen=JSON.parse(raw||'[]')}catch(e){}
        if(fresh===null)fresh=new Set();
        if(raw!==null)all.filter(k=>seen.indexOf(k)<0).forEach(k=>fresh.add(k));
        lsSet('seen_'+id,JSON.stringify(all))}
      list.forEach((x,i)=>{
        const key='td_'+id+'_'+x.id,gv=(st.grades||{})[x.id],graded=!!gOf(gv),ph=graded?null:photos[x.id],isDone=graded||!!ph||(canEdit?!!doneMap[x.id]:(lsGet(key)==='1'));if(isDone)done++;
        const r=document.createElement('div');r.className='task'+(isDone?' done':'');
        r.innerHTML='<button class="chk" aria-label="Bajarildi deb belgilash">'+(isDone?'✓':'')+'</button><div class="tbody"><span class="tnum">'+(i+1)+'-vazifa'+(fresh&&fresh.has(x.id)&&!isDone?' <em class="new">YANGI</em>':'')+'</span><span class="ttext"></span></div>';
        r.querySelector('.ttext').textContent=x.text;
        const chk=r.querySelector('.chk');
        if(canEdit)chk.disabled=true;
        else if(!isDone)chk.onclick=()=>sendPhoto(x);
        else chk.onclick=async()=>{if(graded){toast('Rahbar baholagan: '+GE[gv.g]);return}if(ph){toast('Rasm rahbarga yuborilgan');return}lsDel(key);renderTasks();
          try{await staffRef(id).collection('answers').doc('task_'+x.id).set({a:isDone?'undone':'done',at:Date.now(),task:x.id})}catch(e){}};
        const tb=r.querySelector('.tbody');
        if(graded){tb.appendChild(gradeChip(gv));
          if(canEdit){const w=document.createElement('div');w.className='regrade';const sm=document.createElement('small');sm.className='meta';sm.textContent='Bahoni o\'zgartirish:';w.appendChild(sm);
            w.appendChild(gradeButtons(gv.g,k=>{if(k!==gv.g)setGrade(x.id,k,{text:x.text,date:x.date});else renderTasks()}));tb.appendChild(w)}}
        else if(ph)tb.appendChild(photoBox(x.id,ph));
        else if(!canEdit){const b=document.createElement('button');b.className='photo';b.textContent='📷 Rasmga olib yuborish';b.onclick=()=>sendPhoto(x);tb.appendChild(b)}
        else{const s=document.createElement('small');s.className='meta';s.textContent=isDone?'Bajarildi, rasm yuborilmagan':'Rasm hali yuborilmagan';tb.appendChild(s)}
        T.appendChild(r)});
      if(!list.length)T.innerHTML='<p class="hint" style="padding:8px 0">'+(tDay===0?'Bugunga hali vazifa berilmagan.':'Ertangi vazifalar hali berilmagan.')+'</p>';
      $('prog').hidden=!list.length;
      if(list.length){$('progTxt').textContent='Bajarildi: '+done+' / '+list.length;$('progBar').style.width=(done/list.length*100)+'%'}
    }
    $('thint').hidden=canEdit||tEdit||!list.length;
    renderPending();
    const E=$('tedit');E.innerHTML='';
    if(canEdit){
      if(!tEdit){const b=document.createElement('button');b.className='ghost';b.textContent='Vazifa berish';b.onclick=()=>{tDraft=JSON.parse(JSON.stringify(st.tasks||[]));tEdit=true;renderTasks()};E.appendChild(b)}
      else{E.innerHTML='<div class="rowin"><button class="btn" style="flex:1" id="tsv">Saqlash va yuborish</button><button class="ghost" id="tcn">Bekor qilish</button></div>';
        $('tcn').onclick=()=>{tEdit=false;renderTasks()};
        $('tsv').onclick=ev=>{const keep=ymdOff(-14),old=new Set((st.tasks||[]).map(x=>x.id));
          const next=tDraft.filter(x=>x.text.trim()&&x.date>=keep).map(x=>({id:x.id,date:x.date,text:x.text.trim()}));
          const added=next.filter(x=>!old.has(x.id)&&x.date>=ymdOff(0));
          commit({tasks:next,updated:stamp()},ev.target,'Vazifalar saqlandi',()=>{tEdit=false;notifyTasks(added)})}}
    }
  }
  $('dToday').onclick=()=>{tDay=0;renderTasks()};$('dTom').onclick=()=>{tDay=1;renderTasks()};
  async function commit(patch,btn,okMsg,after){
    if(busy||!canEdit)return;busy=true;btn.disabled=true;const lbl=btn.textContent;btn.textContent='Saqlanmoqda…';
    try{await staffRef(id).set(patch,{merge:true});busy=false;if(after)after();render();toast(okMsg)}
    catch(e){busy=false;btn.disabled=false;btn.textContent=lbl;toast(e&&e.code==='permission-denied'?"Sizda o'zgartirish huquqi yo'q":"Saqlab bo'lmadi, internetni tekshiring")}
  }

  /* ---- Davomat: Ishga keldim / Ishdan ketdim ---- */
  const AK='att_'+id;
  const attLoad=()=>{try{return JSON.parse(lsGet(AK)||'{}')||{}}catch(e){return {}}};
  const nowHM=()=>{const d=tk();return pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())};
  const minOf=t=>{const [h,m]=String(t).split(':');return (+h)*60+(+m)};
  function attNote(kind,t,late){
    const n=$('attNote');if(!n)return;n.className='anote '+kind;n.innerHTML='<b></b><span></span>';
    n.querySelector('b').textContent=kind==='in'?'Ishga keldingiz ✓':'Ishdan ketdingiz ✓';
    n.querySelector('span').textContent=(kind==='in'?'Kelgan vaqtingiz ':'Ketgan vaqtingiz ')+t+' rahbarga yuborildi.'+(late?' '+late:'');
    n.hidden=false;clearTimeout(n._t);n._t=setTimeout(()=>{n.hidden=true},8000);
  }
  function renderAtt(){
    if(!$('attCard'))return;
    const day=ymdTk(0);$('attDate').textContent=dstr(tk());
    const rec=canEdit?((st.att||{})[day]||{}):(attLoad()[day]||{});
    const i=rec.in||rec.i,o=rec.out||rec.o;
    $('attIn').textContent=i||'—';$('attOut').textContent=o||'—';
    const S=START()/60;$('attIn').className=i&&minOf(i)>S+5?'late':'';
    const B=$('attBtn');
    if(B){B.hidden=!!o;B.textContent=i?'🏁 Ishdan ketdim':'✅ Ishga keldim';B.classList.toggle('out',!!i)}
    const L=$('attLog');
    if(canEdit&&L){
      const A=st.att||{},rows=[];
      for(let k=-1;k>=-7;k--){const d=ymdTk(k),r=A[d];if(r)rows.push('<div><span>'+esc(d.split('-').reverse().join('.'))+'</span><span>'+esc(r.in||'—')+' → '+esc(r.out||'—')+'</span></div>')}
      L.hidden=!rows.length;L.innerHTML=rows.length?'<small>Oxirgi kunlar</small>'+rows.join(''):'';
      if(!i)$('attIn').textContent='Hali kelmadi';
    }
  }
  async function attPress(){
    const all=attLoad(),day=ymdTk(0),rec=all[day]||{},t=nowHM();
    if(!rec.i){rec.i=t;all[day]=rec;lsSet(AK,JSON.stringify(all));
      const lateMin=minOf(t)-START()/60;attNote('in',t,lateMin>5?'Kechikish: '+lateMin+' daqiqa.':'')}
    else if(!rec.o){if(!confirm('Ishdan ketayotganingizni tasdiqlaysizmi? ('+t+')'))return;
      rec.o=t;all[day]=rec;lsSet(AK,JSON.stringify(all));attNote('out',t,'')}
    else return;
    renderAtt();buzz();
    try{await staffRef(id).collection('answers').doc('att_'+day).set({a:'att',in:rec.i,out:rec.o||null,at:Date.now()})}
    catch(e){toast('Vaqt saqlandi, lekin rahbarga yetmadi. Internetni tekshiring')}
  }
  if($('attBtn'))$('attBtn').onclick=attPress;
  setInterval(()=>{if($('attCard'))renderAtt()},30000);

  /* ---- Fikr va takliflar (faqat rahbar ko'radi) ---- */
  const FK='fb_'+id;
  const fbLoad=()=>{try{return JSON.parse(lsGet(FK)||'[]')||[]}catch(e){return []}};
  function renderFb(){
    const M=$('fbMine');if(!M)return;const L=fbLoad();M.innerHTML='';
    if(!L.length)return;
    const h=document.createElement('small');h.className='meta';h.textContent='Siz yuborganlar';M.appendChild(h);
    L.slice(-5).reverse().forEach(x=>{const b=document.createElement('div');b.className='fbi';
      b.innerHTML='<span></span><small></small>';b.querySelector('span').textContent=x.text;b.querySelector('small').textContent=atStr(x.at)+' · rahbarga yuborildi ✓';M.appendChild(b)});
  }
  if($('fbSend')){
    $('fbSend').onclick=async()=>{
      const tx=$('fbTx'),v=tx.value.trim();if(!v){tx.focus();return}
      const bt=$('fbSend');bt.disabled=true;bt.textContent='Yuborilmoqda…';const at=Date.now();
      try{await staffRef(id).collection('answers').doc('fb_'+at).set({a:'fb',text:v.slice(0,1000),name:st.name||PAGE.name||'Xodim',at});
        const L=fbLoad();L.push({text:v.slice(0,1000),at});lsSet(FK,JSON.stringify(L.slice(-20)));
        tx.value='';renderFb();toast('Fikringiz rahbarga yuborildi ✓');buzz()}
      catch(e){toast('Yuborilmadi, internetni tekshiring')}
      bt.disabled=false;bt.textContent='Rahbarga yuborish'};
    renderFb();
  }

  if(unsubStaff)unsubStaff();
  unsubStaff=staffRef(id).onSnapshot(snap=>{
    loaded=true;
    if(!snap.exists){$('foot').textContent='Sahifa topilmadi. Rahbardan yangi havola so\'rang.';return}
    st=Object.assign({},st,snap.data(),{id});render();
  },err=>{$('foot').textContent="Ma'lumot yuklanmadi. Internetni tekshiring.";console.error(err)});
  if(canEdit){
    // xodim javoblarini rahbarga ko'rsatish
    staffRef(id).collection('answers').onSnapshot(q=>{
      const ans={},done={};
      const att={};
      q.forEach(d=>{const v=d.data();if(d.id.startsWith('task_')){if(v.a==='done')done[v.task]=1}else if(d.id.startsWith('att_')){att[d.id.slice(4)]=v}else if(d.id.startsWith('fb_')){}else{const [y,m,dd]=d.id.split('-');ans[dd+'.'+m+'.'+y]=v.a}});
      st.answers=ans;st.done=done;st.att=att;if($('cal')){renderMonth();renderTasks();renderAtt()}
    },()=>{});
  }
  // vazifa rasmlari (xodim ham, rahbar ham ko'radi)
  if(unsubPhotos)unsubPhotos();
  let phFirst=true;
  unsubPhotos=staffRef(id).collection('photos').onSnapshot(q=>{
    photos={};q.forEach(d=>photos[d.id]=d.data());
    if(canEdit&&!phFirst&&q.docChanges().some(c=>c.type!=='removed')){toast('📷 '+st.name+' yangi rasm yubordi');buzz()}
    phFirst=false;if($('tasks')&&!tEdit)renderTasks();renderSelf();
  },()=>{});
  if(!canEdit){
    // yangi vazifa kelganda ilova ochiq bo'lsa ham xabar beradi
    let seen=null;const prevRender=render;
    let seenG=null,seenS=null;
    render=function(){const ids=(st.tasks||[]).map(x=>x.id);
      const gk=Object.entries(st.grades||{}).filter(([k,v])=>gOf(v));
      if(seenG&&loaded){const nw=gk.filter(([k,v])=>seenG[k]!==v.g);if(nw.length){const v=nw[nw.length-1][1];const m=GE[v.g]+' Rahbar bahosi: '+GT[v.g]+' ('+sgn(GV[v.g])+' ochko)';toast(m);buzz();notify(m,v.text||'','grade')}}
      if(loaded){seenG={};gk.forEach(([k,v])=>seenG[k]=v.g)}
      const sm=st.selfTasks||{};
      if(seenS&&loaded){Object.entries(sm).forEach(([k,v])=>{if(seenS[k]!==v.s){const m=v.s==='go'?'✅ Rahbar: «Boshlang!» — '+(v.text||''):'✋ Rahbar: hozir kerak emas — '+(v.text||'');toast(m);buzz();notify(v.s==='go'?'✅ Boshlang!':'✋ Kerak emas',v.text||'','self')}})}
      if(loaded){seenS={};Object.entries(sm).forEach(([k,v])=>seenS[k]=v.s)}
      if(seen&&loaded){const nw=(st.tasks||[]).filter(x=>!seen.has(x.id)&&x.date>=ymdOff(0));if(nw.length){toast('📋 Yangi vazifa: '+nw[0].text.slice(0,60));buzz();notify('📋 Yangi vazifa',nw.map(x=>'• '+x.text).join('\n'),'task')}}
      if(loaded)seen=new Set(ids);prevRender()};
    const nc=$('ntCard');
    if(nc&&canNotify()&&Notification.permission==='default'){nc.hidden=false;
      $('ntBtn').onclick=async()=>{try{const p=await Notification.requestPermission();
        if(p==='granted'){nc.hidden=true;toast('🔔 Bildirishnomalar yoqildi');notify('Majnuntol Market','Bildirishnomalar yoqildi ✓','test')}
        else{$('ntHint').textContent='Ruxsat berilmadi. Telefon sozlamalaridan yoqishingiz mumkin.'}}catch(e){}}}
    wireChat({uid:id,name:st.name||PAGE.name||'Xodim'});
  }else stopChat();
  render();renderAnswer();renderAtt();tick();
  clearInterval(tickTimer);tickTimer=setInterval(tick,1000);
}

/* ---------- Rahbar paneli ---------- */
function adminLogin(msg){
  const app=$('app');
  app.innerHTML='<div class="wrap"><header><span class="shop">Majnuntol Market</span><h1>Rahbar paneli</h1></header>'
   +'<section class="card login"><h2>Kirish</h2><button class="btn" id="gBtn">Google bilan kirish</button>'
   +'<p class="hint">yoki email va parol bilan:</p><input type="email" id="em" placeholder="Email" autocomplete="username"><input type="password" id="pw" placeholder="Parol" autocomplete="current-password"><button class="ghost" id="eBtn">Kirish</button>'
   +'<p class="err" id="err"'+(msg?'':' hidden')+'>'+esc(msg||'')+'</p></section></div><div class="toast" id="toast" hidden></div>';
  const show=e=>{const el=$('err');el.hidden=false;el.textContent=e};
  $('gBtn').onclick=async()=>{const p=new firebase.auth.GoogleAuthProvider();
    try{await auth.signInWithPopup(p)}catch(e){if(e&&(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment'))auth.signInWithRedirect(p);else show('Kirib bo\'lmadi: '+(e.message||e.code))}};
  $('eBtn').onclick=async()=>{try{await auth.signInWithEmailAndPassword($('em').value.trim(),$('pw').value)}catch(e){show("Email yoki parol noto'g'ri")}};
}
function base(){return location.href.replace(/#.*$/,'').replace(/rahbar\/(index\.html)?$/,'')}
function copy(text,btn,label){const done=()=>{btn.textContent='Nusxalandi';setTimeout(()=>btn.textContent=label,1500)};try{navigator.clipboard.writeText(text).then(done,()=>prompt('Nusxalang:',text))}catch(e){prompt('Nusxalang:',text)}}
let unsubList=null,unsubPend=null,adminSubs=[];
function adminList(user){
  if(unsubStaff){unsubStaff();unsubStaff=null}if(unsubPhotos){unsubPhotos();unsubPhotos=null}clearInterval(tickTimer);tickTimer=null;
  const app=$('app');
  app.innerHTML='<div class="wrap"><header><span class="shop">Majnuntol Market</span><h1>Rahbar paneli</h1><span class="meta">'+esc(user.email||'')+'</span></header>'
   +installCard()
   +'<section class="card"><h2>Xodimlar</h2><div id="slist"><p class="hint">Yuklanmoqda…</p></div></section>'
   +'<section class="card" id="feedCard"><h2>Bajarilgan vazifalar</h2><div id="ntA"></div><div id="feed"><p class="hint">Yuklanmoqda…</p></div></section>'
   +'<section class="card" id="fbAdmin"><h2>💬 Fikr va takliflar</h2><div id="fbList"><p class="hint">Yuklanmoqda…</p></div></section>'
   +chatMarkup()
   +'<section class="card"><h2>Ilova yangilanishi</h2><p class="hint" id="updInfo" style="color:var(--fg);line-height:1.5">Yuklanmoqda…</p><button class="btn" id="updSend" hidden>📢 Xodimlarga yangilanishni yuborish</button></section>'
   +'<section class="card"><h2>Ish tartibi</h2><p class="hint" style="color:var(--fg);line-height:1.5">Shoxjaxon va Hayrullo 06:30 – 19:00, Iqbolmirzo 09:30 – 22:00. Qo\'shimcha ish: kuniga 33 333 so\'m, oyiga ko\'pi bilan 1 000 000 so\'m.</p></section>'
   +'<button class="ghost" id="out" style="align-self:center">Chiqish</button></div><div class="toast" id="toast" hidden></div>';
  wireInstall();
  wireChat({uid:'admin',name:'Rahbar'});
  db.collection('settings').doc('update').get().then(sn=>{
    const d=sn.exists?sn.data():null,sent=d?d.v:0,I=$('updInfo'),B=$('updSend');if(!I)return;
    if(sent>=APP_V){I.innerHTML='Xodimlar ilovasi eng oxirgi versiyada ✓ <small class="meta">(v'+APP_V+')</small>';return}
    I.innerHTML='Yangi versiya tayyor (v'+APP_V+'). Tugmani bosing — har bir xodim ilovasida <b>"Yangilash"</b> so\'raladi, ular bosishi bilan ilova o\'zi yangilanadi.';
    B.hidden=false;
    B.onclick=async()=>{B.disabled=true;
      try{await db.collection('settings').doc('update').set({v:APP_V,note:"Mustaqil vazifa: xodim o'zi taklif qiladi, rahbar Boshlang deydi va baholaydi",at:Date.now()});
        B.hidden=true;I.innerHTML='Yuborildi ✓ Xodimlar ilovani ochganda <b>"Yangilash"</b> so\'raladi.';toast('📢 Yangilanish xodimlarga yuborildi')}
      catch(e){B.disabled=false;toast(e&&e.code==='permission-denied'?'Yuborib bo\'lmadi: Firestore qoidalarini yangilang':'Yuborib bo\'lmadi, internetni tekshiring')}};
  }).catch(()=>{const I=$('updInfo');if(I)I.textContent='Yangilanish holatini o\'qib bo\'lmadi. Firestore qoidalarini yangilang.'});
  $('out').onclick=()=>{stopChat();auth.signOut()};
  if(unsubList)unsubList();
  if(unsubPend){unsubPend();unsubPend=null}
  let rows=[],pend={};
  /* davomat va fikrlar: har bir xodim uchun alohida tinglash */
  adminSubs.forEach(f=>{try{f()}catch(e){}});adminSubs=[];
  const attToday={},fbs={};let fbFirst={};
  function watchStaff(sid){
    if(attToday[sid]!==undefined)return;attToday[sid]=null;
    adminSubs.push(staffRef(sid).collection('answers').doc('att_'+ymdTk(0)).onSnapshot(sn=>{
      const prev=attToday[sid],v=sn.exists?sn.data():null;attToday[sid]=v;
      if(prev&&v&&v.out&&!prev.out){const n=(rows.find(r=>r.id===sid)||{}).name||'Xodim';toast('🏁 '+n+' ishdan ketdi: '+v.out);notify('🏁 '+n+' ishdan ketdi',v.out,'att')}
      else if(prev===null&&v&&fbFirst['a'+sid]){const n=(rows.find(r=>r.id===sid)||{}).name||'Xodim';toast('✅ '+n+' ishga keldi: '+v.in);notify('✅ '+n+' ishga keldi',v.in,'att')}
      fbFirst['a'+sid]=1;renderList()},()=>{}));
    adminSubs.push(staffRef(sid).collection('answers').where('a','==','fb').onSnapshot(q=>{
      const L=[];q.forEach(d=>L.push(Object.assign({id:d.id,sid},d.data())));fbs[sid]=L;
      if(fbFirst[sid]){const nw=q.docChanges().filter(c=>c.type==='added');if(nw.length){const m=nw[nw.length-1].doc.data();toast('💬 '+(m.name||'Xodim')+': '+String(m.text||'').slice(0,60));buzz();notify('💬 Yangi taklif: '+(m.name||'Xodim'),String(m.text||'').slice(0,140),'fb')}}
      fbFirst[sid]=1;renderFbAdmin()},()=>{const F=$('fbList');if(F)F.innerHTML='<p class="err">Fikrlarni yuklab bo\'lmadi.</p>'}));
  }
  function renderFbAdmin(){
    const F=$('fbList');if(!F)return;
    const all=[].concat(...Object.values(fbs)).sort((a,b)=>(b.at||0)-(a.at||0));
    if(!all.length){F.innerHTML='<p class="hint">Hali fikr yoki taklif yo\'q. Xodimlar o\'z sahifasidan yozganda shu yerda chiqadi.</p>';return}
    F.innerHTML='';
    all.slice(0,40).forEach(x=>{const b=document.createElement('div');b.className='fbi adm';
      b.innerHTML='<b></b><span></span><div class="fbf"><small></small><button class="ghost sm">O\'chirish</button></div>';
      b.querySelector('b').textContent=x.name||((rows.find(r=>r.id===x.sid)||{}).name)||'Xodim';
      b.querySelector('span').textContent=x.text||'';b.querySelector('small').textContent=atStr(x.at);
      b.querySelector('button').onclick=async()=>{if(!confirm('Bu fikrni o\'chirasizmi?'))return;try{await staffRef(x.sid).collection('answers').doc(x.id).delete();toast('O\'chirildi')}catch(e){toast("O'chirib bo'lmadi")}};
      F.appendChild(b)});
  }
  function renderList(){
    const L=$('slist');if(!L)return;
    if(!rows.length){L.innerHTML='<p class="hint">Xodimlar hali yaratilmagan.</p><button class="btn" id="seed">Xodimlarni yaratish</button>';
      $('seed').onclick=async ev=>{ev.target.disabled=true;try{const b=db.batch();(PAGE.seed||[]).forEach(s=>b.set(staffRef(s.id),{name:s.name,start:s.start,end:s.end,os:s.os,pct:null,note:'',history:[],updated:'',rest:[],tasks:[]}));await b.commit();toast('Xodimlar yaratildi')}catch(e){ev.target.disabled=false;toast("Yaratib bo'lmadi: ruxsatlarni tekshiring")}};return}
    L.innerHTML='';
    rows.forEach(r=>{
      const PT=ptsOf(r),url=base()+r.id+'/';
      const el=document.createElement('div');el.className='srow';
      el.innerHTML='<span class="mini"></span><span class="sn"><b></b><small></small></span><span class="sa"><button class="ghost op">Ochish</button><button class="ghost cp">Havola</button></span>';
      el.querySelector('.mini').style.background=pcol(PT.tot);el.querySelector('.mini').textContent=sgn(PT.tot);
      el.querySelector('b').textContent=r.name+' · '+(r.os==='ios'?'iPhone':'Android');el.querySelector('small').textContent=url;
      const gr=r.grades||{},waiting=Object.keys(pend[r.id]||{}).filter(k=>!isSelf(k)&&!gOf(gr[k])).length;
      const sg=selfGroups(Object.keys(pend[r.id]||{}).map(k=>({id:k})),gr).filter(g=>g.b||!(r.selfTasks||{})[g.id]).length;
      if(sg){const bd=document.createElement('span');bd.className='badge';bd.textContent='🙋 '+sg+' ta mustaqil vazifa javob kutmoqda';setTimeout(()=>el.querySelector('.sn').appendChild(bd))}
      if(waiting){const bd=document.createElement('span');bd.className='badge';bd.textContent='📷 '+waiting+' ta rasm baholanmagan';el.querySelector('.sn').appendChild(bd)}
      {const a=attToday[r.id],ab=document.createElement('span');ab.className='attb'+(a&&a.in?(a.out?' gone':' in'):'');
        ab.textContent=a&&a.in?('Keldi '+a.in+(a.out?' · Ketdi '+a.out:'')):'Bugun hali kelmadi';el.querySelector('.sn').appendChild(ab)}
      el.querySelector('.op').onclick=()=>{location.hash=r.id};
      const cp=el.querySelector('.cp');cp.onclick=()=>copy(url,cp,'Havola');
      L.appendChild(el);
    });
  }
  unsubList=db.collection('staff').onSnapshot(q=>{
    rows=[];q.forEach(d=>rows.push(Object.assign({id:d.id},d.data())));rows.forEach(r=>watchStaff(r.id));
    const order=(PAGE.seed||[]).map(s=>s.id);rows.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
    renderList();if(typeof renderFeed==='function')renderFeed();
    if(!tickTimer){let dd=ymdTk(0);tickTimer=setInterval(()=>{if(ymdTk(0)!==dd){dd=ymdTk(0);renderList()}},60000)}
  },e=>{const L=$('slist');if(L)L.innerHTML='<p class="err">Ruxsat yo\'q. Firestore qoidalarida rahbar emaili to\'g\'ri yozilganini tekshiring.</p>'});
  let phs=[],phFirst=true;
  function renderFeed(){
    const F=$('feed');if(!F)return;F.innerHTML='';
    const grOf=sid=>((rows.find(r=>r.id===sid)||{}).grades)||{},nm=sid=>(rows.find(r=>r.id===sid)||{}).name||'Xodim';
    const wait=phs.filter(p=>!isSelf(p.id)&&!gOf(grOf(p.sid)[p.id])),list=wait;
    const SG=[];rows.forEach(r=>selfGroups(phs.filter(p=>p.sid===r.id),r.grades).forEach(g=>SG.push([r,g])));
    if(SG.length){const hh=document.createElement('p');hh.className='hint';hh.style.color='var(--fg)';hh.innerHTML='<b>🙋 Mustaqil vazifalar: '+SG.length+' ta</b>';F.appendChild(hh);
      SG.forEach(([r,g])=>F.appendChild(selfBossBox(r.id,g,(r.selfTasks||{})[g.id],r.name||'Xodim')))}
    if(!wait.length&&SG.length)return;
    if(!phs.length){F.innerHTML='<p class="hint">Hali bajarilgan vazifa yo\'q. Xodim vazifani bajarib rasmga olsa, shu yerda chiqadi.</p>';return}
    const h=document.createElement('p');h.className='hint';h.style.color='var(--fg)';
    h.innerHTML=wait.length?'<b style="color:var(--low)">Baholash kutilmoqda: '+wait.length+' ta</b> <small class="meta">Baho qo\'yilgach rasm o\'chadi.</small>':'Hammasi baholangan ✓';F.appendChild(h);
    list.forEach(p=>{
      const box=document.createElement('div');box.className='pbox';
      const l=document.createElement('span');l.className='plabel';l.textContent=nm(p.sid)+' · '+dmyS(p.date)+' · '+(p.text||'');box.appendChild(l);
      const row=document.createElement('div');row.className='prow';
      const im=document.createElement('img');im.className='thumb';im.alt='Vazifa rasmi';im.src=p.img;im.onclick=()=>zoom(p.img);row.appendChild(im);
      const side=document.createElement('div');side.className='pside';
      const t=document.createElement('small');t.textContent='Yuborildi: '+atStr(p.at);side.appendChild(t);
      const gl=document.createElement('span');gl.className='glbl';gl.textContent='Baho qo\'ying:';side.appendChild(gl);
      const gb=(gradeButtons(null,async k=>{try{await gradeTask(p.sid,p.id,k,{text:p.text,date:p.date});toast(nm(p.sid)+': '+GE[k]+' '+sgn(GV[k])+' ochko')}catch(e){toast("Saqlab bo'lmadi, internetni tekshiring");renderFeed()}}));
      row.appendChild(side);box.appendChild(row);box.appendChild(gb);F.appendChild(box)});
  }
  const dmyS=s=>s?s.split('-').reverse().join('.'):'';
  const NA=$('ntA');
  if(NA&&canNotify()&&Notification.permission==='default'){
    NA.innerHTML='<button class="ghost" id="ntABtn" style="margin-bottom:4px">🔔 Yangi rasm kelganda bildirishnoma olish</button>';
    $('ntABtn').onclick=async()=>{try{const p=await Notification.requestPermission();NA.innerHTML='';if(p==='granted')toast('🔔 Bildirishnomalar yoqildi')}catch(e){}}}
  unsubPend=db.collectionGroup('photos').onSnapshot(q=>{
    pend={};phs=[];
    q.forEach(d=>{const sid=d.ref.parent.parent.id;(pend[sid]=pend[sid]||{})[d.id]=1;phs.push(Object.assign({id:d.id,sid},d.data()))});
    phs.sort((a,b)=>(b.at||0)-(a.at||0));
    if(!phFirst){const nw=q.docChanges().filter(c=>c.type!=='removed');
      if(nw.length){const p=nw[0].doc.data(),did=nw[0].doc.id,n=(rows.find(r=>r.id===nw[0].doc.ref.parent.parent.id)||{}).name||'Xodim';
        const m=/_a$/.test(did)&&isSelf(did)?'🙋 '+n+' mustaqil vazifa so\'ramoqda':/_b$/.test(did)&&isSelf(did)?'📷 '+n+' mustaqil vazifani tugatdi':'📷 '+n+' vazifani bajardi';
        toast(m);buzz();notify(m,String(p.text||''),'photo')}}
    phFirst=false;renderList();renderFeed();
  },()=>{const F=$('feed');if(F)F.innerHTML='<p class="err">Yuklanmadi. Firestore qoidalarini yangilash kerak.</p>'});
}
function adminRoute(user){
  const id=location.hash.slice(1);
  if(id){if(unsubList){unsubList();unsubList=null}if(unsubPend){unsubPend();unsubPend=null}adminSubs.forEach(f=>{try{f()}catch(e){}});adminSubs=[];
    staffView(id,true,{topbar:'<div class="topbar"><button class="back" id="backBtn">‹ Xodimlar</button></div>',onBack:()=>{history.pushState('',document.title,location.pathname);adminList(user)}})}
  else adminList(user);
}

/* ---------- Start ---------- */
function notReady(){$('app').innerHTML='<div class="wrap"><header><span class="shop">Majnuntol Market</span><h1>Sozlanmoqda</h1></header><section class="card"><p class="hint">Ilova hali Firebase\'ga ulanmagan. config.js faylini to\'ldiring.</p></section></div>'}
document.addEventListener('DOMContentLoaded',()=>{
  if(PAGE.mode==='admin')setTimeout(checkUpdate,1500);
  if(!initFirebase()){notReady();return}
  if(PAGE.mode==='staff'){staffView(PAGE.id,false);
    db.collection('settings').doc('update').onSnapshot(sn=>{const d=sn.exists&&sn.data();if(d&&d.v>APP_V&&!updShown)showUpdate(d)},()=>{});return}
  if(PAGE.mode==='admin'){
    let user=null;
    auth.onAuthStateChanged(u=>{
      user=u;
      if(!u){adminLogin();return}
      if(CFG.ownerEmail&&String(u.email||'').toLowerCase()!==String(CFG.ownerEmail).toLowerCase()){auth.signOut();adminLogin('Bu hisob rahbar emas: '+(u.email||''));return}
      adminRoute(u);
    });
    window.addEventListener('hashchange',()=>{if(user)adminRoute(user)});
  }
});
})();
