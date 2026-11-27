import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CHASE_VIEW, NATIVE_HEIGHT_PIXELS, pixelsAcross, smallestCleanFeatureMetres } from '../render/pixel-footprint.ts';
import { CAR_FEATURES_PATH, parseCarFeatures } from './car-features.ts';

const features = parseCarFeatures(readFileSync(CAR_FEATURES_PATH, 'utf8'));

test('a manifest that is not a list of named widths is refused', () => {
  assert.throws(() => parseCarFeatures('{}'));
  assert.throws(() => parseCarFeatures('[{"name":"spoke"}]'));
  assert.throws(() => parseCarFeatures('[{"name":"spoke","minWidthMetres":"wide"}]'));
  assert.deepEqual(parseCarFeatures('[{"name":"spoke","minWidthMetres":0.05}]'), [{ name: 'spoke', minWidthMetres: 0.05 }]);
});

test('the car build lists its thin features, each once, with a real width', () => {
  assert.ok(features.length >= 12, `${features.length} features listed`);
  assert.equal(new Set(features.map((feature) => feature.name)).size, features.length);
  for (const feature of features) assert.ok(Number.isFinite(feature.minWidthMetres) && feature.minWidthMetres > 0, feature.name);
});

test('nothing on the car is thinner than a pixel at the far end of the chase view', () => {
  const pixel = smallestCleanFeatureMetres();
  for (const feature of features) {
    const pixels = pixelsAcross(feature.minWidthMetres, CHASE_VIEW.farMetres, CHASE_VIEW.widestFovDegrees, NATIVE_HEIGHT_PIXELS);
    assert.ok(pixels >= 1, `${feature.name} is ${(feature.minWidthMetres * 1000).toFixed(1)} mm, ${pixels.toFixed(2)} px; one pixel is ${(pixel * 1000).toFixed(1)} mm`);
  }
});

test('wheel spokes and accent lines are at least two pixels wide at the usual chase distance', () => {
  const bold = features.filter((feature) => feature.name.startsWith('wheelSpoke') && !feature.name.includes('Gap') || feature.name.startsWith('accent'));
  assert.ok(bold.length >= 4);
  for (const feature of bold) assert.ok(pixelsAcross(feature.minWidthMetres, 7, 70, NATIVE_HEIGHT_PIXELS) >= 2, feature.name);
});
