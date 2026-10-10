// Deterministic paused 3D scene comparison, NOT a hardware FPS benchmark.
import puppeteer from 'puppeteer-core';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await puppeteer.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--mute-audio','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
  const page=await browser.newPage();await page.setViewport({width:1280,height:720,deviceScaleFactor:1});
  await page.bringToFront();
  const cdp=await page.createCDPSession();await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await page.goto('http://127.0.0.1:4175/?qa&quality=low',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#accountGate:not(.hidden)');
  await page.type('#accountUsername',`render_${Date.now().toString(36)}`);await page.type('#accountPassword','QA-test8');await page.click('#accountSubmit');
  await page.waitForSelector('#accountGate.hidden',{timeout:60000});
  await page.evaluate(()=>{document.getElementById('welcomeGate').classList.add('hidden');document.querySelector('[data-goto="screenDeploy"]').click();document.getElementById('deployButton').click();window.__NEON_QA__.setInvulnerable();window.__NEON_QA__.teleport(12,36);});
  await page.waitForFunction(()=>document.body.classList.contains('three-ready')&&window.__NEON_RENDER_STATS__().calls>0);
  await new Promise(r=>setTimeout(r,3000));
  await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,disabled-by-default-devtools.timeline.frame',transferMode:'ReturnAsStream'});
  const gameplay=await page.evaluate(async()=>{
    const canvas=document.getElementById('threeGame'),gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info'),gpu=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    if(/SwiftShader|llvmpipe|software|softpipe/i.test(gpu))throw Error('Software renderer rejected for gameplay timing');
    const frameTimes=[],longTasks=[],draws=[],triangles=[],heapBefore=performance.memory?.usedJSHeapSize;
    const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration)));observer.observe({type:'longtask',buffered:false});
    const start=performance.now();let previous=start;
    while(performance.now()-start<15000){const now=await new Promise(requestAnimationFrame);frameTimes.push(now-previous);previous=now;const stats=window.__NEON_RENDER_STATS__();draws.push(stats.calls);triangles.push(stats.triangles);}
    observer.disconnect();const sorted=frameTimes.slice().sort((a,b)=>a-b),percentile=p=>sorted[Math.floor((sorted.length-1)*p)];
    return {gpu,webgl:gl.getParameter(gl.VERSION),visibility:document.visibilityState,durationMs:performance.now()-start,mode:window.__NEON_QA__.snapshot().mode,cpuThrottle:1,networkThrottle:'none',frames:frameTimes.length,medianFPS:1000/percentile(.5),medianFrameMs:percentile(.5),p95FrameMs:percentile(.95),maxFrameMs:sorted.at(-1),longTasks:longTasks.length,longTaskMs:longTasks.reduce((a,b)=>a+b,0),heapMovementBytes:performance.memory?performance.memory.usedJSHeapSize-heapBefore:null,drawCalls:[Math.min(...draws),Math.max(...draws)],triangles:[Math.min(...triangles),Math.max(...triangles)]};
  });
  const traceComplete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');
  const {stream}=await traceComplete;let trace='';while(true){const chunk=await cdp.send('IO.read',{handle:stream});trace+=chunk.data;if(chunk.eof)break;}await cdp.send('IO.close',{handle:stream});
  await mkdir('.codex/artifacts',{recursive:true});await writeFile('.codex/artifacts/render-cost-trace.json',trace);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__NEON_QA__.snapshot().mode==='paused');
  await new Promise(r=>setTimeout(r,1500));
  const result=await page.evaluate(async()=>{
    const samples=[];for(let i=0;i<20;i++){await new Promise(requestAnimationFrame);samples.push(window.__NEON_RENDER_STATS__());}
    const canvas=document.getElementById('threeGame'),gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
    const cells=window.__NEON_QA__.worldSnapshot().cells;
    return {kind:'paused-scene-render-cost-not-FPS',viewport:[innerWidth,innerHeight],drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],dpr:devicePixelRatio,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),quality:window.__NEON_FX__.quality(),mode:window.__NEON_QA__.snapshot().mode,opaqueCells:cells.flat().filter(t=>t&&t!==4).length,stats:samples[10],calls:[Math.min(...samples.map(s=>s.calls)),Math.max(...samples.map(s=>s.calls))],triangles:[Math.min(...samples.map(s=>s.triangles)),Math.max(...samples.map(s=>s.triangles))]};
  });
  result.gameplay=gameplay;
  if(result.stats.calls<=0||result.stats.triangles<=0)throw Error('No genuine WebGL geometry');
  await mkdir('.codex/artifacts',{recursive:true});
  const label=process.env.RENDER_COST_LABEL==='before'?'before':'after';
  await writeFile(`.codex/artifacts/render-cost-${label}.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
