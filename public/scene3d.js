import * as THREE from '/vendor/three.module.min.js';

const bridge = window.__NEON_3D__;
if (!bridge) throw new Error('NEON 3D bridge was not initialized.');

const coarse = matchMedia('(pointer: coarse)').matches;
const lowPreset = new URLSearchParams(location.search).get('quality') === 'low' || localStorage.getItem('neon-breach-quality') === 'low';
const canvas = document.createElement('canvas');
canvas.id = 'threeGame';
canvas.setAttribute('aria-hidden', 'true');
document.body.prepend(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse && !lowPreset, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPreset ? .78 : coarse ? 1.15 : 1.0));
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

const hemi = new THREE.HemisphereLight(0xcdeeff, 0x17201d, 1.45);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe6bd, 2.6);
sun.position.set(8, 18, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(lowPreset ? 512 : coarse ? 1024 : 1024, lowPreset ? 512 : coarse ? 1024 : 1024);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 50;
sun.shadow.bias = -.0008;
scene.add(sun);

const neonLights = [];
for (const [x, z, color] of [[2, 12, 0x31f5db], [22, 12, 0xff536d], [12, 2, 0xa66cff], [12, 22, 0xffbb55]]) {
  const light = new THREE.PointLight(color, 2.5, 9, 2);
  light.position.set(x, 2.8, z);
  scene.add(light);
  neonLights.push(light);
}

const mat = (color, roughness = .7, metalness = .15) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const darkMetal = mat(0x11191d, .48, .72);
const blackMetal = mat(0x05080a, .38, .82);
const concrete = mat(0x39484b, .9, .05);
const violetWall = mat(0x2e2941, .76, .2);
const amberWall = mat(0x46372e, .8, .12);
const glassMaterial = new THREE.MeshPhysicalMaterial({ color: 0x8edced, transmission: .5, transparent: true, opacity: .42, roughness: .12, metalness: .05, thickness: .08, side: THREE.DoubleSide });
const wallMaterials = { 1: concrete, 2: violetWall, 3: amberWall, 4: glassMaterial };

function mesh(geometry, material, cast = true, receive = true) {
  const value = new THREE.Mesh(geometry, material);
  value.castShadow = cast;
  value.receiveShadow = receive;
  return value;
}

function buildWorld() {
  const { map, WALL_HEIGHTS, MAP_W, MAP_H, STAIR_ZONES } = bridge.world;
  const ground = mesh(new THREE.PlaneGeometry(58, 58), mat(0x182123, .96, .02), false, true);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(MAP_W / 2, -.025, MAP_H / 2);
  worldRoot.add(ground);

  const roadMaterial = mat(0x111719, .92, .04);
  const roadA = mesh(new THREE.PlaneGeometry(5.3, MAP_H - 2), roadMaterial, false, true);
  roadA.rotation.x = -Math.PI / 2;
  roadA.position.set(12, .006, 12);
  const roadB = roadA.clone();
  roadB.geometry = new THREE.PlaneGeometry(MAP_W - 2, 5.3);
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
  // Palettes are keyed by body silhouette; the archetype's spec supplies the
  // accent color, so new ENEMY_TYPES entries render without touching this file.
  const spec = bridge.world.enemyTypes?.[type] || {};
  const body3d = spec.body || { wraith: 'scout', specter: 'trooper', titan: 'heavy' }[type] || 'trooper';
  const colors = {
    scout: [0x21383a, 0x2b4038, 0x253242],
    trooper: [0x332b4a, 0x293143, 0x422e41],
    heavy: [0x44312f, 0x373c42, 0x4b3431]
  };
  const skins = [0x7b4935, 0xb87855, 0xd6a17a];
  const uniform = mat(colors[body3d][variant % 3], .74, .25);
  const armor = mat(0x11191d, .42, .68);
  const skin = mat(skins[variant % 3], .8, .02);
  const accentColor=commander?0xffd166:spec.color?new THREE.Color(spec.color).getHex():0x31f5db,accent = new THREE.MeshStandardMaterial({ color:accentColor, emissive:accentColor, emissiveIntensity: elite ? 2.4 : .8, roughness: .38, metalness: .55 });
  const scale = body3d === 'heavy' ? 1.17 : body3d === 'scout' ? .94 : 1;

  const pelvis = mesh(new THREE.BoxGeometry(.37, .22, .24), armor);
  pelvis.position.y = .8;
  const torso = mesh(new THREE.BoxGeometry(.58, .64, .28), uniform);
  torso.position.y = 1.17;
  const vest = mesh(new THREE.BoxGeometry(.49, .43, .13), armor);
  vest.position.set(0, 1.19, -.17);
  const chestLight = mesh(new THREE.BoxGeometry(.13, .035, .035), accent, false, false);
  chestLight.position.set(0, 1.35, -.245);
  const neck = mesh(new THREE.CylinderGeometry(.085, .095, .13, 10), skin);
  neck.position.y = 1.54;
  const headPivot = new THREE.Group();
  headPivot.position.y = 1.68;
  const head = mesh(new THREE.SphereGeometry(.19, 14, 10), skin);
  head.scale.set(.9, 1.08, .92);
  const hair = mesh(new THREE.SphereGeometry(.195, 12, 7, 0, Math.PI * 2, 0, Math.PI * .5), mat(variant === 2 ? 0x24140f : 0x08090a, .92, .02));
  hair.position.y = .045;
  const nose = mesh(new THREE.ConeGeometry(.026, .085, 6), skin);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -.015, -.19);
  headPivot.add(head, hair, nose);
  body.add(pelvis, torso, vest, chestLight, neck, headPivot);

  const leftArm = new THREE.Group(), rightArm = new THREE.Group();
  leftArm.position.set(-.37, 1.43, 0);
  rightArm.position.set(.37, 1.43, 0);
  leftArm.add(limb(.09, .58, uniform));
  rightArm.add(limb(.09, .58, uniform));
  const leftHand = mesh(new THREE.SphereGeometry(.085, 9, 7), skin);
  const rightHand = leftHand.clone();
  leftHand.position.y = rightHand.position.y = -.58;
  leftArm.add(leftHand);
  rightArm.add(rightHand);
  body.add(leftArm, rightArm);
  if(commander){for(const side of [-1,1]){const pauldron=mesh(new THREE.BoxGeometry(.28,.16,.34),accent);pauldron.position.set(side*.39,1.43,0);pauldron.rotation.z=side*.14;body.add(pauldron);}const visor=mesh(new THREE.BoxGeometry(.25,.055,.035),accent,false,false);visor.position.set(0,1.71,-.185);body.add(visor);}

  const leftLeg = new THREE.Group(), rightLeg = new THREE.Group();
  leftLeg.position.set(-.16, .78, 0);
  rightLeg.position.set(.16, .78, 0);
  const leftThigh = limb(.105, .45, uniform), rightThigh = limb(.105, .45, uniform);
  const leftKnee = new THREE.Group(), rightKnee = new THREE.Group();
  leftKnee.position.y = rightKnee.position.y = -.43;
  leftKnee.add(limb(.09, .43, armor));
  rightKnee.add(limb(.09, .43, armor));
  const leftBoot = mesh(new THREE.BoxGeometry(.2, .14, .32), blackMetal);
  const rightBoot = leftBoot.clone();
  leftBoot.position.set(0, -.43, -.07);
  rightBoot.position.copy(leftBoot.position);
  leftKnee.add(leftBoot);
  rightKnee.add(rightBoot);
  leftLeg.add(leftThigh, leftKnee);
  rightLeg.add(rightThigh, rightKnee);
  body.add(leftLeg, rightLeg);

  const weapon = new THREE.Group();
  const receiver = mesh(new THREE.BoxGeometry(.48, .13, .14), darkMetal);
  const barrel = mesh(new THREE.CylinderGeometry(.026, .03, .48, 8), blackMetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -.29;
  const magazine = mesh(new THREE.BoxGeometry(.12, .26, .1), blackMetal);
  magazine.position.set(.05, -.16, .02);
  magazine.rotation.z = -.12;
  const weaponLight = mesh(new THREE.BoxGeometry(.2, .025, .02), accent, false, false);
  weaponLight.position.set(-.08, .055, -.08);
  weapon.add(receiver, barrel, magazine, weaponLight);
  weapon.position.set(.08, 1.17, -.32);
  weapon.rotation.y = Math.PI;
  body.add(weapon);

  body.scale.setScalar(scale * (elite ? 1.08 : 1) * (commander?1.08:1));
  root.userData.rig = { body, torso, headPivot, leftArm, rightArm, leftLeg, rightLeg, leftKnee, rightKnee, weapon, baseScale: scale * (elite ? 1.08 : 1) };
  return root;
}

function animateHuman(group, enemy, time) {
  const rig = group.userData.rig;
  const speed = Math.hypot(enemy.vx || 0, enemy.vy || 0);
  const run = Math.min(1, speed / 1.55);
  const phase = enemy.anim || time * 8;
  const stride = Math.sin(phase) * .92 * run;
  const grounded = enemy.grounded !== false;
  rig.body.rotation.set(0, 0, 0);
  rig.body.position.y = grounded ? Math.abs(Math.sin(phase * 2)) * .035 * run : .02;
  rig.leftLeg.rotation.x = grounded ? stride : -.48;
  rig.rightLeg.rotation.x = grounded ? -stride : -.48;
  rig.leftKnee.rotation.x = grounded ? Math.max(0, -stride) * .55 : .95;
  rig.rightKnee.rotation.x = grounded ? Math.max(0, stride) * .55 : .95;
  rig.leftArm.rotation.x = grounded ? -stride * .58 - .34 : -.7;
  rig.rightArm.rotation.x = grounded ? stride * .58 - .34 : -.7;
  rig.leftArm.rotation.z = -.12;
  rig.rightArm.rotation.z = .12;
  if(enemy.reloadTimer>0){const reloadWave=Math.sin(Math.min(1,enemy.reloadTimer/1.5)*Math.PI);rig.leftArm.rotation.x=-1.08;rig.rightArm.rotation.x=-.92;rig.leftArm.rotation.z=-.35;rig.weapon.rotation.z=-.28*reloadWave;}
  rig.torso.rotation.z = Math.sin(phase) * .035 * run;
  rig.torso.rotation.x = run * .075+(enemy.hitFlash>0?(Math.random()-.5)*.16:0);
  rig.headPivot.rotation.y = Math.sin(time * .7 + enemy.x) * .045;
  const squash = Math.max(0, enemy.landingSquash || 0);
  group.scale.set(1 + squash * .09, 1 - squash * .12, 1 + squash * .09);
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
  const paint = mat(color, .32, .78);
  const dimensions = id === 'pistol' ? [.24, .15, .52] : id === 'shotgun' ? [.3, .18, .92] : [.31, .2, .76];
  const receiver = mesh(new THREE.BoxGeometry(...dimensions), paint, false, false);
  const barrelLength = id === 'pistol' ? .26 : id === 'shotgun' ? .72 : .5;
  const barrel = mesh(new THREE.CylinderGeometry(id === 'shotgun' ? .038 : .026, id === 'shotgun' ? .046 : .032, barrelLength, 10), blackMetal, false, false);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, .035, -dimensions[2] / 2 - barrelLength / 2 + .05);
  const grip = mesh(new THREE.BoxGeometry(.14, .34, .17), blackMetal, false, false);
  grip.position.set(0, -.2, .1);
  grip.rotation.x = -.18;
  const sight = mesh(new THREE.BoxGeometry(.06, .055, .18), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2 }), false, false);
  sight.position.set(0, dimensions[1] / 2 + .05, -.04);
  root.add(receiver, barrel, grip, sight);
  root.userData.muzzleZ = barrel.position.z - barrelLength / 2;
  return root;
}

