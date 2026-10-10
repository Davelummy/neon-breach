// One bounded pass; scheduling and authenticated deployment are deliberately external.
// discoverDueIds must use an indexed pending/next_at query, never a collection scan.
export async function drainRunJobs(repository, discoverDueIds, { limit = 20, concurrency = 2 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100
    || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new RangeError('Invalid worker bounds');
  const ids = await discoverDueIds(limit);
  if (!Array.isArray(ids) || ids.length > limit || ids.some(id => typeof id !== 'string')) throw new TypeError('Invalid job discovery');
  const queue = [...new Set(ids)], results = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (cursor < queue.length) {
      const id = queue[cursor++];
      try { results.push({ id, ...(await repository.processRun(id)) }); }
      catch {
        try { results.push({ id, ...(await repository.failRun(id)), failed: true }); }
        catch { results.push({ id, status: 'unavailable', failed: true }); }
      }
    }
  }));
  return results;
}

export function firestoreDueJobs(db, clock = Date.now) {
  return async limit => {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Invalid query limit');
    const snapshot = await db.collection('nb_jobs').where('status', '==', 'pending')
      .where('next_at', '<=', clock()).orderBy('next_at').limit(limit).get();
    return snapshot.docs.map(doc => doc.id);
  };
}
