import test from 'node:test';
import assert from 'node:assert/strict';
import {requestLandscape,interfacePreferences,initializeInterface} from '../public/mobile-controls.js';
test('interface defaults are tactical and visibility preferences are bounded',()=>{
  assert.deepEqual(interfacePreferences(),{hud:'tactical',touchOpacity:85});
  assert.deepEqual(interfacePreferences({hud:'unknown',touchOpacity:10}),{hud:'tactical',touchOpacity:60});
  assert.deepEqual(interfacePreferences({hud:'full',touchOpacity:200}),{hud:'full',touchOpacity:100});
  assert.equal(interfacePreferences({touchOpacity:'invalid'}).touchOpacity,85);
});
test('interface controls persist choices and tolerate unavailable or corrupt storage',()=>{
  const elements=new Map(['settingHud','settingTouchOpacity','touchOpacityValue'].map(id=>[id,{listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}}]));
  const values={},document={body:{dataset:{}},documentElement:{style:{setProperty(k,v){values[k]=v;}}},getElementById:id=>elements.get(id)};
  const saved=[],storage={getItem:()=>'{bad',setItem:(...args)=>saved.push(args)};
  initializeInterface(document,storage);
  assert.equal(document.body.dataset.hud,'tactical');
  const hud=elements.get('settingHud');hud.value='full';hud.listeners.change();
  assert.equal(document.body.dataset.hud,'full');
  const opacity=elements.get('settingTouchOpacity');opacity.value='60';opacity.listeners.input();
  assert.equal(values['--touch-opacity'],'0.6');assert.equal(JSON.parse(saved.at(-1)[1]).hud,'full');
  assert.doesNotThrow(()=>initializeInterface(document,{getItem(){throw Error('blocked');},setItem(){throw Error('quota');}}));
  hud.value='tactical';assert.doesNotThrow(()=>hud.listeners.change());
});
test('unsupported mobile APIs leave portrait play available',async()=>{
  const result=await requestLandscape({documentElement:{}},{});
  assert.equal(result.fullscreen,false);assert.equal(result.locked,false);
  assert.match(result.message,/Portrait play remains available/);
});
test('fullscreen and landscape require successful browser responses',async()=>{
  const calls=[],document={fullscreenEnabled:true,documentElement:{}};
  document.documentElement.requestFullscreen=async()=>{calls.push('fullscreen');document.fullscreenElement={};};
  const result=await requestLandscape(document,{lock:async direction=>calls.push(direction)});
  assert.deepEqual(calls,['fullscreen','landscape']);assert.equal(result.locked,true);
});
test('denied fullscreen never attempts an orientation lock',async()=>{
  const result=await requestLandscape({fullscreenEnabled:true,documentElement:{requestFullscreen:async()=>{throw Error('denied');}}},{lock:()=>assert.fail('must not lock')});
  assert.equal(result.locked,false);assert.match(result.message,/rotation lock/);
});
test('denied orientation lock retains fullscreen with manual rotation guidance',async()=>{
  const result=await requestLandscape({fullscreenElement:{},documentElement:{}},{lock:async()=>{throw Error('unsupported');}});
  assert.equal(result.fullscreen,true);assert.equal(result.locked,false);assert.match(result.message,/sideways/);
});
