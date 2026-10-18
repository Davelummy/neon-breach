import test from 'node:test';import assert from 'node:assert/strict';
import {updateVehicleHandling as drive} from '../public/vehicle-handling.js';
const car=(kind='taxi')=>({kind,speed:0,steer:0,dir:0,boost:100});
test('steering cannot rotate parked vehicles and inputs accelerate smoothly',()=>{const c=car();for(let n=0;n<20;n++)drive(c,0,1,false,false,.05);assert.equal(c.dir,0);drive(c,1,0,false,false,.05);assert.ok(c.speed>0&&c.speed<.5);for(let n=0;n<50;n++)drive(c,1,0,false,false,.05);assert.equal(c.speed,7.1);});
test('buses are heavier, kekes nimble, reverse is bounded and braking beats coasting',()=>{const a=car(),b=car('bus'),k=car('tricycle');for(let n=0;n<10;n++){drive(a,1,1,false,false,.05);drive(b,1,1,false,false,.05);drive(k,1,1,false,false,.05);}assert.ok(b.speed<a.speed);assert.ok(k.dir>b.dir);const coast={...a},brake={...a};for(let n=0;n<8;n++){drive(coast,0,0,false,false,.05);drive(brake,0,0,false,true,.05);}assert.ok(Math.abs(brake.speed)<Math.abs(coast.speed));const reverse={...a};drive(reverse,-1,0,false,false,.05);assert.ok(reverse.speed>=0);for(let n=0;n<80;n++)drive(reverse,-1,0,false,false,.05);assert.ok(reverse.speed>=-3.1&&reverse.speed<0);});
test('boost is forward-only, bounded, disabled by brakes and drains fuel',()=>{const c=car();for(let n=0;n<30;n++)drive(c,1,0,true,false,.05);assert.ok(c.speed<=10.8&&c.speed>7.1&&c.boost<100);drive(c,1,0,true,true,.05);assert.equal(c.boosting,false);for(let n=0;n<100;n++)drive(c,-1,0,true,false,.05);assert.ok(c.speed>=-3.1);assert.equal(c.boosting,false);});
test('a vehicle at rest pivots only while the driver presses throttle or reverse',()=>{
 const idle=car();for(let n=0;n<20;n++)drive(idle,0,1,false,false,.05);assert.equal(idle.dir,0);
 const stuck=car('tricycle');drive(stuck,1,1,false,false,.05);assert.ok(stuck.dir>0,'keke pivots from rest');
 const bus=car('bus'),taxi=car();drive(bus,1,1,false,false,.05);drive(taxi,1,1,false,false,.05);assert.ok(bus.dir<taxi.dir&&taxi.dir<stuck.dir,'bus pivots slowest');
 const reverse=car();drive(reverse,-1,1,false,false,.05);assert.ok(reverse.dir<0,'reversing pivots the other way');
});
