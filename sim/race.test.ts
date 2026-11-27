import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRace, formatLapTime, stepRace } from './race.ts';

test('the clock starts at the line and each lap records its time', () => {
  const race = createRace();
  assert.equal(stepRace(race, -5, 1000, 0.5), null);
  assert.equal(race.lapSeconds, 0);
  assert.deepEqual(stepRace(race, 0.1, 1000, 0.5), { kind: 'start' });
  assert.equal(stepRace(race, 500, 1000, 30), null);
  assert.deepEqual(stepRace(race, 1000.2, 1000, 30), { kind: 'lap', seconds: 60, best: true });
  assert.equal(race.lap, 2);
  stepRace(race, 1500, 1000, 40);
  assert.deepEqual(stepRace(race, 2001, 1000, 30), { kind: 'lap', seconds: 70, best: false });
  assert.equal(race.bestLap, 60);
  assert.equal(race.lastLap, 70);
});

test('lap times print as minutes, seconds and milliseconds', () => {
  assert.equal(formatLapTime(null), '--:--.---');
  assert.equal(formatLapTime(83.4567), '01:23.457');
  assert.equal(formatLapTime(9.5), '00:09.500');
});
