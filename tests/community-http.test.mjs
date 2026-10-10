import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

test('local community APIs persist records and filter real HTTP boards', async () => {
  const port = 4397;
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let started = false;
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Local server startup timed out')), 15000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('NEON BREACH ready')) { started = true; clearTimeout(timeout); resolve(); } });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('exit', code => { if (!started) { clearTimeout(timeout); reject(new Error(`Local server exited: ${code}`)); } });
  });
  const get = async path => {
    const response = await fetch(origin + path, { signal: AbortSignal.timeout(5000) });
    assert.match(response.headers.get('content-type'), /application\/json/);
    return { response, data: await response.json() };
  };
  const post = (path, body) => fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  try {
    await ready;
    const player = randomUUID();
    assert.equal((await post('/api/community', { player_id: player })).status, 200);
    assert.equal((await post('/api/community', { player_id: player })).status, 200);
    const { data: counts } = await get('/api/community');
    assert.ok(counts.total_players >= 1); assert.ok(counts.online_players >= 1);
    const run = randomUUID(); const callsign = `QA${run.slice(0, 8)}`.toUpperCase();
    const party = `QA${run.slice(0, 8)}`.toUpperCase();
    const entry = { callsign, party, score: 1600, kills: 4, elapsed_seconds: 60, difficulty: 'operative' };
    assert.equal((await post('/api/results', { ...entry, run_id: run })).status, 201);
    assert.equal((await post('/api/results', { ...entry, score: 1800, run_id: run })).status, 409);
    const { data: result } = await get(`/api/results?id=${run}`);
    assert.equal(result.result.score, 1600); assert.equal('party' in result.result, false);
    assert.equal((await post('/api/leaderboard', entry)).status, 200);
    assert.equal((await post('/api/leaderboard', { ...entry, difficulty: 'nightmare', score: 600 })).status, 200);
    const { data: board } = await get(`/api/leaderboard?party=${party}&period=daily&difficulty=nightmare`);
    assert.equal(board.entries.length, 1); assert.equal(board.entries[0].best_score, 600);
    const { data: weekly } = await get(`/api/leaderboard?party=${party}&period=weekly&difficulty=operative`);
    assert.equal(weekly.entries[0].best_score, 1600);
    assert.equal((await get('/api/unknown')).response.status, 404);
    const html = await fetch(origin + '/results.html');
    assert.equal(html.status, 200); assert.match(await html.text(), /Client-reported/);
  } finally {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await Promise.race([exited, delay(1000)]);
  }
});
