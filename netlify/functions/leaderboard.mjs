/**
 * World + party leaderboards (Netlify Blobs) with dedupe and write-safety.
 */
import { getStore } from '@netlify/blobs';
import {createAccountService} from '../../server/account-service.mjs';
import {
  sanitizePartyCode,
  validateScoreEntry,
  upsertEntry,
  rankBoard,
  periodBoardKeys
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
  } catch (error) {
    throw error;
  }
}

async function writeBoard(store, key, board, etag, exists) {
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
    // Never overwrite a board without the version we read.
    throw new Error('Leaderboard version unavailable.');
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
  throw new Error('Leaderboard busy; score remains saved on your device.');
}

async function handleLeaderboard(req) {
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
    const period = url.searchParams.get('period') || 'all';
    const difficulty = url.searchParams.get('difficulty');
    const partitions = await Promise.all(periodBoardKeys(key, period).map(async k => (await readBoard(store, k)).board));
    const board = partitions.flat();
    const entries = rankBoard(board, {
      operation: Number.isFinite(operation) ? operation : null, period, difficulty
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

    try{const accounts=createAccountService(getStore({name:'neon-breach-community',consistency:'strong'})),identity=await accounts.scoreIdentity(req,body.callsign);if(!identity.allowed)return Response.json({error:'Sign in to use this reserved username.'},{status:403,headers:corsHeaders});body.callsign=identity.callsign;}catch{return Response.json({error:'Account validation unavailable.'},{status:503,headers:corsHeaders});}
    const validated = validateScoreEntry(body);
    if (!validated.ok) {
      return new Response(JSON.stringify({ error: validated.error }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const entry = { ...validated.entry, at: Date.now() };
    const key = boardKey(entry.party);
    const board = await upsertWithRetry(store, key, entry);
    await upsertWithRetry(store, periodBoardKeys(key, 'daily', entry.at)[0], entry);
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
}

export default async req => {
  try { return await handleLeaderboard(req); }
  catch { return new Response(JSON.stringify({ available: false, error: 'Leaderboard temporarily unavailable.' }), { status: 503, headers: corsHeaders }); }
};

export const config = {
  path: '/api/leaderboard'
};
