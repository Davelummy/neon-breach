import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioSystem} from '../public/audio.js';

function radio(){
  const audio=Object.create(AudioSystem.prototype),notes=[],levels=[];
  audio.ctx={currentTime:10};audio.muted=()=>false;
  audio.musicGain={gain:{setTargetAtTime:(value)=>levels.push(value)}};
  audio.tone=(...args)=>notes.push({args,output:audio.output});audio.burst=audio.tone;
  return {audio,notes,levels};
}
test('radio off and muted generate no music',()=>{
  const {audio,notes}=radio();audio.radioBeat(0,'off');assert.equal(notes.length,0);
  audio.muted=()=>true;audio.radioBeat(0,'capital');assert.equal(notes.length,0);
});
test('original stations use separate music bus and restore effect routing',()=>{
  for(const station of ['tactical','capital','dusk']){
    const {audio,notes}=radio();audio.radioBeat(0,station,.5,1,.4);
    assert.ok(notes.length>0);assert.ok(notes.every(note=>note.output===audio.musicGain));assert.equal(audio.output,null);
  }
});
test('command voice ducks music without changing the chosen volume',()=>{
  const {audio,levels}=radio();audio._voiceBusyUntil=12;audio.radioBeat(0,'tactical',0,1,.8);
  assert.equal(levels.at(-1),.2);audio.ctx.currentTime=13;audio.radioBeat(1,'tactical',0,1,.8);
  assert.equal(levels.at(-1),.8);
});
test('radio clock advances independently of simulation frames and stops cleanly',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {audio}=radio();let playing=true;audio.ctx.state='running';audio.resume=()=>{};
  const beats=[];audio.radioBeat=step=>beats.push(step);
  audio.startRadio(()=>({playing,station:'capital',volume:.5,intensity:0,wave:1}));
  assert.deepEqual(beats,[0]);t.mock.timers.tick(150);assert.deepEqual(beats,[0,1]);
  playing=false;t.mock.timers.tick(150);assert.equal(audio.radioTimer,null);
  audio.stopRadio();assert.deepEqual(beats,[0,1]);
});
