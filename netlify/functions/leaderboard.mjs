/**
 * Shared party leaderboard for Netlify (family / friends worldwide).
 * Storage: Netlify Blobs — no database setup required.
 */
import { getStore } from '@netlify/blobs';

const MAX_BOARD = 50;
const STORE = 'neon-breach-party-board';
const KEY = 'entries';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, accept',
  'Cache-Control': 'no-store'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors }
  });
}

function sanitizeCallsign(value) {
  const clean = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_\- ]/g, '')
    .trim()
    .slice(0, 16);
  return clean.length >= 2 ? clean : 'OPERATIVE';
}

function ranked(board) {
  return (board || [])
    .slice()
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || Number(b.at || 0) - Number(a.at || 0))
    .slice(0, 25)
    .map((entry, index) => ({
      rank: index + 1,
      callsign: entry.callsign,
      best_score: Number(entry.score || 0),
      score: Number(entry.score || 0),
      kills: Number(entry.kills || 0),
      grade: entry.grade || '—',
      victory: !!entry.victory,
      operation: entry.operation ?? 0,
      difficulty: entry.difficulty || 'operative',
      time_of_day: entry.time_of_day || 'day',
      victories: entry.victory ? 1 : 0,
      at: entry.at || 0,
      you: false
    }));
}

async function loadBoard(store) {
  try {
    const data = await store.get(KEY, { type: 'json' });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  let store;
  try {
    store = getStore({ name: STORE, consistency: 'strong' });
  } catch (error) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({
        available: false,
        error: 'Cloud board warming up — scores still save on your device.',
        detail: String(error?.message || error)
      })
    };
  }

  if (event.httpMethod === 'GET') {
    const board = await loadBoard(store);
    const entries = ranked(board);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({
        available: true,
        source: 'netlify',
        entries,
        count: entries.length
      })
    };
  }

  if (event.httpMethod === 'POST') {
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({ error: 'Invalid JSON body.' })
      };
    }

    const score = Math.max(0, Math.min(9_999_999, Math.floor(Number(body.score) || 0)));
    if (score <= 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({ error: 'Score must be positive.' })
      };
    }

    const entry = {
      callsign: sanitizeCallsign(body.callsign),
      score,
      kills: Math.max(0, Math.min(9999, Math.floor(Number(body.kills) || 0))),
      grade: String(body.grade || '—').slice(0, 2).toUpperCase(),
      victory: !!body.victory,
      operation: Math.max(0, Math.min(9, Math.floor(Number(body.operation) || 0))),
      difficulty: ['recruit', 'operative', 'nightmare'].includes(body.difficulty)
        ? body.difficulty
        : 'operative',
      time_of_day: body.time_of_day === 'night' ? 'night' : 'day',
      at: Date.now()
    };

    const board = await loadBoard(store);
    board.push(entry);
    board.sort((a, b) => b.score - a.score || b.at - a.at);
    const trimmed = board.slice(0, MAX_BOARD);
    await store.setJSON(KEY, trimmed);

    const entries = ranked(trimmed);
    const mine = entries.findIndex(
      row =>
        row.callsign === entry.callsign &&
        row.best_score === entry.score &&
        Math.abs((row.at || 0) - entry.at) < 5000
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({
        available: true,
        source: 'netlify',
        ok: true,
        rank: mine >= 0 ? mine + 1 : null,
        entries
      })
    };
  }

  return {
    statusCode: 405,
    headers: { 'Content-Type': 'application/json', Allow: 'GET, POST, OPTIONS', ...cors },
    body: JSON.stringify({ error: 'Method not allowed.' })
  };
}
