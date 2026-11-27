import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BROADLEAF_KINDS, PINES, treeKinds } from './trees.ts';

const sizeOf = (geometry: { computeBoundingBox(): void; boundingBox: { min: { x: number; y: number }; max: { x: number; y: number } } | null }): { height: number; width: number; floor: number } => {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) throw new Error('tree has no bounds');
  return { height: box.max.y - box.min.y, width: box.max.x - box.min.x, floor: box.min.y };
};

test('the forest has several distinct tree shapes with their own silhouettes', () => {
  const kinds = treeKinds(19);
  assert.equal(kinds.length, PINES.length + BROADLEAF_KINDS);
  const sizes = kinds.map((kind) => {
    const size = sizeOf(kind.foliage);
    return `${size.height.toFixed(1)}x${size.width.toFixed(1)}`;
  });
  assert.equal(new Set(sizes).size, kinds.length, sizes.join(' '));
});

test('every tree has a trunk on the ground and textured, shaded foliage light enough to instance by the hundred', () => {
  for (const kind of treeKinds(19)) {
    assert.ok(sizeOf(kind.trunk).floor <= 0.01);
    for (const geometry of [kind.trunk, kind.foliage]) {
      const count = geometry.getAttribute('position').count;
      assert.equal(geometry.getAttribute('color').count, count);
      assert.equal(geometry.getAttribute('uv').count, count);
      assert.equal(geometry.getAttribute('normal').count, count);
    }
    const triangles = ((kind.trunk.index?.count ?? 0) + (kind.foliage.index?.count ?? 0)) / 3;
    assert.ok(triangles < 900, `${triangles} triangles`);
  }
});

test('foliage sits above the bare trunk and its shading normals point outward or up, never into the ground', () => {
  for (const kind of treeKinds(19)) {
    const normal = kind.foliage.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) assert.ok(normal.getY(i) > 0, `normal ${i} points down`);
    assert.ok(sizeOf(kind.foliage).floor > -1.5);
  }
});

test('the same seed grows the same forest', () => {
  const a = treeKinds(5)[0]?.foliage.getAttribute('position').array, b = treeKinds(5)[0]?.foliage.getAttribute('position').array;
  assert.deepEqual(a, b);
});
