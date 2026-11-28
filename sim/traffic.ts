import { applyImpulse, collide, createBody, FLAT_TERRAIN, placeBody, settle, stepBody, touching, vec, wake, type BoxBody, type Terrain } from './body.ts';
import { clamp } from './math.ts';

export type VehicleKind = 'car' | 'van' | 'truck' | 'bus';

export interface VehicleShape {
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly mass: number;
  readonly points: number;
  readonly share: number;
}

export const VEHICLES: Record<VehicleKind, VehicleShape> = {
  car: { length: 4.9, width: 1.9, height: 1.5, mass: 1.4, points: 100, share: 0.5 },
  van: { length: 5, width: 2.3, height: 2.1, mass: 2.3, points: 150, share: 0.22 },
  truck: { length: 6, width: 2.6, height: 2.85, mass: 6, points: 300, share: 0.16 },
  bus: { length: 10.5, width: 2.56, height: 2.6, mass: 11, points: 500, share: 0.12 },
};

export const TRAFFIC = {
  count: 38,
  lightCount: 20,
  lanes: [-5.55, -1.85, 1.85, 5.55],
  overtakingLanes: [-5.55, 5.55],
  spawnAhead: [130, 560],
  firstSpawnAhead: [-70, 560],
  spawnBehind: [-70, -30],
  clearOfRider: 12,
  outrunAhead: 320,
  outrunMargin: 2,
  riderSpeedRate: 4,
  fastestRider: 120,
  dropBehind: 70,
  speeds: [13, 23],
  laneGap: 14,
  followGap: 9,
  accel: 4,
  wreckBrakeGap: 28,
  wreckBrake: 9,
  kickAlong: 1.7,
  kickSideGap: [-0.3, 3.3],
  kickSideSpeed: 15,
  kickLift: 9.5,
  kickForward: 5,
  kickHeft: 0.18,
  kickRoll: 4.5,
  kickYaw: 1.6,
  kickPitch: 0.7,
  dominoFrom: 3,
  dominoLift: 4.5,
  dominoRoll: 2.5,
  wreckSeconds: 14,
  wreckLongestSeconds: 30,
  wreckBehindRider: 15,
  sunkBelow: -9,
  comboSeconds: 2.5,
  riderHalfWidth: 0.45,
  riderHalfLength: 1,
  riderHalfHeight: 0.75,
  rammer: { rider: { mass: 3, halfWidth: 0.45 }, car: { mass: 1.5, halfWidth: 0.85 } },
  bumpKeep: 0.85,
  bumpShove: 5,
  slowestBumpSpeed: 0.01,
  palettes: 60,
} as const;

export interface Vehicle {
  kind: VehicleKind;
  distance: number;
  lateral: number;
  speed: number;
  pace: number;
  shove: number;
  flying: boolean;
  wreckSeconds: number;
  palette: number;
  readonly body: BoxBody;
}

export interface Traffic {
  readonly vehicles: Vehicle[];
  riderDistance: number;
  riderSpeed: number;
  combo: number;
  comboSeconds: number;
  kicked: number;
}

export type TrafficRandom = () => number;

export interface Launch {
  readonly vehicle: Vehicle;
  readonly points: number;
  readonly combo: number;
  readonly domino: boolean;
}

const KINDS: readonly VehicleKind[] = ['car', 'van', 'truck', 'bus'];

function pickKind(random: TrafficRandom): VehicleKind {
  let roll = random();
  for (const kind of KINDS) {
    roll -= VEHICLES[kind].share;
    if (roll <= 0) return kind;
  }
  return 'car';
}

const alongGap = (a: Vehicle, b: Vehicle): number => Math.abs(a.distance - b.distance) - (VEHICLES[a.kind].length + VEHICLES[b.kind].length) / 2;

function shapeBody(vehicle: Vehicle): void {
  const shape = VEHICLES[vehicle.kind];
  vehicle.body.half.x = shape.width / 2;
  vehicle.body.half.y = shape.height / 2;
  vehicle.body.half.z = shape.length / 2;
  vehicle.body.mass = shape.mass;
}

function hold(vehicle: Vehicle): void {
  const body = vehicle.body;
  body.position.x = vehicle.lateral;
  body.position.y = body.half.y;
  body.position.z = vehicle.distance;
  body.velocity.x = 0;
  body.velocity.y = 0;
  body.velocity.z = vehicle.pace + vehicle.shove;
}

