import * as THREE from '/vendor/three.module.min.js';
import {createCombatModels} from './combat-presentation.js';
import {releasePrivateModel} from './render-utils.js';
import {weaponFacts} from './weapon-cards.js';
let dialog,cleanup=()=>{},generation=0;
const node=(tag,text,className)=>{const element=document.createElement(tag);if(text)element.textContent=text;if(className)element.className=className;return element;};
export async function openWeaponPreview(weapon,{status='Available',action,returnFocus,onAction=()=>{}}={}){
 cleanup();const token=++generation,invoker=returnFocus||document.activeElement;
 if(!dialog){dialog=node('dialog');dialog.id='weaponPreviewDialog';document.body.append(dialog);dialog.addEventListener('close',()=>{generation++;cleanup();});dialog.addEventListener('keydown',e=>e.stopPropagation());}
 dialog.replaceChildren();dialog.setAttribute('aria-labelledby','weaponPreviewTitle');
 const header=node('div',null,'weapon-preview-head'),title=node('h2',weapon.name);title.id='weaponPreviewTitle';const close=node('button','Close');close.type='button';close.onclick=()=>dialog.close();header.append(title,close);
 const state=node('p',status,'weapon-preview-status');state.id='weaponPreviewStatus';const stage=node('div',null,'weapon-preview-stage'),message=node('p','Drag to rotate, or use the rotation buttons. Previewing does not equip or buy this weapon.');message.setAttribute('role','status');
 const rotate=node('div',null,'weapon-preview-rotate'),left=node('button','↶ Rotate left'),right=node('button','Rotate right ↷'),reset=node('button','Reset view');rotate.append(left,right,reset);
 const facts=node('dl',null,'weapon-preview-facts');for(const [label,value]of Object.entries(weaponFacts(weapon))){const pair=node('div');pair.append(node('dt',{damage:'Damage',magazine:'Magazine',reload:'Reload time',role:'Weapon role'}[label]),node('dd',value));facts.append(pair);}
 const footer=node('div',null,'weapon-preview-footer');if(action){const apply=node('button',action.label);apply.id='weaponPreviewAction';apply.disabled=!!action.disabled;apply.onclick=()=>{if(!apply.disabled){dialog.close();onAction();}};footer.append(apply);}const done=node('button','Back to weapons');done.onclick=()=>dialog.close();footer.append(done);
 dialog.append(header,state,stage,message,rotate,facts);if(weapon.unlock&&status.startsWith('Locked'))dialog.append(node('p',`Earn through campaign milestones or the district armory. ${weapon.unlock.label}`));dialog.append(footer);if(!dialog.open)dialog.showModal();close.focus();
 let renderer,model,observer,raf=0,drag=null,disposed=false;const privateMaterials=[];
 cleanup=()=>{if(disposed)return;disposed=true;cancelAnimationFrame(raf);observer?.disconnect();if(model)releasePrivateModel(model,new Set(privateMaterials));for(const material of privateMaterials)material.dispose();renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove();if(invoker?.isConnected)invoker.focus({preventScroll:true});};
 try{
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'low-power'});renderer.domElement.id='weaponPreviewCanvas';renderer.domElement.setAttribute('aria-label',`${weapon.name} rotatable 3D model`);renderer.domElement.setAttribute('role','img');renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));renderer.outputColorSpace=THREE.SRGBColorSpace;stage.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.01,20);camera.position.set(1.3,.65,1.7);camera.lookAt(0,0,0);
  scene.add(new THREE.HemisphereLight(0xcfeaff,0x28312d,3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(2,3,4);scene.add(light);
  const mat=(color,roughness=.6,metalness=.3)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness});privateMaterials.push(m);return m;};const mesh=(g,m)=>new THREE.Mesh(g,m);
  const factory=createCombatModels({THREE,mat,mesh,darkMetal:mat('#35434b'),blackMetal:mat('#10171e'),bodyMat:mat,weaponTextures:{},enemyTypes:{}});model=factory.createWeaponModel(weapon.id,new THREE.Color(weapon.color).getHex());
  // Inspect the mesh without the gameplay-only photographic side decal.
  model.traverse(object=>{object.userData.stopTexturePolling?.();if(object.isMesh&&object.geometry.type==='PlaneGeometry')object.visible=false;});
  const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());model.position.sub(center);const pivot=new THREE.Group();pivot.add(model);pivot.rotation.y=-Math.PI/2;scene.add(pivot);const extent=Math.max(size.x,size.y,size.z);camera.position.set(extent*.75,extent*.32,extent*1.65);camera.lookAt(0,0,0);
  function draw(){if(disposed||token!==generation||!dialog.open||document.hidden)return;renderer.render(scene,camera);}
  function schedule(){cancelAnimationFrame(raf);raf=requestAnimationFrame(draw);}
  const resize=()=>{if(disposed)return;const {width,height}=stage.getBoundingClientRect();renderer.setSize(Math.min(width,900),Math.min(height,450),false);camera.aspect=width/Math.max(1,height);const bounds=new THREE.Box3().setFromObject(pivot).getSize(new THREE.Vector3()),tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));const distance=Math.max(bounds.x/(2*tangent*camera.aspect),bounds.y/(2*tangent))*1.3+bounds.z*.6;camera.position.set(distance*.18,distance*.12,distance);camera.lookAt(0,0,0);camera.updateProjectionMatrix();schedule();};observer=new ResizeObserver(resize);observer.observe(stage);
  const turn=delta=>{pivot.rotation.y+=delta;schedule();};left.onclick=()=>turn(-Math.PI/8);right.onclick=()=>turn(Math.PI/8);reset.onclick=()=>{pivot.rotation.set(0,-Math.PI/2,0);schedule();};
  renderer.domElement.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();drag={id:e.pointerId,x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);};renderer.domElement.onpointermove=e=>{if(drag?.id!==e.pointerId)return;pivot.rotation.y+=(e.clientX-drag.x)*.012;pivot.rotation.x=THREE.MathUtils.clamp(pivot.rotation.x+(e.clientY-drag.y)*.008,-.8,.8);drag.x=e.clientX;drag.y=e.clientY;schedule();};renderer.domElement.onpointerup=renderer.domElement.onpointercancel=()=>drag=null;
  resize();
 }catch{cleanup();message.textContent='3D preview is unavailable on this device. Weapon facts and normal selection remain available.';left.disabled=right.disabled=reset.disabled=true;}
}
