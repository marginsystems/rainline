import assert from 'node:assert/strict';
import { test } from 'node:test';
import { touchLayout } from './touch-controls.ts';

test('touch buttons drive the car through the keyboard codes', () => {
  const codes = touchLayout(false).map((button) => button.code);
  for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'Escape', 'KeyR']) assert.ok(codes.includes(code), code);
  assert.equal(new Set(codes).size, codes.length);
});

test('kicks only appear in Beaver Run and fire once per press', () => {
  assert.ok(!touchLayout(false).some((button) => button.cluster === 'kick'));
  const kicks = touchLayout(true).filter((button) => button.cluster === 'kick');
  assert.deepEqual(kicks.map((button) => button.code), ['KeyZ', 'KeyC']);
  assert.ok(kicks.every((button) => button.action === 'tap'));
});

test('steering, throttle and brake are held, menu actions are tapped', () => {
  for (const button of touchLayout(true)) {
    const held = button.cluster === 'steer' || button.cluster === 'drive';
    assert.equal(button.action, held ? 'hold' : 'tap', button.label);
  }
});
