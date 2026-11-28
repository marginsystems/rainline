export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Pose {
  readonly position: Vec3;
  readonly rotation: Quat;
}

export interface BoxBody {
  readonly half: Vec3;
  mass: number;
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly rotation: Quat;
  readonly spin: Vec3;
  readonly before: Pose;
  restSeconds: number;
  resting: boolean;
  grounded: boolean;
}

export interface Barrier {
  readonly at: number;
  readonly top: number;
  readonly depth: number;
}

export interface Terrain {
  height(along: number, lateral: number): number;
  barrier(along: number): Barrier | null;
}

export const FLAT_TERRAIN: Terrain = { height: () => 0, barrier: () => null };

export const BODY = {
  gravity: 21,
  restitution: 0.3,
  bounceFrom: 2,
  friction: 0.55,
  angularDamping: 0.35,
  groundAngularDamping: 1.6,
  solverPasses: 2,
  positionShare: 0.9,
  restSpeed: 0.45,
  restSpin: 0.6,
  restAfterSeconds: 0.5,
  slopeProbe: 0.5,
  contactSkin: 0.04,
  pairRestitution: 0.2,
  pairFriction: 0.35,
  contactCentring: 0.5,
  pairInset: 0.97,
} as const;

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const scaled = (a: Vec3, s: number): Vec3 => vec(a.x * s, a.y * s, a.z * s);
const minus = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

function copyVec(into: Vec3, from: Vec3): void {
  into.x = from.x;
  into.y = from.y;
  into.z = from.z;
}

function copyQuat(into: Quat, from: Quat): void {
  into.x = from.x;
  into.y = from.y;
  into.z = from.z;
  into.w = from.w;
}

export function rotate(q: Quat, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y), ty = 2 * (q.z * v.x - q.x * v.z), tz = 2 * (q.x * v.y - q.y * v.x);
  return vec(v.x + q.w * tx + (q.y * tz - q.z * ty), v.y + q.w * ty + (q.z * tx - q.x * tz), v.z + q.w * tz + (q.x * ty - q.y * tx));
}

const unrotate = (q: Quat, v: Vec3): Vec3 => rotate({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, v);

function normalise(q: Quat): void {
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  q.x /= n;
  q.y /= n;
  q.z /= n;
  q.w /= n;
}

export function createBody(half: Vec3, mass: number): BoxBody {
  return {
    half,
    mass,
    position: vec(0, half.y, 0),
    velocity: vec(0, 0, 0),
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    spin: vec(0, 0, 0),
    before: { position: vec(0, half.y, 0), rotation: { x: 0, y: 0, z: 0, w: 1 } },
    restSeconds: 0,
    resting: false,
    grounded: false,
  };
}

export function placeBody(body: BoxBody, lateral: number, along: number, forwardSpeed: number): void {
  body.position.x = lateral;
  body.position.y = body.half.y;
  body.position.z = along;
  body.velocity.x = 0;
  body.velocity.y = 0;
  body.velocity.z = forwardSpeed;
  body.rotation.x = 0;
  body.rotation.y = 0;
  body.rotation.z = 0;
  body.rotation.w = 1;
  body.spin.x = 0;
  body.spin.y = 0;
  body.spin.z = 0;
  body.restSeconds = 0;
  body.resting = false;
  body.grounded = false;
  settle(body);
}

export function settle(body: BoxBody): void {
  copyVec(body.before.position, body.position);
  copyQuat(body.before.rotation, body.rotation);
}

export function wake(body: BoxBody): void {
  body.resting = false;
  body.restSeconds = 0;
}

function inverseInertia(body: BoxBody, v: Vec3): Vec3 {
  const { x: hx, y: hy, z: hz } = body.half;
  const k = body.mass / 3;
  const local = unrotate(body.rotation, v);
  return rotate(body.rotation, vec(local.x / (k * (hy * hy + hz * hz)), local.y / (k * (hx * hx + hz * hz)), local.z / (k * (hx * hx + hy * hy))));
}

export function pointVelocity(body: BoxBody, point: Vec3): Vec3 {
  const spinPart = cross(body.spin, minus(point, body.position));
  return vec(body.velocity.x + spinPart.x, body.velocity.y + spinPart.y, body.velocity.z + spinPart.z);
}

export function applyImpulse(body: BoxBody, point: Vec3, impulse: Vec3): void {
  body.velocity.x += impulse.x / body.mass;
  body.velocity.y += impulse.y / body.mass;
  body.velocity.z += impulse.z / body.mass;
  const turn = inverseInertia(body, cross(minus(point, body.position), impulse));
  body.spin.x += turn.x;
  body.spin.y += turn.y;
  body.spin.z += turn.z;
}

const effectiveMass = (body: BoxBody, point: Vec3, direction: Vec3): number => {
  const r = minus(point, body.position);
  return 1 / body.mass + dot(direction, cross(inverseInertia(body, cross(r, direction)), r));
};

export function corners(body: BoxBody, inset: number = 1): Vec3[] {
  const found: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const offset = rotate(body.rotation, vec(sx * body.half.x * inset, sy * body.half.y * inset, sz * body.half.z * inset));
    found.push(vec(body.position.x + offset.x, body.position.y + offset.y, body.position.z + offset.z));
  }
  return found;
}

