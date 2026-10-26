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
const usd=n=>{const v=Math.round(Math.abs(n)*100)/100,i=Math.floor(v),c=Math.round((v-i)*100);return group(i)+(c?','+pad(c):'')};
const money=(n,cur)=>(n<0?'−':'')+(cur==='USD'?usd(n)+' $':group(n)+" so'm");
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
    unsubs.push(db.collection(COL[k]).onSnapshot(q=>{S[k]=q.docs.map(d=>Object.assign({id:d.id},d.data()));S.ready[k]=true;render();if(k==='esl')scheduleNotifs();runSetup();runSetup2()},
      e=>{console.error(e);showRulesError()}));
  });
  unsubs.push(db.collection('d_sozlama').doc('main').onSnapshot(d=>{S.set=Object.assign({div:'days'},d.exists?d.data():{});S.setReady=true;render();runSetup();runSetup2()},()=>{}));
}
let rulesErrShown=false;
function showRulesError(){if(rulesErrShown)return;rulesErrShown=true;
  sheet('<h3>Bazaga ruxsat yo\'q</h3><p class="muted" style="line-height:1.5">Firebase Console → Firestore Database → Rules bo\'limiga saytdagi <b>firestore.rules</b> faylini nusxalab qo\'ying va «Publish» bosing. Keyin sahifani yangilang.</p><button class="btn" data-close>Tushunarli</button>')}
/* Bir martalik sozlash (egasi so'radi, 23.10.2026): Shoxjaxon oyligi — 1 000 000 so'm + 400 $,
   avanslar so'mdan, har kelmagan kun uchun 16 $ (yarim kun 8 $). Oktabr 2026 dan boshlab. */
