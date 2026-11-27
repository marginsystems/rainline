import { clamp, damp, lerp, mod, wrapAngle } from './math.ts';
import { locate, sampleAt, type Track } from './track.ts';

export interface CarInput {
  readonly throttle: number;
  readonly brake: number;
  readonly steer: number;
  readonly handbrake: boolean;
  readonly boost: boolean;
}

export const IDLE_INPUT: CarInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };

export interface CarState {
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  yawRate: number;
  steer: number;
  kick: number;
  grip: number;
  drifting: boolean;
  slip: number;
  speed: number;
  forwardSpeed: number;
  boost: number;
  boosting: boolean;
  gear: number;
  rpm: number;
  wheelSpin: number;
  trackIndex: number;
  lateral: number;
  progress: number;
  distance: number;
  onRoad: boolean;
  wallContact: boolean;
  impact: number;
  impactNx: number;
  impactNz: number;
  damage: number;
  longAccel: number;
  latAccel: number;
}

export const CAR = {
  engineAccel: 12,
  boostAccel: 11,
  topSpeed: 52,
  boostTopSpeed: 68,
  reverseAccel: 8,
  reverseTopSpeed: 14,
  brakeDecel: 26,
  handbrakeDecel: 5,
  engineBrake: 1.6,
  drag: 0.035,
  offRoadDrag: 0.9,
  offRoadGrip: 0.6,
  gripFull: 9.5,
  gripCoastSlide: 1.8,
  gripPowerSlide: 1.35,
  gripHandbrake: 0.55,
  gripLossRate: 12,
  gripRecoveryRate: 1.5,
  driftEnterSlip: 0.14,
  driftExitSlip: 0.05,
  driftMinSpeed: 4,
  powerOverMaxSpeed: 12,
  kickThrottle: 0.6,
  kickSteer: 0.8,
  kickMinSpeed: 8,
  kickSeconds: 0.18,
  brakeFlickMinSpeed: 14,
  maxYawRate: 2.6,
  lateralAccelLimit: 18,
  driftYawRate: 2.0,
  selfAlign: 1.4,
  yawResponse: 10,
  driftYawResponse: 4.5,
  steerInRate: 7,
  steerOutRate: 11,
  slideSpeedKeep: 0.93,
  sidewaysSpeedKeep: 0.65,
  gripSpeedKeep: 0.97,
  boostDrain: 0.3,
  boostDriftGain: 0.26,
  boostPassiveGain: 0.025,
  bodyRadius: 1.12,
  wallRestitution: 0.3,
  wallScrub: 0.018,
  wallAlign: 0.02,
  wallSlideAlignRate: 3.5,
  hardImpact: 2,
  driftThrust: 0.5,
  donutThrust: 0.22,
  donutYawRate: 3.1,
  gearTopSpeeds: [13, 22, 31, 40, 49, 72],
  gridMetresBeforeLine: 14,
  damageFreeImpact: 3,
  damagePerImpactSpeed: 0.013,
  damagedPullLoss: 0.15,
} as const;

export const BOOST_FULL = 1;
const BOOST_MIN_TO_FIRE = 0.02;
const DOWNSHIFT_MARGIN = 3;

function placeOnTrack(car: CarState, track: Track, index: number): void {
  const sample = sampleAt(track, index);
  car.x = sample.x;
  car.z = sample.z;
  car.yaw = Math.atan2(sample.tx, sample.tz);
  car.vx = 0;
  car.vz = 0;
  car.yawRate = 0;
  car.steer = 0;
  car.kick = 0;
  car.grip = CAR.gripFull;
  car.drifting = false;
  car.slip = 0;
  car.speed = 0;
  car.forwardSpeed = 0;
  car.trackIndex = index;
  car.lateral = 0;
  car.progress = sample.s;
  car.impact = 0;
  car.wallContact = false;
  car.onRoad = true;
  car.longAccel = 0;
  car.latAccel = 0;
}

