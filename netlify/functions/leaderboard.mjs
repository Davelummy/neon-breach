/**
 * World + party leaderboards (Netlify Blobs) with dedupe and write-safety.
 */
import { getStore } from '@netlify/blobs';
import {
  sanitizePartyCode,
  validateScoreEntry,
  upsertEntry,
  rankBoard
} from '../../server/leaderboard-rules.mjs';

const STORE_NAME = 'neon-breach-party-board';
const WORLD_KEY = 'entries';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, accept',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8'
};

function openStore() {
  try {
    return getStore({ name: STORE_NAME, consistency: 'strong' });
  } catch {
    const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) {
      return getStore({ name: STORE_NAME, siteID, token, consistency: 'strong' });
    }
    throw new Error('Netlify Blobs is not configured for this site yet.');
  }
}

function boardKey(party) {
  const code = sanitizePartyCode(party);
  return code ? `party:${code}` : WORLD_KEY;
}

async function readBoard(store, key) {
  try {
    const result = await store.getWithMetadata(key, { type: 'json' });
    if (!result) return { board: [], etag: null, exists: false };
    const board = Array.isArray(result.data) ? result.data : [];
    return { board, etag: result.etag || null, exists: true };
  } catch {
    return { board: [], etag: null, exists: false };
  }
}

async function writeBoard(store, key, board, etag, exists) {
  const options = etag ? { onlyIfMatch: etag } : exists ? {} : { onlyIfNew: true };
  // If we have no etag but blob may exist, unconditional setJSON is last resort after retries.
  try {
    if (etag) return await store.setJSON(key, board, { onlyIfMatch: etag });
    if (!exists) {
      const r = await store.setJSON(key, board, { onlyIfNew: true });
      if (r && r.modified === false) {
        // Lost race — caller retries
        return r;
      }
      return r || { modified: true };
    }
    await store.setJSON(key, board);
    return { modified: true };
  } catch (error) {
    // Some runtimes return modified:false instead of throwing
    if (String(error?.message || error).toLowerCase().includes('precondition')) {
      return { modified: false };
    }
    throw error;
  }
}

async function upsertWithRetry(store, key, entry) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { board, etag, exists } = await readBoard(store, key);
    const next = upsertEntry(board, entry);
    const result = await writeBoard(store, key, next, etag, exists);
    if (result?.modified !== false) return next;
  }
  // Final unconditional write so a score is not dropped after persistent contention
  const { board } = await readBoard(store, key);
  const next = upsertEntry(board, entry);
  await store.setJSON(key, next);
  return next;
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let store;
  try {
    store = openStore();
  } catch (error) {
    return new Response(
      JSON.stringify({
        available: false,
        error: 'Cloud board warming up — scores still save on your device.',
        detail: String(error?.message || error)
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  const url = new URL(req.url);

  if (req.method === 'GET') {
    const party = sanitizePartyCode(url.searchParams.get('party') || '');
    const opRaw = url.searchParams.get('operation');
    const operation =
      opRaw === null || opRaw === '' || opRaw === 'all' ? null : Math.floor(Number(opRaw));
    const key = boardKey(party);
    const { board } = await readBoard(store, key);
    const entries = rankBoard(board, {
      operation: Number.isFinite(operation) ? operation : null
    });
    return new Response(
      JSON.stringify({
        available: true,
        source: 'netlify',
        entries,
        count: entries.length,
        party: party || null
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  if (req.method === 'POST') {
    let body = {};
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const validated = validateScoreEntry(body);
    if (!validated.ok) {
      return new Response(JSON.stringify({ error: validated.error }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const entry = validated.entry;
    const key = boardKey(entry.party);
    const board = await upsertWithRetry(store, key, entry);
    // Rank on the same unfiltered board the client renders, so the toast
    // matches the visible list position.
    const entries = rankBoard(board, { operation: null });
    const mine = entries.find(
      row => row.callsign === entry.callsign && row.best_score === entry.score
    );

    return new Response(
      JSON.stringify({
        available: true,
        source: 'netlify',
        ok: true,
        rank: mine?.rank ?? null,
        entries,
        party: entry.party || null
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
    status: 405,
    headers: { ...corsHeaders, Allow: 'GET, POST, OPTIONS' }
  });
};

export const config = {
  path: '/api/leaderboard'
};
