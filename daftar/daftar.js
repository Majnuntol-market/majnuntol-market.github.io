/* Daftarcha — qarzlar, xodimlar oyligi, eslatmalar (Firebase Firestore, faqat egasi uchun) */
(function(){
'use strict';
const CFG=window.MJ_CONFIG||{};
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MONTHS=['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
const DEMO=/[?&]demo=1/.test(location.search);

/* ---------- Sana (Toshkent vaqti, UTC+5) ---------- */
const TZ=5*3600e3;
const tk=(ms)=>new Date((ms==null?Date.now():ms)+TZ);
const ymd=ms=>{const d=tk(ms);return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())};
const ym=ms=>ymd(ms).slice(0,7);
const today=()=>ymd();
const fmtDate=s=>{if(!s)return'';const [y,m,d]=s.split('-');return d+'.'+m+'.'+y};
const fmtDT=ms=>{const d=tk(ms);return pad(d.getUTCDate())+'.'+pad(d.getUTCMonth()+1)+' '+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())};
const monthName=k=>{const [y,m]=k.split('-');return MONTHS[+m-1]+' '+y};
const shiftMonth=(k,n)=>{let [y,m]=k.split('-').map(Number);m+=n;while(m<1){m+=12;y--}while(m>12){m-=12;y++}return y+'-'+pad(m)};
const daysIn=k=>{const [y,m]=k.split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate()};
const localInputToMs=v=>{const [d,t]=v.split('T');const [y,mo,da]=d.split('-').map(Number);const [h,mi]=(t||'09:00').split(':').map(Number);return Date.UTC(y,mo-1,da,h,mi)-TZ};
const msToLocalInput=ms=>{const d=tk(ms);return ymd(ms)+'T'+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())};

/* ---------- Pul ---------- */
const group=n=>String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
const money=(n,cur)=>(n<0?'−':'')+(cur==='USD'?'$'+group(n):group(n)+" so'm");
const parseAmount=v=>{const n=Number(String(v||'').replace(/[^\d]/g,''));return isFinite(n)?n:0};
const bindAmount=el=>{if(!el)return;el.addEventListener('input',()=>{const n=parseAmount(el.value);el.value=n?group(n):''})};

/* ---------- Yordamchilar ---------- */
let toastT=0;
function toast(t){const el=$('toast');el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>el.hidden=true,2400)}
function sheet(html,onReady){sheetRefresh=null;$('sheet').innerHTML='<div class="grab"></div>'+html;$('sheet').hidden=false;$('sheetBg').hidden=false;$('sheet').scrollTop=0;
  $('sheet').querySelectorAll('.amount').forEach(bindAmount);
  $('sheet').querySelectorAll('[data-close]').forEach(b=>b.onclick=closeSheet);
  if(onReady)onReady($('sheet'))}
function closeSheet(){$('sheet').hidden=true;$('sheetBg').hidden=true;$('sheet').innerHTML='';sheetRefresh=null}
let sheetRefresh=null; // ochiq oyna ma'lumot o'zgarganda yangilanadi
$('sheetBg').onclick=closeSheet;
const segHtml=(name,opts,val)=>'<div class="seg" data-seg="'+name+'">'+opts.map(o=>'<button type="button" data-v="'+o[0]+'"'+(o[0]===val?' class="on"':'')+'>'+esc(o[1])+'</button>').join('')+'</div>';
function segBind(root,name,cb){const s=root.querySelector('[data-seg="'+name+'"]');s.querySelectorAll('button').forEach(b=>b.onclick=()=>{s.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));if(cb)cb(b.dataset.v)})}
const segVal=(root,name)=>{const b=root.querySelector('[data-seg="'+name+'"] .on');return b?b.dataset.v:null};
const field=(label,input)=>'<label class="f"><span>'+label+'</span>'+input+'</label>';

/* ---------- Ma'lumotlar ombori ---------- */
const COL={qarz:'d_qarz',esl:'d_eslatma',xod:'d_xodim',oy:'d_oylik'};
const S={qarz:[],esl:[],xod:[],oy:[],set:{div:'days'},ready:{}};
let db=null,auth=null,unsubs=[];
const store={
  add(col,data){if(DEMO){const id='x'+Math.random().toString(36).slice(2,9);demo[col].push(Object.assign({id},data));demoEmit(col);return Promise.resolve()}return db.collection(COL[col]).add(data)},
  update(col,id,data){if(DEMO){const o=demo[col].find(x=>x.id===id);Object.assign(o,data);demoEmit(col);return Promise.resolve()}return db.collection(COL[col]).doc(id).set(data,{merge:true})},
  del(col,id){if(DEMO){demo[col]=demo[col].filter(x=>x.id!==id);demoEmit(col);return Promise.resolve()}return db.collection(COL[col]).doc(id).delete()},
  saveSet(data){if(DEMO){Object.assign(S.set,data);render();return Promise.resolve()}return db.collection('d_sozlama').doc('main').set(data,{merge:true})}
};
const demo={qarz:[],esl:[],xod:[],oy:[]};
function demoEmit(col){S[col]=demo[col].map(x=>Object.assign({},x));S.ready[col]=true;render()}
function listen(){
  unsubs.forEach(u=>u());unsubs=[];
  Object.keys(COL).forEach(k=>{
    unsubs.push(db.collection(COL[k]).onSnapshot(q=>{S[k]=q.docs.map(d=>Object.assign({id:d.id},d.data()));S.ready[k]=true;render();if(k==='esl')scheduleNotifs()},
      e=>{console.error(e);showRulesError()}));
  });
  unsubs.push(db.collection('d_sozlama').doc('main').onSnapshot(d=>{S.set=Object.assign({div:'days'},d.exists?d.data():{});render()},()=>{}));
}
let rulesErrShown=false;
function showRulesError(){if(rulesErrShown)return;rulesErrShown=true;
  sheet('<h3>Bazaga ruxsat yo\'q</h3><p class="muted" style="line-height:1.5">Firebase Console → Firestore Database → Rules bo\'limiga saytdagi <b>firestore.rules</b> faylini nusxalab qo\'ying va «Publish» bosing. Keyin sahifani yangilang.</p><button class="btn" data-close>Tushunarli</button>')}
