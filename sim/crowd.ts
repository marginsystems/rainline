import { createBody, FLAT_TERRAIN, placeBody, pointVelocity, settle, stepBody, touching, vec, wake, type BoxBody, type Terrain } from './body.ts';
import { bankHit, type Traffic, type TrafficRandom } from './traffic.ts';

export const CROWD = {
  shoulderInsideWall: 0.75,
  spawnAhead: [90, 520],
  firstSpawnAhead: [25, 520],
  dropBehind: 45,
  half: [0.3, 0.88, 0.18],
  mass: 0.08,
  kickAlong: 1.5,
  kickReach: [-0.4, 3.3],
  kickSideSpeed: 12,
  kickLift: 11.5,
  kickForward: 4,
  kickSpin: [6.5, 3, -8],
  struckFrom: 2.5,
  struckLift: 6,
  struckSpin: 7,
  riderHalfWidth: 0.45,
  riderHalfLength: 1.1,
  ridden: 0.7,
  points: 250,
  restSeconds: 9,
  longestSeconds: 22,
  sunkBelow: -9,
} as const;

export interface Walker {
  readonly pace: number;
  distance: number;
  side: 1 | -1;
  flying: boolean;
  flightSeconds: number;
  readonly body: BoxBody;
}

export interface Crowd {
  readonly walkers: Walker[];
  readonly shoulder: number;
}

export type BonkCause = 'kick' | 'wreck' | 'ridden';

export interface Bonk {
  readonly walker: Walker;
  readonly points: number;
  readonly combo: number;
  readonly cause: BonkCause;
}

export interface CrowdRider {
  readonly distance: number;
  readonly lateral: number;
  readonly forwardSpeed: number;
}

const lateralOf = (crowd: Crowd, walker: Walker): number => walker.side * crowd.shoulder;

function stand(crowd: Crowd, walker: Walker): void {
  const body = walker.body;
  body.position.x = lateralOf(crowd, walker);
  body.position.y = body.half.y;
  body.position.z = walker.distance;
  body.velocity.x = 0;
  body.velocity.y = 0;
  body.velocity.z = walker.pace;
}

function place(crowd: Crowd, walker: Walker, riderDistance: number, range: readonly [number, number], random: TrafficRandom): void {
  walker.distance = riderDistance + range[0] + (range[1] - range[0]) * random();
  walker.side = random() < 0.5 ? -1 : 1;
  walker.flying = false;
  walker.flightSeconds = 0;
  placeBody(walker.body, lateralOf(crowd, walker), walker.distance, walker.pace);
}

export function createCrowd(paces: readonly number[], wallOffset: number, riderDistance: number, random: TrafficRandom): Crowd {
  const crowd: Crowd = { walkers: [], shoulder: wallOffset - CROWD.shoulderInsideWall };
  for (const pace of paces) {
    const walker: Walker = { pace, distance: 0, side: 1, flying: false, flightSeconds: 0, body: createBody(vec(...CROWD.half), CROWD.mass) };
    crowd.walkers.push(walker);
    place(crowd, walker, riderDistance, CROWD.firstSpawnAhead, random);
  }
  return crowd;
}

export function resetCrowd(crowd: Crowd, riderDistance: number, random: TrafficRandom): void {
  for (const walker of crowd.walkers) place(crowd, walker, riderDistance, CROWD.firstSpawnAhead, random);
}

function fly(walker: Walker): void {
  walker.flying = true;
  walker.flightSeconds = 0;
  wake(walker.body);
}

function bonk(traffic: Traffic, walker: Walker, cause: BonkCause): Bonk {
  return { walker, ...bankHit(traffic, CROWD.points), cause };
}

