import test from 'node:test';
import assert from 'node:assert/strict';
import { createScaleRepository, firestoreTransactionStore } from '../server/scale-repository.mjs';

// Deterministic transactional harness, NOT a Firestore emulator or scale benchmark.
function memoryStore() {
  const rows = new Map(); let tail = Promise.resolve(), reads = 0, rejectCommit = false;
  const store = { rows, get reads() { return reads; }, failNextCommit() { rejectCommit = true; },
    transaction(operation) {
      const result = tail.then(async () => {
        const writes = new Map(); let writing = false;
        const value = await operation({
          async get(key) { assert.equal(writing, false, 'Firestore reads must precede writes'); reads++; return structuredClone(rows.get(key) ?? null); },
          set(key, data) { writing = true; writes.set(key, structuredClone(data)); }
        });
        if (rejectCommit) { rejectCommit = false; throw new Error('injected commit failure'); }
        for (const [key, data] of writes) rows.set(key, data);
        return value;
      });
      tail = result.catch(() => {}); return result;
    }
  }; return store;
}
const credentials = { salt: 'a'.repeat(32), password_hash: 'b'.repeat(128), password_version: 'scrypt-v2' };
const account = (uid, username = uid) => ({ uid, username, credentials });
const score = value => ({ score: value, kills: 3, elapsed_seconds: 30, operation: 0, difficulty: 'operative', callsign: 'IMPERSONATOR', at: 1 });

test('atomic case-insensitive reservations prevent racing signups and double counts', async () => {
  const db = memoryStore(), repo = createScaleRepository(db, { clock: () => 1000 });
  const races = await Promise.allSettled([repo.register(account('user_a', 'Capital')), repo.register(account('user_b', 'CAPITAL'))]);
  assert.equal(races.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(races.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal((await repo.registeredCount()).total_players, 1);
  assert.equal([...db.rows.keys()].filter(k => k.startsWith('nb_accounts/')).length, 1);
  assert.equal(JSON.stringify(db.rows.get('nb_profiles/user_a')).includes('password'), false);
});

test('failed registration commit rolls back all ownership and count records', async () => {
  const db = memoryStore(), repo = createScaleRepository(db); db.failNextCommit();
  await assert.rejects(repo.register(account('pilot'))); assert.equal(db.rows.size, 0);
  await repo.register(account('pilot')); assert.equal((await repo.registeredCount()).total_players, 1);
  await assert.rejects(repo.register({ ...account('bad'), credentials: { password: 'plaintext' } }), { status: 400 });
});

test('save publication enforces account, bounded object path and expected revision', async () => {
  const db = memoryStore(), repo = createScaleRepository(db); await repo.register(account('pilot'));
  const save = { expectedRevision: 0, objectKey: 'nb-checkpoints/pilot/active/1.json.gz', bytes: 500, schemaVersion: 2 };
  const race = await Promise.allSettled([repo.saveProgress('pilot', save), repo.saveProgress('pilot', save)]);
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(race.find(r => r.status === 'rejected').reason.code, 'save-conflict');
  await assert.rejects(repo.saveProgress('other', save), { status: 400 });
  await assert.rejects(repo.saveProgress('pilot', { ...save, objectKey: '../../public/file' }), { status: 400 });
  await assert.rejects(repo.saveProgress('pilot', { ...save, bytes: 262145 }), { status: 400 });
  await assert.rejects(repo.saveProgress('../pilot', save), { status: 400 });
});

test('run acceptance creates durable outbox atomically and binds identity to account', async () => {
  const db = memoryStore(), repo = createScaleRepository(db, { clock: () => 1000 }); await repo.register(account('pilot'));
  db.failNextCommit(); await assert.rejects(repo.acceptRun('pilot', 'run1', 'season1', score(500)));
  assert.equal(db.rows.has('nb_runs/run1'), false); assert.equal(db.rows.has('nb_jobs/run1'), false);
  await repo.acceptRun('pilot', 'run1', 'season1', score(500));
  assert.equal(db.rows.get('nb_runs/run1').score.callsign, 'PILOT');
  assert.equal((await repo.acceptRun('pilot', 'run1', 'season1', { ...score(500), callsign: 'OTHER', at: 999 })).duplicate, true);
  await assert.rejects(repo.acceptRun('pilot', 'run1', 'season1', score(600)), { status: 409 });
  await assert.rejects(repo.acceptRun('missing', 'run2', 'season1', score(500)), { status: 401 });
});

test('duplicate/reordered workers never double process or lower the best score', async () => {
  const db = memoryStore(); let clock = 1000; const repo = createScaleRepository(db, { clock: () => clock }); await repo.register(account('pilot'));
  await repo.acceptRun('pilot', 'early', 's1', score(800)); clock++;
  await repo.acceptRun('pilot', 'late', 's1', score(800));
  await repo.acceptRun('pilot', 'lower', 's1', score(500));
  await Promise.all([repo.processRun('late'), repo.processRun('early'), repo.processRun('early'), repo.processRun('lower')]);
  const entries = [...db.rows].filter(([k]) => k.startsWith('nb_boardEntries/'));
  assert.equal(entries.length, 1); assert.equal(entries[0][1].run_id, 'early'); assert.equal(entries[0][1].score, 800);
  assert.equal((await repo.processRun('early')).duplicate, true);
});

test('worker failure rolls back ranking and completion; retry is bounded and deferred', async () => {
  const db = memoryStore(); let clock = 1000; const repo = createScaleRepository(db, { clock: () => clock }); await repo.register(account('pilot'));
  await repo.acceptRun('pilot', 'run1', 's1', score(800)); db.failNextCommit(); await assert.rejects(repo.processRun('run1'));
  assert.equal(db.rows.get('nb_jobs/run1').status, 'pending');
  assert.equal([...db.rows.keys()].some(k => k.startsWith('nb_boardEntries/')), false);
  await repo.failRun('run1'); assert.equal((await repo.processRun('run1')).status, 'deferred');
  for (let n = 1; n < 5; n++) { clock += 100000; await repo.failRun('run1'); }
  assert.equal((await repo.processRun('run1')).status, 'dead');
  assert.equal(db.rows.get('nb_jobs/run1').attempts, 5);
});

test('count retrieval has fixed read cost regardless of unrelated population', async () => {
  const db = memoryStore(), repo = createScaleRepository(db); await repo.register(account('pilot'));
  for (let n = 0; n < 100000; n++) db.rows.set(`unrelated/${n}`, { secret: 'test-only' });
  const start = db.reads; assert.equal((await repo.registeredCount()).total_players, 1); assert.equal(db.reads - start, 64);
});

test('Firestore adapter delegates a single native transaction and handles missing documents', async () => {
  const rows = new Map(); let transactions = 0;
  const db = { doc: path => path, async runTransaction(fn) { transactions++; return fn({
    async get(path) { return { exists: rows.has(path), data: () => rows.get(path) }; },
    set(path, value) { rows.set(path, value); }
  }); } };
  const store = firestoreTransactionStore(db);
  await store.transaction(async tx => { assert.equal(await tx.get('nb_profiles/x'), null); tx.set('nb_profiles/x', { username: 'pilot' }); });
  assert.equal(transactions, 1); assert.equal(rows.get('nb_profiles/x').username, 'pilot');
  assert.throws(() => firestoreTransactionStore(null));
});
