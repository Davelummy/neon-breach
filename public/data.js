// World data: map layout, enemy roster, weapons, missions, spawn tables.
// Pure data module — no DOM, no game-state imports. Consumed by game.js
// and by the node:test suite.

const MAP_W = 48, MAP_H = 48;
const GROUND_HEIGHT = .5;
const WALL_HEIGHTS = {1:1.35,2:2.1,3:1.62,4:1.9,5:3,6:.65,7:.22,8:.35};

export const ARENAS=[
  {id:'city-gate',name:'City Gate Approach',description:'Expanded gate district · broad driving corridors, commercial blocks and flanking lanes.',ground:0x8c8170},
  {id:'millennium-park',name:'Millennium Park',description:'Expanded park district · garden pockets, fountains and connected driving routes.',ground:0x546f45},
  {id:'jabi-lake',name:'Jabi Lake Waterfront',description:'Expanded waterfront district · lake-edge routes, boardwalks and long sightlines.',ground:0x837b66}
];
export const WORLD_COVERS=[
  ...[[10.2,8.8,0],[13.8,15.2,0],[7.8,12.7,1],[16.2,11.1,1]].map(([x,y,turn])=>({x,y,w:turn?.24:1.35,d:turn?1.35:.24,height:.48,kind:'barrier'})),
  ...[[8.8,9.15],[14.9,9.2],[8.85,14.85],[15.05,14.8],[3.2,12.5],[20.75,13.8]].map(([x,y])=>({x:x+.14,y:y+.04,w:.9,d:.7,height:.93,kind:'crate'}))
];
export const ARENA_COVERS={
  'city-gate':WORLD_COVERS,
  'millennium-park':[[9,11.4],[14.8,13],[11.3,16],[12.7,6],[3.2,12.5],[20.75,13.8]].map(([x,y])=>({x,y,w:1.25,d:.5,height:.55,kind:'planter'})),
  'jabi-lake':[[9,11],[15,13],[11,16],[13,8],[3.2,12.5],[20.75,13.8]].map(([x,y])=>({x,y,w:1.2,d:.45,height:.45,kind:'bench'}))
};
// Wide, connected transport corridors are reserved across every district.
export const DRIVE_LANES=[12,24,36];
export const DISTRICT_SPAWNS=[[28.5,12.5],[42.5,12.5],[36.5,5.5],[36.5,20.5],[28.5,36.5],[42.5,36.5],[36.5,28.5],[36.5,42.5],[5.5,36.5],[19.5,36.5],[12.5,28.5],[12.5,42.5]];
export function nearestOpenPoint(point){
  const [px,py]=point;let best=null,distance=Infinity;
  for(let y=1;y<MAP_H-1;y++)for(let x=1;x<MAP_W-1;x++){
    if(map[y][x]!==0||coverAt(x+.5,y+.5))continue;
    const d=(x+.5-px)**2+(y+.5-py)**2;if(d<distance){best=[x+.5,y+.5];distance=d;}
  }return best;
}
export function separatedSpawn(point,occupied,minDistance=3){
  for(let radius=0;radius<=8;radius++)for(let step=0;step<(radius?16:1);step++){
    const angle=step*Math.PI/8,x=point[0]+Math.cos(angle)*radius,y=point[1]+Math.sin(angle)*radius;
    if(x<1.5||y<1.5||x>MAP_W-1.5||y>MAP_H-1.5||map[Math.floor(y)][Math.floor(x)]!==0||coverAt(x,y))continue;
    if(occupied.every(e=>Math.hypot(e.x-x,e.y-y)>=minDistance))return[x,y];
  }return null;
}
export function arenaOperation(operation,arenaId){
  const regions=arenaId==='jabi-lake'?[[36,12],[12,12],[36,36],[12,36]]:arenaId==='millennium-park'?[[12,36],[12,12],[36,12],[36,36]]:[[36,12],[12,12],[12,36],[36,36]];
  const translate=(point,centre)=>nearestOpenPoint([point[0]-12+centre[0],point[1]-12+centre[1]]);
  return {...operation,stages:operation.stages.map((stage,index)=>{
    if(index===4)return {...stage,beacon:arenaId==='jabi-lake'?[43.5,36.5]:arenaId==='millennium-park'?[12.5,43.5]:[36.5,43.5],armObjective:'DRIVE TO THE DISTRICT EXTRACTION BEACON',armAnnounce:'FOLLOW THE AMBER MARKER',armComms:'Vehicle secured. Follow the amber marker along the wide district roads.',comms:'Secure a taxi and follow the marked district extraction route.'};
    if(index===1)return stage; // Retain the stair/uplink mission's physical building.
    const centre=regions[index],squad=entries=>entries?.map(([type,x,y,options])=>[type,...translate([x,y],centre),options]);
    return {...stage,target:translate(stage.target,centre),nodes:stage.nodes?.map(node=>({...node,x:translate([node.x,node.y],centre)[0],y:translate([node.x,node.y],centre)[1]})),squad:squad(stage.squad),reinforcements:stage.reinforcements?.map(wave=>({...wave,squad:squad(wave.squad)})),boss:stage.boss?{...stage.boss,phases:stage.boss.phases?.map(phase=>({...phase,summon:squad(phase.summon)}))}:undefined};
  })};
}
let activeArenaId='city-gate';
export function coverAt(x,y){return ARENA_COVERS[activeArenaId].find(c=>Math.abs(x-c.x)<=c.w/2&&Math.abs(y-c.y)<=c.d/2);}
export function supportHeight(x,y,brokenGlass=new Set()){
  const ix=Math.floor(x),iy=Math.floor(y),type=map[iy]?.[ix];
  const wall=ix>0&&iy>0&&ix<MAP_W-1&&iy<MAP_H-1&&type&&type!==4?WALL_HEIGHTS[type]:0;
  return GROUND_HEIGHT+Math.max(wall||0,coverAt(x,y)?.height||0);
}
const VEHICLE_BOUNDS=Object.freeze({bus:Object.freeze({halfLength:1.7,halfWidth:.7,height:1.9}),tricycle:Object.freeze({halfLength:.72,halfWidth:.38,height:1.55}),taxi:Object.freeze({halfLength:.98,halfWidth:.46,height:1.15})});
export function vehicleBounds(car){return VEHICLE_BOUNDS[car.kind]||VEHICLE_BOUNDS.taxi;}
export function vehicleDistance(car,x,y){
  const dx=x-car.x,dy=y-car.y,c=Math.cos(car.dir),s=Math.sin(car.dir),{halfLength,halfWidth}=vehicleBounds(car);
  return Math.hypot(Math.max(0,Math.abs(dx*c+dy*s)-halfLength),Math.max(0,Math.abs(-dx*s+dy*c)-halfWidth));
}

