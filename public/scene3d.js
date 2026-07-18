import * as THREE from '/vendor/three.module.min.js';
import { cacheWorldCullRecord, shouldRenderCullRecord } from '/render-utils.js';

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
const concrete = mat(0x5a6c70, .88, .06);
const violetWall = mat(0x4a4060, .74, .18);
const amberWall = mat(0x6a5440, .78, .12);
const glassMaterial = new THREE.MeshPhysicalMaterial({ color: 0xa8e8f5, transmission: .55, transparent: true, opacity: .48, roughness: .1, metalness: .04, thickness: .08, side: THREE.DoubleSide, emissive: 0x1a3040, emissiveIntensity: .15 });
const wallMaterials = { 1: concrete, 2: violetWall, 3: amberWall, 4: glassMaterial };

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
  setTimeout(() => clearInterval(poll), 4000);
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
  const ground = mesh(new THREE.PlaneGeometry(58, 58), mat(0x2a3538, .94, .03), false, true);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(MAP_W / 2, -.025, MAP_H / 2);
  ground.userData.lowCullAlwaysVisible = true;
  worldRoot.add(ground);

  // Ground grid for depth readability.
  const grid = new THREE.GridHelper(48, 48, 0x3a5558, 0x243438);
  grid.position.set(MAP_W / 2, .002, MAP_H / 2);
  grid.material.transparent = true;
  grid.material.opacity = .35;
  worldRoot.add(grid);

  const roadMaterial = mat(0x1e262b, .9, .05);
  const roadA = mesh(new THREE.PlaneGeometry(5.3, MAP_H - 2), roadMaterial, false, true);
  roadA.rotation.x = -Math.PI / 2;
  roadA.position.set(12, .006, 12);
  roadA.userData.lowCullAlwaysVisible = true;
  const roadB = roadA.clone();
  roadB.geometry = new THREE.PlaneGeometry(MAP_W - 2, 5.3);
  roadB.userData.lowCullAlwaysVisible = true;
  worldRoot.add(roadA, roadB);

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

  for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) {
    const type = map[y][x];
    if (!type) continue;
    const boundary = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
    const height = boundary ? 2.55 : (WALL_HEIGHTS[type] || 1.4);
    const wall = mesh(new THREE.BoxGeometry(.98, height, .98), wallMaterials[type] || concrete, type !== 4, true);
    wall.position.set(x + .5, height / 2, y + .5);
    wall.userData.cellKey = `${x},${y}`;
    wall.userData.glass = type === 4;
    if (type === 4) glassMeshes.set(wall.userData.cellKey, wall);
    worldRoot.add(wall);
  }

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
  for (const [x, z, rotation] of [[8.8,9.15,.1],[14.9,9.2,-.12],[8.85,14.85,.2],[15.05,14.8,-.18],[3.2,12.5,.05],[20.75,13.8,-.08]]) {
    const stack = new THREE.Group();
    for (let i=0;i<2;i++){const crate=mesh(new THREE.BoxGeometry(.62,.48,.62),crateMaterial);crate.position.set((i%2)*.28,.24+i*.45,(i%2)*.08);const band=mesh(new THREE.BoxGeometry(.66,.07,.66),darkMetal);band.position.copy(crate.position);stack.add(crate,band);}
    stack.position.set(x,0,z);stack.rotation.y=rotation;worldRoot.add(stack);
  }
  for (const [x,z,r] of [[10.2,8.8,.2],[13.8,15.2,-.18],[7.8,12.7,Math.PI/2],[16.2,11.1,Math.PI/2]]) {
    const barrier=mesh(new THREE.BoxGeometry(1.35,.48,.24),mat(0x545c5d,.86,.18));barrier.position.set(x,.24,z);barrier.rotation.y=r;const stripe=mesh(new THREE.BoxGeometry(1.12,.075,.255),new THREE.MeshStandardMaterial({color:0xffbb55,emissive:0xff8c36,emissiveIntensity:.7}));stripe.position.set(x,.3,z);stripe.rotation.y=r;worldRoot.add(barrier,stripe);
  }
}

const glassMeshes = new Map();
buildWorld();
const lowCullables = [];
if (lowPreset) {
  worldRoot.updateMatrixWorld(true);
  const worldPosition = new THREE.Vector3();
  worldRoot.traverse(object => {
    if (object.isMesh) lowCullables.push(cacheWorldCullRecord(object, worldPosition));
  });
}

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

