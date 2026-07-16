// World data: map layout, enemy roster, weapons, missions, spawn tables.
// Pure data module — no DOM, no game-state imports. Consumed by game.js
// and by the node:test suite.

const MAP_W = 24, MAP_H = 24;
const GROUND_HEIGHT = .5;
const WALL_HEIGHTS = {1:1.35,2:2.1,3:1.62,4:1.9};

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
const WEAPONS = [
  {id:'rifle',name:'VX-9 PULSE RIFLE',short:'VX-9',mode:'AUTO',mag:30,reserve:120,reload:1.45,cooldown:.095,damage:29,pellets:1,spread:.018,recoil:.28,zoom:.57,color:'#31f5db'},
  {id:'shotgun',name:'SG-12 BREACH SHOTGUN',short:'SG-12',mode:'PUMP',mag:8,reserve:32,reload:1.85,cooldown:.72,damage:15,pellets:7,spread:.105,recoil:.62,zoom:.42,color:'#ffbb55'},
  {id:'pistol',name:'HMX-4 HEAVY SIDEARM',short:'HMX',mode:'SEMI',mag:12,reserve:60,reload:1.12,cooldown:.22,damage:43,pellets:1,spread:.009,recoil:.34,zoom:.67,color:'#a66cff'},
  {id:'dmr',name:'NX-7 ARC MARKSMAN',short:'NX-7',mode:'SEMI',mag:10,reserve:50,reload:1.6,cooldown:.4,damage:68,pellets:1,spread:.006,recoil:.5,zoom:.72,color:'#ffd257',unlock:{kills:50,label:'50 CAREER ELIMINATIONS'}}
];

// Passive perks earned through career milestones and applied on deploy.
const PERKS = [
  {id:'plating',name:'REINFORCED PLATING',desc:'+20 MAX ARMOR',unlock:{victories:1,label:'WIN ANY OPERATION'},apply:{maxArmor:120}},
  {id:'aegis',name:'AEGIS CAPACITOR',desc:'+15 MAX SHIELD',unlock:{takedowns:8,label:'8 CAREER FINISHERS'},apply:{maxShield:65}},
  {id:'mags',name:'EXTENDED MAGAZINES',desc:'+35% RESERVE AMMO',unlock:{kills:120,label:'120 CAREER ELIMINATIONS'},apply:{reserveMult:1.35}}
];

const CAR_SPAWNS = [
  {x:4.5,y:12.2,dir:0,color:'#31f5db'},
  {x:19.4,y:12.1,dir:Math.PI,color:'#ff536d'},
  {x:12.1,y:4.5,dir:Math.PI/2,color:'#a66cff'}
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
         {at:.66,announce:'VOSS // PHASE II',sub:'ASSAULT PLATING ENGAGED',comms:'Voss is escalating—his guard detail is falling back to him. Keep the pressure on.',speedMult:1.22,summon:[['specter',16.5,16.5],['wraith',21.15,17.2]]},
         {at:.33,announce:'VOSS // OVERDRIVE',sub:'SERVOS BURNING OUT',comms:'His armor is failing and he knows it. Survive the overdrive and finish this.',speedMult:1.5,fireMult:1.45,summon:[['stalker',18.5,11.5],['wraith',16.5,16.5]]}
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
         {at:.66,announce:'RAPTOR // PHASE II',sub:'GHOST PROTOCOL ACTIVE',comms:'Raptor went evasive and called in close-quarters cover. Watch your blind side.',speedMult:1.35,summon:[['stalker',7.05,5.45],['stalker',2.6,7.4]]},
         {at:.33,announce:'RAPTOR // LAST LIGHT',sub:'SIGNAL FLARE // ALL UNITS',comms:'That flare just told every survivor where you are. End this fast.',speedMult:1.55,fireMult:1.5,summon:[['raven',9.2,8.8],['wraith',5.5,9.6]]}
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
      {code:'SWEEP',type:'reach',title:'SOUTH GATE',objective:'REACH THE SOUTHWEST VAULT',target:[2.5,21.5],radius:1.45,range:20,
       comms:'Core secured. The vault codes are in the southwest quarter—cut diagonally and keep moving.',
       squad:[['specter',5.5,11.7],['warden',2.5,11.2],['stalker',8.9,9.4]]},
      {code:'HVT',type:'hvt',title:'WARDEN-6',objective:'DESTROY WARDEN-6',target:[21.15,17.2],
       comms:'Their lead armor unit is hunting you—a command titan they call Warden-6. Kill it before it corners you.',
       confirmComms:'Warden-6 is scrap. Secure an interceptor and burn for the northeast beacon.',
       squad:[['titan',21.15,17.2,{elite:true,commander:true}],['warden',16.5,16.5],['raven',17.55,16.45],['stalker',18.5,11.5]],
       boss:{phases:[
         {at:.66,announce:'WARDEN-6 // PHASE II',sub:'ESCORT PROTOCOL ENGAGED',comms:'It is deploying barrier escorts. Break the wardens from behind or burn them down with the finisher.',speedMult:1.2,summon:[['warden',18.5,11.5],['stalker',21.2,11.2]]},
         {at:.33,announce:'WARDEN-6 // MELTDOWN',sub:'REACTOR VENTING // DANGER CLOSE',comms:'Its reactor is venting—it will try to run you down. Do not let it corner you.',speedMult:1.55,fireMult:1.4,summon:[['raven',16.5,16.5],['stalker',17.55,16.45]]}
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

export { MAP_W, MAP_H, GROUND_HEIGHT, WALL_HEIGHTS, DIFFICULTIES, ENEMY_TYPES, WEAPONS, PERKS,
  CAR_SPAWNS, WAVE_TABLE, MISSIONS, OPERATIONS, MISSION_CONDITIONS, spawns, map, STAIR_ZONES };
