import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAPTURE, captureInput, captureModeOf } from './capture-mode.ts';

test('capture mode is off unless the page asks for it', () => {
  assert.equal(captureModeOf(''), null);
  assert.equal(captureModeOf('?capture=other'), null);
  assert.equal(captureModeOf('?capture=drive'), 'drive');
  assert.equal(captureModeOf('?capture=wreck'), 'wreck');
});

test('the scripted drive launches straight, then alternates handbrake slides', () => {
  assert.deepEqual(captureInput(1), { throttle: 1, brake: 0, steer: 0, handbrake: false, boost: false });
  const first = captureInput(CAPTURE.launchSeconds + 0.1);
  assert.ok(first.handbrake && first.steer === 1);
  const cycle = CAPTURE.flickSeconds + CAPTURE.slideSeconds + CAPTURE.restSeconds;
  const second = captureInput(CAPTURE.launchSeconds + cycle + 0.1);
  assert.ok(second.handbrake && second.steer === -1);
});