const save=(p,ok)=>p.then(()=>{if(ok)toast(ok)}).catch(e=>{console.error(e);toast("Saqlab bo'lmadi: internetni tekshiring")});

/* ---------- Qarz hisoblari ---------- */
// berdim: men berdim (+), qaytardi: u menga qaytardi (−), oldim: men oldim (−), qaytardim: men qaytardim (+)
// natija > 0 → u menga qarzdor; < 0 → men unga qarzdorman
const QT={berdim:['Berdim',1],qaytardi:['Qaytardi',-1],oldim:['Oldim',-1],qaytardim:['Qaytardim',1]};
const normName=s=>String(s||'').trim().replace(/\s+/g,' ');
const keyName=s=>normName(s).toLowerCase();
function people(){
  const m=new Map();
  S.qarz.forEach(e=>{const k=keyName(e.name);if(!m.has(k))m.set(k,{name:normName(e.name),bal:{UZS:0,USD:0},items:[],last:0,due:null});
    const p=m.get(k);const sg=(QT[e.type]||['',0])[1];p.bal[e.cur||'UZS']+=sg*(e.amount||0);p.items.push(e);p.last=Math.max(p.last,e.created||0);
    if(e.due&&(!p.due||e.due<p.due))p.due=e.due});
  m.forEach(p=>{p.items.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.created||0)-(a.created||0));p.open=p.bal.UZS!==0||p.bal.USD!==0;if(!p.open)p.due=null});
  return [...m.values()].sort((a,b)=>(b.open-a.open)||b.last-a.last);
}
function totals(ps){const t={in:{UZS:0,USD:0},out:{UZS:0,USD:0}};ps.forEach(p=>['UZS','USD'].forEach(c=>{if(p.bal[c]>0)t.in[c]+=p.bal[c];else t.out[c]-=p.bal[c]}));return t}
const balText=(bal,cls)=>{const parts=['UZS','USD'].filter(c=>bal[c]).map(c=>'<span class="num'+(cls?' '+(bal[c]>0?'plus':'minus'):'')+'">'+money(cls?Math.abs(bal[c]):bal[c],c)+'</span>');return parts.length?parts.join(' · '):'<span class="num">0</span>'};
const sumText=(o)=>{const parts=['UZS','USD'].filter(c=>o[c]).map(c=>money(o[c],c));return parts.length?parts.join(' · '):"0 so'm"};

/* ---------- Oylik hisoblari ---------- */
function mapFor(s,k){s=s||{};let best=null;Object.keys(s).forEach(m=>{if(m<=k&&(best===null||m>best))best=m});return best===null?0:(s[best]||0)}
function salaryFor(x,k){const s=x.sal||{};let best=null;Object.keys(s).forEach(m=>{if(m<=k&&(best===null||m>best))best=m});return best===null?0:(s[best]||0)}
function divisor(k){const d=S.set.div;return d==='30'?30:d==='26'?26:daysIn(k)}
function payroll(x,k){
  const rows=S.oy.filter(r=>r.xid===x.id&&r.month===k).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.created||0)-(b.created||0));
  const sal=salaryFor(x,k),div=divisor(k),fixed=mapFor(x.cut,k),daily=fixed||sal/div;
  let absent=0,adv=0,bonus=0,fine=0,paid=0;
  rows.forEach(r=>{if(r.type==='kelmadi')absent+=Number(r.days)||1;else if(r.type==='avans')adv+=r.amount||0;else if(r.type==='bonus')bonus+=r.amount||0;else if(r.type==='jarima')fine+=r.amount||0;else if(r.type==='tolov')paid+=r.amount||0});
  const cut=Math.round(daily*absent);
  const earned=sal-cut+bonus-fine;
  const left=earned-adv-paid;
  return {rows,sal,div,daily,fixed,absent,cut,adv,bonus,fine,paid,earned,left};
}
const OT={avans:'Avans (pul oldi)',kelmadi:'Kelmadi',bonus:'Bonus / qo\'shimcha',jarima:'Jarima / ushlab qolish',tolov:'Oylik berildi'};
const daysText=d=>d===0.5?'yarim kun':(d%1?String(d).replace('.',','):d)+' kun';

/* ---------- Ko'rinishlar ---------- */
let tab=(location.hash||'').slice(1)||'home';if(!['home','qarz','xodim','esl'].includes(tab))tab='home';
let qFilter='open',xMonth=ym(),showArch=false;
const app=$('app');
function setTab(t){tab=t;history.replaceState(null,'','#'+t);render();window.scrollTo(0,0)}
$('tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>setTab(b.dataset.t));

function header(title,right){return '<header class="hd"><div><span class="kicker">Daftarcha</span><h1>'+esc(title)+'</h1></div>'+(right||'')+'</header>'}
const gear='<button class="icon-btn" id="setBtn" aria-label="Sozlamalar">⚙︎</button>';

function render(){
  if(!signedIn)return;
  $('tabs').hidden=false;
  $('tabs').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.t===tab));
  const y=window.scrollY;
  let h='';
  if(tab==='home')h=viewHome();else if(tab==='qarz')h=viewQarz();else if(tab==='xodim')h=viewXodim();else h=viewEsl();
  app.innerHTML='<div class="wrap">'+h+'</div>'+(tab!=='home'?'<button class="fab" id="fab" aria-label="Qo\'shish">+</button>':'');
  window.scrollTo(0,y);
  bindView();
  if(sheetRefresh)sheetRefresh();
}

