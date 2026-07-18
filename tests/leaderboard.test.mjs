import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeCallsign,
  sanitizePartyCode,
  validateScoreEntry,
  upsertEntry,
  rankBoard
} from '../server/leaderboard-rules.mjs';
import {
  sanitizeProfileCode,
  summarizeCareer,
  applyCampaignWrite,
  campaignValues
} from '../server/campaign-rules.mjs';

test('sanitizeCallsign normalizes and falls back', () => {
  assert.equal(sanitizeCallsign(' unit_07! '), 'UNIT_07');
  assert.equal(sanitizeCallsign('x'), 'OPERATIVE');
  assert.equal(sanitizeCallsign(''), 'OPERATIVE');
});

test('sanitizePartyCode enforces 3–12 alphanumerics', () => {
  assert.equal(sanitizePartyCode('ab'), '');
  assert.equal(sanitizePartyCode('family1'), 'FAMILY1');
  assert.equal(sanitizePartyCode('ok-12!!'), 'OK12');
  // Over-length is truncated to 12 alphanumerics
  assert.equal(sanitizePartyCode('toolongpartycodexyz').length, 12);
});

test('validateScoreEntry rejects impossible combos and accepts legit ones', () => {
  const badKills = validateScoreEntry({ score: 1000, kills: 500, elapsed_seconds: 10 });
  assert.equal(badKills.ok, false);

  const badScore = validateScoreEntry({ score: 99_999_999, kills: 1, elapsed_seconds: 60 });
  assert.equal(badScore.ok, false);

  const zero = validateScoreEntry({ score: 0, kills: 0, elapsed_seconds: 10 });
  assert.equal(zero.ok, false);

  const good = validateScoreEntry({
    callsign: 'dave',
    score: 12000,
    kills: 8,
    grade: 'a',
    victory: true,
    operation: 1,
    difficulty: 'operative',
    elapsed_seconds: 400,
    party: 'fam01'
  });
  assert.equal(good.ok, true);
  assert.equal(good.entry.callsign, 'DAVE');
  assert.equal(good.entry.party, 'FAM01');
  assert.equal(good.entry.operation, 1);
  assert.equal(good.entry.grade, 'A');
});

test('upsertEntry keeps best per callsign+operation and caps board', () => {
  let board = [];
  board = upsertEntry(board, { callsign: 'AA', score: 100, operation: 0, kills: 2, at: 1 });
  board = upsertEntry(board, { callsign: 'AA', score: 80, operation: 0, kills: 1, at: 2 });
  board = upsertEntry(board, { callsign: 'AA', score: 150, operation: 0, kills: 3, at: 3 });
  board = upsertEntry(board, { callsign: 'AA', score: 200, operation: 1, kills: 4, at: 4 });
  board = upsertEntry(board, { callsign: 'BB', score: 90, operation: 0, kills: 1, at: 5 });

  const a0 = board.filter(r => r.callsign === 'AA' && r.operation === 0);
  assert.equal(a0.length, 1);
  assert.equal(a0[0].score, 150);

  const a1 = board.find(r => r.callsign === 'AA' && r.operation === 1);
  assert.equal(a1.score, 200);

  // Cap at 200
  for (let i = 0; i < 250; i++) {
    board = upsertEntry(board, {
      callsign: `P${i}`,
      score: i + 1,
      operation: 0,
      kills: 1,
      at: 1000 + i
    });
  }
  assert.ok(board.length <= 200);
});

test('rankBoard dedupes per callsign and filters by operation', () => {
  const board = [
    { callsign: 'AA', score: 100, operation: 0, kills: 2, victory: true, at: 1 },
    { callsign: 'AA', score: 300, operation: 1, kills: 5, victory: true, at: 2 },
    { callsign: 'BB', score: 200, operation: 0, kills: 3, victory: false, at: 3 },
    { callsign: 'CC', score: 50, operation: 1, kills: 1, victory: true, at: 4 }
  ];

  const all = rankBoard(board);
  assert.equal(all[0].callsign, 'AA');
  assert.equal(all[0].best_score, 300);
  assert.equal(all[0].rank, 1);
  assert.equal(all.length, 3);

  const op0 = rankBoard(board, { operation: 0 });
  assert.equal(op0.length, 2);
  assert.equal(op0[0].callsign, 'BB');
  assert.equal(op0[0].best_score, 200);
  assert.equal(op0[1].callsign, 'AA');
  assert.equal(op0[1].best_score, 100);
});

