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
  +(withInstall?installCard():'')
  +(withInstall?'<section class="card tgc" id="ntCard" hidden><div class="ih"><span class="bell">🔔</span><span class="it"><b>Bildirishnomalarni yoqing</b><small>Rahbar vazifa berganda yoki chatga yozganda telefoningizda xabar chiqadi.</small></span></div><button class="btn" id="ntBtn">Bildirishnomalarni yoqish</button><p class="hint" id="ntHint">Telefon ruxsat so\'raganda <b>"Ruxsat berish"</b> ni bosing.</p></section>':'')
  +'<section class="card" id="clockCard"><div class="clock"><h2 id="hours">Ish vaqti</h2><span class="now" id="now">--:--</span></div><span class="state" id="state">…</span><div><div class="count" id="count">--:--:--</div><span class="countlbl" id="countlbl"></span></div><div class="bar"><i id="bar" style="width:0%"></i></div><div class="ticks"><span id="tk1"></span><span id="tk2"></span><span id="tk3"></span></div>'
  +'<div class="offer" id="offer" hidden><p><b>Ish vaqti tugadi. Qo\'shimcha ishga marhamat!</b><br>Qolib ishlashni xohlaysizmi? Javobingiz rahbarga yuboriladi.</p><div class="two" id="offerBtns"><button class="btn yes" id="yes">Ha, xohlayman</button><button class="btn no" id="no">Yo\'q, xohlamayman</button></div><div class="sent" id="sent" hidden></div></div></section>'
  +'<section class="card" id="taskCard"><h2>'+(withInstall?'Vazifalarim':'Vazifalar')+'</h2><div id="pend"></div><div class="gavg" id="gavg" hidden></div><div class="tabs2"><button id="dToday" class="on">Bugun</button><button id="dTom">Ertaga</button></div><div class="prog" id="prog" hidden><span id="progTxt"></span><div class="bar"><i id="progBar" style="width:0%"></i></div></div><div class="tasks" id="tasks"></div><p class="hint" id="thint">Vazifani bajargach, <b>📷 Rasmga olib yuborish</b> tugmasini bosing — rasm darhol rahbarga boradi va u baho qo\'yadi.</p><div id="tedit"></div></section>'
  +(withInstall?chatMarkup():'')
  +'<section class="card"><h2>Mening ish shijoatim</h2><div class="top"><div class="gauge"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="var(--track)" stroke-width="10"></circle><circle id="arc" cx="50" cy="50" r="40" fill="none" stroke="var(--muted)" stroke-width="10" stroke-linecap="round" stroke-dasharray="251.33" stroke-dashoffset="251.33"></circle></svg><span class="v" id="pct">—</span></div><div class="who"><span class="pill" id="lvl" style="background:var(--muted)">Baholanmagan</span><span class="trend" id="trend" hidden></span><span class="meta" id="last">Hali baho qo\'yilmagan</span><span class="meta">Foizni rahbar kuzatuv asosida belgilaydi.</span></div></div><p class="note" id="note" hidden></p><div id="histWrap" hidden><h2 style="margin-bottom:6px">Oxirgi baholar</h2><div class="hist" id="hist"></div></div><div id="editor"></div></section>'
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

  function tick(){
    if(!$('now'))return;
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
    const lv=level(st.pct),p=st.pct==null?0:st.pct;
    $('pct').textContent=st.pct==null?'—':st.pct+'%';
    $('arc').setAttribute('stroke',lv.c);$('arc').setAttribute('stroke-dashoffset',(251.33*(1-p/100)).toFixed(1));
    $('lvl').textContent=lv.t;$('lvl').style.background=lv.c;
    const H=st.history||[],tr=$('trend');
    if(H.length>1){const df=H[H.length-1].p-H[H.length-2].p;tr.hidden=false;tr.className='trend '+(df>0?'up':df<0?'down':'same');tr.textContent=df>0?'▲ +'+df+'% oshdi':df<0?'▼ '+df+'% tushdi':"O'zgarmadi"}else tr.hidden=true;
    $('last').textContent=H.length?'Oxirgi baho: '+H[H.length-1].d:"Hali baho qo'yilmagan";
    $('note').hidden=!st.note;$('note').textContent=st.note?'Rahbar izohi: '+st.note:'';
    $('histWrap').hidden=H.length<2;$('hist').innerHTML='';
    H.slice(-14).forEach(x=>{const b=document.createElement('div');b.style.height=Math.max(3,x.p*0.34)+'px';b.style.background=level(x.p).c;b.title=x.d+' — '+x.p+'%';$('hist').appendChild(b)});
    const E=$('editor');E.innerHTML='';
    if(canEdit){
      if(!editing){const b=document.createElement('button');b.className='ghost';b.textContent='Foizni belgilash';b.onclick=()=>{editing=true;render()};E.appendChild(b)}
      else{const v0=st.pct==null?70:st.pct;
        E.innerHTML='<div class="edit"><label for="r">Shijoat foizi</label><div class="rowin"><input type="range" id="r" min="0" max="100" value="'+v0+'"><input type="number" id="n" min="0" max="100" value="'+v0+'"></div><div class="quick"><button data-v="40">40</button><button data-v="60">60</button><button data-v="75">75</button><button data-v="90">90</button><button data-v="100">100</button></div><label for="t">Izoh (xodim ko\'radi)<textarea id="t" placeholder="Masalan: Bugun mijozlar bilan juda yaxshi ishladi"></textarea></label><div class="rowin"><button class="btn" style="flex:1" id="sv">Saqlash</button><button class="ghost" id="cn">Bekor qilish</button></div></div>';
        const r=$('r'),n=$('n'),t=$('t');t.value=st.note||'';
        r.oninput=()=>{n.value=r.value};n.oninput=()=>{r.value=Math.max(0,Math.min(100,+n.value||0))};
        E.querySelectorAll('.quick button').forEach(q=>q.onclick=()=>{r.value=n.value=q.dataset.v});
        $('cn').onclick=()=>{editing=false;render()};
        $('sv').onclick=ev=>{const pct=Math.max(0,Math.min(100,Math.round(+n.value||0))),d=stamp();
          const hist=(st.history||[]).concat([{p:pct,d}]).slice(-30);
          commit({pct,note:t.value.trim(),history:hist,updated:d},ev.target,'Saqlandi: '+pct+'%',()=>{editing=false})}}
    }
    renderWork();renderTasks();hours();renderMonth();
    $('foot').textContent=st.updated?'Yangilangan: '+st.updated:(loaded?'':'Yuklanmoqda…');
  }
  function renderWork(){
    const d=tk(),ty=d.getUTCFullYear(),tm=d.getUTCMonth(),td=d.getUTCDate(),y=viewY,m=viewM;
    const days=new Date(Date.UTC(y,m+1,0)).getUTCDate(),first=(new Date(Date.UTC(y,m,1)).getUTCDay()+6)%7;
    const cmp=(y-ty)*12+(m-tm),limit=cmp<0?days:cmp>0?0:td;
    $('wname').textContent=MONTHS[m]+' '+y;
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
  async function setGrade(tid,n){
    try{await staffRef(id).set({grades:{[tid]:n},updated:stamp()},{merge:true});toast('Baho qo\'yildi: '+n+'/10')}
    catch(e){toast(e&&e.code==='permission-denied'?"Sizda o'zgartirish huquqi yo'q":"Saqlab bo'lmadi, internetni tekshiring")}
  }
  function photoBox(tid,ph,label){
    const g=(st.grades||{})[tid],box=document.createElement('div');box.className='pbox';
    if(label){const l=document.createElement('span');l.className='plabel';l.textContent=label;box.appendChild(l)}
    const row=document.createElement('div');row.className='prow';
    const im=document.createElement('img');im.className='thumb';im.alt='Vazifa rasmi';im.src=ph.img;im.onclick=()=>zoom(ph.img);row.appendChild(im);
    const side=document.createElement('div');side.className='pside';
    const t=document.createElement('small');t.textContent='Yuborildi: '+atStr(ph.at);side.appendChild(t);
    if(canEdit){
      const gl=document.createElement('span');gl.className='glbl';gl.textContent=g?'Baho: '+g+'/10 (o\'zgartirish mumkin)':'Baho qo\'ying (1–10):';side.appendChild(gl);
      const gr=document.createElement('div');gr.className='grades';
      for(let k=1;k<=10;k++){const b=document.createElement('button');b.textContent=k;if(g===k)b.className='on';b.setAttribute('aria-label',k+' ball');b.onclick=()=>setGrade(tid,k);gr.appendChild(b)}
      side.appendChild(gr);
    }else{
      const s=document.createElement('b');s.className='grade'+(g?' on':'');s.textContent=g?'Rahbar bahosi: '+g+'/10':'Rahbar baholashi kutilmoqda';side.appendChild(s);
      if(!g){const re=document.createElement('button');re.className='ghost sm';re.textContent='Qayta suratga olish';re.onclick=()=>sendPhoto({id:tid,text:ph.text,date:ph.date});side.appendChild(re)}
    }
    row.appendChild(side);box.appendChild(row);
    return box;
  }
  function renderPending(){
    const P=$('pend');if(!P)return;P.innerHTML='';
    const gr=st.grades||{},vals=Object.values(gr).filter(v=>typeof v==='number');
    const A=$('gavg');A.hidden=!vals.length;
    if(vals.length)A.innerHTML='Vazifa baholari o\'rtachasi: <b>'+(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)+' / 10</b> <small>('+vals.length+' ta)</small>';
    if(!canEdit)return;
    const shown=ymdOff(tDay);
    const list=Object.entries(photos).filter(([k,p])=>!gr[k]&&p.date!==shown).sort((a,b)=>b[1].at-a[1].at);
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
        const key='td_'+id+'_'+x.id,ph=photos[x.id],isDone=!!ph||(canEdit?!!doneMap[x.id]:(lsGet(key)==='1'));if(isDone)done++;
        const r=document.createElement('div');r.className='task'+(isDone?' done':'');
        r.innerHTML='<button class="chk" aria-label="Bajarildi deb belgilash">'+(isDone?'✓':'')+'</button><div class="tbody"><span class="tnum">'+(i+1)+'-vazifa'+(fresh&&fresh.has(x.id)&&!isDone?' <em class="new">YANGI</em>':'')+'</span><span class="ttext"></span></div>';
        r.querySelector('.ttext').textContent=x.text;
        const chk=r.querySelector('.chk');
        if(canEdit)chk.disabled=true;
        else chk.onclick=async()=>{if(isDone)lsDel(key);else lsSet(key,'1');renderTasks();
          try{await staffRef(id).collection('answers').doc('task_'+x.id).set({a:isDone?'undone':'done',at:Date.now(),task:x.id})}catch(e){}};
        const tb=r.querySelector('.tbody');
        if(ph)tb.appendChild(photoBox(x.id,ph));
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
      q.forEach(d=>{const v=d.data();if(d.id.startsWith('task_')){if(v.a==='done')done[v.task]=1}else{const [y,m,dd]=d.id.split('-');ans[dd+'.'+m+'.'+y]=v.a}});
      st.answers=ans;st.done=done;if($('cal')){renderMonth();renderTasks()}
    },()=>{});
  }
  // vazifa rasmlari (xodim ham, rahbar ham ko'radi)
  if(unsubPhotos)unsubPhotos();
  let phFirst=true;
  unsubPhotos=staffRef(id).collection('photos').onSnapshot(q=>{
    photos={};q.forEach(d=>photos[d.id]=d.data());
    if(canEdit&&!phFirst&&q.docChanges().some(c=>c.type!=='removed')){toast('📷 '+st.name+' yangi rasm yubordi');buzz()}
    phFirst=false;if($('tasks')&&!tEdit)renderTasks();
  },()=>{});
  if(!canEdit){
    // yangi vazifa kelganda ilova ochiq bo'lsa ham xabar beradi
    let seen=null;const prevRender=render;
    render=function(){const ids=(st.tasks||[]).map(x=>x.id);
      if(seen&&loaded){const nw=(st.tasks||[]).filter(x=>!seen.has(x.id)&&x.date>=ymdOff(0));if(nw.length){toast('📋 Yangi vazifa: '+nw[0].text.slice(0,60));buzz();notify('📋 Yangi vazifa',nw.map(x=>'• '+x.text).join('\n'),'task')}}
      if(loaded)seen=new Set(ids);prevRender()};
    const nc=$('ntCard');
    if(nc&&canNotify()&&Notification.permission==='default'){nc.hidden=false;
      $('ntBtn').onclick=async()=>{try{const p=await Notification.requestPermission();
        if(p==='granted'){nc.hidden=true;toast('🔔 Bildirishnomalar yoqildi');notify('Majnuntol Market','Bildirishnomalar yoqildi ✓','test')}
        else{$('ntHint').textContent='Ruxsat berilmadi. Telefon sozlamalaridan yoqishingiz mumkin.'}}catch(e){}}}
    wireChat({uid:id,name:st.name||PAGE.name||'Xodim'});
  }else stopChat();
  render();renderAnswer();tick();
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
let unsubList=null,unsubPend=null;
function adminList(user){
  if(unsubStaff){unsubStaff();unsubStaff=null}if(unsubPhotos){unsubPhotos();unsubPhotos=null}clearInterval(tickTimer);
  const app=$('app');
  app.innerHTML='<div class="wrap"><header><span class="shop">Majnuntol Market</span><h1>Rahbar paneli</h1><span class="meta">'+esc(user.email||'')+'</span></header>'
   +installCard()
   +'<section class="card"><h2>Xodimlar</h2><div id="slist"><p class="hint">Yuklanmoqda…</p></div></section>'
   +chatMarkup()
   +'<section class="card"><h2>Ish tartibi</h2><p class="hint" style="color:var(--fg);line-height:1.5">Shoxjaxon va Hayrullo 06:30 – 19:00, Iqbolmirzo 09:30 – 22:00. Qo\'shimcha ish: kuniga 33 333 so\'m, oyiga ko\'pi bilan 1 000 000 so\'m.</p></section>'
   +'<button class="ghost" id="out" style="align-self:center">Chiqish</button></div><div class="toast" id="toast" hidden></div>';
  wireInstall();
  wireChat({uid:'admin',name:'Rahbar'});
  $('out').onclick=()=>{stopChat();auth.signOut()};
  if(unsubList)unsubList();
  if(unsubPend){unsubPend();unsubPend=null}
  let rows=[],pend={};
  function renderList(){
    const L=$('slist');if(!L)return;
    if(!rows.length){L.innerHTML='<p class="hint">Xodimlar hali yaratilmagan.</p><button class="btn" id="seed">Xodimlarni yaratish</button>';
      $('seed').onclick=async ev=>{ev.target.disabled=true;try{const b=db.batch();(PAGE.seed||[]).forEach(s=>b.set(staffRef(s.id),{name:s.name,start:s.start,end:s.end,os:s.os,pct:null,note:'',history:[],updated:'',rest:[],tasks:[]}));await b.commit();toast('Xodimlar yaratildi')}catch(e){ev.target.disabled=false;toast("Yaratib bo'lmadi: ruxsatlarni tekshiring")}};return}
    L.innerHTML='';
    rows.forEach(r=>{
      const lv=level(r.pct),url=base()+r.id+'/';
      const el=document.createElement('div');el.className='srow';
      el.innerHTML='<span class="mini"></span><span class="sn"><b></b><small></small></span><span class="sa"><button class="ghost op">Ochish</button><button class="ghost cp">Havola</button></span>';
      el.querySelector('.mini').style.background=lv.c;el.querySelector('.mini').textContent=r.pct==null?'—':r.pct+'%';
      el.querySelector('b').textContent=r.name+' · '+(r.os==='ios'?'iPhone':'Android');el.querySelector('small').textContent=url;
      const gr=r.grades||{},waiting=Object.keys(pend[r.id]||{}).filter(k=>!gr[k]).length;
      if(waiting){const bd=document.createElement('span');bd.className='badge';bd.textContent='📷 '+waiting+' ta rasm baholanmagan';el.querySelector('.sn').appendChild(bd)}
      el.querySelector('.op').onclick=()=>{location.hash=r.id};
      const cp=el.querySelector('.cp');cp.onclick=()=>copy(url,cp,'Havola');
      L.appendChild(el);
    });
  }
  unsubList=db.collection('staff').onSnapshot(q=>{
    rows=[];q.forEach(d=>rows.push(Object.assign({id:d.id},d.data())));
    const order=(PAGE.seed||[]).map(s=>s.id);rows.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
    renderList();
  },e=>{const L=$('slist');if(L)L.innerHTML='<p class="err">Ruxsat yo\'q. Firestore qoidalarida rahbar emaili to\'g\'ri yozilganini tekshiring.</p>'});
  unsubPend=db.collectionGroup('photos').onSnapshot(q=>{
    pend={};q.forEach(d=>{const sid=d.ref.parent.parent.id;(pend[sid]=pend[sid]||{})[d.id]=1});renderList();
  },()=>{});
}
function adminRoute(user){
  const id=location.hash.slice(1);
  if(id){if(unsubList){unsubList();unsubList=null}if(unsubPend){unsubPend();unsubPend=null}
    staffView(id,true,{topbar:'<div class="topbar"><button class="back" id="backBtn">‹ Xodimlar</button></div>',onBack:()=>{history.pushState('',document.title,location.pathname);adminList(user)}})}
  else adminList(user);
}

/* ---------- Start ---------- */
function notReady(){$('app').innerHTML='<div class="wrap"><header><span class="shop">Majnuntol Market</span><h1>Sozlanmoqda</h1></header><section class="card"><p class="hint">Ilova hali Firebase\'ga ulanmagan. config.js faylini to\'ldiring.</p></section></div>'}
document.addEventListener('DOMContentLoaded',()=>{
  if(!initFirebase()){notReady();return}
  if(PAGE.mode==='staff'){staffView(PAGE.id,false);return}
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
