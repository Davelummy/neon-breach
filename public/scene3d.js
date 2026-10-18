import * as THREE from '/vendor/three.module.min.js';
import {createCombatModels,createArenaLandmark,createDistrictSkyline,populateDistrictRoads} from './combat-presentation.js';
import {createVehicleFactory,animateVehicle} from './vehicle-presentation.js';
import { cacheWorldCullRecord, shouldRenderCullRecord, planWallBatches, renderPixelRatio, releasePrivateModel } from '/render-utils.js';

const bridge = window.__NEON_3D__;
if (!bridge) throw new Error('NEON 3D bridge was not initialized.');

const coarse = matchMedia('(pointer: coarse)').matches;
let lowPreset = new URLSearchParams(location.search).get('quality') === 'low';
try { lowPreset ||= localStorage.getItem('neon-breach-quality') === 'low'; } catch {}
const canvas = document.createElement('canvas');
canvas.id = 'threeGame';
canvas.setAttribute('aria-hidden', 'true');
document.body.prepend(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse && !lowPreset, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPreset ? .6 : coarse ? 1.15 : 1.0));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = !lowPreset;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb7bd);
scene.fog = new THREE.FogExp2(0x819da3, .019);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .025, 80);
camera.rotation.order = 'YXZ';
scene.add(camera);

const worldRoot = new THREE.Group();
const actorRoot = new THREE.Group();
const effectsRoot = new THREE.Group();
const coverParts = [];
scene.add(worldRoot, actorRoot, effectsRoot);

const hemi = new THREE.HemisphereLight(0xe8f6ff, 0x2a3838, 1.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 3.4);
sun.position.set(8, 18, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(lowPreset ? 256 : coarse ? 512 : 768, lowPreset ? 256 : coarse ? 512 : 768);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 50;
sun.shadow.bias = -.0008;
scene.add(sun);

const neonLights = [];
for (const [x, z, color] of [[2, 12, 0x31f5db], [22, 12, 0xff536d], [12, 2, 0xa66cff], [12, 22, 0xffbb55], [12, 12, 0xa0d0e0]]) {
  const light = new THREE.PointLight(color, 2.8, 14, 1.6);
  light.position.set(x, 3.1, z);
  scene.add(light);
  neonLights.push(light);
}
// Soft fill so interiors stay readable.
const fill = new THREE.AmbientLight(0x607880, .35);
scene.add(fill);

const mat = (color, roughness = .7, metalness = .15) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const darkMetal = mat(0x11191d, .48, .72);
const blackMetal = mat(0x05080a, .38, .82);
// Brighter, more readable surfaces — district was too dark in play.
const concrete = mat(0xb4afa0, .92, .02);
const violetWall = mat(0x8e9693, .9, .04);
const amberWall = mat(0xb79b7b, .9, .02);
const glassMaterial = new THREE.MeshPhysicalMaterial({ color: 0xb7cad0, transmission: .55, transparent: true, opacity: .48, roughness: .1, metalness: .04, thickness: .08, side: THREE.DoubleSide, emissive: 0x0e171c, emissiveIntensity: .06 });
const wallMaterials = { 1: concrete, 2: violetWall, 3: amberWall, 4: glassMaterial,5:mat(0xc7c4b7,.85,.1),6:mat(0x386943,.95,0),7:mat(0x376e86,.3,.1),8:mat(0x9a7b52,.85,.1) };
const wallMeshes=new Map(),wallGeometries=new Map(),wallBatches=new Map(),glassPool=new Map();
const wallTransform=new THREE.Object3D();
const arenaCoverGroups=new Map();
function wallGeometry(type,boundary=false){const key=boundary?'boundary':type;if(!wallGeometries.has(key))wallGeometries.set(key,new THREE.BoxGeometry(.98,boundary?2.55:bridge.world.WALL_HEIGHTS[type],.98));return wallGeometries.get(key);}

// Body / weapon / facility textures for more realistic surfaces.
const texLoader = new THREE.TextureLoader();
const bodyTextures = {};
const weaponTextures = {};
function loadTex(path, key, bucket) {
  texLoader.load(path, texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    bucket[key] = texture;
  }, undefined, () => {});
}
texLoader.load('/assets/facility-wall.webp', texture => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.4, 1.4);
  for (const key of [1, 2, 3]) {
    if (wallMaterials[key]) {
      wallMaterials[key].map = texture;
      wallMaterials[key].needsUpdate = true;
    }
  }
}, undefined, () => {});
loadTex('/assets/scout.webp', 'scout', bodyTextures);
loadTex('/assets/trooper.webp', 'trooper', bodyTextures);
loadTex('/assets/heavy.webp', 'heavy', bodyTextures);
loadTex('/assets/fp-rifle.webp', 'rifle', weaponTextures);
loadTex('/assets/fp-shotgun.webp', 'shotgun', weaponTextures);
loadTex('/assets/fp-pistol.webp', 'pistol', weaponTextures);
loadTex('/assets/fp-rifle.webp', 'dmr', weaponTextures);

function bodyMat(bodyKey, color, roughness = .72, metalness = .18) {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const apply = () => {
    const map = bodyTextures[bodyKey];
    if (!map) return;
    material.map = map;
    material.map.repeat.set(1.2, 1.2);
    material.needsUpdate = true;
  };
  apply();
  // Late apply when async texture arrives.
  const poll = setInterval(() => { if (bodyTextures[bodyKey]) { apply(); clearInterval(poll); } }, 120);
  const deadline=setTimeout(() => clearInterval(poll), 4000);
  material.userData.stopTexturePolling=()=>{clearInterval(poll);clearTimeout(deadline);};
  return material;
}

function mesh(geometry, material, cast = true, receive = true) {
  const value = new THREE.Mesh(geometry, material);
  value.castShadow = cast;
  value.receiveShadow = receive;
  return value;
}

