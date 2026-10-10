import { validateScoreEntry } from './leaderboard-rules.mjs';

export const ONLINE_TTL = 90000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validPublicId = value => typeof value === 'string' && UUID.test(value);
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

async function keys(store, prefix, budget) {
  const found = [];
  for await (const page of store.list({ prefix, paginate: true })) {
    budget.remaining -= page.blobs.length;
    if (budget.remaining < 0 || Date.now() > budget.deadline) throw new Error('Pilot scan budget exceeded');
    found.push(...page.blobs.map(blob => blob.key));
  }
  return found;
}

export function createCommunityService(store, clock = Date.now, {scoreIdentity=null}={}) {
  let cached = null;
  let pending = null;
  async function stats() {
    const now = clock();
    if (cached && now - cached.updated_at < 30000) return cached;
    if (pending) return pending;
    pending = (async () => {
      // Legacy browser-profile endpoint must not become an unbounded population scan.
      const budget = { remaining: 1000, deadline: Date.now() + 4000 };
      const total = (await keys(store, 'player:', budget)).length;
      const minute = Math.floor(now / 60000);
      const recent = await Promise.all([0, 1, 2].map(offset => keys(store, `online:${minute - offset}:`, budget)));
      const ids = new Set();
      for (const key of recent.flat()) {
        if (Date.now() > budget.deadline) throw new Error('Pilot scan budget exceeded');
        const record = await store.get(key, { type: 'json' });
        if (record && now - record.at < ONLINE_TTL && now >= record.at) ids.add(key.split(':').at(-1));
      }
      cached = { available: true, total_players: total, online_players: ids.size, updated_at: now,
        identity: 'browser-profile', online_window_seconds: ONLINE_TTL / 1000 };
      return cached;
    })();
    try { return await pending; } finally { pending = null; }
  }
  return async request => {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/community') {
        if (request.method === 'GET') return json(await stats());
        if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
        const body = await request.json();
        if (!validPublicId(body?.player_id)) return json({ error: 'Invalid browser profile.' }, 400);
        const now = clock();
        const minute = Math.floor(now / 60000);
        const registration = await store.setJSON(`player:${body.player_id}`, { first_seen: now }, { onlyIfNew: true });
        if (registration?.modified !== false) cached = null;
        const previous = await store.get(`seen:${body.player_id}`, { type: 'json' });
        await store.setJSON(`online:${minute}:${body.player_id}`, { at: now });
        await store.setJSON(`seen:${body.player_id}`, { minute });
        if (previous && Number.isInteger(previous.minute) && previous.minute < minute) {
          await store.delete(`online:${previous.minute}:${body.player_id}`);
        }
        return json({ available: true, ok: true });
      }
      if (url.pathname === '/api/results') {
        if (request.method === 'GET') {
          const id = url.searchParams.get('id');
          if (!validPublicId(id)) return json({ error: 'Invalid result identifier.' }, 400);
          const result = await store.get(`result:${id}`, { type: 'json' });
          return result ? json({ available: true, result }) : json({ error: 'Result not found.' }, 404);
        }
        if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
        const body = await request.json();
        if (!validPublicId(body?.run_id)) return json({ error: 'Invalid result identifier.' }, 400);
        if(scoreIdentity){const identity=await scoreIdentity(request,body.callsign);if(!identity.allowed)return json({error:'Sign in to use this reserved username.'},403);body.callsign=identity.callsign;}
        const validated = validateScoreEntry(body);
        if (!validated.ok) return json({ error: validated.error }, 400);
        // Only public score fields, never transfer codes, player IDs or party codes.
        const { party, at, ...entry } = validated.entry;
        const result = { ...entry, id: body.run_id, at: clock(), verification: 'client-reported' };
        const write = await store.setJSON(`result:${body.run_id}`, result, { onlyIfNew: true });
        if (write?.modified === false) return json({ error: 'Result already exists.' }, 409);
        return json({ available: true, result }, 201);
      }
      return json({ error: 'API route not found.' }, 404);
    } catch (error) {
      if (error instanceof SyntaxError) return json({ error: 'Invalid JSON body.' }, 400);
      return json({ available: false, error: 'Community service temporarily unavailable.' }, 503);
    }
  };
}