const DIFFICULTIES = {
  recruit:   { enemyHealth: .82, enemySpeed: .84, enemyDamage: .68, playerDamage: 1.15, label: 'RECRUIT' },
  operative: { enemyHealth: 1, enemySpeed: 1, enemyDamage: 1, playerDamage: 1, label: 'OPERATIVE' },
  nightmare: { enemyHealth: 1.28, enemySpeed: 1.12, enemyDamage: 1.3, playerDamage: .92, label: 'NIGHTMARE' }
};

// Enemy archetypes. Behavior is fully spec-driven — the AI reads these fields
// instead of switching on type names, so adding an archetype is a data change:
//   body     — which character model/sprite set to use (scout|trooper|heavy)
//   role     — decision-making style: flanker|support|assault|rusher|sniper
//   dash     — lateral combat dashes  · charge — straight-line charge attacks
//   noCover  — never breaks off to hide when hurt
//   magazine/reloadTime/burstFixed — ranged discipline
//   projectileSpeed/lead/precision — shot ballistics (precision <1 = tighter)
//   meleeMult/meleeRange/meleeRate — close-quarters profile
//   strafe   — sideways drift while engaging · accel/turn — mobility feel
//   shieldArc/shieldBlock — frontal kinetic barrier (flank or finisher to break)
const ENEMY_TYPES = {
  wraith: { name: 'WRAITH', hp: 56, speed: 2.05, radius: .26, damage: 9, fireRate: 1.55, preferred: 3.4, score: 110, color: '#31f5db', scale: .86,
    body: 'scout', role: 'flanker', dash: true, lead: .3 },
  specter: { name: 'SPECTER', hp: 92, speed: 1.48, radius: .3, damage: 13, fireRate: 1.12, preferred: 5.2, score: 175, color: '#a66cff', scale: 1,
    body: 'trooper', role: 'support', strafe: .72, lead: .42 },
  titan: { name: 'TITAN', hp: 235, speed: .92, radius: .4, damage: 22, fireRate: .82, preferred: 4.2, score: 420, color: '#ff8c57', scale: 1.35,
    body: 'heavy', role: 'assault', charge: true, noCover: true, magazine: 6, projectileSpeed: 4.4, accel: 3.1, turn: 2.4, reloadTime: 2.35, meleeMult: 1.15, burstFixed: 1, lead: .18 },
  stalker: { name: 'STALKER', hp: 44, speed: 2.6, radius: .25, damage: 8, fireRate: 1.2, preferred: 1.3, score: 150, color: '#ff536d', scale: .9,
    body: 'scout', role: 'rusher', dash: true, noCover: true, magazine: 8, meleeMult: 1.6, meleeRange: .95, meleeRate: .78, lead: .25 },
  raven: { name: 'RAVEN', hp: 64, speed: 1.3, radius: .28, damage: 34, fireRate: .42, preferred: 9.2, score: 260, color: '#ffd257', scale: 1,
    body: 'trooper', role: 'sniper', magazine: 3, projectileSpeed: 8.6, precision: .35, lead: .6, strafe: .12, reloadTime: 2.1, burstFixed: 1 },
  warden: { name: 'WARDEN', hp: 150, speed: 1.05, radius: .34, damage: 16, fireRate: .95, preferred: 3.6, score: 330, color: '#489bff', scale: 1.18,
    body: 'heavy', role: 'assault', noCover: true, magazine: 9, accel: 3.6, turn: 3, reloadTime: 1.9, meleeMult: 1, lead: .2, shieldArc: 1.15, shieldBlock: .82 }
};

