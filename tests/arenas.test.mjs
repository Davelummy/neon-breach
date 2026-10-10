import test from 'node:test';
import assert from 'node:assert/strict';
import {ARENAS,OPERATIONS,MAP_BASE,map,restoreMapBase,applyOperationLayout,GROUND_HEIGHT,WALL_HEIGHTS,WORLD_COVERS,supportHeight,vehicleDistance,vehicleBounds,CAR_SPAWNS,MAP_W,MAP_H,arenaOperation,separatedSpawn} from '../public/data.js';
import {campaignValues,applyCampaignWrite} from '../server/campaign-rules.mjs';

test('completed base snapshot includes both building interiors',()=>{
  restoreMapBase();assert.equal(MAP_BASE[5][5],0);assert.equal(map[8][5],0);assert.equal(map[16][18],0);
});
test('three landmark arenas have distinct collision layouts',()=>{
  const layouts=new Set();for(const arena of ARENAS){applyOperationLayout('first-strike',arena.id);layouts.add(JSON.stringify(map));}
  assert.equal(layouts.size,3);restoreMapBase();
});
test('all arena/mission combinations retain reachable objectives and vehicle beacons',()=>{
  for(const arena of ARENAS)for(const op of OPERATIONS){
    applyOperationLayout(op.id,arena.id);const reachable=new Set(['11,18']),queue=[[11,18]];
    for(let n=0;n<queue.length;n++){const [x,y]=queue[n];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,key=`${nx},${ny}`;if(map[ny]?.[nx]===0&&!reachable.has(key)){reachable.add(key);queue.push([nx,ny]);}}}
    for(const stage of arenaOperation(op,arena.id).stages)for(const point of [stage.target,stage.beacon,...(stage.nodes||[]).map(n=>[n.x,n.y])].filter(Boolean)){
      const key=`${Math.floor(point[0])},${Math.floor(point[1])}`;assert.ok(reachable.has(key),`${arena.id}/${op.id}/${stage.code}: ${key} not reachable`);
    }
  }restoreMapBase();
});
test('expanded districts are four times the original footprint with clear outer driving loops',()=>{
  assert.equal(MAP_W*MAP_H,24*24*4);
  for(const arena of ARENAS){applyOperationLayout('first-strike',arena.id);for(let n=22;n<45;n++)for(const lane of [24,36]){assert.equal(map[n][lane],0);assert.equal(map[lane][n],0);}}
});
test('each arena spreads missions across districts and prevents overlapping squad spawns',()=>{
  for(const arena of ARENAS){applyOperationLayout('first-strike',arena.id);const operation=arenaOperation(OPERATIONS[0],arena.id),occupied=[];
    assert.ok(Math.hypot(...operation.stages[0].target.map((n,i)=>n-operation.stages[3].target[i]))>15);
    for(const stage of operation.stages)for(const [,x,y] of stage.squad||[]){const point=separatedSpawn([x,y],occupied);assert.ok(point);assert.ok(occupied.every(e=>Math.hypot(e.x-point[0],e.y-point[1])>=3));occupied.push({x:point[0],y:point[1]});}
  }
});
test('fence and cover supports use the same physical top plus the player anchor',()=>{
  restoreMapBase();assert.equal(supportHeight(17.5,9.5),GROUND_HEIGHT+WALL_HEIGHTS[1]);
  for(const cover of WORLD_COVERS)assert.ok(supportHeight(cover.x,cover.y)>=GROUND_HEIGHT+cover.height);
});
test('vehicle interaction measures the oriented body rather than its centre',()=>{
  const taxi={x:0,y:0,dir:0,kind:'taxi'};assert.ok(vehicleDistance(taxi,1.7,0)<.95);assert.equal(vehicleDistance(taxi,0,1),.54);
  taxi.dir=Math.PI/2;assert.ok(vehicleDistance(taxi,0,1.7)<.95);
  assert.equal(CAR_SPAWNS.filter(c=>c.kind==='tricycle').length,2);assert.ok(CAR_SPAWNS.filter(c=>c.kind==='taxi').every(c=>c.color==='#23834b'));
});
test('campaign records retain a validated arena and old saves get a safe default',()=>{
  assert.equal(campaignValues({arena:'jabi-lake'}).arena,'jabi-lake');
  assert.equal(campaignValues({arena:'not-an-arena'}).arena,'city-gate');
  const result=applyCampaignWrite(null,{arena:'millennium-park'});assert.equal(result.record.arena,'millennium-park');
});
test('bus has shared body bounds and every fleet spawn fits each arena',()=>{
  const bus=CAR_SPAWNS.find(car=>car.kind==='bus');assert.ok(bus);assert.equal(vehicleBounds(bus).halfLength,1.7);
  assert.equal(vehicleBounds(bus),vehicleBounds(bus),'bounds must not allocate every frame');
  assert.ok(vehicleDistance({...bus,x:0,y:0},2,0)<.31);
  for(const arena of ARENAS){applyOperationLayout('first-strike',arena.id);for(const car of CAR_SPAWNS){const b=vehicleBounds(car),c=Math.cos(car.dir),s=Math.sin(car.dir);for(const a of [-b.halfLength,0,b.halfLength])for(const d of [-b.halfWidth,0,b.halfWidth])assert.equal(map[Math.floor(car.y+a*s+d*c)]?.[Math.floor(car.x+a*c-d*s)],0,`${arena.id} ${car.name} spawn`);}}
  restoreMapBase();
});