function buildWorld() {
  const { map, WALL_HEIGHTS, MAP_W, MAP_H, STAIR_ZONES } = bridge.world;
  const ground = mesh(new THREE.PlaneGeometry(MAP_W+34, MAP_H+34), mat(0x2a3538, .94, .03), false, true);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(MAP_W / 2, -.025, MAP_H / 2);
  ground.userData.lowCullAlwaysVisible = true;
  worldRoot.add(ground);

  // Ground grid for depth readability.
  const grid = new THREE.GridHelper(MAP_W+24, MAP_W+24, 0x3a5558, 0x243438);
  grid.position.set(MAP_W / 2, .002, MAP_H / 2);
  grid.material.transparent = true;
  grid.material.opacity = .35;
  worldRoot.add(grid);

  const roadMaterial = mat(0x1e262b, .9, .05);
  const roadA = mesh(new THREE.PlaneGeometry(5.3, MAP_H - 2), roadMaterial, false, true);
  roadA.rotation.x = -Math.PI / 2;
  roadA.position.set(12, .006, MAP_H/2);
  roadA.userData.lowCullAlwaysVisible = true;
  const roadB = roadA.clone();
  roadB.geometry = new THREE.PlaneGeometry(MAP_W - 2, 5.3);
  roadB.position.set(MAP_W/2,.007,12);
  roadB.userData.lowCullAlwaysVisible = true;
  worldRoot.add(roadA, roadB);
  for(const lane of [24,36]){
    const vertical=roadA.clone();vertical.position.x=lane;
    const horizontal=roadB.clone();horizontal.position.z=lane;
    worldRoot.add(vertical,horizontal);
  }

  const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xb7c8c7 });
  for (let i = 2; i < 22; i += 2.2) {
    const stripeA = mesh(new THREE.PlaneGeometry(.07, .8), stripeMaterial, false, false);
    stripeA.rotation.x = -Math.PI / 2;
    stripeA.position.set(12, .012, i);
    const stripeB = mesh(new THREE.PlaneGeometry(.8, .07), stripeMaterial, false, false);
    stripeB.rotation.x = -Math.PI / 2;
    stripeB.position.set(i, .013, 12);
    worldRoot.add(stripeA, stripeB);
  }

  rebuildWalls();

  for (const stair of STAIR_ZONES) {
    const count = 11;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const heightT = stair.reverse ? 1 - t : t;
      const tread = mesh(new THREE.BoxGeometry(stair.x2 - stair.x1, .075, (stair.y2 - stair.y1) / count + .025), mat(0x4c5657, .72, .32), true, true);
      tread.position.set((stair.x1 + stair.x2) / 2, heightT * .82 / 2 + .02, stair.y1 + t * (stair.y2 - stair.y1));
      tread.scale.y = Math.max(1, heightT * 10.5);
      worldRoot.add(tread);
    }
  }

  const lampGeometry = new THREE.CylinderGeometry(.035, .05, 2.5, 8);
  for (const [x, z, color] of [[9.3, 9.3, 0x31f5db], [14.7, 9.3, 0xa66cff], [9.3, 14.7, 0xffbb55], [14.7, 14.7, 0xff536d]]) {
    const pole = mesh(lampGeometry, blackMetal, true, true);
    pole.position.set(x, 1.25, z);
    const lamp = mesh(new THREE.SphereGeometry(.09, 10, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 4 }), false, false);
    lamp.position.set(x, 2.46, z);
    worldRoot.add(pole, lamp);
  }

  // Mission landmarks and grounded cover dressing create a readable combat route.
  const crateMaterial = mat(0x28363a, .72, .42);
  for(const [id,covers] of Object.entries(bridge.world.coverLayouts)){
    const group=new THREE.Group();group.visible=id==='city-gate';arenaCoverGroups.set(id,group);worldRoot.add(group);
    for(const cover of covers){
      const color=cover.kind==='planter'?wallMaterials[6]:cover.kind==='bench'?wallMaterials[8]:cover.kind==='crate'?crateMaterial:concrete;
      const item=mesh(new THREE.BoxGeometry(cover.w,cover.height,cover.d),color);
      item.position.set(cover.x,cover.height/2,cover.y);group.add(item);
      const stripe=mesh(new THREE.BoxGeometry(cover.w+.01,.065,cover.d+.01),cover.kind==='crate'?darkMetal:mat(0xffbb55,.8,.1),false,false);stripe.position.set(cover.x,cover.height*.65,cover.y);group.add(stripe);
      for(const part of [item,stripe]){part.userData.cover=cover;part.userData.base=part.position.clone();coverParts.push(part);}
    }
  }
}

const glassMeshes = new Map();
function rebuildWalls(){
  const {groups,glass}=planWallBatches(bridge.world.map,bridge.world.WALL_HEIGHTS);
  wallMeshes.clear();glassMeshes.clear();
  for(const object of wallBatches.values()){object.visible=false;object.count=0;object.userData.layoutHidden=true;}
  for(const object of glassPool.values()){object.visible=false;object.userData.layoutHidden=true;}
  for(const [key,cells] of groups){
    const first=cells[0];let object=wallBatches.get(key);
    if(!object){object=new THREE.InstancedMesh(wallGeometry(first.type,first.boundary),wallMaterials[first.type]||concrete,144);object.castShadow=true;object.receiveShadow=true;object.name=`District wall batch ${key}`;wallBatches.set(key,object);worldRoot.add(object);}
    const chunkX=Math.floor(first.x/12)*12+6,chunkY=Math.floor(first.y/12)*12+6;
    object.position.set(chunkX,0,chunkY);object.userData.lowCullExtent=Math.SQRT2*6;
    for(let i=0;i<cells.length;i++){const cell=cells[i];wallTransform.position.set(cell.x+.5-chunkX,cell.height/2,cell.y+.5-chunkY);wallTransform.updateMatrix();object.setMatrixAt(i,wallTransform.matrix);wallMeshes.set(`${cell.x},${cell.y}`,{object,height:cell.height});}
    object.count=cells.length;object.visible=true;object.userData.layoutHidden=false;object.instanceMatrix.needsUpdate=true;object.computeBoundingSphere();
  }
  for(const cell of glass){const key=`${cell.x},${cell.y}`;let object=glassPool.get(key);
    if(!object){object=mesh(wallGeometry(4,cell.boundary),glassMaterial,false,true);object.userData.cellKey=key;object.userData.glass=true;glassPool.set(key,object);worldRoot.add(object);}
    object.position.set(cell.x+.5,cell.height/2,cell.y+.5);object.userData.layoutHidden=false;object.visible=true;glassMeshes.set(key,object);wallMeshes.set(key,{object,height:cell.height});
  }
}
buildWorld();
// First Abuja-inspired blockout: skyline only, outside existing collision bounds.
// Original low-poly silhouettes, not surveyed geography or landmark replicas.
function buildAbujaSkyline(){
  worldRoot.add(createDistrictSkyline({THREE,mat,mesh,width:bridge.world.MAP_W}));
  window.__NEON_CITY__={name:'Abuja-inspired arenas',stage:'landmark arena blockouts',collisionChanged:true,inspectCell:(x,y)=>{const wall=wallMeshes.get(`${x},${y}`);return {type:bridge.world.map[y]?.[x],present:!!wall&&!wall.object.userData.layoutHidden,visible:!!wall?.object.visible,height:wall?.height||0};}};
}
buildAbujaSkyline();
const arenaLandmarks=new Map();
for(const arena of bridge.world.arenas){
  const group=createArenaLandmark(arena,{THREE,mat,mesh,wallMaterials,darkMetal});group.visible=false;
  arenaLandmarks.set(arena.id,group);worldRoot.add(group);
}
// Two shared instanced draws; rebuild only when the mission layout changes.
const roadTiles=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.012,1),mat(0xffffff,.96,0),2304);
const roadLines=new THREE.InstancedMesh(new THREE.BoxGeometry(.07,.012,.65),mat(0xe6ddbc,.95,0),400);
roadTiles.name='District asphalt boulevards';roadLines.name='Boulevard lane markings';
for(const object of [roadTiles,roadLines]){object.userData.lowCullAlwaysVisible=true;object.castShadow=false;object.receiveShadow=true;object.count=0;worldRoot.add(object);}
const roadTransform=new THREE.Object3D();
const roadColor=new THREE.Color();
function updateRoads(){populateDistrictRoads({THREE,map:bridge.world.map,width:bridge.world.MAP_W,height:bridge.world.MAP_H,roadTiles,roadLines,roadTransform,roadColor});}
const lowCullables = [];
if (lowPreset) {
  worldRoot.updateMatrixWorld(true);
  const worldPosition = new THREE.Vector3();
  worldRoot.traverse(object => {
    if (object.isMesh) lowCullables.push(cacheWorldCullRecord(object, worldPosition));
  });
}
let renderedLayout=-1;
function syncWorldLayout(frame){
  if(renderedLayout===frame.layoutVersion)return;renderedLayout=frame.layoutVersion;
  rebuildWalls();
  if(lowPreset){lowCullables.length=0;worldRoot.updateMatrixWorld(true);const position=new THREE.Vector3();worldRoot.traverse(object=>{if(object.isMesh)lowCullables.push(cacheWorldCullRecord(object,position));});}
  for(const [id,group] of arenaLandmarks)group.visible=id===frame.arenaId;
  for(const [id,group] of arenaCoverGroups)group.visible=id===frame.arenaId;
  groundArena(frame.arenaId);
  updateRoads();
  window.__NEON_CITY__.roadTiles=roadTiles.count;
  window.__NEON_CITY__.arena=frame.arenaId;window.__NEON_CITY__.layoutVersion=frame.layoutVersion;
}
function groundArena(id){const arena=bridge.world.arenas.find(a=>a.id===id);if(arena){const ground=worldRoot.children[0];ground.material.color.setHex(arena.ground);}}

