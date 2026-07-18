// Pure leaderboard helpers — import-free so tests and Netlify/esbuild can share them.

const MAX_SCORE_PER_KILL = 10500;
const MAX_FLAT_BONUS = 200;
const MAX_KILLS_PER_SECOND = 3;
const KILL_SLACK = 5;
const BOARD_CAP = 200;
const RANK_TOP = 50;

export function sanitizeCallsign(value) {
  const clean = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_\- ]/g, '')
    .trim()
    .slice(0, 16);
  return clean.length >= 2 ? clean : 'OPERATIVE';
}

export function sanitizePartyCode(value) {
  const clean = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
  return clean.length >= 3 && clean.length <= 12 ? clean : '';
}

/**
 * Validate a score submission. Rejects (returns {ok:false}) when stats are
 * impossible; clamps cosmetic fields when ok.
 */
export function validateScoreEntry(payload = {}) {
  const elapsed = Math.max(0, Math.min(86400, Math.floor(Number(payload.elapsed_seconds) || 0)));
  const kills = Math.max(0, Math.floor(Number(payload.kills) || 0));
  const score = Math.max(0, Math.floor(Number(payload.score) || 0));
  const maxKills = KILL_SLACK + elapsed * MAX_KILLS_PER_SECOND;
  const maxScore = 500 + kills * MAX_SCORE_PER_KILL + kills * MAX_FLAT_BONUS;

  if (score <= 0) return { ok: false, error: 'Score must be positive.' };
  if (kills > maxKills) return { ok: false, error: 'Kill count exceeds plausible rate.' };
  if (score > maxScore) return { ok: false, error: 'Score exceeds plausible maximum.' };

  const difficulties = ['recruit', 'operative', 'nightmare'];
  const operation = Math.max(0, Math.min(9, Math.floor(Number(payload.operation) || 0)));
  const difficulty = difficulties.includes(payload.difficulty) ? payload.difficulty : 'operative';
  const time_of_day = payload.time_of_day === 'night' ? 'night' : 'day';
  const grade = String(payload.grade || '—').toUpperCase().replace(/[^A-Z—-]/g, '').slice(0, 2) || '—';
  const party = sanitizePartyCode(payload.party);

  return {
    ok: true,
    entry: {
      callsign: sanitizeCallsign(payload.callsign),
      score: Math.min(9_999_999, score),
      kills: Math.min(9999, kills),
      grade,
      victory: !!payload.victory,
      operation,
      difficulty,
      time_of_day,
      elapsed_seconds: elapsed,
      party,
      at: Number(payload.at) || Date.now()
    }
  };
}

/** Keep best score per callsign per operation; cap stored board. */
export function upsertEntry(board, entry) {
  const list = Array.isArray(board) ? board.slice() : [];
  const callsign = sanitizeCallsign(entry.callsign);
  const operation = Math.max(0, Math.min(9, Math.floor(Number(entry.operation) || 0)));
  const score = Math.max(0, Math.floor(Number(entry.score) || 0));
  const idx = list.findIndex(
    row =>
      sanitizeCallsign(row.callsign) === callsign &&
      Math.max(0, Math.floor(Number(row.operation) || 0)) === operation
  );

  const next = {
    callsign,
    score,
    kills: Math.max(0, Math.floor(Number(entry.kills) || 0)),
    grade: String(entry.grade || '—').slice(0, 2),
    victory: !!entry.victory,
    operation,
    difficulty: entry.difficulty || 'operative',
    time_of_day: entry.time_of_day === 'night' ? 'night' : 'day',
    elapsed_seconds: Math.max(0, Math.floor(Number(entry.elapsed_seconds) || 0)),
    at: Number(entry.at) || Date.now()
  };

  if (idx >= 0) {
    const prev = list[idx];
    if (score > Number(prev.score || 0)) list[idx] = next;
    else if (score === Number(prev.score || 0) && next.at > Number(prev.at || 0)) {
      // Same best score — keep fresher timestamp / meta
      list[idx] = { ...prev, ...next, score: prev.score };
    }
  } else {
    list.push(next);
  }

  list.sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || Number(b.at || 0) - Number(a.at || 0));
  return list.slice(0, BOARD_CAP);
}

/**
 * Best-per-callsign (optionally filtered by operation), ranked top 50.
 */
export function rankBoard(board, options = {}) {
  const opFilter =
    options.operation === null || options.operation === undefined || options.operation === ''
      ? null
      : Math.max(0, Math.min(9, Math.floor(Number(options.operation))));

  let list = Array.isArray(board) ? board.slice() : [];
  if (opFilter !== null && Number.isFinite(opFilter)) {
    list = list.filter(row => Math.max(0, Math.floor(Number(row.operation) || 0)) === opFilter);
  }

  // Best score per callsign across remaining rows
  const best = new Map();
  for (const row of list) {
    const key = sanitizeCallsign(row.callsign);
    const score = Number(row.score || 0);
    const prev = best.get(key);
    if (!prev || score > Number(prev.score || 0) || (score === Number(prev.score || 0) && Number(row.at || 0) > Number(prev.at || 0))) {
      best.set(key, row);
    }
  }

  return [...best.values()]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || Number(b.at || 0) - Number(a.at || 0))
    .slice(0, RANK_TOP)
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

export const LEADERBOARD_BOARD_CAP = BOARD_CAP;
export const LEADERBOARD_RANK_TOP = RANK_TOP;
