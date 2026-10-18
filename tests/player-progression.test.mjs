import test from 'node:test';import assert from 'node:assert/strict';
import {badgeState,readBadge,recordBadgeRun,mergeBadges} from '../public/player-progression.js';
import {shouldAutoReload,reloadRounds} from '../public/ammo-rules.js';
import {WEAPONS} from '../public/data.js';
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('auto-reload uses finite reserves, partial magazines and every gun-specific duration',()=>{
  assert.equal(shouldAutoReload(0,1,false),true);assert.equal(shouldAutoReload(0,0,false),false);assert.equal(shouldAutoReload(1,30,false),false);assert.equal(shouldAutoReload(0,30,true),false);
  let rounds={ammo:0,reserve:35};rounds=reloadRounds(rounds.ammo,rounds.reserve,30);assert.deepEqual(rounds,{ammo:30,reserve:5});rounds=reloadRounds(0,rounds.reserve,30);assert.deepEqual(rounds,{ammo:5,reserve:0});assert.deepEqual(reloadRounds(0,0,30),{ammo:0,reserve:0});
  assert.equal(new Set(WEAPONS.map(w=>w.reload)).size,WEAPONS.length);assert.ok(WEAPONS.find(w=>w.id==='lmg').reload>WEAPONS.find(w=>w.id==='pistol').reload);
});
test('badge XP rewards gameplay, accuracy, victory and improved high scores without duplicate runs',()=>{
  const storage=memory(),run={id:'campaign:1',seconds:90,kills:8,score:1500,shots:40,hits:30,victory:true};
  const first=recordBadgeRun(storage,'one',run);assert.ok(first.gained>0);assert.ok(first.level>1);assert.equal(recordBadgeRun(storage,'one',run).gained,0);
  const same=recordBadgeRun(storage,'two',{...run,id:'base',score:1000,shots:40,hits:10,victory:false});
  const improved=recordBadgeRun(storage,'three',{...run,id:'better',score:2000,shots:40,hits:35,victory:true});assert.ok(improved.gained>same.gained);
  assert.equal(readBadge(storage,'other').xp,0);assert.equal(recordBadgeRun(storage,'one',{...run,id:'empty',kills:0,victory:false}).gained,0);assert.equal(recordBadgeRun(storage,'one',{...run,id:'too-fast',seconds:1}).gained,0);
  assert.equal(badgeState(0).level,1);assert.equal(badgeState(250).level,2);assert.equal(badgeState(1000).level,3);assert.equal(badgeState(Infinity).level,50);
});
test('badge persistence fails honestly and guest upgrades are idempotent',()=>{
  const run={id:'one',seconds:60,kills:3,score:400},storage=memory();recordBadgeRun(storage,'guest',run);const xp=readBadge(storage,'guest').xp;mergeBadges(storage,'guest','account');mergeBadges(storage,'guest','account');assert.equal(readBadge(storage,'account').xp,xp);assert.equal(readBadge(storage,'guest').xp,0);
  const broken={getItem(){throw Error('Denied');},setItem(){throw Error('Denied');}};assert.equal(recordBadgeRun(broken,'one',run).saved,false);assert.equal(recordBadgeRun(broken,'one',run).reason,'storage');assert.equal(recordBadgeRun(storage,'account',{...run,id:'one'}).reason,'duplicate');assert.equal(recordBadgeRun(undefined,'one',run).gained,0);
});
