import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lowestPoint, rotate, vec, type Terrain } from './body.ts';
import { bumpedVehicle, bumpRider, createTraffic, createVehicle, kickTraffic, ramTraffic, stepTraffic, TRAFFIC, VEHICLES, type Rammer, type Traffic, type Vehicle } from './traffic.ts';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const STEP = 1 / 120;

function road(...vehicles: Vehicle[]): Traffic {
  return { vehicles, riderDistance: 0, riderSpeed: 0, combo: 0, comboSeconds: 0, kicked: 0 };
}

const lone = (kind: Vehicle['kind'], distance: number, lateral: number): Traffic => road(createVehicle(kind, distance, lateral, 18));

function only(traffic: Traffic): Vehicle {
  const vehicle = traffic.vehicles[0];
  if (!vehicle) throw new Error('no vehicle');
  return vehicle;
}

test('traffic starts around the rider, in lanes, clear of the rider and with no two vehicles overlapping', () => {
  const traffic = createTraffic(100, seeded(1));
  assert.equal(traffic.vehicles.length, TRAFFIC.count);
  assert.ok(traffic.vehicles.some((vehicle) => vehicle.distance < 100) && traffic.vehicles.some((vehicle) => vehicle.distance > 100 && vehicle.distance < 160));
  for (const vehicle of traffic.vehicles) {
    assert.ok(Math.abs(vehicle.distance - 100) >= TRAFFIC.clearOfRider);
    assert.ok(TRAFFIC.lanes.includes(vehicle.lateral as (typeof TRAFFIC.lanes)[number]));
    assert.equal(vehicle.body.position.z, vehicle.distance);
  }
  for (const a of traffic.vehicles) for (const b of traffic.vehicles) {
    if (a === b || a.lateral !== b.lateral) continue;
    assert.ok(Math.abs(a.distance - b.distance) > (VEHICLES[a.kind].length + VEHICLES[b.kind].length) / 2);
  }
  assert.equal(createTraffic(100, seeded(1), 12).vehicles.length, 12);
});

test('the road around the rider never runs empty, whether the rider is crawling or flat out', () => {
  for (const speed of [0, 8, 30, 68]) {
    const traffic = createTraffic(0, seeded(4));
    let rider = 0, emptiest = Number.POSITIVE_INFINITY;
    for (let t = 0; t < 90; t += STEP) {
      rider += speed * STEP;
      stepTraffic(traffic, rider, STEP, seeded(Math.floor(t * 1000)));
      if (t > 10) emptiest = Math.min(emptiest, traffic.vehicles.filter((vehicle) => Math.abs(vehicle.distance - rider) < 150).length);
    }
    assert.ok(emptiest >= 3, `at ${speed} m/s only ${emptiest} vehicles within 150 m`);
  }
});

test('a kick only reaches a vehicle beside the rider on the side that was kicked', () => {
  const beside = lone('bus', 50, 1.85);
  assert.equal(kickTraffic(beside, 50, -1.2, -1), null);
  assert.equal(kickTraffic(beside, 20, -1.2, 1), null);
  assert.equal(kickTraffic(lone('bus', 50, 5.55), 50, -5, 1), null);
  const hit = kickTraffic(beside, 50, -1.2, 1);
  assert.ok(hit && hit.vehicle.flying && hit.vehicle.body.velocity.x > 0);
  assert.equal(hit.points, VEHICLES.bus.points);
});

test('a kicked car tumbles off the road, never sinks into the ground, and lies there as a wreck', () => {
  const traffic = lone('car', 50, 1.85);
  const car = only(traffic);
  kickTraffic(traffic, 50, 0, 1);
  let peak = 0, deepest = 0, leastUp = 1;
  for (let t = 0; t < 8; t += STEP) {
    stepTraffic(traffic, 50, STEP, seeded(5));
    peak = Math.max(peak, car.body.position.y);
    deepest = Math.min(deepest, lowestPoint(car.body));
    leastUp = Math.min(leastUp, rotate(car.body.rotation, vec(0, 1, 0)).y);
  }
  assert.ok(car.flying, 'the wreck was cleared too early');
  assert.ok(peak > 2 && car.lateral > 10, `peak ${peak}, sideways ${car.lateral}`);
  assert.ok(deepest > -0.1, `sank ${deepest} into the road`);
  assert.ok(leastUp < 0.2, 'it never rolled');
  assert.ok(car.body.resting, 'it never came to rest');
});