function viewHome(){
  const ps=people(),t=totals(ps),now=Date.now(),td=today();
  const due=S.esl.filter(e=>!e.done&&e.at<=now+864e5).sort((a,b)=>a.at-b.at);
  const lateQ=ps.filter(p=>p.due&&p.due<=td);
  const act=S.xod.filter(x=>!x.arch);
  let pay=0;act.forEach(x=>pay+=payroll(x,ym()).left);
  let h=header('Bugun, '+fmtDate(td).slice(0,5),gear);
  h+='<div class="grid2"><button class="stat tap" data-go="qarz"><span class="muted">Menga qarzdor</span><span class="num plus">'+sumText(t.in)+'</span></button>'
   +'<button class="stat tap" data-go="qarz"><span class="muted">Men qarzdorman</span><span class="num minus">'+sumText(t.out)+'</span></button></div>';
  h+='<button class="stat tap" data-go="xodim"><span class="muted">'+MONTHS[+ym().slice(5)-1]+' oyligi, berilishi kerak ('+act.length+' xodim)</span><span class="num big">'+money(pay,'UZS')+'</span></button>';
  h+='<section class="card"><div class="row"><h2>Eslatmalar</h2><button class="btn sm ghost" data-add="esl">+ Qo\'shish</button></div>';
  if(!due.length&&!lateQ.length)h+='<div class="empty">Bugunga eslatma yo\'q</div>';
  else{h+='<div class="list">';
    due.forEach(e=>h+=eslItem(e));
    lateQ.forEach(p=>h+='<button class="item" data-person="'+esc(keyName(p.name))+'"><div><div class="t">'+esc(p.name)+'</div><div class="s">Qarz qaytarish muddati: '+fmtDate(p.due)+'</div></div><span class="pill warn">Qarz</span></button>');
    h+='</div>'}
  h+='</section>';
  const recent=[...S.qarz].sort((a,b)=>(b.created||0)-(a.created||0)).slice(0,5);
  if(recent.length){h+='<section class="card"><h2>Oxirgi qarz yozuvlari</h2><div class="list">'+recent.map(e=>'<button class="item" data-person="'+esc(keyName(e.name))+'"><div><div class="t">'+esc(normName(e.name))+'</div><div class="s">'+QT[e.type][0]+' · '+fmtDate(e.date)+'</div></div><span class="num '+(QT[e.type][1]>0?'plus':'minus')+'">'+money(e.amount,e.cur)+'</span></button>').join('')+'</div></section>'}
  return h;
}

function viewQarz(){
  const ps=people(),t=totals(ps);
  let h=header('Qarzlar',gear);
  h+='<div class="grid2"><div class="stat"><span class="muted">Menga qarzdor</span><span class="num plus">'+sumText(t.in)+'</span></div><div class="stat"><span class="muted">Men qarzdorman</span><span class="num minus">'+sumText(t.out)+'</span></div></div>';
  h+=segHtml('qf',[['open','Ochiq'],['in','Menga'],['out','Mendan'],['closed','Yopilgan']],qFilter);
  const f=ps.filter(p=>qFilter==='open'?p.open:qFilter==='closed'?!p.open:qFilter==='in'?(p.bal.UZS>0||p.bal.USD>0):(p.bal.UZS<0||p.bal.USD<0));
  h+='<section class="card"><div class="list">';
  if(!f.length)h+='<div class="empty">'+(S.qarz.length?'Bu bo\'limda hech kim yo\'q':'Hali qarz yozilmagan. Pastdagi «+» tugmasini bosing.')+'</div>';
  f.forEach(p=>{const late=p.due&&p.due<=today();
    const dir=p.bal.UZS>0||p.bal.USD>0?'Menga qarzdor':p.open?'Men qarzdorman':'Hisob yopilgan';
    h+='<button class="item" data-person="'+esc(keyName(p.name))+'"><div style="min-width:0"><div class="t">'+esc(p.name)+'</div><div class="s">'+dir+(p.due?' · <span class="'+(late?'minus':'')+'">muddat '+fmtDate(p.due)+'</span>':'')+'</div></div><div style="text-align:right">'+balText(p.bal,true)+'</div></button>'});
  h+='</div></section>';
  return h;
}

function viewXodim(){
  const list=S.xod.filter(x=>showArch?x.arch:!x.arch).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  let h=header('Xodimlar',gear);
  h+='<div class="card month"><button class="icon-btn" id="mPrev" aria-label="Oldingi oy">‹</button><b>'+monthName(xMonth)+'</b><button class="icon-btn" id="mNext" aria-label="Keyingi oy">›</button></div>';
  if(!showArch){let tot=0,adv=0;list.forEach(x=>{const p=payroll(x,xMonth);tot+=p.left;adv+=p.adv});
    h+='<div class="grid2"><div class="stat"><span class="muted">Berilishi kerak</span><span class="num">'+money(tot,'UZS')+'</span></div><div class="stat"><span class="muted">Avans berilgan</span><span class="num">'+money(adv,'UZS')+'</span></div></div>'}
  h+='<section class="card"><div class="list">';
  if(!list.length){h+='<div class="empty">'+(showArch?'Olib tashlangan xodim yo\'q':'Xodim qo\'shilmagan. Pastdagi «+» tugmasini bosing.')+'</div>';
    if(!showArch&&!S.xod.length&&!DEMO)h+='<button class="btn ghost" id="importOld">Eski ro\'yxatdan qo\'shish (Iqbolmirzo, Shoxjaxon, Hayrullo)</button>'}
  list.forEach(x=>{const p=payroll(x,xMonth);
    const bits=[];if(p.absent)bits.push(daysText(p.absent)+' kelmadi');if(p.adv)bits.push('avans '+group(p.adv));if(p.paid)bits.push('berildi '+group(p.paid));
    h+='<button class="item" data-x="'+x.id+'"><div style="min-width:0"><div class="t">'+esc(x.name)+'</div><div class="s">Oylik '+money(p.sal,'UZS')+(bits.length?' · '+bits.join(' · '):'')+'</div></div><div style="text-align:right"><div class="num '+(p.left<0?'minus':'')+'">'+money(p.left,'UZS')+'</div><div class="s muted">'+(p.left===0&&p.paid?'to\'landi':'qoldi')+'</div></div></button>'});
  h+='</div></section>';
  h+='<button class="btn ghost" id="archT">'+(showArch?'‹ Faol xodimlar':'Olib tashlangan xodimlar')+'</button>';
  return h;
}