function place(traffic: Traffic, vehicle: Vehicle, riderDistance: number, range: readonly [number, number], random: TrafficRandom): void {
  vehicle.kind = pickKind(random);
  vehicle.speed = TRAFFIC.speeds[0] + (TRAFFIC.speeds[1] - TRAFFIC.speeds[0]) * random();
  vehicle.pace = vehicle.speed;
  vehicle.shove = 0;
  vehicle.palette = Math.floor(random() * TRAFFIC.palettes);
  vehicle.flying = false;
  vehicle.wreckSeconds = 0;
  for (let attempt = 0; attempt < 24; attempt++) {
    vehicle.distance = riderDistance + range[0] + (range[1] - range[0]) * random();
    const lanes = vehicle.distance < riderDistance ? TRAFFIC.overtakingLanes : TRAFFIC.lanes;
    vehicle.lateral = lanes[Math.floor(random() * lanes.length)] ?? 0;
    if (Math.abs(vehicle.distance - riderDistance) < TRAFFIC.clearOfRider) continue;
    const crowded = traffic.vehicles.some((other) => other !== vehicle && !other.flying && other.lateral === vehicle.lateral && alongGap(vehicle, other) < TRAFFIC.laneGap);
    if (!crowded) break;
  }
  shapeBody(vehicle);
  placeBody(vehicle.body, vehicle.lateral, vehicle.distance, vehicle.pace);
}

export function createVehicle(kind: VehicleKind, distance: number, lateral: number, speed: number): Vehicle {
  const shape = VEHICLES[kind];
  const vehicle: Vehicle = { kind, distance, lateral, speed, pace: speed, shove: 0, flying: false, wreckSeconds: 0, palette: 0, body: createBody(vec(shape.width / 2, shape.height / 2, shape.length / 2), shape.mass) };
  placeBody(vehicle.body, lateral, distance, speed);
  return vehicle;
}

export function createTraffic(riderDistance: number, random: TrafficRandom, count: number = TRAFFIC.count): Traffic {
  const traffic: Traffic = { vehicles: [], riderDistance, riderSpeed: 0, combo: 0, comboSeconds: 0, kicked: 0 };
  for (let i = 0; i < count; i++) {
    const vehicle = createVehicle('car', 0, 0, 0);
    traffic.vehicles.push(vehicle);
    place(traffic, vehicle, riderDistance, TRAFFIC.firstSpawnAhead, random);
  }
  return traffic;
}

export interface Banked {
  readonly points: number;
  readonly combo: number;
}

export function bankHit(traffic: Traffic, points: number): Banked {
  traffic.combo += 1;
  traffic.comboSeconds = TRAFFIC.comboSeconds;
  traffic.kicked += 1;
  return { points: points * traffic.combo, combo: traffic.combo };
}

function score(traffic: Traffic, vehicle: Vehicle, domino: boolean): Launch {
  return { vehicle, ...bankHit(traffic, VEHICLES[vehicle.kind].points), domino };
}

function setFlying(vehicle: Vehicle): void {
  if (!vehicle.flying) hold(vehicle);
  vehicle.flying = true;
  vehicle.wreckSeconds = 0;
  wake(vehicle.body);
}

const heft = (kind: VehicleKind): number => (VEHICLES.car.mass / VEHICLES[kind].mass) ** TRAFFIC.kickHeft;

export function kickTraffic(traffic: Traffic, riderDistance: number, riderLateral: number, side: 1 | -1): Launch | null {
  let nearest: Vehicle | null = null, nearestGap = Number.POSITIVE_INFINITY;
  for (const vehicle of traffic.vehicles) {
    if (vehicle.flying && !vehicle.body.resting) continue;
    const shape = VEHICLES[vehicle.kind];
    if (Math.abs(vehicle.distance - riderDistance) > shape.length / 2 + TRAFFIC.kickAlong) continue;
    const gap = (vehicle.lateral - riderLateral) * side - shape.width / 2;
    if (gap < TRAFFIC.kickSideGap[0] || gap > TRAFFIC.kickSideGap[1] || gap >= nearestGap) continue;
    nearest = vehicle;
    nearestGap = gap;
  }
  if (!nearest) return null;
  const forward = nearest.flying ? 0 : nearest.pace;
  setFlying(nearest);
  const lift = heft(nearest.kind), body = nearest.body;
  body.velocity.x = side * TRAFFIC.kickSideSpeed * lift;
  body.velocity.y = TRAFFIC.kickLift * lift;
  body.velocity.z = forward + TRAFFIC.kickForward;
  body.spin.x = TRAFFIC.kickPitch;
  body.spin.y = side * TRAFFIC.kickYaw;
  body.spin.z = -side * TRAFFIC.kickRoll * lift;
  return score(traffic, nearest, false);
}