function groundNormal(terrain: Terrain, along: number, lateral: number): Vec3 {
  const probe = BODY.slopeProbe;
  const dx = (terrain.height(along, lateral + probe) - terrain.height(along, lateral - probe)) / (2 * probe);
  const dz = (terrain.height(along + probe, lateral) - terrain.height(along - probe, lateral)) / (2 * probe);
  const n = vec(-dx, 1, -dz);
  return scaled(n, 1 / length(n));
}

function contact(body: BoxBody, point: Vec3, normal: Vec3, depth: number): void {
  body.position.x += normal.x * depth * BODY.positionShare;
  body.position.y += normal.y * depth * BODY.positionShare;
  body.position.z += normal.z * depth * BODY.positionShare;
  const approach = dot(pointVelocity(body, point), normal);
  if (approach >= 0) return;
  const bounce = approach < -BODY.bounceFrom ? BODY.restitution : 0;
  const push = (-(1 + bounce) * approach) / effectiveMass(body, point, normal);
  applyImpulse(body, point, scaled(normal, push));
  const moving = pointVelocity(body, point);
  const slide = minus(moving, scaled(normal, dot(moving, normal)));
  const slideSpeed = length(slide);
  if (slideSpeed < 1e-6) return;
  const along = scaled(slide, 1 / slideSpeed);
  const grip = Math.min(slideSpeed / effectiveMass(body, point, along), BODY.friction * push);
  applyImpulse(body, point, scaled(along, -grip));
}

function touchTerrain(body: BoxBody, terrain: Terrain): boolean {
  let touched = false;
  for (let pass = 0; pass < BODY.solverPasses; pass++) {
    for (const corner of corners(body)) {
      const ground = terrain.height(corner.z, corner.x);
      if (corner.y < ground + BODY.contactSkin) touched = true;
      if (corner.y < ground) {
        const normal = groundNormal(terrain, corner.z, corner.x);
        contact(body, corner, normal, (ground - corner.y) * normal.y);
        touched = true;
      }
      const barrier = terrain.barrier(corner.z);
      if (!barrier || corner.y >= barrier.top) continue;
      const beyond = Math.abs(corner.x) - barrier.at;
      if (beyond <= 0 || beyond >= barrier.depth) continue;
      contact(body, corner, vec(-Math.sign(corner.x), 0, 0), beyond);
      touched = true;
    }
  }
  return touched;
}

export function stepBody(body: BoxBody, terrain: Terrain, dt: number): void {
  settle(body);
  if (body.resting) return;
  body.velocity.y -= BODY.gravity * dt;
  body.position.x += body.velocity.x * dt;
  body.position.y += body.velocity.y * dt;
  body.position.z += body.velocity.z * dt;
  const q = body.rotation, w = body.spin;
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  q.x += 0.5 * dt * (w.x * qw + w.y * qz - w.z * qy);
  q.y += 0.5 * dt * (w.y * qw + w.z * qx - w.x * qz);
  q.z += 0.5 * dt * (w.z * qw + w.x * qy - w.y * qx);
  q.w += 0.5 * dt * (-w.x * qx - w.y * qy - w.z * qz);
  normalise(q);
  body.grounded = touchTerrain(body, terrain);
  const damping = Math.exp(-(body.grounded ? BODY.groundAngularDamping : BODY.angularDamping) * dt);
  body.spin.x *= damping;
  body.spin.y *= damping;
  body.spin.z *= damping;
  const still = body.grounded && length(body.velocity) < BODY.restSpeed && length(body.spin) < BODY.restSpin;
  body.restSeconds = still ? body.restSeconds + dt : 0;
  if (body.restSeconds < BODY.restAfterSeconds) return;
  body.resting = true;
  body.velocity.x = body.velocity.y = body.velocity.z = 0;
  body.spin.x = body.spin.y = body.spin.z = 0;
}

export interface BodyContact {
  readonly point: Vec3;
  readonly normal: Vec3;
  readonly depth: number;
}

interface Inside {
  readonly sum: Vec3;
  readonly count: number;
}

function cornersInside(body: BoxBody, other: BoxBody): Inside {
  let count = 0;
  const sum = vec(0, 0, 0);
  const real = corners(body);
  corners(body, BODY.pairInset).forEach((probe, index) => {
    const local = unrotate(other.rotation, minus(probe, other.position));
    if (other.half.x <= Math.abs(local.x) || other.half.y <= Math.abs(local.y) || other.half.z <= Math.abs(local.z)) return;
    const corner = real[index] ?? probe;
    count += 1;
    sum.x += corner.x;
    sum.y += corner.y;
    sum.z += corner.z;
  });
  return { sum, count };
}

const axesOf = (body: BoxBody): Vec3[] => [rotate(body.rotation, vec(1, 0, 0)), rotate(body.rotation, vec(0, 1, 0)), rotate(body.rotation, vec(0, 0, 1))];