const terminal = new THREE.Group();
const terminalBase = mesh(new THREE.BoxGeometry(.55,.78,.4),darkMetal);
terminalBase.position.y=.39;
const terminalScreen = mesh(new THREE.PlaneGeometry(.42,.28),new THREE.MeshStandardMaterial({color:0x31f5db,emissive:0x31f5db,emissiveIntensity:3.2,roughness:.2}),false,false);
terminalScreen.position.set(0,.64,-.215);terminalScreen.rotation.x=-.16;
const terminalLight = new THREE.PointLight(0x31f5db,2.5,3,2);terminalLight.position.set(0,.78,0);
terminal.add(terminalBase,terminalScreen,terminalLight);terminal.position.set(5.35,.72,4.45);worldRoot.add(terminal);

const extractionPad = new THREE.Group();
for(const [radius,color] of [[1.35,0xffbb55],[.92,0x31f5db]]){const ring=mesh(new THREE.TorusGeometry(radius,.035,8,40),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:3}),false,false);ring.rotation.x=Math.PI/2;ring.position.y=.025;extractionPad.add(ring);}
const extractionBeam=mesh(new THREE.CylinderGeometry(.34,.62,4.5,18,1,true),new THREE.MeshBasicMaterial({color:0xffbb55,transparent:true,opacity:.09,side:THREE.DoubleSide,depthWrite:false}),false,false);extractionBeam.position.y=2.25;extractionPad.add(extractionBeam);extractionPad.position.set(11.5,0,2.5);worldRoot.add(extractionPad);

const objectiveMarker = new THREE.Group();
const markerRing=mesh(new THREE.TorusGeometry(.28,.035,8,28),new THREE.MeshStandardMaterial({color:0xffbb55,emissive:0xffbb55,emissiveIntensity:4}),false,false);markerRing.rotation.x=Math.PI/2;
const markerDiamond=mesh(new THREE.OctahedronGeometry(.12,0),new THREE.MeshStandardMaterial({color:0xffe09a,emissive:0xffbb55,emissiveIntensity:4}),false,false);markerDiamond.position.y=.48;
const markerBeam=mesh(new THREE.CylinderGeometry(.018,.018,.42,6),new THREE.MeshBasicMaterial({color:0xffbb55,transparent:true,opacity:.62}),false,false);markerBeam.position.y=.25;
objectiveMarker.add(markerRing,markerDiamond,markerBeam);effectsRoot.add(objectiveMarker);

const {createHuman,animateHuman,createWeaponModel}=createCombatModels({THREE,mat,mesh,darkMetal,blackMetal,bodyMat,weaponTextures,enemyTypes:bridge.world.enemyTypes});
const localPlayerModel=createHuman('specter',0,false,false);actorRoot.add(localPlayerModel);localPlayerModel.visible=false;
const localPlayerWeapons=new Map([[0,localPlayerModel.userData.rig.weapon]]);let localWeaponIndex=0;
const localPlayerPose={x:0,hp:100,maxHp:100,vx:0,vy:0,grounded:true,combatState:'hold',reloadTimer:0,muzzleFlash:0};
const civilianModels=new Map(),civilianSkin=mat(0x784c32,.95,0),civilianShoes=mat(0x282727,.95,0),civilianClothes=[0xc59663,0x4d7682,0x82774d,0xb7b8a0].map(c=>mat(c,.95,0));
const civilianBodyGeometry=new THREE.BoxGeometry(.32,.58,.19),civilianHeadGeometry=new THREE.SphereGeometry(.115,8,6),civilianLimbGeometry=new THREE.BoxGeometry(.09,.52,.1);
const shopRoot=new THREE.Group();worldRoot.add(shopRoot);let shopPosition='';
const shopCanvas=document.createElement('canvas');shopCanvas.width=512;shopCanvas.height=128;const shopContext=shopCanvas.getContext('2d');shopContext.fillStyle='#172c29';shopContext.fillRect(0,0,512,128);shopContext.fillStyle='#edcc80';shopContext.font='bold 38px system-ui';shopContext.textAlign='center';shopContext.fillText('DISTRICT ARMORY',256,55);shopContext.font='23px system-ui';shopContext.fillText('EARNED CREDITS · EQUIPMENT',256,98);
const shopTexture=new THREE.CanvasTexture(shopCanvas);shopTexture.colorSpace=THREE.SRGBColorSpace;
const shopSign=mesh(new THREE.BoxGeometry(2.2,.55,.08),new THREE.MeshBasicMaterial({map:shopTexture}));shopSign.position.y=2.05;shopRoot.add(shopSign);
const counter=mesh(new THREE.BoxGeometry(2,.75,.65),mat(0x756145,.95,0));counter.position.y=.375;shopRoot.add(counter);
const awning=mesh(new THREE.BoxGeometry(2.4,.1,1),mat(0x405f54,.9,0));awning.position.y=2.5;shopRoot.add(awning);
function syncCity(frame){
  let visible=0;
  for(const c of frame.civilians||[]){let object=civilianModels.get(c.id);if(!object){object=new THREE.Group();const shirt=mesh(civilianBodyGeometry,civilianClothes[c.variant%4]),head=mesh(civilianHeadGeometry,civilianSkin);shirt.position.y=1;head.position.y=1.45;object.add(shirt,head);const limbs=[];for(const [x,y] of [[-.22,1],[.22,1],[-.09,.45],[.09,.45]]){const limb=mesh(civilianLimbGeometry,y===1?civilianSkin:civilianShoes);limb.position.set(x,y,0);object.add(limb);limbs.push(limb);}object.userData.limbs=limbs;civilianModels.set(c.id,object);actorRoot.add(object);}
    object.visible=frame.mode==='playing'&&Math.hypot(c.x-frame.player.x,c.y-frame.player.y)<(lowPreset?18:30)&&(!lowPreset||visible++<6);if(!object.visible)continue;
    object.position.set(c.x,0,c.y);object.rotation.y=-c.dir-Math.PI/2;const walk=Math.hypot(c.vx,c.vy)>.1?Math.sin(frame.totalTime*(c.flee?10:5)+c.id)*.4:0;for(let i=0;i<4;i++)object.userData.limbs[i].rotation.x=walk*(i%2?1:-1);
  }
  for(const [id,object] of civilianModels)if(!(frame.civilians||[]).some(c=>c.id===id)){actorRoot.remove(object);civilianModels.delete(id);}
  shopRoot.visible=!!frame.gunShop&&frame.mode==='playing';if(frame.gunShop){const key=`${frame.gunShop.x}|${frame.gunShop.y}`;if(shopPosition!==key){shopRoot.position.set(frame.gunShop.x,0,frame.gunShop.y);shopPosition=key;}}
  const p=frame.player;localPlayerModel.visible=frame.viewMode==='third'&&frame.mode==='playing'&&p.carIndex<0;
  if(localPlayerModel.visible){if(localWeaponIndex!==p.weaponIndex){const rig=localPlayerModel.userData.rig;rig.rightArm.remove(rig.weapon);let weapon=localPlayerWeapons.get(p.weaponIndex);if(!weapon){const cfg=bridge.world.weapons[p.weaponIndex];weapon=createWeaponModel(cfg.id,cfg.color);weapon.scale.setScalar(cfg.id==='pistol'?.72:.85);weapon.position.set(.02,-.52,-.08);localPlayerWeapons.set(p.weaponIndex,weapon);}rig.weapon=weapon;rig.rightArm.add(weapon);localWeaponIndex=p.weaponIndex;}localPlayerModel.position.set(p.x,Math.max(0,p.z-.5),p.y);localPlayerModel.rotation.y=-p.dir-Math.PI/2;Object.assign(localPlayerPose,{x:p.x,hp:p.health,vx:p.moveVx,vy:p.moveVy,grounded:p.grounded,reloadTimer:p.reloadTimer,muzzleFlash:frame.muzzle});animateHuman(localPlayerModel,localPlayerPose,frame.totalTime);}
}

