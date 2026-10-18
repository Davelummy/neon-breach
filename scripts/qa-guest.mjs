// Guest-play regression: a signed-out profile plays as a guest, posts nothing online,
// then signs up from the debrief and carries its score, wallet and campaign save across.
// Usage: node scripts/qa-guest.mjs
import {spawn} from 'node:child_process';
import puppeteer from 'puppeteer-core';
import {qaBrowserPath} from './qa-browser.mjs';
const port=4325,server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
const failures=[],check=(label,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${label}${detail?` — ${detail}`:''}`);if(!ok)failures.push(label);};
const waitFor=(page,fn,timeout=30000,...args)=>page.waitForFunction(fn,{timeout,polling:50},...args);
let browser;
try{
  await new Promise(r=>setTimeout(r,600));
  browser=await puppeteer.launch({executablePath:qaBrowserPath(),timeout:60000,args:['--no-sandbox','--mute-audio']});
  const page=await browser.newPage(),errors=[],online=[],campaignRequests=[];page.on('pageerror',e=>errors.push(String(e?.message||e)));
  await page.setViewport({width:1280,height:720});
  page.on('request',r=>{const path=new URL(r.url()).pathname;if(r.method()==='POST'&&['/api/leaderboard','/api/results'].includes(path))online.push({path,body:JSON.parse(r.postData()||'{}')});});
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/campaigns')campaignRequests.push(r.method());});
  await page.goto(`http://127.0.0.1:${port}/?qa&renderer=compat`,{waitUntil:'domcontentloaded',timeout:30000});
  await waitFor(page,()=>window.__NEON_QA__&&!document.getElementById('accountGate').classList.contains('hidden'));
  check('fresh signed-out profile sees the account gate',await page.evaluate(()=>!localStorage.getItem('neon-breach-guest')));
  await page.click('#accountGuest');
  await waitFor(page,()=>document.getElementById('accountGate').classList.contains('hidden'));
  check('menu shows guest status',await page.$eval('#mainAccountName',e=>e.textContent==='Guest · progress saved on this device'&&!document.getElementById('mainAccount').hidden));
  const guestId=await page.evaluate(()=>JSON.parse(localStorage.getItem('neon-breach-guest')).id);
  check('guest identity is stored on this device',/^guest-[a-z0-9]{8,32}$/.test(guestId),guestId);
  await page.evaluate(()=>document.getElementById('welcomeGate')?.classList.add('hidden'));
  const campaignRequestsBeforeGuest=campaignRequests.length;
  const boardRead=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/leaderboard'&&r.request().method()==='GET',{timeout:30000}).catch(()=>null);
  await page.click('#screenMain [data-goto="screenRanks"]');
  await waitFor(page,()=>document.getElementById('screenRanks').classList.contains('active'));
  check('guest can browse the world leaderboard read-only',Boolean(await boardRead)&&await page.evaluate(()=>document.getElementById('accountGate').classList.contains('hidden')&&!document.getElementById('guestBoardNote').classList.contains('hidden')));
  await page.click('#guestBoardSignup');
  await waitFor(page,()=>!document.getElementById('accountGate').classList.contains('hidden'));
  check('posting from the leaderboard explains why a guest needs an account',await page.evaluate(()=>/post your scores/.test(document.getElementById('accountReason').textContent)));
  await page.click('#accountGuest');
  await waitFor(page,()=>document.getElementById('accountGate').classList.contains('hidden'));
  await page.evaluate(()=>document.querySelector('#screenRanks [data-goto="screenMain"]').click());
  await waitFor(page,()=>document.getElementById('screenMain').classList.contains('active'));
  await page.click('#multiplayerButton');
  await waitFor(page,()=>!document.getElementById('accountGate').classList.contains('hidden'));
  check('Multiplayer asks a guest to create an account',await page.evaluate(()=>{const r=document.getElementById('accountReason');return !r.hidden&&r.getBoundingClientRect().height>0&&/Multiplayer needs an account/.test(r.textContent)&&!document.getElementById('multiplayerPanel').open;}));
  await page.click('#accountGuest');
  await waitFor(page,()=>document.getElementById('accountGate').classList.contains('hidden'));
  // Seed earned credits and an unlock so the account merge is observable.
  await page.evaluate(id=>localStorage.setItem(`neon-wallet:${id}`,JSON.stringify({credits:140,owned:[1]})),guestId);
  await page.evaluate(()=>document.getElementById('deployButton').click());
  await waitFor(page,()=>window.__NEON_QA__.snapshot().mode==='playing',10000);
  await page.evaluate(()=>{window.__NEON_QA__.setInvulnerable(true);window.__NEON_QA__.setMissionStage(3);});
  await waitFor(page,()=>window.__NEON_QA__.snapshot().enemies>0,10000);
  await page.evaluate(()=>window.__NEON_QA__.completePhase());
  await waitFor(page,()=>window.__NEON_QA__.snapshot().missionStage===4,10000);
  check('guest run reaches extraction',await page.evaluate(()=>window.__NEON_QA__.completeExtraction()));
  await waitFor(page,()=>window.__NEON_QA__.snapshot().mode==='victory'&&!document.getElementById('modalScreen').classList.contains('hidden'),15000);
  await waitFor(page,()=>/Create an account to post/.test(document.getElementById('resultPublishStatus').textContent),10000);
  const run=await page.evaluate(()=>({score:Number(document.getElementById('resultScore').textContent.replace(/\D/g,'')),button:!document.getElementById('guestPostScore').classList.contains('hidden')}));
  check('guest debrief offers to post the run',run.score>0&&run.button,JSON.stringify(run));
  await new Promise(r=>setTimeout(r,1500));
  check('guest run posts nothing to the leaderboard or results',online.length===0,online.map(e=>e.path).join(', '));
  check('guest campaign never reads or writes cloud campaign storage',campaignRequests.length===campaignRequestsBeforeGuest,campaignRequests.join(', '));
  const before=await page.evaluate(id=>({wallet:JSON.parse(localStorage.getItem(`neon-wallet:${id}`)),owner:JSON.parse(localStorage.getItem('neon-breach-campaign-v1')||'null')?.owner}),guestId);
  check('guest campaign save is owned by the guest',before.owner===guestId,before.owner);

  await page.click('#guestPostScore');
  await waitFor(page,()=>!document.getElementById('accountGate').classList.contains('hidden')&&!document.getElementById('accountReason').hidden);
  const username=`qg_${Date.now().toString(36)}`,password=`QA-${Math.random().toString(36).slice(2,12)}`;
  if(await page.$eval('#accountSubmit',e=>e.textContent!=='Create account'))await page.click('#accountSwitch');
  await page.type('#accountUsername',username);await page.type('#accountPassword',password);
  const boardPost=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/leaderboard'&&r.request().method()==='POST',{timeout:60000}).catch(()=>null);
  await page.click('#accountSubmit');
  try{await waitFor(page,()=>document.getElementById('accountGate').classList.contains('hidden'),60000);}catch{throw new Error(`Signup did not finish: ${await page.$eval('#accountStatus',e=>e.textContent)}`);}
  const response=await boardPost,posted=online.find(e=>e.path==='/api/leaderboard');
  check('pending guest score posts under the new username',!!response?.ok()&&posted?.body.callsign===username.toUpperCase()&&posted?.body.score===run.score,`status=${response?.status()} callsign=${posted?.body.callsign} score=${posted?.body.score}`);
  check('pending guest score also publishes a public result',online.some(e=>e.path==='/api/results'&&e.body.callsign===username.toUpperCase()));
  const after=await page.evaluate(async guest=>{const {accountUser}=await import('/accounts.js');const id=accountUser()?.id;return {id,guest:accountUser()?.guest,name:document.getElementById('mainAccountName').textContent,wallet:JSON.parse(localStorage.getItem(`neon-wallet:${id}`)||'null'),oldWallet:localStorage.getItem(`neon-wallet:${guest}`),owner:JSON.parse(localStorage.getItem('neon-breach-campaign-v1')||'null')?.owner,hidden:document.getElementById('guestPostScore').classList.contains('hidden')};},guestId);
  check('signup replaces the guest with the new account',after.id&&!after.guest&&after.name===`Signed in as ${username}`&&after.hidden,JSON.stringify({id:after.id,name:after.name}));
  check('guest wallet credits merge into the new account',after.wallet?.credits===before.wallet.credits&&before.wallet.owned.every(n=>after.wallet.owned.includes(n))&&after.oldWallet===null,`${JSON.stringify(before.wallet)} -> ${JSON.stringify(after.wallet)}`);
  check('local campaign save moves to the new account',after.owner===after.id,`owner=${after.owner}`);
  check('no uncaught page errors',errors.length===0,errors.slice(0,3).join(' | '));
}catch(error){check('guest run completed',false,String(error?.message||error));}
finally{await browser?.close();server.kill();}
console.log(failures.length?`\nGUEST QA FAILED: ${failures.length} failing check(s)`:'\nGUEST QA GREEN');
process.exit(failures.length?1:0);
