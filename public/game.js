import { MAP_W, MAP_H, GROUND_HEIGHT, WALL_HEIGHTS, DIFFICULTIES, ENEMY_TYPES, WEAPONS, PERKS,
  CAR_SPAWNS, WAVE_TABLE, MISSIONS, OPERATIONS, MISSION_CONDITIONS, spawns, map, STAIR_ZONES } from '/data.js';
import { AudioSystem } from '/audio.js';

'use strict';

    const TEX = 64;

    const $ = (id) => document.getElementById(id);
    const canvas = $('game');
    const ctx = canvas.getContext('2d', { alpha: false });
    const radar = $('radar');
    const rctx = radar.getContext('2d');
    const coarsePointer = matchMedia('(pointer: coarse)').matches;
    const lowRenderPreset = new URLSearchParams(location.search).get('quality') === 'low' || (()=>{try{return localStorage.getItem('neon-breach-quality')==='low';}catch{return false;}})();
    const TAU = Math.PI * 2;
    const FOV = Math.PI / 3;

    const state = {
      mode: 'menu', difficulty: 'operative', wave: 0, wavePhase: 'idle', waveTimer: 0,
      pending: [], spawnTimer: 0, initialWaveCount: 0, enemies: [], projectiles: [], pickups: [], particles: [], cars: [],
      lastTime: 0, totalTime: 0, announcementTimer: 0, messageTimer: 0, screenShake: 0, muzzle: 0, melee: 0,
      musicTimer: 0, musicStep: 0, muted: false, touch: coarsePointer, qaInvulnerable: false,
      slowMo:0, eliteSpawned:false, objective:'HOLD THE ARES GRID', threatPulse:0, takedowns:0, roadkills:0, shieldFlash:0, armorFlash:0,
      timeOfDay:'day', camera:null, squadAlert:0, autoLock:true, lockTarget:null, corpses:[], bloodDecals:[], brokenGlass:new Set(), threeReady:false,gore:true,
      missionStage:0,missionHold:22,missionSpawnStep:0,missionProgress:0,objectiveTarget:[5.5,9.3],commsTimer:0,commander:null,extractionArmed:false,tutorialStep:0,operation:0
    };

    const player = {
      x: 11.5, y: 18.5, z: GROUND_HEIGHT, vz: 0, dir: -Math.PI/2, pitch: 0, health: 100, maxHealth: 100, shield: 50, maxShield: 50, armor:100, maxArmor:100, shieldDelay:0,
      ammo: 30, magSize: 30, reserve: 120, fireCooldown: 0, reloading: false, reloadTime: 1.45, reloadTimer: 0,
      spread: 0, recoil: 0, bob: 0, bobAmount: 0, score: 0, kills: 0, combo: 1, comboTimer: 0,
      hurtTimer: 0, alive: true, shots: 0, hits: 0, grounded: true, jetFuel: 100, jetting: false, ads: 0, stepTimer: 0, jetSoundTimer: 0,
      weaponIndex:0,weaponSlots:[],carIndex:-1,gamepadAimValue:0,moveVx:0,moveVy:0
    };

    const input = { forward:false, back:false, left:false, right:false, sprint:false, fire:false, shiftFire:false, pointerFire:false, aim:false, jump:false,gamepadFire:false,gamepadAim:false,gamepadAimValue:0,gamepadJump:false,gamepadSprint:false };
    let moveAxis = {x:0,y:0};
    let controllerAxis = {x:0,y:0};
    let gamepadPrevious = [];
    let activeGamepad = null;
    let depthBuffer = new Float32Array(1);
    let wallTopBuffer = new Float32Array(1);
    let wallBottomBuffer = new Float32Array(1);
    let textures = [];
    let sprites = {};
    let resizeTimer = 0;
    let audio = null;
    const campaignCloud = { id:null, active:null, records:[], syncing:false, saveTimer:12, remoteBest:0, pendingStatus:null, offline:false };
    const LOCAL_CAMPAIGN_KEY = 'neon-breach-campaign-v1';
    function localCampaignState(){try{const value=JSON.parse(localStorage.getItem(LOCAL_CAMPAIGN_KEY)||'null');return value&&typeof value==='object'?value:null;}catch{return null;}}
    function writeLocalCampaign(status,payload){
      const local=localCampaignState()||{active:null,records:[],career:{kills:0,takedowns:0,roadkills:0,victories:0},best_score:0};
      const record={...payload,id:Number(payload.id||Date.now()),updated_at:new Date().toISOString()};
      if(status==='active')local.active=record;
      else{local.active=null;local.records=[record,...(Array.isArray(local.records)?local.records:[])].slice(0,8);}
      local.best_score=Math.max(Number(local.best_score||0),Number(record.score||0));
      local.career={kills:local.records.reduce((sum,row)=>sum+Number(row.kills||0),0),takedowns:local.records.reduce((sum,row)=>sum+Number(row.takedowns||0),0),roadkills:local.records.reduce((sum,row)=>sum+Number(row.roadkills||0),0),victories:local.records.reduce((sum,row)=>sum+(row.status==='victory'?1:0),0)};
      try{localStorage.setItem(LOCAL_CAMPAIGN_KEY,JSON.stringify(local));}catch{}
      return record;
    }
    function useLocalCampaign(){
      const local=localCampaignState();if(!local)return false;
      campaignCloud.active=local.active||null;campaignCloud.records=Array.isArray(local.records)?local.records:[];campaignCloud.remoteBest=Number(local.best_score||0);campaignCloud.offline=true;
      if(local.career)for(const key of Object.keys(career))career[key]=Number(local.career[key]||0);
      renderCampaignRecords();renderArsenal();return true;
    }
    // Career totals across all campaign records (served by GET /api/campaigns);
    // unlocks for weapons and perks are evaluated against these.
    const career = { kills:0, takedowns:0, roadkills:0, victories:0 };
    function meetsUnlock(unlock){return !unlock||Object.entries(unlock).every(([key,value])=>key==='label'||(career[key]||0)>=value);}
    function weaponUnlocked(index){return meetsUnlock(WEAPONS[index]?.unlock);}
    function perkUnlocked(id){const perk=PERKS.find(p=>p.id===id);return !!perk&&meetsUnlock(perk.unlock);}
    function applyPerks(fresh){
      player.maxArmor=perkUnlocked('plating')?PERKS.find(p=>p.id==='plating').apply.maxArmor:100;
      player.maxShield=perkUnlocked('aegis')?PERKS.find(p=>p.id==='aegis').apply.maxShield:50;
      if(fresh){player.armor=player.maxArmor;player.shield=player.maxShield;}
      else{player.armor=Math.min(player.armor,player.maxArmor);player.shield=Math.min(player.shield,player.maxShield);}
      if(perkUnlocked('mags')){const mult=PERKS.find(p=>p.id==='mags').apply.reserveMult;for(const [index,slot] of player.weaponSlots.entries())slot.reserve=Math.ceil(WEAPONS[index].reserve*mult);player.reserve=player.weaponSlots[player.weaponIndex].reserve;}
    }


    function makeTexture(type) {
      const c=document.createElement('canvas'); c.width=c.height=TEX; const g=c.getContext('2d');
      const palettes = {
        1:['#10232a','#173640','#2c7072','#31f5db'],
        2:['#1a1530','#2f2252','#704cab','#a66cff'],
        3:['#2b1817','#54302b','#af5a3e','#ffbb55'],
        4:['#071820','#123642','#5fc7dc','#d8fbff']
      };
      const p=palettes[type];
      const grad=g.createLinearGradient(0,0,64,64); grad.addColorStop(0,p[0]); grad.addColorStop(.5,p[1]); grad.addColorStop(1,p[0]); g.fillStyle=grad; g.fillRect(0,0,64,64);
      g.strokeStyle=p[2]; g.lineWidth=1; g.globalAlpha=.7;
      for(let y=0;y<=64;y+=16){ g.beginPath();g.moveTo(0,y+.5);g.lineTo(64,y+.5);g.stroke(); }
      for(let x=0;x<=64;x+=32){ g.beginPath();g.moveTo(x+.5,0);g.lineTo(x+.5,64);g.stroke(); }
      g.globalAlpha=.25; g.fillStyle=p[3];
      for(let y=3;y<64;y+=16){ g.fillRect(3,y,25,1); g.fillRect(36,y+8,24,1); }
      g.globalAlpha=1; g.fillStyle=p[3]; g.shadowColor=p[3]; g.shadowBlur=6;
      if(type===3){ for(let y=4;y<64;y+=16){ g.save();g.translate(0,y);g.rotate(-.3);g.fillRect(-4,0,25,3);g.fillRect(32,0,25,3);g.restore(); } }
      else if(type===4){g.globalAlpha=.55;g.strokeStyle='#d8fbff';g.beginPath();g.moveTo(0,0);g.lineTo(64,64);g.moveTo(64,0);g.lineTo(0,64);g.stroke();g.globalAlpha=1;}
      else { for(let y=7;y<64;y+=16){ g.fillRect(4,y,2,2); g.fillRect(58,y,2,2); } }
      return c;
    }

    function makeEnemySprite(type,variant=0) {
      // Procedural fallback sprite; palettes keyed by body silhouette so any
      // archetype renders even before its webp asset loads.
      const spec=ENEMY_TYPES[type],body=spec.body||'trooper';
      const skinSets={scout:['#6e402c','#c1835f','#e0b18c'],trooper:['#9b6545','#4a2a20','#d39a72'],heavy:['#543024','#8a553c','#bc7857']},skin=skinSets[body][variant%3];
      const uniforms={scout:['#1c3134','#283b36','#222b39'],trooper:['#302945','#252b3c','#3b293d'],heavy:['#3a2b29','#30343a','#453027']},cloth=uniforms[body][variant%3];
      const c=document.createElement('canvas');c.width=160;c.height=240;const g=c.getContext('2d'),cx=80,bulk=body==='heavy'?1.16:body==='scout'?.92:1;

      g.save();g.globalAlpha=.2;g.fillStyle=spec.color;g.shadowColor=spec.color;g.shadowBlur=28;g.beginPath();g.ellipse(cx,131,49*bulk,91,0,0,TAU);g.fill();g.restore();
      g.fillStyle='rgba(0,0,0,.45)';g.beginPath();g.ellipse(cx,226,39*bulk,7,0,0,TAU);g.fill();

      // Human legs, knees and boots.
      g.strokeStyle='rgba(255,255,255,.13)';g.lineWidth=1.5;g.fillStyle='#11181c';
      g.beginPath();g.moveTo(51,154);g.lineTo(73,153);g.lineTo(72,200);g.lineTo(64,226);g.lineTo(39,226);g.lineTo(48,198);g.closePath();g.fill();g.stroke();
      g.beginPath();g.moveTo(87,153);g.lineTo(109,154);g.lineTo(112,198);g.lineTo(121,226);g.lineTo(96,226);g.lineTo(88,200);g.closePath();g.fill();g.stroke();
      g.fillStyle='#070b0e';g.fillRect(37,218,29,10);g.fillRect(96,218,29,10);g.fillStyle=spec.color;g.globalAlpha=.35;g.fillRect(48,184,23,4);g.fillRect(90,184,23,4);g.globalAlpha=1;

      // Tactical torso with believable shoulder/waist proportions.
      const torso=g.createLinearGradient(42,77,116,171);torso.addColorStop(0,cloth);torso.addColorStop(.58,'#11191e');torso.addColorStop(1,'#080d11');g.fillStyle=torso;g.strokeStyle=spec.color;g.lineWidth=1.5;
      g.beginPath();g.moveTo(52,79);g.quadraticCurveTo(34,84,31,103);g.lineTo(43,151);g.quadraticCurveTo(49,164,61,169);g.lineTo(99,169);g.quadraticCurveTo(111,164,117,151);g.lineTo(129,103);g.quadraticCurveTo(126,84,108,79);g.lineTo(94,73);g.lineTo(66,73);g.closePath();g.fill();g.stroke();

      // Neck and clearly visible human face.
      g.fillStyle=skin;g.fillRect(68,62,24,21);g.beginPath();g.ellipse(cx,45,25*bulk,31,0,0,TAU);g.fill();
      g.beginPath();g.ellipse(55,47,4,7,0,0,TAU);g.ellipse(105,47,4,7,0,0,TAU);g.fill();
      const shade=g.createLinearGradient(58,30,103,64);shade.addColorStop(0,'rgba(255,255,255,.14)');shade.addColorStop(.58,'rgba(0,0,0,0)');shade.addColorStop(1,'rgba(0,0,0,.23)');g.fillStyle=shade;g.beginPath();g.ellipse(cx,45,25*bulk,31,0,0,TAU);g.fill();
      g.strokeStyle='#1c1513';g.lineWidth=2;g.beginPath();g.moveTo(65,40);g.quadraticCurveTo(70,36,76,40);g.moveTo(84,40);g.quadraticCurveTo(91,36,97,40);g.stroke();
      g.fillStyle='#f4f0e8';g.beginPath();g.ellipse(71,44,4.8,2.7,0,0,TAU);g.ellipse(90,44,4.8,2.7,0,0,TAU);g.fill();g.fillStyle=variant===1?'#6f4b2c':'#24201a';g.beginPath();g.arc(72,44,1.8,0,TAU);g.arc(89,44,1.8,0,TAU);g.fill();
      g.strokeStyle='rgba(38,18,13,.55)';g.lineWidth=1.4;g.beginPath();g.moveTo(80,45);g.lineTo(77,56);g.quadraticCurveTo(80,59,84,56);g.moveTo(69,64);g.quadraticCurveTo(80,70,92,63);g.stroke();

      // Distinct hair silhouettes produce three recognizable people per class.
      g.fillStyle=variant===2?'#2b1711':'#090b0c';
      if(variant===0){g.beginPath();g.arc(cx,30,25*bulk,18,Math.PI,TAU);g.lineTo(104,42);g.quadraticCurveTo(93,26,60,34);g.closePath();g.fill();}
      else if(variant===1){g.beginPath();for(let i=0;i<9;i++){const x=58+i*5.5,y=21+(i%2)*3;g.arc(x,y,7,0,TAU);}g.fill();}
      else {g.beginPath();g.arc(cx,28,25*bulk,17,Math.PI,TAU);g.fill();for(let i=0;i<6;i++)g.fillRect(56+i*9,27+(i%2)*2,4,39+i%3*4);}

      // Arms, exposed hands and a compact rifle held across the chest.
      g.fillStyle=cloth;g.strokeStyle='rgba(255,255,255,.13)';
      g.beginPath();g.moveTo(45,88);g.lineTo(25,101);g.lineTo(34,143);g.lineTo(49,136);g.lineTo(54,103);g.closePath();g.fill();g.stroke();
      g.beginPath();g.moveTo(115,88);g.lineTo(135,101);g.lineTo(126,143);g.lineTo(111,136);g.lineTo(106,103);g.closePath();g.fill();g.stroke();
      g.fillStyle=skin;g.beginPath();g.ellipse(48,133,8,9,-.5,0,TAU);g.ellipse(113,132,8,9,.5,0,TAU);g.fill();
      g.save();g.translate(80,123);g.rotate(-.09);g.fillStyle='#070b0e';g.strokeStyle='rgba(255,255,255,.25)';g.lineWidth=1;g.beginPath();g.roundRect(-39,-9,68,18,3);g.fill();g.stroke();g.fillRect(24,-5,38,8);g.fillStyle=spec.color;g.shadowColor=spec.color;g.shadowBlur=9;g.fillRect(-29,-5,21,3);g.shadowBlur=0;g.fillStyle='#11181e';g.beginPath();g.moveTo(-5,8);g.lineTo(7,8);g.lineTo(12,25);g.lineTo(0,25);g.closePath();g.fill();g.restore();

      // Vest panels, pouches and faction light.
      g.fillStyle='rgba(5,9,12,.72)';g.fillRect(55,87,50,29);g.strokeStyle='rgba(255,255,255,.16)';g.strokeRect(55,87,50,29);g.fillRect(50,145,25,14);g.fillRect(85,145,25,14);g.fillStyle=spec.color;g.shadowColor=spec.color;g.shadowBlur=10;g.fillRect(75,91,10,4);g.shadowBlur=0;
      if(body==='heavy'){g.strokeStyle=spec.color;g.lineWidth=4;g.beginPath();g.moveTo(42,84);g.lineTo(25,96);g.moveTo(118,84);g.lineTo(135,96);g.stroke();}
      return c;
    }

    function makeCarSprite(color) {
      const c=document.createElement('canvas');c.width=240;c.height=140;const g=c.getContext('2d');
      g.fillStyle='rgba(0,0,0,.5)';g.beginPath();g.ellipse(120,126,92,10,0,0,TAU);g.fill();
      g.shadowColor=color;g.shadowBlur=28;g.fillStyle=color;g.globalAlpha=.16;g.beginPath();g.ellipse(120,78,104,48,0,0,TAU);g.fill();g.globalAlpha=1;g.shadowBlur=0;
      const body=g.createLinearGradient(34,50,199,118);body.addColorStop(0,'#26353d');body.addColorStop(.42,'#0d151a');body.addColorStop(1,'#03070a');g.fillStyle=body;g.strokeStyle=color;g.lineWidth=3;
      g.beginPath();g.moveTo(25,83);g.lineTo(51,55);g.lineTo(83,37);g.lineTo(157,37);g.lineTo(191,56);g.lineTo(216,83);g.lineTo(207,117);g.lineTo(33,117);g.closePath();g.fill();g.stroke();
      g.fillStyle='#07141c';g.beginPath();g.moveTo(66,57);g.lineTo(89,43);g.lineTo(115,43);g.lineTo(115,68);g.lineTo(57,68);g.closePath();g.fill();g.beginPath();g.moveTo(124,43);g.lineTo(152,43);g.lineTo(177,68);g.lineTo(124,68);g.closePath();g.fill();
      g.strokeStyle='rgba(143,235,255,.38)';g.lineWidth=1;g.strokeRect(78,76,84,27);g.fillStyle='#020507';g.fillRect(83,80,74,18);
      g.fillStyle='#dffeff';g.shadowColor='#fff';g.shadowBlur=16;g.fillRect(39,86,27,12);g.fillRect(174,86,27,12);g.shadowBlur=0;g.fillStyle=color;g.fillRect(94,109,52,4);
      g.fillStyle='#030507';g.beginPath();g.arc(54,116,17,0,TAU);g.arc(186,116,17,0,TAU);g.fill();g.strokeStyle='rgba(255,255,255,.22)';g.beginPath();g.arc(54,116,9,0,TAU);g.arc(186,116,9,0,TAU);g.stroke();
      return c;
    }

    function makePickupSprite(kind) {
      const c=document.createElement('canvas'); c.width=c.height=80; const g=c.getContext('2d');
      const color=kind==='health'?'#ff536d':kind==='ammo'?'#ffbb55':kind==='armor'?'#d8e7e9':'#31f5db';
      g.shadowColor=color;g.shadowBlur=22;g.fillStyle=color;g.globalAlpha=.2;g.beginPath();g.arc(40,40,27,0,TAU);g.fill();g.globalAlpha=1;
      g.strokeStyle=color;g.lineWidth=3;g.beginPath();g.moveTo(40,8);g.lineTo(66,23);g.lineTo(66,55);g.lineTo(40,72);g.lineTo(14,55);g.lineTo(14,23);g.closePath();g.stroke();
      g.fillStyle=color;g.shadowBlur=10;
      if(kind==='health'){g.fillRect(34,23,12,34);g.fillRect(23,34,34,12);}
      else if(kind==='ammo'){g.fillRect(27,25,8,31);g.fillRect(38,21,8,35);g.fillRect(49,25,8,31);}
      else if(kind==='armor'){g.beginPath();g.moveTo(25,22);g.lineTo(55,22);g.lineTo(62,34);g.lineTo(55,59);g.lineTo(40,68);g.lineTo(25,59);g.lineTo(18,34);g.closePath();g.fill();g.fillStyle='#26343a';g.fillRect(31,29,18,30);}
      else {g.beginPath();g.moveTo(40,20);g.lineTo(57,29);g.lineTo(53,51);g.lineTo(40,61);g.lineTo(27,51);g.lineTo(23,29);g.closePath();g.fill();}
      return c;
    }

    function makeAssetVariant(image,type,variant,baseTint=0) {
      const maxH=720,ratio=Math.min(1,maxH/image.height),c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.width*ratio));c.height=Math.max(1,Math.round(image.height*ratio));const g=c.getContext('2d');
      g.save();if(variant===1){g.translate(c.width,0);g.scale(-1,1);}g.drawImage(image,0,0,c.width,c.height);g.restore();
      const tint=Math.max(baseTint,variant===2?.1:0);
      if(tint>0){g.globalCompositeOperation='source-atop';g.fillStyle=ENEMY_TYPES[type].color;g.globalAlpha=tint;g.fillRect(0,0,c.width,c.height);g.globalAlpha=1;g.globalCompositeOperation='source-over';}
      return c;
    }

    function loadHumanEnemyAssets() {
      // Each archetype maps onto one of three body silhouettes; non-classic
      // archetypes get a stronger identity tint so they read at a glance.
      const bodies={scout:'/assets/scout.webp',trooper:'/assets/trooper.webp',heavy:'/assets/heavy.webp'};
      const classic=new Set(['wraith','specter','titan']);
      for(const [type,spec] of Object.entries(ENEMY_TYPES)){
        const image=new Image();image.decoding='async';
        image.onload=()=>{sprites[type]=[0,1,2].map(variant=>makeAssetVariant(image,type,variant,classic.has(type)?0:.16));};
        image.src=bodies[spec.body]||bodies.trooper;
      }
    }

    function makeTintedAsset(image,color,amount=0,flip=false){const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d');g.save();if(flip){g.translate(c.width,0);g.scale(-1,1);}g.drawImage(image,0,0);g.restore();if(amount>0){g.globalCompositeOperation='source-atop';g.globalAlpha=amount;g.fillStyle=color;g.fillRect(0,0,c.width,c.height);g.globalAlpha=1;g.globalCompositeOperation='source-over';}return c;}

    function loadEquipmentAssets(){
      sprites.weapons={};for(const id of ['rifle','shotgun','pistol']){const image=new Image();image.decoding='async';image.onload=()=>{sprites.weapons[id]=image;};image.src=`/assets/fp-${id}.webp`;}
      sprites.carViews={};for(const [view,src] of Object.entries({front:'/assets/interceptor.webp',side:'/assets/interceptor-side.webp',rear:'/assets/interceptor-rear.webp'})){const car=new Image();car.decoding='async';car.onload=()=>{sprites.carViews[view]=CAR_SPAWNS.map((spawn,index)=>makeTintedAsset(car,spawn.color,index? .075:0));sprites.carViews[`${view}Flip`]=CAR_SPAWNS.map((spawn,index)=>makeTintedAsset(car,spawn.color,index? .075:0,true));if(view==='front')sprites.cars=sprites.carViews.front;};car.src=src;}
    }

    function loadWorldMaterials(){const image=new Image();image.decoding='async';image.onload=()=>{const crops=[[0,96,512,300,'#29464a'],[0,0,512,260,'#30284d'],[0,164,512,260,'#59402e']];textures=[null,...crops.map(([sx,sy,sw,sh,tint],index)=>{const c=document.createElement('canvas');c.width=c.height=TEX;const g=c.getContext('2d');g.drawImage(image,sx,sy,sw,sh,0,0,TEX,TEX);g.globalCompositeOperation='source-atop';g.globalAlpha=index===0 ? .08 : .13;g.fillStyle=tint;g.fillRect(0,0,TEX,TEX);g.globalAlpha=1;g.globalCompositeOperation='source-over';const grad=g.createLinearGradient(0,0,TEX,0);grad.addColorStop(0,'rgba(255,255,255,.06)');grad.addColorStop(.48,'rgba(255,255,255,0)');grad.addColorStop(1,'rgba(0,0,0,.16)');g.fillStyle=grad;g.fillRect(0,0,TEX,TEX);return c;}),makeTexture(4)];};image.src='/assets/facility-wall.webp';}

    function initAssets() {
      textures=[null,makeTexture(1),makeTexture(2),makeTexture(3),makeTexture(4)];
      for(const type of Object.keys(ENEMY_TYPES))sprites[type]=[0,1,2].map(variant=>makeEnemySprite(type,variant));
      sprites.cars=CAR_SPAWNS.map(car=>makeCarSprite(car.color));
      sprites.health=makePickupSprite('health'); sprites.ammo=makePickupSprite('ammo'); sprites.shield=makePickupSprite('shield'); sprites.armor=makePickupSprite('armor');
      loadHumanEnemyAssets();loadEquipmentAssets();loadWorldMaterials();
    }

    function resize() {
      const maxW=coarsePointer?820:(lowRenderPreset?640:1080), scale=coarsePointer?.9:(lowRenderPreset?.52:.82);
      canvas.width=Math.max(480,Math.min(maxW,Math.round(innerWidth*scale)));
      canvas.height=Math.max(270,Math.round(canvas.width*(innerHeight/innerWidth)));
      depthBuffer=new Float32Array(canvas.width);
      wallTopBuffer=new Float32Array(canvas.width);
      wallBottomBuffer=new Float32Array(canvas.width);
      player.pitch=Math.max(-canvas.height*.2,Math.min(canvas.height*.2,player.pitch));
    }

    const glassKey=(x,y)=>`${x},${y}`;
    function solidCell(ix,iy){if(ix<0||iy<0||ix>=MAP_W||iy>=MAP_H)return true;const type=map[iy][ix];return type>0&&!(type===4&&state.brokenGlass.has(glassKey(ix,iy)));}
    function isWall(x,y) { return solidCell(Math.floor(x),Math.floor(y)); }
    function canMove(x,y,r=.22) { return !isWall(x-r,y-r)&&!isWall(x+r,y-r)&&!isWall(x-r,y+r)&&!isWall(x+r,y+r); }
    function carBlocked(x,y,r=.24,ignore=-1){return state.cars.some((car,index)=>!car.destroyed&&index!==ignore&&Math.hypot(car.x-x,car.y-y)<r+.58);}
    function blocksAt(x,y,z){const ix=Math.floor(x),iy=Math.floor(y);if(ix<0||iy<0||ix>=MAP_W||iy>=MAP_H)return true;const type=map[iy][ix];if(!solidCell(ix,iy))return false;const boundary=ix===0||iy===0||ix===MAP_W-1||iy===MAP_H-1,height=boundary?2.55:(WALL_HEIGHTS[type]||1);return z<=height;}
    function canMovePlayer(x,y,r=.24) { return !blocksAt(x-r,y-r,player.z)&&!blocksAt(x+r,y-r,player.z)&&!blocksAt(x-r,y+r,player.z)&&!blocksAt(x+r,y+r,player.z)&&(player.z>1.12||!carBlocked(x,y,r)); }
    function canMoveEnemy(e,x,y,r){return !blocksAt(x-r,y-r,e.z)&&!blocksAt(x+r,y-r,e.z)&&!blocksAt(x-r,y+r,e.z)&&!blocksAt(x+r,y+r,e.z)&&!carBlocked(x,y,r);}
    function canMoveVehicle(x,y,index){return canMove(x,y,.58)&&!carBlocked(x,y,.58,index);}
    function stairHeight(x,y){for(const stair of STAIR_ZONES)if(x>=stair.x1&&x<=stair.x2&&y>=stair.y1&&y<=stair.y2){let t=(y-stair.y1)/(stair.y2-stair.y1);if(stair.reverse)t=1-t;return GROUND_HEIGHT+t*.82;}return null;}
    function surfaceHeight(x,y) { const stair=stairHeight(x,y);if(stair!==null)return stair;const ix=Math.floor(x),iy=Math.floor(y),type=ix>=0&&iy>=0&&ix<MAP_W&&iy<MAP_H?map[iy][ix]:0;return ix>0&&iy>0&&ix<MAP_W-1&&iy<MAP_H-1&&solidCell(ix,iy)&&type!==4?(WALL_HEIGHTS[type]||1)+.06:GROUND_HEIGHT; }
    function normAngle(a) { while(a>Math.PI)a-=TAU; while(a<-Math.PI)a+=TAU; return a; }

    function castRay(angle, ox=player.x, oy=player.y, maxDistance=40, rayHeight=GROUND_HEIGHT) {
      const dx=Math.cos(angle),dy=Math.sin(angle); let mx=Math.floor(ox),my=Math.floor(oy);
      const ddx=Math.abs(1/(Math.abs(dx)<1e-8?1e-8:dx)), ddy=Math.abs(1/(Math.abs(dy)<1e-8?1e-8:dy));
      const sx=dx<0?-1:1, sy=dy<0?-1:1;
      let sdx=dx<0?(ox-mx)*ddx:(mx+1-ox)*ddx, sdy=dy<0?(oy-my)*ddy:(my+1-oy)*ddy, side=0;
      let hitHeight=1;
      while(true){
        if(sdx<sdy){sdx+=ddx;mx+=sx;side=0;}else{sdy+=ddy;my+=sy;side=1;}
        if(mx<0||my<0||mx>=MAP_W||my>=MAP_H) return {dist:maxDistance,type:1,texX:0,side};
        const cell=map[my][mx],boundary=mx===0||my===0||mx===MAP_W-1||my===MAP_H-1;hitHeight=boundary?2.55:(WALL_HEIGHTS[cell]||1);if(solidCell(mx,my)&&rayHeight<=hitHeight) break;
        const approx=Math.min(sdx,sdy); if(approx>maxDistance)return {dist:maxDistance,type:0,texX:0,side};
      }
      let dist=side===0?(mx-ox+(1-sx)/2)/dx:(my-oy+(1-sy)/2)/dy; dist=Math.abs(dist);
      let wx=side===0?oy+dist*dy:ox+dist*dx; wx-=Math.floor(wx);
      let tx=Math.floor(wx*TEX); if((side===0&&dx>0)||(side===1&&dy<0))tx=TEX-tx-1;
      return {dist,type:map[my][mx],texX:tx,side,height:hitHeight,cellX:mx,cellY:my};
    }

    function breakGlassInDirection(angle,maxDistance=40){
      const dx=Math.cos(angle),dy=Math.sin(angle);for(let d=.1;d<maxDistance;d+=.08){const x=player.x+dx*d,y=player.y+dy*d,ix=Math.floor(x),iy=Math.floor(y);if(ix<0||iy<0||ix>=MAP_W||iy>=MAP_H)return false;const type=map[iy][ix];if(type===4&&!state.brokenGlass.has(glassKey(ix,iy))){state.brokenGlass.add(glassKey(ix,iy));for(let i=0;i<22;i++)state.particles.push({x,y,z:.35+Math.random()*1.3,vx:(Math.random()-.5)*3.2,vy:(Math.random()-.5)*3.2,vz:.5+Math.random()*2.4,gravity:5.8,life:.45+Math.random()*.35,max:.8,color:i%3?'#bcefff':'#ffffff'});audio?.glass?.();showMessage('GLASS SHATTERED');return true;}if(type>0&&type!==4)return false;}return false;
    }

    function lineOfSight(ax,ay,bx,by,rayHeight=GROUND_HEIGHT) {
      const dx=bx-ax,dy=by-ay,dist=Math.hypot(dx,dy); return castRay(Math.atan2(dy,dx),ax,ay,dist+.2,rayHeight).dist>dist-.22;
    }

    function findPath(sx,sy,tx,ty) {
      sx=Math.floor(sx);sy=Math.floor(sy);tx=Math.floor(tx);ty=Math.floor(ty);
      const key=(x,y)=>y*MAP_W+x, start=key(sx,sy), goal=key(tx,ty), q=[start], came=new Int16Array(MAP_W*MAP_H); came.fill(-1); came[start]=start;
      const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
      for(let qi=0;qi<q.length;qi++){
        const cur=q[qi]; if(cur===goal)break; const x=cur%MAP_W,y=(cur/MAP_W)|0;
        for(const [dx,dy] of dirs){const nx=x+dx,ny=y+dy,nk=key(nx,ny);if(nx>0&&ny>0&&nx<MAP_W-1&&ny<MAP_H-1&&map[ny][nx]===0&&came[nk]===-1){came[nk]=cur;q.push(nk);}}
      }
      if(came[goal]===-1)return [];
      const path=[];let cur=goal;while(cur!==start&&path.length<60){path.push([cur%MAP_W+.5,((cur/MAP_W)|0)+.5]);cur=came[cur];}path.reverse();return path;
    }

    function weaponConfig(){return WEAPONS[player.weaponIndex]||WEAPONS[0];}
    function equipWeapon(index,silent=false){
      if(!silent&&state.mode!=='playing')return;
      const wrapped=(index+WEAPONS.length)%WEAPONS.length;
      if(!weaponUnlocked(wrapped)){if(!silent)showMessage(`${WEAPONS[wrapped].short} LOCKED // ${WEAPONS[wrapped].unlock?.label||'CAREER MILESTONE'}`);return;}
      if(state.mode==='playing'&&player.weaponSlots[player.weaponIndex])Object.assign(player.weaponSlots[player.weaponIndex],{ammo:player.ammo,reserve:player.reserve});
      player.weaponIndex=wrapped;const cfg=weaponConfig(),slot=player.weaponSlots[player.weaponIndex];
      player.ammo=slot.ammo;player.reserve=slot.reserve;player.magSize=cfg.mag;player.reloadTime=cfg.reload;player.reloading=false;player.reloadTimer=0;player.fireCooldown=Math.max(player.fireCooldown,.16);player.spread=0;
      if(!silent){audio?.weaponSwitch();rumble(.08,.12,35);showMessage(`${cfg.name} // ${cfg.mode}`);}
    }
    function cycleWeapon(direction=1){
      if(state.mode!=='playing')return;
      for(let step=1;step<=WEAPONS.length;step++){const index=(player.weaponIndex+direction*step+WEAPONS.length*step)%WEAPONS.length;if(weaponUnlocked(index)){equipWeapon(index);return;}}
    }

    function resetPlayer() {
      Object.assign(player,{x:11.5,y:18.5,z:GROUND_HEIGHT,vz:0,dir:-Math.PI/2,pitch:0,health:100,shield:50,armor:100,shieldDelay:0,ammo:30,reserve:120,fireCooldown:0,reloading:false,reloadTimer:0,spread:0,recoil:0,bob:0,bobAmount:0,score:0,kills:0,combo:1,comboTimer:0,hurtTimer:0,alive:true,shots:0,hits:0,grounded:true,jetFuel:100,jetting:false,ads:0,stepTimer:0,jetSoundTimer:0,weaponIndex:0,weaponSlots:WEAPONS.map(cfg=>({ammo:cfg.mag,reserve:cfg.reserve})),carIndex:-1,gamepadAimValue:0,moveVx:0,moveVy:0});
      equipWeapon(0,true);
    }

    function setOperation(index,persist=true){
      const selected=OPERATIONS[index]?index:0,op=OPERATIONS[selected];state.operation=selected;
      document.querySelectorAll('[data-operation]').forEach(button=>button.classList.toggle('active',Number(button.dataset.operation)===selected));
      const deploy=$('deployButton');if(deploy)deploy.textContent=`Launch ${op.name.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}`;
      const brief=$('operationTagline');if(brief)brief.textContent=op.tagline;
      if(persist){try{localStorage.setItem('neon-breach-operation',String(selected));}catch{}}
    }

    function setMissionTime(time,persist=true){
      const selected=MISSION_CONDITIONS[time]?time:'day',condition=MISSION_CONDITIONS[selected];state.timeOfDay=selected;$('startScreen').dataset.time=selected;
      document.querySelectorAll('[data-time]').forEach(button=>button.classList.toggle('active',button.dataset.time===selected));$('missionClock').textContent=condition.clock;$('missionCondition').textContent=condition.condition;$('missionBriefText').textContent=condition.brief;
      if(persist){try{localStorage.setItem('neon-breach-time',selected);}catch{}}
    }

    function setAutoLock(enabled,persist=true,announce=true){
      state.autoLock=!!enabled;if(!state.autoLock)state.lockTarget=null;const menuButton=$('autoLockButton'),touchButton=$('lockButton'),badge=$('lockModeBadge');
      if(menuButton){menuButton.classList.toggle('active',state.autoLock);menuButton.setAttribute('aria-pressed',String(state.autoLock));menuButton.textContent=`AUTO LOCK // ${state.autoLock?'ON':'OFF'}`;}
      if(touchButton){touchButton.classList.toggle('active',state.autoLock);touchButton.setAttribute('aria-pressed',String(state.autoLock));touchButton.innerHTML=`LOCK<br>${state.autoLock?'ON':'OFF'}`;}
      if(badge){badge.classList.toggle('active',state.autoLock);badge.textContent=`AUTO LOCK // ${state.autoLock?'ON':'OFF'} · L1 / T`;}
      if(persist){try{localStorage.setItem('neon-breach-auto-lock',state.autoLock?'on':'off');}catch{}}
      if(announce&&state.mode==='playing'){showMessage(`AUTO LOCK ${state.autoLock?'ENABLED':'DISABLED'} // L1 OR T`);rumble(.12,.2,55);}
    }
    function toggleAutoLock(){setAutoLock(!state.autoLock);}

    function setGore(enabled,persist=true){
      state.gore=!!enabled;const button=$('goreButton');if(button){button.classList.toggle('active',state.gore);button.setAttribute('aria-pressed',String(state.gore));button.textContent=`GORE // ${state.gore?'ON':'REDUCED'}`;}
      if(!state.gore){state.bloodDecals=[];state.particles=state.particles.filter(p=>p.color!=='#6f0711'&&p.color!=='#d62936');}
      if(persist){try{localStorage.setItem('neon-breach-gore',state.gore?'on':'off');}catch{}}
    }
    function toggleGore(){setGore(!state.gore);if(state.mode==='playing')showMessage(`COMBAT EFFECTS // ${state.gore?'FULL':'REDUCED'}`);}

    function startGame(saved=null) {
      if(!audio) audio=new AudioSystem(()=>state.muted); audio?.resume(); audio?.startHum();
      if(saved){state.difficulty=DIFFICULTIES[saved.difficulty]?saved.difficulty:state.difficulty;setMissionTime(saved.time_of_day||state.timeOfDay,false);document.querySelectorAll('[data-difficulty]').forEach(button=>button.classList.toggle('active',button.dataset.difficulty===state.difficulty));setOperation(Math.max(0,Math.min(OPERATIONS.length-1,Number(saved.operation||0))),false);}
      const stages=missionStages();
      const resumeStage=saved?Math.max(0,Math.min(stages.length-1,Number(saved.wave||1)-1)):0;
      resetPlayer(); Object.assign(state,{mode:'playing',wave:resumeStage+1,wavePhase:'mission',waveTimer:0,pending:[],spawnTimer:0,initialWaveCount:1,enemies:[],projectiles:[],pickups:[],particles:[],corpses:[],bloodDecals:[],brokenGlass:new Set(),cars:CAR_SPAWNS.map((car,index)=>({...car,index,occupied:false,speed:0,hp:100,maxHp:100,boost:100,engineTimer:0,steer:0,groundOffset:0})),totalTime:saved?Number(saved.elapsed_seconds||0):0,announcementTimer:0,messageTimer:0,screenShake:0,muzzle:0,melee:0,musicTimer:.2,musicStep:0,slowMo:0,eliteSpawned:false,objective:stages[resumeStage].objective,objectiveTarget:[...stages[resumeStage].target],missionStage:resumeStage,missionHold:stages[resumeStage].hold||22,missionSpawnStep:0,missionProgress:0,commsTimer:0,commander:null,extractionArmed:false,tutorialStep:saved?2:0,threatPulse:0,takedowns:saved?Number(saved.takedowns||0):0,roadkills:saved?Number(saved.roadkills||0):0,shieldFlash:0,armorFlash:0,squadAlert:0,lockTarget:null});
      if(saved){player.health=Math.max(1,Number(saved.health||100));player.shield=Math.max(0,Number(saved.shield??50));player.armor=Math.max(0,Number(saved.armor??100));player.score=Number(saved.score||0);player.kills=Number(saved.kills||0);player.shots=Number(saved.shots||0);player.hits=Number(saved.hits||0);equipWeapon(Number(saved.weapon_index||0),true);campaignCloud.id=Number(saved.id);}else campaignCloud.id=null;
      applyPerks(!saved);
      $('startScreen').classList.add('hidden'); $('modalScreen').classList.add('hidden'); $('hud').classList.remove('hidden');
      if(coarsePointer)$('touchControls').classList.remove('hidden'); else requestLock();
      beginOperation(resumeStage,!!saved);updateHUD();campaignCloud.saveTimer=12;saveCampaign('active',true);
    }

    function requestLock(){ if(document.pointerLockElement===canvas)return;try{canvas.requestPointerLock?.()?.catch?.(()=>{});}catch{} }
    function pauseGame(){ if(state.mode!=='playing')return;saveCampaign('active',true);state.mode='paused';input.fire=input.shiftFire=input.pointerFire=input.aim=input.jump=false;$('modalEyebrow').textContent='SIMULATION SUSPENDED';$('modalTitle').textContent='PAUSED';$('modalText').textContent='Position secured. Campaign progress is being synchronized.';$('resultGrid').classList.add('hidden');$('resumeButton').textContent='Resume operation';$('quitButton').classList.remove('hidden');$('modalScreen').classList.remove('hidden');$('touchControls').classList.add('hidden'); }
    function resumeGame(){ if(state.mode!=='paused')return;state.mode='playing';$('modalScreen').classList.add('hidden');if(coarsePointer)$('touchControls').classList.remove('hidden');else requestLock();state.lastTime=performance.now(); }
    function returnToTitle(){ if(state.mode==='playing'||state.mode==='paused')saveCampaign('active',true);state.mode='menu';document.exitPointerLock?.();$('modalScreen').classList.add('hidden');$('hud').classList.add('hidden');$('touchControls').classList.add('hidden');$('startScreen').classList.remove('hidden');$('shieldFx').style.opacity='0';$('armorFx').style.opacity='0';$('damageFlash').style.opacity='0';input.fire=input.shiftFire=input.pointerFire=input.aim=input.jump=false;loadCampaignRecords(); }

    function endGame(victory=false){
      state.mode=victory?'victory':'gameover';player.alive=false;input.fire=input.shiftFire=input.pointerFire=input.aim=input.jump=false;document.exitPointerLock?.();$('touchControls').classList.add('hidden');
      const op=currentOp();
      $('modalEyebrow').textContent=victory?'ARES COMMAND // MISSION COMPLETE':'ARES UNIT OFFLINE';$('modalTitle').textContent=victory?`${op.name} COMPLETE`:'OPERATION FAILED';
      const accuracy=player.shots?Math.round(player.hits/player.shots*100):0,minutes=Math.floor(state.totalTime/60),seconds=Math.floor(state.totalTime%60),isBest=saveBestScore(player.score);
      $('modalText').textContent=victory?`${op.debriefVictory} Unit 07 extracted in ${minutes}:${String(seconds).padStart(2,'0')}.${isBest?' New best mission record.':''}`:`Unit 07 was lost during ${missionStages()[state.missionStage]?.title||op.name}. Recalibrate and return to the operation.${isBest?' New best mission record.':''}`;
      const gradePoints=(accuracy>=55?2:accuracy>=38?1:0)+(player.health>=65?2:player.health>=30?1:0)+(state.totalTime<480?2:state.totalTime<720?1:0)+(player.kills>=16?2:player.kills>=10?1:0),grade=victory?(gradePoints>=7?'S':gradePoints>=5?'A':gradePoints>=3?'B':'C'):'D';$('resultScore').textContent=player.score.toLocaleString();$('resultKills').textContent=player.kills;$('resultAccuracy').textContent=`${accuracy}%`;$('resultTime').textContent=`${minutes}:${String(seconds).padStart(2,'0')}`;$('resultGrade').textContent=grade;
      $('resultGrid').classList.remove('hidden');$('resumeButton').textContent='Run simulation again';$('quitButton').classList.remove('hidden');$('modalScreen').classList.remove('hidden');saveCampaign(victory?'victory':'failed',true);
    }

    function showComms(speaker,text,duration=4.4){const panel=$('missionComms');panel.querySelector('b').textContent=speaker;panel.querySelector('span').textContent=text;panel.classList.add('show');state.commsTimer=duration;}

    function spawnStorySquad(entries){for(const [type,x,y,options] of entries)spawnEnemy(type,[x,y],options||{});state.initialWaveCount=Math.max(1,state.enemies.length);}

    function currentOp(){return OPERATIONS[state.operation]||OPERATIONS[0];}
    function missionStages(){return currentOp().stages;}

    function spawnMissionSquad(def){
      if(def.squad?.length){spawnStorySquad(def.squad);if(def.type==='hvt')state.commander=state.enemies.find(e=>e.commander)||null;}
    }

    function beginOperation(stage=0,resumed=false){
      const op=currentOp(),def=op.stages[stage];
      state.missionStage=stage;state.wave=stage+1;state.wavePhase='mission';state.objective=def.objective;state.objectiveTarget=[...def.target];
      if(def.type==='defend'){state.missionHold=def.hold;state.missionSpawnStep=0;}
      showAnnouncement(resumed?'MISSION RESTORED':`OPERATION ${op.name}`,`${MISSION_CONDITIONS[state.timeOfDay].label} // ${def.title}`,2.4);showComms('ARES COMMAND',resumed?`Link restored. Resume phase ${stage+1}: ${def.objective.toLowerCase()}.`:def.comms,5.4);
      spawnMissionSquad(def);
    }

    function setMissionStage(stage){
      const stages=missionStages();
      if(stage<0||stage>=stages.length||stage===state.missionStage)return;const def=stages[stage];
      state.missionStage=stage;state.wave=stage+1;state.missionProgress=0;state.objective=def.objective;state.objectiveTarget=[...def.target];
      if(def.type==='defend'){state.missionHold=def.hold;state.missionSpawnStep=0;}
      audio?.wave();showAnnouncement(def.title,def.objective,2.2);showComms('ARES COMMAND',def.comms,5.2);player.shield=Math.min(player.maxShield,player.shield+12);player.armor=Math.min(player.maxArmor,player.armor+8);player.reserve=Math.min(Math.ceil(weaponConfig().reserve*1.5),player.reserve+Math.ceil(weaponConfig().mag*.6));
      spawnMissionSquad(def);
      saveCampaign('active',true);
    }

    function advanceMission(){setMissionStage(state.missionStage+1);}

    function updateMission(dt){
      const def=missionStages()[state.missionStage];if(!def)return;
      const target=state.objectiveTarget||def.target,dist=Math.hypot(target[0]-player.x,target[1]-player.y);
      if(def.type==='reach'){
        state.missionProgress=Math.max(0,1-dist/(def.range||16));
        if(dist<(def.radius||1.45))advanceMission();
        else if(def.tutorial&&!state.tutorialStep&&state.totalTime>5){state.tutorialStep=1;showComms('TACTICAL LINK','PS5: left stick moves, right stick looks, L2 aims, R2 fires, L1 toggles auto-lock, and Square reloads.',6);}
      }else if(def.type==='defend'){
        const holding=dist<(def.radius||2.25);if(holding)state.missionHold=Math.max(0,state.missionHold-dt);state.missionProgress=1-state.missionHold/def.hold;
        const reinforcements=def.reinforcements||[];
        if(state.missionSpawnStep<reinforcements.length&&state.missionHold<=reinforcements[state.missionSpawnStep].at){spawnStorySquad(reinforcements[state.missionSpawnStep].squad);state.missionSpawnStep++;showComms('ARES COMMAND',`Transfer ${Math.round(state.missionProgress*100)} percent. New hostiles entering the district.`,3.6);}
        if(!holding&&state.missionHold<def.hold-.5&&state.messageTimer<=0)showMessage('OBJECTIVE PAUSED // RETURN TO THE MARKED ZONE');if(state.missionHold<=0)advanceMission();
      }else if(def.type==='hvt'){
        const boss=state.commander&&!state.commander.dead?state.commander:state.enemies.find(e=>e.commander&&!e.dead);
        if(boss){
          state.commander=boss;state.objectiveTarget=[boss.x,boss.y];state.missionProgress=1-boss.hp/boss.maxHp;
          // Multi-phase escalation: each phase fires once as the boss's health
          // crosses its threshold — announcement, reinforcements, and rage buffs.
          const phases=def.boss?.phases||[];boss.phase=boss.phase||0;
          while(boss.phase<phases.length&&boss.hp/boss.maxHp<=phases[boss.phase].at){
            const phase=phases[boss.phase];boss.phase++;
            boss.rage=phase.speedMult||boss.rage||1;boss.rageFire=phase.fireMult||boss.rageFire||1;
            boss.suppression=0;boss.reactionTimer=0;if(boss.grounded&&ENEMY_TYPES[boss.type].charge){boss.chargeTimer=.8;boss.chargeCooldown=3;}
            if(phase.summon?.length)spawnStorySquad(phase.summon);
            showAnnouncement(phase.announce||'HVT ESCALATION',phase.sub||'HOSTILE REINFORCEMENTS INBOUND',2);
            if(phase.comms)showComms('ARES COMMAND',phase.comms,4);
            audio?.elite();state.screenShake=Math.max(state.screenShake,.85);rumble(.6,.85,180);
          }
        }
        else if(!state.enemies.some(e=>e.commander&&!e.dead))advanceMission();
      }else if(def.type==='extract'){
        if(player.carIndex>=0&&!state.extractionArmed){state.extractionArmed=true;state.objective=def.armObjective;state.objectiveTarget=[...def.beacon];showAnnouncement('EXTRACTION ROUTE',def.armAnnounce||'FOLLOW THE BEACON // BOOST AUTHORIZED',1.7);showComms('ARES COMMAND',def.armComms,4.2);}
        const extractionDist=Math.hypot(state.objectiveTarget[0]-player.x,state.objectiveTarget[1]-player.y);state.missionProgress=state.extractionArmed?Math.max(.35,1-extractionDist/15):.18;
        if(state.extractionArmed&&player.carIndex>=0&&extractionDist<1.55){state.wavePhase='complete';state.waveTimer=2.5;state.missionProgress=1;showAnnouncement('MISSION COMPLETE','UNIT 07 // EXTRACTION CONFIRMED',2.4);showComms('ARES COMMAND',currentOp().debriefComms,4.5);}
      }
    }

    function startWave(){
      state.wave++;state.wavePhase='active';state.pending=[...WAVE_TABLE[state.wave-1]];state.initialWaveCount=state.pending.length;state.spawnTimer=.25;state.eliteSpawned=false;state.objective=MISSIONS[state.wave-1].objective;
      audio?.wave();showAnnouncement(MISSIONS[state.wave-1].title,state.objective,2.4);
    }

    function completeWave(){
      if(state.wave>=5){state.wavePhase='complete';state.waveTimer=2.6;showAnnouncement('GRID CLEAR','HOSTILE SIGNAL COLLAPSING',2.3);return;}
      state.wavePhase='between';state.waveTimer=4;player.shield=Math.min(player.maxShield,player.shield+18);player.armor=Math.min(player.maxArmor,player.armor+14);player.reserve=Math.min(Math.ceil(weaponConfig().reserve*1.5),player.reserve+Math.max(8,weaponConfig().mag));
      showAnnouncement('SECTOR CLEAR',`BREACH 0${state.wave+1} INBOUND // PROGRESS SAVED`,2.4);saveCampaign('active',true);
    }

    function spawnEnemy(type,forcedPos=null,options={}){
      let choices=spawns.map(p=>({p,d:Math.hypot(p[0]-player.x,p[1]-player.y)})).filter(o=>o.d>6).sort((a,b)=>b.d-a.d);
      const pool=choices.slice(0,Math.max(2,Math.ceil(choices.length*.65))); const pos=forcedPos||(pool[(Math.random()*pool.length)|0]||{p:spawns[0]}).p, spec=ENEMY_TYPES[type], diff=DIFFICULTIES[state.difficulty];
      const elite=options.elite??(state.wavePhase!=='mission'&&!state.eliteSpawned&&type===MISSIONS[state.wave-1]?.elite);if(elite){state.eliteSpawned=true;audio?.elite();showMessage(options.commander?'COMMANDER VOSS ENTERED THE GRID':`ELITE ${spec.name} ENTERED THE GRID`);}
      const maxHp=spec.hp*diff.enemyHealth*(elite?1.62:1),x=pos[0]+(forcedPos?0:(Math.random()-.5)*.35),y=pos[1]+(forcedPos?0:(Math.random()-.5)*.35),magazineSize=spec.magazine??12;state.enemies.push({type,variant:(Math.random()*3)|0,x,y,z:GROUND_HEIGHT,vz:0,grounded:true,jumpCooldown:.7+Math.random()*1.4,landingSquash:0,hp:maxHp,maxHp,fireCooldown:1+Math.random(),meleeCooldown:0,path:[],pathTimer:0,anim:Math.random()*TAU,hitFlash:0,dead:false,spawn:1,elite,commander:!!options.commander,dodgeTimer:0,dashCooldown:1.5+Math.random()*2,chargeTimer:0,chargeCooldown:2+Math.random()*2,flank:Math.random()<.5?-1:1,vx:0,vy:0,facing:Math.random()*TAU,awareness:options.commander?1:0,hadSight:false,reactionTimer:options.commander?.18:.45+Math.random()*.45,decisionTimer:.2+Math.random()*.35,combatState:options.commander?'hold':'patrol',lastSeenX:player.x,lastSeenY:player.y,tacticalTarget:null,patrolTarget:null,suppression:0,burstShots:2+((Math.random()*3)|0),magazineSize,rounds:magazineSize,reloadTimer:0,coverTimer:-1,peekTimer:0,searchTimer:.8,searchAngle:Math.random()*TAU,stuckTimer:0,lastMoveX:x,lastMoveY:y,role:options.commander?'assault':spec.role||'assault'});
    }

    function toggleVehicle(){
      if(state.mode!=='playing')return;
      if(player.carIndex>=0){
        const car=state.cars[player.carIndex],offsets=[Math.PI/2,-Math.PI/2,Math.PI,0];let exit=null;
        for(const angle of offsets){const x=car.x+Math.cos(car.dir+angle)*1.05,y=car.y+Math.sin(car.dir+angle)*1.05;if(canMove(x,y,.25)&&!carBlocked(x,y,.25,player.carIndex)){exit={x,y};break;}}
        if(!exit){showMessage('EXIT BLOCKED');return;}player.x=exit.x;player.y=exit.y;player.z=GROUND_HEIGHT;player.carIndex=-1;car.occupied=false;audio?.vehicle();showMessage('EXITED ARES INTERCEPTOR');rumble(.12,.18,60);return;
      }
      let nearest=-1,best=1.5;for(let i=0;i<state.cars.length;i++){const car=state.cars[i],dist=Math.hypot(car.x-player.x,car.y-player.y);if(!car.destroyed&&!car.occupied&&dist<best){best=dist;nearest=i;}}
      if(nearest<0){showMessage('MOVE CLOSER TO A VEHICLE');return;}const car=state.cars[nearest];car.occupied=true;player.carIndex=nearest;player.x=car.x;player.y=car.y;player.z=.62;player.vz=0;player.grounded=true;player.dir=car.dir;audio?.vehicle();showMessage('ARES INTERCEPTOR ONLINE // △ TO EXIT');rumble(.16,.25,90);
    }

    function meleeTakedown(){
      if(state.mode!=='playing'||player.carIndex>=0||state.melee>0)return;let target=null,best=1.58;
      for(const enemy of state.enemies){if(enemy.dead||enemy.spawn>0)continue;const dx=enemy.x-player.x,dy=enemy.y-player.y,dist=Math.hypot(dx,dy),angle=Math.abs(normAngle(Math.atan2(dy,dx)-player.dir));if(dist<best&&angle<.76&&lineOfSight(player.x,player.y,enemy.x,enemy.y,player.z)){target=enemy;best=dist;}}
      if(!target){state.melee=.55;audio?.melee();showMessage('NO TARGET IN FINISHER RANGE');return;}
      const angle=Math.atan2(target.y-player.y,target.x-player.x);player.dir=angle;if(best>1.02){const lunge=Math.min(.42,best-.86),nx=player.x+Math.cos(angle)*lunge,ny=player.y+Math.sin(angle)*lunge;if(canMovePlayer(nx,ny,.24)){player.x=nx;player.y=ny;}}
      state.melee=1;state.slowMo=.5;state.screenShake=1;state.takedowns++;target.hp=0;audio?.melee();rumble(1,1,210);killEnemy(target,true,'takedown');player.score+=175;$('takedownFlash').style.opacity='.95';setTimeout(()=>$('takedownFlash').style.opacity='0',180);showAnnouncement('FINISHER',`${ENEMY_TYPES[target.type].name} NEUTRALIZED // +175`,.9);
    }

    function deadzone(value,zone=.16){const magnitude=Math.abs(value);return magnitude<=zone?0:Math.sign(value)*(magnitude-zone)/(1-zone);}
    function rumble(strong=.25,weak=.35,duration=55){
      const actuator=activeGamepad?.vibrationActuator;if(!actuator?.playEffect)return;
      try{actuator.playEffect('dual-rumble',{duration,strongMagnitude:strong,weakMagnitude:weak});}catch{}
    }
    function updateGamepad(dt){
      const pads=navigator.getGamepads?.()||[],pad=Array.from(pads).find(Boolean)||null,status=$('controllerStatus');activeGamepad=pad;
      status?.classList.toggle('connected',!!pad);if(status)status.textContent=pad?`${/dualsense|wireless controller/i.test(pad.id)?'DUALSENSE':'GAMEPAD'} // ONLINE`:'DUALSENSE // SCANNING';
      if(!pad){controllerAxis={x:0,y:0};input.gamepadFire=input.gamepadAim=input.gamepadJump=input.gamepadSprint=false;input.gamepadAimValue=0;gamepadPrevious=[];return;}
      const down=pad.buttons.map(button=>button.pressed||button.value>.5),pressed=index=>down[index]&&!gamepadPrevious[index];
      if(pressed(9)){if(state.mode==='menu')startGame();else if(state.mode==='playing')pauseGame();else if(state.mode==='paused')resumeGame();}
      if(pressed(4))toggleAutoLock();
      if(state.mode!=='playing'){controllerAxis={x:0,y:0};input.gamepadFire=input.gamepadAim=input.gamepadJump=input.gamepadSprint=false;input.gamepadAimValue=0;gamepadPrevious=down;return;}
      controllerAxis={x:deadzone(pad.axes[0]||0),y:deadzone(pad.axes[1]||0)+(down[13]?1:0)-(down[12]?1:0)};
      const lookX=deadzone(pad.axes[2]||0,.12),lookY=deadzone(pad.axes[3]||0,.12);if(player.carIndex>=0)state.cars[player.carIndex].dir=normAngle(state.cars[player.carIndex].dir+lookX*1.8*dt);else player.dir=normAngle(player.dir+lookX*2.65*dt);player.pitch=Math.max(-canvas.height*.2,Math.min(canvas.height*.2,player.pitch-lookY*canvas.height*.75*dt));
      input.gamepadFire=!!down[7];input.gamepadAimValue=pad.buttons[6]?.value||0;input.gamepadAim=input.gamepadAimValue>.08;input.gamepadJump=!!down[0];input.gamepadSprint=!!down[10];
      if(pressed(0)&&player.carIndex<0)startJump();if(pressed(2))reload();if(pressed(3)||(pressed(1)&&player.carIndex>=0))toggleVehicle();if(pressed(11))meleeTakedown();if(pressed(5)&&player.carIndex<0)cycleWeapon(1);if(pressed(14))cycleWeapon(-1);if(pressed(15))cycleWeapon(1);gamepadPrevious=down;
    }

    function update(dt){
      if(state.mode!=='playing')return;
      const realDt=dt;state.totalTime+=realDt;state.slowMo=Math.max(0,state.slowMo-realDt);dt*=state.slowMo>0?.28:1;state.muzzle=Math.max(0,state.muzzle-dt*9);state.melee=Math.max(0,state.melee-dt*3.5);state.screenShake=Math.max(0,state.screenShake-dt*12);state.threatPulse=Math.max(0,state.threatPulse-dt);state.shieldFlash=Math.max(0,state.shieldFlash-dt*4.8);state.armorFlash=Math.max(0,state.armorFlash-dt*3.5);player.hurtTimer=Math.max(0,player.hurtTimer-dt);
      campaignCloud.saveTimer-=realDt;if(campaignCloud.saveTimer<=0){campaignCloud.saveTimer=15;saveCampaign('active');}
      state.musicTimer-=realDt;if(state.musicTimer<=0){audio?.musicBeat(state.musicStep++,Math.min(1,(state.enemies.length+state.pending.length)/8),Math.max(1,state.wave));state.musicTimer=.24;}
      if(state.announcementTimer>0){state.announcementTimer-=dt;if(state.announcementTimer<=0)$('announcement').classList.remove('show');}
      if(state.messageTimer>0){state.messageTimer-=dt;if(state.messageTimer<=0)$('message').classList.remove('show');}
      if(state.commsTimer>0){state.commsTimer-=dt;if(state.commsTimer<=0)$('missionComms').classList.remove('show');}
      if(state.wavePhase==='mission')updateMission(dt);
      else if(state.wavePhase==='complete'){state.waveTimer-=dt;if(state.waveTimer<=0)endGame(true);}
      else if(state.wavePhase==='active'){
        if(state.pending.length){state.spawnTimer-=dt;if(state.spawnTimer<=0){spawnEnemy(state.pending.shift());state.spawnTimer=.62;}}
        else if(state.enemies.length===0)completeWave();
      }
      updatePlayer(dt);updateEnemies(dt);updateProjectiles(dt);updatePickups(dt);updateParticles(dt);updateHUD();
    }

    function selectAutoLockTarget(firing=false){
      const existing=state.lockTarget;if(existing&&!existing.dead&&existing.spawn<=0){const dist=Math.hypot(existing.x-player.x,existing.y-player.y),angle=Math.abs(normAngle(Math.atan2(existing.y-player.y,existing.x-player.x)-player.dir));if(dist<19&&angle<.4&&lineOfSight(player.x,player.y,existing.x,existing.y,player.z))return existing;}
      const cone=firing?.38:(player.ads>.25?.3:.24);let target=null,best=cone;for(const enemy of state.enemies){if(enemy.dead||enemy.spawn>0)continue;const dist=Math.hypot(enemy.x-player.x,enemy.y-player.y);if(dist>22)continue;const angle=Math.abs(normAngle(Math.atan2(enemy.y-player.y,enemy.x-player.x)-player.dir)),score=angle*(1+dist*.012)+dist*.0007;if(score<best&&lineOfSight(player.x,player.y,enemy.x,enemy.y,player.z)){best=score;target=enemy;}}return target;
    }
    function updateAutoLock(dt){
      const firing=input.fire||input.gamepadFire,engaging=player.carIndex<0&&(input.aim||input.gamepadAim||firing);if(!state.autoLock||!engaging){state.lockTarget=null;return;}const target=selectAutoLockTarget(firing);state.lockTarget=target;if(!target)return;
      const desired=Math.atan2(target.y-player.y,target.x-player.x),delta=normAngle(desired-player.dir),turnRate=firing?11.5:6.8,maxTurn=turnRate*dt;player.dir=normAngle(player.dir+Math.max(-maxTurn,Math.min(maxTurn,delta)));
    }

    function updatePlayer(dt){
      const previousX=player.x,previousY=player.y;player.fireCooldown=Math.max(0,player.fireCooldown-dt);player.recoil=Math.max(0,player.recoil-dt*8);player.spread=Math.max(0,player.spread-dt*1.8);const shieldBefore=player.shield;player.shieldDelay=Math.max(0,player.shieldDelay-dt);if(player.shieldDelay<=0&&player.shield<player.maxShield)player.shield=Math.min(player.maxShield,player.shield+dt*7.5);if(shieldBefore<player.maxShield&&player.shield===player.maxShield)audio?.shieldReady();
      const aimTarget=player.reloading?0:input.aim?1:input.gamepadAim?Math.max(.18,input.gamepadAimValue):0;player.ads+=(aimTarget-player.ads)*Math.min(1,dt*11);updateAutoLock(dt);
      let f=(input.forward?1:0)-(input.back?1:0)-moveAxis.y-controllerAxis.y, s=(input.right?1:0)-(input.left?1:0)+moveAxis.x+controllerAxis.x;
      const len=Math.hypot(f,s);if(len>1){f/=len;s/=len;}
      const sprinting=player.carIndex<0&&(input.sprint||input.gamepadSprint)&&f>.25&&!player.reloading&&player.ads<.15;
      if(player.carIndex>=0){
        const car=state.cars[player.carIndex],boosting=(input.jump||input.gamepadJump)&&Math.abs(f)>.2&&car.boost>0,topSpeed=boosting?10.8:7.1,targetSpeed=f*topSpeed;car.boost=Math.max(0,Math.min(100,car.boost+dt*(boosting?-31:16)));car.steer+=(s-car.steer)*Math.min(1,dt*7);car.dir=normAngle(car.dir+s*(boosting?1.35:1.75)*dt*Math.sign(targetSpeed||1));car.speed+=(targetSpeed-car.speed)*Math.min(1,dt*(boosting?4.6:3.2));
        const nx=car.x+Math.cos(car.dir)*car.speed*dt,ny=car.y+Math.sin(car.dir)*car.speed*dt;if(canMoveVehicle(nx,ny,player.carIndex)){car.x=nx;car.y=ny;}else{const impact=Math.abs(car.speed);car.speed*=-.18;state.screenShake=.65;rumble(.4,.6,85);if(impact>3.8)damageVehicle(car,impact*2.3);}
        for(const enemy of state.enemies){if(enemy.dead||enemy.spawn>0)continue;const hitDist=Math.hypot(enemy.x-car.x,enemy.y-car.y);if(hitDist<.74&&Math.abs(car.speed)>2.35){const speed=Math.abs(car.speed);enemy.hp-=speed*58;if(enemy.hp<=0){state.roadkills++;audio?.roadkill();killEnemy(enemy,false,'roadkill');player.score+=200;showMessage('VEHICLE TAKEDOWN // +200');rumble(.72,.9,130);}else{enemy.hitFlash=.18;enemy.dodgeTimer=.4;}car.speed*=.78;}}
        car.engineTimer-=dt;if(car.engineTimer<=0&&Math.abs(car.speed)>.35){audio?.engine(car.speed,boosting);car.engineTimer=boosting?.1:.18;}
        player.x=car.x;player.y=car.y;player.dir=car.dir;player.z=.62;player.vz=0;player.grounded=true;player.jetting=false;player.jetFuel=Math.min(100,player.jetFuel+dt*18);
      }else{
        const speed=(sprinting?4.15:2.75)*(player.hurtTimer>0?.92:1)*(1-player.ads*.28)*(player.grounded?1:1.08),dx=(Math.cos(player.dir)*f+Math.cos(player.dir+Math.PI/2)*s)*speed*dt,dy=(Math.sin(player.dir)*f+Math.sin(player.dir+Math.PI/2)*s)*speed*dt;
        if(canMovePlayer(player.x+dx,player.y,.24))player.x+=dx;if(canMovePlayer(player.x,player.y+dy,.24))player.y+=dy;
        player.jetting=(input.jump||input.gamepadJump)&&!player.grounded&&player.jetFuel>0&&player.z<2.45;
        if(player.jetting){player.vz=Math.min(3.25,player.vz+11.5*dt);player.jetFuel=Math.max(0,player.jetFuel-29*dt);player.jetSoundTimer-=dt;if(player.jetSoundTimer<=0){audio?.jet();player.jetSoundTimer=.13;}}
        else {player.vz-=8.7*dt;player.jetFuel=Math.min(100,player.jetFuel+dt*(player.grounded?22:4));}
        player.z+=player.vz*dt;const floorZ=surfaceHeight(player.x,player.y);
        if(player.z<=floorZ){if(!player.grounded&&player.vz< -2){audio?.land();rumble(.18,.35,70);state.screenShake=Math.min(1,Math.abs(player.vz)*.14);}player.z=floorZ;player.vz=0;player.grounded=true;}else player.grounded=false;
      }

      player.bobAmount+=(Math.min(1,len)*(sprinting?1.3:1)*(player.grounded?1:0)-player.bobAmount)*Math.min(1,dt*8);player.bob+=dt*(sprinting?14:10)*Math.max(.15,len);
      if(len>.1)player.spread=Math.min(.12,player.spread+dt*(sprinting?.22:.07)*(1-player.ads*.72));
      if(player.carIndex<0&&player.grounded&&len>.2){player.stepTimer-=dt;if(player.stepTimer<=0){audio?.footstep(sprinting);player.stepTimer=sprinting?.27:.42;}}else player.stepTimer=0;
      if(player.comboTimer>0){player.comboTimer-=dt;if(player.comboTimer<=0){player.combo=1;$('combo').classList.remove('show');}}
      if(player.reloading){player.reloadTimer-=dt;if(player.reloadTimer<=0){const need=player.magSize-player.ammo,take=Math.min(need,player.reserve);player.ammo+=take;player.reserve-=take;player.reloading=false;showMessage('MAGAZINE SYNCHRONIZED');}}
      const instantVx=(player.x-previousX)/Math.max(.001,dt),instantVy=(player.y-previousY)/Math.max(.001,dt);player.moveVx+=(instantVx-player.moveVx)*Math.min(1,dt*9);player.moveVy+=(instantVy-player.moveVy)*Math.min(1,dt*9);
      if(player.carIndex<0&&(input.fire||input.gamepadFire)&&!player.reloading&&player.fireCooldown<=0)shoot();
    }

    function startJump(){
      if(state.mode!=='playing')return;
      if(player.carIndex<0&&player.grounded){player.vz=3.45;player.grounded=false;audio?.footstep(true);showMessage('JET ASSIST ONLINE // HOLD SPACE TO CLIMB');}
    }

    function reload(){
      if(state.mode!=='playing'||player.reloading||player.ammo===player.magSize||player.reserve<=0)return;
      player.reloading=true;player.reloadTimer=player.reloadTime;input.fire=input.shiftFire=input.pointerFire=false;audio?.reload();showMessage('RELOADING PULSE CELLS');
    }

    function shoot(){
      const cfg=weaponConfig();if(player.ammo<=0){player.fireCooldown=.22;audio?.empty();showMessage('MAGAZINE EMPTY // PRESS R OR □');return;}
      if(state.autoLock&&player.carIndex<0){const directional=selectAutoLockTarget(true);if(directional){state.lockTarget=directional;player.dir=Math.atan2(directional.y-player.y,directional.x-player.x);}}
      player.ammo--;player.shots++;player.fireCooldown=cfg.cooldown;player.spread=Math.min(.22,player.spread+cfg.spread*(1-player.ads*.62));player.recoil=Math.min(1,player.recoil+(player.ads>.5?cfg.recoil*.62:cfg.recoil));state.muzzle=1;state.squadAlert=2.8;state.screenShake=Math.min(1,state.screenShake+(player.ads>.5?cfg.recoil*.42:cfg.recoil*.68));audio?.shoot(cfg.id);rumble(cfg.id==='shotgun'?.55:.2,cfg.id==='shotgun'?.78:.38,cfg.id==='shotgun'?95:48);
      const horizon=canvas.height/2+player.pitch,diff=DIFFICULTIES[state.difficulty];let registeredHit=false;
      for(let pellet=0;pellet<cfg.pellets;pellet++){
        const shotSpread=(player.spread+cfg.spread*.35)*(1-player.ads*.74)+.0015,locked=state.autoLock&&state.lockTarget&&!state.lockTarget.dead,baseAngle=locked?Math.atan2(state.lockTarget.y-player.y,state.lockTarget.x-player.x):player.dir,angle=baseAngle+(Math.random()-.5)*shotSpread*(locked?.28:1);breakGlassInDirection(angle);const ray=castRay(angle,player.x,player.y,40,player.z);let target=null,best=Infinity,critical=false;
        for(const e of state.enemies){
          if(e.dead)continue;const spec=ENEMY_TYPES[e.type],dx=e.x-player.x,dy=e.y-player.y,dist=Math.hypot(dx,dy),a=Math.abs(normAngle(Math.atan2(dy,dx)-angle));if(dist>ray.dist+.25||a>Math.atan2(spec.radius*(locked&&e===state.lockTarget?1.5:.95),dist))continue;
          const size=canvas.height/dist*spec.scale,centerY=horizon+(player.z-(e.z||GROUND_HEIGHT))*canvas.height/dist+Math.sin(e.anim)*size*.015,headY=centerY-size*.25,verticalJitter=(Math.random()-.5)*shotSpread*canvas.height,aimY=canvas.height/2+verticalJitter,bodyHit=locked&&e===state.lockTarget?true:Math.abs(aimY-centerY)<size*.48;
          if(bodyHit&&dist<best&&lineOfSight(player.x,player.y,e.x,e.y,player.z)){target=e;best=dist;critical=Math.abs(canvas.height/2+verticalJitter-headY)<size*.14;}
        }
        if(target){
          if(!registeredHit){player.hits++;registeredHit=true;}const rangeFalloff=cfg.id==='shotgun'?Math.max(.45,1-best/17):1;let damage=cfg.damage*(critical?1.72:1)*rangeFalloff*diff.playerDamage*(.92+Math.random()*.16);
          const targetSpec=ENEMY_TYPES[target.type];
          if(targetSpec.shieldBlock&&Math.abs(normAngle(target.facing-Math.atan2(player.y-target.y,player.x-target.x)))<(targetSpec.shieldArc??1.1)){damage*=1-targetSpec.shieldBlock;spawnHitParticles(target.x,target.y,'#7fd0ff');if(state.messageTimer<=0)showMessage('KINETIC BARRIER // FLANK OR FINISH THE WARDEN');}
          target.hp-=damage;target.hitFlash=.12;target.suppression=1;target.awareness=1;target.dodgeTimer=Math.max(target.dodgeTimer,.18);showHit(critical);audio?.hit(critical);spawnBlood(target.x,target.y,critical?1.5:1);if(target.hp<=0&&!target.dead)killEnemy(target,critical,critical?'headshot':'shot');
        }else if(pellet===0){const impactDist=Math.min(ray.dist,22);spawnHitParticles(player.x+Math.cos(angle)*impactDist*.98,player.y+Math.sin(angle)*impactDist*.98,'#ffbb55');}
        for(const e of state.enemies){if(e.dead)continue;const ex=e.x-player.x,ey=e.y-player.y,along=ex*Math.cos(angle)+ey*Math.sin(angle),near=Math.abs(ex*Math.sin(angle)-ey*Math.cos(angle));if(along>0&&along<ray.dist+.4&&near<.7)e.suppression=Math.min(1,e.suppression+.28);}
      }
      if(player.ammo===0&&player.reserve>0)setTimeout(()=>{if(state.mode==='playing')reload();},180);
    }

    function killEnemy(e,critical,method='shot'){
      if(e.dead)return;e.dead=true;const spec=ENEMY_TYPES[e.type];player.kills++;player.combo=Math.min(8,player.combo+1);player.comboTimer=3.2;
      const methodBonus=method==='takedown'?1.4:method==='roadkill'?1.3:method==='headshot'?1.2:1,eliteBonus=e.elite?1.75:1,gain=Math.round(spec.score*player.combo*(critical?1.25:1)*methodBonus*eliteBonus);player.score+=gain;audio?.kill();$('combo').innerHTML=`<b>x${player.combo} CHAIN</b><small>${e.elite?'ELITE // ':''}${method.toUpperCase()} +${gain}</small>`;$('combo').classList.add('show');
      if(e.commander){const hvt=missionStages().find(s=>s.type==='hvt');showAnnouncement('HVT NEUTRALIZED',`${hvt?.title||'TARGET'} // CONFIRMED`,1.5);showComms('ARES COMMAND',hvt?.confirmComms||'Target confirmed down. Move to your next objective immediately.',4.6);state.screenShake=1;}
      else if(e.elite){showMessage(`ELITE ${spec.name} ELIMINATED`);state.screenShake=Math.max(state.screenShake,.7);}
      if(state.gore){spawnBlood(e.x,e.y,e.elite?2.2:1.55);state.bloodDecals.push({x:e.x+(Math.random()-.5)*.16,y:e.y+(Math.random()-.5)*.16,z:e.z||GROUND_HEIGHT,size:(e.elite?.5:.34)+Math.random()*.18,alpha:.72});if(state.bloodDecals.length>36)state.bloodDecals.shift();}state.corpses.push({x:e.x,y:e.y,z:e.z||GROUND_HEIGHT,type:e.type,variant:e.variant||0,elite:e.elite,commander:e.commander,dir:e.facing,age:0});if(state.corpses.length>28)state.corpses.shift();spawnDeathParticles(e.x,e.y,e.elite?'#fff6b7':state.gore?'#8f101d':'#617176');if(Math.random()<(e.elite ? .86 : .36))dropPickup(e.x,e.y);
    }

    function openTacticalCell(x,y){return x>1&&y>1&&x<MAP_W-2&&y<MAP_H-2&&map[y][x]===0&&canMove(x+.5,y+.5,.34);}
    function findCoverPoint(e){
      let best=null,bestScore=Infinity;const radius=e.type==='wraith'?5:4;
      for(let y=Math.max(1,Math.floor(e.y-radius));y<=Math.min(MAP_H-2,Math.ceil(e.y+radius));y++)for(let x=Math.max(1,Math.floor(e.x-radius));x<=Math.min(MAP_W-2,Math.ceil(e.x+radius));x++){
        if(!openTacticalCell(x,y))continue;const px=x+.5,py=y+.5,hidden=!lineOfSight(player.x,player.y,px,py,GROUND_HEIGHT),wallNear=isWall(px+.7,py)||isWall(px-.7,py)||isWall(px,py+.7)||isWall(px,py-.7);if(!hidden||!wallNear)continue;
        const score=Math.hypot(px-e.x,py-e.y)+Math.abs(Math.hypot(px-player.x,py-player.y)-5)*.18;if(score<bestScore){bestScore=score;best=[px,py];}
      }
      return best;
    }
    function findFlankPoint(e){
      const side=e.flank,base=Math.atan2(player.y-e.y,player.x-e.x)+side*Math.PI/2;for(const range of [3.8,3,2.2]){const tx=Math.floor(player.x+Math.cos(base)*range),ty=Math.floor(player.y+Math.sin(base)*range);for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++)if(openTacticalCell(tx+ox,ty+oy))return[tx+ox+.5,ty+oy+.5];}return[player.x,player.y];
    }
    function findPeekPoint(e){
      const toward=Math.atan2(player.y-e.y,player.x-e.x);for(const direction of [e.flank,-e.flank])for(const distance of [.72,1.02,1.28]){const angle=toward+direction*Math.PI/2,px=e.x+Math.cos(angle)*distance,py=e.y+Math.sin(angle)*distance,ix=Math.floor(px),iy=Math.floor(py);if(openTacticalCell(ix,iy)&&lineOfSight(px,py,player.x,player.y,GROUND_HEIGHT)){e.flank=direction;return[ix+.5,iy+.5];}}return[e.x,e.y];
    }
    function findSearchPoint(e){
      e.searchAngle+=e.flank*(.75+Math.random()*.65);for(const radius of [1.2,1.8,2.4]){const x=Math.floor(e.lastSeenX+Math.cos(e.searchAngle)*radius),y=Math.floor(e.lastSeenY+Math.sin(e.searchAngle)*radius);if(openTacticalCell(x,y))return[x+.5,y+.5];}return[e.lastSeenX,e.lastSeenY];
    }
    function choosePatrolPoint(e){const choices=spawns.filter(point=>Math.hypot(point[0]-e.x,point[1]-e.y)>2.5&&canMove(point[0],point[1],.3));return choices[(Math.random()*choices.length)|0]||[11.5,11.5];}
    function moveEnemyAlongPath(e,target,dt,speedScale=1){
      const spec=ENEMY_TYPES[e.type];if(e.pathTimer<=0||!e.path.length){e.path=findPath(e.x,e.y,target[0],target[1]);e.pathTimer=.48+Math.random()*.24;}let mx=0,my=0,p=e.path[0];if(p){const dx=p[0]-e.x,dy=p[1]-e.y,d=Math.hypot(dx,dy);if(d<.22){e.path.shift();p=e.path[0];}else{mx=dx/d;my=dy/d;}}
      return[mx,my,spec.speed*DIFFICULTIES[state.difficulty].enemySpeed*speedScale];
    }

    function updateEnemies(dt){
      const diff=DIFFICULTIES[state.difficulty],sightRange=state.timeOfDay==='day'?12.5:8.7;state.squadAlert=Math.max(0,state.squadAlert-dt);
      for(const e of state.enemies){
        if(e.dead)continue;const spec=ENEMY_TYPES[e.type],wasReloading=e.reloadTimer>0;e.hitFlash=Math.max(0,e.hitFlash-dt);e.spawn=Math.max(0,e.spawn-dt*2.2);e.fireCooldown-=dt;e.meleeCooldown-=dt;e.pathTimer-=dt;e.dodgeTimer=Math.max(0,e.dodgeTimer-dt);e.dashCooldown-=dt;e.chargeCooldown-=dt;e.chargeTimer=Math.max(0,e.chargeTimer-dt);e.jumpCooldown=Math.max(0,e.jumpCooldown-dt);e.landingSquash=Math.max(0,e.landingSquash-dt*4);e.reactionTimer=Math.max(0,e.reactionTimer-dt);e.decisionTimer-=dt;e.suppression=Math.max(0,e.suppression-dt*.24);e.reloadTimer=Math.max(0,e.reloadTimer-dt);if(wasReloading&&e.reloadTimer<=0){e.rounds=e.magazineSize;e.combatState='engage';e.decisionTimer=0;}
        const dx=player.x-e.x,dy=player.y-e.y,dist=Math.max(.01,Math.hypot(dx,dy)),canSee=dist<sightRange&&lineOfSight(e.x,e.y,player.x,player.y,Math.max(GROUND_HEIGHT,player.z));
        if(canSee){if(!e.hadSight)e.reactionTimer=.24+Math.random()*(state.timeOfDay==='night'?.5:.32);e.awareness=Math.min(1,e.awareness+dt*2.5);e.lastSeenX=player.x;e.lastSeenY=player.y;e.hadSight=true;for(const ally of state.enemies)if(ally!==e&&!ally.dead&&Math.hypot(ally.x-e.x,ally.y-e.y)<5.5)ally.awareness=Math.max(ally.awareness,.58);}
        else{e.hadSight=false;e.awareness=Math.max(0,e.awareness-dt*(state.squadAlert>0?.025:.08));if(state.squadAlert>0&&dist<10)e.awareness=Math.max(e.awareness,.42);}
        const targetDistance=e.tacticalTarget?Math.hypot(e.tacticalTarget[0]-e.x,e.tacticalTarget[1]-e.y):Infinity;
        if(e.combatState==='cover'&&targetDistance<.48){if(e.coverTimer<0)e.coverTimer=.65+Math.random()*.7;else e.coverTimer-=dt;if(e.coverTimer<=0){e.combatState='peek';e.tacticalTarget=findPeekPoint(e);e.peekTimer=.8+Math.random()*.55;e.path=[];e.pathTimer=0;}}
        else if(e.combatState==='peek'){e.peekTimer-=dt;if(e.peekTimer<=0){e.tacticalTarget=findCoverPoint(e);e.combatState=e.tacticalTarget?'cover':'retreat';e.coverTimer=-1;e.path=[];e.pathTimer=0;}}
        if(e.combatState==='investigate'&&targetDistance<.55){e.searchTimer-=dt;if(e.searchTimer<=0){e.tacticalTarget=findSearchPoint(e);e.searchTimer=.7+Math.random()*.65;e.path=[];e.pathTimer=0;}}
        const stateLocked=e.reloadTimer>0||(e.combatState==='cover'&&targetDistance<.48)||(e.combatState==='peek'&&e.peekTimer>0);
        if(e.decisionTimer<=0&&!stateLocked){
          e.decisionTimer=.52+Math.random()*.48;e.path=[];const health=e.hp/e.maxHp;
          if((health<.42||e.suppression>.58)&&!spec.noCover){e.tacticalTarget=e.combatState==='cover'&&e.tacticalTarget?e.tacticalTarget:findCoverPoint(e);e.combatState=e.tacticalTarget?'cover':'retreat';e.coverTimer=-1;}
          else if(canSee&&e.role==='rusher')e.combatState='advance';
          else if(canSee&&e.role==='sniper')e.combatState=dist<spec.preferred*.7?'retreat':dist>spec.preferred*1.35?'advance':'engage';
          else if(canSee&&e.role==='flanker'&&dist>2.2){if(e.combatState!=='flank'||targetDistance<.7){if(Math.random()<.38)e.flank*=-1;e.tacticalTarget=findFlankPoint(e);}e.combatState='flank';}
          else if(canSee&&e.role==='assault')e.combatState=dist>3.2?'advance':'hold';
          else if(canSee&&e.role==='support')e.combatState=dist>spec.preferred*1.18?'advance':dist<spec.preferred*.66?'retreat':'engage';
          else if(canSee)e.combatState=dist>spec.preferred*1.2?'advance':dist<spec.preferred*.58?'retreat':'engage';
          else if(e.awareness>.18){if(e.combatState!=='investigate')e.tacticalTarget=[e.lastSeenX,e.lastSeenY];else if(targetDistance<.55)e.tacticalTarget=findSearchPoint(e);e.combatState='investigate';}
          else{if(!e.patrolTarget||Math.hypot(e.patrolTarget[0]-e.x,e.patrolTarget[1]-e.y)<.5)e.patrolTarget=choosePatrolPoint(e);e.tacticalTarget=e.patrolTarget;e.combatState='patrol';}
        }
        let mx=0,my=0;const rage=e.rage||1;let targetSpeed=spec.speed*diff.enemySpeed*.45;
        if(e.reloadTimer<=0&&spec.charge&&canSee&&dist>3.8&&e.chargeCooldown<=0){e.chargeTimer=.68;e.chargeCooldown=4.8+Math.random()*2;audio?.elite();}
        if(e.reloadTimer<=0&&spec.dash&&canSee&&dist>1.7&&dist<7&&e.dashCooldown<=0&&e.suppression<.5){e.dodgeTimer=.42;e.dashCooldown=2.4+Math.random()*2;}
        if(e.chargeTimer>0){mx=dx/dist;my=dy/dist;targetSpeed=spec.speed*diff.enemySpeed*2.15;}
        else if(e.dodgeTimer>0){mx=-dy/dist*e.flank;my=dx/dist*e.flank;targetSpeed=spec.speed*diff.enemySpeed*1.6;}
        else if(e.combatState==='reload'){const target=e.tacticalTarget||findCoverPoint(e);if(target)[mx,my,targetSpeed]=moveEnemyAlongPath(e,target,dt,.72);else{mx=-dx/dist;my=-dy/dist;targetSpeed=spec.speed*diff.enemySpeed*.65;}}
        else if(e.combatState==='retreat'){mx=-dx/dist;my=-dy/dist;targetSpeed=spec.speed*diff.enemySpeed*.82;}
        else if(['cover','peek','flank','investigate','patrol','advance'].includes(e.combatState)){const target=e.combatState==='advance'?[player.x,player.y]:(e.tacticalTarget||[e.lastSeenX,e.lastSeenY]);[mx,my,targetSpeed]=moveEnemyAlongPath(e,target,dt,e.combatState==='patrol'?.48:e.combatState==='cover'?1.05:e.combatState==='peek'?.66:e.combatState==='flank'?.9:.76);if(e.combatState==='cover'&&targetDistance<.48){mx=0;my=0;targetSpeed=0;}}
        else if(e.combatState==='engage'){const strafe=spec.strafe??.38;mx=-dy/dist*e.flank*strafe;my=dx/dist*e.flank*strafe;targetSpeed=spec.speed*diff.enemySpeed*.72;}
        targetSpeed*=rage;
        for(const other of state.enemies){if(other===e||other.dead)continue;const sx=e.x-other.x,sy=e.y-other.y,sd=Math.hypot(sx,sy);if(sd>0&&sd<spec.radius+ENEMY_TYPES[other.type].radius+.22){mx+=sx/sd*.72;my+=sy/sd*.72;}}
        const desiredVx=mx*targetSpeed,desiredVy=my*targetSpeed,accel=spec.accel??5.4;e.vx+=(desiredVx-e.vx)*Math.min(1,dt*accel);e.vy+=(desiredVy-e.vy)*Math.min(1,dt*accel);const nx=e.x+e.vx*dt,ny=e.y+e.vy*dt,blockedX=!canMoveEnemy(e,nx,e.y,spec.radius),blockedY=!canMoveEnemy(e,e.x,ny,spec.radius);
        if(e.grounded&&e.jumpCooldown<=0&&targetSpeed>1.1&&((blockedX||blockedY)||((e.combatState==='flank'||e.dodgeTimer>0)&&Math.random()<dt*.28))){e.vz=spec.body==='heavy'?3.75:4.35;e.grounded=false;e.jumpCooldown=1.8+Math.random()*2.2;}
        if(!blockedX)e.x=nx;else e.vx*=e.grounded?-.18:.72;if(!blockedY)e.y=ny;else e.vy*=e.grounded?-.18:.72;
        const enemyFloor=stairHeight(e.x,e.y)??GROUND_HEIGHT;if(!e.grounded){e.vz-=8.9*dt;e.z+=e.vz*dt;if(e.z<=enemyFloor){e.z=enemyFloor;e.vz=0;e.grounded=true;e.landingSquash=1;}}else e.z+=(enemyFloor-e.z)*Math.min(1,dt*12);
        const movement=Math.hypot(e.vx,e.vy),moved=Math.hypot(e.x-e.lastMoveX,e.y-e.lastMoveY);if(targetSpeed>.25&&moved<.004)e.stuckTimer+=dt;else e.stuckTimer=Math.max(0,e.stuckTimer-dt*2);e.lastMoveX=e.x;e.lastMoveY=e.y;if(e.stuckTimer>.6){if(e.grounded&&e.jumpCooldown<=0){e.vz=4.35;e.grounded=false;e.jumpCooldown=2;}e.stuckTimer=0;e.flank*=-1;e.path=[];e.pathTimer=0;e.decisionTimer=0;e.vx*=.2;e.vy*=.2;}
        const desiredFacing=canSee&&e.combatState!=='retreat'?Math.atan2(dy,dx):movement>.08?Math.atan2(e.vy,e.vx):e.facing,turnDelta=normAngle(desiredFacing-e.facing),turnRate=(spec.turn??4.6)*(e.suppression>.5?.72:1);e.facing=normAngle(e.facing+Math.max(-turnRate*dt,Math.min(turnRate*dt,turnDelta)));e.anim+=dt*(1.4+movement*5.8);
        if(dist<(spec.meleeRange??.76)&&e.meleeCooldown<=0){damagePlayer(spec.damage*(spec.meleeMult??.7)*diff.enemyDamage);e.meleeCooldown=spec.meleeRate??1.15;state.threatPulse=.35;}
        else if(canSee&&dist<11&&e.grounded&&e.reactionTimer<=0&&e.reloadTimer<=0&&e.fireCooldown<=0&&e.combatState!=='cover'&&Math.abs(normAngle(Math.atan2(dy,dx)-e.facing))<.18){
          const reloadTime=(spec.reloadTime??1.45)+Math.random()*.4;
          if(e.rounds<=0){e.reloadTimer=reloadTime;e.combatState='reload';e.tacticalTarget=findCoverPoint(e);e.path=[];}
          else{enemyShoot(e,dist);e.rounds--;e.burstShots--;if(e.burstShots<=0){e.burstShots=spec.burstFixed||2+((Math.random()*3)|0);e.fireCooldown=.55+Math.random()*.72;}else e.fireCooldown=1/(spec.fireRate*(e.elite?1.25:1)*(e.rageFire||1))*(.64+Math.random()*.22);if(e.rounds<=0){e.reloadTimer=reloadTime;e.combatState='reload';e.tacticalTarget=findCoverPoint(e);e.path=[];}}
        }
      }
      state.enemies=state.enemies.filter(e=>!e.dead);
    }

    function enemyShoot(e,dist){
      const spec=ENEMY_TYPES[e.type],speed=spec.projectileSpeed??5.4,travel=Math.max(.2,dist/speed),movement=Math.hypot(e.vx,e.vy),lead=spec.lead??.18,targetX=player.x+player.moveVx*travel*lead,targetY=player.y+player.moveVy*travel*lead,error=(.022+dist*.004+movement*.01+e.suppression*.075+(state.timeOfDay==='night'?.018:0))*(spec.precision??1),angle=Math.atan2(targetY-e.y,targetX-e.x)+(Math.random()-.5)*error;
      const muzzleZ=(e.z||GROUND_HEIGHT)+.12;state.projectiles.push({x:e.x,y:e.y,z:muzzleZ,dx:Math.cos(angle)*speed,dy:Math.sin(angle)*speed,dz:(player.z-muzzleZ)/travel,life:2.3,damage:spec.damage*DIFFICULTIES[state.difficulty].enemyDamage,type:e.type});audio?.enemyShot();
    }

    function updateProjectiles(dt){
      for(const p of state.projectiles){
        p.life-=dt;const steps=Math.max(1,Math.ceil(Math.hypot(p.dx,p.dy)*dt/.15));
        for(let i=0;i<steps&&p.life>0;i++){
          p.x+=p.dx*dt/steps;p.y+=p.dy*dt/steps;p.z+=p.dz*dt/steps;
          const outside=p.x<0||p.y<0||p.x>=MAP_W||p.y>=MAP_H;
          if(outside||(p.z<=1&&isWall(p.x,p.y))){p.life=0;break;}
          const car=state.cars.find(vehicle=>!vehicle.destroyed&&Math.hypot(vehicle.x-p.x,vehicle.y-p.y)<.6&&p.z<.95);if(car){damageVehicle(car,p.damage*(car.occupied ? .68 : .9));spawnHitParticles(p.x,p.y,'#ffbb55');p.life=0;break;}
          if(Math.hypot(p.x-player.x,p.y-player.y)<.3&&Math.abs(p.z-player.z)<.34){damagePlayer(p.damage);p.life=0;break;}
        }
      }
      state.projectiles=state.projectiles.filter(p=>p.life>0);
    }

    function damagePlayer(amount){
      if(state.qaInvulnerable||player.hurtTimer>.06)return;let left=amount,shieldUsed=0,armorBlocked=0;const shieldBefore=player.shield;player.shieldDelay=4.25;
      if(player.shield>0){shieldUsed=Math.min(player.shield,left);player.shield-=shieldUsed;left-=shieldUsed;state.shieldFlash=1;audio?.shieldHit(shieldBefore>0&&player.shield<=0);}
      if(left>0&&player.armor>0){const ratio=player.armor/player.maxArmor;armorBlocked=Math.min(left*.5*ratio,left*.52);player.armor=Math.max(0,player.armor-left*.72);left-=armorBlocked;state.armorFlash=1;audio?.armorHit();}
      if(left>0){player.health=Math.max(0,player.health-left);audio?.hurt();$('damageFlash').style.opacity=armorBlocked?'.48':'.72';setTimeout(()=>$('damageFlash').style.opacity='0',100);}
      player.hurtTimer=.18;state.screenShake=shieldUsed&&!left ? .45 : .9;rumble(shieldUsed&&!left ? .35 : .72,shieldUsed&&!left ? .5 : .85,shieldUsed&&!left?75:110);if(player.health<=0)endGame(false);
    }

    function damageVehicle(car,amount){
      if(car.destroyed)return;car.hp=Math.max(0,car.hp-amount);state.screenShake=Math.max(state.screenShake,.35);if(car.hp>0)return;
      car.destroyed=true;car.speed=0;spawnDeathParticles(car.x,car.y,'#ff8c57');audio?.roadkill();rumble(1,1,240);
      if(car.occupied){car.occupied=false;player.carIndex=-1;const ex=car.x+Math.cos(car.dir+Math.PI/2),ey=car.y+Math.sin(car.dir+Math.PI/2);player.x=canMove(ex,ey,.24)?ex:car.x;player.y=canMove(ex,ey,.24)?ey:car.y;player.z=GROUND_HEIGHT;damagePlayer(24);}
      showAnnouncement('VEHICLE LOST','ARES INTERCEPTOR DESTROYED',1.2);
    }

    function dropPickup(x,y){const needs=player.health<58?'health':player.armor<38?'armor':player.ammo<Math.max(2,weaponConfig().mag*.3)?'ammo':Math.random()<.5?'shield':'ammo';state.pickups.push({kind:needs,x,y,life:15,phase:Math.random()*TAU});}
    function updatePickups(dt){
      for(const p of state.pickups){p.life-=dt;p.phase+=dt*2.5;if(Math.hypot(p.x-player.x,p.y-player.y)<.62){
        if(p.kind==='health'){player.health=Math.min(player.maxHealth,player.health+28);showMessage('+28 VITALS RESTORED');}
        else if(p.kind==='ammo'){const gain=Math.max(8,Math.ceil(weaponConfig().mag*1.2));player.reserve=Math.min(Math.ceil(weaponConfig().reserve*1.5),player.reserve+gain);showMessage(`+${gain} ${weaponConfig().short} AMMUNITION`);}
        else if(p.kind==='armor'){player.armor=Math.min(player.maxArmor,player.armor+34);showMessage('+34 CERAMIC ARMOR REPAIRED');}
        else {player.shield=Math.min(player.maxShield,player.shield+28);player.shieldDelay=0;showMessage('+28 SHIELD CHARGE');}
        p.life=0;audio?.pickup();$('pickupFlash').style.opacity='.7';setTimeout(()=>$('pickupFlash').style.opacity='0',130);
      }}state.pickups=state.pickups.filter(p=>p.life>0);
    }

    function spawnHitParticles(x,y,color){for(let i=0;i<5;i++)state.particles.push({x,y,vx:(Math.random()-.5)*1.5,vy:(Math.random()-.5)*1.5,life:.24,max:.24,color});}
    function spawnBlood(x,y,intensity=1){if(!state.gore)return;const count=Math.round(9*intensity),impact=Math.atan2(y-player.y,x-player.x),fx=Math.cos(impact),fy=Math.sin(impact),px=-fy,py=fx;for(let i=0;i<count;i++){const forward=.45+Math.random()*1.45*intensity,lateral=(Math.random()-.5)*1.1*intensity;state.particles.push({x:x+(Math.random()-.5)*.06,y:y+(Math.random()-.5)*.06,z:.58+Math.random()*.52,vx:fx*forward+px*lateral,vy:fy*forward+py*lateral,vz:.55+Math.random()*2.25*intensity,gravity:6.8,life:.42+Math.random()*.5,max:.92,color:i%4===0?'#d62936':'#6f0711'});}}
    function spawnDeathParticles(x,y,color){for(let i=0;i<18;i++)state.particles.push({x,y,vx:(Math.random()-.5)*2.6,vy:(Math.random()-.5)*2.6,life:.75+Math.random()*.45,max:1.2,color});}
    function updateParticles(dt){for(const p of state.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(Number.isFinite(p.z)){p.vz=(p.vz||0)-(p.gravity||0)*dt;p.z=Math.max(.025,p.z+p.vz*dt);if(p.z<=.026){p.vz=0;if(!p.settled&&(p.color==='#6f0711'||p.color==='#d62936')){p.settled=true;if(Math.random()<.28){state.bloodDecals.push({x:p.x,y:p.y,size:.035+Math.random()*.075,alpha:.46+Math.random()*.22});if(state.bloodDecals.length>52)state.bloodDecals.shift();}}}}p.vx*=.97;p.vy*=.97;}state.particles=state.particles.filter(p=>p.life>0);}

    function render(){
      const w=canvas.width,h=canvas.height, shake=state.mode==='playing'?state.screenShake*4:0, sx=(Math.random()-.5)*shake,sy=(Math.random()-.5)*shake;state.camera=getRenderCamera();
      if(state.threeReady){drawRadar();return;}
      ctx.save();ctx.translate(sx,sy);renderWorld(w,h);renderSprites(w,h);renderWeapon(w,h);ctx.restore();drawRadar();
    }

    function getRenderCamera(){
      if(player.carIndex<0)return{x:player.x,y:player.y,z:player.z,dir:player.dir,pitch:player.pitch};const car=state.cars[player.carIndex];let distance=2.05,cx=car.x-Math.cos(car.dir)*distance,cy=car.y-Math.sin(car.dir)*distance;
      while(distance>.62&&blocksAt(cx,cy,.94)){distance-=.18;cx=car.x-Math.cos(car.dir)*distance;cy=car.y-Math.sin(car.dir)*distance;}return{x:cx,y:cy,z:.96,dir:car.dir,pitch:player.pitch*.28-24};
    }

    function viewFov(){return player.carIndex>=0?FOV*1.16:FOV*(1-player.ads*weaponConfig().zoom);}

    function renderSkyline(w,h,horizon){
      ctx.save();ctx.beginPath();ctx.rect(0,0,w,Math.max(0,horizon+2));ctx.clip();
      const day=state.timeOfDay==='day',layers=day?[{count:9,base:horizon+4,color:'#42565c',alpha:.55,scale:.54},{count:11,base:horizon+7,color:'#25383e',alpha:.78,scale:.76}]:[{count:9,base:horizon+4,color:'#071018',alpha:.72,scale:.54},{count:11,base:horizon+7,color:'#09151c',alpha:.88,scale:.76}],cam=state.camera||player;
      for(let layer=0;layer<layers.length;layer++){const spec=layers[layer],span=w*1.65,pan=(cam.dir/TAU*span*(layer?1.22:.82)+state.totalTime*(layer?-.18:.1));ctx.globalAlpha=spec.alpha;
        for(let i=0;i<spec.count;i++){const bw=w*(.065+((i*29)%37)/620)*spec.scale,bh=h*(.13+((i*47+layer*23)%83)/260)*spec.scale,x=((i*span/spec.count-pan)%span+span)%span-w*.28,y=spec.base-bh;ctx.fillStyle=spec.color;ctx.fillRect(x,y,bw,bh);
          const roof=(i+layer)%3;ctx.fillStyle=layer?'#101f27':'#0a161c';if(roof===0)ctx.fillRect(x+bw*.18,y-bh*.09,bw*.64,bh*.09);else if(roof===1){ctx.beginPath();ctx.moveTo(x+bw*.18,y);ctx.lineTo(x+bw*.34,y-bh*.12);ctx.lineTo(x+bw*.76,y);ctx.fill();}else{ctx.fillRect(x+bw*.46,y-bh*.16,Math.max(1,bw*.055),bh*.16);}
          if(layer){const cols=Math.max(2,Math.floor(bw/22)),rows=Math.max(2,Math.floor(bh/24));for(let yy=1;yy<rows;yy++)for(let xx=1;xx<cols;xx++){if((xx*11+yy*7+i*3)%5>1)continue;ctx.fillStyle=day?'rgba(205,230,232,.18)':(xx+yy+i)%4===0?'rgba(255,187,85,.34)':'rgba(85,226,233,.22)';ctx.fillRect(x+xx*bw/cols,y+yy*bh/rows,Math.max(1,bw/cols*.18),Math.max(1,bh/rows*.1));}}
        }
      }
      const haze=ctx.createLinearGradient(0,horizon-h*.2,0,horizon+3);haze.addColorStop(0,day?'rgba(172,213,220,0)':'rgba(31,67,79,0)');haze.addColorStop(1,day?'rgba(178,211,215,.38)':'rgba(48,94,106,.28)');ctx.globalAlpha=1;ctx.fillStyle=haze;ctx.fillRect(0,horizon-h*.24,w,h*.25);ctx.restore();
    }

    function renderWorldLow(w,h){
      const cam=state.camera||player,day=state.timeOfDay==='day',horizon=h/2+cam.pitch-player.recoil*h*.018;
      ctx.fillStyle=day?'#6f9eac':'#07131b';ctx.fillRect(0,0,w,horizon);
      ctx.fillStyle=day?'#1b2427':'#05090c';ctx.fillRect(0,horizon,w,h-horizon);
      const fov=viewFov();
      for(let x=0;x<w;x+=5){const cameraX=2*x/w-1,angle=cam.dir+Math.atan(cameraX*Math.tan(fov/2)),hit=castRay(angle,cam.x,cam.y,40,cam.z),dist=Math.max(.001,hit.dist*Math.cos(angle-cam.dir));const line=Math.min(h*4,h/dist),wallHeight=hit.height||WALL_HEIGHTS[hit.type]||1.35,top=horizon-line*(wallHeight-cam.z),bottom=horizon+line*cam.z;depthBuffer[x]=dist;wallTopBuffer[x]=top;wallBottomBuffer[x]=bottom;ctx.drawImage(textures[hit.type]||textures[1],hit.texX,0,1,TEX,x,top,6,bottom-top);}
    }

    function renderWorld(w,h){
      if(lowRenderPreset){renderWorldLow(w,h);return;}
      const cam=state.camera||player,day=state.timeOfDay==='day',horizon=h/2+cam.pitch-player.recoil*h*.018+(player.carIndex<0?Math.sin(player.bob*2)*player.bobAmount*1.2:0);
      const sky=ctx.createLinearGradient(0,0,0,horizon);if(day){sky.addColorStop(0,'#4e87a2');sky.addColorStop(.48,'#78acbd');sky.addColorStop(.82,'#b3ced1');sky.addColorStop(1,'#dfc6a4');}else{sky.addColorStop(0,'#010307');sky.addColorStop(.52,'#07111a');sky.addColorStop(.84,'#132933');sky.addColorStop(1,'#34505a');}ctx.fillStyle=sky;ctx.fillRect(0,0,w,Math.max(0,horizon));
      ctx.save();if(!day){ctx.globalAlpha=.7;for(let i=0;i<26;i++){const px=((i*173+state.totalTime*.4-cam.dir*90)%w+w)%w,py=(i*97%(Math.max(1,horizon*.66)));ctx.fillStyle=i%7===0?'#b4dbe4':'#7699a3';ctx.fillRect(px,py,1+(i%5===0),1+(i%5===0));}}const orbX=day?((.2-cam.dir/TAU)*w*1.35%w+w)%w:((.72-cam.dir/TAU)*w*1.4%w+w)%w,orbY=Math.max(34,horizon*(day?.23:.2));ctx.fillStyle=day?'rgba(255,236,186,.96)':'rgba(214,239,242,.82)';ctx.shadowColor=day?'#ffd789':'#a6e7eb';ctx.shadowBlur=day?48:26;ctx.beginPath();ctx.arc(orbX,orbY,Math.max(day?13:7,h*(day?.028:.018)),0,TAU);ctx.fill();ctx.restore();
      renderSkyline(w,h,horizon);
      const floor=ctx.createLinearGradient(0,horizon,0,h);if(day){floor.addColorStop(0,'#526166');floor.addColorStop(.16,'#303b3f');floor.addColorStop(.6,'#171d20');floor.addColorStop(1,'#090d0f');}else{floor.addColorStop(0,'#17282d');floor.addColorStop(.16,'#0b1519');floor.addColorStop(.6,'#05090b');floor.addColorStop(1,'#020405');}ctx.fillStyle=floor;ctx.fillRect(0,horizon,w,h-horizon);
      const wet=ctx.createLinearGradient(0,horizon,0,h);wet.addColorStop(0,day?'rgba(255,219,164,.13)':'rgba(118,220,225,.12)');wet.addColorStop(.36,day?'rgba(141,178,184,.045)':'rgba(48,110,119,.025)');wet.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=wet;ctx.fillRect(0,horizon,w,h-horizon);
      ctx.strokeStyle=day?'rgba(210,228,226,.08)':'rgba(122,202,204,.075)';ctx.lineWidth=1;
      for(let i=1;i<12;i++){const y=horizon+(h-horizon)*(1-Math.pow(.76,i));ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
      for(let x=-w;x<w*2;x+=w/10){ctx.beginPath();ctx.moveTo(w/2,horizon);ctx.lineTo(x,h);ctx.stroke();}
      const rayStep=lowRenderPreset?5:w>900?2:1,fov=viewFov();
      for(let x=0;x<w;x+=rayStep){
        const cameraX=2*x/w-1,angle=cam.dir+Math.atan(cameraX*Math.tan(fov/2)),hit=castRay(angle,cam.x,cam.y,40,cam.z),dist=Math.max(.001,hit.dist*Math.cos(angle-cam.dir));
        const line=Math.min(h*4,h/dist),wallHeight=hit.height||WALL_HEIGHTS[hit.type]||1.35,top=horizon-line*(wallHeight-cam.z),bottom=horizon+line*cam.z,wallH=bottom-top;
        for(let q=0;q<rayStep&&x+q<w;q++){depthBuffer[x+q]=dist;wallTopBuffer[x+q]=top;wallBottomBuffer[x+q]=bottom;}
        ctx.drawImage(textures[hit.type]||textures[1],hit.texX,0,1,TEX,x,top,rayStep+1,wallH);
        const shade=Math.min(day?.54:.78,dist/(day?30:20)+(hit.side?.1:0));if(shade>0){ctx.fillStyle=day?`rgba(19,28,30,${shade})`:`rgba(2,8,11,${shade})`;ctx.fillRect(x,top,rayStep+1,wallH+1);}const fog=Math.max(0,Math.min(day?.34:.46,(dist-7)/(day?28:22)));if(fog>0){ctx.fillStyle=day?`rgba(174,199,201,${fog})`:`rgba(44,72,78,${fog})`;ctx.fillRect(x,top,rayStep+1,wallH+1);}
        if(dist<4.2){ctx.fillStyle=`rgba(95,216,210,${Math.max(0,.055-dist*.011)})`;ctx.fillRect(x,top,rayStep+1,wallH);}
      }
      ctx.save();ctx.globalCompositeOperation='screen';for(let i=0;i<5;i++){const px=((i*223-player.dir*w*.35)%w+w)%w,py=h*(.64+i*.07);ctx.fillStyle=`rgba(${i%2?80:255},${i%2?210:178},${i%2?215:92},${.025-i*.003})`;ctx.beginPath();ctx.ellipse(px,py,w*.09,h*.012,0,0,TAU);ctx.fill();}ctx.restore();
    }

    function renderSprites(w,h){
      const cam=state.camera||player;
      const items=[];
      for(const e of state.enemies)items.push({kind:'enemy',obj:e,dist:Math.hypot(e.x-cam.x,e.y-cam.y)});
      for(const p of state.projectiles)items.push({kind:'projectile',obj:p,dist:Math.hypot(p.x-cam.x,p.y-cam.y)});
      for(const p of state.pickups)items.push({kind:'pickup',obj:p,dist:Math.hypot(p.x-cam.x,p.y-cam.y)});
      for(const p of state.particles)items.push({kind:'particle',obj:p,dist:Math.hypot(p.x-cam.x,p.y-cam.y)});
      for(const body of state.corpses)items.push({kind:'corpse',obj:body,dist:Math.hypot(body.x-cam.x,body.y-cam.y)});
      for(const blood of state.bloodDecals)items.push({kind:'blood',obj:blood,dist:Math.hypot(blood.x-cam.x,blood.y-cam.y)});
      for(const car of state.cars)if(!car.occupied&&!car.destroyed)items.push({kind:'car',obj:car,dist:Math.hypot(car.x-cam.x,car.y-cam.y)});
      items.sort((a,b)=>b.dist-a.dist);
      const horizon=h/2+cam.pitch-player.recoil*h*.018+(player.carIndex<0?Math.sin(player.bob*2)*player.bobAmount*1.2:0),fov=viewFov();
      for(const it of items){
        const o=it.obj,dx=o.x-cam.x,dy=o.y-cam.y,dist=it.dist,angle=normAngle(Math.atan2(dy,dx)-cam.dir);if(Math.abs(angle)>fov*.7||dist<.12)continue;
        const screenX=w*(.5+Math.tan(angle)/Math.tan(fov/2)*.5),groundShift=(cam.z-GROUND_HEIGHT)*h/dist;
        if(it.kind==='enemy'){
          const spec=ENEMY_TYPES[o.type],img=sprites[o.type][o.variant||0],movement=Math.hypot(o.vx||0,o.vy||0),stride=Math.sin(o.anim),airborne=!o.grounded,runLean=Math.min(.1,movement*.025),size=h/dist*spec.scale*(o.elite?1.12:1)*(1-o.spawn*.35)*(1+Math.abs(stride)*movement*.009)*(1-(o.landingSquash||0)*.08),aspect=Math.min(.9,Math.max(.54,img.width/img.height)),sw=size*aspect*(1+(o.landingSquash||0)*.11),enemyX=screenX+stride*movement*Math.min(4,size*.016),verticalShift=(cam.z-(o.z||GROUND_HEIGHT))*h/dist,top=horizon+verticalShift-size*.52+Math.abs(stride)*size*.018*movement+(airborne?Math.abs(stride)*size*.008:0),screenLateral=(o.vx||0)*-Math.sin(cam.dir)+(o.vy||0)*Math.cos(cam.dir),flip=screenLateral<-.04;
          if(pointVisible(enemyX,top+size,dist)){ctx.fillStyle=`rgba(0,0,0,${Math.max(.08,.4-dist*.022)})`;ctx.beginPath();ctx.ellipse(enemyX,top+size*.96,sw*.43*(1-Math.min(.18,movement*.035)),size*.045,0,0,TAU);ctx.fill();}
          ctx.save();ctx.translate(enemyX,top+size*.55);ctx.rotate(screenLateral<0?-runLean:runLean);ctx.translate(-enemyX,-top-size*.55);drawBillboard(img,enemyX-sw/2,top,sw,size,dist,o.hitFlash>0?'rgba(255,255,255,.55)':null,flip);ctx.restore();
          if(dist<10&&o.spawn<=0){const bw=Math.min(o.elite?92:70,sw*.84),bx=enemyX-bw/2,by=top-9;ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(bx,by,bw,4);ctx.fillStyle=o.elite?'#fff0a6':spec.color;ctx.fillRect(bx,by,bw*Math.max(0,o.hp/o.maxHp),4);if(o.elite){ctx.fillStyle='#fff0a6';ctx.font='800 7px ui-monospace,monospace';ctx.textAlign='center';ctx.fillText(`ELITE ${spec.name}`,enemyX,by-4);}}
        } else if(it.kind==='car'){
          const viewAngle=normAngle(Math.atan2(player.y-o.y,player.x-o.x)-o.dir),absView=Math.abs(viewAngle),view=absView<.82?'front':absView>2.3?'rear':'side',key=viewAngle<0?`${view}Flip`:view,img=sprites.carViews?.[key]?.[o.index]||sprites.cars[o.index],ch=Math.min(h*.72,h/dist*.72),aspect=Math.max(1.45,Math.min(2.12,img.width/img.height)),cw=ch*aspect,top=horizon+groundShift-ch*.88;if(pointVisible(screenX,top+ch,dist)){ctx.fillStyle=`rgba(0,0,0,${Math.max(.12,.5-dist*.025)})`;ctx.beginPath();ctx.ellipse(screenX,top+ch*.91,cw*.42,ch*.065,0,0,TAU);ctx.fill();}drawBillboard(img,screenX-cw/2,top,cw,ch,dist);
        } else if(it.kind==='corpse'){
          const spec=ENEMY_TYPES[o.type],img=sprites[o.type][o.variant||0],bodyW=Math.min(w*.48,h/dist*spec.scale*1.05),bodyH=bodyW*.24,top=horizon+groundShift-bodyH*.28;if(pointVisible(screenX,top+bodyH,dist)){ctx.save();ctx.globalAlpha=.9;drawBillboard(img,screenX-bodyW/2,top,bodyW,bodyH,dist,o.elite?'rgba(255,228,150,.08)':null,Math.sin(o.dir||0)<0);ctx.restore();}
        } else if(it.kind==='blood'){
          const size=Math.min(h*.11,h/dist*o.size);if(pointVisible(screenX,horizon+groundShift,dist)){ctx.save();ctx.globalAlpha=o.alpha;ctx.fillStyle='#5d0710';ctx.beginPath();ctx.ellipse(screenX,horizon+groundShift,size,size*.16,normAngle(Math.atan2(dy,dx)-cam.dir),0,TAU);ctx.fill();ctx.restore();}
        } else if(it.kind==='pickup'){
          const size=Math.min(h*.19,h/dist*.42),top=horizon+groundShift-size*.12+Math.sin(o.phase)*5;drawBillboard(sprites[o.kind],screenX-size/2,top,size,size,dist);
        } else if(it.kind==='projectile'){
          const size=Math.max(4,Math.min(28,h/dist*.1)),screenY=horizon+(player.z-o.z)*h/dist;if(pointVisible(screenX,screenY,dist)){ctx.save();ctx.globalCompositeOperation='lighter';const gr=ctx.createRadialGradient(screenX,screenY,0,screenX,screenY,size);gr.addColorStop(0,'#fff');gr.addColorStop(.2,o.type==='titan'?'#ffbb55':'#ff536d');gr.addColorStop(1,'rgba(255,40,80,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(screenX,screenY,size,0,TAU);ctx.fill();ctx.restore();}
        } else {
          const size=Math.max(1,Math.min(8,h/dist*.025)),alpha=Math.max(0,o.life/o.max),screenY=horizon+groundShift;if(pointVisible(screenX,screenY,dist)){ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=o.color;ctx.shadowColor=o.color;ctx.shadowBlur=8;ctx.fillRect(screenX-size/2,screenY-size/2,size,size);ctx.restore();}
        }
      }
    }

    function depthAt(x){x=Math.max(0,Math.min(canvas.width-1,x|0));return depthBuffer[x]||999;}
    function pointVisible(x,y,dist){x=Math.max(0,Math.min(canvas.width-1,x|0));return dist<=depthAt(x)+.2||y<wallTopBuffer[x];}
    function drawBillboard(img,x,y,w,h,dist,flash=null,flip=false){
      const start=Math.max(0,Math.floor(x)),end=Math.min(canvas.width,Math.ceil(x+w));if(end<=start)return;
      const slice=(img,u,sx,from,to)=>{if(to<=from)return;const srcY=Math.max(0,(from-y)/h*img.height),srcH=Math.min(img.height-srcY,(to-from)/h*img.height);ctx.drawImage(img,u,srcY,1,srcH,sx,from,2,to-from);if(flash){ctx.fillStyle=flash;ctx.fillRect(sx,from,2,to-from);}};
      for(let sx=start;sx<end;sx+=2){const baseU=Math.max(0,Math.min(img.width-1,Math.floor((sx-x)/w*img.width))),u=flip?img.width-1-baseU:baseU;if(dist<=depthAt(sx)+.2)slice(img,u,sx,y,y+h);else slice(img,u,sx,y,Math.min(y+h,wallTopBuffer[sx]));}
    }

    function renderVehicleChase(w,h){
      const car=state.cars[player.carIndex],img=sprites.carViews?.rear?.[car.index]||sprites.cars?.[car.index];if(!img)return;const speed=Math.abs(car.speed),boosting=(input.jump||input.gamepadJump)&&speed>.4&&car.boost>0;
      ctx.save();if(speed>4){ctx.globalCompositeOperation='screen';ctx.strokeStyle=boosting?'rgba(255,187,85,.24)':'rgba(185,229,232,.12)';ctx.lineWidth=2;for(let i=0;i<12;i++){const x=(i*83+state.totalTime*160)%w,y=h*(.42+(i%6)*.085),length=12+speed*3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(x<w/2?-length:length),y+length*.18);ctx.stroke();}ctx.globalCompositeOperation='source-over';}
      const drawW=Math.min(w*.5,h*1.05),drawH=drawW*(img.height/img.width),bounce=Math.sin(state.totalTime*18)*Math.min(3,speed*.28);ctx.translate(w/2+(car.steer||0)*w*.016,h*.79+bounce);ctx.rotate(-(car.steer||0)*.035);ctx.fillStyle=`rgba(0,0,0,${.48+Math.min(.2,speed*.018)})`;ctx.beginPath();ctx.ellipse(0,drawH*.22,drawW*.39,drawH*.14,0,0,TAU);ctx.fill();ctx.shadowColor='rgba(0,0,0,.72)';ctx.shadowBlur=24;ctx.drawImage(img,-drawW/2,-drawH*.55,drawW,drawH);ctx.shadowBlur=0;if(boosting){ctx.globalCompositeOperation='lighter';ctx.fillStyle='rgba(255,171,74,.42)';ctx.shadowColor='#ff8c57';ctx.shadowBlur=28;ctx.beginPath();ctx.ellipse(0,drawH*.28,drawW*.11,drawH*.08,0,0,TAU);ctx.fill();}ctx.restore();
      ctx.save();ctx.textAlign='center';ctx.fillStyle=car.color;ctx.font=`1000 ${Math.max(17,w*.022)}px ui-monospace,monospace`;ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=8;ctx.fillText(`${String(Math.round(speed*18)).padStart(3,'0')}`,w/2,h*.91);ctx.fillStyle='rgba(222,239,239,.72)';ctx.font=`800 ${Math.max(7,w*.008)}px ui-monospace,monospace`;ctx.fillText(`KM/H  ·  HULL ${Math.ceil(car.hp)}  ·  BOOST ${Math.ceil(car.boost)}  ·  CHASE CAM`,w/2,h*.94);ctx.restore();
    }

    function renderWeapon(w,h){
      if(state.mode==='menu')return;
      const cfg=weaponConfig(),bobX=Math.sin(player.bob)*7*player.bobAmount,bobY=Math.abs(Math.cos(player.bob))*5*player.bobAmount,reloadP=player.reloading?1-player.reloadTimer/player.reloadTime:0,ads=player.ads,meleeSwing=Math.sin((1-state.melee)*Math.PI);
      if(player.carIndex>=0){renderVehicleChase(w,h);return;}
      const weaponImage=sprites.weapons?.[cfg.id];if(weaponImage?.complete&&weaponImage.naturalWidth){const drawW=Math.min(w*(player.carIndex>=0 ? .72 : 1.03),h*(player.carIndex>=0?1.18:1.72)),drawH=drawW*weaponImage.height/weaponImage.width,carShift=player.carIndex>=0?w*.18:0;ctx.save();ctx.translate(w/2+carShift+bobX*(1-ads)+meleeSwing*w*.18,h-drawH*.66+bobY*(1-ads)-ads*h*.16+player.recoil*(25-ads*9)+meleeSwing*h*.08);if(player.reloading)ctx.rotate(Math.sin(reloadP*Math.PI)*-.19);if(state.melee>0)ctx.rotate(meleeSwing*.68);ctx.shadowColor='rgba(0,0,0,.72)';ctx.shadowBlur=18;ctx.drawImage(weaponImage,-drawW/2,0,drawW,drawH);ctx.shadowBlur=0;if(state.muzzle>0){const flashY=drawH*(cfg.id==='pistol' ? .255 : .3);ctx.save();ctx.globalCompositeOperation='lighter';ctx.translate(0,flashY);ctx.fillStyle=`rgba(255,222,140,${state.muzzle})`;ctx.shadowColor='#ffb25c';ctx.shadowBlur=34;ctx.beginPath();for(let i=0;i<14;i++){const a=i/14*TAU,r=i%2?8:34*state.muzzle;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.restore();}ctx.restore();return;}
      ctx.save();ctx.translate(w/2+bobX*(1-ads)+meleeSwing*w*.18,h+bobY*(1-ads)-ads*h*.23+player.recoil*(22-ads*8)+meleeSwing*h*.07);if(player.reloading)ctx.rotate(Math.sin(reloadP*Math.PI)*-.24);if(state.melee>0)ctx.rotate(meleeSwing*.72);
      const weaponScale=cfg.id==='pistol'?.82:cfg.id==='shotgun'?1.08:1,scale=Math.max(.72,Math.min(1.15,w/900))*(1+ads*.12)*weaponScale;ctx.scale(scale,scale);
      ctx.fillStyle='#b77862';ctx.beginPath();ctx.ellipse(-115,-16,50,24,-.25,0,TAU);ctx.ellipse(115,-16,50,24,.25,0,TAU);ctx.fill();
      const top=cfg.id==='pistol'?-126:cfg.id==='shotgun'?-172:-158;ctx.shadowColor=cfg.color;ctx.shadowBlur=16;const body=ctx.createLinearGradient(-90,top,110,-10);body.addColorStop(0,'#263b43');body.addColorStop(.5,'#111a21');body.addColorStop(1,'#05090d');ctx.fillStyle=body;ctx.strokeStyle=cfg.color;ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(-74,-6);ctx.lineTo(-51,top+34);ctx.lineTo(-29,top);ctx.lineTo(29,top);ctx.lineTo(55,top+41);ctx.lineTo(79,-6);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.shadowBlur=0;ctx.fillStyle=cfg.color;ctx.fillRect(-24,top+29,48,4);ctx.fillStyle='#091116';ctx.fillRect(-35,top+47,70,34);ctx.strokeStyle='rgba(255,255,255,.16)';ctx.strokeRect(-35,top+47,70,34);
      if(cfg.id==='shotgun'){ctx.fillStyle='#05090c';ctx.fillRect(-22,top-27,19,43);ctx.fillRect(3,top-27,19,43);ctx.strokeStyle=cfg.color;ctx.strokeRect(-22,top-27,19,43);ctx.strokeRect(3,top-27,19,43);}else{ctx.fillStyle='#a66cff';ctx.globalAlpha=.62;ctx.fillRect(-4,top+10,8,50);ctx.globalAlpha=1;ctx.fillStyle='#090d11';ctx.fillRect(-20,top-18,40,40);ctx.strokeStyle=cfg.color;ctx.strokeRect(-20,top-18,40,40);}
      if(state.muzzle>0){ctx.save();ctx.globalCompositeOperation='lighter';ctx.translate(0,top-22);ctx.fillStyle=`rgba(255,230,145,${state.muzzle})`;ctx.shadowColor='#ffbb55';ctx.shadowBlur=28;ctx.beginPath();for(let i=0;i<12;i++){const a=i/12*TAU,r=i%2?12:44*state.muzzle;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.restore();}
      ctx.restore();
    }

    function drawRadar(){
      if(state.mode==='menu')return;const w=radar.width,h=radar.height,cx=w/2,cy=h/2,scale=5;
      rctx.clearRect(0,0,w,h);rctx.save();rctx.beginPath();rctx.arc(cx,cy,w/2-2,0,TAU);rctx.clip();
      const bg=rctx.createRadialGradient(cx,cy,2,cx,cy,w/2);bg.addColorStop(0,'rgba(19,55,59,.56)');bg.addColorStop(1,'rgba(1,7,10,.92)');rctx.fillStyle=bg;rctx.fillRect(0,0,w,h);
      rctx.translate(cx,cy);rctx.rotate(-player.dir+Math.PI/2);rctx.translate(-player.x*scale,-player.y*scale);rctx.fillStyle='rgba(49,245,219,.14)';
      for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)if(map[y][x])rctx.fillRect(x*scale,y*scale,scale,scale);
      for(const e of state.enemies){if(Math.hypot(e.x-player.x,e.y-player.y)<10){rctx.fillStyle=e.elite?'#fff0a6':ENEMY_TYPES[e.type].color;rctx.beginPath();rctx.arc(e.x*scale,e.y*scale,e.elite?2.8:e.type==='titan'?2.4:1.7,0,TAU);rctx.fill();}}
      for(const car of state.cars){if(car.destroyed)continue;rctx.fillStyle=car.color;rctx.fillRect(car.x*scale-2.5,car.y*scale-1.5,5,3);}
      rctx.restore();rctx.save();rctx.translate(cx,cy);rctx.fillStyle='#fff';rctx.shadowColor='#31f5db';rctx.shadowBlur=8;rctx.beginPath();rctx.moveTo(0,-7);rctx.lineTo(5,6);rctx.lineTo(0,3);rctx.lineTo(-5,6);rctx.closePath();rctx.fill();rctx.restore();
      rctx.strokeStyle='rgba(49,245,219,.4)';rctx.lineWidth=1;rctx.beginPath();rctx.arc(cx,cy,w/2-3,0,TAU);rctx.stroke();
    }

    function getAimTarget(limit=.06){let target=null,best=Infinity;for(const enemy of state.enemies){if(enemy.dead||enemy.spawn>0)continue;const dist=Math.hypot(enemy.x-player.x,enemy.y-player.y),angle=Math.abs(normAngle(Math.atan2(enemy.y-player.y,enemy.x-player.x)-player.dir)),score=angle+dist*.0008;if(angle<limit&&score<best&&lineOfSight(player.x,player.y,enemy.x,enemy.y,player.z)){best=score;target={enemy,dist};}}return target;}

    function updateHUD(){
      const cfg=weaponConfig();
      const car=player.carIndex>=0?state.cars[player.carIndex]:null,energy=car?car.boost:player.jetFuel;$('healthBar').style.width=`${player.health}%`;$('shieldBar').style.width=`${player.shield/player.maxShield*100}%`;$('armorBar').style.width=`${player.armor/player.maxArmor*100}%`;$('jetBar').style.width=`${energy}%`;$('healthValue').textContent=String(Math.ceil(player.health)).padStart(3,'0');$('shieldValue').textContent=String(Math.ceil(player.shield)).padStart(3,'0');$('armorValue').textContent=String(Math.ceil(player.armor)).padStart(3,'0');$('energyLabel').textContent=car?'BOOST':'JET';$('jetValue').textContent=String(Math.ceil(energy)).padStart(3,'0');$('shieldFx').style.opacity=String(state.shieldFlash*.9+(player.shield>0 ? .018 : 0));$('armorFx').style.opacity=String(Math.max(state.armorFlash*.42,(1-player.armor/player.maxArmor)*.28));
      $('ammo').textContent=String(player.ammo).padStart(2,'0');$('reserve').textContent=`/ ${player.reserve}`;$('scoreValue').textContent=String(player.score).padStart(6,'0');$('killCount').textContent=`${String(player.kills).padStart(2,'0')} ELIMINATIONS`;
      $('weaponName').textContent=car?'ARES INTERCEPTOR // THIRD-PERSON CHASE CAMERA':`${cfg.name} // ${cfg.mode} // AUTO LOCK ${state.autoLock?'ON':'OFF'}`;$('ammoLine').style.opacity=car?'0':'1';$('weaponSlots').style.opacity=car?'0':'1';
      document.querySelectorAll('.weapon-slot').forEach((slot,index)=>{slot.classList.toggle('active',index===player.weaponIndex);slot.classList.toggle('locked',!weaponUnlocked(index));slot.textContent=`${index+1} ${WEAPONS[index].short}`;});
      const remaining=state.enemies.length+state.pending.length,stages=missionStages(),stage=stages[state.missionStage]||stages[0],objectiveTarget=state.objectiveTarget||stage.target,objectiveDistance=Math.hypot(objectiveTarget[0]-player.x,objectiveTarget[1]-player.y);$('waveLabel').textContent=`PHASE ${String(state.missionStage+1).padStart(2,'0')} / ${String(stages.length).padStart(2,'0')} · ${stage.code}`;$('enemyLabel').textContent=`HOSTILES ${String(remaining).padStart(2,'0')}`;$('missionLabel').textContent=`OBJECTIVE // ${state.objective}`;$('waveFill').style.width=`${Math.max(0,Math.min(100,state.missionProgress*100))}%`;$('objectiveDistance').textContent=stage.type==='defend'?`UPLINK // ${Math.round(state.missionProgress*100)}%`:stage.type==='hvt'&&state.commander?`TARGET // ${Math.ceil(Math.max(0,state.commander.hp))} ARMOR`:`OBJECTIVE // ${Math.ceil(objectiveDistance)}M`;$('objectiveDistance').style.opacity=state.wavePhase==='complete'?'0':'.88';
      const spread=(38+player.spread*170)*(1-player.ads*.65);$('crosshair').style.width=`${spread}px`;$('crosshair').style.height=`${spread}px`;$('crosshair').style.opacity=car?'0':String(1-player.ads*.82);
      $('scopeOverlay').style.opacity=car?'0':String(Math.max(0,(player.ads-.38)*1.62));$('zoomReadout').textContent=`${(1/(1-player.ads*cfg.zoom)).toFixed(1)}X ${cfg.short} SMART OPTIC`;
      const assisted=!car&&state.autoLock&&state.lockTarget&&!state.lockTarget.dead,lock=assisted?{enemy:state.lockTarget,dist:Math.hypot(state.lockTarget.x-player.x,state.lockTarget.y-player.y)}:(!car&&player.ads>.35?getAimTarget(.065):null),targetText=lock?`${assisted?'AUTO LOCK // ':''}${lock.enemy.commander?'COMMANDER VOSS':`${lock.enemy.elite?'ELITE ':''}${ENEMY_TYPES[lock.enemy.type].name}`} // ${lock.dist.toFixed(1)}M // ${String(lock.enemy.combatState||'engage').toUpperCase()}`:'NO TARGET LOCK';$('targetReadout').textContent=targetText;$('targetReadout').style.opacity=String(!car&&lock&&(assisted||player.ads>.48) ? .94 : 0);$('targetReadout').style.color=lock?(lock.enemy.elite?'#fff0a6':'var(--cyan)'):'var(--muted)';$('crosshair').classList.toggle('locked',!!assisted);$('lockModeBadge').classList.toggle('active',state.autoLock);$('lockModeBadge').textContent=`AUTO LOCK // ${state.autoLock?'ON':'OFF'} · L1 / T`;$('lockModeBadge').style.opacity=car?'0':'1';
      const nearCar=player.carIndex<0&&state.cars.some(vehicle=>!vehicle.destroyed&&Math.hypot(vehicle.x-player.x,vehicle.y-player.y)<1.5),nearEnemy=player.carIndex<0&&state.enemies.some(enemy=>!enemy.dead&&Math.hypot(enemy.x-player.x,enemy.y-player.y)<1.58),context=car?`CHASE CAMERA // ${Math.ceil(car.hp)}% HULL // ${Math.ceil(car.boost)}% BOOST // △ EXIT`:nearEnemy?'R3 // CINEMATIC FINISHER':nearCar?'△ // ENTER ARES INTERCEPTOR':'';$('vehicleHud').textContent=context;$('vehicleHud').style.opacity=context?'1':'0';
      $('reloadTrack').style.opacity=player.reloading?'1':'0';$('reloadFill').style.width=player.reloading?`${(1-player.reloadTimer/player.reloadTime)*100}%`:'0%';
      $('ammo').style.color=player.ammo<Math.max(2,cfg.mag*.23)?'var(--danger)':'var(--ink)';
      $('adsButton')?.classList.toggle('active',input.aim);$('jetButton')?.classList.toggle('active',player.jetting);
    }

    function showAnnouncement(title,sub,duration=1.8){const a=$('announcement');a.querySelector('strong').textContent=title;a.querySelector('span').textContent=sub;a.classList.add('show');state.announcementTimer=duration;}
    function showMessage(text){$('message').textContent=text;$('message').classList.add('show');state.messageTimer=1.55;}
    function showHit(critical){const m=$('hitMarker');m.classList.toggle('critical',critical);m.style.opacity='1';m.style.width=critical?'38px':'30px';m.style.height=critical?'38px':'30px';setTimeout(()=>{m.style.opacity='0';m.style.width='30px';m.style.height='30px';},75);}

    function campaignPayload(status='active'){
      return {id:campaignCloud.id,status,operation:state.operation,difficulty:state.difficulty,time_of_day:state.timeOfDay,wave:Math.max(1,state.wave),score:player.score,kills:player.kills,shots:player.shots,hits:player.hits,takedowns:state.takedowns,roadkills:state.roadkills,health:Math.ceil(player.health),shield:Math.ceil(player.shield),armor:Math.ceil(player.armor),weapon_index:player.weaponIndex,elapsed_seconds:Math.floor(state.totalTime)};
    }

    async function saveCampaign(status='active',force=false){
      if(campaignCloud.syncing){if(force||status!=='active')campaignCloud.pendingStatus=status;return;}
      if(!force&&state.mode!=='playing')return;campaignCloud.syncing=true;if($('syncStatus'))$('syncStatus').textContent='SAVING';
      const payload=campaignPayload(status);
      if(campaignCloud.offline){writeLocalCampaign(status,payload);if(status==='active')campaignCloud.active={...payload};else{campaignCloud.records=[{...payload},...campaignCloud.records].slice(0,8);campaignCloud.active=null;}renderCampaignRecords();if($('syncStatus'))$('syncStatus').textContent='LOCAL SAVE';campaignCloud.syncing=false;return;}
      try{
        const response=await fetch('/api/campaigns',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(payload)});
        if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error(`save ${response.status}`);const data=await response.json();if(data.available===false)throw new Error('campaign storage unavailable');if(data.record?.id)campaignCloud.id=Number(data.record.id);if($('syncStatus'))$('syncStatus').textContent='CLOUD SAVED';
        if(status!=='active'){campaignCloud.id=null;await loadCampaignRecords();}
      }catch{campaignCloud.offline=true;writeLocalCampaign(status,payload);useLocalCampaign();if($('syncStatus'))$('syncStatus').textContent='LOCAL SAVE';}
      finally{campaignCloud.syncing=false;const pending=campaignCloud.pendingStatus;campaignCloud.pendingStatus=null;if(pending&&!campaignCloud.offline)saveCampaign(pending,true);}
    }

    async function loadCampaignRecords(){
      if($('syncStatus'))$('syncStatus').textContent='CONNECTING';
      try{
        const response=await fetch('/api/campaigns',{headers:{accept:'application/json'}});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error(`load ${response.status}`);const data=await response.json();if(data.available===false)throw new Error('campaign storage unavailable');campaignCloud.offline=false;campaignCloud.records=Array.isArray(data.records)?data.records:[];campaignCloud.active=data.active||null;campaignCloud.remoteBest=Number(data.best_score||0);if(data.career)for(const key of Object.keys(career))career[key]=Number(data.career[key]||0);renderCampaignRecords();renderArsenal();if($('syncStatus'))$('syncStatus').textContent='CLOUD READY';
      }catch{useLocalCampaign();if($('syncStatus'))$('syncStatus').textContent=campaignCloud.active||campaignCloud.records.length?'LOCAL SAVE':'SAVE UNAVAILABLE';}
      loadLeaderboard();
    }

    function renderArsenal(){
      const list=$('arsenalRows');if(!list)return;list.replaceChildren();
      if($('careerStatus'))$('careerStatus').textContent=`CAREER // ${career.kills} ELIMS · ${career.victories} WINS`;
      const rows=[
        ...WEAPONS.filter(weapon=>weapon.unlock).map(weapon=>({name:`${weapon.short} ${weapon.name.split(' ').slice(1).join(' ')}`,desc:weapon.unlock.label,done:meetsUnlock(weapon.unlock)})),
        ...PERKS.map(perk=>({name:perk.name,desc:`${perk.desc} · ${perk.unlock.label}`,done:meetsUnlock(perk.unlock)}))
      ];
      for(const row of rows){
        const el=document.createElement('div');el.className=`campaign-row${row.done?' victory':''}`;
        const detail=document.createElement('div'),title=document.createElement('b'),meta=document.createElement('span'),mark=document.createElement('strong');
        title.textContent=row.name;meta.textContent=row.desc;mark.textContent=row.done?'✓':'🔒';
        detail.append(title,meta);el.append(detail,mark);list.append(el);
      }
      const slots=$('weaponSlots');if(slots&&slots.childElementCount!==WEAPONS.length){slots.replaceChildren();WEAPONS.forEach((weapon,index)=>{const span=document.createElement('span');span.className='weapon-slot';span.textContent=`${index+1} ${weapon.short}`;slots.append(span);});}
    }

    async function loadLeaderboard(){
      const status=$('leaderboardStatus');if(status)status.textContent='CONNECTING';
      try{
        const response=await fetch('/api/leaderboard',{headers:{accept:'application/json'}});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error(`leaderboard ${response.status}`);
        const data=await response.json();if(data.available===false)throw new Error('leaderboard unavailable');renderLeaderboard(Array.isArray(data.entries)?data.entries:[]);if(status)status.textContent='LIVE RANKING';
      }catch{renderLeaderboard([]);if(status)status.textContent='RANKING OFFLINE';}
    }

    function renderLeaderboard(entries){
      const list=$('leaderboardRows');if(!list)return;list.replaceChildren();
      if(!entries.length){const row=document.createElement('div');row.className='campaign-row';row.innerHTML='<div><b>NO OPERATIVES RANKED</b><span>Top ARES operatives will appear here.</span></div><strong>—</strong>';list.append(row);return;}
      for(const entry of entries.slice(0,5)){
        const row=document.createElement('div');row.className=`campaign-row${entry.you?' you':''}`;
        const detail=document.createElement('div'),title=document.createElement('b'),meta=document.createElement('span'),score=document.createElement('strong');
        title.textContent=`#${String(entry.rank).padStart(2,'0')} // ${entry.you?'YOU':String(entry.callsign||'AGENT ***')}`;
        meta.textContent=`${Number(entry.victories||0)} MISSION${Number(entry.victories)===1?'':'S'} WON`;
        score.textContent=Number(entry.best_score||0).toLocaleString();
        detail.append(title,meta);row.append(detail,score);list.append(row);
      }
    }

    function renderCampaignRecords(){
      const history=$('campaignHistory');if(!history)return;history.replaceChildren();const active=campaignCloud.active,records=campaignCloud.records.filter(record=>record.status!=='active').slice(0,3);$('continueButton').classList.toggle('hidden',!active);if(active)$('continueButton').textContent=`CONTINUE ${OPERATIONS[Number(active.operation)||0]?.short||'FS'} PHASE ${String(Math.max(1,Number(active.wave||1))).padStart(2,'0')} // ${Number(active.score||0).toLocaleString()} PTS`;
      const visible=active?[active,...records]:records;if(!visible.length){const row=document.createElement('div');row.className='campaign-row';row.innerHTML='<div><b>NO OPERATIONS RECORDED</b><span>Your campaign outcomes will appear here.</span></div><strong>—</strong>';history.append(row);updateBestScore();return;}
      for(const record of visible){const row=document.createElement('div'),status=record.status==='active'?'IN PROGRESS':record.status==='victory'?'MISSION WON':record.status==='failed'?'MISSION FAILED':'CAMPAIGN CLOSED';row.className=`campaign-row ${record.status}`;const detail=document.createElement('div'),title=document.createElement('b'),meta=document.createElement('span'),score=document.createElement('strong');title.textContent=`${status} // ${OPERATIONS[Number(record.operation)||0]?.short||'FS'} PHASE ${String(Math.max(1,Number(record.wave||1))).padStart(2,'0')}`;meta.textContent=`${String(record.time_of_day||'day').toUpperCase()} · ${String(record.difficulty||'operative').toUpperCase()} · ${Number(record.kills||0)} ELIMS`;score.textContent=Number(record.score||0).toLocaleString();detail.append(title,meta);row.append(detail,score);history.append(row);}updateBestScore();
    }

    function readBestScore(){try{return Number(localStorage.getItem('neon-breach-best')||0);}catch{return 0;}}
    function saveBestScore(score){const previous=readBestScore(),isBest=score>previous;if(isBest){try{localStorage.setItem('neon-breach-best',String(score));}catch{}}updateBestScore();return isBest;}
    function updateBestScore(){const best=Math.max(readBestScore(),campaignCloud.remoteBest||0);$('bestScoreTitle').textContent=`BEST RUN // ${String(best).padStart(6,'0')}`;}

    function frame(t){const dt=Math.min(.033,Math.max(0,(t-state.lastTime)/1000||0));state.lastTime=t;updateGamepad(dt);update(dt);render();requestAnimationFrame(frame);}

    function syncFire(){input.fire=input.shiftFire||input.pointerFire;}
    function setKey(code,value){if(code==='KeyW'||code==='ArrowUp')input.forward=value;if(code==='KeyS'||code==='ArrowDown')input.back=value;if(code==='KeyA'||code==='ArrowLeft')input.left=value;if(code==='KeyD'||code==='ArrowRight')input.right=value;if(code==='ShiftLeft'||code==='ShiftRight'){input.shiftFire=value;syncFire();}if(code==='KeyQ')input.sprint=value;if(code==='Space')input.jump=value;}
    addEventListener('keydown',e=>{if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();setKey(e.code,true);if(e.code==='Space'&&!e.repeat)startJump();if(e.code==='KeyR'&&!e.repeat)reload();if(e.code==='KeyF'&&!e.repeat)meleeTakedown();if(e.code==='KeyE'&&!e.repeat)toggleVehicle();if(e.code==='KeyT'&&!e.repeat)toggleAutoLock();if(/^Digit[1-4]$/.test(e.code)&&!e.repeat)equipWeapon(Number(e.code.slice(-1))-1);if(e.code==='KeyM'&&!e.repeat)toggleAudio();});
    addEventListener('keyup',e=>setKey(e.code,false));
    addEventListener('blur',()=>{Object.keys(input).forEach(k=>input[k]=false);if(document.visibilityState==='hidden'&&state.mode==='playing'&&!coarsePointer)pauseGame();});
    addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,80);});
    document.addEventListener('mousemove',e=>{if(state.mode==='playing'&&document.pointerLockElement===canvas){player.dir=normAngle(player.dir+e.movementX*.00225);player.pitch=Math.max(-canvas.height*.2,Math.min(canvas.height*.2,player.pitch-e.movementY*.32));}});
    document.addEventListener('mousedown',e=>{if(state.mode!=='playing')return;if(e.button===0){if(!coarsePointer&&document.pointerLockElement!==canvas)requestLock();else{input.pointerFire=true;syncFire();}}if(e.button===2)input.aim=true;});
    document.addEventListener('mouseup',e=>{if(e.button===0){input.pointerFire=false;syncFire();}if(e.button===2)input.aim=false;});
    document.addEventListener('wheel',e=>{if(state.mode==='playing'){e.preventDefault();cycleWeapon(e.deltaY>0?1:-1);}},{passive:false});
    document.addEventListener('pointerlockchange',()=>{if(!coarsePointer&&state.mode==='playing'&&document.pointerLockElement!==canvas)pauseGame();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='playing')saveCampaign('active',true);});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());

    document.querySelectorAll('[data-difficulty]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-difficulty]').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.difficulty=btn.dataset.difficulty;}));
    document.querySelectorAll('[data-time]').forEach(btn=>btn.addEventListener('click',()=>setMissionTime(btn.dataset.time)));
    // Operation selector is generated from data so new OPERATIONS entries appear automatically.
    OPERATIONS.forEach((op,index)=>{const button=document.createElement('button');button.dataset.operation=String(index);button.textContent=op.short?`${op.short} // ${op.name}`:op.name;if(index===0)button.classList.add('active');button.addEventListener('click',()=>setOperation(index));$('opSelect').append(button);});
    $('autoLockButton').addEventListener('click',toggleAutoLock);
    $('goreButton').addEventListener('click',toggleGore);
    $('deployButton').addEventListener('click',()=>startGame());$('continueButton').addEventListener('click',()=>campaignCloud.active&&startGame(campaignCloud.active));$('resumeButton').addEventListener('click',()=>state.mode==='paused'?resumeGame():startGame());$('quitButton').addEventListener('click',returnToTitle);
    function toggleAudio(){state.muted=!state.muted;$('audioButton').textContent=state.muted?'○':'◉';if(audio?.master)audio.master.gain.value=state.muted?0:.24;}
    $('audioButton').addEventListener('click',toggleAudio);

    function setupTouch(){
      if(!coarsePointer)return;const joy=$('joystickZone'),knob=$('joystickKnob'),look=$('lookZone');let joyId=null,lookId=null,lastLook={x:0,y:0};
      joy.addEventListener('pointerdown',e=>{joyId=e.pointerId;joy.setPointerCapture(e.pointerId);updateJoy(e);});
      joy.addEventListener('pointermove',e=>{if(e.pointerId===joyId)updateJoy(e);});
      const endJoy=e=>{if(e.pointerId===joyId){joyId=null;moveAxis={x:0,y:0};knob.style.transform='translate(0,0)';}};joy.addEventListener('pointerup',endJoy);joy.addEventListener('pointercancel',endJoy);
      function updateJoy(e){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy),max=42,k=Math.min(1,max/Math.max(max,len));moveAxis={x:dx/max*k,y:dy/max*k};knob.style.transform=`translate(${dx*k}px,${dy*k}px)`;}
      look.addEventListener('pointerdown',e=>{lookId=e.pointerId;lastLook={x:e.clientX,y:e.clientY};look.setPointerCapture(e.pointerId);});
      look.addEventListener('pointermove',e=>{if(e.pointerId!==lookId||state.mode!=='playing')return;const dx=e.clientX-lastLook.x,dy=e.clientY-lastLook.y;lastLook={x:e.clientX,y:e.clientY};player.dir=normAngle(player.dir+dx*.006);player.pitch=Math.max(-canvas.height*.2,Math.min(canvas.height*.2,player.pitch-dy*.85));});
      const endLook=e=>{if(e.pointerId===lookId)lookId=null;};look.addEventListener('pointerup',endLook);look.addEventListener('pointercancel',endLook);
      const fire=$('fireButton');fire.addEventListener('pointerdown',e=>{e.preventDefault();input.pointerFire=true;syncFire();fire.setPointerCapture(e.pointerId);});fire.addEventListener('pointerup',()=>{input.pointerFire=false;syncFire();});fire.addEventListener('pointercancel',()=>{input.pointerFire=false;syncFire();});
      $('reloadButton').addEventListener('pointerdown',e=>{e.preventDefault();reload();});
      const sprint=$('sprintButton');sprint.addEventListener('pointerdown',e=>{input.sprint=true;sprint.setPointerCapture(e.pointerId);});sprint.addEventListener('pointerup',()=>input.sprint=false);sprint.addEventListener('pointercancel',()=>input.sprint=false);
      const jet=$('jetButton');jet.addEventListener('pointerdown',e=>{e.preventDefault();input.jump=true;startJump();jet.setPointerCapture(e.pointerId);});jet.addEventListener('pointerup',()=>input.jump=false);jet.addEventListener('pointercancel',()=>input.jump=false);
      const ads=$('adsButton');ads.addEventListener('pointerdown',e=>{e.preventDefault();input.aim=!input.aim;ads.setAttribute('aria-pressed',String(input.aim));});
      $('lockButton').addEventListener('pointerdown',e=>{e.preventDefault();toggleAutoLock();});
      $('pauseButton').addEventListener('pointerdown',e=>{e.preventDefault();pauseGame();});
    }

    if(new URLSearchParams(location.search).has('qa')){
      window.__NEON_QA__={
        snapshot:()=>({mode:state.mode,operation:state.operation,wave:state.wave,wavePhase:state.wavePhase,missionStage:state.missionStage,missionProgress:state.missionProgress,missionHold:state.missionHold,objective:state.objective,pending:state.pending.length,enemies:state.enemies.length,corpses:state.corpses.length,bloodDecals:state.bloodDecals.length,brokenGlass:state.brokenGlass.size,airborneEnemies:state.enemies.filter(enemy=>!enemy.grounded).length,score:player.score,kills:player.kills,shots:player.shots,hits:player.hits,z:player.z,vz:player.vz,grounded:player.grounded,jetFuel:player.jetFuel,health:player.health,shield:player.shield,armor:player.armor,shieldDelay:player.shieldDelay,ads:player.ads,autoLock:state.autoLock,lockTarget:state.lockTarget?.type||null,gore:state.gore,ammo:player.ammo,weapon:weaponConfig().id,carIndex:player.carIndex,melee:state.melee}),
        completePhase:()=>{state.qaInvulnerable=true;const def=missionStages()[state.missionStage];if(def?.type==='defend'){state.missionHold=0;}else if(def?.type==='hvt'){const boss=state.enemies.find(enemy=>enemy.commander&&!enemy.dead);if(boss)killEnemy(boss,false);else advanceMission();}else if(state.missionStage<missionStages().length-1)advanceMission();},
        teleport:(x=player.x,y=player.y)=>{player.x=Number(x);player.y=Number(y);player.z=surfaceHeight(player.x,player.y);},
        skipWait:()=>{state.waveTimer=0;state.spawnTimer=0},
        setInvulnerable:(value=true)=>{state.qaInvulnerable=!!value;},
        setAim:(value=true)=>{input.aim=!!value;},
        setAutoLock:(value=true)=>setAutoLock(!!value,false,false),
        setMissionStage:(stage=0)=>setMissionStage(Math.max(0,Math.min(missionStages().length-1,stage|0))),
        setOperation:(index=0)=>{if(state.mode==='menu')setOperation(index,false);},
        damageCommander:(fraction=.4)=>{const boss=state.enemies.find(e=>e.commander&&!e.dead);if(boss)boss.hp=Math.max(1,boss.hp-boss.maxHp*fraction);},
        setFlight:(value=true)=>{if(value)startJump();input.jump=!!value;},
        equipWeapon:(index=0)=>equipWeapon(index),
        melee:()=>meleeTakedown()
      };
    }
    window.__NEON_3D__={
      world:{map,WALL_HEIGHTS,GROUND_HEIGHT,MAP_W,MAP_H,STAIR_ZONES,enemyTypes:ENEMY_TYPES,weapons:WEAPONS},
      frame:()=>({mode:state.mode,timeOfDay:state.timeOfDay,totalTime:state.totalTime,camera:state.camera||getRenderCamera(),player,enemies:state.enemies,cars:state.cars,corpses:state.corpses,bloodDecals:state.bloodDecals,brokenGlass:state.brokenGlass,projectiles:state.projectiles,pickups:state.pickups,particles:state.particles,muzzle:state.muzzle,melee:state.melee,screenShake:state.screenShake,fov:viewFov(),missionStage:state.missionStage,missionProgress:state.missionProgress,objectiveTarget:state.objectiveTarget,wavePhase:state.wavePhase,gore:state.gore,commander:state.commander}),
      ready:(options={})=>{state.threeReady=!options.fallback;if(state.threeReady)document.body.classList.add('three-ready');else document.body.classList.add('three-fallback');},
      fail:(error)=>{state.threeReady=false;const screen=$('webglErrorScreen'),text=$('webglErrorText');if(text&&error)text.textContent=`The 3D renderer could not start (${String(error.message||error).slice(0,140)}). Update your browser or enable hardware acceleration to continue.`;screen?.classList.remove('hidden');}
    };
    const webglProbe=document.createElement('canvas');
    let webgl2Available=false;try{webgl2Available=!!webglProbe.getContext('webgl2');}catch{}
    if(webgl2Available)import('/scene3d.js').catch(error=>window.__NEON_3D__.fail(error));
    else window.__NEON_3D__.fail(new Error('WebGL2 context unavailable'));
    if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
    let preferredTime='day',preferredAutoLock=true,preferredGore=true,preferredOperation=0;try{preferredTime=localStorage.getItem('neon-breach-time')||'day';preferredAutoLock=localStorage.getItem('neon-breach-auto-lock')!=='off';preferredGore=localStorage.getItem('neon-breach-gore')!=='off';preferredOperation=Number(localStorage.getItem('neon-breach-operation')||0);}catch{}setMissionTime(preferredTime,false);setAutoLock(preferredAutoLock,false,false);setGore(preferredGore,false);setOperation(preferredOperation,false);renderArsenal();updateBestScore();loadCampaignRecords();initAssets();resize();setupTouch();render();requestAnimationFrame(frame);
