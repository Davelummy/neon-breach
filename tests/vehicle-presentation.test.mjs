import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVehicleFactory,animateVehicle} from '../public/vehicle-presentation.js';
import {vehicleBounds} from '../public/data.js';
const mat=(color,roughness=.7,metalness=.15)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const create=createVehicleFactory({THREE,mat,mesh:(g,m)=>new THREE.Mesh(g,m),darkMetal:mat(0x222222),blackMetal:mat(0x111111),cheapGlass:true});
test('vehicle silhouettes stay within gameplay collision footprints',()=>{
  for(const kind of ['taxi','bus','tricycle']){const model=create('#23834b',kind),box=new THREE.Box3().setFromObject(model),bounds=vehicleBounds({kind});assert.ok(Math.max(Math.abs(box.min.x),Math.abs(box.max.x))<=bounds.halfLength+.015,kind);assert.ok(Math.max(Math.abs(box.min.z),Math.abs(box.max.z))<=bounds.halfWidth+.015,kind);assert.ok(Math.abs(box.min.y)<.001);assert.ok(box.max.y<=bounds.height);assert.equal(model.userData.wheelRigs.filter(w=>w.steers).length,kind==='tricycle'?1:2);}
});
test('wheel travel is frame-rate independent and only front wheels steer',()=>{
  const a=create(),b=create(),car={speed:2,steer:.6};for(let i=0;i<60;i++)animateVehicle(a,car,1/60);for(let i=0;i<30;i++)animateVehicle(b,car,1/30);
  for(let i=0;i<4;i++){assert.ok(Math.abs(a.userData.wheels[i].rotation.z-b.userData.wheels[i].rotation.z)<1e-10);const rig=a.userData.wheelRigs[i];assert.ok(Math.abs(rig.pivot.rotation.y-(rig.steers?-.228:0))<1e-10);assert.equal(rig.pivot.position.y,rig.radius);}
  assert.ok(Math.abs(a.userData.body.rotation.x)<=.035);assert.ok(Math.abs(a.userData.body.rotation.z)<=.035);
});
test('braking lights and wreck animations follow vehicle state',()=>{
  const model=create();animateVehicle(model,{speed:-1,steer:0,braking:true},.05);assert.ok(model.userData.wheels[0].rotation.z>0);assert.equal(model.userData.tailMaterial.emissiveIntensity,2);const spin=model.userData.wheels[0].rotation.z;animateVehicle(model,{speed:8,steer:1,braking:true,destroyed:true},.05);assert.equal(model.userData.wheels[0].rotation.z,spin);assert.equal(model.userData.tailMaterial.emissiveIntensity,.15);
});
test('static detail batching keeps each vehicle below twenty draw submissions',()=>{
  for(const kind of ['taxi','bus','tricycle']){let calls=0;create('#23834b',kind).traverse(o=>{if(o.isMesh)calls++;});assert.ok(calls<20,`${kind}: ${calls}`);}
});
