import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFreeLook, FREE_LOOK, freeLookYaw, resetFreeLook, stepFreeLook, turnFreeLook } from './free-look.ts';

const STEP = 1 / 60;

test('moving the mouse turns the view and stays inside its limits', () => {
  const look = createFreeLook();
  turnFreeLook(look, -100, 40);
  assert.ok(look.yaw > 0.4 && look.pitch > 0.15);
  turnFreeLook(look, -100000, 100000);
  assert.equal(look.yaw, FREE_LOOK.maxYaw);
  assert.equal(look.pitch, FREE_LOOK.maxPitch);
  turnFreeLook(look, 0, -100000);
  assert.equal(look.pitch, FREE_LOOK.minPitch);
});

test('the view holds for a moment, then swings back behind a moving car without a jump', () => {
  const look = createFreeLook();
  turnFreeLook(look, -200, 0);
  const turned = look.yaw;
  for (let t = 0; t < FREE_LOOK.holdSeconds - 0.1; t += STEP) stepFreeLook(look, false, 30, STEP);
  assert.equal(look.yaw, turned);
  let largestStep = 0;
  for (let i = 0; i < 240; i++) {
    const before = look.yaw;
    stepFreeLook(look, false, 30, STEP);
    largestStep = Math.max(largestStep, Math.abs(look.yaw - before));
  }
  assert.ok(Math.abs(look.yaw) < 0.01, `still turned ${look.yaw}`);
  assert.ok(largestStep < turned * 0.1, `jumped ${largestStep}`);
});

test('a parked car keeps the view where the mouse left it', () => {
  const look = createFreeLook();
  turnFreeLook(look, -200, 0);
  const turned = look.yaw;
  for (let i = 0; i < 600; i++) stepFreeLook(look, false, 0, STEP);
  assert.equal(look.yaw, turned);
});

test('holding look-back swings the view to face behind and releasing brings it home', () => {
  const look = createFreeLook();
  turnFreeLook(look, -150, 0);
  for (let i = 0; i < 30; i++) stepFreeLook(look, true, 30, STEP);
  assert.ok(Math.abs(freeLookYaw(look) - Math.PI) < 0.02);
  for (let i = 0; i < 300; i++) stepFreeLook(look, false, 30, STEP);
  assert.ok(Math.abs(freeLookYaw(look)) < 0.02);
});

test('a reset centres the view', () => {
  const look = createFreeLook();
  turnFreeLook(look, 50, 50);
  stepFreeLook(look, true, 0, STEP);
  resetFreeLook(look);
  assert.deepEqual(look, createFreeLook());
});
