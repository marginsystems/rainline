import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { CarDamage, DAMAGE } from './car-damage.ts';

function body(): { group: THREE.Group; positions: THREE.BufferAttribute; rest: Float32Array } {
  const geometry = new THREE.BoxGeometry(DAMAGE.halfWidth * 2, 1, DAMAGE.halfLength * 2, 8, 4, 16);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  const positions = geometry.getAttribute('position');
  if (!(positions instanceof THREE.BufferAttribute)) throw new Error('box has no positions');
  return { group, positions, rest: Float32Array.from(positions.array) };
}

const furthest = (positions: THREE.BufferAttribute, rest: Float32Array): number => {
  let far = 0;
  for (let i = 0; i < rest.length; i++) far = Math.max(far, Math.abs((positions.array[i] ?? 0) - (rest[i] ?? 0)));
  return far;
};

test('the contact point sits on the edge of the car in the hit direction', () => {
  assert.deepEqual(CarDamage.contact(1, 0), { x: DAMAGE.halfWidth, z: 0 });
  const nose = CarDamage.contact(0, 1);
  assert.ok(Math.abs(nose.z - DAMAGE.halfLength) < 1e-9 && Math.abs(nose.x) < 1e-3);
});

test('a hit dents the panels near the contact and leaves the far side alone', () => {
  const { group, positions, rest } = body();
  const damage = new CarDamage(group);
  damage.hit(1, 0, 12);
  let near = 0, far = 0;
  for (let i = 0; i < positions.count; i++) {
    const moved = Math.abs((positions.array[i * 3] ?? 0) - (rest[i * 3] ?? 0));
    if ((rest[i * 3] ?? 0) > 0.5) near = Math.max(near, moved);
    if ((rest[i * 3] ?? 0) < -0.5) far = Math.max(far, moved);
  }
  assert.ok(near > 0.03, `near side moved ${near}`);
  assert.equal(far, 0);
});

test('repeated hits never dent deeper than the limit, and a repair springs the body back', () => {
  const { group, positions, rest } = body();
  const damage = new CarDamage(group);
  for (let i = 0; i < 20; i++) damage.hit(0, 1, 30);
  assert.ok(furthest(positions, rest) <= DAMAGE.maxDent + 1e-6);
  damage.repair();
  damage.update(1 / 60);
  assert.ok(furthest(positions, rest) > 0);
  for (let i = 0; i < 120; i++) damage.update(1 / 60);
  assert.equal(furthest(positions, rest), 0);
});
