import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignValues, cleanInteger, maskEmail } from '../server/campaign-rules.mjs';

test('cleanInteger clamps and rounds, falls back on garbage', () => {
  assert.equal(cleanInteger(42.6), 43);
  assert.equal(cleanInteger(-5, 0, 0, 10), 0);
  assert.equal(cleanInteger(999, 0, 0, 10), 10);
  assert.equal(cleanInteger('nope', 7), 7);
  assert.equal(cleanInteger(Infinity, 7), 7);
});

test('a legitimate mid-run save passes through unchanged', () => {
  const values = campaignValues({
    status: 'active', difficulty: 'nightmare', time_of_day: 'night',
    wave: 3, score: 12450, kills: 18, shots: 240, hits: 130,
    takedowns: 2, roadkills: 1, health: 62, shield: 20, armor: 45,
    weapon_index: 1, elapsed_seconds: 420
  });
  assert.equal(values.score, 12450);
  assert.equal(values.kills, 18);
  assert.equal(values.hits, 130);
  assert.equal(values.takedowns, 2);
});

test('score is clamped to what the kill count can plausibly yield', () => {
  const values = campaignValues({ score: 100000000, kills: 2, elapsed_seconds: 60 });
  assert.equal(values.score, 500 + 2 * 10500); // no takedowns/roadkills claimed
});

test('zero kills cannot carry a large score', () => {
  const values = campaignValues({ score: 999999, kills: 0, elapsed_seconds: 300 });
  assert.equal(values.score, 500);
});

test('kills are rate-limited by elapsed time', () => {
  const values = campaignValues({ kills: 500, elapsed_seconds: 10 });
  assert.equal(values.kills, 5 + 10 * 3);
});

test('hits cannot exceed shots; takedowns and roadkills cannot exceed kills', () => {
  const values = campaignValues({ shots: 10, hits: 50, kills: 3, takedowns: 9, roadkills: 9, elapsed_seconds: 120 });
  assert.equal(values.hits, 10);
  assert.equal(values.takedowns, 3);
  assert.equal(values.roadkills, 3);
});

test('enum fields fall back to safe defaults', () => {
  const values = campaignValues({ status: 'DROP TABLE', difficulty: 'god', time_of_day: 'noon' });
  assert.equal(values.status, 'active');
  assert.equal(values.difficulty, 'operative');
  assert.equal(values.timeOfDay, 'day');
});

test('operation index is clamped and defaults to 0', () => {
  assert.equal(campaignValues({}).operation, 0);
  assert.equal(campaignValues({ operation: 2 }).operation, 2);
  assert.equal(campaignValues({ operation: -3 }).operation, 0);
  assert.equal(campaignValues({ operation: 99 }).operation, 7);
  assert.equal(campaignValues({ operation: 'evil' }).operation, 0);
});

test('maskEmail never leaks the full address', () => {
  const masked = maskEmail('operative.seven@example.com');
  assert.equal(masked, 'OP***@e***');
  assert.ok(!masked.includes('operative.seven'));
  assert.equal(maskEmail(''), 'AGENT ***');
  assert.equal(maskEmail('no-at-sign'), 'AGENT ***');
});
