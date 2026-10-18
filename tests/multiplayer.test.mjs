import test from 'node:test';import assert from 'node:assert/strict';
import {Match,RULES,validateInput,arenaWorld,openAt,clearShot} from '../server/multiplayer-match.mjs';
import {map,coverAt,ARENAS} from '../public/data.js';
import {movePlayer,surfaceAt} from '../public/multiplayer-movement.js';
import {vehicleOpen} from '../public/multiplayer-vehicles.js';
const command=(seq,extra={})=>({seq,forward:0,strafe:0,angle:0,pitch:0,fire:false,reload:false,jump:false,...extra});
test('arena snapshots are independent and do not mutate the shared campaign map or cover selection',()=>{const before=structuredClone(map),cover=coverAt(10.2,8.8),a=arenaWorld('city-gate'),b=arenaWorld('jabi-lake');assert.deepEqual(map,before);assert.equal(coverAt(10.2,8.8),cover);assert.notDeepEqual(a.map,b.map);a.map[0][0]=99;assert.notEqual(b.map[0][0],99);a.covers[0].height=99;assert.notEqual(cover.height,99);});
test('inputs reject stale sequence, nonfinite values, speed injection and invalid booleans',()=>{for(const input of [command(0),command(2,{forward:9}),command(2,{pitch:NaN}),command(2,{fire:1}),command(-1)])assert.equal(validateInput(input,0),null);assert.equal(validateInput(command(1,{hp:999,uid:'forged'}),0).hp,undefined);});
test('rooms cap players and bind one player to each account identity',()=>{const match=new Match();match.join('one','one');assert.throws(()=>match.join('one','alias'));for(let i=2;i<=8;i++)match.join(String(i),`p${i}`);assert.throws(()=>match.join('9','nine'));assert.equal(match.players.size,8);assert.ok(match.snapshot().players.every(p=>!('uid' in p)));});
test('server movement is fixed-rate and held input expires instead of drifting on disconnect',()=>{const m=new Match(),p=m.join('a','a'),start={x:p.x,y:p.y};m.input(p,command(1,{forward:1,strafe:1}));m.tick();assert.ok(Math.hypot(p.x-start.x,p.y-start.y)<=RULES.speed*RULES.tick+.001);for(let n=0;n<10;n++)m.tick();const stop={x:p.x,y:p.y};for(let n=0;n<30;n++)m.tick();assert.deepEqual({x:p.x,y:p.y},stop);});
test('server validates fire rate, damage, death, delayed respawn and spawn protection',()=>{
  const m=new Match(),a=m.join('a','a'),b=m.join('b','b');m.time=3;Object.assign(a,{x:12,y:35,z:0,angle:Math.PI/2,pitch:0});Object.assign(b,{x:12,y:38,z:0,protectedUntil:0});
  assert.ok(clearShot(m.world,12,35,1.45,Math.PI/2,0,3));m.fire(a);assert.equal(b.hp,75);m.fire(a);assert.equal(b.hp,75);
  for(let n=0;n<3;n++){m.time+=.2;m.fire(a);}assert.equal(b.hp,0);assert.equal(a.kills,1);assert.equal(b.deaths,1);m.fire(a);assert.equal(a.kills,1);
  m.time=b.deadUntil-.1;m.tick();assert.equal(b.hp,0);for(let n=0;n<5;n++)m.tick();assert.equal(b.hp,100);assert.ok(b.protectedUntil>m.time);assert.ok(openAt(m.world,b.x,b.y));
});
test('solid cover blocks server-owned damage and reload is timed',()=>{
  const m=new Match(),a=m.join('a','a'),b=m.join('b','b');m.time=3;Object.assign(a,{x:2.5,y:2.5,angle:0,pitch:0,ammo:1});Object.assign(b,{x:5.5,y:2.5,protectedUntil:0});m.world.map[2][4]=2;m.fire(a);assert.equal(b.hp,100);assert.equal(a.ammo,0);
  m.input(a,command(1,{reload:true}));m.tick();assert.ok(a.reloadUntil>m.time);assert.equal(a.ammo,0);for(let n=0;n<34;n++)m.tick();assert.equal(a.ammo,30);
});
test('elapsed-time rounds finish, freeze results, and only the host can start the next arena',()=>{
  const m=new Match(),host=m.join('a','a');m.tick(4);assert.equal(m.remaining,180);const peer=m.join('b','b');
  m.tick(7.5);assert.equal(m.remaining,172.5);host.kills=3;m.tick(180);
  assert.equal(m.phase,'finished');assert.equal(m.remaining,0);assert.equal(m.round,1);assert.equal(m.world.arena,'city-gate');assert.equal(m.results[0].id,host.id);
  const frozen=JSON.stringify(m.results),ammo=host.ammo;m.fire(host);m.tick(200);assert.equal(host.ammo,ammo);assert.equal(JSON.stringify(m.results),frozen);
  assert.equal(m.restart(peer),false);assert.equal(m.restart(host),true);assert.equal(m.round,2);assert.equal(m.world.arena,'millennium-park');assert.equal(m.remaining,180);assert.equal(m.phase,'playing');assert.ok([...m.players.values()].every(p=>p.hp===100&&p.kills===0));
});
test('host ownership transfers on departure and shot feedback has clipped finite 3D endpoints',()=>{
  const m=new Match(),host=m.join('a','a'),peer=m.join('b','b');m.leave('a');assert.equal(m.hostId,peer.id);
  m.time=3;Object.assign(peer,{x:2.5,y:2.5,z:0,angle:0,pitch:0});m.world.map[2][4]=2;m.fire(peer);const shot=m.events.find(e=>e.kind==='shot');assert.ok([shot.z,shot.endX,shot.endY,shot.endZ].every(Number.isFinite));assert.ok(shot.endX<4);m.finish();assert.equal(m.restart(peer),true);
});
test('every supported arena admits eight separated players and rejects unknown layouts',()=>{for(const arena of ARENAS){const m=new Match(arena.id);for(let n=0;n<8;n++)m.join(String(n),`p${n}`);for(const p of m.players.values()){assert.ok(openAt(m.world,p.x,p.y));for(const q of m.players.values())if(p!==q)assert.ok(Math.hypot(p.x-q.x,p.y-q.y)>=2);}}assert.throws(()=>arenaWorld('unknown'));});
test('input timeout stops movement but does not freeze airborne players',()=>{const m=new Match(),p=m.join('a','a');m.input(p,command(1,{jump:true}));m.tick();assert.ok(p.z>0);for(let n=0;n<40;n++)m.tick();assert.equal(p.z,0);assert.equal(p.vz,0);});
test('held jet input flies with bounded server fuel/altitude, releases, lands and recharges',()=>{
  const m=new Match(),p=m.join('a','a');
  for(let seq=1;seq<=20;seq++){m.input(p,command(seq,{jump:true,jetFuel:9999,z:99}));m.tick();}
  assert.ok(p.z>2);assert.ok(p.jetFuel<80);assert.ok(p.z<=RULES.jetHeight);assert.ok(p.jetting);
  let minimumFuel=p.jetFuel;
  for(let seq=21;seq<=240;seq++){m.input(p,command(seq,{jump:true}));m.tick();minimumFuel=Math.min(minimumFuel,p.jetFuel);assert.ok(p.z<=RULES.jetHeight);assert.ok(p.jetFuel>=0&&p.jetFuel<=100);}
  assert.ok(minimumFuel<2); // Ground contact later recharges the exhausted pack.
  m.input(p,command(241));m.tick();assert.equal(p.jetting,false);
  for(let n=0;n<80;n++)m.tick();assert.equal(p.z,0);assert.ok(p.jetFuel>50);
});
test('jet landing supports cover instead of falling through and respawning',()=>{
  const world=arenaWorld('city-gate');world.covers.push({x:12.5,y:12.5,w:1,d:1,height:.7});
  const p={x:12.5,y:12.5,z:2,vz:-1,jetFuel:70,angle:0,pitch:0,jumpHeld:false};
  for(let n=0;n<40;n++)movePlayer(p,null,world);
  assert.equal(surfaceAt(world,p.x,p.y),.7);assert.equal(p.z,.7);assert.equal(p.vz,0);
  movePlayer(p,command(1,{jump:true}),world);assert.ok(p.z>.7);
});
test('jet hover has one ignition and flameout stays locked until landing',()=>{
 const m=new Match(),p=m.join('jet','jet');let ignitions=0,previous=false,sawFlameout=false;
 for(let seq=1;seq<=180;seq++){m.input(p,command(seq,{jump:true}));m.tick();if(p.jetting&&!previous)ignitions++;previous=p.jetting;if(p.jetEmpty){sawFlameout=true;assert.equal(p.jetFuel>=0,true);}}
 assert.equal(ignitions,1);assert.equal(sawFlameout,true);assert.equal(p.z,0);assert.equal(p.jetEmpty,false);
 m.input(p,command(181));m.tick();m.input(p,command(182,{jump:true}));m.tick();assert.equal(p.jetting,true);assert.equal(m.snapshot().players[0].jetEmpty,false);
});