// Weapons with an `unlock` field are earned through career stats (summed
// across all campaign records); the rest are always available.
// Weapon profiles — cadence, recoil pattern, and falloff drive feel (see shoot() in game.js).
// recoilClimb: vertical camera kick · recoilYaw: horizontal drift bias · recover: settle speed mult
// rpm-ish: rifle ~700, pistol ~240 semi, dmr ~140, shotgun pump ~75
const WEAPONS = [
  {id:'rifle',name:'VX-9 CARBINE',short:'VX-9',mode:'AUTO',mag:30,reserve:120,reload:1.48,cooldown:.086,damage:27,pellets:1,spread:.014,recoil:.24,recoilClimb:.019,recoilYaw:.009,recover:1.15,zoom:.56,color:'#31f5db'},
  {id:'shotgun',name:'SG-12 COMBAT',short:'SG-12',mode:'PUMP',mag:8,reserve:32,reload:1.9,cooldown:.74,damage:13,pellets:8,spread:.1,recoil:.72,recoilClimb:.048,recoilYaw:.02,recover:.72,zoom:.38,color:'#ffbb55'},
  {id:'pistol',name:'HMX-4 SIDEARM',short:'HMX',mode:'SEMI',mag:12,reserve:60,reload:1.1,cooldown:.2,damage:42,pellets:1,spread:.007,recoil:.32,recoilClimb:.028,recoilYaw:.014,recover:1.35,zoom:.66,color:'#a66cff'},
  {id:'dmr',name:'NX-7 MARKSMAN',short:'NX-7',mode:'SEMI',mag:10,reserve:50,reload:1.65,cooldown:.38,damage:70,pellets:1,spread:.004,recoil:.48,recoilClimb:.042,recoilYaw:.008,recover:.65,zoom:.76,color:'#ffd257',unlock:{kills:50,label:'50 CAREER ELIMINATIONS'}},
  {id:'smg',name:'KX-5 SUBMACHINE GUN',short:'KX-5',mode:'AUTO',mag:40,reserve:160,reload:1.3,cooldown:.058,damage:18,pellets:1,spread:.025,recoil:.17,recoilClimb:.013,recoilYaw:.012,recover:1.5,zoom:.42,color:'#86e58b'},
  {id:'lmg',name:'MG-60 SUPPORT GUN',short:'MG-60',mode:'AUTO',mag:75,reserve:225,reload:3.2,cooldown:.105,damage:32,pellets:1,spread:.022,recoil:.4,recoilClimb:.029,recoilYaw:.013,recover:.8,zoom:.5,color:'#ff975d'}
];

// Pure supply rules: full resources leave the pickup in the world.
export function collectSupply(player, kind, weapon) {
  const rules={health:['health','maxHealth',28,'HEALTH'],armor:['armor','maxArmor',34,'ARMOR'],shield:['shield','maxShield',28,'SHIELD']};
  if(kind==='ammo'){
    const before=player.reserve,cap=Math.ceil(weapon.reserve*1.5);
    player.reserve=Math.min(cap,before+Math.max(8,Math.ceil(weapon.mag*1.2)));
    return player.reserve>before?`+${player.reserve-before} ${weapon.short} AMMO`:null;
  }
  const rule=rules[kind];if(!rule)return null;
  const [field,max,gain,label]=rule,before=player[field];
  player[field]=Math.min(player[max],before+gain);
  if(kind==='shield'&&player[field]>before)player.shieldDelay=0;
  return player[field]>before?`+${player[field]-before} ${label}`:null;
}

export function missionInstruction(stage, distance, seconds=0, relays=0, inVehicle=false) {
  if(stage.type==='defend')return distance<(stage.radius||2.25)?`Stay in the marked zone · ${Math.ceil(seconds)}s remaining`:'Move into the marked zone to start the upload';
  if(stage.type==='destroy')return `Shoot the marked relay · ${relays} remaining`;
  if(stage.type==='hvt')return 'Find and defeat the commander · watch for reinforcements';
  if(stage.type==='extract')return inVehicle?'Drive to the extraction marker to finish the mission':'Enter any vehicle · E / Triangle to enter · or tap Enter';
  return `Reach ${stage.objective.replace(/^REACH |^ENTER /,'').toLowerCase()} · follow the marker`;
}

// Passive perks earned through career milestones and applied on deploy.
export function missionTactic(stage){
  if(stage.type==='defend')return 'Choose cover inside the upload zone. Watch road approaches; the transfer pauses when you leave.';
  if(stage.type==='destroy')return 'Locate each relay before exposing yourself. Aim from cover, then move to the next marked relay.';
  if(stage.type==='hvt')return 'Clear the escorts, watch the commander’s bursts, and reload behind cover. Reinforcements approach from district roads.';
  if(stage.type==='extract')return 'Choose an intact vehicle. Follow the extraction marker along open roads; the mission ends at the beacon.';
  return 'Scout the marked approach. Use side streets and cover; reaching the marker matters more than eliminating every patrol.';
}

// Prefer playstyle tradeoffs (heal/recharge/vehicle) over pure stat bloat.
const PERKS = [
  {id:'plating',name:'REINFORCED PLATING',desc:'+20 MAX ARMOR',unlock:{victories:1,label:'WIN ANY OPERATION'},apply:{maxArmor:120}},
  {id:'aegis',name:'AEGIS CAPACITOR',desc:'+15 MAX SHIELD',unlock:{takedowns:8,label:'8 CAREER FINISHERS'},apply:{maxShield:65}},
  {id:'mags',name:'EXTENDED MAGAZINES',desc:'+35% RESERVE AMMO',unlock:{kills:120,label:'120 CAREER ELIMINATIONS'},apply:{reserveMult:1.35}},
  {id:'jets',name:'AFTERBURNER CELL',desc:'+40% JET RECHARGE',unlock:{kills:80,label:'80 CAREER ELIMINATIONS'},apply:{jetRecharge:1.4}},
  {id:'vampire',name:'FINISHER PROTOCOL',desc:'FINISHERS RESTORE 12 HP',unlock:{takedowns:15,label:'15 CAREER FINISHERS'},apply:{takedownHeal:12}},
  {id:'hull',name:'INTERCEPTOR PLATING',desc:'VEHICLES +40 HULL',unlock:{roadkills:5,label:'5 CAREER ROADKILLS'},apply:{vehicleHp:140}}
];

