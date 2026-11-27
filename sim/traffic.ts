export type VehicleKind = 'car' | 'van' | 'truck' | 'bus';

export interface VehicleShape {
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly points: number;
  readonly share: number;
}

export const VEHICLES: Record<VehicleKind, VehicleShape> = {
  car: { length: 4.9, width: 1.9, height: 1.5, points: 100, share: 0.5 },
  van: { length: 5, width: 2.3, height: 2.1, points: 150, share: 0.22 },
  truck: { length: 6, width: 2.6, height: 2.85, points: 300, share: 0.16 },
  bus: { length: 10.5, width: 2.56, height: 2.6, points: 500, share: 0.12 },
};

export const TRAFFIC = {
  count: 38,
  lanes: [-5.55, -1.85, 1.85, 5.55],
  spawnAhead: [130, 560],
  firstSpawnAhead: [40, 560],
  dropBehind: 70,
  speeds: [13, 23],
  laneGap: 14,
  followGap: 9,
  kickAlong: 1.7,
  kickSideGap: [-0.3, 3.3],
  kickSideSpeed: 17,
  kickLift: 10.5,
  kickForward: 5,
  gravity: 21,
  rollRate: 5.5,
  yawRate: 2.4,
  flightSeconds: 3.2,
  dominoShare: 0.75,
  dominoBelowHeight: 3,
  comboSeconds: 2.5,
  riderHalfWidth: 0.45,
  riderHalfLength: 1,
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
  sideSpeed: number;
  height: number;
  rise: number;
  roll: number;
  spin: number;
  airSeconds: number;
  palette: number;
}

export interface Traffic {
  readonly vehicles: Vehicle[];
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

function place(traffic: Traffic, vehicle: Vehicle, riderDistance: number, range: readonly [number, number], random: TrafficRandom): void {
  vehicle.kind = pickKind(random);
  vehicle.speed = TRAFFIC.speeds[0] + (TRAFFIC.speeds[1] - TRAFFIC.speeds[0]) * random();
  vehicle.pace = vehicle.speed;
  vehicle.shove = 0;
  vehicle.palette = Math.floor(random() * TRAFFIC.palettes);
  vehicle.flying = false;
  vehicle.sideSpeed = 0;
  vehicle.height = 0;
  vehicle.rise = 0;
  vehicle.roll = 0;
  vehicle.spin = 0;
  vehicle.airSeconds = 0;
  for (let attempt = 0; attempt < 24; attempt++) {
    vehicle.lateral = TRAFFIC.lanes[Math.floor(random() * TRAFFIC.lanes.length)] ?? 0;
    vehicle.distance = riderDistance + range[0] + (range[1] - range[0]) * random();
    const crowded = traffic.vehicles.some((other) => other !== vehicle && !other.flying && other.lateral === vehicle.lateral && alongGap(vehicle, other) < TRAFFIC.laneGap);
    if (!crowded) return;
  }
}

export function createTraffic(riderDistance: number, random: TrafficRandom): Traffic {
  const traffic: Traffic = { vehicles: [], combo: 0, comboSeconds: 0, kicked: 0 };
  for (let i = 0; i < TRAFFIC.count; i++) {
    const vehicle: Vehicle = { kind: 'car', distance: 0, lateral: 0, speed: 0, pace: 0, shove: 0, flying: false, sideSpeed: 0, height: 0, rise: 0, roll: 0, spin: 0, airSeconds: 0, palette: 0 };
    traffic.vehicles.push(vehicle);
    place(traffic, vehicle, riderDistance, TRAFFIC.firstSpawnAhead, random);
  }
  return traffic;
}

function launch(traffic: Traffic, vehicle: Vehicle, sideSpeed: number, domino: boolean): Launch {
  vehicle.flying = true;
  vehicle.sideSpeed = sideSpeed;
  vehicle.rise = TRAFFIC.kickLift * (domino ? TRAFFIC.dominoShare : 1);
  vehicle.speed += TRAFFIC.kickForward;
  vehicle.airSeconds = 0;
  traffic.combo += 1;
  traffic.comboSeconds = TRAFFIC.comboSeconds;
  traffic.kicked += 1;
  return { vehicle, points: VEHICLES[vehicle.kind].points * traffic.combo, combo: traffic.combo, domino };
}

export function kickTraffic(traffic: Traffic, riderDistance: number, riderLateral: number, side: 1 | -1): Launch | null {
  let nearest: Vehicle | null = null, nearestGap = Number.POSITIVE_INFINITY;
  for (const vehicle of traffic.vehicles) {
    if (vehicle.flying) continue;
    const shape = VEHICLES[vehicle.kind];
    if (Math.abs(vehicle.distance - riderDistance) > shape.length / 2 + TRAFFIC.kickAlong) continue;
    const gap = (vehicle.lateral - riderLateral) * side - shape.width / 2;
    if (gap < TRAFFIC.kickSideGap[0] || gap > TRAFFIC.kickSideGap[1] || gap >= nearestGap) continue;
    nearest = vehicle;
    nearestGap = gap;
  }
  return nearest ? launch(traffic, nearest, side * TRAFFIC.kickSideSpeed, false) : null;
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

export function stepTraffic(traffic: Traffic, riderDistance: number, dt: number, random: TrafficRandom): Launch[] {
  const launches: Launch[] = [];
  traffic.comboSeconds = Math.max(0, traffic.comboSeconds - dt);
  if (traffic.comboSeconds === 0) traffic.combo = 0;
  for (const vehicle of traffic.vehicles) {
    if (vehicle.flying) {
      vehicle.airSeconds += dt;
      vehicle.lateral += vehicle.sideSpeed * dt;
      vehicle.rise -= TRAFFIC.gravity * dt;
      vehicle.height += vehicle.rise * dt;
      vehicle.roll += Math.sign(vehicle.sideSpeed) * TRAFFIC.rollRate * dt;
      vehicle.spin += TRAFFIC.yawRate * dt;
      if (vehicle.height < TRAFFIC.dominoBelowHeight) {
        for (const other of traffic.vehicles) {
          if (other.flying || alongGap(vehicle, other) > 0) continue;
          if (Math.abs(other.lateral - vehicle.lateral) > (VEHICLES[other.kind].width + VEHICLES[vehicle.kind].width) / 2) continue;
          launches.push(launch(traffic, other, vehicle.sideSpeed * TRAFFIC.dominoShare, true));
        }
      }
    } else {
      let pace = vehicle.speed;
      for (const other of traffic.vehicles) {
        if (other === vehicle || other.flying || other.lateral !== vehicle.lateral || other.distance <= vehicle.distance) continue;
        if (alongGap(vehicle, other) < TRAFFIC.followGap) pace = Math.min(pace, other.pace);
      }
      vehicle.pace = pace;
    }
    vehicle.distance += (vehicle.flying ? vehicle.speed : vehicle.pace + vehicle.shove) * dt;
    vehicle.shove = 0;
    const gone = vehicle.flying ? vehicle.airSeconds > TRAFFIC.flightSeconds : vehicle.distance < riderDistance - TRAFFIC.dropBehind || vehicle.distance > riderDistance + TRAFFIC.spawnAhead[1] * 1.5;
    if (gone) place(traffic, vehicle, riderDistance, TRAFFIC.spawnAhead, random);
  }
  return launches;
}
