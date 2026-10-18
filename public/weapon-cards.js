export function weaponFacts(w){return {damage:w.pellets>1?`${w.damage} × ${w.pellets} pellets`:`${w.damage} per hit`,magazine:`${w.mag} rounds`,reload:`${w.reload} seconds`,role:w.mode==='PUMP'?'Pump shotgun':w.model==='shotgun'?'Automatic shotgun':w.id==='pistol'?'Sidearm':w.id==='dmr'?'Marksman':w.model==='lmg'||w.id==='lmg'?'Support gun':w.id==='smg'?'Submachine gun':'Carbine'};}
export function weaponThumbnail(w){
 const family=w.model||w.id,pistol=family==='pistol',shotgun=family==='shotgun',support=family==='lmg',smg=family==='smg',dmr=family==='dmr';
 const color=/^#[0-9a-f]{6}$/i.test(w.color||'')?w.color:'#31f5db';
 const length=pistol?105:smg?180:support?250:dmr?255:shotgun?235:215,x=190-length/2;
 const drum=w.id==='breacher'||w.id==='support100';
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 160"><rect width="380" height="160" rx="12" fill="#0b1b24"/><path d="M20 125H360M40 35V135M340 35V135" stroke="#24414a" stroke-width="1"/><g transform="translate(${x} 54)"><path d="M0 10H${length*.62}V40H65L56 70H40L43 40H0Z" fill="#52636c" stroke="#9baeb2" stroke-width="2"/><path d="M10 6H${length*.59}V12H10" stroke="${color}" stroke-width="5"/><rect x="${length*.6}" y="20" width="${length*.4}" height="10" rx="3" fill="#74878b"/>${pistol?'':`<path d="M0 12L-25 3H-40V42H0" fill="#344952" stroke="#809397"/>`}${drum?'<circle cx="90" cy="52" r="24" fill="#3a5059" stroke="#9baeb2" stroke-width="3"/>':`<path d="M80 40H104L${support?123:98} 77H75Z" fill="#344952" stroke="#809397"/>`}${dmr?'<rect x="60" y="-12" width="65" height="18" rx="7" fill="#627980"/>':''}${shotgun?'<path d="M145 35H210" stroke="#314a54" stroke-width="13"/>':''}</g><circle cx="350" cy="20" r="4" fill="${color}"/></svg>`;
 return 'data:image/svg+xml,'+encodeURIComponent(svg);
}
// Comparison bars use real config values; ratio is relative to the best gun in the list.
export function weaponStats(w,weapons){
 const dps=x=>x.damage*(x.pellets||1)/x.cooldown,deg=x=>x.spread*180/Math.PI;
 const best=(f,low)=>weapons.reduce((m,x)=>low?Math.min(m,f(x)):Math.max(m,f(x)),low?Infinity:0);
 return [
  {label:'Damage',text:`${Math.round(dps(w))}/s`,ratio:dps(w)/best(dps)},
  // Spread spans ~25×, so a square-root scale keeps every bar readable while preserving order.
  {label:'Accuracy',text:`${deg(w).toFixed(1)}°`,detail:`${deg(w).toFixed(1)} degree spread`,ratio:Math.sqrt(best(deg,true)/deg(w))},
  {label:'Magazine',text:`${w.mag}`,ratio:w.mag/best(x=>x.mag)},
  {label:'Reload',text:`${w.reload}s`,ratio:best(x=>x.reload,true)/w.reload}
 ];
}
function statRows(w,weapons){
 const list=document.createElement('dl');list.className='weapon-stats';
 for(const stat of weaponStats(w,weapons)){
  const row=document.createElement('div'),label=document.createElement('dt'),value=document.createElement('dd'),bar=document.createElement('span');
  label.textContent=stat.label;value.textContent=stat.text;if(stat.detail){value.title=stat.detail;value.setAttribute('aria-label',stat.detail);}bar.className='weapon-stat-bar';bar.style.setProperty('--fill',`${Math.round(Math.max(.08,Math.min(1,stat.ratio))*100)}%`);bar.setAttribute('aria-hidden','true');
  row.append(label,value,bar);list.append(row);
 }
 return list;
}
export function renderWeaponCards(container,weapons,{state=()=>({label:'Available'}),action=()=>null,onAction=()=>{},progress=()=>null,compact=false}={}){
 if(!container)return;container.classList.add('weapon-card-grid');container.classList.toggle('weapon-card-strip',compact);container.replaceChildren();
 weapons.forEach((w,i)=>{
  const current=state(i),card=document.createElement('article');card.className='weapon-card';card.dataset.weaponIndex=String(i);card.classList.toggle('is-selected',!!current.selected);card.classList.toggle('is-locked',!!current.locked);
  const preview=document.createElement('button');preview.type='button';preview.className='weapon-picture';preview.setAttribute('aria-label',`Preview ${w.name} in 3D`);
  const image=document.createElement('img');image.src=weaponThumbnail(w);image.alt=`${w.name} schematic silhouette`;image.width=380;image.height=160;image.loading='lazy';preview.append(image);
  const title=document.createElement('h3');title.textContent=w.name;const status=document.createElement('p');status.className='weapon-state';status.textContent=current.label;
  const facts=document.createElement('p');facts.className='weapon-summary';facts.textContent=`${weaponFacts(w).role} · ${w.mag} rounds`;
  const hint=document.createElement('span');hint.className='weapon-preview-hint';hint.textContent='Inspect 3D ↗';preview.append(hint);
  const controls=document.createElement('div');controls.className='weapon-card-actions';const command=action(i);
  if(command){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=command.label;button.disabled=!!command.disabled;button.dataset.weaponAction=String(i);button.onclick=()=>onAction(i);controls.append(button);}
  const failure=document.createElement('p');failure.setAttribute('role','status');failure.className='weapon-preview-error';
  preview.onclick=async()=>{preview.disabled=true;try{const {openWeaponPreview}=await import('./weapon-preview.js');await openWeaponPreview(w,{status:current.label,action:command,returnFocus:preview,onAction:()=>onAction(i)});}catch{failure.textContent='3D preview unavailable. The weapon card and normal controls still work.';}finally{preview.disabled=false;}};
  const parts=[preview,title,status,facts];
  const unlock=progress(i);
  if(unlock){
   const meter=document.createElement('div'),bar=document.createElement('span'),text=document.createElement('p');meter.className='weapon-unlock';
   bar.className='weapon-stat-bar';bar.style.setProperty('--fill',`${Math.round(Math.max(0,Math.min(1,unlock.current/unlock.target))*100)}%`);bar.setAttribute('aria-hidden','true');
   text.textContent=unlock.text;meter.append(bar,text);parts.push(meter);
  }
  if(!compact)parts.push(statRows(w,weapons));
  card.append(...parts,controls,failure);container.append(card);
 });
}