const fpWeaponRoot = new THREE.Group();
const fpWeapons = [
  createWeaponModel('rifle', 0x31f5db),
  createWeaponModel('shotgun', 0xffbb55),
  createWeaponModel('pistol', 0xa66cff)
];
fpWeapons.forEach((weapon, index) => { weapon.visible = index === 0; fpWeaponRoot.add(weapon); });
const fpSleeve=mat(0x1e3135,.78,.22),fpGlove=mat(0x111719,.62,.38);
for(const side of [-1,1]){const arm=mesh(new THREE.CapsuleGeometry(.075,.34,4,8),fpSleeve,false,false);arm.position.set(side*.22,-.22,.16);arm.rotation.set(side<0?-.72:-.58,0,side*.24);const hand=mesh(new THREE.SphereGeometry(.085,10,7),fpGlove,false,false);hand.scale.set(.9,.75,1.15);hand.position.set(side*.115,-.075,-.05);fpWeaponRoot.add(arm,hand);}
camera.add(fpWeaponRoot);
const muzzleFlash = mesh(new THREE.OctahedronGeometry(.09, 0), new THREE.MeshBasicMaterial({ color: 0xffd27c }), false, false);
const muzzleLight = new THREE.PointLight(0xff9d43, 0, 3, 2);
fpWeaponRoot.add(muzzleFlash, muzzleLight);

