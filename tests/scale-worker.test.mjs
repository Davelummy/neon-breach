import test from 'node:test';
import assert from 'node:assert/strict';
import { drainRunJobs, firestoreDueJobs } from '../server/scale-worker.mjs';

test('worker caps concurrency, deduplicates discovery and processes bounded batch', async () => {
  let active = 0, peak = 0; const processed = [];
  const repo = { async processRun(id) {
    active++; peak = Math.max(peak, active); await new Promise(resolve => setImmediate(resolve));
    processed.push(id); active--; return { status: 'complete' };
  } };
  const results = await drainRunJobs(repo, async limit => { assert.equal(limit, 4); return ['a', 'b', 'a', 'c']; }, { limit: 4, concurrency: 2 });
  assert.equal(peak, 2); assert.equal(results.length, 3); assert.deepEqual(processed.sort(), ['a', 'b', 'c']);
});

test('worker isolates failed jobs and does not expose raw errors or loop on unavailable storage', async () => {
  const repo = { async processRun(id) { if (id !== 'good') throw new Error('sensitive test payload'); return { status: 'complete' }; },
    async failRun(id) { if (id === 'broken') throw new Error('private details'); return { status: 'pending', attempts: 1 }; } };
  const results = await drainRunJobs(repo, async () => ['good', 'retry', 'broken']);
  assert.equal(results.find(r => r.id === 'good').status, 'complete');
  assert.equal(results.find(r => r.id === 'broken').status, 'unavailable');
  assert.equal(JSON.stringify(results).includes('sensitive'), false);
  await assert.rejects(drainRunJobs(repo, async () => [], { concurrency: 9 }));
  await assert.rejects(drainRunJobs(repo, async () => ['a', 'b'], { limit: 1 }));
});

test('Firestore job discovery uses bounded indexed query and no collection scan', async () => {
  const calls = [], query = { where(...args) { calls.push(['where', ...args]); return query; },
    orderBy(...args) { calls.push(['orderBy', ...args]); return query; }, limit(value) { calls.push(['limit', value]); return query; },
    async get() { return { docs: [{ id: 'job' }] }; } };
  const discover = firestoreDueJobs({ collection(name) { assert.equal(name, 'nb_jobs'); return query; } }, () => 1000);
  assert.deepEqual(await discover(20), ['job']);
  assert.deepEqual(calls, [['where', 'status', '==', 'pending'], ['where', 'next_at', '<=', 1000], ['orderBy', 'next_at'], ['limit', 20]]);
});