test('a kicked bus goes less far than a kicked car, but still flies', () => {
  const car = lone('car', 50, 1.85), bus = lone('bus', 50, 1.85);
  kickTraffic(car, 50, -1, 1);
  kickTraffic(bus, 50, -1, 1);
  for (let t = 0; t < 0.4; t += STEP) {
    stepTraffic(car, 50, STEP, seeded(5));
    stepTraffic(bus, 50, STEP, seeded(5));
  }
  assert.ok(only(bus).lateral < only(car).lateral && only(bus).lateral > 4);
});

test('a kicked vehicle lands on the hillside instead of disappearing into it', () => {
  const hill: Terrain = { height: (_along, lateral) => (lateral > 11 ? Math.min(30, (lateral - 11) * 0.65) : 0), barrier: () => ({ at: 9.6, top: 0.8, depth: 1.2 }) };
  const traffic = lone('van', 50, 5.55);
  const van = only(traffic);
  kickTraffic(traffic, 50, 3, 1);
  let worst = 0;
  for (let t = 0; t < 6; t += STEP) {
    stepTraffic(traffic, 50, STEP, seeded(5), hill);
    worst = Math.min(worst, van.body.position.y - hill.height(van.body.position.z, van.body.position.x));
  }
  assert.ok(worst > -0.2, `its centre went ${worst} into the hill`);
});

test('a wreck is cleared once the rider is well past it, and the vehicle returns as fresh traffic ahead', () => {
  const traffic = lone('car', 50, 1.85);
  kickTraffic(traffic, 50, 0, 1);
  const car = only(traffic);
  for (let t = 0; t < 1; t += STEP) stepTraffic(traffic, 50, STEP, seeded(5));
  assert.ok(car.flying);
  stepTraffic(traffic, car.distance + TRAFFIC.dropBehind + 1, STEP, seeded(5));
  assert.ok(!car.flying && car.body.position.y === car.body.half.y && car.distance > TRAFFIC.spawnAhead[0]);
});

test('kicks in quick succession build a combo that multiplies the points, and it lapses', () => {
  const traffic = road(createVehicle('car', 50, 1.85, 18), createVehicle('car', 50, -1.85, 18));
  const first = kickTraffic(traffic, 50, 0, 1);
  const next = kickTraffic(traffic, 50, 0, -1);
  assert.equal(first?.combo, 1);
  assert.equal(next?.points, VEHICLES.car.points * 2);
  for (let t = 0; t < TRAFFIC.comboSeconds + 0.1; t += STEP) stepTraffic(traffic, 50, STEP, seeded(5));
  assert.equal(traffic.combo, 0);
});

test('a kicked car knocks the bus in the next lane over, and the bus counts as a domino', () => {
  const car = createVehicle('car', 50, 1.85, 18), bus = createVehicle('bus', 50, 5.55, 18);
  const traffic = road(car, bus);
  kickTraffic(traffic, 50, 0, 1);
  const launches = [];
  for (let t = 0; t < 0.6; t += STEP) launches.push(...stepTraffic(traffic, 50, STEP, seeded(5)));
  assert.equal(launches.length, 1);
  assert.ok(launches[0]?.domino && bus.flying);
  assert.equal(launches[0]?.points, VEHICLES.bus.points * 2);
  assert.ok(bus.body.velocity.x > 0 || bus.lateral > 5.6, 'the bus was not pushed away from the car');
});