function limb(radius, length, material) {
  const part = mesh(new THREE.CapsuleGeometry(radius, Math.max(.01, length - radius * 2), 4, 7), material, true, true);
  part.position.y = -length / 2;
  return part;
}

function createHuman(type = 'specter', variant = 0, elite = false, commander = false) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const spec = bridge.world.enemyTypes?.[type] || {};
  const body3d = spec.body || { wraith: 'scout', specter: 'trooper', titan: 'heavy' }[type] || 'trooper';
  const colors = {
    scout: [0x2a4548, 0x314a42, 0x2c3d4d],
    trooper: [0x3a3254, 0x323a4d, 0x4a3548],
    heavy: [0x4d3a36, 0x3e444a, 0x523c38]
  };
  const skins = [0x8d5a42, 0xc48a62, 0xe0b08a];
  const uniform = bodyMat(body3d, colors[body3d][variant % 3], .78, .22);
  const armor = mat(0x0d1418, .38, .78);
  const skin = mat(skins[variant % 3], .86, .04);
  const accentColor=commander?0xffd166:spec.color?new THREE.Color(spec.color).getHex():0x31f5db;
  const accent = new THREE.MeshStandardMaterial({ color:accentColor, emissive:accentColor, emissiveIntensity: elite ? 2.6 : 1.1, roughness: .34, metalness: .62 });
  const scale = body3d === 'heavy' ? 1.2 : body3d === 'scout' ? .92 : 1;

  // More human proportions: narrower waist, broader chest, layered armor plates.
  const pelvis = mesh(new THREE.BoxGeometry(.34, .2, .22), armor);
  pelvis.position.y = .78;
  const torso = mesh(new THREE.CapsuleGeometry(.22, .38, 6, 10), uniform);
  torso.scale.set(1.15, 1, .85);
  torso.position.y = 1.18;
  const chest = mesh(new THREE.BoxGeometry(.5, .36, .2), armor);
  chest.position.set(0, 1.28, -.08);
  const vest = mesh(new THREE.BoxGeometry(.46, .4, .1), bodyMat(body3d, 0x1a2228, .45, .55));
  vest.position.set(0, 1.22, -.18);
  const abs = mesh(new THREE.BoxGeometry(.34, .2, .14), uniform);
  abs.position.set(0, 1.0, -.06);
  const chestLight = mesh(new THREE.BoxGeometry(.12, .03, .03), accent, false, false);
  chestLight.position.set(0, 1.38, -.24);
  const neck = mesh(new THREE.CylinderGeometry(.07, .09, .12, 10), skin);
  neck.position.y = 1.52;
  const headPivot = new THREE.Group();
  headPivot.position.y = 1.66;
  const head = mesh(new THREE.SphereGeometry(.175, 16, 12), skin);
  head.scale.set(.92, 1.06, .94);
  const hair = mesh(new THREE.SphereGeometry(.185, 14, 8, 0, Math.PI * 2, 0, Math.PI * .52), mat(variant === 2 ? 0x2a1810 : 0x0a0b0c, .92, .02));
  hair.position.y = .04;
  const brow = mesh(new THREE.BoxGeometry(.16, .03, .04), mat(0x1a120e, .9, .02));
  brow.position.set(0, .04, -.15);
  const nose = mesh(new THREE.ConeGeometry(.022, .07, 6), skin);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -.01, -.175);
  // Tactical helmet / mask for armored types
  if (body3d !== 'scout' || commander || elite) {
    const helm = mesh(new THREE.SphereGeometry(.19, 14, 10, 0, Math.PI * 2, 0, Math.PI * .55), armor);
    helm.position.y = .02;
    const visor = mesh(new THREE.BoxGeometry(.2, .05, .04), accent, false, false);
    visor.position.set(0, .02, -.16);
    headPivot.add(helm, visor);
  }
  headPivot.add(head, hair, brow, nose);
  body.add(pelvis, torso, chest, vest, abs, chestLight, neck, headPivot);

  const leftArm = new THREE.Group(), rightArm = new THREE.Group();
  leftArm.position.set(-.36, 1.4, 0);
  rightArm.position.set(.36, 1.4, 0);
  const shoulderL = mesh(new THREE.SphereGeometry(.1, 10, 8), armor);
  const shoulderR = mesh(new THREE.SphereGeometry(.1, 10, 8), armor);
  leftArm.add(shoulderL); rightArm.add(shoulderR);
  leftArm.add(limb(.085, .56, uniform));
  rightArm.add(limb(.085, .56, uniform));
  const leftHand = mesh(new THREE.SphereGeometry(.078, 10, 8), skin);
  const rightHand = leftHand.clone();
  leftHand.position.y = rightHand.position.y = -.56;
  const gloveL = mesh(new THREE.BoxGeometry(.1, .08, .12), armor); gloveL.position.y = -.52;
  const gloveR = gloveL.clone();
  leftArm.add(leftHand, gloveL);
  rightArm.add(rightHand, gloveR);
  body.add(leftArm, rightArm);
  if(commander){for(const side of [-1,1]){const pauldron=mesh(new THREE.BoxGeometry(.3,.14,.36),accent);pauldron.position.set(side*.4,1.42,0);pauldron.rotation.z=side*.12;body.add(pauldron);}}

  const leftLeg = new THREE.Group(), rightLeg = new THREE.Group();
  leftLeg.position.set(-.14, .76, 0);
  rightLeg.position.set(.14, .76, 0);
  const leftThigh = limb(.1, .44, uniform), rightThigh = limb(.1, .44, uniform);
  const leftKnee = new THREE.Group(), rightKnee = new THREE.Group();
  leftKnee.position.y = rightKnee.position.y = -.42;
  leftKnee.add(limb(.085, .42, armor));
  rightKnee.add(limb(.085, .42, armor));
  const leftBoot = mesh(new THREE.BoxGeometry(.18, .12, .34), blackMetal);
  const rightBoot = leftBoot.clone();
  leftBoot.position.set(0, -.42, -.06);
  rightBoot.position.copy(leftBoot.position);
  leftKnee.add(leftBoot);
  rightKnee.add(rightBoot);
  leftLeg.add(leftThigh, leftKnee);
  rightLeg.add(rightThigh, rightKnee);
  body.add(leftLeg, rightLeg);

  // Role-accurate weapon held in the right hand (readable silhouette at distance).
  const weaponId = type === 'raven' ? 'dmr' : type === 'titan' || type === 'warden' ? 'rifle' : type === 'stalker' ? 'pistol' : type === 'wraith' ? 'pistol' : 'rifle';
  const weapon = createWeaponModel(weaponId, accentColor);
  const isSidearm = weaponId === 'pistol';
  // Grip sits in the glove; barrel points along arm-forward (-Z after arm raise).
  weapon.scale.setScalar(isSidearm ? .72 : .85);
  weapon.position.set(0.02, -.52, -.08);
  weapon.rotation.set(-1.42, 0, .06);
  rightArm.add(weapon);
  // Per-enemy muzzle flash at the barrel tip (world-readable return fire).
  const enemyMuzzle = mesh(new THREE.OctahedronGeometry(.07, 0), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 1 }), false, false);
  const enemyMuzzleBloom = mesh(new THREE.PlaneGeometry(.18, .18), new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: .7, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), false, false);
  enemyMuzzleBloom.rotation.y = Math.PI / 2;
  const muzzleLocalZ = (weapon.userData.muzzleZ || -.55) * weapon.scale.x;
  enemyMuzzle.position.set(0, .02, muzzleLocalZ);
  enemyMuzzleBloom.position.set(0, .02, muzzleLocalZ - .02);
  enemyMuzzle.visible = false;
  enemyMuzzleBloom.visible = false;
  weapon.add(enemyMuzzle, enemyMuzzleBloom);
  root.userData.enemyMuzzle = enemyMuzzle;
  root.userData.enemyMuzzleBloom = enemyMuzzleBloom;

  const roleFx = new THREE.Group();
  body.add(roleFx);
  const role = spec.role || 'support';
  if (role === 'sniper' || type === 'raven') {
    const glint = mesh(new THREE.SphereGeometry(.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd257, emissive: 0xffd257, emissiveIntensity: 5, transparent: true, opacity: .95 }), false, false);
    glint.position.set(0, 1.7, -.2);
    const beam = mesh(new THREE.CylinderGeometry(.006, .006, 2.6, 5), new THREE.MeshStandardMaterial({ color: 0xffd257, emissive: 0xffaa33, emissiveIntensity: 3, transparent: true, opacity: .28, depthWrite: false }), false, false);
    beam.rotation.x = Math.PI / 2;
    beam.position.set(0, 1.52, -1.4);
    roleFx.add(glint, beam);
    root.userData.sniperBeam = beam;
    root.userData.sniperGlint = glint;
  }
  if (spec.shieldBlock || type === 'warden') {
    const shield = mesh(new THREE.TorusGeometry(.52, .03, 6, 20, Math.PI * 1.05), new THREE.MeshStandardMaterial({ color: 0x489bff, emissive: 0x2a7dff, emissiveIntensity: 2.2, transparent: true, opacity: .55, side: THREE.DoubleSide }), false, false);
    shield.rotation.y = Math.PI;
    shield.position.set(0, 1.15, -.3);
    roleFx.add(shield);
    root.userData.shieldArc = shield;
  }
  if (role === 'rusher' || type === 'stalker') {
    const trail = mesh(new THREE.ConeGeometry(.1, .5, 6), new THREE.MeshStandardMaterial({ color: 0xff536d, emissive: 0xff294d, emissiveIntensity: 2.4, transparent: true, opacity: .5 }), false, false);
    trail.rotation.x = Math.PI / 2;
    trail.position.set(0, .88, .42);
    roleFx.add(trail);
    root.userData.dashTrail = trail;
  }
  if (spec.charge || type === 'titan') {
    const telegraph = mesh(new THREE.RingGeometry(.32, .46, 18), new THREE.MeshStandardMaterial({ color: 0xff8c57, emissive: 0xff6a30, emissiveIntensity: 2, transparent: true, opacity: 0, side: THREE.DoubleSide }), false, false);
    telegraph.rotation.x = -Math.PI / 2;
    telegraph.position.y = .04;
    roleFx.add(telegraph);
    root.userData.chargeRing = telegraph;
  }
  const rim = mesh(new THREE.SphereGeometry(.55, 12, 10), new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: .3, transparent: true, opacity: .06, depthWrite: false, side: THREE.BackSide }), false, false);
  rim.position.y = 1.05;
  roleFx.add(rim);
  root.userData.rim = rim;

  body.scale.setScalar(scale * (elite ? 1.08 : 1) * (commander?1.1:1));
  root.userData.rig = { body, torso, headPivot, leftArm, rightArm, leftLeg, rightLeg, leftKnee, rightKnee, weapon, baseScale: scale * (elite ? 1.08 : 1) };
  return root;
}