// Stage types the mission engine understands. Keep tests in sync.
//   reach | defend | hvt | extract | destroy
const STAGE_TYPES = ['reach','defend','hvt','extract','destroy'];

// Boss phase ability verbs (fired once when HP crosses phase.at).
// shockwave — knockback + damage near commander
// cloak     — temporary evasion / reduced hit acceptance
// slam      — ground slam damage in a radius
const BOSS_ABILITIES = new Set(['shockwave','cloak','slam']);

// Per-operation mechanical identity (engine reads these at deploy / AI tick).
// layoutPatches open/wall cells on the shared map after a base restore.
// forceTime: lock day/night for the op · vehicleStage: auto-stage car near player
// sight*: AI sight range · noiseMult: gunfire alert · pistolNightBonus: damage mult
const OP_RULES = {
  'first-strike': {
    forceTime: null, sightDay: 13.2, sightNight: 9.1, noiseMult: 1, stealth: false,
    pistolNightBonus: 1, vehicleStage: -1, nightVision: false,
    layoutPatches: { open: [[9,5],[14,5],[9,18],[14,18]], wall: [] }
  },
  'night-raptor': {
    forceTime: null, sightDay: 10.5, sightNight: 6.1, noiseMult: 1.4, stealth: true,
    pistolNightBonus: 1.28, vehicleStage: -1, nightVision: true,
    layoutPatches: { open: [[11,8],[12,8],[11,15],[12,15]], wall: [[6,12,1],[17,12,1]] }
  },
  'iron-harvest': {
    forceTime: null, sightDay: 12, sightNight: 8, noiseMult: 1.1, stealth: false,
    pistolNightBonus: 1, vehicleStage: 1, nightVision: false,
    layoutPatches: { open: [[11,5],[12,5],[11,7],[12,7],[10,4],[13,4]], wall: [[8,10,3],[15,10,3]] }
  }
};

// End-of-run medals (pure evaluation — no DOM).
const MEDAL_DEFS = [
  { id: 'iron-will', name: 'IRON WILL', desc: 'Win with ≥70% vitals', check: s => s.victory && s.healthPct >= .7 },
  { id: 'deadeye', name: 'DEADEYE', desc: '≥55% accuracy', check: s => s.victory && s.accuracy >= .55 },
  { id: 'chain-lord', name: 'CHAIN LORD', desc: 'Reach x6 chain', check: s => s.comboPeak >= 6 },
  { id: 'road-warrior', name: 'ROAD WARRIOR', desc: '3+ vehicle kills', check: s => s.roadkills >= 3 },
  { id: 'ghost', name: 'GHOST PROTOCOL', desc: 'Win under 8 minutes', check: s => s.victory && s.totalTime < 480 },
  { id: 'finisher', name: 'CLOSE QUARTERS', desc: '4+ finishers', check: s => s.takedowns >= 4 },
  { id: 'untouchable', name: 'UNTOUCHABLE', desc: 'Win without taking HP damage', check: s => s.victory && s.damageTaken <= 0 }
];

// Daily challenge modifiers (selected by UTC date seed).
const DAILY_MODIFIERS = [
  { id: 'no-jet', label: 'DEAD THRUSTERS', desc: 'Jet assist disabled', rules: { noJet: true } },
  { id: 'shotgun-only', label: 'BREACH ONLY', desc: 'Shotgun locked as primary', rules: { weaponLock: 1 } },
  { id: 'double-stalkers', label: 'HUNTER NIGHT', desc: 'Stalker packs + night forced', rules: { forceNight: true, stalkerBoost: true } },
  { id: 'glass-cannon', label: 'GLASS CANNON', desc: 'You deal +25%, take +35%', rules: { playerDamage: 1.25, enemyDamage: 1.35 } },
  { id: 'speed-run', label: 'HARD CLOCK', desc: 'Score bonus for fast clears', rules: { speedBonus: true } }
];