const enemyMeshes = new WeakMap();
const carMeshes = new WeakMap();
const corpseMeshes = new WeakMap();
const bloodMeshes = new WeakMap();
const projectileMeshes = new WeakMap();
const pickupMeshes = new WeakMap();
const particleMeshes = new WeakMap();
const rendered = { enemies: new Set(), cars: new Set(), corpses: new Set(), blood: new Set(), projectiles: new Set(), pickups: new Set(), particles: new Set() };
const frameSets = { enemies: new Set(), cars: new Set(), corpses: new Set(), blood: new Set(), projectiles: new Set(), pickups: new Set(), particles: new Set() };
const particleGeometry = new THREE.SphereGeometry(.025, 5, 4);
const particleMaterials = new Map();

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
      object = createHuman(corpse.type, corpse.variant || 0, corpse.elite,corpse.commander);
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
    object.position.set(corpse.x, Math.max(.035,(corpse.z||.5)-.5+.035), corpse.y);
    object.rotation.y = -(corpse.dir || 0) - Math.PI / 2;
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
    object.position.set(blood.x, Math.max(.014,(blood.z||.5)-.5+.014), blood.y);
  }
  prune(rendered.blood, current);
}

function syncProjectiles(frame) {
  const current = frameSets.projectiles; current.clear();
  for (const projectile of frame.projectiles) {
    let object = projectileMeshes.get(projectile);
    if (!object) {
      const color = { titan: 0xffbb55, warden: 0x74c2ff, raven: 0xffd257 }[projectile.type] ?? 0xff294d;
      object = mesh(new THREE.SphereGeometry(.055, 7, 5), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 6 }), false, false);
      projectileMeshes.set(projectile, object); effectsRoot.add(object); rendered.projectiles.add(object);
    }
    current.add(object);
    object.position.set(projectile.x, projectile.z || .55, projectile.y);
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
      if (!material) { const color = new THREE.Color(particle.color); material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: particle.color?.startsWith('#6f') || particle.color?.startsWith('#d6') ? .15 : 2, roughness: .55 }); particleMaterials.set(particle.color, material); }
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

