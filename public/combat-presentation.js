// Shared visual models: no simulation, persistence or network authority.
export function createDistrictSkyline({THREE,mat,mesh,width=48}){
  const skyline=new THREE.Group();skyline.name='Abuja-inspired skyline';
  const rockMat=mat(0x827567,.98,0),cream=mat(0xc5bca2,.8,.05),gold=mat(0xb49952,.55,.25),green=mat(0x426c48,.9,0);
  const rockGeo=new THREE.SphereGeometry(1,16,10);
  for(const [x,y,z,sx,sy,sz] of [[25,3,-10,13,9,7],[34,2,-9,9,6,6],[15,1,-11,8,5,5]]){
    const rock=mesh(rockGeo,rockMat,false,false);rock.position.set(x,y,z);rock.scale.set(sx,sy,sz);skyline.add(rock);
  }
  // Dome and four slender minarets evoke the National Mosque skyline.
  const base=mesh(new THREE.BoxGeometry(4,2,4),cream,false,false);base.position.set(-7,1,9);skyline.add(base);
  const dome=mesh(new THREE.SphereGeometry(1.55,12,8,0,Math.PI*2,0,Math.PI/2),gold,false,false);dome.position.set(-7,2.7,9);skyline.add(dome);
  const towerGeo=new THREE.CylinderGeometry(.13,.24,6.5,8),capGeo=new THREE.ConeGeometry(.32,.7,8);
  for(const [x,z] of [[-9,7],[-5,7],[-9,11],[-5,11]]){
    const tower=mesh(towerGeo,cream,false,false);tower.position.set(x,3.25,z);skyline.add(tower);
    const cap=mesh(capGeo,gold,false,false);cap.position.set(x,6.85,z);skyline.add(cap);
  }
  // A distant peaked civic silhouette, not an explorable religious building.
  const civic=mesh(new THREE.BoxGeometry(3,3,2.5),cream,false,false);civic.position.set(width+7,1.5,15);skyline.add(civic);
  const roof=mesh(new THREE.ConeGeometry(2.2,3,4),cream,false,false);roof.position.set(width+7,4.5,15);roof.rotation.y=Math.PI/4;skyline.add(roof);
  // Background office district: shared geometry/material, one instanced draw.
  const towers=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat(0x536c75,.65,.2),12),dummy=new THREE.Object3D();
  for(let i=0;i<12;i++){const side=i<6?-1:1,j=i%6;dummy.position.set(side<0?-9-j*1.4:width+6+j*1.4,2.5+(j%3),-4+j*5.5);dummy.scale.set(1.7,5+(j%3)*2,2);dummy.updateMatrix();towers.setMatrixAt(i,dummy.matrix);}
  towers.instanceMatrix.needsUpdate=true;skyline.add(towers);
  const trees=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.65,0),green,16);
  for(let i=0;i<16;i++){dummy.position.set(i<8?-2:width+2,1.6,1+(i%8)*3);dummy.scale.set(1,1.6,1);dummy.updateMatrix();trees.setMatrixAt(i,dummy.matrix);}trees.instanceMatrix.needsUpdate=true;skyline.add(trees);
  skyline.traverse(object=>{if(object.isMesh){object.userData.lowCullAlwaysVisible=true;object.castShadow=false;object.receiveShadow=false;}});
  return skyline;
}
export function populateDistrictRoads({THREE,map,width=48,height=48,roadTiles,roadLines,roadTransform=new THREE.Object3D(),roadColor=new THREE.Color()}){
  let tiles=0,lines=0;const lanes=[12,24,36];
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    if(map[y][x]!==0||!lanes.some(l=>Math.abs(x+.5-l)<2||Math.abs(y+.5-l)<2))continue;
    roadTransform.position.set(x+.5,.012,y+.5);roadTransform.rotation.y=0;roadTransform.updateMatrix();roadTiles.setMatrixAt(tiles,roadTransform.matrix);
    // Recolour existing instances: flat pedestrian verges, not extra geometry
    // or a raised curb that disagrees with the physical collision map.
    const laneDistance=Math.min(...lanes.map(l=>Math.min(Math.abs(x+.5-l),Math.abs(y+.5-l))));
    const shade=((x*17+y*31)%5)*.008;
    if(laneDistance>1.2)roadColor.setRGB(.48+shade,.46+shade,.41+shade);
    else roadColor.setRGB(.10+shade,.115+shade,.12+shade);
    roadTiles.setColorAt(tiles++,roadColor);
  }
  for(const lane of lanes)for(let n=2;n<width-2;n+=2){
    if(lanes.some(cross=>Math.abs(n-cross)<3))continue;
    for(const horizontal of [false,true]){const x=horizontal?n:lane,y=horizontal?lane:n;if(map[Math.floor(y)][Math.floor(x)]!==0)continue;roadTransform.position.set(x,.024,y);roadTransform.rotation.y=horizontal?Math.PI/2:0;roadTransform.updateMatrix();roadLines.setMatrixAt(lines++,roadTransform.matrix);}
  }
  roadTiles.count=tiles;roadLines.count=lines;
  if(roadTiles.instanceColor)roadTiles.instanceColor.needsUpdate=true;
  for(const object of [roadTiles,roadLines]){object.instanceMatrix.needsUpdate=true;object.computeBoundingSphere();}
}
export function createCombatModels({THREE,mat,mesh,darkMetal,blackMetal,bodyMat,weaponTextures,enemyTypes}){
function limb(radius, length, material) {
  const part = mesh(new THREE.CapsuleGeometry(radius, Math.max(.01, length - radius * 2), 4, 7), material, true, true);
  part.position.y = -length / 2;
  return part;
}

function createHuman(type = 'specter', variant = 0, elite = false, commander = false) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const spec = enemyTypes?.[type] || {};
  const body3d = spec.body || { wraith: 'scout', specter: 'trooper', titan: 'heavy' }[type] || 'trooper';
  const colors = {
    scout: [0x2a4548, 0x314a42, 0x2c3d4d],
    trooper: [0x4c5143, 0x53574b, 0x665e4b],
    heavy: [0x4d3a36, 0x3e444a, 0x523c38]
  };
  const skins = [0x8d5a42, 0xc48a62, 0xe0b08a];
  const uniform = bodyMat(body3d, colors[body3d][variant % 3], .85, .04);
  const armor = mat(0x182127, .52, .5);
  const skin = mat(skins[variant % 3], .86, .04);
  const accentColor=commander?0xffd166:spec.color?new THREE.Color(spec.color).getHex():0x31f5db;
  const accent = new THREE.MeshStandardMaterial({ color:accentColor, emissive:accentColor, emissiveIntensity: commander?1.2:elite?.9:.6, roughness: .48, metalness: .15 });
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
  const stride = Math.sin(phase) * .78 * run;
  const grounded = enemy.grounded !== false;
  const aiming = !!(enemy.combatState === 'engage' || enemy.combatState === 'hold' || (enemy.muzzleFlash || 0) > 0 || (enemy.fireCooldown || 0) > 0 && (enemy.awareness || 0) > .4);
  const shooting = (enemy.muzzleFlash || 0) > 0;
  const injury=1-Math.max(0,Math.min(1,enemy.hp/Math.max(1,enemy.maxHp)));
  rig.body.rotation.set(injury*.065, Math.sin(phase) * .045 * run, Math.sin(phase) * .025 * run);
  rig.body.position.y = grounded ? Math.abs(Math.sin(phase * 2)) * .028 * run+Math.sin(time*2.2+group.id*.27)*.006*(1-run) : .02;
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


function createWeaponModel(id, color) {
  const root = new THREE.Group();
  // Tactical dark receivers with a thin accent rail — reads more like real kit than neon plastic.
  const paint = mat(0x252e35, .32, .72);
  const polymer = mat(0x151a1e, .76, .04);
  const accent = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, metalness: .5, roughness: .35 });
  const isPistol = id === 'pistol', isShotgun = id === 'shotgun', isDmr = id === 'dmr';
  const bodyLen = isPistol ? .4 : id==='smg'?.52:id==='lmg'?.96:isShotgun ? .82 : isDmr ? .9 : .72;
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
  if(id==='lmg'){mag.scale.set(2.2,1.1,1.8);mag.position.y=-.25;}
  if(id==='smg')barrel.scale.y=.65;
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
  const deadline=setTimeout(() => clearInterval(poll), 3500);
  card.userData.stopTexturePolling=()=>{clearInterval(poll);clearTimeout(deadline);};

  root.add(receiver, upper, rail, barrel, brake, slide, grip, mag, frontSight, rearSight, accentStrip, card);
  if (stock) root.add(stock);
  root.userData.muzzleZ = barrel.position.z - barrelLength / 2;
  root.userData.slide = slide;
  root.userData.barrel = barrel;
  return root;
}