test('walking, sprinting and aiming match campaign pacing with acceleration and normalized diagonals',()=>{
  const world={map:Array.from({length:48},()=>Array(48).fill(0)),covers:[]};
  function run(extra){const p={x:12,y:12,z:0,vz:0,hp:100,jetFuel:100,angle:0};let first;for(let n=0;n<20;n++){movePlayer(p,command(n,{forward:1,...extra}),world);if(n===0)first=p.x-12;}return {distance:Math.hypot(p.x-12,p.y-12),first,p};}
  const walk=run({}),sprint=run({sprint:true}),aim=run({aim:true}),diagonal=run({strafe:1});
  assert.equal(RULES.speed,2.9);assert.equal(RULES.sprintSpeed,4.35);assert.ok(walk.distance>2.7&&walk.distance<2.9);assert.ok(walk.first<RULES.speed*RULES.tick);assert.ok(sprint.distance>4&&sprint.distance<4.35);assert.ok(aim.distance<walk.distance*.75);assert.ok(Math.abs(diagonal.distance-walk.distance)<.001);
  const before=walk.p.x;for(let n=0;n<10;n++)movePlayer(walk.p,command(21+n),world);assert.ok(walk.p.x-before<.1);assert.equal(walk.p.moveVx,0);
  for(const field of ['aim','sprint','interact'])assert.equal(validateInput(command(1,{[field]:'yes'})),null);
});

