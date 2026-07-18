/**
 * Anonymous aggregate telemetry — no callsigns / PII.
 */
import { getStore } from '@netlify/blobs';

const STORE_NAME = 'neon-breach-telemetry';
const KEY = 'counts';
const ALLOW = new Set(['loaded', 'op_start', 'op_victory', 'op_failed']);
const KEEP_DAYS = 60;

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
    throw new Error('blobs unavailable');
  }
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function emptyDay() {
  return { loaded: 0, op_start: 0, op_victory: 0, op_failed: 0, byOp: {} };
}

function pruneDays(days) {
  const keys = Object.keys(days || {}).sort();
  if (keys.length <= KEEP_DAYS) return days || {};
  const drop = keys.slice(0, keys.length - KEEP_DAYS);
  const next = { ...days };
  for (const k of drop) delete next[k];
  return next;
}

function applyEvent(doc, event, operation) {
  const days = pruneDays(doc.days || {});
  const key = dayKey();
  const day = { ...emptyDay(), ...(days[key] || {}) };
  day[event] = (day[event] || 0) + 1;
  if (operation != null && Number.isFinite(operation) && event !== 'loaded') {
    const op = String(Math.max(0, Math.min(9, Math.floor(operation))));
    const slot = { start: 0, victory: 0, failed: 0, ...(day.byOp[op] || {}) };
    if (event === 'op_start') slot.start += 1;
    if (event === 'op_victory') slot.victory += 1;
    if (event === 'op_failed') slot.failed += 1;
    day.byOp = { ...day.byOp, [op]: slot };
  }
  days[key] = day;
  return { days: pruneDays(days) };
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let store;
  try {
    store = openStore();
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 202, headers: corsHeaders });
  }

  if (req.method === 'GET') {
    try {
      const data = (await store.get(KEY, { type: 'json' })) || { days: {} };
      return new Response(JSON.stringify({ ok: true, ...data }), {
        status: 200,
        headers: corsHeaders
      });
    } catch {
      return new Response(JSON.stringify({ ok: true, days: {} }), {
        status: 200,
        headers: corsHeaders
      });
    }
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: corsHeaders
    });
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 202, headers: corsHeaders });
  }

  const event = String(body.event || '');
  if (!ALLOW.has(event)) {
    return new Response(JSON.stringify({ ok: false, error: 'unknown event' }), {
      status: 400,
      headers: corsHeaders
    });
  }
  const operation =
    body.operation === undefined || body.operation === null
      ? null
      : Math.floor(Number(body.operation));

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const meta = await store.getWithMetadata(KEY, { type: 'json' });
      const doc = meta?.data && typeof meta.data === 'object' ? meta.data : { days: {} };
      const next = applyEvent(doc, event, operation);
      const result = meta?.etag
        ? await store.setJSON(KEY, next, { onlyIfMatch: meta.etag })
        : await store.setJSON(KEY, next, { onlyIfNew: true });
      if (result?.modified === false) continue;
      return new Response(JSON.stringify({ ok: true }), { status: 202, headers: corsHeaders });
    } catch {
      // best-effort
    }
  }

  return new Response(JSON.stringify({ ok: true, dropped: true }), {
    status: 202,
    headers: corsHeaders
  });
};

export const config = { path: '/api/telemetry' };
