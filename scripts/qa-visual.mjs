// Local rendering evidence; --baseline captures the previous renderer without new assertions.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import {qaBrowserPath} from './qa-browser.mjs';
const baseline=process.argv.includes('--baseline'),lowOnly=process.argv.includes('--low-only'),mobile=process.argv.includes('--mobile'),label=baseline?'before':mobile?'mobile':lowOnly?'low-after':'after',port=4326,folder=`.codex/artifacts/phase2/${label}`;
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
let browser;
const results=[];
try{
 await mkdir(folder,{recursive:true});await new Promise(r=>setTimeout(r,700));
 browser=await puppeteer.launch({executablePath:qaBrowserPath(),timeout:60000,args:['--no-sandbox','--mute-audio','--enable-unsafe-swiftshader']});
 const page=await browser.newPage(),errors=[],failed=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>failed.push(r.url()));
 await page.setViewport(mobile?{width:844,height:390,deviceScaleFactor:1,isMobile:true,hasTouch:true}:{width:1280,height:720,deviceScaleFactor:1});
 await page.goto(`http://127.0.0.1:${port}/?qa&quality=${baseline||lowOnly||mobile?'low':'auto'}`,{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#accountGate:not(.hidden)');await page.click('#accountGuest');
 await page.evaluate(()=>document.getElementById('welcomeGate').classList.add('hidden'));
 await page.evaluate(()=>document.getElementById('deployButton').click());
 await page.waitForFunction(()=>document.body.classList.contains('three-ready')&&window.__NEON_RENDER_STATS__?.().calls>0);
 await page.evaluate(()=>{window.__NEON_QA__.setInvulnerable(true);window.__NEON_QA__.teleport(12,34);const p=window.__NEON_3D__.frame().player;p.dir=-Math.PI/2;p.pitch=55;});
 const gpu=await page.evaluate(()=>{const gl=document.getElementById('threeGame').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return {version:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),dpr:devicePixelRatio};});
 for(const quality of (baseline||lowOnly||mobile?[0]:[0,1,2]))for(const mode of ['day','night','nvg']){
  await page.evaluate((q,mode)=>{window.__NEON_FX__.force(q);document.getElementById('campaignTime').value=mode==='day'?'day':'night';document.getElementById('campaignTime').dispatchEvent(new Event('change'));const want=mode==='nvg';if(window.__NEON_3D__.frame().nightVision!==want)document.getElementById('nightVisionButton').click();},quality,mode);
  await new Promise(r=>setTimeout(r,mobile?4000:1600));
  const sample=await page.evaluate(async duration=>{const times=[];let last;await new Promise(resolve=>{const end=performance.now()+duration;function tick(t){if(last)times.push(t-last);last=t;if(t<end)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});times.sort((a,b)=>a-b);const median=times[Math.floor(times.length*.5)],p95=times[Math.floor(times.length*.95)];const canvas=document.getElementById('threeGame');return {medianMs:median,p95Ms:p95,medianFPS:1000/median,frames:times.length,width:canvas.width,height:canvas.height,render:window.__NEON_RENDER_STATS__(),visual:window.__NEON_VISUAL__?.()||null};},mobile?6000:3000);
  if(!sample.render.calls||!sample.render.triangles)throw Error('No active WebGL world');
  if(!baseline){const v=sample.visual;if(!v?.sky||v.palette!==(mode==='nvg'?'nvg':mode))throw Error(`Sky palette incorrect: ${JSON.stringify(v)}`);if(v.worldCalls<=0||v.worldTriangles<=2)throw Error('Post-processing hid missing world submissions');if(quality===0){if(v.realShadows||v.environment||!v.contactShadows||v.contactCount<1)throw Error('Low quality cost gates incorrect');}else if(!v.realShadows||!v.environment||v.contactShadows)throw Error('Higher quality lighting gates incorrect');if(v.environmentMaps>3)throw Error('Environment cache is unbounded');}
  await page.screenshot({path:`${folder}/${mode}-q${quality}.png`});results.push({quality,mode,...gpu,...sample});await writeFile(`${folder}/measurements.json`,JSON.stringify(results,null,2));console.log(`PASS ${label} ${mode} q${quality}: ${sample.medianFPS.toFixed(1)} FPS, ${sample.visual?.worldCalls??sample.render.calls} world calls`);
  if(!baseline&&sample.visual.culling!==(quality===0))throw Error('Visibility budget did not follow active quality');
 }
 if(!baseline&&!lowOnly&&!mobile){
  await page.evaluate(()=>window.__NEON_FX__.force(1));await new Promise(r=>setTimeout(r,600));
  const start=await page.evaluate(()=>window.__NEON_VISUAL__());
  await page.evaluate(()=>window.__NEON_QA__.teleport(36,36));await new Promise(r=>setTimeout(r,700));
  const moved=await page.evaluate(()=>window.__NEON_VISUAL__());
  if(moved.shadowUpdates<=start.shadowUpdates||Math.hypot(moved.shadowTarget[0]-36,moved.shadowTarget[2]-36)>.2)throw Error('Sun shadow did not follow player to far district');
  const expectedMaps=moved.environmentMaps;for(let i=0;i<6;i++){await page.evaluate(()=>document.getElementById('nightVisionButton').click());await new Promise(r=>setTimeout(r,80));}
  if((await page.evaluate(()=>window.__NEON_VISUAL__().environmentMaps))!==expectedMaps)throw Error('Environment cache grows while toggling NVG');
  await page.evaluate(()=>{
   if(window.__NEON_3D__.frame().nightVision)document.getElementById('nightVisionButton').click();
   const f=window.__NEON_3D__.frame(),enemy=f.enemies.find(e=>!e.dead),world=window.__NEON_3D__.world;
   if(!enemy)throw Error('No live enemy for readability capture');
   for(let i=0;i<8;i++){const angle=i*Math.PI/4,x=enemy.x+Math.cos(angle)*3,y=enemy.y+Math.sin(angle)*3;
    if(world.map[Math.floor(y)]?.[Math.floor(x)]===0){window.__NEON_QA__.teleport(x,y);f.player.dir=Math.atan2(enemy.y-y,enemy.x-x);f.player.pitch=0;break;}}
  });
  await new Promise(r=>setTimeout(r,500));await page.screenshot({path:`${folder}/enemy-night-q1.png`});
 }
 if(errors.length||failed.length)throw Error(JSON.stringify({errors,failed}));
 await writeFile(`${folder}/measurements.json`,JSON.stringify(results,null,2));console.log('VISUAL QA GREEN (local functional samples; software-renderer samples are not hardware FPS evidence)');
}finally{
 let timer;
 if(browser){try{await Promise.race([browser.close().catch(()=>{}),new Promise(resolve=>timer=setTimeout(resolve,5000))]);}finally{clearTimeout(timer);try{browser.disconnect();}catch{}const child=browser.process();if(child&&child.exitCode===null)child.kill('SIGTERM');}}
 server.kill();
}
process.exit(0);
