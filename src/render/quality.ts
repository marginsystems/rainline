export interface QualityTier {
  readonly name: string;
  readonly pixelBudget: number;
  readonly maxPixelRatio: number;
  readonly msaaSamples: number;
  readonly ambientOcclusion: boolean;
  readonly bloom: boolean;
  readonly reflectionScale: number;
  readonly shadowMapSize: number;
  readonly roadsideCast: boolean;
}

export const NATIVE_PIXEL_BUDGET = 9_600_000;

export const QUALITY_TIERS: readonly QualityTier[] = [
  { name: 'Ultra', pixelBudget: NATIVE_PIXEL_BUDGET, maxPixelRatio: 2, msaaSamples: 4, ambientOcclusion: true, bloom: true, reflectionScale: 0.5, shadowMapSize: 2048, roadsideCast: true },
  { name: 'High', pixelBudget: NATIVE_PIXEL_BUDGET, maxPixelRatio: 2, msaaSamples: 4, ambientOcclusion: true, bloom: true, reflectionScale: 0.35, shadowMapSize: 2048, roadsideCast: true },
  { name: 'Medium', pixelBudget: NATIVE_PIXEL_BUDGET, maxPixelRatio: 2, msaaSamples: 4, ambientOcclusion: false, bloom: true, reflectionScale: 0.3, shadowMapSize: 1024, roadsideCast: true },
  { name: 'Low', pixelBudget: 2_500_000, maxPixelRatio: 1.5, msaaSamples: 2, ambientOcclusion: false, bloom: true, reflectionScale: 0.25, shadowMapSize: 1024, roadsideCast: false },
  { name: 'Minimum', pixelBudget: 1_100_000, maxPixelRatio: 1, msaaSamples: 0, ambientOcclusion: false, bloom: true, reflectionScale: 0, shadowMapSize: 0, roadsideCast: false },
];

export const START_LEVEL = 0;
export const MIN_PIXEL_RATIO = 0.6;
export const PIXEL_RATIO_QUANTUM = 1 / 16;

export function tierAt(level: number): QualityTier {
  const tier = QUALITY_TIERS[Math.min(Math.max(level, 0), QUALITY_TIERS.length - 1)];
  if (!tier) throw new Error('no quality tiers');
  return tier;
}

export function budgetedPixelRatio(tier: QualityTier, devicePixelRatio: number, cssWidth: number, cssHeight: number): number {
  const fromBudget = Math.sqrt(tier.pixelBudget / Math.max(1, cssWidth * cssHeight));
  const ratio = Math.min(devicePixelRatio, tier.maxPixelRatio, fromBudget);
  return Math.max(MIN_PIXEL_RATIO, Math.floor(ratio / PIXEL_RATIO_QUANTUM) * PIXEL_RATIO_QUANTUM);
}

export const GOVERNOR = {
  windowMs: 1000,
  warmupMs: 4000,
  ignoreFramesLongerThanMs: 250,
  targetMs: 1000 / 60,
  slowSlack: 1.15,
  goodSlack: 1.04,
  slowWindowsToDrop: 2,
  goodWindowsToRaise: 8,
  maxGoodWindowsToRaise: 128,
  failedRaiseWithinWindows: 12,
  headroomSlack: 0.8,
  headroomWindowsToRaise: 3,
  headroomBlockedWindowsAfterFailedRaise: 30,
  gainWindows: 2,
  minGainShare: 0.1,
  firstNoGainLockWindows: 60,
  maxNoGainLockWindows: 480,
} as const;

export interface QualityGovernor {
  level: number;
  auto: boolean;
  fps: number;
  warmupMs: number;
  frames: number[];
  elapsedMs: number;
  slowWindows: number;
  goodWindows: number;
  windowsSinceRaise: number;
  raiseAfter: number;
  headroomWindows: number;
  headroomBlockedWindows: number;
  beforeDropMs: number | null;
  windowsSinceDrop: number;
  dropLockedWindows: number;
  noGainLock: number;
}

