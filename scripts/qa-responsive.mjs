// Geometry/layout regression only; compatibility rendering is NOT FPS evidence.
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import {qaBrowserPath} from './qa-browser.mjs';
const port=4323,artifacts='.codex/artifacts/responsive';
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
let browser;
try{
  await mkdir(artifacts,{recursive:true});await new Promise(r=>setTimeout(r,500));
  browser=await puppeteer.launch({executablePath:qaBrowserPath(),timeout:60000,args:['--no-sandbox','--mute-audio']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.goto(`http://127.0.0.1:${port}/?qa&renderer=compat`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#accountGate:not(.hidden)');
  await page.type('#accountUsername',`layout_${Date.now().toString(36)}`);await page.type('#accountPassword','QA-test8');await page.click('#accountSubmit');
  await page.waitForSelector('#accountGate.hidden',{timeout:60000});
  await page.evaluate(()=>document.getElementById('welcomeGate').classList.add('hidden'));
  const sizes=[[320,568],[360,640],[390,844],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[1920,1080],[2560,1080]];
  for(const [width,height] of sizes){
    const touch=width<=1024;await page.setViewport({width,height,isMobile:touch,hasTouch:touch,deviceScaleFactor:1});
    // Changing mobile emulation can reload the document; await returning identity.
    await page.waitForFunction(()=>Boolean(window.__NEON_QA__)&&document.getElementById('accountGate').classList.contains('hidden'),{timeout:60000});
    await page.evaluate(()=>document.getElementById('welcomeGate').classList.add('hidden'));
    await page.evaluate(()=>{document.getElementById('menuRoot').scrollTop=0;document.querySelector('[data-goto="screenMain"]').click();});
    for(const screen of ['screenMain','screenDeploy','screenSettings','screenRanks']){
      await page.evaluate(id=>document.querySelector(`[data-goto="${id}"]`).click(),screen);
      if(screen==='screenSettings')await page.evaluate(()=>document.getElementById('interfaceSettings').open=true);
      const failures=await page.evaluate(()=>{
        const root=document.getElementById('menuRoot'),panel=document.querySelector('.menu-screen.active .menu-panel'),rect=panel.getBoundingClientRect();
        return {horizontal:root.scrollWidth>innerWidth+1||rect.left< -1||rect.right>innerWidth+1,scrollable:root.scrollHeight>=root.clientHeight,width:innerWidth,scrollWidth:root.scrollWidth,left:rect.left,right:rect.right};
      });
      if(failures.horizontal||!failures.scrollable){await page.screenshot({path:`${artifacts}/${width}x${height}-${screen}-failure.png`});throw Error(`${width}x${height} ${screen}: ${JSON.stringify(failures)}`);}
      if(screen==='screenMain'){
        const account=await page.evaluate(()=>{const row=document.getElementById('mainAccount'),label=document.getElementById('mainAccountName').getBoundingClientRect(),button=document.getElementById('mainLogout').getBoundingClientRect();return {hidden:row.hidden,labelWidth:label.width,labelHeight:label.height,buttonWidth:button.width,buttonHeight:button.height,overlap:label.left<button.right&&label.right>button.left&&label.top<button.bottom&&label.bottom>button.top};});
        if(account.hidden||account.labelWidth<140||account.labelHeight>65||account.buttonWidth>160||account.buttonWidth<44||account.buttonHeight<44||account.overlap)throw Error(`${width}x${height} account/logout layout: ${JSON.stringify(account)}`);
        await page.screenshot({path:`${artifacts}/${width}x${height}-account-menu.png`});
      }
    }
    await page.evaluate(()=>document.querySelector('[data-goto="screenDeploy"]').click());await page.screenshot({path:`${artifacts}/${width}x${height}-briefing.png`});
    await page.evaluate(()=>document.getElementById('deployButton').click());
    await page.waitForFunction(()=>window.__NEON_QA__.snapshot().mode==='playing');
    const failures=await page.evaluate(()=>{
      const touch=matchMedia('(pointer:coarse)').matches;
      const ids=touch?['joystickZone','fireButton','adsButton','reloadButton','jetButton','pauseButton','touchMoreButton']:['objectiveBox'];
      const failures=ids.filter(id=>{const el=document.getElementById(id),r=el.getBoundingClientRect();return r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1||r.width<44||r.height<44||(touch&&!el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)));});
      for(const id of ['objectiveBox','healthValue','combatStatus','weaponName']){const el=document.getElementById(id),r=el.getBoundingClientRect();if(!r.width||!r.height||r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1)failures.push(id);}
      if(touch){const rects=ids.map(id=>[id,document.getElementById(id).getBoundingClientRect()]);for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const [a,x]=rects[i],[b,y]=rects[j];if(x.left<y.right&&x.right>y.left&&x.top<y.bottom&&x.bottom>y.top)failures.push(`${a}/${b} overlap`);}}
      return failures;
    });
    if(failures.length){await page.screenshot({path:`${artifacts}/${width}x${height}-gameplay-failure.png`});const hits=await page.evaluate(ids=>ids.filter(id=>!id.includes('/')).map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id};}),failures);throw Error(`${width}x${height} gameplay: ${failures.join(',')} ${JSON.stringify(hits)}`);}
    await page.screenshot({path:`${artifacts}/${width}x${height}-gameplay.png`});
    if(touch)await page.evaluate(()=>document.getElementById('pauseButton').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));
    else await page.keyboard.press('Escape');
    await page.waitForFunction(()=>window.__NEON_QA__.snapshot().mode==='paused');
    await page.evaluate(()=>document.getElementById('pausedMission').open=true);
    const pauseLayout=await page.evaluate(()=>{const r=document.querySelector('#modalScreen .modal').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,tacticLength:document.getElementById('pausedTactic').textContent.length};});
    if(pauseLayout.left<0||pauseLayout.right>width+1||pauseLayout.top<0||pauseLayout.bottom>height+1||pauseLayout.tacticLength<40){await page.screenshot({path:`${artifacts}/${width}x${height}-pause-failure.png`});throw Error(`${width}x${height} pause tactical plan does not fit: ${JSON.stringify(pauseLayout)}`);}
    await page.evaluate(()=>document.getElementById('quitButton').click());
    console.log(`PASS ${width}x${height}: menus, gameplay controls, scrolling`);
  }
  if(errors.length)throw Error(errors.join('\n'));console.log('RESPONSIVE GREEN (layout only; physical-device coverage still required)');
}finally{
  let timer;
  if(browser){try{await Promise.race([browser.close().catch(()=>{}),new Promise(resolve=>timer=setTimeout(resolve,5000))]);}finally{clearTimeout(timer);try{browser.disconnect();}catch{}const child=browser.process();if(child&&child.exitCode===null)child.kill('SIGTERM');}}
  server.kill();
}
process.exit(0);