function animateHuman(group, enemy, time) {
  const rig = group.userData.rig;
  const speed = Math.hypot(enemy.vx || 0, enemy.vy || 0);
  const run = Math.min(1, speed / 1.55);
  const phase = enemy.anim || time * 8;
  // Weightier walk: longer stride, opposite arm swing, hip counter-rotate.
  const stride = Math.sin(phase) * 1.05 * run;
  const grounded = enemy.grounded !== false;
  const aiming = !!(enemy.combatState === 'engage' || enemy.combatState === 'hold' || (enemy.muzzleFlash || 0) > 0 || (enemy.fireCooldown || 0) > 0 && (enemy.awareness || 0) > .4);
  const shooting = (enemy.muzzleFlash || 0) > 0;
  rig.body.rotation.set(0, Math.sin(phase) * .06 * run, Math.sin(phase) * .04 * run);
  rig.body.position.y = grounded ? Math.abs(Math.sin(phase * 2)) * .04 * run : .02;
  rig.leftLeg.rotation.x = grounded ? stride : -.48;
  rig.rightLeg.rotation.x = grounded ? -stride : -.48;
  rig.leftKnee.rotation.x = grounded ? Math.max(0, -stride) * .65 : .95;
  rig.rightKnee.rotation.x = grounded ? Math.max(0, stride) * .65 : .95;
  if (aiming) {
    // Both arms raise into a two-handed rifle / pistol hold, barrel toward target.
    const kick = shooting ? -.18 : 0;
    rig.rightArm.rotation.x = -1.55 + kick;
    rig.rightArm.rotation.z = .08;
    rig.rightArm.rotation.y = -.12;
    rig.leftArm.rotation.x = -1.35;
    rig.leftArm.rotation.z = -.42;
    rig.leftArm.rotation.y = .28;
    if (rig.weapon) {
      rig.weapon.rotation.x = -1.42 + kick * .5;
      rig.weapon.rotation.z = shooting ? .06 : 0;
    }
  } else {
    rig.leftArm.rotation.x = grounded ? -stride * .72 - .28 : -.7;
    rig.rightArm.rotation.x = grounded ? stride * .72 - .28 : -.7;
    rig.leftArm.rotation.z = -.14 - run * .05;
    rig.rightArm.rotation.z = .14 + run * .05;
    rig.leftArm.rotation.y = 0;
    rig.rightArm.rotation.y = 0;
    if (rig.weapon) {
      rig.weapon.rotation.x = -1.42;
      rig.weapon.rotation.z = 0;
    }
  }
  if(enemy.reloadTimer>0){const reloadWave=Math.sin(Math.min(1,enemy.reloadTimer/1.5)*Math.PI);rig.leftArm.rotation.x=-1.08;rig.rightArm.rotation.x=-.92;rig.leftArm.rotation.z=-.35;rig.leftArm.rotation.y=0;rig.rightArm.rotation.y=0;if(rig.weapon)rig.weapon.rotation.z=-.28*reloadWave;}
  // Enemy muzzle flash at barrel — bright and short so return fire is obvious.
  const flash = Math.max(0, enemy.muzzleFlash || 0);
  const em = group.userData.enemyMuzzle;
  const emb = group.userData.enemyMuzzleBloom;
  if (em && emb) {
    const on = flash > .05;
    em.visible = on;
    emb.visible = on;
    if (on) {
      em.scale.setScalar(.7 + flash * 2.4);
      emb.scale.setScalar(1 + flash * 2.8);
      emb.material.opacity = Math.min(1, flash * 1.1);
      em.rotation.z = time * 18 + flash * 4;
    }
  }
  rig.torso.rotation.z = Math.sin(phase) * .035 * run;
  rig.torso.rotation.x = run * .075+(enemy.hitFlash>0?(Math.random()-.5)*.16:0)+(shooting?-.08:0);
  rig.headPivot.rotation.y = Math.sin(time * .7 + enemy.x) * .045;
  const squash = Math.max(0, enemy.landingSquash || 0);
  group.scale.set(1 + squash * .09, 1 - squash * .12, 1 + squash * .09);
  // Cloak: drop opacity while active, restore base material state afterward.
  const cloaked = (enemy.cloakTimer || 0) > 0;
  group.traverse(child => {
    if (!child.isMesh || !child.material) return;
    if (child.userData.baseOpacity === undefined) {
      child.userData.baseOpacity = child.material.opacity ?? 1;
      child.userData.baseTransparent = !!child.material.transparent;
    }
    if (cloaked) {
      child.material.transparent = true;
      child.material.opacity = Math.min(.28, child.userData.baseOpacity);
    } else {
      child.material.opacity = child.userData.baseOpacity;
      child.material.transparent = child.userData.baseTransparent;
    }
  });
  if (group.userData.sniperGlint) {
    const pulse = .6 + Math.sin(time * 9) * .4;
    group.userData.sniperGlint.material.emissiveIntensity = 3 + pulse * 4;
    if (group.userData.sniperBeam) group.userData.sniperBeam.material.opacity = .18 + pulse * .22;
  }
  if (group.userData.shieldArc) {
    group.userData.shieldArc.material.opacity = .4 + Math.sin(time * 5) * .15;
    group.userData.shieldArc.rotation.z = Math.sin(time * 2) * .08;
  }
  if (group.userData.dashTrail) {
    const dashing = (enemy.dodgeTimer || 0) > 0 || run > .75;
    group.userData.dashTrail.visible = dashing;
    group.userData.dashTrail.material.opacity = dashing ? .45 + run * .35 : 0;
  }
  if (group.userData.chargeRing) {
    const charging = (enemy.chargeTimer || 0) > 0;
    group.userData.chargeRing.material.opacity = charging ? .55 + Math.sin(time * 14) * .35 : 0;
    if (charging) group.userData.chargeRing.scale.setScalar(1 + (1 - Math.min(1, enemy.chargeTimer / .68)) * 1.4);
  }
  if (group.userData.rim) group.userData.rim.material.opacity = cloaked ? .02 : (enemy.elite || enemy.commander ? .14 : .07);
}

