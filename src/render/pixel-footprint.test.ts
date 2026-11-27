import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHASE } from '../camera/chase-camera.ts';
import { TRACK_LOOK } from '../world/track-mesh.ts';
import { CHASE_VIEW, metresPerPixel, NATIVE_HEIGHT_PIXELS, pixelsAcross, smallestCleanFeatureMetres } from './pixel-footprint.ts';

test('a pixel covers more ground with distance and field of view, and less with resolution', () => {
  assert.ok(Math.abs(metresPerPixel(10, 90, 2000) - 0.01) < 1e-9);
  assert.ok(metresPerPixel(20, 60, 2000) > metresPerPixel(10, 60, 2000));
  assert.ok(metresPerPixel(10, 60, 1000) > metresPerPixel(10, 60, 2000));
  assert.ok(Math.abs(pixelsAcross(0.02, 10, 90, 2000) - 2) < 1e-9);
});

test('the chase view the footprint assumes covers what the camera really does', () => {
  assert.ok(CHASE_VIEW.farMetres >= CHASE.distance + 70 * CHASE.distancePerSpeed + CHASE.boostDistance);
  assert.ok(CHASE_VIEW.widestFovDegrees >= CHASE.fov + CHASE.fovAtSpeed + CHASE.boostFov);
  assert.ok(smallestCleanFeatureMetres() < 0.012, `one pixel on the car is ${(smallestCleanFeatureMetres() * 1000).toFixed(1)} mm`);
});

test('road paint and the neon strips stay at least a pixel wide well down the road', () => {
  const at = (metres: number): number => metresPerPixel(metres, CHASE.fov, NATIVE_HEIGHT_PIXELS);
  assert.ok(TRACK_LOOK.neonHigh - TRACK_LOOK.neonLow >= at(300));
  assert.ok(TRACK_LOOK.lineWidth >= at(200));
});
