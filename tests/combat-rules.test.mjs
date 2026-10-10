import test from 'node:test';
import assert from 'node:assert/strict';
import {rayVehicleDistance,blastDamage,encounterExtras,MAX_LIVE_ENEMIES,vehicleIntegrity,vehicleBallisticDamage,vehicleImpactDamage,enemyPerception,tacticalShotSpread,perceptionDue,shareObservation,reinforcementEntry} from '../public/combat-rules.js';

test('tactical spread rewards stable grounded shooting, not sprinting or flight',()=>{
  assert.equal(tacticalShotSpread(.02,0,true,false),.02);
  assert.ok(tacticalShotSpread(.02,4,true,false)>.02);
  assert.ok(tacticalShotSpread(.02,4,false,false)>tacticalShotSpread(.02,4,true,false));
  assert.ok(tacticalShotSpread(.02,4,true,true)>tacticalShotSpread(.02,4,true,false));
  assert.ok(Number.isFinite(tacticalShotSpread(NaN,Infinity)));
});
test('perception is bounded to one sample per tenth second without catch-up loops',()=>{
  const enemy={perceptionTimer:.03};assert.equal(perceptionDue(enemy,.01),false);
  assert.equal(perceptionDue(enemy,.03),true);assert.equal(enemy.perceptionTimer,.1);
  assert.equal(perceptionDue(enemy,.02),false);assert.equal(perceptionDue(enemy,5),true);assert.equal(enemy.perceptionTimer,.1);
});
test('squad reports share the observed location only with nearby live allies',()=>{
  const observer={x:0,y:0,lastSeenX:8,lastSeenY:9},ally={x:2,y:0,awareness:0};
  assert.equal(shareObservation(observer,ally),true);assert.equal(ally.awareness,.58);assert.equal(ally.lastSeenX,8);assert.equal(ally.lastSeenY,9);
  assert.equal(shareObservation(observer,{x:10,y:0}),false);assert.equal(shareObservation(observer,{x:2,y:0,dead:true}),false);
});
test('reinforcements reject nearby, blocked, occupied and visible forward entries',()=>{
  const player={x:10,y:10,dir:0},candidates=[[11,10],[20,10],[0,10]];
  assert.deepEqual(reinforcementEntry(candidates,player,[],()=>true,()=>true),[0,10]);
  assert.equal(reinforcementEntry(candidates,player,[],()=>false,()=>false),null);
  assert.equal(reinforcementEntry([[0,10]],player,[{x:0,y:11}],()=>true,()=>false),null);
  assert.deepEqual(reinforcementEntry([[20,10]],player,[],()=>true,()=>false),[20,10]);
});

test('vehicle hits use oriented bounds and stop at walls/range',()=>{
  const car={x:12,y:36,dir:0,kind:'taxi'};
  assert.ok(Math.abs(rayVehicleDistance(8,36,0,car)-3.02)<1e-8);
  assert.equal(rayVehicleDistance(8,38,0,car),null);
  assert.equal(rayVehicleDistance(8,36,Math.PI,car),null);
  assert.equal(rayVehicleDistance(8,36,0,car,3),null);
  assert.ok(Math.abs(rayVehicleDistance(8,36,0,{...car,dir:Math.PI/2})-3.54)<1e-8);
  assert.ok(Math.abs(rayVehicleDistance(8,36,0,{...car,kind:'tricycle'})-3.28)<1e-8);
  assert.ok(Math.abs(rayVehicleDistance(8,36,0,{...car,kind:'bus'})-2.3)<1e-8);
});
test('blast damage falls off and rejects invalid distances',()=>{
  assert.equal(blastDamage(0),120);
  assert.equal(blastDamage(1.9),60);
  for(const distance of [3.8,5,-1,NaN,Infinity])assert.equal(blastDamage(distance),0);
  assert.equal(blastDamage(1.9,3.8,50),25);
});
test('extra guards are spread out and wave additions are bounded',()=>{
  const squad=[['wraith',10,10],['specter',16,16],['wraith',22,22]];
  const extras=encounterExtras(squad);
  assert.equal(extras.length,2);
  assert.ok(extras.every((enemy,index)=>Math.hypot(enemy[1]-squad[index][1],enemy[2]-squad[index][2])>=5));
  assert.equal(encounterExtras(Array(20).fill(squad[0])).length,3);
  assert.deepEqual(encounterExtras([]),[]);
  assert.equal(MAX_LIVE_ENEMIES,24);
});
test('vehicle durability requires sustained fire and preserves plating bonuses',()=>{
  assert.equal(vehicleIntegrity('taxi'),450);assert.equal(vehicleIntegrity('bus'),800);assert.equal(vehicleIntegrity('tricycle'),300);assert.equal(vehicleIntegrity('taxi',140),490);
  const shot=vehicleBallisticDamage(27);assert.ok(450-shot*10>0);assert.ok(450-shot*56<=0);
  for(const invalid of [0,-1,Infinity,NaN])assert.equal(vehicleBallisticDamage(invalid),0);
});
test('roadkills use full vehicle bounds, swept movement and reverse driving',()=>{
  const car={kind:'taxi',x:10,y:12,dir:0,speed:7},enemy={x:9,y:12,z:0,spawn:0};
  assert.ok(vehicleImpactDamage(car,8,12,enemy)>100);assert.ok(vehicleImpactDamage(car,2,12,{...enemy,x:5})>100);
  assert.ok(vehicleImpactDamage({...car,kind:'bus'},9,12,{...enemy,x:11.5})>100);
  assert.ok(vehicleImpactDamage({...car,x:5,speed:-7},10,12,{...enemy,x:7})>100);
  for(const change of [{y:15},{z:10},{dead:true},{spawn:1},{vehicleHitCooldown:.5}])assert.equal(vehicleImpactDamage(car,8,12,{...enemy,...change}),0);
  assert.equal(vehicleImpactDamage({...car,speed:0},8,12,enemy),0);
});
test('unaware guards have directional sight but hear nearby vehicles and gunfire',()=>{
  const guard={facing:0,awareness:0};assert.equal(enemyPerception(guard,5,0,5),true);assert.equal(enemyPerception(guard,-5,0,5),false);assert.equal(enemyPerception(guard,-5,0,5,true),true);assert.equal(enemyPerception({...guard,awareness:.8},-5,0,5),true);assert.equal(enemyPerception(guard,-1,0,1),true);
});