test('sanitizeProfileCode and campaign career summary', () => {
  assert.equal(sanitizeProfileCode('abc'), '');
  assert.equal(sanitizeProfileCode('ABCDEF12'), 'ABCDEF12');

  const { career, best_score } = summarizeCareer(
    [
      { status: 'victory', kills: 10, takedowns: 2, roadkills: 1, score: 5000 },
      { status: 'failed', kills: 3, takedowns: 0, roadkills: 0, score: 800 }
    ],
    { score: 1200 }
  );
  assert.equal(career.kills, 13);
  assert.equal(career.victories, 1);
  assert.equal(career.takedowns, 2);
  assert.equal(best_score, 5000);
});

test('applyCampaignWrite creates, updates, and finishes runs', () => {
  let profile = { nextId: 1, active: null, records: [] };

  let result = applyCampaignWrite(profile, {
    status: 'active',
    score: 100,
    kills: 1,
    elapsed_seconds: 30,
    operation: 0
  });
  profile = result.profile;
  assert.equal(result.record.id, 1);
  assert.equal(profile.active.id, 1);
  assert.equal(profile.nextId, 2);

  result = applyCampaignWrite(profile, {
    id: 1,
    status: 'active',
    score: 500,
    kills: 3,
    elapsed_seconds: 60
  });
  profile = result.profile;
  assert.equal(profile.active.score, 500);

  result = applyCampaignWrite(profile, {
    id: 1,
    status: 'victory',
    score: 900,
    kills: 5,
    elapsed_seconds: 120
  });
  profile = result.profile;
  assert.equal(profile.active, null);
  assert.equal(profile.records[0].status, 'victory');
  assert.equal(profile.records[0].score, 900);

  // New active abandons previous if somehow still active is covered; start fresh
  result = applyCampaignWrite(profile, {
    status: 'active',
    score: 10,
    kills: 0,
    elapsed_seconds: 5
  });
  assert.equal(result.record.id, 2);
  assert.ok(campaignValues({ kills: 1, shots: 2, hits: 1, score: 100, elapsed_seconds: 10 }).kills >= 0);
});

test('career accumulates past the 8-record cap and best score is monotonic', () => {
  let profile = { nextId: 1, active: null, records: [] };
  for (let run = 0; run < 12; run++) {
    let result = applyCampaignWrite(profile, {
      status: 'active', score: 100, kills: 2, elapsed_seconds: 60, operation: 0
    });
    profile = result.profile;
    result = applyCampaignWrite(profile, {
      id: result.record.id,
      status: run % 2 === 0 ? 'victory' : 'failed',
      score: 1000 + run, kills: 5, takedowns: 1, elapsed_seconds: 300, operation: 0
    });
    profile = result.profile;
  }
  assert.equal(profile.records.length, 8);
  const { career, best_score } = summarizeCareer(profile.records, profile.active, profile);
  // 12 finished runs × 5 kills — not just the 8 kept records
  assert.equal(career.kills, 60);
  assert.equal(career.takedowns, 12);
  assert.equal(career.victories, 6);
  assert.equal(best_score, 1011);
});

test('re-finishing the same record id does not double-count career', () => {
  let profile = { nextId: 1, active: null, records: [] };
  let result = applyCampaignWrite(profile, {
    status: 'active', score: 50, kills: 1, elapsed_seconds: 30
  });
  profile = result.profile;
  const id = result.record.id;
  result = applyCampaignWrite(profile, { id, status: 'victory', score: 900, kills: 4, elapsed_seconds: 200 });
  profile = result.profile;
  // Duplicate terminal POST for the same id (retry / double-tap)
  result = applyCampaignWrite(profile, { id, status: 'victory', score: 900, kills: 4, elapsed_seconds: 200 });
  profile = result.profile;
  const { career } = summarizeCareer(profile.records, profile.active, profile);
  assert.equal(career.kills, 4);
  assert.equal(career.victories, 1);
  assert.equal(profile.records.length, 1);
});
