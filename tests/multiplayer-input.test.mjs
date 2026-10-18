import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {validateInput} from '../server/multiplayer-match.mjs';

test('actual browser input packets retain strict action types and bounded analog driving',()=>{
  const source=readFileSync(new URL('../public/multiplayer.js',import.meta.url),'utf8');
  let pad=null,driving=false,usable=false,now=1000;
  const board={open:false},touch={forward:0,strafe:0,fire:false,reload:false,jump:false,aim:false,sprint:false,interact:false};
  const sample=runInNewContext(`let squareDown=0,squareFired=false,seq=0,angle=0,pitch=0,optionsHeld=false;${source.slice(source.indexOf('const input=()=>'),source.indexOf('function resetInput'))}input`,{
    activePad:()=>pad,performance:{now:()=>now},keys:new Set(),touch,
    $:id=>id==='board'?board:{hidden:!usable},document:{body:{classList:{contains:()=>driving}}}
  });
  const check=()=>{const packet=sample();assert.ok(validateInput(packet),JSON.stringify(packet));for(const key of ['fire','reload','jump','aim','sprint','interact'])assert.equal(typeof packet[key],'boolean');return packet;};
  check();pad={axes:[0,-1,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};check();
  usable=true;pad.buttons[2]={pressed:true,value:1};assert.equal(check().interact,false);now+=350;assert.equal(check().interact,true);assert.equal(check().interact,false);
  pad.buttons[2]={pressed:false,value:0};check();pad.buttons[2]={pressed:true,value:1};check();now+=100;pad.buttons[2]={pressed:false,value:0};assert.equal(check().reload,true);
  driving=true;pad.buttons[7]={pressed:true,value:.75};const gas=check();assert.equal(gas.forward,1);assert.equal(gas.fire,false);
  pad.buttons[1]={pressed:true,value:1};assert.equal(check().interact,true);board.open=true;const paused=check();assert.equal(paused.forward,0);assert.equal(paused.interact,false);
});
