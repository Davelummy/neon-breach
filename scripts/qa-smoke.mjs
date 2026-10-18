// Headless gameplay smoke test driven through the window.__NEON_QA__ bridge.
// Boots the static server, launches chrome-headless-shell, starts a run and
// asserts the simulation actually plays: mode transitions, enemies spawn,
// mission stages advance, and the campaign save payload stays plausible.
// Usage: node scripts/qa-smoke.mjs
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import {qaBrowserPath} from './qa-browser.mjs';

const PORT = 4321;
const executablePath = qaBrowserPath();
if (!executablePath || !existsSync(executablePath)) { console.error('FAIL: Chrome executable not found; set CHROME_PATH'); process.exit(1); }

const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};
async function waitForState(page, predicate, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`state wait exceeded ${timeout}ms`);
}

let browser;
try {
  await new Promise(resolve => setTimeout(resolve, 700));
  browser = await puppeteer.launch({ executablePath, timeout: 60000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  // The public radio directory stays offline until the radio fixture below: first-drive
  // auto-tune must fail honestly here and never depend on the internet.
  let radioFixture=null;await page.setRequestInterception(true);
  page.on('request',request=>{const url=new URL(request.url());if(radioFixture)return radioFixture(request,url);if(url.hostname.endsWith('.api.radio-browser.info'))return request.respond({status:503,contentType:'text/plain',body:'offline'});return request.continue();});
  await page.bringToFront();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

  await page.goto(`http://127.0.0.1:${PORT}/?qa&quality=low`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForState(page, () => Boolean(window.__NEON_QA__ && window.__NEON_3D__), 10000);
  check('QA bridge available', true);
  await waitForState(page,()=>!document.getElementById('accountGate').classList.contains('hidden'));
  check('signup gate is visible before gameplay',true);
  if(process.env.SMOKE_SHOT)await page.screenshot({path:process.env.SMOKE_SHOT.replace(/\.png$/,'-signup.png')});
  await page.type('#accountUsername',`qa_${Date.now()}`);
  await page.type('#accountPassword','QA-test8');
  await page.click('#accountSubmit');
  try{await waitForState(page,()=>document.getElementById('accountGate').classList.contains('hidden'),30000);}catch{throw new Error(`Signup did not finish: ${await page.$eval('#accountStatus',e=>e.textContent)}`);}
  check('username-only signup starts a persistent session',await page.evaluate(()=>document.getElementById('accountName').textContent.includes('USERNAME RESERVED')));
  await waitForState(page,()=>Boolean(window.__NEON_CITY__),15000);
  check('Abuja landmark arenas initialize',await page.evaluate(()=>window.__NEON_CITY__?.stage==='landmark arena blockouts'));
  await page.select('#radioStation','off');
  check('live-radio preference is separate from old synthesized stations',await page.evaluate(()=>localStorage.getItem('neon-breach-live-radio')==='off'));
  check('home secondary choices begin collapsed',await page.$eval('#screenMain details',e=>!e.open));
  await page.locator('#screenMain details > summary').click();
  await page.waitForFunction(()=>document.querySelector('#screenMain details').open);
  await page.$eval('#screenMain [data-goto="screenSettings"]',el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  await page.locator('#screenMain [data-goto="screenSettings"]').click();
  await page.waitForSelector('#screenSettings.active');
  await page.locator('#audioSettings > summary').click();
  check('grouped audio settings are discoverable through ordinary clicks',await page.$eval('#settingVolume',e=>e.getBoundingClientRect().width>0));
  await page.click('#interfaceSettings > summary');
  await page.select('#settingHud','full');
  check('full HUD can be selected without changing gameplay',await page.evaluate(()=>document.body.dataset.hud==='full'));
  await page.select('#settingHud','tactical');
  check('tactical HUD preference is saved',await page.evaluate(()=>document.body.dataset.hud==='tactical'&&JSON.parse(localStorage.getItem('neon-breach-interface')).hud==='tactical'));
  await page.click('#screenSettings [data-goto="screenMain"]');
  check('returning home restores the quiet primary menu',await page.$eval('#screenMain details',e=>!e.open));
  await page.click('#screenMain [data-goto="screenLoadout"]');
  await page.waitForSelector('#screenLoadout.active');
  check('standalone visual loadout shows six weapons without a paid store',await page.evaluate(()=>document.querySelectorAll('#homeLoadoutCards .weapon-card').length===6&&!document.querySelector('[data-goto="screenVatarShop"]')));
  await page.click('#homeLoadoutCards .weapon-picture');
  await page.waitForSelector('#weaponPreviewDialog[open]');
  await page.waitForSelector('#weaponPreviewCanvas');
  check('3D weapon inspection leaves loadout unchanged',await page.evaluate(()=>document.getElementById('loadoutWeapon').value==='0'));
  if(process.env.SMOKE_SHOT)await page.screenshot({path:process.env.SMOKE_SHOT.replace(/\.png$/,'-weapon-preview.png')});
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.getElementById('weaponPreviewDialog').open);
  await page.click('#homeLoadoutCards [data-weapon-action="1"]');
  check('visual loadout selection persists without payment',await page.evaluate(()=>localStorage.getItem('neon-breach-loadout')==='1'&&document.querySelector('#homeLoadoutCards [data-weapon-index="1"]').classList.contains('is-selected')));
  await page.click('#homeLoadoutCards [data-weapon-action="0"]');
  await page.click('#screenLoadout [data-goto="screenMain"]');

  // Optional fast pass for portrait/landscape interactions; default remains the full suite.
  if(process.env.QA_MOBILE_ONLY!=='1'){
  const menuSnapshot = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('boots into menu', menuSnapshot.mode === 'menu', `mode=${menuSnapshot.mode}`);
  const conceptualModel = await page.evaluate(() => ({
    leaderboard: document.querySelector('#screenMain [data-goto="screenRanks"]').textContent === 'Leaderboard',
    briefing: document.querySelector('#screenOps [data-goto="screenDeploy"]').textContent === 'Mission briefing',
    invite: document.getElementById('shareInviteButton').textContent === 'Invite friends',
    controlException: document.getElementById('screenHow').textContent.includes('Shift') && document.getElementById('screenHow').textContent.includes('not sprint'),
    codeScope: document.getElementById('screenSettings').textContent.includes('not multiplayer or save sync') && document.getElementById('screenSettings').textContent.includes('Keep this code private.'),
  }));
  check('familiar navigation labels and explicit control/code scope', Object.values(conceptualModel).every(Boolean));

  try { await waitForState(page, () => /registered players/.test(document.getElementById('communityStatus')?.textContent), 15000); }
  catch (error) { throw new Error(`${error.message}: ${await page.evaluate(() => `${document.visibilityState} / ${document.getElementById('communityStatus')?.textContent}`)} / ${pageErrors.join(' | ')}`); }
  check('menu shows registered-account and online counts', true);
  if (process.env.SMOKE_SHOT) await page.screenshot({ path: process.env.SMOKE_SHOT.replace(/\.png$/, '-menu.png') });
  const runId = '00000000-0000-4000-8000-000000000099';
  const communityChecks = await page.evaluate(async id => {
    const post = await fetch('/api/results', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ run_id: id, callsign: 'QA PILOT', score: 1000, kills: 3, elapsed_seconds: 60, difficulty: 'nightmare', party: 'PRIVATE' }) });
    const read = await fetch(`/api/results?id=${id}`);
    const data = await read.json();
    const missing = await fetch('/api/not-a-real-route');
    const board = await fetch('/api/leaderboard?period=daily&difficulty=nightmare');
    return { saved: [201,409].includes(post.status), public: read.ok && data.result?.score === 1000 && !('party' in data.result), unknownJson: missing.status === 404 && missing.headers.get('content-type').includes('application/json'), boardJson: board.ok && board.headers.get('content-type').includes('application/json') };
  }, runId);
  check('public results persist without private party data', communityChecks.saved && communityChecks.public);
  check('unknown APIs return JSON 404', communityChecks.unknownJson);
  check('period and difficulty board API returns JSON', communityChecks.boardJson);
  await page.evaluate(() => document.querySelector('[data-goto="screenRanks"]').click());
  await page.select('#rankPeriod', 'daily');
  await page.select('#rankDifficulty', 'nightmare');
  await waitForState(page, () => document.getElementById('leaderboardStatus').textContent !== 'LOADING…');
  check('leaderboard filters remain functional', await page.$eval('#rankPeriod', element => element.value === 'daily'));
  if (process.env.SMOKE_SHOT) await page.screenshot({ path: process.env.SMOKE_SHOT.replace(/\.png$/, '-ranks.png') });
  await page.evaluate(() => document.querySelector('#screenRanks [data-goto="screenMain"]').click());

  // Reuse one tab so background 3D contexts cannot compete with gameplay QA.
  const resultPage = page;
  await resultPage.goto(`http://127.0.0.1:${PORT}/results.html?id=${runId}`, { waitUntil: 'domcontentloaded' });
  await waitForState(resultPage, () => !document.getElementById('result').hidden);
  check('shareable result page loads saved score', await resultPage.$eval('#score', element => element.textContent === '1,000'));
  if (process.env.SMOKE_SHOT) await resultPage.screenshot({ path: process.env.SMOKE_SHOT.replace(/\.png$/, '-result.png') });
  const png = await resultPage.evaluate(() => new Promise(resolve => {
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = async function () {
      HTMLAnchorElement.prototype.click = original;
      const bytes = new Uint8Array(await (await fetch(this.href)).arrayBuffer());
      resolve({ name: this.download, bytes: bytes.length, signature: [...bytes.slice(0, 8)] });
    };
    document.getElementById('download').click();
  }));
  check('downloadable scoreboard is a real PNG', png.bytes > 1000 && png.signature.join(',') === '137,80,78,71,13,10,26,10', `${png.bytes} bytes`);
  await page.goto(`http://127.0.0.1:${PORT}/?qa&quality=low`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForState(page, () => Boolean(window.__NEON_QA__ && window.__NEON_3D__), 10000);

  await page.select('#loadoutWeapon','5');
  await page.evaluate(()=>document.querySelector('[data-goto="screenOps"]').click());
  await page.evaluate(()=>document.querySelector('#screenOps [data-goto="screenDeploy"]').click());
  if(process.env.SMOKE_SHOT){await new Promise(resolve=>setTimeout(resolve,450));await page.screenshot({path:process.env.SMOKE_SHOT.replace(/\.png$/,'-loadout.png')});}
  await page.evaluate(() => document.getElementById('deployButton').click());
  await waitForState(page, () => window.__NEON_QA__.snapshot().mode === 'playing', 5000);
  check('deploy starts a run', true);
  const tactical=await page.evaluate(()=>window.__NEON_QA__.tacticalProbe());
  check('AI observes then searches the last-known position instead of tracking through cover',tactical.observed&&tactical.searchesLastKnown,JSON.stringify(tactical));
  check('reinforcement routing avoids nearby and visible forward spawn positions',tactical.safeEntries&&tactical.count>0);
  await page.evaluate(()=>document.exitPointerLock?.());
  await page.waitForFunction(()=>!document.pointerLockElement);
  await page.evaluate(()=>{window.__originalPointerLock=HTMLCanvasElement.prototype.requestPointerLock;HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.reject(new DOMException('Denied for regression test','SecurityError'));});
  const beforeDrag=await page.evaluate(()=>window.__NEON_3D__.frame().player.dir);
  await page.mouse.move(600,350);await page.mouse.down();await page.mouse.move(760,350,{steps:6});await page.mouse.up();
  const afterDrag=await page.evaluate(()=>window.__NEON_3D__.frame().player.dir);
  check('trackpad primary drag turns when pointer lock is denied',Math.abs(afterDrag-beforeDrag)>.1);
  await page.mouse.move(820,350,{steps:3});
  check('releasing trackpad drag stops unlocked look',await page.evaluate(dir=>Math.abs(window.__NEON_3D__.frame().player.dir-dir)<.001,afterDrag));
  await page.evaluate(()=>{HTMLCanvasElement.prototype.requestPointerLock=window.__originalPointerLock;delete window.__originalPointerLock;});
  check('on-foot radio is hidden and stopped without synthesized playback',await page.evaluate(()=>document.getElementById('gameRadio').hidden&&window.__NEON_QA__.radioStatus().state==='stopped'&&window.__NEON_QA__.radioStatus().synthSteps===0));
  await page.keyboard.press('n');
  check('radio shortcut does not start playback on foot',await page.evaluate(()=>window.__NEON_QA__.radioStatus().state==='stopped'));
  check('selected LMG loadout deploys', await page.evaluate(()=>window.__NEON_QA__.snapshot().weapon==='lmg'));
  const supplies=await page.evaluate(()=>({health:window.__NEON_QA__.supplyTest('health'),ammo:window.__NEON_QA__.supplyTest('ammo'),gun:window.__NEON_QA__.supplyTest('weapon')}));
  check('health and ammo collect in gameplay',supplies.health.health===78&&supplies.ammo.reserve>0);
  check('gun pickup equips LMG',supplies.gun.weapon==='lmg');
  // Finite auto-reload: rounds move from reserve to magazine, held fire continues, and each gun keeps its own reload time.
  const reloads=await page.evaluate(async()=>{
    const q=window.__NEON_QA__,wait=ms=>new Promise(r=>setTimeout(r,ms)),out={};
    q.setAmmo(0,5);await wait(80);out.autoStarts=q.ammoState().reloading;await wait(q.ammoState().reloadTime*1000+300);let a=q.ammoState();out.partial=a.ammo===5&&a.reserve===0&&!a.reloading;
    q.setAmmo(0,0);await wait(150);a=q.ammoState();out.emptyStays=!a.reloading&&a.ammo===0;
    q.supplyTest('ammo');await wait(150);out.pickupReloads=q.ammoState().reloading&&q.ammoState().reserve>0;await wait(q.ammoState().reloadTime*1000+300);out.pickupFills=q.ammoState().ammo>0;
    const times=new Map();for(let i=0;i<8;i++){q.equipWeapon(i);a=q.ammoState();if(a.reloadTime===a.weaponReload)times.set(a.weapon,a.reloadTime);}
    out.distinct=new Set(times.values()).size===times.size&&times.size>=2;out.times=Object.fromEntries(times);
    return out;
  });
  check('empty magazine reloads automatically from a partial reserve',reloads.autoStarts&&reloads.partial,JSON.stringify(reloads));
  check('no reload or phantom rounds once reserves are spent',reloads.emptyStays);
  check('ammo pickup with an empty magazine auto-reloads',reloads.pickupReloads&&reloads.pickupFills);
  check('each unlocked gun keeps its own reload duration',reloads.distinct,JSON.stringify(reloads.times));
  await page.evaluate(()=>{window.__NEON_QA__.equipWeapon(0);window.__NEON_QA__.setAmmo(3,60);});
  const heldStart=await page.evaluate(()=>window.__NEON_QA__.ammoState());
  await page.keyboard.down('ShiftLeft');await new Promise(r=>setTimeout(r,heldStart.reloadTime*1000+1200));
  const held=await page.evaluate(()=>window.__NEON_QA__.ammoState());await page.keyboard.up('ShiftLeft');
  check('held fire continues through an automatic reload',held.shots>heldStart.shots+3&&held.reserve<60,JSON.stringify({heldStart,held}));
  check('mission instruction stays visible',await page.$eval('#missionInstruction',e=>{
    const rect=e.getBoundingClientRect(),style=getComputedStyle(e);
    return /^1\/5 · Reach .+ · follow the marker · .+ · \d+m$/.test(e.textContent)
      && rect.width>0 && rect.height>0 && style.visibility!=='hidden' && style.display!=='none';
  }));
  await page.evaluate(()=>window.__NEON_QA__.equipWeapon(0));
  await page.evaluate(()=>window.__NEON_QA__.setInvulnerable(true));
  const fenceTop=await page.evaluate(()=>window.__NEON_QA__.setLandingTest(17.5,9.5));
  await waitForState(page,()=>window.__NEON_QA__.snapshot().grounded,8000);
  check('player lands and remains standing on a fence',await page.evaluate(expected=>Math.abs(window.__NEON_QA__.snapshot().z-expected)<.01,fenceTop));
  const barrierTop=await page.evaluate(()=>window.__NEON_QA__.setLandingTest(10.2,8.8));
  await waitForState(page,()=>window.__NEON_QA__.snapshot().grounded,8000);
  check('decorative barrier has a real standing surface',await page.evaluate(expected=>Math.abs(window.__NEON_QA__.snapshot().z-expected)<.01,barrierTop));
  check('taxi can be approached',await page.evaluate(()=>window.__NEON_QA__.besideVehicle(0)));
  await page.keyboard.press('e');
  check('keyboard E enters taxi',await page.evaluate(()=>window.__NEON_QA__.snapshot().carIndex===0));
  await page.keyboard.press('e');
  check('keyboard E exits taxi',await page.evaluate(()=>window.__NEON_QA__.snapshot().carIndex===-1));
  check('controller taxi can be approached',await page.evaluate(()=>window.__NEON_QA__.besideVehicle(0)));
  await page.evaluate(()=>{const make=index=>({index,connected:true,mapping:'standard',id:index?'DualSense Wireless Controller':'Idle controller',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))});window.__qaPads=[make(0),make(1)];Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>window.__qaPads});});
  // COD layout: tap Square beside a vehicle does not enter; holding it does (once); Circle gets out.
  await page.evaluate(()=>window.__qaPads[1].buttons[2]={pressed:true,value:1});await new Promise(resolve=>setTimeout(resolve,120));await page.evaluate(()=>window.__qaPads[1].buttons[2]={pressed:false,value:0});await new Promise(resolve=>setTimeout(resolve,250));
  check('tapping Square beside a vehicle does not enter it',await page.evaluate(()=>window.__NEON_QA__.snapshot().carIndex===-1));
  await page.evaluate(()=>window.__qaPads[1].buttons[2]={pressed:true,value:1});await waitForState(page,()=>window.__NEON_QA__.snapshot().carIndex===0);
  await new Promise(resolve=>setTimeout(resolve,400));check('holding Square enters once with an idle first controller',await page.evaluate(()=>window.__NEON_QA__.snapshot().carIndex===0));
  check('driving shows the exit icon with the Circle hint',await page.evaluate(()=>{const b=document.getElementById('vehicleButton');return b.dataset.kind==='exit'&&!!b.querySelector('svg')&&b.querySelector('.vehicle-key')?.textContent==='○';}));
  await page.evaluate(()=>window.__qaPads[1].buttons[2]={pressed:false,value:0});await new Promise(resolve=>setTimeout(resolve,150));
  await page.evaluate(()=>{const pad=window.__qaPads[1];pad.buttons[7]={pressed:true,value:1};});await new Promise(resolve=>setTimeout(resolve,500));
  check('R2 accelerates the vehicle',await page.evaluate(()=>Math.abs(window.__NEON_3D__.frame().cars[0].speed)>.5));
  await page.evaluate(()=>{window.__qaPads[1].buttons[7]={pressed:false,value:0};window.__qaPads[1].buttons[1]={pressed:true,value:1};});await waitForState(page,()=>window.__NEON_QA__.snapshot().carIndex===-1);check('Circle exits the vehicle',true);
  await page.evaluate(()=>{window.__qaPads[1].buttons[1]={pressed:false,value:0};window.__qaPads[1].buttons[9]={pressed:true,value:1};});await waitForState(page,()=>window.__NEON_QA__.snapshot().mode==='paused');check('campaign Options pauses the mission',true);await page.evaluate(()=>window.__qaPads[1].buttons[9]={pressed:false,value:0});await new Promise(resolve=>setTimeout(resolve,200));await page.evaluate(()=>window.__qaPads[1].buttons[9]={pressed:true,value:1});await waitForState(page,()=>window.__NEON_QA__.snapshot().mode==='playing');check('campaign Options resumes the mission',true);await page.evaluate(()=>{delete navigator.getGamepads;delete window.__qaPads;});
  await waitForState(page,()=>Number(document.getElementById('radar').dataset.enemies)>0);check('tactical campaign map is visible and marks living enemies',await page.$eval('#radarWrap',el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).display!=='none';}));
  check('tricycle can be approached',await page.evaluate(()=>window.__NEON_QA__.besideVehicle(3)));
  await page.evaluate(()=>document.exitPointerLock());
  await waitForState(page,()=>!document.pointerLockElement);
  await waitForState(page,()=>!document.getElementById('vehicleButton').hidden);
  await page.click('#vehicleButton');
  check('visible interaction button enters yellow tricycle',await page.evaluate(()=>window.__NEON_QA__.snapshot().carIndex===3));
  check('keke shows honest unconfigured live-radio state, not game music',await page.evaluate(()=>{const r=window.__NEON_QA__.radioStatus();return !document.getElementById('gameRadio').hidden&&r.vehicle==='tricycle'&&r.state==='unconfigured'&&r.synthSteps===0;}));
  await page.click('#vehicleButton');
  check('visible interaction button exits yellow tricycle',await page.evaluate(()=>window.__NEON_QA__.snapshot().carIndex===-1));
  for(let index=0;index<8;index++){
    check(`fleet vehicle ${index} can be approached`,await page.evaluate(i=>window.__NEON_QA__.besideVehicle(i),index));
    await page.keyboard.press('e');
    check(`fleet vehicle ${index} boards without mission lock`,await page.evaluate(i=>window.__NEON_QA__.snapshot().carIndex===i,index));
    if(index===7){
      await waitForState(page,()=>{const e=document.getElementById('gameRadio');return !e.hidden&&e.textContent.includes('Tune Nigerian radio');});check('bus shows vehicle-only live-radio controls after an offline auto-tune',true);
      const camera=await page.evaluate(()=>window.__NEON_QA__.vehicleCamera());
      check('bus chase camera clears the body and roof',camera.clearance>.4&&camera.eyeHeight>camera.roofHeight,JSON.stringify(camera));
      if(process.env.SMOKE_SHOT){await new Promise(resolve=>setTimeout(resolve,300));await page.screenshot({path:process.env.SMOKE_SHOT.replace(/\.png$/,'-bus-radio.png')});}
    }
    await page.keyboard.press('e');
    check(`fleet vehicle ${index} exits`,await page.evaluate(()=>window.__NEON_QA__.snapshot().carIndex===-1));
  }
  // Deterministic radio transport fixture: real HTMLAudioElement playback, no
  // live broadcast dependency, no public directory requests or paid services.
  const wav=Buffer.alloc(44+8000*2*30);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
  radioFixture=async (request,url)=>{if(url.hostname.endsWith('.api.radio-browser.info'))await request.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(['one','two'].map(id=>({stationuuid:id,name:`QA Abuja ${id}`,countrycode:'NG',state:'Abuja',lastcheckok:1,hls:0,codec:'MP3',url_resolved:`https://radio-fixture.example.test/${id}.wav`,homepage:'https://example.test/'})))});else if(url.hostname==='radio-fixture.example.test')await request.respond({status:200,contentType:'audio/wav',headers:{'access-control-allow-origin':'*'},body:wav});else await request.continue();};
  // The Settings Off choice above is honoured; a player who has not chosen Off gets radio on the first drive.
  await page.evaluate(()=>{localStorage.removeItem('neon-breach-live-radio');window.__NEON_QA__.besideVehicle(0);});await page.keyboard.press('e');
  await waitForState(page,()=>window.__NEON_QA__.radioStatus().state==='playing');check('first drive auto-tunes and plays live radio without pressing Tune',true);
  await page.evaluate(()=>{window.__radioPad={index:0,connected:true,mapping:'standard',id:'DualSense Wireless Controller',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__radioPad]});});
  const radioPad=async button=>{await page.evaluate(button=>window.__radioPad.buttons[button]={pressed:true,value:1},button);await new Promise(r=>setTimeout(r,150));await page.evaluate(button=>window.__radioPad.buttons[button]={pressed:false,value:0},button);await new Promise(r=>setTimeout(r,150));};
  await radioPad(12);await waitForState(page,()=>window.__NEON_QA__.radioStatus().state==='playing');
  check('pad up discovers and plays real media after initial gesture priming',await page.evaluate(()=>window.__NEON_QA__.radioStatus().primed));
  const firstRadio=await page.evaluate(()=>window.__NEON_QA__.radioStatus().station);await radioPad(15);await waitForState(page,()=>window.__NEON_QA__.radioStatus().state==='playing');
  check('pad right changes station',await page.evaluate(first=>window.__NEON_QA__.radioStatus().station!==first,firstRadio));await radioPad(14);await waitForState(page,()=>window.__NEON_QA__.radioStatus().state==='playing');
  check('pad left returns to previous station',await page.evaluate(first=>window.__NEON_QA__.radioStatus().station===first,firstRadio));
  const volumeBefore=await page.evaluate(()=>window.__NEON_QA__.radioStatus().volume);await radioPad(4);check('L1 lowers radio volume',await page.evaluate(v=>Math.abs(window.__NEON_QA__.radioStatus().volume-Math.max(0,v-.1))<.001,volumeBefore));await radioPad(5);check('R1 raises radio volume',await page.evaluate(v=>Math.abs(window.__NEON_QA__.radioStatus().volume-v)<.001,volumeBefore));
  await radioPad(13);check('pad down turns radio off',await page.evaluate(()=>window.__NEON_QA__.radioStatus().station==='off'&&window.__NEON_QA__.radioStatus().state==='off'));
  await page.evaluate(()=>{const play=HTMLMediaElement.prototype.play;window.__radioPlay=play;let reject=true;HTMLMediaElement.prototype.play=function(){if(reject&&this.src.includes('radio-fixture')){reject=false;return Promise.reject(new DOMException('QA autoplay block','NotAllowedError'));}return play.call(this);};});
  await radioPad(12);await waitForState(page,()=>window.__NEON_QA__.radioStatus().state==='blocked');await radioPad(12);await waitForState(page,()=>window.__NEON_QA__.radioStatus().state==='playing');check('pad up recovers a blocked stream with one explicit retry',true);
  check('radio controller mapping is visible',await page.$eval('#gameRadioContext',el=>el.textContent.includes('L1/R1')));
  check('exit ring is amber',await page.$eval('#vehicleButton',el=>getComputedStyle(el).borderTopColor==='rgb(255, 187, 85)'));
  await page.keyboard.press('e');check('exit stops controller-started radio',await page.evaluate(()=>window.__NEON_QA__.radioStatus().state==='stopped'));
  await page.evaluate(()=>{HTMLMediaElement.prototype.play=window.__radioPlay;delete navigator.getGamepads;delete window.__radioPad;delete window.__radioPlay;});radioFixture=null;
  check('outer district taxi can be approached',await page.evaluate(()=>window.__NEON_QA__.besideVehicle(5)));
  await page.keyboard.press('e');
  const driveStart=await page.evaluate(()=>window.__NEON_QA__.worldSnapshot().cars[5]);
  await page.keyboard.down('w');
  try{await page.waitForFunction(start=>window.__NEON_QA__.worldSnapshot().cars[5].x>start+6,{timeout:30000},driveStart.x);}finally{await page.keyboard.up('w');}
  const driveEnd=await page.evaluate(()=>window.__NEON_QA__.worldSnapshot().cars[5]);
  check('taxi drives through expanded district corridor',driveEnd.x-driveStart.x>6&&Math.abs(driveEnd.y-driveStart.y)<.5,`distance=${(driveEnd.x-driveStart.x).toFixed(1)}`);
  await page.keyboard.press('e');
  await page.evaluate(()=>window.__NEON_QA__.teleport(11.5,18.5));

  await page.evaluate(() => { window.__NEON_QA__.setInvulnerable(true); window.__NEON_QA__.skipWait(); });
  await waitForState(page, () => window.__NEON_QA__.snapshot().enemies > 0, 8000);
  const combat = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('enemies spawn', combat.enemies > 0, `enemies=${combat.enemies}`);
  check('starts at mission stage 0', combat.missionStage === 0, `stage=${combat.missionStage}`);

  // March through every mission stage to the finale.
  for (let stage = 0; stage < 4; stage++) {
    await page.evaluate(() => window.__NEON_QA__.completePhase());
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  const finale = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('mission advances to extraction stage', finale.missionStage === 4, `stage=${finale.missionStage}`);
  await page.evaluate(()=>window.__NEON_QA__.besideVehicle(7));await page.keyboard.press('e');
  check('bus remains boardable during extraction',await page.evaluate(()=>window.__NEON_QA__.snapshot().carIndex===7));await page.keyboard.press('e');

  // Movement + physics still integrate.
  await page.evaluate(() => window.__NEON_QA__.teleport(11.5, 18.5));
  await page.evaluate(() => window.__NEON_QA__.setFlight(true));
  await new Promise(resolve => setTimeout(resolve, 500));
  const airborne = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('jet flight gains altitude', airborne.z > 0.6, `z=${airborne.z.toFixed(2)}`);
  await page.evaluate(() => window.__NEON_QA__.setFlight(false));

  // Combat feedback: a confirmed kill shows a kill marker, a damage number, a feed entry and a tracer.
  await page.evaluate(() => window.__NEON_QA__.setInvulnerable(true));
  const feedback = await page.evaluate(() => window.__NEON_QA__.combatFeedbackTest());
  check('kill shows marker, damage number, kill feed and tracer', feedback.dead && feedback.killMarker && feedback.numbers === 1 && feedback.feed.length === 1 && /WRAITH/.test(feedback.feed[0]) && feedback.tracers >= 1 && feedback.corpseFall, JSON.stringify(feedback));

  // Stance: sprint then crouch starts a slide; afterwards the crouch toggle holds until pressed again.
  // Sprint down the clear lane the feedback test just aimed along (grounded first).
  await page.evaluate(() => { const s = window.__NEON_QA__; s.setAim(false); s.teleport(); });
  await waitForState(page, () => window.__NEON_QA__.snapshot().grounded, 3000).catch(() => {});
  await page.keyboard.down('KeyQ'); await page.keyboard.down('KeyW');
  await waitForState(page, () => window.__NEON_QA__.snapshot().speed > 3.4, 5000).catch(() => {});
  await page.keyboard.press('KeyC');
  await new Promise(resolve => setTimeout(resolve, 120));
  const slide = await page.evaluate(() => window.__NEON_QA__.snapshot());
  await page.keyboard.up('KeyW'); await page.keyboard.up('KeyQ');
  check('crouching from a sprint starts a slide', slide.sliding && slide.crouch > .3, `speed=${slide.speed?.toFixed(2)} crouch=${slide.crouch?.toFixed(2)}`);
  await waitForState(page,()=>!window.__NEON_QA__.snapshot().sliding,5000);
  const crouched = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('crouch persists after the slide ends', !crouched.sliding && crouched.crouch > .8, `crouch=${crouched.crouch?.toFixed(2)}`);
  await page.keyboard.press('KeyC');
  await waitForState(page, () => window.__NEON_QA__.snapshot().crouch < .1, 3000).catch(() => {});
  check('pressing crouch again stands up', await page.evaluate(() => window.__NEON_QA__.snapshot().crouch < .1));

  // Genuine 3D layer: WebGL2 must initialize, submit real Three.js frames,
  // and hide the legacy Canvas layer. Compatibility mode is tested separately.
  let rendererReady = false;
  try { await waitForState(page, () => document.body.classList.contains('three-ready'), 10000); rendererReady = true; } catch {}
  check('genuine 3D renderer initialized', rendererReady);
  if (rendererReady) {
    const renderState = await page.evaluate(() => ({
      fx: { q: window.__NEON_FX__?.quality(), ms: Math.round(window.__NEON_FX__?.frameMs() || 0), post: window.__NEON_FX__?.post() },
      stats: window.__NEON_RENDER_STATS__?.(),
      threeVisible: getComputedStyle(document.querySelector('#threeGame')).display !== 'none',
      canvasHidden: getComputedStyle(document.querySelector('#game')).opacity === '0'
    }));
    check('adaptive quality controller online', Number.isInteger(renderState.fx.q) && renderState.fx.q >= 0 && renderState.fx.q <= 3, `quality=${renderState.fx.q} frame=${renderState.fx.ms}ms post=${renderState.fx.post}`);
    check('Three.js submits frames', renderState.stats?.calls > 0 && renderState.stats?.triangles > 0, `calls=${renderState.stats?.calls} triangles=${renderState.stats?.triangles}`);
    check('3D canvas visible and Canvas layer hidden', renderState.threeVisible && renderState.canvasHidden, `threeVisible=${renderState.threeVisible} canvasHidden=${renderState.canvasHidden}`);
    await page.screenshot({ path: process.env.SMOKE_SHOT || 'smoke-gameplay.png' });
  }

  // Victory: park a vehicle on the First Strike beacon and require the full debrief + both POSTs.
  await page.evaluate(()=>window.__NEON_QA__.setFlight(false));
  const posted=path=>page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST',{timeout:20000}).catch(()=>null);
  const [resultPost,boardPost]=[posted('/api/results'),posted('/api/leaderboard')];
  check('QA hook parks a vehicle on the extraction beacon',await page.evaluate(()=>window.__NEON_QA__.completeExtraction()));
  await waitForState(page,()=>window.__NEON_QA__.snapshot().mode==='victory'&&!document.getElementById('modalScreen').classList.contains('hidden'),15000);
  check('First Strike reaches the MISSION COMPLETE debrief',await page.evaluate(()=>document.getElementById('modalEyebrow').textContent==='MISSION COMPLETE'&&window.__NEON_QA__.snapshot().operation===0));
  const [resultResponse,boardResponse]=await Promise.all([resultPost,boardPost]);
  check('victory publishes its public result',!!resultResponse?.ok(),`status=${resultResponse?.status()}`);
  check('victory posts to the leaderboard',!!boardResponse?.ok(),`status=${boardResponse?.status()}`);
  await waitForState(page,()=>/leaderboard updated/i.test(document.getElementById('resultPublishStatus').textContent),10000);
  check('debrief confirms the leaderboard update',true);
  if(process.env.SMOKE_SHOT)await page.screenshot({path:process.env.SMOKE_SHOT.replace(/\.png$/,'-victory.png')});

  // Explicit compatibility mode: this is the only path allowed to use Canvas.
  await page.goto(`http://127.0.0.1:${PORT}/?qa&renderer=compat`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForState(page, () => Boolean(window.__NEON_QA__), 10000);
  await waitForState(page, () => document.body.classList.contains('three-fallback'), 5000);
  await page.evaluate(() => document.getElementById('deployButton').click());
  await waitForState(page, () => window.__NEON_QA__.snapshot().mode === 'playing', 5000);
  const compatState = await page.evaluate(() => ({ fallback: document.body.classList.contains('three-fallback'), genuine: document.body.classList.contains('three-ready'), canvasOpacity: getComputedStyle(document.querySelector('#game')).opacity }));
  check('explicit compatibility mode is separate', compatState.fallback && !compatState.genuine && compatState.canvasOpacity !== '0', JSON.stringify(compatState));

  // Second scenario: select operation 2 (NIGHT RAPTOR) from the menu and play
  // it through every stage type — reach, defend, hvt, extract.
  await page.goto(`http://127.0.0.1:${PORT}/?qa&quality=low`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForState(page, () => Boolean(window.__NEON_QA__), 10000);
  await waitForState(page,()=>document.getElementById('accountName').textContent.includes('USERNAME RESERVED'));
  check('returning player is signed in without re-entering credentials',await page.evaluate(()=>document.getElementById('accountGate').classList.contains('hidden')));
  await page.evaluate(() => document.querySelector('[data-operation="1"]').click());
  await page.evaluate(()=>document.querySelector('[data-time="night"]').click());
  await page.evaluate(() => document.getElementById('deployButton').click());
  await waitForState(page, () => window.__NEON_QA__.snapshot().mode === 'playing', 5000);
  const op2 = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('operation 2 deploys', op2.operation === 1, `operation=${op2.operation}`);
  await waitForState(page,()=>document.body.classList.contains('three-ready')&&window.__NEON_RENDER_STATS__?.().calls>0);check('campaign night selection runs genuine 3D gameplay',op2.timeOfDay==='night');if(process.env.SMOKE_SHOT)await page.screenshot({path:process.env.SMOKE_SHOT.replace(/\.png$/,'-night.png')});
  check('night lighting never automatically enables night vision',await page.evaluate(()=>!document.body.classList.contains('nvg-active')&&!window.__NEON_3D__.frame().nightVision));
  await page.keyboard.press('KeyB');await waitForState(page,()=>document.body.classList.contains('nvg-active'));await page.keyboard.press('KeyB');await waitForState(page,()=>!document.body.classList.contains('nvg-active'));check('night vision is an explicit reversible control',true);
  // First person only: V no longer switches to a third-person body.
  await page.keyboard.press('KeyV');await new Promise(resolve=>setTimeout(resolve,300));check('view stays first person with no visible own body',await page.evaluate(()=>window.__NEON_3D__.frame().viewMode==='first'&&!window.__NEON_RENDER_STATS__().localPlayerVisible&&!document.getElementById('viewButton')));
  await page.keyboard.press('Escape');await page.select('#campaignTime','day');await page.keyboard.press('Escape');await waitForState(page,()=>window.__NEON_QA__.snapshot().mode==='playing'&&window.__NEON_QA__.snapshot().timeOfDay==='day');check('Night Raptor campaign can switch to daylight without restarting',true);
  // Simulation resumes before the next Three.js frame updates scene visibility.
  await waitForState(page,()=>window.__NEON_RENDER_STATS__().civilianCount>=6&&window.__NEON_RENDER_STATS__().shopVisible);
  check('civilian routes and armory render in the campaign',true);
  await page.evaluate(()=>window.__NEON_QA__.equipWeapon(3));check('unearned unpurchased marksman rifle remains locked',await page.evaluate(()=>window.__NEON_QA__.snapshot().weapon!=='dmr'));
  await page.evaluate(async()=>{const p=window.__NEON_3D__.frame().gunShop;window.__NEON_QA__.teleport(p.x,p.y);const {accountUser}=await import('/accounts.js');localStorage.setItem(`neon-wallet:${accountUser().id}`,JSON.stringify({credits:300,owned:[]}));});
  await page.keyboard.press('KeyE');await waitForState(page,()=>!document.getElementById('gunShopPanel').hidden);await page.evaluate(()=>document.querySelector('#shopWeapons [data-weapon-action="3"]').click());check('armory spends earned credits and equips purchased marksman rifle',await page.evaluate(()=>window.__NEON_QA__.snapshot().weapon==='dmr'&&document.getElementById('shopBalance').textContent.startsWith('60 earned')));if(process.env.SMOKE_SHOT)await page.screenshot({path:process.env.SMOKE_SHOT.replace(/\.png$/,'-armory.png')});await page.keyboard.press('Escape');
  check('operation 2 has its own objective', op2.objective === 'REACH THE EASTERN RELAY POST', op2.objective);
  await page.evaluate(() => { window.__NEON_QA__.setInvulnerable(true); });
  for (let stage = 0; stage < 4; stage++) {
    await page.evaluate(() => window.__NEON_QA__.completePhase());
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  const op2Finale = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('operation 2 reaches extraction stage', op2Finale.missionStage === 4, `stage=${op2Finale.missionStage}`);
  check('operation 2 spawned hostiles along the way', op2Finale.enemies > 0 || op2Finale.kills > 0, `enemies=${op2Finale.enemies}`);

  // Third scenario: boss phase escalation. Jump to the HVT stage, wound the
  // commander past a phase threshold, and confirm reinforcements + rage buffs.
  await page.goto(`http://127.0.0.1:${PORT}/?qa&quality=low`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForState(page, () => Boolean(window.__NEON_QA__), 10000);
  await page.evaluate(() => document.getElementById('deployButton').click());
  await waitForState(page, () => window.__NEON_QA__.snapshot().mode === 'playing', 5000);
  await page.evaluate(() => { window.__NEON_QA__.setInvulnerable(true); window.__NEON_QA__.setMissionStage(3); });
  await new Promise(resolve => setTimeout(resolve, 400));
  const beforePhase = await page.evaluate(() => window.__NEON_QA__.snapshot());
  await page.evaluate(() => window.__NEON_QA__.damageCommander(.4));
  await page.waitForFunction(count=>window.__NEON_QA__.snapshot().enemies>count,{timeout:15000},beforePhase.enemies);
  const afterPhase = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('boss phase 2 summons reinforcements', afterPhase.enemies > beforePhase.enemies, `enemies ${beforePhase.enemies} -> ${afterPhase.enemies}`);
  await page.evaluate(() => window.__NEON_QA__.damageCommander(.35));
  await page.waitForFunction(count=>window.__NEON_QA__.snapshot().enemies>count,{timeout:15000},afterPhase.enemies);
  const finalPhase = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('boss phase 3 summons more reinforcements', finalPhase.enemies > afterPhase.enemies, `enemies ${afterPhase.enemies} -> ${finalPhase.enemies}`);

  // Progression: with no career stats (offline dev), the NX-7 must stay locked.
  await page.evaluate(() => window.__NEON_QA__.equipWeapon(3));
  const lockedTry = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('purchased weapon stays owned across reload', lockedTry.weapon === 'dmr', `weapon=${lockedTry.weapon}`);
  await page.evaluate(() => window.__NEON_QA__.equipWeapon(1));
  const shotgunTry = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('unlocked weapon swaps normally', shotgunTry.weapon === 'shotgun', `weapon=${shotgunTry.weapon}`);

  check('no synthesized soundtrack is masquerading as radio',await page.evaluate(()=>window.__NEON_QA__.radioStatus().synthSteps===0));
  await page.evaluate(()=>{window.__NEON_QA__.setInvulnerable(true);window.__NEON_QA__.prepareDestructionTest();for(let n=0;n<10;n++)window.__NEON_QA__.fireTestRound();});
  check('taxi survives the first ten bullets',await page.evaluate(()=>!window.__NEON_QA__.worldSnapshot().cars[6].destroyed));
  await page.evaluate(()=>{for(let n=0;n<60;n++)window.__NEON_QA__.fireTestRound();});
  check('sustained player fire destroys taxis',await page.evaluate(()=>window.__NEON_QA__.worldSnapshot().cars[6].destroyed));
  await page.evaluate(()=>window.__NEON_QA__.prepareGlassTest());
  check('glass fixture begins on foot with a loaded weapon',await page.evaluate(()=>{const s=window.__NEON_QA__.checkpointInfo();return s.player.ammo>0&&s.player.carIndex===-1&&!s.player.reloading;}));
  await page.keyboard.down('Shift');
  try{await page.waitForFunction(()=>window.__NEON_QA__.snapshot().brokenGlass>0,{timeout:15000});}
  finally{await page.keyboard.up('Shift');}
  await page.waitForFunction(()=>!window.__NEON_CITY__.inspectCell(5,3).visible,{timeout:15000});
  check('Shift fire shatters glass in genuine 3D',true);

  for(const arena of ['city-gate','millennium-park','jabi-lake']){
    await page.goto(`http://127.0.0.1:${PORT}/?qa&quality=low`,{waitUntil:'domcontentloaded'});
    await waitForState(page,()=>Boolean(window.__NEON_QA__ && window.__NEON_CITY__));
    await page.select('#arenaSelect',arena);
    await page.evaluate(()=>document.getElementById('deployButton').click());
    await waitForState(page,()=>document.body.classList.contains('three-ready') && window.__NEON_CITY__.arena===window.__NEON_QA__.worldSnapshot().arena);
    const layout=await page.evaluate(()=>{const world=window.__NEON_QA__.worldSnapshot();let matched=true;for(let y=0;y<world.cells.length;y++)for(let x=0;x<world.cells[y].length;x++){const cell=window.__NEON_CITY__.inspectCell(x,y);if(cell.present!==(world.cells[y][x]>0))matched=false;}const stats=window.__NEON_RENDER_STATS__();return {arena:world.arena,matched,calls:stats.calls,triangles:stats.triangles};});
    check(`${arena} selects a matching genuine 3D layout`,layout.arena===arena && layout.matched && layout.calls>0 && layout.triangles>0,JSON.stringify(layout));
    await page.evaluate(()=>{window.__NEON_QA__.setInvulnerable(true);window.__NEON_QA__.teleport(12,17.5);});
    await new Promise(resolve=>setTimeout(resolve,3000));
    if(process.env.SMOKE_SHOT)await page.screenshot({path:process.env.SMOKE_SHOT.replace(/\.png$/,`-${arena}.png`)});
  }
  }
  await page.setViewport({width:844,height:390,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.goto(`http://127.0.0.1:${PORT}/?qa&quality=low`,{waitUntil:'domcontentloaded'});
  await waitForState(page,()=>Boolean(window.__NEON_QA__));
  await page.evaluate(()=>document.getElementById('deployButton').click());
  await waitForState(page,()=>window.__NEON_QA__.snapshot().mode==='playing');
  await page.evaluate(()=>{window.__NEON_QA__.setInvulnerable(true);window.__NEON_QA__.besideVehicle(0);});
  await waitForState(page,()=>!document.getElementById('vehicleButton').hidden);
  const button=await page.$('#vehicleButton'),rect=await button.boundingBox();
  await page.touchscreen.tap(rect.x+rect.width/2,rect.y+rect.height/2);
  check('touch enters taxi without look-zone interception',await page.evaluate(()=>window.__NEON_QA__.snapshot().carIndex===0));
  check('mobile radio appears only while driving',await page.evaluate(()=>!document.getElementById('gameRadio').hidden));
  await page.touchscreen.tap(rect.x+rect.width/2,rect.y+rect.height/2);
  check('touch exits taxi',await page.evaluate(()=>window.__NEON_QA__.snapshot().carIndex===-1));
  check('mobile exit hides radio and stops playback',await page.evaluate(()=>document.getElementById('gameRadio').hidden&&window.__NEON_QA__.radioStatus().state==='stopped'));
  const orientationBefore=await page.evaluate(()=>window.__NEON_QA__.snapshot());
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.waitForFunction(()=>matchMedia('(orientation:portrait)').matches&&document.getElementById('threeGame').clientHeight>document.getElementById('threeGame').clientWidth);
  const touchLayout=await page.evaluate(()=>{
    const ids=['joystickZone','fireButton','reloadButton','jetButton','pauseButton','touchMoreButton'];
    return ids.map(id=>{const element=document.getElementById(id),rect=element.getBoundingClientRect();return {id,width:rect.width,height:rect.height,inBounds:rect.x>=0&&rect.y>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight,reachable:element.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2))};});
  });
  check('portrait controls have reachable 44px targets inside the viewport',touchLayout.every(control=>control.inBounds&&control.reachable&&control.width>=44&&control.height>=44),JSON.stringify(touchLayout.filter(control=>!control.inBounds||!control.reachable||control.width<44||control.height<44)));
  check('pause does not cover the mission instruction',await page.evaluate(()=>{const a=document.getElementById('pauseButton').getBoundingClientRect(),b=document.getElementById('objectiveBox').getBoundingClientRect();return a.left>=b.right||a.right<=b.left||a.top>=b.bottom||a.bottom<=b.top;}));
  const orientationAfter=await page.evaluate(()=>window.__NEON_QA__.snapshot());
  check('rotation preserves active gameplay and mission progress',orientationAfter.mode==='playing'&&orientationAfter.operation===orientationBefore.operation&&orientationAfter.missionStage===orientationBefore.missionStage);
  await page.evaluate(()=>window.__NEON_QA__.besideVehicle(0));
  await page.waitForFunction(()=>!document.getElementById('vehicleButton').hidden&&!document.getElementById('vehicleButton').disabled);
  const portraitVehicle=await page.$('#vehicleButton'),portraitVehicleRect=await portraitVehicle.boundingBox();
  await page.touchscreen.tap(portraitVehicleRect.x+portraitVehicleRect.width/2,portraitVehicleRect.y+portraitVehicleRect.height/2);
  check('portrait touch enters taxi on first tap',await page.evaluate(()=>window.__NEON_QA__.snapshot().carIndex===0));
  await page.touchscreen.tap(portraitVehicleRect.x+portraitVehicleRect.width/2,portraitVehicleRect.y+portraitVehicleRect.height/2);
  check('portrait touch exits taxi without a duplicate toggle',await page.evaluate(()=>window.__NEON_QA__.snapshot().carIndex===-1));
  const aimButton=await page.$('#adsButton'),aimRect=await aimButton.boundingBox();
  await page.touchscreen.tap(aimRect.x+aimRect.width/2,aimRect.y+aimRect.height/2);
  check('primary touch AIM works without opening MORE',await page.evaluate(()=>window.__NEON_QA__.touchInput().aim&&document.getElementById('adsButton').getAttribute('aria-pressed')==='true'));
  await page.touchscreen.tap(aimRect.x+aimRect.width/2,aimRect.y+aimRect.height/2);
  check('primary touch AIM toggles off',await page.evaluate(()=>!window.__NEON_QA__.touchInput().aim));
  const moreButton=await page.$('#touchMoreButton'),moreRect=await moreButton.boundingBox();await page.touchscreen.tap(moreRect.x+moreRect.width/2,moreRect.y+moreRect.height/2);
  check('secondary mobile controls remain available in MORE',await page.evaluate(()=>!document.getElementById('touchExtras').hidden));
  const extraTargets=await page.evaluate(()=>Array.from(document.querySelectorAll('#touchExtras button')).map(e=>{const r=e.getBoundingClientRect();return {id:e.id,valid:r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));
  check('disclosed actions remain reachable 44px targets',extraTargets.every(e=>e.valid),JSON.stringify(extraTargets.filter(e=>!e.valid)));
  const weaponBefore=orientationAfter.weapon,weaponButton=await page.$('#weaponButton'),weaponRect=await weaponButton.boundingBox();
  await page.touchscreen.tap(weaponRect.x+weaponRect.width/2,weaponRect.y+weaponRect.height/2);
  check('portrait touch button switches weapons',await page.evaluate(previous=>window.__NEON_QA__.snapshot().weapon!==previous,weaponBefore));
  await page.touchscreen.tap(moreRect.x+moreRect.width/2,moreRect.y+moreRect.height/2);
  if(process.env.SMOKE_SHOT)await page.screenshot({path:process.env.SMOKE_SHOT.replace(/\.png$/,'-mobile-portrait.png')});
  const fireButton=await page.$('#fireButton'),fireRect=await fireButton.boundingBox(),touchClient=await page.createCDPSession();
  await touchClient.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:fireRect.x+fireRect.width/2,y:fireRect.y+fireRect.height/2,id:1}]});
  check('touch fire registers while held',await page.evaluate(()=>window.__NEON_QA__.touchInput().fire));
  await page.setViewport({width:844,height:390,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.waitForFunction(()=>!window.__NEON_QA__.touchInput().fire&&matchMedia('(orientation:landscape)').matches);
  await touchClient.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  check('turning to landscape clears held fire without restarting',await page.evaluate(()=>window.__NEON_QA__.snapshot().mode==='playing'));
  if(process.env.SMOKE_SHOT)await page.screenshot({path:process.env.SMOKE_SHOT.replace(/\.png$/,'-mobile-landscape.png')});
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__NEON_QA__.snapshot().mode==='paused');
  const savedWorld=await page.evaluate(()=>{document.getElementById('resumeButton').click();window.__NEON_QA__.prepareCheckpointTest();return window.__NEON_QA__.checkpointInfo();});
  await page.evaluate(()=>document.getElementById('quitButton').click());
  // Deliberately make session lookup slower than campaign lookup to exercise the identity race.
  await page.evaluateOnNewDocument(()=>{
    const originalFetch=window.fetch.bind(window);
    window.fetch=async(...args)=>{if(String(args[0]).includes('/api/auth/session'))await new Promise(resolve=>setTimeout(resolve,300));return originalFetch(...args);};
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await waitForState(page,()=>!!window.__NEON_QA__&&!document.getElementById('continueButton').classList.contains('hidden')&&/USERNAME RESERVED|VERIFIED OWNER/.test(document.getElementById('accountName').textContent));
  const resumedWorld=await page.evaluate(()=>{document.getElementById('continueButton').click();document.getElementById('pauseButton').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));return window.__NEON_QA__.checkpointInfo();});
  check('Continue selects and accepts the exact local checkpoint',await page.evaluate(()=>window.__NEON_QA__.resumeInfo()?.restored),JSON.stringify(await page.evaluate(()=>window.__NEON_QA__.resumeInfo())));
  const changedKeys=(before,after)=>[...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>JSON.stringify(before[key])!==JSON.stringify(after[key]));
  check('reload restores exact position, ammo and occupied vehicle',changedKeys(savedWorld.player,resumedWorld.player).length===0,changedKeys(savedWorld.player,resumedWorld.player).join(', '));
  check('reload restores mission timers, enemies, pickups and broken glass',changedKeys(savedWorld.world,resumedWorld.world).length===0&&JSON.stringify(resumedWorld.brokenGlass)===JSON.stringify(savedWorld.brokenGlass),changedKeys(savedWorld.world,resumedWorld.world).join(', '));
  await page.evaluate(()=>document.getElementById('quitButton').click());
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  if(process.env.SMOKE_SHOT)await page.screenshot({path:process.env.SMOKE_SHOT.replace(/\.png$/,'-mobile-menu.png')});
  await page.evaluate(()=>{document.querySelector('[data-goto="screenSettings"]').click();for(const detail of document.querySelectorAll('#screenSettings details'))detail.open=true;});
  await page.waitForFunction(()=>document.getElementById('screenSettings').classList.contains('active'));
  const menuScroll=await page.evaluate(()=>{const menu=document.getElementById('menuRoot');menu.scrollTop=0;return {height:menu.scrollHeight,client:menu.clientHeight};});
  check('expanded settings genuinely need vertical scrolling',menuScroll.height>menuScroll.client,JSON.stringify(menuScroll));
  await touchClient.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:185,y:700,id:2}]});
  for(const y of [600,500,400,300])await touchClient.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:185,y,id:2}]});
  await touchClient.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>document.getElementById('menuRoot').scrollTop>0,{timeout:5000});
  check('portrait menus scroll with a real touch gesture',menuScroll.height>menuScroll.client);
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (error) {
  check('smoke run completed', false, String(error?.message || error));
} finally {
  await browser?.close();
  server.kill();
}

console.log(failures.length ? `\nSMOKE FAILED: ${failures.length} failing check(s)` : '\nSMOKE GREEN');
process.exit(failures.length ? 1 : 0);