function eslItem(e){const late=e.at<Date.now()&&!e.done;
  return '<div class="item static'+(e.done?' done':'')+'"><button class="check'+(e.done?' on':'')+'" data-done="'+e.id+'" aria-label="Bajarildi">'+(e.done?'✓':'')+'</button><button class="item" style="border:0;padding:0" data-esl="'+e.id+'"><div style="min-width:0;flex:1"><div class="t">'+esc(e.text)+'</div><div class="s '+(late?'minus':'')+'">'+fmtDT(e.at)+(late?' · vaqti o\'tdi':'')+'</div></div></button></div>'}
function viewEsl(){
  const open=S.esl.filter(e=>!e.done).sort((a,b)=>a.at-b.at),done=S.esl.filter(e=>e.done).sort((a,b)=>b.at-a.at).slice(0,20);
  let h=header('Eslatmalar',gear);
  if('Notification' in window&&Notification.permission==='default'&&!DEMO)h+='<button class="btn ghost" id="notifOn">🔔 Eslatma vaqtida xabar berishni yoqish</button>';
  h+='<section class="card"><h2>Kutilmoqda</h2><div class="list">'+(open.length?open.map(eslItem).join(''):'<div class="empty">Eslatma yo\'q</div>')+'</div></section>';
  if(done.length)h+='<section class="card"><h2>Bajarilgan</h2><div class="list">'+done.map(eslItem).join('')+'</div></section>';
  return h;
}

function bindView(){
  app.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>setTab(b.dataset.go));
  app.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>personSheet(b.dataset.person));
  app.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>xodimSheet(b.dataset.x));
  app.querySelectorAll('[data-esl]').forEach(b=>b.onclick=()=>eslForm(S.esl.find(e=>e.id===b.dataset.esl)));
  app.querySelectorAll('[data-done]').forEach(b=>b.onclick=()=>{const e=S.esl.find(x=>x.id===b.dataset.done);save(store.update('esl',e.id,{done:!e.done}),e.done?null:'Bajarildi ✓')});
  app.querySelectorAll('[data-add="esl"]').forEach(b=>b.onclick=()=>eslForm());
  const fab=$('fab');if(fab)fab.onclick=()=>tab==='qarz'?qarzForm():tab==='xodim'?xodimForm():eslForm();
  if($('setBtn'))$('setBtn').onclick=settingsSheet;
  if(app.querySelector('[data-seg="qf"]'))segBind(app,'qf',v=>{qFilter=v;render()});
  if($('mPrev')){$('mPrev').onclick=()=>{xMonth=shiftMonth(xMonth,-1);render()};$('mNext').onclick=()=>{xMonth=shiftMonth(xMonth,1);render()}}
  if($('archT'))$('archT').onclick=()=>{showArch=!showArch;render()};
  if($('importOld'))$('importOld').onclick=importOld;
  if($('notifOn'))$('notifOn').onclick=()=>Notification.requestPermission().then(()=>{render();scheduleNotifs()});
}

