import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createScaleRepository, firestoreTransactionStore } from '../../server/scale-repository.mjs';
import { drainRunJobs, firestoreDueJobs } from '../../server/scale-worker.mjs';

// Fail closed BEFORE initializing either SDK. No default production fallback.
if (process.env.FIREBASE_TEST_DEMO !== '1' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088'
  || process.env.GCLOUD_PROJECT !== 'demo-neon-breach') throw new Error('Use npm run test:firebase for isolated local verification');
const { initializeApp, deleteApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const { initializeTestEnvironment, assertFails } = await import('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = await import('firebase/firestore');
const credentials = { salt: 'a'.repeat(32), password_hash: 'b'.repeat(128), password_version: 'scrypt-v2' };
let app, db, store, repo, environment;
before(async () => {
  app = initializeApp({ projectId: 'demo-neon-breach' }, 'isolated-local-tests');
  db = getFirestore(app); db.settings({ host: '127.0.0.1:8088', ssl: false });
  store = firestoreTransactionStore(db); repo = createScaleRepository(store);
  environment = await initializeTestEnvironment({ projectId: 'demo-neon-breach', firestore: { host: '127.0.0.1', port: 8088,
    rules: await readFile('scripts/firebase/firestore.rules', 'utf8') } });
});
after(async () => { await environment?.cleanup(); await db?.terminate(); if (app) await deleteApp(app); });

test('Firestore: racing username reservations commit one account and one count', async () => {
  const results = await Promise.allSettled([
    repo.register({ uid: 'race_a', username: 'Capital', credentials }),
    repo.register({ uid: 'race_b', username: 'CAPITAL', credentials })
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal((await db.collection('nb_accounts').get()).size, 1);
  assert.equal((await repo.registeredCount()).total_players, 1);
});

test('Firestore: aborted native transaction publishes no partial writes', async () => {
  await assert.rejects(store.transaction(async tx => {
    await tx.get('nb_profiles/rollback'); tx.set('nb_profiles/rollback', { username: 'rollback' });
    tx.set('nb_jobs/rollback', { status: 'pending' }); throw new Error('injected callback failure');
  }));
  assert.equal((await db.doc('nb_profiles/rollback').get()).exists, false);
  assert.equal((await db.doc('nb_jobs/rollback').get()).exists, false);
});

test('Firestore: two devices cannot publish the same expected save revision', async () => {
  await repo.register({ uid: 'save_pilot', username: 'save_pilot', credentials });
  const data = { expectedRevision: 0, objectKey: 'nb-checkpoints/save_pilot/active/1.json.gz', bytes: 500, schemaVersion: 2 };
  const results = await Promise.allSettled([repo.saveProgress('save_pilot', data), repo.saveProgress('save_pilot', data)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'save-conflict');
  assert.equal((await db.doc('nb_progress/save_pilot/slots/active').get()).data().revision, 1);
});

test('Firestore: accepted outbox jobs survive repository recreation and duplicate workers', async () => {
  await repo.register({ uid: 'score_pilot', username: 'score_pilot', credentials });
  const payload = { score: 800, kills: 3, elapsed_seconds: 30, operation: 0, difficulty: 'operative' };
  await repo.acceptRun('score_pilot', 'score_run', 'season1', payload);
  assert.equal((await repo.acceptRun('score_pilot', 'score_run', 'season1', payload)).duplicate, true);
  const restarted = createScaleRepository(firestoreTransactionStore(db));
  await Promise.all([restarted.processRun('score_run'), restarted.processRun('score_run')]);
  assert.equal((await db.collection('nb_boardEntries').get()).size, 1);
  assert.equal((await db.doc('nb_jobs/score_run').get()).data().status, 'complete');
});

test('Firestore: indexed discovery and bounded worker drain process pending records', async () => {
  const payload = { score: 500, kills: 3, elapsed_seconds: 30 };
  await repo.acceptRun('score_pilot', 'queued_run', 'season1', payload);
  const results = await drainRunJobs(repo, firestoreDueJobs(db));
  assert.equal(results.find(r => r.id === 'queued_run').status, 'complete');
  assert.equal((await db.doc('nb_jobs/queued_run').get()).data().status, 'complete');
});

test('Rules: anonymous and authenticated clients cannot read or mutate private/server records', async () => {
  const contexts = [environment.unauthenticatedContext(), environment.authenticatedContext('save_pilot'), environment.authenticatedContext('other_pilot')];
  for (const context of contexts) {
    const client = context.firestore();
    for (const path of ['nb_accounts/save_pilot', 'nb_profiles/save_pilot', 'nb_progress/save_pilot/slots/active', 'nb_jobs/score_run']) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { overwritten: true }));
    }
  }
  assert.equal((await db.doc('nb_progress/save_pilot/slots/active').get()).data().revision, 1);
});
