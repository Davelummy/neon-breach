import test from 'node:test';
import assert from 'node:assert/strict';
import {movementKey,normalizeRoomCode,combatActionHint,selectConnectedGamepad,drawCombatRadar} from '../public/combat-interface.js';

test('arrow movement maps to the same familiar WASD actions',()=>{
  for(const [code,key] of Object.entries({ArrowUp:'KeyW',ArrowDown:'KeyS',ArrowLeft:'KeyA',ArrowRight:'KeyD'}))assert.equal(movementKey(code),key);
  assert.equal(movementKey('Space'),'Space');assert.equal(movementKey('ShiftLeft'),'ShiftLeft');
});
test('room codes accept ordinary case/whitespace without silently changing an invalid code',()=>{
  assert.equal(normalizeRoomCode(' abcdef1234 '),'ABCDEF1234');
  for(const code of ['', 'ABC', 'GGGGGGGGGG','ABCDEF12345','ABCDE-1234'])assert.equal(normalizeRoomCode(code),null);
});
test('contextual combat cues match the actual input method and relevant state',()=>{
  const player={hp:100,ammo:30,jetFuel:100,reload:0};
  assert.equal(combatActionHint(player),'');
  assert.equal(combatActionHint({...player,ammo:0}),'Low ammo · R to reload');
  assert.equal(combatActionHint({...player,ammo:3},{touch:true}),'Low ammo · tap Reload');
  assert.equal(combatActionHint({...player,ammo:5},{controller:true}),'Low ammo · Square to reload');
  assert.match(combatActionHint({...player,reload:1,ammo:0}),/^Reloading/);
  assert.match(combatActionHint({...player,jetFuel:2}),/land to recharge/);
  assert.equal(combatActionHint({...player,hp:0,ammo:0}),'');
  assert.deepEqual(player,{hp:100,ammo:30,jetFuel:100,reload:0});
});

test('active controller is not masked by an idle or disconnected first slot',()=>{
  const idle={index:0,connected:true,mapping:'standard',buttons:[{pressed:false,value:0}],axes:[0,0]},active={index:1,connected:true,mapping:'standard',buttons:[{pressed:true,value:1}],axes:[0,0]};
  assert.equal(selectConnectedGamepad([idle,active],0),active);
  active.buttons[0]={pressed:false,value:0};assert.equal(selectConnectedGamepad([idle,active],1),active);
  idle.connected=false;assert.equal(selectConnectedGamepad([idle,active]),active);
  active.connected=false;assert.equal(selectConnectedGamepad([idle,active]),null);
});

test('arena map marks living opponents, not self, corpses or incoming spawns',()=>{
  const dots=[],ctx={canvas:{width:128,height:128},clearRect(){},fillRect(){},beginPath(){},arc(x,y,r){dots.push({x,y,r});},fill(){},save(){},translate(){},rotate(){},moveTo(){},lineTo(){},closePath(){},restore(){}};
  const map=Array.from({length:48},()=>Array(48).fill(0)),player={id:'self',x:2,y:2,angle:0},opponents=[player,{id:'other',x:46,y:46,hp:100},{x:20,y:20,hp:30},{x:5,y:5,hp:0},{x:10,y:10,hp:100,dead:true},{x:12,y:12,hp:100,spawn:1}];
  assert.equal(drawCombatRadar(ctx,map,player,opponents),2);assert.equal(dots.length,2);assert.ok(dots.every(p=>p.x>0&&p.x<128&&p.y>0&&p.y<128));assert.equal(ctx.fillStyle,'#31f5db');
});