let setupBusy=false;
function runSetup(){
  if(DEMO||setupBusy||!S.setReady||!S.ready.xod||S.set.setupShox1)return;
  const x=S.xod.find(z=>/^sh[oa][xh]?j[ao][xh]on/.test(keyName(z.name).replace(/'/g,''))&&!z.arch);
  if(!x)return; // Shoxjaxon hali qo'shilmagan bo'lsa, qo'shilgach bajariladi
  setupBusy=true;const from='2026-10';
  const put=(m,v)=>{const o=Object.assign({},m||{});o[from]=v;Object.keys(o).forEach(k=>{if(k>from)delete o[k]});return o};
  const data={sal:put(x.sal,1000000),salUsd:put(x.salUsd,400),cut:put(x.cut,0),cutUsd:put(x.cutUsd,16)};
  // so'mda yozilgan pullar avans hisoblanadi; valyutasi yo'q eski yozuvlar so'm deb olinadi
  db.collection(COL.xod).doc(x.id).update(data)
    .then(()=>db.collection('d_sozlama').doc('main').set({setupShox1:true},{merge:true}))
    .then(()=>toast(x.name+': 1 000 000 so\'m + 400 $, kelmagan kun 16 $ — qayta hisoblandi'))
    .catch(e=>{console.error(e);setupBusy=false}); // muvaffaqiyatli bo'lsa, qayta ishga tushmaydi
}
/* Bir martalik (egasi so'radi, 23.10.2026): Shoxjaxon oktabrda jami 3 kun kelmagan. Yetmagani bitta yozuv bilan qo'shiladi. */
let setup2Busy=false;
function runSetup2(){
  if(DEMO||setup2Busy||!S.setReady||!S.ready.xod||!S.ready.oy||!S.set.setupShox1||S.set.setupShox2)return;
  const x=S.xod.find(z=>/^sh[oa][xh]?j[ao][xh]on/.test(keyName(z.name))&&!z.arch);if(!x)return;
  setup2Busy=true;
  const have=S.oy.filter(r=>r.xid===x.id&&r.month==='2026-10'&&r.type==='kelmadi').reduce((t,r)=>t+(Number(r.days)||1),0);
  const need=Math.round((3-have)*2)/2;
  const w=need>0?db.collection(COL.oy).add({xid:x.id,type:'kelmadi',days:need,date:'2026-10-23',month:'2026-10',note:'Oktabr bo\'yicha jami 3 kun',created:Date.now()}):Promise.resolve();
  w.then(()=>db.collection('d_sozlama').doc('main').set({setupShox2:true},{merge:true}))
   .then(()=>toast(need>0?x.name+': oktabrda jami 3 kun kelmadi deb yozildi':x.name+': oktabrda allaqachon '+have+' kun kelmagan, o\'zgartirilmadi'))
   .catch(e=>{console.error(e);setup2Busy=false});
}
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
const salText=o=>{const parts=CUR.filter(c=>o[c]).map(c=>money(o[c],c));return parts.length?parts.join(' + '):"0 so'm"};
const sumText=(o)=>{const parts=['UZS','USD'].filter(c=>o[c]).map(c=>money(o[c],c));return parts.length?parts.join(' · '):"0 so'm"};

/* ---------- Oylik hisoblari ---------- */
function mapFor(s,k){s=s||{};let best=null;Object.keys(s).forEach(m=>{if(m<=k&&(best===null||m>best))best=m});return best===null?0:(s[best]||0)}
function salaryFor(x,k){return mapFor(x.sal,k)}
function divisor(k){const d=S.set.div;return d==='30'?30:d==='26'?26:daysIn(k)}
const CUR=['UZS','USD'];
const zero=()=>({UZS:0,USD:0});
// Kelmagan kun narxi: belgilangan $ → belgilangan so'm → avtomatik (oylik ÷ kunlar)
function dayRate(x,k){
  const fu=mapFor(x.cutUsd,k),fz=mapFor(x.cut,k);
  if(fu)return {cur:'USD',daily:fu,fixed:true};
  if(fz)return {cur:'UZS',daily:fz,fixed:true};
  const su=mapFor(x.sal,k),sd=mapFor(x.salUsd,k),div=divisor(k);
  if(su)return {cur:'UZS',daily:su/div,fixed:false,div};
  if(sd)return {cur:'USD',daily:sd/div,fixed:false,div};
  return {cur:'UZS',daily:0,fixed:false,div};
}
function payroll(x,k){
  const rows=S.oy.filter(r=>r.xid===x.id&&r.month===k).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.created||0)-(b.created||0));
  const sal={UZS:mapFor(x.sal,k),USD:mapFor(x.salUsd,k)},rate=dayRate(x,k);
  let absent=0;const adv=zero(),bonus=zero(),fine=zero(),paid=zero(),cut=zero(),earned=zero(),left=zero();
  rows.forEach(r=>{const c=r.cur==='USD'?'USD':'UZS',a=r.amount||0;
    if(r.type==='kelmadi')absent+=Number(r.days)||1;else if(r.type==='avans')adv[c]+=a;else if(r.type==='bonus')bonus[c]+=a;else if(r.type==='jarima')fine[c]+=a;else if(r.type==='tolov')paid[c]+=a});
  cut[rate.cur]=rate.cur==='USD'?Math.round(rate.daily*absent*100)/100:Math.round(rate.daily*absent);
  CUR.forEach(c=>{earned[c]=Math.round((sal[c]-cut[c]+bonus[c]-fine[c])*100)/100;left[c]=Math.round((earned[c]-adv[c]-paid[c])*100)/100});
  return {rows,sal,rate,absent,cut,adv,bonus,fine,paid,earned,left};
}
/* ---------- Davriy oylik: har bir xodimning o'z davri ----------
   Ishga kelgan kundan bir oy: 26.10 → 25.11 (oylik kuni 26.11). Muddatidan oldin olsa — ishlagan kunlari
   uchun oladi va ertasidan yangi davr noldan boshlanadi. Olmasa — to'liq oylik, keyingi davr o'zi boshlanadi. */
const isoD=s=>{const [y,m,d]=s.split('-').map(Number);return Date.UTC(y,m-1,d)};
const fromD=t=>{const d=new Date(t);return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())};
const addDays=(s,n)=>fromD(isoD(s)+n*864e5);
const addMonth=s=>{let [y,m,d]=s.split('-').map(Number);m++;if(m>12){m=1;y++}const dim=new Date(Date.UTC(y,m,0)).getUTCDate();return y+'-'+pad(m)+'-'+pad(Math.min(d,dim))};
const dayDiff=(a,b)=>Math.round((isoD(b)-isoD(a))/864e5);
const dm=s=>s?s.slice(8,10)+'.'+s.slice(5,7):'';
const davriy=x=>!!(x&&x.start&&/^\d{4}-\d{2}-\d{2}$/.test(x.start));
function periodsOf(x){
  if(!davriy(x))return [];
  const closes=S.oy.filter(r=>r.xid===x.id&&r.type==='tolov'&&r.close&&r.upto);
  const out=[],td=today();let st=x.start;
  for(let i=0;i<240;i++){
    const nat=addDays(addMonth(st),-1);
    const c=closes.filter(r=>(r.pstart?r.pstart===st:(r.upto>=st&&r.upto<=nat))&&r.upto>=st&&r.upto<=nat).map(r=>r.upto).sort()[0];
    const end=c||nat;
    out.push({start:st,end,nat,L:dayDiff(st,nat)+1,closed:!!c});
    st=addDays(end,1);
    if(st>td)break;
  }
  return out;
}
function curPeriod(x){const ps=periodsOf(x);return ps[ps.length-1]}
function payrollP(x,per,asOf){
  asOf=asOf||today();
  const rows=S.oy.filter(r=>r.xid===x.id&&(r.pstart?r.pstart===per.start:(r.date>=per.start&&r.date<=per.end)))
    .sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.created||0)-(b.created||0));
  const mk=per.start.slice(0,7),sal={UZS:mapFor(x.sal,mk),USD:mapFor(x.salUsd,mk)};
  const fu=mapFor(x.cutUsd,mk),fz=mapFor(x.cut,mk);
  const rate=fu?{cur:'USD',daily:fu,fixed:true}:fz?{cur:'UZS',daily:fz,fixed:true}:sal.UZS?{cur:'UZS',daily:sal.UZS/per.L,fixed:false,div:per.L}:{cur:'USD',daily:sal.USD/per.L,fixed:false,div:per.L};
  const upto=per.closed?per.end:(asOf<per.end?asOf:per.end);
  const worked=Math.max(0,Math.min(per.L,dayDiff(per.start,upto)+1));
  let absent=0;const adv=zero(),bonus=zero(),fine=zero(),paid=zero(),cut=zero(),base=zero(),earned=zero(),left=zero();
  rows.forEach(r=>{const c=r.cur==='USD'?'USD':'UZS',a=r.amount||0;
    if(r.type==='kelmadi')absent+=Number(r.days)||1;else if(r.type==='avans')adv[c]+=a;else if(r.type==='bonus')bonus[c]+=a;else if(r.type==='jarima')fine[c]+=a;else if(r.type==='tolov')paid[c]+=a});
  CUR.forEach(c=>{base[c]=c==='USD'?Math.round(sal[c]*worked/per.L*100)/100:Math.round(sal[c]*worked/per.L)});
  cut[rate.cur]=rate.cur==='USD'?Math.round(rate.daily*absent*100)/100:Math.round(rate.daily*absent);
  CUR.forEach(c=>{earned[c]=Math.round((base[c]-cut[c]+bonus[c]-fine[c])*100)/100;left[c]=Math.round((earned[c]-adv[c]-paid[c])*100)/100});
  return {per,rows,sal,base,worked,upto,rate,absent,cut,adv,bonus,fine,paid,earned,left};
}
// Ro'yxat va jami uchun: davriy xodimda — joriy davr, boshqalarda — tanlangan kalendar oyi
function payCur(x,k){return davriy(x)?payrollP(x,curPeriod(x)):payroll(x,k)}
const any=o=>!!(o.UZS||o.USD);
const addTo=(t,o)=>CUR.forEach(c=>t[c]+=o[c]);
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
  if(locked){lockView();return}
  $('tabs').hidden=false;
  $('tabs').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.t===tab));
  const y=window.scrollY;
  let h='';
  if(tab==='home')h=viewHome();else if(tab==='qarz')h=viewQarz();else if(tab==='xodim')h=viewXodim();else h=viewEsl();
  app.innerHTML='<div class="wrap">'+h+'</div>'+(tab!=='home'?'<button class="fab" id="fab" aria-label="Qo\'shish">+</button>':'');
  window.scrollTo(0,y);
  bindView();
  if(sheetRefresh)sheetRefresh();
  syncViews();
}