const reachAlong = (body: BoxBody, axes: readonly Vec3[], direction: Vec3): number => {
  const [x = vec(1, 0, 0), y = vec(0, 1, 0), z = vec(0, 0, 1)] = axes;
  return body.half.x * Math.abs(dot(x, direction)) + body.half.y * Math.abs(dot(y, direction)) + body.half.z * Math.abs(dot(z, direction));
};

function leastOverlap(a: BoxBody, b: BoxBody): { readonly normal: Vec3; readonly depth: number } {
  const aAxes = axesOf(a), bAxes = axesOf(b);
  const apart = minus(a.position, b.position);
  let normal = vec(0, 1, 0), depth = Number.POSITIVE_INFINITY;
  for (const axis of [...aAxes, ...bAxes]) {
    const along = dot(apart, axis);
    const overlap = reachAlong(a, aAxes, axis) + reachAlong(b, bAxes, axis) - Math.abs(along);
    if (overlap >= depth) continue;
    depth = overlap;
    normal = scaled(axis, along < 0 ? -1 : 1);
  }
  return { normal, depth };
}

export function touching(a: BoxBody, b: BoxBody): BodyContact | null {
  const reach = length(a.half) + length(b.half);
  if (Math.abs(a.position.z - b.position.z) > reach || Math.abs(a.position.x - b.position.x) > reach || Math.abs(a.position.y - b.position.y) > reach) return null;
  const into = cornersInside(a, b), back = cornersInside(b, a);
  const count = into.count + back.count;
  if (count === 0) return null;
  const { normal, depth } = leastOverlap(a, b);
  if (depth <= 0) return null;
  const centreHeight = (a.position.y + b.position.y) / 2;
  const meanY = (into.sum.y + back.sum.y) / count;
  const point = vec((into.sum.x + back.sum.x) / count, meanY + (centreHeight - meanY) * BODY.contactCentring, (into.sum.z + back.sum.z) / count);
  return { point, normal, depth };
}

export function collide(a: BoxBody, b: BoxBody, hit: BodyContact): number {
  const share = a.mass / (a.mass + b.mass);
  const { normal, point, depth } = hit;
  a.position.x += normal.x * depth * (1 - share);
  a.position.y += normal.y * depth * (1 - share);
  a.position.z += normal.z * depth * (1 - share);
  b.position.x -= normal.x * depth * share;
  b.position.y -= normal.y * depth * share;
  b.position.z -= normal.z * depth * share;
  const relative = minus(pointVelocity(a, point), pointVelocity(b, point));
  const approach = dot(relative, normal);
  if (approach >= 0) return 0;
  const push = (-(1 + BODY.pairRestitution) * approach) / (effectiveMass(a, point, normal) + effectiveMass(b, point, normal));
  applyImpulse(a, point, scaled(normal, push));
  applyImpulse(b, point, scaled(normal, -push));
  const after = minus(pointVelocity(a, point), pointVelocity(b, point));
  const slide = minus(after, scaled(normal, dot(after, normal)));
  const slideSpeed = length(slide);
  if (slideSpeed > 1e-6) {
    const along = scaled(slide, 1 / slideSpeed);
    const grip = Math.min(slideSpeed / (effectiveMass(a, point, along) + effectiveMass(b, point, along)), BODY.pairFriction * push);
    applyImpulse(a, point, scaled(along, -grip));
    applyImpulse(b, point, scaled(along, grip));
  }
  wake(a);
  wake(b);
  return -approach;
}

export function lowestPoint(body: BoxBody): number {
  let lowest = Number.POSITIVE_INFINITY;
  for (const corner of corners(body)) lowest = Math.min(lowest, corner.y);
  return lowest;
}

export function poseAt(body: BoxBody, alpha: number, into: Pose): void {
  const a = body.before, b = body;
  into.position.x = a.position.x + (b.position.x - a.position.x) * alpha;
  into.position.y = a.position.y + (b.position.y - a.position.y) * alpha;
  into.position.z = a.position.z + (b.position.z - a.position.z) * alpha;
  const flip = a.rotation.x * b.rotation.x + a.rotation.y * b.rotation.y + a.rotation.z * b.rotation.z + a.rotation.w * b.rotation.w < 0 ? -1 : 1;
  into.rotation.x = a.rotation.x + (b.rotation.x * flip - a.rotation.x) * alpha;
  into.rotation.y = a.rotation.y + (b.rotation.y * flip - a.rotation.y) * alpha;
  into.rotation.z = a.rotation.z + (b.rotation.z * flip - a.rotation.z) * alpha;
  into.rotation.w = a.rotation.w + (b.rotation.w * flip - a.rotation.w) * alpha;
  normalise(into.rotation);
}

export function baseOf(pose: Pose, half: Vec3): Vec3 {
  const down = rotate(pose.rotation, vec(0, -half.y, 0));
  return vec(pose.position.x + down.x, pose.position.y + down.y, pose.position.z + down.z);
}
