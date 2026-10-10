import test from 'node:test';
import assert from 'node:assert/strict';
import {collectSupply,missionInstruction,missionTactic,WEAPONS,OPERATIONS} from '../public/data.js';
test('every mission stage provides actionable tactical advice without changing objectives',()=>{
  for(const operation of OPERATIONS)for(const stage of operation.stages){assert.ok(missionTactic(stage).length>40);assert.ok(stage.objective);}
  assert.match(missionTactic({type:'defend'}),/pauses when you leave/);
  assert.match(missionTactic({type:'extract'}),/intact vehicle/);
  assert.match(missionTactic({type:'reach'}),/more than eliminating every patrol/);
});

test('medkits restore actual missing health and full health does not consume one',()=>{
  const p={health:90,maxHealth:100};assert.equal(collectSupply(p,'health',WEAPONS[0]),'+10 HEALTH');
  assert.equal(p.health,100);assert.equal(collectSupply(p,'health',WEAPONS[0]),null);
});
test('ammo boxes cap reserve, preserve full supplies and scale to machine guns',()=>{
  const p={reserve:0};assert.equal(collectSupply(p,'ammo',WEAPONS[5]),'+90 MG-60 AMMO');
  p.reserve=337;assert.equal(collectSupply(p,'ammo',WEAPONS[5]),'+1 MG-60 AMMO');
  assert.equal(collectSupply(p,'ammo',WEAPONS[5]),null);
});
test('shield and armor supplies are bounded and unknown types are ignored',()=>{
  const p={shield:45,maxShield:50,shieldDelay:5,armor:90,maxArmor:100};
  assert.equal(collectSupply(p,'shield',WEAPONS[0]),'+5 SHIELD');assert.equal(p.shieldDelay,0);
  assert.equal(collectSupply(p,'armor',WEAPONS[0]),'+10 ARMOR');assert.equal(collectSupply(p,'invalid',WEAPONS[0]),null);
});
test('SMG and LMG offer distinct automatic fire roles without changing legacy indices',()=>{
  assert.deepEqual(WEAPONS.slice(0,4).map(w=>w.id),['rifle','shotgun','pistol','dmr']);
  const smg=WEAPONS[4],lmg=WEAPONS[5];assert.equal(smg.mode,'AUTO');assert.equal(lmg.mode,'AUTO');
  assert.ok(smg.cooldown<WEAPONS[0].cooldown);assert.ok(lmg.mag>smg.mag);assert.ok(lmg.reload>smg.reload);
});
test('mission directions explain the required action, not just phase names',()=>{
  assert.match(missionInstruction({type:'defend'},5,15),/Move into/);
  assert.match(missionInstruction({type:'defend'},1,15),/15s remaining/);
  assert.match(missionInstruction({type:'destroy'},2,0,3),/Shoot.*3 remaining/);
  assert.match(missionInstruction({type:'hvt'},2),/defeat the commander/);
  assert.match(missionInstruction({type:'extract'},2),/E \/ Triangle to enter/);
  assert.match(missionInstruction({type:'extract'},2,0,0,true),/Drive.*finish the mission/);
});