const createCar=createVehicleFactory({THREE,mat,mesh,darkMetal,blackMetal});



const fpWeaponRoot = new THREE.Group();
const fpWeapons = [
  createWeaponModel('rifle', 0x31f5db),
  createWeaponModel('shotgun', 0xffbb55),
  createWeaponModel('pistol', 0xa66cff),
  createWeaponModel('dmr', 0xffd257),
  createWeaponModel('smg', 0x86e58b),
  createWeaponModel('lmg', 0xff975d)
];
fpWeapons.forEach((weapon, index) => { weapon.visible = index === 0; weapon.scale.setScalar(1.15); fpWeaponRoot.add(weapon); });
const fpSleeve=mat(0x2a3a3e,.72,.28),fpGlove=mat(0x12171b,.55,.42),fpSkin=mat(0xc48a62,.86,.04);
for(const side of [-1,1]){
  const arm=mesh(new THREE.CapsuleGeometry(.07,.36,5,10),fpSleeve,false,false);
  arm.position.set(side*.2,-.2,.14);arm.rotation.set(side<0?-.7:-.55,0,side*.2);
  const forearm=mesh(new THREE.CapsuleGeometry(.055,.2,4,8),fpSleeve,false,false);
  forearm.position.set(side*.08,-.12,-.12);forearm.rotation.x=-.4;
  const hand=mesh(new THREE.SphereGeometry(.07,12,9),fpGlove,false,false);
  hand.scale.set(.95,.7,1.2);hand.position.set(side*.1,-.06,-.08);
  const finger=mesh(new THREE.CapsuleGeometry(.018,.06,3,6),fpSkin,false,false);
  finger.position.set(side*.02,-.02,-.12);finger.rotation.x=-.6;
  arm.add(forearm,hand,finger);fpWeaponRoot.add(arm);
}
camera.add(fpWeaponRoot);
// Multi-plane muzzle: core flash + soft bloom plane for a more photographic report.
const muzzleFlash = mesh(new THREE.OctahedronGeometry(.09, 0), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 1 }), false, false);
const muzzleBloom = mesh(new THREE.PlaneGeometry(.22, .22), new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: .65, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), false, false);
muzzleBloom.rotation.y = Math.PI / 2;
const muzzleLight = new THREE.PointLight(0xffa050, 0, 4.5, 1.8);
fpWeaponRoot.add(muzzleFlash, muzzleBloom, muzzleLight);

const enemyMeshes = new WeakMap();
const carMeshes = new WeakMap();
const corpseMeshes = new WeakMap();
const bloodMeshes = new WeakMap();
const projectileMeshes = new WeakMap();
const pickupMeshes = new WeakMap();
const particleMeshes = new WeakMap();
const rendered = { enemies: new Set(), cars: new Set(), corpses: new Set(), blood: new Set(), projectiles: new Set(), pickups: new Set(), particles: new Set() };
const frameSets = { enemies: new Set(), cars: new Set(), corpses: new Set(), blood: new Set(), projectiles: new Set(), pickups: new Set(), particles: new Set() };
// Low-poly particles + unlit materials (big FPS win under fire).
const particleGeometry = new THREE.SphereGeometry(.025, 4, 3);
const particleMaterials = new Map();
const destroyNodeMeshes = new Map();
const renderedDestroy = new Set();
const currentDestroy = new Set();

const protectedModelMaterials=new Set([darkMetal,blackMetal,...Object.values(wallMaterials)]);
function prune(set, current, privateModel=false) {
  for (const object of set) if (!current.has(object)) { object.parent?.remove(object); set.delete(object);if(privateModel)releasePrivateModel(object,protectedModelMaterials); }
}

function syncEnemies(frame) {
  const current = frameSets.enemies; current.clear();
  for (const enemy of frame.enemies) {
    let object = enemyMeshes.get(enemy);
    if (!object) { object = createHuman(enemy.type, enemy.variant || 0, enemy.elite,enemy.commander); enemyMeshes.set(enemy, object); actorRoot.add(object); rendered.enemies.add(object); }
    current.add(object);
    object.visible = !enemy.dead && enemy.spawn < .98 && (!lowPreset||Math.hypot(enemy.x-frame.camera.x,enemy.y-frame.camera.y)<24);
    object.position.set(enemy.x, Math.max(0, (enemy.z || .5) - .5), enemy.y);
    object.rotation.y = -(enemy.facing || 0) - Math.PI / 2;
    if(object.visible)animateHuman(object, enemy, frame.totalTime);
  }
  prune(rendered.enemies, current, true);
}

function syncDestroyNodes(frame) {
  const nodes = frame.destroyNodes || [];
  const current = currentDestroy;current.clear();
  for (const node of nodes) {
    if (node.dead) continue;
    let object = destroyNodeMeshes.get(node);
    if (!object) {
      object = new THREE.Group();
      const pillar = mesh(new THREE.CylinderGeometry(.16, .22, .85, 8), new THREE.MeshStandardMaterial({ color: 0x1a3a44, metalness: .55, roughness: .35 }), true, true);
      pillar.position.y = .42;
      const core = mesh(new THREE.BoxGeometry(.22, .22, .22), new THREE.MeshStandardMaterial({ color: 0x31f5db, emissive: 0x31f5db, emissiveIntensity: 3.2 }), false, false);
      core.position.y = .95;
      const ring = mesh(new THREE.TorusGeometry(.28, .03, 6, 14), new THREE.MeshStandardMaterial({ color: 0x7fd0ff, emissive: 0x31f5db, emissiveIntensity: 2, transparent: true, opacity: .7 }), false, false);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = .95;
      object.add(pillar, core, ring);
      object.userData.core = core;
      object.userData.ring = ring;
      destroyNodeMeshes.set(node, object);
      effectsRoot.add(object);
      renderedDestroy.add(object);
    }
    current.add(object);
    object.position.set(node.x, 0, node.y);
    const health = node.maxHp ? node.hp / node.maxHp : 1;
    object.userData.core.material.emissiveIntensity = 1.5 + health * 2.5;
    object.userData.ring.scale.setScalar(.85 + health * .35);
    object.userData.ring.rotation.z = frame.totalTime * 2;
  }
  for (const object of renderedDestroy) {
    if (!current.has(object)) {
      object.parent?.remove(object);
      renderedDestroy.delete(object);
      for (const [node, meshObj] of destroyNodeMeshes) if (meshObj === object) destroyNodeMeshes.delete(node);
    }
  }
}

const wreckMaterial = new THREE.MeshStandardMaterial({color:0x292a27,roughness:1,metalness:.25});
protectedModelMaterials.add(wreckMaterial);
let vehicleFrameTime=0;
function syncCars(frame) {
  const dt=Math.max(0,Math.min(.1,(frame.totalTime||0)-vehicleFrameTime));vehicleFrameTime=frame.totalTime||0;
  const current = frameSets.cars; current.clear();
  for (const car of frame.cars) {
    let object = carMeshes.get(car);
    if (!object) { object = createCar(car.color,car.kind); carMeshes.set(car, object); actorRoot.add(object); rendered.cars.add(object); }
    current.add(object);
    object.visible = !lowPreset||car===frame.cars[frame.player.carIndex]||Math.hypot(car.x-frame.camera.x,car.y-frame.camera.y)<28;
    if(object.userData.wrecked!==!!car.destroyed){object.traverse(mesh=>{if(!mesh.isMesh)return;if(!mesh.userData.originalMaterial)mesh.userData.originalMaterial=mesh.material;mesh.material=car.destroyed?wreckMaterial:mesh.userData.originalMaterial;});object.userData.wrecked=!!car.destroyed;}
    object.position.set(car.x, 0, car.y);
    object.rotation.y = -car.dir;
    animateVehicle(object,car,dt);
  }
  prune(rendered.cars, current, true);
}

