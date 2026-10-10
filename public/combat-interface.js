// Player-facing conventions, separate from authoritative combat simulation.
export function movementKey(code) {
  return ({ArrowUp:'KeyW',ArrowDown:'KeyS',ArrowLeft:'KeyA',ArrowRight:'KeyD'})[code] || code;
}

export function selectConnectedGamepad(pads,preferredIndex) {
  const connected=Array.from(pads).filter(p=>p&&p.connected!==false);
  const active=connected.find(p=>p.buttons.some(b=>b.pressed||b.value>.5)||p.axes.some(a=>Math.abs(a)>.2));
  return active||connected.find(p=>p.index===preferredIndex)||connected.find(p=>p.mapping==='standard')||connected[0]||null;
}

export function normalizeRoomCode(value) {
  const code=String(value).trim().toUpperCase();
  return /^[A-F0-9]{10}$/.test(code) ? code : null;
}

export function combatActionHint(player,{touch=false,controller=false}={}) {
  if(!player || player.hp<=0)return '';
  if(player.reload>0)return 'Reloading · wait for the magazine';
  if(player.ammo<=5)return controller?'Low ammo · Square to reload':touch?'Low ammo · tap Reload':'Low ammo · R to reload';
  if((player.jetFuel??100)<10)return 'Jet low · release thrust and land to recharge';
  return '';
}

// North-up arena map: green arrow is you, red dots are living opponents.
// Returns the contact count so QA can verify data-driven markers.
export function drawCombatRadar(ctx,map,player,opponents) {
  const w=ctx.canvas.width,h=ctx.canvas.height,rows=map.length,cols=map[0]?.length||0;
  if(!rows||!cols||!player)return 0;
  const pad=5,sx=(w-pad*2)/cols,sy=(h-pad*2)/rows;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#081519';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#314448';
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(map[y][x])ctx.fillRect(pad+x*sx,pad+y*sy,sx,sy);
  let contacts=0;ctx.fillStyle='#ff687c';
  for(const enemy of opponents){if(enemy.id&&enemy.id===player.id||enemy.dead||enemy.hp<=0||enemy.spawn>0)continue;contacts++;ctx.beginPath();ctx.arc(pad+enemy.x*sx,pad+enemy.y*sy,2.5,0,Math.PI*2);ctx.fill();}
  ctx.save();ctx.translate(pad+player.x*sx,pad+player.y*sy);ctx.rotate((player.dir??player.angle??0)+Math.PI/2);ctx.fillStyle='#31f5db';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(4,4);ctx.lineTo(0,2);ctx.lineTo(-4,4);ctx.closePath();ctx.fill();ctx.restore();
  return contacts;
}
