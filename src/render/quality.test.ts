import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budgetedPixelRatio, createQualityGovernor, GOVERNOR, observeFrame, QUALITY_TIERS, setManualLevel, tierAt } from './quality.ts';

type Governor = ReturnType<typeof createQualityGovernor>;

function run(governor: Governor, frameMs: number | ((level: number, frame: number) => number), seconds: number): number {
  let changes = 0, frame = 0;
  for (let t = 0; t < seconds * 1000;) {
    const ms = typeof frameMs === 'number' ? frameMs : frameMs(governor.level, frame++);
    if (observeFrame(governor, ms)) changes++;
    t += ms;
  }
  return changes;
}

const gpuBound = (level: number): number => 34 - level * 6;

test('each tier costs no more than the one above it', () => {
  for (let i = 1; i < QUALITY_TIERS.length; i++) {
    const above = tierAt(i - 1), below = tierAt(i);
    assert.ok(below.pixelBudget <= above.pixelBudget && below.msaaSamples <= above.msaaSamples && below.reflectionScale <= above.reflectionScale && below.shadowMapSize <= above.shadowMapSize);
    assert.ok(below.pixelBudget < above.pixelBudget || below.reflectionScale < above.reflectionScale || Number(below.ambientOcclusion) < Number(above.ambientOcclusion), `${below.name} lowers nothing`);
  }
});

test('the pixel budget caps the ratio on a large window and never passes the display', () => {
  const low = tierAt(3);
  const large = budgetedPixelRatio(low, 2, 2000, 1060);
  assert.ok(large < 2 && large * large * 2000 * 1060 <= low.pixelBudget);
  assert.equal(budgetedPixelRatio(low, 1, 800, 600), 1);
});

test('the top three tiers draw a full-screen Retina window at its native size', () => {
  for (const level of [0, 1, 2]) assert.equal(budgetedPixelRatio(tierAt(level), 2, 2000, 1060), 2, tierAt(level).name);
  assert.equal(budgetedPixelRatio(tierAt(0), 2, 1728, 1117), 2);
});

test('the two fallback tiers are much cheaper than native, in pixels and in samples', () => {
  const native = 2000 * 1060 * 4;
  for (const level of [3, 4]) {
    const tier = tierAt(level);
    const ratio = budgetedPixelRatio(tier, 2, 2000, 1060);
    assert.ok(2000 * 1060 * ratio * ratio <= native * 0.35, `${tier.name} draws ${Math.round(2000 * 1060 * ratio * ratio)} pixels`);
    assert.ok(tier.msaaSamples <= 2);
  }
});

test('when a lower tier really is faster, slow frames step the quality down until it holds 60', () => {
  const governor = createQualityGovernor(0);
  run(governor, (level) => gpuBound(level), GOVERNOR.warmupMs / 1000 + 30);
  assert.equal(governor.level, 3);
  assert.ok(governor.fps > 55);
});

test('when dropping a tier does not make frames faster, the governor goes back up and stops dropping', () => {
  const governor = createQualityGovernor(0);
  run(governor, 30, GOVERNOR.warmupMs / 1000 + 40);
  assert.equal(governor.level, 0);
  assert.ok(governor.dropLockedWindows > 0);
  assert.equal(governor.noGainLock, GOVERNOR.firstNoGainLockWindows * 2);
});

test('a few long hitches in otherwise fast frames do not count as slow', () => {
  const governor = createQualityGovernor(0);
  const changes = run(governor, (_level, frame) => (frame % 4 === 0 ? 120 : 8.3), GOVERNOR.warmupMs / 1000 + 30);
  assert.equal(changes, 0);
  assert.equal(governor.level, 0);
  assert.ok(governor.fps < 80, `mean fps ${governor.fps}`);
});

test('frames well above the target raise the quality within a few seconds', () => {
  const governor = createQualityGovernor(3);
  run(governor, 10, GOVERNOR.warmupMs / 1000 + GOVERNOR.headroomWindowsToRaise + 1.5);
  assert.equal(governor.level, 2);
});

test('a manual level turns the governor off', () => {
  const governor = createQualityGovernor(1);
  setManualLevel(governor, 0);
  assert.equal(run(governor, 40, 20), 0);
  assert.equal(governor.level, 0);
  setManualLevel(governor, null);
  assert.ok(run(governor, (level) => gpuBound(level) + 10, 10) > 0);
});