/* ---------- Qarz formalari ---------- */
function qarzForm(preset){
  preset=preset||{};
  const names=[...new Set(S.qarz.map(e=>normName(e.name)))].sort();
  sheet('<h3>'+(preset.id?'Yozuvni tahrirlash':'Qarz yozuvi')+'</h3>'
    +segHtml('qt',[['berdim','Berdim'],['qaytardi','Qaytardi'],['oldim','Oldim'],['qaytardim','Qaytardim']],preset.type||'berdim')
    +'<p class="muted" id="qtHint" style="margin:-4px 0 0"></p>'
    +field('Kim','<input id="qName" list="qNames" autocomplete="off" placeholder="Ism" value="'+esc(preset.name||'')+'"><datalist id="qNames">'+names.map(n=>'<option value="'+esc(n)+'">').join('')+'</datalist>')
    +'<div style="display:grid;grid-template-columns:1fr 110px;gap:8px">'+field('Summa','<input id="qAmt" class="amount" inputmode="numeric" placeholder="0" value="'+(preset.amount?group(preset.amount):'')+'">')
    +field('Valyuta','<select id="qCur"><option value="UZS">so\'m</option><option value="USD"'+(preset.cur==='USD'?' selected':'')+'>$</option></select>')+'</div>'
    +'<div class="grid2">'+field('Sana','<input id="qDate" type="date" value="'+(preset.date||today())+'">')+field('Qaytarish muddati','<input id="qDue" type="date" value="'+(preset.due||'')+'">')+'</div>'
    +field('Izoh','<input id="qNote" placeholder="Ixtiyoriy" value="'+esc(preset.note||'')+'">')
    +'<div class="actions">'+(preset.id?'<button class="btn danger" id="qDel">O\'chirish</button>':'<button class="btn ghost" data-close>Bekor</button>')+'<button class="btn" id="qSave">Saqlash</button></div>',
  r=>{
    const hint={berdim:'Men unga pul berdim — u menga qarzdor bo\'ladi',qaytardi:'U menga qarzini qaytardi',oldim:'Men undan pul oldim — men qarzdor bo\'laman',qaytardim:'Men unga qarzimni qaytardim'};
    const upd=v=>{$('qtHint').textContent=hint[v];$('qDue').closest('.f').hidden=!(v==='berdim'||v==='oldim')};
    segBind(r,'qt',upd);upd(segVal(r,'qt'));
    if(!preset.name&&!preset.id)setTimeout(()=>$('qName').focus(),50);else if(!preset.amount)setTimeout(()=>$('qAmt').focus(),50);
    $('qSave').onclick=()=>{
      const type=segVal(r,'qt'),name=normName($('qName').value),amount=parseAmount($('qAmt').value);
      if(!name){toast('Ismni yozing');return}if(!amount){toast('Summani yozing');return}
      const d={type,name,amount,cur:$('qCur').value,date:$('qDate').value||today(),due:(type==='berdim'||type==='oldim')?($('qDue').value||''):'',note:$('qNote').value.trim()};
      if(preset.id)save(store.update('qarz',preset.id,d),'Saqlandi');else{d.created=Date.now();save(store.add('qarz',d),QT[type][0]+': '+money(amount,d.cur))}
      back()};
    const back=()=>{if(preset._from)personSheet(preset._from);else closeSheet()};
    if(preset._from)r.querySelectorAll('[data-close]').forEach(b=>b.onclick=back);
    if($('qDel'))$('qDel').onclick=()=>{if(confirm('Bu yozuv o\'chirilsinmi?')){save(store.del('qarz',preset.id),'O\'chirildi');back()}};
  });
}
function personSheet(key){
  const draw=()=>{
    const p=people().find(x=>keyName(x.name)===key);
    if(!p){closeSheet();return}
    const dir=p.bal.UZS>0||p.bal.USD>0?'Menga qarzdor':p.open?'Men qarzdorman':'Hisob yopilgan';
    $('sheet').innerHTML='<div class="grab"></div><div class="row"><h3>'+esc(p.name)+'</h3><button class="btn sm ghost" data-close>Yopish</button></div>'
      +'<div class="card"><span class="muted">'+dir+'</span><div class="big">'+balText(p.bal,true)+'</div>'+(p.due?'<span class="muted">Qaytarish muddati: '+fmtDate(p.due)+'</span>':'')+'</div>'
      +'<div class="grid2"><button class="btn ghost" data-q="berdim">+ Berdim</button><button class="btn ghost" data-q="qaytardi">Qaytardi</button><button class="btn ghost" data-q="oldim">+ Oldim</button><button class="btn ghost" data-q="qaytardim">Qaytardim</button></div>'
      +'<button class="btn ghost" id="pRem">⏰ Eslatma qo\'yish</button>'
      +'<section class="card"><h2>Tarix</h2><div class="list">'+p.items.map(e=>'<button class="item" data-e="'+e.id+'"><div style="min-width:0"><div class="t">'+QT[e.type][0]+(e.note?' · <span class="muted">'+esc(e.note)+'</span>':'')+'</div><div class="s">'+fmtDate(e.date)+(e.due?' · muddat '+fmtDate(e.due):'')+'</div></div><span class="num '+(QT[e.type][1]>0?'plus':'minus')+'">'+(QT[e.type][1]>0?'+':'−')+money(e.amount,e.cur)+'</span></button>').join('')+'</div></section>'
      +'<p class="muted" style="margin:0">«+» — sizning foydangizga, «−» — sizning zimmangizga.</p>';
    const r=$('sheet');
    r.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeSheet);
    r.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{const t=b.dataset.q;let cur='UZS';if(p.bal.USD&&!p.bal.UZS)cur='USD';
      const amount=(t==='qaytardi'&&p.bal[cur]>0)?p.bal[cur]:(t==='qaytardim'&&p.bal[cur]<0)?-p.bal[cur]:0;
      qarzForm({type:t,name:p.name,cur,amount,_from:key})});
    r.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>qarzForm(Object.assign({_from:key},p.items.find(e=>e.id===b.dataset.e))));
    $('pRem').onclick=()=>{const amt=balText(p.bal).replace(/<[^>]+>/g,'');eslForm({text:(p.bal.UZS>0||p.bal.USD>0?p.name+' qarzini qaytarishi kerak ('+amt+')':p.name+'ga qarzni qaytarish ('+amt.replace('−','')+')'),at:p.due?localInputToMs(p.due+'T09:00'):null})};
  };
  $('sheet').hidden=false;$('sheetBg').hidden=false;$('sheet').scrollTop=0;
  draw();sheetRefresh=draw;
}

