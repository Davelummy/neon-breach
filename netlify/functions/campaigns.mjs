/**
 * Profile-based campaign cloud (Netlify Blobs). No accounts — transfer code only.
 */
import { getStore } from '@netlify/blobs';
import {
  sanitizeProfileCode,
  summarizeCareer,
  normalizeCareerTotals,
  applyCampaignWrite
} from '../../server/campaign-rules.mjs';

const STORE_NAME = 'neon-breach-campaigns';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, accept, x-neon-profile',
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

function profileKey(code) {
  return `profile:${code}`;
}

async function readProfile(store, code) {
  try {
    const result = await store.getWithMetadata(profileKey(code), { type: 'json' });
    if (!result) {
      return {
        profile: { nextId: 1, active: null, records: [] },
        etag: null,
        exists: false
      };
    }
    const data = result.data && typeof result.data === 'object' ? result.data : {};
    return {
      profile: {
        nextId: Math.max(1, Math.floor(Number(data.nextId) || 1)),
        active: data.active || null,
        records: Array.isArray(data.records) ? data.records : [],
        career: data.career ? normalizeCareerTotals(data.career) : null,
        best_score: Math.max(0, Math.floor(Number(data.best_score) || 0))
      },
      etag: result.etag || null,
      exists: true
    };
  } catch {
    return {
      profile: { nextId: 1, active: null, records: [] },
      etag: null,
      exists: false
    };
  }
}

async function writeProfile(store, code, profile, etag, exists) {
  const key = profileKey(code);
  if (etag) {
    return store.setJSON(key, profile, { onlyIfMatch: etag });
  }
  if (!exists) {
    return store.setJSON(key, profile, { onlyIfNew: true });
  }
  await store.setJSON(key, profile);
  return { modified: true };
}

function responseForProfile(profile) {
  const { career, best_score } = summarizeCareer(profile.records, profile.active, profile);
  return {
    available: true,
    active: profile.active,
    records: profile.records,
    best_score,
    career
  };
}

function unavailable(detail) {
  return new Response(
    JSON.stringify({
      available: false,
      error: 'Campaign cloud is optional — progress is saved on this device.',
      detail
    }),
    { status: 200, headers: corsHeaders }
  );
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const code = sanitizeProfileCode(req.headers.get('x-neon-profile') || '');
  if (!code) return unavailable('missing or invalid x-neon-profile');

  let store;
  try {
    store = openStore();
  } catch (error) {
    return unavailable(String(error?.message || error));
  }

  if (req.method === 'GET') {
    const { profile } = await readProfile(store, code);
    return new Response(JSON.stringify(responseForProfile(profile)), {
      status: 200,
      headers: corsHeaders
    });
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

    let lastRecord = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { profile, etag, exists } = await readProfile(store, code);
      const { profile: next, record } = applyCampaignWrite(profile, body);
      lastRecord = record;
      const result = await writeProfile(store, code, next, etag, exists);
      if (result?.modified !== false) {
        return new Response(
          JSON.stringify({ available: true, record }),
          { status: 200, headers: corsHeaders }
        );
      }
    }

    // Last resort unconditional write
    const { profile } = await readProfile(store, code);
    const { profile: next, record } = applyCampaignWrite(profile, body);
    await store.setJSON(profileKey(code), next);
    return new Response(JSON.stringify({ available: true, record: record || lastRecord }), {
      status: 200,
      headers: corsHeaders
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
    status: 405,
    headers: { ...corsHeaders, Allow: 'GET, POST, OPTIONS' }
  });
};

export const config = { path: '/api/campaigns' };
