import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bumpedVehicle, bumpRider, createTraffic, kickTraffic, stepTraffic, TRAFFIC, VEHICLES, type Traffic, type Vehicle } from './traffic.ts';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const STEP = 1 / 60;

function lone(kind: Vehicle['kind'], distance: number, lateral: number): Traffic {
  const traffic = createTraffic(0, seeded(3));
  traffic.vehicles.length = 1;
  const vehicle = traffic.vehicles[0];
  if (!vehicle) throw new Error('no vehicle');
  Object.assign(vehicle, { kind, distance, lateral, speed: 18, flying: false });
  return traffic;
}

test('traffic starts ahead of the rider, in lanes, with no two vehicles overlapping', () => {
  const traffic = createTraffic(100, seeded(1));
  assert.equal(traffic.vehicles.length, TRAFFIC.count);
  for (const vehicle of traffic.vehicles) {
    assert.ok(vehicle.distance > 100 + TRAFFIC.riderHalfLength + VEHICLES[vehicle.kind].length / 2);
    assert.ok(TRAFFIC.lanes.includes(vehicle.lateral as (typeof TRAFFIC.lanes)[number]));
  }
  for (const a of traffic.vehicles) for (const b of traffic.vehicles) {
    if (a === b || a.lateral !== b.lateral) continue;
    assert.ok(Math.abs(a.distance - b.distance) > (VEHICLES[a.kind].length + VEHICLES[b.kind].length) / 2);
  }
});

test('a kick only reaches a vehicle beside the rider on the side that was kicked', () => {
  const beside = lone('bus', 50, 1.85);
  assert.equal(kickTraffic(beside, 50, -1.2, -1), null);
  assert.equal(kickTraffic(beside, 20, -1.2, 1), null);
  assert.equal(kickTraffic(lone('bus', 50, 5.55), 50, -5, 1), null);
  const hit = kickTraffic(beside, 50, -1.2, 1);
  assert.ok(hit && hit.vehicle.flying && hit.vehicle.sideSpeed > 0);
  assert.equal(hit.points, VEHICLES.bus.points);
});

test('a kicked vehicle flies up and off the road, then comes back as fresh traffic ahead', () => {
  const traffic = lone('car', 50, 1.85);
  kickTraffic(traffic, 50, 0, 1);
  const vehicle = traffic.vehicles[0];
  if (!vehicle) throw new Error('no vehicle');
  let peak = 0, farthest = 0;
  for (let t = 0; t < TRAFFIC.flightSeconds - 0.1; t += STEP) {
    stepTraffic(traffic, 50, STEP, seeded(5));
    peak = Math.max(peak, vehicle.height);
    farthest = Math.max(farthest, vehicle.lateral);
  }
  assert.ok(peak > 2 && farthest > 12, `peak ${peak}, sideways ${farthest}`);
  for (let i = 0; i < 30; i++) stepTraffic(traffic, 50, STEP, seeded(5));
  assert.ok(!vehicle.flying && vehicle.height === 0 && vehicle.distance > 50 + TRAFFIC.spawnAhead[0]);
});

test('kicks in quick succession build a combo that multiplies the points, and it lapses', () => {
  const traffic = lone('car', 50, 1.85);
  const first = kickTraffic(traffic, 50, 0, 1);
  const second = traffic.vehicles[0];
  if (!second) throw new Error('no vehicle');
  Object.assign(second, { flying: false, distance: 50, lateral: -1.85 });
  const next = kickTraffic(traffic, 50, 0, -1);
  assert.equal(first?.combo, 1);
  assert.equal(next?.points, VEHICLES.car.points * 2);
  Object.assign(second, { flying: false });
  for (let t = 0; t < TRAFFIC.comboSeconds + 0.1; t += STEP) stepTraffic(traffic, 50, STEP, seeded(5));
  assert.equal(traffic.combo, 0);
});

test('a flying vehicle knocks the one in the next lane off the road too', () => {
  const traffic = lone('car', 50, 1.85);
  const neighbour: Vehicle = { ...(traffic.vehicles[0] as Vehicle), kind: 'bus', lateral: 5.55 };
  traffic.vehicles.push(neighbour);
  kickTraffic(traffic, 50, 0, 1);
  const launches = [];
  for (let i = 0; i < 30; i++) launches.push(...stepTraffic(traffic, 50, STEP, seeded(5)));
  assert.equal(launches.length, 1);
  assert.ok(launches[0]?.domino && neighbour.flying);
  assert.equal(launches[0]?.points, VEHICLES.bus.points * 2);
});

test('riding into the back of a vehicle counts as a bump, riding beside it does not', () => {
  assert.ok(bumpedVehicle(lone('truck', 50, 1.85), 47, 1.5));
  assert.equal(bumpedVehicle(lone('truck', 50, 1.85), 47, -1.2), null);
  assert.equal(bumpedVehicle(lone('truck', 50, 1.85), 30, 1.85), null);
});

test('riding into slower traffic drops the rider just below its pace and nudges it once, and a slower rider is left alone', () => {
  const traffic = lone('truck', 50, 1.85);
  const truck = traffic.vehicles[0] as Vehicle;
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

test('traffic queues behind slower traffic in its lane and never drives through it', () => {
  const traffic = lone('car', 50, 1.85);
  const slow: Vehicle = { ...(traffic.vehicles[0] as Vehicle), distance: 70, speed: 13 };
  traffic.vehicles.push(slow);
  const fast = traffic.vehicles[0] as Vehicle;
  fast.speed = 23;
  for (let i = 0; i < 600; i++) stepTraffic(traffic, 55, STEP, seeded(5));
  assert.ok(slow.distance - fast.distance > VEHICLES.car.length);
});