/* ---------- Xodim formalari ---------- */
function xodimForm(x){
  x=x||{};
  sheet('<h3>'+(x.id?'Xodimni tahrirlash':'Yangi xodim')+'</h3>'
    +field('Ism','<input id="xName" placeholder="Masalan, Shoxjaxon" value="'+esc(x.name||'')+'">')
    +(x.id?'':field('Oylik (so\'m)','<input id="xSal" class="amount" inputmode="numeric" placeholder="5 000 000">')+field('Kelmagan kun uchun ayriladi (so\'m)','<input id="xCut" class="amount" inputmode="numeric" placeholder="Bo\'sh — avtomatik">')+field('Qaysi oydan','<input id="xFrom" type="month" value="'+xMonth+'">'))
    +field('Telefon','<input id="xTel" type="tel" placeholder="Ixtiyoriy" value="'+esc(x.tel||'')+'">')
    +'<div class="actions"><button class="btn ghost" data-close>Bekor</button><button class="btn" id="xSave">Saqlash</button></div>',
  ()=>{if(!x.id)setTimeout(()=>$('xName').focus(),50);
    $('xSave').onclick=()=>{const name=normName($('xName').value);if(!name){toast('Ismni yozing');return}
      if(x.id){save(store.update('xod',x.id,{name,tel:$('xTel').value.trim()}),'Saqlandi');xodimSheet(x.id);return}
      const sal=parseAmount($('xSal').value);if(!sal){toast('Oylikni yozing');return}
      save(store.add('xod',{name,tel:$('xTel').value.trim(),sal:{[$('xFrom').value||xMonth]:sal},cut:{[$('xFrom').value||xMonth]:parseAmount($('xCut').value)},arch:false,created:Date.now()}),name+' qo\'shildi');closeSheet()}});
}
function salaryForm(x){
  const fx=mapFor(x.cut,xMonth);
  sheet('<h3>'+esc(x.name)+' oyligi</h3>'
    +field('Oylik (so\'m)','<input id="sAmt" class="amount" inputmode="numeric" value="'+group(salaryFor(x,xMonth))+'">')
    +field('Kelmagan har bir kun uchun ayriladi (so\'m)','<input id="sCut" class="amount" inputmode="numeric" placeholder="Avtomatik: oylik ÷ kunlar" value="'+(fx?group(fx):'')+'">')
    +'<p class="muted" style="margin:-4px 0 0">Bo\'sh qoldirsangiz, oylikdan avtomatik hisoblanadi. Yarim kunga buning yarmi ayriladi.</p>'
    +field('Qaysi oydan boshlab','<input id="sFrom" type="month" value="'+xMonth+'">')
    +'<p class="muted" style="margin:0">Oldingi oylar hisobi o\'zgarmaydi.</p>'
    +'<div class="actions"><button class="btn ghost" data-close>Bekor</button><button class="btn" id="sSave">Saqlash</button></div>',
  ()=>{$('sSave').onclick=()=>{const v=parseAmount($('sAmt').value),from=$('sFrom').value||xMonth;if(!v){toast('Summani yozing');return}
    const sal=Object.assign({},x.sal||{});sal[from]=v;
    // shu oydan keyingi eski belgilashlar ham yangi qiymatga teng bo'ladi
    Object.keys(sal).forEach(k=>{if(k>from)delete sal[k]});
    const cut=Object.assign({},x.cut||{});cut[from]=parseAmount($('sCut').value);
    Object.keys(cut).forEach(k=>{if(k>from)delete cut[k]});
    const p=DEMO?store.update('xod',x.id,{sal,cut}):db.collection(COL.xod).doc(x.id).update({sal,cut});
    save(p,'Saqlandi — '+monthName(from)+'dan');xodimSheet(x.id)}});
}
function entryForm(x,type,e){
  e=e||{};
  const isNew=!e.id;type=e.type||type;
  const dateDef=xMonth===ym()?today():xMonth+'-01';
  let body='';
  if(type==='kelmadi')body=segHtml('days',[['1','To\'liq kun'],['0.5','Yarim kun']],String(e.days||1))+field('Sana','<input id="eDate" type="date" value="'+(e.date||dateDef)+'">');
  else body=field('Summa (so\'m)','<input id="eAmt" class="amount" inputmode="numeric" placeholder="0" value="'+(e.amount?group(e.amount):'')+'">')+field('Sana','<input id="eDate" type="date" value="'+(e.date||dateDef)+'">');
  body+=field('Izoh','<input id="eNote" placeholder="Ixtiyoriy" value="'+esc(e.note||'')+'">');
  if(type==='tolov'&&isNew){const p=payroll(x,xMonth);if(p.left>0)setTimeout(()=>{if($('eAmt'))$('eAmt').value=group(p.left)},0)}
  sheet('<h3>'+esc(x.name)+': '+OT[type]+'</h3>'+body
    +'<div class="actions">'+(isNew?'<button class="btn ghost" id="eBack">Bekor</button>':'<button class="btn danger" id="eDel">O\'chirish</button>')+'<button class="btn" id="eSave">Saqlash</button></div>',
  r=>{if(type==='kelmadi')segBind(r,'days');else if(isNew&&type!=='tolov')setTimeout(()=>$('eAmt').focus(),50);
    $('eSave').onclick=()=>{const date=$('eDate').value||dateDef;
      const d={xid:x.id,type,date,month:date.slice(0,7),note:$('eNote').value.trim()};
      if(type==='kelmadi')d.days=Number(segVal(r,'days'));else{d.amount=parseAmount($('eAmt').value);if(!d.amount){toast('Summani yozing');return}}
      if(d.month!==xMonth)xMonth=d.month;
      if(isNew){d.created=Date.now();save(store.add('oy',d),'Yozildi')}else save(store.update('oy',e.id,d),'Saqlandi');
      xodimSheet(x.id)};
    if($('eBack'))$('eBack').onclick=()=>xodimSheet(x.id);
    if($('eDel'))$('eDel').onclick=()=>{if(confirm('O\'chirilsinmi?')){save(store.del('oy',e.id),'O\'chirildi');xodimSheet(x.id)}}});
}
function xodimSheet(id){
  const draw=()=>{
    const x=S.xod.find(z=>z.id===id);if(!x){closeSheet();return}
    const p=payroll(x,xMonth);
    let h='<div class="grab"></div><div class="row"><h3>'+esc(x.name)+'</h3><button class="btn sm ghost" data-close>Yopish</button></div>';
    h+='<div class="month"><button class="icon-btn" id="smPrev">‹</button><b>'+monthName(xMonth)+'</b><button class="icon-btn" id="smNext">›</button></div>';
    h+='<section class="card calc">'
      +'<div class="row"><span>Oylik</span><button class="btn sm ghost num" id="salEdit">'+money(p.sal,'UZS')+' ✎</button></div>'
      +(p.absent?'<div class="row"><span>Kelmadi: '+daysText(p.absent)+' <span class="muted">(kuniga '+group(p.daily)+')</span></span><span class="num minus">−'+group(p.cut)+'</span></div>':'')
      +(p.bonus?'<div class="row"><span>Bonus</span><span class="num plus">+'+group(p.bonus)+'</span></div>':'')
      +(p.fine?'<div class="row"><span>Jarima</span><span class="num minus">−'+group(p.fine)+'</span></div>':'')
      +'<div class="row"><span>Ishlab topgani</span><span class="num">'+money(p.earned,'UZS')+'</span></div>'
      +(p.adv?'<div class="row"><span>Avans olgan</span><span class="num minus">−'+group(p.adv)+'</span></div>':'')
      +(p.paid?'<div class="row"><span>Oylik berildi</span><span class="num minus">−'+group(p.paid)+'</span></div>':'')
      +'<div class="row tot"><span>'+(p.left<0?'Ortiqcha berilgan':'Berilishi kerak')+'</span><span class="num '+(p.left<0?'minus':'')+'">'+money(Math.abs(p.left),'UZS')+'</span></div>'
      +'</section>';
    h+='<div class="grid2"><button class="btn ghost" data-t="avans">💵 Avans berdim</button><button class="btn ghost" data-t="kelmadi">✕ Kelmadi</button><button class="btn ghost" data-t="bonus">+ Bonus</button><button class="btn ghost" data-t="jarima">− Jarima</button></div>';
    h+='<button class="btn" data-t="tolov">✓ Oylikni berdim</button>';
    h+='<section class="card"><h2>'+monthName(xMonth)+' yozuvlari</h2><div class="list">'+(p.rows.length?p.rows.map(r=>{
        const sign=r.type==='bonus'?'plus':r.type==='kelmadi'?'warn':'minus';
        const val=r.type==='kelmadi'?daysText(Number(r.days)||1):(r.type==='bonus'?'+':'−')+group(r.amount);
        return '<button class="item" data-r="'+r.id+'"><div style="min-width:0"><div class="t">'+OT[r.type]+(r.note?' · <span class="muted">'+esc(r.note)+'</span>':'')+'</div><div class="s">'+fmtDate(r.date)+'</div></div><span class="num '+sign+'">'+val+'</span></button>'}).join(''):'<div class="empty">Bu oyda yozuv yo\'q</div>')+'</div></section>';
    h+='<p class="muted" style="margin:0">'+(p.fixed?'Kelmagan har bir kun uchun '+money(p.fixed,'UZS')+' ayriladi (siz belgilagan).':'Kelmagan kun: oylik ÷ '+p.div+' kun = '+money(p.daily,'UZS')+'.')+' O\'zgartirish uchun oylik summasini bosing.</p>';
    h+='<div class="grid2"><button class="btn ghost" id="xEdit">Ism / telefon</button>'+(x.arch?'<button class="btn" id="xRestore">Qaytarish</button>':'<button class="btn danger" id="xArch">Olib tashlash</button>')+'</div>';
    if(x.arch)h+='<button class="btn danger" id="xDelete">Butunlay o\'chirish</button>';
    const r=$('sheet');r.innerHTML=h;
    r.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeSheet);
    $('smPrev').onclick=()=>{xMonth=shiftMonth(xMonth,-1);render()};$('smNext').onclick=()=>{xMonth=shiftMonth(xMonth,1);render()};
    $('salEdit').onclick=()=>salaryForm(x);
    r.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>entryForm(x,b.dataset.t));
    r.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>entryForm(x,null,p.rows.find(z=>z.id===b.dataset.r)));
    $('xEdit').onclick=()=>xodimForm(x);
    if($('xArch'))$('xArch').onclick=()=>{if(confirm(x.name+' ro\'yxatdan olib tashlansinmi? Hisob-kitoblari saqlanib qoladi.')){save(store.update('xod',x.id,{arch:true}),'Olib tashlandi');closeSheet()}};
    if($('xRestore'))$('xRestore').onclick=()=>{save(store.update('xod',x.id,{arch:false}),'Qaytarildi');closeSheet()};
    if($('xDelete'))$('xDelete').onclick=()=>{if(confirm(x.name+' va uning barcha yozuvlari butunlay o\'chirilsinmi? Buni qaytarib bo\'lmaydi.')){
      S.oy.filter(z=>z.xid===x.id).forEach(z=>store.del('oy',z.id));save(store.del('xod',x.id),'O\'chirildi');closeSheet()}};
  };
  $('sheet').hidden=false;$('sheetBg').hidden=false;$('sheet').scrollTop=0;
  draw();sheetRefresh=draw;
}
function importOld(){
  const seed=[['Iqbolmirzo'],['Shoxjaxon'],['Hayrullo']];
  seed.forEach(s=>store.add('xod',{name:s[0],tel:'',sal:{},arch:false,created:Date.now()}));
  toast('Qo\'shildi. Endi har biriga oylik belgilang.');
}

