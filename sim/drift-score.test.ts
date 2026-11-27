import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDriftScore, DRIFT_SCORE, stepDriftScore, type DriftEvent, type DriftSample } from './drift-score.ts';

const DT = 1 / 120;
const SLIDE: DriftSample = { slip: 0.6, speed: 25, onRoad: true, impact: 0 };
const STRAIGHT: DriftSample = { slip: 0, speed: 25, onRoad: true, impact: 0 };

function run(score: ReturnType<typeof createDriftScore>, sample: DriftSample, seconds: number): DriftEvent[] {
  const events: DriftEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const event = stepDriftScore(score, sample, DT);
    if (event) events.push(event);
  }
  return events;
}

test('a slide scores, raises the multiplier, and banks after the grace period', () => {
  const score = createDriftScore();
  const sliding = run(score, SLIDE, 6);
  assert.deepEqual(sliding[0], { kind: 'start' });
  assert.deepEqual(sliding.filter((e) => e.kind === 'combo').map((e) => e.kind === 'combo' ? e.multiplier : 0), [2, 3]);
  assert.ok(score.current > 500);
  const after = run(score, STRAIGHT, DRIFT_SCORE.graceSeconds + 0.1);
  const bank = after.find((e) => e.kind === 'bank');
  assert.ok(bank && bank.kind === 'bank' && bank.points > 500 && bank.best);
  assert.equal(score.total, bank.points);
  assert.equal(score.active, false);
});

test('linking two slides inside the grace period keeps one run', () => {
  const score = createDriftScore();
  run(score, SLIDE, 1);
  assert.deepEqual(run(score, STRAIGHT, DRIFT_SCORE.graceSeconds * 0.5), []);
  assert.equal(run(score, SLIDE, 1).some((e) => e.kind === 'start'), false);
  assert.equal(score.total, 0);
});

test('hitting a wall loses the run', () => {
  const score = createDriftScore();
  run(score, SLIDE, 2);
  const event = stepDriftScore(score, { ...SLIDE, impact: 8 }, DT);
  assert.ok(event && event.kind === 'fail' && event.lost > 0);
  assert.equal(score.total, 0);
  assert.equal(score.current, 0);
});

test('sliding on the grass does not score', () => {
  const score = createDriftScore();
  assert.deepEqual(run(score, { ...SLIDE, onRoad: false }, 2), []);
});
