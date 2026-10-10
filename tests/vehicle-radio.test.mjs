import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {VehicleRadio,LIVE_STATIONS,approvedStations,directoryStations,discoverStations,cachedStations} from '../public/vehicle-radio.js';

const station={id:'approved',name:'Approved test fixture',url:'https://example.test/radio.mp3',permission:'Test fixture only; never ships as a station'};
class Media extends EventTarget {
  src='';paused=true;volume=0;muted=false;
  async play(){this.paused=false;}
  pause(){this.paused=true;}
  load(){}
  removeAttribute(name){if(name==='src')this.src='';}
  emit(type){this.dispatchEvent(new Event(type));}
}
const options={inVehicle:true,playing:true,station:station.id,volume:.4};
function fixture(stations=[station]){const media=[];const radio=new VehicleRadio({stations,createMedia:()=>{const item=new Media();media.push(item);return item;}});return {radio,media};}

test('no unreviewed real streams ship; approved sources require HTTPS and no URL credentials',()=>{
  assert.deepEqual(LIVE_STATIONS,[]);
  assert.deepEqual(approvedStations([station,{...station,id:'http',url:'http://example.test/radio'},{...station,id:'auth',url:'https://user:password@example.test/radio'},{...station,id:'unreviewed',permission:''},station]),[station]);
});
test('radio creates no media or stream requests on foot, in menus, or when off',async()=>{
  const {radio,media}=fixture();
  for(const config of [{...options,inVehicle:false},{...options,playing:false},{...options,station:'off'}])await radio.start(config);
  assert.equal(media.length,0);assert.equal(radio.status().state,'off');
});
test('only real media playing confirms playback and exit stops the stream',async()=>{
  const {radio,media}=fixture();await radio.start(options);
  assert.equal(media[0].src,station.url);assert.equal(radio.status().state,'connecting');
  media[0].emit('playing');assert.equal(radio.status().state,'playing');
  radio.setVolume(.2,true);assert.equal(media[0].volume,.2);assert.equal(media[0].muted,true);
  await radio.start({...options,inVehicle:false});assert.equal(media[0].paused,true);assert.equal(media[0].src,'');assert.equal(radio.status().state,'stopped');
  media[0].emit('playing');assert.equal(radio.status().state,'stopped');
});
test('missing station permissions remain unconfigured with no synthesized fallback',async()=>{
  const {radio,media}=fixture([]);await radio.start(options);assert.equal(radio.status().state,'unconfigured');assert.equal(media.length,0);
});
test('autoplay rejection is recoverable and has no automatic retry',async()=>{
  const media=new Media();media.play=async()=>{throw Object.assign(new Error('gesture needed'),{name:'NotAllowedError'});};
  const radio=new VehicleRadio({stations:[station],createMedia:()=>media});await radio.start(options);
  assert.equal(radio.status().state,'blocked');assert.equal(media.src,'');assert.equal(media.paused,true);
});
test('buffering deadline is bounded despite repeated stalled events',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const {radio,media}=fixture();await radio.start(options);
  media[0].emit('stalled');t.mock.timers.tick(6000);media[0].emit('stalled');t.mock.timers.tick(6000);
  assert.equal(radio.status().state,'unavailable');assert.equal(media[0].src,'');t.mock.timers.tick(60000);assert.equal(media.length,1);
});
test('late play completion cannot restart a stream after exiting a vehicle',async()=>{
  let resolve;const media=new Media();media.play=()=>new Promise(done=>{resolve=done;});
  const radio=new VehicleRadio({stations:[station],createMedia:()=>media});const pending=radio.start(options);radio.stop();resolve();await pending;
  assert.equal(radio.status().state,'stopped');assert.equal(media.paused,true);assert.equal(media.src,'');
});
test('game and offline build use vehicle live radio instead of synthesized stations',async()=>{
  const game=await readFile('public/game.js','utf8'),build=await readFile('scripts/build.mjs','utf8'),sw=await readFile('public/sw.js','utf8');
  assert.doesNotMatch(game,/audio\?\.startRadio\(/);assert.match(game,/inVehicle:player\.carIndex>=0/);
  for(const source of [game,build,sw])assert.ok(source.includes('vehicle-radio.js'));
  const html=await readFile('public/neon-breach.html','utf8');assert.equal((html.match(/id="webglErrorScreen"/g)||[]).length,1);
  assert.match(html,/id="touchExtras" hidden/);assert.match(html,/aria-controls="touchExtras"/);
});

const row={stationuuid:'fixture',name:'Abuja Test',countrycode:'NG',state:'Abuja',lastcheckok:1,hls:0,codec:'MP3',url_resolved:station.url,homepage:'https://example.test/'};
test('directory rejects unsafe URLs, unsupported formats, broken entries and duplicates',()=>{
  const rows=[row,row,{...row,url_resolved:'http://example.test/'},{...row,url_resolved:'https://127.0.0.1/'},{...row,url_resolved:'https://user:pass@example.test/'},{...row,hls:1},{...row,lastcheckok:0},{...row,countrycode:'US'},{...row,homepage:''}];
  const result=directoryStations(rows);assert.equal(result.length,1);assert.equal(result[0].source,'Radio Browser');assert.equal(approvedStations(result).length,1);
});
test('directory uses a 24-hour cache and tolerates storage being blocked',async()=>{
  let saved,calls=0;const storage={getItem:()=>saved,setItem:(key,value)=>{saved=value;}};
  const fetcher=async()=>{calls++;return {ok:true,headers:new Headers({'content-type':'application/json'}),json:async()=>[row]};};
  const first=await discoverStations({fetcher,storage,now:1000});assert.equal(first.length,1);
  assert.deepEqual(cachedStations(storage,2000),first);assert.deepEqual(cachedStations(storage,86402000),[]);
  assert.deepEqual(await discoverStations({fetcher,storage,now:2000}),first);assert.equal(calls,1);
  await discoverStations({fetcher,storage,now:86402000});assert.equal(calls,2);
  const broken={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  assert.equal((await discoverStations({fetcher,storage:broken})).length,1);
});
test('directory failures are bounded and HTML responses are never accepted',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return {ok:true,headers:new Headers({'content-type':'text/html'}),json:async()=>{throw Error('must not parse');}};};
  assert.deepEqual(await discoverStations({fetcher}),[]);assert.equal(calls,3);
});
