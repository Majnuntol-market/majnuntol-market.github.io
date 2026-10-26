/* Maoshim — xodim o'z oyligini ko'radigan sahifa (faqat o'qish).
   Havola: /maosh/#<kalit>. Sahifa faqat d_view/<kalit> hujjatini o'qiydi, uni rahbarning daftarchasi yozadi. */
(function(){
'use strict';
const CFG=window.MJ_CONFIG||{};
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MONTHS=['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
const group=n=>String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
const usd=n=>{const v=Math.round(Math.abs(n)*100)/100,i=Math.floor(v),c=Math.round((v-i)*100);return group(i)+(c?','+pad(c):'')};
const money=(n,cur)=>(n<0?'−':'')+(cur==='USD'?usd(n)+' $':group(n)+" so'm");
const CUR=['UZS','USD'];
const any=o=>!!(o&&(o.UZS||o.USD));
const both=(o,sep)=>{const p=CUR.filter(c=>o&&o[c]).map(c=>money(o[c],c));return p.length?p.join(sep||' + '):"0 so'm"};
const neg=o=>CUR.filter(c=>o[c]).map(c=>'−'+money(o[c],c)).join(' · ');
const pos=o=>CUR.filter(c=>o[c]).map(c=>'+'+money(o[c],c)).join(' · ');
const fmtDate=s=>{if(!s)return'';const [y,m,d]=s.split('-');return d+'.'+m+'.'+y};
const monthName=k=>{const [y,m]=k.split('-');return MONTHS[+m-1]+' '+y};
const daysText=d=>d===0.5?'yarim kun':(d%1?String(d).replace('.',','):d)+' kun';
const TYPES={avans:'Avans (pul oldingiz)',kelmadi:'Kelmadingiz',bonus:'Bonus',jarima:'Jarima',tolov:'Oylik berildi'};
const app=$('app');

const key=(location.hash||'').replace(/^#/,'').trim();
let doc=null,month=null;

function msg(title,text){app.innerHTML='<div class="wrap"><header class="hd"><div><span class="kicker">Majnuntol</span><h1>'+esc(title)+'</h1></div></header><section class="card"><p class="muted" style="margin:0;line-height:1.5;color:var(--fg)">'+text+'</p></section></div>'}

function render(){
  const ks=Object.keys(doc.months||{}).sort().reverse();
  if(!ks.length){msg(doc.name||'Maoshim','Hozircha bu oy uchun ma\'lumot kiritilmagan.');return}
  if(!month||!ks.includes(month))month=ks[0];
  const m=doc.months[month],i=ks.indexOf(month);
  const totCur=CUR.filter(c=>m.sal[c]||m.left[c]||(c==='UZS'&&!m.sal.USD&&!m.left.USD));
  const done=!any(m.left)&&any(m.paid);
  let h='<header class="hd"><div><span class="kicker">Maoshim</span><h1>'+esc(doc.name)+'</h1></div></header>';
  h+='<div class="card month" style="flex-direction:row;padding:8px"><button class="icon-btn" id="prev"'+(i>=ks.length-1?' disabled style="opacity:.3"':'')+' aria-label="Oldingi oy">‹</button><b>'+monthName(month)+'</b><button class="icon-btn" id="next"'+(i<=0?' disabled style="opacity:.3"':'')+' aria-label="Keyingi oy">›</button></div>';
  h+='<section class="card"><span class="muted">'+(done?'Oylik to\'liq berildi':'Qolgan oyligingiz')+'</span>'
    +(done?'<div class="ok big">✓ To\'landi</div>':totCur.map(c=>'<div class="num left '+(m.left[c]<0?'minus':'')+'">'+money(m.left[c],c)+'</div>').join(''))+'</section>';
  h+='<section class="card calc">'
    +'<div class="row"><span>Oylik</span><span class="num">'+both(m.sal)+'</span></div>'
    +(m.start&&m.pre&&any(m.pre)?'<div class="row"><span>Ishga kelgan: '+fmtDate(m.start.date)+' <span class="muted">('+m.start.worked+' / '+m.start.dim+' kun)</span></span><span class="num minus">'+neg(m.pre)+'</span></div>':'')
    +(m.absent?'<div class="row"><span>Kelmagan: '+daysText(m.absent)+' <span class="muted">(kuniga '+money(m.rate.daily,m.rate.cur)+')</span></span><span class="num minus">'+neg(m.cut)+'</span></div>':'')
    +(any(m.bonus)?'<div class="row"><span>Bonus</span><span class="num plus">'+pos(m.bonus)+'</span></div>':'')
    +(any(m.fine)?'<div class="row"><span>Jarima</span><span class="num minus">'+neg(m.fine)+'</span></div>':'')
    +'<div class="row"><span>Ishlab topganingiz</span><span class="num">'+both(m.earned)+'</span></div>'
    +(any(m.adv)?'<div class="row"><span>Avans olgansiz</span><span class="num minus">'+neg(m.adv)+'</span></div>':'')
    +(any(m.paid)?'<div class="row"><span>Oylik berildi</span><span class="num minus">'+neg(m.paid)+'</span></div>':'')
    +totCur.map((c,ix)=>'<div class="row'+(ix===0?' tot':'')+'" style="font-weight:700;font-size:16px"><span>'+(m.left[c]<0?'Ortiqcha olingan':'Qoldi')+(totCur.length>1?(c==='USD'?' ($)':' (so\'m)'):'')+'</span><span class="num">'+money(Math.abs(m.left[c]),c)+'</span></div>').join('')
    +'</section>';
  h+='<section class="card"><h2>'+monthName(month)+' yozuvlari</h2><div class="list">'+(m.rows.length?m.rows.map(r=>{
      const cls=r.type==='bonus'?'plus':r.type==='kelmadi'?'warn':'minus';
      const val=r.type==='kelmadi'?daysText(r.days):(r.type==='bonus'?'+':'−')+money(r.amount,r.cur);
      return '<div class="item static"><div><div class="t">'+(TYPES[r.type]||r.type)+'</div><div class="s">'+fmtDate(r.date)+'</div></div><span class="num '+cls+'">'+val+'</span></div>'}).join(''):'<div class="empty">Bu oyda yozuv yo\'q</div>')+'</div></section>';
  h+='<p class="muted" style="margin:0;text-align:center">Savol bo\'lsa, rahbaringizga murojaat qiling.'+(doc.updated?'<br>Yangilangan: '+(d=>pad(d.getUTCDate())+'.'+pad(d.getUTCMonth()+1)+' '+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes()))(new Date(doc.updated+5*3600e3)):'')+'</p>';
  app.innerHTML='<div class="wrap">'+h+'</div>';
  $('prev').onclick=()=>{if(i<ks.length-1){month=ks[i+1];render()}};
  $('next').onclick=()=>{if(i>0){month=ks[i-1];render()}};
}

function start(){
  if(!/^[A-Za-z0-9]{12,64}$/.test(key)){msg('Havola noto\'g\'ri','Rahbaringiz Telegram orqali yuborgan havolani to\'liq oching.');return}
  // Bosh ekranga qo'shilganda ham kalit saqlanib qolishi uchun manifest shu kalit bilan yaratiladi
  try{const mf={name:'Maoshim',short_name:'Maoshim',start_url:location.href,scope:new URL('./',location.href).href,display:'standalone',background_color:'#f3f5ef',theme_color:'#1f7a4d',
      icons:[{src:new URL('../icon-192.png',location.href).href,sizes:'192x192',type:'image/png'},{src:new URL('../icon-512.png',location.href).href,sizes:'512x512',type:'image/png'}]};
    const l=document.createElement('link');l.rel='manifest';l.href='data:application/manifest+json,'+encodeURIComponent(JSON.stringify(mf));document.head.appendChild(l)}catch(e){}
  if('serviceWorker' in navigator)navigator.serviceWorker.register('../sw.js').catch(()=>{});
  let db;
  try{firebase.initializeApp(CFG.firebase);db=firebase.firestore();try{db.enablePersistence().catch(()=>{})}catch(e){}}
  catch(e){msg('Ochilmadi','Internetni tekshirib, qayta oching.');return}
  db.collection('d_view').doc(key).onSnapshot(d=>{
    if(!d.exists){msg('Havola ishlamaydi','Bu havola bekor qilingan yoki hali tayyor emas. Rahbaringizdan yangisini so\'rang.');return}
    doc=d.data();render();
  },e=>{console.error(e);msg('Havola ishlamaydi','Bu havola bekor qilingan yoki hali tayyor emas. Rahbaringizdan yangisini so\'rang.')});
}
start();
})();
