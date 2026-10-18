import * as THREE from '/vendor/three.module.min.js';
import {ARENAS,WALL_HEIGHTS,snapshotArena} from './data.js';
import {createArenaLandmark,populateDistrictRoads} from './combat-presentation.js';
import {createVehicleFactory} from './vehicle-presentation.js';
import {createFleet} from './multiplayer-vehicles.js';
import {releasePrivateModel} from './render-utils.js';

// One on-demand view: no animation loop, downloads, shadows or postprocessing.
// Disposed when mission selection closes so it never competes with gameplay.
export function createArenaPreview(container){
  const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'low-power'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('role','img');container.replaceChildren(canvas);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.1,130);
  const hemi=new THREE.HemisphereLight(0xd9f1ff,0x384335,2),sun=new THREE.DirectionalLight(0xffeed1,3);sun.position.set(10,28,6);scene.add(hemi,sun);
  let root=null,arenaId=null,time='day',angle=.65,drag=null,disposed=false;
  const privateMaterials=new Set();
  const mat=(color,roughness=.8,metalness=.05)=>{const material=new THREE.MeshStandardMaterial({color,roughness,metalness});privateMaterials.add(material);return material;};
  const mesh=(geometry,material)=>new THREE.Mesh(geometry,material);
  function release(){if(!root)return;const maps=new Set();root.traverse(o=>{if(o.material?.map)maps.add(o.material.map);});for(const texture of maps)texture.dispose();releasePrivateModel(root,new Set());for(const material of privateMaterials)material.dispose();privateMaterials.clear();}
  function render(){if(disposed)return;const width=Math.max(1,container.clientWidth),height=Math.max(1,container.clientHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1,Math.sqrt(300000/(width*height))));renderer.setSize(width,height,false);camera.aspect=width/height;camera.position.set(20+Math.sin(angle)*34,30,20+Math.cos(angle)*34);camera.lookAt(20,0,20);camera.updateProjectionMatrix();renderer.render(scene,camera);canvas.dataset.arena=arenaId;canvas.dataset.time=time;canvas.dataset.calls=String(renderer.info.render.calls);canvas.dataset.triangles=String(renderer.info.render.triangles);canvas.setAttribute('aria-label',`${ARENAS.find(a=>a.id===arenaId)?.name||'Arena'} · ${time} · 3D preview`);}
  function setTime(value){time=value==='night'?'night':'day';const night=time==='night';scene.background=new THREE.Color(night?0x0b182c:0xaac8d3);scene.fog=new THREE.Fog(night?0x0b182c:0xaac8d3,55,105);hemi.color.set(night?0x849fdf:0xd9f1ff);hemi.intensity=night?.85:2;sun.color.set(night?0x8eacff:0xffeed1);sun.intensity=night?.65:3;render();}
  function setArena(id){
    if(id===arenaId)return;const arena=ARENAS.find(a=>a.id===id);if(!arena)return;
    if(root){scene.remove(root);release();}arenaId=id;root=new THREE.Group();scene.add(root);
    const world=snapshotArena(id),dummy=new THREE.Object3D(),groups=new Map();
    const ground=mesh(new THREE.PlaneGeometry(48,48),mat(arena.ground,1,0));ground.rotation.x=-Math.PI/2;ground.position.set(24,-.02,24);root.add(ground);
    for(let y=0;y<48;y++)for(let x=0;x<48;x++){const type=world.map[y][x];if(!type)continue;const height=x===0||y===0||x===47||y===47?2.55:WALL_HEIGHTS[type],key=`${type}:${height}`;if(!groups.has(key))groups.set(key,{type,height,cells:[]});groups.get(key).cells.push([x+.5,y+.5]);}
    const colors={1:0xb4afa0,2:0x8e9693,3:0xb79b7b,4:0xb7cad0,5:0xc7c4b7,6:0x386943,7:0x376e86,8:0x9a7b52};
    for(const {type,height,cells} of groups.values()){const m=mat(colors[type]);if(type===4){m.transparent=true;m.opacity=.55;}const object=new THREE.InstancedMesh(new THREE.BoxGeometry(.98,height,.98),m,cells.length);cells.forEach(([x,z],i)=>{dummy.position.set(x,height/2,z);dummy.updateMatrix();object.setMatrixAt(i,dummy.matrix);});object.computeBoundingSphere();root.add(object);}
    for(const c of world.covers){const object=mesh(new THREE.BoxGeometry(c.w,c.height,c.d),mat(c.kind==='planter'?0x386943:0x8b7964));object.position.set(c.x,c.height/2,c.y);root.add(object);}
    const darkMetal=mat(0x172023,.4,.7),wallMaterials=Object.fromEntries([5,6,7,8].map(type=>[type,mat(colors[type])]));root.add(createArenaLandmark(arena,{THREE,mat,mesh,wallMaterials,darkMetal}));
    const tiles=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.012,1),mat(0xffffff,.96,0),2304),lines=new THREE.InstancedMesh(new THREE.BoxGeometry(.07,.012,.65),mat(0xe6ddbc,.95,0),400);populateDistrictRoads({THREE,map:world.map,roadTiles:tiles,roadLines:lines});root.add(tiles,lines);
    createFleet(world);const createCar=createVehicleFactory({THREE,mat,mesh,darkMetal,blackMetal:darkMetal,cheapGlass:true});for(const car of world.vehicles){const model=createCar(car.color,car.kind);model.position.set(car.x,0,car.y);model.rotation.y=-car.dir;root.add(model);}
    setTime(time);
  }
  const observer=new ResizeObserver(render);observer.observe(container);
  const down=e=>{drag=e.clientX;canvas.setPointerCapture(e.pointerId);},move=e=>{if(drag===null)return;angle+=(e.clientX-drag)*.008;drag=e.clientX;render();},up=()=>drag=null;
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
  canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();angle+=e.code==='ArrowLeft'?-.2:.2;render();}});
  return {setArena,setTime,rotate:delta=>{angle+=delta;render();},dispose(){if(disposed)return;disposed=true;observer.disconnect();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);release();renderer.dispose();renderer.forceContextLoss();canvas.remove();}};
}