function syncCorpses(frame) {
  const current = frameSets.corpses; current.clear();
  for (const corpse of frame.corpses) {
    let object = corpseMeshes.get(corpse);
    if (!object) {
      object = createHuman(corpse.type, corpse.variant || 0, corpse.elite, corpse.commander);
      corpseMeshes.set(corpse, object);
      actorRoot.add(object);
      rendered.corpses.add(object);
    }
    current.add(object);
    object.position.set(corpse.x, Math.max(.035, (corpse.z || .5) - .5 + .035), corpse.y);
    // Death fall: ease from standing to the lying pose over ~0.4s, toppling away from the shot.
    const fallT = Math.min(1, (corpse.age || 0) / .42), fallEase = 1 - Math.pow(1 - fallT, 3);
    object.rotation.y = -(corpse.fall ?? corpse.dir ?? 0) - Math.PI / 2;
    const rig = object.userData.rig;
    rig.body.rotation.set(Math.PI / 2 * fallEase, 0, 0);
    rig.body.position.y = .12 * fallEase;
    rig.leftArm.rotation.z = -.8 * fallEase;
    rig.rightArm.rotation.z = .65 * fallEase;
    rig.leftLeg.rotation.x = -.24 * fallEase;
    rig.rightLeg.rotation.x = .32 * fallEase;
    // Soft dissolve in the last second of corpse life.
    const fade = corpse.fade == null ? 1 : corpse.fade;
    object.visible = fade > .02;
    object.traverse(child => {
      if (!child.isMesh || !child.material) return;
      if (child.userData.corpseBaseOpacity === undefined) {
        child.userData.corpseBaseOpacity = child.material.opacity ?? 1;
        child.userData.corpseBaseTransparent = !!child.material.transparent;
      }
      child.material.transparent = true;
      child.material.opacity = child.userData.corpseBaseOpacity * fade;
      child.material.depthWrite = fade > .55;
    });
    object.scale.setScalar(.96 + fade * .04);
  }
  prune(rendered.corpses, current, true);
}

function syncBlood(frame) {
  const current = frameSets.blood; current.clear();
  for (const blood of frame.bloodDecals) {
    let object = bloodMeshes.get(blood);
    if (!object) {
      object = mesh(new THREE.CircleGeometry(blood.size || .35, 18), new THREE.MeshStandardMaterial({ color: 0x56070d, roughness: 1, transparent: true, opacity: blood.alpha || .75, depthWrite: false }), false, true);
      object.rotation.x = -Math.PI / 2;
      object.scale.set(1.5, .7, 1);
      bloodMeshes.set(blood, object);
      effectsRoot.add(object);
      rendered.blood.add(object);
    }
    current.add(object);
    object.position.set(blood.x, Math.max(.014, (blood.z || .5) - .5 + .014), blood.y);
    if (object.material) object.material.opacity = blood.alpha ?? .75;
  }
  prune(rendered.blood, current, true);
}

const projectileGeometry={core:new THREE.SphereGeometry(.09,8,6),glow:new THREE.SphereGeometry(.16,8,6),trail:new THREE.CylinderGeometry(.035,.09,1.15,6),soft:new THREE.CylinderGeometry(.06,.14,1.6,6)};
const projectileCoreMaterial=new THREE.MeshBasicMaterial({color:0xffffff});
const projectileMaterialCache=new Map();
function projectileMaterials(color){
  if(!projectileMaterialCache.has(color))projectileMaterialCache.set(color,{
    glow:new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending}),
    trail:new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending}),
    soft:new THREE.MeshBasicMaterial({color,transparent:true,opacity:.35,depthWrite:false,blending:THREE.AdditiveBlending})
  });return projectileMaterialCache.get(color);
}
function syncProjectiles(frame) {
  const current = frameSets.projectiles; current.clear();
  for (const projectile of frame.projectiles) {
    let object = projectileMeshes.get(projectile);
    if (!object) {
      const color = { titan: 0xffbb55, warden: 0x74c2ff, raven: 0xffd257 }[projectile.type] ?? 0xff294d;
      // Bright, long tracer — enemy return fire must read at combat range.
      object = new THREE.Group();
      const materials=projectileMaterials(color);
      const core = mesh(projectileGeometry.core,projectileCoreMaterial,false,false);
      const glow = mesh(projectileGeometry.glow,materials.glow,false,false);
      const trail = mesh(projectileGeometry.trail,materials.trail,false,false);
      const trailSoft = mesh(projectileGeometry.soft,materials.soft,false,false);
      trail.rotation.x = Math.PI / 2;
      trail.position.z = .5;
      trailSoft.rotation.x = Math.PI / 2;
      trailSoft.position.z = .7;
      object.add(trailSoft, trail, glow, core);
      object.userData.trail = trail;
      projectileMeshes.set(projectile, object); effectsRoot.add(object); rendered.projectiles.add(object);
    }
    current.add(object);
    // Chest/gun height fallback if z missing (never spawn at ankle height).
    object.position.set(projectile.x, projectile.z ?? 1.35, projectile.y);
    if (projectile.dx != null || projectile.dy != null) {
      object.rotation.y = -Math.atan2(projectile.dy || 0, projectile.dx || 1) - Math.PI / 2;
      const pitch = Math.atan2(projectile.dz || 0, Math.hypot(projectile.dx || 0, projectile.dy || 0) || 1);
      object.rotation.x = pitch;
    }
  }
  prune(rendered.projectiles, current);
}

const supplyBoxGeometry=new THREE.BoxGeometry(.4,.24,.32),supplyStripGeometry=new THREE.BoxGeometry(.25,.035,.08),supplyAmmoGeometry=new THREE.BoxGeometry(.035,.14,.035);
const supplyMaterials={health:mat(0xff536d,.65,.1),ammo:mat(0xffbb55,.6,.3),shield:mat(0x31f5db,.5,.3),armor:mat(0xd8e7e9,.5,.3),weapon:mat(0x86e58b,.6,.3),white:mat(0xffffff,.6,.1)};
function syncPickups(frame) {
  const current = frameSets.pickups; current.clear();
  for (const pickup of frame.pickups) {
    let object = pickupMeshes.get(pickup);
    if (!object) {
      object=new THREE.Group();
      const box=mesh(supplyBoxGeometry,supplyMaterials[pickup.kind]||supplyMaterials.ammo,false,false);object.add(box);
      if(pickup.kind==='health'){
        const crossA=mesh(supplyStripGeometry,supplyMaterials.white,false,false),crossB=mesh(supplyStripGeometry,supplyMaterials.white,false,false);
        crossA.position.y=crossB.position.y=.14;crossB.rotation.y=Math.PI/2;object.add(crossA,crossB);
      }else if(pickup.kind==='weapon'){
        const barrel=mesh(supplyStripGeometry,supplyMaterials.white,false,false);barrel.scale.set(2,.8,.5);barrel.position.y=.17;object.add(barrel);
        const grip=mesh(supplyAmmoGeometry,supplyMaterials.white,false,false);grip.position.set(0,.2,0);object.add(grip);
      }else if(pickup.kind==='ammo'){
        for(const x of [-.1,0,.1]){const round=mesh(supplyAmmoGeometry,supplyMaterials.white,false,false);round.position.set(x,.18,0);object.add(round);}
      }
      pickupMeshes.set(pickup, object); effectsRoot.add(object); rendered.pickups.add(object);
    }
    current.add(object);
    object.position.set(pickup.x, .28 + Math.sin(pickup.phase || 0) * .08, pickup.y);
    object.rotation.y = frame.totalTime * 1.7;
  }
  prune(rendered.pickups, current);
}

