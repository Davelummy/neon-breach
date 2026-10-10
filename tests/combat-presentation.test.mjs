import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCombatModels,createArenaLandmark,populateDistrictRoads,createDistrictSkyline} from '../public/combat-presentation.js';
import {releasePrivateModel} from '../public/render-utils.js';
import {arenaWorld} from '../server/multiplayer-match.mjs';
import {ARENAS} from '../public/data.js';
import {createVehicleFactory} from '../public/vehicle-presentation.js';
const mat=(color=0xffffff,roughness=.7,metalness=.15)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const mesh=(geometry,material)=>new THREE.Mesh(geometry,material);
const darkMetal=mat(0x11191d),blackMetal=mat(0x05080a),protectedMaterials=new Set([darkMetal,blackMetal]);
test('campaign and multiplayer share working taxi, keke and bus models',()=>{
  for(const cheapGlass of [false,true]){const createCar=createVehicleFactory({THREE,mat,mesh,darkMetal,blackMetal,cheapGlass});for(const kind of ['taxi','tricycle','bus']){const model=createCar('#23834b',kind);let meshes=0;model.traverse(o=>{if(o.isMesh)meshes++;});assert.ok(meshes>5);assert.equal(model.userData.wheels.length,kind==='tricycle'?3:4);releasePrivateModel(model,protectedMaterials);}}
});
test('shared tactical character/weapon models animate without owning gameplay authority',()=>{
  const factory=createCombatModels({THREE,mat,mesh,darkMetal,blackMetal,bodyMat:(_,color,r,m)=>mat(color,r,m),weaponTextures:{},enemyTypes:{specter:{body:'trooper'}}});
  const actor=factory.createHuman('specter',1),rifle=factory.createWeaponModel('rifle',0x31f5db);
  try{assert.ok(actor.userData.rig.leftLeg);assert.ok(actor.userData.rig.weapon);assert.ok(rifle.userData.muzzleZ<0);const pose={x:1,hp:75,maxHp:100,vx:2,vy:1,grounded:false,combatState:'engage',reloadTimer:0,muzzleFlash:.2};factory.animateHuman(actor,pose,1);assert.ok(actor.userData.enemyMuzzle.visible);assert.ok(Number.isFinite(actor.userData.rig.leftLeg.rotation.x));assert.equal(pose.hp,75);}finally{releasePrivateModel(actor,protectedMaterials);releasePrivateModel(rifle,protectedMaterials);}
});
test('shared road instances follow the collision map without mutating it',()=>{
  const world=arenaWorld('city-gate'),before=JSON.stringify(world),roadTiles=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.012,1),mat(),2304),roadLines=new THREE.InstancedMesh(new THREE.BoxGeometry(.07,.012,.65),mat(),400);
  populateDistrictRoads({THREE,map:world.map,roadTiles,roadLines});assert.ok(roadTiles.count>100&&roadTiles.count<=2304);assert.ok(roadLines.count>0&&roadLines.count<=400);assert.equal(JSON.stringify(world),before);roadTiles.geometry.dispose();roadLines.geometry.dispose();roadTiles.material.dispose();roadLines.material.dispose();
});
test('both modes can construct the same three landmark silhouettes and skyline',()=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};
  try{for(const arena of ARENAS){const group=createArenaLandmark(arena,{THREE,mat,mesh,darkMetal,wallMaterials:{5:mat(),6:mat(),7:mat(),8:mat()}});assert.equal(group.name,arena.name);assert.ok(group.children.length>5);group.traverse(o=>{if(o.isMesh&&o.material.map)o.material.map.dispose();});releasePrivateModel(group,protectedMaterials);}const skyline=createDistrictSkyline({THREE,mat,mesh});assert.equal(skyline.name,'Abuja-inspired skyline');assert.ok(skyline.children.some(o=>o.isInstancedMesh));releasePrivateModel(skyline,protectedMaterials);}finally{globalThis.document=old;}
});