export function kickCrowd(crowd: Crowd, traffic: Traffic, rider: CrowdRider, side: 1 | -1): Bonk | null {
  let nearest: Walker | null = null, nearestGap = Number.POSITIVE_INFINITY;
  for (const walker of crowd.walkers) {
    if (walker.flying && !walker.body.resting) continue;
    if (Math.abs(walker.body.position.z - rider.distance) > CROWD.half[2] + CROWD.kickAlong) continue;
    const gap = (walker.body.position.x - rider.lateral) * side - CROWD.half[0];
    if (gap < CROWD.kickReach[0] || gap > CROWD.kickReach[1] || gap >= nearestGap) continue;
    nearest = walker;
    nearestGap = gap;
  }
  if (!nearest) return null;
  fly(nearest);
  const body = nearest.body;
  body.velocity.x = side * CROWD.kickSideSpeed;
  body.velocity.y = CROWD.kickLift;
  body.velocity.z = Math.max(rider.forwardSpeed, 0) + CROWD.kickForward;
  body.spin.x = CROWD.kickSpin[0];
  body.spin.y = side * CROWD.kickSpin[1];
  body.spin.z = side * CROWD.kickSpin[2];
  return bonk(traffic, nearest, 'kick');
}

function struckByWreck(traffic: Traffic, walker: Walker): boolean {
  for (const vehicle of traffic.vehicles) {
    if (!vehicle.flying || vehicle.body.resting) continue;
    const hit = touching(vehicle.body, walker.body);
    if (!hit) continue;
    const moving = pointVelocity(vehicle.body, hit.point);
    if (Math.hypot(moving.x, moving.y, moving.z - walker.pace) < CROWD.struckFrom) continue;
    fly(walker);
    walker.body.velocity.x = moving.x;
    walker.body.velocity.y = Math.max(moving.y, 0) + CROWD.struckLift;
    walker.body.velocity.z = moving.z;
    walker.body.spin.x = CROWD.struckSpin;
    walker.body.spin.z = -Math.sign(moving.x || 1) * CROWD.struckSpin;
    return true;
  }
  return false;
}

function riddenInto(walker: Walker, rider: CrowdRider): boolean {
  if (rider.forwardSpeed <= walker.pace + CROWD.struckFrom) return false;
  if (Math.abs(walker.body.position.z - rider.distance) > CROWD.half[2] + CROWD.riderHalfLength) return false;
  const across = walker.body.position.x - rider.lateral;
  if (Math.abs(across) > CROWD.half[0] + CROWD.riderHalfWidth) return false;
  fly(walker);
  walker.body.velocity.x = Math.sign(across || walker.side) * CROWD.kickSideSpeed * CROWD.ridden;
  walker.body.velocity.y = CROWD.kickLift;
  walker.body.velocity.z = rider.forwardSpeed + CROWD.kickForward;
  walker.body.spin.x = CROWD.kickSpin[0];
  return true;
}

export function stepCrowd(crowd: Crowd, traffic: Traffic, rider: CrowdRider, dt: number, random: TrafficRandom, terrain: Terrain = FLAT_TERRAIN): Bonk[] {
  const bonks: Bonk[] = [];
  for (const walker of crowd.walkers) {
    if (walker.flying) {
      stepBody(walker.body, terrain, dt);
      walker.flightSeconds += dt;
      walker.distance = walker.body.position.z;
    } else {
      walker.distance += walker.pace * dt;
      settle(walker.body);
      stand(crowd, walker);
      if (struckByWreck(traffic, walker)) bonks.push(bonk(traffic, walker, 'wreck'));
      else if (riddenInto(walker, rider)) bonks.push(bonk(traffic, walker, 'ridden'));
    }
    const ahead = walker.distance - rider.distance;
    const settled = walker.flying && walker.flightSeconds > CROWD.restSeconds && ahead < 0;
    const gone = ahead < -CROWD.dropBehind || ahead > CROWD.spawnAhead[1] * 1.4 || settled || walker.flightSeconds > CROWD.longestSeconds || walker.body.position.y < CROWD.sunkBelow;
    if (gone) place(crowd, walker, rider.distance, CROWD.spawnAhead, random);
  }
  return bonks;
}