function dailySeed(date = new Date()) {
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

function dailyModifier(date = new Date()) {
  const seed = dailySeed(date);
  return { seed, ...DAILY_MODIFIERS[seed % DAILY_MODIFIERS.length] };
}

function evaluateMedals(stats) {
  return MEDAL_DEFS.filter(medal => {
    try { return medal.check(stats); } catch { return false; }
  }).map(medal => ({ id: medal.id, name: medal.name, desc: medal.desc }));
}

const CAR_SPAWNS = [
  {x:4.5,y:12.2,dir:0,color:'#23834b',kind:'taxi',name:'ABUJA TAXI'},
  {x:19.4,y:12.1,dir:Math.PI,color:'#23834b',kind:'taxi',name:'ABUJA TAXI'},
  {x:12.1,y:4.5,dir:Math.PI/2,color:'#23834b',kind:'taxi',name:'ABUJA TAXI'},
  {x:10.2,y:18.5,dir:0,color:'#ffd337',kind:'tricycle',name:'YELLOW KEKE'},
  {x:2.5,y:16.5,dir:Math.PI/2,color:'#ffd337',kind:'tricycle',name:'YELLOW KEKE'}
  ,{x:36,y:24,dir:0,color:'#23834b',kind:'taxi',name:'ABUJA TAXI'}
  ,{x:12,y:36,dir:0,color:'#23834b',kind:'taxi',name:'ABUJA TAXI'}
  ,{x:36,y:36,dir:0,color:'#2873ab',kind:'bus',name:'CAPITAL CITY BUS'}
];

const WAVE_TABLE = [
  ['wraith','wraith','wraith','wraith'],
  ['wraith','specter','wraith','wraith','specter','wraith'],
  ['specter','wraith','specter','wraith','wraith','specter','wraith'],
  ['specter','specter','wraith','titan','wraith','specter','wraith','specter','wraith'],
  ['titan','specter','wraith','specter','wraith','titan','specter','wraith','specter','wraith','titan']
];

const MISSIONS = [
  {title:'FIRST CONTACT',objective:'NEUTRALIZE THE SCOUT TEAM',elite:'wraith'},
  {title:'CROSSFIRE',objective:'BREAK THE ASSAULT FORMATION',elite:'specter'},
  {title:'HUNTER PROTOCOL',objective:'ELIMINATE THE SQUAD LEADER',elite:'specter'},
  {title:'ARMORED BREACH',objective:'DESTROY THE TITAN ESCORT',elite:'titan'},
  {title:'ZERO SIGNAL',objective:'ERASE THE COMMAND CELL',elite:'titan'}
];

// Campaign operations. Each stage is one of four engine-understood types:
//   reach   — get within `radius` of `target` (progress scales over `range`)
//   defend  — stay within `radius` of `target` until `hold` seconds elapse;
//             `reinforcements` spawn as the countdown crosses each `at` mark
//   hvt     — kill the squad's commander (squad must contain one)
//   extract — enter a vehicle, then drive to `beacon`
// Squad entries are [enemyType, x, y, options?]. All coordinates are validated
// against the map by tests/data.test.mjs.
const OPERATIONS = [
  {
    id:'first-strike', name:'FIRST STRIKE', short:'FS',
    purpose:'Recover the stolen evacuation routes so Abuja district residents can leave safely. Secure the uplink, stop Voss and get the intelligence out.',
    tagline:'Infiltrate the district, steal the intel, burn out.',
    debriefVictory:'The uplink is secured, Commander Voss is down, and Unit 07 extracted with the stolen intelligence.',
    debriefComms:'First Strike is complete. Voss is down and the stolen intelligence is secure.',
    stages:[
      {code:'INFILTRATE',type:'reach',title:'GHOST ENTRY',objective:'REACH THE DATA CENTER BREACH POINT',target:[5.5,9.3],radius:1.45,range:16,tutorial:true,
       comms:'Advance through the district. Stay mobile and use cover—the perimeter team is already searching for you.',
       squad:[['wraith',5.5,11.6],['wraith',9.2,12.2],['specter',2.6,12.1]]},
      {code:'BREACH',type:'reach',title:'BREAK THE SEAL',objective:'ENTER THE DATA CENTER AND REACH THE UPLINK',target:[5.35,4.45],radius:1.18,range:6,
       comms:'The south entrance is open. Break glass if you need another route, then move to the uplink upstairs.',
       squad:[['wraith',7.05,5.45],['specter',7.15,7.15]]},
      {code:'DEFEND',type:'defend',title:'HOLD THE LINE',objective:'DEFEND THE UPLINK WHILE THE DATA TRANSFERS',target:[5.35,4.45],radius:2.25,hold:22,
       comms:'Transfer started. Hostile squads are converging on your position. Do not abandon the uplink.',
       squad:[['wraith',5.5,9.6],['specter',9.2,8.8]],
       reinforcements:[
         {at:17,squad:[['wraith',2.6,7.4],['wraith',9.2,6.8]]},
         {at:11,squad:[['specter',5.5,11.7],['wraith',8.9,9.4],['wraith',2.5,11.2]]},
         {at:5,squad:[['titan',11.5,6.6],['specter',9.4,4.4]]}
       ]},
      {code:'HVT',type:'hvt',title:'CUT THE HEAD',objective:'ELIMINATE COMMANDER VOSS',target:[16.65,18.05],
       comms:'We found Voss in the east command building. He is armored and protected by his remaining assault team.',
       confirmComms:'Voss is down. Leave the command building and secure an interceptor immediately.',
       squad:[['titan',16.65,18.05,{elite:true,commander:true}],['specter',16.5,16.5],['specter',17.55,16.45],['wraith',21.15,17.2]],
       boss:{phases:[
         {at:.66,announce:'VOSS // PHASE II',sub:'ASSAULT PLATING ENGAGED',ability:'shockwave',comms:'Voss is escalating—shockwave plating online. Keep pressure and watch for knockback.',speedMult:1.22,summon:[['specter',16.5,16.5],['wraith',21.15,17.2]]},
         {at:.33,announce:'VOSS // OVERDRIVE',sub:'SERVOS BURNING OUT',ability:'shockwave',comms:'His armor is failing and he knows it. Survive the overdrive and finish this.',speedMult:1.5,fireMult:1.45,summon:[['stalker',18.5,11.5],['wraith',16.5,16.5]]}
       ]}},
      {code:'EXTRACT',type:'extract',title:'BURN OUT',objective:'TAKE AN INTERCEPTOR AND REACH EXTRACTION',target:[19.4,12.1],beacon:[11.5,2.5],
       armObjective:'DRIVE TO THE NORTH EXTRACTION BEACON',armAnnounce:'DRIVE NORTH // BOOST AUTHORIZED',
       armComms:'Interceptor confirmed. Follow the amber beacon north and punch through any remaining hostiles.',
       comms:'Package confirmed. Take an ARES interceptor and drive to the north extraction beacon.',
       squad:[['wraith',15.1,12.1],['specter',21.2,11.2]]}
    ]
  },
  {
    id:'night-raptor', name:'NIGHT RAPTOR', short:'NR',
    purpose:'The recovered routes exposed a surveillance relay. Disable it before dawn so the evacuation convoy can cross the district undetected.',
    tagline:'Silence the relay network before dawn breaks.',
    debriefVictory:'The relay is scrambled, Raptor Actual is silenced, and the district is dark to enemy eyes.',
    debriefComms:'Night Raptor is complete. Their comms grid is burning and the extraction corridor is clear.',
    stages:[
      {code:'SLIP-IN',type:'reach',title:'COLD APPROACH',objective:'REACH THE EASTERN RELAY POST',target:[18.5,11.5],radius:1.45,range:16,
       comms:'Move east through the plaza. Their patrols double after dark—keep to the shadows between buildings.',
       squad:[['wraith',15.1,12.1],['stalker',21.2,11.2],['specter',18.5,11.5]]},
      {code:'ASCEND',type:'reach',title:'TOWER RUN',objective:'CLIMB TO THE COMM TOWER UPLINK',target:[18.05,17.45],radius:1.18,range:8,
       comms:'The command building stairwell is your route up. Expect close-quarters resistance on the landings.',
       squad:[['specter',16.5,16.5],['stalker',17.55,16.45]]},
      {code:'SCRAMBLE',type:'defend',title:'DEAD AIR',objective:'HOLD THE TOWER WHILE THE SCRAMBLER CYCLES',target:[18.05,17.45],radius:2.25,hold:18,
       comms:'Scrambler is cycling. They know exactly where you are now—hold the tower floor until it finishes.',
       squad:[['raven',21.15,17.2],['specter',15.1,12.1]],
       reinforcements:[
         {at:13,squad:[['stalker',18.5,11.5],['wraith',21.2,11.2]]},
         {at:8,squad:[['raven',16.5,16.5],['specter',21.15,17.2],['stalker',15.1,12.1]]},
         {at:3,squad:[['titan',18.5,11.5],['stalker',21.2,11.2]]}
       ]},
      {code:'HVT',type:'hvt',title:'RAPTOR ACTUAL',objective:'ELIMINATE RAPTOR ACTUAL',target:[5.35,4.45],
       comms:'Their signals officer fell back to the data center. Fast, twitchy, and never alone—watch the flanks.',
       confirmComms:'Raptor Actual is silent. Get to an interceptor and run the southern corridor before dawn.',
       squad:[['specter',5.35,4.45,{elite:true,commander:true}],['raven',7.15,7.15],['stalker',7.05,5.45],['stalker',2.6,7.4]],
       boss:{phases:[
         {at:.66,announce:'RAPTOR // PHASE II',sub:'GHOST PROTOCOL ACTIVE',ability:'cloak',comms:'Raptor went ghost—cloak active. Watch your blind side and track muzzle flash.',speedMult:1.35,summon:[['stalker',7.05,5.45],['stalker',2.6,7.4]]},
         {at:.33,announce:'RAPTOR // LAST LIGHT',sub:'SIGNAL FLARE // ALL UNITS',ability:'cloak',comms:'That flare just told every survivor where you are. End this fast.',speedMult:1.55,fireMult:1.5,summon:[['raven',9.2,8.8],['wraith',5.5,9.6]]}
       ]}},
      {code:'EXTRACT',type:'extract',title:'DAWN LINE',objective:'TAKE AN INTERCEPTOR AND REACH EXTRACTION',target:[4.5,12.2],beacon:[11.5,21.5],
       armObjective:'DRIVE TO THE SOUTH EXTRACTION BEACON',armAnnounce:'DRIVE SOUTH // BOOST AUTHORIZED',
       armComms:'Interceptor confirmed. The south corridor is your dawn line—do not stop for anything.',
       comms:'Scramble confirmed. Grab an interceptor on the west side and run the southern corridor.',
       squad:[['stalker',5.5,11.5],['raven',2.5,11.2]]}
    ]
  },
  {
    id:'iron-harvest', name:'IRON HARVEST', short:'IH',
    purpose:'The convoy is moving, but the armored foundry threatens its route. Capture the core, disable its relays and stop Warden-6 before extracting.',
    tagline:'Break the titan foundry and salvage the core.',
    debriefVictory:'Warden-6 is scrap, the foundry core is aboard, and their armored program died in the district.',
    debriefComms:'Iron Harvest is complete. The foundry core is secure and their titan line is finished.',
    stages:[
      {code:'PUSH-UP',type:'reach',title:'IRON ROAD',objective:'REACH THE NORTHERN DEPOT',target:[12.1,4.5],radius:1.45,range:16,
       comms:'The depot feeds their titan foundry. Push north through the market lanes and expect armor on the road.',
       squad:[['warden',11.5,6.6],['wraith',9.4,4.4],['stalker',15.1,12.1]]},
      {code:'SIPHON',type:'defend',title:'HOT METAL',objective:'HOLD THE DEPOT WHILE THE CORE DRAINS',target:[11.5,6.5],radius:2.4,hold:26,
       comms:'Drain started. This is their supply artery—every squad in the sector is inbound. Dig in.',
       squad:[['specter',9.2,6.8],['wraith',11.5,2.5]],
       reinforcements:[
         {at:20,squad:[['wraith',9.2,6.8],['stalker',15.1,12.1],['specter',11.5,2.5]]},
         {at:13,squad:[['warden',11.5,2.5],['raven',9.4,4.4]]},
         {at:6,squad:[['titan',15.1,12.1],['warden',11.5,6.6],['stalker',9.2,6.8]]}
       ]},
      {code:'SWEEP',type:'destroy',title:'VAULT KEYS',objective:'DESTROY THE THREE VAULT RELAYS',target:[5.5,11.7],radius:12,range:20,
       comms:'Core secured. Three vault relays still gate the southwest codes—shoot each relay until it fails, then push to Warden-6.',
       nodes:[{x:5.5,y:11.7,hp:90},{x:2.5,y:11.2,hp:90},{x:8.9,y:9.4,hp:90}],
       squad:[['specter',5.5,11.7],['warden',2.5,11.2],['stalker',8.9,9.4]]},
      {code:'HVT',type:'hvt',title:'WARDEN-6',objective:'DESTROY WARDEN-6',target:[21.15,17.2],
       comms:'Their lead armor unit is hunting you—a command titan they call Warden-6. Kill it before it corners you.',
       confirmComms:'Warden-6 is scrap. Secure an interceptor and burn for the northeast beacon.',
       squad:[['titan',21.15,17.2,{elite:true,commander:true}],['warden',16.5,16.5],['raven',17.55,16.45],['stalker',18.5,11.5]],
       boss:{phases:[
         {at:.66,announce:'WARDEN-6 // PHASE II',sub:'ESCORT PROTOCOL ENGAGED',ability:'slam',comms:'It is deploying barrier escorts and ground slams. Break wardens from behind or finish them.',speedMult:1.2,summon:[['warden',18.5,11.5],['stalker',21.2,11.2]]},
         {at:.33,announce:'WARDEN-6 // MELTDOWN',sub:'REACTOR VENTING // DANGER CLOSE',ability:'slam',comms:'Its reactor is venting—it will try to run you down. Do not let it corner you.',speedMult:1.55,fireMult:1.4,summon:[['raven',16.5,16.5],['stalker',17.55,16.45]]}
       ]}},
      {code:'EXTRACT',type:'extract',title:'SCORCHED RUN',objective:'TAKE AN INTERCEPTOR AND REACH EXTRACTION',target:[12.1,4.5],beacon:[21.5,2.5],
       armObjective:'DRIVE TO THE NORTHEAST EXTRACTION BEACON',armAnnounce:'DRIVE NORTHEAST // BOOST AUTHORIZED',
       armComms:'Interceptor confirmed. Northeast beacon is lit—run the perimeter road and do not slow down.',
       comms:'Warden-6 is down. Take an interceptor and burn for the northeast extraction point.',
       squad:[['stalker',21.2,11.2],['raven',21.5,11.5]]}
    ]
  }
];

const MISSION_CONDITIONS = {
  day: { label:'DAYLIGHT', clock:'13:40', condition:'HIGH VISIBILITY', brief:'Clear sightlines, warm sunlight and longer combat range.' },
  night: { label:'NIGHT OPS', clock:'02:15', condition:'LOW-LIGHT INFILTRATION', brief:'Deeper shadows, neon navigation and tighter detection range.' }
};

const spawns = [
  [2.5,2.5],[21.5,2.5],[2.5,21.5],[21.5,21.5],
  [11.5,2.5],[2.5,11.5],[21.5,11.5],[11.5,21.5],
  [5.5,11.5],[18.5,11.5],[11.5,6.5]
];

const map = Array.from({length: MAP_H}, (_, y) => Array.from({length: MAP_W}, (_, x) => (x===0 || y===0 || x===MAP_W-1 || y===MAP_H-1) ? 1 : 0));
function wallRect(x,y,w,h,type=1) { for(let yy=y; yy<y+h; yy++) for(let xx=x; xx<x+w; xx++) map[yy][xx]=type; }
wallRect(5,5,2,2,2); wallRect(17,5,2,2,2); wallRect(5,17,2,2,2); wallRect(17,17,2,2,2);
wallRect(10,10,4,1,3); wallRect(10,13,4,1,3); wallRect(10,11,1,2,3); wallRect(13,11,1,2,3);
wallRect(3,9,4,1,1); wallRect(17,9,4,1,1); wallRect(3,14,4,1,1); wallRect(17,14,4,1,1);
wallRect(8,3,1,4,2); wallRect(15,3,1,4,2); wallRect(8,17,1,4,2); wallRect(15,17,1,4,2);
map[9][5]=0; map[14][18]=0; map[4][8]=0; map[19][15]=0;

function restoreMapBase() {
  activeArenaId='city-gate';
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) map[y][x] = MAP_BASE[y][x];
}