function createCar(color = '#31f5db') {
  const root = new THREE.Group();
  const paint = mat(new THREE.Color(color), .25, .82);
  const body = mesh(new THREE.BoxGeometry(1.65, .34, .82), paint);
  body.position.y = .34;
  const hood = mesh(new THREE.BoxGeometry(.58, .18, .78), paint);
  hood.position.set(.78, .53, 0);
  const cabin = mesh(new THREE.BoxGeometry(.72, .42, .7), new THREE.MeshPhysicalMaterial({ color: 0x13252d, roughness: .16, metalness: .45, transmission: .08 }));
  cabin.position.set(-.12, .63, 0);
  cabin.rotation.z = -.06;
  const bumper = mesh(new THREE.BoxGeometry(.12, .16, .84), darkMetal);
  bumper.position.set(.88, .23, 0);
  const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xeaffff, emissive: 0xc8ffff, emissiveIntensity: 5 });
  for (const z of [-.27, .27]) {
    const light = mesh(new THREE.BoxGeometry(.025, .1, .18), lightMaterial, false, false);
    light.position.set(.95, .42, z);
    root.add(light);
  }
  const wheels = [];
  for (const x of [-.55, .57]) for (const z of [-.46, .46]) {
    const wheel = mesh(new THREE.CylinderGeometry(.19, .19, .15, 14), blackMetal);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, .2, z);
    wheels.push(wheel);
    root.add(wheel);
  }
  root.add(body, hood, cabin, bumper);
  root.userData.wheels = wheels;
  return root;
}

