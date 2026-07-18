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

/** Transfer / sync profile codes (no accounts). */
export function sanitizeProfileCode(value) {
  const clean = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 24);
  return /^[A-Z0-9]{6,24}$/.test(clean) ? clean : '';
}

export function normalizeCareerTotals(value) {
  const v = value && typeof value === 'object' ? value : {};
  const n = key => Math.max(0, Math.floor(Number(v[key]) || 0));
  return { kills: n('kills'), takedowns: n('takedowns'), roadkills: n('roadkills'), victories: n('victories') };
}

/**
 * Career totals + best score. Records are capped at 8, so `stored` (the
 * profile's monotonic accumulator maintained by applyCampaignWrite) is the
 * source of truth once present; reducing the kept records is only the floor
 * for docs written before the accumulator existed.
 */
export function summarizeCareer(records = [], active = null, stored = null) {
  const finished = Array.isArray(records) ? records : [];
  const reduced = {
    kills: finished.reduce((sum, row) => sum + Number(row.kills || 0), 0),
    takedowns: finished.reduce((sum, row) => sum + Number(row.takedowns || 0), 0),
    roadkills: finished.reduce((sum, row) => sum + Number(row.roadkills || 0), 0),
    victories: finished.reduce((sum, row) => sum + (row.status === 'victory' ? 1 : 0), 0)
  };
  const accumulated = stored && stored.career ? normalizeCareerTotals(stored.career) : null;
  const career = accumulated
    ? {
        kills: Math.max(accumulated.kills, reduced.kills),
        takedowns: Math.max(accumulated.takedowns, reduced.takedowns),
        roadkills: Math.max(accumulated.roadkills, reduced.roadkills),
        victories: Math.max(accumulated.victories, reduced.victories)
      }
    : reduced;
  let best = finished.reduce((max, row) => Math.max(max, Number(row.score || 0)), 0);
  if (active) best = Math.max(best, Number(active.score || 0));
  if (stored) best = Math.max(best, Math.floor(Number(stored.best_score) || 0));
  return { career, best_score: best };
}

/**
 * Apply a POST payload to a profile document (pure).
 * profile: { nextId, active, records }
 * returns { profile, record }
 */
export function applyCampaignWrite(profile, payload = {}) {
  const base = profile && typeof profile === 'object'
    ? {
        nextId: Math.max(1, Math.floor(Number(profile.nextId) || 1)),
        active: profile.active || null,
        records: Array.isArray(profile.records) ? profile.records.slice() : [],
        career: profile.career ? normalizeCareerTotals(profile.career) : null,
        best_score: Math.max(0, Math.floor(Number(profile.best_score) || 0))
      }
    : { nextId: 1, active: null, records: [], career: null, best_score: 0 };
  // Seed the accumulator once for docs that predate it.
  if (!base.career) base.career = summarizeCareer(base.records).career;
  const credit = (record, sign = 1) => {
    base.career = {
      kills: Math.max(0, base.career.kills + sign * Math.floor(Number(record.kills) || 0)),
      takedowns: Math.max(0, base.career.takedowns + sign * Math.floor(Number(record.takedowns) || 0)),
      roadkills: Math.max(0, base.career.roadkills + sign * Math.floor(Number(record.roadkills) || 0)),
      victories: Math.max(0, base.career.victories + sign * (record.status === 'victory' ? 1 : 0))
    };
  };

  const values = campaignValues(payload);
  const now = new Date().toISOString();
  const incomingId = payload.id != null && payload.id !== '' ? Number(payload.id) : null;

  const asRecord = (id) => ({
    id,
    status: values.status,
    operation: values.operation,
    difficulty: values.difficulty,
    time_of_day: values.timeOfDay,
    wave: values.wave,
    score: values.score,
    kills: values.kills,
    shots: values.shots,
    hits: values.hits,
    takedowns: values.takedowns,
    roadkills: values.roadkills,
    health: values.health,
    shield: values.shield,
    armor: values.armor,
    weapon_index: values.weaponIndex,
    elapsed_seconds: values.elapsedSeconds,
    updated_at: now
  });

  // Update existing active by id
  if (
    incomingId != null &&
    Number.isFinite(incomingId) &&
    base.active &&
    Number(base.active.id) === incomingId
  ) {
    const record = { ...asRecord(incomingId), created_at: base.active.created_at || now };
    base.best_score = Math.max(base.best_score, record.score);
    if (values.status === 'active') {
      base.active = record;
    } else {
      base.active = null;
      base.records = [record, ...base.records].slice(0, 8);
      credit(record);
    }
    return { profile: base, record };
  }

  // New active run
  if (values.status === 'active') {
    if (base.active) {
      const abandoned = {
        ...base.active,
        status: 'abandoned',
        updated_at: now
      };
      base.records = [abandoned, ...base.records].slice(0, 8);
      credit(abandoned);
    }
    const id = base.nextId++;
    const record = { ...asRecord(id), created_at: now };
    base.best_score = Math.max(base.best_score, record.score);
    base.active = record;
    return { profile: base, record };
  }

  // Terminal status without matching active id — treat as finished run
  const id =
    incomingId != null && Number.isFinite(incomingId) ? incomingId : base.nextId++;
  if (id >= base.nextId) base.nextId = id + 1;
  const record = { ...asRecord(id), created_at: now };
  base.best_score = Math.max(base.best_score, record.score);
  if (base.active && Number(base.active.id) === id) base.active = null;
  // Replacing an already-finished record with the same id must not double-count.
  const previous = base.records.find(r => Number(r.id) === id);
  if (previous) credit(previous, -1);
  credit(record);
  base.records = [record, ...base.records.filter(r => Number(r.id) !== id)].slice(0, 8);
  return { profile: base, record };
}