function applyOperationLayout(opId,arenaId='city-gate') {
  restoreMapBase();
  activeArenaId=ARENAS.some(a=>a.id===arenaId)?arenaId:'city-gate';
  for(let y=10;y<=13;y++)for(let x=10;x<=13;x++)map[y][x]=0;
  if(arenaId==='millennium-park'){
    for(const [x,y] of [[10,10],[13,10],[10,13],[13,13]])map[y][x]=6;
    for(const [x,y] of [[11,11],[12,11],[11,12],[12,12]])map[y][x]=8;
  }else if(arenaId==='jabi-lake'){
    for(let x=10;x<=13;x++){map[10][x]=7;map[13][x]=7;}
    for(const [x,y] of [[10,11],[13,11],[10,12],[13,12]])map[y][x]=8;
  }else{
    for(const [x,y] of [[10,10],[13,10],[10,13],[13,13]])map[y][x]=5;
  }
  const patches = OP_RULES[opId]?.layoutPatches;
  if (!patches) return;
  for (const [x, y] of patches.open || []) {
    if (y > 0 && y < MAP_H - 1 && x > 0 && x < MAP_W - 1) map[y][x] = 0;
  }
  for (const [x, y, type = 1] of patches.wall || []) {
    if (y > 0 && y < MAP_H - 1 && x > 0 && x < MAP_W - 1) map[y][x] = type;
  }
  // Distinct outer neighbourhoods; leave roads and junctions completely clear.
  for(let y=26;y<46;y++)for(let x=2;x<46;x++){
    if(DRIVE_LANES.some(lane=>Math.abs(x+.5-lane)<3||Math.abs(y+.5-lane)<3))continue;
    if(activeArenaId==='city-gate'&&x%12>=4&&x%12<=7&&y%12>=4&&y%12<=7)map[y][x]=2;
    if(activeArenaId==='millennium-park'&&y%10===8&&x%10>=4&&x%10<=7)map[y][x]=6;
    if(activeArenaId==='jabi-lake'&&x>=39&&y>=27&&y<=32)map[y][x]=7;
  }
  for(let y=2;y<22;y++)for(let x=27;x<46;x++){
    if(DRIVE_LANES.some(lane=>Math.abs(x+.5-lane)<3||Math.abs(y+.5-lane)<3))continue;
    if(activeArenaId==='city-gate'&&x%12>=4&&x%12<=7&&y%12>=4&&y%12<=7)map[y][x]=2;
    if(activeArenaId==='millennium-park'&&x%10===8&&y%10>=4&&y%10<=7)map[y][x]=6;
    if(activeArenaId==='jabi-lake'&&x>=39&&y>=3&&y<=8)map[y][x]=7;
  }
}