// Player tracers: a fixed pool of additive streaks, reused every frame (no per-shot allocation).
const tracerGeometry = new THREE.BoxGeometry(.018, .018, 1);
const tracerMaterial = new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
const tracerPool = [];
const tracerStart = new THREE.Vector3(), tracerEnd = new THREE.Vector3();
function syncTracers(frame) {
  const tracers = frame.tracers || [];
  for (let i = 0; i < Math.max(tracers.length, tracerPool.length); i++) {
    const tracer = tracers[i];
    let streak = tracerPool[i];
    if (!tracer) { if (streak) streak.visible = false; continue; }
    if (!streak) { streak = new THREE.Mesh(tracerGeometry, tracerMaterial.clone()); streak.frustumCulled = false; tracerPool.push(streak); effectsRoot.add(streak); }
    // Draw the leading 70% of the path so the streak reads as moving, not as a laser.
    const t = 1 - Math.max(0, tracer.life) / (tracer.max || .07);
    tracerStart.set(tracer.x, tracer.z, tracer.y).lerp(tracerEnd.set(tracer.ex, tracer.ez, tracer.ey), Math.min(.6, t * .6));
    tracerEnd.set(tracer.ex, tracer.ez, tracer.ey);
    const length = tracerStart.distanceTo(tracerEnd);
    streak.visible = length > .05 && frame.mode === 'playing';
    streak.position.copy(tracerStart).lerp(tracerEnd, .5);
    streak.scale.set(1, 1, length);
    streak.lookAt(tracerEnd);
    streak.material.opacity = .9 * (1 - t * .7);
  }
}

// Cover rammed by a vehicle tumbles away along the push direction, then disappears.
function syncCovers(frame) {
  const now = frame.totalTime || 0;
  for (const part of coverParts) {
    const knocked = part.userData.cover.knocked, base = part.userData.base;
    if (!knocked || now < knocked.t) {
      if (part.userData.wasKnocked) { part.position.copy(base); part.rotation.set(0, 0, 0); part.visible = true; part.userData.wasKnocked = false; }
      continue;
    }
    part.userData.wasKnocked = true;
    const age = now - knocked.t, t = Math.min(1, age / .7);
    part.visible = age < 1.1;
    if (!part.visible) continue;
    part.position.set(base.x + knocked.dx * t * 1.8, base.y + Math.sin(t * Math.PI) * .45 - t * base.y * .6, base.z + knocked.dy * t * 1.8);
    part.rotation.set(knocked.dy * t * 2.4, 0, -knocked.dx * t * 2.4);
  }
}

function syncParticles(frame) {
  const current = frameSets.particles; current.clear();
  for (const particle of frame.particles) {
    let object = particleMeshes.get(particle);
    if (!object) {
      let material = particleMaterials.get(particle.color);
      if (!material) {
        const color = new THREE.Color(particle.color);
        // BasicMaterial is far cheaper than Standard for hundreds of sparks.
        material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: particle.color?.startsWith('#6f') ? .85 : 1 });
        particleMaterials.set(particle.color, material);
      }
      object = mesh(particleGeometry, material, false, false);
      object.scale.setScalar(particle.size ?? (particle.color === '#6f0711' ? 1.25 : 1));
      particleMeshes.set(particle, object); effectsRoot.add(object); rendered.particles.add(object);
    }
    current.add(object);
    object.position.set(particle.x, Number.isFinite(particle.z) ? particle.z : .1 + Math.max(0, particle.life) * .4, particle.y);
    object.scale.y = Math.max(.45, 1 + Math.hypot(particle.vx || 0, particle.vy || 0) * .28);
  }
  prune(rendered.particles, current);
}

let lastEnvKey = '';
function updateEnvironment(frame) {
  const nvg = !!frame.nightVision && frame.mode === 'playing';
  const envKey = `${frame.timeOfDay}|${nvg ? 'nvg' : 'std'}`;
  if (lastEnvKey === envKey) return;
  lastEnvKey = envKey;
  const day = frame.timeOfDay === 'day' && !nvg;
  if (nvg) {
    // Bright green phosphor NVG — midtones lifted so contacts stay readable.
    scene.background.set(0x0c2818);
    scene.fog.color.set(0x144028);
    scene.fog.density = .0085;
    hemi.color.set(0xb8ffd0);
    hemi.groundColor.set(0x1a4028);
    hemi.intensity = 2.35;
    sun.color.set(0x90ffb8);
    sun.intensity = 2.15;
    fill.color.set(0x60c888);
    fill.intensity = .85;
    neonLights.forEach(light => { light.intensity = 5.2; light.distance = 18; });
    renderer.toneMappingExposure = 1.72;
  } else if (day) {
    scene.background.set(0xb0c8d0);
    scene.fog.color.set(0x9ab4bc);
    scene.fog.density = .012;
    hemi.color.set(0xe8f6ff);
    hemi.groundColor.set(0x2a3838);
    hemi.intensity = 1.85;
    sun.color.set(0xfff0d0);
    sun.intensity = 3.4;
    fill.color.set(0x607880);
    fill.intensity = .35;
    neonLights.forEach(light => { light.intensity = 2.2; light.distance = 14; });
    renderer.toneMappingExposure = 1.22;
  } else {
    // Standard night (no NVG) — brighter than before so non-NVG ops stay playable.
    scene.background.set(0x101a24);
    scene.fog.color.set(0x1a2834);
    scene.fog.density = .014;
    hemi.color.set(0x9ab4c4);
    hemi.groundColor.set(0x121a22);
    hemi.intensity = 1.45;
    sun.color.set(0xa0b8d0);
    sun.intensity = 1.55;
    fill.color.set(0x506878);
    fill.intensity = .48;
    neonLights.forEach(light => { light.intensity = 5.0; light.distance = 16; });
    renderer.toneMappingExposure = 1.42;
  }
}

