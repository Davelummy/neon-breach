import {randomBytes} from 'node:crypto';
import {snapshotArena,ARENAS,DISTRICT_SPAWNS,WALL_HEIGHTS,vehicleBounds} from '../public/data.js';
import {RULES,openAt,footOpen,movePlayer} from '../public/multiplayer-movement.js';
import {createFleet,nearbyVehicle,vehicleExit,driveVehicle} from '../public/multiplayer-vehicles.js';
import {rayVehicleDistance,vehicleBallisticDamage,vehicleImpactDamage} from '../public/combat-rules.js';
export {RULES,openAt};
export function arenaWorld(id){
  return snapshotArena(id);
}
export function traceShotDistance(world,x,y,z,angle,pitch,distance){
  for(let t=.3;t<distance;t+=.18){const xx=x+Math.cos(angle)*Math.cos(pitch)*t,yy=y+Math.sin(angle)*Math.cos(pitch)*t,zz=z+Math.sin(pitch)*t;
    const type=world.map[Math.floor(yy)]?.[Math.floor(xx)];if(type===undefined)return Math.max(0,t-.18);
    const boundary=xx<1||yy<1||xx>=47||yy>=47;
    if(type&&zz<(boundary?2.55:WALL_HEIGHTS[type]))return Math.max(0,t-.18);
    if(world.covers.some(c=>Math.abs(xx-c.x)<c.w/2&&Math.abs(yy-c.y)<c.d/2&&zz<c.height))return Math.max(0,t-.18);
  }return distance;
}
export function clearShot(world,x,y,z,angle,pitch,distance){return traceShotDistance(world,x,y,z,angle,pitch,distance)>=distance;}
export function validateInput(value,last=-1){
  if(!value||!Number.isSafeInteger(value.seq)||value.seq<=last||value.seq>1e9||!['forward','strafe','angle','pitch'].every(k=>Number.isFinite(value[k])))return null;
  if(Math.abs(value.forward)>1||Math.abs(value.strafe)>1||Math.abs(value.angle)>100||Math.abs(value.pitch)>.65)return null;
  if(!['fire','reload','jump'].every(k=>typeof value[k]==='boolean'))return null;
  if(!['aim','sprint','interact'].every(k=>value[k]===undefined||typeof value[k]==='boolean'))return null;
  return {seq:value.seq,forward:value.forward,strafe:value.strafe,angle:value.angle,pitch:value.pitch,fire:value.fire,reload:value.reload,jump:value.jump,aim:!!value.aim,sprint:!!value.sprint,interact:!!value.interact};
}
export class Match {
  constructor(arena='city-gate',code=randomBytes(5).toString('hex').toUpperCase(),timeOfDay='day'){
    if(!['day','night'].includes(timeOfDay))throw Error('Choose day or night.');this.timeOfDay=timeOfDay;
    this.code=code;this.world=arenaWorld(arena);this.world.timeOfDay=timeOfDay;createFleet(this.world);this.players=new Map();this.time=0;this.remaining=RULES.round;this.round=1;this.phase='playing';this.hostId=null;this.events=[];this.results=[];
  }
  spawn(player){
    this.releaseVehicle(player);
    let best=null,score=-Infinity;const others=[...this.players.values()].filter(p=>p!==player&&p.hp>0);
    for(const [x,y] of DISTRICT_SPAWNS){if(!footOpen(this.world,x,y))continue;const distance=others.length?Math.min(...others.map(p=>Math.hypot(p.x-x,p.y-y))):20;
      if(distance<2)continue;const seen=others.filter(p=>clearShot(this.world,p.x,p.y,p.z+1.45,Math.atan2(y-p.y,x-p.x),0,Math.hypot(x-p.x,y-p.y))).length;
      if(distance-seen*12>score){score=distance-seen*12;best=[x,y];}
    }
    if(!best)return false;
    Object.assign(player,{x:best[0],y:best[1],z:0,vz:0,moveVx:0,moveVy:0,carId:null,interactHeld:false,pendingInteract:false,jumpHeld:false,jetFuel:100,jetEmpty:false,jetting:false,hp:100,ammo:RULES.magazine,deadUntil:0,protectedUntil:this.time+RULES.protection,reloadUntil:0,nextShot:this.time,input:null,inputAt:this.time});
    player.angle=[12,24,36].some(l=>Math.abs(player.x-l)<1)?(player.y>24?-Math.PI/2:Math.PI/2):(player.x>24?Math.PI:0);player.pitch=0;return true;
  }
  join(uid,name){
    if(this.players.has(uid))throw Error('This account is already in the room.');
    if(this.players.size>=RULES.players)throw Error('Room is full.');
    const player={uid,id:randomBytes(8).toString('hex'),name,kills:0,deaths:0,angle:0,pitch:0,lastSeq:-1,jumpHeld:false};
    if(!this.spawn(player))throw Error('No safe spawn is available.');
    this.players.set(uid,player);this.hostId||=player.id;return player;
  }
  input(player,value){
    const input=validateInput(value,player.lastSeq);if(!input)return false;
    // A tap is an edge, not a movement state: a later release packet must not
    // overwrite it before the simulation tick. The queue is bounded to one.
    if(input.interact&&!player.interactHeld)player.pendingInteract=true;
    player.interactHeld=input.interact;
    player.input=input;player.lastSeq=input.seq;player.inputAt=this.time;return true;
  }
  releaseVehicle(player){const car=this.world.vehicles?.find(c=>c.driver===player.id);if(car){car.driver=null;car.speed=0;}player.carId=null;}
  leave(uid){const player=this.players.get(uid);if(player)this.releaseVehicle(player);this.players.delete(uid);if(player?.id===this.hostId)this.hostId=this.players.values().next().value?.id||null;}
  finish(){
    this.remaining=0;this.phase='finished';
    this.results=[...this.players.values()].map(p=>({id:p.id,name:p.name,kills:p.kills,deaths:p.deaths})).sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths||a.name.localeCompare(b.name));
    for(const p of this.players.values()){p.input=null;p.pendingInteract=false;p.jetting=false;p.moveVx=p.moveVy=p.vz=0;}
    for(const car of this.world.vehicles)car.speed=0;
    this.events.push({kind:'round-end',round:this.round});
  }
  restart(player){
    if(this.phase!=='finished'||player.id!==this.hostId)return false;
    this.round++;this.phase='playing';this.remaining=RULES.round;
    this.world=arenaWorld(ARENAS[(ARENAS.findIndex(a=>a.id===this.world.arena)+1)%ARENAS.length].id);this.world.timeOfDay=this.timeOfDay;createFleet(this.world);
    for(const p of this.players.values()){p.kills=p.deaths=0;this.spawn(p);}
    this.events=[{kind:'round',round:this.round}];return true;
  }
  toggleVehicle(player){
    const car=this.world.vehicles.find(c=>c.id===player.carId);
    if(car){const exit=vehicleExit(this.world,car);if(!exit){this.events.push({kind:'vehicle',id:player.id,message:'Exit blocked · drive into open space'});return false;}this.releaseVehicle(player);Object.assign(player,exit,{z:0,vz:0,moveVx:0,moveVy:0});this.events.push({kind:'vehicle',id:player.id,message:`Exited ${car.name}`});return true;}
    const nearby=nearbyVehicle(this.world,player);if(!nearby)return false;
    nearby.driver=player.id;nearby.speed=0;player.carId=nearby.id;Object.assign(player,{x:nearby.x,y:nearby.y,z:.62,vz:0,moveVx:0,moveVy:0,angle:nearby.dir,jetting:false});this.events.push({kind:'vehicle',id:player.id,message:`Driving ${nearby.name} · E / Triangle to exit`});return true;
  }
  damagePlayer(attacker,victim,damage){
    if(victim.hp<=0||victim.protectedUntil>this.time)return;
    const applied=Math.min(victim.hp,Math.ceil(damage));victim.hp-=applied;this.events.push({kind:'hit',id:attacker.id,target:victim.id,damage:applied});
    if(!victim.hp){this.releaseVehicle(victim);victim.deaths++;victim.deadUntil=this.time+RULES.respawn;victim.input=null;attacker.kills++;this.events.push({kind:'kill',killer:attacker.name,victim:victim.name});}
  }
  fire(player){
    if(this.phase!=='playing'||player.hp<=0||player.carId||player.ammo<=0||player.reloadUntil>this.time||player.nextShot>this.time)return;
    player.nextShot=this.time+RULES.shot;player.ammo--;player.protectedUntil=0;
    const shot={kind:'shot',id:player.id,x:player.x,y:player.y,z:player.z+1.45,angle:player.angle,pitch:player.pitch};
    this.events.push(shot);
    let victim=null,nearest=35;
    for(const target of this.players.values()){
      if(target===player||target.hp<=0||target.protectedUntil>this.time)continue;
      const dx=target.x-player.x,dy=target.y-player.y,horizontal=dx*Math.cos(player.angle)+dy*Math.sin(player.angle),side=Math.abs(-dx*Math.sin(player.angle)+dy*Math.cos(player.angle));
      if(horizontal<=0||horizontal>=nearest||side>.32)continue;
      const distance=horizontal/Math.cos(player.pitch),height=player.z+1.45+Math.sin(player.pitch)*distance;
      if(height<target.z+.15||height>target.z+1.75||!clearShot(this.world,player.x,player.y,player.z+1.45,player.angle,player.pitch,distance))continue;
      nearest=horizontal;victim=target;
    }
    let vehicle=null;for(const car of this.world.vehicles){if(car.destroyed)continue;const distance=rayVehicleDistance(player.x,player.y,player.angle,car,nearest);if(distance===null||distance<=0)continue;const height=player.z+1.45+Math.tan(player.pitch)*distance;if(height<0||height>vehicleBounds(car).height||!clearShot(this.world,player.x,player.y,player.z+1.45,player.angle,player.pitch,distance/Math.cos(player.pitch)))continue;vehicle=car;nearest=distance;}
    const traceDistance=traceShotDistance(this.world,player.x,player.y,shot.z,player.angle,player.pitch,Math.min(35,nearest/Math.cos(player.pitch)));
    shot.endX=player.x+Math.cos(player.angle)*Math.cos(player.pitch)*traceDistance;shot.endY=player.y+Math.sin(player.angle)*Math.cos(player.pitch)*traceDistance;shot.endZ=shot.z+Math.sin(player.pitch)*traceDistance;
    if(vehicle){vehicle.hp=Math.max(0,vehicle.hp-vehicleBallisticDamage(RULES.damage));this.events.push({kind:'hit',id:player.id,target:vehicle.id,damage:vehicleBallisticDamage(RULES.damage)});if(!vehicle.hp){vehicle.destroyed=true;vehicle.speed=0;const driver=[...this.players.values()].find(p=>p.id===vehicle.driver);vehicle.driver=null;if(driver){driver.carId=null;const exit=vehicleExit(this.world,vehicle);if(exit)Object.assign(driver,exit);driver.z=0;this.damagePlayer(player,driver,80);}this.events.push({kind:'vehicle',id:player.id,message:`${vehicle.name} destroyed`});}return;}
    if(victim)this.damagePlayer(player,victim,RULES.damage);
  }
  tick(elapsed=RULES.tick){
    if(this.phase==='finished')return;
    const seconds=Number.isFinite(elapsed)&&elapsed>=0?elapsed:RULES.tick;
    this.time+=seconds;
    if(this.players.size>=2)this.remaining=Math.max(0,this.remaining-seconds);
    if(this.remaining<=0){this.finish();return;}
    for(const p of this.players.values()){
      if(p.hp<=0){if(this.time>=p.deadUntil&&!this.spawn(p))p.deadUntil=this.time+.5;continue;}
      const input=p.input&&this.time-p.inputAt<.25?p.input:null;
      p.vehicleHitCooldown=Math.max(0,(p.vehicleHitCooldown||0)-RULES.tick);
      if(p.reloadUntil&&this.time>=p.reloadUntil){p.ammo=RULES.magazine;p.reloadUntil=0;}
      p.reload=Math.max(0,p.reloadUntil-this.time);
      if(p.pendingInteract){p.pendingInteract=false;if(input)this.toggleVehicle(p);}
      const car=this.world.vehicles.find(c=>c.id===p.carId&&c.driver===p.id&&!c.destroyed);
      if(car){const x=car.x,y=car.y;driveVehicle(car,input,this.world);Object.assign(p,{x:car.x,y:car.y,z:.62,vz:0,angle:car.dir,jetting:false});p.jetFuel=Math.min(100,p.jetFuel+RULES.tick*18);for(const target of this.players.values()){if(target===p||target.hp<=0||target.carId)continue;const damage=vehicleImpactDamage(car,x,y,target);if(damage){target.vehicleHitCooldown=.65;p.protectedUntil=0;this.damagePlayer(p,target,damage);car.speed*=.88;}}continue;}
      movePlayer(p,input,this.world);if(!input)continue;
      if(input.reload&&!p.reloadUntil&&p.ammo<RULES.magazine)p.reloadUntil=this.time+RULES.reload;
      if(!openAt(this.world,p.x,p.y,p.z)&&p.z<.05)this.spawn(p);
      if(input.fire)this.fire(p);
    }
    this.events=this.events.slice(-24);
  }
  snapshot(){return {type:'state',phase:this.phase,hostId:this.hostId,round:this.round,arena:this.world.arena,timeOfDay:this.timeOfDay,vehicles:this.world.vehicles.map(c=>({...c})),time:this.time,remaining:this.remaining,waiting:this.players.size<2,results:this.results,events:this.events,players:[...this.players.values()].map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,z:p.z,vz:p.vz,moveVx:p.moveVx,moveVy:p.moveVy,carId:p.carId,jumpHeld:p.jumpHeld,jetFuel:p.jetFuel,jetEmpty:p.jetEmpty,jetting:p.jetting,angle:p.angle,pitch:p.pitch,hp:p.hp,ammo:p.ammo,kills:p.kills,deaths:p.deaths,ack:p.lastSeq,protected:p.protectedUntil>this.time,respawn:Math.max(0,p.deadUntil-this.time),reload:Math.max(0,p.reloadUntil-this.time)}))};}
}
