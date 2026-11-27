import * as THREE from 'three';
import type { CarState } from '../../sim/car.ts';
import { clamp, damp, dampAngle, lerp, smoothstep, wrapAngle } from '../../sim/math.ts';
import { createFreeLook, freeLookYaw, resetFreeLook, stepFreeLook, turnFreeLook } from './free-look.ts';

export const CHASE = {
  distance: 6.1,
  distancePerSpeed: 0.022,
  height: 2.0,
  heightPerSpeed: 0.006,
  lookAhead: 3,
  lookHeight: 0.9,
  yawRate: 5.5,
  velocityBlend: 0.62,
  fov: 60,
  fovAtSpeed: 18,
  boostFov: 7,
  boostDistance: 0.9,
  shakeDecay: 2.4,
  shakeMetres: 0.3,
  orbitRadius: 7.8,
  orbitHeight: 1.7,
  orbitFov: 40,
  orbitTurnsPerSecond: 0.035,
  orbitOffsetMetres: 2.1,
  confinedLiftPerMetre: 0.7,
  confinedLiftMax: 3,
  blendSeconds: 1.4,
} as const;

interface Pose {
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
  fov: number;
}

const createPose = (): Pose => ({ position: new THREE.Vector3(), target: new THREE.Vector3(), fov: CHASE.fov });

export type CameraMode = 'orbit' | 'chase';

export class ChaseCamera {
  private yaw = 0;
  private distance: number = CHASE.distance;
  private fov: number = CHASE.fov;
  private trauma = 0;
  private seconds = 0;
  private mode: CameraMode = 'orbit';
  private blend = 1;
  private readonly wanted = createPose();
  private readonly from = createPose();
  private readonly shown = createPose();
  confine: ((position: THREE.Vector3) => number) | null = null;
  private lift = 0;
  private readonly look = createFreeLook();
  private lookingBack = false;

  turn(pixelsX: number, pixelsY: number): void {
    if (this.mode === 'chase') turnFreeLook(this.look, pixelsX, pixelsY);
  }

  lookBack(held: boolean): void {
    this.lookingBack = held;
  }

  setMode(mode: CameraMode, car: CarState): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.from.position.copy(this.shown.position);
    this.from.target.copy(this.shown.target);
    this.from.fov = this.shown.fov;
    this.blend = 0;
    resetFreeLook(this.look);
    if (mode === 'chase') {
      this.yaw = car.yaw;
      this.distance = CHASE.distance;
      this.fov = CHASE.fov;
    }
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(camera: THREE.PerspectiveCamera, car: CarState, x: number, z: number, yaw: number, dt: number): void {
    this.seconds += dt;
    if (this.mode === 'chase') this.chase(car, x, z, yaw, dt);
    else this.orbit(x, z, yaw);
    this.blend = Math.min(1, this.blend + dt / CHASE.blendSeconds);
    const mix = smoothstep(0, 1, this.blend);
    this.shown.position.lerpVectors(this.from.position, this.wanted.position, mix);
    this.shown.target.lerpVectors(this.from.target, this.wanted.target, mix);
    this.shown.fov = lerp(this.from.fov, this.wanted.fov, mix);

    this.trauma = Math.max(0, this.trauma - CHASE.shakeDecay * dt);
    const shake = this.trauma * this.trauma * CHASE.shakeMetres;
    const t = this.seconds;
    camera.position.set(
      this.shown.position.x + Math.sin(t * 61) * shake,
      this.shown.position.y + Math.sin(t * 47 + 1.3) * shake,
      this.shown.position.z + Math.sin(t * 53 + 2.1) * shake,
    );
    camera.lookAt(this.shown.target);
    camera.rotateZ(Math.sin(t * 39) * shake * 0.06);
    if (Math.abs(camera.fov - this.shown.fov) > 0.01) {
      camera.fov = this.shown.fov;
      camera.updateProjectionMatrix();
    }
  }

  private chase(car: CarState, x: number, z: number, yaw: number, dt: number): void {
    const velocityYaw = car.speed > 4 && car.forwardSpeed > 0 ? Math.atan2(car.vx, car.vz) : yaw;
    const target = yaw + wrapAngle(velocityYaw - yaw) * smoothstep(4, 14, car.speed) * CHASE.velocityBlend;
    this.yaw = dampAngle(this.yaw, target, CHASE.yawRate, dt);
    const wantedDistance = CHASE.distance + car.speed * CHASE.distancePerSpeed + clamp(car.longAccel * 0.04, -0.4, 0.7) + (car.boosting ? CHASE.boostDistance : 0);
    this.distance = damp(this.distance, wantedDistance, 4, dt);
    const wantedFov = CHASE.fov + CHASE.fovAtSpeed * smoothstep(8, 78, car.speed) + (car.boosting ? CHASE.boostFov : 0);
    this.fov = damp(this.fov, wantedFov, 4, dt);
    stepFreeLook(this.look, this.lookingBack, car.speed, dt);
    const viewYaw = this.yaw + freeLookYaw(this.look);
    const sin = Math.sin(viewYaw), cos = Math.cos(viewYaw);
    const reach = this.distance * Math.cos(this.look.pitch);
    this.wanted.position.set(x - sin * reach, CHASE.height + car.speed * CHASE.heightPerSpeed + this.distance * Math.sin(this.look.pitch), z - cos * reach);
    const pushed = this.confine ? this.confine(this.wanted.position) : 0;
    this.lift = damp(this.lift, Math.min(CHASE.confinedLiftMax, pushed * CHASE.confinedLiftPerMetre), 5, dt);
    this.wanted.position.y += this.lift;
    this.wanted.target.set(x + sin * CHASE.lookAhead, CHASE.lookHeight, z + cos * CHASE.lookAhead);
    this.wanted.fov = this.fov;
  }

  private orbit(x: number, z: number, yaw: number): void {
    const angle = yaw + Math.PI * 0.8 + this.seconds * CHASE.orbitTurnsPerSecond * Math.PI * 2;
    this.wanted.position.set(x + Math.sin(angle) * CHASE.orbitRadius, CHASE.orbitHeight + Math.sin(this.seconds * 0.21) * 0.5, z + Math.cos(angle) * CHASE.orbitRadius);
    const towardX = x - this.wanted.position.x, towardZ = z - this.wanted.position.z;
    const reach = Math.hypot(towardX, towardZ) || 1;
    this.wanted.target.set(x + (towardZ / reach) * CHASE.orbitOffsetMetres, 0.7, z - (towardX / reach) * CHASE.orbitOffsetMetres);
    this.wanted.fov = CHASE.orbitFov;
  }
}