export function createCar(track: Track): CarState {
  const car: CarState = {
    x: 0, z: 0, yaw: 0, vx: 0, vz: 0, yawRate: 0, steer: 0, kick: 0, grip: CAR.gripFull, drifting: false, slip: 0, speed: 0, forwardSpeed: 0,
    boost: 0.5, boosting: false, gear: 0, rpm: 0.2, wheelSpin: 0, trackIndex: 0, lateral: 0, progress: 0, distance: 0,
    onRoad: true, wallContact: false, impact: 0, impactNx: 0, impactNz: 0, damage: 0, longAccel: 0, latAccel: 0,
  };
  const gridSamples = Math.round(CAR.gridMetresBeforeLine / track.spacing);
  placeOnTrack(car, track, track.samples.length - gridSamples);
  car.distance = -gridSamples * track.spacing;
  return car;
}

export function moveAlongTrack(car: CarState, track: Track, metres: number): void {
  placeOnTrack(car, track, mod(Math.round(metres / track.spacing), track.samples.length));
  car.distance = car.progress - track.length;
}

export function resetToTrack(car: CarState, track: Track): void {
  placeOnTrack(car, track, car.trackIndex);
}

export function repairCar(car: CarState): void {
  car.damage = 0;
}

export function gearFor(forwardSpeed: number, current: number): number {
  const tops = CAR.gearTopSpeeds;
  const speed = Math.abs(forwardSpeed);
  let gear = clamp(current, 0, tops.length - 1);
  while (gear < tops.length - 1 && speed > (tops[gear] ?? 0)) gear++;
  while (gear > 0 && speed < (tops[gear - 1] ?? 0) - DOWNSHIFT_MARGIN) gear--;
  return gear;
}

function rpmFor(forwardSpeed: number, gear: number): number {
  const tops = CAR.gearTopSpeeds;
  const low = gear === 0 ? 0 : (tops[gear - 1] ?? 0) * 0.55;
  const high = tops[gear] ?? CAR.boostTopSpeed;
  return clamp(0.28 + 0.72 * (Math.abs(forwardSpeed) - low) / (high - low), 0.2, 1);
}

function driveAcceleration(input: CarInput, forwardSpeed: number, boosting: boolean, thrust: number, dt: number): number {
  let next = forwardSpeed;
  if (input.throttle > 0) {
    if (next < -0.5) next = Math.min(0, next + CAR.brakeDecel * input.throttle * dt);
    else {
      const top = boosting ? CAR.boostTopSpeed : CAR.topSpeed;
      const pull = CAR.engineAccel + (boosting ? CAR.boostAccel : 0);
      next += input.throttle * pull * thrust * Math.max(0, 1 - (Math.max(next, 0) / top) ** 2) * dt;
    }
  }
  if (input.brake > 0) {
    if (next > 0.5) next = Math.max(0, next - CAR.brakeDecel * input.brake * dt);
    else next -= input.brake * CAR.reverseAccel * Math.max(0, 1 - (Math.abs(Math.min(next, 0)) / CAR.reverseTopSpeed) ** 2) * dt;
  }
  if (input.throttle === 0 && input.brake === 0) next -= Math.sign(next) * Math.min(CAR.engineBrake * dt, Math.abs(next));
  if (input.handbrake) next -= Math.sign(next) * Math.min(CAR.handbrakeDecel * dt, Math.abs(next));
  return next;
}

