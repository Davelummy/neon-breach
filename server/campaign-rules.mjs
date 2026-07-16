// Campaign payload validation shared by the deploy worker (inlined at build
// time by scripts/build.mjs) and the node:test suite. Keep this file free of
// imports so it can be spliced into the worker source verbatim.

export function cleanInteger(value, fallback = 0, min = 0, max = 100000000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function cleanChoice(value, choices, fallback) {
  return choices.includes(value) ? value : fallback;
}

// Highest score a single elimination can yield with every multiplier stacked:
// titan base 420 x combo 8 x critical 1.25 x takedown 1.4 x elite 1.75 = 10290.
const MAX_SCORE_PER_KILL = 10500;
// Flat bonuses awarded on top of kill score (finisher +175, roadkill +200).
const MAX_FLAT_BONUS = 200;
// Generous ceiling on sustained elimination rate, plus slack for the opening seconds.
const MAX_KILLS_PER_SECOND = 3;
const KILL_SLACK = 5;

export function campaignValues(payload) {
  const elapsedSeconds = cleanInteger(payload.elapsed_seconds, 0, 0, 86400);
  const kills = cleanInteger(payload.kills, 0, 0, Math.min(10000, KILL_SLACK + elapsedSeconds * MAX_KILLS_PER_SECOND));
  const shots = cleanInteger(payload.shots, 0, 0, 100000);
  const takedowns = cleanInteger(payload.takedowns, 0, 0, kills);
  const roadkills = cleanInteger(payload.roadkills, 0, 0, kills);
  const maxScore = 500 + kills * MAX_SCORE_PER_KILL + (takedowns + roadkills) * MAX_FLAT_BONUS;
  return {
    status: cleanChoice(payload.status, ['active', 'victory', 'failed', 'abandoned'], 'active'),
    // Loose upper bound so new operations don't need a worker redeploy; the client clamps to real ops.
    operation: cleanInteger(payload.operation, 0, 0, 7),
    difficulty: cleanChoice(payload.difficulty, ['recruit', 'operative', 'nightmare'], 'operative'),
    timeOfDay: cleanChoice(payload.time_of_day, ['day', 'night'], 'day'),
    wave: cleanInteger(payload.wave, 1, 1, 5),
    score: cleanInteger(payload.score, 0, 0, maxScore),
    kills,
    shots,
    hits: cleanInteger(payload.hits, 0, 0, shots),
    takedowns,
    roadkills,
    health: cleanInteger(payload.health, 100, 0, 100),
    shield: cleanInteger(payload.shield, 50, 0, 50),
    armor: cleanInteger(payload.armor, 100, 0, 100),
    weaponIndex: cleanInteger(payload.weapon_index, 0, 0, 7),
    elapsedSeconds
  };
}

// Public leaderboard rows must never expose raw emails.
export function maskEmail(email) {
  const text = String(email || '');
  const at = text.indexOf('@');
  if (at <= 0) return 'AGENT ***';
  const local = text.slice(0, at);
  const domain = text.slice(at + 1);
  return `${local.slice(0, 2).toUpperCase()}***@${domain.slice(0, 1)}***`;
}
