import {vehicleBounds} from './data.js';
export const MAX_LIVE_ENEMIES=24;
export function tacticalShotSpread(base,speed=0,grounded=true,sprinting=false){
  const motion=Math.min(.7,Math.max(0,Number.isFinite(speed)?speed:0)*.09);
  return Math.max(.001,Number.isFinite(base)?base:.001)*(1+motion)*(grounded?1:1.8)*(sprinting?1.4:1);
}
export function perceptionDue(enemy,dt){
  enemy.perceptionTimer=(enemy.perceptionTimer??0)-Math.max(0,dt);
  if(enemy.perceptionTimer>0)return false;
  enemy.perceptionTimer=.1;return true; // One observation, never a catch-up storm.
}
export function shareObservation(observer,ally){
  if(ally.dead||Math.hypot(ally.x-observer.x,ally.y-observer.y)>=5.5)return false;
  ally.awareness=Math.max(ally.awareness||0,.58);
  ally.lastSeenX=observer.lastSeenX;ally.lastSeenY=observer.lastSeenY;return true;
}
export function reinforcementEntry(candidates,player,occupied,isOpen,isVisible){
  for(const point of candidates){
    if(!Array.isArray(point)||!point.every(Number.isFinite))continue;
    const dx=point[0]-player.x,dy=point[1]-player.y,distance=Math.hypot(dx,dy);
    if(distance<8||!isOpen(point[0],point[1])||occupied.some(e=>!e.dead&&Math.hypot(e.x-point[0],e.y-point[1])<3))continue;
    const facing=Math.cos(player.dir)*dx+Math.sin(player.dir)*dy;
    if(facing>distance*.5&&isVisible(point[0],point[1]))continue;
    return point;
  }return null;
}
export function vehicleIntegrity(kind,perkHull=100){return ({taxi:450,tricycle:300,bus:800}[kind]||450)+Math.max(0,perkHull-100);}
export function vehicleBallisticDamage(amount){return Number.isFinite(amount)&&amount>0?amount*.3:0;}
export function enemyPerception(enemy,dx,dy,distance,noisy=false){return distance<2||enemy.awareness>.5||noisy||Math.cos(enemy.facing||0)*dx+Math.sin(enemy.facing||0)*dy>distance*.25;}
export function vehicleImpactDamage(car,previousX,previousY,enemy){
  const speed=Math.abs(car.speed||0);if(speed<=2.35||car.destroyed||enemy.dead||enemy.spawn>0||enemy.vehicleHitCooldown>0||(enemy.z||0)>vehicleBounds(car).height+.4)return 0;
  const dx=car.x-previousX,dy=car.y-previousY,distance=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
  return rayVehicleDistance(enemy.x,enemy.y,angle,car,distance,enemy.radius||.32)!==null?speed*58:0;
}
export function rayVehicleDistance(x,y,angle,car,maxDistance=40,padding=0){
  const c=Math.cos(car.dir),s=Math.sin(car.dir),dx=x-car.x,dy=y-car.y;
  const origin=[dx*c+dy*s,-dx*s+dy*c],direction=[Math.cos(angle)*c+Math.sin(angle)*s,-Math.cos(angle)*s+Math.sin(angle)*c];
  const bounds=vehicleBounds(car),extents=[bounds.halfLength+padding,bounds.halfWidth+padding];let near=0,far=maxDistance;
  for(let axis=0;axis<2;axis++){
    if(Math.abs(direction[axis])<1e-8){if(Math.abs(origin[axis])>extents[axis])return null;continue;}
    const a=(-extents[axis]-origin[axis])/direction[axis],b=(extents[axis]-origin[axis])/direction[axis];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(near>far)return null;
  }return far>=0?near:null;
}
export function blastDamage(distance,radius=3.8,peak=120){return Number.isFinite(distance)&&distance>=0&&distance<radius?peak*(1-distance/radius):0;}
export function encounterExtras(entries){
  if(!entries?.length)return [];
  const added=[];
  for(let n=0;n<Math.min(3,Math.ceil(entries.length/2));n++){
    const [,x,y]=entries[n%entries.length];added.push([n%2?'specter':'wraith',x+(n%2?-4:4),y+(n===2?4:-3)]);
  }return added;
}