function viewHome(){
  return '<header class="hd"><div><span class="kicker">Daftarcha</span></div>'+gear+'</header>'
    +'<section class="quote"><p>Pulga mehr qo\'yma.<br>Lekin isrof ham qilma.</p></section>';
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
  if(!showArch){const tot=zero(),adv=zero();list.forEach(x=>{const p=payCur(x,xMonth);addTo(tot,p.left);addTo(adv,p.adv)});
    h+='<div class="grid2"><div class="stat"><span class="muted">Berilishi kerak</span><span class="num">'+sumText(tot)+'</span></div><div class="stat"><span class="muted">Avans berilgan</span><span class="num">'+sumText(adv)+'</span></div></div>'}
  h+='<section class="card"><div class="list">';
  if(!list.length){h+='<div class="empty">'+(showArch?'Olib tashlangan xodim yo\'q':'Xodim qo\'shilmagan. Pastdagi «+» tugmasini bosing.')+'</div>';
    if(!showArch&&!S.xod.length&&!DEMO)h+='<button class="btn ghost" id="importOld">Eski ro\'yxatdan qo\'shish (Iqbolmirzo, Shoxjaxon, Hayrullo)</button>'}
  list.forEach(x=>{const p=payCur(x,xMonth);
    const bits=[];if(p.per)bits.push('davr '+dm(p.per.start)+'–'+dm(p.per.end)+' ('+p.worked+'/'+p.per.L+' kun)');if(p.absent)bits.push(daysText(p.absent)+' kelmadi');if(any(p.adv))bits.push('avans '+sumText(p.adv));if(any(p.paid))bits.push('berildi '+sumText(p.paid));
    const neg=p.left.UZS<0||p.left.USD<0,done=!any(p.left)&&any(p.paid);
    h+='<button class="item" data-x="'+x.id+'"><div style="min-width:0"><div class="t">'+esc(x.name)+'</div><div class="s">Oylik '+salText(p.sal)+(bits.length?' · '+bits.join(' · '):'')+'</div></div><div style="text-align:right">'+CUR.filter(c=>p.left[c]||(c==='UZS'&&!p.left.USD)).map(c=>'<div class="num '+(p.left[c]<0?'minus':'')+'">'+money(p.left[c],c)+'</div>').join('')+'<div class="s muted">'+(done?'to\'landi':'qoldi')+'</div></div></button>'});
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
function payFields(x,k,noFrom){
  x=x||{};const fu=mapFor(x.cutUsd,k),fz=mapFor(x.cut,k),sz=mapFor(x.sal,k),sd=mapFor(x.salUsd,k);
  return '<div class="grid2">'+field('Oylik, so\'m','<input id="pSz" class="amount" inputmode="numeric" placeholder="0" value="'+(sz?group(sz):'')+'">')
    +field('Oylik, $','<input id="pSd" class="amount" inputmode="numeric" placeholder="0" value="'+(sd?group(sd):'')+'">')+'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 110px;gap:8px">'+field('Kelmagan 1 kun uchun ayriladi','<input id="pCut" class="amount" inputmode="numeric" placeholder="Avtomatik" value="'+(fu?group(fu):fz?group(fz):'')+'">')
    +field('Valyuta','<select id="pCutCur"><option value="USD"'+(fu||(!fz&&sd&&!sz)?' selected':'')+'>$</option><option value="UZS"'+(fz||(!fu&&!(sd&&!sz))?' selected':'')+'>so\'m</option></select>')+'</div>'
    +'<p class="muted" style="margin:-4px 0 0">Yarim kunga buning yarmi ayriladi. Bo\'sh qoldirsangiz, oylikdan avtomatik hisoblanadi.</p>'
    +(noFrom?'':field('Qaysi oydan boshlab','<input id="pFrom" type="month" value="'+k+'">'));
}
function readPay(x,fromOverride){
  x=x||{};const from=fromOverride||($('pFrom')&&$('pFrom').value)||xMonth,sz=parseAmount($('pSz').value),sd=parseAmount($('pSd').value),c=parseAmount($('pCut').value),cc=$('pCutCur').value;
  if(!sz&&!sd){toast('Oylikni yozing');return null}
  const put=(m,v)=>{const o=Object.assign({},m||{});o[from]=v;Object.keys(o).forEach(k=>{if(k>from)delete o[k]});return o};
  return {from,data:{sal:put(x.sal,sz),salUsd:put(x.salUsd,sd),cut:put(x.cut,cc==='UZS'?c:0),cutUsd:put(x.cutUsd,cc==='USD'?c:0)}};
}
function xodimForm(x){
  x=x||{};
  sheet('<h3>'+(x.id?'Xodimni tahrirlash':'Yangi xodim')+'</h3>'
    +field('Ism','<input id="xName" placeholder="Masalan, Shoxjaxon" value="'+esc(x.name||'')+'">')
    +field('Ishga kelgan sana','<input id="xStart" type="date" value="'+esc(x.id?(x.start||''):today())+'">')
    +'<p class="muted" style="margin:-4px 0 0">'+(x.id?'Bo\'sh qoldirsangiz — oylik kalendar oyi bo\'yicha hisoblanadi.':'Oylik shu kundan boshlab har oy hisoblanadi: masalan 26.10 → 26.11.')+'</p>'
    +(x.id?'':payFields(null,xMonth,true))
    +field('Telefon','<input id="xTel" type="tel" placeholder="Ixtiyoriy" value="'+esc(x.tel||'')+'">')
    +'<div class="actions"><button class="btn ghost" '+(x.id?'id="xBack"':'data-close')+'>Bekor</button><button class="btn" id="xSave">Saqlash</button></div>',
  ()=>{if(!x.id)setTimeout(()=>$('xName').focus(),50);
    if($('xBack'))$('xBack').onclick=()=>xodimSheet(x.id);
    $('xSave').onclick=()=>{const name=normName($('xName').value);if(!name){toast('Ismni yozing');return}
      const start=$('xStart').value||'';
      if(x.id){save(store.update('xod',x.id,{name,tel:$('xTel').value.trim(),start}),'Saqlandi');xodimSheet(x.id);return}
      if(!start){toast('Ishga kelgan sanani kiriting');return}
      const r=readPay(null,start.slice(0,7));if(!r)return;
      if(xMonth<start.slice(0,7))xMonth=start.slice(0,7);
      save(store.add('xod',Object.assign({name,tel:$('xTel').value.trim(),start,arch:false,created:Date.now()},r.data)),name+' qo\'shildi');closeSheet()}});
}
function salaryForm(x){
  const km=davriy(x)?(curPeriod(x).start.slice(0,7)):xMonth;
  sheet('<h3>'+esc(x.name)+' oyligi</h3>'+payFields(x,km)
    +'<p class="muted" style="margin:0">Oldingi oylar hisobi o\'zgarmaydi.</p>'
    +'<div class="actions"><button class="btn ghost" id="sBack">Bekor</button><button class="btn" id="sSave">Saqlash</button></div>',
  ()=>{$('sBack').onclick=()=>xodimSheet(x.id);
    $('sSave').onclick=()=>{const r=readPay(x);if(!r)return;
    const p=DEMO?store.update('xod',x.id,r.data):db.collection(COL.xod).doc(x.id).update(r.data);
    save(p,'Saqlandi — '+monthName(r.from)+'dan');xodimSheet(x.id)}});
}
const kVal=r=>{const v=segVal(r,'days');if(v!=='n')return Number(v);const n=Number(String($('kDays').value).replace(',','.'));return isFinite(n)&&n>0?Math.round(n*2)/2:0};
function entryForm(x,type,e,per){
  e=e||{};
  const isNew=!e.id;type=e.type||type;
  const D=davriy(x)&&per;
  const td=today();
  const dateDef=D?(td>=per.start&&td<=per.end?td:(td>per.end?per.end:per.start)):(xMonth===ym()?td:xMonth+'-01');
  const p=D?payrollP(x,per):payroll(x,xMonth);
  // standart valyuta: avans — so'm; to'lov — qoldig'i bor valyuta; jarima — kunlik ayirish valyutasi
  let cur=e.cur||(type==='tolov'?(p.left.UZS>0?'UZS':p.left.USD>0?'USD':'UZS'):type==='jarima'?p.rate.cur:'UZS');
  let body='';
  const d0=Number(e.days)||1,dv=d0===1?'1':d0===0.5?'0.5':'n';
  if(type==='kelmadi')body=segHtml('days',[['1','To\'liq kun'],['0.5','Yarim kun'],['n','Necha kun']],dv)
    +'<label class="f" id="kN"'+(dv==='n'?'':' hidden')+'><span>Necha kun (yarim kun — 0,5)</span><input id="kDays" inputmode="decimal" value="'+(dv==='n'?String(d0).replace('.',','):'2')+'"></label>'
    +'<p class="muted" id="kHint" style="margin:-4px 0 0"></p>'+field('Sana','<input id="eDate" type="date" value="'+(e.date||dateDef)+'">');
  else{
    if(D&&type==='tolov'){
      const uptoDef=e.upto||(per.closed?per.end:(td<per.nat?(td<per.start?per.start:td):per.nat));
      body+=field('Qaysi kungacha ishladi','<input id="eUpto" type="date" min="'+per.start+'" max="'+per.nat+'" value="'+uptoDef+'">')
        +'<p class="muted" id="uHint" style="margin:-4px 0 0;line-height:1.45"></p>';
    }
    body+='<div style="display:grid;grid-template-columns:1fr 110px;gap:8px">'+field('Summa','<input id="eAmt" class="amount" inputmode="numeric" placeholder="0" value="'+(e.amount?group(e.amount):'')+'">')
      +field('Valyuta','<select id="eCur"><option value="UZS">so\'m</option><option value="USD"'+(cur==='USD'?' selected':'')+'>$</option></select>')+'</div>'
      +field(D&&type==='tolov'?'Berilgan sana':'Sana','<input id="eDate" type="date" value="'+(e.date||(D&&type==='tolov'?td:dateDef))+'">');
  }
  body+=field('Izoh','<input id="eNote" placeholder="Ixtiyoriy" value="'+esc(e.note||'')+'">');
  sheet('<h3>'+esc(x.name)+': '+OT[type]+'</h3>'+(D?'<p class="muted" style="margin:-6px 0 0">Davr: '+fmtDate(per.start)+' – '+fmtDate(per.nat)+'</p>':'')+body
    +'<div class="actions">'+(isNew?'<button class="btn ghost" id="eBack">Bekor</button>':'<button class="btn danger" id="eDel">O\'chirish</button>')+'<button class="btn" id="eSave">Saqlash</button></div>',
  r=>{
    if(type==='kelmadi'){const h=()=>{const n=kVal(r);$('kN').hidden=segVal(r,'days')!=='n';$('kHint').textContent=p.rate.daily&&n?'Oylikdan '+money(p.rate.daily*n,p.rate.cur)+' ayriladi':''};segBind(r,'days',h);$('kDays').oninput=h;h()}
    else{
      const fill=()=>{
        if(type!=='tolov'||!isNew)return;
        const c=$('eCur').value;let q=p;
        if(D){const u=$('eUpto').value||per.nat;q=payrollP(x,Object.assign({},per,{end:u,closed:true}));
          const n=Math.max(0,dayDiff(per.start,u)+1),early=u<per.nat;
          $('uHint').textContent=early?fmtDate(per.start)+' – '+fmtDate(u)+' ('+n+' kun) uchun. Yangi davr '+fmtDate(addDays(u,1))+' dan noldan boshlanadi.'
            :'To\'liq davr ('+per.L+' kun). Keyingi davr '+fmtDate(addDays(per.nat,1))+' dan boshlanadi.'}
        $('eAmt').value=q.left[c]>0?group(q.left[c]):''};
      $('eCur').onchange=fill;if($('eUpto'))$('eUpto').onchange=fill;fill();
      if(isNew&&type!=='tolov')setTimeout(()=>$('eAmt').focus(),50)}
    $('eSave').onclick=()=>{const date=$('eDate').value||dateDef;
      const d={xid:x.id,type,date,month:date.slice(0,7),note:$('eNote').value.trim()};
      if(D)d.pstart=per.start;
      if(type==='kelmadi'){d.days=kVal(r);if(!(d.days>0)){toast('Kunlar sonini yozing');return}}else{d.amount=parseAmount($('eAmt').value);d.cur=$('eCur').value;if(!d.amount){toast('Summani yozing');return}}
      if(D&&type==='tolov'){const u=$('eUpto').value||per.nat;if(u<per.start||u>per.nat){toast('Sana davr ichida bo\'lsin: '+fmtDate(per.start)+' – '+fmtDate(per.nat));return}
        d.upto=u;d.close=u<per.nat}
      if(!D&&d.month!==xMonth)xMonth=d.month;
      if(isNew){d.created=Date.now();save(store.add('oy',d),d.close?'Berildi. Yangi davr '+fmtDate(addDays(d.upto,1))+' dan':'Yozildi')}else save(store.update('oy',e.id,d),'Saqlandi');
      if(D&&d.close)delete selP[x.id];
      xodimSheet(x.id)};
    if($('eBack'))$('eBack').onclick=()=>xodimSheet(x.id);
    if($('eDel'))$('eDel').onclick=()=>{if(confirm('O\'chirilsinmi?')){save(store.del('oy',e.id),'O\'chirildi');xodimSheet(x.id)}}});
}
const selP={}; // xodim → tanlangan davr raqami
function xodimSheet(id){
  const draw=()=>{
    const x=S.xod.find(z=>z.id===id);if(!x){closeSheet();return}
    const D=davriy(x);
    let ps=null,pi=0,per=null,p;
    if(D){ps=periodsOf(x);pi=selP[id]!=null&&selP[id]<ps.length?selP[id]:ps.length-1;per=ps[pi];p=payrollP(x,per)}
    else p=payroll(x,xMonth);
    let h='<div class="grab"></div><div class="row"><h3>'+esc(x.name)+'</h3><button class="btn sm ghost" data-close>Yopish</button></div>';
    h+=D?'<div class="month"><button class="icon-btn" id="smPrev"'+(pi<=0?' disabled style="opacity:.3"':'')+'>‹</button><b style="text-align:center">'+fmtDate(per.start)+' – '+fmtDate(per.end)+(per.closed?'':'')+'</b><button class="icon-btn" id="smNext"'+(pi>=ps.length-1?' disabled style="opacity:.3"':'')+'>›</button></div>'
      :'<div class="month"><button class="icon-btn" id="smPrev">‹</button><b>'+monthName(xMonth)+'</b><button class="icon-btn" id="smNext">›</button></div>';
    const neg=o=>CUR.filter(c=>o[c]).map(c=>'−'+money(o[c],c)).join(' · ');
    const pos=o=>CUR.filter(c=>o[c]).map(c=>'+'+money(o[c],c)).join(' · ');
    const totCur=CUR.filter(c=>p.sal[c]||p.left[c]||c==='UZS'&&!p.sal.USD&&!p.left.USD);
    h+='<section class="card calc">'
      +'<div class="row"><span>Oylik'+(D?' <span class="muted">(1 oy)</span>':'')+'</span><button class="btn sm ghost num" id="salEdit">'+salText(p.sal)+' ✎</button></div>'
      +(D?'<div class="row"><span>Ishlagan: '+p.worked+' / '+per.L+' kun <span class="muted">('+(per.closed?'davr yopilgan':p.upto<per.nat?'bugungacha':'to\'liq')+')</span></span><span class="num">'+salText(p.base)+'</span></div>':'')
      +(p.absent?'<div class="row"><span>Kelmadi: '+daysText(p.absent)+' <span class="muted">(kuniga '+money(p.rate.daily,p.rate.cur)+')</span></span><span class="num minus">'+neg(p.cut)+'</span></div>':'')
      +(any(p.bonus)?'<div class="row"><span>Bonus</span><span class="num plus">'+pos(p.bonus)+'</span></div>':'')
      +(any(p.fine)?'<div class="row"><span>Jarima</span><span class="num minus">'+neg(p.fine)+'</span></div>':'')
      +'<div class="row"><span>Ishlab topgani</span><span class="num">'+salText(p.earned)+'</span></div>'
      +(any(p.adv)?'<div class="row"><span>Avans olgan</span><span class="num minus">'+neg(p.adv)+'</span></div>':'')
      +(any(p.paid)?'<div class="row"><span>Oylik berildi</span><span class="num minus">'+neg(p.paid)+'</span></div>':'')
      +totCur.map((c,ix)=>'<div class="row'+(ix===0?' tot':'')+'" style="font-weight:700;font-size:16px"><span>'+(p.left[c]<0?'Ortiqcha berilgan':(D&&!per.closed&&p.upto<per.nat?'Hozir berilsa':'Berilishi kerak'))+(totCur.length>1?(c==='USD'?' ($)':' (so\'m)'):'')+'</span><span class="num '+(p.left[c]<0?'minus':'')+'">'+money(Math.abs(p.left[c]),c)+'</span></div>').join('')
      +'</section>';
    if(D&&!per.closed)h+='<p class="muted" style="margin:0;line-height:1.45">Oylik kuni: <b>'+fmtDate(addDays(per.nat,1))+'</b>. Muddatidan oldin bersangiz — ishlagan kunlari uchun, ertasidan yangi davr boshlanadi.</p>';
    h+='<div class="grid2"><button class="btn ghost" data-t="avans">💵 Avans berdim</button><button class="btn ghost" data-t="kelmadi">✕ Kelmadi</button><button class="btn ghost" data-t="bonus">+ Bonus</button><button class="btn ghost" data-t="jarima">− Jarima</button></div>';
    h+='<button class="btn" data-t="tolov">✓ Oylikni berdim'+(D&&!per.closed&&p.upto<per.nat?' ('+p.worked+' kunlik)':'')+'</button>';
    const title=D?'Davr yozuvlari':monthName(xMonth)+' yozuvlari';
    h+='<section class="card"><h2>'+title+'</h2><div class="list">'+(p.rows.length?p.rows.map(r=>{
        const sign=r.type==='bonus'?'plus':r.type==='kelmadi'?'warn':'minus';
        const val=r.type==='kelmadi'?daysText(Number(r.days)||1):(r.type==='bonus'?'+':'−')+money(r.amount,r.cur==='USD'?'USD':'UZS');
        const extra=r.type==='tolov'&&r.upto?' · <span class="muted">'+fmtDate(r.upto)+' gacha</span>':'';
        return '<button class="item" data-r="'+r.id+'"><div style="min-width:0"><div class="t">'+OT[r.type]+extra+(r.note?' · <span class="muted">'+esc(r.note)+'</span>':'')+'</div><div class="s">'+fmtDate(r.date)+'</div></div><span class="num '+sign+'">'+val+'</span></button>'}).join(''):'<div class="empty">Yozuv yo\'q</div>')+'</div></section>';
    h+='<p class="muted" style="margin:0">'+(p.rate.fixed?'Kelmagan har bir kun uchun '+money(p.rate.daily,p.rate.cur)+' ayriladi, yarim kunga — '+money(p.rate.daily/2,p.rate.cur)+'.':'Kelmagan kun: oylik ÷ '+p.rate.div+' kun = '+money(p.rate.daily,p.rate.cur)+'.')+' O\'zgartirish uchun oylik summasini bosing.</p>';
    if(!x.arch)h+='<button class="btn ghost" id="xLink">📱 '+(x.viewKey?'Xodim ilovasi havolasi':'Xodimga ilova berish')+'</button>';
    h+='<div class="grid2"><button class="btn ghost" id="xEdit">Ma\'lumotlar</button>'+(x.arch?'<button class="btn" id="xRestore">Qaytarish</button>':'<button class="btn danger" id="xArch">Olib tashlash</button>')+'</div>';
    if(x.arch)h+='<button class="btn danger" id="xDelete">Butunlay o\'chirish</button>';
    const r=$('sheet');r.innerHTML=h;
    r.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeSheet);
    if(D){$('smPrev').onclick=()=>{if(pi>0){selP[id]=pi-1;draw()}};$('smNext').onclick=()=>{if(pi<ps.length-1){selP[id]=pi+1;draw()}}}
    else{$('smPrev').onclick=()=>{xMonth=shiftMonth(xMonth,-1);render()};$('smNext').onclick=()=>{xMonth=shiftMonth(xMonth,1);render()}}
    $('salEdit').onclick=()=>salaryForm(x);
    r.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>entryForm(x,b.dataset.t,null,per));
    r.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>entryForm(x,null,p.rows.find(z=>z.id===b.dataset.r),per));
    $('xEdit').onclick=()=>xodimForm(x);
    if($('xLink'))$('xLink').onclick=()=>linkSheet(x.id);
    if($('xArch'))$('xArch').onclick=()=>{if(confirm(x.name+' ro\'yxatdan olib tashlansinmi? Hisob-kitoblari saqlanib qoladi.')){dropView(x);save(store.update('xod',x.id,{arch:true,viewKey:''}),'Olib tashlandi');closeSheet()}};
    if($('xRestore'))$('xRestore').onclick=()=>{save(store.update('xod',x.id,{arch:false}),'Qaytarildi');closeSheet()};
    if($('xDelete'))$('xDelete').onclick=()=>{if(confirm(x.name+' va uning barcha yozuvlari butunlay o\'chirilsinmi? Buni qaytarib bo\'lmaydi.')){
      dropView(x);S.oy.filter(z=>z.xid===x.id).forEach(z=>store.del('oy',z.id));save(store.del('xod',x.id),'O\'chirildi');closeSheet()}};
  };
  $('sheet').hidden=false;$('sheetBg').hidden=false;$('sheet').scrollTop=0;
  draw();sheetRefresh=draw;
}
function importOld(){
  const seed=[['Iqbolmirzo'],['Shoxjaxon'],['Hayrullo']];
  seed.forEach(s=>store.add('xod',{name:s[0],tel:'',sal:{},arch:false,created:Date.now()}));
  toast('Qo\'shildi. Endi har biriga oylik belgilang.');
}

