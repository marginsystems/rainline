export interface DriftScore {
  current: number;
  multiplier: number;
  total: number;
  best: number;
  active: boolean;
  seconds: number;
  grace: number;
}

export interface DriftSample {
  readonly slip: number;
  readonly speed: number;
  readonly onRoad: boolean;
  readonly impact: number;
}

export type DriftEvent =
  | { readonly kind: 'start' }
  | { readonly kind: 'combo'; readonly multiplier: number }
  | { readonly kind: 'bank'; readonly points: number; readonly best: boolean }
  | { readonly kind: 'fail'; readonly lost: number };

export const DRIFT_SCORE = {
  minSlip: 0.2,
  minSpeed: 9,
  pointsPerRadianMetre: 9,
  secondsPerMultiplier: 2.5,
  maxMultiplier: 5,
  graceSeconds: 1.1,
  failImpact: 3,
} as const;

export const createDriftScore = (): DriftScore => ({ current: 0, multiplier: 1, total: 0, best: 0, active: false, seconds: 0, grace: 0 });

function endRun(score: DriftScore): void {
  score.current = 0;
  score.multiplier = 1;
  score.active = false;
  score.seconds = 0;
  score.grace = 0;
}

export function stepDriftScore(score: DriftScore, sample: DriftSample, dt: number): DriftEvent | null {
  if (score.active && sample.impact > DRIFT_SCORE.failImpact) {
    const lost = Math.round(score.current);
    endRun(score);
    return { kind: 'fail', lost };
  }
  const sliding = Math.abs(sample.slip) > DRIFT_SCORE.minSlip && sample.speed > DRIFT_SCORE.minSpeed && sample.onRoad;
  if (sliding) {
    const started = !score.active;
    score.active = true;
    score.grace = DRIFT_SCORE.graceSeconds;
    score.seconds += dt;
    score.current += Math.abs(sample.slip) * sample.speed * dt * DRIFT_SCORE.pointsPerRadianMetre * score.multiplier;
    const multiplier = Math.min(DRIFT_SCORE.maxMultiplier, 1 + Math.floor(score.seconds / DRIFT_SCORE.secondsPerMultiplier));
    if (started) return { kind: 'start' };
    if (multiplier > score.multiplier) {
      score.multiplier = multiplier;
      return { kind: 'combo', multiplier };
    }
    return null;
  }
  if (!score.active) return null;
  score.grace -= dt;
  if (score.grace > 0) return null;
  const points = Math.round(score.current);
  const best = points > score.best;
  score.total += points;
  score.best = Math.max(score.best, points);
  endRun(score);
  return { kind: 'bank', points, best };
}
