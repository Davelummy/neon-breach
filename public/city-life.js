// Local campaign ambience and earned-credit equipment. Never server-trusted currency.
export const GUN_PRICES=[0,100,160,240,180,300];
export function readWallet(storage,owner){
  try{const v=JSON.parse(storage?.getItem(`neon-wallet:${owner}`)||'null');return {credits:Math.max(0,Math.min(1000000,Math.floor(Number(v?.credits)||0))),owned:Array.isArray(v?.owned)?[...new Set(v.owned.filter(n=>Number.isInteger(n)&&n>0&&n<GUN_PRICES.length))]:[]};}catch{return {credits:0,owned:[]};}
}
export function buyGun(wallet,index){
  if(!Number.isInteger(index)||index<=0||index>=GUN_PRICES.length||wallet.owned.includes(index))return false;
  const price=GUN_PRICES[index];if(wallet.credits<price)return false;
  wallet.credits-=price;wallet.owned.push(index);return true;
}
export function createCityLife(arena,passable,vehicles=[]){
  const hubs=arena==='jabi-lake'?[[35,35],[24,36],[12,37]]:arena==='millennium-park'?[[24,24],[36,24],[12,36]]:[[12,24],[24,12],[36,36]];
  const civilians=[];let shop=null;
  for(const [hx,hy] of hubs)for(let r=0;r<5;r++){
    let route=null;for(let dx=-3;dx<=3&&!route;dx++)for(let dy=-3;dy<=3&&!route;dy++){
      const x=hx+dx+.5,y=hy+dy+.5;if(!passable(x,y)||civilians.some(c=>Math.hypot(c.route[0][0]-x,c.route[0][1]-y)<.65))continue;
      for(const [vx,vy] of [[1,0],[0,1],[-1,0],[0,-1]])if(passable(x+vx,y+vy)&&passable(x+vx*.5,y+vy*.5)){route=[[x,y],[x+vx,y+vy]];break;}
    }
    if(!route)continue;
    // Offset starts and pause durations without creating unbounded navigation jobs.
    civilians.push({id:civilians.length,x:route[0][0],y:route[0][1],route,target:1,dir:0,vx:0,vy:0,wait:r*.8,flee:0,variant:civilians.length%4});
  }
  for(const [hx,hy] of hubs)for(let dx=-8;dx<=8&&!shop;dx++)for(let dy=-8;dy<=8&&!shop;dy++){const x=hx+dx+.5,y=hy+dy+.5;if(passable(x,y)&&vehicles.every(c=>Math.hypot(c.x-x,c.y-y)>5))shop={x,y,name:'District Armory'};}
  return {civilians,shop};
}
export function updateCityLife(civilians,dt,player,noise,passable){
  for(const c of civilians){
    if(noise&&Math.hypot(c.x-player.x,c.y-player.y)<10)c.flee=4;
    c.flee=Math.max(0,c.flee-dt);c.wait=Math.max(0,c.wait-dt);c.vx=c.vy=0;
    if(c.wait>0)continue;
    const target=c.route[c.target],dx=target[0]-c.x,dy=target[1]-c.y,d=Math.hypot(dx,dy);
    if(d<.08){c.target=1-c.target;c.wait=c.flee?0:1.2+c.variant*.7;continue;}
    const speed=c.flee?1.8:.65,step=Math.min(d,speed*dt),x=c.x+dx/d*step,y=c.y+dy/d*step;
    if(!passable(x,y)){c.wait=.5;continue;}c.vx=dx/d*speed;c.vy=dy/d*speed;c.x=x;c.y=y;c.dir=Math.atan2(dy,dx);
  }
}