let lastTimeMode = '';
function updateEnvironment(frame) {
  if (lastTimeMode === frame.timeOfDay) return;
  lastTimeMode = frame.timeOfDay;
  const day = frame.timeOfDay === 'day';
  scene.background.set(day ? 0x9bb7bd : 0x02070c);
  scene.fog.color.set(day ? 0x819da3 : 0x071218);
  scene.fog.density = day ? .019 : .031;
  hemi.color.set(day ? 0xcdeeff : 0x4f7a8a);
  hemi.groundColor.set(day ? 0x17201d : 0x030508);
  hemi.intensity = day ? 1.45 : .58;
  sun.color.set(day ? 0xffe6bd : 0x6987b8);
  sun.intensity = day ? 2.6 : .5;
  neonLights.forEach(light => light.intensity = day ? 2.5 : 5.5);
  renderer.toneMappingExposure = day ? 1.08 : 1.22;
}

function updateCamera(frame) {
  const source = frame.camera;
  camera.position.set(source.x, source.z + .72, source.y);
  camera.rotation.y = -(source.dir + Math.PI / 2);
  camera.rotation.x = THREE.MathUtils.clamp((source.pitch || 0) / Math.max(1, innerHeight) * 1.55, -.38, .38);
  const degrees = THREE.MathUtils.radToDeg(frame.fov || Math.PI / 3);
  if (Math.abs(camera.fov - degrees) > .03) { camera.fov = degrees; camera.updateProjectionMatrix(); }
  const inVehicle = frame.player.carIndex >= 0;
  fpWeaponRoot.visible = frame.mode === 'playing' && !inVehicle;
  if (!fpWeaponRoot.visible) return;
  const ads = frame.player.ads || 0, bob = frame.player.bob || 0, bobAmount = frame.player.bobAmount || 0;
  fpWeaponRoot.position.set(THREE.MathUtils.lerp(.27, 0, ads), THREE.MathUtils.lerp(-.27, -.19, ads) + Math.abs(Math.cos(bob)) * .009 * bobAmount, THREE.MathUtils.lerp(-.58, -.44, ads) + (frame.player.recoil || 0) * .12);
  const reloadProgress=frame.player.reloading?1-Math.max(0,frame.player.reloadTimer)/Math.max(.01,frame.player.reloadTime):0,reloadArc=frame.player.reloading?Math.sin(reloadProgress*Math.PI):0,melee=Math.max(0,frame.melee||0),sprintLower=ads<.08&&bobAmount>1?.11:0;
  fpWeaponRoot.rotation.set(-.035 + (frame.player.recoil || 0) * .12+reloadArc*.28, -.02+reloadArc*.22-melee*.5, Math.sin(bob) * .018 * bobAmount-reloadArc*.42+sprintLower);
  fpWeaponRoot.position.y-=reloadArc*.11+sprintLower*.55;
  fpWeapons.forEach((weapon, index) => weapon.visible = index === frame.player.weaponIndex);
  const active = fpWeapons[frame.player.weaponIndex] || fpWeapons[0];
  muzzleFlash.visible = frame.muzzle > .08;
  muzzleFlash.position.set(0, .035, active.userData.muzzleZ);
  muzzleFlash.scale.setScalar(.7 + frame.muzzle * 1.8);
  muzzleLight.position.copy(muzzleFlash.position);
  muzzleLight.intensity = frame.muzzle * 5;
}

