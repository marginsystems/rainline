import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAR, createCar, gearFor, IDLE_INPUT, repairCar, resetToTrack, stepCar, type CarInput, type CarState } from './car.ts';
import { buildTrack, DUSK_CIRCUIT, sampleAt } from './track.ts';

const track = buildTrack(DUSK_CIRCUIT);
const DT = 1 / 120;

function drive(car: CarState, input: CarInput, seconds: number, each?: (car: CarState) => void): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    stepCar(car, input, track, DT);
    each?.(car);
  }
}

const finite = (car: CarState): boolean => [car.x, car.z, car.yaw, car.vx, car.vz, car.yawRate, car.rpm, car.boost].every(Number.isFinite);

test('full throttle on the start straight builds speed without sliding', () => {
  const car = createCar(track);
  drive(car, { ...IDLE_INPUT, throttle: 1 }, 3.5);
  assert.ok(car.speed > 25 && car.speed < CAR.topSpeed, `speed ${car.speed}`);
  assert.equal(car.drifting, false);
  assert.ok(Math.abs(car.lateral) < track.halfWidth, `lateral ${car.lateral}`);
  assert.ok(car.distance > 0);
});

test('braking stops the car and then reverses it', () => {
  const car = createCar(track);
  drive(car, { ...IDLE_INPUT, throttle: 1 }, 2);
  drive(car, { ...IDLE_INPUT, brake: 1 }, 1.2);
  assert.ok(car.forwardSpeed < 1, `still moving at ${car.forwardSpeed}`);
  drive(car, { ...IDLE_INPUT, brake: 1 }, 2);
  assert.ok(car.forwardSpeed < -3 && car.forwardSpeed >= -CAR.reverseTopSpeed - 0.1);
});

test('a handbrake turn breaks traction into a held slide and earns boost', () => {
  const car = createCar(track);
  drive(car, { ...IDLE_INPUT, throttle: 1 }, 2.5);
  const boostBefore = car.boost;
  drive(car, { ...IDLE_INPUT, throttle: 1, steer: 1, handbrake: true }, 0.5);
  assert.equal(car.drifting, true);
  let deepest = 0;
  drive(car, { ...IDLE_INPUT, throttle: 1, steer: 1 }, 0.7, (c) => {
    deepest = Math.max(deepest, Math.abs(c.slip));
    assert.equal(c.impact, 0);
  });
  assert.ok(deepest > 0.4 && deepest < 1.25, `slip angle ${deepest}`);
  assert.ok(car.boost > boostBefore);
  assert.ok(car.speed > 12, `the slide scrubbed speed to ${car.speed}`);
  assert.ok(finite(car));
});

test('steering straight after a slide brings the grip back', () => {
  const car = createCar(track);
  drive(car, { ...IDLE_INPUT, throttle: 1 }, 2);
  drive(car, { ...IDLE_INPUT, throttle: 1, steer: -1, handbrake: true }, 0.35);
  drive(car, { ...IDLE_INPUT, throttle: 0.6 }, 3.5);
  assert.equal(car.drifting, false);
  assert.ok(Math.abs(car.slip) < 0.05);
  assert.ok(car.grip > CAR.gripFull * 0.9);
});

test('ordinary steering at speed corners on grip', () => {
  const car = createCar(track);
  drive(car, { ...IDLE_INPUT, throttle: 1 }, 3);
  let deepest = 0;
  drive(car, { ...IDLE_INPUT, throttle: 1, steer: 0.5 }, 0.5, (c) => { deepest = Math.max(deepest, Math.abs(c.slip)); });
  assert.ok(deepest < CAR.driftEnterSlip, `slip ${deepest}`);
});

test('holding full lock under power at speed kicks the tail out, and it holds a slow, deep slide', () => {
  const car = createCar(track);
  drive(car, { ...IDLE_INPUT, throttle: 1 }, 1.4);
  assert.equal(car.drifting, false);
  drive(car, { ...IDLE_INPUT, throttle: 1, steer: 1 }, 0.9);
  assert.equal(car.drifting, true);
  assert.ok(Math.abs(car.slip) > 0.35, `slip ${car.slip}`);
  assert.ok(car.speed > 12 && car.speed < 30, `speed ${car.speed}`);
});

