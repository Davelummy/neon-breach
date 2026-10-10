import { createHash } from 'node:crypto';
import { normalizeUsername } from './account-service.mjs';
import { validateScoreEntry } from './leaderboard-rules.mjs';

// Internal server interface: callers must authenticate the UID. Not an HTTP API.
// No SDK initialization, credentials, network connection or automatic migration.
const hash = value => createHash('sha256').update(value).digest('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const requireId = value => { if (!identifier(value)) throw new RepositoryError('invalid', 400); return value; };
const shard = uid => parseInt(hash(uid).slice(0, 8), 16) % 64;
const validTime = value => Number.isSafeInteger(value) && value >= 0;
export class RepositoryError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

/** Inject a transactional document store. All reads precede writes. */
export function createScaleRepository(store, { clock = Date.now } = {}) {
  const now = () => { const value = clock(); if (!validTime(value)) throw new RepositoryError('invalid-clock', 500); return value; };
  return {
    async register({ uid, username, credentials }) {
      requireId(uid);
      const name = normalizeUsername(username);
      if (!name || !credentials || !['scrypt-v1', 'scrypt-v2'].includes(credentials.password_version)
        || !/^[a-f0-9]{32}$/.test(credentials.salt || '') || !/^[a-f0-9]{128}$/.test(credentials.password_hash || '')) {
        throw new RepositoryError('invalid-account', 400);
      }
      const at = now(), nameKey = `nb_usernames/${hash(name)}`, accountKey = `nb_accounts/${uid}`;
      const countKey = `nb_counterShards/registered_${shard(uid)}`;
      return store.transaction(async tx => {
        const reserved = await tx.get(nameKey), account = await tx.get(accountKey), count = await tx.get(countKey);
        if (reserved || account) throw new RepositoryError('account-conflict', 409);
        tx.set(nameKey, { uid, username: name, created_at: at, reserved: true });
        tx.set(accountKey, { uid, username: name, created_at: at, password_version: credentials.password_version,
          salt: credentials.salt, password_hash: credentials.password_hash });
        tx.set(`nb_profiles/${uid}`, { username: name, created_at: at, email_verified: false });
        tx.set(countKey, { count: (count?.count || 0) + 1 });
        return { uid, username: name };
      });
    },

    async saveProgress(uid, { slot = 'active', expectedRevision, objectKey, bytes, schemaVersion }) {
      requireId(uid); requireId(slot);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !Number.isSafeInteger(bytes)
        || bytes < 1 || bytes > 262144 || schemaVersion !== 2
        || objectKey !== `nb-checkpoints/${uid}/${slot}/${expectedRevision + 1}.json.gz`) {
        throw new RepositoryError('invalid-save', 400);
      }
      // Caller verifies object existence, private ownership, decompressed size and schema before this publication.
      const at = now(), key = `nb_progress/${uid}/slots/${slot}`;
      return store.transaction(async tx => {
        const account = await tx.get(`nb_accounts/${uid}`), current = await tx.get(key);
        if (!account) throw new RepositoryError('unknown-account', 401);
        if ((current?.revision || 0) !== expectedRevision) throw new RepositoryError('save-conflict', 409);
        const next = { revision: expectedRevision + 1, objectKey, bytes, schemaVersion, updated_at: at };
        tx.set(key, next); return next;
      });
    },

    async acceptRun(uid, runId, season, payload) {
      requireId(uid); requireId(runId); requireId(season);
      if (!payload || Buffer.byteLength(JSON.stringify(payload)) > 8192) throw new RepositoryError('invalid-run', 400);
      const validated = validateScoreEntry(payload);
      if (!validated.ok) throw new RepositoryError('invalid-run', 400);
      const { callsign: ignoredCallsign, party: ignoredParty, at: ignoredAt, ...score } = validated.entry;
      const fingerprint = hash(JSON.stringify({ uid, season, score }));
      const at = now(), runKey = `nb_runs/${runId}`, jobKey = `nb_jobs/${runId}`;
      return store.transaction(async tx => {
        const account = await tx.get(`nb_accounts/${uid}`), previous = await tx.get(runKey);
        if (!account) throw new RepositoryError('unknown-account', 401);
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw new RepositoryError('run-conflict', 409);
          return { id: runId, duplicate: true };
        }
        tx.set(runKey, { uid, season, fingerprint, score: { ...score, callsign: account.username.toUpperCase() },
          received_at: at, verification: 'client-reported' });
        // Atomic outbox: a crash before queue enqueue never loses the pending work.
        tx.set(jobKey, { kind: 'rank-run', status: 'pending', attempts: 0, next_at: at, created_at: at });
        return { id: runId, duplicate: false };
      });
    },

    async processRun(runId) {
      requireId(runId); const at = now(), jobKey = `nb_jobs/${runId}`;
      return store.transaction(async tx => {
        const job = await tx.get(jobKey), run = await tx.get(`nb_runs/${runId}`);
        if (!job || !run) throw new RepositoryError('missing-job', 404);
        if (job.status === 'complete' || job.status === 'dead') return { status: job.status, duplicate: true };
        if (job.next_at > at) return { status: 'deferred' };
        // Hash tuple to avoid ambiguous underscore-delimited season/UID keys.
        const boardKey = `nb_boardEntries/${hash(JSON.stringify([run.season, run.uid, run.score.operation, run.score.difficulty]))}`;
        const previous = await tx.get(boardKey);
        // Stable ties: earlier accepted run wins. Reordered tasks cannot lower a best score.
        if (!previous || run.score.score > previous.score
          || (run.score.score === previous.score && (run.received_at < previous.at
            || (run.received_at === previous.at && runId < previous.run_id)))) {
          tx.set(boardKey, { ...run.score, uid: run.uid, season: run.season, at: run.received_at,
            run_id: runId, verification: run.verification });
        }
        tx.set(jobKey, { ...job, status: 'complete', completed_at: at });
        return { status: 'complete', duplicate: false };
      });
    },

    async failRun(runId) {
      requireId(runId); const at = now(), key = `nb_jobs/${runId}`;
      return store.transaction(async tx => {
        const job = await tx.get(key);
        if (!job) throw new RepositoryError('missing-job', 404);
        if (job.status !== 'pending') return { status: job.status };
        const attempts = job.attempts + 1;
        const status = attempts >= 5 || at - job.created_at >= 86400000 ? 'dead' : 'pending';
        tx.set(key, { ...job, attempts, status, next_at: at + Math.min(3600000, 1000 * 2 ** attempts) });
        // Never persist raw exception messages that might contain credentials or request bodies.
        return { status, attempts };
      });
    },

    async registeredCount() {
      // Fixed 64 reads regardless of player population. Intended for snapshot worker, not each browser poll.
      return store.transaction(async tx => {
        let total = 0;
        for (let n = 0; n < 64; n++) total += (await tx.get(`nb_counterShards/registered_${n}`))?.count || 0;
        return { total_players: total, identity: 'registered-account', as_of: now() };
      });
    }
  };
}

/** Adapter for an externally initialized Firestore server SDK instance. */
export function firestoreTransactionStore(db) {
  if (!db || typeof db.runTransaction !== 'function' || typeof db.doc !== 'function') throw new TypeError('Firestore instance required');
  return {
    transaction: operation => db.runTransaction(native => operation({
      async get(path) { const snapshot = await native.get(db.doc(path)); return snapshot.exists ? snapshot.data() : null; },
      set(path, value) { native.set(db.doc(path), value); }
    }))
  };
}
