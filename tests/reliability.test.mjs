import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { cacheWorldCullRecord, shouldRenderCullRecord } from '../public/render-utils.js';

test('local API routes return JSON instead of the application shell', async () => {
  const source = await readFile('scripts/serve.mjs', 'utf8');
  assert.match(source, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(source, /Content-Type': 'application\/json; charset=utf-8/);
  assert.match(source, /Campaign storage is unavailable/);
  assert.match(source, /Leaderboard storage is unavailable/);
  assert.match(source, /API route not found/);
});

test('campaign reliability uses a local fallback and does not retry a failed POST forever', async () => {
  const source = await readFile('public/game.js', 'utf8');
  assert.match(source, /LOCAL_CAMPAIGN_KEY/);
  assert.match(source, /campaignCloud\.offline=true/);
  assert.match(source, /writeLocalCampaign\(status,payload\)/);
  assert.doesNotMatch(source, /SYNC RETRYING/);
});

test('low quality selection is explicit and disables expensive rendering paths', async () => {
  const source = await readFile('public/scene3d.js', 'utf8');
  assert.ok(source.includes("get('quality') === 'low'"));
  assert.match(source, /renderer\.shadowMap\.enabled = fx\.quality >= 1/);
  assert.match(source, /if \(fx\.quality < 2\)/);
});

test('WebGL2 failures have a visible recovery screen without changing input bindings', async () => {
  const html = await readFile('public/neon-breach.html', 'utf8');
  const source = await readFile('public/game.js', 'utf8');
  assert.match(html, /id="webglErrorScreen"/);
  assert.match(source, /__NEON_3D__\.fail/);
  assert.match(source, /ShiftLeft.*shiftFire/);
  assert.match(source, /gamepadFire/);
});

test('genuine WebGL2 mode always runs Three.js and compatibility mode is explicit', async () => {
  const scene = await readFile('public/scene3d.js', 'utf8');
  const game = await readFile('public/game.js', 'utf8');
  assert.match(scene, /renderer\.setAnimationLoop\(animate\)/);
  assert.match(scene, /window\.__NEON_RENDER_STATS__/);
  assert.match(scene, /try \{ lowPreset \|\|= localStorage/);
  assert.match(game, /renderer.*=== 'compat'/);
  assert.doesNotMatch(scene, /if \(lowPreset\) bridge\.ready\(\{ fallback: true \}\)/);
});

test('low-preset culling caches grouped meshes in world space', () => {
  const root = new THREE.Group();
  const stack = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  stack.position.set(20, 0, 13);
  stack.rotation.y = Math.PI / 2;
  crate.position.set(.28, .5, .08);
  stack.add(crate);
  root.add(stack);
  root.updateMatrixWorld(true);

  const record = cacheWorldCullRecord(crate, new THREE.Vector3());
  assert.notEqual(record.x, crate.position.x);
  assert.notEqual(record.z, crate.position.z);
  assert.equal(shouldRenderCullRecord(record, record.x, record.z, new Set()), true);
  assert.equal(shouldRenderCullRecord(record, record.x - 21, record.z, new Set()), false);
});

test('low-preset culling preserves large surfaces and never restores broken glass', () => {
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(58, 58));
  surface.userData.lowCullAlwaysVisible = true;
  surface.updateMatrixWorld(true);
  const surfaceRecord = cacheWorldCullRecord(surface, new THREE.Vector3());
  assert.equal(shouldRenderCullRecord(surfaceRecord, 100, 100, new Set()), true);

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  glass.userData.glass = true;
  glass.userData.cellKey = '5,3';
  glass.updateMatrixWorld(true);
  const glassRecord = cacheWorldCullRecord(glass, new THREE.Vector3());
  assert.equal(shouldRenderCullRecord(glassRecord, 0, 0, new Set()), true);
  assert.equal(shouldRenderCullRecord(glassRecord, 0, 0, new Set(['5,3'])), false);
});

test('production and offline builds include the render culling helper', async () => {
  const build = await readFile('scripts/build.mjs', 'utf8');
  const serviceWorker = await readFile('public/sw.js', 'utf8');
  assert.match(build, /'\/render-utils\.js'/);
  assert.match(serviceWorker, /'\/render-utils\.js'/);
});
