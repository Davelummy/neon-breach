// Local gameplay snapshots, never authentication data or server-trusted scores.
export const CHECKPOINT_VERSION=2;
const FIELDS=['nightVision','viewMode','civilians','gunShop','wave','wavePhase','waveTimer','pending','spawnTimer','initialWaveCount','enemies','projectiles','pickups','particles','cars','totalTime','slowMo','eliteSpawned','objective','objectiveTarget','missionStage','missionHold','missionSpawnStep','missionProgress','extractionArmed','tutorialStep','takedowns','roadkills','squadAlert','destroyNodes','hitStop','comboPeak','damageTaken','daily','finisherCam','corpses','bloodDecals'];
const clone=value=>JSON.parse(JSON.stringify(value));
export function captureCheckpoint(state,player,owner){
  const world={};for(const key of FIELDS)if(state[key]!==undefined)world[key]=state[key];
  return clone({version:CHECKPOINT_VERSION,owner,arena:state.arenaId,operation:state.operation,difficulty:state.difficulty,timeOfDay:state.timeOfDay,player,world,brokenGlass:[...state.brokenGlass]});
}
function safeTree(value,depth=0){
  if(depth>12)return false;
  if(value===null||typeof value==='boolean')return true;
  if(typeof value==='number')return Number.isFinite(value);
  if(typeof value==='string')return value.length<=500;
  if(Array.isArray(value))return value.length<=600&&value.every(item=>safeTree(item,depth+1));
  if(!value||typeof value!=='object')return false;
  const entries=Object.entries(value);return entries.length<=150&&entries.every(([key,item])=>!['__proto__','constructor','prototype'].includes(key)&&safeTree(item,depth+1));
}
export function restoreCheckpoint(snapshot,state,player,{owner,width,height,enemyTypes,weaponCount,stageCount}={}){
  try{
    if(!snapshot||snapshot.version!==CHECKPOINT_VERSION||!owner||snapshot.owner!==owner||snapshot.arena!==state.arenaId||snapshot.operation!==state.operation||!safeTree(snapshot)||JSON.stringify(snapshot).length>1000000)return false;
    const p=snapshot.player,w=snapshot.world;
    if(w?.nightVision!==undefined&&typeof w.nightVision!=='boolean'||w?.viewMode!==undefined&&!['first','third'].includes(w.viewMode))return false;
    if(w?.civilians!==undefined&&(!Array.isArray(w.civilians)||w.civilians.length>15||w.civilians.some(c=>!c||![c.x,c.y,c.dir,c.wait,c.flee,c.vx,c.vy].every(Number.isFinite)||!Number.isInteger(c.id)||!Number.isInteger(c.variant)||![0,1].includes(c.target)||!Array.isArray(c.route)||c.route.length!==2||c.route.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))))return false;
    if(w?.gunShop!=null&&(!Number.isFinite(w.gunShop.x)||!Number.isFinite(w.gunShop.y)||w.gunShop.x<=0||w.gunShop.x>=width-1||w.gunShop.y<=0||w.gunShop.y>=height-1))return false;
    if(!p||!w||![p.x,p.y,p.z,p.dir,p.ammo,p.reserve,p.health,w.missionHold,w.totalTime].every(Number.isFinite)||p.x<=0||p.x>=width-1||p.y<=0||p.y>=height-1||p.health<=0||p.ammo<0||p.reserve<0||!Number.isInteger(p.weaponIndex)||p.weaponIndex<0||p.weaponIndex>=weaponCount||!Array.isArray(p.weaponSlots)||p.weaponSlots.length!==weaponCount)return false;
    if(!Number.isInteger(w.missionStage)||w.missionStage<0||w.missionStage>=stageCount||!Array.isArray(w.cars)||w.cars.length!==state.cars.length||!Array.isArray(w.enemies)||w.enemies.some(e=>!enemyTypes[e.type]||!Number.isFinite(e.x)||!Number.isFinite(e.y))||!Number.isInteger(p.carIndex)||p.carIndex< -1||p.carIndex>=w.cars.length||!Array.isArray(snapshot.brokenGlass))return false;
    if(p.carIndex>=0&&w.cars[p.carIndex].destroyed)return false;
    const copy=clone(snapshot);
    for(const key of Object.keys(player))if(Object.hasOwn(copy.player,key))player[key]=copy.player[key];
    for(const key of FIELDS)if(Object.hasOwn(copy.world,key))state[key]=copy.world[key];
    state.brokenGlass=new Set(copy.brokenGlass);state.commander=state.enemies.find(e=>e.commander&&!e.dead)||null;
    state.lockTarget=null;state.lastTime=performance.now();return true;
  }catch{return false;}
}
