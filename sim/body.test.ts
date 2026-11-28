import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseOf, collide, createBody, FLAT_TERRAIN, lowestPoint, placeBody, poseAt, rotate, stepBody, touching, vec, type BoxBody, type Terrain } from './body.ts';

const STEP = 1 / 120;

function run(body: BoxBody, terrain: Terrain, seconds: number, each?: (body: BoxBody) => void): void {
  for (let t = 0; t < seconds; t += STEP) {
    stepBody(body, terrain, STEP);
    each?.(body);
  }
}

const up = (body: BoxBody): number => rotate(body.rotation, vec(0, 1, 0)).y;

test('a dropped box lands and comes to rest on its wheels at its own height', () => {
  const body = createBody(vec(0.95, 0.75, 2.45), 1.4);
  placeBody(body, 0, 0, 0);
  body.position.y = 4;
  run(body, FLAT_TERRAIN, 4);
  assert.ok(body.resting, 'box never settled');
  assert.ok(Math.abs(body.position.y - 0.75) < 0.05, `rests at ${body.position.y}`);
  assert.ok(up(body) > 0.99);
});

test('a box kicked sideways with a roll tumbles, never sinks into the ground, and stops', () => {
  const body = createBody(vec(0.95, 0.75, 2.45), 1.4);
  placeBody(body, 0, 0, 18);
  body.velocity.x = 15;
  body.velocity.y = 9;
  body.spin.z = -4.5;
  let deepest = 0, leastUp = 1;
  run(body, FLAT_TERRAIN, 10, (b) => {
    deepest = Math.min(deepest, lowestPoint(b));
    leastUp = Math.min(leastUp, up(b));
  });
  assert.ok(deepest > -0.1, `sank to ${deepest}`);
  assert.ok(leastUp < 0, 'never rolled past its side');
  assert.ok(body.resting, 'never came to rest');
  assert.ok(body.position.x > 12, `only went ${body.position.x} sideways`);
});

test('a box thrown at a hillside stays on top of it', () => {
  const hill: Terrain = { height: (_along, lateral) => (lateral > 10 ? (lateral - 10) * 0.7 : 0), barrier: () => null };
  const body = createBody(vec(0.95, 0.75, 2.45), 1.4);
  placeBody(body, 2, 0, 0);
  body.velocity.x = 16;
  body.velocity.y = 8;
  body.spin.z = -4;
  let worst = 0;
  run(body, hill, 8, (b) => {
    for (const lateral of [b.position.x]) worst = Math.min(worst, lowestPoint(b) - hill.height(b.position.z, lateral) + b.half.x);
  });
  assert.ok(body.position.y > hill.height(body.position.z, body.position.x) - 0.1, 'ended up inside the hill');
  assert.ok(worst > -1, `went ${worst} into the hill`);
});

test('a box sliding into a guardrail bounces back instead of passing through', () => {
  const rail: Terrain = { height: () => 0, barrier: () => ({ at: 9.6, top: 0.9, depth: 1.5 }) };
  const body = createBody(vec(0.95, 0.75, 2.45), 1.4);
  placeBody(body, 5, 0, 0);
  body.velocity.x = 12;
  run(body, rail, 3);
  assert.ok(body.position.x + body.half.x < 9.8, `went through to ${body.position.x}`);
});

test('two boxes that meet push each other apart, and the heavy one moves less', () => {
  const car = createBody(vec(0.95, 0.75, 2.45), 1.4), bus = createBody(vec(1.28, 1.3, 5.25), 11);
  placeBody(car, -0.9, 0, 0);
  placeBody(bus, 1.3, 0, 0);
  car.velocity.x = 10;
  const hit = touching(car, bus);
  assert.ok(hit, 'overlapping boxes did not touch');
  const closing = collide(car, bus, hit);
  assert.ok(closing > 9);
  assert.ok(car.velocity.x < 4 && bus.velocity.x > 0.3 && bus.velocity.x < 3, `car ${car.velocity.x}, bus ${bus.velocity.x}`);
  placeBody(car, -10, 0, 0);
  assert.equal(touching(car, bus), null);
});

test('the drawn pose blends between the last two steps and finds the base under the centre', () => {
  const body = createBody(vec(1, 0.75, 2), 1);
  placeBody(body, 0, 10, 20);
  run(body, FLAT_TERRAIN, STEP);
  const pose = { position: vec(0, 0, 0), rotation: { x: 0, y: 0, z: 0, w: 1 } };
  poseAt(body, 0.5, pose);
  assert.ok(Math.abs(pose.position.z - (body.before.position.z + body.position.z) / 2) < 1e-9);
  assert.ok(Math.abs(baseOf(pose, body.half).y - (pose.position.y - 0.75)) < 1e-9);
});