let lastCameraTime=performance.now(),lastCameraVehicle=-1;
const chaseTarget=new THREE.Vector3();
function updateCamera(frame) {
  const now=performance.now(),cameraDt=Math.min(.05,(now-lastCameraTime)/1000);lastCameraTime=now;
  const source = frame.camera;
  const finisher = frame.finisherCam;
  if (finisher?.active) {
    const t = 1 - Math.max(0, finisher.timer) / Math.max(.01, finisher.duration || .95);
    const orbit = finisher.angle + t * 1.35;
    const dist = 1.55 - t * .25;
    camera.position.set(
      finisher.x + Math.cos(orbit) * dist,
      (finisher.z || .5) + .85 + Math.sin(t * Math.PI) * .25,
      finisher.y + Math.sin(orbit) * dist
    );
    camera.lookAt(finisher.x, (finisher.z || .5) + .7, finisher.y);
    camera.fov = THREE.MathUtils.radToDeg((frame.fov || Math.PI / 3) * (.92 - t * .08));
    camera.updateProjectionMatrix();
    fpWeaponRoot.visible = false;
    return;
  }
  const shake = Math.max(0, frame.screenShake || 0);
  // Deterministic micro-shake so it feels like camera mass, not noise spam.
  const t = frame.totalTime || 0;
  const sx = Math.sin(t * 47.3) * shake * .045 + Math.sin(t * 91.1) * shake * .02;
  const sy = Math.cos(t * 53.7) * shake * .032 + Math.sin(t * 77.4) * shake * .015;
  const sz = Math.sin(t * 61.2) * shake * .04;
  const third=frame.viewMode==='third'&&frame.player.carIndex<0&&!finisher?.active;
  if(third){const p=frame.player;let distance=3;for(let d=.25;d<=3;d+=.25){const x=p.x-Math.cos(p.dir)*d,y=p.y-Math.sin(p.dir)*d,type=bridge.world.map[Math.floor(y)]?.[Math.floor(x)];if(type===undefined||(type&&bridge.world.WALL_HEIGHTS[type]>p.z+1.2)||(bridge.world.covers||[]).some(c=>Math.abs(x-c.x)<c.w/2+.15&&Math.abs(y-c.y)<c.d/2+.15&&c.height>p.z+1.2)){distance=Math.max(.2,d-.25);break;}}camera.position.set(p.x-Math.cos(p.dir)*distance,p.z+1.65,p.y-Math.sin(p.dir)*distance);camera.lookAt(p.x+Math.cos(p.dir)*15,p.z+.72+(p.pitch||0)/Math.max(1,innerHeight)*18,p.y+Math.sin(p.dir)*15);fpWeaponRoot.visible=false;muzzleFlash.visible=muzzleBloom.visible=false;muzzleLight.intensity=0;return;}
  const vehicleIndex=frame.player.carIndex;
  if(vehicleIndex>=0&&lastCameraVehicle===vehicleIndex)camera.position.lerp(chaseTarget.set(source.x+sx,source.z+.72+sy,source.y+sz),1-Math.exp(-cameraDt*10));else camera.position.set(source.x+sx,source.z+.72+sy,source.y+sz);
  lastCameraVehicle=vehicleIndex;
  camera.rotation.order = 'YXZ';
  const cameraYaw=-(source.dir+Math.PI/2);if(vehicleIndex>=0){const delta=Math.atan2(Math.sin(cameraYaw-camera.rotation.y),Math.cos(cameraYaw-camera.rotation.y));camera.rotation.y+=delta*(1-Math.exp(-cameraDt*12));}else camera.rotation.y=cameraYaw;
  camera.rotation.x = THREE.MathUtils.clamp((source.pitch || 0) / Math.max(1, innerHeight) * 1.55, -.42, .42);
  // Strafe lean + recoil roll + shake.
  const roll = (source.roll || 0) + Math.sin(t * 38) * shake * .028;
  camera.rotation.z = THREE.MathUtils.clamp(roll, -.12, .12);
  const degrees = THREE.MathUtils.radToDeg(frame.fov || Math.PI / 3);
  if (Math.abs(camera.fov - degrees) > .03) { camera.fov = degrees; camera.updateProjectionMatrix(); }
  const inVehicle = frame.player.carIndex >= 0;
  fpWeaponRoot.visible = frame.mode === 'playing' && !inVehicle;
  if (!fpWeaponRoot.visible) {
    muzzleFlash.visible = false;
    muzzleBloom.visible = false;
    muzzleLight.intensity = 0;
    return;
  }
  const ads = frame.player.ads || 0, bob = frame.player.bob || 0, bobAmount = frame.player.bobAmount || 0;
  const recoil = frame.player.recoil || 0, kick = frame.player.recoilKick || recoil;
  const swayX = frame.player.swayX || 0, swayY = frame.player.swayY || 0;
  const strafe = frame.player.strafe || 0;
  // Idle micro-drift when not moving hard.
  const idle = Math.sin(t * 1.3) * .004 * (1 - bobAmount) * (1 - ads * .7);
  const portraitWeapon=coarse&&camera.aspect<1;
  fpWeaponRoot.scale.setScalar(portraitWeapon?.68:1);
  fpWeaponRoot.position.set(
    THREE.MathUtils.lerp(portraitWeapon?.18:.27, 0, ads) + Math.sin(bob) * .012 * bobAmount + swayX * .8 + strafe * .04 + idle,
    THREE.MathUtils.lerp(-.27, -.19, ads) + Math.abs(Math.cos(bob)) * .012 * bobAmount + kick * .06 + swayY * .6,
    THREE.MathUtils.lerp(-.58, -.44, ads) + kick * .14 + recoil * .04
  );
  const reloadProgress=frame.player.reloading?1-Math.max(0,frame.player.reloadTimer)/Math.max(.01,frame.player.reloadTime):0,reloadArc=frame.player.reloading?Math.sin(reloadProgress*Math.PI):0,melee=Math.max(0,frame.melee||0),sprintLower=ads<.08&&bobAmount>1.05?.14:0;
  fpWeaponRoot.rotation.set(
    -.035 + kick * .16 + recoil * .06 + reloadArc * .3 + swayY * 1.2,
    -.02 + reloadArc * .24 - melee * .5 + swayX * .9 + strafe * .05,
    Math.sin(bob) * .022 * bobAmount - reloadArc * .44 + sprintLower + strafe * .08
  );
  fpWeaponRoot.position.y -= reloadArc * .12 + sprintLower * .55;
  fpWeapons.forEach((weapon, index) => weapon.visible = index === frame.player.weaponIndex);
  const active = fpWeapons[frame.player.weaponIndex] || fpWeapons[0];
  // Slide / bolt kick on fire for a mechanical read.
  const slide = active.userData.slide;
  if (slide) {
    const kickZ = frame.muzzle > .05 ? .04 + frame.muzzle * .06 : 0;
    slide.position.z = THREE.MathUtils.lerp(slide.position.z, (frame.player.weaponIndex === 2 ? .02 : .08) + kickZ, .55);
  }
  const muzzleOn = frame.muzzle > .05;
  muzzleFlash.visible = muzzleOn;
  muzzleBloom.visible = muzzleOn;
  const mz = active.userData.muzzleZ || -.5;
  muzzleFlash.position.set(0, .03, mz);
  muzzleBloom.position.set(0, .03, mz - .02);
  muzzleFlash.scale.setScalar(.55 + frame.muzzle * 1.9);
  muzzleBloom.scale.setScalar(.75 + frame.muzzle * 2.1);
  muzzleBloom.material.opacity = Math.min(1, frame.muzzle * 1.05);
  muzzleFlash.rotation.z = t * 14 + frame.muzzle * 3;
  muzzleLight.position.copy(muzzleFlash.position);
  // Cheaper muzzle light — shorter range, still sells the flash.
  muzzleLight.intensity = frame.muzzle * 5.5;
  muzzleLight.distance = 2.8 + frame.muzzle * 1.4;
}

function syncGlass(frame) {
  if (lowPreset) return;
  for (const [key, object] of glassMeshes) object.visible = !frame.brokenGlass.has(key);
}

function cullLowWorld(frame) {
  if (!lowPreset) return;
  const x = frame.camera?.x ?? 12, y = frame.camera?.y ?? 12;
  for (const record of lowCullables) {
    record.object.visible = shouldRenderCullRecord(record, x, y, frame.brokenGlass);
  }
}

const accountGate=document.getElementById('accountGate');
function animate() {
  if(document.getElementById('weaponPreviewDialog')?.open)return;
  if(document.body.classList.contains('multiplayer-active'))return;
  // The opaque signup dialog fully covers the world; keep authentication responsive.
  if(accountGate&&!accountGate.classList.contains('hidden'))return;
  const frame = bridge.frame();
  syncWorldLayout(frame);
  updateEnvironment(frame);
  updateCamera(frame);
  cullLowWorld(frame);
  syncGlass(frame);
  syncEnemies(frame);
  syncCity(frame);
  syncDestroyNodes(frame);
  syncCars(frame);
  syncCorpses(frame);
  syncBlood(frame);
  syncProjectiles(frame);
  syncPickups(frame);
  syncParticles(frame);
  syncTracers(frame);
  syncCovers(frame);
  const target=frame.objectiveTarget||[12,12],markerBase=(frame.missionStage===1||frame.missionStage===2) ? .88 : .08;objectiveMarker.visible=frame.mode==='playing'&&frame.wavePhase!=='complete'&&!frame.finisherCam?.active;objectiveMarker.position.set(target[0],markerBase+Math.sin(frame.totalTime*3.2)*.045,target[1]);objectiveMarker.rotation.y=frame.totalTime*1.3;markerRing.scale.setScalar(1+Math.sin(frame.totalTime*4)*.12);markerDiamond.rotation.y=frame.totalTime*2.2;
  terminal.visible=frame.mode==='playing'&&(frame.missionStage===1||frame.missionStage===2);if(terminal.visible)terminal.position.set(target[0],frame.missionStage===1?.72:0,target[1]);
  terminalScreen.material.emissiveIntensity=2.4+Math.sin(frame.totalTime*4)*.8;extractionPad.visible=frame.missionStage>=4;extractionPad.rotation.y=frame.totalTime*.18;extractionBeam.material.opacity=.065+Math.sin(frame.totalTime*2.4)*.025;
  // Cinematic grade: grain clock + low-health red rim.
  if (compositeMat.uniforms.time) compositeMat.uniforms.time.value = frame.totalTime || 0;
  if (compositeMat.uniforms.hurt) {
    const hp = frame.player?.health, max = frame.player?.maxHealth || 100;
    compositeMat.uniforms.hurt.value = frame.mode === 'playing' && hp != null ? Math.max(0, Math.min(1, 1 - hp / Math.max(1, max * .38))) : 0;
  }
  renderFrame();
  tuneQuality();
}