function collideWithWalls(car: CarState, track: Track, dt: number): void {
  const limit = track.wallOffset - CAR.bodyRadius;
  car.impact = 0;
  car.wallContact = false;
  if (Math.abs(car.lateral) <= limit) return;
  const sample = sampleAt(track, car.trackIndex);
  const side = Math.sign(car.lateral);
  const ox = sample.nx * side, oz = sample.nz * side;
  const over = Math.abs(car.lateral) - limit;
  car.x -= ox * over;
  car.z -= oz * over;
  car.lateral = side * limit;
  car.wallContact = true;
  const outward = car.vx * ox + car.vz * oz;
  if (outward <= 0) return;
  car.impact = outward;
  car.impactNx = ox;
  car.impactNz = oz;
  car.damage = Math.min(1, car.damage + Math.max(0, outward - CAR.damageFreeImpact) * CAR.damagePerImpactSpeed);
  car.vx -= ox * outward * (1 + CAR.wallRestitution);
  car.vz -= oz * outward * (1 + CAR.wallRestitution);
  const scrub = clamp(1 - outward * CAR.wallScrub, 0.6, 1);
  car.vx *= scrub;
  car.vz *= scrub;
  const along = car.vx * sample.tx + car.vz * sample.tz >= 0 ? 1 : -1;
  const wallYaw = Math.atan2(sample.tx * along, sample.tz * along);
  const turn = wrapAngle(wallYaw - car.yaw);
  const snap = clamp(outward * CAR.wallAlign, 0, 0.35);
  const slide = 1 - Math.exp(-CAR.wallSlideAlignRate * dt);
  car.yaw = wrapAngle(car.yaw + turn * Math.max(snap, slide));
  if (outward > CAR.hardImpact) car.yawRate *= 0.6;
}