function syncGlass(frame) {
  for (const [key, object] of glassMeshes) object.visible = !frame.brokenGlass.has(key);
}

function animate() {
  const frame = bridge.frame();
  updateEnvironment(frame);
  updateCamera(frame);
  syncGlass(frame);
  syncEnemies(frame);
  syncCars(frame);
  syncCorpses(frame);
  syncBlood(frame);
  syncProjectiles(frame);
  syncPickups(frame);
  syncParticles(frame);
  const target=frame.objectiveTarget||[12,12],markerBase=(frame.missionStage===1||frame.missionStage===2) ? .88 : .08;objectiveMarker.visible=frame.mode==='playing'&&frame.wavePhase!=='complete';objectiveMarker.position.set(target[0],markerBase+Math.sin(frame.totalTime*3.2)*.045,target[1]);objectiveMarker.rotation.y=frame.totalTime*1.3;markerRing.scale.setScalar(1+Math.sin(frame.totalTime*4)*.12);markerDiamond.rotation.y=frame.totalTime*2.2;
  terminalScreen.material.emissiveIntensity=2.4+Math.sin(frame.totalTime*4)*.8;extractionPad.visible=frame.missionStage>=4;extractionPad.rotation.y=frame.totalTime*.18;extractionBeam.material.opacity=.065+Math.sin(frame.totalTime*2.4)*.025;
  renderFrame();
  tuneQuality();
}

// ---- Adaptive quality + post-processing -----------------------------------
// Hand-rolled bloom + vignette (no external passes — the deploy bundle only
// vendors three.module.min.js). An EMA of frame time steps quality up/down:
//   L0 .78x pixels, no post   L1 1x, no post
//   L2 1.3x, bloom            L3 1.65x, bloom (desktop default)
const QUALITY_PIXEL = [.78, 1, 1.3, 1.65];
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
const compositeMat = new THREE.ShaderMaterial({ uniforms: { tScene: { value: null }, tBloom: { value: null }, strength: { value: .85 } }, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader: 'uniform sampler2D tScene,tBloom;uniform float strength;varying vec2 vUv;void main(){vec3 col=texture2D(tScene,vUv).rgb+texture2D(tBloom,vUv).rgb*strength;float d=distance(vUv,vec2(.5));col*=1.-smoothstep(.52,.92,d)*.32;gl_FragColor=vec4(col,1.);\n#include <colorspace_fragment>\n}' });
const postScene = new THREE.Scene();
const postMesh = new THREE.Mesh(fullscreen, compositeMat);
postMesh.frustumCulled = false;
postScene.add(postMesh);

function buildTargets() {
  const w = Math.max(2, Math.floor(innerWidth * renderer.getPixelRatio())), h = Math.max(2, Math.floor(innerHeight * renderer.getPixelRatio()));
  sceneTarget?.dispose(); bloomA?.dispose(); bloomB?.dispose();
  sceneTarget = new THREE.WebGLRenderTarget(w, h, { samples: coarse ? 0 : 2 });
  bloomA = new THREE.WebGLRenderTarget(w >> 2, h >> 2);
  bloomB = new THREE.WebGLRenderTarget(w >> 2, h >> 2);
  blurMat.uniforms.texel.value.set(1 / Math.max(1, w >> 2), 1 / Math.max(1, h >> 2));
}

function postPass(material, target) {
  postMesh.material = material;
  renderer.setRenderTarget(target);
  renderer.render(postScene, postQuad);
}

function renderFrame() {
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

addEventListener('resize', () => {
  applyQuality();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

applyQuality();
if (lowPreset) bridge.ready({ fallback: true });
else { renderer.setAnimationLoop(animate); bridge.ready(); }
