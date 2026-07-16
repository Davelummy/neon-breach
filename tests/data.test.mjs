import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP_W, MAP_H, WALL_HEIGHTS, DIFFICULTIES, ENEMY_TYPES, WEAPONS,
  WAVE_TABLE, OPERATIONS, spawns, map, STAIR_ZONES
} from '../public/data.js';

const STAGE_TYPES = new Set(['reach', 'defend', 'hvt', 'extract']);
const openCell = (x, y) => map[Math.floor(y)]?.[Math.floor(x)] === 0;

test('map is a sealed 24x24 grid with solid boundary', () => {
  assert.equal(map.length, MAP_H);
  for (const row of map) assert.equal(row.length, MAP_W);
  for (let x = 0; x < MAP_W; x++) {
    assert.ok(map[0][x] > 0, `open boundary at (${x},0)`);
    assert.ok(map[MAP_H - 1][x] > 0, `open boundary at (${x},${MAP_H - 1})`);
  }
  for (let y = 0; y < MAP_H; y++) {
    assert.ok(map[y][0] > 0, `open boundary at (0,${y})`);
    assert.ok(map[y][MAP_W - 1] > 0, `open boundary at (${MAP_W - 1},${y})`);
  }
});

test('every wall type used on the map has a height', () => {
  const used = new Set(map.flat().filter(Boolean));
  for (const type of used) assert.ok(WALL_HEIGHTS[type] > 0, `no height for wall type ${type}`);
});

test('every spawn point sits on an open cell', () => {
  for (const [x, y] of spawns) assert.ok(openCell(x, y), `spawn (${x},${y}) is inside a wall`);
});

test('every wave entry names a real enemy type', () => {
  for (const wave of WAVE_TABLE) for (const type of wave) {
    assert.ok(ENEMY_TYPES[type], `unknown enemy type "${type}"`);
  }
});

test('operations are well-formed', () => {
  assert.ok(OPERATIONS.length >= 3, 'campaign should offer at least three operations');
  for (const op of OPERATIONS) {
    assert.ok(op.id && op.name && op.short && op.tagline, `${op.id || '?'} missing identity fields`);
    assert.ok(op.debriefVictory && op.debriefComms, `${op.id} missing debrief copy`);
    assert.equal(op.stages.length, 5, `${op.id} must have exactly 5 stages (persistence clamps wave to 1..5)`);
    assert.equal(op.stages.at(-1).type, 'extract', `${op.id} must end with an extract stage`);
  }
});

function checkSquad(opId, stageCode, squad) {
  for (const [type, x, y, options] of squad) {
    assert.ok(ENEMY_TYPES[type], `${opId}/${stageCode}: unknown enemy "${type}"`);
    assert.ok(openCell(x, y), `${opId}/${stageCode}: squad member at (${x},${y}) is inside a wall`);
    if (options) assert.equal(typeof options, 'object');
  }
}