export function stepCar(car: CarState, input: CarInput, track: Track, dt: number): void {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const lx = fz, lz = -fx;
  let forward = car.vx * fx + car.vz * fz;
  let lateral = car.vx * lx + car.vz * lz;
  const speed = Math.hypot(forward, lateral);
  const offRoad = Math.abs(car.lateral) > track.halfWidth + track.kerbWidth;

  car.steer = damp(car.steer, input.steer, Math.abs(input.steer) > Math.abs(car.steer) ? CAR.steerInRate : CAR.steerOutRate, dt);

  const slip = speed > 2 ? Math.atan2(lateral, Math.abs(forward)) : 0;
  const powerOver = input.throttle > 0.8 && Math.abs(car.steer) > 0.85 && speed > 1.5 && speed < CAR.powerOverMaxSpeed;
  const brakeFlick = input.brake > 0.5 && Math.abs(car.steer) > 0.6 && speed > CAR.brakeFlickMinSpeed;
  const pushing = input.throttle > CAR.kickThrottle && Math.abs(car.steer) > CAR.kickSteer && speed > CAR.kickMinSpeed;
  car.kick = pushing ? car.kick + dt : 0;
  const provoked = powerOver || brakeFlick || car.kick > CAR.kickSeconds || (input.handbrake && speed > CAR.driftMinSpeed);
  if (!car.drifting) car.drifting = provoked || (speed > CAR.driftMinSpeed && Math.abs(slip) > CAR.driftEnterSlip);
  else if (speed < 1.2 || (!provoked && Math.abs(slip) < CAR.driftExitSlip)) car.drifting = false;

  let gripTarget: number = CAR.gripFull;
  if (input.handbrake && speed > 3) gripTarget = CAR.gripHandbrake;
  else if (car.drifting) gripTarget = input.throttle > 0.15 ? CAR.gripPowerSlide : CAR.gripCoastSlide;
  car.grip = damp(car.grip, gripTarget, gripTarget < car.grip ? CAR.gripLossRate : CAR.gripRecoveryRate, dt);
  const traction = clamp((car.grip - CAR.gripHandbrake) / (CAR.gripFull - CAR.gripHandbrake), 0, 1);

  const boosting = input.boost && input.throttle > 0.1 && car.boost > (car.boosting ? 0 : BOOST_MIN_TO_FIRE);
  const slideThrust = car.drifting ? CAR.driftThrust : 1;
  const thrust = (powerOver ? CAR.donutThrust : slideThrust) * (1 - CAR.damagedPullLoss * car.damage);
  const driven = driveAcceleration(input, forward, boosting, thrust, dt);
  car.longAccel = damp(car.longAccel, (driven - forward) / dt, 8, dt);
  forward = driven;

  const beforeGrip = Math.hypot(forward, lateral);
  lateral *= Math.exp(-car.grip * (offRoad ? CAR.offRoadGrip : 1) * dt);
  const afterGrip = Math.hypot(forward, lateral);
  if (afterGrip > 1e-4) {
    const keep = lerp(CAR.slideSpeedKeep, CAR.gripSpeedKeep, traction) * (CAR.sidewaysSpeedKeep + (1 - CAR.sidewaysSpeedKeep) * Math.abs(Math.cos(slip)));
    const scale = (afterGrip + (beforeGrip - afterGrip) * keep) / afterGrip;
    forward *= scale;
    lateral *= scale;
  }
  const dragScale = Math.exp(-(CAR.drag + (offRoad ? CAR.offRoadDrag : 0)) * dt);
  forward *= dragScale;
  lateral *= dragScale;

  car.vx = fx * forward + lx * lateral;
  car.vz = fz * forward + lz * lateral;

  const direction = forward < -0.5 ? -1 : 1;
  const rolling = clamp(speed / 6, 0, 1);
  const gripYaw = Math.min(CAR.maxYawRate, CAR.lateralAccelLimit / Math.max(speed, 1));
  const slideYaw = powerOver ? CAR.donutYawRate : CAR.driftYawRate;
  let yawTarget = car.steer * lerp(slideYaw, gripYaw, traction) * rolling * direction;
  if (forward > 0 && !powerOver) yawTarget += slip * CAR.selfAlign * (1 - traction);
  car.yawRate = damp(car.yawRate, yawTarget, lerp(CAR.driftYawResponse, CAR.yawResponse, traction), dt);
  car.yaw = wrapAngle(car.yaw + car.yawRate * dt);

  car.x += car.vx * dt;
  car.z += car.vz * dt;

  const location = locate(track, car.x, car.z, car.trackIndex);
  let advanced = location.progress - car.progress;
  if (advanced > track.length / 2) advanced -= track.length;
  if (advanced < -track.length / 2) advanced += track.length;
  car.distance += advanced;
  car.trackIndex = location.index;
  car.lateral = location.lateral;
  car.progress = location.progress;
  collideWithWalls(car, track, dt);

  car.speed = Math.hypot(car.vx, car.vz);
  car.forwardSpeed = car.vx * Math.sin(car.yaw) + car.vz * Math.cos(car.yaw);
  car.slip = car.speed > 2 ? Math.atan2(car.vx * Math.cos(car.yaw) - car.vz * Math.sin(car.yaw), Math.abs(car.forwardSpeed)) : 0;
  car.onRoad = !offRoad;
  car.latAccel = damp(car.latAccel, car.yawRate * car.speed, 8, dt);

  car.boosting = boosting;
  if (boosting) car.boost = Math.max(0, car.boost - CAR.boostDrain * dt);
  else {
    const earning = car.drifting && car.onRoad && car.speed > CAR.driftMinSpeed ? CAR.boostDriftGain * clamp(Math.abs(car.slip) / 0.6, 0, 1) : 0;
    car.boost = Math.min(BOOST_FULL, car.boost + (CAR.boostPassiveGain + earning) * dt);
  }

  car.gear = gearFor(car.forwardSpeed, car.gear);
  const spinning = car.drifting && input.throttle > 0.2;
  let rpmTarget = rpmFor(car.forwardSpeed, car.gear);
  if (spinning) rpmTarget = Math.max(rpmTarget, 0.72 + 0.2 * input.throttle);
  if (car.speed < 1 && input.throttle > 0) rpmTarget = Math.max(rpmTarget, 0.5);
  car.rpm = damp(car.rpm, rpmTarget, 9, dt);
  car.wheelSpin = damp(car.wheelSpin, spinning ? 1 : 0, 6, dt);
}
