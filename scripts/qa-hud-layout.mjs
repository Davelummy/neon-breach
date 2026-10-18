// Campaign HUD obstruction check: on foot, beside a vehicle and driving, at phone, tablet and desktop sizes.
// Geometry only (compat renderer); physical-device play is still a separate check.
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import {qaBrowserPath} from './qa-browser.mjs';
const port=4391,artifacts='.codex/artifacts/hud-layout';
const sizes=process.env.HUD_SIZES?process.env.HUD_SIZES.split(',').map(v=>v.split('x').map(Number)):[[320,568],[360,640],[390,844],[430,932],[568,320],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1280,720],[1920,1080],[2560,1080]];
// Controls and readouts that must never overlap each other or cover the centre of the driving/aiming view.
const ids=['message','bottom-left','bottom-right','objectiveBox','gameRadio','radarWrap','pauseButton','touchMoreButton','vehicleButton','adsButton','jetButton','fireButton','reloadButton','joystickZone','sprintButton','crouchButton'];
const tappable=new Set(['pauseButton','touchMoreButton','vehicleButton','adsButton','jetButton','fireButton','reloadButton','joystickZone','sprintButton','crouchButton']);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
let browser,failures=0;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
  await mkdir(artifacts,{recursive:true});await wait(500);
  browser=await puppeteer.launch({executablePath:qaBrowserPath(),timeout:60000,args:['--no-sandbox','--mute-audio']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let signedIn=false;
  for(const [width,height] of sizes){
    const touch=width<=1024,size=`${width}x${height}`;
    await page.setViewport({width,height,isMobile:touch,hasTouch:touch,deviceScaleFactor:1});
    await page.goto(`http://127.0.0.1:${port}/?qa&renderer=compat`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__NEON_QA__&&!document.getElementById('accountGate').classList.contains('hidden')||document.getElementById('mainAccount')?.hidden===false,{timeout:60000});
    if(!signedIn){await page.type('#accountUsername',`hud_${Date.now().toString(36)}`);await page.type('#accountPassword','QA-test8');await page.click('#accountSubmit');signedIn=true;}
    await page.waitForFunction(()=>window.__NEON_QA__&&document.getElementById('accountGate').classList.contains('hidden'),{timeout:60000});
    await page.evaluate(()=>{document.getElementById('welcomeGate').classList.add('hidden');document.querySelector('[data-goto="screenDeploy"]').click();document.getElementById('deployButton').click();});
    await page.waitForFunction(()=>window.__NEON_QA__.snapshot().mode==='playing');
    const inspect=async label=>{
      await wait(350);
      const problems=await page.evaluate((ids,tappable)=>{
        const visible=ids.map(id=>[id,id.startsWith('bottom-')?document.querySelector(`#hud .${id}`):document.getElementById(id)]).filter(([,el])=>{if(!el||el.closest('[hidden]')||el.closest('.hidden'))return false;const cs=getComputedStyle(el),r=el.getBoundingClientRect();return r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden';}).map(([id,el])=>[id,el.getBoundingClientRect(),el]);
        const out=[],cx=[innerWidth*.3,innerWidth*.7],cy=[innerHeight*.3,innerHeight*.65];
        for(const [id,r,el] of visible){
          if(r.left<-1||r.top<-1||r.right>innerWidth+1||r.bottom>innerHeight+1)out.push(`${id} off-screen`);
          if(r.left<cx[1]&&r.right>cx[0]&&r.top<cy[1]&&r.bottom>cy[0])out.push(`${id} covers the centre view`);
          if(tappable.includes(id)&&matchMedia('(pointer:coarse)').matches){if(r.width<44||r.height<44)out.push(`${id} under 44px`);const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!el.contains(hit))out.push(`${id} obscured by ${hit?.id||hit?.className||hit?.tagName}`);}
        }
        for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){const [a,x]=visible[i],[b,y]=visible[j];if(x.left<y.right&&x.right>y.left&&x.top<y.bottom&&x.bottom>y.top)out.push(`${a}/${b} overlap`);}
        return out;
      },ids,[...tappable]);
      await page.screenshot({path:`${artifacts}/${size}-${label}.png`});
      if(problems.length){failures++;console.log(`FAIL ${size} ${label}: ${problems.join(', ')}`);}else console.log(`PASS ${size} ${label}`);
    };
    await inspect('on-foot');
    if(touch){
      // RUN / CROUCH: visible without opening More, and they toggle and clear each other.
      const stance=await page.evaluate(async()=>{
        const more=document.getElementById('touchExtras'),run=document.getElementById('sprintButton'),crouch=document.getElementById('crouchButton'),q=()=>window.__NEON_QA__.snapshot(),tick=()=>new Promise(r=>setTimeout(r,300)),press=el=>el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',isPrimary:false}));
        const ready=more.hidden&&!!run.offsetWidth&&!!crouch.offsetWidth;
        press(crouch);await tick();const crouched=q().crouch>0&&crouch.getAttribute('aria-pressed')==='true';
        press(run);await tick();const depth=q().crouch;await tick();const running=run.getAttribute('aria-pressed')==='true'&&crouch.getAttribute('aria-pressed')==='false'&&q().crouch<depth;
        press(run);await tick();const stopped=run.getAttribute('aria-pressed')==='false';
        return {ready,crouched,running,stopped};
      });
      if(Object.values(stance).every(Boolean))console.log(`PASS ${size} RUN/CROUCH visible and toggle without More`);else{failures++;console.log(`FAIL ${size} RUN/CROUCH ${JSON.stringify(stance)}`);}
    }
    await page.evaluate(()=>window.__NEON_QA__.besideVehicle(0));
    await page.waitForFunction(()=>!document.getElementById('vehicleButton').hidden);
    await inspect('beside-vehicle');
    if(touch)await page.evaluate(()=>document.getElementById('sprintButton').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch'})));
    await page.evaluate(()=>document.getElementById('vehicleButton').click());
    await page.waitForFunction(()=>window.__NEON_QA__.snapshot().carIndex===0);
    await inspect('driving');
    if(touch){const reset=await page.evaluate(()=>document.getElementById('sprintButton').getAttribute('aria-pressed')==='false');if(!reset){failures++;console.log(`FAIL ${size} RUN stays on after entering a vehicle`);}}
  }
  if(errors.length){failures++;console.log(`FAIL page errors: ${errors.join(' | ')}`);}
  console.log(failures?`HUD LAYOUT FAILED: ${failures} problem(s) · screenshots in ${artifacts}`:'HUD LAYOUT GREEN (geometry only; physical devices still required)');
}finally{
  await browser?.close().catch(()=>{});server.kill();
}
process.exit(failures?1:0);
