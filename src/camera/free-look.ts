export const FREE_LOOK = {
  radiansPerPixel: 0.0045,
  maxYaw: 2.6,
  maxPitch: 0.5,
  minPitch: -0.1,
  holdSeconds: 1.1,
  returnRate: 3.2,
  lookBackRate: 16,
  movingSpeed: 2,
} as const;

export interface FreeLook {
  yaw: number;
  pitch: number;
  idleSeconds: number;
  behind: number;
}

export const createFreeLook = (): FreeLook => ({ yaw: 0, pitch: 0, idleSeconds: 0, behind: 0 });

const clampTo = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const ease = (from: number, to: number, rate: number, dt: number): number => to + (from - to) * Math.exp(-rate * dt);

export function turnFreeLook(look: FreeLook, pixelsX: number, pixelsY: number): void {
  if (pixelsX === 0 && pixelsY === 0) return;
  look.yaw = clampTo(look.yaw - pixelsX * FREE_LOOK.radiansPerPixel, -FREE_LOOK.maxYaw, FREE_LOOK.maxYaw);
  look.pitch = clampTo(look.pitch + pixelsY * FREE_LOOK.radiansPerPixel, FREE_LOOK.minPitch, FREE_LOOK.maxPitch);
  look.idleSeconds = 0;
}

export function stepFreeLook(look: FreeLook, lookingBack: boolean, speed: number, dt: number): void {
  look.behind = ease(look.behind, lookingBack ? 1 : 0, FREE_LOOK.lookBackRate, dt);
  look.idleSeconds += dt;
  if (look.idleSeconds < FREE_LOOK.holdSeconds || speed < FREE_LOOK.movingSpeed) return;
  look.yaw = ease(look.yaw, 0, FREE_LOOK.returnRate, dt);
  look.pitch = ease(look.pitch, 0, FREE_LOOK.returnRate, dt);
}

export function resetFreeLook(look: FreeLook): void {
  look.yaw = 0;
  look.pitch = 0;
  look.behind = 0;
  look.idleSeconds = 0;
}

export const freeLookYaw = (look: FreeLook): number => look.yaw + look.behind * (Math.PI - look.yaw);
