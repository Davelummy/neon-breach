import * as THREE from '/vendor/three.module.min.js';
import {ARENAS,WALL_HEIGHTS} from './data.js';
import {movePlayer} from './multiplayer-movement.js';
import {nearbyVehicle} from './multiplayer-vehicles.js';
import {vehicleBounds} from './data.js';
import {createVehicleFactory,animateVehicle} from './vehicle-presentation.js';
import {createCombatModels,createArenaLandmark,createDistrictSkyline,populateDistrictRoads} from './combat-presentation.js';
import {releasePrivateModel} from './render-utils.js';
import {movementKey,normalizeRoomCode,combatActionHint,drawCombatRadar,selectConnectedGamepad} from './combat-interface.js';
const $=id=>document.getElementById(id);
let touchMode=matchMedia('(any-pointer:coarse)').matches||navigator.maxTouchPoints>0;
function setTouchMode(value){touchMode=value;document.body.classList.toggle('touch-mode',value);$('controls').textContent=value?'Touch controls on':'Touch controls off';}
let socket,selfId,world,state,renderer,camera,scene,worldRoot,actorRoot,seq=0,angle=0,pitch=0,joined=false,latest=0,oldRound=0;
let predicted=null,pending=[],scoreSignature='';
let controllerIndex,optionsHeld=false,hemiLight,sunLight,lastDrivenVehicle=null;
let audio=null,muted=false,muzzleUntil=0,disposed=false,connectionDeadline,hitTimeout,damageTimeout;
let transport=null,connecting=false;
function unlockAudio(){try{audio||=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch{muted=true;}}
function shotAudio(event){if(!audio||muted||audio.state!=='running')return;const me=state?.players.find(p=>p.id===selfId),distance=me?Math.hypot(me.x-event.x,me.y-event.y):20,osc=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;osc.type='sawtooth';osc.frequency.setValueAtTime(150,now);osc.frequency.exponentialRampToValueAtTime(45,now+.07);gain.gain.setValueAtTime(.045/(1+distance*.15),now);gain.gain.exponentialRampToValueAtTime(.001,now+.07);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(now+.08);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
const actors=new Map(),vehicleModels=new Map(),keys=new Set(),touch={forward:0,strafe:0,fire:false,reload:false,jump:false,aim:false,sprint:false,interact:false};
const smoothingVector=new THREE.Vector3();
const mat=(color,roughness=.7,metalness=.15)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const mesh=(geometry,material)=>new THREE.Mesh(geometry,material);
const darkMetal=mat(0x11191d,.48,.72),blackMetal=mat(0x05080a,.38,.82),bodyTextures={},weaponTextures={};
const ownedTextures=new Set(),textureConsumers=new Map(),loader=new THREE.TextureLoader();
function bodyMat(key,color,roughness=.72,metalness=.18){const material=mat(color,roughness,metalness);if(bodyTextures[key])material.map=bodyTextures[key];else if(key!=='none'){if(!textureConsumers.has(key))textureConsumers.set(key,new Set());textureConsumers.get(key).add(material);material.addEventListener('dispose',()=>textureConsumers.get(key)?.delete(material));}return material;}
for(const [key,path,bucket] of [['trooper','trooper.webp',bodyTextures],['wall','facility-wall.webp',bodyTextures],['rifle','fp-rifle.webp',weaponTextures]])loader.load(`/assets/${path}`,texture=>{if(disposed){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;if(key==='wall'){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1.4,1.4);}ownedTextures.add(texture);bucket[key]=texture;for(const material of textureConsumers.get(key)||[]){material.map=texture;material.needsUpdate=true;}textureConsumers.delete(key);},undefined,()=>status('Some visual assets could not load. Reload to retry.'));
const protectedMaterials=new Set([darkMetal,blackMetal]);
const models=createCombatModels({THREE,mat,mesh,darkMetal,blackMetal,bodyMat,weaponTextures,enemyTypes:{specter:{body:'trooper',color:'#31f5db'}}});
const createCar=createVehicleFactory({THREE,mat,mesh,darkMetal,blackMetal,cheapGlass:true});
function activePad(){const pad=selectConnectedGamepad(navigator.getGamepads?.()||[],controllerIndex);controllerIndex=pad?.index;return pad;}
const input=()=>{const pad=activePad(),axis=n=>Math.abs(pad?.axes[n]||0)>.15?pad.axes[n]:0;
  const options=!!pad?.buttons[9]?.pressed;if(options&&!optionsHeld){$('board').open=!$('board').open;}optionsHeld=options;
  if($('board').open)return {type:'input',seq:seq++,forward:0,strafe:0,angle,pitch,fire:false,reload:false,jump:false,aim:false,sprint:false,interact:false};
  if(pad){angle+=axis(2)*2.65*.05;pitch=Math.max(-.65,Math.min(.65,pitch-axis(3)*1.4*.05));}
  angle=Math.atan2(Math.sin(angle),Math.cos(angle));
  return {type:'input',seq:seq++,forward:Math.max(-1,Math.min(1,(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)+touch.forward-axis(1))),strafe:Math.max(-1,Math.min(1,(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+touch.strafe+axis(0))),angle,pitch,fire:keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.fire||!!pad?.buttons[7]?.pressed,reload:keys.has('KeyR')||touch.reload||!!pad?.buttons[2]?.pressed,jump:keys.has('Space')||touch.jump||!!pad?.buttons[0]?.pressed,aim:touch.aim||!!pad?.buttons[6]?.pressed,sprint:keys.has('KeyQ')||touch.sprint||!!pad?.buttons[10]?.pressed,interact:keys.has('KeyE')||touch.interact||!!pad?.buttons[3]?.pressed};};
function resetInput(){keys.clear();touch.forward=touch.strafe=0;touch.fire=touch.reload=touch.jump=touch.aim=touch.sprint=touch.interact=false;$('aim')?.setAttribute('aria-pressed','false');$('sprint')?.setAttribute('aria-pressed','false');const knob=$('knob');if(knob)knob.style.transform='';}
function status(text){const el=$('status');if(el&&!disposed)el.textContent=text;}
function buildWorld(value){
  world=value;oldRound=state?.round||1;
  predicted=null;pending=[];
  if(!renderer){
    try{renderer=new THREE.WebGLRenderer({canvas:$('view'),antialias:false,powerPreference:'high-performance'});}catch{throw Error('WebGL2 could not start. Enable hardware acceleration or use a supported browser.');}
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.05,65);camera.rotation.order='YXZ';scene.add(camera);
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
    hemiLight=new THREE.HemisphereLight(0xe8f6ff,0x2a3838,1.85);sunLight=new THREE.DirectionalLight(0xfff0d0,3.4);sunLight.position.set(8,18,4);scene.add(hemiLight,sunLight,new THREE.AmbientLight(0x607880,.35));
    actorRoot=new THREE.Group();scene.add(actorRoot);
    const gun=models.createWeaponModel('rifle',0x31f5db);gun.position.set(.19,-.2,-.45);gun.scale.setScalar(.85);camera.add(gun);camera.userData.gun=gun;resize();renderer.setAnimationLoop(draw);
    const flash=new THREE.Mesh(new THREE.OctahedronGeometry(.075,0),new THREE.MeshBasicMaterial({color:0xffe0a0}));flash.position.set(0,.015,gun.userData.muzzleZ);flash.visible=false;gun.add(flash);camera.userData.flash=flash;
  }
  if(worldRoot){worldRoot.traverse(o=>{if(o.isMesh){for(const material of [o.material].flat())if(material.map&&!ownedTextures.has(material.map))material.map.dispose();}});releasePrivateModel(worldRoot,protectedMaterials);scene.remove(worldRoot);}
  worldRoot=new THREE.Group();vehicleModels.clear();scene.add(worldRoot);const arena=ARENAS.find(a=>a.id===value.arena),night=value.timeOfDay==='night';scene.background=new THREE.Color(night?0x0b1725:0x9bb7bd);scene.fog=new THREE.FogExp2(night?0x112034:0x819da3,.019);hemiLight.color.set(night?0x819bd8:0xe8f6ff);hemiLight.intensity=night?1.15:1.85;sunLight.color.set(night?0x9dbbff:0xfff0d0);sunLight.intensity=night?1.15:3.4;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(48,48),new THREE.MeshStandardMaterial({color:arena.ground,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(24,-.01,24);worldRoot.add(ground);
  const groups=new Map(),dummy=new THREE.Object3D();for(let y=0;y<48;y++)for(let x=0;x<48;x++){const type=value.map[y][x];if(!type)continue;const height=(x===0||y===0||x===47||y===47)?2.55:WALL_HEIGHTS[type],key=`${type}:${height}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push([x+.5,height/2,y+.5,height,type]);}
  for(const cells of groups.values()){const [, , ,height,type]=cells[0],material=bodyMat(type<=3?'wall':'none',({1:0xb4afa0,2:0x8e9693,3:0xb79b7b,4:0xb7cad0,5:0xc7c4b7,6:0x386943,7:0x376e86,8:0x9a7b52})[type],.92,.02);if(type===4){material.transparent=true;material.opacity=.48;}const object=new THREE.InstancedMesh(new THREE.BoxGeometry(.98,height,.98),material,cells.length);cells.forEach(([x,y,z],i)=>{dummy.position.set(x,y,z);dummy.updateMatrix();object.setMatrixAt(i,dummy.matrix);});object.instanceMatrix.needsUpdate=true;object.computeBoundingSphere();worldRoot.add(object);}
  const wallMaterials={5:mat(0xc7c4b7,.85,.1),6:mat(0x386943,.95,0),7:mat(0x376e86,.3,.1),8:mat(0x9a7b52,.85,.1)};
  for(const c of value.covers){const object=mesh(new THREE.BoxGeometry(c.w,c.height,c.d),mat(c.kind==='planter'?0x386943:c.kind==='bench'?0x9a7b52:0x28363a));object.position.set(c.x,c.height/2,c.y);worldRoot.add(object);}
  worldRoot.add(createArenaLandmark(arena,{THREE,mat,mesh,wallMaterials,darkMetal}));
  worldRoot.add(createDistrictSkyline({THREE,mat,mesh}));
  const roadTiles=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.012,1),mat(0xffffff,.96,0),2304),roadLines=new THREE.InstancedMesh(new THREE.BoxGeometry(.07,.012,.65),mat(0xe6ddbc,.95,0),400);
  populateDistrictRoads({THREE,map:value.map,roadTiles,roadLines});worldRoot.add(roadTiles,roadLines);
  for(const car of value.vehicles||[]){const object=createCar(car.color,car.kind);object.position.set(car.x,0,car.y);object.rotation.y=-car.dir;vehicleModels.set(car.id,object);worldRoot.add(object);}
}
function resize(){if(!renderer)return;renderer.setPixelRatio(Math.min(devicePixelRatio||1,.8,Math.sqrt(500000/(innerWidth*innerHeight))));renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();resetInput();}
function actor(player){let object=actors.get(player.id);if(!object){object=models.createHuman('specter',parseInt(player.id.slice(0,2),16)%3);object.userData.pose={x:player.x,hp:player.hp,maxHp:100,vx:0,vy:0,grounded:true,combatState:'hold',reloadTimer:0,muzzleFlash:0};object.userData.lastX=player.x;object.userData.lastY=player.y;object.position.set(player.x,player.z,player.y);actors.set(player.id,object);actorRoot.add(object);}return object;}
let previous=performance.now(),frames=0;
function draw(now){const dt=Math.min(.05,(now-previous)/1000||.016);previous=now;if(!state||!joined)return;frames++;
  const me=state.players.find(p=>p.id===selfId);if(!me)return;
  const local=predicted||me;
  const car=state.vehicles?.find(c=>c.id===me.carId),driving=!!car;
  camera.userData.gun.visible=!driving;camera.userData.flash.visible=!driving&&performance.now()<muzzleUntil;
  if(driving){const bounds=vehicleBounds(car),distance=bounds.halfLength+2;camera.position.lerp(smoothingVector.set(car.x-Math.cos(car.dir)*distance,bounds.height+1.2,car.y-Math.sin(car.dir)*distance),1-Math.exp(-12*dt));camera.rotation.set(-.2,-car.dir-Math.PI/2,0);}
  else{camera.position.lerp(smoothingVector.set(local.x,local.z+1.45,local.y),1-Math.exp(-25*dt));camera.rotation.set(pitch,-angle-Math.PI/2,0);}
  const aim=!driving&&(touch.aim||activePad()?.buttons[6]?.pressed),fov=aim?45:65;if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
  const gun=camera.userData.gun,shot=now<muzzleUntil,reload=me.reload>0;
  gun.position.set(aim?.025:.19,-.2+(aim?.04:0),-.45+(shot?.025:0));gun.rotation.z=reload?Math.sin(Math.min(1,me.reload/1.6)*Math.PI)*-.3:0;
  for(const p of state.players){if(p.id===selfId)continue;const object=actor(p);object.visible=p.hp>0&&!p.carId;const pose=object.userData.pose;pose.vx=p.moveVx||0;pose.vy=p.moveVy||0;pose.x=p.x;pose.hp=p.hp;pose.grounded=p.z<.05;pose.reloadTimer=p.reload;pose.muzzleFlash=(object.userData.shotUntil||0)>now?.2:0;object.position.lerp(smoothingVector.set(p.x,p.z,p.y),1-Math.exp(-15*dt));object.rotation.y=-p.angle-Math.PI/2;if(object.visible)models.animateHuman(object,pose,now/1000);}
  for(const vehicle of state.vehicles||[]){const object=vehicleModels.get(vehicle.id);if(!object)continue;object.position.lerp(smoothingVector.set(vehicle.x,vehicle.destroyed?-.12:0,vehicle.y),1-Math.exp(-15*dt));object.rotation.y=-vehicle.dir;object.rotation.z=vehicle.destroyed?.18:0;animateVehicle(object,vehicle,dt);}
  for(const [id,object] of actors)if(!state.players.some(p=>p.id===id)){releasePrivateModel(object,protectedMaterials);actorRoot.remove(object);actors.delete(id);}
  renderer.render(scene,camera);
  if(now-latest>2500){$('notice').hidden=false;$('notice').textContent='Connection interrupted · movement stopped';resetInput();}
}
function updateHUD(){if(!state)return;const me=state.players.find(p=>p.id===selfId);if(!me)return;
  if(lastDrivenVehicle!==me.carId){lastDrivenVehicle=me.carId;touch.aim=false;$('aim').setAttribute('aria-pressed','false');}
  const radar=$('matchRadar'),contacts=String(drawCombatRadar(radar.getContext('2d'),world.map,me,state.players));if(radar.dataset.enemies!==contacts)radar.dataset.enemies=contacts;
  $('roundInfo').textContent=`${ARENAS.find(a=>a.id===state.arena)?.name} · ${state.timeOfDay==='night'?'Night':'Day'} · Round ${state.round} · ${Math.ceil(state.remaining)}s · ${state.players.length}/8 · ${socket.roomCode}`;
  $('vitalsText').textContent=`${me.hp} HEALTH · ${me.ammo}/30 AMMO${me.reload?' · RELOADING':''} · ${Math.ceil(me.jetFuel??100)}% JET`;
  $('combatScore').textContent=`${me.kills} ELIMINATIONS · ${me.deaths} DEATHS`;
  const hint=combatActionHint(me,{touch:touchMode,controller:!!navigator.getGamepads?.()[0]});if($('combatHint').textContent!==hint)$('combatHint').textContent=hint;
  $('healthFill').style.width=`${me.hp}%`;$('jetFill').style.width=`${me.jetFuel??100}%`;
  $('matchObjective').textContent=state.waiting?'Test your gear · invite a friend to start':'Eliminate opponents · automatic respawn';
  $('notice').hidden=!state.waiting&&me.hp>0&&!me.protected;
  $('notice').textContent=me.hp<=0?`Eliminated · respawning in ${Math.ceil(me.respawn)}s`:state.waiting?'Room ready · move, fly and test your rifle. Invite a second player to start.':me.protected?'Spawn protection · ends when you fire':'';
  const scores=JSON.stringify(state.players.map(p=>[p.id,p.name,p.kills,p.deaths]));if(scores!==scoreSignature){scoreSignature=scores;$('scores').replaceChildren(...state.players.slice().sort((a,b)=>b.kills-a.kills).map(p=>{const el=document.createElement('p');el.textContent=`${p.name}: ${p.kills} kills · ${p.deaths} deaths`;return el;}));}
  const car=state.vehicles?.find(c=>c.id===me.carId),near=car||nearbyVehicle(world,me);$('vehicleUse').hidden=!near||me.hp<=0;$('vehicleUse').textContent=car?`Exit ${car.name}`:near?`Enter ${near.name}`:'Enter vehicle';document.body.classList.toggle('driving',!!car);$('aim').textContent=car?'Brake':'Aim';$('aim').setAttribute('aria-label',car?'Toggle vehicle brake':'Toggle aim');if(car)$('combatHint').textContent=`${Math.round(Math.abs(car.speed)*3.6)} km/h · ${Math.ceil(car.hp/car.maxHp*100)}% hull · ${car.braking?'BRAKING':car.speed<-.1?'REVERSE':'DRIVE'} · L2 / Brake to stop`;
  for(const event of state.events){if(event.kind==='vehicle'&&event.id===selfId)$('feed').textContent=event.message;if(event.kind==='hit'&&event.id===selfId){$('feed').textContent=`Hit confirmed · ${event.damage} damage`;$('reticle').classList.add('hit');clearTimeout(hitTimeout);hitTimeout=setTimeout(()=>$('reticle')?.classList.remove('hit'),180);}if(event.kind==='hit'&&event.target===selfId){document.body.classList.add('taking-damage');clearTimeout(damageTimeout);damageTimeout=setTimeout(()=>document.body.classList.remove('taking-damage'),240);}if(event.kind==='shot'){const object=actors.get(event.id);if(object)object.userData.shotUntil=performance.now()+100;}if(event.kind==='kill')$('feed').textContent=`${event.killer} eliminated ${event.victim}`;if(event.kind==='round')$('feed').textContent=`Next arena · previous winner: ${state.results[0]?.name||'draw'}`;}
}
async function readJson(response){if(!response.headers.get('content-type')?.includes('application/json'))throw Error('The server returned an invalid response. Please try again.');const body=await response.json();if(!response.ok)throw Error(body.error||'Multiplayer is temporarily unavailable.');return body;}
async function connect(action){if(connecting||(socket&&socket.readyState<=1)||!transport)return;connecting=true;status('Connecting…');$('create').disabled=$('join').disabled=true;
  try{
    if(transport.transport==='ticket-websocket'){
      status('Waking multiplayer server… First connection can take about a minute.');
      const endpoint=new URL(transport.socketUrl);
      if(endpoint.protocol!=='wss:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/api/multiplayer/socket')throw Error('The online server configuration is invalid.');
      const health=new URL('/health',endpoint.href.replace('wss:','https:'));
      const ready=await readJson(await fetch(health,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(75000)}));
      if(ready.service!=='neon-breach-match'||!ready.ready)throw Error('The multiplayer server is still warming up. Please try again shortly.');
      if(disposed)return;
      const result=await readJson(await fetch('/api/multiplayer/ticket',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)}));
      if(typeof result.ticket!=='string'||result.ticket.length>1024)throw Error('Could not authorize the multiplayer connection.');
      if(disposed)return;socket=new WebSocket(endpoint.href,['neon-v1',`ticket.${result.ticket}`]);
    }else socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/multiplayer/socket`);
  }catch(error){if(!disposed){status(error.name==='TimeoutError'?'The multiplayer server is taking longer to wake. Try again shortly.':error.message);$('create').disabled=$('join').disabled=false;}return;}finally{connecting=false;}
  status('Connecting…');const deadline=connectionDeadline=setTimeout(()=>{if(!joined&&!disposed){socket.close();status('Connection timed out. Try again.');}},15000);
  socket.onopen=()=>socket.send(JSON.stringify(action));
  socket.onmessage=event=>{if(disposed)return;try{const value=JSON.parse(event.data);
    if(value.type==='error'){status(value.message);socket.close();return;}
    if(value.type==='joined'){selfId=value.id;socket.roomCode=value.code;buildWorld(value.world);joined=true;document.body.classList.add('playing');$('hud').hidden=false;clearTimeout(deadline);document.activeElement?.blur();$('view').focus();$('feed').textContent=touchMode?'Left stick moves · drag the world to look · Fire shoots':'WASD / arrows move · drag to look · click / Shift fires';}
    if(value.type==='world')buildWorld(value.world);
    if(value.type==='state'){state=value;world.vehicles=value.vehicles||[];const me=state.players.find(p=>p.id===selfId);if(me){if(!predicted||(predicted.hp<=0&&me.hp>0)){angle=me.angle;pitch=me.pitch;pending=[];camera.position.set(me.x,me.z+1.45,me.y);}if(me.carId)angle=me.angle;pending=pending.filter(command=>command.seq>me.ack);predicted={...me};if(me.hp>0&&!me.carId)for(const command of pending)movePlayer(predicted,command,world);}latest=performance.now();for(const event of value.events)if(event.kind==='shot'){shotAudio(event);if(event.id===selfId)muzzleUntil=latest+65;}updateHUD();}
  }catch{status('Could not load multiplayer. Check WebGL2 support.');socket.close();}};
  socket.onerror=()=>status('Could not connect to the match server. Check your connection and try again.');
  socket.onclose=()=>{clearTimeout(deadline);if(disposed)return;joined=false;state=null;resetInput();document.body.classList.remove('playing','driving');$('hud').hidden=true;$('create').disabled=$('join').disabled=false;if(!$('status').textContent||$('status').textContent==='Connecting…')status('Disconnected. You can create or join another room.');};
}
$('create').onclick=()=>{unlockAudio();connect({type:'create',arena:$('arena').value,timeOfDay:$('timeOfDay').value});};$('join').onclick=()=>{const code=normalizeRoomCode($('code').value);if(!code){$('code').setAttribute('aria-invalid','true');status('Enter the 10-character room code from your friend’s invite.');$('code').focus();return;}$('code').removeAttribute('aria-invalid');$('code').value=code;unlockAudio();connect({type:'join',code});};
$('code').addEventListener('input',()=>$('code').removeAttribute('aria-invalid'));
$('sound').onclick=()=>{muted=!muted;if(!muted)unlockAudio();$('sound').textContent=muted?'Sound off':'Sound on';};
$('copy').onclick=async()=>{if(!socket?.roomCode)return;const url=new URL('/',location.href);url.searchParams.set('mode','multiplayer');url.searchParams.set('room',socket.roomCode);$('inviteLink').value=url.href;try{await navigator.clipboard.writeText(url.href);$('inviteStatus').textContent='Invite link copied.';$('inviteFallback').hidden=true;$('feed').textContent='Invite copied';}catch{$('inviteFallback').hidden=false;$('board').open=true;$('inviteStatus').textContent='Automatic copy is unavailable. Select and copy the link below.';$('inviteLink').focus();$('inviteLink').select();} };
$('controls').onclick=()=>{resetInput();setTouchMode(!touchMode);};
$('vehicleUse').onclick=()=>touch.interact=true;
$('board').addEventListener('toggle',()=>{resetInput();if($('board').open)document.exitPointerLock?.();else $('view').focus();});
$('resumeMatch').onclick=()=>$('board').open=false;
function dispose(){disposed=true;joined=false;clearTimeout(connectionDeadline);clearTimeout(hitTimeout);clearTimeout(damageTimeout);if(socket){socket.onmessage=socket.onerror=socket.onclose=null;socket.close();}renderer?.setAnimationLoop(null);if(scene){const privateMaps=new Set();scene.traverse(o=>{if(o.isMesh)for(const material of [o.material].flat())if(material.map&&!ownedTextures.has(material.map))privateMaps.add(material.map);});for(const texture of privateMaps)texture.dispose();releasePrivateModel(scene,new Set());}for(const texture of ownedTextures)texture.dispose();ownedTextures.clear();textureConsumers.clear();renderer?.dispose();audio?.close().catch(()=>{});}
addEventListener('pagehide',dispose);
function leave(){dispose();if(new URLSearchParams(location.search).has('embedded'))parent.postMessage({type:'neon-multiplayer-leave'},location.origin);else location.href='/';}
$('leave').onclick=leave;$('back').onclick=leave;
async function logout(){if(new URLSearchParams(location.search).has('embedded')){dispose();parent.postMessage({type:'neon-multiplayer-logout'},location.origin);return;}
  $('lobbyLogout').disabled=$('matchLogout').disabled=true;
  try{const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error('Account service unavailable');const result=await response.json();if(result.user!==null)throw Error('Logout was not confirmed');dispose();location.href='/?signin=1';}catch(error){$('lobbyLogout').disabled=$('matchLogout').disabled=false;status(`Could not sign out: ${error.message}`);$('feed').textContent=`Could not sign out: ${error.message}`;}}
$('lobbyLogout').onclick=$('matchLogout').onclick=logout;
addEventListener('keydown',e=>{if(!joined)return;if(e.code==='Escape'){e.preventDefault();$('board').open=!$('board').open;return;}if(/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)||$('board').open)return;const key=movementKey(e.code);if(['Space','ShiftLeft','ShiftRight','KeyW','KeyA','KeyS','KeyD','KeyR','KeyQ','KeyE'].includes(key)){e.preventDefault();keys.add(key);}});addEventListener('keyup',e=>keys.delete(movementKey(e.code)));addEventListener('blur',resetInput);addEventListener('resize',resize);addEventListener('visibilitychange',()=>{if(document.hidden)resetInput();});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===$('view')){angle+=e.movementX*.0025;pitch=Math.max(-.65,Math.min(.65,pitch-e.movementY*.002));}});
$('view').addEventListener('pointerdown',e=>{if(!joined)return;$('view').focus();if(e.pointerType==='touch'){setTouchMode(true);return;}if(e.button===0){touch.fire=true;try{const result=$('view').requestPointerLock?.();result?.catch(()=>{});}catch{/* Drag-to-look remains available on insecure LAN/browser sessions. */}}if(e.button===2)touch.aim=true;});addEventListener('pointerup',e=>{if(e.pointerType!=='touch'){if(e.button===0)touch.fire=false;if(e.button===2)touch.aim=false;}});$('view').addEventListener('contextmenu',e=>e.preventDefault());
for(const key of ['fire','reload','jump']){const el=$(key);el.onpointerdown=e=>{e.preventDefault();el.setPointerCapture(e.pointerId);touch[key]=true;};el.onpointerup=el.onpointercancel=()=>touch[key]=false;}
$('aim').onclick=()=>{touch.aim=!touch.aim;$('aim').setAttribute('aria-pressed',String(touch.aim));};
$('sprint').onclick=()=>{touch.sprint=!touch.sprint;$('sprint').setAttribute('aria-pressed',String(touch.sprint));};
let stickId=null,lookId=null,lastLook;
function moveStick(e){if(e.pointerId!==stickId)return;const r=$('stick').getBoundingClientRect(),x=(e.clientX-r.x-r.width/2)/(r.width/2),y=(e.clientY-r.y-r.height/2)/(r.height/2),length=Math.max(1,Math.hypot(x,y));touch.strafe=x/length;touch.forward=-y/length;$('knob').style.transform=`translate(${touch.strafe*25}px,${-touch.forward*25}px)`;}
$('stick').onpointerdown=e=>{e.preventDefault();stickId=e.pointerId;$('stick').setPointerCapture(e.pointerId);moveStick(e);};$('stick').onpointermove=moveStick;$('stick').onpointerup=$('stick').onpointercancel=$('stick').onlostpointercapture=()=>{stickId=null;touch.forward=touch.strafe=0;$('knob').style.transform='';};
$('view').addEventListener('pointerdown',e=>{if(!joined)return;lookId=e.pointerId;lastLook=[e.clientX,e.clientY];if(e.isTrusted&&!document.pointerLockElement){try{$('view').setPointerCapture(e.pointerId);}catch(error){if(!['InvalidStateError','NotFoundError'].includes(error.name))throw error;}}});$('view').addEventListener('pointermove',e=>{if(e.pointerId!==lookId||document.pointerLockElement===$('view'))return;angle+=(e.clientX-lastLook[0])*.004;pitch=Math.max(-.65,Math.min(.65,pitch-(e.clientY-lastLook[1])*.003));lastLook=[e.clientX,e.clientY];});$('view').addEventListener('pointerup',()=>lookId=null);$('view').addEventListener('pointercancel',()=>lookId=null);
setInterval(()=>{if(joined&&socket.readyState===WebSocket.OPEN&&!document.hidden&&performance.now()-latest<2500&&socket.bufferedAmount<8192){const command=input();socket.send(JSON.stringify(command));touch.interact=false;pending.push(command);if(pending.length>64){socket.close();return;}if(predicted?.hp>0&&!predicted.carId)movePlayer(predicted,command,world);}},50);
async function initialize(){try{transport=await readJson(await fetch('/api/multiplayer',{cache:'no-store',signal:AbortSignal.timeout(8000)}));$('connectionMode').textContent=transport.localOnly?'Local preview · both players need access to this development server.':'Online private rooms · the free pilot server may take a minute to wake. Rooms reset on server restarts.';if(!transport.available)throw Error(transport.error||'Online multiplayer is temporarily unavailable.');const identity=await readJson(await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)}));if(!identity.user)throw Error('Sign in through the campaign, then return here.');if(disposed)return;$('lobbyLogout').disabled=false;$('create').disabled=$('join').disabled=false;status('Ready. Create a room or join your friend.');const room=new URLSearchParams(location.search).get('room');if(room&&/^[A-F0-9]{10}$/.test(room))$('code').value=room;}catch(error){if(!disposed)status(error.message);}}
setTouchMode(touchMode);initialize();
if(new URLSearchParams(location.search).has('qa'))window.__NEON_MP_QA__={snapshot:()=>({joined,code:socket?.roomCode,selfId,state,frames,presentation:{sharedCharacterRigs:actors.size,sharedWeapon:!!camera?.userData.gun,vehicles:vehicleModels.size,night:world?.timeOfDay==='night',menuOpen:$('board').open,worldDetails:worldRoot?.children.length||0,fov:camera?.fov},render:renderer?{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}:null}),steer:(direction,forward=0)=>{angle=direction;touch.forward=forward;touch.strafe=0;pitch=0;}};