test('a slide keeps most of its speed through the first second off the throttle', () => {
  const car = createCar(track);
  drive(car, { ...IDLE_INPUT, throttle: 1 }, 1.4);
  drive(car, { ...IDLE_INPUT, throttle: 1, steer: 1 }, 0.7);
  const before = car.speed;
  drive(car, { ...IDLE_INPUT, steer: 0.3 }, 0.5);
  assert.ok(car.speed > before * 0.72, `speed fell from ${before} to ${car.speed}`);
  assert.equal(car.drifting, true);
});

test('throttle and full lock from low speed spins the car into a donut', () => {
  const car = createCar(track);
  drive(car, { ...IDLE_INPUT, throttle: 1 }, 0.6);
  const startYaw = car.yaw;
  let turned = 0, last = startYaw;
  drive(car, { ...IDLE_INPUT, throttle: 1, steer: 1 }, 4, (c) => {
    let step = c.yaw - last;
    if (step > Math.PI) step -= Math.PI * 2;
    if (step < -Math.PI) step += Math.PI * 2;
    turned += step;
    last = c.yaw;
  });
  assert.ok(turned > Math.PI, `turned ${turned}`);
});

test('the walls contain the car', () => {
  const car = createCar(track);
  let hardest = 0;
  drive(car, { ...IDLE_INPUT, throttle: 1, steer: 0.35 }, 8, (c) => {
    hardest = Math.max(hardest, c.impact);
    assert.ok(Math.abs(c.lateral) <= track.wallOffset - CAR.bodyRadius + 1e-6);
  });
  assert.ok(hardest > 2, 'the car never reached a wall');
  assert.ok(finite(car));
});

test('hard wall hits add damage that slows the car until it is repaired', () => {
  const car = createCar(track);
  drive(car, { ...IDLE_INPUT, throttle: 1, steer: 0.35 }, 8);
  assert.ok(car.damage > 0.05 && car.damage <= 1, `damage ${car.damage}`);
  assert.ok(Math.abs(Math.hypot(car.impactNx, car.impactNz) - 1) < 1e-6);
  const wrecked = createCar(track);
  wrecked.damage = 1;
  drive(wrecked, { ...IDLE_INPUT, throttle: 1 }, 3);
  const fresh = createCar(track);
  drive(fresh, { ...IDLE_INPUT, throttle: 1 }, 3);
  assert.ok(wrecked.speed < fresh.speed - 2);
  repairCar(wrecked);
  assert.equal(wrecked.damage, 0);
});

test('a light brush with the wall does no damage', () => {
  const car = createCar(track);
  const sample = sampleAt(track, car.trackIndex);
  const reach = track.wallOffset - CAR.bodyRadius - 0.1;
  car.x = sample.x + sample.nx * reach;
  car.z = sample.z + sample.nz * reach;
  car.lateral = reach;
  car.vx = sample.nx * (CAR.damageFreeImpact - 1);
  car.vz = sample.nz * (CAR.damageFreeImpact - 1);
  let hardest = 0;
  drive(car, IDLE_INPUT, 0.5, (c) => { hardest = Math.max(hardest, c.impact); });
  assert.ok(hardest > 1 && hardest < CAR.damageFreeImpact, `impact ${hardest}`);
  assert.equal(car.damage, 0);
});

test('boost drains while held and lifts the top speed', () => {
  const car = createCar(track);
  car.boost = 1;
  drive(car, { ...IDLE_INPUT, throttle: 1, boost: true }, 2);
  assert.ok(car.boost < 0.5);
  const boosted = car.speed;
  const plain = createCar(track);
  drive(plain, { ...IDLE_INPUT, throttle: 1 }, 2);
  assert.ok(boosted > plain.speed + 4);
});

test('resetting puts the car back on the centre line at rest', () => {
  const car = createCar(track);
  drive(car, { ...IDLE_INPUT, throttle: 1, steer: 0.35 }, 6);
  resetToTrack(car, track);
  assert.equal(car.speed, 0);
  assert.equal(car.lateral, 0);
});

test('gears shift up with speed and hold through small dips', () => {
  assert.equal(gearFor(0, 0), 0);
  assert.equal(gearFor(30, 0), 2);
  assert.equal(gearFor(24, 2), 2);
  assert.equal(gearFor(18, 2), 1);
});
