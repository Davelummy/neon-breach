import {CAR_SPAWNS,vehicleBounds,vehicleDistance} from './data.js';
import {RULES,openAt,footOpen} from './multiplayer-movement.js';
import {vehicleIntegrity} from './combat-rules.js';
import {updateVehicleHandling} from './vehicle-handling.js';

export function vehicleOpen(world,car,x=car.x,y=car.y){
  const {halfLength,halfWidth}=vehicleBounds(car),c=Math.cos(car.dir),s=Math.sin(car.dir);
  for(const a of [-halfLength,0,halfLength])for(const b of [-halfWidth,0,halfWidth]){
    const px=x+a*c-b*s,py=y+a*s+b*c;
    if(!openAt(world,px,py)||(world.vehicles||[]).some(other=>other.id!==car.id&&!other.destroyed&&vehicleDistance(other,px,py)<.1))return false;
  }return true;
}
export function createFleet(world){
  world.vehicles=[];
  for(const [index,source] of CAR_SPAWNS.entries()){
    const car={...source,id:`vehicle-${index}`,driver:null,speed:0,boost:100,steer:0,hp:vehicleIntegrity(source.kind),maxHp:vehicleIntegrity(source.kind),destroyed:false};
    if(!vehicleOpen(world,car)){
      let position=null;for(const lane of [12,24,36])for(let y=5;y<44;y+=4){if(position)break;const candidate={...car,x:lane,y,dir:Math.PI/2};if(vehicleOpen(world,candidate))position=candidate;}
      if(!position)continue;Object.assign(car,position);
    }world.vehicles.push(car);
  }return world.vehicles;
}
export function nearbyVehicle(world,p){
  if(p.z>.85||p.hp<=0)return null;let found=null,best=1.6;
  for(const car of world.vehicles||[]){const distance=vehicleDistance(car,p.x,p.y);if(car.destroyed||car.driver||distance>=best)continue;
    if(!openAt(world,(p.x+car.x)/2,(p.y+car.y)/2))continue;found=car;best=distance;
  }return found;
}
export function vehicleExit(world,car){
  const bounds=vehicleBounds(car);
  for(const extra of [.5,.9,1.4])for(const [angle,base] of [[Math.PI/2,bounds.halfWidth],[-Math.PI/2,bounds.halfWidth],[Math.PI,bounds.halfLength],[0,bounds.halfLength]]){
    const x=car.x+Math.cos(car.dir+angle)*(base+extra),y=car.y+Math.sin(car.dir+angle)*(base+extra);
    if(footOpen(world,x,y))return {x,y};
  }return null;
}
export function driveVehicle(car,input,world){
  const previousDir=car.dir;updateVehicleHandling(car,input?.forward,input?.strafe,input?.jump,input?.aim,RULES.tick);
  const x=car.x+Math.cos(car.dir)*car.speed*RULES.tick,y=car.y+Math.sin(car.dir)*car.speed*RULES.tick;
  if(vehicleOpen(world,car,x,y)){car.x=x;car.y=y;}
  else{car.dir=previousDir;car.speed=0;}
}
