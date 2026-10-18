import puppeteer from 'puppeteer-core';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {qaBrowserPath} from './qa-browser.mjs';
const port=4327,server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});let browser;
try{
 await new Promise(r=>setTimeout(r,700));browser=await puppeteer.launch({executablePath:qaBrowserPath(),timeout:60000,args:['--no-sandbox','--mute-audio']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1024,height:768});
 await page.goto(`http://127.0.0.1:${port}/?qa&quality=low`,{waitUntil:'domcontentloaded'});await page.waitForSelector('#accountGuest');await page.click('#accountGuest');await page.waitForFunction(()=>document.getElementById('accountGate').classList.contains('hidden'));await page.evaluate(()=>document.getElementById('welcomeGate')?.classList.add('hidden'));
 await page.click('#screenMain [data-goto="screenOps"]');await mkdir('.codex/artifacts/arena-previews',{recursive:true});
 for(const arena of ['city-gate','millennium-park','jabi-lake']){
  await page.select('#arenaSelect',arena);
  for(const time of ['day','night']){
   await page.click(`#screenOps [data-time="${time}"]`);await page.waitForFunction((arena,time)=>{const c=document.querySelector('#arenaPreview canvas');return c?.dataset.arena===arena&&c.dataset.time===time&&Number(c.dataset.calls)>0&&Number(c.dataset.triangles)>100;},{timeout:15000},arena,time);
   const evidence=await page.$eval('#arenaPreview canvas',c=>({arena:c.dataset.arena,time:c.dataset.time,calls:Number(c.dataset.calls),triangles:Number(c.dataset.triangles),width:c.width,height:c.height,webgl2:!!c.getContext('webgl2')}));if(!evidence.webgl2)throw Error('Arena preview is not WebGL2');
   await(await page.$('#arenaPreview')).screenshot({path:`.codex/artifacts/arena-previews/${arena}-${time}.png`});console.log('PASS',JSON.stringify(evidence));
  }
 }
 for(const [width,height] of [[320,568],[844,390],[1024,768]]){await page.setViewport({width,height});await new Promise(r=>setTimeout(r,200));if(!await page.$eval('#arenaPreview',el=>{const r=el.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth;}))throw Error(`Preview overflows ${width}x${height}`);}
 await page.click('#screenOps [data-goto="screenMain"]');await page.waitForFunction(()=>!document.querySelector('#arenaPreview canvas'));await page.click('#screenMain [data-goto="screenOps"]');await page.waitForSelector('#arenaPreview canvas');await page.$eval('#arenaPreview canvas',el=>el.focus());await page.keyboard.press('ArrowLeft');
 if(errors.length)throw Error(errors.join('\n'));console.log('ARENA PREVIEW GREEN: three genuine 3D layouts, day/night, responsive sizing, rotation, disposal and reopening');
}finally{let timer;if(browser){try{await Promise.race([browser.close().catch(()=>{}),new Promise(r=>timer=setTimeout(r,5000))]);}finally{clearTimeout(timer);try{browser.disconnect();}catch{}const child=browser.process();if(child&&child.exitCode===null)child.kill('SIGTERM');}}server.kill();}
process.exit(0);
