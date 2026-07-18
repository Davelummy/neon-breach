import { MAP_W, MAP_H, GROUND_HEIGHT, WALL_HEIGHTS, DIFFICULTIES, ENEMY_TYPES, WEAPONS, PERKS,
  CAR_SPAWNS, WAVE_TABLE, MISSIONS, OPERATIONS, MISSION_CONDITIONS, spawns, map, STAIR_ZONES,
  OP_RULES, MEDAL_DEFS, dailyModifier, evaluateMedals, applyOperationLayout } from '/data.js';
import { AudioSystem } from '/audio.js';

'use strict';

    const TEX = 64;

    const $ = (id) => document.getElementById(id);
    const canvas = $('game');
    const ctx = canvas.getContext('2d', { alpha: false });
    const radar = $('radar');
    const rctx = radar.getContext('2d');
    const coarsePointer = matchMedia('(pointer: coarse)').matches;
    const compatibilityMode = new URLSearchParams(location.search).get('renderer') === 'compat';
    const lowRenderPreset = compatibilityMode || new URLSearchParams(location.search).get('quality') === 'low' || (()=>{try{return localStorage.getItem('neon-breach-quality')==='low';}catch{return false;}})();
    const TAU = Math.PI * 2;
    const FOV = Math.PI / 3;

    const state = {
      mode: 'menu', difficulty: 'operative', wave: 0, wavePhase: 'idle', waveTimer: 0,
      pending: [], spawnTimer: 0, initialWaveCount: 0, enemies: [], projectiles: [], pickups: [], particles: [], cars: [],
      lastTime: 0, totalTime: 0, announcementTimer: 0, messageTimer: 0, screenShake: 0, muzzle: 0, melee: 0,
      musicTimer: 0, musicStep: 0, muted: false, touch: coarsePointer, qaInvulnerable: false,
      slowMo:0, eliteSpawned:false, objective:'HOLD THE ARES GRID', threatPulse:0, takedowns:0, roadkills:0, shieldFlash:0, armorFlash:0,
      timeOfDay:'day', camera:null, squadAlert:0, autoLock:true, lockTarget:null, corpses:[], bloodDecals:[], brokenGlass:new Set(), threeReady:false,gore:true,
      missionStage:0,missionHold:22,missionSpawnStep:0,missionProgress:0,objectiveTarget:[5.5,9.3],commsTimer:0,commander:null,extractionArmed:false,tutorialStep:0,operation:0,
      destroyNodes:[],hitStop:0,finisherCam:null,comboPeak:1,damageTaken:0,daily:null,lastMedals:[],
      familyMode:false,lookSens:1,invertY:false,lastPartyRank:null
    };
    // Shared prefs (sensitivity / family) — loaded once, saved on change.
    const prefs = { familyMode:false, lookSens:1, invertY:false, welcomeDone:false };
    try{
      prefs.familyMode=localStorage.getItem('neon-breach-family')==='on';
      prefs.invertY=localStorage.getItem('neon-breach-invert-y')==='on';
      prefs.welcomeDone=localStorage.getItem('neon-breach-welcome')==='1';
      const s=Number(localStorage.getItem('neon-breach-sens'));
      if(Number.isFinite(s)&&s>=.4&&s<=1.8)prefs.lookSens=s;
    }catch{}
    state.familyMode=prefs.familyMode;state.lookSens=prefs.lookSens;state.invertY=prefs.invertY;

    const player = {
      x: 11.5, y: 18.5, z: GROUND_HEIGHT, vz: 0, dir: -Math.PI/2, pitch: 0, health: 100, maxHealth: 100, shield: 50, maxShield: 50, armor:100, maxArmor:100, shieldDelay:0,
      ammo: 30, magSize: 30, reserve: 120, fireCooldown: 0, reloading: false, reloadTime: 1.45, reloadTimer: 0,
      spread: 0, recoil: 0, recoilKick: 0, recoilYaw: 0, swayX: 0, swayY: 0, breath: 0, sprintLock: 0, lookVx: 0, lookVy: 0,
      bob: 0, bobAmount: 0, score: 0, kills: 0, combo: 1, comboTimer: 0,
      hurtTimer: 0, alive: true, shots: 0, hits: 0, grounded: true, jetFuel: 100, jetting: false, ads: 0, stepTimer: 0, jetSoundTimer: 0, heartTimer: 0,
      weaponIndex:0,weaponSlots:[],carIndex:-1,gamepadAimValue:0,moveVx:0,moveVy:0,strafe:0
    };
    const renderCamera = { x: 0, y: 0, z: 0, dir: 0, pitch: 0, roll: 0 };
    const threeFrame = {};

    const input = { forward:false, back:false, left:false, right:false, sprint:false, fire:false, shiftFire:false, pointerFire:false, aim:false, jump:false,gamepadFire:false,gamepadAim:false,gamepadAimValue:0,gamepadJump:false,gamepadSprint:false };
    let moveAxis = {x:0,y:0};
    let controllerAxis = {x:0,y:0};
    let gamepadPrevious = [];
    let activeGamepad = null;
    let menuFocusIndex = 0;
    let menuNavCooldown = 0;
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
    function perkApply(id){return PERKS.find(p=>p.id===id)?.apply||{};}
    function applyPerks(fresh){
      player.maxArmor=perkUnlocked('plating')?perkApply('plating').maxArmor:100;
      player.maxShield=perkUnlocked('aegis')?perkApply('aegis').maxShield:50;
      player.jetRecharge=perkUnlocked('jets')?perkApply('jets').jetRecharge:1;
      player.takedownHeal=perkUnlocked('vampire')?perkApply('vampire').takedownHeal:0;
      player.vehicleHp=perkUnlocked('hull')?perkApply('hull').vehicleHp:100;
      if(fresh){player.armor=player.maxArmor;player.shield=player.maxShield;}
      else{player.armor=Math.min(player.armor,player.maxArmor);player.shield=Math.min(player.shield,player.maxShield);}
      if(perkUnlocked('mags')){const mult=perkApply('mags').reserveMult;for(const [index,slot] of player.weaponSlots.entries())slot.reserve=Math.ceil(WEAPONS[index].reserve*mult);player.reserve=player.weaponSlots[player.weaponIndex].reserve;}
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
      if(state.mode==='playing'&&state.daily?.rules?.weaponLock!=null&&index!==state.daily.rules.weaponLock){if(!silent)showMessage('DAILY LOCK // WEAPON FIXED');return;}
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
      Object.assign(player,{x:11.5,y:18.5,z:GROUND_HEIGHT,vz:0,dir:-Math.PI/2,pitch:0,health:100,shield:50,armor:100,shieldDelay:0,ammo:30,reserve:120,fireCooldown:0,reloading:false,reloadTimer:0,spread:0,recoil:0,recoilKick:0,recoilYaw:0,swayX:0,swayY:0,breath:0,sprintLock:0,lookVx:0,lookVy:0,bob:0,bobAmount:0,score:0,kills:0,combo:1,comboTimer:0,hurtTimer:0,alive:true,shots:0,hits:0,grounded:true,jetFuel:100,jetting:false,ads:0,stepTimer:0,jetSoundTimer:0,heartTimer:0,weaponIndex:0,weaponSlots:WEAPONS.map(cfg=>({ammo:cfg.mag,reserve:cfg.reserve})),carIndex:-1,gamepadAimValue:0,moveVx:0,moveVy:0,strafe:0});
      equipWeapon(0,true);
    }

    function opRules(){return OP_RULES[currentOp()?.id]||OP_RULES['first-strike']||{};}

    function setOperation(index,persist=true){
      const selected=OPERATIONS[index]?index:0,op=OPERATIONS[selected];state.operation=selected;
      document.querySelectorAll('[data-operation]').forEach(button=>button.classList.toggle('active',Number(button.dataset.operation)===selected));
      const deploy=$('deployButton');if(deploy)deploy.textContent=`Deploy ${op.name}`;
      const brief=$('operationTagline');if(brief)brief.textContent=op.tagline;
      const deployName=$('deployOpName');if(deployName)deployName.textContent=op.tagline||op.name;
      const rules=OP_RULES[op.id];
      if(rules?.forceTime){setMissionTime(rules.forceTime,false);document.querySelectorAll('[data-time]').forEach(btn=>{btn.disabled=true;btn.classList.toggle('active',btn.dataset.time===rules.forceTime);});}
      else document.querySelectorAll('[data-time]').forEach(btn=>{btn.disabled=false;});
      if(persist){try{localStorage.setItem('neon-breach-operation',String(selected));}catch{}}
      renderDailyPanel();
    }

    function showMenuScreen(id){
      document.querySelectorAll('.menu-screen').forEach(el=>el.classList.toggle('active',el.id===id));
      menuFocusIndex=0;
      if(id==='screenRanks')loadLeaderboard();
      requestAnimationFrame(()=>refreshMenuFocus(true));
    }

    // Gamepad / keyboard focus list for the active menu panel or pause modal.
    function menuUiRoot(){
      if(state.mode==='menu')return document.querySelector('#menuRoot .menu-screen.active');
      const modal=$('modalScreen');
      if(modal&&!modal.classList.contains('hidden'))return modal;
      return null;
    }
    function menuFocusables(){
      const root=menuUiRoot();
      if(!root)return[];
      return Array.from(root.querySelectorAll('button, input, select')).filter(el=>{
        if(el.disabled||el.classList.contains('hidden'))return false;
        if(el.getAttribute('aria-hidden')==='true')return false;
        // Skip display:none / zero-size (hidden continue, etc.)
        const r=el.getBoundingClientRect();
        return r.width>0&&r.height>0;
      });
    }
    function applyMenuFocus(index){
      const items=menuFocusables();
      if(!items.length){menuFocusIndex=0;return null;}
      menuFocusIndex=((index%items.length)+items.length)%items.length;
      const prev=document.querySelector('.menu-focus');
      items.forEach((el,i)=>{
        const on=i===menuFocusIndex;
        el.classList.toggle('menu-focus',on);
        if(on){try{el.focus({preventScroll:true});}catch{try{el.focus();}catch{}}}
      });
      // Soft focus tick when pad/keyboard moves selection (not on first paint).
      if(prev&&prev!==items[menuFocusIndex]&&(state.mode==='menu'||state.mode==='paused'||state.mode==='victory'||state.mode==='gameover')){
        ensureAudio();audio?.uiFocus?.();
      }
      items[menuFocusIndex]?.scrollIntoView?.({block:'nearest',behavior:'smooth'});
      return items[menuFocusIndex];
    }
    function refreshMenuFocus(preferPrimary=false){
      const items=menuFocusables();
      if(!items.length){menuFocusIndex=0;return;}
      if(preferPrimary){
        const p=items.findIndex(el=>el.classList.contains('primary')&&!el.classList.contains('hidden'));
        menuFocusIndex=p>=0?p:0;
      }else if(menuFocusIndex>=items.length)menuFocusIndex=0;
      applyMenuFocus(menuFocusIndex);
    }
    function clearMenuFocus(){
      document.querySelectorAll('.menu-focus').forEach(el=>el.classList.remove('menu-focus'));
    }
    function nudgeMenuControl(dx){
      const el=menuFocusables()[menuFocusIndex];
      if(!el||!dx)return false;
      if(el.type==='range'){
        const min=Number(el.min||0),max=Number(el.max||100),step=Number(el.step)||1;
        const next=Math.max(min,Math.min(max,Number(el.value)+dx*step*Math.max(1,Math.round((max-min)/20))));
        if(next===Number(el.value))return true;
        el.value=String(next);
        el.dispatchEvent(new Event('input',{bubbles:true}));
        return true;
      }
      if(el.tagName==='SELECT'){
        const next=Math.max(0,Math.min(el.options.length-1,el.selectedIndex+dx));
        if(next===el.selectedIndex)return true;
        el.selectedIndex=next;
        el.dispatchEvent(new Event('change',{bubbles:true}));
        return true;
      }
      // Horizontal groups (day/night, difficulty): move among sibling controls.
      const group=el.closest('.time-select, .difficulty, .nav-row, .setting-row');
      if(group){
        const peers=Array.from(group.querySelectorAll('button, input, select')).filter(n=>{
          if(n.disabled||n.classList.contains('hidden'))return false;
          const r=n.getBoundingClientRect();return r.width>0&&r.height>0;
        });
        const at=peers.indexOf(el);
        if(at>=0&&peers.length>1){
          const all=menuFocusables();
          const target=peers[Math.max(0,Math.min(peers.length-1,at+dx))];
          const idx=all.indexOf(target);
          if(idx>=0){applyMenuFocus(idx);return true;}
        }
      }
      return false;
    }
    function uiSoundKind(el){
      if(!el)return 'default';
      if(el.classList.contains('primary')||el.id==='deployButton'||el.id==='resumeButton'||el.id==='continueButton')return 'confirm';
      if(el.id==='quitButton')return 'back';
      const goto=el.dataset?.goto||'';
      if(goto==='screenMain'||goto==='screenOps'||/back/i.test(el.textContent||''))return 'back';
      if(el.id==='autoLockButton'||el.id==='goreButton'||el.dataset?.difficulty!=null||el.dataset?.time!=null||el.dataset?.operation!=null||el.id==='dailyButton')return 'toggle';
      if(el.tagName==='SELECT'||el.type==='range')return el.type==='range'?'slider':'toggle';
      return 'default';
    }
    function playUiClick(elOrKind){
      ensureAudio();
      const kind=typeof elOrKind==='string'?elOrKind:uiSoundKind(elOrKind);
      audio?.uiClick?.(kind);
    }
    function activateMenuFocus(){
      const el=menuFocusables()[menuFocusIndex];
      if(!el)return;
      if(el.tagName==='SELECT'){
        el.selectedIndex=(el.selectedIndex+1)%el.options.length;
        el.dispatchEvent(new Event('change',{bubbles:true}));
        playUiClick('toggle');
        rumble(.08,.12,40);
        return;
      }
      if(el.type==='range')return;
      // Click will also fire delegated ui sound; mark so we don't double-play.
      el.dataset.uiPadClick='1';
      playUiClick(el);
      rumble(.1,.16,45);
      el.click();
      delete el.dataset.uiPadClick;
      // Screens / modal state may change after click.
      requestAnimationFrame(()=>refreshMenuFocus(true));
    }
    function menuGoBack(){
      playUiClick('back');
      if(state.mode==='paused'){resumeGame();return;}
      if(state.mode!=='menu'){
        // Result / game-over modal → main menu.
        if($('modalScreen')&&!$('modalScreen').classList.contains('hidden')){returnToTitle();return;}
        return;
      }
      const active=document.querySelector('#menuRoot .menu-screen.active');
      const backMap={screenOps:'screenMain',screenDeploy:'screenOps',screenSettings:'screenMain',screenRecords:'screenMain',screenRanks:'screenMain',screenHow:'screenMain',screenControls:'screenMain'};
      const dest=backMap[active?.id];
      if(!dest)return;
      showMenuScreen(dest);
      rumble(.06,.1,35);
    }
    function updateMenuGamepad(pad,down,pressed,dt){
      menuNavCooldown=Math.max(0,menuNavCooldown-(dt||1/60));
      // Any pad activity can unlock browser audio for menu music.
      if(state.mode==='menu'){
        const any=down.some((v,i)=>v&&!gamepadPrevious[i]);
        if(any){ensureAudio();audio?.startMenuMusic?.();}
      }
      const items=menuFocusables();
      if(!items.length)return;
      if(!items[menuFocusIndex]?.classList.contains('menu-focus'))applyMenuFocus(menuFocusIndex);

      const ax=deadzone(pad.axes[0]||0,.38),ay=deadzone(pad.axes[1]||0,.38);
      let moveY=0,moveX=0;
      if(pressed(12))moveY=-1;else if(pressed(13))moveY=1;
      if(pressed(14))moveX=-1;else if(pressed(15))moveX=1;
      if(menuNavCooldown<=0){
        if(ay<-.55)moveY=-1;else if(ay>.55)moveY=1;
        if(ax<-.55)moveX=-1;else if(ax>.55)moveX=1;
      }
      if(moveX){
        if(!nudgeMenuControl(moveX))applyMenuFocus(menuFocusIndex+moveX);
        menuNavCooldown=.16;rumble(.04,.07,28);
      }
      if(moveY){
        applyMenuFocus(menuFocusIndex+moveY);
        menuNavCooldown=.16;rumble(.04,.07,28);
      }
      // Cross / A = confirm · Circle / B = back
      if(pressed(0))activateMenuFocus();
      if(pressed(1))menuGoBack();
    }

    function readSavedVolumePercent(){
      // Slider stores 0–100. Older builds may have written a 0–1 fraction by mistake.
      let raw=null;
      try{raw=localStorage.getItem('neon-breach-volume');}catch{}
      if(raw==null||raw==='')return 28;
      let n=Number(raw);
      if(!Number.isFinite(n))return 28;
      if(n>0&&n<=1)n=Math.round(n*100); // fraction → percent
      n=Math.round(Math.max(0,Math.min(100,n)));
      // Volume 0 silences everything and feels "broken" — restore a usable default.
      if(n<=0)return 28;
      return n;
    }
    function applyMasterVolume(percent,{persist=true,fromUser=false}={}){
      let p=Number(percent);
      if(!Number.isFinite(p))p=28;
      p=Math.max(0,Math.min(100,Math.round(p)));
      const vol=$('settingVolume');
      if(vol)vol.value=String(p);
      // Keep 0 if user deliberately dragged to mute-via-slider; otherwise never start silent.
      if(!fromUser&&p<=0)p=28;
      if(vol&&Number(vol.value)!==p)vol.value=String(p);
      const linear=Math.max(0,Math.min(1,p/100));
      state.masterVolume=linear;
      window.__NEON_VOLUME__=linear;
      if(persist){try{localStorage.setItem('neon-breach-volume',String(p));}catch{}}
      if(audio?.master)audio.master.gain.value=state.muted?0:linear;
      const label=$('volumeValue');
      if(label)label.textContent=`${p}%`;
      return linear;
    }
    function bindMenuNav(){
      document.querySelectorAll('[data-goto]').forEach(btn=>{
        btn.addEventListener('click',()=>showMenuScreen(btn.dataset.goto));
      });
      const vol=$('settingVolume');
      if(vol){
        applyMasterVolume(readSavedVolumePercent(),{persist:true,fromUser:false});
        vol.addEventListener('input',()=>{
          applyMasterVolume(vol.value,{persist:true,fromUser:true});
          ensureAudio();
          // Don't play a click when at 0 — would be silent anyway.
          if(Number(vol.value)>0)audio?.uiClick?.('slider');
        });
      }else{
        applyMasterVolume(28,{persist:false});
      }
      const quality=$('settingQuality');
      if(quality){
        try{quality.value=localStorage.getItem('neon-breach-quality')==='low'?'low':'auto';}catch{}
        quality.addEventListener('change',()=>{
          const low=quality.value==='low';
          try{if(low)localStorage.setItem('neon-breach-quality','low');else localStorage.removeItem('neon-breach-quality');}catch{}
          if(window.__NEON_FX__?.force)window.__NEON_FX__.force(low?0:null);
          playUiClick('toggle');
        });
      }
      const callsign=$('settingCallsign');
      if(callsign){
        callsign.value=getCallsign();
        callsign.addEventListener('change',()=>{setCallsign(callsign.value);playUiClick('toggle');showMessage(`Callsign // ${getCallsign()}`);});
        callsign.addEventListener('blur',()=>setCallsign(callsign.value));
      }
      const syncInput=$('settingSyncCode');
      if(syncInput){
        syncInput.value=getSyncCode();
        $('copySyncCode')?.addEventListener('click',async()=>{
          try{await navigator.clipboard.writeText(getSyncCode());showMessage('Transfer code copied');playUiClick('confirm');}
          catch{showMessage(getSyncCode());}
        });
        $('applySyncCode')?.addEventListener('click',()=>{
          const code=setSyncCode(syncInput.value);
          campaignCloud.offline=false;
          playUiClick('confirm');
          showMessage(`Sync code // ${code}`);
          loadCampaignRecords();
        });
      }
      const partyInput=$('settingPartyCode');
      if(partyInput){
        partyInput.value=getPartyCode();
        partyInput.addEventListener('change',()=>{setPartyCode(partyInput.value);loadLeaderboard();playUiClick('toggle');});
        $('createPartyCode')?.addEventListener('click',()=>{
          const code=createPartyCode();
          if(partyInput)partyInput.value=code;
          playUiClick('confirm');
          showMessage(`Party ${code} — share invite link`);
          loadLeaderboard();
        });
        $('leavePartyCode')?.addEventListener('click',()=>{
          setPartyCode('');
          if(partyInput)partyInput.value='';
          playUiClick('back');
          showMessage('Back on world board');
          loadLeaderboard();
        });
      }
      // Operation filter chips on ranks screen
      const filterHost=$('rankOpFilter');
      if(filterHost&&!filterHost.dataset.ready){
        filterHost.dataset.ready='1';
        const makeChip=(label,op)=>{
          const btn=document.createElement('button');
          btn.type='button';btn.textContent=label;btn.dataset.op=op===null?'all':String(op);
          if(op===null)btn.classList.add('active');
          btn.addEventListener('click',()=>{
            leaderboardOpFilter=op;
            filterHost.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===btn));
            playUiClick('toggle');
            loadLeaderboard();
          });
          filterHost.append(btn);
        };
        makeChip('ALL',null);
        OPERATIONS.forEach((op,i)=>makeChip(op.short||`OP${i+1}`,i));
      }
      const sens=$('settingSens');
      if(sens){
        sens.value=String(Math.round(prefs.lookSens*100));
        const sensLabel=$('sensValue');if(sensLabel)sensLabel.textContent=`${sens.value}%`;
        sens.addEventListener('input',()=>{
          prefs.lookSens=Math.max(.4,Math.min(1.8,Number(sens.value)/100));
          state.lookSens=prefs.lookSens;
          if(sensLabel)sensLabel.textContent=`${sens.value}%`;
          try{localStorage.setItem('neon-breach-sens',String(prefs.lookSens));}catch{}
        });
      }
      const syncToggle=(btn,on,labelOn='On',labelOff='Off')=>{
        if(!btn)return;
        btn.classList.toggle('active',on);
        btn.setAttribute('aria-pressed',String(on));
        btn.textContent=on?labelOn:labelOff;
      };
      const familyBtn=$('familyModeButton');
      syncToggle(familyBtn,prefs.familyMode);
      familyBtn?.addEventListener('click',()=>{
        prefs.familyMode=!prefs.familyMode;state.familyMode=prefs.familyMode;
        try{localStorage.setItem('neon-breach-family',prefs.familyMode?'on':'off');}catch{}
        syncToggle(familyBtn,prefs.familyMode);
        playUiClick('toggle');
        showMessage(prefs.familyMode?'Family mode on — gentler combat':'Family mode off');
      });
      const invertBtn=$('invertYButton');
      syncToggle(invertBtn,prefs.invertY);
      invertBtn?.addEventListener('click',()=>{
        prefs.invertY=!prefs.invertY;state.invertY=prefs.invertY;
        try{localStorage.setItem('neon-breach-invert-y',prefs.invertY?'on':'off');}catch{}
        syncToggle(invertBtn,prefs.invertY);
        playUiClick('toggle');
      });
      bindUiSounds();
      armMenuMotion();
      armClickAndWelcomeGates();
    }

    function armClickAndWelcomeGates(){
      const skip=new URLSearchParams(location.search).has('qa')||new URLSearchParams(location.search).has('nologo');
      const clickGate=$('clickGate'), welcome=$('welcomeGate');
      if(skip){
        clickGate?.classList.add('hidden');
        welcome?.classList.add('hidden');
        prefs.welcomeDone=true;
        return;
      }
      // Always show click gate so browsers unlock audio.
      clickGate?.classList.remove('hidden');
      const enter=()=>{
        ensureAudio();
        audio?.startMenuMusic?.();
        clickGate?.classList.add('hidden');
        clickGate?.removeEventListener('click',enter);
        if(!prefs.welcomeDone)openWelcome();
      };
      clickGate?.addEventListener('click',enter);
      // Keyboard also unlocks
      const keyEnter=e=>{if(clickGate&&!clickGate.classList.contains('hidden')){e.preventDefault();enter();removeEventListener('keydown',keyEnter);}};
      addEventListener('keydown',keyEnter);
    }
    function openWelcome(){
      const welcome=$('welcomeGate');
      if(!welcome){prefs.welcomeDone=true;return;}
      welcome.classList.remove('hidden');
      const input=$('welcomeCallsign');
      if(input){input.value=getCallsign()==='OPERATIVE'?'':getCallsign();setTimeout(()=>input.focus(),80);}
      let family=prefs.familyMode;
      const fam=$('welcomeFamily'),std=$('welcomeStandard');
      const paint=()=>{fam?.classList.toggle('on',family);std?.classList.toggle('on',!family);};
      paint();
      fam?.addEventListener('click',()=>{family=true;paint();playUiClick('toggle');});
      std?.addEventListener('click',()=>{family=false;paint();playUiClick('toggle');});
      const finish=()=>{
        if(input?.value?.trim())setCallsign(input.value);
        else if(getCallsign()==='OPERATIVE')setCallsign('UNIT07');
        prefs.familyMode=family;state.familyMode=family;
        try{
          localStorage.setItem('neon-breach-family',family?'on':'off');
          localStorage.setItem('neon-breach-welcome','1');
        }catch{}
        prefs.welcomeDone=true;
        const familyBtn=$('familyModeButton');
        if(familyBtn){familyBtn.classList.toggle('active',family);familyBtn.setAttribute('aria-pressed',String(family));familyBtn.textContent=family?'On':'Off';}
        if(family){
          state.difficulty='recruit';
          document.querySelectorAll('[data-difficulty]').forEach(b=>b.classList.toggle('active',b.dataset.difficulty==='recruit'));
        }
        welcome.classList.add('hidden');
        ensureAudio();audio?.startMenuMusic?.();
        playUiClick('confirm');
        showMessage(family?`Welcome ${getCallsign()} · Family mode`:`Welcome ${getCallsign()}`);
      };
      $('welcomeGo')?.addEventListener('click',finish);
      input?.addEventListener('keydown',e=>{if(e.key==='Enter')finish();});
    }

    // Light parallax on menu motion layer (disabled if reduced-motion).
    function armMenuMotion(){
      if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      const layer=$('menuMotion');
      if(!layer)return;
      let mx=0,my=0,tx=0,ty=0,raf=0;
      const tick=()=>{
        mx+=(tx-mx)*.06;my+=(ty-my)*.06;
        layer.style.transform=`translate3d(${mx*12}px,${my*10}px,0)`;
        raf=requestAnimationFrame(tick);
      };
      raf=requestAnimationFrame(tick);
      addEventListener('pointermove',e=>{
        if(state.mode!=='menu')return;
        tx=(e.clientX/Math.max(1,innerWidth)-.5)*2;
        ty=(e.clientY/Math.max(1,innerHeight)-.5)*2;
      },{passive:true});
      // Pause parallax off-menu to save a few cycles.
      const stop=()=>{if(state.mode!=='menu'){tx=0;ty=0;}};
      setInterval(stop,800);
    }

    // Click / hover SFX for menu + pause / results buttons.
    function bindUiSounds(){
      let lastHover=null,hoverCooldown=0;
      document.addEventListener('click',e=>{
        const el=e.target.closest?.('button, .op-card, select');
        if(!el)return;
        // Menu, pause/results modal, and in-HUD mute only — not touch combat pads.
        if(!el.closest('#menuRoot, #modalScreen, #webglErrorScreen'))return;
        if(el.dataset.uiPadClick==='1')return; // already played from pad confirm
        playUiClick(el);
      },true);
      document.addEventListener('pointerover',e=>{
        if(state.mode!=='menu'&&state.mode!=='paused'&&state.mode!=='victory'&&state.mode!=='gameover')return;
        const el=e.target.closest?.('button, .op-card, select, input[type=range]');
        if(!el||!el.closest('#menuRoot, #modalScreen'))return;
        if(el===lastHover)return;
        const now=performance.now();
        if(now-hoverCooldown<40)return;
        hoverCooldown=now;lastHover=el;
        ensureAudio();audio?.uiHover?.();
      },true);
      document.addEventListener('pointerout',e=>{
        const el=e.target.closest?.('button, .op-card, select, input[type=range]');
        if(el&&el===lastHover)lastHover=null;
      },true);
    }
    function runBootSplash(){
      const splash=$('bootSplash'),menu=$('menuRoot');
      // Skip splash in automated QA so smoke tests stay fast.
      const skip=new URLSearchParams(location.search).has('qa')||new URLSearchParams(location.search).has('nologo');
      const openMenu=()=>{
        splash?.classList.add('hide');
        menu?.classList.remove('hidden');
        showMenuScreen('screenMain');
        setTimeout(()=>splash?.remove(),600);
      };
      if(!splash||skip){splash?.remove();menu?.classList.remove('hidden');showMenuScreen('screenMain');return;}
      setTimeout(openMenu,1800);
    }

    // Browsers block audio until a gesture — unlock + start menu music on first input.
    function armMenuMusicOnGesture(){
      const start=()=>{
        if(state.mode!=='menu'&&state.mode!=='paused'&&state.mode!=='victory'&&state.mode!=='gameover')return;
        // Un-mute if the only problem was a suspended context / zeroed gain.
        ensureAudio();
        if(state.muted){
          // Don't auto-unmute deliberate mute (◉/○ button) — only heal gain.
        }else if((state.masterVolume??0)<=0){
          applyMasterVolume(28,{persist:true,fromUser:false});
        }
        if(state.mode==='menu')audio?.startMenuMusic?.();
        removeEventListener('pointerdown',start);
        removeEventListener('keydown',start);
      };
      addEventListener('pointerdown',start,{once:false});
      addEventListener('keydown',start,{once:false});
    }

    function clearDaily(){state.daily=null;renderDailyPanel();}
    function engageDaily(){
      const mod=dailyModifier();
      state.daily=mod;
      if(mod.rules?.forceNight||mod.rules?.stalkerBoost)setMissionTime('night',false);
      if(mod.rules?.stalkerBoost)setOperation(1,false);
      showMessage(`DAILY // ${mod.label}`);
      renderDailyPanel();
    }
    function renderDailyPanel(){
      const mod=state.daily||dailyModifier();
      const title=$('dailyTitle'),desc=$('dailyDesc');
      if(title)title.textContent=state.daily?`ACTIVE // ${mod.label}`:`TODAY // ${mod.label}`;
      if(desc)desc.textContent=`${mod.desc} · seed ${mod.seed}`;
      const btn=$('dailyButton');if(btn){btn.textContent=state.daily?'CLEAR DAILY':'RUN DAILY CHALLENGE';btn.classList.toggle('active',!!state.daily);}
    }

    function setMissionTime(time,persist=true){
      const selected=MISSION_CONDITIONS[time]?time:'day',condition=MISSION_CONDITIONS[selected];state.timeOfDay=selected;const menuRoot=$('menuRoot');if(menuRoot)menuRoot.dataset.time=selected;
      document.querySelectorAll('[data-time]').forEach(button=>button.classList.toggle('active',button.dataset.time===selected));$('missionClock').textContent=condition.clock;$('missionCondition').textContent=condition.condition;$('missionBriefText').textContent=condition.brief;
      if(persist){try{localStorage.setItem('neon-breach-time',selected);}catch{}}
    }

    function setAutoLock(enabled,persist=true,announce=true){
      state.autoLock=!!enabled;if(!state.autoLock)state.lockTarget=null;const menuButton=$('autoLockButton'),touchButton=$('lockButton'),badge=$('lockModeBadge');
      if(menuButton){menuButton.classList.toggle('active',state.autoLock);menuButton.setAttribute('aria-pressed',String(state.autoLock));menuButton.textContent=state.autoLock?'On':'Off';}
      if(touchButton){touchButton.classList.toggle('active',state.autoLock);touchButton.setAttribute('aria-pressed',String(state.autoLock));touchButton.innerHTML=`AIM<br>${state.autoLock?'ON':'OFF'}`;}
      if(badge){badge.classList.toggle('active',state.autoLock);badge.textContent=state.autoLock?'AIM ASSIST ON':'AIM ASSIST OFF';}
      if(persist){try{localStorage.setItem('neon-breach-auto-lock',state.autoLock?'on':'off');}catch{}}
      if(announce&&state.mode==='playing'){showMessage(state.autoLock?'Aim assist on':'Aim assist off');rumble(.12,.2,55);}
    }
    function toggleAutoLock(){setAutoLock(!state.autoLock);}

    function setGore(enabled,persist=true){
      state.gore=!!enabled;const button=$('goreButton');if(button){button.classList.toggle('active',state.gore);button.setAttribute('aria-pressed',String(state.gore));button.textContent=state.gore?'On':'Off';}
      if(!state.gore){state.bloodDecals=[];state.particles=state.particles.filter(p=>p.color!=='#6f0711'&&p.color!=='#d62936');}
      if(persist){try{localStorage.setItem('neon-breach-gore',state.gore?'on':'off');}catch{}}
    }
    function toggleGore(){setGore(!state.gore);if(state.mode==='playing')showMessage(state.gore?'Combat effects on':'Combat effects off');}

    function ensureAudio(){
      if(!audio) audio=new AudioSystem(()=>state.muted);
      audio?.preloadVoices?.(['breach-inbound','sector-clear','mission-complete','hvt-down','vehicle-lost','game-over','victory']);
      // Browsers suspend AudioContext until a user gesture — always try to wake it.
      try{audio.resume?.();}catch{}
      try{if(audio.ctx?.state==='suspended')audio.ctx.resume();}catch{}
      let base=state.masterVolume;
      if(base==null||!Number.isFinite(base))base=window.__NEON_VOLUME__;
      if(base==null||!Number.isFinite(base)||base<0)base=.28;
      // If gain was accidentally zeroed without mute, heal it.
      if(!state.muted&&base<=0){
        base=applyMasterVolume(28,{persist:true,fromUser:false});
      }
      state.masterVolume=base;
      window.__NEON_VOLUME__=base;
      if(audio.master)audio.master.gain.value=state.muted?0:Math.max(0.0001,Math.min(1,base));
      return audio;
    }

    function startGame(saved=null) {
      ensureAudio();
      audio?.stopMenuMusic?.();
      audio?.startHum?.();
      if(saved){state.difficulty=DIFFICULTIES[saved.difficulty]?saved.difficulty:state.difficulty;setMissionTime(saved.time_of_day||state.timeOfDay,false);document.querySelectorAll('[data-difficulty]').forEach(button=>button.classList.toggle('active',button.dataset.difficulty===state.difficulty));setOperation(Math.max(0,Math.min(OPERATIONS.length-1,Number(saved.operation||0))),false);}
      const rules=opRules();
      if(!saved&&rules.forceTime)setMissionTime(rules.forceTime,false);
      if(!saved&&state.daily?.rules?.forceNight)setMissionTime('night',false);
      applyOperationLayout(currentOp().id);
      const stages=missionStages();
      const resumeStage=saved?Math.max(0,Math.min(stages.length-1,Number(saved.wave||1)-1)):0;
      resetPlayer();
      // Family mode: thicker vitals so younger / casual players get a fairer run.
      if(state.familyMode&&!saved){
        player.maxHealth=130;player.health=130;
        player.maxShield=70;player.shield=70;
        player.maxArmor=120;player.armor=120;
        if(!state.autoLock)setAutoLock(true,false,false);
      }
      if(!saved&&state.daily?.rules?.weaponLock!=null)equipWeapon(state.daily.rules.weaponLock,true);
      const vehicleHp=player.vehicleHp||100;Object.assign(state,{mode:'playing',wave:resumeStage+1,wavePhase:'mission',waveTimer:0,pending:[],spawnTimer:0,initialWaveCount:1,enemies:[],projectiles:[],pickups:[],particles:[],corpses:[],bloodDecals:[],brokenGlass:new Set(),cars:CAR_SPAWNS.map((car,index)=>({...car,index,occupied:false,speed:0,hp:vehicleHp,maxHp:vehicleHp,boost:100,engineTimer:0,steer:0,groundOffset:0})),totalTime:saved?Number(saved.elapsed_seconds||0):0,announcementTimer:0,messageTimer:0,screenShake:0,muzzle:0,melee:0,musicTimer:.2,musicStep:0,slowMo:0,hitStop:0,eliteSpawned:false,objective:stages[resumeStage].objective,objectiveTarget:[...stages[resumeStage].target],missionStage:resumeStage,missionHold:stages[resumeStage].hold||22,missionSpawnStep:0,missionProgress:0,commsTimer:0,commander:null,extractionArmed:false,tutorialStep:saved?99:0,threatPulse:0,takedowns:saved?Number(saved.takedowns||0):0,roadkills:saved?Number(saved.roadkills||0):0,shieldFlash:0,armorFlash:0,squadAlert:0,lockTarget:null,destroyNodes:[],finisherCam:null,comboPeak:1,damageTaken:0,lastMedals:[]});
      if(saved){player.health=Math.max(1,Number(saved.health||100));player.shield=Math.max(0,Number(saved.shield??50));player.armor=Math.max(0,Number(saved.armor??100));player.score=Number(saved.score||0);player.kills=Number(saved.kills||0);player.shots=Number(saved.shots||0);player.hits=Number(saved.hits||0);equipWeapon(Number(saved.weapon_index||0),true);campaignCloud.id=Number(saved.id);}else campaignCloud.id=null;
      applyPerks(!saved);
      clearMenuFocus();
      $('menuRoot')?.classList.add('hidden'); $('modalScreen').classList.add('hidden'); $('hud').classList.remove('hidden');
      if(coarsePointer)$('touchControls').classList.remove('hidden'); else{pointerWanted=true;requestLock();showMessage('WASD move · click to look');}
      beginOperation(resumeStage,!!saved);maybeStageVehicle(resumeStage);updateHUD();campaignCloud.saveTimer=12;saveCampaign('active',true);
      if(!saved)sendTelemetry('op_start',{operation:state.operation});
    }

    function maybeStageVehicle(stage){
      const rules=opRules();
      if(rules.vehicleStage!==stage)return;
      const car=state.cars.find(c=>!c.destroyed&&!c.occupied)||state.cars[0];
      if(!car)return;
      const target=state.objectiveTarget||[11.5,6.5];
      car.x=target[0]+1.2;car.y=target[1];car.dir=Math.PI/2;car.hp=car.maxHp;
      showComms('ARES COMMAND','Interceptor staged for this phase. Board with E / △ — armor denser on the ground.',4.5);
      showMessage('ARES INTERCEPTOR STAGED // VEHICLE PHASE');
    }

    // Pointer lock is for mouse-look only. Losing lock must NOT pause the sim —
    // that made WASD feel broken when the browser denied lock or the user hit Esc.
    let pointerWanted=false,pointerHeld=false,freeLook=false,freeLookLast=null;
    function requestLock(){
      if(coarsePointer||document.pointerLockElement===canvas)return;
      pointerWanted=true;
      try{const req=canvas.requestPointerLock?.();req?.catch?.(()=>{pointerWanted=false;if(state.mode==='playing')showMessage('CLICK THE VIEW TO CAPTURE MOUSE LOOK // WASD STILL MOVES');});}catch{pointerWanted=false;}
    }
    function pauseGame(){ if(state.mode!=='playing')return;pointerWanted=false;saveCampaign('active',true);state.mode='paused';input.fire=input.shiftFire=input.pointerFire=input.aim=input.jump=false;freeLook=false;document.exitPointerLock?.();$('modalEyebrow').textContent='PAUSED';$('modalTitle').textContent='Paused';$('modalText').textContent=state.familyMode?'Family mode is on. Click the view to look · R reload · F finisher.':'Resume when ready. Click the view for mouse look · Esc again to resume.';$('resultGrid').classList.add('hidden');$('resultRank')?.classList.remove('show');$('shareScoreButton')?.classList.add('hidden');$('resumeButton').textContent='Resume';$('quitButton').classList.remove('hidden');$('modalScreen').classList.remove('hidden');$('touchControls').classList.add('hidden');menuFocusIndex=0;requestAnimationFrame(()=>refreshMenuFocus(true)); }
    function resumeGame(){ if(state.mode!=='paused')return;state.mode='playing';$('modalScreen').classList.add('hidden');clearMenuFocus();if(coarsePointer)$('touchControls').classList.remove('hidden');else{pointerWanted=true;requestLock();showMessage('WASD move · click to look');}state.lastTime=performance.now(); }
    function returnToTitle(){
      if(state.mode==='playing'||state.mode==='paused')saveCampaign('active',true);
      state.mode='menu';document.exitPointerLock?.();
      $('modalScreen').classList.add('hidden');$('hud').classList.add('hidden');$('touchControls').classList.add('hidden');
      $('menuRoot')?.classList.remove('hidden');showMenuScreen('screenMain');
      $('shieldFx').style.opacity='0';$('armorFx').style.opacity='0';$('damageFlash').style.opacity='0';
      input.fire=input.shiftFire=input.pointerFire=input.aim=input.jump=false;
      updateNightVision();loadCampaignRecords();
      ensureAudio();audio?.stopHum?.();audio?.startMenuMusic?.();
    }

    function endGame(victory=false){
      audio?.say(victory?'victory':'game-over',true);
      state.mode=victory?'victory':'gameover';player.alive=false;state.finisherCam=null;input.fire=input.shiftFire=input.pointerFire=input.aim=input.jump=false;document.exitPointerLock?.();$('touchControls').classList.add('hidden');updateNightVision();
      const op=currentOp();
      $('modalEyebrow').textContent=victory?'MISSION COMPLETE':'KIA';$('modalTitle').textContent=victory?`${op.name}`:'Failed';
      const accuracyRatio=player.shots?player.hits/player.shots:0,accuracy=Math.round(accuracyRatio*100),minutes=Math.floor(state.totalTime/60),seconds=Math.floor(state.totalTime%60);
      let finalScore=player.score;
      if(victory&&state.daily?.rules?.speedBonus&&state.totalTime<420){const bonus=Math.round(finalScore*.12);finalScore+=bonus;player.score=finalScore;}
      const isBest=saveBestScore(finalScore);
      const medals=evaluateMedals({
        victory, healthPct:player.health/player.maxHealth, accuracy:accuracyRatio, comboPeak:state.comboPeak,
        roadkills:state.roadkills, totalTime:state.totalTime, takedowns:state.takedowns, damageTaken:state.damageTaken
      });
      state.lastMedals=medals;
      try{
        const key='neon-breach-medals';
        const prev=JSON.parse(localStorage.getItem(key)||'{}');
        for(const m of medals)prev[m.id]=(prev[m.id]||0)+1;
        localStorage.setItem(key,JSON.stringify(prev));
        if(state.daily)localStorage.setItem(`neon-breach-daily-${state.daily.seed}`,JSON.stringify({score:finalScore,victory,medals:medals.map(m=>m.id)}));
      }catch{}
      const medalText=medals.length?` Medals: ${medals.map(m=>m.name).join(', ')}.`:'';
      const failNudge=!victory?(state.familyMode?' Try again — Family mode keeps you in the fight.':' Tip: switch to Recruit or turn on Family mode in Settings.'):'';
      $('modalText').textContent=victory?`${op.debriefVictory} Extracted in ${minutes}:${String(seconds).padStart(2,'0')}.${isBest?' New personal best!':''}${medalText}`:`${getCallsign()} was lost during ${missionStages()[state.missionStage]?.title||op.name}.${isBest?' Still a new personal best on the board.':''}${medalText}${failNudge}`;
      const gradePoints=(accuracy>=55?2:accuracy>=38?1:0)+(player.health>=65?2:player.health>=30?1:0)+(state.totalTime<480?2:state.totalTime<720?1:0)+(player.kills>=16?2:player.kills>=10?1:0)+Math.min(2,medals.length),grade=victory?(gradePoints>=8?'S':gradePoints>=6?'A':gradePoints>=3?'B':'C'):'D';$('resultScore').textContent=finalScore.toLocaleString();$('resultKills').textContent=player.kills;$('resultAccuracy').textContent=`${accuracy}%`;$('resultTime').textContent=`${minutes}:${String(seconds).padStart(2,'0')}`;$('resultGrade').textContent=grade;
      const medalRow=$('resultMedals');if(medalRow){medalRow.textContent=medals.length?medals.map(m=>m.name).join(' · '):'NO MEDALS';medalRow.parentElement?.classList.toggle('hidden',false);}
      $('resultGrid').classList.remove('hidden');$('resumeButton').textContent='Play again';$('quitButton').classList.remove('hidden');
      const shareBtn=$('shareScoreButton');
      if(shareBtn){shareBtn.classList.remove('hidden');shareBtn.dataset.score=String(finalScore);shareBtn.dataset.grade=grade;shareBtn.dataset.victory=victory?'1':'0';shareBtn.dataset.kills=String(player.kills);}
      const rankEl=$('resultRank');if(rankEl){rankEl.classList.remove('show');rankEl.innerHTML='';}
      $('modalScreen').classList.remove('hidden');saveCampaign(victory?'victory':'failed',true);
      renderMedalCollection();
      // Party board — local + LAN host, no login required. Then celebrate rank.
      sendTelemetry(victory?'op_victory':'op_failed',{operation:state.operation});
      submitPartyScore({
        score:finalScore,kills:player.kills,grade,victory,
        operation:state.operation,difficulty:state.difficulty,time_of_day:state.timeOfDay,
        elapsed_seconds:Math.floor(state.totalTime)
      }).then(rank=>{
        if(!rank||!rankEl)return;
        state.lastPartyRank=rank;
        const medal=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':'◆';
        rankEl.innerHTML=`PARTY BOARD${rank<=3?' PODIUM':''}<b>${medal} RANK #${rank}</b>${getCallsign()}`;
        rankEl.classList.add('show');
        if(shareBtn)shareBtn.dataset.rank=String(rank);
        if(rank<=3)showMessage(`Podium! Party rank #${rank}`);
      });
      menuFocusIndex=0;requestAnimationFrame(()=>refreshMenuFocus(true));
    }

    function showComms(speaker,text,duration=4.4){const panel=$('missionComms');panel.querySelector('b').textContent=speaker;panel.querySelector('span').textContent=text;panel.classList.add('show');state.commsTimer=duration;}

    function spawnStorySquad(entries){
      for(const [type,x,y,options] of entries){
        spawnEnemy(type,[x,y],options||{});
        if(state.daily?.rules?.stalkerBoost&&type!=='stalker')spawnEnemy('stalker',[x+.45,y-.35],{});
      }
      state.initialWaveCount=Math.max(1,state.enemies.length);
    }

    function currentOp(){return OPERATIONS[state.operation]||OPERATIONS[0];}
    function missionStages(){return currentOp().stages;}

    function spawnMissionSquad(def){
      if(def.squad?.length){spawnStorySquad(def.squad);if(def.type==='hvt')state.commander=state.enemies.find(e=>e.commander)||null;}
    }

    function armDestroyNodes(def){
      state.destroyNodes=(def.nodes||[]).map((node,index)=>({
        id:index,x:node.x,y:node.y,hp:node.hp||90,maxHp:node.hp||90,dead:false
      }));
    }

    function nearestLiveNode(){
      let best=null,bestDist=Infinity;
      for(const node of state.destroyNodes){if(node.dead)continue;const dist=Math.hypot(node.x-player.x,node.y-player.y);if(dist<bestDist){best=node;bestDist=dist;}}
      return best;
    }

    function damageDestroyNode(node,amount){
      if(!node||node.dead)return false;
      node.hp=Math.max(0,node.hp-amount);
      spawnHitParticles(node.x,node.y,'#7fd0ff');
      state.screenShake=Math.max(state.screenShake,.35);
      if(node.hp>0){showMessage(`RELAY ${node.id+1} // ${Math.ceil(node.hp)}% INTEGRITY`);return false;}
      node.dead=true;spawnDeathParticles(node.x,node.y,'#31f5db');audio?.elite();rumble(.45,.7,120);
      const remaining=state.destroyNodes.filter(n=>!n.dead).length;
      showAnnouncement('RELAY DOWN',remaining?`${remaining} RELAY${remaining===1?'':'S'} REMAINING`:'VAULT CODES UNLOCKED',1.4);
      return true;
    }

    function fireBossAbility(boss,ability){
      if(!boss||!ability)return;
      boss.activeAbility=ability;
      if(ability==='shockwave'){
        const dist=Math.hypot(player.x-boss.x,player.y-boss.y);
        if(dist<4.2&&player.carIndex<0){
          const angle=Math.atan2(player.y-boss.y,player.x-boss.x),push=Math.min(1.15,4.2-dist)*.55;
          const nx=player.x+Math.cos(angle)*push,ny=player.y+Math.sin(angle)*push;
          if(canMovePlayer(nx,ny,.24)){player.x=nx;player.y=ny;}
          damagePlayer(12+Math.max(0,3.2-dist)*4);state.screenShake=1;showMessage('VOSS SHOCKWAVE // BREAK DISTANCE');
        }else showMessage('VOSS SHOCKWAVE // RANGE CLEAR');
        audio?.elite();rumble(.7,.9,160);for(let i=0;i<14;i++)state.particles.push({x:boss.x,y:boss.y,vx:(Math.random()-.5)*4,vy:(Math.random()-.5)*4,life:.45,max:.45,color:'#ff8c57'});
      }else if(ability==='cloak'){
        boss.cloakTimer=4.2;boss.hitFlash=0;showMessage('RAPTOR CLOAKED // TRACK MUZZLE FLASH');audio?.elite();
        for(let i=0;i<10;i++)state.particles.push({x:boss.x,y:boss.y,vx:(Math.random()-.5)*2,vy:(Math.random()-.5)*2,life:.55,max:.55,color:'#a66cff'});
      }else if(ability==='slam'){
        const dist=Math.hypot(player.x-boss.x,player.y-boss.y);
        if(dist<3.6){damagePlayer(18);state.screenShake=1.1;showMessage('WARDEN SLAM // MOVE');}
        else showMessage('WARDEN SLAM // FELT IT');
        audio?.roadkill();rumble(.85,1,200);for(let i=0;i<18;i++)state.particles.push({x:boss.x,y:boss.y,vx:(Math.random()-.5)*3.5,vy:(Math.random()-.5)*3.5,life:.5,max:.5,color:'#489bff'});
      }
    }

    function beginOperation(stage=0,resumed=false){
      const op=currentOp(),def=op.stages[stage];
      state.missionStage=stage;state.wave=stage+1;state.wavePhase='mission';state.objective=def.objective;state.objectiveTarget=[...def.target];
      if(def.type==='defend'){state.missionHold=def.hold;state.missionSpawnStep=0;}
      if(def.type==='destroy')armDestroyNodes(def);else state.destroyNodes=[];
      showAnnouncement(resumed?'MISSION RESTORED':`OPERATION ${op.name}`,`${MISSION_CONDITIONS[state.timeOfDay].label} // ${def.title}`,2.4);
      const nvgIntro=opRules().nightVision?' NVG feed is live — green phosphor, stay low.':'';
      showComms('Command',(resumed?`Resume phase ${stage+1}: ${def.objective.toLowerCase()}.`:def.comms)+nvgIntro,5.4);
      if(opRules().nightVision&&!resumed)showMessage('Night vision online');
      spawnMissionSquad(def);
      updateNightVision();
    }

    function setMissionStage(stage){
      const stages=missionStages();
      if(stage<0||stage>=stages.length||stage===state.missionStage)return;const def=stages[stage];
      state.missionStage=stage;state.wave=stage+1;state.missionProgress=0;state.objective=def.objective;state.objectiveTarget=[...def.target];
      if(def.type==='defend'){state.missionHold=def.hold;state.missionSpawnStep=0;}
      if(def.type==='destroy')armDestroyNodes(def);else state.destroyNodes=[];
      audio?.wave();audio?.say('breach-inbound');showAnnouncement(def.title,def.objective,2.2);showComms('Command',def.comms,5.2);player.shield=Math.min(player.maxShield,player.shield+12);player.armor=Math.min(player.maxArmor,player.armor+8);player.reserve=Math.min(Math.ceil(weaponConfig().reserve*1.5),player.reserve+Math.ceil(weaponConfig().mag*.6));
      spawnMissionSquad(def);
      maybeStageVehicle(stage);
      saveCampaign('active',true);
    }

    function advanceMission(){setMissionStage(state.missionStage+1);}

    function updateMission(dt){
      const def=missionStages()[state.missionStage];if(!def)return;
      const target=state.objectiveTarget||def.target,dist=Math.hypot(target[0]-player.x,target[1]-player.y);
      if(def.type==='reach'){
        state.missionProgress=Math.max(0,1-dist/(def.range||16));
        if(dist<(def.radius||1.45))advanceMission();
        else if(def.tutorial&&state.tutorialStep<4){
          if(state.tutorialStep===0&&state.totalTime>3){state.tutorialStep=1;showComms('Hint','WASD move · mouse look · LMB fire.',4.5);}
          else if(state.tutorialStep===1&&(player.shots>0||state.totalTime>12)){state.tutorialStep=2;showComms('Hint','RMB aim · R reload · 1–4 weapons.',4.5);}
          else if(state.tutorialStep===2&&state.enemies.some(e=>e.dead)){state.tutorialStep=3;showComms('Hint','F for close finishers. Chains raise score.',4);}
          else if(state.tutorialStep===3&&state.takedowns>0){state.tutorialStep=4;showComms('Hint','E enters vehicles near extraction.',4);}
        }
      }else if(def.type==='defend'){
        const holding=dist<(def.radius||2.25);if(holding)state.missionHold=Math.max(0,state.missionHold-dt);state.missionProgress=1-state.missionHold/def.hold;
        const reinforcements=def.reinforcements||[];
        if(state.missionSpawnStep<reinforcements.length&&state.missionHold<=reinforcements[state.missionSpawnStep].at){spawnStorySquad(reinforcements[state.missionSpawnStep].squad);state.missionSpawnStep++;showComms('Command',`Transfer ${Math.round(state.missionProgress*100)}%. Hostiles inbound.`,3.6);}
        if(!holding&&state.missionHold<def.hold-.5&&state.messageTimer<=0)showMessage('Return to the objective zone');if(state.missionHold<=0)advanceMission();
      }else if(def.type==='destroy'){
        const nodes=state.destroyNodes;const live=nodes.filter(n=>!n.dead);const total=Math.max(1,nodes.length);
        state.missionProgress=(total-live.length)/total;
        const focus=nearestLiveNode();if(focus)state.objectiveTarget=[focus.x,focus.y];
        if(live.length===0&&nodes.length)advanceMission();
        else if(state.messageTimer<=0&&focus&&Math.hypot(focus.x-player.x,focus.y-player.y)>8)showMessage('LOCATE VAULT RELAYS // FOLLOW THE MARKER');
      }else if(def.type==='hvt'){
        const boss=state.commander&&!state.commander.dead?state.commander:state.enemies.find(e=>e.commander&&!e.dead);
        if(boss){
          state.commander=boss;state.objectiveTarget=[boss.x,boss.y];state.missionProgress=1-boss.hp/boss.maxHp;
          if(boss.cloakTimer>0)boss.cloakTimer=Math.max(0,boss.cloakTimer-dt);
          boss.abilityCooldown=(boss.abilityCooldown||0)-dt;
          // Mid-phase ability pulses after the first escalation.
          if(boss.activeAbility&&boss.phase>0&&boss.abilityCooldown<=0){
            fireBossAbility(boss,boss.activeAbility);
            boss.abilityCooldown=5.8;
          }
          // Multi-phase escalation: each phase fires once as the boss's health
          // crosses its threshold — announcement, ability verb, summons, rage.
          const phases=def.boss?.phases||[];boss.phase=boss.phase||0;
          while(boss.phase<phases.length&&boss.hp/boss.maxHp<=phases[boss.phase].at){
            const phase=phases[boss.phase];boss.phase++;
            boss.rage=phase.speedMult||boss.rage||1;boss.rageFire=phase.fireMult||boss.rageFire||1;
            boss.suppression=0;boss.reactionTimer=0;if(boss.grounded&&ENEMY_TYPES[boss.type].charge){boss.chargeTimer=.8;boss.chargeCooldown=3;}
            if(phase.summon?.length)spawnStorySquad(phase.summon);
            fireBossAbility(boss,phase.ability);
            boss.abilityCooldown=4.5;
            showAnnouncement(phase.announce||'HVT ESCALATION',phase.sub||'HOSTILE REINFORCEMENTS INBOUND',2);
            if(phase.comms)showComms('ARES COMMAND',phase.comms,4);
            audio?.elite();state.screenShake=Math.max(state.screenShake,.85);rumble(.6,.85,180);
          }
        }
        else if(!state.enemies.some(e=>e.commander&&!e.dead))advanceMission();
      }else if(def.type==='extract'){
        if(player.carIndex>=0&&!state.extractionArmed){state.extractionArmed=true;state.objective=def.armObjective;state.objectiveTarget=[...def.beacon];showAnnouncement('EXTRACTION ROUTE',def.armAnnounce||'FOLLOW THE BEACON // BOOST AUTHORIZED',1.7);showComms('ARES COMMAND',def.armComms,4.2);}
        const extractionDist=Math.hypot(state.objectiveTarget[0]-player.x,state.objectiveTarget[1]-player.y);state.missionProgress=state.extractionArmed?Math.max(.35,1-extractionDist/15):.18;
        if(state.extractionArmed&&player.carIndex>=0&&extractionDist<1.55){state.wavePhase='complete';state.waveTimer=2.5;state.missionProgress=1;audio?.say('mission-complete');showAnnouncement('MISSION COMPLETE','UNIT 07 // EXTRACTION CONFIRMED',2.4);showComms('ARES COMMAND',currentOp().debriefComms,4.5);}
      }
    }

    function startWave(){
      state.wave++;state.wavePhase='active';state.pending=[...WAVE_TABLE[state.wave-1]];state.initialWaveCount=state.pending.length;state.spawnTimer=.25;state.eliteSpawned=false;state.objective=MISSIONS[state.wave-1].objective;
      audio?.wave();audio?.say('breach-inbound');showAnnouncement(MISSIONS[state.wave-1].title,state.objective,2.4);
    }

    function completeWave(){
      if(state.wave>=5){state.wavePhase='complete';state.waveTimer=2.6;showAnnouncement('GRID CLEAR','HOSTILE SIGNAL COLLAPSING',2.3);return;}
      state.wavePhase='between';state.waveTimer=4;player.shield=Math.min(player.maxShield,player.shield+18);player.armor=Math.min(player.maxArmor,player.armor+14);player.reserve=Math.min(Math.ceil(weaponConfig().reserve*1.5),player.reserve+Math.max(8,weaponConfig().mag));
      audio?.say('sector-clear');showAnnouncement('SECTOR CLEAR',`BREACH 0${state.wave+1} INBOUND // PROGRESS SAVED`,2.4);saveCampaign('active',true);
    }

    function spawnEnemy(type,forcedPos=null,options={}){
      let choices=spawns.map(p=>({p,d:Math.hypot(p[0]-player.x,p[1]-player.y)})).filter(o=>o.d>6).sort((a,b)=>b.d-a.d);
      const pool=choices.slice(0,Math.max(2,Math.ceil(choices.length*.65))); const pos=forcedPos||(pool[(Math.random()*pool.length)|0]||{p:spawns[0]}).p, spec=ENEMY_TYPES[type], diff=DIFFICULTIES[state.difficulty];
      const elite=options.elite??(state.wavePhase!=='mission'&&!state.eliteSpawned&&type===MISSIONS[state.wave-1]?.elite);if(elite){state.eliteSpawned=true;audio?.elite();showMessage(options.commander?'COMMANDER VOSS ENTERED THE GRID':`ELITE ${spec.name} ENTERED THE GRID`);}
      const maxHp=spec.hp*diff.enemyHealth*(elite?1.62:1),x=pos[0]+(forcedPos?0:(Math.random()-.5)*.35),y=pos[1]+(forcedPos?0:(Math.random()-.5)*.35),magazineSize=spec.magazine??12;state.enemies.push({type,variant:(Math.random()*3)|0,x,y,z:GROUND_HEIGHT,vz:0,grounded:true,jumpCooldown:.7+Math.random()*1.4,landingSquash:0,hp:maxHp,maxHp,fireCooldown:1+Math.random(),meleeCooldown:0,path:[],pathTimer:0,anim:Math.random()*TAU,hitFlash:0,dead:false,spawn:1,elite,commander:!!options.commander,dodgeTimer:0,dashCooldown:1.5+Math.random()*2,chargeTimer:0,chargeCooldown:2+Math.random()*2,flank:Math.random()<.5?-1:1,vx:0,vy:0,facing:Math.random()*TAU,awareness:options.commander?1:0,hadSight:false,reactionTimer:options.commander?.18:.45+Math.random()*.45,decisionTimer:.2+Math.random()*.35,combatState:options.commander?'hold':'patrol',lastSeenX:player.x,lastSeenY:player.y,tacticalTarget:null,patrolTarget:null,suppression:0,burstShots:2+((Math.random()*3)|0),magazineSize,rounds:magazineSize,reloadTimer:0,coverTimer:-1,peekTimer:0,searchTimer:.8,searchAngle:Math.random()*TAU,stuckTimer:0,lastMoveX:x,lastMoveY:y,role:options.commander?'assault':spec.role||'assault',phase:0,cloakTimer:0,activeAbility:null,rage:1,rageFire:1});
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
      state.melee=1;state.slowMo=.55;state.hitStop=.08;state.screenShake=1;state.takedowns++;target.hp=0;audio?.melee();rumble(1,1,210);
      // Cinematic finisher orbit — longer for commanders.
      const camDuration=target.commander?.95:.72;
      state.finisherCam={active:true,timer:camDuration,duration:camDuration,x:target.x,y:target.y,z:target.z||GROUND_HEIGHT,angle:player.dir+Math.PI*.65};
      document.getElementById('letterboxTop')?.classList.add('show');
      document.getElementById('letterboxBottom')?.classList.add('show');
      killEnemy(target,true,'takedown');player.score+=175;if(player.takedownHeal){player.health=Math.min(player.maxHealth,player.health+player.takedownHeal);showMessage(`FINISHER PROTOCOL // +${player.takedownHeal} VITALS`);}$('takedownFlash').style.opacity='.95';setTimeout(()=>$('takedownFlash').style.opacity='0',180);showAnnouncement(target.commander?'COMMANDER FINISHER':'FINISHER',`${ENEMY_TYPES[target.type].name} NEUTRALIZED // +175`,.9);
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
      // Options: pause / resume only — never skip the menu into a deploy.
      if(pressed(9)){if(state.mode==='playing')pauseGame();else if(state.mode==='paused')resumeGame();}
      if(pressed(4)&&state.mode==='playing')toggleAutoLock();
      if(state.mode!=='playing'){
        controllerAxis={x:0,y:0};input.gamepadFire=input.gamepadAim=input.gamepadJump=input.gamepadSprint=false;input.gamepadAimValue=0;
        updateMenuGamepad(pad,down,pressed,dt);
        gamepadPrevious=down;return;
      }
      controllerAxis={x:deadzone(pad.axes[0]||0),y:deadzone(pad.axes[1]||0)+(down[13]?1:0)-(down[12]?1:0)};
      const sens=lookScale(),lookX=deadzone(pad.axes[2]||0,.12)*sens,lookY=deadzone(pad.axes[3]||0,.12)*sens*pitchSign();if(player.carIndex>=0)state.cars[player.carIndex].dir=normAngle(state.cars[player.carIndex].dir+lookX*1.8*dt);else player.dir=normAngle(player.dir+lookX*2.65*dt);player.pitch=Math.max(-canvas.height*.2,Math.min(canvas.height*.2,player.pitch-lookY*canvas.height*.75*dt));
      input.gamepadFire=!!down[7];input.gamepadAimValue=pad.buttons[6]?.value||0;input.gamepadAim=input.gamepadAimValue>.08;input.gamepadJump=!!down[0];input.gamepadSprint=!!down[10];
      if(pressed(0)&&player.carIndex<0)startJump();if(pressed(2))reload();if(pressed(3)||(pressed(1)&&player.carIndex>=0))toggleVehicle();if(pressed(11))meleeTakedown();if(pressed(5)&&player.carIndex<0)cycleWeapon(1);if(pressed(14))cycleWeapon(-1);if(pressed(15))cycleWeapon(1);gamepadPrevious=down;
    }

    function update(dt){
      if(state.mode!=='playing')return;
      const realDt=dt;state.totalTime+=realDt;state.slowMo=Math.max(0,state.slowMo-realDt);state.hitStop=Math.max(0,state.hitStop-realDt);
      if(state.finisherCam?.active){state.finisherCam.timer-=realDt;if(state.finisherCam.timer<=0){state.finisherCam=null;document.getElementById('letterboxTop')?.classList.remove('show');document.getElementById('letterboxBottom')?.classList.remove('show');}}
      dt*=state.hitStop>0?.08:state.slowMo>0?.28:1;state.muzzle=Math.max(0,state.muzzle-dt*9);state.melee=Math.max(0,state.melee-dt*3.5);state.screenShake=Math.max(0,state.screenShake-dt*12);state.threatPulse=Math.max(0,state.threatPulse-dt);state.shieldFlash=Math.max(0,state.shieldFlash-dt*4.8);state.armorFlash=Math.max(0,state.armorFlash-dt*3.5);player.hurtTimer=Math.max(0,player.hurtTimer-dt);
      campaignCloud.saveTimer-=realDt;if(campaignCloud.saveTimer<=0){campaignCloud.saveTimer=15;saveCampaign('active');}
      state.musicTimer-=realDt;if(state.musicTimer<=0){
        const hostiles=state.enemies.length+state.pending.length;
        const intensity=Math.min(1,.18+hostiles*.12+(state.wavePhase==='mission'?state.missionProgress*.35:0)+(state.commander?.phase?state.commander.phase*.15:0));
        audio?.musicBeat(state.musicStep++,intensity,Math.max(1,state.wave+state.missionStage));
        // Slightly faster pulse when combat is hot.
        state.musicTimer=intensity>.65?.2:.26;
      }
      if(state.announcementTimer>0){state.announcementTimer-=dt;if(state.announcementTimer<=0)$('announcement').classList.remove('show');}
      if(state.messageTimer>0){state.messageTimer-=dt;if(state.messageTimer<=0)$('message').classList.remove('show');}
      if(state.commsTimer>0){state.commsTimer-=dt;if(state.commsTimer<=0)$('missionComms').classList.remove('show');}
      if(state.wavePhase==='mission')updateMission(dt);
      else if(state.wavePhase==='complete'){state.waveTimer-=dt;if(state.waveTimer<=0)endGame(true);}
      else if(state.wavePhase==='active'){
        if(state.pending.length){state.spawnTimer-=dt;if(state.spawnTimer<=0){spawnEnemy(state.pending.shift());state.spawnTimer=.62;}}
        else if(state.enemies.length===0)completeWave();
      }
      updatePlayer(dt);updateEnemies(dt);updateProjectiles(dt);updatePickups(dt);updateParticles(dt);updateCorpses(dt);updateHUD();updateNightVision();
    }

    function updateNightVision(){
      const active=state.mode==='playing'&&!!opRules().nightVision;
      document.body.classList.toggle('nvg-active',active);
      const badge=$('nvgBadge');if(badge)badge.classList.toggle('show',active);
      const overlay=$('nvgOverlay');if(overlay)overlay.classList.toggle('show',active);
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
      const previousX=player.x,previousY=player.y;
      player.fireCooldown=Math.max(0,player.fireCooldown-dt);
      // Recoil recovery — weapon recover mult keeps autos snappy, DMR/shotgun heavier.
      const wcfg=weaponConfig();
      const recoverBase=(player.ads>.5?11.5:8)*(wcfg.recover||1);
      player.recoil=Math.max(0,player.recoil-dt*recoverBase);
      player.recoilKick=Math.max(0,player.recoilKick-dt*(recoverBase*.9));
      player.recoilYaw+=(0-player.recoilYaw)*Math.min(1,dt*(5.5+(wcfg.recover||1)*2));
      player.spread=Math.max(0,player.spread-dt*(player.ads>.5?2.6:1.8));
      player.sprintLock=Math.max(0,player.sprintLock-dt);
      player.breath+=dt*(player.ads>.4?1.35:player.health<35?1.8:1);
      const shieldBefore=player.shield;player.shieldDelay=Math.max(0,player.shieldDelay-dt);if(player.shieldDelay<=0&&player.shield<player.maxShield)player.shield=Math.min(player.maxShield,player.shield+dt*7.5);if(shieldBefore<player.maxShield&&player.shield===player.maxShield)audio?.shieldReady();
      const aimTarget=player.reloading||player.sprintLock>.12?0:input.aim?1:input.gamepadAim?Math.max(.18,input.gamepadAimValue):0;player.ads+=(aimTarget-player.ads)*Math.min(1,dt*(player.sprintLock>0?5:10));updateAutoLock(dt);
      // Aim sway / breathing — stronger when hurt or free-looking.
      const swayAmp=(player.ads>.2?.012:.006)*(player.health<40?1.45:1)*(1+player.spread*2);
      const targetSwayX=Math.sin(player.breath*1.7)*swayAmp+Math.sin(player.breath*.61)*swayAmp*.35;
      const targetSwayY=Math.cos(player.breath*1.35)*swayAmp*.75+Math.sin(player.breath*.9)*swayAmp*.4;
      player.swayX+=(targetSwayX-player.swayX)*Math.min(1,dt*6);
      player.swayY+=(targetSwayY-player.swayY)*Math.min(1,dt*6);
      let f=(input.forward?1:0)-(input.back?1:0)-moveAxis.y-controllerAxis.y, s=(input.right?1:0)-(input.left?1:0)+moveAxis.x+controllerAxis.x;
      const len=Math.hypot(f,s);if(len>1){f/=len;s/=len;}
      player.strafe+=(s-player.strafe)*Math.min(1,dt*8);
      const sprinting=player.carIndex<0&&(input.sprint||input.gamepadSprint)&&f>.25&&!player.reloading&&player.ads<.15;
      if(sprinting)player.sprintLock=.16;
      if(player.carIndex>=0){
        const car=state.cars[player.carIndex],boosting=(input.jump||input.gamepadJump)&&Math.abs(f)>.2&&car.boost>0,topSpeed=boosting?10.8:7.1,targetSpeed=f*topSpeed;car.boost=Math.max(0,Math.min(100,car.boost+dt*(boosting?-31:16)));car.steer+=(s-car.steer)*Math.min(1,dt*7);car.dir=normAngle(car.dir+s*(boosting?1.35:1.75)*dt*Math.sign(targetSpeed||1));car.speed+=(targetSpeed-car.speed)*Math.min(1,dt*(boosting?4.6:3.2));
        const nx=car.x+Math.cos(car.dir)*car.speed*dt,ny=car.y+Math.sin(car.dir)*car.speed*dt;if(canMoveVehicle(nx,ny,player.carIndex)){car.x=nx;car.y=ny;}else{const impact=Math.abs(car.speed);car.speed*=-.18;state.screenShake=.65;rumble(.4,.6,85);if(impact>3.8)damageVehicle(car,impact*2.3);}
        for(const enemy of state.enemies){if(enemy.dead||enemy.spawn>0)continue;const hitDist=Math.hypot(enemy.x-car.x,enemy.y-car.y);if(hitDist<.74&&Math.abs(car.speed)>2.35){const speed=Math.abs(car.speed);enemy.hp-=speed*58;if(enemy.hp<=0){state.roadkills++;audio?.roadkill();killEnemy(enemy,false,'roadkill');player.score+=200;showMessage('VEHICLE TAKEDOWN // +200');rumble(.72,.9,130);}else{enemy.hitFlash=.18;enemy.dodgeTimer=.4;}car.speed*=.78;}}
        car.engineTimer-=dt;if(car.engineTimer<=0&&Math.abs(car.speed)>.35){audio?.engine(car.speed,boosting);car.engineTimer=boosting?.1:.18;}
        player.x=car.x;player.y=car.y;player.dir=car.dir;player.z=.62;player.vz=0;player.grounded=true;player.jetting=false;player.jetFuel=Math.min(100,player.jetFuel+dt*18);
      }else{
        // Slight acceleration feel instead of instant max speed.
        const maxSpeed=(sprinting?4.35:2.9)*(player.hurtTimer>0?.9:1)*(1-player.ads*.28)*(player.grounded?1:1.08)*(player.health<30?.92:1);
        const targetVx=(Math.cos(player.dir)*f+Math.cos(player.dir+Math.PI/2)*s)*maxSpeed;
        const targetVy=(Math.sin(player.dir)*f+Math.sin(player.dir+Math.PI/2)*s)*maxSpeed;
        const accel=player.grounded?(sprinting?16:13):7.5;
        player.moveVx+=(targetVx-player.moveVx)*Math.min(1,dt*accel);
        player.moveVy+=(targetVy-player.moveVy)*Math.min(1,dt*accel);
        const dx=player.moveVx*dt,dy=player.moveVy*dt;
        if(canMovePlayer(player.x+dx,player.y,.24))player.x+=dx;else player.moveVx*=.15;
        if(canMovePlayer(player.x,player.y+dy,.24))player.y+=dy;else player.moveVy*=.15;
        const jetBlocked=!!state.daily?.rules?.noJet;
        player.jetting=!jetBlocked&&(input.jump||input.gamepadJump)&&!player.grounded&&player.jetFuel>0&&player.z<2.45;
        if(player.jetting){player.vz=Math.min(3.25,player.vz+11.5*dt);player.jetFuel=Math.max(0,player.jetFuel-29*dt);player.jetSoundTimer-=dt;if(player.jetSoundTimer<=0){audio?.jet();player.jetSoundTimer=.13;}}
        else {player.vz-=8.7*dt;const jetMult=player.jetRecharge||1;player.jetFuel=Math.min(100,player.jetFuel+dt*(player.grounded?22:4)*jetMult);}
        player.z+=player.vz*dt;const floorZ=surfaceHeight(player.x,player.y);
        if(player.z<=floorZ){
          if(!player.grounded&&player.vz<-1.6){
            const impact=Math.abs(player.vz);
            audio?.land();rumble(.14+impact*.04,.28+impact*.05,60+impact*12);
            state.screenShake=Math.min(1,impact*.16);
            // Hard landings open the reticle and kick the camera.
            player.spread=Math.min(.16,player.spread+.04+impact*.02);
            player.recoilKick=Math.min(1.1,player.recoilKick+impact*.06);
          }
          player.z=floorZ;player.vz=0;player.grounded=true;
        }else player.grounded=false;
      }

      player.bobAmount+=(Math.min(1,len)*(sprinting?1.35:1)*(player.grounded?1:0)-player.bobAmount)*Math.min(1,dt*8);player.bob+=dt*(sprinting?13.5:9.5)*Math.max(.12,len);
      if(len>.08)player.spread=Math.min(.14,player.spread+dt*(sprinting?.26:.09)*(1-player.ads*.7)*(player.grounded?1:1.35));
      if(player.sprintLock>0)player.spread=Math.min(.16,player.spread+dt*.18);
      if(player.carIndex<0&&player.grounded&&len>.18){player.stepTimer-=dt;if(player.stepTimer<=0){audio?.footstep(sprinting,state.timeOfDay==='night');player.stepTimer=sprinting?.26:.4+(Math.random()*.04);}}else player.stepTimer=0;
      // Low-health heartbeat + peripheral pulse.
      if(player.health<38&&player.carIndex<0){
        player.heartTimer-=dt;
        if(player.heartTimer<=0){
          audio?.heartbeat?.(1-player.health/38);
          player.heartTimer=.55+player.health*.012;
          const pulse=$('damageFlash');
          if(pulse&&player.health<28){pulse.style.opacity=String(.12+(.28-player.health)*.01);setTimeout(()=>{if(player.health>0)pulse.style.opacity='0';},90);}
        }
      }
      if(player.comboTimer>0){player.comboTimer-=dt;if(player.comboTimer<=0){player.combo=1;$('combo').classList.remove('show');}}
      if(player.reloading){player.reloadTimer-=dt;if(player.reloadTimer<=0){const need=player.magSize-player.ammo,take=Math.min(need,player.reserve);player.ammo+=take;player.reserve-=take;player.reloading=false;player.spread=Math.min(.1,player.spread+.02);audio?.reloadComplete?.();showMessage('MAGAZINE SYNCHRONIZED');}}
      if(player.carIndex>=0){const instantVx=(player.x-previousX)/Math.max(.001,dt),instantVy=(player.y-previousY)/Math.max(.001,dt);player.moveVx+=(instantVx-player.moveVx)*Math.min(1,dt*9);player.moveVy+=(instantVy-player.moveVy)*Math.min(1,dt*9);}
      if(player.carIndex<0&&(input.fire||input.gamepadFire)&&!player.reloading&&player.fireCooldown<=0)shoot();
    }

    function startJump(){
      if(state.mode!=='playing')return;
      if(state.daily?.rules?.noJet){if(player.carIndex<0&&player.grounded){player.vz=2.55;player.grounded=false;showMessage('DEAD THRUSTERS // JUMP ONLY');}return;}
      if(player.carIndex<0&&player.grounded){player.vz=3.45;player.grounded=false;audio?.footstep(true);showMessage('JET ASSIST ONLINE // HOLD SPACE TO CLIMB');}
    }

    function reload(){
      if(state.mode!=='playing'||player.reloading||player.ammo===player.magSize||player.reserve<=0)return;
      player.reloading=true;player.reloadTimer=player.reloadTime;input.fire=input.shiftFire=input.pointerFire=false;player.ads=Math.min(player.ads,.15);audio?.reload(weaponConfig().id);showMessage('RELOADING');
    }

    function weaponRangeFalloff(cfg,dist){
      // Realistic energy drop: shotgun falls hard, DMR holds, rifle mid, pistol soft mid-range.
      if(cfg.id==='shotgun')return Math.max(.32,1-dist/14.5);
      if(cfg.id==='pistol')return Math.max(.55,1-dist/26);
      if(cfg.id==='dmr')return Math.max(.78,1-dist/48);
      return Math.max(.62,1-dist/34);
    }

    function shoot(){
      const cfg=weaponConfig();if(player.ammo<=0){player.fireCooldown=.18;audio?.empty();showMessage('MAGAZINE EMPTY // PRESS R OR □');return;}
      if(state.autoLock&&player.carIndex<0){const directional=selectAutoLockTarget(true);if(directional){state.lockTarget=directional;player.dir=Math.atan2(directional.y-player.y,directional.x-player.x);}}
      if(state.daily?.rules?.weaponLock!=null&&player.weaponIndex!==state.daily.rules.weaponLock){equipWeapon(state.daily.rules.weaponLock,true);return;}
      player.ammo--;player.shots++;
      // Patterned recoil: first-shot tight, then climb/yaw per weapon profile.
      const firstShot=player.recoil<.07;
      const adsFactor=player.ads>.55?.52:player.ads>.25?.72:1;
      const sprintPenalty=player.sprintLock>0?1.4:1;
      const movePenalty=1+Math.min(.45,Math.hypot(player.moveVx,player.moveVy)*.07);
      player.fireCooldown=cfg.cooldown*(player.sprintLock>0?1.05:1);
      // Auto rifle heat: spread climbs mid-mag, then plateaus.
      const heat=cfg.id==='rifle'?1+Math.min(.55,player.recoil*1.1):1;
      player.spread=Math.min(.22,player.spread+cfg.spread*(1-player.ads*.7)*sprintPenalty*(firstShot?.48:1)*movePenalty*heat);
      const climb=cfg.recoilClimb??cfg.recoil*.07;
      const yawBase=cfg.recoilYaw??cfg.recoil*.04;
      const kick=cfg.recoil*adsFactor*(firstShot?.78:1.05);
      player.recoil=Math.min(1.2,player.recoil+kick);
      player.recoilKick=Math.min(1.4,player.recoilKick+kick*(cfg.id==='shotgun'?1.35:cfg.id==='dmr'?1.15:1));
      // Vertical climb (always up) + horizontal pattern (rifle drifts right under sustained fire).
      const pitchKick=climb*adsFactor*(firstShot?.7:1)*(cfg.id==='shotgun'?1.4:1);
      player.pitch=Math.max(-canvas.height*.2,Math.min(canvas.height*.2,player.pitch-pitchKick*canvas.height*(.9+Math.random()*.25)));
      let yawKick=0;
      if(cfg.id==='rifle'){
        // Classic AR: slight right bias that grows with heat, tiny left jitter.
        yawKick=(.55+player.recoil*.8)*yawBase*adsFactor+(Math.random()-.55)*yawBase*.6;
      }else if(cfg.id==='shotgun'){
        yawKick=(Math.random()-.5)*yawBase*2.2*adsFactor;
      }else if(cfg.id==='pistol'){
        yawKick=(Math.random()-.48)*yawBase*1.6*adsFactor;
      }else{
        // DMR — mostly vertical, minimal side
        yawKick=(Math.random()-.5)*yawBase*.7*adsFactor;
      }
      player.recoilYaw=Math.max(-.14,Math.min(.14,player.recoilYaw+yawKick));
      player.dir=normAngle(player.dir+yawKick);
      state.muzzle=1;
      // Keep shake short/snappy — no mushy camera lag.
      const noise=opRules().noiseMult||1;state.squadAlert=(state.timeOfDay==='night'?4.2:2.8)*noise;
      state.screenShake=Math.min(.85,state.screenShake+(player.ads>.5?cfg.recoil*.28:cfg.recoil*.5)+(cfg.id==='shotgun'?.14:0));
      audio?.shoot(cfg.id);audio?.brass?.(cfg.id);rumble(cfg.id==='shotgun'?.55:.18,cfg.id==='shotgun'?.75:.35,cfg.id==='shotgun'?90:42);
      const horizon=canvas.height/2+player.pitch-player.recoilKick*canvas.height*.02,diff=DIFFICULTIES[state.difficulty];let registeredHit=false;
      for(let pellet=0;pellet<cfg.pellets;pellet++){
        const baseSpread=(player.spread+cfg.spread*(firstShot?.28:.42))*(1-player.ads*.76)+.0012+Math.abs(player.swayX)*.4;
        const shotSpread=baseSpread*sprintPenalty;
        const locked=state.autoLock&&state.lockTarget&&!state.lockTarget.dead;
        const baseAngle=locked?Math.atan2(state.lockTarget.y-player.y,state.lockTarget.x-player.x):player.dir;
        const angle=baseAngle+(Math.random()-.5)*shotSpread*(locked?.26:1)+player.swayX*.35;
        breakGlassInDirection(angle);
        const ray=castRay(angle,player.x,player.y,40,player.z);let target=null,best=Infinity,critical=false,hitZone='body';
        for(const e of state.enemies){
          if(e.dead)continue;const spec=ENEMY_TYPES[e.type],dx=e.x-player.x,dy=e.y-player.y,dist=Math.hypot(dx,dy),a=Math.abs(normAngle(Math.atan2(dy,dx)-angle));if(dist>ray.dist+.25||a>Math.atan2(spec.radius*(locked&&e===state.lockTarget?1.45:.92),dist))continue;
          const size=canvas.height/dist*spec.scale,centerY=horizon+(player.z-(e.z||GROUND_HEIGHT))*canvas.height/dist+Math.sin(e.anim)*size*.015,headY=centerY-size*.28,chestY=centerY-size*.08;
          const verticalJitter=(Math.random()-.5)*shotSpread*canvas.height+player.swayY*canvas.height*.5,aimY=canvas.height/2+verticalJitter;
          const bodyHit=locked&&e===state.lockTarget?true:Math.abs(aimY-centerY)<size*.5;
          if(bodyHit&&dist<best&&lineOfSight(player.x,player.y,e.x,e.y,player.z)){
            target=e;best=dist;
            if(Math.abs(aimY-headY)<size*.13){critical=true;hitZone='head';}
            else if(Math.abs(aimY-chestY)<size*.18)hitZone='chest';
            else hitZone='body';
          }
        }
        if(target){
          if(!registeredHit){player.hits++;registeredHit=true;}
          const rangeFalloff=weaponRangeFalloff(cfg,best);
          const nightPistol=(state.timeOfDay==='night'&&cfg.id==='pistol')?(opRules().pistolNightBonus||1):1;
          const dailyDmg=state.daily?.rules?.playerDamage||1;
          const zoneMult=hitZone==='head'?1.85:hitZone==='chest'?1.12:.95;
          let damage=cfg.damage*zoneMult*rangeFalloff*diff.playerDamage*nightPistol*dailyDmg*(.94+Math.random()*.12);
          const targetSpec=ENEMY_TYPES[target.type];
          if(target.cloakTimer>0){damage*=.35;spawnHitParticles(target.x,target.y,'#a66cff');if(state.messageTimer<=0)showMessage('CLOAKED // WEAK CONTACT');}
          if(targetSpec.shieldBlock&&Math.abs(normAngle(target.facing-Math.atan2(player.y-target.y,player.x-target.x)))<(targetSpec.shieldArc??1.1)){damage*=1-targetSpec.shieldBlock;spawnHitParticles(target.x,target.y,'#7fd0ff');if(state.messageTimer<=0)showMessage('KINETIC BARRIER // FLANK OR FINISH THE WARDEN');}
          target.hp-=damage;target.hitFlash=.12;target.suppression=1;target.awareness=1;target.dodgeTimer=Math.max(target.dodgeTimer,.18);showHit(critical);audio?.hit(critical);spawnBlood(target.x,target.y,critical?1.5:1);
          // Short hit-stop only — keeps pace crisp.
          state.hitStop=Math.max(state.hitStop,critical?.045:.02);
          if(target.hp<=0&&!target.dead){state.hitStop=Math.max(state.hitStop,.055);killEnemy(target,critical,critical?'headshot':'shot');}
        }else if(pellet===0){
          let nodeHit=null,nodeBest=Infinity;
          for(const node of state.destroyNodes){if(node.dead)continue;const dx=node.x-player.x,dy=node.y-player.y,nd=Math.hypot(dx,dy),a=Math.abs(normAngle(Math.atan2(dy,dx)-angle));if(nd<ray.dist+.3&&a<Math.atan2(.55,nd)&&nd<nodeBest){nodeHit=node;nodeBest=nd;}}
          if(nodeHit){const rangeFalloff=weaponRangeFalloff(cfg,nodeBest);damageDestroyNode(nodeHit,cfg.damage*rangeFalloff*diff.playerDamage);if(!registeredHit){player.hits++;registeredHit=true;}audio?.impact?.('metal');}
          else{
            const impactDist=Math.min(ray.dist,24);
            const ix=player.x+Math.cos(angle)*impactDist*.98,iy=player.y+Math.sin(angle)*impactDist*.98;
            spawnImpactSparks(ix,iy,angle);
            if(Math.random()<.55)audio?.ricochet?.(Math.min(1,impactDist/18));
            else audio?.impact?.(ray.type===4?'glass':'concrete');
          }
        }
        for(const e of state.enemies){if(e.dead)continue;const ex=e.x-player.x,ey=e.y-player.y,along=ex*Math.cos(angle)+ey*Math.sin(angle),near=Math.abs(ex*Math.sin(angle)-ey*Math.cos(angle));if(along>0&&along<ray.dist+.4&&near<.7)e.suppression=Math.min(1,e.suppression+.32);}
      }
      if(player.ammo===0&&player.reserve>0)setTimeout(()=>{if(state.mode==='playing')reload();},200);
    }

    function killEnemy(e,critical,method='shot'){
      if(e.dead)return;e.dead=true;const spec=ENEMY_TYPES[e.type];player.kills++;player.combo=Math.min(8,player.combo+1);player.comboTimer=3.2;state.comboPeak=Math.max(state.comboPeak,player.combo);
      const methodBonus=method==='takedown'?1.4:method==='roadkill'?1.3:method==='headshot'?1.2:1,eliteBonus=e.elite?1.75:1,gain=Math.round(spec.score*player.combo*(critical?1.25:1)*methodBonus*eliteBonus);player.score+=gain;audio?.kill();$('combo').innerHTML=`<b>x${player.combo} CHAIN</b><small>${e.elite?'ELITE // ':''}${method.toUpperCase()} +${gain}</small>`;$('combo').classList.add('show');
      if(e.commander){const hvt=missionStages().find(s=>s.type==='hvt');audio?.say('hvt-down');showAnnouncement('HVT NEUTRALIZED',`${hvt?.title||'TARGET'} // CONFIRMED`,1.5);showComms('ARES COMMAND',hvt?.confirmComms||'Target confirmed down. Move to your next objective immediately.',4.6);state.screenShake=1;}
      else if(e.elite){showMessage(`ELITE ${spec.name} ELIMINATED`);state.screenShake=Math.max(state.screenShake,.7);}
      if(state.gore){spawnBlood(e.x,e.y,e.elite?2.2:1.55);state.bloodDecals.push({x:e.x+(Math.random()-.5)*.16,y:e.y+(Math.random()-.5)*.16,z:e.z||GROUND_HEIGHT,size:(e.elite?.5:.34)+Math.random()*.18,alpha:.72});if(state.bloodDecals.length>36)state.bloodDecals.shift();}
      // Corpses linger briefly then despawn so the district doesn't fill with bodies.
      state.corpses.push({x:e.x,y:e.y,z:e.z||GROUND_HEIGHT,type:e.type,variant:e.variant||0,elite:e.elite,commander:e.commander,dir:e.facing,age:0,life:CORPSE_LIFETIME});
      if(state.corpses.length>24)state.corpses.shift();
      spawnDeathParticles(e.x,e.y,e.elite?'#fff6b7':state.gore?'#8f101d':'#617176');
      if(Math.random()<(e.elite ? .86 : .36))dropPickup(e.x,e.y);
    }

    const CORPSE_LIFETIME = 4.5;
    function updateCorpses(dt){
      if(!state.corpses.length)return;
      const kept=[];
      for(const corpse of state.corpses){
        corpse.age=(corpse.age||0)+dt;
        const life=corpse.life??CORPSE_LIFETIME;
        // Fade flag for the 3D layer in the last second.
        corpse.fade=Math.max(0,Math.min(1,1-(corpse.age-(life-1.1))/1.1));
        if(corpse.age>=life){
          spawnDeathParticles(corpse.x,corpse.y,corpse.elite?'#fff6b7':'#4a5a60');
          for(let i=0;i<6;i++)state.particles.push({x:corpse.x,y:corpse.y,z:(corpse.z||GROUND_HEIGHT)+.2,vx:(Math.random()-.5)*1.4,vy:(Math.random()-.5)*1.4,vz:.4+Math.random()*1.2,gravity:5,life:.35+Math.random()*.25,max:.6,color:'#31f5db'});
          continue;
        }
        kept.push(corpse);
      }
      state.corpses=kept;
      // Blood decals also decay so the floor doesn't stay permanently stained.
      for(const decal of state.bloodDecals){decal.age=(decal.age||0)+dt;if(decal.age>12)decal.alpha=Math.max(0,(decal.alpha||.5)*(1-dt*.35));}
      state.bloodDecals=state.bloodDecals.filter(d=>(d.alpha??.5)>0.04&&(d.age||0)<18);
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
      const diff=DIFFICULTIES[state.difficulty],rules=opRules(),sprinting=input.sprint||input.gamepadSprint,quiet=(state.timeOfDay==='night'||rules.stealth)&&!sprinting&&state.muzzle<=0&&player.carIndex<0;
      const baseSight=state.timeOfDay==='day'?(rules.sightDay||12.5):(quiet?(rules.sightNight||6.4)*.85:(rules.sightNight||9.2));
      const sightRange=baseSight;state.squadAlert=Math.max(0,state.squadAlert-dt*(quiet?1.4:1));
      for(const e of state.enemies){
        if(e.dead)continue;const spec=ENEMY_TYPES[e.type],wasReloading=e.reloadTimer>0;e.hitFlash=Math.max(0,e.hitFlash-dt);e.muzzleFlash=Math.max(0,(e.muzzleFlash||0)-dt*10);e.spawn=Math.max(0,e.spawn-dt*2.2);e.fireCooldown-=dt;e.meleeCooldown-=dt;e.pathTimer-=dt;e.dodgeTimer=Math.max(0,e.dodgeTimer-dt);e.dashCooldown-=dt;e.chargeCooldown-=dt;e.chargeTimer=Math.max(0,e.chargeTimer-dt);e.jumpCooldown=Math.max(0,e.jumpCooldown-dt);e.landingSquash=Math.max(0,e.landingSquash-dt*4);e.reactionTimer=Math.max(0,e.reactionTimer-dt);e.decisionTimer-=dt;e.suppression=Math.max(0,e.suppression-dt*.24);e.reloadTimer=Math.max(0,e.reloadTimer-dt);if(wasReloading&&e.reloadTimer<=0){e.rounds=e.magazineSize;e.combatState='engage';e.decisionTimer=0;}
        const dx=player.x-e.x,dy=player.y-e.y,dist=Math.max(.01,Math.hypot(dx,dy)),canSee=dist<sightRange&&lineOfSight(e.x,e.y,player.x,player.y,Math.max(GROUND_HEIGHT,player.z));
        if(canSee){
          if(!e.hadSight){e.reactionTimer=.24+Math.random()*(state.timeOfDay==='night'?.5:.32);if(dist<11&&!e.alertSfx){audio?.enemyAlert?.(dist);e.alertSfx=true;}}
          e.awareness=Math.min(1,e.awareness+dt*(quiet?1.35:2.5));e.lastSeenX=player.x;e.lastSeenY=player.y;e.hadSight=true;
          for(const ally of state.enemies)if(ally!==e&&!ally.dead&&Math.hypot(ally.x-e.x,ally.y-e.y)<5.5)ally.awareness=Math.max(ally.awareness,.58);
        }else{
          e.hadSight=false;e.alertSfx=false;
          e.awareness=Math.max(0,e.awareness-dt*(state.squadAlert>0?.025:(quiet?.12:.08)));
          if(state.squadAlert>0&&dist<(quiet?7:10))e.awareness=Math.max(e.awareness,.42);
          if(dist<5.5&&e.awareness>.2){e.proxTimer=(e.proxTimer||0)-dt;if(e.proxTimer<=0){audio?.enemyNear?.(dist);e.proxTimer=.55+Math.random()*.45;}}
        }
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
      // Spawn from held-weapon height (~chest/shoulder), slightly forward of body along facing.
      const muzzleZ=(e.z||GROUND_HEIGHT)+.95;
      const fwdX=Math.cos(e.facing||angle)*.42,fwdY=Math.sin(e.facing||angle)*.42;
      const sx=e.x+fwdX,sy=e.y+fwdY;
      e.muzzleFlash=1;
      e.combatState='engage';
      state.projectiles.push({x:sx,y:sy,z:muzzleZ,dx:Math.cos(angle)*speed,dy:Math.sin(angle)*speed,dz:(player.z+.15-muzzleZ)/travel,life:2.3,damage:spec.damage*DIFFICULTIES[state.difficulty].enemyDamage,type:e.type,fromX:sx,fromY:sy});
      // Visible sparks at the muzzle so return fire is unmistakable.
      for(let i=0;i<3;i++)pushParticle({x:sx+(Math.random()-.5)*.08,y:sy+(Math.random()-.5)*.08,z:muzzleZ+(Math.random()-.3)*.1,vx:Math.cos(angle)*(1.2+Math.random())+(Math.random()-.5)*.4,vy:Math.sin(angle)*(1.2+Math.random())+(Math.random()-.5)*.4,vz:(Math.random()-.3)*.5,gravity:3,life:.08+Math.random()*.06,max:.16,color:i%2?'#ffbb55':'#ffe0a0'});
      audio?.enemyShot?.(dist);
    }

    function updateProjectiles(dt){
      for(const p of state.projectiles){
        p.life-=dt;const steps=Math.max(1,Math.ceil(Math.hypot(p.dx,p.dy)*dt/.15));
        for(let i=0;i<steps&&p.life>0;i++){
          p.x+=p.dx*dt/steps;p.y+=p.dy*dt/steps;p.z+=p.dz*dt/steps;
          const outside=p.x<0||p.y<0||p.x>=MAP_W||p.y>=MAP_H;
          if(outside||(p.z<=1&&isWall(p.x,p.y))){
            spawnImpactSparks(p.x,p.y,Math.atan2(p.dy,p.dx));
            if(Math.random()<.4)audio?.ricochet?.(.5);
            p.life=0;break;
          }
          const car=state.cars.find(vehicle=>!vehicle.destroyed&&Math.hypot(vehicle.x-p.x,vehicle.y-p.y)<.6&&p.z<.95);if(car){damageVehicle(car,p.damage*(car.occupied ? .68 : .9));spawnHitParticles(p.x,p.y,'#ffbb55');p.life=0;break;}
          const toPlayer=Math.hypot(p.x-player.x,p.y-player.y);
          // Supersonic crack when a round passes close.
          if(!p.flyby&&toPlayer<.55&&toPlayer>.32){p.flyby=true;audio?.flyby?.(toPlayer);}
          // Body volume ~ ankles to head (rounds spawn at gun height, not floor).
          if(toPlayer<.32&&p.z>player.z-.05&&p.z<player.z+1.15){damagePlayer(p.damage);p.life=0;break;}
        }
      }
      state.projectiles=state.projectiles.filter(p=>p.life>0);
    }

    function damagePlayer(amount){
      if(state.qaInvulnerable||player.hurtTimer>.06||state.finisherCam?.active)return;
      const dailyTaken=state.daily?.rules?.enemyDamage||1;
      // Family mode softens incoming damage without removing challenge.
      const familyTaken=state.familyMode?.62:1;
      let left=amount*dailyTaken*familyTaken,shieldUsed=0,armorBlocked=0;const shieldBefore=player.shield;player.shieldDelay=state.familyMode?3.4:4.25;
      if(player.shield>0){shieldUsed=Math.min(player.shield,left);player.shield-=shieldUsed;left-=shieldUsed;state.shieldFlash=1;audio?.shieldHit(shieldBefore>0&&player.shield<=0);}
      if(left>0&&player.armor>0){const ratio=player.armor/player.maxArmor;armorBlocked=Math.min(left*.5*ratio,left*.52);player.armor=Math.max(0,player.armor-left*.72);left-=armorBlocked;state.armorFlash=1;audio?.armorHit();}
      if(left>0){
        player.health=Math.max(0,player.health-left);state.damageTaken+=left;audio?.hurt();
        // Directional pain kick + reticle bloom.
        player.spread=Math.min(.18,player.spread+.05+left*.002);
        player.recoilKick=Math.min(1.2,player.recoilKick+.08+left*.004);
        player.pitch=Math.min(canvas.height*.2,player.pitch+left*.35);
        $('damageFlash').style.opacity=armorBlocked?'.48':'.78';setTimeout(()=>$('damageFlash').style.opacity='0',110);
      }
      player.hurtTimer=.2;state.screenShake=shieldUsed&&!left ? .5 : 1;rumble(shieldUsed&&!left ? .38 : .78,shieldUsed&&!left ? .55 : .92,shieldUsed&&!left?80:120);if(player.health<=0)endGame(false);
    }

    function damageVehicle(car,amount){
      if(car.destroyed)return;car.hp=Math.max(0,car.hp-amount);state.screenShake=Math.max(state.screenShake,.35);if(car.hp>0)return;
      car.destroyed=true;car.speed=0;spawnDeathParticles(car.x,car.y,'#ff8c57');audio?.roadkill();rumble(1,1,240);
      if(car.occupied){car.occupied=false;player.carIndex=-1;const ex=car.x+Math.cos(car.dir+Math.PI/2),ey=car.y+Math.sin(car.dir+Math.PI/2);player.x=canMove(ex,ey,.24)?ex:car.x;player.y=canMove(ex,ey,.24)?ey:car.y;player.z=GROUND_HEIGHT;damagePlayer(24);}
      audio?.say('vehicle-lost');showAnnouncement('VEHICLE LOST','ARES INTERCEPTOR DESTROYED',1.2);
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

    const MAX_PARTICLES=72;
    function pushParticle(p){
      state.particles.push(p);
      if(state.particles.length>MAX_PARTICLES)state.particles.splice(0,state.particles.length-MAX_PARTICLES);
    }
    function spawnHitParticles(x,y,color){for(let i=0;i<4;i++)pushParticle({x,y,z:.5+Math.random()*.35,vx:(Math.random()-.5)*1.6,vy:(Math.random()-.5)*1.6,vz:.2+Math.random()*1,gravity:5,life:.18+Math.random()*.1,max:.28,color});}
    function spawnImpactSparks(x,y,angle){
      const nx=-Math.cos(angle),ny=-Math.sin(angle);
      for(let i=0;i<5;i++){
        const spread=(Math.random()-.5)*.85,spd=.9+Math.random()*2;
        pushParticle({
          x,y,z:.35+Math.random()*.45,
          vx:nx*spd+Math.cos(angle+Math.PI/2)*spread,
          vy:ny*spd+Math.sin(angle+Math.PI/2)*spread,
          vz:.35+Math.random()*1.8,gravity:7.5,
          life:.14+Math.random()*.16,max:.32,
          color:i%2?'#ffbb55':'#fff2c4'
        });
      }
      for(let i=0;i<2;i++)pushParticle({x,y,z:.2+Math.random()*.15,vx:(Math.random()-.5)*.5,vy:(Math.random()-.5)*.5,vz:.12+Math.random()*.3,gravity:2,life:.22+Math.random()*.15,max:.4,color:'#8a9a9e'});
    }
    function spawnBlood(x,y,intensity=1){if(!state.gore)return;const count=Math.round(7*intensity),impact=Math.atan2(y-player.y,x-player.x),fx=Math.cos(impact),fy=Math.sin(impact),px=-fy,py=fx;for(let i=0;i<count;i++){const forward=.45+Math.random()*1.35*intensity,lateral=(Math.random()-.5)*1*intensity;pushParticle({x:x+(Math.random()-.5)*.05,y:y+(Math.random()-.5)*.05,z:.55+Math.random()*.45,vx:fx*forward+px*lateral,vy:fy*forward+py*lateral,vz:.5+Math.random()*2*intensity,gravity:7,life:.35+Math.random()*.4,max:.8,color:i%3===0?'#d62936':'#6f0711'});}}
    function spawnDeathParticles(x,y,color){for(let i=0;i<12;i++)pushParticle({x,y,z:.4+Math.random()*.4,vx:(Math.random()-.5)*2.4,vy:(Math.random()-.5)*2.4,vz:.25+Math.random()*1.2,gravity:4,life:.55+Math.random()*.35,max:1,color});}
    function updateParticles(dt){
      for(const p of state.particles){
        p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
        if(Number.isFinite(p.z)){
          p.vz=(p.vz||0)-(p.gravity||0)*dt;p.z=Math.max(.025,p.z+p.vz*dt);
          if(p.z<=.026){p.vz=0;if(!p.settled&&(p.color==='#6f0711'||p.color==='#d62936')){p.settled=true;if(Math.random()<.22){state.bloodDecals.push({x:p.x,y:p.y,size:.03+Math.random()*.06,alpha:.4+Math.random()*.2});if(state.bloodDecals.length>36)state.bloodDecals.shift();}}}
        }
        p.vx*=.97;p.vy*=.97;
      }
      state.particles=state.particles.filter(p=>p.life>0);
    }

    function render(){
      const w=canvas.width,h=canvas.height, shake=state.mode==='playing'?state.screenShake*4:0, sx=(Math.random()-.5)*shake,sy=(Math.random()-.5)*shake;state.camera=getRenderCamera();
      if(state.threeReady){drawRadar();return;}
      ctx.save();ctx.translate(sx,sy);renderWorld(w,h);renderSprites(w,h);renderWeapon(w,h);ctx.restore();drawRadar();
    }

    function getRenderCamera(){
      if(state.finisherCam?.active){
        const f=state.finisherCam,t=1-Math.max(0,f.timer)/Math.max(.01,f.duration),orbit=f.angle+t*1.35,dist=1.55-t*.25;
        renderCamera.x=f.x+Math.cos(orbit)*dist;renderCamera.y=f.y+Math.sin(orbit)*dist;renderCamera.z=(f.z||GROUND_HEIGHT)+.35;renderCamera.dir=Math.atan2(f.y-renderCamera.y,f.x-renderCamera.x);renderCamera.pitch=-18;return renderCamera;
      }
      if(player.carIndex<0){
        // Head bob + recoil kick + aim sway feed the real camera (2D + 3D).
        const bobLift=player.grounded?Math.abs(Math.sin(player.bob))*player.bobAmount*.018:0;
        const kick=player.recoilKick||0;
        renderCamera.x=player.x;renderCamera.y=player.y;
        renderCamera.z=player.z+bobLift;
        renderCamera.dir=player.dir+(player.recoilYaw||0)*.35+(player.swayX||0);
        renderCamera.pitch=player.pitch-kick*canvas.height*.022+(player.swayY||0)*canvas.height*.55;
        renderCamera.roll=(player.strafe||0)*.035+(player.recoilYaw||0)*.08;
        return renderCamera;
      }
      const car=state.cars[player.carIndex];let distance=2.05,cx=car.x-Math.cos(car.dir)*distance,cy=car.y-Math.sin(car.dir)*distance;
      while(distance>.62&&blocksAt(cx,cy,.94)){distance-=.18;cx=car.x-Math.cos(car.dir)*distance;cy=car.y-Math.sin(car.dir)*distance;}
      renderCamera.x=cx;renderCamera.y=cy;renderCamera.z=.96;renderCamera.dir=car.dir;renderCamera.pitch=player.pitch*.28-24;renderCamera.roll=0;return renderCamera;
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
      document.body.classList.toggle('low-vitals',state.mode==='playing'&&player.health>0&&player.health<35);
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

    const SYNC_KEY='neon-breach-sync';
    function getSyncCode(){
      try{
        const saved=localStorage.getItem(SYNC_KEY);
        if(saved&&/^[A-Z0-9]{6,24}$/.test(saved))return saved;
      }catch{}
      const bytes=new Uint8Array(10);
      (crypto.getRandomValues?crypto.getRandomValues(bytes):bytes.fill(7));
      const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code='';
      for(let i=0;i<10;i++)code+=alphabet[bytes[i]%alphabet.length];
      try{localStorage.setItem(SYNC_KEY,code);}catch{}
      return code;
    }
    function setSyncCode(value){
      const clean=String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,24);
      if(!/^[A-Z0-9]{6,24}$/.test(clean))return getSyncCode();
      try{localStorage.setItem(SYNC_KEY,clean);}catch{}
      const input=$('settingSyncCode');if(input)input.value=clean;
      const label=$('syncCodeDisplay');if(label)label.textContent=clean;
      return clean;
    }
    function campaignHeaders(extra={}){
      return {'accept':'application/json','x-neon-profile':getSyncCode(),...extra};
    }

    async function saveCampaign(status='active',force=false){
      if(campaignCloud.syncing){if(force||status!=='active')campaignCloud.pendingStatus=status;return;}
      if(!force&&state.mode!=='playing')return;campaignCloud.syncing=true;if($('syncStatus'))$('syncStatus').textContent='SAVING';
      const payload=campaignPayload(status);
      if(campaignCloud.offline){writeLocalCampaign(status,payload);if(status==='active')campaignCloud.active={...payload};else{campaignCloud.records=[{...payload},...campaignCloud.records].slice(0,8);campaignCloud.active=null;}renderCampaignRecords();if($('syncStatus'))$('syncStatus').textContent='LOCAL SAVE';campaignCloud.syncing=false;return;}
      try{
        const response=await fetch('/api/campaigns',{method:'POST',headers:campaignHeaders({'content-type':'application/json'}),body:JSON.stringify(payload)});
        if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error(`save ${response.status}`);const data=await response.json();if(data.available===false)throw new Error('campaign storage unavailable');if(data.record?.id)campaignCloud.id=Number(data.record.id);if($('syncStatus'))$('syncStatus').textContent='CLOUD SAVED';
        if(status!=='active'){campaignCloud.id=null;await loadCampaignRecords();}
      }catch{campaignCloud.offline=true;writeLocalCampaign(status,payload);useLocalCampaign();if($('syncStatus'))$('syncStatus').textContent='LOCAL SAVE';}
      finally{campaignCloud.syncing=false;const pending=campaignCloud.pendingStatus;campaignCloud.pendingStatus=null;if(pending&&!campaignCloud.offline)saveCampaign(pending,true);}
    }

    async function loadCampaignRecords(){
      if($('syncStatus'))$('syncStatus').textContent='CONNECTING';
      try{
        const response=await fetch('/api/campaigns',{headers:campaignHeaders()});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error(`load ${response.status}`);const data=await response.json();if(data.available===false)throw new Error('campaign storage unavailable');campaignCloud.offline=false;campaignCloud.records=Array.isArray(data.records)?data.records:[];campaignCloud.active=data.active||null;campaignCloud.remoteBest=Number(data.best_score||0);if(data.career)for(const key of Object.keys(career))career[key]=Number(data.career[key]||0);renderCampaignRecords();renderArsenal();if($('syncStatus'))$('syncStatus').textContent='CLOUD READY';
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
      renderMedalCollection();
    }

    function renderMedalCollection(){
      const list=$('medalRows');if(!list)return;list.replaceChildren();
      let earned={};try{earned=JSON.parse(localStorage.getItem('neon-breach-medals')||'{}');}catch{}
      for(const medal of MEDAL_DEFS){
        const count=Number(earned[medal.id]||0);
        const el=document.createElement('div');el.className=`campaign-row${count?' victory':''}`;
        const detail=document.createElement('div'),title=document.createElement('b'),meta=document.createElement('span'),mark=document.createElement('strong');
        title.textContent=medal.name;meta.textContent=medal.desc;mark.textContent=count?`×${count}`:'—';
        detail.append(title,meta);el.append(detail,mark);list.append(el);
      }
    }

    const LOCAL_BOARD_KEY='neon-breach-board-v1';
    const CALLSIGN_KEY='neon-breach-callsign';
    const PARTY_KEY='neon-breach-party';
    let leaderboardOpFilter=null; // null = all operations

    function getCallsign(){
      try{
        const saved=localStorage.getItem(CALLSIGN_KEY);
        if(saved&&saved.trim().length>=2)return saved.trim().toUpperCase().slice(0,16);
      }catch{}
      return 'OPERATIVE';
    }
    function setCallsign(name){
      const clean=String(name||'').toUpperCase().replace(/[^A-Z0-9_\- ]/g,'').trim().slice(0,16);
      const final=clean.length>=2?clean:'OPERATIVE';
      try{localStorage.setItem(CALLSIGN_KEY,final);}catch{}
      const input=$('settingCallsign');if(input)input.value=final;
      return final;
    }
    function getPartyCode(){
      try{
        const saved=localStorage.getItem(PARTY_KEY);
        if(saved&&/^[A-Z0-9]{3,12}$/.test(saved))return saved;
      }catch{}
      return '';
    }
    function setPartyCode(value){
      const clean=String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12);
      const final=clean.length>=3?clean:'';
      try{
        if(final)localStorage.setItem(PARTY_KEY,final);
        else localStorage.removeItem(PARTY_KEY);
      }catch{}
      const input=$('settingPartyCode');if(input)input.value=final;
      const badge=$('partyBadge');if(badge){badge.textContent=final?`PARTY ${final}`:'WORLD';badge.classList.toggle('active',!!final);}
      return final;
    }
    function createPartyCode(){
      const bytes=new Uint8Array(6);
      (crypto.getRandomValues?crypto.getRandomValues(bytes):bytes.fill(3));
      const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code='';
      for(let i=0;i<6;i++)code+=alphabet[bytes[i]%alphabet.length];
      return setPartyCode(code);
    }
    function readLocalBoard(){
      try{const raw=JSON.parse(localStorage.getItem(LOCAL_BOARD_KEY)||'[]');return Array.isArray(raw)?raw:[];}catch{return [];}
    }
    function writeLocalBoard(entries){
      try{localStorage.setItem(LOCAL_BOARD_KEY,JSON.stringify(entries.slice(0,200)));}catch{}
    }
    function pushLocalBoard(entry){
      // Client-side best-per-callsign+op mirror of server upsert
      const board=readLocalBoard();
      const callsign=String(entry.callsign||'OPERATIVE').toUpperCase();
      const operation=Number(entry.operation||0);
      const idx=board.findIndex(r=>String(r.callsign||'').toUpperCase()===callsign&&Number(r.operation||0)===operation);
      if(idx>=0){
        if(Number(entry.score)>Number(board[idx].score||0))board[idx]=entry;
      }else board.push(entry);
      board.sort((a,b)=>Number(b.score||0)-Number(a.score||0)||Number(b.at||0)-Number(a.at||0));
      writeLocalBoard(board);
      return board;
    }
    function boardToEntries(board,mineCallsign){
      const me=String(mineCallsign||getCallsign()).toUpperCase();
      // Best per callsign for display list
      const best=new Map();
      for(const e of board||[]){
        const key=String(e.callsign||'OPERATIVE').toUpperCase();
        const score=Number(e.score||e.best_score||0);
        const prev=best.get(key);
        if(!prev||score>Number(prev.score||0))best.set(key,e);
      }
      return [...best.values()]
        .sort((a,b)=>Number(b.score||b.best_score||0)-Number(a.score||a.best_score||0))
        .slice(0,50)
        .map((e,i)=>({
          rank:i+1,
          callsign:e.callsign||'OPERATIVE',
          best_score:Number(e.score||e.best_score||0),
          kills:Number(e.kills||0),
          grade:e.grade||'—',
          victory:!!e.victory,
          difficulty:e.difficulty||'operative',
          operation:e.operation??0,
          you:String(e.callsign||'').toUpperCase()===me,
          at:e.at||0
        }));
    }
    function mergeBoards(remote,local){
      const map=new Map();
      const key=e=>`${String(e.callsign||'').toUpperCase()}|${Number(e.operation||0)}`;
      for(const e of [...(remote||[]),...(local||[])]){
        const score=Number(e.score||e.best_score||0);
        if(score<=0)continue;
        const k=key(e);
        const prev=map.get(k);
        if(!prev||score>Number(prev.score||0)){
          map.set(k,{
            callsign:e.callsign||'OPERATIVE',
            score,
            kills:Number(e.kills||0),
            grade:e.grade||'—',
            victory:!!e.victory,
            difficulty:e.difficulty||'operative',
            operation:e.operation??0,
            at:e.at||0
          });
        }
      }
      return [...map.values()].sort((a,b)=>b.score-a.score||b.at-a.at);
    }

    async function loadLeaderboard(){
      const status=$('leaderboardStatus');if(status)status.textContent='LOADING…';
      const party=getPartyCode();
      let local=readLocalBoard();
      if(leaderboardOpFilter!=null)local=local.filter(e=>Number(e.operation||0)===leaderboardOpFilter);
      let remote=[];
      let source='device';
      try{
        const qs=new URLSearchParams();
        if(party)qs.set('party',party);
        if(leaderboardOpFilter!=null)qs.set('operation',String(leaderboardOpFilter));
        const response=await fetch(`/api/leaderboard?${qs}`,{headers:{accept:'application/json'}});
        if(response.ok){
          const data=await response.json();
          if(data.available!==false&&Array.isArray(data.entries)){
            remote=data.entries.map(e=>({
              callsign:e.callsign,
              score:Number(e.best_score||e.score||0),
              kills:Number(e.kills||0),
              grade:e.grade||'—',
              victory:!!e.victory||Number(e.victories||0)>0,
              difficulty:e.difficulty,
              operation:e.operation,
              at:e.at||0
            }));
            source=party?'PARTY'
              :data.source==='netlify'?'WORLD BOARD'
              :data.source==='party'?'PARTY LAN'
              :'CLOUD';
          }
        }
      }catch{}
      const merged=mergeBoards(remote,local);
      renderLeaderboard(boardToEntries(merged));
      if(status){
        const partyBit=party?`PARTY ${party} · `:'';
        if(!merged.length)status.textContent=partyBit+'BE THE FIRST';
        else if(source==='PARTY')status.textContent=`PARTY ${party} · LIVE`;
        else if(source==='WORLD BOARD')status.textContent='WORLD BOARD · LIVE';
        else if(source==='PARTY LAN')status.textContent='PARTY LAN · LIVE';
        else if(source==='CLOUD')status.textContent='CLOUD RANKS';
        else status.textContent=`${partyBit}DEVICE · ${merged.length} RUNS`;
      }
    }

    async function submitPartyScore(payload){
      const callsign=getCallsign();
      const party=getPartyCode();
      const entry={
        callsign,
        score:Math.max(0,Math.floor(Number(payload.score)||0)),
        kills:Math.max(0,Math.floor(Number(payload.kills)||0)),
        grade:String(payload.grade||'—').slice(0,2),
        victory:!!payload.victory,
        operation:Number(payload.operation||0),
        difficulty:payload.difficulty||'operative',
        time_of_day:payload.time_of_day||'day',
        elapsed_seconds:Math.floor(Number(payload.elapsed_seconds??state.totalTime)||0),
        party:party||undefined,
        at:Date.now()
      };
      if(entry.score<=0)return null;
      pushLocalBoard(entry);
      let rank=null;
      try{
        const response=await fetch('/api/leaderboard',{
          method:'POST',
          headers:{'content-type':'application/json',accept:'application/json'},
          body:JSON.stringify(entry)
        });
        if(response.ok){
          const data=await response.json();
          if(Array.isArray(data.entries))renderLeaderboard(boardToEntries(data.entries.map(e=>({
            callsign:e.callsign,score:e.best_score||e.score,kills:e.kills,grade:e.grade,victory:e.victory,difficulty:e.difficulty,operation:e.operation,at:e.at
          }))));
          rank=data.rank||null;
          if(rank)showMessage(`${party?'PARTY':'BOARD'} RANK #${rank} // ${callsign}`);
          return rank;
        }
      }catch{}
      const local=boardToEntries(readLocalBoard().filter(e=>leaderboardOpFilter==null||Number(e.operation||0)===leaderboardOpFilter));
      renderLeaderboard(local);
      const hit=local.find(e=>e.you&&Number(e.best_score)===entry.score);
      rank=hit?.rank||null;
      if(rank)showMessage(`DEVICE RANK #${rank} // ${callsign}`);
      return rank||null;
    }

    function sendTelemetry(event,extra={}){
      try{
        const body=JSON.stringify({event,difficulty:state.difficulty,...extra});
        if(navigator.sendBeacon){
          const blob=new Blob([body],{type:'application/json'});
          if(navigator.sendBeacon('/api/telemetry',blob))return;
        }
        fetch('/api/telemetry',{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true}).catch(()=>{});
      }catch{}
    }

    function renderLeaderboard(entries){
      const list=$('leaderboardRows');if(!list)return;list.replaceChildren();
      if(!entries.length){
        const row=document.createElement('div');row.className='campaign-row';
        row.innerHTML='<div><b>NO SCORES YET</b><span>Finish a mission to claim the top spot. Invite friends on the same Wi‑Fi.</span></div><strong>—</strong>';
        list.append(row);return;
      }
      for(const entry of entries.slice(0,15)){
        const row=document.createElement('div');
        const rank=entry.rank||1;
        row.className=`lb-row${entry.you?' you':''}${rank===1?' top1':rank===2?' top2':rank===3?' top3':''}`;
        const op=OPERATIONS[Number(entry.operation)||0];
        const rankEl=document.createElement('div');rankEl.className='lb-rank';rankEl.textContent=rank<=3?['🥇','🥈','🥉'][rank-1]:String(rank).padStart(2,'0');
        const mid=document.createElement('div');
        const name=document.createElement('div');name.className='lb-name';name.textContent=entry.you?`${entry.callsign} · YOU`:entry.callsign;
        const meta=document.createElement('span');meta.className='lb-meta';
        meta.textContent=`${entry.victory?'WIN':'RUN'} · ${entry.grade||'—'} · ${entry.kills||0} ELIMS · ${(op?.short||'OP').toUpperCase()} · ${String(entry.difficulty||'operative').toUpperCase()}`;
        mid.append(name,meta);
        const score=document.createElement('div');score.className='lb-score';score.textContent=Number(entry.best_score||entry.score||0).toLocaleString();
        row.append(rankEl,mid,score);list.append(row);
      }
    }

    async function shareText(text,title='NEON BREACH'){
      try{
        if(navigator.share){await navigator.share({title,text,url:location.href});return true;}
      }catch{}
      try{
        await navigator.clipboard.writeText(text);
        showMessage('Copied to clipboard');
        return true;
      }catch{
        showMessage('Could not share — copy the link from the address bar');
        return false;
      }
    }
    function shareInvite(){
      const party=getPartyCode();
      let url=location.href.split('?')[0].split('#')[0];
      if(party)url+=`?party=${encodeURIComponent(party)}`;
      shareText(`Play NEON BREACH with me — tactical FPS from Lummy Labs.\n${url}\n${party?`Join party ${party} and beat my score!`:'Beat my score on the party board!'}`,'NEON BREACH');
    }
    function shareLastScore(){
      const btn=$('shareScoreButton');
      const score=btn?.dataset.score||readBestScore();
      const grade=btn?.dataset.grade||'—';
      const kills=btn?.dataset.kills||0;
      const rank=btn?.dataset.rank;
      const callsign=getCallsign();
      const rankBit=rank?` · party rank #${rank}`:'';
      shareText(`${callsign} scored ${Number(score).toLocaleString()} on NEON BREACH (grade ${grade}, ${kills} elims${rankBit}).\nCan you beat that?\n${location.href}`);
    }

    function lookScale(){return Math.max(.4,Math.min(1.8,state.lookSens||prefs.lookSens||1));}
    function pitchSign(){return state.invertY||prefs.invertY?-1:1;}

    function renderCampaignRecords(){
      const history=$('campaignHistory');if(!history)return;history.replaceChildren();const active=campaignCloud.active,records=campaignCloud.records.filter(record=>record.status!=='active').slice(0,3);$('continueButton').classList.toggle('hidden',!active);if(active)$('continueButton').textContent=`CONTINUE ${OPERATIONS[Number(active.operation)||0]?.short||'FS'} PHASE ${String(Math.max(1,Number(active.wave||1))).padStart(2,'0')} // ${Number(active.score||0).toLocaleString()} PTS`;
      const visible=active?[active,...records]:records;if(!visible.length){const row=document.createElement('div');row.className='campaign-row';row.innerHTML='<div><b>NO OPERATIONS RECORDED</b><span>Your campaign outcomes will appear here.</span></div><strong>—</strong>';history.append(row);updateBestScore();return;}
      for(const record of visible){const row=document.createElement('div'),status=record.status==='active'?'IN PROGRESS':record.status==='victory'?'MISSION WON':record.status==='failed'?'MISSION FAILED':'CAMPAIGN CLOSED';row.className=`campaign-row ${record.status}`;const detail=document.createElement('div'),title=document.createElement('b'),meta=document.createElement('span'),score=document.createElement('strong');title.textContent=`${status} // ${OPERATIONS[Number(record.operation)||0]?.short||'FS'} PHASE ${String(Math.max(1,Number(record.wave||1))).padStart(2,'0')}`;meta.textContent=`${String(record.time_of_day||'day').toUpperCase()} · ${String(record.difficulty||'operative').toUpperCase()} · ${Number(record.kills||0)} ELIMS`;score.textContent=Number(record.score||0).toLocaleString();detail.append(title,meta);row.append(detail,score);history.append(row);}updateBestScore();
    }

    function readBestScore(){try{return Number(localStorage.getItem('neon-breach-best')||0);}catch{return 0;}}
    function saveBestScore(score){const previous=readBestScore(),isBest=score>previous;if(isBest){try{localStorage.setItem('neon-breach-best',String(score));}catch{}}updateBestScore();return isBest;}
    function updateBestScore(){const best=Math.max(readBestScore(),campaignCloud.remoteBest||0);$('bestScoreTitle').textContent=`BEST RUN // ${String(best).padStart(6,'0')}`;}

    function frame(t){
      const dt=Math.min(.033,Math.max(0,(t-state.lastTime)/1000||0));state.lastTime=t;
      updateGamepad(dt);update(dt);
      // Always refresh the shared camera from the live player — when Three.js is
      // active, render() no longer runs every frame, and a stale state.camera
      // freezes the view so the player looks "stuck" even though x/y advance.
      state.camera=getRenderCamera();
      if(!state.threeReady)render();
      else drawRadar();
      requestAnimationFrame(frame);
    }

    function syncFire(){input.fire=input.shiftFire||input.pointerFire;}
    function setKey(code,value){if(code==='KeyW'||code==='ArrowUp')input.forward=value;if(code==='KeyS'||code==='ArrowDown')input.back=value;if(code==='KeyA'||code==='ArrowLeft')input.left=value;if(code==='KeyD'||code==='ArrowRight')input.right=value;if(code==='ShiftLeft'||code==='ShiftRight'){input.shiftFire=value;syncFire();}if(code==='KeyQ')input.sprint=value;if(code==='Space')input.jump=value;}
    addEventListener('keydown',e=>{
      if(state.mode==='paused'&&(e.code==='Escape'||e.code==='KeyP')){e.preventDefault();resumeGame();return;}
      if(state.mode==='playing'&&(e.code==='Escape'||e.code==='KeyP')&&!e.repeat){e.preventDefault();pauseGame();return;}
      if(state.mode!=='playing')return;
      if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
      setKey(e.code,true);
      if(e.code==='Space'&&!e.repeat)startJump();
      if(e.code==='KeyR'&&!e.repeat)reload();
      if(e.code==='KeyF'&&!e.repeat)meleeTakedown();
      if(e.code==='KeyE'&&!e.repeat)toggleVehicle();
      if(e.code==='KeyT'&&!e.repeat)toggleAutoLock();
      if(/^Digit[1-4]$/.test(e.code)&&!e.repeat)equipWeapon(Number(e.code.slice(-1))-1);
      if(e.code==='KeyM'&&!e.repeat)toggleAudio();
    });
    addEventListener('keyup',e=>setKey(e.code,false));
    // Only clear keys on real window blur — never auto-pause (that trapped players).
    addEventListener('blur',()=>{Object.keys(input).forEach(k=>{if(typeof input[k]==='boolean')input[k]=false;});input.gamepadAimValue=0;moveAxis={x:0,y:0};});
    addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,80);});
    document.addEventListener('mousemove',e=>{
      if(state.mode!=='playing'||coarsePointer)return;
      if(document.pointerLockElement===canvas){
        const sens=lookScale(),inv=pitchSign();
        player.dir=normAngle(player.dir+e.movementX*.00225*sens);
        player.pitch=Math.max(-canvas.height*.2,Math.min(canvas.height*.2,player.pitch-e.movementY*.32*sens*inv));
        return;
      }
      // Unlocked free-look: hold right mouse (or freeLook drag) so players can aim without pointer lock.
      if(freeLook||input.aim){
        const mx=e.movementX||(freeLookLast?e.clientX-freeLookLast.x:0),my=e.movementY||(freeLookLast?e.clientY-freeLookLast.y:0);
        freeLookLast={x:e.clientX,y:e.clientY};
        const sens=lookScale(),inv=pitchSign();
        player.dir=normAngle(player.dir+mx*.0045*sens);
        player.pitch=Math.max(-canvas.height*.2,Math.min(canvas.height*.2,player.pitch-my*.65*sens*inv));
      }
    });
    document.addEventListener('mousedown',e=>{
      if(state.mode!=='playing')return;
      if(e.button===0){
        if(!coarsePointer&&document.pointerLockElement!==canvas){requestLock();showMessage('MOUSE LOOK CAPTURED // ESC RELEASES LOOK ONLY');}
        else{input.pointerFire=true;syncFire();}
      }
      if(e.button===2){input.aim=true;freeLook=true;freeLookLast={x:e.clientX,y:e.clientY};}
    });
    document.addEventListener('mouseup',e=>{if(e.button===0){input.pointerFire=false;syncFire();}if(e.button===2){input.aim=false;freeLook=false;freeLookLast=null;}});
    document.addEventListener('wheel',e=>{if(state.mode==='playing'){e.preventDefault();cycleWeapon(e.deltaY>0?1:-1);}},{passive:false});
    document.addEventListener('pointerlockchange',()=>{
      pointerHeld=document.pointerLockElement===canvas;
      if(pointerHeld){pointerWanted=true;return;}
      // Esc / focus loss: release look, keep simulation running so movement still works.
      if(!coarsePointer&&state.mode==='playing'&&pointerWanted){
        pointerWanted=false;
        showMessage('MOUSE LOOK RELEASED // CLICK VIEW TO RECAPTURE · WASD STILL MOVES');
      }
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='playing')saveCampaign('active',true);});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    // Invisible hit target stays above the Three canvas so clicks always recapture look.
    canvas.style.pointerEvents='auto';
    canvas.style.zIndex='2';

    document.querySelectorAll('[data-difficulty]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-difficulty]').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.difficulty=btn.dataset.difficulty;}));
    document.querySelectorAll('[data-time]').forEach(btn=>btn.addEventListener('click',()=>setMissionTime(btn.dataset.time)));
    // Operation cards for the ops screen.
    OPERATIONS.forEach((op,index)=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='op-card'+(index===0?' active':'');
      button.dataset.operation=String(index);
      button.innerHTML=`<b>${op.name}</b><span>${op.tagline||''}</span>`;
      button.addEventListener('click',()=>setOperation(index));
      $('opSelect')?.append(button);
    });
    bindMenuNav();
    $('autoLockButton')?.addEventListener('click',toggleAutoLock);
    $('goreButton')?.addEventListener('click',toggleGore);
    $('deployButton')?.addEventListener('click',()=>startGame());
    $('continueButton')?.addEventListener('click',()=>campaignCloud.active&&startGame(campaignCloud.active));
    $('resumeButton')?.addEventListener('click',()=>state.mode==='paused'?resumeGame():startGame());
    $('quitButton')?.addEventListener('click',returnToTitle);
    $('dailyButton')?.addEventListener('click',()=>{if(state.daily)clearDaily();else engageDaily();});
    $('inviteButton')?.addEventListener('click',()=>{playUiClick('confirm');shareInvite();});
    $('shareInviteButton')?.addEventListener('click',()=>{playUiClick('confirm');shareInvite();});
    $('shareScoreButton')?.addEventListener('click',()=>{playUiClick('confirm');shareLastScore();});
    $('refreshRanksButton')?.addEventListener('click',()=>{playUiClick('toggle');loadLeaderboard();});
    function toggleAudio(){
      ensureAudio();
      state.muted=!state.muted;
      $('audioButton').textContent=state.muted?'○':'◉';
      $('audioButton')?.setAttribute('aria-label',state.muted?'Unmute audio':'Mute audio');
      // If unmuting into a zero volume, restore a working level.
      if(!state.muted&&(state.masterVolume??0)<=0)applyMasterVolume(28,{persist:true,fromUser:false});
      const base=Math.max(0.0001,state.masterVolume??window.__NEON_VOLUME__??.28);
      if(audio?.setMuted)audio.setMuted(state.muted);
      else if(audio?.master)audio.master.gain.value=state.muted?0:base;
      if(!state.muted){
        if(state.mode==='menu')audio?.startMenuMusic?.();
        showMessage?.(state.mode==='menu'||state.mode==='paused'?`Audio on · ${Math.round((state.masterVolume||.28)*100)}%`:'Audio on');
      }else showMessage?.('Audio muted');
    }
    $('audioButton')?.addEventListener('click',toggleAudio);

    function setupTouch(){
      if(!coarsePointer)return;const joy=$('joystickZone'),knob=$('joystickKnob'),look=$('lookZone');let joyId=null,lookId=null,lastLook={x:0,y:0};
      joy.addEventListener('pointerdown',e=>{joyId=e.pointerId;joy.setPointerCapture(e.pointerId);updateJoy(e);});
      joy.addEventListener('pointermove',e=>{if(e.pointerId===joyId)updateJoy(e);});
      const endJoy=e=>{if(e.pointerId===joyId){joyId=null;moveAxis={x:0,y:0};knob.style.transform='translate(0,0)';}};joy.addEventListener('pointerup',endJoy);joy.addEventListener('pointercancel',endJoy);
      function updateJoy(e){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy),max=42,k=Math.min(1,max/Math.max(max,len));moveAxis={x:dx/max*k,y:dy/max*k};knob.style.transform=`translate(${dx*k}px,${dy*k}px)`;}
      look.addEventListener('pointerdown',e=>{lookId=e.pointerId;lastLook={x:e.clientX,y:e.clientY};look.setPointerCapture(e.pointerId);});
      look.addEventListener('pointermove',e=>{if(e.pointerId!==lookId||state.mode!=='playing')return;const dx=e.clientX-lastLook.x,dy=e.clientY-lastLook.y;lastLook={x:e.clientX,y:e.clientY};const sens=lookScale(),inv=pitchSign();player.dir=normAngle(player.dir+dx*.006*sens);player.pitch=Math.max(-canvas.height*.2,Math.min(canvas.height*.2,player.pitch-dy*.85*sens*inv));});
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
        snapshot:()=>({mode:state.mode,operation:state.operation,wave:state.wave,wavePhase:state.wavePhase,missionStage:state.missionStage,missionProgress:state.missionProgress,missionHold:state.missionHold,objective:state.objective,pending:state.pending.length,enemies:state.enemies.length,corpses:state.corpses.length,bloodDecals:state.bloodDecals.length,brokenGlass:state.brokenGlass.size,airborneEnemies:state.enemies.filter(enemy=>!enemy.grounded).length,score:player.score,kills:player.kills,shots:player.shots,hits:player.hits,z:player.z,vz:player.vz,grounded:player.grounded,jetFuel:player.jetFuel,health:player.health,shield:player.shield,armor:player.armor,shieldDelay:player.shieldDelay,ads:player.ads,autoLock:state.autoLock,lockTarget:state.lockTarget?.type||null,gore:state.gore,ammo:player.ammo,weapon:weaponConfig().id,carIndex:player.carIndex,melee:state.melee,destroyLive:state.destroyNodes.filter(n=>!n.dead).length,destroyTotal:state.destroyNodes.length,commanderAbility:state.commander?.activeAbility||null,cloakTimer:state.commander?.cloakTimer||0,tutorialStep:state.tutorialStep,timeOfDay:state.timeOfDay,finisherCam:!!state.finisherCam?.active,comboPeak:state.comboPeak,damageTaken:state.damageTaken,daily:state.daily?.id||null,opId:currentOp()?.id||null}),
        completePhase:()=>{state.qaInvulnerable=true;const def=missionStages()[state.missionStage];if(def?.type==='defend'){state.missionHold=0;}else if(def?.type==='destroy'){for(const node of state.destroyNodes){node.hp=0;node.dead=true;}advanceMission();}else if(def?.type==='hvt'){const boss=state.enemies.find(enemy=>enemy.commander&&!enemy.dead);if(boss)killEnemy(boss,false);else advanceMission();}else if(state.missionStage<missionStages().length-1)advanceMission();},
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
        melee:()=>meleeTakedown(),
        damageNearestRelay:(amount=40)=>{const node=nearestLiveNode();if(node)damageDestroyNode(node,amount);return !!node;},
        triggerBossPhase:()=>{const boss=state.enemies.find(e=>e.commander&&!e.dead);if(!boss)return false;const def=missionStages()[state.missionStage];const phases=def?.boss?.phases||[];if(boss.phase>=phases.length)return false;boss.hp=Math.max(1,boss.maxHp*phases[boss.phase].at-1);return true;}
      };
    }
    window.__NEON_3D__={
      world:{map,WALL_HEIGHTS,GROUND_HEIGHT,MAP_W,MAP_H,STAIR_ZONES,enemyTypes:ENEMY_TYPES,weapons:WEAPONS},
      frame:()=>{
        // Never reuse a stale camera snapshot — always recompute from player.
        threeFrame.mode=state.mode;threeFrame.timeOfDay=state.timeOfDay;threeFrame.totalTime=state.totalTime;
        threeFrame.camera=getRenderCamera();state.camera=threeFrame.camera;
        threeFrame.player=player;threeFrame.enemies=state.enemies;threeFrame.cars=state.cars;threeFrame.corpses=state.corpses;threeFrame.bloodDecals=state.bloodDecals;threeFrame.brokenGlass=state.brokenGlass;threeFrame.projectiles=state.projectiles;threeFrame.pickups=state.pickups;threeFrame.particles=state.particles;threeFrame.muzzle=state.muzzle;threeFrame.melee=state.melee;threeFrame.screenShake=state.screenShake;threeFrame.fov=viewFov();threeFrame.missionStage=state.missionStage;threeFrame.missionProgress=state.missionProgress;threeFrame.objectiveTarget=state.objectiveTarget;threeFrame.wavePhase=state.wavePhase;threeFrame.gore=state.gore;threeFrame.commander=state.commander;threeFrame.destroyNodes=state.destroyNodes;threeFrame.finisherCam=state.finisherCam;
        threeFrame.opId=currentOp()?.id||null;
        threeFrame.nightVision=!!(state.mode==='playing'&&opRules().nightVision);
        return threeFrame;
      },
      ready:(options={})=>{state.threeReady=!options.fallback;if(state.threeReady)document.body.classList.add('three-ready');else document.body.classList.add('three-fallback');},
      fail:(error)=>{state.threeReady=false;const screen=$('webglErrorScreen'),text=$('webglErrorText');if(text&&error)text.textContent=`The 3D renderer could not start (${String(error.message||error).slice(0,140)}). Update your browser or enable hardware acceleration to continue.`;screen?.classList.remove('hidden');}
    };
    const webglProbe=document.createElement('canvas');
    let webgl2Available=false;try{webgl2Available=!!webglProbe.getContext('webgl2');}catch{}
    if(compatibilityMode)window.__NEON_3D__.ready({fallback:true});
    else if(webgl2Available)import('/scene3d.js').catch(error=>window.__NEON_3D__.fail(error));
    else window.__NEON_3D__.fail(new Error('WebGL2 context unavailable'));
    if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
    let preferredTime='day',preferredAutoLock=true,preferredGore=true,preferredOperation=0;try{preferredTime=localStorage.getItem('neon-breach-time')||'day';preferredAutoLock=localStorage.getItem('neon-breach-auto-lock')!=='off';preferredGore=localStorage.getItem('neon-breach-gore')!=='off';preferredOperation=Number(localStorage.getItem('neon-breach-operation')||0);}catch{}
    // Join party via shared link ?party=CODE
    try{
      const partyParam=new URLSearchParams(location.search).get('party');
      if(partyParam)setPartyCode(partyParam);
      else setPartyCode(getPartyCode());
    }catch{setPartyCode(getPartyCode());}
    getSyncCode();
    setMissionTime(preferredTime,false);setAutoLock(preferredAutoLock,false,false);setGore(preferredGore,false);setOperation(preferredOperation,false);renderArsenal();renderDailyPanel();updateBestScore();loadCampaignRecords();initAssets();resize();setupTouch();render();runBootSplash();armMenuMusicOnGesture();sendTelemetry('loaded');requestAnimationFrame(frame);
