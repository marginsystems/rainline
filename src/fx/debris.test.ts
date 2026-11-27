import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { Debris, DEBRIS } from './debris.ts';

const PAINT = [new THREE.Color(0x202028)];

test('pieces fly, land on the ground and stay there', () => {
  const debris = new Debris();
  debris.spawn(0, 0.5, 0, 1, 0, 8, 10, PAINT);
  assert.equal(debris.count, 10);
  for (let i = 0; i < 600; i++) debris.update(1 / 120);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
  for (let i = 0; i < debris.count; i++) {
    debris.object.getMatrixAt(i, matrix);
    position.setFromMatrixPosition(matrix);
    assert.ok(position.y > 0 && position.y < 0.2, `piece ${i} rests at ${position.y}`);
    assert.ok(Math.hypot(position.x, position.z) > 0.05);
  }
});

test('a hit never adds more than the cap, and the pool reuses its oldest slots', () => {
  const debris = new Debris();
  debris.spawn(0, 0.5, 0, 0, 1, 6, 100, PAINT);
  assert.equal(debris.count, DEBRIS.maxPerHit);
  for (let i = 0; i < 30; i++) debris.spawn(0, 0.5, 0, 0, 1, 6, DEBRIS.maxPerHit, PAINT);
  assert.equal(debris.count, DEBRIS.capacity);
});

test('clearing shrinks the pieces away over a moment instead of at once', () => {
  const debris = new Debris();
  debris.spawn(0, 0.5, 0, 0, 1, 6, 5, PAINT);
  debris.clear();
  debris.update(DEBRIS.clearSeconds * 0.5);
  assert.equal(debris.count, 5);
  debris.update(DEBRIS.clearSeconds);
  assert.equal(debris.count, 0);
});