export function bumpedVehicle(traffic: Traffic, riderDistance: number, riderLateral: number): Vehicle | null {
  for (const vehicle of traffic.vehicles) {
    if (vehicle.flying) continue;
    const shape = VEHICLES[vehicle.kind];
    if (Math.abs(vehicle.distance - riderDistance) > shape.length / 2 + TRAFFIC.riderHalfLength) continue;
    if (Math.abs(vehicle.lateral - riderLateral) < shape.width / 2 + TRAFFIC.riderHalfWidth) return vehicle;
  }
  return null;
}

export interface BumpableRider {
  readonly distance: number;
  readonly lateral: number;
  readonly forwardSpeed: number;
  readonly speed: number;
  vx: number;
  vz: number;
}

export function bumpRider(traffic: Traffic, rider: BumpableRider): Vehicle | null {
  const bumped = bumpedVehicle(traffic, rider.distance, rider.lateral);
  if (!bumped || rider.forwardSpeed <= bumped.pace) return null;
  const keep = (bumped.pace * TRAFFIC.bumpKeep) / Math.max(rider.speed, TRAFFIC.slowestBumpSpeed);
  rider.vx *= keep;
  rider.vz *= keep;
  bumped.shove = TRAFFIC.bumpShove;
  return bumped;
}

export interface Rammer {
  readonly distance: number;
  readonly lateral: number;
  readonly tx: number;
  readonly tz: number;
  readonly mass: number;
  readonly halfWidth: number;
  vx: number;
  vz: number;
}

export interface Ram {
  readonly vehicle: Vehicle;
  readonly impact: number;
  readonly nx: number;
  readonly nz: number;
}

const rammerBody = createBody(vec(TRAFFIC.riderHalfWidth, TRAFFIC.riderHalfHeight, TRAFFIC.riderHalfLength), 1);

export function ramTraffic(traffic: Traffic, rammer: Rammer, wrecksOnly: boolean): Ram | null {
  const nx = rammer.tz, nz = -rammer.tx;
  const along = rammer.vx * rammer.tx + rammer.vz * rammer.tz, across = rammer.vx * nx + rammer.vz * nz;
  rammerBody.mass = rammer.mass;
  rammerBody.half.x = rammer.halfWidth;
  placeBody(rammerBody, rammer.lateral, rammer.distance, along);
  rammerBody.velocity.x = across;
  for (const vehicle of traffic.vehicles) {
    if (wrecksOnly && !vehicle.flying) continue;
    const hit = touching(rammerBody, vehicle.body);
    if (!hit) continue;
    const wasDriving = !vehicle.flying;
    if (wasDriving) setFlying(vehicle);
    const impact = collide(rammerBody, vehicle.body, hit);
    if (impact <= 0) {
      if (wasDriving) {
        vehicle.flying = false;
        hold(vehicle);
      }
      continue;
    }
    const dx = rammerBody.velocity.x - across, dz = rammerBody.velocity.z - along;
    rammer.vx += dx * nx + dz * rammer.tx;
    rammer.vz += dx * nz + dz * rammer.tz;
    const push = Math.hypot(dx, dz) || 1;
    const ox = -(dx * nx + dz * rammer.tx) / push, oz = -(dx * nz + dz * rammer.tz) / push;
    return { vehicle, impact, nx: ox, nz: oz };
  }
  return null;
}

function wreckAhead(wrecks: readonly Vehicle[], vehicle: Vehicle): boolean {
  const shape = VEHICLES[vehicle.kind];
  for (const wreck of wrecks) {
    const reach = Math.hypot(wreck.body.half.x, wreck.body.half.z);
    if (Math.abs(wreck.body.position.x - vehicle.lateral) > shape.width / 2 + reach) continue;
    const gap = wreck.body.position.z - vehicle.distance - shape.length / 2 - reach;
    if (gap > -reach && gap < TRAFFIC.wreckBrakeGap) return true;
  }
  return false;
}