/* ---------- Xodim ilovasi (faqat ko'rish) ---------- */
// Har bir xodimga tasodifiy kalit beriladi. Daftarcha uning oxirgi 3 oylik hisobini d_view/{kalit} ga yozadi.
// Xodim sahifasi (../maosh/#kalit) faqat shu bitta hujjatni o'qiy oladi — boshqa hech narsani emas.
const VIEW='d_view';
const newKey=()=>{const a=new Uint8Array(18);crypto.getRandomValues(a);return Array.from(a,b=>'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b%56]).join('')};
const viewUrl=k=>new URL('../maosh/#'+k,location.href).href;
function viewData(x){
  const months={};
  if(davriy(x)){
    periodsOf(x).slice(-3).forEach(per=>{const p=payrollP(x,per);
      months[per.start]={label:fmtDate(per.start)+' – '+fmtDate(per.end),worked:p.worked,L:per.L,closed:per.closed,payday:addDays(per.nat,1),
        sal:p.sal,base:p.base,rate:{cur:p.rate.cur,daily:p.rate.cur==='USD'?Math.round(p.rate.daily*100)/100:Math.round(p.rate.daily)},absent:p.absent,cut:p.cut,adv:p.adv,bonus:p.bonus,fine:p.fine,paid:p.paid,earned:p.earned,left:p.left,
        rows:p.rows.map(r=>{const o={type:r.type,date:r.date||''};if(r.type==='kelmadi')o.days=Number(r.days)||1;else{o.amount=r.amount||0;o.cur=r.cur==='USD'?'USD':'UZS'}return o})}});
    return {name:x.name,months};
  }
  [0,-1,-2].forEach(n=>{const k=shiftMonth(ym(),n),p=payroll(x,k);if(!any(p.sal)&&!p.rows.length)return;
    months[k]={sal:p.sal,rate:{cur:p.rate.cur,daily:p.rate.cur==='USD'?Math.round(p.rate.daily*100)/100:Math.round(p.rate.daily)},absent:p.absent,cut:p.cut,adv:p.adv,bonus:p.bonus,fine:p.fine,paid:p.paid,earned:p.earned,left:p.left,
      rows:p.rows.map(r=>{const o={type:r.type,date:r.date||''};if(r.type==='kelmadi')o.days=Number(r.days)||1;else{o.amount=r.amount||0;o.cur=r.cur==='USD'?'USD':'UZS'}return o})}});
  return {name:x.name,months};
}
const lastView={};
function syncViews(){
  if(DEMO||!db||!S.ready.xod||!S.ready.oy||!S.setReady)return;
  S.xod.forEach(x=>{if(!x.viewKey||x.arch)return;
    const d=viewData(x),j=JSON.stringify(d);if(lastView[x.viewKey]===j)return;lastView[x.viewKey]=j;
    db.collection(VIEW).doc(x.viewKey).set(Object.assign(d,{updated:Date.now()})).catch(e=>{console.error(e);delete lastView[x.viewKey]})});
}
function dropView(x){if(x.viewKey&&!DEMO&&db)db.collection(VIEW).doc(x.viewKey).delete().catch(()=>{})}
function linkSheet(id){
  const x=S.xod.find(z=>z.id===id);if(!x)return;
  if(!x.viewKey){const k=newKey();x.viewKey=k;save(store.update('xod',x.id,{viewKey:k}));if(!DEMO)syncViews()}
  const url=viewUrl(x.viewKey);
  const msg=x.name+', bu sizning maosh ilovangiz. Oyligingiz, avanslar va kelmagan kunlarni shu yerda ko\'rib borasiz:\n'+url;
  sheet('<h3>'+esc(x.name)+' uchun ilova</h3>'
    +'<p class="muted" style="margin:0;line-height:1.5">Xodim bu havola orqali faqat <b>o\'z</b> oyligini ko\'radi: oylik, avanslar, kelmagan kunlar va qancha qolgani. Hech narsani o\'zgartira olmaydi.</p>'
    +'<div class="card" style="word-break:break-all;font-family:var(--mono);font-size:13px">'+esc(url)+'</div>'
    +'<a class="btn" style="text-decoration:none" target="_blank" rel="noopener" href="https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(x.name+', bu sizning maosh ilovangiz. Oyligingizni shu yerda ko\'rib borasiz.')+'">Telegram orqali yuborish</a>'
    +'<div class="grid2"><button class="btn ghost" id="lCopy">Nusxalash</button><a class="btn ghost" style="text-decoration:none" target="_blank" rel="noopener" href="'+esc(url)+'">Ochib ko\'rish</a></div>'
    +'<p class="muted" style="margin:0;line-height:1.5">Telefonda ochgach, brauzer menyusidan «Bosh ekranga qo\'shish» ni bossa, ilova bo\'lib turadi.</p>'
    +'<button class="btn danger" id="lRevoke">Havolani bekor qilish</button>'
    +'<button class="btn ghost" id="lBack">‹ Orqaga</button>',
  ()=>{$('lBack').onclick=()=>xodimSheet(x.id);
    $('lCopy').onclick=()=>{(navigator.clipboard?navigator.clipboard.writeText(msg):Promise.reject()).then(()=>toast('Nusxalandi')).catch(()=>{prompt('Nusxalab oling:',url)})};
    $('lRevoke').onclick=()=>{if(!confirm('Eski havola ishlamay qoladi. Davom etilsinmi?'))return;dropView(x);delete lastView[x.viewKey];save(store.update('xod',x.id,{viewKey:''}),'Havola bekor qilindi');xodimSheet(x.id)}});
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
    +'<button class="btn ghost" id="sSec">🔒 Kod va barmoq izi'+(hasPin()?' ✓':'')+'</button>'
    +'<a class="btn ghost" style="text-decoration:none" href="../rahbar/">Eski rahbar paneli (xodimlar arxivi)</a>'
    +'<div class="muted">Kirgan: '+esc(userEmail)+'</div>'
    +'<div class="actions"><button class="btn danger" id="sOut">Chiqish</button><button class="btn" id="sSave">Saqlash</button></div>',
  ()=>{$('sDiv').value=S.set.div||'days';
    $('sSec').onclick=securitySheet;
    $('sSave').onclick=()=>{save(store.saveSet({div:$('sDiv').value}),'Saqlandi');closeSheet()};
    $('sOut').onclick=()=>{closeSheet();if(DEMO)return;unsubs.forEach(u=>u());unsubs=[];auth.signOut()}});
}