function createWeaponModel(id, color) {
  const root = new THREE.Group();
  // Tactical dark receivers with a thin accent rail — reads more like real kit than neon plastic.
  const paint = mat(0x1c2228, .42, .55);
  const polymer = mat(0x12161a, .62, .22);
  const accent = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, metalness: .5, roughness: .35 });
  const isPistol = id === 'pistol', isShotgun = id === 'shotgun', isDmr = id === 'dmr';
  const bodyLen = isPistol ? .4 : isShotgun ? .82 : isDmr ? .9 : .72;
  const bodyH = isPistol ? .11 : isShotgun ? .13 : .12;
  const bodyW = isPistol ? .075 : isShotgun ? .11 : .095;
  const receiver = mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyLen), paint, false, false);
  const upper = mesh(new THREE.BoxGeometry(bodyW * .88, bodyH * .5, bodyLen * .78), blackMetal, false, false);
  upper.position.set(0, bodyH * .48, -bodyLen * .04);
  // Picatinny rail
  const rail = mesh(new THREE.BoxGeometry(bodyW * .55, .02, bodyLen * .7), darkMetal, false, false);
  rail.position.set(0, bodyH * .72, -bodyLen * .06);
  const barrelLength = isPistol ? .2 : isShotgun ? .64 : isDmr ? .78 : .52;
  const barrelR = isShotgun ? .038 : isDmr ? .02 : .026;
  const barrel = mesh(new THREE.CylinderGeometry(barrelR * .85, barrelR, barrelLength, 10), blackMetal, false, false);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, .015, -bodyLen / 2 - barrelLength / 2 + .05);
  // Handguard / pump
  if (!isPistol) {
    const guard = mesh(new THREE.BoxGeometry(bodyW * 1.05, bodyH * .85, isShotgun ? .28 : .32), polymer, false, false);
    guard.position.set(0, -.02, -bodyLen * .22);
    root.add(guard);
  }
  // Muzzle device — brake / choke / flash hider
  const brake = mesh(new THREE.CylinderGeometry(barrelR * (isShotgun ? 1.5 : 1.4), barrelR * 1.1, isShotgun ? .09 : isDmr ? .07 : .055, 8), darkMetal, false, false);
  brake.rotation.x = Math.PI / 2;
  brake.position.set(0, .015, barrel.position.z - barrelLength / 2 + .015);
  // Charging handle / slide
  const slide = mesh(new THREE.BoxGeometry(bodyW * .4, bodyH * .25, isPistol ? .18 : .12), darkMetal, false, false);
  slide.position.set(0, bodyH * .55, isPistol ? .02 : bodyLen * .12);
  const grip = mesh(new THREE.BoxGeometry(bodyW * .95, isPistol ? .3 : .34, .13), polymer, false, false);
  grip.position.set(0, -.22, isPistol ? .05 : .1);
  grip.rotation.x = isPistol ? -.38 : -.24;
  // Magwell + mag
  const mag = mesh(new THREE.BoxGeometry(bodyW * .72, isShotgun ? .09 : .3, isPistol ? .1 : .13), blackMetal, false, false);
  mag.position.set(0, isShotgun ? -.11 : -.2, isPistol ? .0 : -.02);
  mag.rotation.x = isShotgun ? 0 : -.1;
  const stock = isPistol ? null : mesh(new THREE.BoxGeometry(bodyW * .65, bodyH * .65, isShotgun ? .24 : isDmr ? .32 : .3), polymer, false, false);
  if (stock) {
    stock.position.set(0, -.015, bodyLen / 2 - .02);
    const stockPad = mesh(new THREE.BoxGeometry(bodyW * .75, bodyH * .85, .04), mat(0x0a0c0e, .8, .1), false, false);
    stockPad.position.set(0, 0, .14);
    stock.add(stockPad);
  }
  // Iron sights / optic
  const frontSight = mesh(new THREE.BoxGeometry(.02, .05, .02), darkMetal, false, false);
  frontSight.position.set(0, bodyH / 2 + .05, -bodyLen * .35);
  const rearSight = mesh(new THREE.BoxGeometry(.04, .04, .03), darkMetal, false, false);
  rearSight.position.set(0, bodyH / 2 + .04, bodyLen * .2);
  const accentStrip = mesh(new THREE.BoxGeometry(.012, .015, bodyLen * .35), accent, false, false);
  accentStrip.position.set(bodyW * .48, bodyH * .2, -bodyLen * .05);
  if (isDmr) {
    const scope = mesh(new THREE.CylinderGeometry(.038, .038, .26, 10), blackMetal, false, false);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, bodyH / 2 + .09, -.06);
    const scopeRing = mesh(new THREE.TorusGeometry(.042, .008, 6, 12), darkMetal, false, false);
    scopeRing.position.copy(scope.position);
    root.add(scope, scopeRing);
  }
  // Side photo card for silhouette (async texture) — lower poly cost than extra geo.
  const card = mesh(new THREE.PlaneGeometry(isPistol ? .26 : .48, isPistol ? .16 : .2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .6, metalness: .12, transparent: true, opacity: .88, side: THREE.DoubleSide }), false, false);
  card.position.set(bodyW * .52, .01, -bodyLen * .04);
  card.rotation.y = Math.PI / 2;
  const applyWeaponTex = () => {
    const map = weaponTextures[id] || weaponTextures.rifle;
    if (!map) return;
    card.material.map = map;
    card.material.needsUpdate = true;
  };
  applyWeaponTex();
  const poll = setInterval(() => { if (weaponTextures[id] || weaponTextures.rifle) { applyWeaponTex(); clearInterval(poll); } }, 150);
  setTimeout(() => clearInterval(poll), 3500);

  root.add(receiver, upper, rail, barrel, brake, slide, grip, mag, frontSight, rearSight, accentStrip, card);
  if (stock) root.add(stock);
  root.userData.muzzleZ = barrel.position.z - barrelLength / 2;
  root.userData.slide = slide;
  root.userData.barrel = barrel;
  return root;
}

