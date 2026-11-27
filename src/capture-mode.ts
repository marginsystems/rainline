import { IDLE_INPUT, type CarInput } from '../sim/car.ts';

export type CaptureMode = 'drive' | 'wreck' | 'cruise' | null;

export const CAPTURE = {
  launchSeconds: 3.2,
  flickSeconds: 0.45,
  slideSeconds: 1.6,
  restSeconds: 1.4,
  wreckParkSeconds: 6.5,
  kickEverySeconds: 0.35,
  cruiseLateralGain: 0.06,
  cruiseHeadingGain: 1.6,
} as const;

export function cruiseInput(lateral: number, headingError: number): CarInput {
  const steer = Math.max(-1, Math.min(1, -lateral * CAPTURE.cruiseLateralGain - headingError * CAPTURE.cruiseHeadingGain));
  return { ...IDLE_INPUT, throttle: 1, steer };
}

export function captureModeOf(search: string): CaptureMode {
  const mode = new URLSearchParams(search).get('capture');
  return mode === 'drive' || mode === 'wreck' || mode === 'cruise' ? mode : null;
}

export function captureStartMetres(search: string): number {
  const metres = Number(new URLSearchParams(search).get('at'));
  return Number.isFinite(metres) && metres > 0 ? metres : 0;
}

export function captureInput(seconds: number): CarInput {
  if (seconds < CAPTURE.launchSeconds) return { ...IDLE_INPUT, throttle: 1 };
  const cycle = CAPTURE.flickSeconds + CAPTURE.slideSeconds + CAPTURE.restSeconds;
  const since = seconds - CAPTURE.launchSeconds;
  const phase = since % cycle;
  const steer = Math.floor(since / cycle) % 2 === 0 ? 1 : -1;
  if (phase < CAPTURE.flickSeconds) return { ...IDLE_INPUT, throttle: 1, steer, handbrake: true };
  if (phase < CAPTURE.flickSeconds + CAPTURE.slideSeconds) return { ...IDLE_INPUT, throttle: 1, steer: steer * 0.6, boost: true };
  return { ...IDLE_INPUT, throttle: 0.8 };
}
