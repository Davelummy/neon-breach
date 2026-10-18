import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {WEAPONS} from '../public/data.js';
import {weaponThumbnail,weaponFacts,weaponStats} from '../public/weapon-cards.js';
test('six campaign weapons have distinct lightweight previews',()=>{
 const pictures=WEAPONS.map(weaponThumbnail);
 assert.equal(new Set(pictures).size,6);
 for(const picture of pictures)assert.ok(picture.startsWith('data:image/svg+xml,'));
});
test('weapon facts reflect actual gameplay statistics',()=>{
 const facts=weaponFacts(WEAPONS[1]);
 assert.equal(facts.damage,'13 × 8 pellets');
 assert.equal(facts.magazine,'8 rounds');
 assert.equal(facts.reload,'1.9 seconds');
});
test('standalone interface has no platform payment or entitlement integration',async()=>{
 for(const file of ['public/game.js','public/neon-breach.html','public/weapon-cards.js','public/weapon-preview.js','scripts/build.mjs','scripts/serve.mjs','public/sw.js']){
  const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
  assert.doesNotMatch(source,/vatar|heavy_weapons_pack|ownsHeavyWeapons|checkout|payment/i,file);
 }
});
test('comparison stats come from real config and are relative to the best weapon',()=>{
 const rows=WEAPONS.map(w=>weaponStats(w,WEAPONS));
 for(const stats of rows){assert.deepEqual(stats.map(s=>s.label),['Damage','Accuracy','Magazine','Reload']);for(const s of stats){assert.ok(Number.isFinite(s.ratio)&&s.ratio>0&&s.ratio<=1,s.label);assert.doesNotMatch(s.text,/NaN|undefined/);}}
 for(let i=0;i<4;i++)assert.equal(Math.max(...rows.map(r=>r[i].ratio)),1);
 const shotgun=weaponStats(WEAPONS[1],WEAPONS);
 assert.equal(shotgun[0].text,`${Math.round(13*8/WEAPONS[1].cooldown)}/s`);
 assert.equal(shotgun[2].text,'8');
});
