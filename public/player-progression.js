// Device-local achievement badges, not server-trusted ranking or combat power.
const key=owner=>`neon-badge:${owner}`;
const integer=(value,max=1e9)=>Math.max(0,Math.min(max,Math.floor(Number(value)||0)));
export function badgeState(xp=0){
  xp=integer(xp);const level=Math.min(50,1+Math.floor(Math.sqrt(xp/250))),floor=250*(level-1)**2,next=250*level**2;
  const title=level>=35?'Legend':level>=20?'Elite':level>=10?'Vanguard':level>=5?'Operative':level>=2?'Scout':'Recruit';
  return {xp,level,title,progress:level===50?1:(xp-floor)/(next-floor),remaining:level===50?0:next-xp};
}
export function readBadge(storage,owner){
  try{const data=JSON.parse(storage?.getItem(key(owner))||'null')||{};return {xp:integer(data.xp),bestScore:integer(data.bestScore),bestAccuracy:integer(data.bestAccuracy,100),receipts:Array.isArray(data.receipts)?data.receipts.filter(s=>typeof s==='string').slice(-256):[]};}catch{return {xp:0,bestScore:0,bestAccuracy:0,receipts:[]};}
}
export function recordBadgeRun(storage,owner,run){
  const before=readBadge(storage,owner),unchanged=reason=>({...badgeState(before.xp),gained:0,levelUp:false,saved:false,reason});
  if(!owner||typeof run.id!=='string'||!run.id||run.id.length>180||before.receipts.includes(run.id)||!Number.isFinite(run.seconds)||run.seconds<10)return unchanged(before.receipts.includes(run.id)?'duplicate':'ineligible');
  const kills=integer(run.kills,1000),score=integer(run.score,100000),shots=integer(run.shots),hits=Math.min(shots,integer(run.hits)),accuracy=shots>=10?Math.floor(hits/shots*100):0;
  if(!kills&&!run.victory)return unchanged('ineligible');
  const gained=kills*20+Math.floor(score/50)+(run.victory?150:0)+Math.floor(accuracy/2)+Math.min(150,Math.floor(Math.max(0,score-before.bestScore)/25))+Math.max(0,accuracy-before.bestAccuracy);
  const next={xp:integer(before.xp+gained),bestScore:Math.max(before.bestScore,score),bestAccuracy:Math.max(before.bestAccuracy,accuracy),receipts:[...before.receipts,run.id].slice(-256)};
  try{if(!storage)throw Error('Storage unavailable');storage.setItem(key(owner),JSON.stringify(next));return {...badgeState(next.xp),gained,levelUp:badgeState(next.xp).level>badgeState(before.xp).level,saved:true};}catch{return unchanged('storage');}
}
export function mergeBadges(storage,from,to){
  const a=readBadge(storage,from),b=readBadge(storage,to);
  // A repeated upgrade event cannot award the same guest XP twice.
  try{storage?.setItem(key(to),JSON.stringify({xp:integer(a.xp+b.xp),bestScore:Math.max(a.bestScore,b.bestScore),bestAccuracy:Math.max(a.bestAccuracy,b.bestAccuracy),receipts:[...new Set([...a.receipts,...b.receipts])].slice(-256)}));storage?.removeItem(key(from));}catch{}
}
export function renderBadge(element,storage,owner,result){
  if(!element)return;
  const badge=result||badgeState(readBadge(storage,owner).xp);
  element.replaceChildren();const title=document.createElement('b'),detail=document.createElement('span'),meter=document.createElement('progress');
  title.textContent=`◆ LV ${badge.level} · ${badge.title}${result?.levelUp?' · LEVEL UP':''}`;
  detail.textContent=result?.reason==='storage'?'Badge XP could not be saved: this browser is blocking device storage.':`${result?.gained?`+${result.gained} XP · `:''}${badge.remaining?`${badge.remaining.toLocaleString()} XP to next level`:'Maximum badge level'} · saved on this device`;
  meter.max=1;meter.value=badge.progress;meter.setAttribute('aria-label','Badge progress to next level');element.append(title,detail,meter);
}
