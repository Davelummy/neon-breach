import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureCheckpoint,restoreCheckpoint} from '../public/checkpoint.js';
function fixture(){
  const player={x:12,y:24,z:.62,dir:1.2,ammo:7,reserve:66,health:63,weaponIndex:0,weaponSlots:[{ammo:7,reserve:66}],carIndex:0};
  const state={arenaId:'city-gate',operation:0,difficulty:'operative',timeOfDay:'day',missionStage:2,missionHold:13.25,missionSpawnStep:1,totalTime:41.5,cars:[{x:12,y:24,hp:230,occupied:true}],enemies:[{type:'wraith',x:14,y:24,hp:34,commander:true}],pickups:[{kind:'ammo',x:15,y:25}],projectiles:[{x:14,y:24,life:.2}],destroyNodes:[{hp:30,dead:false}],brokenGlass:new Set(['5,3']),wave:3,wavePhase:'mission'};
  const options={owner:'fixture-player',width:48,height:48,enemyTypes:{wraith:{}},weaponCount:1,stageCount:5};return {player,state,options};
}
test('checkpoint round trip preserves exact tactical state and reconstructs references',()=>{
  const {player,state,options}=fixture(),snapshot=captureCheckpoint(state,player,options.owner);
  const target=fixture();target.player.x=2;target.player.ammo=30;target.state.missionHold=22;
  assert.equal(restoreCheckpoint(snapshot,target.state,target.player,options),true);
  assert.deepEqual(target.player,player);assert.equal(target.state.missionHold,13.25);assert.equal(target.state.missionSpawnStep,1);assert.equal(target.state.totalTime,41.5);assert.deepEqual(target.state.cars,state.cars);assert.deepEqual(target.state.pickups,state.pickups);assert.deepEqual(target.state.projectiles,state.projectiles);assert.deepEqual(target.state.brokenGlass,state.brokenGlass);assert.equal(target.state.commander,target.state.enemies[0]);
  target.state.enemies[0].hp=1;assert.equal(snapshot.world.enemies[0].hp,34);assert.equal(state.enemies[0].hp,34);
});
test('legacy, corrupt, wrong-owner or wrong-arena checkpoints fail without mutating the game',()=>{
  for(const mutate of [s=>s.version=1,s=>s.owner='other',s=>s.arena='other',s=>s.player.x=100,s=>s.player.ammo=-1,s=>s.player.carIndex=9,s=>s.world.missionStage=20,s=>s.world.enemies[0].type='unknown',s=>s.world.cars[0].destroyed=true,s=>s.player.health=NaN,s=>Object.defineProperty(s.player,'__proto__',{value:{polluted:true},enumerable:true})]){
    const {state,player,options}=fixture(),snapshot=captureCheckpoint(state,player,options.owner),before=JSON.stringify(player);mutate(snapshot);assert.equal(restoreCheckpoint(snapshot,state,player,options),false);assert.equal(JSON.stringify(player),before);
  }
});
test('local snapshot is captured before an in-flight cloud guard and never sent as cloud payload',async()=>{
  const game=await readFile('public/game.js','utf8'),body=game.slice(game.indexOf("async function saveCampaign(status='active'"),game.indexOf('async function loadCampaignRecords'));
  assert.ok(body.indexOf('writeLocalCampaign(status,payload)')<body.indexOf('if(campaignCloud.syncing)'));
  assert.match(body,/body:JSON.stringify\(payload\)/);assert.doesNotMatch(body,/JSON.stringify\(localRecord\)/);
  assert.match(game,/pagehide/);assert.match(game,/document.hidden&&state.mode==='playing'\)pauseGame/);
});
test('campaign loading waits for identity and QA glass fixture restores ammunition',async()=>{
  const game=await readFile('public/game.js','utf8');
  const start=game.indexOf('async function loadCampaignRecords()');
  const load=game.slice(start,game.indexOf('\n    function renderArsenal()',start));
  const identity=load.indexOf('await accountInitialization'),request=load.indexOf("fetch('/api/campaigns'");
  assert.ok(identity>=0&&request>identity);
  const fixture=game.slice(game.indexOf('prepareGlassTest:()=>'),game.indexOf('damageCommander:'));
  assert.match(fixture,/player.ammo=weaponConfig\(\).mag/);assert.match(fixture,/carIndex:-1/);
});
