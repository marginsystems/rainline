import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lowestPoint } from './body.ts';
import { createCrowd, CROWD, kickCrowd, stepCrowd, type Crowd, type Walker } from './crowd.ts';
import { createVehicle, kickTraffic, type Traffic } from './traffic.ts';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const STEP = 1 / 120;
const WALL = 9.6;
const empty = (): Traffic => ({ vehicles: [], riderDistance: 0, riderSpeed: 0, combo: 0, comboSeconds: 0, kicked: 0 });

function standing(distance: number, side: 1 | -1, pace = 0): { crowd: Crowd; walker: Walker } {
  const crowd = createCrowd([pace], WALL, 0, seeded(2));
  const walker = crowd.walkers[0];
  if (!walker) throw new Error('no walker');
  walker.distance = distance;
  walker.side = side;
  walker.body.position.x = side * crowd.shoulder;
  walker.body.position.z = distance;
  return { crowd, walker };
}

test('the crowd stands on the shoulder ahead of the rider, one walker per performer', () => {
  const crowd = createCrowd([0, 7.5, 1.5], WALL, 100, seeded(1));
  assert.equal(crowd.walkers.length, 3);
  for (const walker of crowd.walkers) {
    assert.ok(walker.distance > 100 && !walker.flying);
    assert.equal(Math.abs(walker.body.position.x), WALL - CROWD.shoulderInsideWall);
  }
});

test('a kick toward a pedestrian beside the rider sends them flying and scores, the other side misses', () => {
  const { crowd, walker } = standing(50, 1);
  const traffic = empty();
  const rider = { distance: 50, lateral: 7, forwardSpeed: 30 };
  assert.equal(kickCrowd(crowd, traffic, rider, -1), null);
  assert.equal(kickCrowd(crowd, traffic, { ...rider, distance: 40 }, 1), null);
  const bonk = kickCrowd(crowd, traffic, rider, 1);
  assert.ok(bonk && bonk.cause === 'kick' && walker.flying);
  assert.equal(bonk.points, CROWD.points);
  let peak = 0, deepest = 0;
  for (let t = 0; t < 3; t += STEP) {
    stepCrowd(crowd, traffic, { distance: 50, lateral: 7, forwardSpeed: 0 }, STEP, seeded(3));
    peak = Math.max(peak, walker.body.position.y);
    deepest = Math.min(deepest, lowestPoint(walker.body));
  }
  assert.ok(peak > 3 && walker.body.position.x > 14, `peak ${peak}, out to ${walker.body.position.x}`);
  assert.ok(deepest > -0.1, `sank ${deepest}`);
});

test('a tumbling wreck knocks a pedestrian over', () => {
  const { crowd, walker } = standing(50, 1);
  const car = createVehicle('car', 50, 5.55, 0);
  const traffic: Traffic = { vehicles: [car], riderDistance: 0, riderSpeed: 0, combo: 0, comboSeconds: 0, kicked: 0 };
  kickTraffic(traffic, 50, 3, 1);
  const bonks = [];
  for (let t = 0; t < 0.5 && !walker.flying; t += STEP) {
    for (const vehicle of traffic.vehicles) vehicle.body.position.x += vehicle.body.velocity.x * STEP;
    bonks.push(...stepCrowd(crowd, traffic, { distance: 0, lateral: 0, forwardSpeed: 0 }, STEP, seeded(3)));
  }
  assert.ok(walker.flying);
  assert.equal(bonks[0]?.cause, 'wreck');
});

test('riding straight into a pedestrian bowls them over, riding past them does not', () => {
  const { crowd, walker } = standing(50, 1);
  const traffic = empty();
  assert.equal(stepCrowd(crowd, traffic, { distance: 50, lateral: 6, forwardSpeed: 30 }, STEP, seeded(3)).length, 0);
  const bonks = stepCrowd(crowd, traffic, { distance: 50, lateral: crowd.shoulder - 0.3, forwardSpeed: 30 }, STEP, seeded(3));
  assert.equal(bonks[0]?.cause, 'ridden');
  assert.ok(walker.flying && walker.body.velocity.z > 30);
});

test('pedestrians left behind come back ahead, standing', () => {
  const { crowd, walker } = standing(50, 1);
  kickCrowd(crowd, empty(), { distance: 50, lateral: 7, forwardSpeed: 30 }, 1);
  stepCrowd(crowd, empty(), { distance: 50 + CROWD.dropBehind + 20, lateral: 0, forwardSpeed: 30 }, STEP, seeded(3));
  assert.ok(!walker.flying && walker.distance > 50 + CROWD.dropBehind + 20 + CROWD.spawnAhead[0]);
});