test('traffic brakes for a wreck lying in its lane', () => {
  const wreck = createVehicle('car', 100, 1.85, 0);
  const traffic = road(wreck, createVehicle('van', 60, 1.85, 20));
  wreck.flying = true;
  wreck.body.resting = true;
  const van = traffic.vehicles[1] as Vehicle;
  for (let t = 0; t < 6; t += STEP) stepTraffic(traffic, 0, STEP, seeded(5));
  assert.ok(van.pace < 1, `still doing ${van.pace}`);
  assert.ok(van.distance < 100, 'drove through the wreck');
});

test('riding into the back of a vehicle counts as a bump, riding beside it does not', () => {
  assert.ok(bumpedVehicle(lone('truck', 50, 1.85), 47, 1.5));
  assert.equal(bumpedVehicle(lone('truck', 50, 1.85), 47, -1.2), null);
  assert.equal(bumpedVehicle(lone('truck', 50, 1.85), 30, 1.85), null);
});

test('riding into slower traffic drops the rider just below its pace and nudges it once, and a slower rider is left alone', () => {
  const traffic = lone('truck', 50, 1.85);
  const truck = only(traffic);
  truck.pace = 18;
  const rider = { distance: 47, lateral: 1.5, forwardSpeed: 40, speed: 40, vx: 0, vz: 40 };
  assert.equal(bumpRider(traffic, rider), truck);
  assert.ok(Math.abs(rider.vz - 18 * TRAFFIC.bumpKeep) < 1e-9 && rider.vx === 0);
  assert.equal(truck.shove, TRAFFIC.bumpShove);
  const before = truck.distance;
  stepTraffic(traffic, 47, STEP, seeded(5));
  assert.ok(Math.abs(truck.distance - before - (18 + TRAFFIC.bumpShove) * STEP) < 1e-9);
  assert.equal(truck.shove, 0);
  const slow = { distance: 47, lateral: 1.5, forwardSpeed: 10, speed: 10, vx: 0, vz: 10 };
  assert.equal(bumpRider(traffic, slow), null);
  assert.equal(slow.vz, 10);
  const clear = { distance: 47, lateral: -1.2, forwardSpeed: 40, speed: 40, vx: 0, vz: 40 };
  assert.equal(bumpRider(traffic, clear), null);
});

test('ramming a car shoves it on as a wreck and costs the rammer speed, and a bus costs far more', () => {
  const hit = (kind: Vehicle['kind']): { rammer: Rammer; traffic: Traffic } => {
    const traffic = lone(kind, 50 + VEHICLES[kind].length / 2 + 0.8, 1.85);
    const rammer = { distance: 50, lateral: 1.85, tx: 0, tz: 1, mass: 1.5, halfWidth: 0.85, vx: 0, vz: 45 };
    const ram = ramTraffic(traffic, rammer, false);
    assert.ok(ram && ram.impact > 20 && ram.nz > 0.5, `ram ${JSON.stringify(ram)}`);
    return { rammer, traffic };
  };
  const car = hit('car'), bus = hit('bus');
  assert.ok(only(car.traffic).flying && only(car.traffic).body.velocity.z > 25);
  assert.ok(car.rammer.vz < 40 && bus.rammer.vz < car.rammer.vz, `after a car ${car.rammer.vz}, after a bus ${bus.rammer.vz}`);
  const traffic = lone('car', 70, 1.85);
  assert.equal(ramTraffic(traffic, { distance: 50, lateral: 1.85, tx: 0, tz: 1, mass: 1.5, halfWidth: 0.85, vx: 0, vz: 45 }, false), null);
  assert.equal(ramTraffic(lone('car', 52, 1.85), { distance: 50, lateral: 1.85, tx: 0, tz: 1, mass: 1.5, halfWidth: 0.85, vx: 0, vz: 45 }, true), null);
});

test('traffic queues behind slower traffic in its lane and never drives through it', () => {
  const fast = createVehicle('car', 50, 1.85, 23), slow = createVehicle('car', 70, 1.85, 13);
  const traffic = road(fast, slow);
  for (let i = 0; i < 1200; i++) stepTraffic(traffic, 55, STEP, seeded(5));
  assert.ok(slow.distance - fast.distance > VEHICLES.car.length);
});