/* ---------- Eslatmalar ---------- */
function eslForm(e){
  e=e||{};
  const def=e.at||(Date.now()+3600e3);
  sheet('<h3>'+(e.id?'Eslatma':'Yangi eslatma')+'</h3>'
    +field('Nima','<textarea id="eText" placeholder="Masalan, soliqni to\'lash">'+esc(e.text||'')+'</textarea>')
    +field('Qachon','<input id="eAt" type="datetime-local" value="'+msToLocalInput(def)+'">')
    +'<div class="grid3"><button class="btn sm ghost" data-q="0">Bugun 18:00</button><button class="btn sm ghost" data-q="1">Ertaga 9:00</button><button class="btn sm ghost" data-q="7">1 haftadan</button></div>'
    +'<div class="actions">'+(e.id?'<button class="btn danger" id="eDel">O\'chirish</button>':'<button class="btn ghost" data-close>Bekor</button>')+'<button class="btn" id="eSave">Saqlash</button></div>',
  r=>{if(!e.text)setTimeout(()=>$('eText').focus(),50);
    r.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{const n=+b.dataset.q;const d=new Date(Date.now()+TZ+n*864e5);const day=d.toISOString().slice(0,10);$('eAt').value=day+'T'+(n===0?'18:00':'09:00')});
    $('eSave').onclick=()=>{const text=$('eText').value.trim();if(!text){toast('Matnni yozing');return}
      const at=$('eAt').value?localInputToMs($('eAt').value):def;
      if(e.id)save(store.update('esl',e.id,{text,at,notified:false}),'Saqlandi');else save(store.add('esl',{text,at,done:false,created:Date.now()}),'Eslatma qo\'yildi: '+fmtDT(at));
      closeSheet();if('Notification' in window&&Notification.permission==='default'&&!DEMO)Notification.requestPermission().then(scheduleNotifs)};
    if($('eDel'))$('eDel').onclick=()=>{save(store.del('esl',e.id),'O\'chirildi');closeSheet()}});
}
let notifTimers=[];
function scheduleNotifs(){
  notifTimers.forEach(clearTimeout);notifTimers=[];
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  const now=Date.now();
  S.esl.filter(e=>!e.done&&!e.notified&&e.at<now+864e5).forEach(e=>{
    notifTimers.push(setTimeout(()=>{
      const opts={body:fmtDT(e.at),tag:'esl-'+e.id,icon:'../icon-192.png',data:{url:location.href.split('#')[0]+'#esl'}};
      (navigator.serviceWorker&&navigator.serviceWorker.ready?navigator.serviceWorker.ready.then(r=>r.showNotification(e.text,opts)):Promise.reject()).catch(()=>{try{new Notification(e.text,opts)}catch(x){}});
      store.update('esl',e.id,{notified:true}).catch(()=>{});
    },Math.max(0,e.at-now)));
  });
}