/* ---------- Kod va barmoq izi bilan qulflash ----------
   Kod shu telefonda saqlanadi (faqat xeshi). Barmoq izi — telefonning o'z qulfi (WebAuthn).
   Kodni unutsangiz: "Kodni unutdim" → Google bilan qayta kirasiz, kod o'chadi. */
const LK={pin:'d_pin',salt:'d_pin_salt',bio:'d_bio',at:'d_lock_at'};
const lsG=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const lsS=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
const lsD=k=>{try{localStorage.removeItem(k)}catch(e){}};
const LOCK_AFTER=60e3; // ilova 1 daqiqadan ko'p yopiq tursa, qayta kod so'raydi
const hasPin=()=>!!lsG(LK.pin);
let locked=hasPin(),pinBuf='',pinTries=0;
async function hashPin(pin,salt){const d=new TextEncoder().encode(salt+':'+pin);const h=await crypto.subtle.digest('SHA-256',d);return Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,'0')).join('')}
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const rnd=n=>crypto.getRandomValues(new Uint8Array(n));
async function bioAvailable(){try{return !!(window.PublicKeyCredential&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())}catch(e){return false}}
async function bioRegister(){
  const c=await navigator.credentials.create({publicKey:{challenge:rnd(32),rp:{name:'Daftarcha',id:location.hostname},
    user:{id:rnd(16),name:userEmail||'egasi',displayName:'Daftarcha'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
    authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'discouraged'},timeout:60000,attestation:'none'}});
  lsS(LK.bio,b64(c.rawId));
}
async function bioUnlock(){
  const id=lsG(LK.bio);if(!id)return false;
  try{await navigator.credentials.get({publicKey:{challenge:rnd(32),rpId:location.hostname,allowCredentials:[{type:'public-key',id:unb64(id)}],userVerification:'required',timeout:60000}});return true}
  catch(e){console.warn(e);return false}
}
function unlock(){locked=false;pinBuf='';pinTries=0;$('tabs').hidden=false;render()}
function lockNow(){if(!hasPin())return;locked=true;pinBuf='';closeSheet();render()}
function lockView(){
  $('tabs').hidden=true;
  const dots=[0,1,2,3].map(i=>'<span class="pdot'+(i<pinBuf.length?' on':'')+'"></span>').join('');
  const keys=['1','2','3','4','5','6','7','8','9',lsG(LK.bio)?'bio':'','0','del'];
  app.innerHTML='<div class="wrap lock"><div class="lock-top"><span class="kicker">Daftarcha</span><h1>Kodni kiriting</h1><div class="pdots" id="pdots">'+dots+'</div><p class="minus" id="pMsg" style="margin:0;min-height:20px"></p></div>'
    +'<div class="pad">'+keys.map(k=>k===''?'<span></span>':'<button class="pkey'+(k==='bio'||k==='del'?' fn':'')+'" data-k="'+k+'" aria-label="'+(k==='bio'?'Barmoq izi':k==='del'?'O\'chirish':k)+'">'+(k==='bio'?'☝︎':k==='del'?'⌫':k)+'</button>').join('')+'</div>'
    +'<button class="btn ghost sm" id="pForgot" style="align-self:center">Kodni unutdim</button></div>';
  app.querySelectorAll('.pkey').forEach(b=>b.onclick=()=>pinKey(b.dataset.k));
  $('pForgot').onclick=()=>{if(!confirm('Kod o\'chiriladi va Google akkauntingiz bilan qayta kirasiz. Davom etilsinmi?'))return;
    [LK.pin,LK.salt,LK.bio].forEach(lsD);locked=false;unsubs.forEach(u=>u());unsubs=[];auth.signOut()};
}
async function pinKey(k){
  if(k==='bio'){if(await bioUnlock())unlock();else $('pMsg').textContent='Barmoq izi tanilmadi, kodni kiriting';return}
  if(k==='del')pinBuf=pinBuf.slice(0,-1);else if(pinBuf.length<4)pinBuf+=k;
  lockView();
  if(pinBuf.length===4){
    const ok=(await hashPin(pinBuf,lsG(LK.salt)||''))===lsG(LK.pin);
    if(ok){unlock();return}
    pinTries++;pinBuf='';lockView();$('pMsg').textContent='Kod noto\'g\'ri'+(pinTries>=3?' — '+pinTries+'-urinish':'');
    const d=$('pdots');if(d){d.classList.add('shake');setTimeout(()=>d.classList.remove('shake'),400)}
  }
}
document.addEventListener('visibilitychange',()=>{
  if(!signedIn||!hasPin())return;
  if(document.hidden)lsS(LK.at,String(Date.now()));
  else{const t=Number(lsG(LK.at)||0);if(!locked&&t&&Date.now()-t>LOCK_AFTER)lockNow()}
});
function pinSetSheet(step,first){
  // step 1: yangi kod, step 2: takrorlash
  let buf='';
  const draw=msg=>{
    $('sheet').innerHTML='<div class="grab"></div><div class="row"><h3>'+(step===1?'Yangi 4 xonali kod':'Kodni qayta kiriting')+'</h3><button class="btn sm ghost" id="psBack">Bekor</button></div>'
      +'<div class="pdots" style="justify-content:center">'+[0,1,2,3].map(i=>'<span class="pdot'+(i<buf.length?' on':'')+'"></span>').join('')+'</div>'
      +'<p class="minus" style="margin:0;text-align:center;min-height:20px">'+esc(msg||'')+'</p>'
      +'<div class="pad">'+['1','2','3','4','5','6','7','8','9','','0','del'].map(k=>k===''?'<span></span>':'<button class="pkey'+(k==='del'?' fn':'')+'" data-k="'+k+'">'+(k==='del'?'⌫':k)+'</button>').join('')+'</div>';
    $('psBack').onclick=securitySheet;
    $('sheet').querySelectorAll('.pkey').forEach(b=>b.onclick=async()=>{const k=b.dataset.k;
      if(k==='del')buf=buf.slice(0,-1);else if(buf.length<4)buf+=k;
      if(buf.length<4){draw();return}
      if(step===1){pinSetSheet(2,buf);return}
      if(buf!==first){buf='';draw('Kodlar mos kelmadi, qaytadan');return}
      const salt=b64(rnd(12));lsS(LK.salt,salt);lsS(LK.pin,await hashPin(buf,salt));lsD(LK.at);
      toast('Kod qo\'yildi');securitySheet();
    })};
  $('sheet').hidden=false;$('sheetBg').hidden=false;sheetRefresh=null;draw();
}
async function securitySheet(){
  const bioOk=await bioAvailable(),pin=hasPin(),bio=!!lsG(LK.bio);
  sheet('<h3>Kod va barmoq izi</h3>'
    +'<p class="muted" style="margin:0;line-height:1.5">Daftarcha ochilganda va 1 daqiqadan ko\'p yopiq turgandan keyin kod so\'raladi. Kod faqat shu telefonda saqlanadi.</p>'
    +(pin?'<div class="card row" style="flex-direction:row"><span>Kod qo\'yilgan ✓</span><button class="btn sm ghost" id="scChange">O\'zgartirish</button></div>':'<button class="btn" id="scSet">🔒 Kod qo\'yish</button>')
    +(pin?(bioOk?(bio?'<div class="card row" style="flex-direction:row"><span>Barmoq izi yoqilgan ✓</span><button class="btn sm ghost" id="scBioOff">O\'chirish</button></div>':'<button class="btn ghost" id="scBio">☝︎ Barmoq izi bilan ochishni yoqish</button>'):'<p class="muted" style="margin:0">Bu telefonda yoki brauzerda barmoq izi bilan ochish ishlamaydi. Kod bilan ochiladi.</p>'):'')
    +(pin?'<button class="btn ghost" id="scLock">Hozir qulflash</button><button class="btn danger" id="scOff">Kodni olib tashlash</button>':'')
    +'<button class="btn ghost" id="scBack">‹ Sozlamalar</button>',
  ()=>{
    if($('scSet'))$('scSet').onclick=()=>pinSetSheet(1);
    if($('scChange'))$('scChange').onclick=()=>pinSetSheet(1);
    if($('scBio'))$('scBio').onclick=async()=>{try{await bioRegister();toast('Barmoq izi yoqildi');securitySheet()}catch(e){console.warn(e);toast('Yoqib bo\'lmadi: barmoq izini tasdiqlang')}};
    if($('scBioOff'))$('scBioOff').onclick=()=>{lsD(LK.bio);toast('Barmoq izi o\'chirildi');securitySheet()};
    if($('scLock'))$('scLock').onclick=()=>{closeSheet();lockNow()};
    if($('scOff'))$('scOff').onclick=()=>{if(!confirm('Kod olib tashlansinmi? Daftarcha kodsiz ochiladi.'))return;[LK.pin,LK.salt,LK.bio,LK.at].forEach(lsD);toast('Kod olib tashlandi');securitySheet()};
    $('scBack').onclick=settingsSheet;
  });
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
  if(DEMO){signedIn=true;userEmail='demo';locked=hasPin();seedDemo();Object.keys(demo).forEach(demoEmit);return}
  try{firebase.initializeApp(CFG.firebase);db=firebase.firestore();auth=firebase.auth();
    try{db.enablePersistence({synchronizeTabs:true}).catch(()=>{})}catch(e){}}
  catch(e){app.innerHTML='<div class="wrap"><section class="card"><p>Ilovani ochib bo\'lmadi. Internetni tekshirib, qayta oching.</p></section></div>';return}
  auth.onAuthStateChanged(u=>{
    if(!u){loginView();return}
    if(CFG.ownerEmail&&String(u.email||'').toLowerCase()!==String(CFG.ownerEmail).toLowerCase()){auth.signOut();loginView('Bu daftar sizga tegishli emas: '+(u.email||''));return}
    signedIn=true;userEmail=u.email||'';locked=hasPin();
    if(locked){render()}else{app.innerHTML='<div class="wrap">'+header('Yuklanmoqda…')+'</div>';$('tabs').hidden=false}
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
window.__daftar={S,payroll,payrollP,periodsOf,people,salaryFor,dayRate};
start();
})();
