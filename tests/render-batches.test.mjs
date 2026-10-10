import test from 'node:test';
import assert from 'node:assert/strict';
import {planWallBatches,renderPixelRatio,LOW_PIXEL_BUDGET,shouldRenderCullRecord,releasePrivateModel} from '../public/render-utils.js';
import * as THREE from 'three';
test('opaque wall batches preserve every collision cell, material and height',()=>{
  const map=Array.from({length:24},(_,y)=>Array.from({length:24},(_,x)=>(x+y)%4===0?0:(x+y)%3+1));
  map[5][3]=4;
  const {groups,glass}=planWallBatches(map,{1:1.4,2:2,3:1.8,4:1.7});
  const cells=[...groups.values()].flat();assert.equal(cells.length+glass.length,map.flat().filter(Boolean).length);
  assert.equal(new Set([...cells,...glass].map(c=>`${c.x},${c.y}`)).size,cells.length+glass.length);
  assert.deepEqual(glass.map(c=>[c.x,c.y]),[[3,5]]);
  for(const group of groups.values()){assert.ok(group.length<=144);assert.equal(new Set(group.map(c=>`${c.type}:${c.height}`)).size,1);}
  assert.ok(groups.size<cells.length/4);
  assert.equal(cells.find(c=>c.x===1&&c.y===0).height,2.55);
});
test('low preset limits pixel work on tablets and ultrawide screens without changing aspect ratio',()=>{
  for(const [w,h,dpr] of [[1280,720,1],[2732,2048,2],[2560,1080,2],[390,844,3]]){
    const scale=renderPixelRatio(w,h,dpr,0);assert.ok(w*h*scale*scale<=LOW_PIXEL_BUDGET+1);assert.ok(scale<=.6&&scale<=dpr);
  }
  assert.equal(renderPixelRatio(1280,720,1,0),.6);
  assert.equal(renderPixelRatio(2560,1080,2,2),1.15);
});
test('chunk culling retains an in-range edge even when the chunk centre is beyond the radius',()=>{
  const record={object:{userData:{}},x:25,z:0,extent:8.5};
  assert.equal(shouldRenderCullRecord(record,0,0,new Set()),true);
  assert.equal(shouldRenderCullRecord(record,-10,0,new Set()),false);
});
test('expired private models dispose duplicate resources once and preserve shared materials and textures',()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),shared=new THREE.MeshBasicMaterial(),owned=new THREE.MeshBasicMaterial(),texture=new THREE.Texture();owned.map=texture;
  root.add(new THREE.Mesh(geometry,shared),new THREE.Mesh(geometry,owned));
  const counts={geometry:0,shared:0,owned:0,texture:0,poll:0};
  geometry.addEventListener('dispose',()=>counts.geometry++);shared.addEventListener('dispose',()=>counts.shared++);owned.addEventListener('dispose',()=>counts.owned++);texture.addEventListener('dispose',()=>counts.texture++);
  owned.userData.stopTexturePolling=()=>counts.poll++;
  releasePrivateModel(root,new Set([shared]));
  assert.deepEqual(counts,{geometry:1,shared:0,owned:1,texture:0,poll:1});
});