test('day/night is server-owned, inherited by joining players and preserved across arena rotations',()=>{
  const m=new Match('city-gate',undefined,'night');m.join('a','a');m.join('b','b');assert.equal(m.world.timeOfDay,'night');assert.equal(m.snapshot().timeOfDay,'night');m.remaining=.01;m.tick();assert.equal(m.world.timeOfDay,'night');assert.equal(m.snapshot().timeOfDay,'night');assert.throws(()=>new Match('city-gate',undefined,'forged'));assert.equal(validateInput(command(1,{timeOfDay:'forged'})).timeOfDay,undefined);
});

test('all arenas have collision-safe taxis, kekes and buses with exclusive server-owned entry and safe exit',()=>{
  for(const arena of ARENAS){const m=new Match(arena.id),p=m.join('a','a'),q=m.join('b','b');assert.ok(m.world.vehicles.length>=3);assert.ok(['taxi','tricycle','bus'].every(kind=>m.world.vehicles.some(c=>c.kind===kind)));for(const car of m.world.vehicles)assert.ok(vehicleOpen(m.world,car));
    const car=m.world.vehicles.find(c=>c.kind==='taxi');Object.assign(p,{x:car.x-Math.sin(car.dir)*1.1,y:car.y+Math.cos(car.dir)*1.1,z:0});assert.equal(m.toggleVehicle(p),true);assert.equal(car.driver,p.id);assert.equal(p.carId,car.id);Object.assign(q,{x:p.x,y:p.y,z:0});assert.equal(m.toggleVehicle(q),false);
    m.input(p,command(1,{interact:true}));m.tick();assert.equal(p.carId,null);m.tick();assert.equal(p.carId,null);assert.ok(openAt(m.world,p.x,p.y));
  }
});

