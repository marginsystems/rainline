import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTrack, DUSK_CIRCUIT, locate } from '../../sim/track.ts';
import { metresPerPixel, NATIVE_HEIGHT_PIXELS } from '../render/pixel-footprint.ts';
import { planSkyline, SKYLINE } from './skyline.ts';

const track = buildTrack(DUSK_CIRCUIT);
const plan = planSkyline(track);

test('the skyline rings the circuit without a tower standing on it', () => {
  assert.ok(plan.boxes.length > SKYLINE.towers);
  for (const box of plan.boxes) assert.ok(Math.abs(locate(track, box.x, box.z, null).lateral) >= SKYLINE.trackClearance);
});

test('towers step back as they rise, and each stack sits on the tier below', () => {
  const stacked = plan.boxes.filter((box) => box.base > 0);
  assert.ok(stacked.length > SKYLINE.towers * 0.5, `${stacked.length} setback tiers`);
  for (const upper of stacked) {
    const below = plan.boxes.find((box) => box.x === upper.x && box.z === upper.z && Math.abs(box.base + box.height - upper.base) < 1e-6);
    assert.ok(below && below.width > upper.width && below.depth > upper.depth);
  }
});

test('spires, beacons and crown bands stay at least a pixel wide from the far side of the circuit', () => {
  const farthest = SKYLINE.outerRadius + 320;
  const pixel = metresPerPixel(farthest, 60, NATIVE_HEIGHT_PIXELS);
  assert.ok(SKYLINE.spireMetres >= pixel && SKYLINE.beaconMetres >= pixel, `one pixel is ${pixel.toFixed(2)} m`);
  assert.ok(SKYLINE.crownMetres >= pixel);
  for (const box of plan.boxes.filter((b) => b.crown.some((c) => c > 0))) assert.ok(box.height > SKYLINE.crownMetres * 2, `a ${box.height.toFixed(1)} m tier is all crown`);
});

test('billboards hang on near towers and face the circuit', () => {
  assert.equal(plan.billboards.length, SKYLINE.billboards);
  for (const billboard of plan.billboards) {
    const toCentre = Math.atan2(SKYLINE.centre[0] - billboard.x, SKYLINE.centre[1] - billboard.z);
    assert.ok(Math.abs(Math.atan2(Math.sin(toCentre - billboard.yaw), Math.cos(toCentre - billboard.yaw))) < 0.2);
  }
});