return {createHuman,animateHuman,createWeaponModel};
}
export function createArenaLandmark(arena,{THREE,mat,mesh,wallMaterials,darkMetal}){
  const group=new THREE.Group();group.name=arena.name;group.visible=true;
  // Road furniture is above head height or outside the driving lanes.
  // No invisible colliders or decorative barricades across transport routes.
  const route=arena.id==='city-gate'?'AIRPORT ROAD / CITY GATE':arena.id==='millennium-park'?'MAITAMA / MILLENNIUM PARK':'JABI / LAKE DISTRICT';
  for(const [x,z,text] of [[32,33.5,route],[32,37.5,'BUS STOP / CAPITAL CITY']]){
    const board=document.createElement('canvas');board.width=512;board.height=128;const ctx=board.getContext('2d');ctx.fillStyle='#21583c';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#edf0de';ctx.lineWidth=6;ctx.strokeRect(8,8,496,112);ctx.fillStyle='#fff';ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.fillText(text,256,70);
    const tex=new THREE.CanvasTexture(board);tex.colorSpace=THREE.SRGBColorSpace;
    const panel=mesh(new THREE.BoxGeometry(2.7,.65,.07),new THREE.MeshBasicMaterial({map:tex}),false,false);panel.position.set(x,2.7,z);group.add(panel);
    const post=mesh(new THREE.CylinderGeometry(.04,.04,2.7,6),darkMetal,false,false);post.position.set(x,1.35,z);group.add(post);
  }
  if(arena.id==='city-gate'){
    for(const z of [10.5,13.5]){const lintel=mesh(new THREE.BoxGeometry(3,.35,.8),wallMaterials[5],false,true);lintel.position.set(12,2.825,z);group.add(lintel);
      for(const x of [10.5,13.5]){const stripe=mesh(new THREE.BoxGeometry(1.01,.2,1.01),mat(0x278346,.8,.05),false,false);stripe.position.set(x,2.4,z);group.add(stripe);}}
  }else if(arena.id==='millennium-park'){
    const bowl=mesh(new THREE.CylinderGeometry(.7,.85,.25,16),wallMaterials[5],false,true);bowl.position.set(12,.475,12);group.add(bowl);
    const water=mesh(new THREE.CylinderGeometry(.65,.65,.025,16),wallMaterials[7],false,false);water.position.set(12,.61,12);group.add(water);
    const fountain=mesh(new THREE.CylinderGeometry(.05,.12,.7,8),mat(0x80c9df,.4,.1),false,false);fountain.position.set(12,.97,12);group.add(fountain);
    for(const [x,z] of [[9,4],[14,4],[9,19],[14,19]]){const trunk=mesh(new THREE.CylinderGeometry(.1,.16,1.8,6),mat(0x8c7355,.9,0),false,false);trunk.position.set(x,.9,z);const crown=mesh(new THREE.SphereGeometry(.65,8,5),wallMaterials[6],false,false);crown.position.set(x,2,z);group.add(trunk,crown);}
  }else{
    const shelter=mesh(new THREE.BoxGeometry(2.5,.16,1.2),wallMaterials[8],false,true);shelter.position.set(12,2.3,13.5);group.add(shelter);
    for(const x of [10.8,13.2]){const post=mesh(new THREE.CylinderGeometry(.055,.055,2.3,6),wallMaterials[8],false,false);post.position.set(x,1.15,13.5);group.add(post);}
    for(const z of [11.5,12.5]){const deck=mesh(new THREE.BoxGeometry(2,.04,.95),wallMaterials[8],false,true);deck.position.set(12,.03,z);group.add(deck);}
  }
  const label=document.createElement('canvas');label.width=512;label.height=96;const pen=label.getContext('2d');pen.fillStyle='#133a29';pen.fillRect(0,0,512,96);pen.fillStyle='#fff';pen.font='bold 30px sans-serif';pen.textAlign='center';pen.fillText(arena.name.toUpperCase(),256,58);const texture=new THREE.CanvasTexture(label);texture.colorSpace=THREE.SRGBColorSpace;
  const sign=mesh(new THREE.PlaneGeometry(2.6,.49),new THREE.MeshBasicMaterial({map:texture}),false,false);sign.position.set(12,arena.id==='city-gate'?2.7:1.5,13.97);group.add(sign);

return group;
}