// ---- Adaptive quality + post-processing -----------------------------------
// Hand-rolled bloom + vignette (no external passes — the deploy bundle only
// vendors three.module.min.js). An EMA of frame time steps quality up/down:
// Low uses .6x pixels with a hard large-screen pixel budget; higher levels
// retain their .92x / 1.15x / 1.4x limits and optional bloom.
const fx = { quality: lowPreset ? 0 : coarse ? 1 : 1, maxQuality: lowPreset ? 0 : coarse ? 2 : 2, ema: 16, lastTime: performance.now(), lastStep: performance.now() };
const postQuad = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fullscreen = new THREE.PlaneGeometry(2, 2);
let sceneTarget = null, bloomA = null, bloomB = null;
const brightMat = new THREE.ShaderMaterial({ uniforms: { tex: { value: null } }, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader: 'uniform sampler2D tex;varying vec2 vUv;void main(){vec3 c=texture2D(tex,vUv).rgb;float l=dot(c,vec3(.299,.587,.114));gl_FragColor=vec4(c*smoothstep(.58,.95,l),1.);}' });
const blurMat = new THREE.ShaderMaterial({ uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, texel: { value: new THREE.Vector2(1, 1) } }, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader: 'uniform sampler2D tex;uniform vec2 dir,texel;varying vec2 vUv;void main(){vec2 o=dir*texel;vec3 s=texture2D(tex,vUv).rgb*.227;s+=(texture2D(tex,vUv+o*1.38).rgb+texture2D(tex,vUv-o*1.38).rgb)*.316;s+=(texture2D(tex,vUv+o*3.23).rgb+texture2D(tex,vUv-o*3.23).rgb)*.07;gl_FragColor=vec4(s,1.);}' });
// Bloom + subtle vignette + film grain for a more cinematic grade.
const compositeMat = new THREE.ShaderMaterial({ uniforms: { tScene: { value: null }, tBloom: { value: null }, strength: { value: .9 }, time: { value: 0 }, hurt: { value: 0 } }, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader: `uniform sampler2D tScene,tBloom;uniform float strength,time,hurt;varying vec2 vUv;
void main(){
  vec3 col=texture2D(tScene,vUv).rgb+texture2D(tBloom,vUv).rgb*strength;
  float d=distance(vUv,vec2(.5));
  col*=1.-smoothstep(.5,.94,d)*.38;
  // Fine film grain
  float g=fract(sin(dot(vUv*vec2(12.9898,78.233)+time,vec2(43758.5453)))*43758.5453);
  col+= (g-.5)*.028;
  // Low-health red rim
  if(hurt>.01){col=mix(col,col*vec3(1.15,.72,.68),hurt*smoothstep(.35,.95,d));}
  gl_FragColor=vec4(col,1.);
#include <colorspace_fragment>
}` });
const postScene = new THREE.Scene();
const postMesh = new THREE.Mesh(fullscreen, compositeMat);
postMesh.frustumCulled = false;
postScene.add(postMesh);

function buildTargets() {
  const w = Math.max(2, Math.floor(innerWidth * renderer.getPixelRatio())), h = Math.max(2, Math.floor(innerHeight * renderer.getPixelRatio()));
  sceneTarget?.dispose(); bloomA?.dispose(); bloomB?.dispose();
  // No MSAA on the post buffer — bloom already softens edges; saves a lot of GPU.
  sceneTarget = new THREE.WebGLRenderTarget(w, h, { samples: 0 });
  bloomA = new THREE.WebGLRenderTarget(Math.max(2, w >> 3), Math.max(2, h >> 3));
  bloomB = new THREE.WebGLRenderTarget(Math.max(2, w >> 3), Math.max(2, h >> 3));
  blurMat.uniforms.texel.value.set(1 / Math.max(1, w >> 3), 1 / Math.max(1, h >> 3));
}

function postPass(material, target) {
  postMesh.material = material;
  renderer.setRenderTarget(target);
  renderer.render(postScene, postQuad);
}

function renderFrame() {
  // Same cost path for all ops — NVG no longer forces an extra full-screen pass.
  if (fx.quality < 2) { renderer.render(scene, camera); return; }
  if (!sceneTarget) buildTargets();
  renderer.setRenderTarget(sceneTarget);
  renderer.render(scene, camera);
  brightMat.uniforms.tex.value = sceneTarget.texture; postPass(brightMat, bloomA);
  blurMat.uniforms.tex.value = bloomA.texture; blurMat.uniforms.dir.value.set(1, 0); postPass(blurMat, bloomB);
  blurMat.uniforms.tex.value = bloomB.texture; blurMat.uniforms.dir.value.set(0, 1); postPass(blurMat, bloomA);
  compositeMat.uniforms.tScene.value = sceneTarget.texture; compositeMat.uniforms.tBloom.value = bloomA.texture;
  postMesh.material = compositeMat;
  renderer.setRenderTarget(null);
  renderer.render(postScene, postQuad);
}

function applyQuality() {
  renderer.setPixelRatio(renderPixelRatio(innerWidth,innerHeight,devicePixelRatio,fx.quality));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = fx.quality >= 1;
  renderer.shadowMap.autoUpdate = fx.quality >= 2;
  sun.castShadow = fx.quality >= 1;
  for(const light of neonLights)light.visible=fx.quality>=1;
  terminalLight.visible=fx.quality>=1;muzzleLight.visible=fx.quality>=1;
  // Transmission renders an additional scene target; ordinary transparent
  // glass preserves visibility/destruction on low without that extra pass.
  const transmission=fx.quality===0?0:.55;
  if(glassMaterial.transmission!==transmission){glassMaterial.transmission=transmission;glassMaterial.needsUpdate=true;}
  if (fx.quality >= 2) buildTargets();
}

function tuneQuality() {
  const now = performance.now(), dt = Math.min(200, now - fx.lastTime); fx.lastTime = now;
  fx.ema += (dt - fx.ema) * .05;
  if (fx.forced != null || now - fx.lastStep < 2500) return;
  if (fx.ema > 24 && fx.quality > 0) { fx.quality--; fx.lastStep = now; applyQuality(); }
  else if (fx.ema < 13 && fx.quality < fx.maxQuality) { fx.quality++; fx.lastStep = now; applyQuality(); }
}

window.__NEON_FX__ = { quality: () => fx.quality, frameMs: () => fx.ema, post: () => fx.quality >= 2,
  // Test/dev hook: pin a quality level (pass null to resume auto-scaling).
  force: level => { fx.forced = level === null ? null : Math.max(0, Math.min(3, level | 0)); if (fx.forced !== null) { fx.quality = fx.forced; applyQuality(); } } };
window.__NEON_RENDER_STATS__ = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, points: renderer.info.render.points, lines: renderer.info.render.lines, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries,localPlayerVisible:localPlayerModel.visible,civilianCount:civilianModels.size,shopVisible:shopRoot.visible,wallCells:wallMeshes.size,wallBatches:[...wallBatches.values()].filter(o=>o.count>0).length });

addEventListener('resize', () => {
  applyQuality();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

applyQuality();
renderer.setAnimationLoop(animate);
bridge.ready();
