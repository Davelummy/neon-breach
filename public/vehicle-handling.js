// Shared bounded arcade handling; integration/collision remains owned by each mode.
export function updateVehicleHandling(car,throttle,steering,boost,brake,dt){
  dt=Math.max(0,Math.min(.05,Number(dt)||0));throttle=Math.max(-1,Math.min(1,throttle||0));steering=Math.max(-1,Math.min(1,steering||0));
  const bus=car.kind==='bus',keke=car.kind==='tricycle',top=bus?5.8:keke?6.4:7.1,reverse=bus?2.2:keke?2.6:3.1;
  const boosting=!!boost&&throttle>.2&&!brake&&(car.boost??100)>0;
  car.boost=Math.max(0,Math.min(100,(car.boost??100)+dt*(boosting?-31:16)));
  const target=throttle*(throttle<0?reverse:boosting?(bus?8.2:keke?8.6:10.8):top),previous=car.speed||0;
  const reversing=previous*throttle<0&&Math.abs(previous)>.1;
  const rate=brake||reversing?11:Math.abs(throttle)<.08?3.5:boosting?9.6:bus?4.3:keke?5.8:7.5;
  const desired=brake||reversing?0:target,change=Math.max(-rate*dt,Math.min(rate*dt,desired-previous));car.speed=previous+change;
  if(Math.abs(car.speed)<.03&&Math.abs(throttle)<.08)car.speed=0;
  car.steer=(car.steer||0)+(steering-(car.steer||0))*(1-Math.exp(-dt*(brake?5:8)));
  const speed=Math.abs(car.speed),grip=1-Math.min(.42,speed/(top*2.5)),turn=(bus?.9:keke?2.1:1.65)*Math.min(1,speed/2.4)*grip;
  if(speed>.08)car.dir+=car.steer*turn*dt*Math.sign(car.speed);car.dir=Math.atan2(Math.sin(car.dir),Math.cos(car.dir));
  car.boosting=boosting;car.braking=!!brake||reversing;return boosting;
}
