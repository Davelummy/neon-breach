// Forward is +X; steering pivots around Y and wheel axles rotate around Z.
export function createVehicleFactory({THREE,mat,mesh,darkMetal,blackMetal,cheapGlass=false}) {
return function createCar(color='#23834b',kind='taxi'){
 const root=new THREE.Group(),body=new THREE.Group();root.add(body);
 const paint=mat(kind==='tricycle'?0xf2bd26:new THREE.Color(color),.3,.28),white=mat(0xe8e9df,.38,.1),trim=darkMetal;
 const glass=cheapGlass?mat(0x244452,.24,.12):new THREE.MeshPhysicalMaterial({color:0x244452,roughness:.2,metalness:.12,clearcoat:1});
 const rim=mat(0x889293,.26,.82);
 const head=new THREE.MeshStandardMaterial({color:0xe9efdb,emissive:0xe9efdb,emissiveIntensity:.35});
 const tail=new THREE.MeshStandardMaterial({color:0xa71c17,emissive:0xff2418,emissiveIntensity:.15});
 function box(w,h,d,m,x,y,z=0,parent=body){const o=mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);parent.add(o);return o;}
 function profile(points,width,m){const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.02,bevelThickness:.01});g.translate(0,0,-width/2);const o=mesh(g,m);body.add(o);return o;}
 const wheels=[],wheelRigs=[];
 function wheel(x,z,r,width,steers){const pivot=new THREE.Group(),spin=new THREE.Group();pivot.position.set(x,r,z);pivot.add(spin);root.add(pivot);const tyre=mesh(new THREE.CylinderGeometry(r,r,width,16),blackMetal);tyre.rotation.x=Math.PI/2;spin.add(tyre);const hub=mesh(new THREE.CylinderGeometry(r*.57,r*.57,width+.008,12),rim);hub.rotation.x=Math.PI/2;spin.add(hub);for(const side of [-1,1]){const spoke=mesh(new THREE.BoxGeometry(r*.85,.025,.008),trim);spoke.position.z=side*(width/2+.006);spin.add(spoke);}wheels.push(spin);wheelRigs.push({pivot,spin,steers,radius:r});}
 if(kind==='bus'){
  profile([[-1.65,.34],[1.65,.34],[1.65,1.44],[1.4,1.7],[-1.6,1.7]],1.31,paint);
  box(3.18,.07,1.3,white,-.06,1.73);
  for(const z of [-.67,.67]){box(3.26,.24,.02,white,0,.72,z);for(const x of [-1.17,-.58,.01,.6])box(.5,.47,.025,glass,x,1.29,z);box(.02,.65,.025,trim,.95,1.14,z);box(.34,.78,.025,glass,1.16,1.05,z);box(.08,.025,.03,rim,1.03,.88,z);}
  const windshield=box(.015,.3,1.1,glass,1.58,1.57);windshield.rotation.z=.766;
  box(.05,.15,1.25,trim,1.66,.43);box(.05,.15,1.25,trim,-1.66,.43);
  for(const z of [-.48,.48]){box(.035,.12,.21,head,1.68,.69,z);box(.035,.2,.1,tail,-1.68,.68,z);}
  for(const x of [-1.12,1.05])for(const z of [-.62,.62])wheel(x,z,.29,.13,x>0);
 }else if(kind==='tricycle'){
  const seat=mat(0x323b3b,.95,.02);
  profile([[-.68,.28],[.22,.28],[.26,.55],[-.65,.56]],.59,paint);
  box(.93,.09,.67,trim,-.24,1.12);box(.88,.035,.65,paint,-.24,1.18);
  box(.47,.1,.51,seat,-.37,.63);box(.09,.3,.5,seat,-.59,.76);
  for(const x of [-.63,.17])for(const z of [-.3,.3])box(.035,.56,.035,trim,x,.87,z);
  profile([[.23,.31],[.64,.31],[.6,.69],[.43,.86],[.3,.85]],.32,paint);
  const wind=box(.025,.27,.36,glass,.33,.94);wind.rotation.z=.25;
  box(.035,.34,.035,rim,.6,.43);box(.025,.035,.38,trim,.36,.83);
  box(.028,.11,.14,head,.64,.65);for(const z of [-.23,.23])box(.025,.08,.09,tail,-.69,.43,z);
  wheel(-.48,-.31,.19,.12,false);wheel(-.48,.31,.19,.12,false);wheel(.52,0,.19,.12,true);
 }else{
  profile([[-.93,.26],[.93,.26],[.92,.44],[.62,.54],[-.56,.54],[-.92,.46]],.77,paint);
  profile([[-.59,.51],[-.4,.8],[.17,.82],[.49,.53]],.65,glass);
  profile([[-.43,.8],[.18,.82],[.2,.86],[-.44,.85]],.65,white);
  for(const z of [-.395,.395]){
   box(.88,.2,.018,white,-.06,.42,z);
   for(const [x,y,length,angle] of [[-.495,.655,.347,-.58],[-.06,.665,.31,0],[.33,.675,.432,.835]]){const pillar=box(.03,length,.026,paint,x,y,z*.83);pillar.rotation.z=angle;}
   box(.018,.22,.023,trim,-.06,.41,z*1.025);box(.09,.025,.028,trim,-.18,.49,z*1.027);
   box(.13,.06,.09,paint,.32,.65,z*.97);
  }
  box(.025,.12,.73,trim,.965,.3);box(.025,.12,.73,trim,-.965,.3);
  box(.025,.1,.26,trim,.955,.43);
  for(const z of [-.27,.27]){box(.025,.1,.17,head,.955,.48,z);box(.025,.095,.15,tail,-.955,.46,z);}
  box(.26,.075,.15,white,-.12,.925);
  for(const x of [-.59,.59])for(const z of [-.365,.365])wheel(x,z,.19,.15,x>0);
 }
 // Bake static details by material: extra trim must not add one draw call per part.
 function batch(group){
  const groups=new Map();for(const child of group.children){if(!child.isMesh)continue;if(!groups.has(child.material))groups.set(child.material,[]);groups.get(child.material).push(child);}
  for(const [material,parts] of groups){if(parts.length<2)continue;const attributes={position:[],normal:[],uv:[]};
   for(const part of parts){part.updateMatrix();const g=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();g.applyMatrix4(part.matrix);for(const name of Object.keys(attributes))attributes[name].push(g.attributes[name].array);g.dispose();group.remove(part);part.geometry.dispose();}
   const geometry=new THREE.BufferGeometry();for(const [name,arrays] of Object.entries(attributes)){const merged=new Float32Array(arrays.reduce((sum,a)=>sum+a.length,0));let offset=0;for(const a of arrays){merged.set(a,offset);offset+=a.length;}geometry.setAttribute(name,new THREE.BufferAttribute(merged,name==='uv'?2:3));}geometry.computeBoundingSphere();group.add(mesh(geometry,material));
  }
 }
 batch(body);for(const spin of wheels)batch(spin);
 Object.assign(root.userData,{wheels,wheelRigs,body,tailMaterial:tail,previousSpeed:0});
 return root;
};
}
export function animateVehicle(model,vehicle,delta){
 const dt=Math.max(0,Math.min(.1,Number.isFinite(delta)?delta:0)),data=model.userData;
 const speed=vehicle.destroyed?0:(vehicle.speed||0),steer=vehicle.destroyed?0:(vehicle.steer||0);
 for(const rig of data.wheelRigs){rig.spin.rotation.z=(rig.spin.rotation.z-speed*dt/rig.radius)%(Math.PI*2);rig.pivot.rotation.y=rig.steers?-steer*.38:0;}
 const acceleration=dt>0?(speed-data.previousSpeed)/dt:0,ease=1-Math.exp(-9*dt);
 data.body.rotation.x+=(-steer*Math.min(Math.abs(speed)/7,1)*.035-data.body.rotation.x)*ease;
 data.body.rotation.z+=(Math.max(-.035,Math.min(.035,-acceleration*.003))-data.body.rotation.z)*ease;
 data.tailMaterial.emissiveIntensity=vehicle.braking&&!vehicle.destroyed?2:.15;
 data.previousSpeed=speed;
}