const fpWeaponRoot = new THREE.Group();
const fpWeapons = [
  createWeaponModel('rifle', 0x31f5db),
  createWeaponModel('shotgun', 0xffbb55),
  createWeaponModel('pistol', 0xa66cff),
  createWeaponModel('dmr', 0xffd257)
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

function prune(set, current) {
  for (const object of set) if (!current.has(object)) { object.parent?.remove(object); set.delete(object); }
}

function syncEnemies(frame) {
  const current = frameSets.enemies; current.clear();
  for (const enemy of frame.enemies) {
    let object = enemyMeshes.get(enemy);
    if (!object) { object = createHuman(enemy.type, enemy.variant || 0, enemy.elite,enemy.commander); enemyMeshes.set(enemy, object); actorRoot.add(object); rendered.enemies.add(object); }
    current.add(object);
    object.visible = !enemy.dead && enemy.spawn < .98;
    object.position.set(enemy.x, Math.max(0, (enemy.z || .5) - .5), enemy.y);
    object.rotation.y = -(enemy.facing || 0) - Math.PI / 2;
    animateHuman(object, enemy, frame.totalTime);
  }
  prune(rendered.enemies, current);
}

function syncDestroyNodes(frame) {
  const nodes = frame.destroyNodes || [];
  const current = new Set();
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

function syncCars(frame) {
  const current = frameSets.cars; current.clear();
  for (const car of frame.cars) {
    let object = carMeshes.get(car);
    if (!object) { object = createCar(car.color); carMeshes.set(car, object); actorRoot.add(object); rendered.cars.add(object); }
    current.add(object);
    object.visible = !car.destroyed;
    object.position.set(car.x, 0, car.y);
    object.rotation.y = -car.dir;
    for (const wheel of object.userData.wheels) wheel.rotation.z -= (car.speed || 0) * .028;
  }
  prune(rendered.cars, current);
}

function syncCorpses(frame) {
  const current = frameSets.corpses; current.clear();
  for (const corpse of frame.corpses) {
    let object = corpseMeshes.get(corpse);
    if (!object) {
      object = createHuman(corpse.type, corpse.variant || 0, corpse.elite, corpse.commander);
      const rig = object.userData.rig;
      rig.body.rotation.x = Math.PI / 2;
      rig.body.position.y = .12;
      rig.leftArm.rotation.z = -.8;
      rig.rightArm.rotation.z = .65;
      rig.leftLeg.rotation.x = -.24;
      rig.rightLeg.rotation.x = .32;
      corpseMeshes.set(corpse, object);
      actorRoot.add(object);
      rendered.corpses.add(object);
    }
    current.add(object);
    object.position.set(corpse.x, Math.max(.035, (corpse.z || .5) - .5 + .035), corpse.y);
    object.rotation.y = -(corpse.dir || 0) - Math.PI / 2;
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
  prune(rendered.corpses, current);
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
  prune(rendered.blood, current);
}

function syncProjectiles(frame) {
  const current = frameSets.projectiles; current.clear();
  for (const projectile of frame.projectiles) {
    let object = projectileMeshes.get(projectile);
    if (!object) {
      const color = { titan: 0xffbb55, warden: 0x74c2ff, raven: 0xffd257 }[projectile.type] ?? 0xff294d;
      // Bright, long tracer — enemy return fire must read at combat range.
      object = new THREE.Group();
      const core = mesh(new THREE.SphereGeometry(.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), false, false);
      const glow = mesh(new THREE.SphereGeometry(.16, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending }), false, false);
      const trail = mesh(new THREE.CylinderGeometry(.035, .09, 1.15, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending }), false, false);
      const trailSoft = mesh(new THREE.CylinderGeometry(.06, .14, 1.6, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending }), false, false);
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

function syncPickups(frame) {
  const current = frameSets.pickups; current.clear();
  const colors = { health: 0xff536d, ammo: 0xffbb55, shield: 0x31f5db, armor: 0xd8e7e9 };
  for (const pickup of frame.pickups) {
    let object = pickupMeshes.get(pickup);
    if (!object) {
      const color = colors[pickup.kind] || 0xffffff;
      object = mesh(new THREE.OctahedronGeometry(.19, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.5, metalness: .5, roughness: .25 }), true, false);
      pickupMeshes.set(pickup, object); effectsRoot.add(object); rendered.pickups.add(object);
    }
    current.add(object);
    object.position.set(pickup.x, .28 + Math.sin(pickup.phase || 0) * .08, pickup.y);
    object.rotation.y = frame.totalTime * 1.7;
  }
  prune(rendered.pickups, current);
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
      object.scale.setScalar(particle.color === '#6f0711' ? 1.25 : 1);
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

function updateCamera(frame) {
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
  camera.position.set(source.x + sx, source.z + .72 + sy, source.y + sz);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = -(source.dir + Math.PI / 2);
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
  fpWeaponRoot.position.set(
    THREE.MathUtils.lerp(.27, 0, ads) + Math.sin(bob) * .012 * bobAmount + swayX * .8 + strafe * .04 + idle,
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

function animate() {
  const frame = bridge.frame();
  updateEnvironment(frame);
  updateCamera(frame);
  cullLowWorld(frame);
  syncGlass(frame);
  syncEnemies(frame);
  syncDestroyNodes(frame);
  syncCars(frame);
  syncCorpses(frame);
  syncBlood(frame);
  syncProjectiles(frame);
  syncPickups(frame);
  syncParticles(frame);
  const target=frame.objectiveTarget||[12,12],markerBase=(frame.missionStage===1||frame.missionStage===2) ? .88 : .08;objectiveMarker.visible=frame.mode==='playing'&&frame.wavePhase!=='complete'&&!frame.finisherCam?.active;objectiveMarker.position.set(target[0],markerBase+Math.sin(frame.totalTime*3.2)*.045,target[1]);objectiveMarker.rotation.y=frame.totalTime*1.3;markerRing.scale.setScalar(1+Math.sin(frame.totalTime*4)*.12);markerDiamond.rotation.y=frame.totalTime*2.2;
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
//   L0 .78x pixels, no post   L1 1x, no post
//   L2 1.3x, bloom            L3 1.65x, bloom (desktop default)
// Slightly tighter pixel budgets so 60fps is realistic on laptops/macbooks.
const QUALITY_PIXEL = [.72, .92, 1.15, 1.4];
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
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, QUALITY_PIXEL[fx.quality]));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = fx.quality >= 1;
  renderer.shadowMap.autoUpdate = fx.quality >= 2;
  sun.castShadow = fx.quality >= 1;
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
window.__NEON_RENDER_STATS__ = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, points: renderer.info.render.points, lines: renderer.info.render.lines, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries });

addEventListener('resize', () => {
  applyQuality();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

applyQuality();
renderer.setAnimationLoop(animate);
bridge.ready();