function drive(traffic: Traffic, wrecks: readonly Vehicle[], vehicle: Vehicle, dt: number): void {
  let pace = Math.min(vehicle.speed, vehicle.pace + TRAFFIC.accel * dt);
  for (const other of traffic.vehicles) {
    if (other === vehicle || other.flying || other.lateral !== vehicle.lateral || other.distance <= vehicle.distance) continue;
    if (alongGap(vehicle, other) < TRAFFIC.followGap) pace = Math.min(pace, other.pace);
  }
  if (wrecks.length > 0 && wreckAhead(wrecks, vehicle)) pace = Math.min(pace, Math.max(0, vehicle.pace - TRAFFIC.wreckBrake * dt));
  vehicle.pace = pace;
  vehicle.distance += (vehicle.pace + vehicle.shove) * dt;
  settle(vehicle.body);
  hold(vehicle);
  vehicle.shove = 0;
}

function knock(traffic: Traffic, wreck: Vehicle, other: Vehicle, launches: Launch[]): void {
  const hit = touching(wreck.body, other.body);
  if (!hit) return;
  const wasDriving = !other.flying;
  if (wasDriving) setFlying(other);
  const impact = collide(wreck.body, other.body, hit);
  if (!wasDriving) return;
  if (impact < TRAFFIC.dominoFrom) {
    other.flying = false;
    other.pace = 0;
    hold(other);
    return;
  }
  const strength = clamp(impact / (TRAFFIC.dominoFrom * 3), 0.35, 1);
  const side = Math.sign(other.body.position.x - wreck.body.position.x) || 1;
  applyImpulse(other.body, other.body.position, vec(0, other.body.mass * TRAFFIC.dominoLift * strength, 0));
  other.body.spin.z -= side * TRAFFIC.dominoRoll * strength;
  launches.push(score(traffic, other, true));
}

export function stepTraffic(traffic: Traffic, riderDistance: number, dt: number, random: TrafficRandom, terrain: Terrain = FLAT_TERRAIN): Launch[] {
  const launches: Launch[] = [];
  const measured = clamp((riderDistance - traffic.riderDistance) / dt, 0, TRAFFIC.fastestRider);
  traffic.riderSpeed += (measured - traffic.riderSpeed) * Math.min(1, TRAFFIC.riderSpeedRate * dt);
  traffic.riderDistance = riderDistance;
  traffic.comboSeconds = Math.max(0, traffic.comboSeconds - dt);
  if (traffic.comboSeconds === 0) traffic.combo = 0;
  const wrecks = traffic.vehicles.filter((vehicle) => vehicle.flying);
  for (const vehicle of traffic.vehicles) {
    if (!vehicle.flying) {
      drive(traffic, wrecks, vehicle, dt);
      continue;
    }
    stepBody(vehicle.body, terrain, dt);
    vehicle.wreckSeconds += dt;
    vehicle.distance = vehicle.body.position.z;
    vehicle.lateral = vehicle.body.position.x;
  }
  const count = traffic.vehicles.length;
  for (let i = 0; i < count; i++) {
    const wreck = traffic.vehicles[i];
    if (!wreck?.flying || wreck.body.resting) continue;
    for (let j = 0; j < count; j++) {
      const other = traffic.vehicles[j];
      if (!other || other === wreck || (other.flying && !other.body.resting && j < i)) continue;
      knock(traffic, wreck, other, launches);
    }
  }
  for (const vehicle of traffic.vehicles) {
    const behind = riderDistance - vehicle.distance;
    const gone = vehicle.flying
      ? behind > TRAFFIC.dropBehind || vehicle.body.position.y < TRAFFIC.sunkBelow || vehicle.wreckSeconds > TRAFFIC.wreckLongestSeconds || (vehicle.wreckSeconds > TRAFFIC.wreckSeconds && behind > TRAFFIC.wreckBehindRider)
      : behind > TRAFFIC.dropBehind || vehicle.distance > riderDistance + TRAFFIC.spawnAhead[1] * 1.5;
    const outrun = !vehicle.flying && -behind > TRAFFIC.outrunAhead && vehicle.pace > traffic.riderSpeed + TRAFFIC.outrunMargin;
    if (outrun) place(traffic, vehicle, riderDistance, TRAFFIC.spawnBehind, random);
    else if (gone) place(traffic, vehicle, riderDistance, TRAFFIC.spawnAhead, random);
  }
  return launches;
}
