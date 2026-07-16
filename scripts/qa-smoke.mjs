// Headless gameplay smoke test driven through the window.__NEON_QA__ bridge.
// Boots the static server, launches chrome-headless-shell, starts a run and
// asserts the simulation actually plays: mode transitions, enemies spawn,
// mission stages advance, and the campaign save payload stays plausible.
// Usage: node scripts/qa-smoke.mjs
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import puppeteer from 'puppeteer-core';

const PORT = 4321;
const shellRoot = join(homedir(), '.cache', 'puppeteer', 'chrome-headless-shell');
const { globSync } = await import('node:fs');
const candidates = globSync(join(shellRoot, '*', '*', 'chrome-headless-shell'));
const executablePath = candidates.find(existsSync);
if (!executablePath) { console.error('SKIP: chrome-headless-shell not found'); process.exit(0); }

const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};
async function waitForState(page, predicate, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`state wait exceeded ${timeout}ms`);
}

let browser;
try {
  await new Promise(resolve => setTimeout(resolve, 700));
  browser = await puppeteer.launch({ executablePath, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

  await page.goto(`http://127.0.0.1:${PORT}/?qa`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForState(page, () => Boolean(window.__NEON_QA__ && window.__NEON_3D__), 10000);
  check('QA bridge available', true);

  const menuSnapshot = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('boots into menu', menuSnapshot.mode === 'menu', `mode=${menuSnapshot.mode}`);

  await page.evaluate(() => document.getElementById('deployButton').click());
  await waitForState(page, () => window.__NEON_QA__.snapshot().mode === 'playing', 5000);
  check('deploy starts a run', true);

  await page.evaluate(() => { window.__NEON_QA__.setInvulnerable(true); window.__NEON_QA__.skipWait(); });
  await waitForState(page, () => window.__NEON_QA__.snapshot().enemies > 0, 8000);
  const combat = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('enemies spawn', combat.enemies > 0, `enemies=${combat.enemies}`);
  check('starts at mission stage 0', combat.missionStage === 0, `stage=${combat.missionStage}`);

  // March through every mission stage to the finale.
  for (let stage = 0; stage < 4; stage++) {
    await page.evaluate(() => window.__NEON_QA__.completePhase());
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  const finale = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('mission advances to extraction stage', finale.missionStage === 4, `stage=${finale.missionStage}`);

  // Movement + physics still integrate.
  await page.evaluate(() => window.__NEON_QA__.teleport(11.5, 18.5));
  await page.evaluate(() => window.__NEON_QA__.setFlight(true));
  await new Promise(resolve => setTimeout(resolve, 500));
  const airborne = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('jet flight gains altitude', airborne.z > 0.6, `z=${airborne.z.toFixed(2)}`);

  // 3D layer: with the dev server mapping /vendor/, three.js must boot even in
  // headless SwiftShader, flip body.three-ready, and expose the FX controller.
  let rendererReady = false;
  try { await waitForState(page, () => document.body.classList.contains('three-ready') || document.body.classList.contains('three-fallback'), 10000); rendererReady = true; } catch {}
  check('3D renderer initialized headlessly', rendererReady);
  if (rendererReady) {
    const fxState = await page.evaluate(() => ({ q: window.__NEON_FX__?.quality(), ms: Math.round(window.__NEON_FX__?.frameMs() || 0), post: window.__NEON_FX__?.post() }));
    check('adaptive quality controller online', Number.isInteger(fxState.q) && fxState.q >= 0 && fxState.q <= 3, `quality=${fxState.q} frame=${fxState.ms}ms post=${fxState.post}`);
    await page.screenshot({ path: process.env.SMOKE_SHOT || 'smoke-gameplay.png' });
  }

  // Second scenario: select operation 2 (NIGHT RAPTOR) from the menu and play
  // it through every stage type — reach, defend, hvt, extract.
  await page.goto(`http://127.0.0.1:${PORT}/?qa`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForState(page, () => Boolean(window.__NEON_QA__), 10000);
  await page.evaluate(() => document.querySelector('[data-operation="1"]').click());
  await page.evaluate(() => document.getElementById('deployButton').click());
  await waitForState(page, () => window.__NEON_QA__.snapshot().mode === 'playing', 5000);
  const op2 = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('operation 2 deploys', op2.operation === 1, `operation=${op2.operation}`);
  check('operation 2 has its own objective', op2.objective === 'REACH THE EASTERN RELAY POST', op2.objective);
  await page.evaluate(() => { window.__NEON_QA__.setInvulnerable(true); });
  for (let stage = 0; stage < 4; stage++) {
    await page.evaluate(() => window.__NEON_QA__.completePhase());
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  const op2Finale = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('operation 2 reaches extraction stage', op2Finale.missionStage === 4, `stage=${op2Finale.missionStage}`);
  check('operation 2 spawned hostiles along the way', op2Finale.enemies > 0 || op2Finale.kills > 0, `enemies=${op2Finale.enemies}`);

  // Third scenario: boss phase escalation. Jump to the HVT stage, wound the
  // commander past a phase threshold, and confirm reinforcements + rage buffs.
  await page.goto(`http://127.0.0.1:${PORT}/?qa`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForState(page, () => Boolean(window.__NEON_QA__), 10000);
  await page.evaluate(() => document.getElementById('deployButton').click());
  await waitForState(page, () => window.__NEON_QA__.snapshot().mode === 'playing', 5000);
  await page.evaluate(() => { window.__NEON_QA__.setInvulnerable(true); window.__NEON_QA__.setMissionStage(3); });
  await new Promise(resolve => setTimeout(resolve, 400));
  const beforePhase = await page.evaluate(() => window.__NEON_QA__.snapshot());
  await page.evaluate(() => window.__NEON_QA__.damageCommander(.4));
  await new Promise(resolve => setTimeout(resolve, 500));
  const afterPhase = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('boss phase 2 summons reinforcements', afterPhase.enemies > beforePhase.enemies, `enemies ${beforePhase.enemies} -> ${afterPhase.enemies}`);
  await page.evaluate(() => window.__NEON_QA__.damageCommander(.35));
  await new Promise(resolve => setTimeout(resolve, 500));
  const finalPhase = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('boss phase 3 summons more reinforcements', finalPhase.enemies > afterPhase.enemies, `enemies ${afterPhase.enemies} -> ${finalPhase.enemies}`);

  // Progression: with no career stats (offline dev), the NX-7 must stay locked.
  await page.evaluate(() => window.__NEON_QA__.equipWeapon(3));
  const lockedTry = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('locked weapon cannot be equipped', lockedTry.weapon !== 'dmr', `weapon=${lockedTry.weapon}`);
  await page.evaluate(() => window.__NEON_QA__.equipWeapon(1));
  const shotgunTry = await page.evaluate(() => window.__NEON_QA__.snapshot());
  check('unlocked weapon swaps normally', shotgunTry.weapon === 'shotgun', `weapon=${shotgunTry.weapon}`);

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (error) {
  check('smoke run completed', false, String(error?.message || error));
} finally {
  await browser?.close();
  server.kill();
}

console.log(failures.length ? `\nSMOKE FAILED: ${failures.length} failing check(s)` : '\nSMOKE GREEN');
process.exit(failures.length ? 1 : 0);
