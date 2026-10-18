// Campaign HUD obstruction check: on foot, beside a vehicle and driving, at phone, tablet and desktop sizes.
// Geometry only (compat renderer); physical-device play is still a separate check.
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import {qaBrowserPath} from './qa-browser.mjs';
const port=4391,artifacts='.codex/artifacts/hud-layout';
const sizes=process.env.HUD_SIZES?process.env.HUD_SIZES.split(',').map(v=>v.split('x').map(Number)):[[852,393],[320,568],[360,640],[390,844],[430,932],[568,320],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1280,720],[1920,1080],[2560,1080]];
// Controls and readouts that must never overlap each other or cover the centre of the driving/aiming view.
const ids=['message','bottom-left','bottom-right','objectiveBox','gameRadio','radarWrap','pauseButton','touchMoreButton','vehicleButton','adsButton','jetButton','fireButton','reloadButton','joystickZone','crouchButton'];
const tappable=new Set(['pauseButton','touchMoreButton','vehicleButton','adsButton','jetButton','fireButton','reloadButton','joystickZone','crouchButton','bottom-right']);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
let browser,failures=0;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
  await mkdir(artifacts,{recursive:true});await wait(500);
  browser=await puppeteer.launch({executablePath:qaBrowserPath(),timeout:60000,args:['--no-sandbox','--mute-audio']});
  const page=await browser.newPage(),errors=[];const cdp=await page.createCDPSession();page.on('pageerror',e=>errors.push(e.message));
  let signedIn=false;
  for(const [width,height] of sizes){
    const touch=width<=1024,size=`${width}x${height}`;
    await page.setViewport({width,height,isMobile:touch,hasTouch:touch,deviceScaleFactor:1});
    // Real iPhones reserve notch / home-indicator space; emulate it so fixed offsets cannot hide behind buttons.
    const phone=touch&&Math.min(width,height)<=440&&Math.max(width,height)>=800,insets=!phone?{top:0,left:0,right:0,bottom:0}:width>height?{top:0,left:59,right:59,bottom:21}:{top:59,left:0,right:0,bottom:34};
    await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets});
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
        for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){const [a,x]=visible[i],[b,y]=visible[j];if(innerHeight<=360&&[a,b].includes('message')&&[a,b].includes('objectiveBox'))continue;if(x.left<y.right&&x.right>y.left&&x.top<y.bottom&&x.bottom>y.top)out.push(`${a}/${b} overlap`);}
        return out;
      },ids,[...tappable]);
      await page.screenshot({path:`${artifacts}/${size}-${label}.png`});
      if(process.env.HUD_DEBUG)console.log(size,label,await page.evaluate(ids=>ids.map(id=>{const el=id.startsWith('bottom-')?document.querySelector(`#hud .${id}`):document.getElementById(id);if(!el||!el.offsetWidth)return null;const r=el.getBoundingClientRect();return `${id}:${Math.round(r.left)}-${Math.round(r.right)}x${Math.round(r.top)}-${Math.round(r.bottom)}`;}).filter(Boolean).join(' '),ids));
      if(problems.length){failures++;console.log(`FAIL ${size} ${label}: ${problems.join(', ')}`);}else console.log(`PASS ${size} ${label}`);
    };
    // Worst case readout: the longest unlocked gun name with the low-ammo warning showing.
    await page.evaluate(async()=>{const {WEAPONS}=await import('/data.js'),q=window.__NEON_QA__;let best=0,len=0;for(let i=0;i<WEAPONS.length;i++){q.equipWeapon(i);if(q.ammoState().weapon===WEAPONS[i].id&&WEAPONS[i].name.length>len){len=WEAPONS[i].name.length;best=i;}}q.equipWeapon(best);q.setAmmo(4,184);});
    await inspect('on-foot');
    if(touch){
      // One-thumb movement: pushing the stick fully forward runs; CROUCH and the gun switch live on the right.
      const stick=await page.$eval('#joystickZone',el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
      await page.touchscreen.touchStart(stick.x,stick.y);await page.touchscreen.touchMove(stick.x,stick.y-30);await wait(200);
      const walking=await page.evaluate(()=>!window.__NEON_QA__.touchInput().sprint&&!document.getElementById('sprintCue').classList.contains('on'));
      await page.touchscreen.touchMove(stick.x+4,stick.y-70);await wait(250);
      const running=await page.evaluate(()=>window.__NEON_QA__.touchInput().sprint&&document.getElementById('sprintCue').classList.contains('on'));
      const crouchTap=await page.evaluate(()=>{const c=document.getElementById('crouchButton');c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',isPrimary:false}));return document.getElementById('touchExtras').hidden&&c.getAttribute('aria-pressed')==='true';});
      await page.touchscreen.touchEnd();await wait(250);
      const released=await page.evaluate(()=>!window.__NEON_QA__.touchInput().sprint&&!document.getElementById('sprintCue').classList.contains('on'));
      const swap=await page.evaluate(async()=>{const q=window.__NEON_QA__,before=q.ammoState().weapon;document.querySelector('#hud .bottom-right').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch'}));await new Promise(r=>setTimeout(r,150));return q.ammoState().weapon!==before;});
      const stance={walking,running,crouchTap,released,swap};
      if(Object.values(stance).every(Boolean))console.log(`PASS ${size} stick-forward run, right-thumb CROUCH and tap-to-switch gun`);else{failures++;console.log(`FAIL ${size} one-thumb controls ${JSON.stringify(stance)}`);}
      await page.evaluate(()=>{const c=document.getElementById('crouchButton');if(c.getAttribute('aria-pressed')==='true')c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch'}));});
    }
    await page.evaluate(()=>window.__NEON_QA__.besideVehicle(0));
    await page.waitForFunction(()=>!document.getElementById('vehicleButton').hidden);
    await inspect('beside-vehicle');
    let stickHeld=false;if(touch){const stick=await page.$eval('#joystickZone',el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});await page.touchscreen.touchStart(stick.x,stick.y);await page.touchscreen.touchMove(stick.x,stick.y-70);stickHeld=true;await wait(150);}
    await page.evaluate(()=>document.getElementById('vehicleButton').click());
    await page.waitForFunction(()=>window.__NEON_QA__.snapshot().carIndex===0);
    await inspect('driving');
    if(stickHeld){const reset=await page.evaluate(()=>!window.__NEON_QA__.touchInput().sprint);await page.touchscreen.touchEnd();if(!reset){failures++;console.log(`FAIL ${size} running stays on after entering a vehicle`);}}
  }
  if(errors.length){failures++;console.log(`FAIL page errors: ${errors.join(' | ')}`);}
  console.log(failures?`HUD LAYOUT FAILED: ${failures} problem(s) · screenshots in ${artifacts}`:'HUD LAYOUT GREEN (geometry only; physical devices still required)');
}finally{
  await browser?.close().catch(()=>{});server.kill();
}
process.exit(failures?1:0);