export const createQualityGovernor = (level: number = START_LEVEL): QualityGovernor => ({
  level, auto: true, fps: 0, warmupMs: GOVERNOR.warmupMs, frames: [], elapsedMs: 0,
  slowWindows: 0, goodWindows: 0, windowsSinceRaise: Number.POSITIVE_INFINITY, raiseAfter: GOVERNOR.goodWindowsToRaise, headroomWindows: 0, headroomBlockedWindows: 0,
  beforeDropMs: null, windowsSinceDrop: 0, dropLockedWindows: 0, noGainLock: GOVERNOR.firstNoGainLockWindows,
});

export function setManualLevel(governor: QualityGovernor, level: number | null): void {
  governor.auto = level === null;
  if (level !== null) governor.level = Math.min(Math.max(level, 0), QUALITY_TIERS.length - 1);
  governor.slowWindows = 0;
  governor.goodWindows = 0;
  governor.headroomWindows = 0;
  governor.beforeDropMs = null;
}

export function observeFrame(governor: QualityGovernor, frameMs: number): boolean {
  if (!(frameMs > 0) || frameMs > GOVERNOR.ignoreFramesLongerThanMs) return false;
  governor.frames.push(frameMs);
  governor.elapsedMs += frameMs;
  if (governor.elapsedMs < GOVERNOR.windowMs) return false;
  const sorted = governor.frames.sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length / 2)] ?? governor.elapsedMs / sorted.length;
  governor.fps = (1000 * sorted.length) / governor.elapsedMs;
  governor.frames = [];
  governor.elapsedMs = 0;
  if (governor.warmupMs > 0) {
    governor.warmupMs -= GOVERNOR.windowMs;
    return false;
  }
  if (!governor.auto) return false;

  const target = GOVERNOR.targetMs;
  governor.windowsSinceRaise += 1;
  governor.slowWindows = typical > target * GOVERNOR.slowSlack ? governor.slowWindows + 1 : 0;
  governor.goodWindows = typical < target * GOVERNOR.goodSlack ? governor.goodWindows + 1 : 0;
  governor.headroomBlockedWindows = Math.max(0, governor.headroomBlockedWindows - 1);
  governor.headroomWindows = typical < target * GOVERNOR.headroomSlack && governor.headroomBlockedWindows === 0 ? governor.headroomWindows + 1 : 0;
  governor.dropLockedWindows = Math.max(0, governor.dropLockedWindows - 1);
  if (governor.beforeDropMs !== null) {
    governor.windowsSinceDrop += 1;
    if (governor.windowsSinceDrop >= GOVERNOR.gainWindows) {
      const gained = typical <= governor.beforeDropMs * (1 - GOVERNOR.minGainShare);
      governor.beforeDropMs = null;
      if (!gained) {
        governor.level -= 1;
        governor.dropLockedWindows = governor.noGainLock;
        governor.noGainLock = Math.min(GOVERNOR.maxNoGainLockWindows, governor.noGainLock * 2);
        governor.slowWindows = 0;
        governor.goodWindows = 0;
        governor.headroomWindows = 0;
        return true;
      }
    }
  }
  if (governor.slowWindows >= GOVERNOR.slowWindowsToDrop && governor.level < QUALITY_TIERS.length - 1 && governor.dropLockedWindows === 0) {
    governor.beforeDropMs = typical;
    governor.windowsSinceDrop = 0;
    if (governor.windowsSinceRaise <= GOVERNOR.failedRaiseWithinWindows) {
      governor.raiseAfter = Math.min(GOVERNOR.maxGoodWindowsToRaise, governor.raiseAfter * 2);
      governor.headroomBlockedWindows = GOVERNOR.headroomBlockedWindowsAfterFailedRaise;
    }
    governor.level += 1;
    governor.slowWindows = 0;
    governor.goodWindows = 0;
    governor.headroomWindows = 0;
    return true;
  }
  const raise = governor.goodWindows >= governor.raiseAfter || governor.headroomWindows >= GOVERNOR.headroomWindowsToRaise;
  if (raise && governor.level > 0) {
    governor.level -= 1;
    governor.goodWindows = 0;
    governor.headroomWindows = 0;
    governor.windowsSinceRaise = 0;
    return true;
  }
  return false;
}
