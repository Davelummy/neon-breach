import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