// Two traversable buildings: perimeter walls, doors, windows and interior stairs.
function buildInterior(x,y,w,h,doorX,doorY){
  for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)map[yy][xx]=0;
  for(let xx=x;xx<x+w;xx++){map[y][xx]=2;map[y+h-1][xx]=2;}
  for(let yy=y;yy<y+h;yy++){map[yy][x]=2;map[yy][x+w-1]=2;}
  map[doorY][doorX]=0;
}
buildInterior(3,3,6,6,5,8);map[3][5]=4;map[5][3]=4;map[5][8]=4;
buildInterior(15,15,6,6,18,15);map[20][18]=4;map[17][15]=4;map[17][20]=4;
const STAIR_ZONES=[{x1:4,x2:5.9,y1:4,y2:7.6,axis:'y',reverse:true},{x1:18.1,x2:20,y1:16,y2:19.6,axis:'y',reverse:false}];
// Capture the completed world, including interiors, before any arena mutation.
const MAP_BASE=map.map(row=>row.slice());
// Generate independent server room data without changing campaign map/cover
// selection. This helper is synchronous; no room retains shared mutable cells.
export function snapshotArena(arenaId){
  if(!ARENAS.some(a=>a.id===arenaId))throw Error('Unsupported arena.');
  const savedMap=map.map(row=>row.slice()),savedArena=activeArenaId;
  try{applyOperationLayout('first-strike',arenaId);return {map:map.map(row=>row.slice()),covers:ARENA_COVERS[arenaId].map(c=>({...c})),arena:arenaId};}
  finally{for(let y=0;y<map.length;y++)map[y].splice(0,map[y].length,...savedMap[y]);activeArenaId=savedArena;}
}

export { MAP_W, MAP_H, GROUND_HEIGHT, WALL_HEIGHTS, DIFFICULTIES, ENEMY_TYPES, WEAPONS, PERKS,
  STAGE_TYPES, BOSS_ABILITIES, OP_RULES, MEDAL_DEFS, DAILY_MODIFIERS, dailySeed, dailyModifier, evaluateMedals,
  applyOperationLayout, restoreMapBase, MAP_BASE, CAR_SPAWNS, WAVE_TABLE, MISSIONS, OPERATIONS,
  MISSION_CONDITIONS, spawns, map, STAIR_ZONES };

// Re-export MEDAL_DEFS id list is available for UI catalog consumers.
