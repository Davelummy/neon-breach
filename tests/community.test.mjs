import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunityService, ONLINE_TTL } from '../server/community-service.mjs';
import { rankBoard, periodBoardKeys, upsertEntry, validateScoreEntry } from '../server/leaderboard-rules.mjs';
import { fetchJson, createPublicId } from '../public/community.js';

test('public IDs use secure UUID v4 bits without requiring randomUUID on LAN', () => {
  const ids = Array.from({ length: 100 }, () => createPublicId());
  assert.equal(new Set(ids).size, 100);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
function memoryStore() {
  const rows = new Map();
  return {
    rows,
    async delete(key) { rows.delete(key); },
    async get(key) { return rows.get(key) ?? null; },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && rows.has(key)) return { modified: false };
      rows.set(key, structuredClone(value)); return { modified: true };
    },
    async *list({ prefix }) {
      const keys = [...rows.keys()].filter(key => key.startsWith(prefix));
      // Exercise pagination rather than assuming a single page.
      for (let i = 0; i < keys.length; i += 1) yield { blobs: [{ key: keys[i] }] };
    }
  };
}
const req = (path, body) => new Request(`https://game.test${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('presence deduplicates tabs, expires online players, and retains total profiles', async () => {
  const store = memoryStore(); let now = Date.UTC(2026, 9, 5, 12);
  const handle = createCommunityService(store, () => now);
  await handle(req('/api/community', { player_id: A }));
  await handle(req('/api/community', { player_id: A }));
  await handle(req('/api/community', { player_id: B }));
  let stats = await (await handle(req('/api/community'))).json();
  assert.equal(stats.total_players, 2); assert.equal(stats.online_players, 2);
  assert.equal(stats.identity, 'browser-profile');
  now += ONLINE_TTL + 30000;
  stats = await (await handle(req('/api/community'))).json();
  assert.equal(stats.online_players, 0); assert.equal(stats.total_players, 2);
  await handle(req('/api/community', { player_id: A }));
  now += 30001;
  stats = await (await handle(req('/api/community'))).json();
  assert.equal(stats.online_players, 1);
});

test('presence rejects invalid IDs and wrong methods without registering anyone', async () => {
  const store = memoryStore(); const handle = createCommunityService(store);
  assert.equal((await handle(req('/api/community', { player_id: '../../secret' }))).status, 400);
  assert.equal((await handle(new Request('https://game.test/api/community', { method: 'DELETE' }))).status, 405);
  assert.equal(store.rows.size, 0);
});

test('legacy population counts fail closed when the shared scan budget is exceeded', async () => {
  const store = memoryStore();
  for (let i = 0; i < 1001; i++) store.rows.set(`player:${i}`, {});
  const response = await createCommunityService(store)(req('/api/community'));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).available, false);
});

test('public results are immutable, sanitized, timestamped on server, and exclude private fields', async () => {
  const now = 1800000000000; const store = memoryStore(); const handle = createCommunityService(store, () => now);
  const payload = { run_id: A, callsign: '<b>pilot</b>', score: 1000, kills: 3, elapsed_seconds: 60, difficulty: 'operative', at: 1, party: 'PRIVATE', player_id: B, token: 'not-stored' };
  const response = await handle(req('/api/results', payload)); assert.equal(response.status, 201);
  const { result } = await response.json();
  assert.equal(result.at, now); assert.equal(result.verification, 'client-reported');
  for (const key of ['party', 'player_id', 'token']) assert.equal(key in result, false);
  assert.ok(!result.callsign.includes('<'));
  assert.equal((await handle(req('/api/results', { ...payload, score: 2000 }))).status, 409);
  assert.equal((await (await handle(req(`/api/results?id=${A}`))).json()).result.score, 1000);
  assert.equal((await handle(req(`/api/results?id=${B}`))).status, 404);
});

test('invalid score results and malformed JSON never create public records', async () => {
  const store = memoryStore(); const handle = createCommunityService(store);
  assert.equal((await handle(req('/api/results', { run_id: A, score: 99999999, kills: 1, elapsed_seconds: 1 }))).status, 400);
  const response = await handle(new Request('https://game.test/api/results', { method: 'POST', body: '{' }));
  assert.equal(response.status, 400); assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(store.rows.size, 0);
});

test('storage failure produces JSON 503 without exposing provider errors', async () => {
  const store = memoryStore(); store.get = async () => { throw new Error('private provider detail'); };
  const response = await createCommunityService(store)(req(`/api/results?id=${A}`));
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private provider'));
});

test('daily and weekly partitions cross UTC month boundaries', () => {
  const now = Date.UTC(2026, 9, 1, 23);
  assert.deepEqual(periodBoardKeys('entries', 'daily', now), ['entries:day:2026-10-01']);
  const weekly = periodBoardKeys('party:TEAM', 'weekly', now);
  assert.equal(weekly.length, 7); assert.equal(weekly.at(-1), 'party:TEAM:day:2026-09-25');
  assert.deepEqual(periodBoardKeys('entries', 'all', now), ['entries']);
});

test('difficulty-specific personal bests survive and period filtering precedes ranking', () => {
  const now = Date.UTC(2026, 9, 5, 12);
  let board = upsertEntry([], { callsign: 'AA', score: 900, difficulty: 'recruit', at: now - 8 * 86400000 });
  board = upsertEntry(board, { callsign: 'AA', score: 500, difficulty: 'nightmare', at: now });
  assert.equal(board.length, 2);
  const rows = [...board, { callsign: 'BB', score: 700, difficulty: 'nightmare', at: now - 86400000 }];
  assert.equal(rankBoard(rows, { difficulty: 'nightmare' })[0].callsign, 'BB');
  assert.equal(rankBoard(rows, { period: 'daily', now })[0].callsign, 'AA');
  assert.equal(rankBoard(rows, { period: 'weekly', now }).length, 2);
});

test('nonfinite score stats are rejected instead of clamped into valid submissions', () => {
  for (const score of [NaN, Infinity, 'Infinity', -1]) assert.equal(validateScoreEntry({ score, kills: 1, elapsed_seconds: 60 }).ok, false);
  assert.equal(validateScoreEntry(null).ok, false);
});

test('JSON client rejects HTML, errors, and unavailable responses without retries', async () => {
  const original = globalThis.fetch; let calls = 0;
  try {
    for (const response of [new Response('<html>shell</html>', { headers: { 'content-type': 'text/html' } }), Response.json({ error: 'failed' }, { status: 503 }), Response.json({ available: false })]) {
      globalThis.fetch = async () => { calls++; return response; };
      await assert.rejects(fetchJson('/api/results'));
    }
    assert.equal(calls, 3);
  } finally { globalThis.fetch = original; }
});