test('vehicle driving is bounded, cannot teleport, blocks walls, and releases ownership on disconnect',()=>{
  const m=new Match(),p=m.join('a','a'),car=m.world.vehicles.find(c=>c.id==='vehicle-6');Object.assign(p,{x:car.x,y:car.y+1.1,z:0});assert.ok(m.toggleVehicle(p));const x=car.x;
  for(let seq=1;seq<=20;seq++){m.input(p,command(seq,{forward:1,x:999,carId:'forged',speed:999}));m.tick();assert.equal(p.x,car.x);assert.ok(Math.abs(car.speed)<=7.1);assert.ok(vehicleOpen(m.world,car));}assert.ok(car.x-x>3);assert.ok(car.x-x<7.1);
  car.dir=0;car.x=45;car.y=36;for(let n=0;n<40;n++){m.input(p,command(21+n,{forward:1}));m.tick();}assert.ok(car.x<47);assert.ok(vehicleOpen(m.world,car));m.leave('a');assert.equal(car.driver,null);assert.equal(car.speed,0);
});
test('interaction taps survive coalesced input packets and held buttons toggle only once',()=>{
  const m=new Match(),p=m.join('tap','tap'),car=m.world.vehicles.find(c=>c.id==='vehicle-6');
  Object.assign(p,{x:car.x,y:car.y+1.1,z:0});
  m.input(p,command(1,{interact:true}));m.input(p,command(2,{interact:false}));m.tick();
  assert.equal(p.carId,car.id,'press/release arriving before a tick must still enter');
  m.input(p,command(3,{interact:true}));m.tick();assert.equal(p.carId,null);
  m.input(p,command(4,{interact:true}));m.tick();assert.equal(p.carId,null,'holding must not re-enter');
  m.input(p,command(5,{interact:false}));m.input(p,command(6,{interact:true}));m.input(p,command(7,{interact:false}));m.tick();
  assert.equal(p.carId,car.id);assert.equal(m.input(p,command(6,{interact:true})),false);m.tick();assert.equal(p.carId,car.id);
});

test('sustained fire damages vehicle hulls gradually and vehicle impacts award server-owned eliminations',()=>{
  const m=new Match(),a=m.join('a','a'),b=m.join('b','b'),car=m.world.vehicles.find(c=>c.kind==='bus');m.time=3;Object.assign(a,{x:car.x-4,y:car.y,z:0,angle:0,pitch:0});m.fire(a);assert.ok(car.hp<car.maxHp&&car.hp>car.maxHp*.9);assert.equal(car.destroyed,false);
  for(let n=0;n<120&&!car.destroyed;n++){m.time+=.2;a.ammo=30;m.fire(a);}assert.equal(car.destroyed,true);assert.equal(car.hp,0);
  const taxi=m.world.vehicles.find(c=>c.id==='vehicle-6');taxi.dir=0;Object.assign(a,{x:taxi.x,y:taxi.y+1.1,z:0});assert.ok(m.toggleVehicle(a));Object.assign(b,{x:taxi.x+1.1,y:taxi.y,z:0,hp:100,protectedUntil:0});taxi.speed=6;m.input(a,command(1,{forward:1}));m.tick();assert.equal(b.hp,0);assert.equal(a.kills,1);assert.equal(b.deaths,1);
});