test('every stage is engine-valid: type, target, squads, and type-specific fields', () => {
  for (const op of OPERATIONS) {
    for (const stage of op.stages) {
      const label = `${op.id}/${stage.code}`;
      assert.ok(STAGE_TYPES.has(stage.type), `${label}: unknown stage type "${stage.type}"`);
      assert.ok(stage.title && stage.objective && stage.comms, `${label}: missing copy`);
      const [tx, ty] = stage.target;
      assert.ok(tx > 0 && ty > 0 && tx < MAP_W - 1 && ty < MAP_H - 1, `${label}: target out of bounds`);
      assert.ok(openCell(tx, ty), `${label}: target (${tx},${ty}) is inside a wall`);
      if (stage.squad) checkSquad(op.id, stage.code, stage.squad);
      if (stage.type === 'defend') {
        assert.ok(stage.hold > 0, `${label}: defend stage needs hold > 0`);
        for (const wave of stage.reinforcements || []) {
          assert.ok(wave.at >= 0 && wave.at < stage.hold, `${label}: reinforcement mark ${wave.at} outside hold window`);
          checkSquad(op.id, stage.code, wave.squad);
        }
      }
      if (stage.type === 'hvt') {
        const commanders = (stage.squad || []).filter(([, , , options]) => options?.commander);
        assert.equal(commanders.length, 1, `${label}: hvt stage needs exactly one commander`);
        const phases = stage.boss?.phases || [];
        assert.ok(phases.length >= 2, `${label}: boss should have at least two escalation phases`);
        let previous = 1;
        for (const phase of phases) {
          assert.ok(phase.at > 0 && phase.at < 1, `${label}: phase threshold ${phase.at} out of (0,1)`);
          assert.ok(phase.at < previous, `${label}: phase thresholds must strictly descend`);
          previous = phase.at;
          assert.ok(phase.announce, `${label}: phase missing announce copy`);
          if (phase.speedMult) assert.ok(phase.speedMult > 1 && phase.speedMult < 2.5, `${label}: absurd speedMult`);
          if (phase.fireMult) assert.ok(phase.fireMult > 1 && phase.fireMult < 2.5, `${label}: absurd fireMult`);
          if (phase.summon) checkSquad(op.id, `${stage.code}-phase`, phase.summon);
        }
      }
      if (stage.type === 'extract') {
        assert.ok(stage.beacon && openCell(stage.beacon[0], stage.beacon[1]), `${label}: extract beacon missing or walled`);
        assert.ok(stage.armObjective && stage.armComms, `${label}: extract stage missing arm copy`);
      }
    }
  }
});

test('weapons are well-formed', () => {
  assert.ok(WEAPONS.length >= 3);
  for (const weapon of WEAPONS) {
    assert.ok(weapon.mag > 0 && weapon.damage > 0 && weapon.cooldown > 0, `${weapon.id} has degenerate stats`);
    assert.ok(weapon.reserve >= weapon.mag, `${weapon.id} reserve smaller than mag`);
  }
});

test('enemy types have positive combat stats and score values', () => {
  for (const [key, spec] of Object.entries(ENEMY_TYPES)) {
    assert.ok(spec.hp > 0 && spec.speed > 0 && spec.damage > 0 && spec.score > 0, `${key} degenerate`);
  }
});

test('enemy archetypes reference valid bodies, roles, and sane spec fields', () => {
  const bodies = new Set(['scout', 'trooper', 'heavy']);
  const roles = new Set(['flanker', 'support', 'assault', 'rusher', 'sniper']);
  assert.ok(Object.keys(ENEMY_TYPES).length >= 6, 'expected at least six archetypes');
  for (const [key, spec] of Object.entries(ENEMY_TYPES)) {
    assert.ok(bodies.has(spec.body), `${key}: unknown body "${spec.body}"`);
    assert.ok(roles.has(spec.role), `${key}: unknown role "${spec.role}"`);
    if (spec.magazine !== undefined) assert.ok(spec.magazine > 0, `${key}: empty magazine`);
    if (spec.shieldBlock !== undefined) {
      assert.ok(spec.shieldBlock > 0 && spec.shieldBlock < 1, `${key}: shieldBlock must partially block, not nullify`);
      assert.ok(spec.shieldArc > 0 && spec.shieldArc < Math.PI, `${key}: shieldArc must leave the rear exposed`);
    }
    if (spec.precision !== undefined) assert.ok(spec.precision > 0, `${key}: non-positive precision`);
  }
});

test('difficulty multipliers stay in sane bounds', () => {
  for (const [key, d] of Object.entries(DIFFICULTIES)) {
    for (const field of ['enemyHealth', 'enemySpeed', 'enemyDamage', 'playerDamage']) {
      assert.ok(d[field] > 0.3 && d[field] < 3, `${key}.${field} out of bounds`);
    }
  }
});

test('stair zones are inside the map', () => {
  for (const stair of STAIR_ZONES) {
    assert.ok(stair.x1 < stair.x2 && stair.y1 < stair.y2);
    assert.ok(stair.x1 >= 0 && stair.y1 >= 0 && stair.x2 <= MAP_W && stair.y2 <= MAP_H);
  }
});
