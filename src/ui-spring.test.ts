import assert from 'node:assert/strict';
import { test } from 'node:test';
import { springEasing, springSeconds, springValue, stepSpring, UI_SPRINGS } from './ui-spring.ts';

test('every spring starts at rest, overshoots only when bouncy, and settles on its target', () => {
  for (const spec of Object.values(UI_SPRINGS)) {
    assert.equal(springValue(spec, 0), 0);
    assert.ok(Math.abs(springValue(spec, springSeconds(spec)) - 1) < 0.002);
  }
  let peak = 0;
  for (let t = 0; t < 1; t += 0.005) peak = Math.max(peak, springValue(UI_SPRINGS.bouncy, t));
  assert.ok(peak > 1.04 && peak < 1.2, `bouncy peak ${peak}`);
});

test('the css easing is a linear() curve from 0 to 1', () => {
  const easing = springEasing(UI_SPRINGS.snappy);
  assert.match(easing, /^linear\(0\.0000, .*, 1\)$/);
});

test('the stepped spring matches the closed form', () => {
  const state = { x: 0, v: 0 };
  for (let i = 0; i < 30; i++) stepSpring(state, 1, UI_SPRINGS.bouncy, 1 / 120);
  assert.ok(Math.abs(state.x - springValue(UI_SPRINGS.bouncy, 0.25)) < 0.03);
});
