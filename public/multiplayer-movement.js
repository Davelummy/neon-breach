import {WALL_HEIGHTS,vehicleDistance,vehicleBounds,WEAPONS} from './data.js';
export const RULES={players:8,rooms:16,tick:.05,round:180,respawn:3,protection:2,speed:2.9,sprintSpeed:4.35,damage:25,shot:.15,magazine:WEAPONS[0].mag,reserve:WEAPONS[0].reserve,reload:WEAPONS[0].reload,jetHeight:3.8,jetDrain:29,jetRecharge:22};
export function surfaceAt(world,x,y){
  let height=0;
  for(const [dx,dy] of [[-.27,-.27],[.27,-.27],[-.27,.27],[.27,.27]]){
    const xx=x+dx,yy=y+dy,type=world.map[Math.floor(yy)]?.[Math.floor(xx)];
    if(type)height=Math.max(height,WALL_HEIGHTS[type]||0);
    for(const c of world.covers)if(Math.abs(xx-c.x)<c.w/2&&Math.abs(yy-c.y)<c.d/2)height=Math.max(height,c.height);
  }for(const car of world.vehicles||[])if(!car.destroyed&&vehicleDistance(car,x,y)<.25)height=Math.max(height,vehicleBounds(car).height);return height;
}
export function openAt(world,x,y,z=0){
  for(const [dx,dy] of [[-.27,-.27],[.27,-.27],[-.27,.27],[.27,.27]]){
    const xx=x+dx,yy=y+dy,type=world.map[Math.floor(yy)]?.[Math.floor(xx)];
    if(xx<1||yy<1||xx>=47||yy>=47||type===undefined||(type&&WALL_HEIGHTS[type]>z+.05))return false;
    if(world.covers.some(c=>Math.abs(xx-c.x)<c.w/2&&Math.abs(yy-c.y)<c.d/2&&c.height>z+.05))return false;
  }return true;
}
export function footOpen(world,x,y,z=0){return openAt(world,x,y,z)&&!(world.vehicles||[]).some(car=>!car.destroyed&&z<vehicleBounds(car).height-.05&&vehicleDistance(car,x,y)<.27);}
export function movePlayer(p,input,world){
  const jump=!!input?.jump;if(input){p.angle=input.angle;p.pitch=input.pitch;}
  const floor=surfaceAt(world,p.x,p.y),grounded=p.z<=floor+.001;
  p.crouched=!!input?.crouch&&grounded;
  if(grounded)p.jetEmpty=false;
  if(jump&&!p.jumpHeld&&grounded)p.vz=3.5;p.jumpHeld=jump;
  p.jetFuel=Math.max(0,Math.min(100,p.jetFuel??100));
  p.jetting=jump&&!p.jetEmpty&&(p.vz>0||!grounded)&&p.jetFuel>0;
  if(p.jetting){const headroom=Math.max(-.35,Math.min(1,(RULES.jetHeight-p.z)/1.3)),target=3.25*headroom;p.vz+=(target-p.vz)*Math.min(1,RULES.tick*(p.vz<target?5.5:9));p.jetFuel=Math.max(0,p.jetFuel-RULES.jetDrain*RULES.tick*(.55+.45*Math.max(0,headroom)));if(p.jetFuel===0)p.jetEmpty=true;}
  else{p.vz-=8.7*RULES.tick;p.jetFuel=Math.min(100,p.jetFuel+RULES.tick*(grounded?RULES.jetRecharge:jump?0:4));}
  p.z=Math.max(floor,Math.min(RULES.jetHeight,p.z+p.vz*RULES.tick));if(p.z===floor)p.vz=0;else if(p.z===RULES.jetHeight)p.vz=Math.min(0,p.vz);
  if(!input){p.moveVx=p.moveVy=0;return;}
  const length=Math.max(1,Math.hypot(input.forward,input.strafe)),f=input.forward/length,s=input.strafe/length;
  const sprinting=input.sprint&&!p.crouched&&f>.25&&!input.aim&&!p.reload,maximum=(sprinting?RULES.sprintSpeed:RULES.speed)*(p.crouched?.55:1)*(input.aim?.72:1)*(grounded?1:1.08)*(p.hp<30?.92:1);
  const accel=grounded?(sprinting?16:13):7.5;
  p.moveVx=(p.moveVx||0)+((Math.cos(p.angle)*f-Math.sin(p.angle)*s)*maximum-(p.moveVx||0))*Math.min(1,RULES.tick*accel);
  p.moveVy=(p.moveVy||0)+((Math.sin(p.angle)*f+Math.cos(p.angle)*s)*maximum-(p.moveVy||0))*Math.min(1,RULES.tick*accel);
  if(Math.abs(p.moveVx)<.001)p.moveVx=0;if(Math.abs(p.moveVy)<.001)p.moveVy=0;
  const dx=p.moveVx*RULES.tick,dy=p.moveVy*RULES.tick;
  if(footOpen(world,p.x+dx,p.y,p.z))p.x+=dx;else p.moveVx*=.15;
  if(footOpen(world,p.x,p.y+dy,p.z))p.y+=dy;else p.moveVy*=.15;
}