/* ---------- Sozlamalar ---------- */
function settingsSheet(){
  sheet('<h3>Sozlamalar</h3>'
    +field('Kelmagan kun qanday hisoblansin','<select id="sDiv"><option value="days">Oylik ÷ oydagi kunlar soni (28–31)</option><option value="30">Oylik ÷ 30 kun</option><option value="26">Oylik ÷ 26 ish kuni</option></select>')
    +'<p class="muted" style="margin:0">Masalan, 5 000 000 so\'m oylik, 31 kunlik oyda 1 kun kelmasa: −'+group(5e6/31)+' so\'m.</p>'
    +'<a class="btn ghost" style="text-decoration:none" href="../rahbar/">Eski rahbar paneli (xodimlar arxivi)</a>'
    +'<div class="muted">Kirgan: '+esc(userEmail)+'</div>'
    +'<div class="actions"><button class="btn danger" id="sOut">Chiqish</button><button class="btn" id="sSave">Saqlash</button></div>',
  ()=>{$('sDiv').value=S.set.div||'days';
    $('sSave').onclick=()=>{save(store.saveSet({div:$('sDiv').value}),'Saqlandi');closeSheet()};
    $('sOut').onclick=()=>{closeSheet();if(DEMO)return;unsubs.forEach(u=>u());unsubs=[];auth.signOut()}});
}

/* ---------- Kirish ---------- */
let signedIn=false,userEmail='';
function loginView(msg){
  signedIn=false;$('tabs').hidden=true;
  app.innerHTML='<div class="wrap"><header class="hd"><div><span class="kicker">Majnuntol</span><h1>Daftarcha</h1></div></header>'
    +'<section class="card login"><p class="muted" style="margin:0;line-height:1.5">Qarzlar, xodimlar oyligi va eslatmalar. Faqat sizning akkauntingiz bilan ochiladi.</p>'
    +'<button class="btn" id="gBtn">Google bilan kirish</button>'
    +'<details><summary class="muted">Email va parol bilan</summary><div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">'
    +'<label class="f"><input id="em" type="email" placeholder="Email" autocomplete="username"></label><label class="f"><input id="pw" type="password" placeholder="Parol" autocomplete="current-password"></label><button class="btn ghost" id="eBtn">Kirish</button></div></details>'
    +'<p class="minus" id="lMsg" style="margin:0">'+esc(msg||'')+'</p></section></div>';
  $('gBtn').onclick=async()=>{const p=new firebase.auth.GoogleAuthProvider();
    try{await auth.signInWithPopup(p)}catch(e){if(e&&(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment'))auth.signInWithRedirect(p);else $('lMsg').textContent='Kirib bo\'lmadi: '+(e.message||e.code)}};
  $('eBtn').onclick=async()=>{try{await auth.signInWithEmailAndPassword($('em').value.trim(),$('pw').value)}catch(e){$('lMsg').textContent="Email yoki parol noto'g'ri"}};
}
function start(){
  if('serviceWorker' in navigator&&!DEMO)navigator.serviceWorker.register('../sw.js').catch(()=>{});
  if(DEMO){signedIn=true;userEmail='demo';seedDemo();Object.keys(demo).forEach(demoEmit);return}
  try{firebase.initializeApp(CFG.firebase);db=firebase.firestore();auth=firebase.auth();
    try{db.enablePersistence({synchronizeTabs:true}).catch(()=>{})}catch(e){}}
  catch(e){app.innerHTML='<div class="wrap"><section class="card"><p>Ilovani ochib bo\'lmadi. Internetni tekshirib, qayta oching.</p></section></div>';return}
  auth.onAuthStateChanged(u=>{
    if(!u){loginView();return}
    if(CFG.ownerEmail&&String(u.email||'').toLowerCase()!==String(CFG.ownerEmail).toLowerCase()){auth.signOut();loginView('Bu daftar sizga tegishli emas: '+(u.email||''));return}
    signedIn=true;userEmail=u.email||'';
    app.innerHTML='<div class="wrap">'+header('Yuklanmoqda…')+'</div>';$('tabs').hidden=false;
    listen();
  });
}
function seedDemo(){
  const now=Date.now(),m=ym();
  demo.qarz=[{id:'q1',type:'berdim',name:'Alisher',amount:2000000,cur:'UZS',date:m+'-03',due:m+'-20',note:'',created:now-5e8},
    {id:'q2',type:'qaytardi',name:'Alisher',amount:500000,cur:'UZS',date:m+'-10',note:'',created:now-3e8},
    {id:'q3',type:'oldim',name:'Bobur aka',amount:300,cur:'USD',date:m+'-05',due:'',note:'Tovar uchun',created:now-4e8}];
  demo.xod=[{id:'s1',name:'Shoxjaxon',sal:{[m]:5000000},arch:false,created:now},{id:'s2',name:'Hayrullo',sal:{[shiftMonth(m,-2)]:4000000},arch:false,created:now}];
  demo.oy=[{id:'o1',xid:'s1',type:'avans',amount:1000000,date:m+'-05',month:m,created:now},{id:'o2',xid:'s1',type:'kelmadi',days:1,date:m+'-08',month:m,created:now},{id:'o3',xid:'s1',type:'kelmadi',days:0.5,date:m+'-15',month:m,created:now}];
  demo.esl=[{id:'e1',text:'Soliqni to\'lash',at:now+2*3600e3,done:false,created:now}];
}
window.__daftar={S,payroll,people,salaryFor};
start();
})();
